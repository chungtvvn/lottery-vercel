#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const {
    buildBacktestFingerprint,
    hashCanonical,
    readJsonSnapshot
} = require('../lib/utils/backtestFingerprint');
const {
    buildNumberEvidence,
    formatDisplayDate,
    generateStats,
    mergeEntries,
    normalizeRaw
} = require('./research-true-pit-strategies');

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        year: Number(args.get('year') || 2024),
        historyYears: Number(args.get('historyYears') || 20),
        target: Number(args.get('target') || 70),
        minPotentialLen: Number(args.get('minPotentialLen') || 4),
        includeEvidence: String(args.get('includeEvidence') || '1') !== '0',
        rawFile: args.get('rawFile') || 'reports/snapshots/xsmb-through-2026-07-05.json.gz',
        compareReport: args.get('compareReport') || null,
        datesFromCompare: String(args.get('datesFromCompare') || '1') !== '0'
    };
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        losses: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        currentType: null,
        currentLength: 0,
        rows: []
    };
}

function addResult(summary, row) {
    const betNumbers = (row.strategies?.[summary.id] || []).map(Number);
    const hit = betNumbers.includes(Number(row.actual));
    const stakeK = betNumbers.length * 1000;
    const payoutK = hit ? 84000 : 0;
    const type = hit ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(hit);
    summary.losses += Number(!hit);
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += payoutK - stakeK;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    if (hit) summary.longestWin = Math.max(summary.longestWin, summary.currentLength);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.currentLength);
    summary.rows.push({
        date: row.date,
        actual: Number(row.actual),
        betNumbers,
        hit,
        profitK: payoutK - stakeK
    });
}

function finalizeSummary(summary) {
    const { currentType, currentLength, ...result } = summary;
    return {
        ...result,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0
    };
}

function compareRows(rows, compareReport) {
    if (!compareReport) return null;
    const expected = new Map((compareReport.rows || []).map(row => [row.date, row]));
    const mismatches = [];
    let comparisons = 0;
    for (const row of rows) {
        const reference = expected.get(row.date);
        if (!reference) continue;
        for (const strategy of annualMilestoneService.STRATEGY_IDS) {
            comparisons++;
            const actual = JSON.stringify(row.strategies?.[strategy] || []);
            const wanted = JSON.stringify(reference.strategies?.[strategy] || []);
            if (actual !== wanted) {
                mismatches.push({
                    date: row.date,
                    strategy,
                    expected: reference.strategies?.[strategy] || [],
                    actual: row.strategies?.[strategy] || []
                });
            }
        }
    }
    return {
        referenceDays: expected.size,
        comparedDays: rows.filter(row => expected.has(row.date)).length,
        comparisons,
        mismatches: mismatches.length,
        exactMatchRate: comparisons ? (comparisons - mismatches.length) / comparisons : 0,
        firstMismatches: mismatches.slice(0, 20)
    };
}

async function main() {
    const options = parseArgs();
    const rawPath = path.resolve(options.rawFile);
    const raw = normalizeRaw(readJsonSnapshot(rawPath));
    const startDate = `${options.year}-01-01`;
    const endDate = `${options.year}-12-31`;
    const baselineCutoffDate = `${options.year - 1}-12-31`;
    const compareReport = options.compareReport
        ? JSON.parse(fs.readFileSync(path.resolve(options.compareReport), 'utf8'))
        : null;
    const compareDates = new Set((compareReport?.rows || []).map(row => row.date));
    const dates = raw
        .filter(row => row._iso >= startDate && row._iso <= endDate)
        .map(row => row._iso)
        .filter(date => !options.datesFromCompare || !compareReport || compareDates.has(date));
    if (!dates.length) throw new Error(`Không có ngày cho năm ${options.year}.`);

    const baselineRaw = raw.filter(row => row._iso <= baselineCutoffDate);
    const yearRaw = raw.filter(row => row._iso <= endDate);
    console.log(`[YearIndexPIT] Sinh baseline ${options.year}...`);
    const baselineStats = await generateStats(baselineRaw, false);
    const baseline = annualMilestoneService.buildAnnualBaseline(
        mergeEntries(baselineStats),
        options.year,
        { historyYears: options.historyYears, writeBaseline: false }
    );
    console.log(`[YearIndexPIT] Sinh index đến ${endDate}...`);
    const yearStats = await generateStats(yearRaw, false);
    lotteryService.__setInMemoryCachesForBacktest({
        rawData: yearRaw,
        ...yearStats
    });
    historicalExclusionService.clearCache();

    const rows = [];
    for (let index = 0; index < dates.length; index++) {
        const date = dates[index];
        const actual = Number(raw.find(row => row._iso === date)?.special);
        const candidates = annualMilestoneService.buildCandidatesForDate(
            formatDisplayDate(date),
            baseline,
            {
                historyYears: options.historyYears,
                minPotentialCurrentLenForNeverFormed: options.minPotentialLen,
                activeFrequencyLimit: 0.5,
                recordFrequencyLimit: 1.1
            }
        );
        const strategies = {};
        for (const strategy of annualMilestoneService.STRATEGY_IDS) {
            const prediction = annualMilestoneService.buildPrediction(
                candidates,
                options.target,
                strategy
            );
            strategies[strategy] = (prediction.betNumbers || [])
                .map(Number)
                .sort((left, right) => left - right);
        }
        const row = {
            date,
            actual,
            candidateCount: candidates.length,
            strategies
        };
        if (options.includeEvidence) row.numberEvidence = buildNumberEvidence(candidates);
        rows.push(row);
        if ((index + 1) % 20 === 0 || index + 1 === dates.length) {
            console.log(`[YearIndexPIT] ${index + 1}/${dates.length}`);
        }
    }

    const summaries = {};
    for (const strategy of annualMilestoneService.STRATEGY_IDS) {
        const summary = createSummary(strategy);
        rows.forEach(row => addResult(summary, row));
        summaries[strategy] = finalizeSummary(summary);
    }
    const comparison = compareRows(rows, compareReport);
    const config = {
        ...options,
        rawFile: path.relative(process.cwd(), rawPath),
        compareReport: options.compareReport
            ? path.relative(process.cwd(), path.resolve(options.compareReport))
            : null
    };
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: 'UNSAFE AUDIT ONLY: index đến cuối năm làm lộ việc chuỗi có tiếp tục sau ngày dự đoán hay không.',
        methodologyVersion: 'unsafe-year-index-leakage-audit-v1',
        eligibleForPromotion: false,
        baselineCutoffDate,
        options: config,
        comparison,
        summaries,
        rows
    };
    report.fingerprint = buildBacktestFingerprint({
        rawData: yearRaw,
        config,
        baselineCutoffDate,
        methodologyVersion: report.methodologyVersion,
        sourceFiles: [
            __filename,
            path.join(__dirname, 'research-true-pit-strategies.js'),
            path.join(__dirname, '..', 'lib', 'services', 'annualMilestoneService.js'),
            path.join(__dirname, '..', 'lib', 'services', 'historicalExclusionService.js')
        ],
        sourceLabel: path.relative(process.cwd(), rawPath)
    });
    report.resultSha256 = hashCanonical({
        summaries,
        rows
    });
    const reportPath = path.join(
        process.cwd(),
        'reports',
        `research_year_index_pit_${options.year}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        days: rows.length,
        comparison,
        top: Object.values(summaries)
            .sort((left, right) => right.hitRate - left.hitRate)
            .slice(0, 5)
            .map(({ rows: ignored, ...summary }) => summary)
    }, null, 2));
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = {
    compareRows
};
