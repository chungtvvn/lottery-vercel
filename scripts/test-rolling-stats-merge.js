#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    displayDateToIso,
    mergeHistoricalAndSuffixStats
} = require('../lib/research/rollingStatsMerge');

assert.strictEqual(displayDateToIso('2/7/2026'), '2026-07-02');
const historical = {
    numberStats: {
        example: {
            description: 'old',
            streaks: [
                { startDate: '01/01/2026', endDate: '03/01/2026', length: 3 },
                { startDate: '08/01/2026', endDate: '10/01/2026', length: 3 }
            ]
        },
        historicalOnly: {
            description: 'keep key',
            streaks: [{ startDate: '01/01/2025', endDate: '02/01/2025', length: 2 }]
        }
    },
    headTailStats: {},
    sumDiffStats: {}
};
const suffix = {
    numberStats: {
        example: {
            description: 'new',
            streaks: [
                { startDate: '08/01/2026', endDate: '11/01/2026', length: 4 }
            ]
        }
    },
    headTailStats: {},
    sumDiffStats: {},
    elapsedMs: 12
};
const merged = mergeHistoricalAndSuffixStats(historical, suffix, '2026-01-05');
assert.strictEqual(merged.numberStats.example.description, 'new');
assert.deepStrictEqual(
    merged.numberStats.example.streaks.map(row => row.endDate),
    ['03/01/2026', '11/01/2026']
);
assert.strictEqual(merged.numberStats.historicalOnly.streaks.length, 1);
assert.strictEqual(merged.elapsedMs, 12);
console.log('Rolling stats merge tests passed.');
