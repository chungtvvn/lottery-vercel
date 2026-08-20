#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmb-strict-features-'));
const input = path.join(directory, 'checkpoint.jsonl');
const output = path.join(directory, 'features.jsonl');
const numberEvidence = Array.from({ length: 100 }, (_, number) => ({
    number,
    supportGroups: number === 17 ? 2 : 0,
    supportFamilies: number === 17 ? 1 : 0,
    activeGroups: number === 17 ? 1 : 0,
    potentialGroups: number === 17 ? 1 : 0,
    tier1Groups: number === 17 ? 1 : 0,
    independentSets: number === 17 ? 3 : 0,
    activeSets: number === 17 ? 2 : 0,
    potentialSets: number === 17 ? 1 : 0,
    tier1Sets: number === 17 ? 1 : 0,
    minSetSize: number === 17 ? 10 : 100,
    meanSetSize: number === 17 ? 12.5 : 100,
    evidenceMass: number === 17 ? 0.72 : 0,
    maxStrength: number === 17 ? 0.4 : 0,
    meanStrength: number === 17 ? 0.24 : 0,
    groups: number === 17 ? { 'head|up': 0.4 } : {},
    groupDetails: number === 17 ? { 'head|up': { maxStrength: 0.4, combinedStrength: 0.42, independentSets: 2, activeSets: 1, potentialSets: 1, tier1Sets: 1, minSetSize: 10, meanSetSize: 12.5, minBaseLen: 3, maxBaseLen: 4, meanBaseLen: 3.5, recordStates: ['at-record'] } } : {}
}));
const row = {
    date: '2026-01-02',
    actual: 17,
    candidateCount: 1,
    generationSeconds: 12.3,
    strategies: { chainSmallFirst: Array.from({ length: 30 }, (_, index) => index) },
    numberEvidence,
    candidateDiagnostics: [{
        key: 'head_even:tien', family: 'head', pattern: 'up', state: 'active',
        recordState: 'at-record', tier: 1, currentLen: 3, baseLen: 3, targetLen: 4,
        recordLen: 3, formationTrials: null, formationCount: null, trials: 5,
        successes: 0, failures: 5, failureRate: 1, numbers: [0, 2, 4]
    }]
};
fs.writeFileSync(input, `${JSON.stringify({ _checkpoint: { signature: 'fixture' } })}\n${JSON.stringify(row)}\n`);
execFileSync(process.execPath, ['scripts/extract-strict-training-features.js', `--input=${input}`, `--output=${output}`], {
    cwd: root,
    stdio: 'inherit'
});
const outputRow = JSON.parse(fs.readFileSync(output, 'utf8'));
assert.equal(outputRow.numberEvidence.length, 100);
assert.equal(outputRow.numberEvidence[17].evidenceMass, 0.72);
assert.equal(outputRow.numberEvidence[17].tier1Sets, 1);
assert.equal(outputRow.numberEvidence[17].groupDetails['head|up'].combinedStrength, 0.42);
assert.equal(outputRow.strategies.chainSmallFirst.length, 30);
assert.equal(outputRow.candidateDiagnostics[0].recordState, 'at-record');
assert.equal(outputRow.candidateDiagnostics[0].failureRate, 1);
assert.equal(outputRow.actual, 17);
const report = path.join(directory, 'report.json');
const reportOutput = path.join(directory, 'report-features.jsonl');
fs.writeFileSync(report, JSON.stringify({ rows: [row] }));
execFileSync(process.execPath, ['scripts/extract-strict-training-features.js', `--input=${report}`, `--output=${reportOutput}`], {
    cwd: root,
    stdio: 'inherit'
});
assert.equal(JSON.parse(fs.readFileSync(reportOutput, 'utf8')).date, row.date);
console.log('PASS strict feature extraction preserves PIT evidence and settlement label.');
