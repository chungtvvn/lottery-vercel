#!/usr/bin/env node

const assert = require('assert');
const { trainLotoCoverageHazardModel, scoreLotoRow } = require('../lib/research/lotoCoverageHazardModel');

function sample(number, strong) {
    return {
        number,
        gapRatio: strong ? 3 : 0.5,
        gapPercentile: strong ? 0.95 : 0.2,
        hazard: strong ? 0.5 : 0.1,
        lifetimeRate: strong ? 0.4 : 0.2,
        rate7: strong ? 0.4 : 0.2,
        rate30: strong ? 0.4 : 0.2,
        rate90: strong ? 0.4 : 0.2,
        rate365: strong ? 0.4 : 0.2,
        missingInCycle: strong,
        cycleProgress: 1,
        gapSample: 100,
        hazardExposure: 100
    };
}

const rows = Array.from({ length: 20 }, (_, index) => ({
    date: `2020-01-${String(index + 1).padStart(2, '0')}`,
    actualNumbers: [42],
    actualOccurrences: [42],
    samples: Array.from({ length: 100 }, (_, number) => sample(number, number === 42))
}));
const model = trainLotoCoverageHazardModel(rows, { epochs: 20, l2: 0.2 });
assert.strictEqual(scoreLotoRow(rows[0], model)[0].number, 42);
console.log('lotoCoverageHazardModel tests passed');
