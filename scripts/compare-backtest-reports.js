#!/usr/bin/env node
const path = require('path');
const { readJsonSnapshot } = require('../lib/utils/backtestFingerprint');

function main() {
    const [leftArg, rightArg] = process.argv.slice(2);
    if (!leftArg || !rightArg) {
        throw new Error('Cách dùng: node scripts/compare-backtest-reports.js <report-a.json> <report-b.json>');
    }
    const leftPath = path.resolve(leftArg);
    const rightPath = path.resolve(rightArg);
    const left = readJsonSnapshot(leftPath);
    const right = readJsonSnapshot(rightPath);
    if (!left.fingerprint || !right.fingerprint) {
        console.log(JSON.stringify({
            comparable: false,
            reason: 'Một trong hai report cũ chưa có fingerprint; không thể chứng minh cùng thí nghiệm.',
            left: path.relative(process.cwd(), leftPath),
            right: path.relative(process.cwd(), rightPath)
        }, null, 2));
        process.exitCode = 2;
        return;
    }

    const checks = {
        data: left.fingerprint.dataSha256 === right.fingerprint.dataSha256,
        config: left.fingerprint.configSha256 === right.fingerprint.configSha256,
        code: left.fingerprint.sourceSha256 === right.fingerprint.sourceSha256,
        baseline: left.fingerprint.baselineCutoffDate === right.fingerprint.baselineCutoffDate,
        run: left.fingerprint.runSha256 === right.fingerprint.runSha256,
        result: left.resultSha256 === right.resultSha256
    };
    const comparable = checks.run;
    const deterministic = comparable && checks.result;
    console.log(JSON.stringify({
        comparable,
        deterministic,
        checks,
        leftRun: left.fingerprint.runSha256,
        rightRun: right.fingerprint.runSha256,
        leftResult: left.resultSha256,
        rightResult: right.resultSha256
    }, null, 2));
    if (!comparable) process.exitCode = 2;
    else if (!deterministic) process.exitCode = 1;
}

main();
