#!/usr/bin/env node
const fs = require('fs');

function fail(message) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
}

const [
    reportPath,
    baselineId,
    candidateId,
    windowKey = 'dateRange',
    comparisonMode = 'strict'
] = process.argv.slice(2);
if (!reportPath || !baselineId || !candidateId) {
    fail('Usage: audit-backtest-report.js <report.json> <baselineId> <candidateId> [window] [strict|allow-aggregation-change]');
}

const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const collection = Array.isArray(payload.summary)
    ? Object.fromEntries(payload.summary.map(row => [`${row.strategy}|${row.target}`, row]))
    : payload.summariesByWindow?.[windowKey];
if (!collection) fail(`Không tìm thấy summary/window ${windowKey}`);

const baseline = collection[baselineId];
const candidate = collection[candidateId];
if (!baseline) fail(`Không tìm thấy baseline ${baselineId}`);
if (!candidate) fail(`Không tìm thấy candidate ${candidateId}`);
if (Number(baseline.days) !== Number(candidate.days)) {
    fail(`Số ngày khác nhau: baseline=${baseline.days}, candidate=${candidate.days}`);
}
if (
    baseline.betCount !== undefined &&
    candidate.betCount !== undefined &&
    Number(baseline.betCount) !== Number(candidate.betCount)
) {
    fail(`Số lượng số đánh khác nhau: baseline=${baseline.betCount}, candidate=${candidate.betCount}`);
}
if (
    baseline.target !== undefined &&
    candidate.target !== undefined &&
    Number(baseline.target) !== Number(candidate.target)
) {
    fail(`Mức loại khác nhau: baseline=${baseline.target}, candidate=${candidate.target}`);
}
if (
    baseline.hold !== undefined &&
    candidate.hold !== undefined &&
    Number(baseline.hold) !== Number(candidate.hold)
) {
    fail(`Mức Hold khác nhau: baseline=${baseline.hold}, candidate=${candidate.hold}`);
}
if (
    baseline.aggregationMode !== undefined &&
    candidate.aggregationMode !== undefined &&
    baseline.aggregationMode !== candidate.aggregationMode &&
    comparisonMode !== 'allow-aggregation-change'
) {
    fail(`Cách tổng hợp khác nhau: baseline=${baseline.aggregationMode}, candidate=${candidate.aggregationMode}`);
}
if (
    baseline.stakeK !== undefined &&
    candidate.stakeK !== undefined &&
    Number(baseline.stakeK) !== Number(candidate.stakeK)
) {
    fail(`Tổng tiền cược khác nhau: baseline=${baseline.stakeK}, candidate=${candidate.stakeK}`);
}

const report = {
    days: candidate.days,
    baseline: {
        id: baselineId,
        hitRate: baseline.hitRate ?? baseline.winRate,
        profitK: baseline.profitK,
        roi: baseline.roi,
        longestLoss: baseline.longestLoss,
        atLeast2Rate: baseline.atLeast2Rate
    },
    candidate: {
        id: candidateId,
        hitRate: candidate.hitRate ?? candidate.winRate,
        profitK: candidate.profitK,
        roi: candidate.roi,
        longestLoss: candidate.longestLoss,
        atLeast2Rate: candidate.atLeast2Rate
    },
    delta: {
        hitRate: Number(candidate.hitRate ?? candidate.winRate ?? 0) -
            Number(baseline.hitRate ?? baseline.winRate ?? 0),
        profitK: Number(candidate.profitK || 0) - Number(baseline.profitK || 0),
        roi: Number(candidate.roi || 0) - Number(baseline.roi || 0),
        longestLoss: Number(candidate.longestLoss || 0) - Number(baseline.longestLoss || 0),
        atLeast2Rate: Number(candidate.atLeast2Rate || 0) - Number(baseline.atLeast2Rate || 0)
    }
};

console.log(JSON.stringify(report, null, 2));
