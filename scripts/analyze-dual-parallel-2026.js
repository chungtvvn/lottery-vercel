#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number))]
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
        .sort((left, right) => left - right);
}

function addWeights(target, numbers, weight = 1) {
    for (const number of normalizeNumbers(numbers)) {
        target.set(number, (target.get(number) || 0) + weight);
    }
    return target;
}

function annualParallel(row) {
    const block = normalizeNumbers(row.strategiesByTarget?.['85']?.chainBlockFirst);
    const small = normalizeNumbers(row.strategiesByTarget?.['65']?.chainSmallFirst);
    if (block.length !== 15 || small.length !== 35) {
        throw new Error(`${row.date}: dàn Mốc 20 năm không đúng Hold 85/65.`);
    }
    const weights = new Map();
    addWeights(weights, block);
    addWeights(weights, small);
    return weights;
}

function historyParallel(row) {
    const betNumbers = normalizeNumbers(row.rollingParallel?.betNumbers);
    const intersection = normalizeNumbers(row.rollingParallel?.intersectionNumbers);
    if (betNumbers.length < 35 || betNumbers.length > 50 || betNumbers.length + intersection.length !== 50) {
        throw new Error(`${row.date}: dàn Song song Lịch sử không đủ đúng 50 đơn vị.`);
    }
    const weights = new Map();
    addWeights(weights, betNumbers);
    addWeights(weights, intersection);
    return weights;
}

function flatUnion(first, second) {
    return new Map(normalizeNumbers([...first.keys(), ...second.keys()]).map(number => [number, 1]));
}

function crossMethodX2(first, second) {
    const firstNumbers = new Set(first.keys());
    const secondNumbers = new Set(second.keys());
    const union = normalizeNumbers([...firstNumbers, ...secondNumbers]);
    return new Map(union.map(number => [
        number,
        firstNumbers.has(number) && secondNumbers.has(number) ? 2 : 1
    ]));
}

function nativeSum(first, second) {
    const result = new Map();
    for (const [number, weight] of first) result.set(number, weight);
    for (const [number, weight] of second) result.set(number, (result.get(number) || 0) + weight);
    return result;
}

function settle(date, actual, weights, stakePerUnitK, payoutMultiplier) {
    const unitCount = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
    const actualWeight = weights.get(Number(actual)) || 0;
    const stakeK = unitCount * stakePerUnitK;
    const payoutK = actualWeight * stakePerUnitK * payoutMultiplier;
    return {
        date,
        actual: Number(actual),
        numbers: [...weights.keys()].sort((left, right) => left - right),
        uniqueCount: weights.size,
        unitCount,
        actualWeight,
        hit: actualWeight > 0,
        profitable: payoutK > stakeK,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK
    };
}

function longest(rows, predicate) {
    let current = 0;
    let maximum = 0;
    for (const row of rows) {
        current = predicate(row) ? current + 1 : 0;
        maximum = Math.max(maximum, current);
    }
    return maximum;
}

function summarize(rows) {
    const stakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = rows.reduce((sum, row) => sum + row.payoutK, 0);
    const hitDays = rows.filter(row => row.hit).length;
    const profitableDays = rows.filter(row => row.profitable).length;
    return {
        days: rows.length,
        hitDays,
        hitRate: rows.length ? hitDays / rows.length : 0,
        profitableDays,
        averageUniqueCount: rows.length
            ? rows.reduce((sum, row) => sum + row.uniqueCount, 0) / rows.length
            : 0,
        averageUnitCount: rows.length
            ? rows.reduce((sum, row) => sum + row.unitCount, 0) / rows.length
            : 0,
        weightedHitUnits: rows.reduce((sum, row) => sum + row.actualWeight, 0),
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestHit: longest(rows, row => row.hit),
        longestMiss: longest(rows, row => !row.hit),
        longestProfit: longest(rows, row => row.profitable),
        longestLoss: longest(rows, row => !row.profitable)
    };
}

function group(rows, keyForRow) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyForRow(row);
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

function main() {
    const args = parseArgs();
    const source = path.resolve(args.get('source'));
    const stakePerUnitK = Number(args.get('stakePerUnitK') || 1000);
    const payoutMultiplier = Number(args.get('payoutMultiplier') || 84);
    const payload = JSON.parse(fs.readFileSync(source, 'utf8'));
    const sourceRows = (payload.rows || []).slice().sort((left, right) => left.date.localeCompare(right.date));
    if (!sourceRows.length) throw new Error('Nguồn strict PIT không có ngày nào.');

    const variants = {
        annualParallelNative: [],
        historyParallelNative: [],
        unionFlat: [],
        unionX2CrossMethod: [],
        unionNativeStakeSum: []
    };
    for (const row of sourceRows) {
        const annual = annualParallel(row);
        const history = historyParallel(row);
        const weightsByVariant = {
            annualParallelNative: annual,
            historyParallelNative: history,
            unionFlat: flatUnion(annual, history),
            unionX2CrossMethod: crossMethodX2(annual, history),
            unionNativeStakeSum: nativeSum(annual, history)
        };
        for (const [id, weights] of Object.entries(weightsByVariant)) {
            variants[id].push(settle(
                row.date,
                row.actual,
                weights,
                stakePerUnitK,
                payoutMultiplier
            ));
        }
    }

    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'dual-parallel-strict-prefix-pit-v1',
        source,
        sourceFingerprint: payload.fingerprint,
        period: {
            startDate: sourceRows[0].date,
            endDate: sourceRows.at(-1).date,
            days: sourceRows.length
        },
        economics: { stakePerUnitK, payoutMultiplier },
        definitions: {
            annualParallelNative: 'Song song Mốc 20 năm: Block Hold85 + Small Hold65; giữ x2 giao nội bộ.',
            historyParallelNative: 'Song song Lịch sử D-1: Block Hold85 + Small Hold65; giữ x2 giao nội bộ.',
            unionFlat: 'Gộp hai dàn; mỗi số duy nhất đánh một đơn vị.',
            unionX2CrossMethod: 'Gộp hai dàn; số xuất hiện trong cả hai phương pháp đánh x2.',
            unionNativeStakeSum: 'Cộng nguyên mức cược native của cả hai phương pháp; trọng số một số có thể từ x1 đến x4.'
        },
        variants: Object.fromEntries(Object.entries(variants).map(([id, rows]) => [id, {
            summary: summarize(rows),
            weekly: group(rows, row => isoWeek(row.date)),
            monthly: group(rows, row => row.date.slice(0, 7)),
            rows
        }]))
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const output = path.join(process.cwd(), 'reports', `dual-parallel-2026-${stamp}.json`);
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        output,
        summaries: Object.fromEntries(Object.entries(report.variants).map(([id, value]) => [id, value.summary]))
    }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
}
