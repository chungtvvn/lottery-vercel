#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    evaluate,
    fitModel,
    scoreOpportunity,
    widthBucket
} = require('../lib/research/chainProtectionCalibrator');

assert.strictEqual(widthBucket(1), '01');
assert.strictEqual(widthBucket(8), '06-10');
assert.strictEqual(widthBucket(55), '41-99');

const rows = [];
for (let day = 1; day <= 80; day++) {
    rows.push({
        date: `2020-01-${String(day).padStart(2, '0')}`,
        eventType: 'record-break',
        family: 'number',
        pattern: 'up',
        targetLen: 4,
        setSize: 10,
        eventOccurred: day <= 24
    });
}
const model = fitModel(rows, { minEffectiveTrials: 10, minAbsoluteLift: 0.01 });
const score = scoreOpportunity(rows[0], model);
assert(score.predictedProbability > score.baseProbability);
assert.strictEqual(score.protect, true);
const evaluation = evaluate(rows, model);
assert(evaluation.protectedTrials > 0);
assert(evaluation.protectedEventRate > evaluation.protectedExpectedRate);

const unseen = scoreOpportunity({
    eventType: 'first-formation',
    family: 'unknown',
    pattern: 'unknown',
    targetLen: 9,
    setSize: 5
}, model);
assert.strictEqual(unseen.predictedProbability, unseen.baseProbability);
assert.strictEqual(unseen.protect, false);

console.log('✅ chainProtectionCalibrator tests passed');
