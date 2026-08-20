#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildBlendedPredictions, buildPredictions, signatureFor } = require('../lib/research/onlineSignatureRanker');

const rows = [
    { date: '2020-01-01', actual: 0, strategies: { a: [0], b: [0] } },
    { date: '2020-01-02', actual: 1, strategies: { a: [1], b: [1] } }
];
const options = {
    methodIds: ['a', 'b'],
    betCount: 1,
    priorMean: 0.01,
    priorStrength: 1
};
const result = buildPredictions(rows, options);
const changedOutcome = buildPredictions([
    rows[0],
    { ...rows[1], actual: 99 }
], options);

assert.equal(result.length, 2);
assert.equal(result[0].betNumbers.length, 1);
assert.deepEqual(
    result[1].betNumbers,
    changedOutcome[1].betNumbers,
    'Second-day rank must not read its own (or any later) outcome.'
);
assert.equal(signatureFor(4, { a: new Set([4]), b: new Set() }, ['a', 'b']), '10');
assert.deepEqual(
    buildBlendedPredictions(rows, { ...options, signatureWeight: 0.5 })[1].betNumbers,
    buildBlendedPredictions([{ ...rows[0] }, { ...rows[1], actual: 99 }], { ...options, signatureWeight: 0.5 })[1].betNumbers,
    'Blended rank must not read its own outcome.'
);
console.log('online-signature-ranker: OK');
