'use strict';

// Daily relative-probability ranking. This service intentionally keeps the
// information set before predictionDate and never treats a score as a
// calibrated absolute probability of a lottery outcome.

const fs = require('fs');
const path = require('path');
const { scoringForms } = require('../utils/lotteryScoring');

const NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = 30;
const LOOKBACK_DRAWS = 180;
const SHORT_WINDOW_DRAWS = 45;
const CACHE_VERSION = 'probability-score-v1';
const LOCAL_CACHE_FILE = path.join(__dirname, '..', 'data', 'statistics', 'cached_probability_score.json');
const LOCAL_HISTORY_FILE = path.join(__dirname, '..', 'data', 'statistics', 'cached_prediction_history.json');
const IMMUTABLE_MODES = new Set(['live-issued', 'reconstructed-after-draw']);

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
    return (rawRows || []).map(row => ({
        date: isoDate(row?.date || row?.ngay),
        actual: Number(row?.special ?? row?.db ?? row?.giaiDb ?? row?.giai_dac_biet)
    })).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isInteger(row.actual) && row.actual >= 0 && row.actual < 100)
        .sort((left, right) => left.date.localeCompare(right.date));
}

function buildGroupCatalog() {
    const unique = new Map();
    for (const form of scoringForms) {
        const numbers = NUMBERS.filter(number => form.checkFunction(number));
        if (!numbers.length || numbers.length === 100) continue;
        const signature = numbers.join(',');
        const label = String(form.description || form.n || 'Nhóm số');
        const current = unique.get(signature) || { numbers, labels: [] };
        current.labels.push(label);
        unique.set(signature, current);
    }
    const groups = [...unique.values()].map(group => ({
        numbers: group.numbers,
        probability: group.numbers.length / 100,
        label: group.labels[0],
        aliases: group.labels.slice(1, 4)
    }));
    const byNumber = Array.from({ length: 100 }, () => []);
    groups.forEach((group, groupId) => group.numbers.forEach(number => byNumber[number].push(groupId)));
    return { groups, byNumber };
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

function buildScoreSnapshot({ rawRows, predictionDate, historyRun, createdAt = new Date().toISOString() }) {
    const targetDate = isoDate(predictionDate);
    const priorRows = getPriorRows(rawRows, targetDate);
    if (priorRows.length < 60) throw new Error(`Không đủ dữ liệu trước ${targetDate} để chấm điểm.`);
    const catalog = getGroupCatalog();
    const longGroup = calculateGroupDeficit(priorRows, catalog, LOOKBACK_DRAWS);
    const shortFrequency = calculateFrequencyDeficit(priorRows, SHORT_WINDOW_DRAWS);
    const gaps = calculateGapFeatures(priorRows);
    const consensus = calculateChainConsensus(historyRun);
    const groupRank = percentile(longGroup.values.map(row => row.value));
    const frequencyRank = percentile(shortFrequency.values);
    const gapRank = percentile(gaps);
    const consensusRank = percentile(consensus.values);
    const hasConsensus = consensus.methods.length > 0;
    const weights = hasConsensus
        ? { groupDeficit: 0.36, frequencyDeficit: 0.24, gap: 0.20, chainConsensus: 0.20 }
        : { groupDeficit: 0.45, frequencyDeficit: 0.30, gap: 0.25, chainConsensus: 0 };
    const rankedNumbers = NUMBERS.map(number => ({
        number,
        score: 100 * (
            groupRank[number] * weights.groupDeficit +
            frequencyRank[number] * weights.frequencyDeficit +
            gapRank[number] * weights.gap +
            consensusRank[number] * weights.chainConsensus
        ),
        components: {
            groupDeficit: Math.round(groupRank[number] * 100),
            frequencyDeficit: Math.round(frequencyRank[number] * 100),
            gap: Math.round(gapRank[number] * 100),
            chainConsensus: Math.round(consensusRank[number] * 100)
        },
        evidence: {
            groupSignals: longGroup.values[number].groups,
            chainMethods: consensus.methods.filter(methodId => methodNumberSets(historyRun).find(set => set.methodId === methodId)?.numbers.includes(number))
        }
    })).sort((left, right) => right.score - left.score || left.number - right.number);
    rankedNumbers.forEach((row, index) => {
        row.rank = index + 1;
        row.band = index < 10 ? 'A' : index < BET_COUNT ? 'B' : index < 60 ? 'C' : 'D';
        row.score = Number(row.score.toFixed(2));
    });
    const actual = rawRows.find(row => row.date === targetDate)?.actual;
    return {
        predictionDate: targetDate,
        sourceDataThrough: priorRows.at(-1)?.date || null,
        generatedAt: createdAt,
        lifecycle: 'live-issued',
        pointInTimeLocked: true,
        scoreDefinition: {
            kind: 'relative-score-0-100',
            warning: 'Điểm là thứ hạng tương đối trong 100 số, không phải xác suất tuyệt đối hoặc cam kết kết quả.',
            weights,
            windows: { groupDeficit: longGroup.windowSize, frequencyDeficit: shortFrequency.windowSize },
            chainMethodCount: consensus.methods.length,
            chainMethods: consensus.methods
        },
        topNumbers: rankedNumbers.slice(0, BET_COUNT),
        rankedNumbers,
        groupSignals: catalog.groups.map((group, index) => ({
            label: group.label,
            size: group.numbers.length,
            deficitZ: Number(longGroup.groupZ[index].toFixed(3))
        })).sort((left, right) => right.deficitZ - left.deficitZ).slice(0, 15),
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
    const settled = records.filter(record => record.settled);
    const wins = settled.filter(record => record.hit).length;
    const stakeK = settled.length * BET_COUNT * 1000;
    const profitK = wins * 84 * 1000 - stakeK;
    return {
        trackedDays: records.length,
        settledDays: settled.length,
        wins,
        losses: settled.length - wins,
        hitRate: settled.length ? wins / settled.length : 0,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        breakEvenHitRate: BET_COUNT / 84
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
    if (!next) {
        next = buildScoreSnapshot({ rawRows: rows, predictionDate: nextDate, historyRun: findHistoryRun(actualHistory, nextDate) });
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
        config: { betCount: BET_COUNT, lookbackDraws: LOOKBACK_DRAWS, shortWindowDraws: SHORT_WINDOW_DRAWS },
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
