#!/usr/bin/env node
'use strict';

/*
 * Runs one bounded strict-PIT evidence job from the manifest.  The daily
 * updater must never invoke this script: producing historical evidence is an
 * offline/research workload and each month can be resumed independently.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = path.join(ROOT, 'outputs', 'research-training-backfill', 'manifest.json');

function args() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function main() {
    const options = args();
    const manifestPath = path.resolve(ROOT, options.get('manifest') || DEFAULT_MANIFEST);
    const id = options.get('job');
    if (!id) throw new Error('Dùng --job=strict-evidence-YYYY-MM.');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const job = (manifest.jobs || []).find(item => item.id === id);
    if (!job) throw new Error(`Không tìm thấy job ${id} trong ${path.relative(ROOT, manifestPath)}.`);

    const report = path.resolve(ROOT, job.report);
    const features = path.resolve(ROOT, job.features);
    const checkpoint = path.resolve(ROOT, job.checkpoint);
    const dryRun = options.get('dryRun') === '1';
    const force = options.get('force') === '1';
    const run = (label, command, commandArgs) => {
        console.log(`[${job.id}] ${label}: ${command} ${commandArgs.join(' ')}`);
        if (dryRun) return;
        const result = spawnSync(command, commandArgs, {
            cwd: ROOT,
            stdio: 'inherit',
            env: process.env
        });
        if (result.status !== 0) throw new Error(`${label} thất bại với exit code ${result.status}.`);
    };

    if (!fs.existsSync(report) || force) {
        fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
        fs.mkdirSync(path.dirname(report), { recursive: true });
        run('sinh strict-PIT evidence', process.execPath, [
            '--expose-gc',
            '--max-old-space-size=4096',
            'scripts/research-true-pit-strategies.js',
            `--startDate=${job.startDate}`,
            `--endDate=${job.endDate}`,
            '--dateStep=1',
            '--inline=1',
            '--includeEvidence=1',
            '--includeCandidateDiagnostics=1',
            `--checkpointFile=${job.checkpoint}`,
            `--reportFile=${job.report}`
        ]);
    } else {
        console.log(`[${job.id}] Giữ report đã hoàn tất: ${job.report}`);
    }

    if (!fs.existsSync(features) || force) {
        fs.mkdirSync(path.dirname(features), { recursive: true });
        run('trích xuất feature ledger', process.execPath, [
            'scripts/extract-strict-training-features.js',
            `--input=${job.report}`,
            `--output=${job.features}`
        ]);
    } else {
        console.log(`[${job.id}] Giữ feature ledger đã hoàn tất: ${job.features}`);
    }
    console.log(JSON.stringify({ job: job.id, report: job.report, features: job.features, dryRun }, null, 2));
}

main();
