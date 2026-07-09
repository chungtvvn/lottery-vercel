#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const REPORTS = {
    2023: ['research_true_pit_strategies_2026-07-03T10-11-04-106Z.json'],
    2024: ['research_true_pit_strategies_2026-07-03T06-49-39-552Z.json'],
    2025: ['research_true_pit_strategies_2026-07-03T06-38-21-904Z.json'],
    2026: [
        'research_true_pit_strategies_2026-07-03T05-44-52-032Z.json',
        'research_true_pit_strategies_2026-07-03T05-55-59-805Z.json',
        'research_true_pit_strategies_2026-07-03T06-06-04-698Z.json'
    ]
};
const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const PAYOUT_MULTIPLIER = 84;
const STAKE_PER_NUMBER_K = 1000;

function loadRows(files) {
    const byDate = new Map();
    for (const filename of files) {
        const report = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'reports', filename), 'utf8'));
        for (const row of report.rows || []) byDate.set(row.date, row);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function initialWeights(size) {
    return Array(size).fill(1 / size);
}

function updateWeights(weights, row, ids, eta, share) {
    const updated = weights.map((weight, index) => {
        const reward = (row.strategies[ids[index]] || []).includes(row.actual) ? 1 : 0;
        return weight * Math.exp(eta * (reward - 0.3));
    });
    const total = updated.reduce((sum, value) => sum + value, 0);
    return updated.map(value =>
        (1 - share) * value / total + share / ids.length
    );
}

function rankNumbers(row, ids, weights, gateBoost) {
    const gateIndex = weights
        .map((weight, index) => ({ weight, index }))
        .sort((a, b) => b.weight - a.weight || a.index - b.index)[0].index;
    const gateId = ids[gateIndex];
    const gateSet = new Set(row.strategies[gateId] || []);
    const scores = Array(100).fill(0);
    ids.forEach((id, index) => {
        for (const number of row.strategies[id] || []) scores[number] += weights[index];
    });
    return {
        gateId,
        ranking: ALL_NUMBERS
            .map(number => ({
                number,
                score: scores[number] + gateBoost * Number(gateSet.has(number)),
                mixtureScore: scores[number],
                gateSelected: gateSet.has(number)
            }))
            .sort((a, b) =>
                b.score - a.score ||
                b.mixtureScore - a.mixtureScore ||
                a.number - b.number
            )
    };
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        cumulativeProfitK: 0,
        currentType: null,
        currentLength: 0,
        longestWin: 0,
        longestLoss: 0,
        maxDrawdownK: 0,
        peakProfitK: 0,
        rows: []
    };
}

function addResult(summary, row, betNumbers, gateId) {
    const win = betNumbers.includes(row.actual);
    const stakeK = betNumbers.length * STAKE_PER_NUMBER_K;
    const payoutK = win ? STAKE_PER_NUMBER_K * PAYOUT_MULTIPLIER : 0;
    const profitK = payoutK - stakeK;
    summary.days++;
    summary.wins += Number(win);
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += profitK;
    summary.cumulativeProfitK += profitK;
    summary.peakProfitK = Math.max(summary.peakProfitK, summary.cumulativeProfitK);
    summary.maxDrawdownK = Math.max(
        summary.maxDrawdownK,
        summary.peakProfitK - summary.cumulativeProfitK
    );
    const type = win ? 'win' : 'loss';
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, type === 'win' ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, type === 'loss' ? summary.currentLength : 0);
    summary.rows.push({
        date: row.date,
        actual: row.actual,
        gateId,
        betCount: betNumbers.length,
        betNumbers,
        win,
        stakeK,
        payoutK,
        profitK,
        cumulativeProfitK: summary.cumulativeProfitK
    });
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
    const { currentType, currentLength, cumulativeProfitK, peakProfitK, ...result } = summary;
    const [lower95, upper95] = wilson(result.wins, result.days);
    return {
        ...result,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0,
        lower95,
        upper95,
        breakEvenHitRate: result.days && result.stakeK
            ? (result.stakeK / result.days / STAKE_PER_NUMBER_K) / PAYOUT_MULTIPLIER
            : 0
    };
}

function runConfig(rows, config, ids, startingWeights = null) {
    let weights = startingWeights ? startingWeights.slice() : initialWeights(ids.length);
    const summary = createSummary(
        `fixedShareProfit_eta${config.eta}_share${config.share}_boost${config.gateBoost}_bet${config.betCount}`
    );
    for (const row of rows) {
        const ranked = rankNumbers(row, ids, weights, config.gateBoost);
        const betNumbers = ranked.ranking.slice(0, config.betCount).map(item => item.number);
        addResult(summary, row, betNumbers, ranked.gateId);
        weights = updateWeights(weights, row, ids, config.eta, config.share);
    }
    return {
        summary: finalize(summary),
        finalWeights: weights
    };
}

function enumerateWeightConfigs() {
    const configs = [];
    for (const eta of [0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.2]) {
        for (const share of [0.01, 0.05, 0.1, 0.2]) {
            for (const gateBoost of [0, 0.25, 0.5, 1, 2, 4]) {
                configs.push({ eta, share, gateBoost });
            }
        }
    }
    return configs;
}

function evaluateTraining(yearRows) {
    const ids = Object.keys(yearRows[0][1][0].strategies);
    const results = [];
    for (const weightsConfig of enumerateWeightConfigs()) {
        for (const betCount of [5, 10, 15, 20, 25, 30, 35, 40]) {
            const config = { ...weightsConfig, betCount };
            let weights = null;
            const yearly = [];
            for (const [year, rows] of yearRows) {
                const result = runConfig(rows, config, ids, weights);
                weights = result.finalWeights;
                yearly.push({
                    year,
                    days: result.summary.days,
                    wins: result.summary.wins,
                    hitRate: result.summary.hitRate,
                    profitK: result.summary.profitK,
                    roi: result.summary.roi,
                    longestLoss: result.summary.longestLoss,
                    maxDrawdownK: result.summary.maxDrawdownK
                });
            }
            results.push({
                config,
                yearly,
                minProfitK: Math.min(...yearly.map(row => row.profitK)),
                minHitRate: Math.min(...yearly.map(row => row.hitRate)),
                totalProfitK: yearly.reduce((sum, row) => sum + row.profitK, 0),
                totalWins: yearly.reduce((sum, row) => sum + row.wins, 0),
                worstLongestLoss: Math.max(...yearly.map(row => row.longestLoss)),
                worstDrawdownK: Math.max(...yearly.map(row => row.maxDrawdownK)),
                finalWeights: weights
            });
        }
    }
    return { ids, results };
}

function chooseCandidates(results) {
    const robustProfit = results.slice().sort((a, b) =>
        b.minProfitK - a.minProfitK ||
        b.totalProfitK - a.totalProfitK ||
        a.worstDrawdownK - b.worstDrawdownK ||
        b.config.betCount - a.config.betCount
    )[0];
    const robustHit = results
        .filter(row => row.minProfitK >= 0)
        .sort((a, b) =>
            b.minHitRate - a.minHitRate ||
            b.totalProfitK - a.totalProfitK ||
            a.worstLongestLoss - b.worstLongestLoss
        )[0] || robustProfit;
    const hold70 = results
        .filter(row => row.config.betCount === 30)
        .sort((a, b) =>
            b.minProfitK - a.minProfitK ||
            b.totalProfitK - a.totalProfitK ||
            a.worstDrawdownK - b.worstDrawdownK
        )[0];
    return { robustProfit, robustHit, hold70 };
}

function summarizeMonthly(rows) {
    const months = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!months.has(month)) {
            months.set(month, {
                month,
                days: 0,
                wins: 0,
                stakeK: 0,
                payoutK: 0,
                profitK: 0
            });
        }
        const summary = months.get(month);
        summary.days++;
        summary.wins += Number(row.win);
        summary.stakeK += row.stakeK;
        summary.payoutK += row.payoutK;
        summary.profitK += row.profitK;
    }
    return Array.from(months.values()).map(row => ({
        ...row,
        hitRate: row.days ? row.wins / row.days : 0,
        roi: row.stakeK ? row.profitK / row.stakeK : 0
    }));
}

function csvEscape(value) {
    const text = Array.isArray(value) ? value.map(number => String(number).padStart(2, '0')).join(' ') : String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
}

function writeDailyCsv(filePath, rows) {
    const columns = [
        'date', 'actual', 'gateId', 'betCount', 'betNumbers', 'win',
        'stakeK', 'payoutK', 'profitK', 'cumulativeProfitK'
    ];
    const lines = [columns.join(',')];
    for (const row of rows) {
        lines.push(columns.map(column => csvEscape(row[column])).join(','));
    }
    fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function main() {
    const yearRows = [2023, 2024, 2025].map(year => [year, loadRows(REPORTS[year])]);
    const holdoutRows = loadRows(REPORTS[2026]);
    const training = evaluateTraining(yearRows);
    const selected = chooseCandidates(training.results);
    const evaluations = {};

    for (const [name, candidate] of Object.entries(selected)) {
        const result = runConfig(
            holdoutRows,
            candidate.config,
            training.ids,
            candidate.finalWeights
        );
        evaluations[name] = {
            config: candidate.config,
            trainingYears: candidate.yearly,
            holdout: {
                ...result.summary,
                monthly: summarizeMonthly(result.summary.rows)
            }
        };
    }

    const outputDir = path.join(__dirname, '..', 'outputs', 'fixed-share-profit-point-in-time');
    fs.mkdirSync(outputDir, { recursive: true });
    for (const [name, evaluation] of Object.entries(evaluations)) {
        writeDailyCsv(path.join(outputDir, `${name}_daily_2026.csv`), evaluation.holdout.rows);
    }

    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            training: 'Point-in-time 2023-2025; chọn theo năm tệ nhất.',
            holdout: 'Toàn bộ từng ngày 01/01/2026-02/07/2026.',
            economics: {
                stakePerNumberK: STAKE_PER_NUMBER_K,
                payoutMultiplier: PAYOUT_MULTIPLIER
            },
            warning: 'Không dùng kết quả 2026 để chọn eta/share/gateBoost/betCount.'
        },
        evaluations,
        topTrainingConfigurations: training.results
            .slice()
            .sort((a, b) => b.minProfitK - a.minProfitK || b.totalProfitK - a.totalProfitK)
            .slice(0, 30)
            .map(({ finalWeights, ...row }) => row)
    };
    const reportPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_fixed_share_profit_optimizer_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(JSON.stringify({
        reportPath,
        outputDir,
        evaluations: Object.fromEntries(
            Object.entries(evaluations).map(([name, evaluation]) => [name, {
                config: evaluation.config,
                trainingYears: evaluation.trainingYears,
                holdout: {
                    ...evaluation.holdout,
                    rows: undefined,
                    monthly: evaluation.holdout.monthly
                }
            }])
        )
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    rankNumbers,
    runConfig,
    chooseCandidates
};
