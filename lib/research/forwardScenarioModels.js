'use strict';

const NUMBER_COUNT = 100;

function normalizeNumber(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number < NUMBER_COUNT
        ? number
        : null;
}

function seededRandom(seed) {
    let state = Number(seed) >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function normalizeProbabilities(weights) {
    const safe = Array.from({ length: NUMBER_COUNT }, (_, index) => {
        const value = Number(weights?.[index] || 0);
        return Number.isFinite(value) && value > 0 ? value : 0;
    });
    const total = safe.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return safe.map(() => 1 / NUMBER_COUNT);
    return safe.map(value => value / total);
}

function buildFrequencyProbabilities(rows, priorWeight = 100) {
    const counts = Array(NUMBER_COUNT).fill(Number(priorWeight) / NUMBER_COUNT);
    for (const row of rows || []) {
        const number = normalizeNumber(row?.special);
        if (number !== null) counts[number]++;
    }
    return normalizeProbabilities(counts);
}

function buildMarkovProbabilities(rows, priorWeight = 200) {
    const prior = Number(priorWeight) / NUMBER_COUNT;
    const matrix = Array.from(
        { length: NUMBER_COUNT },
        () => Array(NUMBER_COUNT).fill(prior)
    );
    let previous = null;
    for (const row of rows || []) {
        const current = normalizeNumber(row?.special);
        if (current === null) continue;
        if (previous !== null) matrix[previous][current]++;
        previous = current;
    }
    return matrix.map(normalizeProbabilities);
}

function sampleCategorical(probabilities, random) {
    const threshold = random();
    let cumulative = 0;
    for (let number = 0; number < NUMBER_COUNT; number++) {
        cumulative += Number(probabilities[number] || 0);
        if (threshold <= cumulative || number === NUMBER_COUNT - 1) return number;
    }
    return NUMBER_COUNT - 1;
}

function createScenarioGenerator(model, rows, seed, options = {}) {
    const random = seededRandom(seed);
    const normalizedRows = (rows || [])
        .map(row => ({ ...row, special: normalizeNumber(row?.special) }))
        .filter(row => row.special !== null);
    const frequency = options.frequencyProbabilities
        || buildFrequencyProbabilities(normalizedRows, options.frequencyPriorWeight);
    const markov = options.markovProbabilities
        || buildMarkovProbabilities(normalizedRows, options.markovPriorWeight);
    const blockSize = Math.max(1, Number(options.blockSize || 7));
    let blockStart = 0;
    let blockOffset = blockSize;

    return ({ previousNumber = null } = {}) => {
        if (model === 'uniform') return Math.floor(random() * NUMBER_COUNT);
        if (model === 'frequency-posterior') {
            return sampleCategorical(frequency, random);
        }
        if (model === 'markov-posterior') {
            const previous = normalizeNumber(previousNumber);
            return sampleCategorical(previous === null ? frequency : markov[previous], random);
        }
        if (model === 'block-bootstrap') {
            if (!normalizedRows.length) return Math.floor(random() * NUMBER_COUNT);
            if (blockOffset >= blockSize) {
                blockStart = Math.floor(random() * normalizedRows.length);
                blockOffset = 0;
            }
            const row = normalizedRows[(blockStart + blockOffset) % normalizedRows.length];
            blockOffset++;
            return row.special;
        }
        throw new Error(`Mô hình kịch bản không hỗ trợ: ${model}`);
    };
}

function settleParallelDay({ unionNumbers, intersectionNumbers, actual, multiplier, payout = 84 }) {
    const union = new Set((unionNumbers || []).map(Number));
    const intersection = new Set((intersectionNumbers || []).map(Number));
    const number = normalizeNumber(actual);
    const overlapHit = number !== null && intersection.has(number);
    const unionHit = number !== null && union.has(number);
    const units = union.size + (Math.max(1, multiplier) - 1) * intersection.size;
    const payoutUnits = overlapHit ? Math.max(1, multiplier) : (unionHit ? 1 : 0);
    return {
        units,
        unionHit,
        overlapHit,
        profitUnits: payoutUnits * payout - units
    };
}

function jaccard(left, right) {
    const a = new Set((left || []).map(Number));
    const b = new Set((right || []).map(Number));
    const intersection = [...a].filter(value => b.has(value)).length;
    const union = a.size + b.size - intersection;
    return union ? intersection / union : 1;
}

module.exports = {
    NUMBER_COUNT,
    buildFrequencyProbabilities,
    buildMarkovProbabilities,
    createScenarioGenerator,
    jaccard,
    normalizeProbabilities,
    sampleCategorical,
    seededRandom,
    settleParallelDay
};
