#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    buildBlockOnlyPrediction,
    deduplicateBlocks,
    rankBlockOnly
} = require('../lib/research/blockOnlyRanker');

function block(overrides = {}) {
    return {
        key: 'tong:block2x1SoLe',
        family: 'block',
        state: 'active',
        tier: 1,
        recordState: 'at-record',
        currentCount: 20,
        nextCount: 2,
        exposureFrequencyPerYear: 0.5,
        numbers: [10, 11],
        baseExclusionRate: 0.98,
        ...overrides
    };
}

const rows = [
    block(),
    block({ key: 'duplicate:block2x1SoLe' }),
    block({ key: 'hieu:block3x3SoLe', numbers: [20, 21], nextCount: 0 })
];

assert.strictEqual(deduplicateBlocks(rows).length, 2);
for (const method of ['blockSequential', 'blockAverageDropoff', 'blockConsensusEdge']) {
    const ranking = rankBlockOnly(rows, method);
    assert.strictEqual(ranking.length, 100);
    assert.strictEqual(new Set(ranking.map(row => row.number)).size, 100);
    const prediction = buildBlockOnlyPrediction(rows, 70, method);
    assert.strictEqual(prediction.excludedNumbers.length, 70);
    assert.strictEqual(prediction.betNumbers.length, 30);
}

console.log('Block-only ranker tests passed.');

