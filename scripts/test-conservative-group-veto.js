#!/usr/bin/env node

const assert = require('assert');
const {
    oneSidedWilsonUpper,
    rankMethodConsensusSnapshot,
    calibrateGroupVeto,
    selectWithConservativeGroupVeto
} = require('../lib/research/conservativeGroupVeto');

function featureRow(date, actual, scores) {
    return {
        date,
        actual,
        featuresByNumber: Array.from(
            { length: 100 },
            (_, number) => Float64Array.from([scores?.[number] ?? -number])
        )
    };
}

function strictRow(date) {
    return {
        date,
        strategies: {
            chainBlockFirst: Array.from({ length: 30 }, (_, number) => number),
            chainSmallFirst: Array.from({ length: 30 }, (_, index) => index + 10)
        }
    };
}

assert(oneSidedWilsonUpper(0, 100, 1.645) > 0);
assert(oneSidedWilsonUpper(0, 100, 1.645) < 0.1);

const consensusRanking = rankMethodConsensusSnapshot(
    {
        date: '2020-01-01',
        strategies: {
            chainBlockFirst: [1, 2, 3],
            chainSmallFirst: [2, 3, 4],
            dedupEdge50Hold: [3, 4, 5]
        }
    },
    ['chainBlockFirst', 'chainSmallFirst', 'dedupEdge50Hold'],
    'test-consensus'
);
assert.strictEqual(consensusRanking[0].number, 3);
assert.strictEqual(consensusRanking[0].support, 3);

const calibrationRows = Array.from({ length: 200 }, (_, index) =>
    featureRow(`2020-01-${String((index % 28) + 1).padStart(2, '0')}`, index % 80)
);
const calibration = calibrateGroupVeto(
    calibrationRows,
    [1],
    { binCount: 5, z: 0.674, minimumLift: 0 }
);
assert(calibration.vetoBins.includes(4), 'Bin cuối phải đủ điều kiện phủ quyết.');

const selected = selectWithConservativeGroupVeto(
    featureRow('2021-01-01', 5),
    strictRow('2021-01-01'),
    [1],
    calibration,
    {
        baseId: 'consensus',
        betCount: 30,
        maxSwaps: 5,
        protectShared: true,
        replacementMinSupport: 1
    }
);
assert.strictEqual(selected.numbers.length, 30);
assert.strictEqual(new Set(selected.numbers).size, 30);
assert.strictEqual(selected.rejected.length, selected.replacements.length);

const mutated = selectWithConservativeGroupVeto(
    featureRow('2021-01-01', 99),
    strictRow('2021-01-01'),
    [1],
    calibration,
    {
        baseId: 'consensus',
        betCount: 30,
        maxSwaps: 5,
        protectShared: true,
        replacementMinSupport: 1
    }
);
assert.deepStrictEqual(
    mutated.numbers,
    selected.numbers,
    'Kết quả ngày D không được phụ thuộc actual ngày D.'
);

console.log('✓ conservative group veto tests passed');
