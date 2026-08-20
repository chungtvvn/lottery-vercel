#!/usr/bin/env node

const assert = require('assert');
const {
    evidenceFromDiagnostics,
    extractChainFeatures
} = require('../lib/research/chainCoverageFusion');

const evidence = evidenceFromDiagnostics([{
    family: 'sum',
    pattern: 'consecutive',
    state: 'active',
    recordState: 'at-record',
    tier: 1,
    currentCount: 10,
    nextCount: 1,
    setSize: 2,
    numbers: [12, 21]
}]);
assert.strictEqual(evidence.length, 100);
assert.strictEqual(evidence[12].supportFamilies, 1);
assert.strictEqual(evidence[12].activeSets, 1);
assert.strictEqual(evidence[13].independentSets, 0);
const features = extractChainFeatures(evidence[12], { chainSmallFirst: [12] }, 12);
assert(features.every(Number.isFinite));
console.log('chainCoverageFusion tests passed');
