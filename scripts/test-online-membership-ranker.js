#!/usr/bin/env node
const assert = require('assert');
const {
    createState,
    rankRow,
    runOnline,
    sigmoid,
    updateState
} = require('../lib/research/onlineMembershipRanker');

const ids = ['chainSmallFirst', 'chainBlockFirst'];
const config = {
    learningRate: 0.05,
    l2: 0.001,
    decay: 1,
    positiveWeight: 1,
    interactions: true,
    numberBias: false
};
const rows = [
    {
        date: '2026-01-01',
        actual: 42,
        strategies: {
            chainSmallFirst: [42, 43],
            chainBlockFirst: [42, 44]
        }
    },
    {
        date: '2026-01-02',
        actual: 99,
        strategies: {
            chainSmallFirst: [42, 45],
            chainBlockFirst: [42, 46]
        }
    }
];

assert.equal(sigmoid(0), 0.5);
const state = createState(ids, config);
const before = rankRow(rows[0], ids, state, config).map(row => row.number);
updateState(state, rankRow(rows[0], ids, state, config), rows[0].actual, config);
const after = rankRow(rows[1], ids, state, config).map(row => row.number);
assert.notDeepStrictEqual(after, before, 'Model must update after a settled result.');

const original = runOnline(rows, ids, config).predictions;
const changedFuture = runOnline([
    rows[0],
    { ...rows[1], actual: 0 }
], ids, config).predictions;
assert.deepStrictEqual(
    original[0].ranking,
    changedFuture[0].ranking,
    'Changing a future result must not alter an earlier prediction.'
);
assert.deepStrictEqual(
    original[1].ranking,
    changedFuture[1].ranking,
    'The current-day result must be applied only after its prediction.'
);

console.log('Online membership ranker tests passed.');
