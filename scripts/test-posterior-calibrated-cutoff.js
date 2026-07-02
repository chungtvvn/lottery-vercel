const assert = require('assert');
const {
    buildDynamicPrediction,
    calibratedProbabilities
} = require('./research-posterior-calibrated-cutoff');

const ranking = Array.from({ length: 100 }, (_, index) => ({
    number: String(index).padStart(2, '0'),
    score: 100 - index
}));
const calibration = { lambda: 4, uniformMix: 0.25 };
const probabilities = calibratedProbabilities(ranking, calibration);

assert.ok(Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-9);
assert.ok(probabilities[99] > probabilities[0]);

const prediction = buildDynamicPrediction(
    { ranking },
    calibration,
    { minBetCount: 15, maxBetCount: 50, winMultiplier: 84 }
);
assert.ok(prediction.betCount >= 15 && prediction.betCount <= 50);
assert.equal(prediction.betNumbers[0], 99);

console.log('Posterior calibrated-cutoff tests passed.');
