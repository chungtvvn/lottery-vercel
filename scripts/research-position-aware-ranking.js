#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const PRIZE_KEYS = [
    'special', 'prize1', 'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];
const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(token => {
        const [key, ...rest] = token.replace(/^--/, '').split('=');
        return [key, rest.join('=') || '1'];
    }));
    return {
        rawFile: path.resolve(args.get('rawFile') || 'lib/data/xsmb-2-digits.json'),
        positionFiles: String(args.get('positionFiles') || '').split(',').filter(Boolean).map(file => path.resolve(file)),
        splitDate: args.get('splitDate') || null,
        output: args.get('output') ? path.resolve(args.get('output')) : null
    };
}

function isoDate(value) {
    const text = String(value || '');
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    return dmy ? `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}` : '';
}

function normalizeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? ((Math.trunc(number) % 100) + 100) % 100 : null;
}

function loadPositionRows(files) {
    if (!files.length) throw new Error('Cần --positionFiles=<cache1,cache2,...>.');
    const byDate = new Map();
    let expected = null;
    for (const file of files) {
        const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (payload.strictPointInTime !== true) throw new Error(`Cache không strict PIT: ${file}`);
        const signature = JSON.stringify({
            startDate: payload.startDate,
            endDate: payload.endDate,
            methodConfigs: payload.methodConfigs,
            historyYears: payload.historyYears,
            fixedBaselineYear: payload.fixedBaselineYear,
            rawDataLength: payload.rawDataLength,
            rawDataLatestDate: payload.rawDataLatestDate
        });
        if (expected && expected !== signature) throw new Error(`Cache khác cấu hình: ${file}`);
        expected = signature;
        for (const [date, positions] of Object.entries(payload.rows || {})) {
            if (!byDate.has(date)) byDate.set(date, {});
            Object.assign(byDate.get(date), positions || {});
        }
    }
    for (const [date, positions] of byDate.entries()) {
        const missing = PRIZE_KEYS.filter(key => !positions[key]);
        if (missing.length) throw new Error(`${date} thiếu vị trí: ${missing.join(', ')}`);
    }
    return { byDate, metadata: JSON.parse(expected) };
}

function loadActual(rawFile) {
    const raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
    return new Map(raw.map(row => [isoDate(row.date), row]));
}

function methodInventory(positions) {
    const first = positions[PRIZE_KEYS[0]] || {};
    const parsed = Object.keys(first).map(id => {
        const match = id.match(/^(.*)Hold(\d+)$/);
        return match ? { id, strategy: match[1], hold: Number(match[2]) } : null;
    }).filter(Boolean);
    const strategies = [...new Set(parsed.map(row => row.strategy))];
    const holds = [...new Set(parsed.map(row => row.hold))].sort((a, b) => a - b);
    return { parsed, strategies, holds };
}

function createCalibration() {
    return {
        positions: Object.fromEntries(PRIZE_KEYS.map(key => [key, {
            trials: 0,
            deHits: 0,
            ownHits: 0,
            experts: {}
        }])),
        numberHistory: {
            days: 0,
            deCounts: new Float64Array(100),
            lotoCounts: new Float64Array(100),
            deEma: new Float64Array(100).fill(0.01),
            lotoEma: new Float64Array(100).fill(0.27)
        }
    };
}

function posteriorRate(hits, trials, priorMean = 0.3, priorWeight = 100) {
    return (hits + priorMean * priorWeight) / (trials + priorWeight);
}

function reliability(row, field, priorMean = 0.3) {
    return Math.max(0.65, Math.min(1.35, posteriorRate(row[field], row.trials, priorMean, 100) / priorMean));
}

function expertReliability(row, strategy, field, priorMean = 0.3) {
    const expert = row.experts?.[strategy];
    if (!expert) return 1;
    return Math.max(
        0.65,
        Math.min(1.35, posteriorRate(expert[field], expert.trials, priorMean, 100) / priorMean)
    );
}

function thresholdScore(methods, strategy, holds, number) {
    let score = 0;
    let weight = 0;
    for (const hold of holds) {
        const sourceWeight = Math.pow(hold / 100, 2);
        const values = methods[`${strategy}Hold${hold}`] || [];
        score += sourceWeight * Number(values.includes(number));
        weight += sourceWeight;
    }
    return weight ? score / weight : 0;
}

function rankDe(positions, inventory, calibration, config) {
    const rows = ALL_NUMBERS.map(number => {
        let specialScore = 0;
        let specialWeight = 0;
        let crossScore = 0;
        let crossWeight = 0;
        for (const strategy of config.strategies) {
            const weight = config.adaptiveStrategyWeight
                ? expertReliability(calibration.positions.special, strategy, 'deHits')
                : 1;
            specialScore += weight * thresholdScore(positions.special, strategy, inventory.holds, number);
            specialWeight += weight;
        }
        specialScore /= Math.max(1, specialWeight);
        for (const positionKey of PRIZE_KEYS) {
            const weight = reliability(calibration.positions[positionKey], 'deHits');
            let score = 0;
            let strategyWeight = 0;
            for (const strategy of config.strategies) {
                const expertWeight = config.adaptiveStrategyWeight
                    ? expertReliability(calibration.positions[positionKey], strategy, 'deHits')
                    : 1;
                score += expertWeight * thresholdScore(positions[positionKey], strategy, inventory.holds, number);
                strategyWeight += expertWeight;
            }
            crossScore += weight * score / Math.max(1, strategyWeight);
            crossWeight += weight;
        }
        crossScore /= Math.max(1, crossWeight);
        const history = calibration.numberHistory;
        const posterior = (history.deCounts[number] + 1) / (history.days + 100);
        const historicalScore = 0.7 * Math.min(2, posterior / 0.01) / 2 +
            0.3 * Math.min(2, history.deEma[number] / 0.01) / 2;
        return {
            number,
            score: (
                specialScore * (1 - config.crossWeight) + crossScore * config.crossWeight
            ) * (1 - config.historyWeight) + historicalScore * config.historyWeight,
            specialScore,
            crossScore,
            historicalScore
        };
    });
    return rows.sort((a, b) => b.score - a.score || b.specialScore - a.specialScore || a.number - b.number);
}

function rankLoto(positions, inventory, calibration, config) {
    return ALL_NUMBERS.map(number => {
        let score = 0;
        let totalWeight = 0;
        for (const positionKey of PRIZE_KEYS) {
            const weight = config.onlinePositionWeight
                ? reliability(calibration.positions[positionKey], 'ownHits')
                : 1;
            let positionScore = 0;
            let strategyWeight = 0;
            for (const strategy of config.strategies) {
                const expertWeight = config.adaptiveStrategyWeight
                    ? expertReliability(calibration.positions[positionKey], strategy, 'ownHits')
                    : 1;
                positionScore += expertWeight * thresholdScore(positions[positionKey], strategy, inventory.holds, number);
                strategyWeight += expertWeight;
            }
            positionScore /= Math.max(1, strategyWeight);
            score += weight * positionScore;
            totalWeight += weight;
        }
        const chainScore = score / Math.max(1, totalWeight);
        const history = calibration.numberHistory;
        const posterior = (history.lotoCounts[number] + 27) / (history.days + 100);
        const historicalScore = 0.7 * Math.min(2, posterior / 0.27) / 2 +
            0.3 * Math.min(2, history.lotoEma[number] / 0.27) / 2;
        return {
            number,
            score: chainScore * (1 - config.historyWeight) + historicalScore * config.historyWeight,
            chainScore,
            historicalScore
        };
    }).sort((a, b) => b.score - a.score || a.number - b.number);
}

function actualCounts(row) {
    const counts = new Map();
    for (const key of PRIZE_KEYS) {
        const number = normalizeNumber(row?.[key]);
        if (number === null) continue;
        counts.set(number, (counts.get(number) || 0) + 1);
    }
    return counts;
}

function updateCalibration(calibration, positions, actualSpecial, actualByPosition, strategies, hold = 70) {
    for (const positionKey of PRIZE_KEYS) {
        const row = calibration.positions[positionKey];
        row.trials++;
        for (const strategy of strategies) {
            const values = positions[positionKey]?.[`${strategy}Hold${hold}`] || [];
            const deHit = Number(values.includes(actualSpecial));
            const ownHit = Number(values.includes(actualByPosition[positionKey]));
            if (!row.experts[strategy]) row.experts[strategy] = { trials: 0, deHits: 0, ownHits: 0 };
            row.experts[strategy].trials++;
            row.experts[strategy].deHits += deHit;
            row.experts[strategy].ownHits += ownHit;
        }
        const primary = strategies[0];
        const primaryValues = positions[positionKey]?.[`${primary}Hold${hold}`] || [];
        row.deHits += Number(primaryValues.includes(actualSpecial));
        row.ownHits += Number(primaryValues.includes(actualByPosition[positionKey]));
    }
    const history = calibration.numberHistory;
    history.days++;
    const alpha = 2 / (90 + 1);
    for (const number of ALL_NUMBERS) {
        const deHit = Number(number === actualSpecial);
        const lotoHits = Object.values(actualByPosition).filter(value => value === number).length;
        history.deCounts[number] += deHit;
        history.lotoCounts[number] += lotoHits;
        history.deEma[number] = (1 - alpha) * history.deEma[number] + alpha * deHit;
        history.lotoEma[number] = (1 - alpha) * history.lotoEma[number] + alpha * lotoHits;
    }
}

function settleDe(date, ranked, actual) {
    const numbers = ranked.slice(0, 30).map(row => row.number);
    const win = numbers.includes(actual);
    return { date, numbers, actual, win, hits: Number(win), stakeK: 30000, payoutK: win ? 84000 : 0, profitK: (win ? 84000 : 0) - 30000 };
}

function settleLoto(date, ranked, counts, top) {
    const numbers = ranked.slice(0, top).map(row => row.number);
    const hits = numbers.reduce((sum, number) => sum + (counts.get(number) || 0), 0);
    const stakeK = numbers.length * 2200;
    const payoutK = hits * 8000;
    return { date, numbers, hits, win: payoutK > stakeK, hitDay: hits > 0, atLeast2: hits >= 2, stakeK, payoutK, profitK: payoutK - stakeK };
}

function longest(rows, predicate) {
    let current = 0;
    let maximum = 0;
    for (const row of rows) {
        current = predicate(row) ? current + 1 : 0;
        maximum = Math.max(maximum, current);
    }
    return maximum;
}

function summarize(rows, type) {
    const days = rows.length;
    const wins = rows.filter(row => row.win).length;
    const hitDays = rows.filter(row => type === 'de' ? row.win : row.hitDay).length;
    const atLeast2Days = rows.filter(row => row.atLeast2).length;
    const totalHits = rows.reduce((sum, row) => sum + Number(row.hits || 0), 0);
    const stakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = rows.reduce((sum, row) => sum + row.payoutK, 0);
    return {
        days,
        wins,
        hitDays,
        atLeast2Days,
        hitRate: days ? hitDays / days : 0,
        winRate: days ? wins / days : 0,
        atLeast2Rate: days ? atLeast2Days / days : 0,
        avgHits: days ? totalHits / days : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestLoss: longest(rows, row => !row.win),
        longestNoHit: longest(rows, row => type === 'de' ? !row.win : !row.hitDay),
        longestUnder2: type === 'loto' ? longest(rows, row => !row.atLeast2) : null
    };
}

function blockBootstrap(rows, type, iterations = 2000, blockSize = 7, seed = 20260714) {
    if (!rows.length) return null;
    let state = seed >>> 0;
    const random = () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
    const samples = [];
    for (let iteration = 0; iteration < iterations; iteration++) {
        const sampled = [];
        while (sampled.length < rows.length) {
            const start = Math.floor(random() * rows.length);
            for (let offset = 0; offset < blockSize && sampled.length < rows.length; offset++) {
                sampled.push(rows[(start + offset) % rows.length]);
            }
        }
        const summary = summarize(sampled, type);
        samples.push({ hitRate: summary.hitRate, atLeast2Rate: summary.atLeast2Rate, profitK: summary.profitK, roi: summary.roi });
    }
    const interval = key => {
        const values = samples.map(row => row[key]).sort((a, b) => a - b);
        return [values[Math.floor(values.length * 0.025)], values[Math.floor(values.length * 0.975)]];
    };
    return {
        method: `${iterations} deterministic moving-block bootstrap samples, block=${blockSize} days`,
        hitRate95: interval('hitRate'),
        atLeast2Rate95: type === 'loto' ? interval('atLeast2Rate') : null,
        profitK95: interval('profitK'),
        roi95: interval('roi')
    };
}

function strategySets(strategies) {
    const preferred = [
        ['chainSmallFirst'],
        ['chainBlockFirst'],
        ['chainCredibleFirst'],
        ['numberPosteriorDiversity'],
        ['numberLikelihoodRatio'],
        ['dedupEdge75Hold'],
        ['dedupDropoffHold'],
        ['chainSmallFirst', 'chainBlockFirst'],
        ['numberPosteriorDiversity', 'numberLikelihoodRatio'],
        ['chainSmallFirst', 'chainBlockFirst', 'numberPosteriorDiversity', 'numberLikelihoodRatio']
    ];
    return preferred.filter(set => set.every(strategy => strategies.includes(strategy)));
}

function run(options) {
    const { byDate, metadata } = loadPositionRows(options.positionFiles);
    const actualByDate = loadActual(options.rawFile);
    const dates = [...byDate.keys()].sort();
    const inventory = methodInventory(byDate.get(dates[0]));
    const splitDate = options.splitDate || dates[Math.floor(dates.length / 2)];
    const configs = [];
    for (const strategies of strategySets(inventory.strategies)) {
        for (const crossWeight of [0, 0.1, 0.25, 0.5, 1]) {
            for (const historyWeight of [0, 0.1, 0.25]) {
                for (const adaptiveStrategyWeight of strategies.length > 1 ? [false, true] : [false]) {
                    configs.push({
                        id: `de:${strategies.join('+')}:cross${crossWeight}:history${historyWeight}:${adaptiveStrategyWeight ? 'adaptiveExperts' : 'uniformExperts'}`,
                        type: 'de', strategies, crossWeight, historyWeight, adaptiveStrategyWeight
                    });
                }
            }
        }
        for (const onlinePositionWeight of [false, true]) {
            for (const top of [6, 7, 10, 14, 20]) {
                for (const historyWeight of [0, 0.1, 0.25]) {
                    for (const adaptiveStrategyWeight of strategies.length > 1 ? [false, true] : [false]) {
                        configs.push({
                            id: `loto:${strategies.join('+')}:${onlinePositionWeight ? 'online' : 'uniform'}:history${historyWeight}:top${top}:${adaptiveStrategyWeight ? 'adaptiveExperts' : 'uniformExperts'}`,
                            type: 'loto', strategies, onlinePositionWeight, historyWeight, top, adaptiveStrategyWeight
                        });
                    }
                }
            }
        }
    }

    const results = [];
    for (const config of configs) {
        const calibration = createCalibration();
        const rows = [];
        for (const date of dates) {
            const positions = byDate.get(date);
            const actualRow = actualByDate.get(date);
            if (!actualRow) continue;
            const actualSpecial = normalizeNumber(actualRow.special);
            const actualByPosition = Object.fromEntries(PRIZE_KEYS.map(key => [key, normalizeNumber(actualRow[key])]));
            if (config.type === 'de') {
                rows.push(settleDe(date, rankDe(positions, inventory, calibration, config), actualSpecial));
            } else {
                rows.push(settleLoto(date, rankLoto(positions, inventory, calibration, config), actualCounts(actualRow), config.top));
            }
            // Every expert is updated only after prediction and settlement, so
            // the target for this date can never affect its own ranking.
            updateCalibration(calibration, positions, actualSpecial, actualByPosition, inventory.strategies, 70);
        }
        results.push({
            config,
            calibration: summarize(rows.filter(row => row.date < splitDate), config.type),
            holdout: summarize(rows.filter(row => row.date >= splitDate), config.type),
            full: summarize(rows, config.type),
            rows
        });
    }

    const rank = (type, metric) => results.filter(row => row.config.type === type).sort((a, b) =>
        b.calibration[metric] - a.calibration[metric]
        || b.calibration.profitK - a.calibration.profitK
        || a.config.id.localeCompare(b.config.id)
    );
    const selected = {
        deByHitRate: rank('de', 'hitRate')[0],
        deByProfit: rank('de', 'profitK')[0],
        lotoByProfit: rank('loto', 'profitK')[0],
        lotoByHitRate: rank('loto', 'hitRate')[0],
        lotoByAtLeast2: rank('loto', 'atLeast2Rate')[0]
    };
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            pointInTime: 'Mỗi cache vị trí được sinh exact-prefix đến D-1. Trọng số online chỉ cập nhật sau khi D đã kết toán.',
            selection: `Chọn cấu hình ở ngày trước ${splitDate}; phần từ ${splitDate} chỉ dùng để kiểm chứng.`,
            warning: 'Cửa sổ kiểm chứng ngắn chỉ là feasibility study, chưa đủ để đổi production.'
        },
        source: { rawFile: options.rawFile, positionFiles: options.positionFiles, metadata },
        period: { startDate: dates[0], endDate: dates.at(-1), splitDate, days: dates.length },
        inventory,
        selected: Object.fromEntries(Object.entries(selected).map(([key, row], index) => [key, {
            config: row.config,
            calibration: row.calibration,
            holdout: row.holdout,
            full: row.full,
            holdoutUncertainty: blockBootstrap(
                row.rows.filter(item => item.date >= splitDate),
                row.config.type,
                2000,
                7,
                20260714 + index
            )
        }])),
        rankings: {
            de: rank('de', 'hitRate').slice(0, 15).map(({ rows, ...row }) => row),
            lotoProfit: rank('loto', 'profitK').slice(0, 20).map(({ rows, ...row }) => row),
            lotoAtLeast2: rank('loto', 'atLeast2Rate').slice(0, 20).map(({ rows, ...row }) => row)
        }
    };
    const output = options.output || path.join(process.cwd(), 'reports', `research_position_aware_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    return { output, report };
}

if (require.main === module) {
    try {
        const { output, report } = run(parseArgs());
        console.log(JSON.stringify({ output, period: report.period, selected: report.selected }, null, 2));
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}

module.exports = { rankDe, rankLoto, run, summarize, thresholdScore };
