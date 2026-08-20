#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
    CAUSES,
    buildAuditRow,
    summarizeAudit,
    summarizeEvidence
} = require('../lib/research/exclusionFailureAudit');

const candidates = [{
    key: 'record-a', family: 'number', pattern: 'consecutive', state: 'active',
    recordState: 'at-record', tier: 1, currentLen: 4, baseLen: 4,
    targetLen: 5, recordLen: 4, numbers: [42]
}, {
    key: 'record-a-duplicate', family: 'number', pattern: 'consecutive', state: 'active',
    recordState: 'at-record', tier: 2, currentLen: 4, baseLen: 4,
    targetLen: 5, recordLen: 4, numbers: [42]
}, {
    key: 'first-b', family: 'block', pattern: 'blockAlternation', state: 'potential',
    recordState: 'never-pattern', tier: 1, currentLen: 1, baseLen: 2,
    targetLen: 2, recordLen: 0, numbers: [42, 43]
}];

const evidence = summarizeEvidence(candidates, 42);
assert.strictEqual(evidence.evidenceCount, 2, 'Bằng chứng trùng phải được khử');
assert.strictEqual(evidence.causes[CAUSES.RECORD_BREAK], 1);
assert.strictEqual(evidence.causes[CAUSES.FIRST_FORMATION], 1);
assert.strictEqual(evidence.dominantCause, CAUSES.RECORD_BREAK);

const row = buildAuditRow({
    date: '2026-01-01', actual: 42,
    strategies: { chainSmallFirst: Array.from({ length: 30 }, (_, index) => index) },
    candidateDiagnostics: candidates
});
assert(row.wrong);
assert.strictEqual(row.numberSamples.length, 100);
assert.strictEqual(row.excludedSamples.length, 70);
assert.strictEqual(row.excludedSamples.filter(sample => sample.failed).length, 1);

const noEvidence = buildAuditRow({
    date: '2026-01-02', actual: 99,
    strategies: { chainSmallFirst: Array.from({ length: 30 }, (_, index) => index) },
    candidateDiagnostics: []
});
assert.strictEqual(noEvidence.actualEvidence.dominantCause, CAUSES.FILL_OR_TIE_BREAK);

const summary = summarizeAudit([row, noEvidence]);
assert.strictEqual(summary.wrongDays, 2);
assert.strictEqual(summary.wrongWithRecordBreakEvidence, 1);
assert.strictEqual(summary.wrongWithFirstFormationEvidence, 1);
assert.strictEqual(summary.wrongWithNoAssociatedEvidence, 1);
console.log('✅ exclusionFailureAudit tests passed');
