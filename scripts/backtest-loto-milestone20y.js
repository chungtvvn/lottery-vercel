#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const generateNumberStats = require('../lib/generators/statisticsGenerator');
const generateHeadTailStats = require('../lib/generators/headTailStatsGenerator');
const generateSumDiffStats = require('../lib/generators/sumDifferenceStatsGenerator');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');

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
const DEFAULT_STAKE_K = 2300;
const DEFAULT_PAYOUT_K = 8000;
const DEFAULT_METHOD_ID = 'milestone20yChainSmallFirstHold65TwoHitGreedy';
const DEFAULT_STRATEGY = 'chainSmallFirst';
const DEFAULT_HOLD = 65;
const DEFAULT_AGGREGATION_MODE = 'twoHitGreedy';
const LIVE_CACHE_NOTE = 'Mỗi vị trí dùng Mốc 20 năm chainSmallFirst Hold 65; tổng hợp bằng Two-hit Greedy để ưu tiên dàn 3/4/5/6/7 số có xác suất đạt từ 2 hit/ngày cao hơn.';

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
            const penalty = options.diversify ? diversityPenalty(item, selected) : 0;
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

function aggregatePositionPredictions(positionPredictions, options = {}) {
    const mode = options.mode || 'support';
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

function createPositionCalibration() {
    return new Map(PRIZE_KEYS.map(positionKey => [positionKey, {
        trials: 20,
        hits: 5
    }]));
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

function getWindowRows(rawData, months) {
    const days = Math.round(Number(months) * 30.4375);
    return rawData.slice(-days);
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

function evaluateNumbers(numbers, actualCounts, stakeK, payoutK) {
    const selected = (numbers || []).map(normalizeNumber).filter(value => value !== null);
    const hits = selected.reduce((sum, number) => sum + (actualCounts.get(number) || 0), 0);
    const stakeTotalK = selected.length * stakeK;
    const payoutTotalK = hits * payoutK;
    const profitK = payoutTotalK - stakeTotalK;
    return {
        betNumbers: selected.map(formatNumber),
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
            item.methods[key] = evaluateNumbers(
                item.predictions?.[key]?.numbers || [],
                actual.counts,
                options.stakeK,
                options.payoutK
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
        positionCount: nextPrediction.positionCount,
        predictions: buildPredictionSetsFromRanked(nextPrediction.ranked || [], betCounts),
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

async function buildPositionDailyPredictions(rawData, positionKey, targetRows, methodConfigs, options) {
    const positionData = toPositionData(rawData, positionKey);
    const stats = await buildStatsForPosition(positionData);
    lotteryService.__setInMemoryCachesForBacktest({
        rawData: positionData,
        ...stats
    });
    historicalExclusionService.clearCache();
    const entries = buildStatsIndexFromLoadedStats();
    const baselineByYear = new Map();
    const rows = new Map();

    for (const rawDay of targetRows) {
        const date = parseIsoDate(rawDay.date);
        if (!date) continue;
        const year = date.getFullYear();
        if (!baselineByYear.has(year)) {
            baselineByYear.set(year, annualMilestoneService.buildAnnualBaseline(entries, year, {
                historyYears: options.historyYears,
                writeBaseline: false
            }));
        }
        const baseline = baselineByYear.get(year);
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
        methodName: 'Mốc 20 năm - Chuỗi nhỏ trước Hold 65 - Two-hit Greedy',
        aggregationMode: nextPrediction.aggregationMode || DEFAULT_AGGREGATION_MODE,
        positionCount: PRIZE_KEYS.length,
        positions: PRIZE_KEYS,
        stakePerNumberK: options.stakeK,
        payoutPerHitK: options.payoutK,
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
        'Khi predictionIsoDate đã tồn tại, script không ghi đè dàn cũ; chỉ cập nhật kết quả khi có KQ thật.',
        'Công thức Lô: 2300K mỗi số, mỗi hit nhận 8000K.'
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
    const betCounts = String(args.get('betCounts') || '3,4,5,6,7')
        .split(',')
        .map(value => Math.max(1, Math.min(20, Number(value.trim()) || 0)))
        .filter(Boolean);
    const aggregationModes = String(args.get('aggregationModes') || args.get('aggModes') || 'support')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    const predictionAggregationMode = args.get('aggregationMode') || args.get('aggregation') || DEFAULT_AGGREGATION_MODE;
    const stakeK = Number(args.get('stakeK') || DEFAULT_STAKE_K);
    const payoutK = Number(args.get('payoutK') || DEFAULT_PAYOUT_K);
    const historyYears = Number(args.get('historyYears') || 20);
    const methodConfigs = buildMethodConfigs(strategies, holdCounts);
    if (methodConfigs.length === 1 && predictionOnly) {
        methodConfigs[0].id = args.get('method') || DEFAULT_METHOD_ID;
        methodConfigs[0].aggregationMode = predictionAggregationMode;
    }

    await lotteryService.loadRawData();
    const rawData = (lotteryService.getRawData() || [])
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (predictionOnly) {
        const methodConfig = methodConfigs[0];
        const nextPrediction = await buildNextPrediction(rawData, methodConfig, betCounts, {
            aggregationMode: predictionAggregationMode,
            historyYears,
            activeFrequencyLimit: Number(args.get('activeFrequencyLimit') || 0.5),
            recordFrequencyLimit: Number(args.get('recordFrequencyLimit') || 1.1),
            minPotentialCurrentLenForNeverFormed: Number(args.get('minPotentialLen') || 4)
        });
        if (writeCache) {
            writeLiveCaches(nextPrediction, rawData, betCounts, { stakeK, payoutK });
        }
        console.log(`[LotoMilestone20Y] Next ${nextPrediction.predictionIsoDate}: ${nextPrediction.methodId}`);
        console.table(Object.values(nextPrediction.predictions || {}).map(item => ({
            method: `top${item.count}`,
            numbers: (item.numbers || []).join(' '),
            support: (item.support || []).map(row => `${row.number}:${row.supportCount}`).join(' ')
        })));
        return;
    }
    const targetRows = getWindowRows(rawData, maxMonths);
    const targetDates = new Set(targetRows.map(row => formatIsoDate(row.date)));
    console.log(`[LotoMilestone20Y] ${targetRows.length} ngày, ${methodConfigs.length} cấu hình, ${PRIZE_KEYS.length} vị trí.`);

    const byDate = new Map(targetRows.map(row => [formatIsoDate(row.date), {
        date: formatIsoDate(row.date),
        actualCounts: countActualOccurrences(row),
        actualByPosition: Object.fromEntries(PRIZE_KEYS.map(positionKey => [positionKey, normalizeNumber(row[positionKey])])),
        positions: {}
    }]));

    let positionIndex = 0;
    for (const positionKey of PRIZE_KEYS) {
        positionIndex += 1;
        console.log(`[LotoMilestone20Y] ${positionKey} (${positionIndex}/${PRIZE_KEYS.length})...`);
        const positionRows = await buildPositionDailyPredictions(rawData, positionKey, targetRows, methodConfigs, {
            historyYears,
            activeFrequencyLimit: Number(args.get('activeFrequencyLimit') || 0.5),
            recordFrequencyLimit: Number(args.get('recordFrequencyLimit') || 1.1),
            minPotentialCurrentLenForNeverFormed: Number(args.get('minPotentialLen') || 4)
        });
        for (const [date, methods] of positionRows.entries()) {
            if (!targetDates.has(date)) continue;
            byDate.get(date).positions[positionKey] = methods;
        }
    }

    const summariesByWindow = {};
    const daily = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

    for (const months of monthsList) {
        const windowRows = daily.slice(-Math.round(months * 30.4375));
        summariesByWindow[`${months}m`] = {};
        const calibrationByConfigMode = new Map();
        for (const config of methodConfigs) {
            for (const aggregationMode of aggregationModes) {
                calibrationByConfigMode.set(`${config.id}:${aggregationMode}`, createPositionCalibration());
                for (const betCount of betCounts) {
                    const key = `${config.id}:${aggregationMode}:top${betCount}`;
                    summariesByWindow[`${months}m`][key] = emptySummary(key, betCount, {
                        strategy: config.strategy,
                        hold: config.target,
                        aggregationMode,
                        window: `${months}m`
                    });
                }
            }
        }

        for (const row of windowRows) {
            for (const config of methodConfigs) {
                const positionPredictions = {};
                for (const [positionKey, methods] of Object.entries(row.positions || {})) {
                    positionPredictions[positionKey] = methods?.[config.id] || [];
                }
                for (const aggregationMode of aggregationModes) {
                    const calibrationKey = `${config.id}:${aggregationMode}`;
                    const positionWeights = getCalibratedPositionWeights(calibrationByConfigMode.get(calibrationKey));
                    const ranked = aggregatePositionPredictions(positionPredictions, {
                        mode: aggregationMode,
                        positionWeights
                    });
                    for (const betCount of betCounts) {
                        const key = `${config.id}:${aggregationMode}:top${betCount}`;
                        const numbers = ranked.slice(0, betCount).map(item => item.number);
                        addResultToSummary(summariesByWindow[`${months}m`][key], numbers, row.actualCounts, stakeK, payoutK);
                    }
                    updatePositionCalibration(calibrationByConfigMode.get(calibrationKey), positionPredictions, row.actualByPosition);
                }
            }
        }

        summariesByWindow[`${months}m`] = Object.fromEntries(Object.entries(summariesByWindow[`${months}m`])
            .map(([key, summary]) => [key, finalizeSummary(summary)])
            .sort((a, b) => {
                if (b[1].profitK !== a[1].profitK) return b[1].profitK - a[1].profitK;
                if (b[1].hitRate !== a[1].hitRate) return b[1].hitRate - a[1].hitRate;
                return a[0].localeCompare(b[0]);
            }));
    }

    const latestDate = rawData.length ? formatIsoDate(rawData[rawData.length - 1].date) : null;
    const output = {
        generatedAt: new Date().toISOString(),
        latestDataDate: latestDate,
        config: {
            logic: 'annualMilestone20y-per-position',
            historyYears,
            positions: PRIZE_KEYS,
            months: monthsList,
            strategies,
            holdCounts,
            betCounts,
            aggregationModes,
            stakeK,
            payoutK
        },
        summariesByWindow
    };

    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const jsonPath = path.join(outputDir, `backtest_loto_milestone20y_${stamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf8');

    console.log(`[LotoMilestone20Y] JSON: ${jsonPath}`);
    for (const months of monthsList) {
        const topRows = Object.values(summariesByWindow[`${months}m`] || {}).slice(0, 12);
        console.log(`\n=== Top ${months} tháng ===`);
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

main().catch(error => {
    console.error(error);
    process.exit(1);
});
