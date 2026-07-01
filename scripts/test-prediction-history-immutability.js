const assert = require('assert');
const {
    mergeImmutablePredictionHistory
} = require('../lib/services/predictionHistoryService');

function method(numbersToBet, excludedNumbers, resolved = false, actualSpecial = null) {
    return {
        numbersToBet,
        excludedNumbers,
        explanations: [{ title: 'snapshot-original' }],
        betCount: numbersToBet.length,
        excludedCount: excludedNumbers.length,
        resolved,
        actualSpecial,
        betWin: null,
        holdWin: null,
        betProfit: null,
        holdProfit: null,
        profit: null,
        betWinMultiplier: 84,
        betWinFactor: 1,
        holdWinMultiplier: 0.705
    };
}

const original = {
    id: 'local-2026-06-30',
    predictionDate: '2026-06-30',
    sourceDrawDate: '2026-06-29',
    generatedAt: '2026-06-29T12:00:00.000Z',
    summary: {
        ...method([3, 6, 7], [0, 1, 2]),
        methods: {
            avgEdge50Hold70: method([3, 6, 7], [0, 1, 2])
        }
    }
};

const regeneratedAfterResult = {
    id: 'local-2026-06-30',
    predictionDate: '2026-06-30',
    sourceDrawDate: '2026-06-29',
    generatedAt: '2026-06-30T12:00:00.000Z',
    summary: {
        ...method([8, 9, 15], [3, 6, 7], true, 68),
        methods: {
            avgEdge50Hold70: method([8, 9, 15], [3, 6, 7], true, 68)
        },
        resolved: true,
        actualSpecial: 68
    }
};

const [settled] = mergeImmutablePredictionHistory(
    [original],
    [regeneratedAfterResult],
    90
);

assert.deepStrictEqual(
    settled.summary.methods.avgEdge50Hold70.numbersToBet,
    [3, 6, 7],
    'Dàn đánh đã phát hành không được thay đổi'
);
assert.deepStrictEqual(
    settled.summary.methods.avgEdge50Hold70.excludedNumbers,
    [0, 1, 2],
    'Dàn loại đã phát hành không được thay đổi'
);
assert.strictEqual(settled.generatedAt, original.generatedAt);
assert.strictEqual(settled.summary.resolved, true);
assert.strictEqual(settled.summary.actualSpecial, 68);
assert.strictEqual(settled.summary.methods.avgEdge50Hold70.betWin, false);
assert.strictEqual(settled.summary.methods.avgEdge50Hold70.holdWin, true);

const [stillPending] = mergeImmutablePredictionHistory(
    [original],
    [{
        ...regeneratedAfterResult,
        summary: {
            ...regeneratedAfterResult.summary,
            methods: {
                avgEdge50Hold70: method([8, 9, 15], [3, 6, 7])
            },
            resolved: false,
            actualSpecial: null
        }
    }],
    90
);
assert.deepStrictEqual(
    stillPending.summary.methods.avgEdge50Hold70.numbersToBet,
    [3, 6, 7]
);
assert.strictEqual(stillPending.summary.resolved, false);

console.log('✅ Prediction history snapshots remain immutable after settlement.');
