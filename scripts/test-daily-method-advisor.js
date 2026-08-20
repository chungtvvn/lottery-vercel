#!/usr/bin/env node
'use strict';
const assert = require('assert');
const { generateAdvisorCache, buildAdaptiveFusion, BET_COUNT, DAILY_METHOD_POOL } = require('../lib/services/dailyMethodAdvisorService');

const raw = Array.from({ length: 80 }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`.replace(/-0(3[2-9]|[4-9][0-9])$/, '-03'),
    special: index % 100
}));
// Stable chronological fake dates for test-only point-in-time behavior.
raw.forEach((row, index) => { row.date = new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10); });
const methods = () => ({
    chainSmallFirstHold70: { numbersToBet: Array.from({ length: 30 }, (_, number) => number) },
    dedupEdge75Hold70: { numbersToBet: Array.from({ length: 30 }, (_, number) => number + 30) },
    experimentalThirty: {
        label: 'Thử nghiệm dàn 30 đang tốt',
        numbersToBet: Array.from({ length: 30 }, (_, number) => number + 20)
    },
    experimentalThirtyDuplicate: {
        label: 'Bản sao cùng dàn thử nghiệm',
        numbersToBet: Array.from({ length: 30 }, (_, number) => number + 20)
    },
    experimentalTwenty: {
        label: 'Thử nghiệm dàn 20 đang tốt',
        numbersToBet: Array.from({ length: 20 }, (_, number) => number + 20)
    }
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
assert.deepEqual(
    new Set(pendingCache.records[0].recommendation.methodPool),
    new Set(['chainSmallFirstHold70', 'dedupEdge75Hold70', 'experimentalThirty', 'experimentalThirtyDuplicate']),
    'Pool so sánh chính phải tự phát hiện mọi dàn đúng 30 số, kể cả thử nghiệm.'
);
assert.equal(pendingCache.records[0].hybrid.numbers.length, BET_COUNT);
assert.equal(pendingCache.records[0].hybrid.id, 'all-method-fixed30-consensus-v1');
assert.equal(pendingCache.records[0].hybrid.methodCount, 4, 'all comparable 30-number methods must enter the fusion lane');
assert.equal(pendingCache.records[0].hybrid.uniqueSetCount, 3, 'exact duplicate dàn must be collapsed before fusion');
assert.equal(pendingCache.records[0].hybrid.duplicatesRemoved, 1);
assert.deepEqual(
    new Set(pendingCache.records[0].hybrid.leaders.flatMap(group => group.methodIds)),
    new Set(pendingCache.records[0].recommendation.methodPool),
    'every comparable method must remain auditable even when exact dàn are deduplicated'
);
assert.equal(pendingCache.records[0].hybrid.evidence.length, BET_COUNT);
assert.ok(pendingCache.records[0].recommendation.ranking.every(row => Number.isFinite(row.posterior7) && Number.isFinite(row.trend)));
assert.equal(pendingCache.records[0].recommendation.models.length, 5, 'five selection models must be available');
assert.deepEqual(
    pendingCache.records[0].recommendation.models.map(model => model.id),
    ['balanced', 'momentum', 'stability', 'bayesGuard', 'hedge'],
    'the immutable snapshot must retain every available selection lane'
);
assert.ok(pendingCache.records[0].recommendation.models.every(model => model.selected && Number.isFinite(model.selected.selectionScore)), 'each model ranks from prior snapshots');
assert.equal(pendingCache.records[0].recommendation.candidateMethods.length, 5, 'a pending snapshot keeps immutable dàn for every available candidate method');
assert.ok(
    pendingCache.records[0].recommendation.candidateMethods.some(method => method.methodId === 'experimentalTwenty' && method.betCount === 20 && method.eligibleForMain === false),
    'Dàn khác 30 số phải được theo dõi với kinh tế riêng nhưng không cạnh tranh trực tiếp với pool chính.'
);
assert.ok(
    pendingCache.records[0].recommendation.currentStrongMethods.some(method => method.methodId === 'experimentalThirty' && method.experimental),
    'Phương pháp thử nghiệm đang tốt phải xuất hiện trong gợi ý hiện tại.'
);
assert.ok(
    pendingCache.records[0].recommendation.currentStrongMethods.some(method => method.methodId === 'experimentalTwenty' && method.experimental && !method.eligibleForMain),
    'Phương pháp thử nghiệm khác quy mô vẫn phải xuất hiện, nhưng được gắn cờ không đủ điều kiện vào main.'
);
assert.ok(pendingCache.records[0].recommendation.ranking.every(method => method.betCount === BET_COUNT), 'Ranking chính chỉ được so sánh các dàn cùng 30 số.');
assert.ok(Array.isArray(pendingCache.decisionReport.models), 'walk-forward decision report must be emitted');
assert.equal(pendingCache.decisionReport.fusion.status, 'research-only', 'direct all-method fusion must not silently replace production');
assert.equal(
    pendingCache.decisionReport.fusion.summary.days,
    pendingCache.decisionReport.models[0].summary.days,
    'fusion and selector reports must use the same post-warm-up dates'
);
assert.equal(pendingCache.summary.hybrid.days, 0, 'an unsettled current-version fusion snapshot must not enter live performance');
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
assert.deepEqual(unaffectedByFuture.hybrid.numbers, issuedForLeakTest.hybrid.numbers,
    'a future draw must not change the all-method dàn issued for an earlier date');
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

const equalMembership = buildAdaptiveFusion({
    methodA: { numbersToBet: [...Array.from({ length: 29 }, (_, number) => number), 99] }
}, [{ methodId: 'methodA', label: 'A', score: 1 }], null);
const membershipScores = equalMembership.evidence.map(row => row.fusionScore);
assert.ok(
    Math.max(...membershipScores) - Math.min(...membershipScores) < 1e-12,
    'numeric serialization order must not be interpreted as a rank inside an immutable set'
);

const originalSet = { numbersToBet: Array.from({ length: 30 }, (_, number) => number + 10) };
const withoutDuplicate = buildAdaptiveFusion({ methodA: originalSet }, [
    { methodId: 'methodA', label: 'A', score: 0.3 }
], null);
const withDuplicate = buildAdaptiveFusion({ methodA: originalSet, methodB: originalSet }, [
    { methodId: 'methodA', label: 'A', score: 0.3 },
    { methodId: 'methodB', label: 'B', score: 0.3 }
], null);
assert.deepEqual(withDuplicate.numbers, withoutDuplicate.numbers, 'an exact alias must not change the fused dàn');
assert.deepEqual(
    withDuplicate.evidence.map(row => row.fusionScore),
    withoutDuplicate.evidence.map(row => row.fusionScore),
    'an exact alias must not add a second vote'
);
assert.equal(withDuplicate.methodCount, 2);
assert.equal(withDuplicate.uniqueSetCount, 1);
assert.equal(withDuplicate.duplicatesRemoved, 1);
console.log('PASS daily advisor uses only strictly earlier settled snapshots and writes fixed 30-number main/hybrid lanes.');
