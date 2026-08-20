#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    buildVariants,
    settleVariant
} = require('../lib/research/crossBaselineParallel');

const variants = buildVariants({
    annualBlock: [1, 2],
    annualSmall: [2, 3],
    rollingBet: [2, 4],
    rollingIntersection: [2]
});

assert.deepStrictEqual(Object.fromEntries(variants.annualNative), { 1: 1, 2: 2, 3: 1 });
assert.deepStrictEqual(Object.fromEntries(variants.rollingNative), { 2: 2, 4: 1 });
assert.deepStrictEqual(Object.fromEntries(variants.crossUnionFlat), { 1: 1, 2: 1, 3: 1, 4: 1 });
assert.deepStrictEqual(Object.fromEntries(variants.crossUnionX2), { 1: 1, 2: 2, 3: 1, 4: 1 });
assert.deepStrictEqual(Object.fromEntries(variants.crossIntersectionFlat), { 2: 1 });
assert.deepStrictEqual(Object.fromEntries(variants.crossExclusiveFlat), { 1: 1, 3: 1, 4: 1 });
assert.deepStrictEqual(Object.fromEntries(variants.crossFourBranchAdditive), { 1: 1, 2: 4, 3: 1, 4: 1 });

const win = settleVariant(variants.crossUnionX2, 2, { stakePerUnitK: 1000, payoutMultiplier: 84 });
assert.strictEqual(win.unitCount, 5);
assert.strictEqual(win.payoutK, 168000);
assert.strictEqual(win.profitK, 163000);

const loss = settleVariant(variants.crossExclusiveFlat, 2, { stakePerUnitK: 1000, payoutMultiplier: 84 });
assert.strictEqual(loss.hit, false);
assert.strictEqual(loss.profitK, -3000);

console.log('crossBaselineParallel: OK');
