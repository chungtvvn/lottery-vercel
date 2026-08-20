#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    EVENT_TYPES,
    buildDailyLedgerRow,
    buildOpportunities,
    classifyOpportunity
} = require('../lib/research/chainProtectionLedger');

function candidate(overrides = {}) {
    return {
        key: 'number:test',
        family: 'number',
        pattern: 'up',
        state: 'active',
        recordState: 'at-record',
        currentLen: 3,
        baseLen: 3,
        targetLen: 4,
        recordLen: 3,
        currentCount: 10,
        numbers: [12, 21],
        observedExcluded: false,
        ...overrides
    };
}

const activeBoundary = classifyOpportunity(candidate());
assert.strictEqual(activeBoundary.eventType, EVENT_TYPES.RECORD_BREAK);
assert.strictEqual(classifyOpportunity(candidate({ recordState: 'below-record', recordLen: 6 })), null);
assert.strictEqual(classifyOpportunity(candidate({ state: 'potential' })), null);

const firstFormation = classifyOpportunity(candidate({
    key: 'block:test',
    family: 'block',
    state: 'potential',
    recordState: 'never-pattern',
    currentLen: 1,
    baseLen: 2,
    targetLen: 3,
    recordLen: 0,
    currentCount: 0,
    formationCount: 0,
    numbers: [34]
}));
assert.strictEqual(firstFormation.eventType, EVENT_TYPES.FIRST_FORMATION);

const duplicate = candidate({ key: 'number:duplicate', baseLen: 4, currentLen: 4 });
const opportunities = buildOpportunities([candidate(), duplicate]);
assert.strictEqual(opportunities.raw.length, 2);
assert.strictEqual(opportunities.deduplicated.length, 1);
assert.strictEqual(opportunities.deduplicated[0].key, 'number:duplicate');

const ledger = buildDailyLedgerRow({
    date: '2026-01-02',
    actual: 21,
    candidateDiagnostics: [candidate({ observedExcluded: true }), firstFormation]
});
assert.strictEqual(ledger.events, 1);
assert.strictEqual(ledger.byType[EVENT_TYPES.RECORD_BREAK].events, 1);
assert.strictEqual(ledger.byType[EVENT_TYPES.FIRST_FORMATION].events, 0);
assert.strictEqual(ledger.protectedNumbers, 3);

const sameWithoutOutcomeFlag = buildDailyLedgerRow({
    date: '2026-01-02',
    actual: 21,
    candidateDiagnostics: [candidate({ observedExcluded: false }), firstFormation]
});
assert.deepStrictEqual(
    sameWithoutOutcomeFlag.opportunities.map(item => item.eventOccurred),
    ledger.opportunities.map(item => item.eventOccurred)
);

console.log('✅ chainProtectionLedger tests passed');
