#!/usr/bin/env node
const assert = require('assert');
const {
    refinePrediction,
    scoreNumbers
} = require('../lib/research/chainScorecardStrategy');
const {
    descriptorIds,
    normalizeCandidate
} = require('../lib/research/chainReliabilityRanker');

const candidate = normalizeCandidate({
    key: 'sum:test',
    family: 'sum',
    pattern: 'up',
    state: 'active',
    recordState: 'below-record',
    currentLen: 2,
    targetLen: 3,
    numbers: [1, 2]
});
const descriptor = descriptorIds(candidate).at(-1);
const qualityMap = new Map([[descriptor.id, {
    qualityScore: 80,
    opportunities: 50,
    conservativeEdge: 0.04
}]]);
const row = {
    strategies: { chainSmallFirst: Array.from({ length: 30 }, (_, number) => number) },
    candidateDiagnostics: [candidate]
};
const scores = scoreNumbers(row, qualityMap, {
    minQualityScore: 40,
    minOpportunities: 20,
    topFamilies: 1
});
assert.strictEqual(scores[1].riskScore, 0.8);
assert.strictEqual(scores[50].riskScore, 0);
const prediction = refinePrediction(row, qualityMap, {
    minQualityScore: 40,
    minOpportunities: 20,
    topFamilies: 1,
    swapLimit: 1,
    minRiskScore: 0.4,
    minMargin: 0.1
});
assert.strictEqual(prediction.betNumbers.length, 30);
assert(!prediction.betNumbers.includes(1));
assert(prediction.betNumbers.includes(30));
assert.strictEqual(prediction.swaps.length, 1);
console.log('chainScorecardStrategy tests passed');
