#!/usr/bin/env node
'use strict';

const assert = require('assert/strict');
const {
    buildVariants,
    settleFlatStake,
    summarize
} = require('../lib/research/milestoneParallelDedup');

const variants = buildVariants([1, 2, 3], [3, 4]);
assert.deepEqual(variants.unionDedup, [1, 2, 3, 4]);
assert.deepEqual(variants.intersection, [3]);
assert.deepEqual(variants.exclusiveOnly, [1, 2, 4]);

const unionHit = settleFlatStake(variants.unionDedup, 3);
assert.equal(unionHit.hit, true);
assert.equal(unionHit.stakeK, 4000);
assert.equal(unionHit.payoutK, 84000);
assert.equal(unionHit.profitK, 80000);

const exclusiveMiss = settleFlatStake(variants.exclusiveOnly, 3);
assert.equal(exclusiveMiss.hit, false);
assert.equal(exclusiveMiss.profitK, -3000);

const summary = summarize([unionHit, exclusiveMiss]);
assert.equal(summary.days, 2);
assert.equal(summary.wins, 1);
assert.equal(summary.longestLoss, 1);

console.log('milestone parallel dedup tests passed');
