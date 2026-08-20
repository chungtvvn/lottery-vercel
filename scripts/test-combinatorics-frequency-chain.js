#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    binomialCoefficient,
    binomialTail,
    combinationHitProbability,
    monteCarloBinomial,
    probabilityAtLeastHits,
    standardizeRows,
    trainSoftmax,
    predictTopK
} = require('../lib/research/combinatoricsFrequencyChain');

assert.strictEqual(binomialCoefficient(5, 2), 10n);
assert.strictEqual(binomialCoefficient(100, 0), 1n);
assert(Math.abs(combinationHitProbability(100, 30) - 0.3) < 1e-12);
assert(Math.abs(binomialTail(2, 1, 0.5) - 0.75) < 1e-10);
assert(Math.abs(probabilityAtLeastHits(10, 2, 1) - 0.19) < 1e-10);

const rawRows = [
    {
        date: '2026-01-01', actual: 0,
        numbers: [
            { number: 0, features: [1, 1] },
            { number: 1, features: [0, 0] }
        ]
    },
    {
        date: '2026-01-02', actual: 0,
        numbers: [
            { number: 0, features: [1, 1] },
            { number: 1, features: [0, 0] }
        ]
    }
];
const standardized = standardizeRows(rawRows);
const weights = trainSoftmax(standardized.rows, { epochs: 20, learningRate: 0.05, l2: 0.001 });
assert.deepStrictEqual(predictTopK(standardized.rows[0], weights, 1), [0]);

const first = monteCarloBinomial({ trials: 20, paths: 500, probability: 0.3, seed: 7 });
const second = monteCarloBinomial({ trials: 20, paths: 500, probability: 0.3, seed: 7 });
assert.deepStrictEqual(first, second);

console.log('Combinatorics/frequency/chain tests passed.');
