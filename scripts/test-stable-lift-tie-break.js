'use strict';

const assert = require('assert');
const { rankRow } = require('./research-cross-year-stable-lift-ranker');

const row = {
    strategies: {
        chainSmallFirst: [70, 71, 72]
    },
    numberEvidence: [0, 1, 2, 70, 71, 72].map(number => ({
        number,
        groupDetails: {}
    }))
};
const ranked = rankRow(row, new Map(), {
    baseStrategyId: 'chainSmallFirst',
    baseBonus: 0,
    topFamilies: 1
});
assert.deepStrictEqual(
    ranked.slice(0, 3).map(item => item.number),
    [70, 71, 72],
    'Dàn nền phải thắng tie-break khi điểm chuỗi bằng nhau.'
);
console.log('PASS Stable Lift uses the PIT baseline rather than numeric order for ties.');
