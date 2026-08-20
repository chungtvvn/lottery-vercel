#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { buildHistoricalSurvivalPriors } = require('../lib/research/historicalChainSurvivalPrior');
const {
    fitHierarchicalModel,
    refineBaselinePrediction
} = require('../lib/research/hierarchicalChainCalibrator');
const {
    exactMcNemarPValue,
    loadRows,
    wilsonInterval
} = require('./research-hierarchical-chain-calibration');

const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;
const BASE_CONFIG = {
    priorStrengths: [30, 45, 60],
    minDays: 60,
    minConfidence: 0.8,
    reliabilityDays: 60,
    topFamilies: 1,
    swapLimit: 2,
    minMargin: 0
};

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        train2024: args.get('train2024'),
        validation2025: args.get('validation2025'),
        holdout2026: args.get('holdout2026'),
        startDate: args.get('historyStart') || '01/01/2006',
        cutoffDate: args.get('historyCutoff') || '31/12/2023',
        draws: Number(args.get('draws') || 20000),
        futureOpportunities: Number(args.get('futureOpportunities') || 100)
    };
}

function configs(survivalPriors) {
    return [0, 0.35, 0.7, 1.05, 1.4, 1.8].map(weight => ({
        ...BASE_CONFIG,
        id: `survival-w${weight}`,
        survivalWeight: weight,
        survivalPriors
    }));
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
    const actual = Number(row.actual);
    const win = betNumbers.includes(actual);
    const profitK = (win ? BET_PER_NUMBER_K * WIN_MULTIPLIER : 0) -
        betNumbers.length * BET_PER_NUMBER_K;
    const type = win ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(win);
    summary.stakeK += betNumbers.length * BET_PER_NUMBER_K;
    summary.profitK += profitK;
    summary.totalSwaps += swaps.length;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, win ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, win ? 0 : summary.currentLength);
    summary.rows.push({ date: row.date, actual, win, profitK, betNumbers, swaps });
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

function evaluate(rows, model, config) {
    const summary = createSummary(config.id);
    for (const row of rows) {
        const prediction = refineBaselinePrediction(row, model, config);
        addResult(summary, row, prediction.betNumbers, prediction.swaps);
    }
    return finalize(summary);
}

function evaluateBaseline(rows) {
    const summary = createSummary('chainSmallFirstHold70');
    for (const row of rows) {
        addResult(summary, row, (row.strategies?.chainSmallFirst || []).map(Number));
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
    const baselineByDate = new Map(baseline.rows.map(row => [row.date, row]));
    let bothWin = 0;
    let bothLoss = 0;
    let candidateOnly = 0;
    let baselineOnly = 0;
    for (const row of candidate.rows) {
        const other = baselineByDate.get(row.date);
        if (!other) continue;
        if (row.win && other.win) bothWin++;
        else if (!row.win && !other.win) bothLoss++;
        else if (row.win) candidateOnly++;
        else baselineOnly++;
    }
    return {
        bothWin,
        bothLoss,
        candidateOnly,
        baselineOnly,
        netAdditionalWins: candidateOnly - baselineOnly,
        exactMcNemarPValue: exactMcNemarPValue(candidateOnly, baselineOnly)
    };
}

function summarizeMonths(rows) {
    const months = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!months.has(month)) months.set(month, { month, days: 0, wins: 0, profitK: 0 });
        const current = months.get(month);
        current.days++;
        current.wins += Number(row.win);
        current.profitK += row.profitK;
    }
    return [...months.values()].map(row => ({ ...row, hitRate: row.wins / row.days }));
}

function renderMarkdown(report) {
    const pct = value => `${(Number(value || 0) * 100).toFixed(2)}%`;
    const money = value => `${Number(value || 0).toLocaleString('vi-VN')}K`;
    const foldLines = report.selected.folds.map(fold =>
        `| ${fold.period} | ${fold.baseline.wins}/${fold.baseline.days} | ${fold.candidate.wins}/${fold.candidate.days} | ${fold.delta.wins >= 0 ? '+' : ''}${fold.delta.wins} | ${money(fold.delta.profitK)} |`
    );
    const monthLines = report.holdout.candidateMonths.map(row =>
        `| ${row.month} | ${row.wins}/${row.days} | ${pct(row.hitRate)} | ${money(row.profitK)} |`
    );
    return [
        '# Survival Bayes phân cấp + mô phỏng tương lai',
        '',
        '## Kỷ luật dữ liệu',
        '',
        `- Episode thật dùng cho survival prior: ${report.survivalPrior.metadata.startDate} → ${report.survivalPrior.metadata.cutoffDate}.`,
        '- Replay 2024–2025 chỉ dùng chọn trọng số; 2026 là holdout khóa.',
        `- Monte Carlo: ${report.survivalPrior.metadata.simulationDraws.toLocaleString('vi-VN')} posterior draws, mỗi draw mô phỏng ${report.survivalPrior.metadata.futureOpportunities} cơ hội tiếp diễn.`,
        '- Mẫu mô phỏng chỉ đo bất định; không được cộng vào cỡ mẫu lịch sử.',
        `- Loại ${report.survivalPrior.metadata.blockPatternsExcluded.toLocaleString('vi-VN')} pattern Nhịp block khỏi survival prior vì file streak không chứa đủ transition từng ngày.`,
        '',
        '## Chọn cấu hình trước holdout',
        '',
        '| Giai đoạn | Nền | Survival | Chênh thắng | Chênh profit |',
        '|---|---:|---:|---:|---:|',
        ...foldLines,
        '',
        `Trọng số được khóa: **${report.selected.config.id}**.`,
        '',
        '## Holdout 2026',
        '',
        `- Nền Chuỗi nhỏ: ${report.holdout.baseline.wins}/${report.holdout.baseline.days} (${pct(report.holdout.baseline.hitRate)}), ${money(report.holdout.baseline.profitK)}.`,
        `- Survival Bayes: ${report.holdout.candidate.wins}/${report.holdout.candidate.days} (${pct(report.holdout.candidate.hitRate)}), ${money(report.holdout.candidate.profitK)}.`,
        `- Chênh: ${report.holdout.delta.wins >= 0 ? '+' : ''}${report.holdout.delta.wins} ngày trúng, ${money(report.holdout.delta.profitK)}.`,
        `- McNemar exact hai phía: ${report.holdout.pairedComparison.exactMcNemarPValue.toFixed(6)}.`,
        `- Kết luận triển khai: **${report.promotionDecision}**.`,
        '',
        '| Tháng | Trúng | Tỷ lệ | Profit |',
        '|---|---:|---:|---:|',
        ...monthLines,
        '',
        '## Kết luận',
        '',
        report.conclusion,
        ''
    ].join('\n');
}

function compactPrior(prior) {
    return {
        metadata: prior.metadata,
        families: [...prior.families.values()].sort((a, b) => b.effectiveTrials - a.effectiveTrials),
        groups: [...prior.groups.values()].sort((a, b) =>
            Math.abs(b.standardizedBreakLift) - Math.abs(a.standardizedBreakLift)
        )
    };
}

function main() {
    const options = parseArgs();
    if (!options.train2024 || !options.validation2025 || !options.holdout2026) {
        throw new Error('Cần --train2024, --validation2025 và --holdout2026.');
    }
    const train2024 = loadRows(options.train2024);
    const validation2025 = loadRows(options.validation2025);
    const holdout2026 = loadRows(options.holdout2026);
    const survivalPriors = buildHistoricalSurvivalPriors({
        startDate: options.startDate,
        cutoffDate: options.cutoffDate,
        draws: options.draws,
        futureOpportunities: options.futureOpportunities,
        capPerPattern: 40,
        seed: 20260716
    });
    const split = Math.floor(train2024.length * 2 / 3);
    const early2024 = train2024.slice(0, split);
    const late2024 = train2024.slice(split);
    const modelEarly = fitHierarchicalModel(early2024, BASE_CONFIG);
    const model2024 = fitHierarchicalModel(train2024, BASE_CONFIG);
    const selection = configs(survivalPriors).map(config => {
        const folds = [
            { period: 'late-2024', rows: late2024, model: modelEarly },
            { period: '2025', rows: validation2025, model: model2024 }
        ].map(fold => {
            const baseline = evaluateBaseline(fold.rows);
            const candidate = evaluate(fold.rows, fold.model, config);
            return {
                period: fold.period,
                baseline: compact(baseline),
                candidate: compact(candidate),
                delta: delta(candidate, baseline)
            };
        });
        return {
            config: { ...config, survivalPriors: undefined },
            folds,
            minimumWinDelta: Math.min(...folds.map(fold => fold.delta.wins)),
            totalWinDelta: folds.reduce((sum, fold) => sum + fold.delta.wins, 0),
            totalProfitDeltaK: folds.reduce((sum, fold) => sum + fold.delta.profitK, 0)
        };
    }).sort((left, right) =>
        right.minimumWinDelta - left.minimumWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || right.totalProfitDeltaK - left.totalProfitDeltaK
        || left.config.survivalWeight - right.config.survivalWeight
    );
    const selected = selection[0];
    const selectedConfig = {
        ...BASE_CONFIG,
        ...selected.config,
        survivalPriors
    };
    const finalModel = fitHierarchicalModel([...train2024, ...validation2025], BASE_CONFIG);
    const holdoutBaseline = evaluateBaseline(holdout2026);
    const holdoutCandidate = evaluate(holdout2026, finalModel, selectedConfig);
    const paired = pairedComparison(holdoutCandidate, holdoutBaseline);
    const holdoutDelta = delta(holdoutCandidate, holdoutBaseline);
    const statisticallyStrong = holdoutCandidate.wins > holdoutBaseline.wins &&
        holdoutCandidate.profitK > holdoutBaseline.profitK &&
        paired.exactMcNemarPValue < 0.05;
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            method: 'Hierarchical Beta-Binomial survival prior + posterior predictive Monte Carlo',
            evidence: 'Episode thật 2006-2023; daily replay 2024-2025; frozen holdout 2026.',
            simulationRole: 'Đo posterior uncertainty và predictive interval; không tạo thêm evidence.',
            leakageGuard: 'Mọi episode sau 31/12/2023 bị loại khỏi survival prior; 2026 không tham gia chọn cấu hình.',
            potentialGuard: 'Không áp survival prior active cho potential vì formation cần daily opportunity replay.'
        },
        economics: {
            betCount: 30,
            targetExcluded: 70,
            betPerNumberK: BET_PER_NUMBER_K,
            winMultiplier: WIN_MULTIPLIER,
            breakEvenHitRate: 30 / 84
        },
        coverage: {
            train2024: [train2024[0].date, train2024.at(-1).date, train2024.length],
            validation2025: [validation2025[0].date, validation2025.at(-1).date, validation2025.length],
            holdout2026: [holdout2026[0].date, holdout2026.at(-1).date, holdout2026.length]
        },
        survivalPrior: compactPrior(survivalPriors),
        selected,
        holdout: {
            baseline: compact(holdoutBaseline),
            candidate: compact(holdoutCandidate),
            delta: holdoutDelta,
            baselineHitRate95: wilsonInterval(holdoutBaseline.wins, holdoutBaseline.days),
            candidateHitRate95: wilsonInterval(holdoutCandidate.wins, holdoutCandidate.days),
            pairedComparison: paired,
            candidateMonths: summarizeMonths(holdoutCandidate.rows)
        },
        promotionDecision: statisticallyStrong
            ? 'eligible-for-further-independent-validation'
            : 'do-not-promote',
        conclusion: statisticallyStrong
            ? 'Tín hiệu vượt guardrail thống kê trên holdout, nhưng vẫn cần một giai đoạn live bất biến trước production.'
            : 'Chưa có bằng chứng đủ mạnh để thay production. Giữ phương pháp ở research-only và tiếp tục thu thập snapshot live bất biến.',
        topSelection: selection
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.resolve('reports', `research_historical_chain_survival_${stamp}.json`);
    const mdPath = path.resolve('reports', `historical-chain-survival-evaluation-${stamp}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));
    console.log(JSON.stringify({
        jsonPath,
        mdPath,
        survivalPrior: survivalPriors.metadata,
        selected: selected.config,
        folds: selected.folds,
        holdout: report.holdout,
        promotionDecision: report.promotionDecision
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    BASE_CONFIG,
    configs,
    evaluate,
    evaluateBaseline,
    pairedComparison,
    renderMarkdown
};
