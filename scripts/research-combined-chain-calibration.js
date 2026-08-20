#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    fitHierarchicalModel,
    scoreNumbers: scoreHierarchicalNumbers
} = require('../lib/research/hierarchicalChainCalibrator');
const {
    fitStateLengthModel,
    scoreNumbers: scoreStateNumbers
} = require('../lib/research/stateLengthChainCalibrator');
const { refineCombinedPrediction } = require('../lib/research/combinedChainCalibrator');
const {
    exactMcNemarPValue,
    wilsonInterval
} = require('./research-hierarchical-chain-calibration');

const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;
const HIERARCHICAL_CONFIG = {
    id: 'h30-d60-c0.8-f1-s2-m0',
    priorStrengths: [30, 45, 60],
    minDays: 60,
    minConfidence: 0.8,
    reliabilityDays: 60,
    topFamilies: 1,
    swapLimit: 2,
    minMargin: 0
};
const STATE_CONFIG = {
    id: 'state-len-p24-d12-c0.8-f2-s3',
    priorStrengths: [24, 33.6, 48, 67.2],
    minDays: 12,
    minConfidence: 0.8,
    reliabilityDays: 20,
    topFamilies: 2,
    swapLimit: 3,
    minMargin: 0
};

function parseArgs(argv = process.argv.slice(2)) {
    const values = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        numberReports: values.get('numberReports'),
        diagnostics2024: values.get('diagnostics2024'),
        diagnostics2025: values.get('diagnostics2025'),
        diagnostics2026: values.get('diagnostics2026')
    };
}

function readPayload(filename) {
    return JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
}

function loadNumberRows(filenames) {
    const rows = new Map();
    for (const filename of String(filenames || '').split(',').map(value => value.trim()).filter(Boolean)) {
        for (const row of readPayload(filename).rows || []) {
            if (!Array.isArray(row.numberEvidence) || row.numberEvidence.length !== 100) continue;
            if (!Array.isArray(row.strategies?.chainSmallFirst) || row.strategies.chainSmallFirst.length !== 30) continue;
            rows.set(row.date, row);
        }
    }
    return [...rows.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function loadDiagnosticRows(filename) {
    return (readPayload(filename).rows || []).filter(row =>
        Array.isArray(row.candidateDiagnostics) && row.candidateDiagnostics.length > 0
    ).sort((left, right) => left.date.localeCompare(right.date));
}

function joinRows(numberRows, diagnosticRows) {
    const diagnosticsByDate = new Map(diagnosticRows.map(row => [row.date, row]));
    return numberRows.map(numberRow => {
        const diagnostic = diagnosticsByDate.get(numberRow.date);
        if (!diagnostic) return null;
        if (Number(numberRow.actual) !== Number(diagnostic.actual)) {
            throw new Error(`Kết quả lệch giữa numberEvidence và candidateDiagnostics tại ${numberRow.date}.`);
        }
        return { ...numberRow, candidateDiagnostics: diagnostic.candidateDiagnostics };
    }).filter(Boolean);
}

function fusionConfigs() {
    const rows = [];
    for (const stateWeight of [0, 0.15, 0.3, 0.5]) {
        for (const gate of stateWeight > 0 ? ['none', 'confirm'] : ['none']) {
            for (const swapLimit of [1, 2]) {
                rows.push({
                    id: `fusion-state${stateWeight}-gate${gate}-s${swapLimit}`,
                    stateWeight,
                    gate,
                    swapLimit,
                    minMargin: 0
                });
            }
        }
    }
    return rows;
}

function buildModels(numberTrain, diagnosticTrain) {
    return {
        hierarchical: fitHierarchicalModel(numberTrain, HIERARCHICAL_CONFIG),
        state: fitStateLengthModel(diagnosticTrain, STATE_CONFIG)
    };
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        stakeK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        currentType: null,
        currentLength: 0,
        totalSwaps: 0,
        rows: []
    };
}

function addResult(summary, row, betNumbers, swaps = []) {
    const win = betNumbers.includes(Number(row.actual));
    const stakeK = betNumbers.length * BET_PER_NUMBER_K;
    const profitK = (win ? BET_PER_NUMBER_K * WIN_MULTIPLIER : 0) - stakeK;
    const type = win ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(win);
    summary.stakeK += stakeK;
    summary.profitK += profitK;
    summary.totalSwaps += swaps.length;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, win ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, win ? 0 : summary.currentLength);
    summary.rows.push({ date: row.date, actual: Number(row.actual), win, profitK, betNumbers, swaps });
}

function finalize(summary) {
    const { currentType, currentLength, ...result } = summary;
    return {
        ...result,
        losses: result.days - result.wins,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0,
        averageSwaps: result.days ? result.totalSwaps / result.days : 0
    };
}

function evaluate(rows, models, fusionConfig) {
    const summary = createSummary(fusionConfig.id);
    for (const row of rows) {
        const hierarchicalScores = scoreHierarchicalNumbers(row, models.hierarchical, HIERARCHICAL_CONFIG);
        const stateScores = scoreStateNumbers(row, models.state, STATE_CONFIG);
        const prediction = refineCombinedPrediction(
            row.strategies.chainSmallFirst,
            hierarchicalScores,
            stateScores,
            fusionConfig
        );
        addResult(summary, row, prediction.betNumbers, prediction.swaps);
    }
    return finalize(summary);
}

function compact(summary) {
    const { rows, ...result } = summary;
    return result;
}

function delta(candidate, baseline) {
    return {
        wins: candidate.wins - baseline.wins,
        hitRate: candidate.hitRate - baseline.hitRate,
        profitK: candidate.profitK - baseline.profitK,
        longestLoss: candidate.longestLoss - baseline.longestLoss
    };
}

function pairedComparison(candidate, baseline) {
    const otherByDate = new Map(baseline.rows.map(row => [row.date, row]));
    const counts = { bothWin: 0, bothLoss: 0, candidateOnly: 0, baselineOnly: 0 };
    for (const row of candidate.rows) {
        const other = otherByDate.get(row.date);
        if (!other) continue;
        if (row.win && other.win) counts.bothWin++;
        else if (!row.win && !other.win) counts.bothLoss++;
        else if (row.win) counts.candidateOnly++;
        else counts.baselineOnly++;
    }
    return {
        ...counts,
        netAdditionalWins: counts.candidateOnly - counts.baselineOnly,
        exactMcNemarPValue: exactMcNemarPValue(counts.candidateOnly, counts.baselineOnly)
    };
}

function summarizeMonths(rows) {
    const groups = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!groups.has(month)) groups.set(month, { month, days: 0, wins: 0, profitK: 0 });
        const current = groups.get(month);
        current.days++;
        current.wins += Number(row.win);
        current.profitK += row.profitK;
    }
    return [...groups.values()].map(row => ({ ...row, hitRate: row.wins / row.days }));
}

function main() {
    const options = parseArgs();
    for (const key of ['numberReports', 'diagnostics2024', 'diagnostics2025', 'diagnostics2026']) {
        if (!options[key]) throw new Error(`Thiếu --${key}.`);
    }
    const numberRows = loadNumberRows(options.numberReports);
    const number2024 = numberRows.filter(row => row.date.startsWith('2024-'));
    const number2025 = numberRows.filter(row => row.date.startsWith('2025-'));
    const number2026 = numberRows.filter(row => row.date.startsWith('2026-'));
    const diagnostic2024 = loadDiagnosticRows(options.diagnostics2024);
    const diagnostic2025 = loadDiagnosticRows(options.diagnostics2025);
    const diagnostic2026 = loadDiagnosticRows(options.diagnostics2026);
    const split = Math.floor(number2024.length * 2 / 3);
    const splitDate = number2024[split]?.date;
    const folds = [
        {
            period: 'late-2024-sampled',
            trainNumbers: number2024.slice(0, split),
            trainDiagnostics: diagnostic2024.filter(row => row.date < splitDate),
            test: joinRows(number2024.slice(split), diagnostic2024)
        },
        {
            period: '2025-sampled',
            trainNumbers: number2024,
            trainDiagnostics: diagnostic2024,
            test: joinRows(number2025, diagnostic2025)
        }
    ];
    const evaluatedFolds = folds.map(fold => ({
        ...fold,
        models: buildModels(fold.trainNumbers, fold.trainDiagnostics)
    }));
    const selection = fusionConfigs().map(config => {
        const results = evaluatedFolds.map(fold => {
            const hierarchical = evaluate(fold.test, fold.models, {
                id: 'hierarchical-only',
                stateWeight: 0,
                gate: 'none',
                swapLimit: 2,
                minMargin: 0
            });
            const candidate = evaluate(fold.test, fold.models, config);
            return {
                period: fold.period,
                hierarchical: compact(hierarchical),
                candidate: compact(candidate),
                delta: delta(candidate, hierarchical)
            };
        });
        return {
            config,
            folds: results,
            minimumWinDelta: Math.min(...results.map(row => row.delta.wins)),
            totalWinDelta: results.reduce((sum, row) => sum + row.delta.wins, 0),
            maximumLossDelta: Math.max(...results.map(row => row.delta.longestLoss)),
            totalProfitDeltaK: results.reduce((sum, row) => sum + row.delta.profitK, 0)
        };
    }).sort((left, right) =>
        right.minimumWinDelta - left.minimumWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || left.maximumLossDelta - right.maximumLossDelta
        || right.totalProfitDeltaK - left.totalProfitDeltaK
        || left.config.id.localeCompare(right.config.id)
    );
    const selected = selection[0];
    const finalModels = buildModels(
        [...number2024, ...number2025],
        [...diagnostic2024, ...diagnostic2025]
    );
    const joined2026 = joinRows(number2026, diagnostic2026);
    const hierarchicalHoldout = evaluate(joined2026, finalModels, {
        id: 'hierarchical-only',
        stateWeight: 0,
        gate: 'none',
        swapLimit: 2,
        minMargin: 0
    });
    const combinedHoldout = evaluate(joined2026, finalModels, selected.config);
    const paired = pairedComparison(combinedHoldout, hierarchicalHoldout);
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            status: 'research-only',
            selection: 'Chọn trọng số/gate trên late-2024 sampled và 2025 sampled; khóa trước 2026.',
            primarySignal: HIERARCHICAL_CONFIG.id,
            secondarySignal: STATE_CONFIG.id,
            fusion: 'Chuẩn hóa score trong ngày; state-length chỉ blend hoặc xác nhận tín hiệu Bayesian daily.',
            pointInTime: 'Mọi evidence của một ngày được sinh từ raw prefix kết thúc trước ngày dự đoán.'
        },
        coverage: {
            number2024: number2024.length,
            number2025: number2025.length,
            number2026: number2026.length,
            diagnostic2024: diagnostic2024.length,
            diagnostic2025: diagnostic2025.length,
            diagnostic2026: diagnostic2026.length,
            holdoutJoined: joined2026.length
        },
        economics: {
            betCount: 30,
            targetExcluded: 70,
            betPerNumberK: BET_PER_NUMBER_K,
            winMultiplier: WIN_MULTIPLIER,
            breakEvenHitRate: 30 / 84
        },
        selection: {
            configsTried: fusionConfigs().length,
            selected,
            top: selection.slice(0, 12)
        },
        holdout: {
            hierarchical: compact(hierarchicalHoldout),
            combined: compact(combinedHoldout),
            delta: delta(combinedHoldout, hierarchicalHoldout),
            pairedComparison: paired,
            hierarchicalHitRate95: wilsonInterval(hierarchicalHoldout.wins, hierarchicalHoldout.days),
            combinedHitRate95: wilsonInterval(combinedHoldout.wins, combinedHoldout.days),
            combinedMonths: summarizeMonths(combinedHoldout.rows)
        },
        promotionDecision: combinedHoldout.wins > hierarchicalHoldout.wins &&
            combinedHoldout.profitK > hierarchicalHoldout.profitK &&
            paired.exactMcNemarPValue < 0.05
            ? 'eligible-for-further-independent-validation'
            : 'do-not-promote'
    };
    const output = path.resolve(
        'reports',
        `research_combined_chain_calibration_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report }, null, 2));
}

if (require.main === module) main();

module.exports = {
    HIERARCHICAL_CONFIG,
    STATE_CONFIG,
    fusionConfigs,
    joinRows,
    loadDiagnosticRows,
    loadNumberRows
};
