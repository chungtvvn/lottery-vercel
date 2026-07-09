#!/usr/bin/env node
const assert = require('assert');
const {
    buildBacktestFingerprint,
    hashCanonical,
    stableStringify
} = require('../lib/utils/backtestFingerprint');

function build(overrides = {}) {
    return buildBacktestFingerprint({
        rawData: [
            { special: 2, date: '2026-01-02' },
            { date: '2026-01-01', special: 1 }
        ],
        config: { target: 70, strategy: 'chainSmallFirst' },
        baselineCutoffDate: '2025-12-31',
        methodologyVersion: 'strict-pit-v1',
        sourceFiles: [__filename],
        sourceLabel: 'fixture',
        ...overrides
    });
}

const first = build();
const second = build({
    rawData: [
        { date: '2026-01-01', special: 1 },
        { date: '2026-01-02', special: 2 }
    ],
    config: { strategy: 'chainSmallFirst', target: 70 }
});
assert.strictEqual(first.runSha256, second.runSha256);
assert.strictEqual(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));

const changedData = build({
    rawData: [
        { date: '2026-01-01', special: 1 },
        { date: '2026-01-02', special: 3 }
    ]
});
assert.notStrictEqual(first.runSha256, changedData.runSha256);

const changedConfig = build({
    config: { target: 65, strategy: 'chainSmallFirst' }
});
assert.notStrictEqual(first.runSha256, changedConfig.runSha256);
assert.strictEqual(hashCanonical({ a: 1, b: 2 }), hashCanonical({ b: 2, a: 1 }));

console.log('Backtest fingerprint tests passed.');
