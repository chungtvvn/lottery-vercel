#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    buildDistributionSnapshot,
    buildSemanticPartitions,
    runStrictDistributionWalkForward,
    validatePartitions
} = require('../lib/services/probabilityDistributionModel');
const { buildProbabilityDistributionResearch } = require('../lib/services/probabilityDistributionResearchService');
const {
    generateAndWriteCache,
    nextIsoDate
} = require('../lib/services/probabilityDistributionService');

function dateAt(index) {
    return new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10);
}

const raw = Array.from({ length: 420 }, (_, index) => ({
    date: dateAt(index),
    special: (index * 37 + Math.floor(index / 9)) % 100
}));

const partitions = buildSemanticPartitions();
assert.deepEqual(validatePartitions(partitions), { valid: true, failures: [] });
const quartiles = partitions.find(partition => partition.id === 'numberQuartile');
assert.ok(quartiles, 'the semantic catalog must include the four requested 25-number ranges');
assert.deepEqual(quartiles.categories.map(category => category.label), ['00–24', '25–49', '50–74', '75–99']);
assert.ok(quartiles.categories.every(category => category.numbers.length === 25), 'every number range must contain exactly 25 values');

const targetDate = raw[280].date;
const originalSnapshot = buildDistributionSnapshot(raw, targetDate, { minWarmup: 40 });
assert.equal(originalSnapshot.modelVersion, 'probability-distribution-v4');
const paritySignal = originalSnapshot.partitionSignals.find(axis => axis.id === 'parity');
assert.ok(paritySignal?.categories?.length === 2, 'the current snapshot must expose category distributions for visualization');
for (const field of ['historicalProbability', 'recentProbability', 'transitionProbability', 'contextProbability', 'forecastProbability']) {
    const total = paritySignal.categories.reduce((sum, category) => sum + Number(category[field] || 0), 0);
    assert.ok(Math.abs(total - 1) < 0.00001, `${field} must remain a normalized category distribution`);
}
const mutatedFuture = raw.map((row, index) => index > 280 ? { ...row, special: (row.special + 41) % 100 } : row);
const stableSnapshot = buildDistributionSnapshot(mutatedFuture, targetDate, { minWarmup: 40 });
assert.deepEqual(
    originalSnapshot.topNumbers.map(row => row.number),
    stableSnapshot.topNumbers.map(row => row.number),
    'future draws must not alter a point-in-time distribution snapshot'
);
assert.ok(originalSnapshot.abstained || originalSnapshot.topNumbers.length === 30, 'a semantic snapshot must either issue exactly 30 numbers or abstain');
if (originalSnapshot.abstained) {
    assert.equal(originalSnapshot.topNumbers.length, 0, 'an abstained snapshot must not fall back to a deterministic 00–29 dàn');
    assert.equal(originalSnapshot.hit, null, 'an abstained snapshot must not be settled as a bet');
}

const originalRows = runStrictDistributionWalkForward(raw, { minWarmup: 40 }).rows;
const mutatedRows = runStrictDistributionWalkForward(raw.map((row, index) => index === raw.length - 1 ? { ...row, special: 99 } : row), { minWarmup: 40 }).rows;
assert.deepEqual(
    originalRows.slice(0, -1).map(row => ({ date: row.date, numbers: row.numbers })),
    mutatedRows.slice(0, -1).map(row => ({ date: row.date, numbers: row.numbers })),
    'a later outcome must not change previously issued walk-forward dàn'
);

const report = buildProbabilityDistributionResearch(raw, {
    minWarmup: 40,
    developmentEnd: '2020-07-31',
    validationStart: '2020-08-01',
    validationEnd: '2020-10-31',
    holdoutStart: '2020-11-01',
    recentDays: 20
});
assert.equal(report.strictPointInTime, true);
assert.equal(report.methods.length, 6);
assert.ok(report.methods.every(method => method.coverage && method.coverage.candidateDays > 0));
assert.ok(report.methods.find(method => method.id === 'scoreV2Online').total.days > 0);
assert.ok(report.complementarity.length > 0);

async function verifyLockedSnapshotSurvivesModelUpgrade() {
    const predictionDate = nextIsoDate(raw.at(-1).date);
    const lockedNumbers = Array.from({ length: 30 }, (_, index) => index + 70);
    const lockedSnapshot = {
        predictionDate,
        modelVersion: 'probability-distribution-v3',
        generatedAt: '2026-08-18T12:00:00.000Z',
        lifecycle: 'live-issued',
        pointInTimeLocked: true,
        settled: false,
        abstained: false,
        topNumbers: lockedNumbers.map((number, rank) => ({ number, rank: rank + 1 }))
    };
    const upgraded = await generateAndWriteCache({
        raw,
        existing: { version: 'probability-distribution-v3', records: [lockedSnapshot] },
        write: false
    });
    const preserved = upgraded.records.find(record => record.predictionDate === predictionDate);

    assert.equal(upgraded.version, 'probability-distribution-v4', 'the cache envelope may upgrade to the new model version');
    assert.equal(preserved.modelVersion, 'probability-distribution-v3', 'an issued snapshot must retain its original model version');
    assert.deepEqual(
        preserved.topNumbers.map(row => row.number),
        lockedNumbers,
        'a model upgrade must not rewrite an immutable issued dàn'
    );
}

verifyLockedSnapshotSurvivesModelUpgrade()
    .then(() => console.log('PASS semantic partitions, strict PIT and immutable model upgrades are safe.'))
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
