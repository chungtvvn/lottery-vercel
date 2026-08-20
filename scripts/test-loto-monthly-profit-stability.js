'use strict';

const assert = require('assert');
const { monthlyLockPositive, summarize } = require('./research-loto-monthly-profit-stability');

const rows = [
    { date: '2026-01-01', hits: 0, stakeK: 10, payoutK: 0, profitK: -10 },
    { date: '2026-01-02', hits: 3, stakeK: 10, payoutK: 30, profitK: 20 },
    { date: '2026-01-03', hits: 3, stakeK: 10, payoutK: 30, profitK: 20 },
    { date: '2026-02-01', hits: 2, stakeK: 10, payoutK: 20, profitK: 10 },
    { date: '2026-02-02', hits: 0, stakeK: 10, payoutK: 0, profitK: -10 }
];

const selected = monthlyLockPositive(rows);
assert.deepStrictEqual(selected.map(row => row.date), [
    '2026-01-01',
    '2026-01-02',
    '2026-02-01'
]);
assert.deepStrictEqual(summarize(selected, rows.length), {
    availableDays: 5,
    playedDays: 3,
    skippedDays: 2,
    hitDays: 2,
    hitRate: 2 / 3,
    winDays: 2,
    winRate: 2 / 3,
    totalHits: 5,
    stakeK: 30,
    payoutK: 50,
    profitK: 20,
    roi: 2 / 3
});

console.log('test-loto-monthly-profit-stability: ok');
