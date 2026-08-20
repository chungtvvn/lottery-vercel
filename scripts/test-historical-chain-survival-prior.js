#!/usr/bin/env node
const assert = require('assert');
const {
    addStatsToAccumulator,
    createAccumulator,
    finalizeSurvivalPriors,
    simulatePosterior
} = require('../lib/research/historicalChainSurvivalPrior');
const { historicalSurvivalMultiplier } = require('../lib/research/hierarchicalChainCalibrator');

const stats = {
    tong_moi_5: {
        consecutive: {
            streaks: [
                { endDate: '01/01/2020', length: 2 },
                { endDate: '02/01/2020', length: 2 },
                { endDate: '03/01/2020', length: 3 },
                { endDate: '01/01/2024', length: 9 }
            ]
        }
    },
    tong_moi_6: {
        consecutive: {
            streaks: [
                { endDate: '01/02/2020', length: 2 },
                { endDate: '02/02/2020', length: 3 },
                { endDate: '03/02/2020', length: 4 }
            ]
        }
    },
    tong_moi_7: {
        block2x1SoLe: {
            streaks: [
                { endDate: '01/03/2020', length: 5 },
                { endDate: '02/03/2020', length: 6 }
            ]
        }
    }
};

const accumulator = createAccumulator();
addStatsToAccumulator(stats, accumulator, {
    startDate: '01/01/2006',
    cutoffDate: '31/12/2023',
    capPerPattern: 10
});
assert.strictEqual(accumulator.blockPatternsExcluded, 1, 'Nhịp block phải bị loại vì thiếu transition hằng ngày.');
assert.strictEqual(accumulator.episodesUsed, 6, 'Episode sau cutoff và block không được đi vào prior.');

const first = finalizeSurvivalPriors(accumulator, { draws: 2000, seed: 77 });
const second = finalizeSurvivalPriors(accumulator, { draws: 2000, seed: 77 });
const prior = first.groups.get('sum|other');
assert(prior, 'Phải sinh prior cho family/pattern có dữ liệu.');
assert.deepStrictEqual(prior.simulation, second.groups.get('sum|other').simulation,
    'Mô phỏng phải tái lập với cùng seed.');

const simulation = simulatePosterior(20, 5, { draws: 3000, seed: 11, futureOpportunities: 50 });
assert(simulation.q05 < simulation.q50 && simulation.q50 < simulation.q95,
    'Khoảng posterior phải có thứ tự hợp lệ.');
const multiplier = historicalSurvivalMultiplier(
    { family: 'sum', pattern: 'other', state: 'active' },
    { survivalWeight: 1, survivalPriors: first }
);
assert(multiplier >= 0.5 && multiplier <= 2, 'Trọng số survival phải nằm trong guardrail.');
assert.strictEqual(historicalSurvivalMultiplier(
    { family: 'sum', pattern: 'other', state: 'potential' },
    { survivalWeight: 1, survivalPriors: first }
), 1, 'Không được suy diễn formation của potential từ episode survival.');

console.log('Historical chain survival prior tests passed.');
