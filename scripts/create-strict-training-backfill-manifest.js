#!/usr/bin/env node
'use strict';

/*
 * Creates resumable local jobs for the expensive feature backfill.  The jobs
 * are intentionally not executed by the daily GitHub Action: one date needs
 * to regenerate the strict prefix statistics and may take tens of seconds.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RAW_FILE = path.join(ROOT, 'lib', 'data', 'xsmb-2-digits.json');
const OUTPUT_DIR = path.join(ROOT, 'outputs', 'research-training-backfill');

function monthEnd(iso) {
    const [year, month] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function nextMonth(iso) {
    const [year, month] = iso.split('-').map(Number);
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
}

function main() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    const raw = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'))
        .map(row => String(row.date || '').slice(0, 10))
        .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
        .sort();
    const first = raw[0];
    const last = raw.at(-1);
    const firstYear = Number(first.slice(0, 4));
    const lastYear = Number(last.slice(0, 4));
    const requestedStartYear = Number(args.get('startYear') || firstYear + 1);
    const requestedEndYear = Number(args.get('endYear') || lastYear);
    const startYear = Math.max(firstYear + 1, requestedStartYear);
    const endYear = Math.min(lastYear, requestedEndYear);
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) {
        throw new Error(`Khoảng năm không hợp lệ: ${requestedStartYear}-${requestedEndYear}.`);
    }
    const jobs = [];
    for (let year = startYear; year <= endYear; year++) {
        for (let month = 1; month <= 12; month++) {
            const start = `${year}-${String(month).padStart(2, '0')}-01`;
            if (start > last) break;
            const end = [monthEnd(start), last].sort()[0];
            const twentyYearWindowStart = `${year - 20}-01-01`;
            const checkpoint = path.join(OUTPUT_DIR, 'checkpoints', `strict-evidence-${year}-${String(month).padStart(2, '0')}.jsonl`);
            const report = path.join(OUTPUT_DIR, 'reports', `strict-evidence-${year}-${String(month).padStart(2, '0')}.json`);
            const features = path.join(OUTPUT_DIR, 'features', `strict-evidence-${year}-${String(month).padStart(2, '0')}.jsonl`);
            jobs.push({
                id: `strict-evidence-${year}-${String(month).padStart(2, '0')}`,
                year,
                startDate: start,
                endDate: end,
                baselineCutoffDate: `${year - 1}-12-31`,
                twentyYearWindowStart,
                availableHistoryYears: Number(((new Date(`${year - 1}-12-31T00:00:00Z`) - new Date(`${first}T00:00:00Z`)) / 31557600000).toFixed(2)),
                hasFullTwentyYearBaseline: first <= twentyYearWindowStart,
                checkpoint: path.relative(ROOT, checkpoint),
                report: path.relative(ROOT, report),
                features: path.relative(ROOT, features),
                command: [
                    'node --expose-gc --max-old-space-size=4096',
                    'scripts/research-true-pit-strategies.js',
                    `--startDate=${start}`,
                    `--endDate=${end}`,
                    '--dateStep=1',
                    '--inline=1',
                    '--includeEvidence=1',
                    '--includeCandidateDiagnostics=1',
                    `--checkpointFile=${path.relative(ROOT, checkpoint)}`,
                    `--reportFile=${path.relative(ROOT, report)}`
                ].join(' '),
                extractCommand: [
                    'node scripts/extract-strict-training-features.js',
                    `--input=${path.relative(ROOT, report)}`,
                    `--output=${path.relative(ROOT, features)}`
                ].join(' ')
            });
        }
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const output = path.join(OUTPUT_DIR, 'manifest.json');
    fs.writeFileSync(output, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        purpose: 'Offline strict-PIT feature backfill. Run one job at a time; each job resumes from its JSONL checkpoint.',
        rawCoverage: [first, last],
        requestedCoverage: [startYear, endYear],
        caveat: 'Raw data starts in 2005. A true fixed 20-year annual baseline is available from prediction year 2026 onward; earlier jobs remain strict PIT but have shorter available history.',
        jobs
    }, null, 2)}\n`);
    console.log(JSON.stringify({ output, jobs: jobs.length, firstJob: jobs[0], lastJob: jobs.at(-1) }, null, 2));
}

main();
