#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const STAKE_PER_UNIT_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const TARGET = '70';

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value ?? '1'];
    }));
}

function readReport(file) {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
        throw new Error(`${file} is not strict-prefix-point-in-time-v1.`);
    }
    if (!Array.isArray(report.rows) || report.rows.length === 0) {
        throw new Error(`${file} has no rows.`);
    }
    for (const row of report.rows) {
        const methods = row.strategiesByTarget?.[TARGET];
        if (!Array.isArray(methods?.dedupEdge75Hold) || !Array.isArray(methods?.chainSmallFirst)) {
            throw new Error(`${file} is missing Edge75/Small on ${row.date}.`);
        }
    }
    return report;
}

function setsForRow(row) {
    const methods = row.strategiesByTarget[TARGET];
    const edge = new Set(methods.dedupEdge75Hold.map(Number));
    const small = new Set(methods.chainSmallFirst.map(Number));
    const intersection = new Set([...edge].filter(number => small.has(number)));
    const union = new Set([...edge, ...small]);
    return { edge, small, intersection, union };
}

function buildPrediction(row, type) {
    const sets = setsForRow(row);
    if (type === 'edge') return { bet: sets.edge, x2: new Set(), sets };
    if (type === 'small') return { bet: sets.small, x2: new Set(), sets };
    if (type === 'intersection') return { bet: sets.intersection, x2: new Set(), sets };
    if (type === 'union-x1') return { bet: sets.union, x2: new Set(), sets };
    if (type === 'union-x2') return { bet: sets.union, x2: sets.intersection, sets };
    throw new Error(`Unknown type ${type}.`);
}

function settle(row, type) {
    const prediction = buildPrediction(row, type);
    const actual = Number(row.actual);
    const hit = prediction.bet.has(actual);
    const hitIntersection = prediction.sets.intersection.has(actual);
    const unitCount = prediction.bet.size + prediction.x2.size;
    const weight = prediction.x2.has(actual) ? 2 : 1;
    const stakeK = unitCount * STAKE_PER_UNIT_K;
    const payoutK = hit ? weight * STAKE_PER_UNIT_K * PAYOUT_MULTIPLIER : 0;
    return {
        date: row.date,
        actual,
        hit,
        hitIntersection,
        betCount: prediction.bet.size,
        intersectionCount: prediction.sets.intersection.size,
        unitCount,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK
    };
}

function longest(rows, predicate) {
    let result = 0;
    let current = 0;
    for (const row of rows) {
        current = predicate(row) ? current + 1 : 0;
        result = Math.max(result, current);
    }
    return result;
}

function summarize(rows) {
    const days = rows.length;
    const wins = rows.filter(row => row.hit).length;
    const intersectionHits = rows.filter(row => row.hitIntersection).length;
    const sum = key => rows.reduce((total, row) => total + row[key], 0);
    const stakeK = sum('stakeK');
    const payoutK = sum('payoutK');
    const profitK = payoutK - stakeK;
    return {
        days,
        wins,
        losses: days - wins,
        hitRate: days ? wins / days : 0,
        intersectionHits,
        intersectionHitRate: days ? intersectionHits / days : 0,
        intersectionShareOfHits: wins ? intersectionHits / wins : 0,
        averageBetCount: days ? sum('betCount') / days : 0,
        averageIntersectionCount: days ? sum('intersectionCount') / days : 0,
        averageUnitCount: days ? sum('unitCount') / days : 0,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin: longest(rows, row => row.hit),
        longestLoss: longest(rows, row => !row.hit)
    };
}

function compact(summary) {
    const result = { ...summary };
    for (const key of ['hitRate', 'intersectionHitRate', 'intersectionShareOfHits', 'roi']) {
        result[key] = Number(result[key].toFixed(6));
    }
    for (const key of ['averageBetCount', 'averageIntersectionCount', 'averageUnitCount']) {
        result[key] = Number(result[key].toFixed(2));
    }
    return result;
}

function evaluate(report, type) {
    const rows = report.rows.map(row => settle(row, type));
    const months = new Map();
    for (const row of rows) {
        const key = row.date.slice(0, 7);
        if (!months.has(key)) months.set(key, []);
        months.get(key).push(row);
    }
    return {
        type,
        summary: compact(summarize(rows)),
        byMonth: Object.fromEntries([...months].map(([key, values]) => [key, compact(summarize(values))]))
    };
}

function pct(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function money(value) {
    return `${Math.round(value).toLocaleString('vi-VN')}K`;
}

function line(label, evaluation) {
    const value = evaluation.summary;
    return `| ${label} | ${value.wins}/${value.days} (${pct(value.hitRate)}) | ${value.intersectionHits} (${pct(value.intersectionHitRate)}) | ${value.averageBetCount} | ${value.averageIntersectionCount} | ${value.averageUnitCount} | ${money(value.profitK)} | ${pct(value.roi)} | ${value.longestLoss} |`;
}

function main() {
    const args = parseArgs();
    const trainFile = path.resolve(args.get('train'));
    const testFile = path.resolve(args.get('test'));
    const train = readReport(trainFile);
    const test = readReport(testFile);
    const types = ['edge', 'small', 'intersection', 'union-x1', 'union-x2'];
    const trainResults = Object.fromEntries(types.map(type => [type, evaluate(train, type)]));
    const frozenTestResults = Object.fromEntries(types.map(type => [type, evaluate(test, type)]));
    const result = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-prefix-point-in-time-v1',
        definition: 'Edge75 Hold70 UNION ChainSmallFirst Hold70; intersection receives x2 only in union-x2.',
        economics: { stakePerUnitK: STAKE_PER_UNIT_K, payoutMultiplier: PAYOUT_MULTIPLIER },
        sources: {
            train: { file: trainFile, baselineCutoffDate: train.baselineCutoffDate, days: train.rows.length },
            frozenTest: { file: testFile, baselineCutoffDate: test.baselineCutoffDate, days: test.rows.length }
        },
        train: trainResults,
        frozenTest: frozenTestResults
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(process.cwd(), 'reports', `parallel-edge75-small-${timestamp}`);
    fs.writeFileSync(`${base}.json`, JSON.stringify(result, null, 2));
    const labels = {
        edge: 'Edge75 Hold70 rieng',
        small: 'ChainSmallFirst Hold70 rieng',
        intersection: 'Chi danh phan giao',
        'union-x1': 'Song song hop dan x1',
        'union-x2': 'Song song hop dan, giao x2'
    };
    const markdown = [
        '# Edge khu trung 75% + ChainSmallFirst',
        '',
        `- Train: ${train.rows[0].date} -> ${train.rows.at(-1).date}.`,
        `- Frozen holdout: ${test.rows[0].date} -> ${test.rows.at(-1).date}.`,
        `- Kinh te: ${STAKE_PER_UNIT_K}K/don vi, trung an ${PAYOUT_MULTIPLIER}.`,
        '',
        '| Phuong an | Trung | KQ thuoc giao | TB so danh | TB so giao | TB don vi | Profit | ROI | Thua dai nhat |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...types.flatMap(type => [
            line(`${labels[type]} - train`, trainResults[type]),
            line(`${labels[type]} - holdout`, frozenTestResults[type])
        ])
    ].join('\n');
    fs.writeFileSync(`${base}.md`, `${markdown}\n`);
    console.log(JSON.stringify({ json: `${base}.json`, markdown: `${base}.md` }, null, 2));
}

main();
