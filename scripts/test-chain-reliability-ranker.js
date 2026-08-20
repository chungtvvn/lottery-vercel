#!/usr/bin/env node
const assert = require('assert');
const {
    fitReliabilityModel,
    refinePrediction,
    scoreNumbers
} = require('../lib/research/chainReliabilityRanker');

function candidate(overrides = {}) {
    return {
        key: 'potential_sum_test',
        family: 'sum',
        pattern: 'consecutive',
        state: 'potential',
        recordState: 'near-record',
        currentLen: 1,
        baseLen: 2,
        targetLen: 3,
        numbers: [10, 20],
        setSize: 2,
        baseExclusionRate: 0.98,
        observedExcluded: true,
        ...overrides
    };
}

const training = Array.from({ length: 80 }, (_, index) => ({
    date: `2024-01-${String((index % 28) + 1).padStart(2, '0')}`,
    candidateDiagnostics: [
        candidate({ observedExcluded: index < 80 }),
        candidate({
            key: 'active_tail_test',
            family: 'tail',
            state: 'active',
            numbers: [30, 40],
            observedExcluded: index < 60
        })
    ]
}));

const model = fitReliabilityModel(training, { priorStrengths: [20, 30, 40] });
const row = {
    strategies: {
        chainSmallFirst: Array.from({ length: 30 }, (_, index) => index)
    },
    candidateDiagnostics: [
        candidate(),
        candidate({
            key: 'active_tail_test',
            family: 'tail',
            state: 'active',
            numbers: [30, 40]
        })
    ]
};
const scored = scoreNumbers(row, model, {
    minOpportunities: 20,
    conservativeZ: 0,
    minEdge: 0,
    reliabilityDays: 20
});
const score10 = scored.numbers.find(item => item.number === 10).score;
const score30 = scored.numbers.find(item => item.number === 30).score;
assert(score10 > 0, 'Potential phải được chấm từ cơ hội replay đã quan sát.');
assert(score10 > score30, 'Cohort potential có edge tốt hơn phải được xếp cao hơn.');

const refined = refinePrediction(row, model, {
    minOpportunities: 20,
    conservativeZ: 0,
    minEdge: 0,
    reliabilityDays: 20,
    swapLimit: 2,
    minSwapMargin: 0
});
assert.strictEqual(refined.betNumbers.length, 30, 'Dàn đánh phải giữ đúng 30 số.');
assert(!refined.betNumbers.includes(10), 'Số có bằng chứng loại mạnh phải bị đưa khỏi dàn đánh.');

const sparseModel = fitReliabilityModel(training.slice(0, 2));
const sparse = scoreNumbers(row, sparseModel, {
    minOpportunities: 10,
    conservativeZ: 0
});
assert.strictEqual(
    sparse.numbers.find(item => item.number === 10).score,
    0,
    'Mẫu quá ít không được biến thành tín hiệu tin cậy.'
);

console.log('✅ chainReliabilityRanker tests passed');
