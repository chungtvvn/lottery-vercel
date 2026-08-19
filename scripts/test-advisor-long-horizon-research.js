#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    buildMethodHedgeRows,
    buildLongHorizonResearch
} = require('../lib/services/advisorLongHorizonResearchService');

function dateAt(index) {
    return new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10);
}

const raw = Array.from({ length: 360 }, (_, index) => ({
    date: dateAt(index),
    special: (index * 17 + Math.floor(index / 9)) % 100
}));

const rowsA = raw.slice(40, 100).map((row, index) => ({
    date: row.date,
    actual: row.special,
    numbers: Array.from({ length: 30 }, (_, number) => (number + index) % 100)
}));
const rowsB = raw.slice(40, 100).map((row, index) => ({
    date: row.date,
    actual: row.special,
    numbers: Array.from({ length: 30 }, (_, number) => (number + index + 17) % 100)
}));
const original = buildMethodHedgeRows({ alpha: rowsA, beta: rowsB });
const mutatedFuture = buildMethodHedgeRows({
    alpha: rowsA.map((row, index) => index === rowsA.length - 1 ? { ...row, actual: 99 } : row),
    beta: rowsB.map((row, index) => index === rowsB.length - 1 ? { ...row, actual: 99 } : row)
});
assert.deepEqual(
    original.slice(0, -1).map(row => ({ date: row.date, selectedId: row.selectedId, numbers: row.numbers })),
    mutatedFuture.slice(0, -1).map(row => ({ date: row.date, selectedId: row.selectedId, numbers: row.numbers })),
    'a future settlement must not change an earlier Hedge selection'
);

const report = buildLongHorizonResearch(raw, {
    minWarmup: 30,
    groupWindow: 45,
    shortWindow: 15,
    calibrationWindow: 30,
    developmentEnd: '2020-07-31',
    validationStart: '2020-08-01',
    validationEnd: '2020-10-31',
    holdoutStart: '2020-11-01',
    recentDays: 20
});
assert.equal(report.strictPointInTime, true);
assert.equal(report.methods.length, 4);
assert.ok(report.methods.every(method => method.total.days > 0));
assert.ok(report.methods.every(method => method.recentRows.length <= 20));
assert.ok(report.methods.every(method => method.total.breakEvenHitRate > 0));

console.log('PASS long-horizon advisor research keeps Hedge selections point-in-time safe and produces compact multi-regime reports.');
