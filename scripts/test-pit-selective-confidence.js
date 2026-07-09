#!/usr/bin/env node
const assert = require('assert');
const {
    deriveRow,
    summarize,
    applySelector
} = require('./research-pit-selective-confidence');

const strategies = {
    chainBlockFirst: Array.from({ length: 30 }, (_, index) => index),
    chainSmallFirst: Array.from({ length: 30 }, (_, index) => index),
    numberAvgRisk: Array.from({ length: 30 }, (_, index) => index),
    numberConsensusRisk: Array.from({ length: 30 }, (_, index) => index),
    numberPosteriorDiversity: Array.from({ length: 30 }, (_, index) => index)
};
const row = deriveRow({
    date: '2025-01-01',
    actual: 5,
    candidateCount: 2500,
    strategies
});
assert.strictEqual(row.features.pairwiseAgreement, 1);
assert.strictEqual(row.features.blockAvgOverlap, 1);
assert.strictEqual(row.derivedStrategies.voteTop30.length, 30);
assert.strictEqual(summarize([row], 'voteTop30').wins, 1);
assert.strictEqual(applySelector([row], {
    feature: 'candidateCount',
    direction: 'high',
    threshold: 2400
}).length, 1);
console.log('test-pit-selective-confidence: ok');
