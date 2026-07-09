const assert = require('assert');
const {
    intersection,
    union,
    complement,
    summarize,
    splitSummary
} = require('./research-de-milestone-history-blend');

assert.deepStrictEqual(intersection([1, 2, 3], [2, 3, 4]), [2, 3]);
assert.deepStrictEqual(union([3, 1], [2, 3]), [1, 2, 3]);
assert.deepStrictEqual(complement([0, 2]).slice(0, 3), [1, 3, 4]);

const result = summarize([
    { date: '2026-01-01', actual: 2, betNumbers: [1, 2] },
    { date: '2026-01-02', actual: 9, betNumbers: [1, 2, 3] }
], 1000, 84000);

assert.strictEqual(result.days, 2);
assert.strictEqual(result.wins, 1);
assert.strictEqual(result.avgBetCount, 2.5);
assert.strictEqual(result.stakeK, 5000);
assert.strictEqual(result.payoutK, 84000);
assert.strictEqual(result.profitK, 79000);
assert.strictEqual(result.longestWin, 1);
assert.strictEqual(result.longestLoss, 1);

const split = splitSummary(result.rows, '2026-01-02', 1000, 84000);
assert.strictEqual(split.training.days, 1);
assert.strictEqual(split.training.wins, 1);
assert.strictEqual(split.holdout.days, 1);
assert.strictEqual(split.holdout.wins, 0);

console.log('research-de-milestone-history-blend tests passed');
