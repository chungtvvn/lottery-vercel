#!/usr/bin/env node
const assert = require('assert');
const {
    allocateFixedUnits,
    blockBootstrap,
    conditionalSoftmaxProbabilities,
    fitConditionalSoftmax,
    multipleTestingNull,
    predictTopK,
    settle,
    settleWeighted
} = require('../lib/research/strictEnsembleStress');

const rows = Array.from({ length: 40 }, (_, index) => ({
    date: `2024-01-${String((index % 28) + 1).padStart(2, '0')}-${index}`,
    actual: index % 10,
    strategies: {
        good: Array.from({ length: 30 }, (_, number) => number),
        bad: Array.from({ length: 30 }, (_, number) => number + 70)
    }
}));
const model = fitConditionalSoftmax(rows, ['good', 'bad'], {
    epochs: 80,
    learningRate: 0.3,
    l2: 0.05
});
assert(model.weights[0] > model.weights[1], 'Softmax phải học trọng số phương pháp tốt cao hơn.');
const probabilities = conditionalSoftmaxProbabilities(rows[0], ['good', 'bad'], model);
assert.strictEqual(probabilities.length, 100);
assert(Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
assert(probabilities[0] > probabilities[70], 'Số thuộc phương pháp tốt phải có xác suất cao hơn.');
const picks = predictTopK(rows[0], ['good', 'bad'], 'softmax', 30, model, ['good', 'bad']);
assert.strictEqual(picks.length, 30);
assert(picks.includes(0), 'Dàn softmax phải giữ số thuộc phương pháp tốt.');
const summary = settle(rows, row => predictTopK(
    row,
    ['good', 'bad'],
    'softmax',
    30,
    model,
    ['good', 'bad']
));
assert.strictEqual(summary.wins, 40);
const stressA = blockBootstrap(summary.daily, { paths: 200, horizon: 30, seed: 7 });
const stressB = blockBootstrap(summary.daily, { paths: 200, horizon: 30, seed: 7 });
assert.deepStrictEqual(stressA, stressB, 'Stress test phải tái lập với cùng seed.');
const nullA = multipleTestingNull(rows, [
    { id: 'good', selector: row => row.strategies.good },
    { id: 'bad', selector: row => row.strategies.bad }
], { paths: 200, seed: 9 });
const nullB = multipleTestingNull(rows, [
    { id: 'good', selector: row => row.strategies.good },
    { id: 'bad', selector: row => row.strategies.bad }
], { paths: 200, seed: 9 });
assert.strictEqual(nullA.observedBestId, 'good');
assert.strictEqual(nullA.observedBestHits, 40);
assert.deepStrictEqual(nullA, nullB, 'Kiểm định nhiều cấu hình phải tái lập.');
const allocation = allocateFixedUnits(rows[0], ['good', 'bad'], 'overlap', 2, 30);
assert.strictEqual(allocation.reduce((sum, item) => sum + item.units, 0), 30);
const weighted = settleWeighted(rows, row => allocateFixedUnits(
    row,
    ['good', 'bad'],
    'exclusive',
    2,
    30
));
assert.strictEqual(weighted.stakeK, 40 * 30 * 1000);
assert(weighted.averageUniqueBets <= 30);
console.log('✅ strictEnsembleStress tests passed');
