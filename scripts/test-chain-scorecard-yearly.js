#!/usr/bin/env node
const assert = require('assert');
const {
    evaluateYear,
    wilsonInterval
} = require('./research-chain-scorecard-yearly');

const interval = wilsonInterval(50, 100);
assert(Math.abs(interval.lower - 0.40382982859014716) < 1e-12);
assert(Math.abs(interval.upper - 0.5961701714098528) < 1e-12);

const baselineBets = Array.from({ length: 30 }, (_, index) => index);
const rows = [
    {
        date: '2020-01-01',
        actual: 5,
        strategies: { chainSmallFirst: baselineBets },
        candidateDiagnostics: []
    },
    {
        date: '2020-01-02',
        actual: 80,
        strategies: { chainSmallFirst: baselineBets },
        candidateDiagnostics: []
    }
];
const result = evaluateYear(rows, []);
assert.strictEqual(result.candidate.days, 2);
assert.strictEqual(result.candidate.hits, 1);
assert.strictEqual(result.candidate.profitK, 24000);
assert.strictEqual(result.deltaHits, 0);
assert.strictEqual(result.deltaProfitK, 0);
assert.deepStrictEqual(result.candidate.hitRateWilson95, wilsonInterval(1, 2));

console.log('chain scorecard yearly tests passed');
