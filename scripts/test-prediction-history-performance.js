const assert = require('assert');
const {
    buildPerformanceCache
} = require('../lib/services/predictionHistoryPerformanceService');

const methodIds = [
    'avgEdge50Hold70',
    'dedupEdge75Hold70',
    'dedupDropoffHold70'
];

function methodResult(actualSpecial, betNumbers, profit = 100) {
    const excluded = Array.from({ length: 100 }, (_, value) => value)
        .filter(value => !betNumbers.includes(value));
    return {
        actualSpecial,
        betNumbers,
        excluded,
        betWin: betNumbers.includes(actualSpecial),
        holdWin: !excluded.includes(actualSpecial),
        betProfit: profit,
        holdProfit: 0,
        profit
    };
}

const backtestDetails = [
    {
        predictionIsoDate: '2026-01-01',
        methods: Object.fromEntries(methodIds.map(methodId => [
            methodId,
            methodResult(1, [1, 2, 3], 100)
        ]))
    },
    {
        predictionIsoDate: '2026-01-02',
        methods: Object.fromEntries(methodIds.map(methodId => [
            methodId,
            methodResult(9, [1, 2, 3], -100)
        ]))
    }
];

const predictionHistory = [
    {
        predictionDate: '2026-01-02',
        summary: {
            resolved: true,
            actualSpecial: 9,
            methods: Object.fromEntries(methodIds.map(methodId => [
                methodId,
                {
                    resolved: true,
                    actualSpecial: 9,
                    numbersToBet: [7, 8, 9],
                    excludedNumbers: Array.from({ length: 100 }, (_, value) => value)
                        .filter(value => ![7, 8, 9].includes(value)),
                    betWin: true,
                    holdWin: true,
                    betProfit: 500,
                    holdProfit: 0,
                    profit: 500
                }
            ]))
        }
    }
];

const cache = buildPerformanceCache({
    backtestDetails,
    predictionHistory,
    startDate: '2026-01-01',
    endDate: '2026-01-02',
    generatedAt: '2026-01-03T00:00:00.000Z'
});

for (const methodId of methodIds) {
    const method = cache.methods[methodId];
    assert.equal(method.daily.length, 2, `${methodId} phải có đủ hai ngày`);
    assert.equal(method.daily[1].source, undefined, 'Dòng tổng hợp không phát tán metadata nội bộ');
    assert.equal(method.daily[1].profitK, 500, 'Snapshot thực tế phải ghi đè backtest cùng ngày');
    assert.equal(method.summary.days, 2);
    assert.equal(method.summary.hitDays, 2);
    assert.equal(method.summary.profitK, 600);
    assert.equal(method.weekly.length, 1);
    assert.equal(method.monthly.length, 1);
}

assert.equal(cache.period.startDate, '2026-01-01');
assert.equal(cache.period.endDate, '2026-01-02');
assert.ok(methodIds.includes(cache.selectedMethodId));

console.log('Prediction history performance tests passed.');
