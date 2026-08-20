#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    wilsonLower,
    buildCalibration,
    evaluateReport
} = require('../lib/research/wilsonProfitGate');

function variantRows(unitCount, outcomes) {
    return outcomes.map((hit, index) => ({
        date: `2025-01-${String(index + 1).padStart(2, '0')}`,
        actual: hit ? 1 : 99,
        numbers: Array.from({ length: unitCount }, (_, number) => number),
        uniqueCount: unitCount,
        unitCount,
        hit,
        stakeK: unitCount * 1000,
        payoutK: hit ? 84000 : 0,
        profitK: (hit ? 84000 : 0) - unitCount * 1000
    }));
}

assert.strictEqual(wilsonLower(0, 0, 1.28), 0);
assert(wilsonLower(8, 10, 1.28) > wilsonLower(5, 10, 1.28));

const train = {
    variants: {
        crossUnionFlat: { rows: variantRows(10, [true, true, true, true, true, true, true, true, false, false]) }
    }
};
const test = {
    variants: {
        crossUnionFlat: { rows: variantRows(10, [true, false]) }
    }
};
const config = {
    variantIds: ['crossUnionFlat'],
    bucketWidth: 10,
    minSamples: 8,
    z: 1.28,
    payoutMultiplier: 84
};
const calibration = buildCalibration([train], config);
const result = evaluateReport(test, calibration, config);
assert.strictEqual(result.summary.availableDays, 2);
assert.strictEqual(result.summary.playedDays, 2);
assert.strictEqual(result.summary.hitDays, 1);
assert.strictEqual(result.summary.profitK, 64000);

assert.throws(() => buildCalibration([{
    variants: {
        crossUnionFlat: { rows: [{ uniqueCount: 2, unitCount: 3, hit: true }] }
    }
}], config), /requires flat stakes/);

console.log('wilsonProfitGate: OK');
