const assert = require('assert');
const { buildPrediction } = require('../lib/services/annualMilestoneService');

function candidate(overrides = {}) {
    return {
        key: 'so_chan:veLienTiep',
        title: 'Control chain',
        currentLen: 3,
        baseLen: 3,
        targetLen: 4,
        tier: 2,
        score: 999,
        numbers: [90],
        isPotential: false,
        isRecordOrSuper: false,
        maxStreak: 8,
        currentCount: 100,
        nextCount: 30,
        riskRate: 0.7,
        exposureFrequencyPerYear: 5,
        transitionEvidenceSource: 'annual-streak-transition',
        ...overrides
    };
}

const credibleBlock = candidate({
    key: 'dau_5:block5x3SoLe',
    title: 'Credible long block',
    baseLen: 12,
    targetLen: 13,
    maxStreak: 13,
    currentCount: 120,
    nextCount: 4,
    riskRate: 116 / 120,
    exposureFrequencyPerYear: 0.6,
    numbers: Array.from({ length: 30 }, (_, index) => index)
});

const prediction = buildPrediction(
    [candidate(), credibleBlock],
    1,
    'chainBlockCredibleLongFirst'
);

assert.strictEqual(prediction.selectedChains[0].key, credibleBlock.key);
assert.deepStrictEqual(prediction.excludedNumbers, ['00']);

const tinySampleBlock = candidate({
    key: 'dau_4:block4x4SoLe',
    title: 'Tiny sample block',
    baseLen: 12,
    maxStreak: 12,
    currentCount: 2,
    nextCount: 0,
    riskRate: 1,
    exposureFrequencyPerYear: 0.1,
    numbers: [42]
});

const tinySamplePrediction = buildPrediction(
    [candidate({ numbers: [90] }), tinySampleBlock],
    1,
    'chainBlockCredibleLongFirst'
);

assert.notStrictEqual(
    tinySamplePrediction.selectedChains[0].key,
    tinySampleBlock.key,
    'A raw 100% block with only two samples must not receive the credibility boost'
);

console.log('Credible long block ranking tests passed.');

const singletonCandidates = Array.from({ length: 100 }, (_, num) => candidate({
    key: `so_${String(num).padStart(2, '0')}:veLienTiep`,
    title: `Small ${num}`,
    numbers: [num],
    riskRate: 1 - num / 200,
    score: 100 - num,
    currentCount: 60,
    nextCount: Math.round(60 * (num / 200)),
    exposureFrequencyPerYear: 1
}));
const highNumberBlock = candidate({
    key: 'dau_7:block5x3SoLe',
    title: 'Credible high-number block',
    baseLen: 12,
    targetLen: 13,
    maxStreak: 13,
    currentCount: 120,
    nextCount: 4,
    riskRate: 116 / 120,
    exposureFrequencyPerYear: 0.6,
    numbers: Array.from({ length: 30 }, (_, index) => 70 + index)
});

const smallOnly = buildPrediction(
    [...singletonCandidates, highNumberBlock],
    70,
    'chainSmallFirst'
);
const blended = buildPrediction(
    [...singletonCandidates, highNumberBlock],
    70,
    'numberBlockSmallBlend10'
);

assert.strictEqual(blended.excludedNumbers.length, 70);
assert.notDeepStrictEqual(blended.excludedNumbers, smallOnly.excludedNumbers);
assert(
    blended.excludedNumbers.some(value => Number(value) >= 70),
    'Credible block consensus must be able to adjust the Hold-70 boundary'
);

console.log('Block/small number blend tests passed.');
