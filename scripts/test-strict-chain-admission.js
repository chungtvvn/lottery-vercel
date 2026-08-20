#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    buildPrediction,
    qualifyCandidate,
    wilsonLower
} = require('../lib/research/strictChainAdmission');

const CONFIG = {
    margin: 0.1,
    minTrials: 10,
    wilsonZ: 1.28,
    reliabilityPrior: 24,
    activeFrequencyLimit: 0.45,
    recordFrequencyLimit: 0.99,
    maxBoundarySetSize: 20,
    minBoundarySamples: 2,
    minPotentialCurrentLen: 2,
    allowUnknownPotentialBoundary: false,
    maxFamiliesPerNumber: 4
};

assert(wilsonLower(18, 20) > wilsonLower(12, 20));

const strong = {
    tier: 2,
    state: 'active',
    recordState: 'below-record',
    family: 'sum',
    numbers: Array.from({ length: 20 }, (_, index) => index),
    trials: 100,
    failures: 100,
    exposureFrequencyPerYear: 0.2
};
assert(qualifyCandidate(strong, CONFIG));
assert.strictEqual(qualifyCandidate({ ...strong, trials: 3, failures: 3 }, CONFIG), null);

const unknownPotential = {
    tier: 1,
    state: 'potential',
    recordState: 'at-record',
    family: 'sum',
    numbers: [71],
    trials: null,
    failures: null,
    currentLen: 3,
    currentCount: 5,
    exposureFrequencyPerYear: 0.1
};
assert.strictEqual(qualifyCandidate(unknownPotential, CONFIG), null);
assert(qualifyCandidate(unknownPotential, {
    ...CONFIG,
    allowUnknownPotentialBoundary: true
}));

const baseline = Array.from({ length: 30 }, (_, index) => index);
const unchanged = buildPrediction([], baseline, 70, CONFIG);
assert.deepStrictEqual(unchanged.betNumbers, baseline);
const changed = buildPrediction([strong], baseline, 70, CONFIG);
assert(!changed.betNumbers.includes(0));
assert.strictEqual(changed.betNumbers.length, 30);
assert.strictEqual(changed.changedNumbers, 40);
const noLeakLeft = buildPrediction([{ ...strong, observedExcluded: true }], baseline, 70, CONFIG);
const noLeakRight = buildPrediction([{ ...strong, observedExcluded: false }], baseline, 70, CONFIG);
assert.deepStrictEqual(noLeakLeft.betNumbers, noLeakRight.betNumbers);

console.log('Strict chain admission tests passed.');
