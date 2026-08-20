#!/usr/bin/env node
'use strict';

const assert = require('assert');
const service = require('../lib/services/probabilityScoreService');

function row(date, special) { return { date, special }; }

const rawBefore = Array.from({ length: 220 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 6, 1 + index)).toISOString().slice(0, 10);
    return row(date, (index * 17 + 9) % 100);
});
const targetDate = '2026-04-11';
const history = [{ predictionDate: targetDate, summary: { methods: {
    chainSmallFirstHold70: { numbersToBet: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19] },
    dedupEdge75Hold70: { numbersToBet: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20] }
} } }];
const before = service.buildScoreSnapshot({ rawRows: service.readRawRows(rawBefore), predictionDate: targetDate, historyRun: history[0] });
const after = service.buildScoreSnapshot({ rawRows: service.readRawRows([...rawBefore, row(targetDate, 99)]), predictionDate: targetDate, historyRun: history[0] });
assert.deepStrictEqual(before.topNumbers.map(row => row.number), after.topNumbers.map(row => row.number), 'Target draw must not leak into its prediction.');
assert.strictEqual(before.topNumbers.length, 30);
assert.strictEqual(before.pointInTimeLocked, true);
console.log('Probability Score tests passed.');
