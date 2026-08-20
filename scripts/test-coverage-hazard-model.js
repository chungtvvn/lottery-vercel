#!/usr/bin/env node

const assert = require('assert');
const {
    refineNumbers,
    trainCoverageHazardModel
} = require('../lib/research/coverageHazardModel');

function sample(number, strong) {
    return {
        number,
        currentGap: strong ? 20 : 1,
        averageGap: 5,
        gapRatio: strong ? 4 : 0.2,
        gapPercentile: strong ? 0.99 : 0.1,
        hazard: strong ? 0.1 : 0.005,
        lifetimeRate: strong ? 0.02 : 0.01,
        rate7: strong ? 0.02 : 0.01,
        rate30: strong ? 0.02 : 0.01,
        rate90: strong ? 0.02 : 0.01,
        rate365: strong ? 0.02 : 0.01,
        missingInCycle: strong,
        cycleProgress: 1,
        gapSample: 100,
        hazardExposure: 100
    };
}

const rows = Array.from({ length: 20 }, (_, index) => ({
    date: `2020-01-${String(index + 1).padStart(2, '0')}`,
    actual: 42,
    coverageSamples: Array.from({ length: 100 }, (_, number) => sample(number, number === 42))
}));
const model = trainCoverageHazardModel(rows, { epochs: 20, l2: 0.2 });
const refined = refineNumbers(rows[0], Array.from({ length: 30 }, (_, number) => number), model, { swapLimit: 1 });
assert.strictEqual(refined.numbers.length, 30);
assert(refined.numbers.includes(42));
assert.strictEqual(refined.swaps.length, 1);
console.log('coverageHazardModel tests passed');
