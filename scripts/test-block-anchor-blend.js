#!/usr/bin/env node
const assert = require('assert');
const { blendBlock, summarize } = require('./research-block-anchor-blend');

const block = Array.from({ length: 30 }, (_, index) => index);
const row = {
    date: '2025-01-01',
    actual: 99,
    strategies: {
        chainBlockFirst: block,
        numberAvgRisk: [1, 2, 99],
        numberConsensusRisk: [2, 99],
        numberPosteriorDiversity: [99],
        numberWeightedRisk: [99]
    }
};
const blended = blendBlock(
    row,
    [
        'numberAvgRisk',
        'numberConsensusRisk',
        'numberPosteriorDiversity',
        'numberWeightedRisk'
    ],
    1
);
assert.strictEqual(blended.length, 30);
assert(blended.includes(99));
assert(!blended.includes(29));

const summary = summarize([row], {
    supportGroup: 'numberOnly',
    swapCount: 1
});
assert.strictEqual(summary.wins, 1);
assert.strictEqual(summary.profitK, 54000);
console.log('test-block-anchor-blend: ok');
