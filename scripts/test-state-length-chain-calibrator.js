#!/usr/bin/env node
const assert = require('assert');
const {
    fitStateLengthModel,
    lengthBucket,
    recordBucket,
    refineBaselinePrediction,
    scoreNumbers
} = require('../lib/research/stateLengthChainCalibrator');

function row(day, actual, numbers, state = 'potential', baseLen = 2) {
    return {
        date: `2024-01-${String(day).padStart(2, '0')}`,
        actual,
        strategies: {
            chainSmallFirst: [0, ...Array.from({ length: 29 }, (_, index) => index + 70)]
        },
        candidateDiagnostics: [{
            key: 'tong_moi_5:luiLienTiep',
            family: 'sum',
            pattern: 'down',
            state,
            recordState: 'at-record',
            tier: 1,
            currentLen: baseLen - 1,
            baseLen,
            setSize: numbers.length,
            numbers
        }]
    };
}

const training = Array.from({ length: 20 }, (_, index) =>
    row(index + 1, 99, [0, 1], 'potential', 2)
);
const model = fitStateLengthModel(training, { priorStrengths: [5, 8, 10, 12] });
const config = {
    minDays: 10,
    minConfidence: 0.7,
    reliabilityDays: 10,
    topFamilies: 1,
    swapLimit: 1,
    minMargin: 0
};
const testRow = row(21, 99, [0, 1], 'potential', 2);
const scores = scoreNumbers(testRow, model, config);
assert(scores[0].score > scores[50].score, 'Tập potential thường không hình thành phải có điểm loại cao hơn.');
const refined = refineBaselinePrediction(testRow, model, config);
assert(!refined.betNumbers.includes(0), 'Phải loại một số rủi ro khỏi dàn nền.');
assert.strictEqual(refined.betNumbers.length, 30, 'Dàn Đề phải giữ đúng 30 số.');
assert.strictEqual(refined.swaps.length, 1, 'Guardrail phải giới hạn đúng một swap.');
assert.strictEqual(lengthBucket(7), 'l7+');
assert.strictEqual(recordBucket('super-record'), 'record-or-super');
assert.strictEqual(recordBucket('never-pattern'), 'never');

const shortModel = fitStateLengthModel(training.slice(0, 4), { priorStrengths: [5, 8, 10, 12] });
assert.strictEqual(scoreNumbers(testRow, shortModel, config)[0].score, 0,
    'Mẫu chưa đủ số ngày không được tạo tín hiệu.');

console.log('State-length chain calibrator tests passed.');
