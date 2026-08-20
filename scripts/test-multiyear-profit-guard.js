#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    wilsonInterval,
    inferParallelSegments,
    settleSegment,
    blockBootstrapAnnualProfit
} = require('../lib/research/multiyearProfitGuard');

const source = {
    key: 'fixture',
    days: 10,
    hitDays: 6,
    totalBetNumbers: 400,
    stakeK: 500000,
    payoutK: 7 * 84000
};
const segment = inferParallelSegments(source);
assert.deepStrictEqual(segment, {
    key: 'fixture',
    days: 10,
    unionHits: 6,
    overlapHits: 1,
    uniqueOnlyHits: 5,
    overlapUnits: 100,
    uniqueOnlyUnits: 300,
    unionUniqueUnits: 400
});
assert.strictEqual(settleSegment(segment, 'overlapOnly', 84).profitK, -16000);
assert.strictEqual(settleSegment(segment, 'uniqueOnly', 84).profitK, 120000);
assert.strictEqual(settleSegment(segment, 'unionSingle', 84).profitK, 104000);
assert.strictEqual(settleSegment(segment, 'parallelX2', 84).profitK, 88000);

const interval = wilsonInterval(50, 100);
assert(interval.lower < 0.5 && interval.upper > 0.5);
const first = blockBootstrapAnnualProfit([10, -5, 8, 4], { iterations: 500, seed: 7 });
const second = blockBootstrapAnnualProfit([10, -5, 8, 4], { iterations: 500, seed: 7 });
assert.deepStrictEqual(first, second);

console.log('Multiyear profit guard tests passed.');
