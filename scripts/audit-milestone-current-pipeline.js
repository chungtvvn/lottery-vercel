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

function mergeEntries(groups) {
    const entries = new Map();
    for (const group of groups) {
        for (const [key, value] of flattenStats(group)) entries.set(key, value);
    }
    return entries;
}

function formatDisplayDate(iso) {
    return historicalExclusionService.formatDate(
        historicalExclusionService.parseDate(iso)
    );
}

function summarize(candidates, prediction) {
    return {
        candidates: candidates.length,
        tier1: candidates.filter(item => item.tier === 1).length,
        tier2: candidates.filter(item => item.tier === 2).length,
        tier3: candidates.filter(item => item.tier === 3).length,
        tier4: candidates.filter(item => item.tier === 4).length,
        betNumbers: (prediction.betNumbers || []).map(Number).sort((a, b) => a - b)
    };
}

function compareNumbers(left, right) {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    return {
        common: left.filter(number => rightSet.has(number)).length,
        onlyPersisted: left.filter(number => !rightSet.has(number)),
        onlyFresh: right.filter(number => !leftSet.has(number))
    };
}

async function generateFreshStats(raw) {
    const input = raw.map(row => ({
        date: row.date,
        special: Number(row.special)
    }));
    const [numberStats, headTailStats, sumDiffStats] = await Promise.all([
        generateNumberStats(null, null, input),
        generateHeadTailStats(null, null, input),
        generateSumDiffStats(null, null, input)
    ]);
    return { numberStats, headTailStats, sumDiffStats };
}

async function main() {
    process.env.LOTTERY_DATA_SOURCE = process.env.LOTTERY_DATA_SOURCE || 'local';
    process.env.LOTTERY_STATS_SOURCE = process.env.LOTTERY_STATS_SOURCE || 'local';
    await lotteryService.loadRawData();
    await lotteryService.loadStats();
    const raw = lotteryService.getRawData()
        .slice()
        .sort((a, b) => historicalExclusionService.parseDate(a.date) -
            historicalExclusionService.parseDate(b.date));
    const latest = historicalExclusionService.parseDate(raw[raw.length - 1].date);
    const target = new Date(latest);
    target.setDate(target.getDate() + 1);
    const targetIso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    const baselineRaw = raw.filter(row =>
        historicalExclusionService.parseDate(row.date) <= new Date(target.getFullYear() - 1, 11, 31)
    );

    const persistedStats = {
        numberStats: lotteryService.getNumberStats(),
        headTailStats: lotteryService.getHeadTailStats(),
        sumDiffStats: lotteryService.getSumDiffStats()
    };
    const freshBaselineStats = await generateFreshStats(baselineRaw);
    const baseline = annualMilestoneService.buildAnnualBaseline(
        mergeEntries([
            freshBaselineStats.numberStats,
            freshBaselineStats.headTailStats,
            freshBaselineStats.sumDiffStats
        ]),
        target.getFullYear(),
        { historyYears: 20, writeBaseline: false }
    );

    lotteryService.__setInMemoryCachesForBacktest({ rawData: raw, ...persistedStats });
    historicalExclusionService.clearCache();
    const persistedCandidates = annualMilestoneService.buildCandidatesForDate(
        formatDisplayDate(targetIso),
        baseline,
        { historyYears: 20, minPotentialCurrentLenForNeverFormed: 4 }
    );
    const persistedPrediction = annualMilestoneService.buildPrediction(
        persistedCandidates,
        70,
        'chainBlockFirst'
    );

    const freshStats = await generateFreshStats(raw);
    lotteryService.__setInMemoryCachesForBacktest({ rawData: raw, ...freshStats });
    historicalExclusionService.clearCache();
    const freshCandidates = annualMilestoneService.buildCandidatesForDate(
        formatDisplayDate(targetIso),
        baseline,
        { historyYears: 20, minPotentialCurrentLenForNeverFormed: 4 }
    );
    const freshPrediction = annualMilestoneService.buildPrediction(
        freshCandidates,
        70,
        'chainBlockFirst'
    );

    const persisted = summarize(persistedCandidates, persistedPrediction);
    const fresh = summarize(freshCandidates, freshPrediction);
    console.log(JSON.stringify({
        latestDataDate: raw[raw.length - 1].date,
        targetIso,
        persisted,
        fresh,
        comparison: compareNumbers(persisted.betNumbers, fresh.betNumbers)
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
