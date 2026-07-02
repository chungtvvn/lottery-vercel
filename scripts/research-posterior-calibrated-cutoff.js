#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');

const CALIBRATIONS = [
    ...[0.5, 1, 2, 4, 8, 12, 16].flatMap(lambda =>
        [0, 0.25, 0.5, 0.75].map(uniformMix => ({ lambda, uniformMix }))
    )
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
        historyYears: Number(args.get('historyYears') || 20),
        minBetCount: Number(args.get('minBetCount') || 15),
        maxBetCount: Number(args.get('maxBetCount') || 50),
        baselineTarget: Number(args.get('baselineTarget') || 70),
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
        if (value && Array.isArray(value.streaks)) rows.push([key, value]);
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

function createSummary() {
    return {
        days: 0,
        wins: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        currentLoss: 0,
        longestLoss: 0,
        betCountTotal: 0,
        betCountMin: Infinity,
        betCountMax: 0
    };
}

function updateSummary(summary, hit, betCount, options) {
    const stakeK = betCount * options.betPerNumberK;
    const payoutK = hit ? options.betPerNumberK * options.winMultiplier : 0;
    summary.days += 1;
    summary.wins += hit ? 1 : 0;
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += payoutK - stakeK;
    summary.betCountTotal += betCount;
    summary.betCountMin = Math.min(summary.betCountMin, betCount);
    summary.betCountMax = Math.max(summary.betCountMax, betCount);
    if (hit) summary.currentLoss = 0;
    else {
        summary.currentLoss += 1;
        summary.longestLoss = Math.max(summary.longestLoss, summary.currentLoss);
    }
}

function finalizeSummary(summary) {
    return {
        days: summary.days,
        wins: summary.wins,
        losses: summary.days - summary.wins,
        hitRate: summary.days ? summary.wins / summary.days : 0,
        stakeK: summary.stakeK,
        payoutK: summary.payoutK,
        profitK: summary.profitK,
        roi: summary.stakeK ? summary.profitK / summary.stakeK : 0,
        longestLoss: summary.longestLoss,
        avgBetCount: summary.days ? summary.betCountTotal / summary.days : 0,
        minBetCount: Number.isFinite(summary.betCountMin) ? summary.betCountMin : 0,
        maxBetCount: summary.betCountMax
    };
}

function calibratedProbabilities(ranking, calibration) {
    const scores = ranking.map(row => Number(row.score || 0));
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = Math.max(1e-9, max - min);
    const raw = scores.map(score =>
        Math.exp(-calibration.lambda * ((score - min) / range))
    );
    const total = raw.reduce((sum, value) => sum + value, 0);
    return raw.map(value =>
        (1 - calibration.uniformMix) * (value / total) +
        calibration.uniformMix / ranking.length
    );
}

function negativeLogLikelihood(day, calibration) {
    const probabilities = calibratedProbabilities(day.ranking, calibration);
    const actualIndex = day.ranking.findIndex(row => Number(row.number) === day.actual);
    return -Math.log(Math.max(1e-12, probabilities[actualIndex] || 0));
}

function buildDynamicPrediction(day, calibration, options) {
    const probabilities = calibratedProbabilities(day.ranking, calibration);
    const rows = day.ranking.map((row, index) => ({
        number: Number(row.number),
        score: Number(row.score || 0),
        probability: probabilities[index]
    })).sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        return a.number - b.number;
    });
    let cumulativeProbability = 0;
    let best = null;
    for (let count = 1; count <= rows.length; count++) {
        cumulativeProbability += rows[count - 1].probability;
        if (count < options.minBetCount || count > options.maxBetCount) continue;
        const expectedProfitUnits = options.winMultiplier * cumulativeProbability - count;
        if (!best || expectedProfitUnits > best.expectedProfitUnits) {
            best = { count, expectedProfitUnits };
        }
    }
    return {
        betNumbers: rows.slice(0, best.count).map(row => row.number),
        betCount: best.count,
        expectedProfitUnits: best.expectedProfitUnits
    };
}

async function main() {
    const options = parseArgs();
    await lotteryService.loadAll();
    const rawData = lotteryService.getRawData()
        .filter(row => row?.date && row.special !== null && row.special !== undefined)
        .slice()
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const entries = new Map(flattenStats(historicalExclusionService.loadAllStats()));
    const baselineByYear = new Map();
    const calibrationStates = CALIBRATIONS.map(calibration => ({
        calibration,
        nllTotal: 0,
        trainingDays: 0,
        training: createSummary()
    }));
    const dynamicHoldout = createSummary();
    const baselineTraining = createSummary();
    const baselineHoldout = createSummary();
    let selectedState = null;

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
        const ranking = annualMilestoneService.rankNumbersByPosteriorDiversity(candidates);
        const day = {
            date: isoDate,
            actual: Number(row.special) % 100,
            ranking: ranking.map(item => ({
                number: String(item.num).padStart(2, '0'),
                score: item.score
            }))
        };
        const baselineBetNumbers = day.ranking
            .slice(options.baselineTarget)
            .map(item => Number(item.number));
        if (isoDate <= options.trainingEnd) {
            for (const state of calibrationStates) {
                state.nllTotal += negativeLogLikelihood(day, state.calibration);
                state.trainingDays += 1;
                const dynamic = buildDynamicPrediction(day, state.calibration, options);
                updateSummary(
                    state.training,
                    dynamic.betNumbers.includes(day.actual),
                    dynamic.betCount,
                    options
                );
            }
            updateSummary(
                baselineTraining,
                baselineBetNumbers.includes(day.actual),
                baselineBetNumbers.length,
                options
            );
        } else if (isoDate >= options.holdoutStart) {
            if (!selectedState) {
                selectedState = calibrationStates.slice().sort((a, b) =>
                    (a.nllTotal / Math.max(1, a.trainingDays)) -
                    (b.nllTotal / Math.max(1, b.trainingDays))
                )[0];
                console.log('[CalibratedCutoff] Khóa calibration trước holdout:', {
                    ...selectedState.calibration,
                    nll: selectedState.nllTotal / Math.max(1, selectedState.trainingDays)
                });
            }
            const dynamic = buildDynamicPrediction(day, selectedState.calibration, options);
            updateSummary(
                dynamicHoldout,
                dynamic.betNumbers.includes(day.actual),
                dynamic.betCount,
                options
            );
            updateSummary(
                baselineHoldout,
                baselineBetNumbers.includes(day.actual),
                baselineBetNumbers.length,
                options
            );
        }
    }

    const calibrationRows = calibrationStates.map(state => ({
        ...state.calibration,
        nll: state.nllTotal / Math.max(1, state.trainingDays),
        training: finalizeSummary(state.training)
    })).sort((a, b) => a.nll - b.nll);
    const selected = calibrationRows[0];
    const output = {
        generatedAt: new Date().toISOString(),
        options,
        selectedCalibration: selected,
        calibrationLeaderboard: calibrationRows.slice(0, 12),
        training: {
            dynamic: selected.training,
            baseline: finalizeSummary(baselineTraining)
        },
        holdout: {
            dynamic: finalizeSummary(dynamicHoldout),
            baseline: finalizeSummary(baselineHoldout)
        }
    };
    console.log('Selected calibration:', selected);
    console.table([
        { phase: 'training-dynamic', ...output.training.dynamic },
        { phase: 'training-baseline', ...output.training.baseline },
        { phase: 'holdout-dynamic', ...output.holdout.dynamic },
        { phase: 'holdout-baseline', ...output.holdout.baseline }
    ].map(row => ({
        phase: row.phase,
        days: row.days,
        hitRate: `${(row.hitRate * 100).toFixed(2)}%`,
        avgBet: row.avgBetCount.toFixed(1),
        range: `${row.minBetCount}-${row.maxBetCount}`,
        profitK: row.profitK,
        roi: `${(row.roi * 100).toFixed(2)}%`,
        longestLoss: row.longestLoss
    })));
    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = path.join(outputDir, `research_posterior_calibrated_cutoff_${stamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[CalibratedCutoff] JSON: ${outputPath}`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    buildDynamicPrediction,
    calibratedProbabilities,
    negativeLogLikelihood
};
