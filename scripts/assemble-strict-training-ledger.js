#!/usr/bin/env node
'use strict';

/* Combines only validator-approved monthly feature ledgers for model training. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_COVERAGE = path.join(ROOT, 'outputs', 'research-training-backfill', 'coverage.json');

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function main() {
    const args = parseArgs();
    const coveragePath = path.resolve(ROOT, args.get('coverage') || DEFAULT_COVERAGE);
    const output = path.resolve(ROOT, args.get('output') || path.join('outputs', 'research-training-backfill', 'strict-chain-training-ledger.jsonl'));
    const minRows = Number(args.get('minRows') || 180);
    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    const ready = (coverage.jobs || []).filter(job => job.status === 'ready');
    const byDate = new Map();
    for (const job of ready) {
        const manifest = JSON.parse(fs.readFileSync(path.resolve(ROOT, coverage.manifest), 'utf8'));
        const spec = manifest.jobs.find(item => item.id === job.id);
        if (!spec) throw new Error(`Coverage tham chiếu job không tồn tại: ${job.id}.`);
        const rows = fs.readFileSync(path.resolve(ROOT, spec.features), 'utf8')
            .split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
        for (const row of rows) {
            if (byDate.has(row.date)) throw new Error(`Ngày feature trùng: ${row.date}.`);
            if (row.featureSource !== 'strict-prefix-point-in-time' || row.numberEvidence?.length !== 100) {
                throw new Error(`${row.date}: feature không đạt strict PIT schema.`);
            }
            byDate.set(row.date, row);
        }
    }
    const rows = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
    if (rows.length < minRows) {
        throw new Error(`Chưa đủ dữ liệu train: ${rows.length}/${minRows} ngày strict PIT đã kiểm chứng.`);
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
    console.log(JSON.stringify({
        output,
        rows: rows.length,
        dateRange: [rows[0].date, rows.at(-1).date],
        readyJobs: ready.length,
        fullTwentyYearReadyJobs: ready.filter(job => job.fullTwentyYear).length
    }, null, 2));
}

main();
