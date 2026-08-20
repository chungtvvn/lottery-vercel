#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    fitHierarchicalModel,
    scoreNumbers: scoreHierarchicalNumbers
} = require('../lib/research/hierarchicalChainCalibrator');
const {
    scoreRow: scoreConditionalRow,
    trainConditionalModel
} = require('../lib/research/conditionalNumberModel');
const { refineCombinedPrediction } = require('../lib/research/combinedChainCalibrator');
const {
    exactMcNemarPValue,
    loadRows,
    wilsonInterval
} = require('./research-hierarchical-chain-calibration');

const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;
const HIERARCHICAL_CONFIG = {
    priorStrengths: [30, 45, 60],
    minDays: 60,
    minConfidence: 0.8,
    reliabilityDays: 60,
    topFamilies: 1
};
const CONDITIONAL_CONFIG = {
    l2: 0.001,
    learningRate: 0.03,
    epochs: 60
};

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

function configs() {
    return [0, 0.15, 0.3, 0.5, 0.7].flatMap(conditionalWeight =>
        [2, 4].map(swapLimit => ({
            id: `hier-softmax-w${conditionalWeight}-s${swapLimit}`,
            stateWeight: conditionalWeight,
            gate: 'none',
            swapLimit,
            minMargin: 0
        }))
    );
}

function buildModels(rows) {
    return {
        hierarchical: fitHierarchicalModel(rows, HIERARCHICAL_CONFIG),
        conditional: trainConditionalModel(rows, CONDITIONAL_CONFIG)
    };
}

function conditionalRiskScores(row, model) {
    const scores = scoreConditionalRow(row, model);
    const maximum = Math.max(...scores.map(item => item.score));
    return scores.map(item => ({ number: item.number, score: maximum - item.score }));
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

function addResult(summary, row, prediction) {
    const win = prediction.betNumbers.includes(Number(row.actual));
    const stakeK = prediction.betNumbers.length * BET_PER_NUMBER_K;
    const profitK = (win ? BET_PER_NUMBER_K * WIN_MULTIPLIER : 0) - stakeK;
    const type = win ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(win);
    summary.stakeK += stakeK;
    summary.profitK += profitK;
    summary.totalSwaps += prediction.swaps.length;
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
        profitK,
        betNumbers: prediction.betNumbers,
        swaps: prediction.swaps
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

function evaluate(rows, models, config) {
    const summary = createSummary(config.id);
    for (const row of rows) {
        const hierarchicalScores = scoreHierarchicalNumbers(row, models.hierarchical, HIERARCHICAL_CONFIG);
        const conditionalScores = conditionalRiskScores(row, models.conditional);
        addResult(summary, row, refineCombinedPrediction(
            row.strategies.chainSmallFirst,
            hierarchicalScores,
            conditionalScores,
            config
        ));
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
    const rows2024 = loadRows(options.train2024);
    const rows2025 = loadRows(options.validation2025);
    const rows2026 = loadRows(options.holdout2026);
    const split = Math.floor(rows2024.length * 2 / 3);
    const early2024 = rows2024.slice(0, split);
    const late2024 = rows2024.slice(split);
    const folds = [
        { period: 'late-2024', train: early2024, test: late2024 },
        { period: '2025', train: rows2024, test: rows2025 }
    ].map(fold => ({ ...fold, models: buildModels(fold.train) }));
    const hierarchicalOnly = {
        id: 'hierarchical-only',
        stateWeight: 0,
        gate: 'none',
        swapLimit: 2,
        minMargin: 0
    };
    const selection = configs().map(config => {
        const results = folds.map(fold => {
            const baseline = evaluate(fold.test, fold.models, hierarchicalOnly);
            const candidate = evaluate(fold.test, fold.models, config);
            return {
                period: fold.period,
                hierarchical: compact(baseline),
                candidate: compact(candidate),
                delta: delta(candidate, baseline)
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
    const finalModels = buildModels([...rows2024, ...rows2025]);
    const holdoutHierarchical = evaluate(rows2026, finalModels, hierarchicalOnly);
    const holdoutCandidate = evaluate(rows2026, finalModels, selected.config);
    const paired = pairedComparison(holdoutCandidate, holdoutHierarchical);
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            status: 'research-only',
            primary: 'Hierarchical daily Bayes exclusion score.',
            secondary: 'Conditional softmax probability transformed into exclusion risk.',
            selection: 'Weight and swap limit selected on late-2024 and 2025; frozen before 2026.',
            pointInTime: 'All row evidence comes from a raw prefix ending before prediction date.'
        },
        coverage: {
            rows2024: rows2024.length,
            rows2025: rows2025.length,
            rows2026: rows2026.length
        },
        economics: {
            betCount: 30,
            targetExcluded: 70,
            betPerNumberK: BET_PER_NUMBER_K,
            winMultiplier: WIN_MULTIPLIER
        },
        selection: {
            configsTried: configs().length,
            selected,
            top: selection
        },
        holdout: {
            hierarchical: compact(holdoutHierarchical),
            candidate: compact(holdoutCandidate),
            delta: delta(holdoutCandidate, holdoutHierarchical),
            pairedComparison: paired,
            hierarchicalHitRate95: wilsonInterval(holdoutHierarchical.wins, holdoutHierarchical.days),
            candidateHitRate95: wilsonInterval(holdoutCandidate.wins, holdoutCandidate.days),
            candidateMonths: summarizeMonths(holdoutCandidate.rows)
        },
        promotionDecision: holdoutCandidate.wins > holdoutHierarchical.wins &&
            holdoutCandidate.profitK > holdoutHierarchical.profitK &&
            paired.exactMcNemarPValue < 0.05
            ? 'eligible-for-further-independent-validation'
            : 'do-not-promote'
    };
    const output = path.resolve(
        'reports',
        `research_conditional_hierarchical_ensemble_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report }, null, 2));
}

if (require.main === module) main();
