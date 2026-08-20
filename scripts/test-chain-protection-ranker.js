#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { fitModel } = require('../lib/research/chainProtectionCalibrator');
const { applyProtectionGuard } = require('../lib/research/chainProtectionRanker');

const rows = [];
for (let day = 1; day <= 100; day++) {
    rows.push({
        date: `2020-02-${String(day).padStart(2, '0')}`,
        eventType: 'record-break',
        family: 'number',
        pattern: 'up',
        targetLen: 4,
        setSize: 1,
        numbers: [7],
        eventOccurred: day <= 55
    });
}
const model = fitModel(rows, { minEffectiveTrials: 10, minAbsoluteLift: 0.01 });
const result = applyProtectionGuard([0, 1, 2], rows, model, { maxProtected: 2 });
assert(result.protectedNumbers.length <= 2);
assert(result.betNumbers.includes(7));
assert(result.ranked.some(row => row.number === 7));
console.log('✅ chainProtectionRanker tests passed');
