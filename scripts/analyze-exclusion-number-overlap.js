#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const simulationService = require('../lib/services/simulationService');
const lotteryService = require('../lib/services/lotteryService');

function parseArgs() {
    return new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value || '1'];
    }));
}

function findLatestBacktestReport(reportDir) {
    return fs.readdirSync(reportDir)
        .filter(name => name.startsWith('backtest_weekly_risk_targets_bet_only_chunked_') && name.endsWith('.json'))
        .map(name => path.join(reportDir, name))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function csvEscape(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function addDays(isoDate, days) {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function summarizeRows(rows, methodId, dataStartDate = null) {
    const valid = rows.filter(row => row[methodId]?.scoreDiagnostics?.actualRank);
    const targetExcluded = Number(String(methodId).match(/(\d{1,3})$/)?.[1] || 90);
    const rankDeciles = [];
    for (let start = 1; start <= 100; start += 10) {
        const count = valid.filter(row => {
            const rank = row[methodId].scoreDiagnostics.actualRank;
            return rank >= start && rank < start + 10;
        }).length;
        rankDeciles.push({
            rankStart: start,
            rankEnd: start + 9,
            actualCount: count,
            actualRate: valid.length > 0 ? count / valid.length : 0
        });
    }

    const rankRows = Array.from({ length: 100 }, (_, index) => {
        const rank = index + 1;
        const actualCount = valid.filter(row => row[methodId].scoreDiagnostics.actualRank === rank).length;
        return {
            rank,
            actualCount,
            actualRate: valid.length > 0 ? actualCount / valid.length : 0
        };
    });
    const wins = valid.filter(row => Number(row[methodId].profit || 0) > 0).length;
    const insufficientEvidenceDays = valid.filter(row =>
        Number(row[methodId].scoreDiagnostics.positiveScoreCount || 0) < targetExcluded
    ).length;
    const firstDate = dataStartDate || valid[0]?.predictionIsoDate || null;
    const matureStartDate = firstDate ? addDays(firstDate, 365) : null;
    const mature = matureStartDate ? valid.filter(row => row.predictionIsoDate >= matureStartDate) : valid;
    const matureWins = mature.filter(row => Number(row[methodId].profit || 0) > 0).length;

    return {
        totalDays: valid.length,
        wins,
        hitRate: valid.length > 0 ? wins / valid.length : 0,
        targetExcluded,
        insufficientEvidenceDays,
        insufficientEvidenceRate: valid.length > 0 ? insufficientEvidenceDays / valid.length : 0,
        matureStartDate,
        matureDays: mature.length,
        matureWins,
        matureHitRate: mature.length > 0 ? matureWins / mature.length : 0,
        rankDeciles,
        rankRows
    };
}

async function main() {
    const args = parseArgs();
    const reportDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.resolve(args.get('report') || findLatestBacktestReport(reportDir));
    const methodId = args.get('method') || 'edgeHold90';
    const backtest = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const latest = await simulationService.runBacktest(1, null, {
        methodIds: [methodId],
        compactDetails: false,
        playMode: 'bet'
    });
    const rawData = lotteryService.getRawData() || [];
    const dataStartDate = rawData
        .map(item => String(item.date || '').slice(0, 10))
        .filter(Boolean)
        .sort()[0] || null;
    const historical = summarizeRows(backtest.dailyRows || [], methodId, dataStartDate);
    const latestMethod = latest.nextPrediction?.methods?.[methodId];
    if (!latestMethod || !Array.isArray(latestMethod.numberScores)) {
        throw new Error(`Không tìm thấy numberScores cho ${methodId}.`);
    }

    const latestRows = latestMethod.numberScores.map(row => ({
        rank: row.rank,
        number: String(row.number).padStart(2, '0'),
        score: Number(row.score || 0),
        supportCount: Number(row.supportCount || row.rawSupportCount || 0),
        distinctSetCount: Number(row.distinctSetCount || row.distinctSupportCount || 0),
        duplicateSupportCount: Math.max(0,
            Number(row.supportCount || row.rawSupportCount || 0)
            - Number(row.distinctSetCount || row.distinctSupportCount || 0)
        ),
        maxDropOffRate: Number(row.maxDropOffRate || 0),
        maxEdge: Number(row.maxEdge || 0),
        excluded: !!row.excluded
    }));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const jsonPath = path.join(reportDir, `exclusion_number_overlap_${stamp}.json`);
    const csvPath = path.join(reportDir, `exclusion_number_overlap_latest_${stamp}.csv`);
    const headers = Object.keys(latestRows[0]);

    fs.writeFileSync(jsonPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        sourceReport: reportPath,
        methodId,
        predictionDate: latest.nextPrediction.predictionDate,
        basisDate: latest.nextPrediction.basisDate,
        historical,
        latestNumberScores: latestRows
    }, null, 2));
    fs.writeFileSync(csvPath, [
        headers.join(','),
        ...latestRows.map(row => headers.map(header => csvEscape(row[header])).join(','))
    ].join('\n'));

    console.log(`[OverlapAnalysis] JSON: ${jsonPath}`);
    console.log(`[OverlapAnalysis] CSV: ${csvPath}`);
    console.table(historical.rankDeciles.map(row => ({
        ranks: `${row.rankStart}-${row.rankEnd}`,
        actual: row.actualCount,
        ratePercent: Math.round(row.actualRate * 100000) / 1000
    })));
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
