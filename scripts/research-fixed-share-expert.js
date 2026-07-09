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

function loadRows(files) {
    const byDate = new Map();
    for (const filename of files) {
        const report = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'reports', filename), 'utf8'));
        for (const row of report.rows || []) byDate.set(row.date, row);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
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
        currentType: null,
        currentLength: 0,
        longestWin: 0,
        longestLoss: 0,
        expertSelections: {},
        rows: []
    };
}

function addResult(summary, row, betNumbers, expertId) {
    const win = betNumbers.includes(row.actual);
    summary.days++;
    summary.wins += Number(win);
    summary.expertSelections[expertId] = (summary.expertSelections[expertId] || 0) + 1;
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
        expertId,
        win,
        profit84K: win ? 54000 : -30000,
        profit70K: win ? 40000 : -30000,
        betNumbers
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

function binomialTail(total, minimumSuccesses, probability) {
    const logFactorials = [0];
    for (let value = 1; value <= total; value++) {
        logFactorials[value] = logFactorials[value - 1] + Math.log(value);
    }
    let sum = 0;
    for (let successes = minimumSuccesses; successes <= total; successes++) {
        const logCombination = logFactorials[total] -
            logFactorials[successes] -
            logFactorials[total - successes];
        sum += Math.exp(
            logCombination +
            successes * Math.log(probability) +
            (total - successes) * Math.log(1 - probability)
        );
    }
    return Math.min(1, sum);
}

function summarizeMonthly(rows) {
    const months = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!months.has(month)) months.set(month, { month, days: 0, wins: 0, profit84K: 0, profit70K: 0 });
        const summary = months.get(month);
        summary.days++;
        summary.wins += Number(row.win);
        summary.profit84K += row.profit84K;
        summary.profit70K += row.profit70K;
    }
    return Array.from(months.values()).map(row => ({
        ...row,
        hitRate: row.days ? row.wins / row.days : 0
    }));
}

function finalize(summary) {
    const { currentType, currentLength, ...result } = summary;
    const [lower95, upper95] = wilson(result.wins, result.days);
    const profit84K = result.wins * 84000 - result.days * 30000;
    const profit70K = result.wins * 70000 - result.days * 30000;
    return {
        ...result,
        hitRate: result.days ? result.wins / result.days : 0,
        lower95,
        upper95,
        breakEven84: 30 / 84,
        breakEven70: 30 / 70,
        profit84K,
        profit70K,
        roi84: result.days ? profit84K / (result.days * 30000) : 0,
        roi70: result.days ? profit70K / (result.days * 30000) : 0,
        pValueVsRandom30: binomialTail(result.days, result.wins, 0.3),
        pValueVsBreakEven84: binomialTail(result.days, result.wins, 30 / 84),
        monthly: summarizeMonthly(result.rows)
    };
}

function runFixedShare(rows, config, initialWeights = null) {
    const ids = Object.keys(rows[0].strategies);
    let weights = initialWeights
        ? initialWeights.slice()
        : Array(ids.length).fill(1 / ids.length);
    const summary = createSummary(`fixedShare_${config.mode}_eta${config.eta}_share${config.share}`);
    for (const row of rows) {
        let betNumbers;
        let expertId;
        if (config.mode === 'gate') {
            const selected = weights
                .map((weight, index) => ({ weight, index }))
                .sort((a, b) => b.weight - a.weight || a.index - b.index)[0];
            expertId = ids[selected.index];
            betNumbers = row.strategies[expertId] || [];
        } else {
            const scores = Array(100).fill(0);
            ids.forEach((id, index) => {
                for (const number of row.strategies[id] || []) scores[number] += weights[index];
            });
            expertId = 'weighted-mixture';
            betNumbers = top30(scores);
        }
        addResult(summary, row, betNumbers, expertId);

        const updated = weights.map((weight, index) => {
            const reward = (row.strategies[ids[index]] || []).includes(row.actual) ? 1 : 0;
            return weight * Math.exp(config.eta * (reward - 0.3));
        });
        const total = updated.reduce((sum, value) => sum + value, 0);
        weights = updated.map(value =>
            (1 - config.share) * value / total + config.share / ids.length
        );
    }
    return { summary: finalize(summary), finalWeights: weights };
}

function selectConfig(yearRows) {
    const configs = [];
    for (const eta of [0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.2]) {
        for (const share of [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4]) {
            for (const mode of ['gate', 'mix']) configs.push({ eta, share, mode });
        }
    }
    return configs.map(config => {
        let weights = null;
        const yearly = [];
        for (const [year, rows] of yearRows) {
            const result = runFixedShare(rows, config, weights);
            weights = result.finalWeights;
            yearly.push({
                year,
                days: result.summary.days,
                wins: result.summary.wins,
                hitRate: result.summary.hitRate,
                profit84K: result.summary.profit84K
            });
        }
        return {
            config,
            yearly,
            minWins: Math.min(...yearly.map(row => row.wins)),
            totalWins: yearly.reduce((sum, row) => sum + row.wins, 0),
            totalProfit84K: yearly.reduce((sum, row) => sum + row.profit84K, 0),
            finalWeights: weights
        };
    }).sort((a, b) =>
        b.minWins - a.minWins ||
        b.totalWins - a.totalWins ||
        b.totalProfit84K - a.totalProfit84K ||
        a.config.eta - b.config.eta ||
        a.config.share - b.config.share ||
        a.config.mode.localeCompare(b.config.mode)
    );
}

function main() {
    const yearRows = [2023, 2024, 2025].map(year => [year, loadRows(REPORTS[year])]);
    const holdoutRows = loadRows(REPORTS[2026]);
    const selection = selectConfig(yearRows);
    const selected = selection[0];
    const holdout = runFixedShare(holdoutRows, selected.config, selected.finalWeights).summary;
    const baseline = (() => {
        const summary = createSummary('chainSmallFirst');
        for (const row of holdoutRows) {
            addResult(summary, row, row.strategies.chainSmallFirst || [], 'chainSmallFirst');
        }
        return finalize(summary);
    })();

    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            selection: 'Tối đa hóa số thắng thấp nhất theo năm, rồi tổng số thắng trên mẫu point-in-time 2023-2025.',
            holdout: 'Toàn bộ 179 ngày 2026, không dùng để chọn eta/share/mode.',
            economics: 'Hold70, đánh 30 số, 1000K/số; báo cáo ăn 84 và ăn 70.'
        },
        selectedConfig: selected.config,
        trainingYears: selected.yearly,
        candidateRanking: selection.slice(0, 20).map(row => ({
            config: row.config,
            yearly: row.yearly,
            minWins: row.minWins,
            totalWins: row.totalWins,
            totalProfit84K: row.totalProfit84K
        })),
        holdout,
        baseline,
        delta: {
            wins: holdout.wins - baseline.wins,
            hitRate: holdout.hitRate - baseline.hitRate,
            profit84K: holdout.profit84K - baseline.profit84K,
            longestLoss: holdout.longestLoss - baseline.longestLoss
        }
    };
    const reportPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_fixed_share_expert_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        selectedConfig: report.selectedConfig,
        trainingYears: report.trainingYears,
        holdout: { ...holdout, rows: undefined },
        baseline: { ...baseline, rows: undefined },
        delta: report.delta
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    runFixedShare,
    selectConfig
};
