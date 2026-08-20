'use strict';

const assert = require('assert');
const {
    fitReliabilityModel,
    refinePrediction
} = require('../lib/research/chainReliabilityRanker');

const trainingRows = Array.from({ length: 12 }, (_, index) => ({
    date: `2024-01-${String(index + 1).padStart(2, '0')}`,
    candidateDiagnostics: [{
        key: 'sum:test',
        family: 'sum',
        pattern: 'consecutive',
        state: 'active',
        recordState: 'below',
        currentLen: 2,
        targetLen: 3,
        numbers: [1],
        baseExclusionRate: 0.99,
        observedExcluded: true
    }]
}));
const model = fitReliabilityModel(trainingRows, { priorStrengths: [1, 1, 1] });
const row = {
    strategies: {
        chainSmallFirst: [1, 2, 3],
        recurrenceGuarded: [1, 4, 5]
    },
    candidateDiagnostics: [{
        key: 'sum:test',
        family: 'sum',
        pattern: 'consecutive',
        state: 'active',
        recordState: 'below',
        currentLen: 2,
        targetLen: 3,
        numbers: [1],
        baseExclusionRate: 0.99
    }]
};
const prediction = refinePrediction(row, model, {
    baseStrategyId: 'recurrenceGuarded',
    priorStrengths: [1, 1, 1],
    minOpportunities: 1,
    reliabilityDays: 1,
    conservativeZ: 0,
    minEdge: -1,
    swapLimit: 0
});
assert.deepStrictEqual(prediction.betNumbers, [1, 4, 5]);
assert.strictEqual(prediction.baseStrategyId, 'recurrenceGuarded');
console.log('PASS chainReliabilityRanker supports an explicit base strategy.');
