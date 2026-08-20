#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const METHODOLOGY = 'strict-prefix-point-in-time-v1';
const BET_COUNT = 30;
const STAKE_PER_NUMBER_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const BASE_RATE = 0.01;
const BREAK_EVEN_HIT_RATE = BET_COUNT / PAYOUT_MULTIPLIER;
const METHODS = [
    'chainSmallFirst',
    'chainBlockFirst',
    'chainCredibleFirst',
    'chainFreqFirst',
    'chainRiskFirst',
    'numberAvgRisk',
    'numberConsensusRisk',
    'numberPosteriorDiversity',
    'numberLikelihoodRatio',
    'numberWeightedRisk',
    'activeOnlyAvgRisk',
    'dedupEdge50Hold',
    'dedupEdge50CombinedB40S05'
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadRows(root) {
    const index = readJson(path.join(root, 'reports', 'strict_pit_all_methods_2016_2026.json'));
    const rows = [];
    const sources = [];
    for (const source of index.sourceReports || []) {
        const report = readJson(path.join(root, 'reports', source.file));
        if (report.methodologyVersion !== METHODOLOGY || report.options?.dateStep !== 1) {
            throw new Error(`${source.file} không đạt ${METHODOLOGY}/dateStep=1.`);
        }
        for (const row of report.rows || []) {
            for (const method of METHODS) {
                if (!Array.isArray(row.strategies?.[method]) || row.strategies[method].length !== BET_COUNT) {
                    throw new Error(`${source.file}/${row.date}/${method} không có đúng ${BET_COUNT} số.`);
                }
            }
            rows.push({ ...row, sourceYear: Number(source.year) });
        }
        sources.push({
            year: Number(source.year),
            file: source.file,
            rows: report.rows?.length || 0,
            baselineCutoffDate: report.baselineCutoffDate,
            fingerprint: report.fingerprint?.runSha256 || report.fingerprint?.sha256 || null
        });
    }
    rows.sort((left, right) => left.date.localeCompare(right.date));
    const seen = new Set();
    for (const row of rows) {
        if (seen.has(row.date)) throw new Error(`Trùng strict PIT date ${row.date}.`);
        seen.add(row.date);
    }
    return { rows, sources };
}

function methodSets(row) {
    if (!row.__methodSets) {
        Object.defineProperty(row, '__methodSets', {
            value: Object.fromEntries(METHODS.map(method => [method, new Set(row.strategies[method].map(Number))])),
            enumerable: false
        });
    }
    return row.__methodSets;
}

function stableTie(date, number, salt) {
    return crypto.createHash('sha256').update(`${salt}|${date}|${number}`).digest().readUInt32BE(0);
}

function longestStreak(rows, predicate) {
    let current = 0;
    let longest = 0;
    for (const row of rows) {
        current = predicate(row) ? current + 1 : 0;
        longest = Math.max(longest, current);
    }
    return longest;
}

function quantile(values, q) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

function settle(rows, predictor, includeDaily = false) {
    const daily = [];
    let wins = 0;
    for (const row of rows) {
        const prediction = predictor(row);
        if (!Array.isArray(prediction) || prediction.length !== BET_COUNT || new Set(prediction).size !== BET_COUNT) {
            throw new Error(`Dàn ${row.date} không có đúng ${BET_COUNT} số duy nhất.`);
        }
        const hit = prediction.includes(Number(row.actual));
        wins += Number(hit);
        daily.push({
            date: row.date,
            actual: Number(row.actual),
            hit,
            profitK: hit
                ? PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K - BET_COUNT * STAKE_PER_NUMBER_K
                : -BET_COUNT * STAKE_PER_NUMBER_K,
            ...(includeDaily ? { betNumbers: prediction } : {})
        });
    }
    const stakeK = rows.length * BET_COUNT * STAKE_PER_NUMBER_K;
    const payoutK = wins * PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K;
    const profitK = payoutK - stakeK;
    return {
        days: rows.length,
        wins,
        losses: rows.length - wins,
        hitRate: rows.length ? wins / rows.length : 0,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin: longestStreak(daily, row => row.hit),
        longestLoss: longestStreak(daily, row => !row.hit),
        daily
    };
}

function withoutDaily(summary) {
    const { daily, ...result } = summary;
    return result;
}

function groupSummary(rows, predictor, selector) {
    const groups = new Map();
    for (const row of rows) {
        const key = selector(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return Object.fromEntries([...groups].map(([key, values]) => [key, withoutDaily(settle(values, predictor))]));
}

function methodMetrics(rows) {
    const byMethod = {};
    for (const method of METHODS) {
        const yearly = new Map();
        let wins = 0;
        for (const row of rows) {
            const hit = methodSets(row)[method].has(Number(row.actual));
            wins += Number(hit);
            const year = row.date.slice(0, 4);
            if (!yearly.has(year)) yearly.set(year, { days: 0, wins: 0 });
            const bucket = yearly.get(year);
            bucket.days += 1;
            bucket.wins += Number(hit);
        }
        const yearlyRates = [...yearly.values()].map(value => value.wins / value.days);
        const posteriorRate = (wins + 30 * 0.3) / (rows.length + 30);
        byMethod[method] = {
            days: rows.length,
            wins,
            hitRate: wins / rows.length,
            posteriorRate,
            medianYearRate: quantile(yearlyRates, 0.5),
            lowerYearRate: quantile(yearlyRates, 0.2),
            robustScore: 0.55 * posteriorRate
                + 0.25 * quantile(yearlyRates, 0.5)
                + 0.20 * quantile(yearlyRates, 0.2)
        };
    }
    return byMethod;
}

function averageJaccard(rows, leftMethod, rightMethod) {
    let total = 0;
    for (const row of rows) {
        const left = methodSets(row)[leftMethod];
        const right = methodSets(row)[rightMethod];
        let intersection = 0;
        for (const number of left) intersection += Number(right.has(number));
        total += intersection / (left.size + right.size - intersection);
    }
    return total / rows.length;
}

function selectDiversePool(rows, metrics, size) {
    const selected = [];
    const remaining = new Set(METHODS);
    while (selected.length < size && remaining.size) {
        let best = null;
        for (const method of remaining) {
            const overlap = selected.length
                ? selected.reduce((sum, chosen) => sum + averageJaccard(rows, method, chosen), 0) / selected.length
                : 0;
            const score = metrics[method].robustScore - 0.045 * overlap;
            if (!best || score > best.score || (score === best.score && method.localeCompare(best.method) < 0)) {
                best = { method, score };
            }
        }
        selected.push(best.method);
        remaining.delete(best.method);
    }
    return selected;
}

function buildFitModel(rows, pool, signaturePrior = 300) {
    const methodIndex = Object.fromEntries(pool.map((method, index) => [method, index]));
    const signatures = new Map();
    const methodClassCounts = Object.fromEntries(pool.map(method => [method, {
        actualIn: 0,
        actualOut: 0,
        otherIn: 0,
        otherOut: 0
    }]));

    for (const row of rows) {
        const sets = methodSets(row);
        const actual = Number(row.actual);
        for (let number = 0; number < 100; number += 1) {
            let mask = 0;
            for (const method of pool) {
                const included = sets[method].has(number);
                if (included) mask |= (1 << methodIndex[method]);
                const counter = methodClassCounts[method];
                if (number === actual) {
                    counter[included ? 'actualIn' : 'actualOut'] += 1;
                } else {
                    counter[included ? 'otherIn' : 'otherOut'] += 1;
                }
            }
            if (!signatures.has(mask)) signatures.set(mask, { exposures: 0, hits: 0 });
            const signature = signatures.get(mask);
            signature.exposures += 1;
            signature.hits += Number(number === actual);
        }
    }

    const nb = {};
    for (const method of pool) {
        const count = methodClassCounts[method];
        nb[method] = {
            pInActual: (count.actualIn + 1) / (count.actualIn + count.actualOut + 2),
            pInOther: (count.otherIn + 1) / (count.otherIn + count.otherOut + 2)
        };
    }

    function features(row, number) {
        const sets = methodSets(row);
        let mask = 0;
        let votes = 0;
        for (const method of pool) {
            if (sets[method].has(number)) {
                mask |= (1 << methodIndex[method]);
                votes += 1;
            }
        }
        const signature = signatures.get(mask) || { exposures: 0, hits: 0 };
        const signatureProbability = (signature.hits + signaturePrior * BASE_RATE)
            / (signature.exposures + signaturePrior);
        let naiveBayesLogOdds = Math.log(BASE_RATE / (1 - BASE_RATE));
        for (const method of pool) {
            const included = sets[method].has(number);
            const pActual = included ? nb[method].pInActual : 1 - nb[method].pInActual;
            const pOther = included ? nb[method].pInOther : 1 - nb[method].pInOther;
            naiveBayesLogOdds += Math.log(Math.max(1e-12, pActual) / Math.max(1e-12, pOther));
        }
        return { signatureProbability, naiveBayesLogOdds, votes };
    }

    return { pool, signaturePrior, features };
}

function buildPredictor(config, fitModels, fitMetrics) {
    const model = fitModels.get(`${config.poolId}:${config.signaturePrior}`);
    const reliabilityWeights = Object.fromEntries(model.pool.map(method => {
        const advantage = fitMetrics[method].robustScore - 0.3;
        return [method, Math.max(0.25, Math.min(2.5, 1 + advantage / 0.025))];
    }));
    return row => {
        const scores = [];
        const sets = methodSets(row);
        for (let number = 0; number < 100; number += 1) {
            const feature = model.features(row, number);
            let reliabilityVote = 0;
            for (const method of model.pool) {
                if (sets[method].has(number)) reliabilityVote += reliabilityWeights[method];
            }
            const normalizedVote = reliabilityVote / model.pool.length;
            let score;
            if (config.mode === 'equalVote') score = feature.votes;
            else if (config.mode === 'reliabilityVote') score = normalizedVote;
            else if (config.mode === 'signature') score = Math.log(feature.signatureProbability);
            else if (config.mode === 'naiveBayes') score = feature.naiveBayesLogOdds;
            else if (config.mode === 'signatureReliability') {
                score = Math.log(feature.signatureProbability) + config.blend * normalizedVote;
            } else if (config.mode === 'signatureNaiveBayes') {
                score = Math.log(feature.signatureProbability) + config.blend * feature.naiveBayesLogOdds;
            } else {
                throw new Error(`Mode không hỗ trợ: ${config.mode}`);
            }
            scores.push({ number, score, tie: stableTie(row.date, number, config.id) });
        }
        scores.sort((left, right) => right.score - left.score || left.tie - right.tie || left.number - right.number);
        return scores.slice(0, BET_COUNT).map(item => item.number).sort((a, b) => a - b);
    };
}

function pct(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function main() {
    const root = path.resolve(__dirname, '..');
    const { rows, sources } = loadRows(root);
    const periods = {
        fit: rows.filter(row => row.date < '2024-01-01'),
        validation: rows.filter(row => row.date >= '2024-01-01' && row.date < '2026-01-01'),
        historical: rows.filter(row => row.date < '2026-01-01'),
        holdout: rows.filter(row => row.date >= '2026-01-01')
    };
    if (!periods.fit.length || !periods.validation.length || !periods.holdout.length) {
        throw new Error('Thiếu fit/validation/holdout rows.');
    }

    const fitMetrics = methodMetrics(periods.fit);
    const robustOrder = METHODS.slice().sort((left, right) =>
        fitMetrics[right].robustScore - fitMetrics[left].robustScore || left.localeCompare(right));
    const pools = {
        top3: robustOrder.slice(0, 3),
        top5: robustOrder.slice(0, 5),
        top7: robustOrder.slice(0, 7),
        diverse3: selectDiversePool(periods.fit, fitMetrics, 3),
        diverse5: selectDiversePool(periods.fit, fitMetrics, 5),
        diverse7: selectDiversePool(periods.fit, fitMetrics, 7),
        all13: METHODS.slice()
    };
    const priors = [100, 300, 1000];
    const fitModels = new Map();
    for (const [poolId, pool] of Object.entries(pools)) {
        for (const prior of priors) {
            fitModels.set(`${poolId}:${prior}`, buildFitModel(periods.fit, pool, prior));
        }
    }

    const configs = [];
    for (const poolId of Object.keys(pools)) {
        configs.push({ id: `${poolId}:equalVote`, poolId, signaturePrior: 300, mode: 'equalVote', blend: 0 });
        configs.push({ id: `${poolId}:reliabilityVote`, poolId, signaturePrior: 300, mode: 'reliabilityVote', blend: 0 });
        configs.push({ id: `${poolId}:naiveBayes`, poolId, signaturePrior: 300, mode: 'naiveBayes', blend: 0 });
        for (const prior of priors) {
            configs.push({ id: `${poolId}:signature:p${prior}`, poolId, signaturePrior: prior, mode: 'signature', blend: 0 });
            configs.push({ id: `${poolId}:signatureNB:p${prior}:b025`, poolId, signaturePrior: prior, mode: 'signatureNaiveBayes', blend: 0.25 });
            configs.push({ id: `${poolId}:signatureReliability:p${prior}:b1`, poolId, signaturePrior: prior, mode: 'signatureReliability', blend: 1 });
        }
    }

    const standalone = METHODS.map(method => {
        const predictor = row => [...methodSets(row)[method]].sort((a, b) => a - b);
        return {
            id: method,
            fit: withoutDaily(settle(periods.fit, predictor)),
            validation: withoutDaily(settle(periods.validation, predictor)),
            holdout: withoutDaily(settle(periods.holdout, predictor))
        };
    });

    const candidates = configs.map(config => {
        const predictor = buildPredictor(config, fitModels, fitMetrics);
        return {
            config,
            predictor,
            fit: settle(periods.fit, predictor),
            validation: settle(periods.validation, predictor)
        };
    });

    // Candidate selection sees fit and validation only. The 2026 holdout remains unopened here.
    candidates.sort((left, right) => {
        const leftFloor = Math.min(left.fit.hitRate, left.validation.hitRate);
        const rightFloor = Math.min(right.fit.hitRate, right.validation.hitRate);
        return rightFloor - leftFloor
            || (right.fit.hitRate + right.validation.hitRate) - (left.fit.hitRate + left.validation.hitRate)
            || left.config.id.localeCompare(right.config.id);
    });
    const selected = candidates[0];
    const holdout = settle(periods.holdout, selected.predictor, true);
    const all = settle(rows, selected.predictor);
    const annual = groupSummary(rows, selected.predictor, row => row.date.slice(0, 4));
    const monthlyHoldout = groupSummary(periods.holdout, selected.predictor, row => row.date.slice(0, 7));

    const compactCandidates = candidates.slice(0, 20).map(item => ({
        id: item.config.id,
        pool: pools[item.config.poolId],
        fit: withoutDaily(item.fit),
        validation: withoutDaily(item.validation),
        fitHitRateText: pct(item.fit.hitRate),
        validationHitRateText: pct(item.validation.hitRate)
    }));
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: METHODOLOGY,
        design: {
            betCount: BET_COUNT,
            holdCount: 100 - BET_COUNT,
            stakePerNumberK: STAKE_PER_NUMBER_K,
            payoutMultiplier: PAYOUT_MULTIPLIER,
            breakEvenHitRate: BREAK_EVEN_HIT_RATE,
            fit: '2016-01-01..2023-12-31',
            validation: '2024-01-01..2025-12-31',
            untouchedHoldout: `${periods.holdout[0].date}..${periods.holdout.at(-1).date}`,
            selectionRule: 'Maximize the minimum hit rate across fit and validation; 2026 is opened once after selection.',
            tieRule: 'Deterministic SHA-256(date, number, candidate); independent of actual result.',
            caveat: 'Source strict reports predate the experimental complex-block extension added locally on 2026-07-18.'
        },
        sources,
        fitMethodMetrics: fitMetrics,
        pools,
        standalone,
        selected: {
            id: selected.config.id,
            config: selected.config,
            pool: pools[selected.config.poolId],
            fit: withoutDaily(selected.fit),
            validation: withoutDaily(selected.validation),
            holdout: withoutDaily(holdout),
            all: withoutDaily(all),
            annual,
            monthlyHoldout,
            holdoutDaily: holdout.daily
        },
        topCandidatesBeforeHoldout: compactCandidates
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(root, 'reports', `fixed30-method-fusion-${stamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const annualLines = Object.entries(annual).map(([year, summary]) =>
        `| ${year} | ${summary.wins}/${summary.days} | ${pct(summary.hitRate)} | ${summary.profitK.toLocaleString('vi-VN')}K | ${pct(summary.roi)} | ${summary.longestLoss} |`);
    const md = `# Fixed-30 strict PIT method fusion\n\n`
        + `- Selected without seeing 2026: **${selected.config.id}**\n`
        + `- Pool: ${pools[selected.config.poolId].join(', ')}\n`
        + `- Fixed selection: ${BET_COUNT} bets/day; break-even ${pct(BREAK_EVEN_HIT_RATE)}\n`
        + `- Fit 2016-2023: ${selected.fit.wins}/${selected.fit.days} (${pct(selected.fit.hitRate)}), profit ${selected.fit.profitK.toLocaleString('vi-VN')}K\n`
        + `- Validation 2024-2025: ${selected.validation.wins}/${selected.validation.days} (${pct(selected.validation.hitRate)}), profit ${selected.validation.profitK.toLocaleString('vi-VN')}K\n`
        + `- Untouched holdout 2026: ${holdout.wins}/${holdout.days} (${pct(holdout.hitRate)}), profit ${holdout.profitK.toLocaleString('vi-VN')}K\n`
        + `- All rows (diagnostic only): ${all.wins}/${all.days} (${pct(all.hitRate)}), profit ${all.profitK.toLocaleString('vi-VN')}K\n\n`
        + `## Annual\n\n| Year | Wins | Hit rate | Profit | ROI | Longest loss |\n|---|---:|---:|---:|---:|---:|\n`
        + `${annualLines.join('\n')}\n\n`
        + `## Interpretation\n\n`
        + `The candidate is promotable only if the untouched holdout improves while fit and validation remain credible. `
        + `A positive 2026 result cannot rescue negative fit/validation evidence. Generated complex-block strategies are not included in these older strict source rows.\n`;
    fs.writeFileSync(mdPath, md);

    console.log(`Selected: ${selected.config.id}`);
    console.log(`Pool: ${pools[selected.config.poolId].join(', ')}`);
    console.log(`Fit: ${selected.fit.wins}/${selected.fit.days} ${pct(selected.fit.hitRate)} profit=${selected.fit.profitK.toLocaleString('vi-VN')}K`);
    console.log(`Validation: ${selected.validation.wins}/${selected.validation.days} ${pct(selected.validation.hitRate)} profit=${selected.validation.profitK.toLocaleString('vi-VN')}K`);
    console.log(`Holdout: ${holdout.wins}/${holdout.days} ${pct(holdout.hitRate)} profit=${holdout.profitK.toLocaleString('vi-VN')}K`);
    console.log(`Reports: ${jsonPath}\n         ${mdPath}`);
}

if (require.main === module) main();

module.exports = {
    METHODS,
    BET_COUNT,
    STAKE_PER_NUMBER_K,
    PAYOUT_MULTIPLIER,
    BREAK_EVEN_HIT_RATE,
    loadRows,
    methodMetrics,
    selectDiversePool,
    buildFitModel,
    buildPredictor,
    settle,
    withoutDaily,
    groupSummary,
    pct
};
