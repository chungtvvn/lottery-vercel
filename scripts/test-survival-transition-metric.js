#!/usr/bin/env node
const assert = require('assert');
const {
    calculateSurvivalTransitionMetric,
    rankNumbersBySurvivalCredibleRisk
} = require('../lib/services/annualMilestoneService');

const row = {
    actualYears: 20,
    recordLen: 6,
    exactCounts: new Map([
        [2, 10],
        [3, 5],
        [4, 3],
        [5, 1],
        [6, 1]
    ]),
    cumulative: new Map([
        [2, 20],
        [3, 10],
        [4, 5],
        [5, 2],
        [6, 1]
    ])
};

const metric = calculateSurvivalTransitionMetric(row, 3, 1, false);
assert.strictEqual(metric.currentCount, 10, 'S(3) must include every streak with length >= 3.');
assert.strictEqual(metric.nextCount, 5, 'S(4) must include every streak with length >= 4.');
assert.strictEqual(metric.breakCount, 5, 'Breaks at 3 -> 4 equal S(3) - S(4).');
assert.strictEqual(metric.riskRate, 0.5);
assert.strictEqual(metric.exposureFrequencyPerYear, 0.5,
    'Annual occurrence frequency must be S(3) / years, without double counting longer streaks.');
assert.strictEqual(metric.exactFrequencyPerYear, 0.25);
assert.strictEqual(metric.tailStateExposureCount, 18,
    'Tail duration exposure remains available as a separate diagnostic.');

const candidates = [
    {
        key: 'tong_moi:credible',
        numbers: Array.from({ length: 30 }, (_, index) => index + 40),
        tier: 2,
        currentCount: 80,
        nextCount: 1,
        breakCount: 79,
        reachedFrequencyPerYear: 4,
        exposureFrequencyPerYear: 4,
        baseLen: 3,
        maxStreak: 5,
        transitionEvidenceSource: 'annual-streak-transition',
        isPotential: false
    },
    {
        key: 'tong_moi:duplicate',
        numbers: Array.from({ length: 30 }, (_, index) => index + 40),
        tier: 2,
        currentCount: 80,
        nextCount: 1,
        breakCount: 79,
        reachedFrequencyPerYear: 4,
        exposureFrequencyPerYear: 4,
        baseLen: 3,
        maxStreak: 5,
        transitionEvidenceSource: 'annual-streak-transition',
        isPotential: false
    },
    {
        key: 'hieu_5:unsupported_potential',
        numbers: [20],
        tier: 1,
        formationTrials: null,
        formationCount: 0,
        baseLen: 2,
        maxStreak: 2,
        formationEvidenceSource: 'unavailable-requires-daily-replay',
        isPotential: true
    }
];
const ranking = rankNumbersBySurvivalCredibleRisk(candidates);
const supported = ranking.find(item => item.num === 40);
const unsupported = ranking.find(item => item.num === 20);
assert(supported.score > 0, 'A supported active survival transition must contribute evidence.');
assert.strictEqual(supported.memberships, 1,
    'Equivalent sets in the same family must contribute only once.');
assert.strictEqual(unsupported.score, 0,
    'Potential evidence without a daily replay must not affect the ranking.');

console.log('Survival transition metric tests passed.');
