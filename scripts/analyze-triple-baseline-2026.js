#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const STAKE_PER_UNIT_K = 1000;
const PAYOUT_MULTIPLIER = 84;

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number))]
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 99)
        .sort((a, b) => a - b);
}

function addMembership(weights, numbers, amount = 1) {
    for (const number of normalizeNumbers(numbers)) {
        weights.set(number, (weights.get(number) || 0) + amount);
    }
    return weights;
}

function flatWeights(numbers) {
    return new Map(normalizeNumbers(numbers).map(number => [number, 1]));
}

function methodSets(row) {
    const annualBlock = normalizeNumbers(row.strategiesByTarget?.['85']?.chainBlockFirst);
    const annualSmall = normalizeNumbers(row.strategiesByTarget?.['65']?.chainSmallFirst);
    const annual = normalizeNumbers([...annualBlock, ...annualSmall]);
    const history = normalizeNumbers(row.rollingParallel?.betNumbers);
    const edge = normalizeNumbers(row.rollingEdge75?.betNumbers);
    if (!annualBlock.length || !annualSmall.length || !history.length || !edge.length) {
        throw new Error(`Ngày ${row.date} thiếu một trong ba phương pháp.`);
    }
    return { annualBlock, annualSmall, annual, history, edge };
}

function buildVariants(row, maximumUnionCount) {
    const sets = methodSets(row);
    const union = normalizeNumbers([...sets.annual, ...sets.history, ...sets.edge]);
    const membership = new Map();
    addMembership(membership, sets.annual);
    addMembership(membership, sets.history);
    addMembership(membership, sets.edge);
    const underLimit = union.length < maximumUnionCount;

    const annualNative = new Map();
    addMembership(annualNative, sets.annualBlock);
    addMembership(annualNative, sets.annualSmall);
    const historyNative = flatWeights(sets.history);
    addMembership(historyNative, row.rollingParallel?.intersectionNumbers);

    return {
        annualParallelNative: annualNative,
        historyParallelNative: historyNative,
        edge75Flat: flatWeights(sets.edge),
        unionFlatUnder80: underLimit ? flatWeights(union) : null,
        unionX2OverlapUnder80: underLimit
            ? new Map([...membership].map(([number, count]) => [number, count >= 2 ? 2 : 1]))
            : null,
        exclusiveOnly: new Map([...membership].filter(([, count]) => count === 1).map(([number]) => [number, 1]))
    };
}

function settle(weights, actual, date) {
    if (!weights) {
        return {
            date,
            played: false,
            hit: false,
            uniqueCount: 0,
            unitCount: 0,
            actualWeight: 0,
            stakeK: 0,
            payoutK: 0,
            profitK: 0,
            numbers: []
        };
    }
    const entries = [...weights.entries()].sort((left, right) => left[0] - right[0]);
    const unitCount = entries.reduce((sum, [, weight]) => sum + weight, 0);
    const actualWeight = weights.get(Number(actual)) || 0;
    const stakeK = unitCount * STAKE_PER_UNIT_K;
    const payoutK = actualWeight * STAKE_PER_UNIT_K * PAYOUT_MULTIPLIER;
    return {
        date,
        played: true,
        hit: actualWeight > 0,
        uniqueCount: entries.length,
        unitCount,
        actualWeight,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        numbers: entries.map(([number]) => number)
    };
}

function summarize(rows) {
    const played = rows.filter(row => row.played);
    let longestWin = 0;
    let longestLoss = 0;
    let currentResult = null;
    let currentLength = 0;
    for (const row of played) {
        const result = row.profitK > 0 ? 'win' : 'loss';
        if (result === currentResult) currentLength++;
        else {
            currentResult = result;
            currentLength = 1;
        }
        if (result === 'win') longestWin = Math.max(longestWin, currentLength);
        else longestLoss = Math.max(longestLoss, currentLength);
    }
    const stakeK = played.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = played.reduce((sum, row) => sum + row.payoutK, 0);
    const profitK = payoutK - stakeK;
    return {
        eligibleDays: rows.length,
        playedDays: played.length,
        skippedDays: rows.length - played.length,
        hitDays: played.filter(row => row.hit).length,
        hitRate: played.length ? played.filter(row => row.hit).length / played.length : 0,
        profitableDays: played.filter(row => row.profitK > 0).length,
        averageUniqueCount: played.length
            ? played.reduce((sum, row) => sum + row.uniqueCount, 0) / played.length
            : 0,
        averageUnitCount: played.length
            ? played.reduce((sum, row) => sum + row.unitCount, 0) / played.length
            : 0,
        weightedHitUnits: played.reduce((sum, row) => sum + row.actualWeight, 0),
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin,
        longestLoss
    };
}

function groupRows(rows, keyFn) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return Object.fromEntries([...groups].map(([key, values]) => [key, summarize(values)]));
}

function isoWeek(dateText) {
    const date = new Date(`${dateText}T00:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function compact(summary) {
    return {
        ...summary,
        hitRate: Number(summary.hitRate.toFixed(6)),
        averageUniqueCount: Number(summary.averageUniqueCount.toFixed(2)),
        averageUnitCount: Number(summary.averageUnitCount.toFixed(2)),
        roi: Number(summary.roi.toFixed(6))
    };
}

function markdown(report) {
    const lines = [
        '# Strict PIT 2026: kết hợp ba phương pháp Đề',
        '',
        `- Kỳ kiểm tra: ${report.period.startDate} đến ${report.period.endDate}, ${report.period.days} ngày.`,
        '- Song song Mốc 20 năm: baseline khóa tại 31/12/2025.',
        '- Song song Lịch sử và Edge75: tái sinh từ raw prefix kết thúc ở D-1.',
        '- Kinh tế: 1.000K/đơn vị, trúng nhận x84.',
        '- Điều kiện `< 80` là số duy nhất trong hợp ba dàn; ngày không đạt được bỏ qua.',
        '',
        '| Biến thể | Chơi/Bỏ | Trúng | Tỷ lệ | TB số | TB đơn vị | Profit | ROI | Thua dài nhất |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|'
    ];
    for (const [id, value] of Object.entries(report.variants)) {
        const summary = value.summary;
        lines.push(
            `| ${id} | ${summary.playedDays}/${summary.skippedDays} | ` +
            `${summary.hitDays}/${summary.playedDays} | ${(summary.hitRate * 100).toFixed(2)}% | ` +
            `${summary.averageUniqueCount.toFixed(2)} | ${summary.averageUnitCount.toFixed(2)} | ` +
            `${Math.round(summary.profitK).toLocaleString('vi-VN')}K | ${(summary.roi * 100).toFixed(2)}% | ` +
            `${summary.longestLoss} |`
        );
    }
    return `${lines.join('\n')}\n`;
}

function main() {
    const args = parseArgs();
    const source = path.resolve(args.get('source'));
    const maximumUnionCount = Number(args.get('maximumUnionCount') || 80);
    const payload = JSON.parse(fs.readFileSync(source, 'utf8'));
    const sourceRows = (payload.rows || []).slice().sort((left, right) => left.date.localeCompare(right.date));
    if (!sourceRows.length) throw new Error('Nguồn không có rows.');
    const byVariant = {};
    for (const row of sourceRows) {
        const variants = buildVariants(row, maximumUnionCount);
        for (const [id, weights] of Object.entries(variants)) {
            if (!byVariant[id]) byVariant[id] = [];
            byVariant[id].push(settle(weights, row.actual, row.date));
        }
    }
    const variants = Object.fromEntries(Object.entries(byVariant).map(([id, rows]) => [id, {
        summary: compact(summarize(rows)),
        weekly: Object.fromEntries(Object.entries(groupRows(rows, row => isoWeek(row.date))).map(([key, value]) => [key, compact(value)])),
        monthly: Object.fromEntries(Object.entries(groupRows(rows, row => row.date.slice(0, 7))).map(([key, value]) => [key, compact(value)])),
        rows
    }]));
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'triple-baseline-strict-prefix-pit-v1',
        source,
        sourceFingerprint: payload.fingerprint,
        period: {
            startDate: sourceRows[0].date,
            endDate: sourceRows.at(-1).date,
            days: sourceRows.length
        },
        economics: {
            stakePerUnitK: STAKE_PER_UNIT_K,
            payoutMultiplier: PAYOUT_MULTIPLIER
        },
        maximumUnionCount,
        definitions: {
            annualParallelNative: 'Song song Mốc 20 năm, giữ x2 nội bộ giữa Block85 và Small65.',
            historyParallelNative: 'Song song Lịch sử D-1, giữ x2 nội bộ giữa Block85 và Small65.',
            edge75Flat: 'Edge75 Lịch sử D-1, mỗi số một đơn vị.',
            unionFlatUnder80: 'Hợp ba dàn, mỗi số một đơn vị; chỉ chơi khi tổng số duy nhất < 80.',
            unionX2OverlapUnder80: 'Hợp ba dàn; số có mặt trong ít nhất hai phương pháp đánh x2; chỉ chơi khi tổng số duy nhất < 80.',
            exclusiveOnly: 'Chỉ đánh số có mặt trong đúng một trong ba phương pháp.'
        },
        variants
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputBase = path.join(process.cwd(), 'reports', `triple-baseline-2026-${stamp}`);
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
