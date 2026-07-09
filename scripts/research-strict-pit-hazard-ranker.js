#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DEFAULT_BET_COUNT = 30;
const DEFAULT_WIN_MULTIPLIER = 84;
const DEFAULT_BET_PER_NUMBER_K = 1000;

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        train: String(args.get('train') || '').split(',').filter(Boolean),
        test: String(args.get('test') || '').split(',').filter(Boolean),
        betCount: Number(args.get('betCount') || DEFAULT_BET_COUNT),
        winMultiplier: Number(args.get('winMultiplier') || DEFAULT_WIN_MULTIPLIER),
        betPerNumberK: Number(args.get('betPerNumberK') || DEFAULT_BET_PER_NUMBER_K)
    };
}

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function groupStrengths(evidence) {
    return Object.values(evidence?.groups || {})
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => b - a);
}

function familyStrengths(evidence) {
    const families = new Map();
    for (const [group, rawStrength] of Object.entries(evidence?.groups || {})) {
        const family = String(group).split('|')[0] || 'other';
        const strength = clamp(rawStrength);
        families.set(family, Math.max(families.get(family) || 0, strength));
    }
    return [...families.values()].sort((a, b) => b - a);
}

function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function noisyOr(values) {
    return 1 - values.reduce((product, value) => product * (1 - clamp(value, 0, 0.95)), 1);
}

function topMean(values, count) {
    return average(values.slice(0, count));
}

const RISK_FORMULAS = Object.freeze({
    groupNoisyOr: evidence => noisyOr(groupStrengths(evidence)),
    groupTop2: evidence => topMean(groupStrengths(evidence), 2),
    groupTop3: evidence => topMean(groupStrengths(evidence), 3),
    familyNoisyOr: evidence => noisyOr(familyStrengths(evidence)),
    familyTop2: evidence => topMean(familyStrengths(evidence), 2),
    familyTop3: evidence => topMean(familyStrengths(evidence), 3),
    familyNoisyTier: evidence => (
        noisyOr(familyStrengths(evidence)) +
        Math.min(0.08, Number(evidence?.tier1Groups || 0) * 0.008)
    ),
    familyTop2Active: evidence => (
        topMean(familyStrengths(evidence), 2) +
        Math.min(0.06, Number(evidence?.activeGroups || 0) * 0.006)
    ),
    familyTop2Potential: evidence => (
        topMean(familyStrengths(evidence), 2) +
        Math.min(0.06, Number(evidence?.potentialGroups || 0) * 0.006)
    ),
    familyConsensus: evidence => (
        topMean(familyStrengths(evidence), 3) +
        Math.min(0.08, Number(evidence?.supportFamilies || 0) * 0.012)
    )
});

function loadRows(reportPaths) {
    const byDate = new Map();
    for (const reportPath of reportPaths) {
        const absolutePath = path.resolve(reportPath);
        const report = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        for (const row of report.rows || []) {
            if (!Array.isArray(row.numberEvidence) || row.numberEvidence.length !== 100) {
                throw new Error(`Report ${absolutePath} thiếu numberEvidence tại ${row.date || 'ngày không xác định'}.`);
            }
            byDate.set(row.date, row);
        }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildBetNumbers(row, riskFormula, betCount) {
    return row.numberEvidence
        .map(evidence => ({
            number: Number(evidence.number),
            risk: Number(riskFormula(evidence)) || 0
        }))
        .sort((a, b) => b.risk - a.risk || a.number - b.number)
        .slice(100 - betCount)
        .map(item => item.number)
        .sort((a, b) => a - b);
}

function longestRuns(results) {
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

function summarizeRows(rows, getBetNumbers, options) {
    const results = rows.map(row => {
        const betNumbers = getBetNumbers(row);
        const win = betNumbers.includes(Number(row.actual));
        return {
            date: row.date,
            actual: Number(row.actual),
            betNumbers,
            win,
            profitK: win
                ? options.betPerNumberK * options.winMultiplier - betNumbers.length * options.betPerNumberK
                : -betNumbers.length * options.betPerNumberK
        };
    });
    const days = results.length;
    const wins = results.filter(row => row.win).length;
    const stakeK = results.reduce(
        (sum, row) => sum + row.betNumbers.length * options.betPerNumberK,
        0
    );
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
    const rates = monthly.map(row => row.hitRate);
    const meanMonthlyRate = average(rates);
    const monthlyStdDev = rates.length
        ? Math.sqrt(average(rates.map(rate => (rate - meanMonthlyRate) ** 2)))
        : 0;
    return {
        days,
        wins,
        losses: days - wins,
        hitRate: days ? wins / days : 0,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        profitableMonths: monthly.filter(row => row.profitK > 0).length,
        months: monthly.length,
        minimumMonthlyHitRate: rates.length ? Math.min(...rates) : 0,
        monthlyStdDev,
        ...longestRuns(results),
        monthly,
        rows: results
    };
}

function evaluateFormula(rows, formulaId, options) {
    const formula = RISK_FORMULAS[formulaId];
    if (!formula) throw new Error(`Công thức không tồn tại: ${formulaId}`);
    return summarizeRows(
        rows,
        row => buildBetNumbers(row, formula, options.betCount),
        options
    );
}

function evaluateExistingStrategy(rows, strategyId, options) {
    return summarizeRows(
        rows,
        row => (row.strategies?.[strategyId] || []).map(Number),
        options
    );
}

function robustTrainingScore(summary) {
    // Chỉ dùng tập huấn luyện. Phạt mạnh biến động theo tháng và chuỗi thua dài.
    return summary.hitRate -
        summary.monthlyStdDev * 0.35 -
        (summary.longestLoss / Math.max(1, summary.days)) * 0.2;
}

function compactSummary(summary) {
    const { rows, monthly, ...compact } = summary;
    return compact;
}

function validateCoverage(rows, label) {
    const duplicateDates = rows.length - new Set(rows.map(row => row.date)).size;
    if (duplicateDates > 0) throw new Error(`${label} có ${duplicateDates} ngày trùng.`);
    if (rows.length === 0) throw new Error(`${label} không có dữ liệu.`);
    return {
        firstDate: rows[0].date,
        lastDate: rows[rows.length - 1].date,
        days: rows.length
    };
}

function run(options) {
    if (options.train.length === 0 || options.test.length === 0) {
        throw new Error('Cần truyền --train=file1,file2 và --test=file1,file2.');
    }
    const trainRows = loadRows(options.train);
    const testRows = loadRows(options.test);
    const trainCoverage = validateCoverage(trainRows, 'Tập huấn luyện');
    const testCoverage = validateCoverage(testRows, 'Tập kiểm định');
    const training = Object.keys(RISK_FORMULAS).map(id => {
        const summary = evaluateFormula(trainRows, id, options);
        return { id, selectionScore: robustTrainingScore(summary), ...compactSummary(summary) };
    }).sort((a, b) => (
        b.selectionScore - a.selectionScore ||
        b.profitK - a.profitK ||
        b.hitRate - a.hitRate
    ));
    const selectedId = training[0].id;
    const holdout = Object.keys(RISK_FORMULAS).map(id => ({
        id,
        ...compactSummary(evaluateFormula(testRows, id, options))
    })).sort((a, b) => b.profitK - a.profitK || b.hitRate - a.hitRate);
    const benchmarkIds = Object.keys(trainRows[0]?.strategies || {});
    const benchmarks = benchmarkIds.map(id => ({
        id,
        train: compactSummary(evaluateExistingStrategy(trainRows, id, options)),
        test: compactSummary(evaluateExistingStrategy(testRows, id, options))
    }));
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            leakageControl: 'Mỗi dòng evidence được sinh chỉ từ dữ liệu trước ngày dự đoán.',
            selection: 'Chọn đúng một công thức trên tập train; không dùng kết quả test để đổi tham số.',
            familyDeduplication: 'Mỗi họ chuỗi chỉ giữ cảnh báo mạnh nhất trước khi tổng hợp.',
            target: `Loại ${100 - options.betCount}, đánh ${options.betCount} số.`
        },
        options,
        coverage: { train: trainCoverage, test: testCoverage },
        selectedId,
        selectedTraining: training.find(row => row.id === selectedId),
        selectedHoldout: holdout.find(row => row.id === selectedId),
        training,
        holdout,
        benchmarks
    };
    const outputPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_strict_pit_hazard_ranker_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
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
            selectedId: report.selectedId,
            selectedTraining: report.selectedTraining,
            selectedHoldout: report.selectedHoldout,
            holdoutTop: report.holdout.slice(0, 5),
            benchmarks: report.benchmarks.map(row => ({
                id: row.id,
                trainHitRate: row.train.hitRate,
                trainProfitK: row.train.profitK,
                testHitRate: row.test.hitRate,
                testProfitK: row.test.profitK
            }))
        }, null, 2));
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}

module.exports = {
    RISK_FORMULAS,
    buildBetNumbers,
    evaluateFormula,
    familyStrengths,
    groupStrengths,
    loadRows,
    noisyOr,
    robustTrainingScore,
    run,
    summarizeRows
};
