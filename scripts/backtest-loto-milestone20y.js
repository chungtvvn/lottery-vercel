#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const generateNumberStats = require('../lib/generators/statisticsGenerator');
const generateHeadTailStats = require('../lib/generators/headTailStatsGenerator');
const generateSumDiffStats = require('../lib/generators/sumDifferenceStatsGenerator');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');
const {
    buildBacktestFingerprint,
    hashCanonical,
    readJsonSnapshot
} = require('../lib/utils/backtestFingerprint');

const PRIZE_KEYS = [
    'special',
    'prize1',
    'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const DEFAULT_STAKE_K = 2200;
const DEFAULT_PAYOUT_K = 8000;
const DEFAULT_METHOD_ID = 'rrfSmall65Block75';
const DEFAULT_STRATEGY = 'chainSmallFirst';
const DEFAULT_HOLD = 65;
const DEFAULT_AGGREGATION_MODE = 'twoHitGreedy';
const DEFAULT_BET_COUNT = 6;
const DEFAULT_BET_COUNTS = [6, 7];
const LIVE_TRACKING_VERSION = 'rrf-top6-top7-live-v1';
const LIVE_CACHE_NOTE = 'Lô dùng RRF 50/50: Chuỗi nhỏ Hold 65 + Nhịp block Hold 75. Mỗi vị trí được loại trừ riêng, sau đó xếp hạng RRF và chọn Top 6/Top 7; Lô không nhân tiền x2 cho số trùng.';

function parseArgs() {
    return new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value || '1'];
    }));
}

function parseIsoDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatIsoDate(value) {
    const date = value instanceof Date ? value : parseIsoDate(value);
    if (!date) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(value) {
    const date = value instanceof Date ? value : parseIsoDate(value);
    if (!date) return '';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function addDays(value, days) {
    const date = value instanceof Date ? new Date(value) : parseIsoDate(value);
    if (!date) return null;
    date.setDate(date.getDate() + days);
    return date;
}

function normalizeNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return ((Math.trunc(number) % 100) + 100) % 100;
}

function formatNumber(value) {
    return String(value).padStart(2, '0');
}

function toPositionData(rawData, key) {
    return (rawData || [])
        .map(row => {
            const value = normalizeNumber(row[key]);
            if (value === null) return null;
            return { date: row.date, special: value };
        })
        .filter(Boolean);
}

async function buildStatsForPosition(positionData) {
    const [numberStats, headTailStats, sumDiffStats] = await Promise.all([
        generateNumberStats(null, null, positionData),
        generateHeadTailStats(null, null, positionData),
        generateSumDiffStats(null, null, positionData)
    ]);
    return { numberStats, headTailStats, sumDiffStats };
}

function flattenStats(allStats) {
    const rows = [];
    const add = (key, value) => {
        if (isInvalidStatsKey(key)) return;
        if (!value || !Array.isArray(value.streaks)) return;
        rows.push([key, value]);
    };

    for (const [key, value] of Object.entries(allStats || {})) {
        if (value && Array.isArray(value.streaks)) {
            add(key, value);
        } else if (value && typeof value === 'object') {
            for (const [subKey, subValue] of Object.entries(value)) {
                add(`${key}:${subKey}`, subValue);
            }
        }
    }
    return rows;
}

function buildStatsIndexFromLoadedStats() {
    const entries = new Map();
    for (const [key, value] of flattenStats(historicalExclusionService.loadAllStats())) {
        entries.set(key, value);
    }
    return entries;
}

function countActualOccurrences(day) {
    const counts = new Map();
    for (const key of PRIZE_KEYS) {
        const value = normalizeNumber(day[key]);
        if (value === null) continue;
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
}

function emptySummary(methodId, betCount, meta = {}) {
    return {
        methodId,
        betCount,
        ...meta,
        days: 0,
        winDays: 0,
        lossDays: 0,
        hitDays: 0,
        totalHits: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        bestDayProfitK: null,
        worstDayProfitK: null,
        longestWin: 0,
        longestLoss: 0,
        atLeast2Days: 0,
        atLeast3Days: 0,
        under2Days: 0,
        longestUnder2: 0,
        currentUnder2: 0,
        currentStreakType: null,
        currentStreakLength: 0
    };
}

function updateWinLossStreak(summary, profitK) {
    const type = profitK > 0 ? 'win' : (profitK < 0 ? 'loss' : 'flat');
    if (type === 'flat') {
        summary.currentStreakType = null;
        summary.currentStreakLength = 0;
        return;
    }
    if (summary.currentStreakType === type) {
        summary.currentStreakLength += 1;
    } else {
        summary.currentStreakType = type;
        summary.currentStreakLength = 1;
    }
    if (type === 'win') summary.longestWin = Math.max(summary.longestWin, summary.currentStreakLength);
    if (type === 'loss') summary.longestLoss = Math.max(summary.longestLoss, summary.currentStreakLength);
}

function finalizeSummary(summary) {
    const { currentStreakType, currentStreakLength, currentUnder2, ...rest } = summary;
    return {
        ...rest,
        hitRate: rest.days ? rest.hitDays / rest.days : 0,
        atLeast2Rate: rest.days ? rest.atLeast2Days / rest.days : 0,
        atLeast3Rate: rest.days ? rest.atLeast3Days / rest.days : 0,
        under2Rate: rest.days ? rest.under2Days / rest.days : 0,
        winRate: rest.days ? rest.winDays / rest.days : 0,
        roi: rest.stakeK ? rest.profitK / rest.stakeK : 0,
        avgHitsPerDay: rest.days ? rest.totalHits / rest.days : 0
    };
}

function addResultToSummary(summary, numbers, actualCounts, stakeK, payoutK) {
    const selected = numbers.map(normalizeNumber).filter(value => value !== null);
    const hits = selected.reduce((sum, number) => sum + (actualCounts.get(number) || 0), 0);
    const dayStakeK = selected.length * stakeK;
    const dayPayoutK = hits * payoutK;
    const profitK = dayPayoutK - dayStakeK;
    summary.days += 1;
    if (profitK > 0) summary.winDays += 1;
    if (profitK < 0) summary.lossDays += 1;
    if (hits > 0) summary.hitDays += 1;
    if (hits >= 2) summary.atLeast2Days += 1;
    if (hits >= 3) summary.atLeast3Days += 1;
    if (hits < 2) {
        summary.under2Days += 1;
        summary.currentUnder2 += 1;
        summary.longestUnder2 = Math.max(summary.longestUnder2, summary.currentUnder2);
    } else {
        summary.currentUnder2 = 0;
    }
    summary.totalHits += hits;
    summary.stakeK += dayStakeK;
    summary.payoutK += dayPayoutK;
    summary.profitK += profitK;
    summary.bestDayProfitK = summary.bestDayProfitK === null ? profitK : Math.max(summary.bestDayProfitK, profitK);
    summary.worstDayProfitK = summary.worstDayProfitK === null ? profitK : Math.min(summary.worstDayProfitK, profitK);
    updateWinLossStreak(summary, profitK);
    return {
        numbers: selected.map(formatNumber),
        hits,
        stakeK: dayStakeK,
        payoutK: dayPayoutK,
        profitK
    };
}

function aggregateBySupport(positionPredictions) {
    const support = new Map();
    for (const [positionKey, numbers] of Object.entries(positionPredictions || {})) {
        for (const rawNumber of numbers || []) {
            const number = normalizeNumber(rawNumber);
            if (number === null) continue;
            if (!support.has(number)) support.set(number, []);
            support.get(number).push(positionKey);
        }
    }
    return ALL_NUMBERS
        .map(number => ({ number, positions: support.get(number) || [] }))
        .sort((a, b) => {
            if (b.positions.length !== a.positions.length) return b.positions.length - a.positions.length;
            return a.number - b.number;
        });
}

function headOf(number) {
    return Math.floor(normalizeNumber(number) / 10);
}

function tailOf(number) {
    return normalizeNumber(number) % 10;
}

function sumOfDigits(number) {
    const value = normalizeNumber(number);
    return Math.floor(value / 10) + (value % 10);
}

function getPositionWeight(positionWeights, positionKey) {
    if (!positionWeights || !positionWeights.has(positionKey)) return 1;
    const value = Number(positionWeights.get(positionKey));
    return Number.isFinite(value) && value > 0 ? value : 1;
}

function buildNumberItems(positionPredictions, positionWeights = null) {
    const support = new Map();
    const weighted = new Map();
    for (const [positionKey, numbers] of Object.entries(positionPredictions || {})) {
        const weight = getPositionWeight(positionWeights, positionKey);
        for (const rawNumber of numbers || []) {
            const number = normalizeNumber(rawNumber);
            if (number === null) continue;
            if (!support.has(number)) support.set(number, []);
            support.get(number).push(positionKey);
            weighted.set(number, (weighted.get(number) || 0) + weight);
        }
    }

    return ALL_NUMBERS.map(number => ({
        number,
        positions: support.get(number) || [],
        supportCount: (support.get(number) || []).length,
        weightedScore: weighted.get(number) || 0
    }));
}

function sortByBaseScore(items, scoreField = 'supportCount') {
    return items.slice().sort((a, b) => {
        const diff = Number(b[scoreField] || 0) - Number(a[scoreField] || 0);
        if (diff !== 0) return diff;
        if (b.supportCount !== a.supportCount) return b.supportCount - a.supportCount;
        return a.number - b.number;
    });
}

function overlapRatio(aPositions = [], bPositions = []) {
    if (!aPositions.length || !bPositions.length) return 0;
    const bSet = new Set(bPositions);
    const overlap = aPositions.filter(position => bSet.has(position)).length;
    return overlap / Math.max(aPositions.length, bPositions.length);
}

function diversityPenalty(candidate, selected) {
    let penalty = 0;
    for (const item of selected) {
        if (headOf(candidate.number) === headOf(item.number)) penalty += 0.45;
        if (tailOf(candidate.number) === tailOf(item.number)) penalty += 0.45;
        if (sumOfDigits(candidate.number) === sumOfDigits(item.number)) penalty += 0.25;
        if ((candidate.number % 2) === (item.number % 2)) penalty += 0.08;
        penalty += overlapRatio(candidate.positions, item.positions) * 0.55;
    }
    return penalty;
}

function greedyRank(items, baseScoreFn, options = {}) {
    const remaining = items.slice();
    const selected = [];
    const total = Number(options.total || 100);

    while (remaining.length && selected.length < total) {
        let bestIndex = 0;
        let bestScore = -Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const item = remaining[i];
            const base = baseScoreFn(item, selected);
            const penalty = options.diversify
                ? diversityPenalty(item, selected) * Number(options.penaltyScale ?? 1)
                : 0;
            const score = base - penalty;
            if (score > bestScore || (score === bestScore && item.number < remaining[bestIndex].number)) {
                bestScore = score;
                bestIndex = i;
            }
        }
        selected.push(remaining.splice(bestIndex, 1)[0]);
    }
    return selected.concat(sortByBaseScore(remaining, 'weightedScore'));
}

function getPositionPosteriorItems(positionPredictions, calibrationState) {
    const items = buildNumberItems(positionPredictions);
    const positionSets = new Map(
        Object.entries(positionPredictions || {}).map(([positionKey, numbers]) => [
            positionKey,
            new Set((numbers || []).map(normalizeNumber).filter(value => value !== null))
        ])
    );
    const positionCalibration = calibrationState?.positions || new Map();
    const supportBuckets = calibrationState?.supportBuckets || new Map();

    return items.map(item => {
        let expectedHits = 0;
        let bestPositionProbability = 0;
        for (const positionKey of PRIZE_KEYS) {
            const survivorSet = positionSets.get(positionKey) || new Set();
            const survivorCount = survivorSet.size;
            const excludedCount = Math.max(1, 100 - survivorCount);
            const stat = positionCalibration.get(positionKey) || {
                trials: 40,
                hits: 40 * (survivorCount / 100)
            };
            const survivorReliability = stat.hits / Math.max(1, stat.trials);
            const probability = survivorSet.has(item.number)
                ? survivorReliability / Math.max(1, survivorCount)
                : (1 - survivorReliability) / excludedCount;
            expectedHits += probability;
            bestPositionProbability = Math.max(bestPositionProbability, probability);
        }

        const bucket = supportBuckets.get(item.supportCount);
        const bucketExpectedHits = bucket
            ? bucket.totalHits / Math.max(1, bucket.trials)
            : 0.27;
        return {
            ...item,
            expectedHits,
            hitProbability: 1 - Math.exp(-expectedHits),
            bestPositionProbability,
            bucketExpectedHits,
            posteriorScore: expectedHits * 0.78 + bucketExpectedHits * 0.22
        };
    });
}

function aggregatePositionPredictions(positionPredictions, options = {}) {
    const mode = options.mode || 'support';
    if (
        mode === 'positionPosterior' ||
        mode === 'positionPosteriorPortfolio' ||
        mode === 'bestPositionPosterior' ||
        mode === 'positionBayesExpected'
    ) {
        const posteriorItems = getPositionPosteriorItems(
            positionPredictions,
            options.calibrationState
        );
        if (mode === 'positionPosteriorPortfolio') {
            return greedyRank(
                posteriorItems,
                item => item.posteriorScore,
                { diversify: true, penaltyScale: 0.025 }
            );
        }
        if (mode === 'bestPositionPosterior') {
            return posteriorItems.slice().sort((a, b) => {
                const aScore = a.bestPositionProbability + a.expectedHits * 0.25;
                const bScore = b.bestPositionProbability + b.expectedHits * 0.25;
                if (bScore !== aScore) return bScore - aScore;
                if (b.supportCount !== a.supportCount) return b.supportCount - a.supportCount;
                return a.number - b.number;
            });
        }
        const scoreField = mode === 'positionBayesExpected'
            ? 'posteriorScore'
            : 'expectedHits';
        return sortByBaseScore(posteriorItems, scoreField);
    }
    const items = buildNumberItems(positionPredictions, options.positionWeights);
    if (mode === 'weightedSupport') return sortByBaseScore(items, 'weightedScore');
    if (mode === 'diverseSupport') {
        return greedyRank(items, item => item.supportCount, { diversify: true });
    }
    if (mode === 'weightedDiverse') {
        return greedyRank(items, item => item.weightedScore, { diversify: true });
    }
    if (mode === 'twoHitGreedy') {
        const maxScore = Math.max(1, ...items.map(item => item.supportCount));
        return greedyRank(items, (item, selected) => {
            const p = 0.02 + (item.supportCount / maxScore) * 0.5;
            const needSecondHitBoost = selected.length === 0 ? 1 : Math.min(1.55, 1 + selected.length * 0.08);
            return p * needSecondHitBoost + item.supportCount * 0.18;
        }, { diversify: true });
    }
    if (mode === 'weightedTwoHit') {
        const maxScore = Math.max(1, ...items.map(item => item.weightedScore));
        return greedyRank(items, (item, selected) => {
            const p = 0.02 + (item.weightedScore / maxScore) * 0.52;
            const needSecondHitBoost = selected.length === 0 ? 1 : Math.min(1.6, 1 + selected.length * 0.09);
            return p * needSecondHitBoost + item.weightedScore * 0.18;
        }, { diversify: true });
    }
    return sortByBaseScore(items, 'supportCount');
}

function createPositionCalibration(survivorCount = 25) {
    const priorTrials = 40;
    const expectedHitRate = Math.max(0.01, Math.min(0.99, survivorCount / 100));
    return new Map(PRIZE_KEYS.map(positionKey => [positionKey, {
        trials: priorTrials,
        hits: priorTrials * expectedHitRate
    }]));
}

function createAggregationCalibration(survivorCount) {
    return {
        positions: createPositionCalibration(survivorCount),
        supportBuckets: new Map()
    };
}

function getCalibratedPositionWeights(calibration) {
    const weights = new Map();
    for (const [positionKey, stat] of calibration.entries()) {
        const hitRate = stat.hits / Math.max(1, stat.trials);
        const relative = hitRate / 0.25;
        weights.set(positionKey, Math.max(0.55, Math.min(2.1, relative)));
    }
    return weights;
}

function updatePositionCalibration(calibration, positionPredictions, actualByPosition) {
    for (const positionKey of PRIZE_KEYS) {
        const actual = normalizeNumber(actualByPosition?.[positionKey]);
        if (actual === null) continue;
        const predicted = new Set((positionPredictions?.[positionKey] || []).map(normalizeNumber));
        const stat = calibration.get(positionKey) || { trials: 20, hits: 5 };
        stat.trials += 1;
        if (predicted.has(actual)) stat.hits += 1;
        calibration.set(positionKey, stat);
    }
}

function updateAggregationCalibration(
    calibrationState,
    positionPredictions,
    actualByPosition,
    actualCounts
) {
    updatePositionCalibration(
        calibrationState.positions,
        positionPredictions,
        actualByPosition
    );
    const items = buildNumberItems(positionPredictions);
    for (const item of items) {
        const current = calibrationState.supportBuckets.get(item.supportCount) || {
            trials: 40,
            totalHits: 40 * 0.27
        };
        current.trials += 1;
        current.totalHits += actualCounts.get(item.number) || 0;
        calibrationState.supportBuckets.set(item.supportCount, current);
    }
}

function getWindowRows(rawData, months) {
    const days = Math.round(Number(months) * 30.4375);
    return rawData.slice(-days);
}

function getDateRangeRows(rawData, startDateValue, endDateValue) {
    const startDate = parseIsoDate(startDateValue);
    const endDate = parseIsoDate(endDateValue);
    if (!startDate || !endDate || startDate > endDate) {
        throw new Error(`Khoảng ngày backtest không hợp lệ: ${startDateValue || '-'} -> ${endDateValue || '-'}.`);
    }
    const startIso = formatIsoDate(startDate);
    const endIso = formatIsoDate(endDate);
    return rawData.filter(row => {
        const isoDate = formatIsoDate(row.date);
        return isoDate >= startIso && isoDate <= endIso;
    });
}

function readJsonIfExists(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.warn(`[LotoMilestone20Y] Không đọc được ${filePath}: ${error.message}`);
        return fallback;
    }
}

function buildPredictionSetsFromRanked(ranked, betCounts) {
    const sets = {};
    for (const betCount of betCounts) {
        const selected = ranked.slice(0, betCount);
        sets[`top${betCount}`] = {
            count: betCount,
            numbers: selected.map(item => formatNumber(item.number)),
            support: selected.map(item => ({
                number: formatNumber(item.number),
                supportCount: item.supportCount ?? item.positions.length,
                weightedScore: Number(item.weightedScore || 0),
                positions: item.positions
            }))
        };
    }
    return sets;
}

function evaluateNumbers(numbers, actualCounts, stakeK, payoutK, intersection = []) {
    const selected = (numbers || []).map(normalizeNumber).filter(value => value !== null);
    const overlapNumbers = selected
        .filter(number => (intersection || []).map(normalizeNumber).includes(number))
        .map(formatNumber);
    
    let hits = 0;
    let stakeTotalK = 0;
    
    for (const number of selected) {
        const occurrences = actualCounts.get(number) || 0;
        
        hits += occurrences;
        stakeTotalK += stakeK;
    }
    
    const payoutTotalK = hits * payoutK;
    const profitK = payoutTotalK - stakeTotalK;
    return {
        betNumbers: selected.map(formatNumber),
        overlapNumbers,
        uniqueCount: selected.length,
        unitCount: selected.length,
        betCount: selected.length,
        hits,
        stakeK: stakeTotalK,
        payoutK: payoutTotalK,
        profitK,
        result: profitK > 0 ? 'win' : (profitK < 0 ? 'loss' : 'flat')
    };
}

function buildActualLookup(rawData) {
    const byDate = new Map();
    for (const row of rawData || []) {
        const isoDate = formatIsoDate(row.date);
        const counts = countActualOccurrences(row);
        byDate.set(isoDate, {
            date: isoDate,
            counts,
            actualText: Object.fromEntries([...counts.entries()].map(([number, count]) => [formatNumber(number), count]))
        });
    }
    return byDate;
}

function settleLivePredictions(livePayload, rawData, options) {
    const actualByDate = buildActualLookup(rawData);
    let settledCount = 0;
    for (const item of livePayload.predictions || []) {
        const predictionIsoDate = item.predictionIsoDate || formatIsoDate(item.predictionDate);
        if (!predictionIsoDate) continue;
        item.predictionIsoDate = predictionIsoDate;
        const actual = actualByDate.get(predictionIsoDate);
        if (!actual) {
            item.status = item.status || 'pending';
            continue;
        }

        const wasSettled = item.status === 'settled';
        item.status = 'settled';
        item.settledAt = item.settledAt || new Date().toISOString();
        item.actual = actual.actualText;
        item.methods = item.methods || {};
        for (const betCount of options.betCounts) {
            const key = `top${betCount}`;
            if (!item.predictions?.[key]) continue;
            item.methods[key] = evaluateNumbers(
                item.predictions[key].numbers || [],
                actual.counts,
                options.stakeK,
                options.payoutK,
                item.predictions[key].overlapNumbers || item.predictions[key].intersection || []
            );
        }
        if (!wasSettled) settledCount += 1;
    }
    return settledCount;
}

function summarizeLivePredictions(livePayload, betCounts) {
    const summary = {};
    const settled = (livePayload.predictions || []).filter(item => item.status === 'settled');
    for (const betCount of betCounts) {
        const key = `top${betCount}`;
        const row = emptySummary(key, betCount);
        for (const item of settled) {
            const method = item.methods?.[key];
            if (!method) continue;
            row.days += 1;
            if (method.profitK > 0) row.winDays += 1;
            if (method.profitK < 0) row.lossDays += 1;
            if ((method.hits || 0) > 0) row.hitDays += 1;
            row.totalHits += method.hits || 0;
            row.stakeK += method.stakeK || 0;
            row.payoutK += method.payoutK || 0;
            row.profitK += method.profitK || 0;
            row.bestDayProfitK = row.bestDayProfitK === null ? method.profitK : Math.max(row.bestDayProfitK, method.profitK);
            row.worstDayProfitK = row.worstDayProfitK === null ? method.profitK : Math.min(row.worstDayProfitK, method.profitK);
            updateWinLossStreak(row, method.profitK || 0);
        }
        const finalized = finalizeSummary(row);
        summary[key] = {
            ...finalized,
            wins: finalized.winDays,
            losses: finalized.lossDays
        };
    }
    return summary;
}

function buildLivePredictionRecord(nextPrediction, betCounts) {
    if (!nextPrediction?.predictionIsoDate) return null;
    return {
        type: 'real',
        status: 'pending',
        createdAt: new Date().toISOString(),
        dataDate: nextPrediction.dataDate,
        dataIsoDate: nextPrediction.dataIsoDate,
        predictionDate: nextPrediction.predictionDate,
        predictionIsoDate: nextPrediction.predictionIsoDate,
        methodId: nextPrediction.methodId,
        trackingVersion: LIVE_TRACKING_VERSION,
        positionCount: nextPrediction.positionCount,
        predictions: nextPrediction.predictions || buildPredictionSetsFromRanked(nextPrediction.ranked || [], betCounts),
        positionPredictions: nextPrediction.positionPredictions || []
    };
}

function upsertNextLivePrediction(livePayload, nextPrediction, betCounts) {
    const record = buildLivePredictionRecord(nextPrediction, betCounts);
    if (!record) return false;
    livePayload.predictions = Array.isArray(livePayload.predictions) ? livePayload.predictions : [];
    const existingIndex = livePayload.predictions.findIndex(item => item.predictionIsoDate === record.predictionIsoDate);
    if (existingIndex < 0) {
        livePayload.predictions.push(record);
        return true;
    }

    const existing = livePayload.predictions[existingIndex];
    if (existing.status === 'settled') return false;
    if (existing.methodId !== record.methodId) {
        livePayload.predictions[existingIndex] = {
            ...existing,
            ...record,
            replacedAt: new Date().toISOString(),
            replacedMethodId: existing.methodId || null
        };
        console.log(`[LotoMilestone20Y] Thay dàn pending ${record.predictionIsoDate}: ${existing.methodId || 'unknown'} -> ${record.methodId}.`);
        return true;
    }
    const missingKeys = betCounts
        .map(count => `top${count}`)
        .filter(key => !existing.predictions?.[key] && record.predictions?.[key]);
    if (missingKeys.length > 0) {
        const addedPredictions = Object.fromEntries(
            missingKeys.map(key => [key, record.predictions[key]])
        );
        livePayload.predictions[existingIndex] = {
            ...existing,
            predictions: {
                ...(existing.predictions || {}),
                ...addedPredictions
            },
            trackingVersion: LIVE_TRACKING_VERSION,
            trackingStartedAt: existing.trackingStartedAt || new Date().toISOString()
        };
        console.log(`[LotoMilestone20Y] Bổ sung ${missingKeys.join(', ')} vào dàn pending ${record.predictionIsoDate} rồi khóa snapshot.`);
        return true;
    }
    console.log(`[LotoMilestone20Y] Giữ nguyên dàn point-in-time ${record.predictionIsoDate} (${existing.methodId || 'unknown'}, ${existing.status || 'pending'}).`);
    return false;
}

function preservePublishedNextPrediction(nextPrediction, livePayload) {
    const published = (livePayload.predictions || []).find(item => item.predictionIsoDate === nextPrediction?.predictionIsoDate);
    if (!published) return nextPrediction;
    return {
        ...nextPrediction,
        dataDate: published.dataDate || nextPrediction.dataDate,
        dataIsoDate: published.dataIsoDate || nextPrediction.dataIsoDate,
        predictionDate: published.predictionDate || nextPrediction.predictionDate,
        predictionIsoDate: published.predictionIsoDate || nextPrediction.predictionIsoDate,
        methodId: published.methodId || nextPrediction.methodId,
        predictions: published.predictions || nextPrediction.predictions,
        positionPredictions: published.positionPredictions || nextPrediction.positionPredictions,
        pointInTimeLocked: true,
        publishedAt: published.createdAt || null
    };
}

const positionStatsCache = new Map();

async function buildPositionDailyPredictions(rawData, positionKey, targetRows, methodConfigs, options) {
    const strictPointInTime = options.strictPointInTime !== false;
    const positionData = toPositionData(rawData, positionKey);
    let entries = null;
    if (!strictPointInTime) {
        let stats;
        if (positionStatsCache.has(positionKey)) {
            stats = positionStatsCache.get(positionKey);
        } else {
            stats = await buildStatsForPosition(positionData);
            positionStatsCache.set(positionKey, stats);
        }
        lotteryService.__setInMemoryCachesForBacktest({
            rawData: positionData,
            ...stats
        });
        historicalExclusionService.clearCache();
        entries = buildStatsIndexFromLoadedStats();
    }
    const baselineByYear = new Map();
    const rows = new Map();

    for (const rawDay of targetRows) {
        const date = parseIsoDate(rawDay.date);
        if (!date) continue;
        if (strictPointInTime) {
            // The position's pattern universe and active/potential state must
            // both be generated from draws strictly before this prediction.
            const predictionIso = formatIsoDate(date);
            const prefixRaw = rawData.filter(row => formatIsoDate(row.date) < predictionIso);
            const prefixPositionData = toPositionData(prefixRaw, positionKey);
            const prefixStats = await buildStatsForPosition(prefixPositionData);
            lotteryService.__setInMemoryCachesForBacktest({
                rawData: prefixPositionData,
                ...prefixStats
            });
            historicalExclusionService.clearCache();
            entries = buildStatsIndexFromLoadedStats();
        }
        const year = date.getFullYear();
        const baselineYear = options.fixedBaselineYear || year;
        if (!baselineByYear.has(baselineYear)) {
            baselineByYear.set(baselineYear, annualMilestoneService.buildAnnualBaseline(entries, baselineYear, {
                historyYears: options.historyYears,
                writeBaseline: false
            }));
        }
        const baseline = baselineByYear.get(baselineYear);
        const candidates = annualMilestoneService.buildCandidatesForDate(formatDisplayDate(date), baseline, {
            historyYears: options.historyYears,
            activeFrequencyLimit: options.activeFrequencyLimit,
            recordFrequencyLimit: options.recordFrequencyLimit,
            minPotentialCurrentLenForNeverFormed: options.minPotentialCurrentLenForNeverFormed
        });
        const byMethod = {};
        for (const config of methodConfigs) {
            const prediction = annualMilestoneService.buildPrediction(candidates, config.target, config.strategy);
            byMethod[config.id] = (prediction.betNumbers || []).map(Number);
        }
        rows.set(formatIsoDate(date), byMethod);
    }
    return rows;
}

async function buildNextPrediction(rawData, methodConfig, betCounts, options) {
    const aggregationMode = methodConfig.aggregationMode || options.aggregationMode || DEFAULT_AGGREGATION_MODE;
    const latest = rawData[rawData.length - 1];
    const latestDate = latest ? parseIsoDate(latest.date) : null;
    if (!latestDate) throw new Error('Không có ngày dữ liệu mới nhất để sinh dự đoán Lô.');
    const predictionDate = addDays(latestDate, 1);
    const targetRows = [{ date: formatIsoDate(predictionDate) }];
    const positionPredictions = [];
    const byPosition = {};

    let positionIndex = 0;
    for (const positionKey of PRIZE_KEYS) {
        positionIndex += 1;
        console.log(`[LotoMilestone20Y] next ${positionKey} (${positionIndex}/${PRIZE_KEYS.length})...`);
        const positionRows = await buildPositionDailyPredictions(rawData, positionKey, targetRows, [methodConfig], options);
        // Free stats cache immediately — prediction-only processes each position once
        positionStatsCache.delete(positionKey);
        const methods = positionRows.get(formatIsoDate(predictionDate)) || {};
        const numbers = methods[methodConfig.id] || [];
        byPosition[positionKey] = numbers;
        positionPredictions.push({
            positionKey,
            methodId: methodConfig.id,
            dataIsoDate: formatIsoDate(latestDate),
            predictionIsoDate: formatIsoDate(predictionDate),
            numbers: numbers.map(formatNumber),
            betCount: numbers.length,
            excludedCount: 100 - numbers.length
        });
    }

    const ranked = aggregatePositionPredictions(byPosition, { mode: aggregationMode });
    return {
        generatedAt: new Date().toISOString(),
        dataDate: formatDisplayDate(latestDate),
        dataIsoDate: formatIsoDate(latestDate),
        predictionDate: formatDisplayDate(predictionDate),
        predictionIsoDate: formatIsoDate(predictionDate),
        methodId: methodConfig.id,
        strategy: methodConfig.strategy,
        hold: methodConfig.target,
        aggregationMode,
        positionCount: PRIZE_KEYS.length,
        positions: PRIZE_KEYS,
        positionPredictions,
        ranked: ranked.map(item => ({
            number: formatNumber(item.number),
            supportCount: item.supportCount ?? item.positions.length,
            weightedScore: Number(item.weightedScore || 0),
            positions: item.positions
        })),
        predictions: buildPredictionSetsFromRanked(ranked, betCounts)
    };
}

function buildRrfPrediction(pSmall, pBlock, betCounts, options = {}) {
    const sourceDepth = Math.max(20, ...betCounts.map(Number));
    const weightSmall = Number(options.weightSmall ?? 0.5);
    const weightBlock = Number(options.weightBlock ?? 0.5);
    const agreementBonus = Number(options.agreementBonus ?? 0.01);
    const experts = [
        { prediction: pSmall, weight: weightSmall },
        { prediction: pBlock, weight: weightBlock }
    ];
    const scoreMap = new Map();

    for (const expert of experts) {
        const numbers = expert.prediction?.predictions?.[`top${sourceDepth}`]?.numbers || [];
        numbers.forEach((rawNumber, index) => {
            const number = normalizeNumber(rawNumber);
            if (number === null) return;
            const row = scoreMap.get(number) || {
                number,
                score: 0,
                sourceCount: 0,
                bestRank: Infinity,
                sourceRanks: {}
            };
            row.score += expert.weight / (sourceDepth + index + 1);
            row.sourceCount += 1;
            row.bestRank = Math.min(row.bestRank, index + 1);
            row.sourceRanks[expert.prediction.strategy] = index + 1;
            scoreMap.set(number, row);
        });
    }

    const ranked = Array.from(scoreMap.values())
        .map(row => ({
            ...row,
            score: row.score + agreementBonus * Math.max(0, row.sourceCount - 1)
        }))
        .sort((left, right) =>
            right.score - left.score
            || right.sourceCount - left.sourceCount
            || left.bestRank - right.bestRank
            || left.number - right.number
        );

    const predictions = {};
    for (const count of betCounts) {
        const selected = ranked.slice(0, count);
        const selectedNumbers = new Set(selected.map(item => item.number));
        const smallNumbers = new Set((pSmall.predictions?.[`top${count}`]?.numbers || []).map(normalizeNumber));
        const blockNumbers = new Set((pBlock.predictions?.[`top${count}`]?.numbers || []).map(normalizeNumber));
        const overlapNumbers = Array.from(selectedNumbers)
            .filter(number => smallNumbers.has(number) && blockNumbers.has(number))
            .sort((a, b) => a - b)
            .map(formatNumber);

        predictions[`top${count}`] = {
            count,
            numbers: selected.map(item => formatNumber(item.number)),
            uniqueCount: selected.length,
            unitCount: selected.length,
            selectionMode: 'rrf50_50',
            overlapNumbers,
            support: selected.map(item => ({
                number: formatNumber(item.number),
                score: Number(item.score.toFixed(8)),
                weightedScore: Number(item.score.toFixed(8)),
                sourceCount: item.sourceCount,
                sourceStrategies: Object.keys(item.sourceRanks),
                sourceRanks: item.sourceRanks
            }))
        };
    }

    return {
        generatedAt: new Date().toISOString(),
        dataDate: pSmall.dataDate,
        dataIsoDate: pSmall.dataIsoDate,
        predictionDate: pSmall.predictionDate,
        predictionIsoDate: pSmall.predictionIsoDate,
        methodId: 'rrfSmall65Block75',
        strategy: 'rrfSmall65Block75',
        hold: null,
        aggregationMode: 'rrf',
        sourceMethods: [
            { strategy: pSmall.strategy, hold: pSmall.hold, aggregationMode: pSmall.aggregationMode, weight: weightSmall },
            { strategy: pBlock.strategy, hold: pBlock.hold, aggregationMode: pBlock.aggregationMode, weight: weightBlock }
        ],
        positionCount: pSmall.positionCount,
        positions: pSmall.positions,
        predictions
    };
}

async function buildNextRrfPrediction(rawData, betCounts, options) {
    const latest = rawData[rawData.length - 1];
    const latestDate = latest ? parseIsoDate(latest.date) : null;
    if (!latestDate) throw new Error('Không có ngày dữ liệu mới nhất để sinh dự đoán Lô.');
    const predictionDate = addDays(latestDate, 1);
    const predictionIsoDate = formatIsoDate(predictionDate);
    const sourceConfigs = [
        { id: 'rrfSmallSource', strategy: 'chainSmallFirst', target: 65, aggregationMode: 'twoHitGreedy' },
        { id: 'rrfBlockSource', strategy: 'chainBlockFirst', target: 75, aggregationMode: 'positionPosterior' }
    ];
    const bySource = Object.fromEntries(sourceConfigs.map(config => [config.id, {}]));
    const byPosition = {};

    for (let index = 0; index < PRIZE_KEYS.length; index += 1) {
        const positionKey = PRIZE_KEYS[index];
        console.log(`[LotoMilestone20Y] next RRF ${positionKey} (${index + 1}/${PRIZE_KEYS.length})...`);
        const positionRows = await buildPositionDailyPredictions(
            rawData,
            positionKey,
            [{ date: predictionIsoDate }],
            sourceConfigs,
            options
        );
        positionStatsCache.delete(positionKey);
        const methods = positionRows.get(predictionIsoDate) || {};
        byPosition[positionKey] = {};
        for (const config of sourceConfigs) {
            const numbers = (methods[config.id] || []).map(Number);
            bySource[config.id][positionKey] = numbers;
            byPosition[positionKey][config.id] = numbers.map(formatNumber);
        }
    }

    const sourcePredictions = sourceConfigs.map(config => {
        const ranked = aggregatePositionPredictions(bySource[config.id], { mode: config.aggregationMode });
        return {
            generatedAt: new Date().toISOString(),
            dataDate: formatDisplayDate(latestDate),
            dataIsoDate: formatIsoDate(latestDate),
            predictionDate: formatDisplayDate(predictionDate),
            predictionIsoDate,
            methodId: config.id,
            strategy: config.strategy,
            hold: config.target,
            aggregationMode: config.aggregationMode,
            positionCount: PRIZE_KEYS.length,
            positions: PRIZE_KEYS,
            positionPredictions: PRIZE_KEYS.map(positionKey => ({
                positionKey,
                methodId: config.id,
                dataIsoDate: formatIsoDate(latestDate),
                predictionIsoDate,
                numbers: (bySource[config.id][positionKey] || []).map(formatNumber),
                betCount: (bySource[config.id][positionKey] || []).length,
                excludedCount: 100 - (bySource[config.id][positionKey] || []).length
            })),
            ranked,
            predictions: buildPredictionSetsFromRanked(ranked, [20, ...betCounts])
        };
    });

    const rrf = buildRrfPrediction(sourcePredictions[0], sourcePredictions[1], betCounts);
    rrf.positionPredictions = PRIZE_KEYS.map(positionKey => ({
        positionKey,
        methodId: rrf.methodId,
        dataIsoDate: formatIsoDate(latestDate),
        predictionIsoDate,
        sourceNumbers: {
            chainSmallFirst: byPosition[positionKey].rrfSmallSource || [],
            chainBlockFirst: byPosition[positionKey].rrfBlockSource || []
        },
        numbers: Array.from(new Set([
            ...(byPosition[positionKey].rrfSmallSource || []),
            ...(byPosition[positionKey].rrfBlockSource || [])
        ])).map(formatNumber),
        betCount: betCounts[0] || DEFAULT_BET_COUNT,
        excludedCount: 100 - (betCounts[0] || DEFAULT_BET_COUNT)
    }));
    rrf.sourcePredictions = Object.fromEntries(sourcePredictions.map(prediction => [prediction.strategy, {
        methodId: prediction.methodId,
        strategy: prediction.strategy,
        hold: prediction.hold,
        aggregationMode: prediction.aggregationMode,
        predictions: prediction.predictions
    }]));
    return rrf;
}

function writeLiveCaches(nextPrediction, rawData, betCounts, options) {
    const statsDir = path.join(process.cwd(), 'lib', 'data', 'statistics');
    const cachePath = path.join(statsDir, 'cached_loto_prediction.json');
    const livePath = path.join(statsDir, 'cached_loto_live_predictions.json');
    const livePayload = readJsonIfExists(livePath, {
        generatedAt: null,
        startedAt: new Date().toISOString(),
        config: {},
        predictions: []
    });

    livePayload.config = {
        ...(livePayload.config || {}),
        methodId: nextPrediction.methodId,
        methodName: 'Mốc 20 năm - Chuỗi nhỏ trước Hold 65 - Two-hit Greedy Top 14',
        trackingVersion: LIVE_TRACKING_VERSION,
        aggregationMode: nextPrediction.aggregationMode || DEFAULT_AGGREGATION_MODE,
        positionCount: PRIZE_KEYS.length,
        positions: PRIZE_KEYS,
        stakePerNumberK: options.stakeK,
        payoutPerHitK: options.payoutK,
        defaultBetCount: DEFAULT_BET_COUNT,
        defaultMethodKey: `top${DEFAULT_BET_COUNT}`,
        betCounts
    };
    const settledCount = settleLivePredictions(livePayload, rawData, {
        betCounts,
        stakeK: options.stakeK,
        payoutK: options.payoutK
    });
    const inserted = upsertNextLivePrediction(livePayload, nextPrediction, betCounts);
    livePayload.generatedAt = new Date().toISOString();
    livePayload.latestDataDate = nextPrediction.dataIsoDate;
    livePayload.summary = summarizeLivePredictions(livePayload, betCounts);
    livePayload.notes = [
        LIVE_CACHE_NOTE,
        'Khi predictionIsoDate đã tồn tại, script không ghi đè dàn cũ; riêng snapshot pending chưa có Top 14 được bổ sung đúng một lần khi triển khai.',
        'Các ngày cũ không có Top 14 không được tính vào hiệu quả Top 14.',
        'Công thức Lô: 2200K mỗi số, mỗi hit nhận 8000K.'
    ];

    const cachePayload = {
        generatedAt: new Date().toISOString(),
        latestDataDate: nextPrediction.dataIsoDate,
        config: {
            methodId: nextPrediction.methodId,
            methodName: livePayload.config.methodName,
            logic: 'annualMilestone20y-per-position',
            strategy: nextPrediction.strategy,
            hold: nextPrediction.hold,
            aggregationMode: nextPrediction.aggregationMode || DEFAULT_AGGREGATION_MODE,
            positionCount: PRIZE_KEYS.length,
            positions: PRIZE_KEYS,
            stakePerNumberK: options.stakeK,
            payoutPerHitK: options.payoutK,
            defaultBetCount: DEFAULT_BET_COUNT,
            defaultMethodKey: `top${DEFAULT_BET_COUNT}`,
            betCounts,
            historyMode: 'live-only'
        },
        nextPrediction: preservePublishedNextPrediction(nextPrediction, livePayload),
        livePredictions: {
            generatedAt: livePayload.generatedAt,
            startedAt: livePayload.startedAt,
            latestDataDate: livePayload.latestDataDate,
            config: livePayload.config,
            summary: livePayload.summary,
            predictions: (livePayload.predictions || []).slice(-90)
        },
        notes: [
            LIVE_CACHE_NOTE,
            'Action hằng ngày chỉ settle kết quả thực tế và sinh dàn Lô mới, không chạy backtest nặng.'
        ]
    };

    fs.mkdirSync(statsDir, { recursive: true });
    fs.writeFileSync(livePath, JSON.stringify(livePayload, null, 0), 'utf8');
    fs.writeFileSync(cachePath, JSON.stringify(cachePayload, null, 0), 'utf8');
    console.log(`[LotoMilestone20Y] Cache: ${cachePath}`);
    console.log(`[LotoMilestone20Y] Live: ${livePath} (settled=${settledCount}, inserted=${inserted ? 1 : 0})`);
    return { cachePayload, livePayload };
}

function buildMethodConfigs(strategies, holdCounts) {
    const configs = [];
    for (const strategy of strategies) {
        for (const hold of holdCounts) {
            configs.push({
                id: `${strategy}Hold${hold}`,
                strategy,
                target: hold
            });
        }
    }
    return configs;
}

async function main() {
    const args = parseArgs();
    const monthsList = String(args.get('months') || '1,3,6')
        .split(',')
        .map(value => Math.max(1, Number(value.trim()) || 0))
        .filter(Boolean);
    const maxMonths = Math.max(...monthsList);
    const startDate = args.get('startDate') || null;
    const endDate = args.get('endDate') || null;
    if ((startDate && !endDate) || (!startDate && endDate)) {
        throw new Error('Phải truyền đồng thời --startDate và --endDate.');
    }
    const predictionOnly = args.get('predictionOnly') === '1' || args.get('skipBacktest') === '1';
    const writeCache = args.get('writeCache') === '1' || args.get('cache') === '1';
    const strategies = String(args.get('strategies') || (predictionOnly ? DEFAULT_STRATEGY : 'chainSmallFirst,chainFreqFirst,chainRiskFirst,numberAvgRisk,numberConsensusRisk,numberWeightedRisk,activeOnlyAvgRisk'))
        .split(',')
        .map(value => value.trim())
        .filter(value => annualMilestoneService.STRATEGIES[value]);
    const holdCounts = String(args.get('holds') || (predictionOnly ? String(DEFAULT_HOLD) : '60,65,70,75,80,85'))
        .split(',')
        .map(value => Math.max(1, Math.min(95, Number(value.trim()) || 0)))
        .filter(Boolean);
    const betCounts = String(args.get('betCounts') || DEFAULT_BET_COUNTS.join(','))
        .split(',')
        .map(value => Math.max(1, Math.min(100, Number(value.trim()) || 0)))
        .filter(Boolean);
    const aggregationModes = String(args.get('aggregationModes') || args.get('aggModes') || 'support')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    const selectedPositions = String(args.get('positions') || PRIZE_KEYS.join(','))
        .split(',')
        .map(value => value.trim())
        .filter(value => PRIZE_KEYS.includes(value));
    const positionOutput = args.get('positionOutput') || null;
    const positionInputFiles = String(args.get('positionInputFiles') || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    const predictionAggregationMode = args.get('aggregationMode') || args.get('aggregation') || DEFAULT_AGGREGATION_MODE;
    const includeDetails = args.get('includeDetails') === '1';
    const stakeK = Number(args.get('stakeK') || DEFAULT_STAKE_K);
    const payoutK = Number(args.get('payoutK') || DEFAULT_PAYOUT_K);
    const historyYears = Number(args.get('historyYears') || 20);
    const fixedBaselineYear = args.has('fixedBaselineYear') ? Number(args.get('fixedBaselineYear')) : null;
    const strictPointInTime = args.get('strictPointInTime') !== '0';
    const rawFile = args.get('rawFile') ? path.resolve(args.get('rawFile')) : null;
    const methodConfigs = buildMethodConfigs(strategies, holdCounts);
    if (strictPointInTime && positionInputFiles.length > 0) {
        throw new Error(
            'Strict PIT không nhận positionInputFiles cũ vì cache vị trí có thể được sinh từ full-history. ' +
            'Hãy để script tái sinh prefix theo từng ngày hoặc truyền --strictPointInTime=0 cho nghiên cứu legacy.'
        );
    }
    if (methodConfigs.length === 1 && predictionOnly) {
        methodConfigs[0].id = args.get('method') || DEFAULT_METHOD_ID;
        methodConfigs[0].aggregationMode = predictionAggregationMode;
    }

    let loadedRawData;
    if (rawFile) {
        loadedRawData = readJsonSnapshot(rawFile);
    } else {
        await lotteryService.loadRawData();
        loadedRawData = lotteryService.getRawData() || [];
    }
    const rawData = loadedRawData
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (predictionOnly) {
        const requestedMethod = args.get('method') || '';
        if (requestedMethod === 'rrfSmall65Block75') {
            const rrfPrediction = await buildNextRrfPrediction(rawData, betCounts, {
                historyYears,
                fixedBaselineYear,
                strictPointInTime,
                activeFrequencyLimit: Number(args.get('activeFrequencyLimit') || 0.5),
                recordFrequencyLimit: Number(args.get('recordFrequencyLimit') || 1.1),
                minPotentialCurrentLenForNeverFormed: Number(args.get('minPotentialLen') || 4)
            });
            const nextPredictions = { rrfSmall65Block75: rrfPrediction };
            if (writeCache) {
                writeLiveCachesMulti(nextPredictions, rrfPrediction, rawData, betCounts, { stakeK, payoutK });
            }
            console.log(`[LotoMilestone20Y] Next ${rrfPrediction.predictionIsoDate}: ${rrfPrediction.methodId}`);
            console.table(Object.values(rrfPrediction.predictions || {}).map(item => ({
                method: `top${item.count || item.numbers?.length}`,
                numbers: (item.numbers || []).join(' '),
                overlapNumbers: (item.overlapNumbers || []).join(' ')
            })));
            return;
        }
        const nextPredictions = {};
        for (const methodConfig of methodConfigs) {
            console.log(`[LotoMilestone20Y] Generating prediction for strategy: ${methodConfig.id}...`);
            const pred = await buildNextPrediction(rawData, methodConfig, betCounts, {
                aggregationMode: predictionAggregationMode,
                historyYears,
                fixedBaselineYear,
                strictPointInTime,
                activeFrequencyLimit: Number(args.get('activeFrequencyLimit') || 0.5),
                recordFrequencyLimit: Number(args.get('recordFrequencyLimit') || 1.1),
                minPotentialCurrentLenForNeverFormed: Number(args.get('minPotentialLen') || 4)
            });
            nextPredictions[methodConfig.strategy] = pred;
        }

        // Now, if we have both chainSmallFirst and chainBlockFirst, build the parallelCombined prediction!
        const pSmall = nextPredictions['chainSmallFirst'];
        const pBlock = nextPredictions['chainBlockFirst'];
        let mergedPrediction = null;
        if (pSmall && pBlock) {
            mergedPrediction = buildParallelCombinedPrediction(pSmall, pBlock, betCounts);
            nextPredictions['parallelCombined'] = mergedPrediction;
        }

        // By default, write cache using the parallelCombined strategy (or first available)
        const primaryPrediction = mergedPrediction || Object.values(nextPredictions)[0];
        
        if (writeCache) {
            writeLiveCachesMulti(nextPredictions, primaryPrediction, rawData, betCounts, { stakeK, payoutK });
        }
        console.log(`[LotoMilestone20Y] Next ${primaryPrediction.predictionIsoDate}: ${primaryPrediction.methodId}`);
        console.table(Object.values(primaryPrediction.predictions || {}).map(item => ({
            method: `top${item.count || item.numbers?.length}`,
            numbers: (item.numbers || []).join(' '),
            overlapNumbers: (item.overlapNumbers || item.intersection || []).join(' ')
        })));
        return;
    }
    const targetRows = startDate
        ? getDateRangeRows(rawData, startDate, endDate)
        : getWindowRows(rawData, maxMonths);
    if (targetRows.length === 0) {
        const rawLatestDate = rawData.length ? formatIsoDate(rawData[rawData.length - 1].date) : '-';
        throw new Error(`Không có dữ liệu trong khoảng ${startDate || `${maxMonths} tháng gần nhất`} -> ${endDate || rawLatestDate}.`);
    }
    const targetDates = new Set(targetRows.map(row => formatIsoDate(row.date)));
    console.log(`[LotoMilestone20Y] ${targetRows.length} ngày, ${methodConfigs.length} cấu hình, ${PRIZE_KEYS.length} vị trí.`);

    const byDate = new Map(targetRows.map(row => [formatIsoDate(row.date), {
        date: formatIsoDate(row.date),
        actualCounts: countActualOccurrences(row),
        actualByPosition: Object.fromEntries(PRIZE_KEYS.map(positionKey => [positionKey, normalizeNumber(row[positionKey])])),
        positions: {}
    }]));

    if (positionInputFiles.length > 0) {
        for (const inputFile of positionInputFiles) {
            const payload = readJsonIfExists(path.resolve(inputFile), null);
            if (!payload || !payload.rows) {
                throw new Error(`Position cache không hợp lệ: ${inputFile}`);
            }
            if (
                payload.startDate !== startDate ||
                payload.endDate !== endDate ||
                JSON.stringify(payload.methodConfigs || []) !== JSON.stringify(methodConfigs)
            ) {
                throw new Error(`Position cache không cùng cấu hình backtest: ${inputFile}`);
            }
            for (const [date, positions] of Object.entries(payload.rows)) {
                if (!targetDates.has(date)) continue;
                Object.assign(byDate.get(date).positions, positions || {});
            }
        }
        const missingPositions = PRIZE_KEYS.filter(positionKey =>
            targetRows.some(row => !byDate.get(formatIsoDate(row.date))?.positions?.[positionKey])
        );
        if (missingPositions.length > 0) {
            throw new Error(`Position cache thiếu dữ liệu: ${missingPositions.join(', ')}`);
        }
    } else {
        let positionIndex = 0;
        for (const positionKey of selectedPositions) {
            positionIndex += 1;
            console.log(`[LotoMilestone20Y] ${positionKey} (${positionIndex}/${selectedPositions.length})...`);
            const positionRows = await buildPositionDailyPredictions(rawData, positionKey, targetRows, methodConfigs, {
                historyYears,
                fixedBaselineYear,
                strictPointInTime,
                activeFrequencyLimit: Number(args.get('activeFrequencyLimit') || 0.5),
                recordFrequencyLimit: Number(args.get('recordFrequencyLimit') || 1.1),
                minPotentialCurrentLenForNeverFormed: Number(args.get('minPotentialLen') || 4)
            });
            positionStatsCache.delete(positionKey);
            for (const [date, methods] of positionRows.entries()) {
                if (!targetDates.has(date)) continue;
                byDate.get(date).positions[positionKey] = methods;
            }
        }
    }

    if (positionOutput) {
        const outputPath = path.resolve(positionOutput);
        const payload = {
            generatedAt: new Date().toISOString(),
            startDate,
            endDate,
            methodConfigs,
            positions: positionInputFiles.length > 0 ? PRIZE_KEYS : selectedPositions,
            rows: Object.fromEntries(Array.from(byDate.entries()).map(([date, row]) => [
                date,
                row.positions
            ]))
        };
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(payload), 'utf8');
        console.log(`[LotoMilestone20Y] Position cache: ${outputPath}`);
        return;
    }

    const summariesByWindow = {};
    const dailyDetailsByWindow = {};
    const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

    const windowSpecs = startDate
        ? [{ key: 'dateRange', rows: daily }]
        : monthsList.map(months => ({
            key: `${months}m`,
            rows: daily.slice(-Math.round(months * 30.4375))
        }));

    for (const windowSpec of windowSpecs) {
        const windowRows = windowSpec.rows;
        summariesByWindow[windowSpec.key] = {};
        if (includeDetails) dailyDetailsByWindow[windowSpec.key] = [];
        const calibrationByConfigMode = new Map();
        for (const config of methodConfigs) {
            for (const aggregationMode of aggregationModes) {
                calibrationByConfigMode.set(
                    `${config.id}:${aggregationMode}`,
                    createAggregationCalibration(100 - config.target)
                );
                for (const betCount of betCounts) {
                    const key = `${config.id}:${aggregationMode}:top${betCount}`;
                    summariesByWindow[windowSpec.key][key] = emptySummary(key, betCount, {
                        strategy: config.strategy,
                        hold: config.target,
                        aggregationMode,
                        window: windowSpec.key
                    });
                }
            }
        }
        const parallelEnabled = strategies.includes('chainSmallFirst') && strategies.includes('chainBlockFirst');
        if (parallelEnabled) {
            for (const hold of holdCounts) {
                for (const aggregationMode of aggregationModes) {
                    for (const betCount of betCounts) {
                        const key = `parallelCombinedHold${hold}:${aggregationMode}:top${betCount}`;
                        summariesByWindow[windowSpec.key][key] = emptySummary(key, betCount, {
                            strategy: 'parallelCombined',
                            hold,
                            aggregationMode,
                            window: windowSpec.key
                        });
                    }
                }
            }
        }

        for (const row of windowRows) {
            for (const aggregationMode of aggregationModes) {
                const rankedByConfig = new Map();
                for (const config of methodConfigs) {
                    const positionPredictions = {};
                    for (const [positionKey, methods] of Object.entries(row.positions || {})) {
                        positionPredictions[positionKey] = methods?.[config.id] || [];
                    }
                    const calibrationKey = `${config.id}:${aggregationMode}`;
                    const calibrationState = calibrationByConfigMode.get(calibrationKey);
                    const positionWeights = getCalibratedPositionWeights(calibrationState.positions);
                    const ranked = aggregatePositionPredictions(positionPredictions, {
                        mode: aggregationMode,
                        positionWeights,
                        calibrationState
                    });
                    rankedByConfig.set(config.id, ranked);
                    for (const betCount of betCounts) {
                        const key = `${config.id}:${aggregationMode}:top${betCount}`;
                        const numbers = ranked.slice(0, betCount).map(item => item.number);
                        const result = addResultToSummary(summariesByWindow[windowSpec.key][key], numbers, row.actualCounts, stakeK, payoutK);
                        if (includeDetails) {
                            dailyDetailsByWindow[windowSpec.key].push({
                                date: row.date,
                                methodId: key,
                                strategy: config.strategy,
                                hold: config.target,
                                aggregationMode,
                                betCount,
                                numbers: result.numbers,
                                actualNumbers: [...row.actualCounts.keys()].sort((a, b) => a - b).map(formatNumber),
                                hits: result.hits,
                                stakeK: result.stakeK,
                                payoutK: result.payoutK,
                                profitK: result.profitK,
                                result: result.profitK > 0 ? 'win' : (result.profitK < 0 ? 'loss' : 'flat')
                            });
                        }
                    }
                    updateAggregationCalibration(
                        calibrationState,
                        positionPredictions,
                        row.actualByPosition,
                        row.actualCounts
                    );
                }

                if (parallelEnabled) {
                    for (const hold of holdCounts) {
                        const smallRanked = rankedByConfig.get(`chainSmallFirstHold${hold}`);
                        const blockRanked = rankedByConfig.get(`chainBlockFirstHold${hold}`);
                        if (!smallRanked || !blockRanked) continue;
                        const smallPrediction = {
                            strategy: 'chainSmallFirst',
                            predictions: Object.fromEntries(betCounts.map(count => [`top${count}`, {
                                numbers: smallRanked.slice(0, count).map(item => formatNumber(item.number)),
                                support: smallRanked.slice(0, count).map(item => ({
                                    number: formatNumber(item.number),
                                    supportCount: Number(item.supportCount || item.weightedScore || 0)
                                }))
                            }]))
                        };
                        const blockPrediction = {
                            strategy: 'chainBlockFirst',
                            predictions: Object.fromEntries(betCounts.map(count => [`top${count}`, {
                                numbers: blockRanked.slice(0, count).map(item => formatNumber(item.number)),
                                support: blockRanked.slice(0, count).map(item => ({
                                    number: formatNumber(item.number),
                                    supportCount: Number(item.supportCount || item.weightedScore || 0)
                                }))
                            }]))
                        };
                        const merged = buildParallelCombinedPrediction(smallPrediction, blockPrediction, betCounts);
                        for (const betCount of betCounts) {
                            const key = `parallelCombinedHold${hold}:${aggregationMode}:top${betCount}`;
                            const numbers = merged.predictions[`top${betCount}`]?.numbers || [];
                            const result = addResultToSummary(summariesByWindow[windowSpec.key][key], numbers, row.actualCounts, stakeK, payoutK);
                            if (includeDetails) {
                                dailyDetailsByWindow[windowSpec.key].push({
                                    date: row.date,
                                    methodId: key,
                                    strategy: 'parallelCombined',
                                    hold,
                                    aggregationMode,
                                    betCount,
                                    numbers: result.numbers,
                                    overlapNumbers: merged.predictions[`top${betCount}`]?.overlapNumbers || [],
                                    actualNumbers: [...row.actualCounts.keys()].sort((a, b) => a - b).map(formatNumber),
                                    hits: result.hits,
                                    stakeK: result.stakeK,
                                    payoutK: result.payoutK,
                                    profitK: result.profitK,
                                    result: result.profitK > 0 ? 'win' : (result.profitK < 0 ? 'loss' : 'flat')
                                });
                            }
                        }
                    }
                }
            }
        }

        summariesByWindow[windowSpec.key] = Object.fromEntries(Object.entries(summariesByWindow[windowSpec.key])
            .map(([key, summary]) => [key, finalizeSummary(summary)])
            .sort((a, b) => {
                if (b[1].profitK !== a[1].profitK) return b[1].profitK - a[1].profitK;
                if (b[1].hitRate !== a[1].hitRate) return b[1].hitRate - a[1].hitRate;
                return a[0].localeCompare(b[0]);
            }));
    }

    const latestDate = rawData.length ? formatIsoDate(rawData[rawData.length - 1].date) : null;
    const baselineCutoffDate = fixedBaselineYear
        ? `${fixedBaselineYear - 1}-12-31`
        : 'annual:31/12-before-each-prediction-year';
    const reportConfig = {
        logic: 'annualMilestone20y-per-position',
        historyYears,
        fixedBaselineYear,
        positions: PRIZE_KEYS,
        months: monthsList,
        startDate,
        endDate,
        strategies,
        holdCounts,
        betCounts,
        aggregationModes,
        stakeK,
        payoutK,
        strictPointInTime
    };
    const fingerprint = buildBacktestFingerprint({
        rawData,
        config: reportConfig,
        baselineCutoffDate,
        methodologyVersion: strictPointInTime
            ? 'strict-prefix-point-in-time-loto-v1'
            : 'fast-full-history-index-v1-unsafe',
        sourceFiles: [
            __filename,
            path.join(__dirname, '..', 'lib', 'services', 'annualMilestoneService.js'),
            path.join(__dirname, '..', 'lib', 'services', 'historicalExclusionService.js'),
            path.join(__dirname, '..', 'lib', 'generators', 'statisticsGenerator.js'),
            path.join(__dirname, '..', 'lib', 'generators', 'headTailStatsGenerator.js'),
            path.join(__dirname, '..', 'lib', 'generators', 'sumDifferenceStatsGenerator.js')
        ],
        sourceLabel: rawFile
            ? path.relative(process.cwd(), rawFile)
            : 'lotteryService.loadRawData()'
    });
    const resultSha256 = hashCanonical({
        summariesByWindow,
        ...(includeDetails ? { dailyDetailsByWindow } : {})
    });
    const output = {
        generatedAt: new Date().toISOString(),
        latestDataDate: latestDate,
        baselineCutoffDate,
        fingerprint,
        resultSha256,
        methodology: {
            annualBaseline: 'Mỗi năm dùng baseline kết thúc ngày 31/12 của năm trước.',
            dailyState: strictPointInTime
                ? 'strict-prefix-regenerated-before-each-prediction-per-position'
                : 'fast-full-history-index',
            strictPointInTime,
            eligibleForPromotion: false,
            warning: strictPointInTime
                ? 'Mỗi vị trí và mỗi ngày tái sinh stats/index chỉ từ dữ liệu trước ngày dự đoán.'
                : 'Chỉ mục chuỗi được sinh từ toàn bộ lịch sử rồi truy vấn theo ngày; chỉ dùng report thăm dò.'
        },
        config: reportConfig,
        summariesByWindow,
        ...(includeDetails ? { dailyDetailsByWindow } : {})
    };

    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const jsonPath = path.join(outputDir, `backtest_loto_milestone20y_${stamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf8');

    console.log(`[LotoMilestone20Y] JSON: ${jsonPath}`);
    for (const windowSpec of windowSpecs) {
        const topRows = Object.values(summariesByWindow[windowSpec.key] || {}).slice(0, 12);
        console.log(`\n=== Top ${windowSpec.key} ===`);
        console.table(topRows.map(item => ({
            method: item.methodId,
            agg: item.aggregationMode,
            days: item.days,
            bet: item.betCount,
            wins: item.winDays,
            hitRate: `${(item.hitRate * 100).toFixed(2)}%`,
            hit2: `${(item.atLeast2Rate * 100).toFixed(2)}%`,
            hit3: `${(item.atLeast3Rate * 100).toFixed(2)}%`,
            hits: item.totalHits,
            avgHits: item.avgHitsPerDay.toFixed(2),
            profitK: item.profitK,
            roi: `${(item.roi * 100).toFixed(2)}%`,
            longestWin: item.longestWin,
            longestLoss: item.longestLoss,
            longestUnder2: item.longestUnder2
        })));
    }
}

function buildParallelCombinedPrediction(p1, p2, betCounts) {
    const predictions = {};
    for (const count of betCounts) {
        const key = `top${count}`;
        const l1 = p1.predictions[key]?.numbers || [];
        const l2 = p2.predictions[key]?.numbers || [];
        
        const b1 = new Set(l1.map(Number));
        const b2 = new Set(l2.map(Number));
        
        const support1 = p1.predictions[key]?.support || [];
        const support2 = p2.predictions[key]?.support || [];
        const supportMap = new Map();
        for (const item of support1) {
            const number = Number(item.number);
            if (!Number.isInteger(number)) continue;
            supportMap.set(number, { number, support1: Number(item.supportCount || 0), support2: 0 });
        }
        for (const item of support2) {
            const number = Number(item.number);
            if (!Number.isInteger(number)) continue;
            const current = supportMap.get(number) || { number, support1: 0, support2: 0 };
            current.support2 = Number(item.supportCount || 0);
            supportMap.set(number, current);
        }
        for (const number of new Set([...b1, ...b2])) {
            if (!supportMap.has(number)) supportMap.set(number, { number, support1: 0, support2: 0 });
        }

        // The combined strategy still bets exactly N unique numbers. Numbers
        // present in both source strategies are ranked first and are marked x2
        // for stake/payout accounting; the remaining slots use combined support.
        const rankedCandidates = Array.from(supportMap.values()).sort((left, right) => {
            const leftBoth = b1.has(left.number) && b2.has(left.number) ? 1 : 0;
            const rightBoth = b1.has(right.number) && b2.has(right.number) ? 1 : 0;
            if (rightBoth !== leftBoth) return rightBoth - leftBoth;
            const rightSupport = right.support1 + right.support2;
            const leftSupport = left.support1 + left.support2;
            if (rightSupport !== leftSupport) return rightSupport - leftSupport;
            const rightMembership = Number(b1.has(right.number)) + Number(b2.has(right.number));
            const leftMembership = Number(b1.has(left.number)) + Number(b2.has(left.number));
            if (rightMembership !== leftMembership) return rightMembership - leftMembership;
            return left.number - right.number;
        });
        const selected = rankedCandidates.slice(0, count);
        const selectedSet = new Set(selected.map(item => item.number));
        const intersection = new Set([...b1].filter(number => b2.has(number) && selectedSet.has(number)));
        const numbers = selected.map(item => String(item.number).padStart(2, '0'));
        const intersectionNums = Array.from(intersection).sort((a,b)=>a-b).map(n => String(n).padStart(2, '0'));
        const support = selected.map(item => ({
            number: String(item.number).padStart(2, '0'),
            supportCount: item.support1 + item.support2,
            sourceCount: Number(b1.has(item.number)) + Number(b2.has(item.number)),
            sourceStrategies: [b1.has(item.number) ? p1.strategy : null, b2.has(item.number) ? p2.strategy : null].filter(Boolean)
        }));
        
        predictions[key] = {
            count,
            numbers,
            overlapNumbers: intersectionNums,
            uniqueCount: numbers.length,
            unitCount: numbers.length,
            selectionMode: 'topNCombinedSupport',
            support
        };
    }
    return {
        predictionDate: p1.predictionDate,
        predictionIsoDate: p1.predictionIsoDate,
        dataDate: p1.dataDate,
        dataIsoDate: p1.dataIsoDate,
        methodId: 'parallelCombinedHold65',
        strategy: 'parallelCombined',
        hold: 65,
        aggregationMode: p1.aggregationMode,
        positionCount: p1.positionCount,
        positions: p1.positions,
        predictions
    };
}

function writeLiveCachesMulti(nextPredictions, primaryPrediction, rawData, betCounts, options) {
    const statsDir = path.join(process.cwd(), 'lib', 'data', 'statistics');
    const cachePath = path.join(statsDir, 'cached_loto_prediction.json');
    const livePath = path.join(statsDir, 'cached_loto_live_predictions.json');
    const livePayload = readJsonIfExists(livePath, {
        generatedAt: null,
        startedAt: new Date().toISOString(),
        config: {},
        predictions: []
    });

    livePayload.config = {
        ...(livePayload.config || {}),
        methodId: primaryPrediction.methodId,
        methodName: 'Lô RRF 50/50 - Chuỗi nhỏ Hold 65 + Nhịp block Hold 75 - Top 6/7',
        trackingVersion: LIVE_TRACKING_VERSION,
        aggregationMode: primaryPrediction.aggregationMode || DEFAULT_AGGREGATION_MODE,
        positionCount: PRIZE_KEYS.length,
        positions: PRIZE_KEYS,
        stakePerNumberK: options.stakeK,
        payoutPerHitK: options.payoutK,
        defaultBetCount: DEFAULT_BET_COUNT,
        defaultMethodKey: `top${DEFAULT_BET_COUNT}`,
        betCounts
    };
    const settledCount = settleLivePredictionsMulti(livePayload, rawData, {
        betCounts,
        stakeK: options.stakeK,
        payoutK: options.payoutK
    });
    const inserted = upsertNextLivePredictionMulti(livePayload, nextPredictions, primaryPrediction, betCounts);
    livePayload.generatedAt = new Date().toISOString();
    livePayload.latestDataDate = primaryPrediction.dataIsoDate;
    livePayload.summary = summarizeLivePredictionsMulti(livePayload, betCounts);
    livePayload.notes = [
        LIVE_CACHE_NOTE,
        'Khi predictionIsoDate đã tồn tại, script không ghi đè dàn cũ; riêng snapshot pending được cập nhật multi-strategy.',
        'Chỉ các snapshot RRF mới được tính vào hiệu quả Top 6/7; dàn Lô luôn tính một đơn vị cho mỗi số duy nhất.',
        'Công thức Lô: 2200K mỗi số, mỗi hit nhận 8000K.'
    ];

    const cachePayload = {
        generatedAt: new Date().toISOString(),
        latestDataDate: primaryPrediction.dataIsoDate,
        config: {
            methodId: primaryPrediction.methodId,
            methodName: livePayload.config.methodName,
            logic: 'annualMilestone20y-rrf-50-50-per-position',
            strategy: primaryPrediction.strategy,
            hold: primaryPrediction.hold,
            aggregationMode: primaryPrediction.aggregationMode || DEFAULT_AGGREGATION_MODE,
            positionCount: PRIZE_KEYS.length,
            positions: PRIZE_KEYS,
            stakePerNumberK: options.stakeK,
            payoutPerHitK: options.payoutK,
            defaultBetCount: DEFAULT_BET_COUNT,
            defaultMethodKey: `top${DEFAULT_BET_COUNT}`,
            betCounts,
            historyMode: 'live-only'
        },
        nextPrediction: {
            predictionDate: primaryPrediction.predictionDate,
            predictionIsoDate: primaryPrediction.predictionIsoDate,
            dataDate: primaryPrediction.dataDate,
            dataIsoDate: primaryPrediction.dataIsoDate,
            strategies: Object.fromEntries(
                Object.entries(nextPredictions).map(([stratId, pred]) => [
                    stratId,
                    {
                        methodId: pred.methodId,
                        strategy: pred.strategy,
                        predictions: pred.predictions
                    }
                ])
            )
        },
        livePredictions: {
            generatedAt: livePayload.generatedAt,
            startedAt: livePayload.startedAt,
            latestDataDate: livePayload.latestDataDate,
            config: livePayload.config,
            summary: livePayload.summary,
            predictions: (livePayload.predictions || []).slice(-90)
        },
        notes: [
            LIVE_CACHE_NOTE,
            'Action hằng ngày tự động kết toán và cập nhật dự đoán Lô RRF Top 6/7.'
        ]
    };
    fs.writeFileSync(livePath, JSON.stringify(livePayload, null, 0), 'utf8');
    fs.writeFileSync(cachePath, JSON.stringify(cachePayload, null, 0), 'utf8');
    console.log(`[LotoMilestone20Y] RRF caches successfully written to: ${cachePath} & ${livePath}`);
}

function settleLivePredictionsMulti(livePayload, rawData, options) {
    const actualByDate = buildActualLookup(rawData);
    let settledCount = 0;
    for (const item of livePayload.predictions || []) {
        const predictionIsoDate = item.predictionIsoDate || formatIsoDate(item.predictionDate);
        if (!predictionIsoDate) continue;
        item.predictionIsoDate = predictionIsoDate;
        const actual = actualByDate.get(predictionIsoDate);
        if (!actual) {
            item.status = item.status || 'pending';
            continue;
        }

        const wasSettled = item.status === 'settled';
        item.status = 'settled';
        item.settledAt = item.settledAt || new Date().toISOString();
        item.actual = actual.actualText;
        
        if (item.strategies) {
            for (const [stratId, stratObj] of Object.entries(item.strategies)) {
                stratObj.methods = stratObj.methods || {};
                for (const betCount of options.betCounts) {
                    const key = `top${betCount}`;
                    if (!stratObj.predictions?.[key]) continue;
                    stratObj.methods[key] = evaluateNumbers(
                        stratObj.predictions[key].numbers || [],
                        actual.counts,
                        options.stakeK,
                        options.payoutK,
                        stratObj.predictions[key].overlapNumbers || stratObj.predictions[key].intersection || []
                    );
                }
            }
        }
        
        item.methods = item.methods || {};
        for (const betCount of options.betCounts) {
            const key = `top${betCount}`;
            if (item.strategies?.['rrfSmall65Block75']?.methods?.[key]) {
                item.methods[key] = item.strategies['rrfSmall65Block75'].methods[key];
            } else if (item.predictions?.[key]) {
                item.methods[key] = evaluateNumbers(
                    item.predictions[key].numbers || [],
                    actual.counts,
                    options.stakeK,
                    options.payoutK,
                    item.predictions[key].overlapNumbers || item.predictions[key].intersection || []
                );
            }
        }
        if (!wasSettled) settledCount += 1;
    }
    return settledCount;
}

function upsertNextLivePredictionMulti(livePayload, nextPredictions, primaryPrediction, betCounts) {
    if (!primaryPrediction?.predictionIsoDate) return false;
    const record = {
        type: 'real',
        status: 'pending',
        createdAt: new Date().toISOString(),
        dataDate: primaryPrediction.dataDate,
        dataIsoDate: primaryPrediction.dataIsoDate,
        predictionDate: primaryPrediction.predictionDate,
        predictionIsoDate: primaryPrediction.predictionIsoDate,
        methodId: primaryPrediction.methodId,
        trackingVersion: LIVE_TRACKING_VERSION,
        positionCount: primaryPrediction.positionCount,
        predictions: primaryPrediction.predictions || buildPredictionSetsFromRanked(primaryPrediction.ranked || [], betCounts),
        positionPredictions: primaryPrediction.positionPredictions || [],
        strategies: Object.fromEntries(
            Object.entries(nextPredictions).map(([stratId, pred]) => [
                stratId,
                {
                    methodId: pred.methodId,
                    strategy: pred.strategy,
                    predictions: pred.predictions
                }
            ])
        )
    };

    livePayload.predictions = Array.isArray(livePayload.predictions) ? livePayload.predictions : [];
    const existingIndex = livePayload.predictions.findIndex(item => item.predictionIsoDate === record.predictionIsoDate);
    if (existingIndex < 0) {
        livePayload.predictions.push(record);
        return true;
    }

    const existing = livePayload.predictions[existingIndex];
    if (existing.status === 'settled') return false;

    livePayload.predictions[existingIndex] = {
        ...existing,
        ...record,
        replacedAt: new Date().toISOString(),
        replacedMethodId: existing.methodId || null
    };
    console.log(`[LotoMilestone20Y] Replaced pending snapshot for ${record.predictionIsoDate}.`);
    return true;
}

function summarizeLivePredictionsMulti(livePayload, betCounts) {
    const summary = {};
    const settled = (livePayload.predictions || []).filter(item => item.status === 'settled');
    const strategyKeys = ['rrfSmall65Block75'];
    
    for (const stratId of strategyKeys) {
        for (const betCount of betCounts) {
            const key = `top${betCount}`;
            const summaryKey = `${stratId}_${key}`;
            const row = emptySummary(summaryKey, betCount);
            
            for (const item of settled) {
                let method = null;
                if (item.strategies?.[stratId]?.methods?.[key]) {
                    method = item.strategies[stratId].methods[key];
                } else if (stratId === 'rrfSmall65Block75' && item.methods?.[key]) {
                    method = item.methods[key];
                }
                
                if (!method) continue;
                row.days += 1;
                if (method.profitK > 0) row.winDays += 1;
                if (method.profitK < 0) row.lossDays += 1;
                if ((method.hits || 0) > 0) row.hitDays += 1;
                row.totalHits += method.hits || 0;
                row.stakeK += method.stakeK || 0;
                row.payoutK += method.payoutK || 0;
                row.profitK += method.profitK || 0;
                row.bestDayProfitK = row.bestDayProfitK === null ? method.profitK : Math.max(row.bestDayProfitK, method.profitK);
                row.worstDayProfitK = row.worstDayProfitK === null ? method.profitK : Math.min(row.worstDayProfitK, method.profitK);
                updateWinLossStreak(row, method.profitK || 0);
            }
            
            const finalized = finalizeSummary(row);
            summary[summaryKey] = {
                ...finalized,
                wins: finalized.winDays,
                losses: finalized.lossDays
            };
        }
    }
    
    for (const betCount of betCounts) {
        const key = `top${betCount}`;
        if (summary[`rrfSmall65Block75_${key}`]) {
            summary[key] = {
                ...summary[`rrfSmall65Block75_${key}`],
                methodId: key
            };
        }
    }
    return summary;
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    aggregatePositionPredictions,
    buildNumberItems,
    createAggregationCalibration,
    getPositionPosteriorItems,
    updateAggregationCalibration
};
