#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const REPORT_PREFIX = 'research_true_pit_strategies_';
const METHODOLOGY = 'strict-prefix-point-in-time-v1';
const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = 30;
const STAKE_K = 1000;
const PAYOUT_K = 84000;
const CHAIN_METHODS = [
    'chainSmallFirst', 'chainBlockFirst', 'chainCredibleFirst',
    'chainFreqFirst', 'chainRiskFirst'
];
const NUMBER_METHODS = [
    'numberAvgRisk', 'numberConsensusRisk', 'numberPosteriorDiversity',
    'numberLikelihoodRatio', 'numberWeightedRisk', 'activeOnlyAvgRisk',
    'dedupEdge50Hold', 'dedupEdge50CombinedB40S05'
];
const METHODS = [...CHAIN_METHODS, ...NUMBER_METHODS];

function loadStrictRows(reportDir) {
    const selected = new Map();
    for (const file of fs.readdirSync(reportDir).filter(file => file.startsWith(REPORT_PREFIX) && file.endsWith('.json')).sort()) {
        let report;
        try { report = JSON.parse(fs.readFileSync(path.join(reportDir, file), 'utf8')); } catch { continue; }
        if (report.methodologyVersion !== METHODOLOGY || report.options?.dateStep !== 1 || !report.rows?.length) continue;
        const year = Number(report.rows[0].date.slice(0, 4));
        const minimumDays = year === 2026 ? 180 : 330;
        if (!year || report.rows.length < minimumDays || !METHODS.every(method => report.rows[0].strategies?.[method])) continue;
        const score = report.rows.length;
        if (!selected.has(year) || selected.get(year).score < score) selected.set(year, { file, report, score });
    }
    return {
        rows: [...selected.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, item]) => item.report.rows),
        sources: [...selected.entries()].sort((a, b) => a[0] - b[0]).map(([year, item]) => ({
            year, file: item.file, days: item.report.rows.length, fingerprint: item.report.fingerprint?.sha256 || item.report.fingerprint || null
        }))
    };
}

function featureVector(row, number) {
    const flags = METHODS.map(method => Number((row.strategies?.[method] || []).includes(number)));
    const chainRate = flags.slice(0, CHAIN_METHODS.length).reduce((sum, value) => sum + value, 0) / CHAIN_METHODS.length;
    const numberRate = flags.slice(CHAIN_METHODS.length).reduce((sum, value) => sum + value, 0) / NUMBER_METHODS.length;
    const allRate = flags.reduce((sum, value) => sum + value, 0) / flags.length;
    return [
        ...flags,
        chainRate,
        numberRate,
        allRate,
        chainRate * numberRate,
        Math.abs(chainRate - numberRate),
        Number(chainRate === 1),
        Number(numberRate === 1)
    ];
}

function createModel(dimension) {
    return {
        weights: new Float64Array(dimension),
        firstMoment: new Float64Array(dimension),
        secondMoment: new Float64Array(dimension),
        step: 0
    };
}

function scoresForRow(model, row) {
    return ALL_NUMBERS.map(number => {
        const features = featureVector(row, number);
        let score = 0;
        for (let index = 0; index < features.length; index++) score += model.weights[index] * features[index];
        return { number, features, score };
    });
}

function train(model, rows, config) {
    const beta1 = 0.9;
    const beta2 = 0.999;
    const epsilon = 1e-8;
    for (let epoch = 0; epoch < config.epochs; epoch++) {
        for (const row of rows) {
            const scored = scoresForRow(model, row);
            const maxScore = Math.max(...scored.map(item => item.score));
            const exp = scored.map(item => Math.exp(item.score - maxScore));
            const denominator = exp.reduce((sum, value) => sum + value, 0);
            const gradient = new Float64Array(model.weights.length);
            for (let numberIndex = 0; numberIndex < scored.length; numberIndex++) {
                const residual = exp[numberIndex] / denominator - Number(scored[numberIndex].number === Number(row.actual));
                for (let featureIndex = 0; featureIndex < gradient.length; featureIndex++) {
                    gradient[featureIndex] += residual * scored[numberIndex].features[featureIndex];
                }
            }
            model.step++;
            for (let index = 0; index < model.weights.length; index++) {
                gradient[index] += config.l2 * model.weights[index];
                model.firstMoment[index] = beta1 * model.firstMoment[index] + (1 - beta1) * gradient[index];
                model.secondMoment[index] = beta2 * model.secondMoment[index] + (1 - beta2) * gradient[index] * gradient[index];
                const mHat = model.firstMoment[index] / (1 - Math.pow(beta1, model.step));
                const vHat = model.secondMoment[index] / (1 - Math.pow(beta2, model.step));
                model.weights[index] -= config.learningRate * mHat / (Math.sqrt(vHat) + epsilon);
            }
        }
    }
    return model;
}

function predict(model, row) {
    return scoresForRow(model, row)
        .sort((a, b) => b.score - a.score || a.number - b.number)
        .slice(0, BET_COUNT)
        .map(item => item.number);
}

function summarize(rows, getNumbers) {
    let wins = 0;
    let currentWin = 0;
    let currentLoss = 0;
    let longestWin = 0;
    let longestLoss = 0;
    const daily = [];
    for (const row of rows) {
        const numbers = getNumbers(row);
        const win = numbers.includes(Number(row.actual));
        wins += Number(win);
        currentWin = win ? currentWin + 1 : 0;
        currentLoss = win ? 0 : currentLoss + 1;
        longestWin = Math.max(longestWin, currentWin);
        longestLoss = Math.max(longestLoss, currentLoss);
        daily.push({ date: row.date, actual: row.actual, numbers, win, profitK: (win ? PAYOUT_K : 0) - BET_COUNT * STAKE_K });
    }
    const stakeK = rows.length * BET_COUNT * STAKE_K;
    const payoutK = wins * PAYOUT_K;
    return {
        days: rows.length,
        wins,
        losses: rows.length - wins,
        hitRate: rows.length ? wins / rows.length : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin,
        longestLoss,
        daily
    };
}

function compact(summary) {
    const { daily, ...result } = summary;
    return result;
}

function configs() {
    const rows = [];
    for (const learningRate of [0.001, 0.003, 0.01]) {
        for (const l2 of [0, 0.001, 0.01]) rows.push({ learningRate, l2, epochs: 6 });
    }
    return rows;
}

function run() {
    const root = path.resolve(__dirname, '..');
    const { rows, sources } = loadStrictRows(path.join(root, 'reports'));
    const training = rows.filter(row => row.date < '2024-01-01');
    const validation = rows.filter(row => row.date >= '2024-01-01' && row.date < '2026-01-01');
    const holdout = rows.filter(row => row.date >= '2026-01-01');
    if (!training.length || !validation.length || !holdout.length) throw new Error('Thiếu train/validation/holdout strict PIT.');
    const dimension = featureVector(training[0], 0).length;
    const validationRanking = configs().map(config => {
        const model = train(createModel(dimension), training, config);
        return { config, result: compact(summarize(validation, row => predict(model, row))), weights: [...model.weights] };
    }).sort((a, b) => b.result.profitK - a.result.profitK || b.result.hitRate - a.result.hitRate);
    const selected = validationRanking[0].config;
    const lockedModel = train(createModel(dimension), [...training, ...validation], selected);
    const lockedHoldout = summarize(holdout, row => predict(lockedModel, row));
    const output = {
        generatedAt: new Date().toISOString(),
        methodology: {
            source: METHODOLOGY,
            model: 'Multinomial softmax ranking with Adam and L2 shrinkage.',
            selection: 'Train 2016-2023; select hyperparameters on 2024-2025; retrain through 2025; locked holdout 2026.',
            leakageControl: 'Features are only immutable strict-prefix strategy memberships generated from D-1.'
        },
        economics: { betCount: BET_COUNT, stakePerNumberK: STAKE_K, payoutK: PAYOUT_K, breakEvenHitRate: BET_COUNT / 84 },
        sources,
        features: [...METHODS, 'chainRate', 'numberRate', 'allRate', 'chainXNumber', 'disagreement', 'allChain', 'allNumber'],
        selectedConfig: selected,
        validationRanking,
        lockedHoldout: compact(lockedHoldout),
        lockedDaily: lockedHoldout.daily,
        lockedWeights: [...lockedModel.weights]
    };
    const outputPath = path.join(root, 'reports', `research_strict_softmax_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    return { outputPath, output };
}

if (require.main === module) {
    try {
        const { outputPath, output } = run();
        console.log(JSON.stringify({ outputPath, selectedConfig: output.selectedConfig, lockedHoldout: output.lockedHoldout, validationTop3: output.validationRanking.slice(0, 3).map(row => ({ config: row.config, result: row.result })) }, null, 2));
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}

module.exports = { featureVector, predict, run, summarize, train };
