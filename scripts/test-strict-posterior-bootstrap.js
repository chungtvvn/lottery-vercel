#!/usr/bin/env node
const assert = require('assert');
const {
    BASE_RATE,
    mulberry32,
    sampleBeta,
    quantile,
    posteriorSummary,
    posteriorScore,
    allConfigs
} = require('./research-strict-posterior-bootstrap');

function approximate(actual, expected, tolerance, message) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
}

function run() {
    const first = mulberry32(1234);
    const second = mulberry32(1234);
    const firstDraws = Array.from({ length: 20 }, () => first());
    const secondDraws = Array.from({ length: 20 }, () => second());
    assert.deepStrictEqual(firstDraws, secondDraws, 'PRNG phải xác định theo seed');

    const random = mulberry32(99);
    const betaDraws = Array.from({ length: 20000 }, () => sampleBeta(2, 8, random));
    const betaMean = betaDraws.reduce((sum, value) => sum + value, 0) / betaDraws.length;
    approximate(betaMean, 0.2, 0.01, 'Beta sampler sai trung bình');

    assert.strictEqual(quantile([0, 1, 2, 3, 4], 0.5), 2);
    assert.strictEqual(quantile([0, 10], 0.9), 9);

    const lowRisk = posteriorSummary({
        token: 'low', family: 'test', exposures: 1000, hits: 2
    }, 100, 5000, 7);
    const neutral = posteriorSummary({
        token: 'neutral', family: 'test', exposures: 1000, hits: 10
    }, 100, 5000, 7);
    const highRisk = posteriorSummary({
        token: 'high', family: 'test', exposures: 1000, hits: 25
    }, 100, 5000, 7);
    assert.ok(lowRisk.mean < BASE_RATE);
    assert.ok(highRisk.mean > BASE_RATE);
    assert.ok(posteriorScore(lowRisk, 'mean') > posteriorScore(neutral, 'mean'));
    assert.ok(posteriorScore(neutral, 'mean') > posteriorScore(highRisk, 'mean'));
    assert.ok(lowRisk.q90 > lowRisk.mean, 'q90 phải lớn hơn mean');
    assert.strictEqual(allConfigs().length, 384);

    console.log('OK strict posterior bootstrap tests');
}

run();
