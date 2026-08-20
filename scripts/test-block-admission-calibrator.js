#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    collectDailyBlockCohorts,
    frequencyBucket,
    fitStableBlockAdmissionModel,
    fitStableBlockBreakModel,
    normalizeActiveBlock,
    parseBlockShape,
    refinePredictionWithBlockAdmission,
    refinePredictionWithBlockGuard
} = require('../lib/research/blockAdmissionCalibrator');

function candidate(overrides = {}) {
    return {
        key: 'tong_moi_1_2_3:block2x1SoLe',
        family: 'block',
        pattern: 'blockAlternation',
        state: 'active',
        recordState: 'at-record',
        baseLen: 6,
        currentLen: 6,
        currentCount: 5,
        numbers: [10, 20],
        setSize: 2,
        baseExclusionRate: 0.98,
        observedExcluded: true,
        ...overrides
    };
}

assert.deepStrictEqual(parseBlockShape(candidate().key), {
    id: '2-1',
    aLength: 2,
    bLength: 1,
    cycleLength: 3,
    minimumLength: 5
});
assert.strictEqual(frequencyBucket(0.25), 'f025');
assert.strictEqual(frequencyBucket(0.75), 'f100');
assert.strictEqual(normalizeActiveBlock(candidate({ state: 'potential' })), null);
assert.strictEqual(normalizeActiveBlock(candidate({ recordState: 'below-record' }), { recordOnly: true }), null);
assert.strictEqual(normalizeActiveBlock(candidate({ numbers: Array.from({ length: 50 }, (_, index) => index) })), null);

const years = Array.from({ length: 4 }, (_, year) =>
    Array.from({ length: 20 }, (_, day) => ({
        date: `202${year}-${String(Math.floor(day / 10) + 1).padStart(2, '0')}-${String((day % 10) + 1).padStart(2, '0')}`,
        candidateDiagnostics: [
            candidate(),
            candidate({ key: 'duplicate:block2x1SoLe' })
        ]
    }))
);

const daily = collectDailyBlockCohorts(years[0]);
assert([...daily.values()].every(row => row.days === 20));

const model = fitStableBlockAdmissionModel(years, {
    maxSetSize: 40,
    minDaysPerYear: 10,
    minYears: 4,
    minPositiveShare: 1,
    minConservativeEdge: 0,
    stabilityZ: 0
});
assert(model.size > 0, 'Block gãy ổn định phải được admission.');

const row = {
    strategies: {
        chainSmallFirst: Array.from({ length: 30 }, (_, index) => index)
    },
    candidateDiagnostics: [candidate()]
};
const prediction = refinePredictionWithBlockAdmission(row, model, {
    baselineStrategy: 'chainSmallFirst',
    maxSetSize: 40,
    minEvidenceDays: 10,
    swapLimit: 1,
    minSwapMargin: 0
});
assert.strictEqual(prediction.betNumbers.length, 30);
assert(!prediction.betNumbers.includes(10));

const breakYears = Array.from({ length: 4 }, (_, year) =>
    Array.from({ length: 20 }, (_, day) => ({
        date: `202${year}-${String(Math.floor(day / 10) + 1).padStart(2, '0')}-${String((day % 10) + 1).padStart(2, '0')}`,
        candidateDiagnostics: [candidate({
            key: 'break:block3x3SoLe',
            baseLen: 9,
            currentCount: 3,
            numbers: [40, 41],
            baseExclusionRate: 0.98,
            observedExcluded: false
        })]
    }))
);
const breakModel = fitStableBlockBreakModel(breakYears, {
    maxSetSize: 40,
    minDaysPerYear: 10,
    minYears: 4,
    minPositiveShare: 1,
    minConservativeLift: 0,
    stabilityZ: 0
});
assert(breakModel.size > 0, 'Block phá kỷ lục ổn định phải được nhận diện để bảo vệ.');
const guarded = refinePredictionWithBlockGuard({
    strategies: row.strategies,
    candidateDiagnostics: [
        candidate(),
        candidate({
            key: 'break:block3x3SoLe',
            baseLen: 9,
            currentCount: 3,
            numbers: [40, 41]
        })
    ]
}, model, breakModel, {
    baselineStrategy: 'chainSmallFirst',
    maxSetSize: 40,
    minEvidenceDays: 10,
    swapLimit: 1
});
assert(!guarded.betNumbers.includes(10));
assert(guarded.betNumbers.includes(40));

const consensusGuarded = refinePredictionWithBlockGuard({
    strategies: row.strategies,
    candidateDiagnostics: [
        candidate(),
        candidate({
            key: 'break:block3x3SoLe',
            baseLen: 9,
            currentCount: 3,
            numbers: [40, 41]
        })
    ]
}, model, breakModel, {
    baselineStrategy: 'chainSmallFirst',
    maxSetSize: 40,
    minEvidenceDays: 10,
    swapLimit: 1,
    minAdmissionShapes: 2,
    minProtectionShapes: 2
});
assert.deepStrictEqual(consensusGuarded.swaps, []);
assert(consensusGuarded.betNumbers.includes(10));
assert(!consensusGuarded.betNumbers.includes(40));

console.log('✅ blockAdmissionCalibrator tests passed');
