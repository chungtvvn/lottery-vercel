'use strict';

const DEFAULT_STAKE_K = 1000;
const DEFAULT_PAYOUT_MULTIPLIER = 84;

function normalizeNumbers(values = []) {
    return [...new Set(Array.from(values || [], Number))]
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
        .sort((left, right) => left - right);
}

function buildVariants(blockNumbers = [], smallNumbers = []) {
    const block = new Set(normalizeNumbers(blockNumbers));
    const small = new Set(normalizeNumbers(smallNumbers));
    const union = normalizeNumbers([...block, ...small]);
    const intersection = union.filter(number => block.has(number) && small.has(number));
    const exclusive = union.filter(number => !intersection.includes(number));

    return {
        block: normalizeNumbers(block),
        small: normalizeNumbers(small),
        unionDedup: union,
        exclusiveOnly: exclusive,
        intersection
    };
}

function settleFlatStake(numbers = [], actual, options = {}) {
    const betNumbers = normalizeNumbers(numbers);
    const stakePerNumberK = Number(options.stakePerNumberK || DEFAULT_STAKE_K);
    const payoutMultiplier = Number(options.payoutMultiplier || DEFAULT_PAYOUT_MULTIPLIER);
    const normalizedActual = Number(actual);
    const hit = betNumbers.includes(normalizedActual);
    const stakeK = betNumbers.length * stakePerNumberK;
    const payoutK = hit ? stakePerNumberK * payoutMultiplier : 0;

    return {
        actual: normalizedActual,
        betNumbers,
        hit,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK
    };
}

function longestStreak(rows = [], predicate = () => false) {
    let longest = 0;
    let current = 0;
    for (const row of rows) {
        current = predicate(row) ? current + 1 : 0;
        longest = Math.max(longest, current);
    }
    return longest;
}

function summarize(rows = []) {
    const days = rows.length;
    const wins = rows.filter(row => row.hit).length;
    const stakeK = rows.reduce((sum, row) => sum + Number(row.stakeK || 0), 0);
    const payoutK = rows.reduce((sum, row) => sum + Number(row.payoutK || 0), 0);
    return {
        days,
        wins,
        losses: days - wins,
        hitRate: days ? wins / days : 0,
        averageBetCount: days
            ? rows.reduce((sum, row) => sum + row.betNumbers.length, 0) / days
            : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin: longestStreak(rows, row => row.hit),
        longestLoss: longestStreak(rows, row => !row.hit)
    };
}

module.exports = {
    normalizeNumbers,
    buildVariants,
    settleFlatStake,
    summarize
};
