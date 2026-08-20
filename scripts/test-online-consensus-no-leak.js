'use strict';

const assert = require('assert');
const {
    createState,
    predict,
    settle
} = require('../lib/research/onlineConsensusEnsemble');

const strategyIds = ['chainBlockFirst', 'chainSmallFirst', 'numberSurvivalCredibleRisk'];
const row = {
    date: '2026-01-02',
    actual: 99,
    strategies: {
        chainBlockFirst: Array.from({ length: 30 }, (_, index) => index),
        chainSmallFirst: Array.from({ length: 30 }, (_, index) => index + 10),
        numberSurvivalCredibleRisk: Array.from({ length: 30 }, (_, index) => index + 20)
    }
};
const firstState = createState(strategyIds);
const secondState = createState(strategyIds);
const first = predict(row, firstState, { mode: 'emaWeighted', betCount: 30 });
const second = predict({ ...row, actual: 0 }, secondState, {
    mode: 'emaWeighted',
    betCount: 30
});
assert.deepStrictEqual(first, second, 'Kết quả cùng ngày không được tác động vào dàn dự đoán ngày đó.');

settle({ ...row, actual: 0 }, firstState);
assert(
    firstState.experts.chainBlockFirst.ema >
        firstState.experts.chainSmallFirst.ema,
    'Kết quả đã settle phải cập nhật trọng số expert cho ngày tiếp theo.'
);
console.log('PASS online consensus predicts before settlement and has no same-day leakage.');
