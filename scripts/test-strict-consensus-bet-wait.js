#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { selectTiers, wilsonLowerBound } = require('./research-strict-consensus-bet-wait');

const tiers = selectTiers({
    alpha: [1, 2, 3],
    beta: [2, 3, 4],
    gamma: [3, 4, 5]
}, ['alpha', 'beta', 'gamma']);
assert.deepEqual(tiers.betNumbers, [3]);
assert.deepEqual(tiers.waitNumbers, [2, 4]);
assert.equal(tiers.betVote, 3);
assert.equal(tiers.waitVote, 2);
assert.ok(wilsonLowerBound(30, 100) < 0.3);
assert.equal(wilsonLowerBound(0, 0), null);
console.log('PASS consensus tiers select highest and second-highest positive support only.');
