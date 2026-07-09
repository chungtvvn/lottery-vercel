#!/usr/bin/env node
const assert = require('assert');
const {
    scorePrediction,
    trainPairwise
} = require('./research-full-pit-modern-ensemble');

const featureRows = [{
    row: { actual: 0 },
    features: Array.from({ length: 100 }, (_, number) => [1, Number(number === 0)])
}];
const weights = trainPairwise(featureRows, {
    learningRate: 0.01,
    l2: 0,
    epochs: 3
});
assert(weights[1] > 0);
const prediction = scorePrediction(featureRows[0], weights);
assert(prediction.betNumbers.includes(0));
assert.strictEqual(prediction.betNumbers.length, 30);
assert(Number.isFinite(prediction.confidence));

console.log('Full PIT modern ensemble tests passed.');
