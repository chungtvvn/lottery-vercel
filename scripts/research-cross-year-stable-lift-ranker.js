#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

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
        throw new Error(`Report khong co numberEvidence day du: ${file}`);
    }
    return rows.map(row => {
        const evidence = row.numberEvidence.slice().sort((a, b) => Number(a.number) - Number(b.number));
        if (evidence.length !== 100 || evidence.some((item, index) => Number(item.number) !== index)) {
            throw new Error(`numberEvidence khong du 00..99 tai ${row.date}`);
        }
        return { ...row, numberEvidence: evidence };
    });
}

function evidenceFeatures(evidence) {
    const features = [];
    for (const [group, detail] of Object.entries(evidence.groupDetails || {})) {
        features.push(`${group}|any`);
        if (Number(detail.activeSets || 0) > 0) features.push(`${group}|active`);
        if (Number(detail.potentialSets || 0) > 0) features.push(`${group}|potential`);
        if (Number(detail.tier1Sets || 0) > 0) features.push(`${group}|tier1`);
    }
    return features;
}

function collectFeatureStats(rows) {
    const stats = new Map();
    for (const row of rows) {
        const membersByFeature = new Map();
        for (const evidence of row.numberEvidence) {
            for (const feature of evidenceFeatures(evidence)) {
                if (!membersByFeature.has(feature)) membersByFeature.set(feature, []);
                membersByFeature.get(feature).push(Number(evidence.number));
            }
        }
        for (const [feature, members] of membersByFeature.entries()) {
            const expected = members.length / 100;
            const current = stats.get(feature) || { observed: 0, expected: 0, variance: 0, days: 0 };
            current.observed += Number(members.includes(Number(row.actual)));
            current.expected += expected;
            current.variance += expected * (1 - expected);
            current.days++;
            stats.set(feature, current);
        }
    }
    return stats;
}

function fitSignals(rows, config) {
    const stats = collectFeatureStats(rows);
    const signals = new Map();
    for (const [feature, value] of stats.entries()) {
        if (value.expected < config.minExpected) continue;
        const ratio = (value.observed + config.prior) / (value.expected + config.prior);
        if (ratio >= config.ratioLimit) continue;
        const z = (value.observed - value.expected) / Math.sqrt(Math.max(1e-9, value.variance));
        const reliability = Math.sqrt(value.expected / (value.expected + config.prior));
        signals.set(feature, {
            feature,
            family: feature.split('|')[0],
            ratio,
            z,
            expected: value.expected,
            observed: value.observed,
            weight: Math.max(0, -Math.log(ratio)) * reliability
        });
    }
    return signals;
}

function scoreEvidence(evidence, signals, topFamilies) {
    const byFamily = new Map();
    for (const feature of evidenceFeatures(evidence)) {
        const signal = signals.get(feature);
        if (!signal) continue;
        const current = byFamily.get(signal.family) || 0;
        if (signal.weight > current) byFamily.set(signal.family, signal.weight);
    }
    return [...byFamily.values()]
        .sort((a, b) => b - a)
        .slice(0, topFamilies)
        .reduce((sum, value, index) => sum + value / (index + 1), 0);
}

function rankRow(row, signals, config) {
    const baseline = new Set(
        (row.strategies?.[config.baseStrategyId] || []).map(Number)
    );
    return row.numberEvidence.map(evidence => ({
        number: Number(evidence.number),
        risk: scoreEvidence(evidence, signals, config.topFamilies),
        baselineBet: baseline.has(Number(evidence.number))
    })).map(item => ({
        ...item,
        safeScore: -item.risk + Number(item.baselineBet) * config.baseBonus
    })).sort((a, b) =>
        b.safeScore - a.safeScore ||
        Number(b.baselineBet) - Number(a.baselineBet) ||
        a.number - b.number
    );
}

function summarize(id, rows, signals, config, options) {
    let wins = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let currentType = null;
    let currentLength = 0;
    const details = [];
    for (const row of rows) {
        const ranked = rankRow(row, signals, config);
        const betNumbers = ranked.slice(0, 100 - options.target).map(item => item.number).sort((a, b) => a - b);
        const win = betNumbers.includes(Number(row.actual));
        wins += Number(win);
        const type = win ? 'win' : 'loss';
        if (type === currentType) currentLength++;
        else {
            currentType = type;
            currentLength = 1;
        }
        longestWin = Math.max(longestWin, type === 'win' ? currentLength : 0);
        longestLoss = Math.max(longestLoss, type === 'loss' ? currentLength : 0);
        details.push({
            date: row.date,
            actual: Number(row.actual),
            win,
            betNumbers,
            rankedNumbers: ranked.map(item => ({
                number: item.number,
                risk: item.risk,
                baselineBet: item.baselineBet,
                safeScore: item.safeScore
            }))
        });
    }
    const stakeK = rows.length * (100 - options.target) * options.stakeK;
    const payoutK = wins * options.payoutMultiplier * options.stakeK;
    return {
        id,
        days: rows.length,
        wins,
        losses: rows.length - wins,
        hitRate: wins / rows.length,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: (payoutK - stakeK) / stakeK,
        longestWin,
        longestLoss,
        rows: details
    };
}

function summarizeBaseline(id, rows, options) {
    let wins = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let currentType = null;
    let currentLength = 0;
    for (const row of rows) {
        const win = (row.strategies?.[id] || []).includes(Number(row.actual));
        wins += Number(win);
        const type = win ? 'win' : 'loss';
        if (type === currentType) currentLength++;
        else {
            currentType = type;
            currentLength = 1;
        }
        longestWin = Math.max(longestWin, type === 'win' ? currentLength : 0);
        longestLoss = Math.max(longestLoss, type === 'loss' ? currentLength : 0);
    }
    const stakeK = rows.length * (100 - options.target) * options.stakeK;
    const payoutK = wins * options.payoutMultiplier * options.stakeK;
    return {
        id,
        days: rows.length,
        wins,
        hitRate: wins / rows.length,
        profitK: payoutK - stakeK,
        roi: (payoutK - stakeK) / stakeK,
        longestWin,
        longestLoss
    };
}

function compact(summary) {
    const { rows, ...result } = summary;
    return result;
}

function main() {
    const options = parseArgs();
    if (!options.train || !options.validation || !options.test) {
        throw new Error('Can --train, --validation va --test.');
    }
    const trainRows = loadRows(options.train);
    const validationRows = loadRows(options.validation);
    const testRows = loadRows(options.test);
    const configs = [];
    for (const baseStrategyId of [
        'chainSmallFirst',
        'chainBlockFirst',
        'numberSurvivalCredibleRisk'
    ]) {
        for (const baseBonus of [0, 0.01, 0.03, 0.05, 0.1]) {
            for (const ratioLimit of [0.9, 0.95, 1]) {
                for (const minExpected of [15, 30]) {
                    for (const prior of [20, 50]) {
                        for (const topFamilies of [1, 2, 3]) {
                            configs.push({
                                baseStrategyId,
                                baseBonus,
                                ratioLimit,
                                minExpected,
                                prior,
                                topFamilies
                            });
                        }
                    }
                }
            }
        }
    }
    const validationRanking = configs.map(config => {
        const signals = fitSignals(trainRows, config);
        const summary = summarize('stableLift', validationRows, signals, config, options);
        return { config, signalCount: signals.size, summary };
    }).sort((a, b) => b.summary.profitK - a.summary.profitK || b.summary.hitRate - a.summary.hitRate);
    const selected = validationRanking[0].config;
    const refitRows = [...trainRows, ...validationRows].sort((a, b) => a.date.localeCompare(b.date));
    const signals = fitSignals(refitRows, selected);
    const testSummary = summarize('crossYearStableLift', testRows, signals, selected, options);
    const baselines = Object.keys(testRows[0].strategies || {})
        .map(id => summarizeBaseline(id, testRows, options))
        .sort((a, b) => b.profitK - a.profitK || b.hitRate - a.hitRate);
    const report = {
        generatedAt: new Date().toISOString(),
        source: {
            train: path.resolve(options.train),
            validation: path.resolve(options.validation),
            test: path.resolve(options.test)
        },
        methodology: {
            trainDates: [trainRows[0].date, trainRows.at(-1).date],
            validationDates: [validationRows[0].date, validationRows.at(-1).date],
            frozenTestDates: [testRows[0].date, testRows.at(-1).date],
            target: options.target,
            betCount: 100 - options.target,
            selection: 'Fit lift 2024, chon nguong tren 2025, refit 2024+2025, dong bang truoc 2026.',
            deduplication: 'Moi ho chuoi chi dong gop tin hieu manh nhat; top family giam trong so.'
        },
        selected,
        selectedValidationSummary: validationRanking[0].summary,
        validationRanking: validationRanking.map(item => ({
            config: item.config,
            signalCount: item.signalCount,
            summary: compact(item.summary)
        })),
        testSummary,
        baselines,
        signals: [...signals.values()].sort((a, b) => b.weight - a.weight)
    };
    const reportPath = path.join(
        process.cwd(),
        'reports',
        `research_cross_year_stable_lift_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        selected,
        signalCount: signals.size,
        validationWinner: compact(validationRanking[0].summary),
        testSummary: compact(testSummary),
        bestBaseline: baselines[0],
        strongestSignals: report.signals.slice(0, 15)
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    evidenceFeatures,
    fitSignals,
    rankRow,
    scoreEvidence
};
