#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        train: args.get('train'),
        validation: args.get('validation'),
        test: args.get('test'),
        target: Number(args.get('target') || 70),
        stakeK: Number(args.get('stakeK') || 1000),
        payoutMultiplier: Number(args.get('payoutMultiplier') || 84)
    };
}

function loadRows(file) {
    const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const rows = (payload.rows || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length || !rows.every(row => Array.isArray(row.numberEvidence))) {
        throw new Error(`Report không có numberEvidence đầy đủ: ${file}`);
    }
    return { payload, rows };
}

function stateBucket(detail) {
    const active = Number(detail?.activeSets || 0);
    const potential = Number(detail?.potentialSets || 0);
    if (active > 0 && potential === 0) return 'active';
    if (potential > 0 && active === 0) return 'potential';
    return 'mixed';
}

function setSizeBucket(detail) {
    const size = Number(detail?.meanSetSize || detail?.minSetSize || 100);
    if (size <= 3) return 'xs';
    if (size <= 10) return 's';
    if (size <= 25) return 'm';
    return 'l';
}

function tierBucket(detail) {
    const total = Math.max(1, Number(detail?.independentSets || 0));
    const ratio = Number(detail?.tier1Sets || 0) / total;
    if (ratio >= 0.8) return 'tier1';
    if (ratio >= 0.3) return 'mixed-tier';
    return 'lower-tier';
}

function featureFor(group, detail) {
    return `${group}|${stateBucket(detail)}|${tierBucket(detail)}|${setSizeBucket(detail)}`;
}

function buildDailyFeatureSets(row, config) {
    const features = new Map();
    for (const evidence of row.numberEvidence || []) {
        const number = Number(evidence.number);
        if (!Number.isInteger(number) || number < 0 || number > 99) continue;
        for (const [group, strengthValue] of Object.entries(evidence.groups || {})) {
            const detail = evidence.groupDetails?.[group] || {};
            const state = stateBucket(detail);
            if (config.activeOnly && state !== 'active') continue;
            const feature = featureFor(group, detail);
            if (!features.has(feature)) {
                features.set(feature, {
                    numbers: new Set(),
                    strengthByNumber: new Map(),
                    family: group.split('|')[0] || 'other'
                });
            }
            const bucket = features.get(feature);
            bucket.numbers.add(number);
            bucket.strengthByNumber.set(
                number,
                Math.max(Number(strengthValue || 0), Number(bucket.strengthByNumber.get(number) || 0))
            );
        }
    }
    return features;
}

function calibrate(rows, config) {
    const stats = new Map();
    for (const row of rows) {
        for (const [feature, bucket] of buildDailyFeatureSets(row, config)) {
            if (!stats.has(feature)) {
                stats.set(feature, {
                    feature,
                    family: bucket.family,
                    days: 0,
                    expectedHits: 0,
                    actualHits: 0,
                    variance: 0
                });
            }
            const item = stats.get(feature);
            const coverage = bucket.numbers.size / 100;
            item.days++;
            item.expectedHits += coverage;
            item.actualHits += Number(bucket.numbers.has(Number(row.actual)));
            item.variance += coverage * (1 - coverage);
        }
    }

    const calibrated = new Map();
    for (const [feature, item] of stats) {
        const baseRate = item.expectedHits / Math.max(1, item.days);
        const rawRate = item.actualHits / Math.max(1, item.days);
        const shrink = item.days / (item.days + config.priorDays);
        const edge = (baseRate - rawRate) * shrink;
        const standardError = Math.sqrt(item.variance) / Math.max(1, item.days);
        const conservativeEdge = Math.max(0, edge - config.z * standardError);
        const reliability = Math.sqrt(item.days / (item.days + 30));
        calibrated.set(feature, {
            ...item,
            baseRate,
            rawRate,
            edge,
            standardError,
            score: item.days >= config.minDays ? conservativeEdge * reliability : 0
        });
    }
    return calibrated;
}

function rankRow(row, calibration, config) {
    const perNumber = ALL_NUMBERS.map(number => ({ number, score: 0, support: 0 }));
    const featureSets = buildDailyFeatureSets(row, config);
    const familyEvidence = ALL_NUMBERS.map(() => new Map());
    for (const [feature, bucket] of featureSets) {
        const learned = calibration.get(feature);
        if (!learned || learned.score <= 0) continue;
        for (const number of bucket.numbers) {
            const strength = Math.sqrt(Math.max(0, bucket.strengthByNumber.get(number) || 0));
            const value = learned.score * (0.7 + Math.min(1, strength) * 0.3);
            const current = familyEvidence[number].get(bucket.family) || 0;
            if (value > current) familyEvidence[number].set(bucket.family, value);
        }
    }

    const weights = [1, 0.62, 0.38, 0.23, 0.14];
    for (const rowScore of perNumber) {
        const values = [...familyEvidence[rowScore.number].values()]
            .sort((a, b) => b - a)
            .slice(0, config.topFamilies);
        rowScore.score = values.reduce((sum, value, index) => sum + value * weights[index], 0);
        rowScore.support = values.length;
    }
    return perNumber.sort((a, b) => b.score - a.score || b.support - a.support || a.number - b.number);
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        longestWin: 0,
        longestLoss: 0,
        current: null,
        currentLength: 0,
        rows: []
    };
}

function addResult(summary, row, betNumbers, economics) {
    const win = betNumbers.includes(Number(row.actual));
    const type = win ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(win);
    if (summary.current === type) summary.currentLength++;
    else {
        summary.current = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, type === 'win' ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, type === 'loss' ? summary.currentLength : 0);
    const stakeK = betNumbers.length * economics.stakeK;
    const payoutK = win ? economics.stakeK * economics.payoutMultiplier : 0;
    summary.rows.push({ date: row.date, actual: row.actual, win, stakeK, payoutK, profitK: payoutK - stakeK, betNumbers });
}

function finalize(summary) {
    const stakeK = summary.rows.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = summary.rows.reduce((sum, row) => sum + row.payoutK, 0);
    const monthly = new Map();
    for (const row of summary.rows) {
        const key = row.date.slice(0, 7);
        if (!monthly.has(key)) monthly.set(key, { month: key, days: 0, wins: 0, profitK: 0 });
        const month = monthly.get(key);
        month.days++;
        month.wins += Number(row.win);
        month.profitK += row.profitK;
    }
    return {
        id: summary.id,
        days: summary.days,
        wins: summary.wins,
        losses: summary.days - summary.wins,
        hitRate: summary.days ? summary.wins / summary.days : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin: summary.longestWin,
        longestLoss: summary.longestLoss,
        positiveMonths: [...monthly.values()].filter(row => row.profitK > 0).length,
        months: [...monthly.values()],
        rows: summary.rows
    };
}

function evaluate(rows, calibration, config, options) {
    const summary = createSummary(`crossYearCohort_${config.activeOnly ? 'active' : 'all'}_p${config.priorDays}_z${config.z}_k${config.topFamilies}`);
    for (const row of rows) {
        const excluded = new Set(rankRow(row, calibration, config).slice(0, options.target).map(item => item.number));
        const betNumbers = ALL_NUMBERS.filter(number => !excluded.has(number));
        addResult(summary, row, betNumbers, options);
    }
    return finalize(summary);
}

function evaluateBaseline(rows, id, options) {
    const summary = createSummary(id);
    for (const row of rows) {
        const betNumbers = (row.strategies?.[id] || []).map(Number);
        addResult(summary, row, betNumbers, options);
    }
    return finalize(summary);
}

function compact(summary) {
    const { rows, ...result } = summary;
    return result;
}

function main() {
    const options = parseArgs();
    if (!options.train || !options.validation || !options.test) {
        throw new Error('Cần --train, --validation và --test.');
    }
    const train = loadRows(options.train);
    const validation = loadRows(options.validation);
    const test = loadRows(options.test);
    const configs = [];
    for (const activeOnly of [false, true]) {
        for (const priorDays of [20, 60]) {
            for (const z of [0, 0.5]) {
                for (const topFamilies of [1, 3]) {
                    configs.push({ activeOnly, priorDays, z, topFamilies, minDays: 20 });
                }
            }
        }
    }

    const validationRanking = configs.map(config => {
        const calibration = calibrate(train.rows, config);
        return { config, summary: evaluate(validation.rows, calibration, config, options) };
    }).sort((a, b) => b.summary.profitK - a.summary.profitK || b.summary.hitRate - a.summary.hitRate);
    const selected = validationRanking[0].config;
    const refitCalibration = calibrate([...train.rows, ...validation.rows], selected);
    const testSummary = evaluate(test.rows, refitCalibration, selected, options);
    const baselineIds = Object.keys(test.rows[0].strategies || {});
    const baselines = baselineIds.map(id => evaluateBaseline(test.rows, id, options))
        .sort((a, b) => b.profitK - a.profitK || b.hitRate - a.hitRate);
    const learnedFeatures = [...refitCalibration.values()]
        .filter(row => row.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 50);

    const report = {
        generatedAt: new Date().toISOString(),
        source: {
            train: path.resolve(options.train),
            validation: path.resolve(options.validation),
            test: path.resolve(options.test)
        },
        methodology: {
            trainDates: [train.rows[0].date, train.rows.at(-1).date],
            validationDates: [validation.rows[0].date, validation.rows.at(-1).date],
            frozenTestDates: [test.rows[0].date, test.rows.at(-1).date],
            target: options.target,
            betCount: 100 - options.target,
            stakeK: options.stakeK,
            payoutMultiplier: options.payoutMultiplier,
            selection: 'Chọn cấu hình bằng profit 2025; refit 2024+2025; đóng băng trước khi chấm 2026.'
        },
        selected,
        validationRanking: validationRanking.map(row => ({ config: row.config, summary: compact(row.summary) })),
        testSummary,
        baselines: baselines.map(compact),
        learnedFeatures
    };
    const reportPath = path.join(
        process.cwd(),
        'reports',
        `research_cross_year_cohort_ranker_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        selected,
        validationWinner: compact(validationRanking[0].summary),
        testSummary: compact(testSummary),
        bestBaseline: compact(baselines[0]),
        learnedFeatures: learnedFeatures.slice(0, 8)
    }, null, 2));
}

main();
