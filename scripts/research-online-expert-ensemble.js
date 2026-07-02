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
const DEFAULT_EXPERT_SETS = {
    core: ['numberPosteriorDiversity', 'chainSmallFirst', 'chainBlockFirst'],
    broad: [
        'numberPosteriorDiversity',
        'chainSmallFirst',
        'chainBlockFirst',
        'numberConsensusRisk'
    ],
    active: [
        'numberPosteriorDiversity',
        'chainSmallFirst',
        'numberConsensusRisk',
        'activeOnlyAvgRisk'
    ],
    posteriorSmall: ['numberPosteriorDiversity', 'chainSmallFirst'],
    posteriorBlock: ['numberPosteriorDiversity', 'chainBlockFirst']
};

const DEFAULT_CONFIGS = [
    { id: 'coreSlow', expertSet: 'core', priorStrength: 120, decay: 1, temperature: 7 },
    { id: 'coreMedium', expertSet: 'core', priorStrength: 60, decay: 0.997, temperature: 7 },
    { id: 'coreFast', expertSet: 'core', priorStrength: 30, decay: 0.99, temperature: 7 },
    { id: 'broadSlow', expertSet: 'broad', priorStrength: 120, decay: 1, temperature: 7 },
    { id: 'broadMedium', expertSet: 'broad', priorStrength: 60, decay: 0.997, temperature: 7 },
    { id: 'activeMedium', expertSet: 'active', priorStrength: 60, decay: 0.997, temperature: 7 },
    { id: 'posteriorSmall', expertSet: 'posteriorSmall', priorStrength: 60, decay: 0.997, temperature: 7 },
    { id: 'posteriorBlock', expertSet: 'posteriorBlock', priorStrength: 60, decay: 0.997, temperature: 7 }
];

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        startDate: args.get('startDate') || '2023-01-01',
        trainingEnd: args.get('trainingEnd') || '2025-12-31',
        holdoutStart: args.get('holdoutStart') || '2026-01-01',
        endDate: args.get('endDate') || '2026-07-01',
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

function formatDisplayDate(value) {
    return historicalExclusionService.formatDate(value);
}

function formatIsoDate(value) {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function flattenStats(allStats) {
    const rows = [];
    const add = (key, value) => {
        if (isInvalidStatsKey(key)) return;
        if (!value || !Array.isArray(value.streaks)) return;
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

function buildStatsIndex() {
    return new Map(flattenStats(historicalExclusionService.loadAllStats()));
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
        longestLoss: 0
    };
}

function updateSummary(summary, hit, betCount, options) {
    const stakeK = betCount * options.betPerNumberK;
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

function createExpertState(config, expertSets = DEFAULT_EXPERT_SETS) {
    const experts = expertSets[config.expertSet];
    const priorMean = 0.5;
    return {
        experts,
        stats: new Map(experts.map(id => [id, {
            alpha: priorMean * config.priorStrength,
            beta: (1 - priorMean) * config.priorStrength
        }]))
    };
}

function getExpertWeight(stat, config) {
    const probability = stat.alpha / Math.max(1e-9, stat.alpha + stat.beta);
    return Math.exp(config.temperature * (probability - 0.5));
}

function buildOnlinePrediction(config, state, expertPredictions, target) {
    const posterior = expertPredictions.numberPosteriorDiversity;
    const posteriorSafeRank = new Map(
        (posterior?.ranking || []).map(row => [
            Number(row.number),
            (Math.max(1, Number(row.rank || 1)) - 1) / 99
        ])
    );
    const rows = ALL_NUMBERS.map(number => {
        let score = (posteriorSafeRank.get(number) || 0) * 0.08;
        let votes = 0;
        for (const expert of state.experts) {
            const prediction = expertPredictions[expert];
            const betSet = prediction?._betSet || new Set();
            if (!betSet.has(number)) continue;
            score += getExpertWeight(state.stats.get(expert), config);
            votes += 1;
        }
        return { number, score, votes };
    }).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.votes !== a.votes) return b.votes - a.votes;
        return a.number - b.number;
    });
    return rows.slice(0, 100 - target).map(row => row.number);
}

function updateExpertState(config, state, expertPredictions, actual) {
    for (const expert of state.experts) {
        const stat = state.stats.get(expert);
        const priorAlpha = config.priorStrength * 0.5;
        const priorBeta = config.priorStrength * 0.5;
        stat.alpha = priorAlpha + (stat.alpha - priorAlpha) * config.decay;
        stat.beta = priorBeta + (stat.beta - priorBeta) * config.decay;
        if (expertPredictions[expert]?._betSet?.has(actual)) stat.alpha += 1;
        else stat.beta += 1;
    }
}

function robustTrainingScore(yearSummaries) {
    const rows = Object.values(yearSummaries).map(finalizeSummary).filter(row => row.days > 0);
    if (!rows.length) return -Infinity;
    const rates = rows.map(row => row.hitRate);
    const mean = rates.reduce((sum, value) => sum + value, 0) / rates.length;
    const variance = rates.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / rates.length;
    const worstRate = Math.min(...rates);
    const longestLoss = Math.max(...rows.map(row => row.longestLoss));
    return mean * 0.55 + worstRate * 0.35 - Math.sqrt(variance) * 0.1 - Math.max(0, longestLoss - 7) * 0.002;
}

async function main() {
    const options = parseArgs();
    await lotteryService.loadAll();
    const rawData = lotteryService.getRawData()
        .filter(row => row?.date && row.special !== null && row.special !== undefined)
        .slice()
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const entries = buildStatsIndex();
    const baselineByYear = new Map();
    const expertIds = [...new Set(Object.values(DEFAULT_EXPERT_SETS).flat())];
    const configStates = new Map(DEFAULT_CONFIGS.map(config => [
        config.id,
        {
            config,
            expertState: createExpertState(config),
            training: createSummary(),
            trainingByYear: {},
            holdout: createSummary()
        }
    ]));
    const baselines = {
        numberPosteriorDiversity: { training: createSummary(), holdout: createSummary() },
        chainBlockFirst: { training: createSummary(), holdout: createSummary() }
    };
    let selectedConfigId = null;

    for (const row of rawData) {
        const date = parseDate(row.date);
        const isoDate = formatIsoDate(date);
        if (!date || isoDate < options.startDate || isoDate > options.endDate) continue;
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
        const expertPredictions = {};
        for (const expertId of expertIds) {
            const prediction = annualMilestoneService.buildPrediction(
                candidates,
                options.target,
                expertId
            );
            prediction._betSet = new Set((prediction.betNumbers || []).map(Number));
            expertPredictions[expertId] = prediction;
        }
        const actual = Number(row.special) % 100;
        const phase = isoDate <= options.trainingEnd
            ? 'training'
            : (isoDate >= options.holdoutStart ? 'holdout' : 'gap');

        if (phase === 'holdout' && !selectedConfigId) {
            selectedConfigId = [...configStates.values()]
                .map(item => ({
                    id: item.config.id,
                    score: robustTrainingScore(item.trainingByYear),
                    profitK: item.training.profitK,
                    longestLoss: item.training.longestLoss
                }))
                .sort((a, b) => {
                    if (b.score !== a.score) return b.score - a.score;
                    if (b.profitK !== a.profitK) return b.profitK - a.profitK;
                    return a.longestLoss - b.longestLoss;
                })[0]?.id || null;
            console.log(`[OnlineEnsemble] Khóa cấu hình trước holdout: ${selectedConfigId}`);
        }

        for (const item of configStates.values()) {
            const betNumbers = buildOnlinePrediction(
                item.config,
                item.expertState,
                expertPredictions,
                options.target
            );
            const hit = betNumbers.includes(actual);
            if (phase === 'training') {
                updateSummary(item.training, hit, betNumbers.length, options);
                item.trainingByYear[year] ||= createSummary();
                updateSummary(item.trainingByYear[year], hit, betNumbers.length, options);
            } else if (phase === 'holdout' && item.config.id === selectedConfigId) {
                updateSummary(item.holdout, hit, betNumbers.length, options);
            }
            updateExpertState(item.config, item.expertState, expertPredictions, actual);
        }

        for (const strategy of Object.keys(baselines)) {
            const prediction = expertPredictions[strategy];
            const hit = prediction._betSet.has(actual);
            if (phase === 'training') {
                updateSummary(baselines[strategy].training, hit, prediction._betSet.size, options);
            } else if (phase === 'holdout') {
                updateSummary(baselines[strategy].holdout, hit, prediction._betSet.size, options);
            }
        }
    }

    const training = [...configStates.values()].map(item => ({
        id: item.config.id,
        expertSet: item.config.expertSet,
        priorStrength: item.config.priorStrength,
        decay: item.config.decay,
        temperature: item.config.temperature,
        robustScore: robustTrainingScore(item.trainingByYear),
        ...finalizeSummary(item.training),
        years: Object.fromEntries(
            Object.entries(item.trainingByYear).map(([year, summary]) => [year, finalizeSummary(summary)])
        )
    })).sort((a, b) => b.robustScore - a.robustScore);
    const selected = configStates.get(selectedConfigId);
    const output = {
        generatedAt: new Date().toISOString(),
        options,
        selectedConfigId,
        training,
        holdout: {
            selected: selected ? finalizeSummary(selected.holdout) : null,
            baselines: Object.fromEntries(
                Object.entries(baselines).map(([id, value]) => [id, finalizeSummary(value.holdout)])
            )
        },
        trainingBaselines: Object.fromEntries(
            Object.entries(baselines).map(([id, value]) => [id, finalizeSummary(value.training)])
        )
    };
    console.table(training.map(row => ({
        id: row.id,
        set: row.expertSet,
        hitRate: `${(row.hitRate * 100).toFixed(2)}%`,
        profitK: row.profitK,
        roi: `${(row.roi * 100).toFixed(2)}%`,
        longestLoss: row.longestLoss,
        robustScore: row.robustScore.toFixed(4)
    })));
    console.log('\n=== Holdout ===');
    console.table([
        { id: selectedConfigId, ...output.holdout.selected },
        ...Object.entries(output.holdout.baselines).map(([id, row]) => ({ id, ...row }))
    ].map(row => ({
        id: row.id,
        days: row.days,
        hitRate: `${(row.hitRate * 100).toFixed(2)}%`,
        profitK: row.profitK,
        roi: `${(row.roi * 100).toFixed(2)}%`,
        longestLoss: row.longestLoss
    })));
    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = path.join(outputDir, `research_online_expert_ensemble_${stamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[OnlineEnsemble] JSON: ${outputPath}`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    buildOnlinePrediction,
    createExpertState,
    getExpertWeight,
    robustTrainingScore,
    updateExpertState
};
