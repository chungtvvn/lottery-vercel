#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const simulationService = require('../lib/services/simulationService');

const METHOD_ID = 'deParallelBlock85Small65Hold70';
const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;
const START_DATE = '2016-01-01';
const END_DATE = '2025-12-31';
const HOLDOUT_START_DATE = '2026-01-01';

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function periodKey(date, period) {
    const value = new Date(`${date}T00:00:00Z`);
    if (period === 'week') {
        const day = value.getUTCDay() || 7;
        value.setUTCDate(value.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
        return `${value.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    if (period === 'month') return date.slice(0, 7);
    if (period === 'quarter') return `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
    return date.slice(0, 4);
}

function emptySummary(period, key) {
    return {
        period,
        key,
        days: 0,
        hitDays: 0,
        winDays: 0,
        lossDays: 0,
        totalBetNumbers: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        _currentWin: 0,
        _currentLoss: 0
    };
}

function addDay(summary, row) {
    const profit = Number(row.profitK || 0);
    summary.days += 1;
    summary.hitDays += row.hit ? 1 : 0;
    summary.winDays += profit > 0 ? 1 : 0;
    summary.lossDays += profit < 0 ? 1 : 0;
    summary.totalBetNumbers += Number(row.betCount || 0);
    summary.stakeK += Number(row.stakeK || 0);
    summary.payoutK += Number(row.payoutK || 0);
    summary.profitK += profit;
    if (profit > 0) {
        summary._currentWin += 1;
        summary._currentLoss = 0;
        summary.longestWin = Math.max(summary.longestWin, summary._currentWin);
    } else if (profit < 0) {
        summary._currentLoss += 1;
        summary._currentWin = 0;
        summary.longestLoss = Math.max(summary.longestLoss, summary._currentLoss);
    } else {
        summary._currentWin = 0;
        summary._currentLoss = 0;
    }
}

function finalizeSummary(summary) {
    const { _currentWin, _currentLoss, ...row } = summary;
    return {
        ...row,
        hitRate: row.days ? row.hitDays / row.days : 0,
        winRate: row.days ? row.winDays / row.days : 0,
        roi: row.stakeK ? row.profitK / row.stakeK : 0,
        stakeVnd: row.stakeK * 1000,
        payoutVnd: row.payoutK * 1000,
        profitVnd: row.profitK * 1000
    };
}

function rowsFromResult(result, startDate, endDate) {
    return (result.details || [])
        .map(detail => {
            const date = isoDate(detail.predictionIsoDate || detail.predictionDate);
            const method = detail.methods?.[METHOD_ID];
            if (!date || date < startDate || date > endDate || !method || method.skipped) return null;
            return {
                date,
                hit: Boolean(method.hit),
                betCount: Number(method.betCount || method.betNumbers?.length || 0),
                stakeK: Number(method.betStake || method.stake || method.stakeK || 0),
                payoutK: Number(method.betPayout || method.payout || method.payoutK || 0),
                profitK: Number(method.betProfit || method.profit || method.profitK || 0)
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date));
}

function summarize(rows, period) {
    const groups = new Map();
    for (const row of rows) {
        const key = periodKey(row.date, period);
        if (!groups.has(key)) groups.set(key, emptySummary(period, key));
        addDay(groups.get(key), row);
    }
    return [...groups.values()].map(finalizeSummary);
}

function overall(rows, label) {
    const summary = emptySummary('overall', label);
    for (const row of rows) addDay(summary, row);
    return finalizeSummary(summary);
}

function csvEscape(value) {
    const text = String(value ?? '');
    return /[,\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function runRange(raw, startDate, endDate) {
    const startIndex = raw.findIndex(row => isoDate(row.date) >= startDate);
    const endIndexExclusive = raw.findIndex(row => isoDate(row.date) > endDate);
    if (startIndex < 1) throw new Error(`Không đủ dữ liệu trước ${startDate} để chạy point-in-time.`);
    const end = endIndexExclusive < 0 ? raw.length : endIndexExclusive;
    const result = await simulationService.runBacktest(end - startIndex, raw, {
        startIndex,
        endIndexExclusive: end,
        rollingHistory: true,
        methodIds: METHOD_ID,
        playMode: 'bet',
        betWinMultiplier: WIN_MULTIPLIER,
        betWinFactor: 1,
        compactDetails: true,
        selectedStreakDetailLimit: 0,
        clearHistoryCacheInterval: 30
    });
    return rowsFromResult(result, startDate, endDate);
}

async function main() {
    await lotteryService.loadRawData();
    const raw = (lotteryService.getRawData() || [])
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const latest = isoDate(raw.at(-1)?.date);
    const historicalRows = await runRange(raw, START_DATE, END_DATE);
    const currentRows = await runRange(raw, HOLDOUT_START_DATE, latest);
    const output = {
        generatedAt: new Date().toISOString(),
        method: METHOD_ID,
        economics: { unit: 'K_VND', betPerNumberK: BET_PER_NUMBER_K, winMultiplier: WIN_MULTIPLIER, payoutPerHitK: BET_PER_NUMBER_K * WIN_MULTIPLIER },
        pointInTime: true,
        ranges: {
            historical10y: { startDate: START_DATE, endDate: END_DATE, days: historicalRows.length },
            current2026: { startDate: HOLDOUT_START_DATE, endDate: latest, days: currentRows.length }
        },
        comparison: { historical10y: overall(historicalRows, '2016-2025'), current2026: overall(currentRows, '2026-to-date') },
        historical10y: Object.fromEntries(['week', 'month', 'quarter', 'year'].map(period => [period, summarize(historicalRows, period)])),
        current2026: Object.fromEntries(['week', 'month', 'quarter', 'year'].map(period => [period, summarize(currentRows, period)]))
    };
    const outputDir = path.join(process.cwd(), 'outputs', 'de-parallel-2016-2026');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'bao_cao_de_song_song_hold70_2016_2026.json'), JSON.stringify(output, null, 2));
    const rows = [
        ...Object.entries(output.comparison).map(([range, row]) => ({ range, period: 'overall', ...row })),
        ...['year', 'quarter', 'month', 'week'].flatMap(period => output.historical10y[period].map(row => ({ range: '2016-2025', ...row }))),
        ...['year', 'quarter', 'month', 'week'].flatMap(period => output.current2026[period].map(row => ({ range: '2026-to-date', ...row })))
    ];
    const headers = ['range', 'period', 'key', 'days', 'hitDays', 'winDays', 'lossDays', 'totalBetNumbers', 'stakeK', 'payoutK', 'profitK', 'roi', 'longestWin', 'longestLoss'];
    fs.writeFileSync(path.join(outputDir, 'bao_cao_de_song_song_hold70_2016_2026.csv'), [
        headers.join(','),
        ...rows.map(row => headers.map(header => csvEscape(row[header])).join(','))
    ].join('\n'));
    console.log(JSON.stringify({ outputDir, latest, historical: output.comparison.historical10y, current: output.comparison.current2026 }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
