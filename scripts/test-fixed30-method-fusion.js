#!/usr/bin/env node

const assert = require('assert');
const { METHODS } = require('./research-fixed30-method-fusion');
const { annualWalkForward } = require('./research-annual-walkforward-fusion');

function syntheticRow(date, actual, shift) {
    const strategies = {};
    METHODS.forEach((method, methodIndex) => {
        strategies[method] = Array.from({ length: 30 }, (_, index) =>
            (index + shift + methodIndex * 3) % 100);
    });
    return { date, actual, strategies };
}

const rows = [
    syntheticRow('2016-12-30', 12, 0),
    syntheticRow('2016-12-31', 34, 1),
    syntheticRow('2017-01-01', 56, 2),
    syntheticRow('2017-12-31', 78, 3),
    syntheticRow('2018-01-01', 90, 4)
];
const config = {
    id: 'synthetic_equal_vote',
    poolType: 'top',
    poolSize: 5,
    trainingYears: 0,
    signaturePrior: 100,
    mode: 'equalVote',
    blend: 0
};
const result = annualWalkForward(rows, config, {
    firstEvaluationYear: 2017,
    lastEvaluationYear: 2018
});

assert.strictEqual(result.days, 3, 'Phải dự đoán đủ ba dòng 2017-2018.');
assert(result.daily.every(row => row.betNumbers.length === 30), 'Mỗi ngày phải có đúng 30 số.');
assert(result.daily.every(row => new Set(row.betNumbers).size === 30), 'Dàn không được trùng số.');
assert.strictEqual(result.modelAudit[0].trainingEnd, '2016-12-31');
assert.strictEqual(result.modelAudit[0].predictionStart, '2017-01-01');
assert.strictEqual(result.modelAudit[1].trainingEnd, '2017-12-31');
assert.strictEqual(result.modelAudit[1].predictionStart, '2018-01-01');
assert(result.modelAudit.every(row => row.trainingEnd < row.predictionStart), 'Không được rò kết quả tương lai.');

console.log('Fixed-30 annual fusion tests passed.');
