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

const parallelPending = {
    id: 'local-2026-07-10',
    predictionDate: '2026-07-10',
    sourceDrawDate: '2026-07-09',
    generatedAt: '2026-07-09T12:00:00.000Z',
    summary: {
        ...method([7, 67], Array.from({ length: 98 }, (_, number) => number)),
        methods: {
            deParallelBlock85Small65Hold70: {
                ...method([7, 67], Array.from({ length: 100 }, (_, number) => number)
                    .filter(number => number !== 7 && number !== 67)),
                intersectionNumbers: [67],
                unitCount: 3
            }
        }
    }
};
const parallelResolved = {
    ...parallelPending,
    generatedAt: '2026-07-10T12:00:00.000Z',
    summary: {
        ...parallelPending.summary,
        resolved: true,
        actualSpecial: 67,
        methods: {
            deParallelBlock85Small65Hold70: {
                ...parallelPending.summary.methods.deParallelBlock85Small65Hold70,
                resolved: true,
                actualSpecial: 67
            }
        }
    }
};
const [parallelSettled] = mergeImmutablePredictionHistory(
    [parallelPending],
    [parallelResolved],
    90
);
const parallelMethod = parallelSettled.summary.methods.deParallelBlock85Small65Hold70;
assert.deepStrictEqual(parallelMethod.numbersToBet, [7, 67]);
assert.deepStrictEqual(parallelMethod.intersectionNumbers, [67]);
assert.strictEqual(parallelMethod.unitCount, 3);
assert.strictEqual(parallelMethod.betWin, true);
assert.strictEqual(parallelMethod.betProfit, 165000);

console.log('✅ Parallel history keeps its own immutable daily snapshot and x2 accounting.');

const legacyFallbackBets = Array.from({ length: 35 }, (_, index) => index + 65);
const legacyFallbackExcluded = Array.from({ length: 65 }, (_, index) => index);
const legacyMalformedParallel = {
    id: 'local-2026-07-11',
    predictionDate: '2026-07-11',
    sourceDrawDate: '2026-07-10',
    generatedAt: '2026-07-10T12:00:00.000Z',
    summary: {
        ...method([1, 2], [3, 4]),
        resolved: true,
        actualSpecial: 67,
        methods: {
            avgEdge50Hold70: method([1, 2], [3, 4], true, 67),
            deParallelBlock85Small65Hold70: {
                ...method(legacyFallbackBets, legacyFallbackExcluded, true, 67),
                unitCount: 35
            }
        }
    }
};
const regeneratedStrictParallel = {
    ...legacyMalformedParallel,
    generatedAt: '2026-07-11T12:00:00.000Z',
    summary: {
        ...legacyMalformedParallel.summary,
        methods: {
            ...legacyMalformedParallel.summary.methods,
            deParallelBlock85Small65Hold70: {
                ...method([7, 17, 67], Array.from({ length: 100 }, (_, number) => number)
                    .filter(number => number !== 7 && number !== 17 && number !== 67)),
                intersectionNumbers: [67],
                unitCount: 4
            }
        }
    }
};
const [repairedLegacy] = mergeImmutablePredictionHistory(
    [legacyMalformedParallel],
    [regeneratedStrictParallel],
    90
);
const repairedParallel = repairedLegacy.summary.methods.deParallelBlock85Small65Hold70;
assert.deepStrictEqual(repairedParallel.numbersToBet, [7, 17, 67]);
assert.deepStrictEqual(repairedParallel.intersectionNumbers, [67]);
assert.strictEqual(repairedParallel.betWin, true);
assert.strictEqual(repairedParallel.betProfit, 164000);
assert.strictEqual(
    repairedLegacy.parallelSnapshotRepairReason,
    'legacy-date-less-parallel-fallback'
);
assert.deepStrictEqual(
    repairedLegacy.summary.methods.avgEdge50Hold70.numbersToBet,
    [1, 2],
    'Migration must not rewrite valid immutable methods'
);

console.log('✅ Legacy 65-99 parallel fallback is repaired without touching valid snapshots.');

const pendingOldLogic = {
    id: 'local-2026-07-13',
    predictionDate: '2026-07-13',
    sourceDrawDate: '2026-07-12',
    generatedAt: '2026-07-12T12:00:00.000Z',
    summary: {
        ...method([1, 2, 3], [4, 5, 6]),
        resolved: false,
        actualSpecial: null,
        methods: {
            deParallelBlock85Small65Hold70: method([1, 2, 3], [4, 5, 6])
        }
    }
};
const pendingStrictUpgrade = {
    ...pendingOldLogic,
    generatedAt: '2026-07-13T01:00:00.000Z',
    summary: {
        ...pendingOldLogic.summary,
        methods: {
            deParallelBlock85Small65Hold70: {
                ...method([7, 17, 27], [8, 18, 28]),
                intersectionNumbers: [17],
                unitCount: 4,
                methodVersion: '2026-07-15-parallel-shared-ranking-v3'
            }
        }
    }
};
const [pendingUpgraded] = mergeImmutablePredictionHistory(
    [pendingOldLogic],
    [pendingStrictUpgrade],
    90
);
assert.deepStrictEqual(
    pendingUpgraded.summary.methods.deParallelBlock85Small65Hold70.numbersToBet,
    [7, 17, 27]
);
assert.deepStrictEqual(
    pendingUpgraded.summary.methods.deParallelBlock85Small65Hold70.intersectionNumbers,
    [17]
);
assert.strictEqual(pendingUpgraded.summary.resolved, false);
assert.strictEqual(
    pendingUpgraded.parallelSnapshotRepairReason,
    'pending-parallel-logic-upgrade'
);

console.log('✅ Latest pending parallel snapshot follows the corrected daily PIT logic.');

const simulationService = require('../lib/services/simulationService');
const blockNumbers = Array.from({ length: 85 }, (_, number) => number);
const smallNumbers = Array.from({ length: 65 }, (_, index) => index + 35);
const variableParallel = simulationService.buildDeParallelBlock85Small65Method([
    {
        key: 'test_block:block2x1SoLe',
        title: 'Test block',
        numbers: blockNumbers,
        tier: 'critical',
        exclusionTierRank: 1,
        exclusionPriority: 100,
        dropOffRate: 1,
        targetFrequencyPerYear: 0.1
    },
    {
        key: 'test_small:lienTiep',
        title: 'Test small',
        numbers: smallNumbers,
        tier: 'critical',
        exclusionTierRank: 1,
        exclusionPriority: 100,
        dropOffRate: 1,
        targetFrequencyPerYear: 0.1
    }
], 70);
assert.strictEqual(variableParallel.betNumbers.length, 50);
assert.strictEqual(variableParallel.intersectionNumbers.length, 0);
assert.strictEqual(
    variableParallel.betNumbers.length + variableParallel.intersectionNumbers.length,
    50
);
assert.strictEqual(variableParallel.methodVersion, '2026-07-15-parallel-shared-ranking-v3');

console.log('✅ Parallel history shares the annual ranker and is not fixed to 35 unique numbers.');
