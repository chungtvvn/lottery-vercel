#!/usr/bin/env node
const assert = require('assert');
const {
    buildMembership,
    posterior,
    trainModel
} = require('./research-pit-membership-calibration');

const row = {
    actual: 1,
    strategies: {
        a: [1, 2],
        b: [2, 3]
    }
};
assert.deepStrictEqual(buildMembership(row, ['a', 'b'], 1), { mask: 1, votes: 1 });
assert.deepStrictEqual(buildMembership(row, ['a', 'b'], 2), { mask: 3, votes: 2 });
assert.deepStrictEqual(buildMembership(row, ['a', 'b'], 4), { mask: 0, votes: 0 });
assert.strictEqual(posterior({ exposures: 100, hits: 2 }, 0.01, 100), 0.015);

const model = trainModel([row], ['a', 'b']);
assert.strictEqual(model.observations, 100);
assert.strictEqual(model.hits, 1);
assert.strictEqual(model.byVote.get(1).hits, 1);

console.log('PIT membership calibration tests passed.');
