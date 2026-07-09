#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const REPORTS = {
    2024: ['research_true_pit_strategies_2026-07-03T06-49-39-552Z.json'],
    2025: ['research_true_pit_strategies_2026-07-03T06-38-21-904Z.json'],
    2026: [
        'research_true_pit_strategies_2026-07-03T05-44-52-032Z.json',
        'research_true_pit_strategies_2026-07-03T05-55-59-805Z.json',
        'research_true_pit_strategies_2026-07-03T06-06-04-698Z.json'
    ]
};
const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function loadRows(files) {
    const byDate = new Map();
    for (const filename of files) {
        const report = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'reports', filename), 'utf8'));
        for (const row of report.rows || []) byDate.set(row.date, row);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function sigmoid(value) {
    if (value >= 0) {
        const z = Math.exp(-Math.min(30, value));
        return 1 / (1 + z);
    }
    const z = Math.exp(Math.max(-30, value));
    return z / (1 + z);
}

function dot(left, right) {
    let result = 0;
    for (let index = 0; index < left.length; index++) result += left[index] * right[index];
    return result;
}

function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values) {
    const avg = mean(values);
    return Math.sqrt(mean(values.map(value => (value - avg) ** 2)));
}

function jaccard(left, right) {
    const a = new Set(left);
    const b = new Set(right);
    let common = 0;
    for (const value of a) if (b.has(value)) common++;
    return common / Math.max(1, a.size + b.size - common);
}

function regimeFeatures(row, ids) {
    const overlaps = ids.map(id => {
        const other = ids.filter(value => value !== id);
        return mean(other.map(otherId => jaccard(row.strategies[id], row.strategies[otherId])));
    });
    const pairwise = [];
    for (let left = 0; left < ids.length; left++) {
        for (let right = left + 1; right < ids.length; right++) {
            pairwise.push(jaccard(row.strategies[ids[left]], row.strategies[ids[right]]));
        }
    }
    return [
        Number(row.candidateCount || 0) / 3000,
        mean(pairwise),
        standardDeviation(pairwise),
        Math.min(...pairwise),
        Math.max(...pairwise),
        ...overlaps
    ];
}

function numberFeatures(row, number, ids) {
    const votes = ids.map(id => Number((row.strategies[id] || []).includes(number)));
    const regime = regimeFeatures(row, ids);
    return [
        ...votes,
        mean(votes),
        votes[0] * votes[4],
        votes[2] * votes[3],
        votes[4] * votes[6],
        votes[4] * votes[7],
        ...regime.map(value => value * mean(votes))
    ];
}

function trainBinaryLogistic(rows, ids, expertId, config) {
    const featureLength = regimeFeatures(rows[0], ids).length + 1;
    const weights = Array(featureLength).fill(0);
    for (let epoch = 0; epoch < config.epochs; epoch++) {
        for (const row of rows) {
            const features = [1, ...regimeFeatures(row, ids)];
            const target = Number((row.strategies[expertId] || []).includes(row.actual));
            const error = target - sigmoid(dot(weights, features));
            for (let index = 0; index < weights.length; index++) {
                weights[index] += config.learningRate *
                    (error * features[index] - config.l2 * weights[index]);
            }
        }
    }
    return weights;
}

function trainPairwise(rows, ids, config) {
    const featureLength = numberFeatures(rows[0], 0, ids).length;
    const weights = Array(featureLength).fill(0);
    for (let epoch = 0; epoch < config.epochs; epoch++) {
        for (const row of rows) {
            const positive = numberFeatures(row, row.actual, ids);
            for (const number of ALL_NUMBERS) {
                if (number === row.actual) continue;
                const negative = numberFeatures(row, number, ids);
                const diff = positive.map((value, index) => value - negative[index]);
                const error = 1 - sigmoid(dot(weights, diff));
                for (let index = 0; index < weights.length; index++) {
                    weights[index] += config.learningRate *
                        (error * diff[index] - config.l2 * weights[index]);
                }
            }
        }
    }
    return weights;
}

function top30(scores) {
    return ALL_NUMBERS
        .map(number => ({ number, score: Number(scores[number] || 0) }))
        .sort((a, b) => b.score - a.score || a.number - b.number)
        .slice(0, 30)
        .map(row => row.number);
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        longestWin: 0,
        longestLoss: 0,
        currentType: null,
        currentLength: 0,
        rows: []
    };
}

function addResult(summary, row, betNumbers) {
    const win = betNumbers.includes(row.actual);
    summary.days++;
    summary.wins += Number(win);
    const type = win ? 'win' : 'loss';
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, type === 'win' ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, type === 'loss' ? summary.currentLength : 0);
    summary.rows.push({ date: row.date, actual: row.actual, win, betNumbers });
}

function finalize(summary) {
    const { currentType, currentLength, ...result } = summary;
    const profit84K = result.wins * 84000 - result.days * 30000;
    const profit70K = result.wins * 70000 - result.days * 30000;
    return {
        ...result,
        hitRate: result.days ? result.wins / result.days : 0,
        profit84K,
        profit70K,
        roi84: result.days ? profit84K / (result.days * 30000) : 0,
        roi70: result.days ? profit70K / (result.days * 30000) : 0
    };
}

function evaluate(rows, id, predictor) {
    const summary = createSummary(id);
    for (const row of rows) addResult(summary, row, predictor(row));
    return finalize(summary);
}

function buildGatingModels(rows, ids, config) {
    return Object.fromEntries(ids.map(id => [id, trainBinaryLogistic(rows, ids, id, config)]));
}

function predictGate(row, ids, models) {
    const features = [1, ...regimeFeatures(row, ids)];
    const winner = ids
        .map(id => ({ id, probability: sigmoid(dot(models[id], features)) }))
        .sort((a, b) => b.probability - a.probability || a.id.localeCompare(b.id))[0];
    return row.strategies[winner.id] || [];
}

function predictMixture(row, ids, models) {
    const features = [1, ...regimeFeatures(row, ids)];
    const scores = Array(100).fill(0);
    for (const id of ids) {
        const probability = sigmoid(dot(models[id], features));
        for (const number of row.strategies[id] || []) scores[number] += probability;
    }
    return top30(scores);
}

function selectConfigs(trainRows, validationRows, ids) {
    const configs = [
        { learningRate: 0.005, l2: 0.001, epochs: 20 },
        { learningRate: 0.01, l2: 0.005, epochs: 30 },
        { learningRate: 0.02, l2: 0.01, epochs: 20 },
        { learningRate: 0.03, l2: 0.03, epochs: 12 }
    ];
    const gating = configs.map(config => {
        const models = buildGatingModels(trainRows, ids, config);
        const gate = evaluate(validationRows, 'regimeGate', row => predictGate(row, ids, models));
        const mixture = evaluate(validationRows, 'regimeMixture', row => predictMixture(row, ids, models));
        return { config, gate, mixture };
    }).sort((a, b) => Math.max(b.gate.wins, b.mixture.wins) - Math.max(a.gate.wins, a.mixture.wins));
    const pairwise = configs.map(config => {
        const weights = trainPairwise(trainRows, ids, config);
        const summary = evaluate(validationRows, 'regimePairwise', row => {
            const scores = ALL_NUMBERS.map(number => dot(weights, numberFeatures(row, number, ids)));
            return top30(scores);
        });
        return { config, summary };
    }).sort((a, b) => b.summary.wins - a.summary.wins);
    return { gating, pairwise };
}

function main() {
    const rows2024 = loadRows(REPORTS[2024]);
    const rows2025 = loadRows(REPORTS[2025]);
    const rows2026 = loadRows(REPORTS[2026]);
    const ids = Object.keys(rows2024[0].strategies);
    const selected = selectConfigs(rows2024, rows2025, ids);
    const training = [...rows2024, ...rows2025].sort((a, b) => a.date.localeCompare(b.date));

    const gatingConfig = selected.gating[0].config;
    const gatingModels = buildGatingModels(training, ids, gatingConfig);
    const pairwiseConfig = selected.pairwise[0].config;
    const pairwiseWeights = trainPairwise(training, ids, pairwiseConfig);

    const results = ids.map(id => evaluate(rows2026, id, row => row.strategies[id] || []));
    results.push(evaluate(rows2026, 'crossYearRegimeGate', row => predictGate(row, ids, gatingModels)));
    results.push(evaluate(rows2026, 'crossYearRegimeMixture', row => predictMixture(row, ids, gatingModels)));
    results.push(evaluate(rows2026, 'crossYearPairwise', row => {
        const scores = ALL_NUMBERS.map(number => dot(pairwiseWeights, numberFeatures(row, number, ids)));
        return top30(scores);
    }));
    results.sort((a, b) => b.profit84K - a.profit84K || b.hitRate - a.hitRate);

    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            train: 'mẫu point-in-time 2024',
            validation: 'mẫu point-in-time 2025',
            refit: '2024 + 2025',
            frozenTest: 'toàn bộ 179 ngày 2026',
            economics: 'Hold70, đánh 30 số, 1000K/số, ăn 84 hoặc 70'
        },
        gatingConfig,
        pairwiseConfig,
        validation: {
            gating: selected.gating.map(row => ({
                config: row.config,
                gate: { wins: row.gate.wins, days: row.gate.days },
                mixture: { wins: row.mixture.wins, days: row.mixture.days }
            })),
            pairwise: selected.pairwise.map(row => ({
                config: row.config,
                wins: row.summary.wins,
                days: row.summary.days
            }))
        },
        testResults: results
    };
    const reportPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_cross_year_regime_ensemble_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        gatingConfig,
        pairwiseConfig,
        testResults: results.map(({ rows: ignoredRows, ...row }) => row)
    }, null, 2));
}

main();
