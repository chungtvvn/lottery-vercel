#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    buildVariants,
    settleFlatStake,
    summarize
} = require('../lib/research/milestoneParallelDedup');

const STAKE_K = 1000;
const PAYOUT = 84;

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value || '1'];
    }));
    if (!args.get('report')) throw new Error('Cần --report=<strict PIT report>.');
    return { report: path.resolve(args.get('report')) };
}

function requireStrategy(row, strategy, target) {
    const values = row.strategiesByTarget?.[String(target)]?.[strategy];
    if (!Array.isArray(values)) {
        throw new Error(`Thiếu ${strategy} Hold ${target} tại ${row.date}.`);
    }
    return values.map(Number);
}

function compact(summary) {
    return {
        ...summary,
        hitRate: Number(summary.hitRate.toFixed(6)),
        roi: Number(summary.roi.toFixed(6)),
        averageBetCount: Number(summary.averageBetCount.toFixed(2))
    };
}

function group(rows, keyFn) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return Object.fromEntries([...groups.entries()].map(([key, values]) => [key, compact(summarize(values))]));
}

function pct(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function money(value) {
    return `${Math.round(value).toLocaleString('vi-VN')}K`;
}

function main() {
    const { report: reportPath } = parseArgs();
    const source = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (source.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
        throw new Error('Nguồn không phải strict-prefix-point-in-time-v1.');
    }
    const rows = (source.rows || []).slice().sort((left, right) => left.date.localeCompare(right.date));
    const resultRows = { block85: [], small65: [], unionDedup: [], exclusiveOnly: [] };
    const daily = [];

    for (const row of rows) {
        const variants = buildVariants(
            requireStrategy(row, 'chainBlockFirst', 85),
            requireStrategy(row, 'chainSmallFirst', 65)
        );
        const actual = Number(row.actual);
        const settled = {
            block85: settleFlatStake(variants.block, actual, { stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT }),
            small65: settleFlatStake(variants.small, actual, { stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT }),
            unionDedup: settleFlatStake(variants.unionDedup, actual, { stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT }),
            exclusiveOnly: settleFlatStake(variants.exclusiveOnly, actual, { stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT })
        };
        for (const [id, result] of Object.entries(settled)) {
            resultRows[id].push({ date: row.date, ...result });
        }
        daily.push({
            date: row.date,
            actual,
            blockCount: variants.block.length,
            smallCount: variants.small.length,
            unionCount: variants.unionDedup.length,
            overlapCount: variants.intersection.length,
            exclusiveCount: variants.exclusiveOnly.length,
            results: Object.fromEntries(Object.entries(settled).map(([id, result]) => [id, {
                hit: result.hit,
                profitK: result.profitK
            }]))
        });
    }
    const variants = Object.fromEntries(Object.entries(resultRows).map(([id, values]) => [id, {
        summary: compact(summarize(values)),
        byMonth: group(values, row => row.date.slice(0, 7)),
        byWeek: group(values, row => `${row.date.slice(0, 4)}-W${String(Math.ceil(Number(row.date.slice(8, 10)) / 7)).padStart(2, '0')}`)
    }]));
    const payload = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-prefix-point-in-time-v1',
        sourceReport: path.basename(reportPath),
        period: {
            startDate: rows[0]?.date || null,
            endDate: rows.at(-1)?.date || null,
            days: rows.length,
            baselineCutoffDate: source.options?.baselineCutoffDate || null
        },
        economics: { stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT },
        definition: {
            block85: 'Nhịp Block trước, loại 85 / đánh 15.',
            small65: 'Chuỗi nhỏ trước, loại 65 / đánh 35.',
            unionDedup: 'Hợp hai dàn, mỗi số chỉ một đơn vị; số giao không nhân tiền.',
            exclusiveOnly: 'Chỉ giữ số thuộc đúng một dàn; bỏ số giao.'
        },
        variants,
        daily
    };
    const suffix = new Date().toISOString().replace(/[:.]/g, '-');
    const dir = path.join(process.cwd(), 'reports');
    const jsonPath = path.join(dir, `strict-parallel-dedup-${suffix}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    const lines = [
        '# Strict PIT: gộp Đề Song Song Block 85 + Small 65',
        '',
        `- Nguồn: ${path.basename(reportPath)}.`,
        `- Kỳ: ${payload.period.startDate} đến ${payload.period.endDate}; ${payload.period.days} ngày.`,
        '- Mỗi ngày tái sinh thống kê từ raw prefix trước ngày dự đoán; baseline 20 năm khóa ở 31/12 năm trước.',
        '- Kinh tế: 1.000K/số, trúng x84. Hai biến thể gộp không nhân x2.',
        '',
        '| Biến thể | Trúng | Tỷ lệ | TB số | Profit | ROI | Thua dài nhất |',
        '|---|---:|---:|---:|---:|---:|---:|',
        ...Object.entries(variants).map(([id, value]) => {
            const summary = value.summary;
            return `| ${id} | ${summary.wins}/${summary.days} | ${pct(summary.hitRate)} | ${summary.averageBetCount} | ${money(summary.profitK)} | ${pct(summary.roi)} | ${summary.longestLoss} |`;
        }),
        '',
        'Kết quả này là kiểm chứng research-only. Không đổi Mốc 20 năm, snapshot đã phát hành hay phương pháp mặc định.'
    ];
    fs.writeFileSync(mdPath, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ jsonPath, mdPath, variants: Object.fromEntries(Object.entries(variants).map(([id, value]) => [id, value.summary])) }, null, 2));
}

main();
