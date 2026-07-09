#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const FEATURE_NAMES = [
    'posteriorSafeRank',
    'blockBet',
    'smallBet',
    'consensusBet',
    'activeBet',
    'blockAndSmall',
    'posteriorAndBlock',
    'posteriorAndConsensus',
    'topRiskSafe',
    'meanRiskSafe',
    'weightedRiskSafe',
    'tier1Safe',
    'potentialRiskSafe',
    'activeRiskSafe',
    'frequencySafety',
    'setWidthSafety',
    'familyConcentrationSafe',
    'blockRiskSafe'
];

const FEATURE_SETS = {
    posteriorOnly: [0],
    expertSignals: [0, 1, 2, 3, 4, 5, 6, 7],
    chainEvidence: [0, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    fullPairwise: FEATURE_NAMES.map((_, index) => index)
};

const HYPERPARAMETERS = [
    { learningRate: 0.03, l2: 0.001, epochs: 12 },
    { learningRate: 0.06, l2: 0.001, epochs: 18 },
    { learningRate: 0.04, l2: 0.005, epochs: 20 },
    { learningRate: 0.08, l2: 0.01, epochs: 12 }
];

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        startDate: args.get('startDate') || '2023-01-01',
        trainingEnd: args.get('trainingEnd') || '2024-12-31',
        validationStart: args.get('validationStart') || '2025-01-01',
        validationEnd: args.get('validationEnd') || '2025-12-31',
        holdoutStart: args.get('holdoutStart') || '2026-01-01',
        endDate: args.get('endDate') || null,
        target: Number(args.get('target') || 70),
        historyYears: Number(args.get('historyYears') || 20),
        betPerNumberK: Number(args.get('betPerNumberK') || 1000),
        winMultiplier: Number(args.get('winMultiplier') || 84),
        minPotentialLen: Number(args.get('minPotentialLen') || 4)
    };
}

function parseDate(value) {
    return historicalExclusionService.parseDate(value);
}

function formatIsoDate(value) {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(value) {
    return historicalExclusionService.formatDate(value);
}

function flattenStats(allStats) {
    const rows = [];
    const add = (key, value) => {
        if (isInvalidStatsKey(key) || !value || !Array.isArray(value.streaks)) return;
        rows.push([key, value]);
    };
    for (const [key, value] of Object.entries(allStats || {})) {
        if (value && Array.isArray(value.streaks)) add(key, value);
        else if (value && typeof value === 'object') {
            for (const [subKey, subValue] of Object.entries(value)) {
                add(`${key}:${subKey}`, subValue);
            }
        }
    }
    return rows;
}

function familyForKey(key = '') {
    const normalized = String(key).toLowerCase();
    if (/block\d+x\d+sole/.test(normalized)) return 'block';
    if (/^bo_/.test(normalized)) return 'fixed-set';
    if (/^dau_.*dit_|^dit_.*dau_/.test(normalized)) return 'head-tail';
    if (/^dau_/.test(normalized)) return 'head';
    if (/^dit_/.test(normalized)) return 'tail';
    if (/^tong_/.test(normalized)) return 'sum';
    if (/^hieu_/.test(normalized)) return 'difference';
    if (/^(so_|dong_)/.test(normalized)) return 'number';
    if (/(chan|le|to|nho|nguyen_to|hop_so)/.test(normalized)) return 'class';
    return normalized.split(/[:_]/)[0] || 'other';
}

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function posteriorBreakRisk(candidate) {
    const trials = Math.max(0, Number(candidate.currentCount || 0));
    const continues = Math.min(trials, Math.max(0, Number(candidate.nextCount || 0)));
    const breaks = Math.max(0, trials - continues);
    let alpha = 1.5;
    let beta = 1.5;
    if (candidate.neverFormed) {
        alpha = 8;
        beta = 2;
    } else if (candidate.isRecordOrSuper) {
        alpha = 6;
        beta = 2;
    } else if (candidate.tier === 2) {
        alpha = 4;
        beta = 2.5;
    } else if (candidate.tier === 3) {
        alpha = 3;
        beta = 3;
    }
    return clamp((breaks + alpha) / Math.max(1, trials + alpha + beta));
}

function evidenceStrength(candidate) {
    const trials = Math.max(0, Number(candidate.currentCount || 0));
    const reliability = trials > 0
        ? Math.sqrt(trials / (trials + 12))
        : (candidate.neverFormed ? 0.48 : 0.12);
    const specificity = 1 / Math.sqrt(Math.max(1, candidate.numbers?.length || 100));
    const tierWeight = candidate.tier === 1 ? 1
        : candidate.tier === 2 ? 0.78
            : candidate.tier === 3 ? 0.54
                : 0.15;
    return posteriorBreakRisk(candidate) * (0.48 + reliability * 0.36) *
        (0.55 + specificity * 0.45) * tierWeight;
}

function buildNumberFeatures(candidates, target) {
    const strategies = {};
    for (const id of [
        'numberPosteriorDiversity',
        'chainBlockFirst',
        'chainSmallFirst',
        'numberConsensusRisk',
        'activeOnlyAvgRisk'
    ]) {
        const prediction = annualMilestoneService.buildPrediction(candidates, target, id);
        strategies[id] = {
            prediction,
            betSet: new Set((prediction.betNumbers || []).map(Number))
        };
    }
    const posteriorRanks = new Map(
        (strategies.numberPosteriorDiversity.prediction.ranking || []).map(row => [
            Number(row.number),
            Number(row.rank)
        ])
    );

    return ALL_NUMBERS.map(number => {
        const memberships = candidates.filter(item => item.tier <= 3 && item.numbers.includes(number));
        const deduplicated = new Map();
        for (const item of memberships) {
            const family = familyForKey(item.key);
            const signature = `${family}|${item.numbers.slice().sort((a, b) => a - b).join(',')}`;
            const risk = posteriorBreakRisk(item);
            const strength = evidenceStrength(item);
            const existing = deduplicated.get(signature);
            if (!existing || strength > existing.strength) {
                deduplicated.set(signature, { item, family, risk, strength });
            }
        }
        const strongestByFamily = new Map();
        for (const row of deduplicated.values()) {
            const existing = strongestByFamily.get(row.family);
            if (!existing || row.strength > existing.strength) strongestByFamily.set(row.family, row);
        }
        const rows = [...strongestByFamily.values()].sort((a, b) => b.strength - a.strength);
        const risks = rows.map(row => row.risk);
        const weightedRisk = rows.length
            ? rows.reduce((sum, row) => sum + row.risk * row.strength, 0) /
                Math.max(1e-9, rows.reduce((sum, row) => sum + row.strength, 0))
            : 0;
        const topRisk = risks.length ? Math.max(...risks) : 0;
        const meanRisk = risks.length ? risks.reduce((sum, value) => sum + value, 0) / risks.length : 0;
        const tier1Families = rows.filter(row => row.item.tier === 1).length;
        const potentialRows = rows.filter(row => row.item.isPotential);
        const activeRows = rows.filter(row => !row.item.isPotential);
        const potentialRisk = potentialRows.length ? Math.max(...potentialRows.map(row => row.risk)) : 0;
        const activeRisk = activeRows.length ? Math.max(...activeRows.map(row => row.risk)) : 0;
        const blockRows = rows.filter(row => row.family === 'block');
        const blockRisk = blockRows.length ? Math.max(...blockRows.map(row => row.risk)) : 0;
        const meanFrequency = rows.length
            ? rows.reduce((sum, row) => sum + Math.min(4, Number(row.item.exposureFrequencyPerYear || 0)), 0) / rows.length
            : 4;
        const meanWidth = rows.length
            ? rows.reduce((sum, row) => sum + Math.min(100, row.item.numbers?.length || 100), 0) / rows.length
            : 100;
        const posteriorSafeRank = ((posteriorRanks.get(number) || 1) - 1) / 99;
        const blockBet = Number(strategies.chainBlockFirst.betSet.has(number));
        const smallBet = Number(strategies.chainSmallFirst.betSet.has(number));
        const consensusBet = Number(strategies.numberConsensusRisk.betSet.has(number));
        const activeBet = Number(strategies.activeOnlyAvgRisk.betSet.has(number));

        return [
            posteriorSafeRank,
            blockBet,
            smallBet,
            consensusBet,
            activeBet,
            blockBet * smallBet,
            posteriorSafeRank * blockBet,
            posteriorSafeRank * consensusBet,
            1 - topRisk,
            1 - meanRisk,
            1 - weightedRisk,
            1 - Math.min(1, tier1Families / 3),
            1 - potentialRisk,
            1 - activeRisk,
            Math.min(1, meanFrequency / 2),
            Math.min(1, meanWidth / 30),
            1 / (1 + rows.length),
            1 - blockRisk
        ];
    });
}

function createSummary() {
    return {
        days: 0,
        wins: 0,
        losses: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        currentType: null,
        currentLength: 0,
        longestWin: 0,
        longestLoss: 0,
        rows: []
    };
}

function updateSummary(summary, date, betNumbers, actual, options) {
    const hit = betNumbers.includes(actual);
    const stakeK = betNumbers.length * options.betPerNumberK;
    const payoutK = hit ? options.betPerNumberK * options.winMultiplier : 0;
    const type = hit ? 'win' : 'loss';
    summary.days += 1;
    summary.wins += hit ? 1 : 0;
    summary.losses += hit ? 0 : 1;
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += payoutK - stakeK;
    if (summary.currentType === type) summary.currentLength += 1;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    if (hit) summary.longestWin = Math.max(summary.longestWin, summary.currentLength);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.currentLength);
    summary.rows.push({ date, actual, hit, betNumbers, profitK: payoutK - stakeK });
}

function finalizeSummary(summary) {
    return {
        days: summary.days,
        wins: summary.wins,
        losses: summary.losses,
        hitRate: summary.days ? summary.wins / summary.days : 0,
        stakeK: summary.stakeK,
        payoutK: summary.payoutK,
        profitK: summary.profitK,
        roi: summary.stakeK ? summary.profitK / summary.stakeK : 0,
        longestWin: summary.longestWin,
        longestLoss: summary.longestLoss
    };
}

function computeScaler(days, indices) {
    const means = indices.map(() => 0);
    const counts = days.length * 100;
    for (const day of days) {
        for (const row of day.features) {
            indices.forEach((featureIndex, index) => {
                means[index] += row[featureIndex];
            });
        }
    }
    means.forEach((_, index) => {
        means[index] /= Math.max(1, counts);
    });
    const stds = indices.map(() => 0);
    for (const day of days) {
        for (const row of day.features) {
            indices.forEach((featureIndex, index) => {
                stds[index] += (row[featureIndex] - means[index]) ** 2;
            });
        }
    }
    stds.forEach((_, index) => {
        stds[index] = Math.sqrt(stds[index] / Math.max(1, counts)) || 1;
    });
    return { means, stds };
}

function transformRow(row, indices, scaler) {
    return indices.map((featureIndex, index) => (row[featureIndex] - scaler.means[index]) / scaler.stds[index]);
}

function sigmoid(value) {
    if (value >= 0) {
        const z = Math.exp(-Math.min(40, value));
        return 1 / (1 + z);
    }
    const z = Math.exp(Math.max(-40, value));
    return z / (1 + z);
}

function trainPairwise(days, indices, hyperparameters) {
    const scaler = computeScaler(days, indices);
    const weights = indices.map(() => 0);
    let update = 0;
    for (let epoch = 0; epoch < hyperparameters.epochs; epoch++) {
        for (const day of days) {
            const actual = transformRow(day.features[day.actual], indices, scaler);
            const gradient = weights.map(() => 0);
            for (let number = 0; number < 100; number++) {
                if (number === day.actual) continue;
                const negative = transformRow(day.features[number], indices, scaler);
                const diff = actual.map((value, index) => value - negative[index]);
                const margin = weights.reduce((sum, weight, index) => sum + weight * diff[index], 0);
                const error = sigmoid(margin) - 1;
                gradient.forEach((_, index) => {
                    gradient[index] += error * diff[index] / 99;
                });
            }
            const learningRate = hyperparameters.learningRate / Math.sqrt(1 + update / 4000);
            weights.forEach((weight, index) => {
                weights[index] -= learningRate * (
                    gradient[index] + hyperparameters.l2 * weight
                );
            });
            update++;
        }
    }
    return { weights, scaler, indices };
}

function predict(model, features, betCount) {
    return features.map((row, number) => {
        const transformed = transformRow(row, model.indices, model.scaler);
        const score = model.weights.reduce((sum, weight, index) => sum + weight * transformed[index], 0);
        return { number, score };
    }).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.number - b.number;
    }).slice(0, betCount).map(row => row.number);
}

function evaluateModel(model, days, options) {
    const summary = createSummary();
    const betCount = 100 - options.target;
    for (const day of days) {
        updateSummary(summary, day.date, predict(model, day.features, betCount), day.actual, options);
    }
    return summary;
}

function evaluateBaseline(days, strategy, options) {
    const summary = createSummary();
    for (const day of days) {
        updateSummary(summary, day.date, day.baselines[strategy], day.actual, options);
    }
    return summary;
}

function selectConfiguration(trainingDays, validationDays, options) {
    const rows = [];
    for (const [featureSet, indices] of Object.entries(FEATURE_SETS)) {
        for (const hyperparameters of HYPERPARAMETERS) {
            const model = trainPairwise(trainingDays, indices, hyperparameters);
            const validation = evaluateModel(model, validationDays, options);
            const summary = finalizeSummary(validation);
            rows.push({ featureSet, indices, hyperparameters, model, summary });
        }
    }
    return rows.sort((a, b) => {
        if (b.summary.wins !== a.summary.wins) return b.summary.wins - a.summary.wins;
        if (a.summary.longestLoss !== b.summary.longestLoss) return a.summary.longestLoss - b.summary.longestLoss;
        return b.summary.profitK - a.summary.profitK;
    });
}

async function main() {
    const options = parseArgs();
    await lotteryService.loadAll();
    const rawData = lotteryService.getRawData()
        .filter(row => row?.date && row.special !== null && row.special !== undefined)
        .slice()
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));
    options.endDate ||= formatIsoDate(parseDate(rawData[rawData.length - 1].date));
    const entries = new Map(flattenStats(historicalExclusionService.loadAllStats()));
    const baselineByYear = new Map();
    const days = [];
    const eligible = rawData.filter(row => {
        const iso = formatIsoDate(parseDate(row.date));
        return iso >= options.startDate && iso <= options.endDate;
    });

    for (let index = 0; index < eligible.length; index++) {
        const row = eligible[index];
        const date = parseDate(row.date);
        const isoDate = formatIsoDate(date);
        const year = date.getFullYear();
        if (!baselineByYear.has(year)) {
            baselineByYear.set(year, annualMilestoneService.buildAnnualBaseline(entries, year, {
                historyYears: options.historyYears,
                writeBaseline: false
            }));
        }
        const candidates = annualMilestoneService.buildCandidatesForDate(
            formatDisplayDate(date),
            baselineByYear.get(year),
            {
                historyYears: options.historyYears,
                minPotentialCurrentLenForNeverFormed: options.minPotentialLen
            }
        );
        const features = buildNumberFeatures(candidates, options.target);
        const baselines = {};
        for (const strategy of ['chainBlockFirst', 'numberPosteriorDiversity']) {
            baselines[strategy] = annualMilestoneService
                .buildPrediction(candidates, options.target, strategy)
                .betNumbers.map(Number);
        }
        days.push({
            date: isoDate,
            actual: Number(row.special) % 100,
            features,
            baselines
        });
        if ((index + 1) % 50 === 0 || index === eligible.length - 1) {
            console.log(`[PairwiseRanker] Features ${index + 1}/${eligible.length}: ${isoDate}`);
        }
    }

    const trainingDays = days.filter(day => day.date <= options.trainingEnd);
    const validationDays = days.filter(day =>
        day.date >= options.validationStart && day.date <= options.validationEnd
    );
    const holdoutDays = days.filter(day => day.date >= options.holdoutStart);
    const configurations = selectConfiguration(trainingDays, validationDays, options);
    const selected = configurations[0];
    const refitDays = [...trainingDays, ...validationDays];
    const finalModel = trainPairwise(refitDays, selected.indices, selected.hyperparameters);
    const holdout = evaluateModel(finalModel, holdoutDays, options);
    const baselines = {
        chainBlockFirst: evaluateBaseline(holdoutDays, 'chainBlockFirst', options),
        numberPosteriorDiversity: evaluateBaseline(holdoutDays, 'numberPosteriorDiversity', options)
    };
    const selectedWeights = selected.indices.map((featureIndex, index) => ({
        feature: FEATURE_NAMES[featureIndex],
        weight: finalModel.weights[index]
    })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    const output = {
        generatedAt: new Date().toISOString(),
        options,
        dataSplit: {
            training: { start: options.startDate, end: options.trainingEnd, days: trainingDays.length },
            validation: { start: options.validationStart, end: options.validationEnd, days: validationDays.length },
            holdout: { start: options.holdoutStart, end: options.endDate, days: holdoutDays.length }
        },
        selected: {
            featureSet: selected.featureSet,
            hyperparameters: selected.hyperparameters,
            validation: finalizeSummary(selected.summary),
            weights: selectedWeights
        },
        holdout: {
            pairwiseSafeRanker: finalizeSummary(holdout),
            chainBlockFirst: finalizeSummary(baselines.chainBlockFirst),
            numberPosteriorDiversity: finalizeSummary(baselines.numberPosteriorDiversity)
        },
        validationCandidates: configurations.map(row => ({
            featureSet: row.featureSet,
            hyperparameters: row.hyperparameters,
            summary: row.summary
        })),
        holdoutRows: holdout.rows
    };
    console.log('\n=== Validation configurations ===');
    console.table(output.validationCandidates.map(row => ({
        featureSet: row.featureSet,
        learningRate: row.hyperparameters.learningRate,
        l2: row.hyperparameters.l2,
        epochs: row.hyperparameters.epochs,
        wins: row.summary.wins,
        hitRate: `${(row.summary.hitRate * 100).toFixed(2)}%`,
        profitK: row.summary.profitK,
        longestLoss: row.summary.longestLoss
    })));
    console.log('\n=== Frozen holdout 2026 ===');
    console.table(Object.entries(output.holdout).map(([id, row]) => ({
        id,
        days: row.days,
        wins: row.wins,
        hitRate: `${(row.hitRate * 100).toFixed(2)}%`,
        profitK: row.profitK,
        roi: `${(row.roi * 100).toFixed(2)}%`,
        longestLoss: row.longestLoss
    })));
    console.log('\n=== Selected weights ===');
    console.table(selectedWeights);

    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = path.join(outputDir, `research_pairwise_safe_ranker_${stamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[PairwiseRanker] JSON: ${outputPath}`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    FEATURE_NAMES,
    FEATURE_SETS,
    buildNumberFeatures,
    trainPairwise,
    predict
};
