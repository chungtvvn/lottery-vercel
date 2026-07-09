#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const REPORTS = [
    'research_true_pit_strategies_2026-07-03T05-44-52-032Z.json',
    'research_true_pit_strategies_2026-07-03T05-55-59-805Z.json',
    'research_true_pit_strategies_2026-07-03T06-06-04-698Z.json'
];
const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function loadRows() {
    const byDate = new Map();
    for (const filename of REPORTS) {
        const report = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'reports', filename), 'utf8'));
        for (const row of report.rows || []) byDate.set(row.date, row);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function topNumbers(scores, count, historyCounts = null) {
    return ALL_NUMBERS
        .map(number => ({
            number,
            score: Number(scores[number] || 0),
            history: historyCounts ? Number(historyCounts[number] || 0) : 0
        }))
        .sort((a, b) => b.score - a.score || b.history - a.history || a.number - b.number)
        .slice(0, count)
        .map(row => row.number);
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
    let value = 0;
    for (let index = 0; index < left.length; index++) value += left[index] * right[index];
    return value;
}

function featuresFor(row, number, ids) {
    const votes = ids.map(id => Number((row.strategies[id] || []).includes(number)));
    const byId = Object.fromEntries(ids.map((id, index) => [id, votes[index]]));
    const voteRate = votes.reduce((sum, value) => sum + value, 0) / votes.length;
    return [
        1,
        ...votes,
        voteRate,
        byId.chainSmallFirst * byId.numberAvgRisk,
        byId.chainSmallFirst * byId.numberPosteriorDiversity,
        byId.numberAvgRisk * byId.numberConsensusRisk,
        byId.numberPosteriorDiversity * byId.numberConsensusRisk
    ];
}

function trainPairwise(rows, ids, config, initialWeights = null) {
    const featureLength = featuresFor(rows[0], 0, ids).length;
    const weights = initialWeights ? [...initialWeights] : Array(featureLength).fill(0);
    for (let epoch = 0; epoch < config.epochs; epoch++) {
        for (const row of rows) {
            const positive = featuresFor(row, row.actual, ids);
            for (const number of ALL_NUMBERS) {
                if (number === row.actual) continue;
                const negative = featuresFor(row, number, ids);
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

function predictPairwise(row, ids, weights, historyCounts) {
    const scores = ALL_NUMBERS.map(number => dot(weights, featuresFor(row, number, ids)));
    return topNumbers(scores, 30, historyCounts);
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

function wilson(successes, total, z = 1.96) {
    if (!total) return [0, 0];
    const p = successes / total;
    const denominator = 1 + (z * z) / total;
    const center = (p + (z * z) / (2 * total)) / denominator;
    const radius = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total)) / denominator;
    return [center - radius, center + radius];
}

function finalize(summary) {
    const [lower95, upper95] = wilson(summary.wins, summary.days);
    const profit84K = summary.wins * 84000 - summary.days * 30000;
    const profit70K = summary.wins * 70000 - summary.days * 30000;
    return {
        ...summary,
        currentType: undefined,
        currentLength: undefined,
        hitRate: summary.days ? summary.wins / summary.days : 0,
        lower95,
        upper95,
        profit84K,
        profit70K,
        roi84: summary.days ? profit84K / (summary.days * 30000) : 0,
        roi70: summary.days ? profit70K / (summary.days * 30000) : 0
    };
}

function evaluateFixed(rows, id, getPrediction) {
    const summary = createSummary(id);
    const historyCounts = Array(100).fill(0);
    for (const row of rows) {
        addResult(summary, row, getPrediction(row, historyCounts));
        historyCounts[row.actual]++;
    }
    return finalize(summary);
}

function evaluateHedge(rows, ids, eta, evaluationStart) {
    const summary = createSummary(`onlineHedge_eta${eta}`);
    const logWeights = Array(ids.length).fill(0);
    const historyCounts = Array(100).fill(0);
    for (const row of rows) {
        const maxLog = Math.max(...logWeights);
        const weights = logWeights.map(value => Math.exp(value - maxLog));
        const scores = Array(100).fill(0);
        ids.forEach((id, index) => {
            for (const number of row.strategies[id] || []) scores[number] += weights[index];
        });
        const betNumbers = topNumbers(scores, 30, historyCounts);
        if (row.date >= evaluationStart) addResult(summary, row, betNumbers);
        ids.forEach((id, index) => {
            const reward = (row.strategies[id] || []).includes(row.actual) ? 1 : 0;
            logWeights[index] += eta * (reward - 0.3);
        });
        historyCounts[row.actual]++;
    }
    return finalize(summary);
}

function main() {
    const rows = loadRows();
    const ids = Object.keys(rows[0].strategies);
    const trainRows = rows.filter(row => row.date <= '2026-02-28');
    const validationRows = rows.filter(row => row.date >= '2026-03-01' && row.date <= '2026-03-31');
    const refitRows = rows.filter(row => row.date <= '2026-03-31');
    const testRows = rows.filter(row => row.date >= '2026-04-01');

    const configs = [
        { learningRate: 0.001, l2: 0.001, epochs: 4 },
        { learningRate: 0.003, l2: 0.001, epochs: 8 },
        { learningRate: 0.005, l2: 0.003, epochs: 12 },
        { learningRate: 0.01, l2: 0.01, epochs: 8 }
    ];
    const validation = configs.map(config => {
        const weights = trainPairwise(trainRows, ids, config);
        const summary = evaluateFixed(
            validationRows,
            `pairwise_${config.learningRate}_${config.l2}_${config.epochs}`,
            (row, historyCounts) => predictPairwise(row, ids, weights, historyCounts)
        );
        return { config, weights, summary };
    }).sort((a, b) => b.summary.wins - a.summary.wins || b.summary.profit84K - a.summary.profit84K);
    const selectedConfig = validation[0].config;
    const finalWeights = trainPairwise(refitRows, ids, selectedConfig);

    const testResults = [];
    for (const id of ids) {
        testResults.push(evaluateFixed(testRows, id, row => row.strategies[id] || []));
    }
    testResults.push(evaluateFixed(
        testRows,
        'equalVote',
        (row, historyCounts) => {
            const scores = Array(100).fill(0);
            ids.forEach(id => {
                for (const number of row.strategies[id] || []) scores[number]++;
            });
            return topNumbers(scores, 30, historyCounts);
        }
    ));
    testResults.push(evaluateFixed(
        testRows,
        'pairwiseFrozen',
        (row, historyCounts) => predictPairwise(row, ids, finalWeights, historyCounts)
    ));
    for (const eta of [0.02, 0.05, 0.1, 0.2, 0.4]) {
        testResults.push(evaluateHedge(rows, ids, eta, '2026-04-01'));
    }
    testResults.sort((a, b) => b.profit84K - a.profit84K || b.hitRate - a.hitRate);

    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            source: '179 ngày đã tái sinh thống kê đúng point-in-time',
            training: '01-02/2026',
            validation: '03/2026',
            frozenTest: '04/2026 đến 02/07/2026',
            warning: 'Chỉ testResults là ngoài mẫu lựa chọn siêu tham số.'
        },
        selectedConfig,
        validation: validation.map(row => ({
            config: row.config,
            wins: row.summary.wins,
            days: row.summary.days,
            hitRate: row.summary.hitRate
        })),
        learnedWeights: Object.fromEntries(
            ['bias', ...ids, 'voteRate', 'small_x_avg', 'small_x_posterior', 'avg_x_consensus', 'posterior_x_consensus']
                .map((name, index) => [name, finalWeights[index]])
        ),
        testResults
    };
    const reportPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_true_pit_ensemble_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        selectedConfig,
        testResults: testResults.map(({ rows: ignoredRows, ...row }) => row)
    }, null, 2));
}

main();
