#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    FEATURE_NAMES,
    refineBaseline,
    trainConditionalModel
} = require('../lib/research/conditionalNumberModel');
const {
    exactMcNemarPValue,
    loadRows,
    wilsonInterval
} = require('./research-hierarchical-chain-calibration');

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

function modelConfigs() {
    const rows = [];
    for (const l2 of [0.001, 0.01, 0.1]) {
        for (const learningRate of [0.01, 0.03]) {
            for (const epochs of [60, 120]) {
                rows.push({
                    id: `softmax-l2${l2}-lr${learningRate}-e${epochs}`,
                    l2,
                    learningRate,
                    epochs
                });
            }
        }
    }
    return rows;
}

function configs() {
    return modelConfigs().flatMap(model => [0, 1, 2, 4].map(swapLimit => ({
        id: `${model.id}-s${swapLimit}`,
        model,
        swapLimit,
        minMargin: 0
    })));
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

function evaluate(rows, model, config) {
    const summary = createSummary(config.id);
    for (const row of rows) {
        const prediction = refineBaseline(row, model, config);
        addResult(summary, row, prediction.betNumbers, prediction.swaps);
    }
    return finalize(summary);
}

function evaluateBaseline(rows) {
    const summary = createSummary('chainSmallFirstHold70');
    for (const row of rows) {
        addResult(summary, row, row.strategies.chainSmallFirst.map(Number));
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
    const counts = { bothWin: 0, bothLoss: 0, candidateOnly: 0, baselineOnly: 0 };
    for (const row of candidate.rows) {
        const other = baselineByDate.get(row.date);
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
    for (const key of ['train2024', 'validation2025', 'holdout2026']) {
        if (!options[key]) throw new Error(`Thiếu --${key}.`);
    }
    const train2024 = loadRows(options.train2024);
    const validation2025 = loadRows(options.validation2025);
    const holdout2026 = loadRows(options.holdout2026);
    const split = Math.floor(train2024.length * 2 / 3);
    const early2024 = train2024.slice(0, split);
    const late2024 = train2024.slice(split);
    const modelCache = new Map();
    const modelFor = (label, rows, config) => {
        const key = `${label}|${config.id}`;
        if (!modelCache.has(key)) modelCache.set(key, trainConditionalModel(rows, config));
        return modelCache.get(key);
    };
    const selection = configs().map(config => {
        const folds = [
            { period: 'late-2024', train: early2024, test: late2024, label: 'early2024' },
            { period: '2025', train: train2024, test: validation2025, label: 'all2024' }
        ].map(fold => {
            const baseline = evaluateBaseline(fold.test);
            const candidate = evaluate(
                fold.test,
                modelFor(fold.label, fold.train, config.model),
                config
            );
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
            maximumLossDelta: Math.max(...folds.map(fold => fold.delta.longestLoss)),
            totalProfitDeltaK: folds.reduce((sum, fold) => sum + fold.delta.profitK, 0)
        };
    }).sort((left, right) =>
        right.minimumWinDelta - left.minimumWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || left.maximumLossDelta - right.maximumLossDelta
        || right.totalProfitDeltaK - left.totalProfitDeltaK
        || left.config.id.localeCompare(right.config.id)
    );
    const selected = selection[0];
    const finalModel = trainConditionalModel(
        [...train2024, ...validation2025],
        selected.config.model
    );
    const holdoutBaseline = evaluateBaseline(holdout2026);
    const holdoutCandidate = evaluate(holdout2026, finalModel, selected.config);
    const paired = pairedComparison(holdoutCandidate, holdoutBaseline);
    const coefficients = FEATURE_NAMES.map((feature, index) => ({
        feature,
        coefficient: finalModel.weights[index]
    })).sort((left, right) => Math.abs(right.coefficient) - Math.abs(left.coefficient));
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            status: 'research-only',
            model: 'Conditional multinomial softmax over 100 numbers per prediction day.',
            target: 'One observed result per day; no synthetic rows count as evidence.',
            features: 'PIT active/potential/Tier/set-width/family evidence plus chainSmall baseline membership.',
            guardrail: 'Model only makes bounded swaps around chainSmallFirst Hold70.',
            selection: 'Early 2024 -> late 2024 and all 2024 -> 2025; lock before 2026.'
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
        selection: {
            configsTried: configs().length,
            selected,
            top: selection.slice(0, 12)
        },
        finalModel: {
            options: finalModel.options,
            trainingDays: finalModel.trainingDays,
            finalLoss: finalModel.finalLoss,
            strongestCoefficients: coefficients.slice(0, 20)
        },
        holdout: {
            baseline: compact(holdoutBaseline),
            candidate: compact(holdoutCandidate),
            delta: delta(holdoutCandidate, holdoutBaseline),
            pairedComparison: paired,
            baselineHitRate95: wilsonInterval(holdoutBaseline.wins, holdoutBaseline.days),
            candidateHitRate95: wilsonInterval(holdoutCandidate.wins, holdoutCandidate.days),
            candidateMonths: summarizeMonths(holdoutCandidate.rows)
        },
        promotionDecision: holdoutCandidate.wins > holdoutBaseline.wins &&
            holdoutCandidate.profitK > holdoutBaseline.profitK &&
            paired.exactMcNemarPValue < 0.05
            ? 'eligible-for-further-independent-validation'
            : 'do-not-promote'
    };
    const output = path.resolve(
        'reports',
        `research_conditional_number_model_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report }, null, 2));
}

if (require.main === module) main();

module.exports = { configs, modelConfigs };
