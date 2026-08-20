#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { refineSmallChain, trainSafetyModel } = require('../lib/research/diagnosticSafetyModel');

function row(day, actual) {
    return {
        date: `2021-01-${String(day).padStart(2, '0')}`,
        actual,
        strategies: { chainSmallFirst: Array.from({ length: 30 }, (_, index) => index) },
        candidateDiagnostics: [{
            key: 'number:forty-two', family: 'number', pattern: 'up', state: 'active',
            recordState: 'at-record', tier: 1, currentLen: 4, recordLen: 4,
            exposureFrequencyPerYear: 0.1, numbers: [42]
        }]
    };
}
const training = Array.from({ length: 80 }, (_, index) => row(index + 1, 42));
const model = trainSafetyModel(training, { epochs: 30, learningRate: 0.04, l2: 0.01 });
const prediction = refineSmallChain(row(81, 42), model, { swapLimit: 1 });
assert.strictEqual(prediction.betNumbers.length, 30);
assert(prediction.betNumbers.includes(42));
assert.strictEqual(prediction.swaps.length, 1);
console.log('✅ diagnosticSafetyModel tests passed');
