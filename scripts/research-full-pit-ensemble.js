#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BET_COUNT = 30;
const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;
const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        train: String(args.get('train') || '').split(',').filter(Boolean),
        test: String(args.get('test') || '').split(',').filter(Boolean),
        raw: args.get('raw') || path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json')
    };
}

function formatIsoDate(value) {
    const match = String(value || '').match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    const isoMatch = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return isoMatch ? isoMatch[0] : '';
}

function loadRows(reportPaths) {
    const byDate = new Map();
    for (const reportPath of reportPaths) {
        const report = JSON.parse(fs.readFileSync(path.resolve(reportPath), 'utf8'));
        for (const row of report.rows || []) byDate.set(row.date, row);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function validateFullCoverage(rows, rawPath, label) {
    if (!rows.length) throw new Error(`${label} không có dữ liệu.`);
    const firstDate = rows[0].date;
    const lastDate = rows[rows.length - 1].date;
    const expectedDates = JSON.parse(fs.readFileSync(path.resolve(rawPath), 'utf8'))
        .map(row => formatIsoDate(row.date))
        .filter(date => date >= firstDate && date <= lastDate);
    const actualDates = new Set(rows.map(row => row.date));
    const missing = expectedDates.filter(date => !actualDates.has(date));
    const unexpected = rows.map(row => row.date).filter(date => !expectedDates.includes(date));
    if (missing.length || unexpected.length) {
        throw new Error(
            `${label} không phủ đủ ngày: thiếu ${missing.length}, thừa ${unexpected.length}. ` +
            `Thiếu đầu tiên: ${missing.slice(0, 5).join(', ')}`
        );
    }
    return { firstDate, lastDate, days: rows.length, missing: 0, unexpected: 0 };
}

function getStrategyIds(rows) {
    return Object.keys(rows[0]?.strategies || {}).filter(id => (
        rows.every(row => Array.isArray(row.strategies?.[id]))
    ));
}

function combinations(values, minimumSize = 2) {
    const results = [];
    const total = 1 << values.length;
    for (let mask = 1; mask < total; mask++) {
        const selected = values.filter((_, index) => mask & (1 << index));
        if (selected.length >= minimumSize) results.push(selected);
    }
    return results;
}

function buildConsensusBets(row, strategyIds, weights = null) {
    const scores = new Map(ALL_NUMBERS.map(number => [number, 0]));
    for (const strategyId of strategyIds) {
        const weight = weights?.[strategyId] ?? 1;
        for (const rawNumber of row.strategies[strategyId] || []) {
            const number = Number(rawNumber);
            scores.set(number, (scores.get(number) || 0) + weight);
        }
    }
    return [...scores.entries()]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, BET_COUNT)
        .map(([number]) => number)
        .sort((a, b) => a - b);
}

function calculateRuns(results) {
    let currentWin = 0;
    let currentLoss = 0;
    let longestWin = 0;
    let longestLoss = 0;
    for (const row of results) {
        if (row.win) {
            currentWin++;
            currentLoss = 0;
        } else {
            currentLoss++;
            currentWin = 0;
        }
        longestWin = Math.max(longestWin, currentWin);
        longestLoss = Math.max(longestLoss, currentLoss);
    }
    return { longestWin, longestLoss };
}

function summarize(rows, getBets) {
    const results = rows.map(row => {
        const betNumbers = getBets(row);
        const win = betNumbers.includes(Number(row.actual));
        return {
            date: row.date,
            actual: Number(row.actual),
            betNumbers,
            win,
            profitK: win
                ? BET_PER_NUMBER_K * WIN_MULTIPLIER - betNumbers.length * BET_PER_NUMBER_K
                : -betNumbers.length * BET_PER_NUMBER_K
        };
    });
    const wins = results.filter(row => row.win).length;
    const stakeK = results.reduce((sum, row) => sum + row.betNumbers.length * BET_PER_NUMBER_K, 0);
    const profitK = results.reduce((sum, row) => sum + row.profitK, 0);
    const monthlyMap = new Map();
    for (const row of results) {
        const month = row.date.slice(0, 7);
        if (!monthlyMap.has(month)) monthlyMap.set(month, []);
        monthlyMap.get(month).push(row);
    }
    const monthly = [...monthlyMap.entries()].map(([month, monthRows]) => {
        const monthWins = monthRows.filter(row => row.win).length;
        return {
            month,
            days: monthRows.length,
            wins: monthWins,
            hitRate: monthWins / monthRows.length,
            profitK: monthRows.reduce((sum, row) => sum + row.profitK, 0)
        };
    });
    const monthlyMean = monthly.reduce((sum, row) => sum + row.hitRate, 0) / monthly.length;
    const monthlyStdDev = Math.sqrt(
        monthly.reduce((sum, row) => sum + (row.hitRate - monthlyMean) ** 2, 0) / monthly.length
    );
    return {
        days: results.length,
        wins,
        losses: results.length - wins,
        hitRate: wins / results.length,
        stakeK,
        profitK,
        roi: profitK / stakeK,
        profitableMonths: monthly.filter(row => row.profitK > 0).length,
        months: monthly.length,
        minimumMonthlyHitRate: Math.min(...monthly.map(row => row.hitRate)),
        monthlyStdDev,
        ...calculateRuns(results),
        monthly,
        rows: results
    };
}

function compact(summary) {
    const { rows, monthly, ...result } = summary;
    return result;
}

function selectionScore(summary) {
    return summary.hitRate -
        summary.monthlyStdDev * 0.3 -
        (summary.longestLoss / summary.days) * 0.2;
}

function calculateTrainingWeights(rows, strategyIds) {
    return Object.fromEntries(strategyIds.map(strategyId => {
        const summary = summarize(rows, row => row.strategies[strategyId].map(Number));
        // Shrink về trọng số 1 để tránh một năm huấn luyện chi phối quá mạnh.
        const excess = summary.hitRate - BET_COUNT / 100;
        return [strategyId, Math.max(0.5, Math.min(1.5, 1 + excess * 2))];
    }));
}

function evaluateSubsets(trainRows, strategyIds, weights = null) {
    return combinations(strategyIds).map(ids => {
        const summary = summarize(trainRows, row => buildConsensusBets(row, ids, weights));
        return {
            id: ids.join('+'),
            strategyIds: ids,
            selectionScore: selectionScore(summary),
            ...compact(summary)
        };
    }).sort((a, b) => (
        b.selectionScore - a.selectionScore ||
        b.hitRate - a.hitRate ||
        b.profitK - a.profitK ||
        a.strategyIds.length - b.strategyIds.length
    ));
}

function run(options) {
    if (!options.train.length || !options.test.length) {
        throw new Error('Cần truyền --train=... và --test=...');
    }
    const trainRows = loadRows(options.train);
    const testRows = loadRows(options.test);
    const coverage = {
        train: validateFullCoverage(trainRows, options.raw, 'Train'),
        test: validateFullCoverage(testRows, options.raw, 'Test')
    };
    const strategyIds = getStrategyIds([...trainRows, ...testRows]);
    const weights = calculateTrainingWeights(trainRows, strategyIds);
    const equalCandidates = evaluateSubsets(trainRows, strategyIds);
    const weightedCandidates = evaluateSubsets(trainRows, strategyIds, weights);
    const selectedEqual = equalCandidates[0];
    const selectedWeighted = weightedCandidates[0];
    const evaluateLocked = (selected, selectedWeights) => compact(summarize(
        testRows,
        row => buildConsensusBets(row, selected.strategyIds, selectedWeights)
    ));
    const individual = strategyIds.map(id => ({
        id,
        train: compact(summarize(trainRows, row => row.strategies[id].map(Number))),
        test: compact(summarize(testRows, row => row.strategies[id].map(Number)))
    })).sort((a, b) => b.test.profitK - a.test.profitK);
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            coverage: 'Dùng toàn bộ ngày quay trong từng khoảng, không lấy mẫu.',
            pointInTime: 'Mỗi dàn thành phần đã được sinh chỉ từ dữ liệu trước ngày dự đoán.',
            training: 'Chọn tập phương pháp và trọng số chỉ trên năm train.',
            holdout: 'Khóa lựa chọn rồi chấm nguyên trạng trên năm test.'
        },
        coverage,
        strategyIds,
        trainingWeights: weights,
        selectedEqual: {
            train: selectedEqual,
            test: evaluateLocked(selectedEqual, null)
        },
        selectedWeighted: {
            train: selectedWeighted,
            test: evaluateLocked(selectedWeighted, weights)
        },
        individual,
        trainingTopEqual: equalCandidates.slice(0, 20),
        trainingTopWeighted: weightedCandidates.slice(0, 20)
    };
    const outputPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_full_pit_ensemble_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    return { outputPath, report };
}

if (require.main === module) {
    try {
        const { outputPath, report } = run(parseArgs());
        console.log(JSON.stringify({
            outputPath,
            coverage: report.coverage,
            selectedEqual: report.selectedEqual,
            selectedWeighted: report.selectedWeighted,
            individual: report.individual
        }, null, 2));
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}

module.exports = {
    buildConsensusBets,
    calculateTrainingWeights,
    combinations,
    loadRows,
    run,
    selectionScore,
    summarize,
    validateFullCoverage
};
