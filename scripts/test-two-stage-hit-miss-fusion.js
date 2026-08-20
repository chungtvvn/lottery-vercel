#!/usr/bin/env node
const assert = require('assert');
const {
    collectMethodStats,
    rankNumbers
} = require('../lib/research/twoStageHitMissFusion');

const rows = [];
for (let index = 0; index < 20; index++) {
    rows.push({
        date: `${2020 + Math.floor(index / 10)}-01-${String(index % 10 + 1).padStart(2, '0')}`,
        actual: index % 2 === 0 ? 1 : 2,
        strategies: {
            good: [1, 2, 3],
            bad: [8, 9, 10]
        }
    });
}

const methods = collectMethodStats(rows, ['good', 'bad'], {
    baseRate: 0.3,
    priorStrength: 1
});
assert(methods.find(item => item.id === 'good').direction > 0);
assert(methods.find(item => item.id === 'bad').direction < 0);

const prediction = rankNumbers({
    strategies: {
        good: [1, 2, 3],
        bad: [8, 9, 10]
    }
}, methods, { missListSize: 2, betCount: 3 });
assert.deepStrictEqual(prediction.betNumbers, [1, 2, 3]);
assert.deepStrictEqual(prediction.missNumbers, [8, 9]);
console.log('✓ two-stage hit/miss fusion tests passed');
