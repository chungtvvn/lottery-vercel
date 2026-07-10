#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const dataAccess = require('../lib/data-access');

const STAKE_K = 2200;
const PAYOUT_K = 8000;
const TOP_COUNTS = [6, 7, 8, 9, 10, 12, 14, 16, 18, 20];
const POSITION_KEYS = [
    'special', 'prize1', 'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3', 'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];

function parseArgs() {
    return new Map(process.argv.slice(2).map(value => {
        const [key, ...rest] = value.replace(/^--/, '').split('=');
        return [key, rest.join('=') || '1'];
    }));
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function rankFusion(left = [], right = [], leftWeight = 0.5, agreementBonus = 0) {
    const rows = new Map();
    for (const [values, weight] of [[left, leftWeight], [right, 1 - leftWeight]]) {
        values.forEach((value, index) => {
            const number = Number(value);
            if (!Number.isInteger(number)) return;
            const row = rows.get(number) || { number, score: 0, votes: 0, bestRank: Infinity };
            row.score += weight / (5 + index + 1);
            row.votes += 1;
            row.bestRank = Math.min(row.bestRank, index + 1);
            rows.set(number, row);
        });
    }
    return Array.from(rows.values())
        .map(row => ({ ...row, score: row.score + agreementBonus * Math.max(0, row.votes - 1) }))
        .sort((a, b) => b.score - a.score || b.votes - a.votes || a.bestRank - b.bestRank || a.number - b.number)
        .map(row => row.number);
}

function summarize(rows) {
    let hitDays = 0;
    let atLeast2Days = 0;
    let totalHits = 0;
    let stakeK = 0;
    let payoutK = 0;
    let winDays = 0;
    let lossDays = 0;
    let currentWin = 0;
    let currentLoss = 0;
    let longestWin = 0;
    let longestLoss = 0;

    for (const row of rows) {
        const hits = Number(row.hits || 0);
        const dayStake = Number(row.stakeK || 0);
        const dayPayout = Number(row.payoutK ?? hits * PAYOUT_K);
        const profit = dayPayout - dayStake;
        hitDays += hits > 0 ? 1 : 0;
        atLeast2Days += hits >= 2 ? 1 : 0;
        totalHits += hits;
        stakeK += dayStake;
        payoutK += dayPayout;
        if (profit > 0) {
            winDays += 1;
            currentWin += 1;
            currentLoss = 0;
            longestWin = Math.max(longestWin, currentWin);
        } else if (profit < 0) {
            lossDays += 1;
            currentLoss += 1;
            currentWin = 0;
            longestLoss = Math.max(longestLoss, currentLoss);
        } else {
            currentWin = 0;
            currentLoss = 0;
        }
    }

    return {
        days: rows.length,
        hitDays,
        hitRate: rows.length ? hitDays / rows.length : 0,
        atLeast2Days,
        atLeast2Rate: rows.length ? atLeast2Days / rows.length : 0,
        totalHits,
        avgHitsPerDay: rows.length ? totalHits / rows.length : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        winDays,
        lossDays,
        longestWin,
        longestLoss
    };
}

function groupRows(rows, keyFn) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyFn(row.date);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return Object.fromEntries(Array.from(groups.entries()).map(([key, values]) => [key, summarize(values)]));
}

function toActualCounts(rawData) {
    const actual = new Map();
    for (const row of rawData) {
        const counts = {};
        for (const key of POSITION_KEYS) {
            const value = Number(row[key]);
            if (!Number.isInteger(value)) continue;
            const number = String(value).padStart(2, '0');
            counts[number] = (counts[number] || 0) + 1;
        }
        actual.set(row.date, counts);
    }
    return actual;
}

function makeRowsFromSnapshot(snapshot, methodId, topCount, actualCounts) {
    return snapshot.dailyDetailsByWindow.dateRange
        .filter(row => row.methodId === methodId && row.betCount === topCount)
        .map(row => ({
            date: row.date,
            hits: row.hits,
            stakeK: row.stakeK,
            payoutK: row.payoutK
        }));
}

function makeCurrentRrfRows(snapshot, smallMethodId, blockMethodId, topCount, weight, agreementBonus, actualCounts) {
    const byDate = new Map();
    for (const row of snapshot.dailyDetailsByWindow.dateRange.filter(item => item.betCount === 20)) {
        if (!byDate.has(row.date)) byDate.set(row.date, {});
        byDate.get(row.date)[row.methodId] = row;
    }
    return Array.from(byDate.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([date, methods]) => {
        const numbers = rankFusion(
            methods[smallMethodId]?.numbers || [],
            methods[blockMethodId]?.numbers || [],
            weight,
            agreementBonus
        ).slice(0, topCount);
        const counts = actualCounts.get(date) || {};
        const hits = numbers.reduce((sum, number) => sum + (counts[String(number).padStart(2, '0')] || 0), 0);
        return { date, hits, stakeK: topCount * STAKE_K, payoutK: hits * PAYOUT_K };
    });
}

function csvEscape(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
    const args = parseArgs();
    const historicalFile = args.get('historicalReport') || 'reports/backtest_loto_milestone20y_2026-07-05T07-33-44.json';
    const currentFile = args.get('currentReport') || 'reports/backtest_loto_milestone20y_2026-07-10T07-00-09.json';
    const outputDir = path.resolve(args.get('output') || 'outputs/loto-effectiveness-2026-07-10');
    const [rawData, historical, current] = await Promise.all([
        dataAccess.getRawData(),
        readJson(historicalFile),
        readJson(currentFile)
    ]);
    const actualCounts = toActualCounts(rawData);
    const historicalRows = [];
    const currentRows = [];

    for (const topCount of TOP_COUNTS) {
        const methodId = 'chainSmallFirstHold65:twoHitGreedy';
        const rows = makeRowsFromSnapshot(historical, `${methodId}:top${topCount}`, topCount, actualCounts);
        historicalRows.push({
            scope: '2016-01-01_to_2026-07-04',
            method: methodId,
            top: topCount,
            ...summarize(rows),
            yearly: groupRows(rows, date => date.slice(0, 4))
        });
    }

    const currentSources = [
        ['chainSmallFirstHold65:twoHitGreedy', 'chainSmallFirstHold65:twoHitGreedy:top20'],
        ['chainBlockFirstHold75:positionPosterior', 'chainBlockFirstHold75:positionPosterior:top20'],
        ['parallelCombinedHold65:twoHitGreedy', 'parallelCombinedHold65:twoHitGreedy:top20']
    ];
    for (const topCount of TOP_COUNTS) {
        for (const [label, methodId] of currentSources) {
            const rows = makeRowsFromSnapshot(current, methodId, 20, actualCounts).map(row => ({
                ...row,
                stakeK: topCount * STAKE_K,
                payoutK: row.hits * PAYOUT_K
            }));
            const sourceRows = current.dailyDetailsByWindow.dateRange
                .filter(row => row.methodId === methodId && row.betCount === 20)
                .map(row => ({ ...row, numbers: row.numbers.slice(0, topCount) }));
            const corrected = sourceRows.map(row => {
                const counts = actualCounts.get(row.date) || {};
                const hits = row.numbers.reduce((sum, number) => sum + (counts[String(number).padStart(2, '0')] || 0), 0);
                return { date: row.date, hits, stakeK: topCount * STAKE_K, payoutK: hits * PAYOUT_K };
            });
            currentRows.push({
                scope: '2026-01-01_to_2026-07-09',
                method: label,
                top: topCount,
                ...summarize(corrected),
                monthly: groupRows(corrected, date => date.slice(0, 7))
            });
        }
        for (const [weight, agreementBonus] of [[0.35, 0], [0.5, 0], [0.65, 0], [0.5, 0.01], [0.5, 0.03]]) {
            const rows = makeCurrentRrfRows(
                current,
                'chainSmallFirstHold65:twoHitGreedy:top20',
                'chainBlockFirstHold75:positionPosterior:top20',
                topCount,
                weight,
                agreementBonus,
                actualCounts
            );
            currentRows.push({
                scope: '2026-01-01_to_2026-07-09',
                method: `RRF small65/block75 w=${weight.toFixed(2)} bonus=${agreementBonus}`,
                top: topCount,
                ...summarize(rows),
                monthly: groupRows(rows, date => date.slice(0, 7))
            });
        }
    }

    const output = {
        generatedAt: new Date().toISOString(),
        source: {
            dataSource: 'Cloudflare R2',
            rawRecords: rawData.length,
            rawLatest: rawData.at(-1)?.date || null,
            historicalReport: path.resolve(historicalFile),
            currentReport: path.resolve(currentFile)
        },
        economics: {
            stakePerNumberK: STAKE_K,
            payoutPerHitK: PAYOUT_K,
            breakEvenHitsPerDay: 'top * 2200 / 8000'
        },
        methodology: {
            historical: 'Snapshot Chuỗi nhỏ Hold65 theo ngày, 2016-01-01 đến 2026-07-04.',
            current: 'Snapshot 2026; RRF được tái tạo từ thứ hạng Top20 của Chuỗi nhỏ Hold65 và Nhịp block Hold75.',
            pointInTime: 'Các report nguồn dùng annual baseline nhưng fast full-history chain index; chưa phải strict daily-prefix PIT.',
            interpretation: 'Profit, ROI, hit-day, >=2 hit và chuỗi lỗ được xem đồng thời. Kết quả lịch sử là bằng chứng tham khảo, không phải bảo đảm lợi nhuận.'
        },
        historical: historicalRows,
        current: currentRows
    };
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'bao_cao_nghien_cuu_loto_6_20.json'), JSON.stringify(output, null, 2));
    const csvHeaders = ['scope', 'method', 'top', 'days', 'hitRate', 'atLeast2Rate', 'avgHitsPerDay', 'stakeK', 'payoutK', 'profitK', 'roi', 'winDays', 'lossDays', 'longestWin', 'longestLoss'];
    const csvRows = [...historicalRows, ...currentRows].map(row => csvHeaders.map(header => csvEscape(row[header])).join(','));
    fs.writeFileSync(path.join(outputDir, 'bao_cao_nghien_cuu_loto_6_20.csv'), [csvHeaders.join(','), ...csvRows].join('\n'));

    console.log(JSON.stringify({
        outputDir,
        rawLatest: output.source.rawLatest,
        historicalTop7: historicalRows.find(row => row.top === 7),
        currentRrfTop7: currentRows.find(row => row.method === 'RRF small65/block75 w=0.50 bonus=0' && row.top === 7)
    }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
