#!/usr/bin/env node
const assert = require('assert');
const annualMilestoneService = require('../lib/services/annualMilestoneService');

function createStatsEntry(streaks) {
    return {
        streaks: streaks.map(([endDate, length]) => ({ endDate, length }))
    };
}

assert.throws(
    () => annualMilestoneService.buildAnnualBaseline(new Map(), 2026, {
        historyYears: 20,
        writeBaseline: false
    }),
    /thống kê đầu vào rỗng/
);

const entries = new Map([
    ['test:pattern', createStatsEntry([
        ['30/12/2024', 2],
        ['31/12/2024', 4],
        ['01/01/2025', 9],
        ['31/12/2025', 6],
        ['01/01/2026', 10]
    ])]
]);

const baseline2025 = annualMilestoneService.buildAnnualBaseline(entries, 2025, {
    historyYears: 20,
    writeBaseline: false
});
const row2025 = baseline2025.get('test:pattern');
assert.strictEqual(row2025.cutoffIso, '2024-12-31');
assert.strictEqual(row2025.recordLen, 4);
assert.strictEqual(row2025.sample, 2);
assert.strictEqual(row2025.cumulative.get(2), 2);
assert.strictEqual(row2025.cumulative.get(4), 1);

const baseline2026 = annualMilestoneService.buildAnnualBaseline(entries, 2026, {
    historyYears: 20,
    writeBaseline: false
});
const row2026 = baseline2026.get('test:pattern');
assert.strictEqual(row2026.cutoffIso, '2025-12-31');
assert.strictEqual(row2026.recordLen, 9);
assert.strictEqual(row2026.sample, 4);
assert.strictEqual(row2026.cumulative.get(4), 3);
assert.strictEqual(row2026.cumulative.get(6), 2);
assert.strictEqual(row2026.cumulative.get(9), 1);

console.log('Milestone baseline guard tests passed.');
