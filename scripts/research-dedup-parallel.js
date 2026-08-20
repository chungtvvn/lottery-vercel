#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const simulationService = require('../lib/services/simulationService');

const METHOD_IDS = [
    'dedupEdge75Hold70',
    'dedupDropoffHold70',
    'deParallelDedupEdge75DropoffHold70',
    'deParallelBlock85Small65Hold70'
];

function parseArgs() {
    return new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value || '1'];
    }));
}

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function summarizeRows(rows) {
    let longestWin = 0;
    let longestLoss = 0;
    let currentWin = 0;
    let currentLoss = 0;
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
    const stakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = rows.reduce((sum, row) => sum + row.payoutK, 0);
    const profitK = rows.reduce((sum, row) => sum + row.profitK, 0);
    const hitDays = rows.filter(row => row.hit).length;
    return {
        days: rows.length,
        hitDays,
        hitRate: rows.length ? hitDays / rows.length : 0,
        winDays: rows.filter(row => row.profitK > 0).length,
        lossDays: rows.filter(row => row.profitK < 0).length,
        averageBetCount: rows.length
            ? rows.reduce((sum, row) => sum + row.betCount, 0) / rows.length
            : 0,
        averageUnitCount: rows.length
            ? rows.reduce((sum, row) => sum + row.unitCount, 0) / rows.length
            : 0,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin,
        longestLoss
    };
}

function rowsForMethod(result, methodId, startDate, endDate) {
    return (result.details || []).map(detail => {
        const date = isoDate(detail.predictionIsoDate || detail.predictionDate);
        const method = detail.methods?.[methodId];
        if (!method || method.skipped || date < startDate || date > endDate) return null;
        const intersections = Array.isArray(method.intersectionNumbers)
            ? method.intersectionNumbers.length
            : 0;
        return {
            date,
            hit: Boolean(method.hit),
            actualNumber: detail.actualNumber,
            betCount: Number(method.betCount || method.betNumbers?.length || 0),
            unitCount: Number(method.betCount || method.betNumbers?.length || 0) + intersections,
            intersectionCount: intersections,
            stakeK: Number(method.betStake || method.stake || 0),
            payoutK: Number(method.betPayout || method.payout || 0),
            profitK: Number(method.betProfit || method.profit || 0)
        };
    }).filter(Boolean);
}

function summarizeMonths(rows) {
    const grouped = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!grouped.has(month)) grouped.set(month, []);
        grouped.get(month).push(row);
    }
    return Object.fromEntries(
        [...grouped.entries()].map(([month, values]) => [month, summarizeRows(values)])
    );
}

async function main() {
    const args = parseArgs();
    const startDate = args.get('startDate') || '2026-01-01';
    const requestedEnd = args.get('endDate') || null;
    await lotteryService.loadRawData();
    const raw = (lotteryService.getRawData() || [])
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const endDate = requestedEnd || isoDate(raw.at(-1)?.date);
    const startIndex = raw.findIndex(row => isoDate(row.date) >= startDate);
    const endIndexFound = raw.findIndex(row => isoDate(row.date) > endDate);
    const endIndexExclusive = endIndexFound < 0 ? raw.length : endIndexFound;
    if (startIndex < 1 || endIndexExclusive <= startIndex) {
        throw new Error(`Khoảng ngày không hợp lệ: ${startDate} -> ${endDate}`);
    }

    const result = await simulationService.runBacktest(endIndexExclusive - startIndex, raw, {
        startIndex,
        endIndexExclusive,
        strictPointInTime: true,
        methodIds: METHOD_IDS,
        playMode: 'bet',
        betWinMultiplier: 84,
        betWinFactor: 1,
        compactDetails: true,
        selectedStreakDetailLimit: 0,
        clearHistoryCacheInterval: 50,
        progress: true
    });

    const methods = Object.fromEntries(METHOD_IDS.map(methodId => {
        const rows = rowsForMethod(result, methodId, startDate, endDate);
        return [methodId, {
            summary: summarizeRows(rows),
            months: summarizeMonths(rows),
            rows
        }];
    }));
    const report = {
        generatedAt: new Date().toISOString(),
        startDate,
        endDate,
        strictPointInTime: true,
        economics: {
            unit: 'K_VND',
            stakePerUnitK: 1000,
            payoutMultiplier: 84
        },
        methods
    };
    const outputPath = path.join(
        process.cwd(),
        'reports',
        `research_dedup_parallel_${startDate}_${endDate}.json`
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        outputPath,
        methods: Object.fromEntries(Object.entries(methods).map(([id, value]) => [id, value.summary]))
    }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
