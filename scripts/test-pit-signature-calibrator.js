#!/usr/bin/env node
const assert = require('assert');
const {
    createState,
    describeNumber,
    rankNumbers,
    runRows
} = require('./research-pit-signature-calibrator');

const ids = ['a', 'b'];
const row = {
    date: '2025-01-01',
    actual: 3,
    strategies: {
        a: [1, 3],
        b: [2, 3]
    }
};
const description = describeNumber(row, ids, 3);
assert.strictEqual(description.mask, 3);
assert.strictEqual(description.membershipCount, 2);
assert.deepStrictEqual(description.selected, [true, true]);

const config = {
    maskPrior: 100,
    countPrior: 100,
    expertPrior: 100,
    maskWeight: 1,
    countWeight: 1,
    expertWeight: 1,
    betCount: 30
};
const state = createState(ids);
assert.strictEqual(rankNumbers(row, ids, state, config).length, 100);

const result = runRows([row], config, ids);
assert.strictEqual(result.summary.days, 1);
assert.strictEqual(result.summary.rows.length, 1);
assert.strictEqual(result.state.masks.get(3).hits, 1);
assert.strictEqual(result.state.masks.get(3).exposures, 1);
console.log('test-pit-signature-calibrator: ok');
