'use strict';

const generateNumberStats = require('../generators/statisticsGenerator');
const generateHeadTailStats = require('../generators/headTailStatsGenerator');
const generateSumDiffStats = require('../generators/sumDifferenceStatsGenerator');
const historicalExclusionService = require('../services/historicalExclusionService');
const { isInvalidStatsKey } = require('../utils/statsOptionsManifest');

function formatIsoDate(value) {
    const parsed = value instanceof Date
        ? value
        : historicalExclusionService.parseDate(value);
    if (!parsed) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(value) {
    const parsed = value instanceof Date
        ? value
        : historicalExclusionService.parseDate(value);
    return parsed ? historicalExclusionService.formatDate(parsed) : '';
}

function normalizeRaw(raw) {
    return (raw || [])
        .map(row => ({
            ...row,
            _iso: formatIsoDate(row.date),
            special: Number(row.special)
        }))
        .filter(row => row._iso && Number.isFinite(row.special))
        .sort((left, right) => left._iso.localeCompare(right._iso));
}

function flattenStats(stats) {
    const entries = new Map();
    const add = (key, value) => {
        if (isInvalidStatsKey(key) || !value || !Array.isArray(value.streaks)) return;
        entries.set(key, value);
    };
    for (const [key, value] of Object.entries(stats || {})) {
        if (value && Array.isArray(value.streaks)) add(key, value);
        else if (value && typeof value === 'object') {
            for (const [subKey, subValue] of Object.entries(value)) {
                add(`${key}:${subKey}`, subValue);
            }
        }
    }
    return entries;
}

function mergeEntries(stats) {
    const entries = new Map();
    for (const group of [stats.numberStats, stats.headTailStats, stats.sumDiffStats]) {
        for (const [key, value] of flattenStats(group)) entries.set(key, value);
    }
    return entries;
}

async function generateStats(raw, quiet = true) {
    const input = raw.map(row => ({ date: row.date, special: Number(row.special) }));
    const originalLog = console.log;
    if (quiet) console.log = () => {};
    const startedAt = Date.now();
    try {
        const [numberStats, headTailStats, sumDiffStats] = await Promise.all([
            generateNumberStats(null, null, input),
            generateHeadTailStats(null, null, input),
            generateSumDiffStats(null, null, input)
        ]);
        return {
            numberStats,
            headTailStats,
            sumDiffStats,
            elapsedMs: Date.now() - startedAt
        };
    } finally {
        console.log = originalLog;
    }
}

module.exports = {
    flattenStats,
    formatDisplayDate,
    formatIsoDate,
    generateStats,
    mergeEntries,
    normalizeRaw
};
