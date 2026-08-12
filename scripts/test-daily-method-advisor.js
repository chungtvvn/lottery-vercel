#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { generateAdvisorCache, BET_COUNT, DAILY_METHOD_POOL } = require('../lib/services/dailyMethodAdvisorService');

const raw = Array.from({ length: 80 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`.replace(/-0(3[2-9]|[4-9][0-9])$/, '-03'),
    special: index % 100
}));
// Stable chronological fake dates for test-only point-in-time behavior.
raw.forEach((row, index) => { row.date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10); });
const methods = () => ({
    chainSmallFirstHold70: { numbersToBet: Array.from({ length: 30 }, (_, number) => number) },
    dedupEdge75Hold70: { numbersToBet: Array.from({ length: 30 }, (_, number) => number + 30) }
});
const history = raw.slice(20, 50).map((row, index) => ({
    predictionDate: row.date,
    sourceDrawDate: raw[index + 19].date,
    generatedAt: `2026-01-01T00:${String(index).padStart(2, '0')}:00Z`,
    summary: { actualSpecial: row.special, methods: methods() }
}));
const cache = generateAdvisorCache({ history, raw, limit: 90 });
assert.equal(cache.records.length, 0, 'historical replays must not enter the real snapshot ledger');
const pendingHistory = [...history, {
    predictionDate: '2026-04-01',
    sourceDrawDate: '2026-03-31',
    summary: { actualSpecial: null, methods: methods() }
}];
const pendingCache = generateAdvisorCache({ history: pendingHistory, raw, limit: 90 });
assert.equal(pendingCache.records.length, 1, 'only the pending live snapshot belongs in the ledger');
assert.equal(pendingCache.records[0].settled, false, 'null result must remain pending, not become number 00');
assert.equal(pendingCache.records[0].predictionDate, '2026-04-01');
assert.equal(pendingCache.records[0].main.numbers.length, BET_COUNT, 'pending next-day snapshot must have a fixed dàn');
assert.equal(pendingCache.records[0].lifecycle.mode, 'live-issued');
assert.deepEqual(pendingCache.records[0].recommendation.methodPool, DAILY_METHOD_POOL.filter(id => pendingCache.records[0].recommendation.ranking.some(row => row.methodId === id)));
assert.equal(pendingCache.records[0].experimental.replacedIn.length, 6);
const staleRecord = { ...pendingCache.records[0], predictionDate: '2026-03-01', settled: false };
const staleFiltered = generateAdvisorCache({ history, raw, existing: [staleRecord], limit: 90 });
assert.equal(staleFiltered.records.length, 0, 'expired unresolved snapshots must not remain in the live ledger');
console.log('PASS daily advisor uses only strictly earlier settled snapshots and writes fixed 30-number main/Z-score support lanes.');
