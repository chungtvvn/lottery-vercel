#!/usr/bin/env node

const assert = require('assert');
const {
    buildPointInTimeCoverageRows,
    summarizeCoverage
} = require('../lib/research/numberCoverageHazard');

const rows = [
    { date: '2020-01-01', special: 0, a: 0, b: 1 },
    { date: '2020-01-02', special: 1, a: 2, b: 2 },
    { date: '2020-01-03', special: 2, a: 0, b: 1 },
    { date: '2020-01-04', special: 0, a: 2, b: 2 }
];

const coverage = summarizeCoverage(rows, 'loto', {
    universeSize: 3,
    prizeKeys: ['a', 'b']
});
assert.strictEqual(coverage.completedCycleCount, 2);
assert.deepStrictEqual(coverage.completedCycles.map(cycle => cycle.drawDays), [2, 2]);

const pit = buildPointInTimeCoverageRows(rows, 'de', {
    universeSize: 3,
    bins: [1, 2, Infinity]
});
assert.strictEqual(pit[0].samples[0].appearanceCount, 0);
assert.strictEqual(pit[1].samples[0].appearanceCount, 1);
assert.strictEqual(pit[1].samples[0].currentGap, 1);
assert.strictEqual(pit[3].samples[0].gapSample, 0, 'Khoảng chờ 0→3 chưa được dùng trước khi ngày 3 kết toán.');
assert.strictEqual(pit[3].samples[2].appearanceCount, 1);
console.log('numberCoverageHazard tests passed');
