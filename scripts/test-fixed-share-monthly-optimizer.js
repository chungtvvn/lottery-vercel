#!/usr/bin/env node
const assert = require('assert');
const {
    summarizeMonths,
    choose
} = require('./research-fixed-share-monthly-optimizer');

const months = summarizeMonths([
    { date: '2025-01-01', win: true, profitK: 54, stakeK: 30 },
    { date: '2025-01-02', win: false, profitK: -30, stakeK: 30 },
    { date: '2025-02-01', win: true, profitK: 54, stakeK: 30 }
]);
assert.strictEqual(months.length, 2);
assert.strictEqual(months[0].profitK, 24);
assert.strictEqual(months[1].wins, 1);

const candidate = {
    config: { betCount: 30 },
    profitableMonths: 1,
    nonLosingMonths: 1,
    minMonthlyProfitK: 0,
    minMonthlyHitRate: 0.4,
    summary: { profitK: 10, maxDrawdownK: 5 }
};
const selected = choose([candidate]);
assert.strictEqual(selected.monthlyProfit, candidate);
assert.strictEqual(selected.monthlyHit, candidate);
assert.strictEqual(selected.hold70, candidate);

console.log('Fixed-share monthly optimizer tests passed.');
