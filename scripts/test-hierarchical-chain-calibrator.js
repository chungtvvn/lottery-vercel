#!/usr/bin/env node
const assert = require('assert');
const {
    fitHierarchicalModel,
    refineBaselinePrediction,
    scoreNumbers
} = require('../lib/research/hierarchicalChainCalibrator');
const {
    exactMcNemarPValue,
    wilsonInterval
} = require('./research-hierarchical-chain-calibration');

function makeRow(day, actual, groupNumbers, state = 'active') {
    const numberEvidence = Array.from({ length: 100 }, (_, number) => {
        const included = groupNumbers.includes(number);
        const detail = state === 'active'
            ? { activeSets: 1, potentialSets: 0 }
            : { activeSets: 0, potentialSets: 1 };
        return {
            number,
            groups: included ? { 'sum|consecutive': 0.9 } : {},
            groupDetails: included ? { 'sum|consecutive': detail } : {}
        };
    });
    return {
        date: `2024-01-${String(day).padStart(2, '0')}`,
        actual,
        numberEvidence,
        strategies: {
            chainSmallFirst: [0, ...Array.from({ length: 29 }, (_, index) => index + 70)]
        }
    };
}

const training = Array.from({ length: 80 }, (_, index) =>
    makeRow((index % 28) + 1, 99, Array.from({ length: 10 }, (_, number) => number))
);
const model = fitHierarchicalModel(training, {
    priorStrengths: [10, 15, 20]
});
const predictionRow = makeRow(1, 99, Array.from({ length: 10 }, (_, number) => number));
const config = {
    minDays: 20,
    minConfidence: 0.8,
    reliabilityDays: 20,
    topFamilies: 1,
    swapLimit: 1,
    minMargin: 0
};
const scores = scoreNumbers(predictionRow, model, config);
assert(scores[0].score > scores[50].score, 'Tín hiệu đã học phải xếp số thuộc tập rủi ro cao hơn.');
const refined = refineBaselinePrediction(predictionRow, model, config);
assert(!refined.betNumbers.includes(0), 'Số 00 rủi ro cao phải bị loại khỏi dàn đánh.');
assert(refined.betNumbers.includes(1) === false, 'Chỉ được hoán đổi đúng swapLimit=1.');
assert.strictEqual(refined.betNumbers.length, 30, 'Dàn đánh phải giữ đúng 30 số.');
assert.strictEqual(refined.swaps.length, 1, 'Phải ghi lại đúng một lần hoán đổi.');

const noFutureModel = fitHierarchicalModel(training.slice(0, 10), {
    priorStrengths: [10, 15, 20]
});
const noFutureScores = scoreNumbers(predictionRow, noFutureModel, config);
assert.strictEqual(noFutureScores[0].score, 0, 'Mẫu chưa đủ minDays không được tạo tín hiệu.');
assert.strictEqual(exactMcNemarPValue(5, 0), 0.0625, 'McNemar exact phải tính hai phía.');
const interval = wilsonInterval(40, 100);
assert(interval.lower < 0.4 && interval.upper > 0.4, 'Wilson interval phải chứa tỷ lệ quan sát.');

console.log('Hierarchical chain calibrator tests passed.');
