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
assert.equal(pendingCache.records[0].hybrid.numbers.length, BET_COUNT);
assert.ok(pendingCache.records[0].hybrid.leaders.length > 0 && pendingCache.records[0].hybrid.leaders.length <= 3);
assert.equal(pendingCache.records[0].hybrid.evidence.length, BET_COUNT);
assert.ok(pendingCache.records[0].recommendation.ranking.every(row => Number.isFinite(row.posterior7) && Number.isFinite(row.trend)));
assert.equal(pendingCache.records[0].recommendation.models.length, 3, 'three selection models must be available');
assert.ok(pendingCache.records[0].recommendation.models.every(model => model.selected && Number.isFinite(model.selected.selectionScore)), 'each model ranks from prior snapshots');
assert.ok(Array.isArray(pendingCache.decisionReport.models), 'walk-forward decision report must be emitted');
const issuedForLeakTest = pendingCache.records[0];
const settledLeakHistory = pendingHistory.map(run => run.predictionDate === '2026-04-01'
    ? { ...run, summary: { ...run.summary, actualSpecial: 42 } }
    : run);
const settledLeakRaw = [...raw, { date: '2026-04-01', special: 42 }];
const futureMutatedRaw = [...settledLeakRaw, { date: '2026-04-02', special: 99 }];
const unaffectedByFuture = generateAdvisorCache({ history: settledLeakHistory, raw: futureMutatedRaw, existing: [issuedForLeakTest], limit: 90 })
    .records.find(record => record.predictionDate === '2026-04-01');
assert.deepEqual(unaffectedByFuture.main.numbers, issuedForLeakTest.main.numbers,
    'a future draw must not change the advisor dàn issued for an earlier date');
const staleRecord = { ...pendingCache.records[0], predictionDate: '2026-03-01', settled: false };
const staleFiltered = generateAdvisorCache({ history, raw, existing: [staleRecord], limit: 90 });
assert.equal(staleFiltered.records.length, 1, 'an old issued snapshot must be settled from raw when its result is available');
assert.equal(staleFiltered.records[0].settled, true, 'raw results settle issued snapshots during cache generation');

const issuedSnapshot = generateAdvisorCache({ history: pendingHistory, raw, limit: 90 }).records[0];
const recoveryRaw = [...raw, { date: '2026-04-01', special: 42 }];
const recovered = generateAdvisorCache({ history: pendingHistory.map(run => run.predictionDate === '2026-04-01'
    ? { ...run, summary: { ...run.summary, actualSpecial: 42 } }
    : run), raw: recoveryRaw, existing: [issuedSnapshot], limit: 90 });
const recoveredRecord = recovered.records.find(record => record.predictionDate === '2026-04-01');
assert.equal(recoveredRecord.lifecycle.mode, 'live-issued', 'an already issued snapshot must remain live-issued when settled');

const priorIssued = {
    ...issuedSnapshot,
    predictionDate: '2026-03-31',
    sourceDrawDate: '2026-03-30',
    settled: true,
    actual: 30,
    main: { ...issuedSnapshot.main, hit: true },
    lifecycle: { ...issuedSnapshot.lifecycle }
};
const missingRecordRecovery = generateAdvisorCache({ history: pendingHistory.map(run => run.predictionDate === '2026-04-01'
    ? { ...run, summary: { ...run.summary, actualSpecial: 42 } }
    : run), raw: recoveryRaw, existing: [priorIssued], limit: 90 });
const reconstructed = missingRecordRecovery.records.find(record => record.predictionDate === '2026-04-01');
assert.equal(reconstructed.lifecycle.mode, 'reconstructed-after-draw', 'a missing day may be recovered only from its persisted history snapshot');
assert.equal(reconstructed.actual, 42, 'recovered snapshot must be settled with raw R2 result');
console.log('PASS daily advisor uses only strictly earlier settled snapshots and writes fixed 30-number main/hybrid lanes.');
