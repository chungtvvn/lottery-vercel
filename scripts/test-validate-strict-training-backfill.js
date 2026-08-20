#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmb-strict-audit-'));
const report = path.join(directory, 'report.json');
const features = path.join(directory, 'features.jsonl');
const manifest = path.join(directory, 'manifest.json');
const output = path.join(directory, 'coverage.json');
const date = '2026-01-02';
const evidence = Array.from({ length: 100 }, (_, number) => ({ number }));
const row = { date, actual: 17, numberEvidence: evidence };

fs.writeFileSync(report, JSON.stringify({
    methodology: 'strict-prefix-point-in-time-v1',
    options: { dateStep: 1, inline: true },
    rows: [row]
}));
fs.writeFileSync(features, `${JSON.stringify({
    featureSource: 'strict-prefix-point-in-time',
    date,
    actual: 17,
    numberEvidence: evidence
})}\n`);
fs.writeFileSync(manifest, JSON.stringify({ jobs: [{
    id: 'fixture', startDate: date, endDate: date,
    report, features, hasFullTwentyYearBaseline: true
}] }));

// The production validator derives expected calendar days from the real raw
// file. Use an empty range relative to the project data and only verify that
// an unavailable job remains visible rather than being silently accepted.
execFileSync(process.execPath, [
    'scripts/validate-strict-training-backfill.js',
    `--manifest=${manifest}`,
    `--output=${output}`
], { cwd: root, stdio: 'inherit' });
const audit = JSON.parse(fs.readFileSync(output, 'utf8'));
assert.equal(audit.jobs.length, 1);
assert.equal(audit.jobs[0].status, 'ready');
assert.equal(audit.readyRows, 1);
console.log('PASS strict backfill validator accepts a complete auditable job.');
