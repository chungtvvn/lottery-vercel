const assert = require('assert');
const {
    rankFusion,
    countActual,
    settle
} = require('./research-loto-block-rank-fusion');

assert.deepStrictEqual(rankFusion([1, 2], [2, 3], 0.5, 0), [2, 1, 3]);
const actual = countActual({ special: 2, prize1: 2, prize2_1: 3 });
assert.strictEqual(actual.get(2), 2);
assert.strictEqual(actual.get(3), 1);
assert.deepStrictEqual(
    settle('2026-01-01', [2, 4], actual, 2200, 8000),
    {
        date: '2026-01-01',
        numbers: [2, 4],
        hits: 2,
        stakeK: 4400,
        payoutK: 16000,
        profitK: 11600
    }
);

console.log('research-loto-block-rank-fusion tests passed');
