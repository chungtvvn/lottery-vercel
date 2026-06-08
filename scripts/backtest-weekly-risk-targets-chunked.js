#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const lotteryService = require('../lib/services/lotteryService');

const METHODS = ['riskHold60', 'riskHold70', 'riskHold80', 'riskHold90'];

function parseArgs() {
    return new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value || '1'];
    }));
}

function csvEscape(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
}

function round(value, digits = 4) {
    const n = Number(value) || 0;
    const factor = 10 ** digits;
    return Math.round(n * factor) / factor;
}

function formatIsoDate(rawDate) {
    const d = new Date(rawDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mergeWeeklyRows(target, rows) {
    for (const row of rows || []) {
        const key = `${row.methodId}|${row.weekStart}`;
        if (!target.has(key)) {
            target.set(key, {
                methodId: row.methodId,
                weekStart: row.weekStart,
                weekEnd: row.weekEnd,
                days: 0,
                playedDays: 0,
                skippedDays: 0,
                wins: 0,
                losses: 0,
                stakeK: 0,
                payoutK: 0,
                profitK: 0,
                betProfitK: 0,
                holdProfitK: 0,
                excludedTotal: 0,
                betTotal: 0
            });
        }
        const merged = target.get(key);
        merged.days += Number(row.days || 0);
        merged.playedDays += Number(row.playedDays || 0);
        merged.skippedDays += Number(row.skippedDays || 0);
        merged.wins += Number(row.wins || 0);
        merged.losses += Number(row.losses || 0);
        merged.stakeK += Number(row.stakeK || 0);
        merged.payoutK += Number(row.payoutK || 0);
        merged.profitK += Number(row.profitK || 0);
        merged.betProfitK += Number(row.betProfitK || 0);
        merged.holdProfitK += Number(row.holdProfitK || 0);
        merged.excludedTotal += Number(row.avgExcluded || 0) * Number(row.playedDays || 0);
        merged.betTotal += Number(row.avgBet || 0) * Number(row.playedDays || 0);
    }
}

function finalizeWeeklyRows(map) {
    return [...map.values()]
        .map(row => ({
            ...row,
            hitRate: row.playedDays > 0 ? row.wins / row.playedDays : 0,
            roi: row.stakeK > 0 ? row.profitK / row.stakeK : 0,
            avgExcluded: row.playedDays > 0 ? round(row.excludedTotal / row.playedDays, 1) : 0,
            avgBet: row.playedDays > 0 ? round(row.betTotal / row.playedDays, 1) : 0
        }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.methodId.localeCompare(b.methodId));
}

function computeLongestStreaks(dailyRows, methodId) {
    let currentType = null;
    let currentLength = 0;
    let currentStart = '';
    let longestWin = 0;
    let longestLoss = 0;
    let longestWinRange = null;
    let longestLossRange = null;

    for (const row of dailyRows) {
        const method = row[methodId];
        if (!method || method.skipped || Number(method.profit || 0) === 0) {
            currentType = null;
            currentLength = 0;
            currentStart = '';
            continue;
        }
        const type = Number(method.profit || 0) > 0 ? 'win' : 'loss';
        if (type === currentType) {
            currentLength += 1;
        } else {
            currentType = type;
            currentLength = 1;
            currentStart = row.predictionIsoDate;
        }
        const range = { start: currentStart, end: row.predictionIsoDate };
        if (type === 'win' && currentLength > longestWin) {
            longestWin = currentLength;
            longestWinRange = range;
        }
        if (type === 'loss' && currentLength > longestLoss) {
            longestLoss = currentLength;
            longestLossRange = range;
        }
    }

    return { longestWin, longestLoss, longestWinRange, longestLossRange };
}

function summarizeMethods(dailyRows) {
    return METHODS.map(methodId => {
        const rows = dailyRows.map(row => row[methodId]).filter(Boolean);
        const totalDays = rows.length;
        const played = rows.filter(row => !row.skipped);
        const totalStake = played.reduce((sum, row) => sum + Number(row.stake || 0), 0);
        const totalPayout = played.reduce((sum, row) => sum + Number(row.payout || 0), 0);
        const totalProfit = played.reduce((sum, row) => sum + Number(row.profit || 0), 0);
        const excludedTotal = played.reduce((sum, row) => sum + Number(row.excludedCount || 0), 0);
        const betTotal = played.reduce((sum, row) => sum + Number(row.betCount || 0), 0);
        const wins = played.filter(row => Number(row.profit || 0) > 0).length;
        const losses = played.filter(row => Number(row.profit || 0) < 0).length;
        return {
            methodId,
            totalDays,
            playedDays: played.length,
            skippedDays: totalDays - played.length,
            wins,
            losses,
            hitRate: played.length > 0 ? wins / played.length : 0,
            missRate: played.length > 0 ? losses / played.length : 0,
            totalStake,
            totalPayout,
            totalProfit,
            totalBetProfit: totalProfit,
            totalHoldProfit: 0,
            averageExcluded: played.length > 0 ? round(excludedTotal / played.length, 1) : 0,
            averageBetCount: played.length > 0 ? round(betTotal / played.length, 1) : 0,
            ...computeLongestStreaks(dailyRows, methodId),
            roi: totalStake > 0 ? totalProfit / totalStake : 0
        };
    }).sort((a, b) => (b.totalProfit || 0) - (a.totalProfit || 0));
}

function writeCsv(outputPath, weeklyRows) {
    const headers = [
        'weekStart', 'weekEnd', 'methodId', 'days', 'playedDays', 'skippedDays',
        'wins', 'losses', 'hitRate', 'stakeK', 'payoutK', 'profitK', 'betProfitK',
        'holdProfitK', 'roi', 'avgExcluded', 'avgBet'
    ];
    const csv = [
        headers.join(','),
        ...weeklyRows.map(row => headers.map(header => csvEscape(
            typeof row[header] === 'number' ? round(row[header]) : row[header]
        )).join(','))
    ].join('\n');
    fs.writeFileSync(outputPath, csv);
}

async function main() {
    const args = parseArgs();
    const years = Number(args.get('years') || 20);
    const chunkSize = Math.max(30, Number(args.get('chunkSize') || 500));
    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });

    await lotteryService.loadRawData();
    const sortedData = (lotteryService.getRawData() || [])
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const totalDays = Math.min(Math.round(years * 365.25), sortedData.length - 1);
    const startIndex = sortedData.length - totalDays;
    const endIndex = sortedData.length;
    const chunks = [];
    for (let start = startIndex; start < endIndex; start += chunkSize) {
        chunks.push({ start, end: Math.min(endIndex, start + chunkSize) });
    }

    console.log(`[ChunkedBacktest] Running ${totalDays} days in ${chunks.length} chunks (${chunkSize} days/chunk)`);
    const weeklyMap = new Map();
    const dailyRows = [];
    const chunkReports = [];

    chunks.forEach((chunk, index) => {
        console.log(`[ChunkedBacktest] Chunk ${index + 1}/${chunks.length}: index ${chunk.start}..${chunk.end - 1}`);
        const child = spawnSync(process.execPath, [
            path.join(process.cwd(), 'scripts', 'backtest-weekly-risk-targets.js'),
            `--startIndex=${chunk.start}`,
            `--endIndex=${chunk.end}`,
            '--years=20',
            `--betWinMultiplier=${Number(args.get('betWinMultiplier') || args.get('winMultiplier') || 84)}`
        ], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=12288',
                BACKTEST_PROGRESS: '0',
                BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL: '80'
            },
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 32
        });
        if (child.status !== 0) {
            process.stdout.write(child.stdout || '');
            process.stderr.write(child.stderr || '');
            throw new Error(`Chunk ${index + 1} failed with exit code ${child.status}`);
        }
        const output = `${child.stdout || ''}\n${child.stderr || ''}`;
        const match = output.match(/\[WeeklyBacktest\] JSON:\s+(.+\.json)/);
        if (!match) {
            process.stdout.write(output);
            throw new Error(`Chunk ${index + 1} did not print JSON path`);
        }
        const jsonPath = match[1].trim();
        const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        chunkReports.push(jsonPath);
        mergeWeeklyRows(weeklyMap, json.weeklyRows || []);
        dailyRows.push(...(json.dailyRows || []));
    });

    dailyRows.sort((a, b) => String(a.predictionIsoDate).localeCompare(String(b.predictionIsoDate)));
    const weeklyRows = finalizeWeeklyRows(weeklyMap);
    const methodSummary = summarizeMethods(dailyRows);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const csvPath = path.join(outputDir, `backtest_weekly_risk_targets_bet_only_chunked_${stamp}.csv`);
    const jsonPath = path.join(outputDir, `backtest_weekly_risk_targets_bet_only_chunked_${stamp}.json`);

    writeCsv(csvPath, weeklyRows);
    fs.writeFileSync(jsonPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        config: {
            years,
            totalDays,
            chunkSize,
            startDate: formatIsoDate(sortedData[startIndex].date),
            endDate: formatIsoDate(sortedData[endIndex - 1].date),
            playMode: 'bet',
            methods: METHODS,
            childReports: chunkReports
        },
        methodSummary,
        weeklyRows,
        dailyRows
    }, null, 2));

    console.log(`[ChunkedBacktest] CSV: ${csvPath}`);
    console.log(`[ChunkedBacktest] JSON: ${jsonPath}`);
    console.table(methodSummary.map(item => ({
        method: item.methodId,
        played: item.playedDays,
        wins: item.wins,
        losses: item.losses,
        profitK: item.totalProfit,
        roi: Math.round((item.roi || 0) * 10000) / 100,
        longestWin: item.longestWin,
        longestLoss: item.longestLoss
    })));
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
