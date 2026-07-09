#!/usr/bin/env node
const assert = require('assert');
const {
    buildTokenStats,
    refinePrediction,
    tokenContribution,
    tokenFor
} = require('./research-strict-bayes-refiner');

function evidence(number, family, hitsLikely) {
    return {
        number,
        groupDetails: {
            [`${family}|consecutive`]: {
                maxStrength: hitsLikely ? 0.2 : 0.8,
                combinedStrength: hitsLikely ? 0.2 : 0.8,
                independentSets: 2,
                activeSets: 2,
                potentialSets: 0,
                tier1Sets: 1,
                minSetSize: hitsLikely ? 2 : 20
            }
        }
    };
}

const config = { tokenMode: 'full', priorStrength: 10, swapLimit: 2, margin: 0 };
const rows = Array.from({ length: 20 }, (_, index) => ({
    date: `fixture-${index}`,
    actual: 40,
    strategies: {
        chainSmallFirst: Array.from({ length: 30 }, (_, number) => number)
    },
    numberEvidence: Array.from({ length: 100 }, (_, number) =>
        evidence(number, number === 40 ? 'safe' : 'risk', number === 40)
    )
}));
const stats = buildTokenStats(rows, config);
const prediction = refinePrediction(rows[0], stats, config);
assert.strictEqual(prediction.betNumbers.length, 30);
assert(prediction.betNumbers.includes(40));
assert(!prediction.betNumbers.includes(29));
assert.strictEqual(prediction.swaps, 1);
assert.strictEqual(
    tokenFor('sum|consecutive', {
        activeSets: 1,
        potentialSets: 0,
        minSetSize: 2,
        combinedStrength: 0.8
    }, 'full'),
    'sum|consecutive|active|w02|s4|c01'
);
assert(tokenContribution({ exposures: 100, hits: 0 }, 10) < 0);
assert(tokenContribution({ exposures: 100, hits: 5 }, 10) > 0);
console.log('Strict Bayes refiner tests passed.');
