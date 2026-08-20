#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    fitStableBlockAdmissionModel,
    fitStableBlockBreakModel,
    refinePredictionWithBlockAdmission,
    refinePredictionWithBlockGuard
} = require('../lib/research/blockAdmissionCalibrator');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const STAKE_K = 1000;
const PAYOUT = 84;
const BET_COUNT = 30;

const TRAIN_REPORTS = [
    'research_true_pit_strategies_2026-07-18T05-07-58-141Z.json',
    'research_true_pit_strategies_2026-07-18T05-10-27-615Z.json',
    'research_true_pit_strategies_2026-07-18T05-13-50-218Z.json',
    'research_true_pit_strategies_2026-07-18T05-17-18-007Z.json',
    'research_true_pit_strategies_2026-07-18T05-20-47-671Z.json',
    'research_true_pit_strategies_2026-07-18T05-24-29-803Z.json',
    'research_true_pit_strategies_2026-07-18T05-28-05-368Z.json',
    'research_true_pit_strategies_2026-07-18T05-32-38-749Z.json',
    'research_true_pit_strategies_2026-07-18T05-37-44-713Z.json',
    'research_true_pit_strategies_2026-07-18T05-42-58-943Z.json'
];

const EVALUATION = {
    2024: {
        diagnostics: 'research_true_pit_strategies_2026-07-18T08-07-35-994Z.json',
        verified: 'research_true_pit_strategies_2026-07-15T09-12-54-384Z.json'
    },
    2025: {
        diagnostics: 'research_true_pit_strategies_2026-07-18T08-15-14-027Z.json',
        verified: 'research_true_pit_strategies_2026-07-15T10-36-27-359Z.json'
    },
    2026: {
        diagnostics: 'research_true_pit_strategies_2026-07-16T17-18-22-555Z.json',
        verified: 'research_true_pit_strategies_2026-07-15T09-41-35-326Z.json'
    }
};

const MODEL_CONFIGS = [
    {
        id: 'balanced60', maxSetSize: 60, minDaysPerYear: 2, minYears: 6,
        minPositiveShare: 0.6, minConservativeEdge: 0, minConservativeLift: 0,
        stabilityZ: 0.67, minEvidenceDays: 10
    },
    {
        id: 'balanced70', maxSetSize: 70, minDaysPerYear: 2, minYears: 6,
        minPositiveShare: 0.6, minConservativeEdge: 0, minConservativeLift: 0,
        stabilityZ: 0.67, minEvidenceDays: 10
    },
    {
        id: 'stable60', maxSetSize: 60, minDaysPerYear: 3, minYears: 7,
        minPositiveShare: 0.7, minConservativeEdge: 0.0025, minConservativeLift: 0.0025,
        stabilityZ: 1, minEvidenceDays: 15
    },
    {
        id: 'stable70', maxSetSize: 70, minDaysPerYear: 3, minYears: 7,
        minPositiveShare: 0.7, minConservativeEdge: 0.0025, minConservativeLift: 0.0025,
        stabilityZ: 1, minEvidenceDays: 15
    },
    {
        id: 'record60', maxSetSize: 60, recordOnly: true, minDaysPerYear: 2, minYears: 6,
        minPositiveShare: 0.6, minConservativeEdge: 0, minConservativeLift: 0,
        stabilityZ: 0.67, minEvidenceDays: 10
    },
    {
        id: 'record70', maxSetSize: 70, recordOnly: true, minDaysPerYear: 2, minYears: 6,
        minPositiveShare: 0.6, minConservativeEdge: 0, minConservativeLift: 0,
        stabilityZ: 0.67, minEvidenceDays: 10
    }
];

const SWAP_CONFIGS = [
    { id: 'admit-s1', mode: 'admission', swapLimit: 1, minSwapMargin: 0.0025 },
    { id: 'admit-s2', mode: 'admission', swapLimit: 2, minSwapMargin: 0.005 },
    { id: 'guard-s1', mode: 'guard', swapLimit: 1, minCombinedScore: 0 },
    { id: 'guard-s2', mode: 'guard', swapLimit: 2, minCombinedScore: 0 },
    {
        id: 'guard-confirm-s1', mode: 'guard', swapLimit: 1,
        minAdmissionShapes: 2, minProtectionShapes: 2, minCombinedScore: 0.005
    },
    {
        id: 'guard-confirm-s2', mode: 'guard', swapLimit: 2,
        minAdmissionShapes: 2, minProtectionShapes: 2, minCombinedScore: 0.01
    }
];

function readReport(fileName) {
    return JSON.parse(fs.readFileSync(path.join(REPORT_DIR, fileName), 'utf8'));
}

function diagnosticsRows(fileName) {
    return (readReport(fileName).rows || []).filter(row =>
        Array.isArray(row.candidateDiagnostics) && row.candidateDiagnostics.length > 0
    );
}

function verifiedRows(fileName) {
    return (readReport(fileName).rows || []).filter(row =>
        Array.isArray(row.strategies?.chainSmallVerifiedExact)
        && row.strategies.chainSmallVerifiedExact.length === BET_COUNT
    );
}

function joinEvaluation(config) {
    const verifiedByDate = new Map(verifiedRows(config.verified).map(row => [row.date, row]));
    return diagnosticsRows(config.diagnostics).map(row => {
        const verified = verifiedByDate.get(row.date);
        if (!verified) return null;
        if (Number(row.actual) !== Number(verified.actual)) {
            throw new Error(`Actual mismatch at ${row.date}`);
        }
        return {
            ...row,
            strategies: {
                ...row.strategies,
                chainSmallVerifiedExact: verified.strategies.chainSmallVerifiedExact.map(Number)
            }
        };
    }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function createSummary(id) {
    return {
        id, days: 0, wins: 0, profitK: 0, stakeK: 0, totalSwaps: 0,
        helpful: 0, harmful: 0, longestWin: 0, longestLoss: 0,
        currentType: null, currentLength: 0, rows: []
    };
}

function addResult(summary, row, betNumbers, swaps, baselineHit) {
    const hit = betNumbers.includes(Number(row.actual));
    const stakeK = betNumbers.length * STAKE_K;
    const type = hit ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(hit);
    summary.profitK += (hit ? PAYOUT * STAKE_K : 0) - stakeK;
    summary.stakeK += stakeK;
    summary.totalSwaps += swaps.length;
    summary.helpful += Number(hit && !baselineHit);
    summary.harmful += Number(!hit && baselineHit);
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, hit ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, hit ? 0 : summary.currentLength);
    summary.rows.push({
        date: row.date, actual: Number(row.actual), hit,
        betNumbers, swaps
    });
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

function evaluateBaseline(rows) {
    const summary = createSummary('chainSmallVerifiedExact');
    for (const row of rows) {
        const bets = row.strategies.chainSmallVerifiedExact.map(Number);
        addResult(summary, row, bets, [], bets.includes(Number(row.actual)));
    }
    return finalize(summary);
}

function evaluate(rows, models, config) {
    const id = `${models.id}-${config.id}`;
    const summary = createSummary(id);
    for (const row of rows) {
        const baseline = row.strategies.chainSmallVerifiedExact.map(Number);
        const baselineHit = baseline.includes(Number(row.actual));
        const options = {
            ...models.options,
            ...config,
            baselineStrategy: 'chainSmallVerifiedExact'
        };
        const prediction = config.mode === 'guard'
            ? refinePredictionWithBlockGuard(row, models.admission, models.breakGuard, options)
            : refinePredictionWithBlockAdmission(row, models.admission, options);
        addResult(summary, row, prediction.betNumbers, prediction.swaps, baselineHit);
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
        profitK: candidate.profitK - baseline.profitK,
        longestLoss: candidate.longestLoss - baseline.longestLoss
    };
}

function percent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function signed(value) {
    return `${value >= 0 ? '+' : ''}${Number(value).toLocaleString('en-US')}K`;
}

function main() {
    const trainGroups = TRAIN_REPORTS.map(diagnosticsRows);
    const evaluationRows = Object.fromEntries(
        Object.entries(EVALUATION).map(([year, config]) => [year, joinEvaluation(config)])
    );
    const baselines = Object.fromEntries(
        Object.entries(evaluationRows).map(([year, rows]) => [year, evaluateBaseline(rows)])
    );

    const models = MODEL_CONFIGS.map(options => ({
        id: options.id,
        options,
        admission: fitStableBlockAdmissionModel(trainGroups, options),
        breakGuard: fitStableBlockBreakModel(trainGroups, options)
    }));
    const candidates = [];
    for (const model of models) {
        for (const swap of SWAP_CONFIGS) {
            const byYear = {};
            for (const year of [2024, 2025]) {
                const result = evaluate(evaluationRows[year], model, swap);
                byYear[year] = {
                    summary: compact(result),
                    delta: delta(result, baselines[year])
                };
            }
            candidates.push({
                id: `${model.id}-${swap.id}`,
                modelId: model.id,
                swapId: swap.id,
                byYear,
                minimumWinDelta: Math.min(byYear[2024].delta.wins, byYear[2025].delta.wins),
                totalWinDelta: byYear[2024].delta.wins + byYear[2025].delta.wins,
                totalProfitDeltaK: byYear[2024].delta.profitK + byYear[2025].delta.profitK,
                maximumLossDelta: Math.max(
                    byYear[2024].delta.longestLoss,
                    byYear[2025].delta.longestLoss
                )
            });
        }
    }
    candidates.sort((left, right) =>
        right.minimumWinDelta - left.minimumWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || left.maximumLossDelta - right.maximumLossDelta
        || right.totalProfitDeltaK - left.totalProfitDeltaK
        || left.id.localeCompare(right.id)
    );
    const selected = candidates[0];
    const selectedModel = models.find(model => model.id === selected.modelId);
    const selectedSwap = SWAP_CONFIGS.find(config => config.id === selected.swapId);
    const holdout = evaluate(evaluationRows[2026], selectedModel, selectedSwap);
    const holdoutDiagnostics = candidates.map(candidate => {
        const model = models.find(item => item.id === candidate.modelId);
        const swap = SWAP_CONFIGS.find(item => item.id === candidate.swapId);
        const result = evaluate(evaluationRows[2026], model, swap);
        return {
            id: candidate.id,
            selectedBeforeHoldout: candidate.id === selected.id,
            validationMinimumWinDelta: candidate.minimumWinDelta,
            validationTotalWinDelta: candidate.totalWinDelta,
            summary: compact(result),
            delta: delta(result, baselines[2026])
        };
    }).sort((left, right) =>
        right.delta.wins - left.delta.wins
        || right.validationMinimumWinDelta - left.validationMinimumWinDelta
        || right.validationTotalWinDelta - left.validationTotalWinDelta
        || left.id.localeCompare(right.id)
    );

    const output = {
        generatedAt: new Date().toISOString(),
        methodology: {
            strictPointInTime: true,
            trainBlockCalibration: '2014-2023 sampled every 10 days',
            selection: 'maximize worst win delta across sampled 2024 and sampled 2025',
            untouchedHoldout: '2026 full daily to 2026-07-14',
            baseline: 'chainSmallVerifiedExact',
            targetExcluded: 70,
            betCount: BET_COUNT,
            stakeK: STAKE_K,
            payout: PAYOUT,
            candidateOutcomeFieldsUsedAtPrediction: false
        },
        sources: { train: TRAIN_REPORTS, evaluation: EVALUATION },
        modelSizes: models.map(model => ({
            id: model.id,
            admission: model.admission.size,
            breakGuard: model.breakGuard.size
        })),
        baselines: Object.fromEntries(
            Object.entries(baselines).map(([year, value]) => [year, compact(value)])
        ),
        selection: {
            selected,
            leaderboard: candidates.slice(0, 12)
        },
        holdout2026: {
            baseline: compact(baselines[2026]),
            hybrid: compact(holdout),
            delta: delta(holdout, baselines[2026])
        },
        holdoutDiagnostics,
        holdoutRows: holdout.rows
    };

    const jsonName = 'block-small-verified-hybrid-2026-07-18.json';
    fs.writeFileSync(path.join(REPORT_DIR, jsonName), JSON.stringify(output, null, 2));

    const tableRows = [
        ['2024 chọn cấu hình', baselines[2024], selected.byYear[2024].summary],
        ['2025 validation', baselines[2025], selected.byYear[2025].summary],
        ['2026 holdout đầy đủ', baselines[2026], compact(holdout)]
    ];
    const lines = [
        '# Kết hợp Block với SmallChain đã hiệu chỉnh',
        '',
        `- Cấu hình được chọn trước holdout: \`${selected.id}\`.`,
        '- Block model học trên mẫu 2014-2023; chọn bằng mức delta tệ nhất của 2024 và 2025; 2026 không tham gia chọn.',
        '- Block chỉ hoán đổi có kiểm soát quanh 30 số của `chainSmallVerifiedExact`.',
        '- Hold 70, đánh 30, 1.000K/số, ăn 84; hòa vốn 35,71%.',
        '',
        '| Giai đoạn | Small hiệu chỉnh | Hybrid | Delta hit | Profit Hybrid | ROI Hybrid | Đổi số/ngày | Cứu/Hại | Chuỗi thua |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...tableRows.map(([label, baseline, hybrid]) =>
            `| ${label} | ${baseline.wins}/${baseline.days} (${percent(baseline.hitRate)}) | ${hybrid.wins}/${hybrid.days} (${percent(hybrid.hitRate)}) | ${hybrid.wins - baseline.wins >= 0 ? '+' : ''}${hybrid.wins - baseline.wins} | ${signed(hybrid.profitK)} | ${percent(hybrid.roi)} | ${hybrid.averageSwaps.toFixed(2)} | ${hybrid.helpful}/${hybrid.harmful} | ${hybrid.longestLoss} |`
        ),
        '',
        '## Kết luận kiểm định',
        '',
        holdout.wins > baselines[2026].wins
            ? '- Hybrid tăng số ngày trúng trên holdout 2026; vẫn cần kiểm tra tính ổn định ngoài mẫu trước khi đưa production.'
            : holdout.wins === baselines[2026].wins
                ? '- Hybrid không tạo thêm ngày trúng trên holdout 2026; chưa có lý do thay baseline.'
                : '- Hybrid làm giảm số ngày trúng trên holdout 2026; không được promote.',
        '- Không thay production default trong nghiên cứu này.'
    ];
    fs.writeFileSync(
        path.join(REPORT_DIR, 'block-small-verified-hybrid-2026-07-18.md'),
        `${lines.join('\n')}\n`
    );

    console.log(JSON.stringify({
        selected: output.selection.selected,
        baseline2026: output.holdout2026.baseline,
        hybrid2026: output.holdout2026.hybrid,
        delta2026: output.holdout2026.delta,
        holdoutSensitivityTop: holdoutDiagnostics.slice(0, 8).map(row => ({
            id: row.id,
            selectedBeforeHoldout: row.selectedBeforeHoldout,
            validationMinimumWinDelta: row.validationMinimumWinDelta,
            validationTotalWinDelta: row.validationTotalWinDelta,
            wins: row.summary.wins,
            deltaWins: row.delta.wins,
            swaps: row.summary.totalSwaps,
            helpful: row.summary.helpful,
            harmful: row.summary.harmful
        })),
        modelSizes: output.modelSizes
    }, null, 2));
}

main();
