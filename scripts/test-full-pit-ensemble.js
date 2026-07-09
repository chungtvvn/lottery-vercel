#!/usr/bin/env node
const assert = require('assert');
const {
    buildConsensusBets,
    combinations,
    selectionScore,
    summarize
} = require('./research-full-pit-ensemble');

assert.deepStrictEqual(combinations(['a', 'b', 'c'], 2), [
    ['a', 'b'],
    ['a', 'c'],
    ['b', 'c'],
    ['a', 'b', 'c']
]);

const row = {
    actual: 0,
    strategies: {
        a: Array.from({ length: 30 }, (_, index) => index),
        b: Array.from({ length: 30 }, (_, index) => index + 10)
    }
};
const bets = buildConsensusBets(row, ['a', 'b']);
assert.strictEqual(bets.length, 30);
assert(Array.from({ length: 20 }, (_, index) => index + 10).every(number => bets.includes(number)));

const summary = summarize([
    { date: '2026-01-01', actual: 1 },
    { date: '2026-01-02', actual: 99 }
], () => [1, 2]);
assert.strictEqual(summary.wins, 1);
assert.strictEqual(summary.profitK, 80000);
assert(Number.isFinite(selectionScore(summary)));

console.log('Full PIT ensemble tests passed.');
