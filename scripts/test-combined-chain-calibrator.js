const assert = require('assert');
const {
    fuseNumberScores,
    normalizeScores,
    refineCombinedPrediction
} = require('../lib/research/combinedChainCalibrator');

const normalized = normalizeScores([
    { number: 3, score: 2 },
    { number: 7, score: 1 }
]);
assert.strictEqual(normalized.get(3), 1);
assert.strictEqual(normalized.get(7), 0.5);
assert.strictEqual(normalized.get(9), 0);

const fused = fuseNumberScores(
    [{ number: 3, score: 2 }, { number: 7, score: 1 }],
    [{ number: 3, score: 1 }, { number: 9, score: 2 }],
    { stateWeight: 0.25 }
);
assert.strictEqual(fused.find(row => row.number === 3).score, 0.875);
assert.strictEqual(fused.find(row => row.number === 3).confirmed, true);
assert.strictEqual(fused.find(row => row.number === 7).confirmed, false);

const baseline = Array.from({ length: 30 }, (_, index) => index);
const prediction = refineCombinedPrediction(
    baseline,
    [{ number: 3, score: 2 }, { number: 7, score: 1 }],
    [{ number: 3, score: 1 }, { number: 31, score: 2 }],
    { stateWeight: 0.25, gate: 'confirm', swapLimit: 1, minMargin: 0 }
);
assert.deepStrictEqual(prediction.swaps.map(row => [row.out, row.in]), [[3, 30]]);
assert(!prediction.betNumbers.includes(3));
assert(prediction.betNumbers.includes(30));
assert.strictEqual(prediction.betNumbers.length, 30);

console.log('combined-chain-calibrator tests passed');
