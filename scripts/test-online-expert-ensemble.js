const assert = require('assert');
const {
    buildOnlinePrediction,
    createExpertState,
    getExpertWeight,
    updateExpertState
} = require('./research-online-expert-ensemble');

const config = {
    expertSet: 'test',
    priorStrength: 20,
    decay: 1,
    temperature: 7
};
const expertSets = { test: ['expertA', 'expertB'] };
const state = createExpertState(config, expertSets);
const expertPredictions = {
    expertA: {
        _betSet: new Set([10, 11]),
        ranking: [{ number: '10', rank: 100 }, { number: '11', rank: 99 }]
    },
    expertB: {
        _betSet: new Set([20, 21])
    },
    numberPosteriorDiversity: {
        ranking: [{ number: '10', rank: 100 }, { number: '20', rank: 1 }]
    }
};

const beforeA = getExpertWeight(state.stats.get('expertA'), config);
const beforeB = getExpertWeight(state.stats.get('expertB'), config);
assert.equal(beforeA, beforeB);

const initial = buildOnlinePrediction(config, state, expertPredictions, 98);
assert.ok(initial.includes(10));

updateExpertState(config, state, expertPredictions, 10);
assert.ok(
    getExpertWeight(state.stats.get('expertA'), config) >
    getExpertWeight(state.stats.get('expertB'), config)
);

const next = buildOnlinePrediction(config, state, expertPredictions, 98);
assert.deepStrictEqual(next, [10, 11]);

console.log('Online expert ensemble tests passed.');
