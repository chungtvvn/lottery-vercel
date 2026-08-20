#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    wilsonLower,
    evaluateGate,
    summarize,
    summarizeCombinedBetHold
} = require('../lib/research/walkforwardWilsonGate');

assert(wilsonLower(9, 10, 1.64) < 0.9, 'Wilson lower bound must be conservative.');
assert(wilsonLower(9, 10, 1.64) > wilsonLower(6, 10, 1.64), 'More successes must improve lower bound.');

const rows = [
    { date: '2026-01-01', actual: 1, hit: true, confidence: 0.9 },
    { date: '2026-01-02', actual: 2, hit: true, confidence: 0.9 },
    { date: '2026-01-03', actual: 3, hit: true, confidence: 0.9 },
    { date: '2026-01-04', actual: 4, hit: true, confidence: 0.9 },
    { date: '2026-01-05', actual: 5, hit: true, confidence: 0.9 }
];
const settled = evaluateGate(rows, { betCount: 30, payoutMultiplier: 84, minSample: 3, z: 1.28 });
assert.strictEqual(settled[0].played, false, 'First day cannot use future outcomes.');
assert.strictEqual(settled[3].played, true, 'Gate should open from prior comparable outcomes only.');
const result = summarize(settled, { betCount: 30, payoutMultiplier: 84, stakePerNumberK: 1000 });
assert.strictEqual(result.playedDays, 2, 'Only days with enough prior evidence may be played.');

const combined = summarizeCombinedBetHold([
    { hit: true },
    { hit: false }
], { betCount: 3, payoutMultiplier: 84, stakePerNumberK: 1000 });
assert.strictEqual(combined.winProfitPerDayK, 149385, 'Combined bet/hold win formula is incorrect.');
assert.strictEqual(combined.lossProfitPerDayK, -4615, 'Combined bet/hold loss formula is incorrect.');
console.log('walkforward-wilson-gated: OK');
