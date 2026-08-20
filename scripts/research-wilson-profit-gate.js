#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    DEFAULT_VARIANTS,
    buildCalibration,
    evaluateReport
} = require('../lib/research/wilsonProfitGate');

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function loadReport(file) {
    const resolved = path.resolve(file);
    return { resolved, report: JSON.parse(fs.readFileSync(resolved, 'utf8')) };
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function markdown(output) {
    const summary = output.result.summary;
    return [
        '# Wilson profit gate - strict PIT',
        '',
        `- Train: ${output.trainFiles.join(', ')}`,
        `- Test: ${output.testFile}`,
        `- Cau hinh: bucket ${output.config.bucketWidth}, min ${output.config.minSamples} mau, z=${output.config.z}, an ${output.config.payoutMultiplier}.`,
        `- Bien the: ${output.config.variantIds.join(', ')}.`,
        '',
        '| Ngay co san | Ngay choi | Bo ngay | Trung | Ty le trung | So/ngay | Profit | ROI | Thua dai nhat |',
        '|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
        `| ${summary.availableDays} | ${summary.playedDays} | ${summary.skippedDays} | ${summary.hitDays} | ${formatPercent(summary.hitRate)} | ${summary.averageUnitCount.toFixed(2)} | ${summary.profitK.toLocaleString('en-US')}K | ${formatPercent(summary.roi)} | ${summary.longestLoss} |`,
        '',
        'Chi choi khi can duoi Wilson cua bucket phuong phap vuot diem hoa von `so don vi / ty le an`. Khong chen them so khi khong du dieu kien.',
        ''
    ].join('\n');
}

function main() {
    const args = parseArgs();
    const trainFiles = String(args.get('train') || '').split(',').filter(Boolean);
    const testFile = args.get('test');
    if (!trainFiles.length || !testFile) {
        throw new Error('Usage: --train=file1,file2 --test=file3');
    }
    const train = trainFiles.map(loadReport);
    const test = loadReport(testFile);
    const config = {
        variantIds: String(args.get('variants') || DEFAULT_VARIANTS.join(',')).split(',').filter(Boolean),
        bucketWidth: Number(args.get('bucketWidth') || 10),
        minSamples: Number(args.get('minSamples') || 8),
        z: Number(args.get('z') || 1.28),
        payoutMultiplier: Number(args.get('payoutMultiplier') || 84)
    };
    const calibration = buildCalibration(train.map(item => item.report), config);
    const result = evaluateReport(test.report, calibration, config);
    const output = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'wilson-profit-gate-strict-pit-v1',
        trainFiles: train.map(item => item.resolved),
        testFile: test.resolved,
        config,
        result
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(process.cwd(), 'reports', `wilson-profit-gate-${stamp}`);
    fs.writeFileSync(`${base}.json`, JSON.stringify(output, null, 2));
    fs.writeFileSync(`${base}.md`, markdown(output));
    console.log(JSON.stringify({ json: `${base}.json`, markdown: `${base}.md`, summary: result.summary }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
}
