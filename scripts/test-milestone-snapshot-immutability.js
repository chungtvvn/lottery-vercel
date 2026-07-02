const assert = require('assert');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const { repairSnapshots } = require('./repair-milestone-live-snapshots');

const issuedStrategy = {
    chainBlockFirst: {
        id: 'chainBlockFirst',
        holds: {
            70: {
                strategy: 'chainBlockFirst',
                targetExcluded: 70,
                betNumbers: ['42', '52'],
                excludedNumbers: ['00']
            }
        }
    }
};
const settled = {
    status: 'settled',
    predictionIsoDate: '2026-06-29',
    actualSpecial: '42',
    strategies: issuedStrategy,
    results: {
        'chainBlockFirst:hold70': {
            resolved: true,
            actual: '42',
            hit: true,
            profitK: 54000
        }
    }
};
const settledBefore = JSON.parse(JSON.stringify(settled));

annualMilestoneService.settleLiveRowOnce(settled, 99, {
    betPerNumberK: 9999,
    winMultiplier: 1
});
assert.deepStrictEqual(
    settled,
    settledBefore,
    'Row đã kết toán không được tính lại khi dữ liệu hoặc công thức thay đổi'
);

const pending = {
    status: 'pending',
    predictionIsoDate: '2026-07-02',
    generatedAt: '2026-07-01T12:00:00.000Z',
    liveCacheVersion: 'issued-v1',
    strategies: issuedStrategy,
    results: {}
};
annualMilestoneService.settleLiveRowOnce(pending, 42, {
    betPerNumberK: 1000,
    winMultiplier: 84
});
assert.equal(pending.status, 'settled');
assert.equal(pending.results['chainBlockFirst:hold70'].hit, true);

const freshRecalculation = {
    predictionIsoDate: '2026-07-02',
    strategies: { chainBlockFirst: { holds: { 70: { betNumbers: ['99'] } } } },
    chainRows: [{ key: 'current-analysis' }]
};
const locked = annualMilestoneService.lockNextPredictionToPublished(
    freshRecalculation,
    {
        ...pending,
        status: 'pending',
        strategies: issuedStrategy
    }
);
assert.deepStrictEqual(
    locked.strategies.chainBlockFirst.holds['70'].betNumbers,
    issuedStrategy.chainBlockFirst.holds['70'].betNumbers
);
assert.deepStrictEqual(
    locked.strategies.chainBlockFirst.holds['70'].excludedNumbers,
    issuedStrategy.chainBlockFirst.holds['70'].excludedNumbers
);
assert.equal(
    locked.strategies.chainBlockFirst.holds['70'].explanationIntegrity,
    'unavailable-number-mismatch'
);
assert.deepStrictEqual(locked.chainRows, freshRecalculation.chainRows);
assert.equal(locked.pointInTimeLocked, true);
assert.equal(locked.publishedAt, pending.generatedAt);

const matchingFresh = {
    predictionIsoDate: '2026-07-02',
    strategies: {
        chainBlockFirst: {
            holds: {
                70: {
                    ...issuedStrategy.chainBlockFirst.holds['70'],
                    selectedChains: [{ key: 'block2x1SoLe', title: 'Nhịp 2-1' }]
                }
            }
        }
    }
};
const matchingLocked = annualMilestoneService.lockNextPredictionToPublished(
    matchingFresh,
    {
        ...pending,
        status: 'pending',
        strategies: issuedStrategy
    }
);
assert.deepStrictEqual(
    matchingLocked.strategies.chainBlockFirst.holds['70'].selectedChains,
    matchingFresh.strategies.chainBlockFirst.holds['70'].selectedChains
);
assert.equal(
    matchingLocked.strategies.chainBlockFirst.holds['70'].explanationIntegrity,
    'rehydrated-after-number-match'
);

const trustedWinningRow = {
    status: 'settled',
    predictionIsoDate: '2026-06-29',
    actualSpecial: '42',
    strategies: issuedStrategy,
    results: {
        'chainBlockFirst:hold70': {
            resolved: true,
            actual: '42',
            hit: true,
            profitK: 54000
        }
    }
};
const corruptedRemoteRow = {
    ...trustedWinningRow,
    strategies: {
        chainBlockFirst: {
            id: 'chainBlockFirst',
            holds: {
                70: {
                    strategy: 'chainBlockFirst',
                    targetExcluded: 70,
                    betNumbers: ['99'],
                    excludedNumbers: ['42']
                }
            }
        }
    },
    results: {
        'chainBlockFirst:hold70': {
            resolved: true,
            actual: '42',
            hit: false,
            profitK: -30000
        }
    },
    backfilledAt: '2026-07-02T01:00:00.000Z'
};
const unrelatedRow = {
    status: 'settled',
    predictionIsoDate: '2026-06-30',
    actualSpecial: '68',
    strategies: issuedStrategy,
    results: {}
};
const repaired = repairSnapshots(
    {
        config: { betPerNumberK: 1000, winMultiplier: 84 },
        predictions: [corruptedRemoteRow, unrelatedRow]
    },
    { predictions: [trustedWinningRow] },
    ['2026-06-29'],
    '2026-07-02T02:00:00.000Z'
);
const repairedRow = repaired.predictions[0];
assert.deepStrictEqual(repairedRow.strategies, issuedStrategy);
assert.equal(repairedRow.results['chainBlockFirst:hold70'].hit, true);
assert.equal(repairedRow.results['chainBlockFirst:hold70'].profitK, 82000);
assert.equal(repairedRow.backfilledAt, undefined);
assert.equal(repairedRow.snapshotIntegrity, 'original-restored');
assert.deepStrictEqual(repaired.predictions[1], unrelatedRow);

console.log('Milestone snapshot immutability tests passed.');
