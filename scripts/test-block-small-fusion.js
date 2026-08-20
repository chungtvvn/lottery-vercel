#!/usr/bin/env node

const assert = require('assert');
const {
    rankBlockSmallFusion,
    selectBlockSmallFusion
} = require('../lib/research/blockSmallFusion');

function row() {
    return {
        date: '2026-01-02',
        strategiesByTarget: {
            65: {
                chainBlockFirst: [1, 2, 3, 4],
                chainSmallFirst: [1, 2, 5, 6]
            },
            70: {
                chainBlockFirst: [1, 2, 3],
                chainSmallFirst: [1, 2, 5]
            },
            85: {
                chainBlockFirst: [1, 3],
                chainSmallFirst: [1, 5]
            }
        }
    };
}

const ranked = rankBlockSmallFusion(row(), {
    targets: [65, 70, 85],
    blockWeight: 0.5,
    smallWeight: 0.5,
    agreementBonus: 1,
    disagreementPenalty: 0.25
});

assert.strictEqual(ranked[0].number, 1, 'Số được cả hai phương pháp giữ sâu phải đứng đầu.');
assert(ranked.findIndex(item => item.number === 2) < ranked.findIndex(item => item.number === 4));
assert(ranked.findIndex(item => item.number === 2) < ranked.findIndex(item => item.number === 6));

const first = selectBlockSmallFusion(row(), { betCount: 5 });
const second = selectBlockSmallFusion(row(), { betCount: 5 });
assert.deepStrictEqual(first, second, 'Xếp hạng phải xác định khi điểm bằng nhau.');
assert.strictEqual(first.length, 5, 'Phải giữ đúng số lượng số đánh.');

console.log('Block/Small fusion deterministic tests passed.');
