'use strict';

// Daily relative-probability ranking. This service intentionally keeps the
// information set before predictionDate and never treats a score as a
// calibrated absolute probability of a lottery outcome.

const fs = require('fs');
const path = require('path');
const { scoringForms } = require('../utils/lotteryScoring');
const {
    DEFAULTS: MODEL_DEFAULTS,
    buildGroupCatalog: buildModelGroupCatalog,
    runOnlineModel,
    rankNumbers,
    wilsonLower
} = require('./probabilityScoreModel');

const NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = 30;
const LOOKBACK_DRAWS = MODEL_DEFAULTS.groupWindow;
const SHORT_WINDOW_DRAWS = MODEL_DEFAULTS.shortWindow;
const CACHE_VERSION = 'probability-score-v2';
const LOCAL_CACHE_FILE = path.join(__dirname, '..', 'data', 'statistics', 'cached_probability_score.json');
const LOCAL_HISTORY_FILE = path.join(__dirname, '..', 'data', 'statistics', 'cached_prediction_history.json');

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function nextIsoDate(value) {
    const date = new Date(`${isoDate(value)}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number).filter(number => Number.isInteger(number) && number >= 0 && number < 100))]
        .sort((left, right) => left - right);
}

function readRawRows(rawRows) {
    return (rawRows || []).map(row => {
        const source = row?.actual ?? row?.special ?? row?.db ?? row?.giaiDb ?? row?.giai_dac_biet;
        const actual = source === null || source === undefined || source === '' ? null : Number(source);
        return { date: isoDate(row?.date || row?.ngay), actual };
    }).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isInteger(row.actual) && row.actual >= 0 && row.actual < 100)
        .sort((left, right) => left.date.localeCompare(right.date));
}

function buildGroupCatalog() {
    // Singleton forms and broad, overlapping supersets made score v1 count
    // the same evidence repeatedly. v2 keeps only deduplicated 4-50 number
    // groups, then limits correlated groups again at scoring time.
    return buildModelGroupCatalog(scoringForms);
}

let groupCatalog = null;
function getGroupCatalog() {
    if (!groupCatalog) groupCatalog = buildGroupCatalog();
    return groupCatalog;
}

function percentile(values, descending = true) {
    const result = Array(values.length).fill(0.5);
    const ranked = values.map((value, index) => ({ value: Number(value) || 0, index }))
        .sort((left, right) => descending ? right.value - left.value || left.index - right.index : left.value - right.value || left.index - right.index);
    const denominator = Math.max(1, ranked.length - 1);
    ranked.forEach((row, rank) => { result[row.index] = 1 - rank / denominator; });
    return result;
}

function getPriorRows(rawRows, targetDate) {
    return rawRows.filter(row => row.date < targetDate);
}

function calculateGapFeatures(priorRows) {
    const occurrenceIndexes = Array.from({ length: 100 }, () => []);
    priorRows.forEach((row, index) => occurrenceIndexes[row.actual].push(index));
    return NUMBERS.map(number => {
        const positions = occurrenceIndexes[number];
        const gap = positions.length ? priorRows.length - 1 - positions.at(-1) : priorRows.length;
        const historicalGaps = positions.slice(1).map((position, index) => position - positions[index - 1]);
        const sorted = historicalGaps.slice().sort((left, right) => left - right);
        const medianGap = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 100;
        return Math.min(4, gap / Math.max(1, medianGap));
    });
}

function calculateGroupDeficit(priorRows, catalog, windowSize) {
    const window = priorRows.slice(-windowSize);
    const counts = Array(catalog.groups.length).fill(0);
    for (const row of window) {
        for (const groupId of catalog.byNumber[row.actual]) counts[groupId] += 1;
    }
    const groupZ = catalog.groups.map((group, groupId) => {
        const expected = window.length * group.probability;
        const variance = Math.max(1, expected * (1 - group.probability));
        return (expected - counts[groupId]) / Math.sqrt(variance);
    });
    const perNumber = NUMBERS.map(number => {
        const top = catalog.byNumber[number].map(groupId => ({ groupId, value: groupZ[groupId] }))
            .sort((left, right) => right.value - left.value)
            .slice(0, 3);
        return {
            value: top.length ? top.reduce((sum, row) => sum + row.value, 0) / top.length : 0,
            groups: top.map(row => ({
                label: catalog.groups[row.groupId].label,
                deficitZ: Number(row.value.toFixed(3)),
                size: catalog.groups[row.groupId].numbers.length
            }))
        };
    });
    return { windowSize: window.length, values: perNumber, groupZ };
}

function calculateFrequencyDeficit(priorRows, windowSize) {
    const window = priorRows.slice(-windowSize);
    const counts = Array(100).fill(0);
    window.forEach(row => { counts[row.actual] += 1; });
    const expected = window.length / 100;
    const variance = Math.max(1, expected * 0.99);
    return {
        windowSize: window.length,
        values: counts.map(count => (expected - count) / Math.sqrt(variance))
    };
}

function methodNumberSets(historyRun) {
    const methods = historyRun?.summary?.methods || {};
    const unique = new Map();
    for (const [methodId, method] of Object.entries(methods)) {
        const numbers = normalizeNumbers(method?.numbersToBet || method?.betNumbers || method?.numbers);
        if (numbers.length < 10 || numbers.length >= 100) continue;
        const signature = numbers.join(',');
        if (!unique.has(signature)) unique.set(signature, { methodId, numbers });
    }
    return [...unique.values()];
}

function calculateChainConsensus(historyRun) {
    const sets = methodNumberSets(historyRun);
    const counts = Array(100).fill(0);
    sets.forEach(set => set.numbers.forEach(number => { counts[number] += 1; }));
    return {
        methods: sets.map(set => set.methodId),
        values: counts.map(count => sets.length ? count / sets.length : 0),
        counts
    };
}

function actualForHistoryRun(run) {
    const candidates = [
        run?.summary?.actualSpecial,
        run?.actualSpecial,
        run?.summary?.actual,
        run?.actual,
        run?.summary?.result
    ];
    // Number(null) is 0, so blank historical fields must not be interpreted as
    // a valid "00" result while evaluating a prior immutable snapshot.
    const value = candidates
        .filter(candidate => candidate !== null && candidate !== undefined && candidate !== '')
        .map(Number)
        .find(number => Number.isInteger(number) && number >= 0 && number < 100);
    return Number.isInteger(value) ? value : null;
}

function numbersForHistoryMethod(run, methodId) {
    const method = run?.summary?.methods?.[methodId];
    if (!method) return [];
    return normalizeNumbers(method?.numbersToBet || method?.betNumbers || method?.numbers);
}

// A candidate-chain set is only allowed to influence score v2 after its own
// prior immutable snapshots show an edge beyond the size of its bet set. This
// avoids treating a large collection of correlated chain labels as evidence.
function calculateReliableChainConsensus(historyRun, history, targetDate) {
    const currentSets = methodNumberSets(historyRun);
    const priorRuns = (history || []).filter(run => {
        const date = isoDate(run?.predictionDate || run?.summary?.predictionDate);
        return date && date < targetDate && Number.isInteger(actualForHistoryRun(run));
    });
    const evidenceByNumber = Array.from({ length: 100 }, () => []);
    const methodEvidence = currentSets.map(current => {
        let wins = 0;
        let total = 0;
        let baselineSum = 0;
        for (const run of priorRuns) {
            const actual = actualForHistoryRun(run);
            const priorNumbers = numbersForHistoryMethod(run, current.methodId);
            if (actual === null || priorNumbers.length < 10 || priorNumbers.length >= 100) continue;
            total += 1;
            baselineSum += priorNumbers.length / 100;
            if (priorNumbers.includes(actual)) wins += 1;
        }
        const baseline = total ? baselineSum / total : current.numbers.length / 100;
        const posterior = (wins + baseline * 20) / (total + 20);
        const lower = wilsonLower(wins, total);
        const reliability = total >= 20
            ? Math.min(1, total / 60) * Math.max(0, (posterior - baseline) / 0.12)
            : 0;
        return {
            ...current,
            total,
            wins,
            baseline,
            posterior,
            wilsonLower: lower,
            reliability: Number(reliability.toFixed(4))
        };
    }).filter(item => item.reliability >= 0.08);

    const totalWeight = methodEvidence.reduce((sum, item) => sum + item.reliability, 0);
    const values = Array(100).fill(0);
    if (totalWeight > 0) {
        methodEvidence.forEach(item => item.numbers.forEach(number => {
            values[number] += item.reliability / totalWeight;
            evidenceByNumber[number].push({
                methodId: item.methodId,
                samples: item.total,
                posterior: Number(item.posterior.toFixed(3)),
                lower: Number(item.wilsonLower.toFixed(3))
            });
        }));
    }
    return {
        methods: methodEvidence.map(item => item.methodId),
        effectiveMethods: methodEvidence.length,
        values,
        evidenceByNumber,
        methodEvidence
    };
}

function buildScoreSnapshot({ rawRows, predictionDate, historyRun, history = [], createdAt = new Date().toISOString() }) {
    const targetDate = isoDate(predictionDate);
    const rows = readRawRows(rawRows);
    const targetIndex = rows.findIndex(row => row.date >= targetDate);
    const priorLength = targetIndex === -1 ? rows.length : targetIndex;
    if (priorLength < MODEL_DEFAULTS.minWarmup) {
        throw new Error(`Không đủ dữ liệu trước ${targetDate} để chấm điểm v2.`);
    }

    const catalog = getGroupCatalog();
    const reliableConsensus = calculateReliableChainConsensus(historyRun, history, targetDate);
    const model = runOnlineModel(rows, priorLength, catalog, { betCount: BET_COUNT });
    const rankedNumbers = rankNumbers(model, reliableConsensus, BET_COUNT);
    const actual = rows.find(row => row.date === targetDate)?.actual;
    const hasReliableConsensus = reliableConsensus.effectiveMethods >= 2;
    const selectedGroups = (model.matrix.group.selected || []).map(group => ({
        label: group.label,
        aliases: group.aliases || [],
        family: group.family,
        size: group.size,
        residualZ: Number(group.z.toFixed(3)),
        direction: group.z >= 0 ? 'cao hơn kỳ vọng' : 'thấp hơn kỳ vọng'
    })).sort((left, right) => Math.abs(right.residualZ) - Math.abs(left.residualZ));
    const calibration = model.calibration;
    const researchGate = calibration.eligible
        ? 'đủ điều kiện ứng viên, vẫn cần xác nhận ở ít nhất hai holdout độc lập'
        : 'chỉ theo dõi nghiên cứu; chưa đủ bằng chứng để tự động thay thế phương pháp thực chiến';

    return {
        modelVersion: CACHE_VERSION,
        predictionDate: targetDate,
        sourceDataThrough: rows[priorLength - 1]?.date || null,
        generatedAt: createdAt,
        lifecycle: 'live-issued',
        pointInTimeLocked: true,
        scoreDefinition: {
            kind: 'online-calibrated-relative-ranking-v2',
            warning: 'Điểm là thứ hạng tương đối giữa 100 số. Xác suất chỉ được dùng để kiểm định calibration, không phải cam kết kết quả.',
            weights: hasReliableConsensus
                ? { onlineModel: 0.88, chainConsensus: 0.12 }
                : { onlineModel: 1, chainConsensus: 0 },
            windows: {
                groupDeficit: model.config.groupWindow,
                frequencyDeficit: model.config.shortWindow,
                training: model.trainingDays,
                calibration: calibration.days
            },
            featureFamilies: ['nhóm số khử tương quan', 'tần suất empirical-Bayes', 'hazard gap làm mượt', 'đồng thuận chuỗi có kiểm chứng'],
            groupCatalog: catalog.config,
            chainMethodCount: reliableConsensus.effectiveMethods,
            chainMethods: reliableConsensus.methods,
            researchGate,
            calibration
        },
        model: {
            weights: model.weights,
            trainingDays: model.trainingDays,
            calibration,
            reliableChainMethods: reliableConsensus.methodEvidence.map(item => ({
                methodId: item.methodId,
                samples: item.total,
                hitRate: item.total ? Number((item.wins / item.total).toFixed(4)) : 0,
                baseline: Number(item.baseline.toFixed(4)),
                posterior: Number(item.posterior.toFixed(4)),
                wilsonLower: Number(item.wilsonLower.toFixed(4))
            }))
        },
        topNumbers: rankedNumbers.slice(0, BET_COUNT),
        rankedNumbers,
        groupSignals: selectedGroups,
        settled: Number.isInteger(actual),
        actual: Number.isInteger(actual) ? actual : null,
        hit: Number.isInteger(actual) ? rankedNumbers.slice(0, BET_COUNT).some(row => row.number === actual) : null
    };
}

function settleSnapshot(snapshot, rawRows) {
    const actual = rawRows.find(row => row.date === isoDate(snapshot?.predictionDate))?.actual;
    if (!Number.isInteger(actual) || snapshot?.settled) return snapshot;
    return {
        ...snapshot,
        settled: true,
        actual,
        hit: (snapshot.topNumbers || []).some(row => Number(row.number) === actual)
    };
}

function findHistoryRun(history, date) {
    return (history || []).find(run => isoDate(run?.predictionDate || run?.summary?.predictionDate) === date) || null;
}

function summarize(records) {
    const v2Records = records.filter(record => record?.modelVersion === CACHE_VERSION);
    const settled = v2Records.filter(record => record.settled);
    const wins = settled.filter(record => record.hit).length;
    const stakeK = settled.length * BET_COUNT * 1000;
    const profitK = wins * 84 * 1000 - stakeK;
    return {
        trackedDays: v2Records.length,
        settledDays: settled.length,
        wins,
        losses: settled.length - wins,
        hitRate: settled.length ? wins / settled.length : 0,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        breakEvenHitRate: BET_COUNT / 84,
        legacyRecordsExcluded: records.length - v2Records.length
    };
}

function readLocalJson(filePath, fallback) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

async function generateAndWriteCache({ raw, history, existing, limit = 90, write = true } = {}) {
    let actualRaw = raw;
    let actualHistory = history;
    if (!actualRaw) {
        const { getRawData } = require('../data-access');
        actualRaw = await getRawData();
    }
    if (!actualHistory) actualHistory = readLocalJson(LOCAL_HISTORY_FILE, []);
    const rows = readRawRows(actualRaw);
    if (!rows.length) throw new Error('Không có raw data để sinh Probability Score.');
    const recordsByDate = new Map((Array.isArray(existing) ? existing : existing?.records || []).map(row => [isoDate(row?.predictionDate), row]));
    const nextDate = nextIsoDate(rows.at(-1).date);
    let next = recordsByDate.get(nextDate);
    // A v1 snapshot for the still-pending date must not block the v2
    // migration. Once v2 has issued a locked snapshot, retain it exactly as
    // published even when the cache builder runs again.
    if (!next || next.modelVersion !== CACHE_VERSION || next.pointInTimeLocked !== true) {
        next = buildScoreSnapshot({
            rawRows: rows,
            predictionDate: nextDate,
            historyRun: findHistoryRun(actualHistory, nextDate),
            history: actualHistory
        });
        recordsByDate.set(nextDate, next);
    }
    const records = [...recordsByDate.values()]
        .map(record => settleSnapshot(record, rows))
        .sort((left, right) => isoDate(left.predictionDate).localeCompare(isoDate(right.predictionDate)))
        .slice(-limit);
    const payload = {
        version: CACHE_VERSION,
        generatedAt: new Date().toISOString(),
        latestDataDate: rows.at(-1).date,
        config: {
            betCount: BET_COUNT,
            model: 'online-calibrated-relative-ranking-v2',
            lookbackDraws: LOOKBACK_DRAWS,
            shortWindowDraws: SHORT_WINDOW_DRAWS,
            trainingWindow: MODEL_DEFAULTS.trainingWindow,
            calibrationWindow: MODEL_DEFAULTS.calibrationWindow
        },
        records,
        summary: summarize(records)
    };
    if (write) {
        fs.mkdirSync(path.dirname(LOCAL_CACHE_FILE), { recursive: true });
        fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(payload, null, 0));
    }
    return payload;
}

module.exports = {
    BET_COUNT,
    CACHE_VERSION,
    buildGroupCatalog,
    buildScoreSnapshot,
    generateAndWriteCache,
    nextIsoDate,
    normalizeNumbers,
    readRawRows,
    settleSnapshot
};
