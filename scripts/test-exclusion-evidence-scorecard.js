#!/usr/bin/env node
const assert = require('assert');
const {
    averagePredictionJaccard,
    buildMethodWeights,
    predict,
    settle
} = require('../lib/research/exclusionEvidenceScorecard');

const rows = Array.from({ length: 20 }, (_, index) => ({
    date: `2020-01-${String(index + 1).padStart(2, '0')}`,
    actual: index % 10,
    strategies: {
        strong: Array.from({ length: 30 }, (_, number) => number),
        duplicate: Array.from({ length: 30 }, (_, number) => number),
        weak: Array.from({ length: 30 }, (_, number) => number + 50)
    }
}));

assert.strictEqual(averagePredictionJaccard(rows, 'strong', 'duplicate'), 1);
assert.strictEqual(averagePredictionJaccard(rows, 'strong', 'weak'), 0);

const weights = buildMethodWeights(rows, ['strong', 'duplicate', 'weak'], {
    priorStrength: 10,
    conservativeZ: 0,
    temperature: 0.05,
    similarityPenalty: 1,
    maxExperts: 3
});
assert(weights.find(item => item.methodId === 'strong').normalizedWeight >
    weights.find(item => item.methodId === 'weak').normalizedWeight);

const bets = predict(rows[0], weights, 30);
assert.strictEqual(bets.length, 30);
assert(bets.includes(0));
assert(!bets.includes(99));

const summary = settle(rows.slice(0, 2), () => bets);
assert.strictEqual(summary.days, 2);
assert.strictEqual(summary.hits, 2);
assert.strictEqual(summary.profitK, 108000);

console.log('exclusionEvidenceScorecard tests passed');
