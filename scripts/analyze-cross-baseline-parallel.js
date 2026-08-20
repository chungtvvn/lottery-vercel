#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    buildVariants,
    settleVariant
} = require('../lib/research/crossBaselineParallel');

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function summarize(rows) {
    let currentWin = 0;
    let currentLoss = 0;
    let longestWin = 0;
    let longestLoss = 0;
    for (const row of rows) {
        if (row.profitK > 0) {
            currentWin += 1;
            currentLoss = 0;
            longestWin = Math.max(longestWin, currentWin);
        } else if (row.profitK < 0) {
            currentLoss += 1;
            currentWin = 0;
            longestLoss = Math.max(longestLoss, currentLoss);
        } else {
            currentWin = 0;
            currentLoss = 0;
        }
    }
    const days = rows.length;
    const hitDays = rows.filter(row => row.hit).length;
    const stakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = rows.reduce((sum, row) => sum + row.payoutK, 0);
    const profitK = payoutK - stakeK;
    return {
        days,
        hitDays,
        hitRate: days ? hitDays / days : 0,
        averageUniqueCount: days ? rows.reduce((sum, row) => sum + row.uniqueCount, 0) / days : 0,
        averageUnitCount: days ? rows.reduce((sum, row) => sum + row.unitCount, 0) / days : 0,
        weightedHitUnits: rows.reduce((sum, row) => sum + row.actualWeight, 0),
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin,
        longestLoss
    };
}

function monthly(rows) {
    const groups = new Map();
    for (const row of rows) {
        const key = row.date.slice(0, 7);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return Object.fromEntries([...groups].map(([key, values]) => [key, summarize(values)]));
}

function markdown(report) {
    const lines = [
        '# Backtest strict PIT: kết hợp Mốc 20 năm và Lịch sử D-1',
        '',
        `- Khoảng ngày: ${report.startDate} đến ${report.endDate} (${report.days} ngày).`,
        '- Mốc 20 năm: baseline chốt 31/12/2025; Lịch sử: metric lăn đến D-1.',
        '- Mỗi đơn vị: 1.000K; trúng nhận 84 lần đơn vị.',
        '- Đây là nghiên cứu holdout, chưa thay đổi production.',
        '',
        '| Biến thể | Trúng | Tỷ lệ | Số duy nhất TB | Đơn vị TB | Profit K | ROI | Chuỗi thua dài nhất |',
        '|---|---:|---:|---:|---:|---:|---:|---:|'
    ];
    for (const [id, value] of Object.entries(report.variants)) {
        const summary = value.summary;
        lines.push(`| ${id} | ${summary.hitDays}/${summary.days} | ${(summary.hitRate * 100).toFixed(2)}% | ${summary.averageUniqueCount.toFixed(2)} | ${summary.averageUnitCount.toFixed(2)} | ${summary.profitK.toLocaleString('en-US')} | ${(summary.roi * 100).toFixed(2)}% | ${summary.longestLoss} |`);
    }
    return `${lines.join('\n')}\n`;
}

function main() {
    const args = parseArgs();
    const source = path.resolve(args.get('source'));
    const payload = JSON.parse(fs.readFileSync(source, 'utf8'));
    const rows = payload.rows || [];
    if (!rows.length || rows.some(row => !row.rollingParallel)) {
        throw new Error('Báo cáo nguồn thiếu rollingParallel cho một hoặc nhiều ngày.');
    }
    const byVariant = {};
    for (const row of rows) {
        const variants = buildVariants({
            annualBlock: row.strategiesByTarget?.['85']?.chainBlockFirst,
            annualSmall: row.strategiesByTarget?.['65']?.chainSmallFirst,
            rollingBet: row.rollingParallel.betNumbers,
            rollingIntersection: row.rollingParallel.intersectionNumbers
        });
        for (const [id, weights] of Object.entries(variants)) {
            if (!byVariant[id]) byVariant[id] = [];
            byVariant[id].push({
                date: row.date,
                actual: row.actual,
                ...settleVariant(weights, row.actual, { stakePerUnitK: 1000, payoutMultiplier: 84 })
            });
        }
    }
    const variants = Object.fromEntries(Object.entries(byVariant).map(([id, values]) => [id, {
        summary: summarize(values),
        monthly: monthly(values),
        rows: values
    }]));
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'cross-baseline-strict-prefix-pit-v1',
        source,
        sourceFingerprint: payload.fingerprint,
        baselineCutoffDate: payload.baselineCutoffDate,
        startDate: rows[0].date,
        endDate: rows.at(-1).date,
        days: rows.length,
        economics: { stakePerUnitK: 1000, payoutMultiplier: 84 },
        variants
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputBase = path.join(process.cwd(), 'reports', `cross-baseline-parallel-${stamp}`);
    fs.writeFileSync(`${outputBase}.json`, JSON.stringify(report, null, 2));
    fs.writeFileSync(`${outputBase}.md`, markdown(report));
    console.log(JSON.stringify({
        json: `${outputBase}.json`,
        markdown: `${outputBase}.md`,
        summaries: Object.fromEntries(Object.entries(variants).map(([id, value]) => [id, value.summary]))
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
}
