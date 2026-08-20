#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    fitReliabilityModel,
    refinePrediction
} = require('../lib/research/chainReliabilityRanker');

const ECONOMICS = {
    betCount: 30,
    stakePerNumberK: 1000,
    winMultiplier: 84
};

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(value => {
        const [key, rawValue] = value.replace(/^--/, '').split('=');
        return [key, rawValue === undefined ? '1' : rawValue];
    }));
    return {
        train: args.get('train'),
        validation: args.get('validation'),
        holdout: args.get('holdout')
    };
}

function loadRows(file) {
    const report = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    return (report.rows || [])
        .filter(row =>
            Array.isArray(row.candidateDiagnostics) &&
            row.candidateDiagnostics.length > 0
        )
        .sort((left, right) => left.date.localeCompare(right.date));
}

function configurations() {
    const configs = [];
    const baseStrategyIds = [
        'chainSmallFirst',
        'chainBlockFirst',
        'numberSurvivalCredibleRisk'
    ];
    const priorStrengthSets = [
        [30, 45, 60],
        [40, 60, 90],
        [60, 90, 120]
    ];
    const familyWeightSets = [
        [1],
        [1, 0.5, 0.25],
        [1, 0.35, 0.15]
    ];
    for (const baseStrategyId of baseStrategyIds) {
        for (const priorStrengths of priorStrengthSets) {
            for (const familyWeights of familyWeightSets) {
                for (const conservativeZ of [0.67, 1]) {
                    for (const swapLimit of [1, 2, 3, 5]) {
                        configs.push({
                            id: [
                                'chain-number-score',
                                baseStrategyId,
                                `p${priorStrengths.join('-')}`,
                                `f${familyWeights.join('-')}`,
                                `z${conservativeZ}`,
                                `s${swapLimit}`
                            ].join('|'),
                            baseStrategyId,
                            priorStrengths,
                            familyWeights,
                            conservativeZ,
                            swapLimit,
                            minOpportunities: 8,
                            reliabilityDays: 40,
                            minEdge: 0,
                            minSwapMargin: 0
                        });
                    }
                }
            }
        }
    }
    return configs;
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
        currentType: '',
        currentLength: 0,
        totalSwaps: 0,
        rows: []
    };
}

function addResult(summary, row, prediction) {
    const betNumbers = prediction.betNumbers.map(Number);
    if (betNumbers.length !== ECONOMICS.betCount) {
        throw new Error(`${row.date}: dàn ${prediction.baseStrategyId} có ${betNumbers.length} số.`);
    }
    const win = betNumbers.includes(Number(row.actual));
    const stakeK = betNumbers.length * ECONOMICS.stakePerNumberK;
    const profitK = (win ? ECONOMICS.stakePerNumberK * ECONOMICS.winMultiplier : 0) - stakeK;
    const type = win ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(win);
    summary.stakeK += stakeK;
    summary.profitK += profitK;
    summary.totalSwaps += prediction.swaps.length;
    summary.currentLength = summary.currentType === type ? summary.currentLength + 1 : 1;
    summary.currentType = type;
    if (win) summary.longestWin = Math.max(summary.longestWin, summary.currentLength);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.currentLength);
    summary.rows.push({
        date: row.date,
        actual: Number(row.actual),
        win,
        profitK,
        betNumbers,
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

function evaluate(rows, model, config) {
    const summary = createSummary(config.id);
    for (const row of rows) addResult(summary, row, refinePrediction(row, model, config));
    return finalize(summary);
}

function baseline(rows, strategyId) {
    return evaluate(rows, new Map(), {
        id: strategyId,
        baseStrategyId: strategyId,
        swapLimit: 0
    });
}

function compact(result) {
    const { rows, ...summary } = result;
    return summary;
}

function monthly(rows) {
    const groups = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!groups.has(month)) groups.set(month, { month, days: 0, wins: 0, profitK: 0 });
        const group = groups.get(month);
        group.days++;
        group.wins += Number(row.win);
        group.profitK += row.profitK;
    }
    return [...groups.values()].map(group => ({
        ...group,
        hitRate: group.days ? group.wins / group.days : 0
    }));
}

function main() {
    const options = parseArgs();
    for (const key of ['train', 'validation', 'holdout']) {
        if (!options[key]) throw new Error(`Thiếu --${key}.`);
    }
    const trainRows = loadRows(options.train);
    const validationRows = loadRows(options.validation);
    const holdoutRows = loadRows(options.holdout);
    const modelsByPrior = new Map();
    const validation = configurations().map(config => {
        const priorKey = config.priorStrengths.join(',');
        if (!modelsByPrior.has(priorKey)) {
            modelsByPrior.set(
                priorKey,
                fitReliabilityModel(trainRows, { priorStrengths: config.priorStrengths })
            );
        }
        const base = baseline(validationRows, config.baseStrategyId);
        const candidate = evaluate(validationRows, modelsByPrior.get(priorKey), config);
        return {
            config,
            baseline: compact(base),
            candidate: compact(candidate),
            winDelta: candidate.wins - base.wins,
            profitDeltaK: candidate.profitK - base.profitK,
            lossStreakDelta: candidate.longestLoss - base.longestLoss
        };
    }).sort((left, right) =>
        right.winDelta - left.winDelta ||
        right.candidate.profitK - left.candidate.profitK ||
        left.candidate.longestLoss - right.candidate.longestLoss ||
        left.config.swapLimit - right.config.swapLimit ||
        left.config.id.localeCompare(right.config.id)
    );
    const selected = validation[0];
    const finalModel = fitReliabilityModel(
        [...trainRows, ...validationRows],
        { priorStrengths: selected.config.priorStrengths }
    );
    const holdoutBaseline = baseline(holdoutRows, selected.config.baseStrategyId);
    const holdoutCandidate = evaluate(holdoutRows, finalModel, selected.config);
    const promotionEligible =
        holdoutCandidate.profitK > holdoutBaseline.profitK &&
        holdoutCandidate.wins > holdoutBaseline.wins &&
        holdoutCandidate.profitK > 0 &&
        holdoutCandidate.longestLoss <= Math.ceil(holdoutBaseline.longestLoss * 1.2);
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        methodology: {
            train: 'Điểm độ tin cậy họ/dạng chuỗi học trên năm train.',
            validation: 'Dàn nền, prior, trọng số họ và số swap chọn trên năm validation.',
            holdout: 'Khóa toàn bộ cấu hình trước khi đánh giá holdout.',
            pointInTime: 'Mỗi row được tái sinh từ raw prefix D-1 và baseline chốt 31/12 năm trước.',
            scoring: 'Beta shrinkage theo state/family/pattern; khử trùng tập số; mỗi số chỉ cộng tín hiệu đa họ với trọng số giảm dần.'
        },
        economics: ECONOMICS,
        coverage: {
            trainDays: trainRows.length,
            validationDays: validationRows.length,
            holdoutDays: holdoutRows.length
        },
        selection: {
            configsTried: validation.length,
            selected,
            top10: validation.slice(0, 10)
        },
        holdout: {
            baseline: compact(holdoutBaseline),
            candidate: compact(holdoutCandidate),
            delta: {
                wins: holdoutCandidate.wins - holdoutBaseline.wins,
                hitRate: holdoutCandidate.hitRate - holdoutBaseline.hitRate,
                profitK: holdoutCandidate.profitK - holdoutBaseline.profitK,
                longestLoss: holdoutCandidate.longestLoss - holdoutBaseline.longestLoss
            },
            candidateMonthly: monthly(holdoutCandidate.rows)
        },
        decision: promotionEligible
            ? 'eligible-for-full-daily-independent-validation'
            : 'do-not-promote'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const output = path.resolve('reports', `research_chain_number_score_${stamp}.json`);
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({
        output,
        selected: report.selection.selected,
        holdout: report.holdout,
        decision: report.decision
    }, null, 2));
}

main();
