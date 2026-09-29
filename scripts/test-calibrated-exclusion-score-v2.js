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

const {
    filterCandidatesByBenjaminiHochberg,
    getCalibratedExclusionSet
} = require('../lib/research/calibratedExclusionScoreV2');

// 1. Test minTrials: 10 trials should be rejected by default (requires >= 20)
const smallSample = candidate('dau_1:small', range(10, 10), {
    currentCount: 10,
    breakCount: 9
});
assert.strictEqual(scoreCandidateEvidence(smallSample), null, 'Candidate với mẫu < 20 phải bị từ chối');

// 2. Test split-stability: candidate unstable across splits must be rejected
const unstableCandidate = candidate('dit_2:unstable', range(20, 10), {
    currentCount: 30,
    breakCount: 28,
    isStableAcrossSplits: false
});
assert.strictEqual(scoreCandidateEvidence(unstableCandidate), null, 'Candidate không ổn định giữa 2 giai đoạn phải bị từ chối');

// 3. Test Benjamini-Hochberg FDR filtering
const fdrFiltered = filterCandidatesByBenjaminiHochberg([active, duplicate, independent], { fdrAlpha: 0.10 });
assert(Array.isArray(fdrFiltered));

// 4. Test getCalibratedExclusionSet (Point 4: không ép số lượng, evidence tới đâu loại tới đó)
const result = getCalibratedExclusionSet([active, independent], { applyFDR: false });
assert(result.excluded.length > 0);
assert(result.excluded.length <= 40, 'Chỉ loại những số có evidence thực tế, không ép 70-80 số');
assert.strictEqual(result.excludedCount + result.toBetCount, 100);

// Test strict abstain when evidence count < minRequiredExclusions
const abstainResult = getCalibratedExclusionSet([active], {
    applyFDR: false,
    strictAbstain: true,
    minRequiredExclusions: 50 // active chỉ có 30 số, nhỏ hơn 50 nên phải abstain
});
assert.strictEqual(abstainResult.abstained, true, 'Thiếu evidence phải kích hoạt Abstain thay vì ép loại');
assert.strictEqual(abstainResult.excluded.length, 0);
assert.strictEqual(abstainResult.toBet.length, 100);

console.log('✓ calibrated exclusion score V2 tests passed (including MinTrials>=20, BH FDR, Split-Stability & No-Forced-Filling)');
