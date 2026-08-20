#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    fitHierarchicalModel,
    refineBaselinePrediction
} = require('../lib/research/hierarchicalChainCalibrator');

const METHOD_ID = 'hierarchicalChainCalibrationHold70';
const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;

function parseArgs(argv = process.argv.slice(2)) {
    const values = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        train2024: values.get('train2024'),
        validation2025: values.get('validation2025'),
        holdout2026: values.get('holdout2026')
    };
}

function loadRows(filenames) {
    const byDate = new Map();
    for (const filename of String(filenames).split(',').map(value => value.trim()).filter(Boolean)) {
        const absolute = path.resolve(filename);
        const payload = JSON.parse(fs.readFileSync(absolute, 'utf8'));
        for (const row of payload.rows || []) {
            if (!Array.isArray(row.numberEvidence) || row.numberEvidence.length !== 100) {
                throw new Error(`${absolute} thiếu numberEvidence 00..99 tại ${row.date}.`);
            }
            if (!row.numberEvidence.some(evidence => evidence.groupDetails)) {
                throw new Error(`${absolute} thiếu groupDetails tại ${row.date}.`);
            }
            byDate.set(row.date, row);
        }
    }
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function configs() {
    const rows = [{
        id: 'baseline-no-swap',
        priorStrengths: [30, 45, 60],
        minDays: 30,
        minConfidence: 0.8,
        reliabilityDays: 60,
        topFamilies: 1,
        swapLimit: 0,
        minMargin: 0
    }];
    for (const prior of [30, 90]) {
        for (const minDays of [30, 60]) {
            for (const minConfidence of [0.8, 0.9]) {
                for (const topFamilies of [1, 2]) {
                    for (const swapLimit of [1, 2, 4]) {
                        for (const minMargin of [0, 0.003]) {
                            rows.push({
                                id: `h${prior}-d${minDays}-c${minConfidence}-f${topFamilies}` +
                                    `-s${swapLimit}-m${minMargin}`,
                                priorStrengths: [prior, prior * 1.5, prior * 2],
                                minDays,
                                minConfidence,
                                reliabilityDays: 60,
                                topFamilies,
                                swapLimit,
                                minMargin
                            });
                        }
                    }
                }
            }
        }
    }
    return rows;
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        profitK: 0,
        stakeK: 0,
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
    const payoutK = win ? BET_PER_NUMBER_K * WIN_MULTIPLIER : 0;
    const type = win ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(win);
    summary.stakeK += stakeK;
    summary.profitK += payoutK - stakeK;
    summary.totalSwaps += swaps.length;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, win ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, win ? 0 : summary.currentLength);
    summary.rows.push({
        date: row.date,
        actual: Number(row.actual),
        win,
        profitK: payoutK - stakeK,
        betNumbers,
        swaps
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

function evaluate(rows, model, config, id = METHOD_ID) {
    const summary = createSummary(id);
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

function wilsonInterval(successes, trials, z = 1.96) {
    if (!trials) return { lower: 0, upper: 0 };
    const rate = successes / trials;
    const denominator = 1 + (z * z) / trials;
    const center = (rate + (z * z) / (2 * trials)) / denominator;
    const margin = z * Math.sqrt(
        (rate * (1 - rate) / trials) + (z * z) / (4 * trials * trials)
    ) / denominator;
    return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function binomialCoefficient(n, k) {
    const selected = Math.min(k, n - k);
    let value = 1;
    for (let index = 1; index <= selected; index++) {
        value *= (n - selected + index) / index;
    }
    return value;
}

function exactMcNemarPValue(candidateOnly, baselineOnly) {
    const discordant = candidateOnly + baselineOnly;
    if (!discordant) return 1;
    const tail = Math.min(candidateOnly, baselineOnly);
    let probability = 0;
    for (let index = 0; index <= tail; index++) {
        probability += binomialCoefficient(discordant, index) * (0.5 ** discordant);
    }
    return Math.min(1, probability * 2);
}

function pairedComparison(candidate, baseline) {
    const baselineByDate = new Map(baseline.rows.map(row => [row.date, row]));
    const counts = {
        bothWin: 0,
        bothLoss: 0,
        candidateOnly: 0,
        baselineOnly: 0
    };
    for (const row of candidate.rows) {
        const baselineRow = baselineByDate.get(row.date);
        if (!baselineRow) continue;
        if (row.win && baselineRow.win) counts.bothWin++;
        else if (!row.win && !baselineRow.win) counts.bothLoss++;
        else if (row.win) counts.candidateOnly++;
        else counts.baselineOnly++;
    }
    return {
        ...counts,
        netAdditionalWins: counts.candidateOnly - counts.baselineOnly,
        exactMcNemarPValue: exactMcNemarPValue(counts.candidateOnly, counts.baselineOnly),
        interpretation: 'p < 0,05 mới là bằng chứng mạnh rằng hoán đổi tốt hơn nền, không chỉ do dao động mẫu.'
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
    const split = Math.floor(train2024.length * 2 / 3);
    const early2024 = train2024.slice(0, split);
    const late2024 = train2024.slice(split);
    const modelCache = new Map();
    const modelFor = (label, rows, config) => {
        const key = `${label}|${config.priorStrengths.join(',')}`;
        if (!modelCache.has(key)) {
            modelCache.set(key, fitHierarchicalModel(rows, config));
        }
        return modelCache.get(key);
    };
    const selection = configs().map(config => {
        const folds = [
            {
                period: 'late-2024',
                rows: late2024,
                model: modelFor('early-2024', early2024, config)
            },
            {
                period: '2025',
                rows: validation2025,
                model: modelFor('all-2024', train2024, config)
            }
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
            config,
            folds,
            minimumWinDelta: Math.min(...folds.map(fold => fold.delta.wins)),
            totalWinDelta: folds.reduce((sum, fold) => sum + fold.delta.wins, 0),
            totalProfitDeltaK: folds.reduce((sum, fold) => sum + fold.delta.profitK, 0),
            maximumLossDelta: Math.max(...folds.map(fold => fold.delta.longestLoss))
        };
    }).sort((left, right) =>
        right.minimumWinDelta - left.minimumWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || left.maximumLossDelta - right.maximumLossDelta
        || right.totalProfitDeltaK - left.totalProfitDeltaK
        || left.config.id.localeCompare(right.config.id)
    );
    const selected = selection[0];
    const finalModel = fitHierarchicalModel(
        [...train2024, ...validation2025],
        selected.config
    );
    const holdoutCandidate = evaluate(holdout2026, finalModel, selected.config);
    const holdoutBaseline = evaluateBaseline(holdout2026);
    const paired = pairedComparison(holdoutCandidate, holdoutBaseline);
    const signals = [...finalModel.values()]
        .filter(row =>
            row.days >= selected.config.minDays
            && row.exclusionEdge > 0
            && row.probabilityBelowBaseline >= selected.config.minConfidence
        )
        .sort((left, right) =>
            right.probabilityBelowBaseline - left.probabilityBelowBaseline
            || right.exclusionEdge - left.exclusionEdge
        )
        .slice(0, 80);
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            strategyId: METHOD_ID,
            status: 'research-only',
            pointInTime: 'Evidence từng ngày được sinh từ raw prefix kết thúc trước ngày dự đoán.',
            dailyReplay: 'Cơ hội active và potential được đo trực tiếp theo membership mỗi ngày; không suy diễn potential từ cumulative streak.',
            hierarchy: 'Beta-Binomial empirical Bayes: trạng thái/độ rộng -> họ -> pattern.',
            correlationControl: 'Mỗi scope chỉ có một quan sát/ ngày; mỗi họ chỉ đóng góp tín hiệu mạnh nhất cho một số.',
            selection: 'Đầu 2024 -> cuối 2024 và 2024 -> 2025; khóa cấu hình trước holdout 2026.',
            guardrail: 'Chỉ hoán đổi có giới hạn quanh chainSmallFirst; không thay production nếu holdout không cải thiện.'
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
        selected,
        holdout: {
            baseline: compact(holdoutBaseline),
            candidate: compact(holdoutCandidate),
            delta: delta(holdoutCandidate, holdoutBaseline),
            baselineHitRate95: wilsonInterval(holdoutBaseline.wins, holdoutBaseline.days),
            candidateHitRate95: wilsonInterval(holdoutCandidate.wins, holdoutCandidate.days),
            pairedComparison: paired,
            baselineMonths: summarizeMonths(holdoutBaseline.rows),
            candidateMonths: summarizeMonths(holdoutCandidate.rows)
        },
        promotionDecision: holdoutCandidate.wins > holdoutBaseline.wins
            && holdoutCandidate.profitK > holdoutBaseline.profitK
            && paired.exactMcNemarPValue < 0.05
            ? 'eligible-for-further-independent-validation'
            : 'do-not-promote',
        topSelection: selection.slice(0, 20),
        strongestLearnedSignals: signals
    };
    const output = path.resolve(
        'reports',
        `research_hierarchical_chain_calibration_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        output,
        selected: selected.config,
        selectionFolds: selected.folds,
        holdout: report.holdout,
        promotionDecision: report.promotionDecision
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    configs,
    delta,
    evaluate,
    evaluateBaseline,
    exactMcNemarPValue,
    loadRows,
    pairedComparison,
    wilsonInterval
};
