#!/usr/bin/env node
const assert = require('assert');
const {
    buildBetNumbers,
    familyStrengths,
    noisyOr,
    summarizeRows
} = require('./research-strict-pit-hazard-ranker');

const evidence = {
    groups: {
        'sum|up': 0.8,
        'sum|uniformUp': 0.7,
        'head|up': 0.5
    }
};
assert.deepStrictEqual(familyStrengths(evidence), [0.8, 0.5]);
assert(Math.abs(noisyOr([0.8, 0.5]) - 0.9) < 1e-9);

const row = {
    actual: 99,
    numberEvidence: Array.from({ length: 100 }, (_, number) => ({
        number,
        groups: { [`family-${number}|pattern`]: number / 100 }
    }))
};
const bets = buildBetNumbers(row, item => Number(Object.values(item.groups)[0]), 30);
assert.deepStrictEqual(bets, Array.from({ length: 30 }, (_, index) => index));

const summary = summarizeRows([
    { date: '2026-01-01', actual: 1 },
    { date: '2026-01-02', actual: 9 }
], rowData => rowData.date.endsWith('01') ? [1, 2] : [1, 2], {
    betPerNumberK: 1000,
    winMultiplier: 84
});
assert.strictEqual(summary.wins, 1);
assert.strictEqual(summary.profitK, 80000);
assert.strictEqual(summary.longestWin, 1);
assert.strictEqual(summary.longestLoss, 1);

console.log('Strict PIT hazard ranker tests passed.');
