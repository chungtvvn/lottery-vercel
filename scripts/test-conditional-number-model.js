const assert = require('assert');
const {
    FEATURE_NAMES,
    extractFeatures,
    softmax,
    trainConditionalModel
} = require('../lib/research/conditionalNumberModel');

const probabilities = softmax([0, 0]);
assert.deepStrictEqual(probabilities, [0.5, 0.5]);

const row = {
    date: '2024-01-01',
    actual: 0,
    strategies: { chainSmallFirst: Array.from({ length: 30 }, (_, index) => index) },
    numberEvidence: Array.from({ length: 100 }, (_, number) => ({
        number,
        groups: number === 0 ? { 'number|down': 0.9 } : {},
        groupDetails: number === 0 ? {
            'number|down': { activeSets: 1, potentialSets: 0 }
        } : {}
    }))
};
assert.strictEqual(extractFeatures(row, row.numberEvidence[0]).length, FEATURE_NAMES.length);
const model = trainConditionalModel([row], { epochs: 2, learningRate: 0.01, l2: 0.01 });
assert.strictEqual(model.weights.length, FEATURE_NAMES.length);
assert(Number.isFinite(model.finalLoss));

console.log('conditional-number-model tests passed');
