#!/usr/bin/env node
const assert = require('assert');
const { runSelector, trailingOutcomes, scoreMethod, buildPriorStats } = require('./research-walkforward-method-selector');

const rows = [
    { date: '2020-01-01', actual: 1, strategies: { a: { numbers: [1, 2, 3], source: 'test' } } },
    { date: '2020-01-02', actual: 9, strategies: { a: { numbers: [1, 2, 3], source: 'test' } } },
    { date: '2020-01-03', actual: 1, strategies: { a: { numbers: [1, 2, 3], source: 'test' } } }
];
assert.deepStrictEqual(trailingOutcomes(rows, 1, 'a', 30), [true]);
assert.deepStrictEqual(trailingOutcomes(rows, 2, 'a', 30), [false, true]);
assert.strictEqual(scoreMethod([true, false], { minSamples: 3, alpha: 6, beta: 14 }), null);

// The day being settled is deliberately absent from its own trailing score.
buildPriorStats(rows, [30]);
const outcome = runSelector(rows, {
    window: 30,
    minSamples: 1,
    alpha: 6,
    beta: 14,
    rule: 'expectedProfit',
    requirePositiveLower: false
}, '2020-01-01', '2020-01-03');
assert.strictEqual(outcome.activeDays, 2);
assert.strictEqual(outcome.rows[0].skipped, true);
assert.strictEqual(outcome.rows[1].hit, false);
assert.strictEqual(outcome.rows[2].hit, true);
console.log('Walk-forward method selector tests passed.');
