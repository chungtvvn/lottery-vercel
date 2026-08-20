#!/usr/bin/env node

const assert = require('assert');
const {
    rankNumbersByCalibratedExclusionV2,
    scoreCandidateEvidence
} = require('../lib/research/calibratedExclusionScoreV2');
const annualMilestoneService = require('../lib/services/annualMilestoneService');

function candidate(key, numbers, overrides = {}) {
    return {
        key,
        numbers,
        tier: 2,
        isPotential: false,
        neverFormed: false,
        transitionEvidenceSource: 'annual-streak-transition',
        currentCount: 40,
        nextCount: 2,
        breakCount: 38,
        targetFrequencyPerYear: 0.5,
        targetGapSample: 0,
        isRecordOrSuper: false,
        ...overrides
    };
}

const range = (start, count) => Array.from({ length: count }, (_, index) => start + index);

const activeNumbers = range(0, 30);
const active = candidate('tong_moi_5:test', activeNumbers);
assert(scoreCandidateEvidence(active)?.evidence > 0);

const invalidPotential = candidate('hieu_5:potential', range(40, 30), {
    isPotential: true,
    neverFormed: true,
    transitionEvidenceSource: null,
    formationEvidenceSource: null,
    formationTrials: 100,
    formationCount: 0
});
assert.strictEqual(scoreCandidateEvidence(invalidPotential), null);

const validPotential = {
    ...invalidPotential,
    formationEvidenceSource: 'daily-replay'
};
assert(scoreCandidateEvidence(validPotential)?.evidence > 0);

const duplicate = candidate('tong_moi_6:duplicate', activeNumbers, {
    currentCount: 20,
    nextCount: 2,
    breakCount: 18
});
const independent = candidate('hieu_7:independent', range(10, 30), {
    currentCount: 30,
    nextCount: 1,
    breakCount: 29
});
const baseRanking = rankNumbersByCalibratedExclusionV2([active, duplicate]);
const diverseRanking = rankNumbersByCalibratedExclusionV2([active, duplicate, independent]);
const baseTen = baseRanking.find(row => row.num === 10);
const diverseTen = diverseRanking.find(row => row.num === 10);

assert.strictEqual(baseTen.memberships, 1, 'Hai key cùng family+tập số chỉ được tính một lần.');
assert.strictEqual(diverseTen.memberships, 2, 'Family độc lập được phép bổ sung bằng chứng.');
assert(diverseTen.score > baseTen.score);
assert.strictEqual(diverseRanking.length, 100);
assert.strictEqual(new Set(diverseRanking.map(row => row.num)).size, 100);

const guardedRanking = annualMilestoneService.rankNumbersBySmallCalibratedV2([
    active,
    duplicate,
    independent
]);
assert.strictEqual(guardedRanking.length, 100);
assert.strictEqual(new Set(guardedRanking.map(row => row.num)).size, 100);

console.log('✓ calibrated exclusion score V2 tests passed');
