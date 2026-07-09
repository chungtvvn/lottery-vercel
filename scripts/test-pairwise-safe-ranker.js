const assert = require('assert');
const {
    FEATURE_NAMES,
    FEATURE_SETS,
    trainPairwise,
    predict
} = require('./research-pairwise-safe-ranker');

assert.equal(FEATURE_NAMES[0], 'posteriorSafeRank');
assert.deepStrictEqual(FEATURE_SETS.posteriorOnly, [0]);

const trainingDays = Array.from({ length: 24 }, (_, dayIndex) => {
    const actual = dayIndex % 100;
    return {
        actual,
        features: Array.from({ length: 100 }, (_, number) => [
            number === actual ? 1 : 0
        ])
    };
});
const model = trainPairwise(trainingDays, [0], {
    learningRate: 0.08,
    l2: 0.001,
    epochs: 10
});
const testFeatures = Array.from({ length: 100 }, (_, number) => [
    number === 42 ? 1 : 0
]);
const selected = predict(model, testFeatures, 30);

assert.ok(model.weights[0] > 0, 'Ranker phải học trọng số dương cho tín hiệu an toàn.');
assert.ok(selected.includes(42), 'Số có tín hiệu an toàn phải nằm trong dàn đánh.');
assert.equal(selected.length, 30, 'Hold 70 phải giữ đúng 30 số đánh.');

console.log('Pairwise safe ranker tests passed.');
