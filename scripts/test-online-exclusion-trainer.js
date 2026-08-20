#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    createState,
    rankRow,
    updateState
} = require('../lib/research/onlineMembershipRanker');

const methods = ['chainSmallFirst', 'chainBlockFirst'];
const baseRow = {
    date: '2026-01-02',
    strategies: {
        chainSmallFirst: Array.from({ length: 30 }, (_, index) => index),
        chainBlockFirst: Array.from({ length: 30 }, (_, index) => index + 20)
    }
};
const options = {
    learningRate: 0.002,
    l2: 0.0005,
    decay: 0.999,
    positiveWeight: 1,
    interactions: false,
    numberBias: false
};

const first = createState(methods, options);
const second = createState(methods, options);
const firstRank = rankRow({ ...baseRow, actual: 0 }, methods, first, options)
    .map(item => item.number);
const secondRank = rankRow({ ...baseRow, actual: 99 }, methods, second, options)
    .map(item => item.number);
assert.deepStrictEqual(
    firstRank,
    secondRank,
    'Dàn ngày D không được phụ thuộc vào actual(D).'
);

updateState(first, rankRow(baseRow, methods, first, options), 0, options);
const afterSettlement = rankRow(baseRow, methods, first, options).map(item => item.score);
const beforeSettlement = rankRow(baseRow, methods, second, options).map(item => item.score);
assert.notDeepStrictEqual(
    afterSettlement,
    beforeSettlement,
    'Kết quả D phải chỉ ảnh hưởng tới dự đoán sau khi D đã được settle.'
);
console.log('PASS online exclusion trainer is strict point-in-time.');
