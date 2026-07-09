const assert = require('assert');
const {
    longestRun,
    summarize,
    groupByMethod
} = require('./analyze-loto-milestone20y-walk-forward');

const rows = [
    { methodId: 'a', hits: 0, stakeK: 2200, payoutK: 0, profitK: -2200 },
    { methodId: 'a', hits: 1, stakeK: 2200, payoutK: 8000, profitK: 5800 },
    { methodId: 'a', hits: 2, stakeK: 2200, payoutK: 16000, profitK: 13800 }
];
const summary = summarize(rows);

assert.strictEqual(summary.days, 3);
assert.strictEqual(summary.hitDays, 2);
assert.strictEqual(summary.atLeast2Days, 1);
assert.strictEqual(summary.totalHits, 3);
assert.strictEqual(summary.profitK, 17400);
assert.strictEqual(summary.longestUnder2, 2);
assert.strictEqual(longestRun(rows, row => row.hits < 2), 2);
assert.strictEqual(groupByMethod(rows).get('a').length, 3);

console.log('analyze-loto-milestone20y-walk-forward tests passed');
