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
const DEFAULT_METHOD_ID = 'milestone20yChainSmallFirstHold65';
const DEFAULT_STRATEGY = 'chainSmallFirst';
const DEFAULT_HOLD = 65;
const LIVE_CACHE_NOTE = 'Mỗi vị trí dùng Mốc 20 năm chainSmallFirst Hold 65; cộng đồng thuận 27 vị trí rồi chọn top 3/4/5/6/7 số.';

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
    const { currentStreakType, currentStreakLength, ...rest } = summary;
    return {
        ...rest,
        hitRate: rest.days ? rest.hitDays / rest.days : 0,
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
                supportCount: item.positions.length,
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

    const ranked = aggregateBySupport(byPosition);
    return {
        generatedAt: new Date().toISOString(),
        dataDate: formatDisplayDate(latestDate),
        dataIsoDate: formatIsoDate(latestDate),
        predictionDate: formatDisplayDate(predictionDate),
        predictionIsoDate: formatIsoDate(predictionDate),
        methodId: methodConfig.id,
        strategy: methodConfig.strategy,
        hold: methodConfig.target,
        positionCount: PRIZE_KEYS.length,
        positions: PRIZE_KEYS,
        positionPredictions,
        ranked: ranked.map(item => ({
            number: formatNumber(item.number),
            supportCount: item.positions.length,
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
        methodName: 'Mốc 20 năm - Chuỗi nhỏ trước Hold 65',
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
    const stakeK = Number(args.get('stakeK') || DEFAULT_STAKE_K);
    const payoutK = Number(args.get('payoutK') || DEFAULT_PAYOUT_K);
    const historyYears = Number(args.get('historyYears') || 20);
    const methodConfigs = buildMethodConfigs(strategies, holdCounts);
    if (methodConfigs.length === 1 && predictionOnly) {
        methodConfigs[0].id = args.get('method') || DEFAULT_METHOD_ID;
    }

    await lotteryService.loadRawData();
    const rawData = (lotteryService.getRawData() || [])
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (predictionOnly) {
        const methodConfig = methodConfigs[0];
        const nextPrediction = await buildNextPrediction(rawData, methodConfig, betCounts, {
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
        for (const config of methodConfigs) {
            for (const betCount of betCounts) {
                const key = `${config.id}:top${betCount}`;
                summariesByWindow[`${months}m`][key] = emptySummary(key, betCount, {
                    strategy: config.strategy,
                    hold: config.target,
                    window: `${months}m`
                });
            }
        }

        for (const row of windowRows) {
            for (const config of methodConfigs) {
                const positionPredictions = {};
                for (const [positionKey, methods] of Object.entries(row.positions || {})) {
                    positionPredictions[positionKey] = methods?.[config.id] || [];
                }
                const ranked = aggregateBySupport(positionPredictions);
                for (const betCount of betCounts) {
                    const key = `${config.id}:top${betCount}`;
                    const numbers = ranked.slice(0, betCount).map(item => item.number);
                    addResultToSummary(summariesByWindow[`${months}m`][key], numbers, row.actualCounts, stakeK, payoutK);
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
            days: item.days,
            bet: item.betCount,
            wins: item.winDays,
            hitRate: `${(item.hitRate * 100).toFixed(2)}%`,
            hits: item.totalHits,
            profitK: item.profitK,
            roi: `${(item.roi * 100).toFixed(2)}%`,
            longestWin: item.longestWin,
            longestLoss: item.longestLoss
        })));
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
