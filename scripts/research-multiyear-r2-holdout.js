#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const simulationService = require('../lib/services/simulationService');
const { wilsonInterval } = require('../lib/research/multiyearProfitGuard');

const ROOT = path.join(__dirname, '..');
const METHOD_ID = 'deParallelBlock85Small65Hold70';
const UNIT_STAKE_K = 1000;

function parseArgs() {
    return new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value || '1'];
    }));
}

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function settle(rows, kind, payoutMultiplier) {
    let units = 0;
    let payoutUnits = 0;
    let hitDays = 0;
    for (const row of rows) {
        if (kind === 'overlapOnly') {
            units += row.intersectionCount;
            payoutUnits += row.overlapHit ? 1 : 0;
            hitDays += row.overlapHit ? 1 : 0;
        } else if (kind === 'uniqueOnly') {
            units += row.uniqueOnlyCount;
            payoutUnits += row.uniqueOnlyHit ? 1 : 0;
            hitDays += row.uniqueOnlyHit ? 1 : 0;
        } else if (kind === 'unionSingle') {
            units += row.unionCount;
            payoutUnits += row.unionHit ? 1 : 0;
            hitDays += row.unionHit ? 1 : 0;
        } else if (kind === 'parallelX2') {
            units += row.unionCount + row.intersectionCount;
            payoutUnits += row.uniqueOnlyHit ? 1 : (row.overlapHit ? 2 : 0);
            hitDays += row.unionHit ? 1 : 0;
        } else {
            throw new Error(`Phương án không hỗ trợ: ${kind}`);
        }
    }
    const stakeK = units * UNIT_STAKE_K;
    const payoutK = payoutUnits * payoutMultiplier * UNIT_STAKE_K;
    const averageBetCount = rows.length ? units / rows.length : 0;
    const coverage = averageBetCount / 100;
    const interval = wilsonInterval(hitDays, rows.length);
    return {
        kind,
        payoutMultiplier,
        days: rows.length,
        hitDays,
        hitRate: rows.length ? hitDays / rows.length : 0,
        averageBetCount,
        coverage,
        liftVsCoverage: coverage ? (hitDays / rows.length) / coverage : 0,
        wilson95: interval,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0
    };
}

function markdown(report) {
    const percent = value => `${(Number(value || 0) * 100).toFixed(2)}%`;
    const money = value => `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}K`;
    const lines = [
        '# Holdout R2 strict point-in-time',
        '',
        `- Khoảng kiểm tra: ${report.startDate} -> ${report.endDate} (${report.rows.length} ngày).`,
        '- Mỗi ngày chỉ dùng dữ liệu đến D-1; đây là kiểm tra sau báo cáo đa năm, không được gộp thành dữ liệu train.',
        '- Mẫu ngắn chỉ dùng phát hiện drift; không đủ để kết luận thay production.',
        '',
        '| Phương án | Ăn | Hit | Số/ngày | Profit | ROI | Wilson lower |',
        '|---|---:|---:|---:|---:|---:|---:|'
    ];
    for (const row of report.strategies) {
        lines.push(
            `| ${row.kind} | ${row.payoutMultiplier} | ${row.hitDays}/${row.days} (${percent(row.hitRate)}) | ` +
            `${row.averageBetCount.toFixed(2)} | ${money(row.profitK)} | ${percent(row.roi)} | ${percent(row.wilson95.lower)} |`
        );
    }
    lines.push('', '## Theo ngày', '', '| Ngày | KQ | Hợp | Giao | Trúng hợp | Trúng giao |', '|---|---:|---:|---:|---:|---:|');
    for (const row of report.rows) {
        lines.push(`| ${row.date} | ${String(row.actualNumber).padStart(2, '0')} | ${row.unionCount} | ${row.intersectionCount} | ${row.unionHit ? 'Có' : 'Không'} | ${row.overlapHit ? 'Có' : 'Không'} |`);
    }
    return `${lines.join('\n')}\n`;
}

async function main() {
    const args = parseArgs();
    const startDate = args.get('startDate') || '2026-07-10';
    await lotteryService.loadRawData();
    const raw = (lotteryService.getRawData() || [])
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const endDate = args.get('endDate') || isoDate(raw.at(-1)?.date);
    const startIndex = raw.findIndex(row => isoDate(row.date) >= startDate);
    const afterEnd = raw.findIndex(row => isoDate(row.date) > endDate);
    const endIndexExclusive = afterEnd < 0 ? raw.length : afterEnd;
    if (startIndex < 1 || endIndexExclusive <= startIndex) {
        throw new Error(`Khoảng holdout không hợp lệ: ${startDate} -> ${endDate}`);
    }

    const result = await simulationService.runBacktest(endIndexExclusive - startIndex, raw, {
        startIndex,
        endIndexExclusive,
        strictPointInTime: true,
        methodIds: METHOD_ID,
        playMode: 'bet',
        betWinMultiplier: 84,
        betWinFactor: 1,
        compactDetails: true,
        selectedStreakDetailLimit: 0,
        clearHistoryCacheInterval: 25,
        progress: true
    });
    if (result.config?.pointInTime?.strict !== true) {
        throw new Error('Backtest holdout không được đánh dấu strict PIT.');
    }

    const rows = (result.details || []).map(detail => {
        const method = detail.methods?.[METHOD_ID];
        if (!method || method.skipped) return null;
        const union = new Set(method.betNumbers || []);
        const intersection = new Set(method.intersectionNumbers || []);
        const actualNumber = Number(detail.actualNumber);
        const overlapHit = intersection.has(actualNumber);
        const unionHit = union.has(actualNumber);
        return {
            date: isoDate(detail.predictionIsoDate || detail.predictionDate),
            actualNumber,
            unionCount: union.size,
            intersectionCount: intersection.size,
            uniqueOnlyCount: union.size - intersection.size,
            unionHit,
            overlapHit,
            uniqueOnlyHit: unionHit && !overlapHit
        };
    }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

    const strategies = [];
    for (const payoutMultiplier of [70, 84]) {
        for (const kind of ['overlapOnly', 'uniqueOnly', 'unionSingle', 'parallelX2']) {
            strategies.push(settle(rows, kind, payoutMultiplier));
        }
    }
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'multiyear-r2-holdout-v1',
        strictPointInTime: true,
        source: 'Cloudflare R2 via lotteryService',
        startDate,
        endDate,
        methodId: METHOD_ID,
        methodVersion: result.config?.methodVersion || null,
        rows,
        strategies
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(ROOT, 'reports', `multiyear-r2-holdout-${stamp}`);
    fs.writeFileSync(`${base}.json`, JSON.stringify(report, null, 2));
    fs.writeFileSync(`${base}.md`, markdown(report));
    console.log(JSON.stringify({ json: `${base}.json`, markdown: `${base}.md`, endDate, strategies }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
