#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const generateNumberStats = require('../lib/generators/statisticsGenerator');
const generateHeadTailStats = require('../lib/generators/headTailStatsGenerator');
const generateSumDiffStats = require('../lib/generators/sumDifferenceStatsGenerator');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        dates: String(args.get('dates') || '2026-01-15,2026-02-15,2026-03-15,2026-04-15,2026-05-15,2026-06-15')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean),
        target: Number(args.get('target') || 70),
        historyYears: Number(args.get('historyYears') || 20),
        minPotentialLen: Number(args.get('minPotentialLen') || 4),
        regenerateFull: args.get('regenerateFull') === '1'
    };
}

function parseDate(value) {
    return historicalExclusionService.parseDate(value);
}

function formatIsoDate(value) {
    const date = value instanceof Date ? value : parseDate(value);
    if (!date) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(value) {
    const date = value instanceof Date ? value : parseDate(value);
    return date ? historicalExclusionService.formatDate(date) : '';
}

function addDays(value, days) {
    const date = value instanceof Date ? new Date(value) : parseDate(value);
    if (!date) return null;
    date.setDate(date.getDate() + days);
    return date;
}

function normalizeRaw(raw) {
    return (raw || [])
        .map(row => ({
            ...row,
            _iso: formatIsoDate(row.date),
            special: Number(row.special)
        }))
        .filter(row => row._iso && Number.isFinite(row.special))
        .sort((a, b) => a._iso.localeCompare(b._iso));
}

function flattenStats(stats) {
    const entries = new Map();
    const add = (key, value) => {
        if (isInvalidStatsKey(key) || !value || !Array.isArray(value.streaks)) return;
        entries.set(key, value);
    };
    for (const [key, value] of Object.entries(stats || {})) {
        if (value && Array.isArray(value.streaks)) add(key, value);
        else if (value && typeof value === 'object') {
            for (const [subKey, subValue] of Object.entries(value)) {
                add(`${key}:${subKey}`, subValue);
            }
        }
    }
    return entries;
}

function mergeEntries(stats) {
    const entries = new Map();
    for (const group of [stats.numberStats, stats.headTailStats, stats.sumDiffStats]) {
        for (const [key, value] of flattenStats(group)) entries.set(key, value);
    }
    return entries;
}

async function generateStats(raw) {
    const input = raw.map(row => ({ date: row.date, special: Number(row.special) }));
    const startedAt = Date.now();
    const [numberStats, headTailStats, sumDiffStats] = await Promise.all([
        generateNumberStats(null, null, input),
        generateHeadTailStats(null, null, input),
        generateSumDiffStats(null, null, input)
    ]);
    return {
        numberStats,
        headTailStats,
        sumDiffStats,
        elapsedMs: Date.now() - startedAt
    };
}

function buildCandidates(targetIso, baseline, options) {
    return annualMilestoneService.buildCandidatesForDate(formatDisplayDate(targetIso), baseline, {
        historyYears: options.historyYears,
        minPotentialCurrentLenForNeverFormed: options.minPotentialLen,
        activeFrequencyLimit: 0.5,
        recordFrequencyLimit: 1.1
    });
}

function predictionSummary(candidates, target, strategy) {
    const prediction = annualMilestoneService.buildPrediction(candidates, target, strategy);
    return {
        betNumbers: (prediction.betNumbers || []).map(Number).sort((a, b) => a - b),
        excludedNumbers: (prediction.excludedNumbers || []).map(Number).sort((a, b) => a - b),
        selectedChains: (prediction.selectedChains || []).slice(0, 12).map(row => ({
            key: row.key,
            tier: row.tier,
            currentLen: row.currentLen,
            targetLen: row.targetLen,
            numbers: row.numbers
        }))
    };
}

function intersectionCount(left, right) {
    const rightSet = new Set(right);
    return left.filter(value => rightSet.has(value)).length;
}

function comparePredictions(full, safe, actual) {
    const common = intersectionCount(full.betNumbers, safe.betNumbers);
    return {
        commonBetNumbers: common,
        changedBetNumbers: full.betNumbers.length - common,
        jaccard: common / Math.max(1, new Set([...full.betNumbers, ...safe.betNumbers]).size),
        fullHit: full.betNumbers.includes(actual),
        safeHit: safe.betNumbers.includes(actual),
        fullBetNumbers: full.betNumbers,
        safeBetNumbers: safe.betNumbers,
        fullSelectedChains: full.selectedChains,
        safeSelectedChains: safe.selectedChains
    };
}

async function main() {
    const options = parseArgs();
    await lotteryService.loadAll();
    const fullRaw = normalizeRaw(lotteryService.getRawData());
    let originalStats = {
        numberStats: lotteryService.getNumberStats(),
        headTailStats: lotteryService.getHeadTailStats(),
        sumDiffStats: lotteryService.getSumDiffStats()
    };
    if (options.regenerateFull) {
        console.log(`[Audit] Tái sinh full-history stats từ ${fullRaw.length} ngày bằng generator hiện tại...`);
        originalStats = await generateStats(fullRaw);
        console.log(`[Audit] Full-history stats: ${(originalStats.elapsedMs / 1000).toFixed(1)}s.`);
    }
    const rawByDate = new Map(fullRaw.map(row => [row._iso, row]));

    const years = [...new Set(options.dates.map(value => Number(value.slice(0, 4))))];
    const safeBaselines = new Map();
    for (const year of years) {
        const cutoff = `${year - 1}-12-31`;
        const baselineRaw = fullRaw.filter(row => row._iso <= cutoff);
        console.log(`[Audit] Sinh baseline point-in-time ${year} từ ${baselineRaw.length} ngày...`);
        const baselineStats = await generateStats(baselineRaw);
        safeBaselines.set(year, annualMilestoneService.buildAnnualBaseline(
            mergeEntries(baselineStats),
            year,
            { historyYears: options.historyYears, writeBaseline: false }
        ));
        console.log(`[Audit] Baseline ${year}: ${(baselineStats.elapsedMs / 1000).toFixed(1)}s.`);
    }

    lotteryService.__setInMemoryCachesForBacktest({ rawData: fullRaw, ...originalStats });
    historicalExclusionService.clearCache();
    const fullEntries = mergeEntries(originalStats);
    const fullBaselines = new Map(years.map(year => [
        year,
        annualMilestoneService.buildAnnualBaseline(fullEntries, year, {
            historyYears: options.historyYears,
            writeBaseline: false
        })
    ]));

    const rows = [];
    for (const targetIso of options.dates) {
        const actualRow = rawByDate.get(targetIso);
        if (!actualRow) {
            console.warn(`[Audit] Bỏ qua ${targetIso}: không có kết quả.`);
            continue;
        }
        const year = Number(targetIso.slice(0, 4));
        const basisIso = formatIsoDate(addDays(targetIso, -1));

        lotteryService.__setInMemoryCachesForBacktest({ rawData: fullRaw, ...originalStats });
        historicalExclusionService.clearCache();
        const fullCandidates = buildCandidates(targetIso, fullBaselines.get(year), options);
        const fullBlock = predictionSummary(fullCandidates, options.target, 'chainBlockFirst');
        const fullPosterior = predictionSummary(fullCandidates, options.target, 'numberPosteriorDiversity');
        const hybridCandidates = buildCandidates(targetIso, safeBaselines.get(year), options);
        const hybridBlock = predictionSummary(hybridCandidates, options.target, 'chainBlockFirst');
        const hybridPosterior = predictionSummary(hybridCandidates, options.target, 'numberPosteriorDiversity');

        const truncatedRaw = fullRaw.filter(row => row._iso <= basisIso);
        console.log(`[Audit] ${targetIso}: sinh thống kê từ ${truncatedRaw.length} ngày...`);
        const safeStats = await generateStats(truncatedRaw);
        lotteryService.__setInMemoryCachesForBacktest({ rawData: truncatedRaw, ...safeStats });
        historicalExclusionService.clearCache();
        const safeCandidates = buildCandidates(targetIso, safeBaselines.get(year), options);
        const safeBlock = predictionSummary(safeCandidates, options.target, 'chainBlockFirst');
        const safePosterior = predictionSummary(safeCandidates, options.target, 'numberPosteriorDiversity');

        const row = {
            targetIso,
            basisIso,
            actual: Number(actualRow.special),
            generationSeconds: Number((safeStats.elapsedMs / 1000).toFixed(2)),
            candidateCounts: {
                full: fullCandidates.length,
                safe: safeCandidates.length
            },
            chainBlockFirst: comparePredictions(fullBlock, safeBlock, Number(actualRow.special)),
            numberPosteriorDiversity: comparePredictions(fullPosterior, safePosterior, Number(actualRow.special)),
            hybridChainBlockFirst: comparePredictions(hybridBlock, safeBlock, Number(actualRow.special)),
            hybridNumberPosteriorDiversity: comparePredictions(hybridPosterior, safePosterior, Number(actualRow.special))
        };
        rows.push(row);
        console.log(`[Audit] ${targetIso}: block đổi ${row.chainBlockFirst.changedBetNumbers}/30, ` +
            `posterior đổi ${row.numberPosteriorDiversity.changedBetNumbers}/30; ` +
            `hybrid block đổi ${row.hybridChainBlockFirst.changedBetNumbers}/30, ` +
            `hybrid posterior đổi ${row.hybridNumberPosteriorDiversity.changedBetNumbers}/30.`);
    }

    const aggregate = {};
    for (const strategy of [
        'chainBlockFirst',
        'numberPosteriorDiversity',
        'hybridChainBlockFirst',
        'hybridNumberPosteriorDiversity'
    ]) {
        aggregate[strategy] = {
            days: rows.length,
            meanChangedBetNumbers: rows.length
                ? rows.reduce((sum, row) => sum + row[strategy].changedBetNumbers, 0) / rows.length
                : 0,
            fullHits: rows.filter(row => row[strategy].fullHit).length,
            safeHits: rows.filter(row => row[strategy].safeHit).length,
            decisionsChanged: rows.filter(row => row[strategy].fullHit !== row[strategy].safeHit).length
        };
    }

    const report = {
        generatedAt: new Date().toISOString(),
        options,
        warning: 'full dùng chỉ mục chuỗi sinh từ toàn bộ lịch sử; safe tái sinh thống kê chỉ đến ngày trước dự đoán.',
        aggregate,
        rows
    };
    const reportPath = path.join(
        __dirname,
        '..',
        'reports',
        `audit_point_in_time_leakage_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ reportPath, aggregate }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
