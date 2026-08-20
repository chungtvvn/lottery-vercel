#!/usr/bin/env node

const assert = require('assert');
const {
    MEMBERSHIP_METHODS,
    refineBaseline,
    trainMembershipModel
} = require('../lib/research/walkForwardMembershipModel');

function makeRow(index, actual = 42) {
    const strategies = {};
    for (const method of MEMBERSHIP_METHODS) {
        const values = Array.from({ length: 30 }, (_, offset) => offset);
        if (method !== 'chainSmallFirst') values[0] = actual;
        strategies[method] = values;
    }
    return {
        date: `2020-01-${String(index + 1).padStart(2, '0')}`,
        actual,
        strategies
    };
}

const rows = Array.from({ length: 20 }, (_, index) => makeRow(index));
const model = trainMembershipModel(rows, { epochs: 20, learningRate: 0.03, l2: 0.1 });
const refined = refineBaseline(rows[0], model, { swapLimit: 1 });

assert.strictEqual(model.trainingDays, 20);
assert.strictEqual(refined.betNumbers.length, 30);
assert.strictEqual(new Set(refined.betNumbers).size, 30);
assert(refined.betNumbers.includes(42), 'Mô hình phải bảo vệ tín hiệu đồng thuận ổn định ngoài baseline.');
assert.strictEqual(refined.swaps.length, 1);
console.log('walkForwardMembershipModel tests passed');
