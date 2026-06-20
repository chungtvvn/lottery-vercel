#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const simulationService = require('../lib/services/simulationService');

function parseDate(value) {
    if (!value) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [d, m, y] = value.split('/').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(value);
}

function formatIso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function csvEscape(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
}

function parseMethods(args) {
    const source = args.get('methods')
        || (args.get('targets')
            ? String(args.get('targets')).split(',').map(value => `riskHold${value.trim()}`).join(',')
            : 'riskHold60,riskHold70,riskHold80,riskHold90');
    const methods = String(source)
        .split(',')
        .map(value => value.trim())
        .filter(value => /^(riskHold|frequencyHold|tierHold|edgeHold|confidentEdgeHold|avgDropoffHold|avgEdge25Hold|avgEdge50Hold|avgEdge75Hold|dedupDropoffHold|dedupEdgeHold|dedupEdge25Hold|dedupEdge50Hold|dedupEdge75Hold|bayesHold|scarcityHold|recordHold|recordFirstHold|potentialHold|wilsonHold)\d{1,3}$/.test(value));
    return [...new Set(methods)];
}

function emptyWeekRow(methodId, weekStart, weekEnd) {
    return {
        methodId,
        weekStart,
        weekEnd,
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
    };
}

function updateRow(row, method) {
    row.days += 1;
    if (!method || method.skipped) {
        row.skippedDays += 1;
        return;
    }
    row.playedDays += 1;
    if ((method.profit || 0) > 0) row.wins += 1;
    if ((method.profit || 0) < 0) row.losses += 1;
    row.stakeK += method.stake || 0;
    row.payoutK += method.payout || 0;
    row.profitK += method.profit || 0;
    row.betProfitK += method.betProfit || 0;
    row.holdProfitK += method.holdProfit || 0;
    row.excludedTotal += method.excludedCount || 0;
    row.betTotal += method.betCount || 0;
}

function finalizeRow(row) {
    return {
        ...row,
        hitRate: row.playedDays > 0 ? row.wins / row.playedDays : 0,
        roi: row.stakeK > 0 ? row.profitK / row.stakeK : 0,
        avgExcluded: row.playedDays > 0 ? Math.round((row.excludedTotal / row.playedDays) * 10) / 10 : 0,
        avgBet: row.playedDays > 0 ? Math.round((row.betTotal / row.playedDays) * 10) / 10 : 0
    };
}

function computeLongestStreaks(details, methodId) {
    let currentType = null;
    let currentLength = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let currentStart = '';
    let longestWinRange = null;
    let longestLossRange = null;

    for (const day of details) {
        const method = day.methods && day.methods[methodId];
        if (!method || method.skipped || (method.profit || 0) === 0) {
            currentType = null;
            currentLength = 0;
            currentStart = '';
            continue;
        }
        const type = method.profit > 0 ? 'win' : 'loss';
        if (type === currentType) {
            currentLength += 1;
        } else {
            currentType = type;
            currentLength = 1;
            currentStart = day.predictionIsoDate;
        }
        const range = { start: currentStart, end: day.predictionIsoDate };
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

function buildDailyRows(details, methods) {
    return details.map(day => {
        const row = {
            predictionIsoDate: day.predictionIsoDate,
            predictionDate: day.predictionDate,
            actualNumber: day.actualNumber
        };
        for (const methodId of methods) {
            const method = day.methods && day.methods[methodId];
            row[methodId] = method
                ? {
                    skipped: !!method.skipped,
                    profit: method.profit || 0,
                    stake: method.stake || 0,
                    payout: method.payout || 0,
                    excludedCount: method.excludedCount || 0,
                    betCount: method.betCount || 0,
                    scoreDiagnostics: method.scoreDiagnostics || null
                }
                : null;
        }
        return row;
    });
}

async function main() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value || '1'];
    }));
    const years = Number(args.get('years') || 20);
    const days = Math.round(years * 365.25);
    const methods = parseMethods(args);
    const rollingHistory = args.get('rollingHistory') === '1' || args.get('rolling') === '1';
    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });

    console.log(`[WeeklyBacktest] Running ${days} days, playMode=bet, rollingHistory=${rollingHistory ? '1' : '0'}, methods=${methods.join(',')}`);
    const result = await simulationService.runBacktest(days, null, {
        playMode: 'bet',
        methods: methods.join(','),
        compactDetails: true,
        betWinMultiplier: Number(args.get('betWinMultiplier') || args.get('winMultiplier') || 84),
        rollingHistory,
        startIndex: args.has('startIndex') ? Number(args.get('startIndex')) : undefined,
        endIndexExclusive: args.has('endIndex') ? Number(args.get('endIndex')) : undefined
    });
    if (result.error) throw new Error(result.error);

    const chronological = result.details.slice().reverse();
    const weekly = new Map();
    for (const day of chronological) {
        const date = parseDate(day.predictionIsoDate || day.predictionDate);
        if (!date) continue;
        const weekStart = getWeekStart(date);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        for (const methodId of methods) {
            const key = `${methodId}|${formatIso(weekStart)}`;
            if (!weekly.has(key)) {
                weekly.set(key, emptyWeekRow(methodId, formatIso(weekStart), formatIso(weekEnd)));
            }
            updateRow(weekly.get(key), day.methods[methodId]);
        }
    }

    const weeklyRows = [...weekly.values()].map(finalizeRow)
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.methodId.localeCompare(b.methodId));
    const methodSummary = methods.map(methodId => ({
        methodId,
        ...result.summary[methodId],
        ...computeLongestStreaks(chronological, methodId)
    })).map(item => ({
        ...item,
        roi: item.totalStake > 0 ? item.totalProfit / item.totalStake : 0
    })).sort((a, b) => (b.totalProfit || 0) - (a.totalProfit || 0));

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const csvPath = path.join(outputDir, `backtest_weekly_risk_targets_bet_only_${stamp}.csv`);
    const jsonPath = path.join(outputDir, `backtest_weekly_risk_targets_bet_only_${stamp}.json`);
    const headers = [
        'weekStart', 'weekEnd', 'methodId', 'days', 'playedDays', 'skippedDays',
        'wins', 'losses', 'hitRate', 'stakeK', 'payoutK', 'profitK', 'betProfitK',
        'holdProfitK', 'roi', 'avgExcluded', 'avgBet'
    ];
    const csv = [
        headers.join(','),
        ...weeklyRows.map(row => headers.map(header => csvEscape(
            typeof row[header] === 'number' ? Math.round(row[header] * 10000) / 10000 : row[header]
        )).join(','))
    ].join('\n');
    fs.writeFileSync(csvPath, csv);
    fs.writeFileSync(jsonPath, JSON.stringify({
        generatedAt: result.generatedAt,
        config: {
            ...result.config,
            rollingHistory
        },
        methodSummary,
        weeklyRows,
        dailyRows: buildDailyRows(chronological, methods)
    }, null, 2));

    console.log(`[WeeklyBacktest] CSV: ${csvPath}`);
    console.log(`[WeeklyBacktest] JSON: ${jsonPath}`);
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
