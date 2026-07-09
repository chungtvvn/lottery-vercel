const assert = require('assert');
const {
    rankFusionMany,
    createSummary,
    updateSummary,
    finalizeSummary,
    periodForDate
} = require('./research-loto-top-spectrum');

assert.deepStrictEqual(rankFusionMany([
    { numbers: [1, 2], weight: 0.5 },
    { numbers: [2, 3], weight: 0.5 }
], 0, 0), [2, 1, 3]);
assert.deepStrictEqual(rankFusionMany([
    { numbers: [1, 2], weight: 0.5 },
    { numbers: [2, 3], weight: 0.5 }
], 1, 0), [2, 1, 3]);

const summary = createSummary();
const actual = new Map([[2, 2], [3, 1]]);
updateSummary(summary, [2, 4], actual, 2200, 8000);
updateSummary(summary, [5, 6], actual, 2200, 8000);
const result = finalizeSummary(summary);
assert.strictEqual(result.days, 2);
assert.strictEqual(result.totalHits, 2);
assert.strictEqual(result.atLeast2Days, 1);
assert.strictEqual(result.profitK, 7200);
assert.strictEqual(result.longestUnder2, 1);
assert.strictEqual(periodForDate('2026-03-31', '2026-03-31', '2026-04-30'), 'training');
assert.strictEqual(periodForDate('2026-04-01', '2026-03-31', '2026-04-30'), 'validation');
assert.strictEqual(periodForDate('2026-05-01', '2026-03-31', '2026-04-30'), 'test');

console.log('research-loto-top-spectrum tests passed');
