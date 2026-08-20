#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    collectDailyCohorts,
    fitPotentialFormationModel,
    fitStablePotentialFormationModel,
    getPotentialEvidence,
    refinePredictionWithPotential
} = require('../lib/research/potentialFormationCalibrator');

function candidate(overrides = {}) {
    return {
        key: 'potential_sum_test',
        family: 'sum',
        pattern: 'consecutive',
        state: 'potential',
        recordState: 'near-record',
        baseLen: 2,
        targetLen: 3,
        targetFrequencyPerYear: 0.5,
        targetAvgLength: 3.1,
        numbers: [10, 20],
        setSize: 2,
        baseExclusionRate: 0.98,
        observedExcluded: true,
        ...overrides
    };
}

const training = Array.from({ length: 60 }, (_, index) => ({
    date: `2024-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
    candidateDiagnostics: [
        candidate(),
        candidate({ key: 'duplicate_same_day', numbers: [10, 20] })
    ]
}));

const cohorts = collectDailyCohorts(training);
assert(
    [...cohorts.values()].every(row => row.days === 60),
    'Candidate tương quan trong ngày phải gộp thành đúng một đơn vị ngày.'
);

const model = fitPotentialFormationModel(training, {
    priorStrengths: [10, 10, 10, 10, 10]
});
const evidence = getPotentialEvidence(candidate(), model, {
    minDaysByDepth: [10, 10, 10, 10, 10],
    conservativeZ: 0,
    reliabilityDays: 10
});
assert(evidence, 'Candidate tiềm năng đủ mẫu phải có bằng chứng hiệu chỉnh.');
assert(
    evidence.adjustedExclusionRate > evidence.candidate.baseExclusionRate,
    'Cohort luôn không hình thành phải nâng xác suất loại so với tập số nền.'
);

const row = {
    strategies: {
        numberAnnualCalibratedRisk: Array.from({ length: 30 }, (_, index) => index)
    },
    candidateDiagnostics: [candidate()]
};
const refined = refinePredictionWithPotential(row, model, {
    minDaysByDepth: [10, 10, 10, 10, 10],
    conservativeZ: 0,
    reliabilityDays: 10,
    swapLimit: 1,
    minSwapMargin: 0
});
assert.strictEqual(refined.betNumbers.length, 30, 'Dàn đánh phải giữ đúng 30 số.');
assert(!refined.betNumbers.includes(10), 'Số có bằng chứng không hình thành mạnh phải bị đổi ra.');

const sparse = fitPotentialFormationModel(training.slice(0, 2));
assert.strictEqual(
    getPotentialEvidence(candidate(), sparse, {
        minDaysByDepth: [10, 10, 10, 10, 10]
    }),
    null,
    'Mẫu quá ít không được tạo tín hiệu.'
);

const stable = fitStablePotentialFormationModel([
    training.slice(0, 20),
    training.slice(20, 40),
    training.slice(40, 60)
], {
    priorStrengths: [10, 10, 10, 10, 10],
    minDaysPerYear: 10,
    minYears: 3,
    minPositiveShare: 1,
    stabilityZ: 0
});
assert(stable.size > 0, 'Cohort cùng chiều qua các năm phải được giữ lại.');

const unstable = fitStablePotentialFormationModel([
    training.slice(0, 20),
    training.slice(20, 40).map(row => ({
        ...row,
        candidateDiagnostics: row.candidateDiagnostics.map(item => ({
            ...item,
            observedExcluded: false
        }))
    })),
    training.slice(40, 60)
], {
    priorStrengths: [10, 10, 10, 10, 10],
    minDaysPerYear: 10,
    minYears: 3,
    minPositiveShare: 1,
    stabilityZ: 0
});
assert.strictEqual(unstable.size, 0, 'Cohort đổi dấu giữa các năm phải bị loại.');

console.log('✅ potentialFormationCalibrator tests passed');
