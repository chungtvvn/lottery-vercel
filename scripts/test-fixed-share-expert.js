#!/usr/bin/env node
const assert = require('assert');
const { runFixedShare } = require('./research-fixed-share-expert');

const strategies = {
    a: [0, 1, 2],
    b: [3, 4, 5]
};
const rows = [
    { date: '2026-01-01', actual: 0, strategies },
    { date: '2026-01-02', actual: 0, strategies },
    { date: '2026-01-03', actual: 3, strategies }
];
const result = runFixedShare(rows, {
    eta: 0.2,
    share: 0.1,
    mode: 'gate'
});

assert.strictEqual(result.summary.days, 3);
assert.strictEqual(result.summary.rows.length, 3);
assert.strictEqual(result.summary.rows[0].expertId, 'a');
assert.ok(result.finalWeights.every(value => value > 0 && value < 1));
assert.ok(Math.abs(result.finalWeights.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);

console.log('Fixed-share expert tests passed.');
