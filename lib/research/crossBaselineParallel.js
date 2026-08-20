'use strict';

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number))]
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 99)
        .sort((a, b) => a - b);
}

function membershipWeights(...numberLists) {
    const weights = new Map();
    for (const list of numberLists) {
        for (const number of normalizeNumbers(list)) {
            weights.set(number, (weights.get(number) || 0) + 1);
        }
    }
    return weights;
}

function flatWeights(numbers, weight = 1) {
    return new Map(normalizeNumbers(numbers).map(number => [number, weight]));
}

function union(...lists) {
    return normalizeNumbers(lists.flat());
}

function intersection(first, second) {
    const secondSet = new Set(normalizeNumbers(second));
    return normalizeNumbers(first).filter(number => secondSet.has(number));
}

function symmetricDifference(first, second) {
    const firstSet = new Set(normalizeNumbers(first));
    const secondSet = new Set(normalizeNumbers(second));
    return ALL_NUMBERS.filter(number => firstSet.has(number) !== secondSet.has(number));
}

function buildVariants(input) {
    const annualBlock = normalizeNumbers(input.annualBlock);
    const annualSmall = normalizeNumbers(input.annualSmall);
    const rollingBet = normalizeNumbers(input.rollingBet);
    const rollingIntersection = normalizeNumbers(input.rollingIntersection);
    const annualBet = union(annualBlock, annualSmall);
    const annualIntersection = intersection(annualBlock, annualSmall);
    const crossIntersection = intersection(annualBet, rollingBet);
    const crossUnion = union(annualBet, rollingBet);
    const crossExclusive = symmetricDifference(annualBet, rollingBet);

    return {
        annualNative: membershipWeights(annualBlock, annualSmall),
        rollingNative: membershipWeights(rollingBet, rollingIntersection),
        crossUnionFlat: flatWeights(crossUnion),
        crossUnionX2: membershipWeights(annualBet, rollingBet),
        crossIntersectionFlat: flatWeights(crossIntersection),
        crossIntersectionX2: flatWeights(crossIntersection, 2),
        crossExclusiveFlat: flatWeights(crossExclusive),
        crossFourBranchAdditive: membershipWeights(
            annualBlock,
            annualSmall,
            rollingBet,
            rollingIntersection
        )
    };
}

function settleVariant(weights, actual, options = {}) {
    const stakePerUnitK = Number(options.stakePerUnitK || 1000);
    const payoutMultiplier = Number(options.payoutMultiplier || 84);
    const entries = [...weights.entries()].sort((a, b) => a[0] - b[0]);
    const unitCount = entries.reduce((sum, [, weight]) => sum + weight, 0);
    const actualWeight = weights.get(Number(actual)) || 0;
    const stakeK = unitCount * stakePerUnitK;
    const payoutK = actualWeight * stakePerUnitK * payoutMultiplier;
    return {
        numbers: entries.map(([number]) => number),
        weights: Object.fromEntries(entries),
        uniqueCount: entries.length,
        unitCount,
        actualWeight,
        hit: actualWeight > 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK
    };
}

module.exports = {
    normalizeNumbers,
    membershipWeights,
    buildVariants,
    settleVariant
};
