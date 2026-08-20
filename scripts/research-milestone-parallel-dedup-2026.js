#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');
const {
    buildVariants,
    settleFlatStake,
    summarize
} = require('../lib/research/milestoneParallelDedup');

const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, 'reports');
const STAKE_K = 1000;
const PAYOUT = 84;

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value || '1'];
    }));
    return {
        startDate: args.get('startDate') || '2026-01-01',
        endDate: args.get('endDate') || null,
        historyYears: Number(args.get('historyYears') || 20)
    };
}

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function statsEntries() {
    const entries = new Map();
    const allStats = historicalExclusionService.loadAllStats();
    for (const [key, value] of Object.entries(allStats || {})) {
        if (isInvalidStatsKey(key)) continue;
        if (Array.isArray(value?.streaks)) {
            entries.set(key, value);
            continue;
        }
        if (!value || typeof value !== 'object') continue;
        for (const [subKey, subValue] of Object.entries(value)) {
            if (Array.isArray(subValue?.streaks) && !isInvalidStatsKey(`${key}:${subKey}`)) {
                entries.set(`${key}:${subKey}`, subValue);
            }
        }
    }
    return entries;
}

function groupBy(rows, keyFn) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return Object.fromEntries([...groups.entries()].map(([key, values]) => [key, compact(summarize(values))]));
}

function compact(summary) {
    return {
        ...summary,
        hitRate: Number(summary.hitRate.toFixed(6)),
        roi: Number(summary.roi.toFixed(6)),
        averageBetCount: Number(summary.averageBetCount.toFixed(2))
    };
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function money(value) {
    return `${Math.round(value).toLocaleString('vi-VN')}K`;
}

async function main() {
    const options = parseArgs();
    await lotteryService.loadRawData();
    await lotteryService.loadStats();
    const raw = (lotteryService.getRawData() || [])
        .filter(row => row?.date && row.special !== null && row.special !== undefined)
        .slice()
        .sort((left, right) => isoDate(left.date).localeCompare(isoDate(right.date)));
    const endDate = options.endDate || isoDate(raw.at(-1)?.date);
    const rows = raw.filter(row => isoDate(row.date) >= options.startDate && isoDate(row.date) <= endDate);
    if (!rows.length) throw new Error(`Không có dữ liệu trong khoảng ${options.startDate} -> ${endDate}.`);

    const entries = statsEntries();
    const baselines = new Map();
    const byVariant = {
        block85: [],
        small65: [],
        unionDedup: [],
        exclusiveOnly: []
    };
    const daily = [];

    for (const [index, row] of rows.entries()) {
        const date = isoDate(row.date);
        const year = Number(date.slice(0, 4));
        if (!baselines.has(year)) {
            baselines.set(year, annualMilestoneService.buildAnnualBaseline(entries, year, {
                historyYears: options.historyYears
            }));
        }
        const bundle = annualMilestoneService.buildPredictionBundleForDate(date, {
            entries,
            baseline: baselines.get(year),
            historyYears: options.historyYears,
            targets: [65, 85],
            strategies: ['chainBlockFirst', 'chainSmallFirst']
        });
        const block = bundle.strategies.chainBlockFirst.holds['85'].betNumbers.map(Number);
        const small = bundle.strategies.chainSmallFirst.holds['65'].betNumbers.map(Number);
        const variants = buildVariants(block, small);
        const actual = Number(row.special);
        const settled = {
            block85: settleFlatStake(variants.block, actual, { stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT }),
            small65: settleFlatStake(variants.small, actual, { stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT }),
            unionDedup: settleFlatStake(variants.unionDedup, actual, { stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT }),
            exclusiveOnly: settleFlatStake(variants.exclusiveOnly, actual, { stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT })
        };
        for (const [id, result] of Object.entries(settled)) {
            byVariant[id].push({ date, ...result });
        }
        daily.push({
            date,
            actual,
            blockCount: variants.block.length,
            smallCount: variants.small.length,
            unionCount: variants.unionDedup.length,
            overlapCount: variants.intersection.length,
            exclusiveCount: variants.exclusiveOnly.length,
            results: Object.fromEntries(Object.entries(settled).map(([id, value]) => [id, {
                hit: value.hit,
                profitK: value.profitK
            }]))
        });
        if ((index + 1) % 25 === 0 || index + 1 === rows.length) {
            console.log(`[Moc20y Dedup] ${index + 1}/${rows.length}: ${date}`);
        }
    }

    const variants = Object.fromEntries(Object.entries(byVariant).map(([id, results]) => [id, {
        summary: compact(summarize(results)),
        byMonth: groupBy(results, row => row.date.slice(0, 7)),
        byWeek: groupBy(results, row => `${row.date.slice(0, 4)}-W${String(Math.ceil(Number(row.date.slice(8, 10)) / 7)).padStart(2, '0')}`)
    }]));
    const output = {
        generatedAt: new Date().toISOString(),
        methodology: 'annual-20y-baseline-fixed-prior-dec31-v1',
        pointInTime: {
            annualBaseline: 'Mỗi năm khóa 20 năm lịch sử tại 31/12 năm trước.',
            dailyChains: 'Mỗi ngày dùng trạng thái chuỗi tới hết ngày trước ngày dự đoán.',
            actualNotUsedInPrediction: true
        },
        economics: { stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT },
        period: { startDate: options.startDate, endDate, days: rows.length },
        definition: {
            block85: 'Nhịp Block trước, loại 85 / đánh 15.',
            small65: 'Chuỗi nhỏ trước, loại 65 / đánh 35.',
            unionDedup: 'Hợp hai dàn, mỗi số chỉ một đơn vị; số giao không nhân tiền.',
            exclusiveOnly: 'Chỉ giữ số thuộc đúng một trong hai dàn, loại toàn bộ số giao.'
        },
        variants,
        daily
    };
    const suffix = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(REPORTS, `milestone-parallel-dedup-2026-${suffix}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
    const lines = [
        '# Kiểm chứng Đề Song Song Mốc 20 năm: gộp hai dàn',
        '',
        `- Kỳ: ${options.startDate} đến ${endDate}, ${rows.length} ngày.`,
        '- Mốc 20 năm được khóa ở 31/12 của năm trước; trạng thái chuỗi được lấy đến trước ngày dự đoán.',
        '- Kinh tế: 1.000K/số, trúng x84. Không nhân x2 trong hai biến thể được yêu cầu.',
        '',
        '| Biến thể | Trúng | Tỷ lệ | TB số đánh | Profit | ROI | Thua dài nhất |',
        '|---|---:|---:|---:|---:|---:|---:|',
        ...Object.entries(variants).map(([id, value]) => {
            const summary = value.summary;
            return `| ${id} | ${summary.wins}/${summary.days} | ${formatPercent(summary.hitRate)} | ${summary.averageBetCount} | ${money(summary.profitK)} | ${formatPercent(summary.roi)} | ${summary.longestLoss} |`;
        }),
        '',
        '## Cách đọc',
        '',
        '- `unionDedup` là cách hiểu “hợp hai phương pháp, số trùng chỉ đánh một lần”.',
        '- `exclusiveOnly` là cách hiểu chặt hơn: chỉ đánh các số không trùng, bỏ toàn bộ số giao; dàn sẽ nhỏ hơn nhưng rủi ro bỏ sót cao hơn.',
        '- Báo cáo chỉ phục vụ kiểm chứng; không thay chiến lược mặc định hoặc các snapshot đã phát hành.'
    ];
    fs.writeFileSync(mdPath, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ jsonPath, mdPath, variants: Object.fromEntries(Object.entries(variants).map(([id, value]) => [id, value.summary])) }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
