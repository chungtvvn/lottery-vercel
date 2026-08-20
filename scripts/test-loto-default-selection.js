#!/usr/bin/env node

const assert = require('assert');
const { selectBestLotoDefault } = require('../lib/utils/lotoDefaultSelection');

const options = {
    strategies: ['rrf', 'edge', 'fusion'],
    betCounts: [6, 7, 20, 25, 30],
    fallbackStrategy: 'edge',
    fallbackBetCount: 6
};

const selected = selectBestLotoDefault({
    rrf_top6: { days: 15, profitK: 18000, roi: 0.09 },
    rrf_top25: { days: 5, profitK: 53000, roi: 0.19 },
    edge_top30: { days: 5, profitK: 6000, roi: 0.01 },
    fusion_top30: { days: 4, profitK: 0, roi: 0 }
}, options);
assert.deepStrictEqual(
    { strategy: selected.strategy, betCount: selected.betCount, profitK: selected.profitK },
    { strategy: 'rrf', betCount: 25, profitK: 53000 }
);

const tie = selectBestLotoDefault({
    rrf_top6: { days: 10, profitK: 5000, roi: 0.05 },
    edge_top7: { days: 20, profitK: 5000, roi: 0.08 }
}, options);
assert.strictEqual(tie.strategy, 'edge');
assert.strictEqual(tie.betCount, 7);

const fallback = selectBestLotoDefault({}, options);
assert.strictEqual(fallback.strategy, 'edge');
assert.strictEqual(fallback.betCount, 6);
assert.strictEqual(fallback.fallback, true);

console.log('✓ Lựa chọn mặc định Lô theo profit hoạt động đúng.');
