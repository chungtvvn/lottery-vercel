#!/usr/bin/env node
'use strict';

/*
 * Audits completed strict-PIT backfill jobs before their features are used for
 * training. Missing jobs are reported rather than treated as valid data.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = path.join(ROOT, 'outputs', 'research-training-backfill', 'manifest.json');
const RAW_FILE = path.join(ROOT, 'lib', 'data', 'xsmb-2-digits.json');

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function readLines(file) {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function rawDates() {
    return new Set(JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'))
        .map(row => String(row.date || '').slice(0, 10))
        .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)));
}

function expectedDates(dates, job) {
    return [...dates].filter(date => date >= job.startDate && date <= job.endDate).sort();
}

function validateReport(job, reportPath, dates) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const errors = [];
    if (report.methodology !== 'strict-prefix-point-in-time-v1') {
        errors.push(`methodology=${report.methodology || 'missing'}`);
    }
    if (Number(report.options?.dateStep) !== 1 || report.options?.inline !== true) {
        errors.push('options không phải dateStep=1 + inline=true');
    }
    const rows = Array.isArray(report.rows) ? report.rows : [];
    const rowDates = rows.map(row => row.date).sort();
    const expected = expectedDates(dates, job);
    if (new Set(rowDates).size !== rowDates.length) errors.push('report có ngày trùng');
    if (rowDates.length !== expected.length || rowDates.some((date, index) => date !== expected[index])) {
        errors.push(`coverage không khớp (${rowDates.length}/${expected.length} ngày)`);
    }
    for (const row of rows) {
        if (!Number.isInteger(Number(row.actual)) || Number(row.actual) < 0 || Number(row.actual) > 99) {
            errors.push(`${row.date}: actual không hợp lệ`);
            break;
        }
        if (!Array.isArray(row.numberEvidence) || row.numberEvidence.length !== 100) {
            errors.push(`${row.date}: thiếu 100 numberEvidence`);
            break;
        }
        const evidenceNumbers = new Set(row.numberEvidence.map(item => Number(item.number)));
        if (evidenceNumbers.size !== 100 || [...evidenceNumbers].some(number => number < 0 || number > 99)) {
            errors.push(`${row.date}: numberEvidence không phủ đủ 00-99`);
            break;
        }
    }
    return { report, rows, errors };
}

function validateFeatures(featurePath, reportRows) {
    const errors = [];
    const rows = readLines(featurePath);
    const reportDates = reportRows.map(row => row.date).sort();
    const featureDates = rows.map(row => row.date).sort();
    if (rows.length !== reportRows.length || featureDates.some((date, index) => date !== reportDates[index])) {
        errors.push(`feature coverage không khớp (${rows.length}/${reportRows.length} ngày)`);
    }
    for (const row of rows) {
        if (row.featureSource !== 'strict-prefix-point-in-time' || !Array.isArray(row.numberEvidence) || row.numberEvidence.length !== 100) {
            errors.push(`${row.date}: feature schema/evidence không hợp lệ`);
            break;
        }
    }
    return errors;
}

function main() {
    const args = parseArgs();
    const manifestPath = path.resolve(ROOT, args.get('manifest') || DEFAULT_MANIFEST);
    const output = path.resolve(ROOT, args.get('output') || path.join('outputs', 'research-training-backfill', 'coverage.json'));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const dates = rawDates();
    const jobs = [];
    for (const job of manifest.jobs || []) {
        const reportPath = path.resolve(ROOT, job.report);
        const featurePath = path.resolve(ROOT, job.features);
        if (!fs.existsSync(reportPath)) {
            jobs.push({ id: job.id, status: 'missing-report', fullTwentyYear: job.hasFullTwentyYearBaseline });
            continue;
        }
        let audit;
        try {
            audit = validateReport(job, reportPath, dates);
        } catch (error) {
            jobs.push({ id: job.id, status: 'invalid-report', errors: [error.message], fullTwentyYear: job.hasFullTwentyYearBaseline });
            continue;
        }
        const errors = audit.errors.slice();
        if (!fs.existsSync(featurePath)) errors.push('thiếu feature ledger');
        else errors.push(...validateFeatures(featurePath, audit.rows));
        jobs.push({
            id: job.id,
            status: errors.length ? 'invalid' : 'ready',
            errors,
            rows: audit.rows.length,
            dateRange: audit.rows.length ? [audit.rows[0].date, audit.rows.at(-1).date] : [],
            fullTwentyYear: job.hasFullTwentyYearBaseline
        });
    }
    const ready = jobs.filter(job => job.status === 'ready');
    const summary = {
        generatedAt: new Date().toISOString(),
        manifest: path.relative(ROOT, manifestPath),
        jobs: jobs.length,
        readyJobs: ready.length,
        readyRows: ready.reduce((sum, job) => sum + job.rows, 0),
        fullTwentyYearReadyJobs: ready.filter(job => job.fullTwentyYear).length,
        statuses: Object.fromEntries([...new Set(jobs.map(job => job.status))].map(status => [status, jobs.filter(job => job.status === status).length])),
        jobs
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify({ output, ...summary, jobs: undefined }, null, 2));
    if (args.get('strict') === '1' && jobs.some(job => job.status === 'invalid' || job.status === 'invalid-report')) {
        process.exitCode = 1;
    }
}

main();
