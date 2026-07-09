#!/usr/bin/env node
const assert = require('assert');
const {
    rankNumbers,
    runConfig,
    chooseCandidates
} = require('./research-fixed-share-profit-optimizer');

const ids = ['a', 'b'];
const row = {
    date: '2026-01-01',
    actual: 0,
    strategies: {
        a: Array.from({ length: 30 }, (_, index) => index),
        b: Array.from({ length: 30 }, (_, index) => index + 30)
    }
};
const ranked = rankNumbers(row, ids, [0.8, 0.2], 1);
assert.strictEqual(ranked.gateId, 'a');
assert.strictEqual(ranked.ranking.length, 100);
assert.ok(ranked.ranking.slice(0, 30).every(item => item.number < 30));

const result = runConfig([row], {
    eta: 0.02,
    share: 0.1,
    gateBoost: 1,
    betCount: 30
}, ids);
assert.strictEqual(result.summary.days, 1);
assert.strictEqual(result.summary.wins, 1);
assert.strictEqual(result.summary.profitK, 54000);

const candidate = {
    config: { betCount: 30 },
    minProfitK: 1,
    minHitRate: 0.4,
    totalProfitK: 2,
    totalWins: 2,
    worstLongestLoss: 1,
    worstDrawdownK: 1
};
const selected = chooseCandidates([candidate]);
assert.strictEqual(selected.robustProfit, candidate);
assert.strictEqual(selected.robustHit, candidate);
assert.strictEqual(selected.hold70, candidate);

console.log('Fixed-share profit optimizer tests passed.');
