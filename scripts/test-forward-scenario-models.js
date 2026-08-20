#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const {
    buildFrequencyProbabilities,
    buildMarkovProbabilities,
    createScenarioGenerator,
    settleParallelDay
} = require('../lib/research/forwardScenarioModels');

const rows = Array.from({ length: 200 }, (_, index) => ({ special: index % 10 }));
const frequency = buildFrequencyProbabilities(rows, 100);
assert.ok(Math.abs(frequency.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
assert.ok(frequency[0] > frequency[99]);

const markov = buildMarkovProbabilities(rows, 200);
assert.equal(markov.length, 100);
assert.ok(markov.every(row => Math.abs(row.reduce((sum, value) => sum + value, 0) - 1) < 1e-12));

const first = createScenarioGenerator('markov-posterior', rows, 12345);
const second = createScenarioGenerator('markov-posterior', rows, 12345);
const firstSequence = [];
const secondSequence = [];
let previousFirst = 9;
let previousSecond = 9;
for (let index = 0; index < 20; index++) {
    previousFirst = first({ previousNumber: previousFirst });
    previousSecond = second({ previousNumber: previousSecond });
    firstSequence.push(previousFirst);
    secondSequence.push(previousSecond);
}
assert.deepEqual(firstSequence, secondSequence);

assert.deepEqual(
    settleParallelDay({
        unionNumbers: [1, 2, 3, 4],
        intersectionNumbers: [2, 3],
        actual: 2,
        multiplier: 2,
        payout: 84
    }),
    { units: 6, unionHit: true, overlapHit: true, profitUnits: 162 }
);
assert.deepEqual(
    settleParallelDay({
        unionNumbers: [1, 2, 3, 4],
        intersectionNumbers: [2, 3],
        actual: 4,
        multiplier: 4,
        payout: 84
    }),
    { units: 10, unionHit: true, overlapHit: false, profitUnits: 74 }
);

console.log('Forward scenario model tests passed.');
