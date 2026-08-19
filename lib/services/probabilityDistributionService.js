'use strict';

// Daily cache for the independent number-distribution layer.  The expensive
// multi-year report is stored separately in `research`; normal daily runs only
// settle issued records and issue one immutable next-day snapshot.

const fs = require('fs');
const path = require('path');
const {
    buildDistributionSnapshot,
    normalizeRows
} = require('./probabilityDistributionModel');

const CACHE_VERSION = 'probability-distribution-v4';
const BET_COUNT = 30;
const PAYOUT_MULTIPLIER = 84;
const STAKE_PER_NUMBER_K = 1000;
const LOCAL_CACHE_FILE = path.join(__dirname, '..', 'data', 'statistics', 'cached_probability_distribution.json');

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function nextIsoDate(value) {
    const date = new Date(`${isoDate(value)}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

function normalizeTopNumbers(rows) {
    return (rows || []).map(row => Number(row?.number ?? row))
        .filter(number => Number.isInteger(number) && number >= 0 && number < 100);
}

function settleSnapshot(snapshot, rows) {
    const actual = rows.find(row => row.date === isoDate(snapshot?.predictionDate))?.actual;
    if (snapshot?.settled || !Number.isInteger(actual)) return snapshot;
    // An abstained research lane did not place a bet. Keep its immutable
    // timeline, but do not settle it as a loss.
    if (snapshot?.abstained || normalizeTopNumbers(snapshot?.topNumbers).length !== BET_COUNT) {
        return { ...snapshot, settled: true, actual, hit: null, abstained: true };
    }
    return {
        ...snapshot,
        settled: true,
        actual,
        hit: normalizeTopNumbers(snapshot?.topNumbers).includes(actual)
    };
}

function summarize(records) {
    const current = (records || []).filter(record => record?.modelVersion === CACHE_VERSION);
    const issued = current.filter(record => !record?.abstained && normalizeTopNumbers(record?.topNumbers).length === BET_COUNT);
    const settled = issued.filter(record => record?.settled);
    const abstained = current.filter(record => record?.abstained || normalizeTopNumbers(record?.topNumbers).length !== BET_COUNT);
    const wins = settled.filter(record => record?.hit).length;
    const stakeK = settled.length * BET_COUNT * STAKE_PER_NUMBER_K;
    const payoutK = wins * PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K;
    const profitK = payoutK - stakeK;
    return {
        trackedDays: current.length,
        issuedDays: issued.length,
        abstainedDays: abstained.length,
        settledDays: settled.length,
        pendingDays: issued.length - settled.length,
        wins,
        losses: settled.length - wins,
        hitRate: settled.length ? wins / settled.length : 0,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        breakEvenHitRate: BET_COUNT / PAYOUT_MULTIPLIER,
        isAboveBreakEven: settled.length > 0 && wins / settled.length >= BET_COUNT / PAYOUT_MULTIPLIER
    };
}

function compactArchivedRecord(record) {
    if (!record || typeof record !== 'object') return record;
    return {
        ...record,
        // The issued dàn is `topNumbers`. Full 100-number evidence and the
        // category matrix are useful only for the current explorer and would
        // otherwise make the 90-day operational cache grow unnecessarily.
        rankedNumbers: undefined,
        partitionSignals: (record.partitionSignals || []).map(axis => ({
            ...axis,
            categories: undefined
        }))
    };
}

async function generateAndWriteCache({ raw, existing, limit = 90, research, write = true } = {}) {
    let actualRaw = raw;
    if (!actualRaw) {
        const { getRawData } = require('../data-access');
        actualRaw = await getRawData();
    }
    const rows = normalizeRows(actualRaw);
    if (!rows.length) throw new Error('Không có raw data để sinh cache phân bổ nhóm số.');

    const source = existing && typeof existing === 'object' ? existing : {};
    const recordsByDate = new Map((Array.isArray(source.records) ? source.records : [])
        .map(record => [isoDate(record?.predictionDate), record]));
    const predictionDate = nextIsoDate(rows.at(-1).date);
    let next = recordsByDate.get(predictionDate);
    const immutable = Boolean(next?.pointInTimeLocked || next?.lifecycle === 'live-issued' || next?.lifecycle?.immutableNumbers);
    if (!next || (!immutable && (next.modelVersion !== CACHE_VERSION || next.pointInTimeLocked !== true))) {
        next = {
            ...buildDistributionSnapshot(rows, predictionDate, { betCount: BET_COUNT }),
            generatedAt: new Date().toISOString(),
            lifecycle: 'live-issued',
            pointInTimeLocked: true
        };
        recordsByDate.set(predictionDate, next);
    }

    const records = [...recordsByDate.values()]
        .map(record => settleSnapshot(record, rows))
        .sort((left, right) => isoDate(left?.predictionDate).localeCompare(isoDate(right?.predictionDate)))
        .slice(-limit)
        .map(record => isoDate(record?.predictionDate) === predictionDate ? record : compactArchivedRecord(record));
    const payload = {
        version: CACHE_VERSION,
        generatedAt: new Date().toISOString(),
        latestDataDate: rows.at(-1).date,
        config: {
            betCount: BET_COUNT,
            payoutMultiplier: PAYOUT_MULTIPLIER,
            model: 'semantic-partition-state-calibrated-v4',
            note: 'Snapshot hằng ngày chỉ tính từ raw data trước ngày dự đoán. Báo cáo strict PIT dài hạn được sinh thủ công, không chặn action hằng ngày.'
        },
        records,
        summary: summarize(records),
        research: research || source.research || null
    };
    if (write) {
        fs.mkdirSync(path.dirname(LOCAL_CACHE_FILE), { recursive: true });
        fs.writeFileSync(LOCAL_CACHE_FILE, JSON.stringify(payload));
    }
    return payload;
}

module.exports = {
    BET_COUNT,
    CACHE_VERSION,
    LOCAL_CACHE_FILE,
    generateAndWriteCache,
    nextIsoDate,
    settleSnapshot,
    summarize,
    compactArchivedRecord
};
