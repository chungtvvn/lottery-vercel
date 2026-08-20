#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    refinePrediction,
    trainFailureCalibrator
} = require('../lib/research/exclusionFailureCalibrator');

function row(day, actual) {
    return {
        date: `2020-01-${String(day).padStart(2, '0')}`,
        actual,
        strategies: { chainSmallFirst: Array.from({ length: 30 }, (_, index) => index) },
        candidateDiagnostics: [{
            key: 'record-42', family: 'number', pattern: 'consecutive', state: 'active',
            recordState: 'at-record', tier: 1, currentLen: 4, baseLen: 4,
            targetLen: 5, recordLen: 4, numbers: [42]
        }]
    };
}

const training = Array.from({ length: 60 }, (_, index) => row(index + 1, 42));
const model = trainFailureCalibrator(training, { priorStrength: 20 });
const prediction = refinePrediction(row(61, 42), model, { swapLimit: 1 });
assert.strictEqual(prediction.betNumbers.length, 30);
assert(prediction.betNumbers.includes(42), 'Số có lịch sử failure cao phải được bảo vệ');
assert.strictEqual(prediction.swaps.length, 1);
console.log('✅ exclusionFailureCalibrator tests passed');
