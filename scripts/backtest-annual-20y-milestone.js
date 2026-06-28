#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const exclusionLogic = require('../lib/services/exclusionLogicService');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, i) => i);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BET_PER_NUMBER_K = 1000;
const DEFAULT_WIN_MULTIPLIER = 84;
const DEFAULT_STRATEGIES = ['chainTier'];
const DEFAULT_TARGETS = [35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
const NUMBER_SCORE_STRATEGIES = new Set([
    'numberAvgRisk',
    'numberWeightedRisk',
    'numberConsensusRisk',
    'activeOnlyAvgRisk'
]);

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        historyYears: Number(args.get('historyYears') || 20),
        targets: String(args.get('targets') || DEFAULT_TARGETS.join(','))
            .split(',')
            .map(value => Number(value.trim()))
            .filter(value => Number.isFinite(value) && value > 0 && value < 100),
        maxBetCount: Number(args.get('maxBetCount') || 65),
        fixedBaselineYear: args.has('fixedBaselineYear') ? Number(args.get('fixedBaselineYear')) : null,
        startYear: args.has('startYear') ? Number(args.get('startYear')) : null,
        endYear: args.has('endYear') ? Number(args.get('endYear')) : null,
        activeFrequencyLimit: Number(args.get('activeFrequencyLimit') || 0.5),
        recordFrequencyLimit: Number(args.get('recordFrequencyLimit') || 1.1),
        minPotentialCurrentLenForNeverFormed: Number(args.get('minPotentialCurrentLenForNeverFormed') || 1),
        strategies: String(args.get('strategies') || args.get('strategy') || DEFAULT_STRATEGIES.join(','))
            .split(',')
            .map(value => value.trim())
            .filter(Boolean),
        winMultiplier: Number(args.get('winMultiplier') || DEFAULT_WIN_MULTIPLIER),
        useFullHistoryStats: args.get('useFullHistoryStats') === '1',
        activeOnly: args.get('activeOnly') !== '0',
        includeDetails: args.get('includeDetails') === '1',
        progress: args.get('progress') === '1',
        compact: args.get('compact') !== '0'
    };
}

function parseDate(value) {
    return historicalExclusionService.parseDate(value);
}

function formatDisplayDate(date) {
    return historicalExclusionService.formatDate(date);
}

function formatIso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function yearsBetween(start, end) {
    return Math.max(0.01, (end - start) / MS_PER_DAY / 365.25);
}

function normalizeNumber(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 && parsed < 100 ? parsed : null;
}

function toSpecialNumber(row) {
    return normalizeNumber(row && row.special);
}

function parseStatsKey(key = '') {
    if (String(key).includes(':')) {
        const [category, subcategory] = String(key).split(':');
        return { category, subcategory };
    }
    return { category: String(key), subcategory: '' };
}

function getPatternStep(key = '') {
    const lowerKey = String(key).toLowerCase();
    const isAlternatingGapPattern = (lowerKey.includes('vesole') || lowerKey.includes('solemoi')) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap') &&
        !/block\d+x\d+sole/.test(lowerKey);
    return isAlternatingGapPattern ? 2 : 1;
}

function isBlockPattern(candidateOrKey) {
    const key = typeof candidateOrKey === 'string'
        ? candidateOrKey
        : candidateOrKey?.key;
    return /block\d+x\d+sole/i.test(String(key || ''));
}

function flattenStats(allStats) {
    const rows = [];
    const add = (key, data) => {
        if (isInvalidStatsKey(key)) return;
        if (!data || !Array.isArray(data.streaks)) return;
        rows.push({ key, categoryData: data });
    };

    for (const [key, value] of Object.entries(allStats || {})) {
        if (value && Array.isArray(value.streaks)) {
            add(key, value);
        } else if (value && typeof value === 'object') {
            for (const [subKey, subValue] of Object.entries(value)) {
                add(`${key}:${subKey}`, subValue);
            }
        }
    }
    return rows;
}

function buildStatsIndex() {
    const allStats = historicalExclusionService.loadAllStats();
    const entries = new Map();
    for (const row of flattenStats(allStats)) {
        entries.set(row.key, row.categoryData);
    }
    return entries;
}

function buildAnnualBaseline(entries, year, options) {
    const cutoff = new Date(year - 1, 11, 31);
    const start = new Date(cutoff);
    start.setFullYear(start.getFullYear() - options.historyYears);
    start.setDate(start.getDate() + 1);
    const actualYears = yearsBetween(start, addDays(cutoff, 1));
    const baseline = new Map();

    for (const [key, categoryData] of entries.entries()) {
        const exactCounts = new Map();
        let recordLen = 0;
        let sample = 0;
        for (const streak of categoryData.streaks || []) {
            const end = parseDate(streak.endDate);
            if (!end || end < start || end > cutoff) continue;
            const len = Number(streak.length) || 0;
            if (len <= 0) continue;
            sample++;
            recordLen = Math.max(recordLen, len);
            exactCounts.set(len, (exactCounts.get(len) || 0) + 1);
        }
        const cumulative = new Map();
        for (let len = recordLen; len >= 1; len--) {
            cumulative.set(len, (cumulative.get(len + 1) || 0) + (exactCounts.get(len) || 0));
        }
        baseline.set(key, {
            key,
            year,
            cutoffIso: formatIso(cutoff),
            startIso: formatIso(start),
            actualYears,
            sample,
            recordLen,
            exactCounts,
            cumulative
        });
    }
    return baseline;
}

function getAnnualMetric(baseline, key, baseLen, step, isPotential) {
    const row = baseline.get(key);
    const actualYears = row ? row.actualYears : 20;
    const recordLen = row ? Number(row.recordLen || 0) : 0;
    const cumulative = row ? row.cumulative : new Map();
    const currentCount = cumulative.get(baseLen) || 0;
    const nextCount = cumulative.get(baseLen + step) || 0;
    const upperLen = Math.max(recordLen, baseLen);
    let exposureCount = 0;
    for (let len = baseLen; len <= upperLen; len += step) {
        exposureCount += cumulative.get(len) || 0;
    }
    const exposureFrequencyPerYear = exposureCount / actualYears;
    const reachedFrequencyPerYear = currentCount / actualYears;
    const continuationFrequencyPerYear = nextCount / actualYears;
    const riskRate = currentCount > 0 ? 1 - (nextCount / currentCount) : 1;

    return {
        recordLen,
        currentCount,
        nextCount,
        exposureCount,
        exposureFrequencyPerYear,
        reachedFrequencyPerYear,
        continuationFrequencyPerYear,
        riskRate,
        actualYears,
        neverFormed: recordLen === 0 || currentCount === 0,
        isPotential
    };
}

function resolveNumbers(stat, key) {
    const { category, subcategory } = parseStatsKey(key);
    return exclusionLogic.resolveNumbersForPattern(stat, key, category, subcategory, require('../lib/controllers/suggestionsController'));
}

function buildCandidatesForDate(targetDateDisplay, baseline, options) {
    const quickStats = historicalExclusionService.computeQuickStatsForDateFast(targetDateDisplay, options.historyYears, {
        useFullHistoryStats: !!options.useFullHistoryStats,
        activeOnly: options.activeOnly !== false
    });
    const candidates = [];

    for (const [key, stat] of Object.entries(quickStats || {})) {
        if (key === '_meta' || !stat || !stat.current || isInvalidStatsKey(key)) continue;
        const step = getPatternStep(key);
        const currentLen = Number(stat.current.length || 0);
        if (!Number.isFinite(currentLen) || currentLen <= 0) continue;

        const isPotential = !!stat.current.isPotential;
        const baseLen = isPotential ? currentLen + step : currentLen;
        if (baseLen < 2) continue;

        const numbers = resolveNumbers(stat, key);
        if (!numbers || numbers.length === 0 || numbers.length >= 100) continue;

        const metric = getAnnualMetric(baseline, key, baseLen, step, isPotential);
        const targetLen = baseLen + step;
        const neverFormedPriority = metric.neverFormed && (!isPotential || currentLen >= options.minPotentialCurrentLenForNeverFormed);
        const isRecordOrSuper = metric.recordLen > 0 && (baseLen >= metric.recordLen || targetLen > metric.recordLen);
        const tier = (neverFormedPriority || isRecordOrSuper)
            ? 1
            : (!isPotential && metric.exposureFrequencyPerYear < options.activeFrequencyLimit)
                ? 2
                : (metric.exposureFrequencyPerYear <= options.recordFrequencyLimit ? 3 : 4);
        const scarcityScore = 1 / (1 + Math.max(0, metric.exposureFrequencyPerYear));
        const score = (tier === 1 ? 1000 : tier === 2 ? 700 : tier === 3 ? 400 : 0) +
            metric.riskRate * 100 +
            scarcityScore * 50 +
            Math.min(40, numbers.length ? 30 / numbers.length : 0);

        candidates.push({
            key,
            currentLen,
            baseLen,
            targetLen,
            tier,
            score,
            numbers,
            isPotential,
            isRecordOrSuper,
            ...metric
        });
    }

    candidates.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (b.score !== a.score) return b.score - a.score;
        if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
        return a.key.localeCompare(b.key);
    });
    return candidates;
}

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
}

function getCandidateRiskScore(candidate) {
    const tierWeight = candidate.tier === 1 ? 1
        : candidate.tier === 2 ? 0.82
            : candidate.tier === 3 ? 0.65
                : 0.2;
    const frequencyScarcity = 1 / (1 + Math.max(0, candidate.exposureFrequencyPerYear || 0));
    const sampleReliability = candidate.currentCount > 0
        ? Math.min(1, Math.log1p(candidate.currentCount) / Math.log(50))
        : (candidate.neverFormed ? 0.62 : 0.18);
    const groupFocus = 1 / Math.sqrt(Math.max(1, candidate.numbers ? candidate.numbers.length : 100));
    const recordBoost = candidate.isRecordOrSuper ? 0.14 : 0;
    const base = clamp(candidate.riskRate || 0) * 0.52
        + frequencyScarcity * 0.22
        + sampleReliability * 0.18
        + groupFocus * 0.08
        + recordBoost;
    return base * tierWeight;
}

function compareCandidatesForStrategy(strategy) {
    return (a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (strategy === 'chainBlockFirst') {
            const blockDiff = Number(isBlockPattern(b)) - Number(isBlockPattern(a));
            if (blockDiff) return blockDiff;
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
            if (a.exposureFrequencyPerYear !== b.exposureFrequencyPerYear) {
                return a.exposureFrequencyPerYear - b.exposureFrequencyPerYear;
            }
            if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
        } else if (strategy === 'chainSmallFirst') {
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
            if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
            if (a.exposureFrequencyPerYear !== b.exposureFrequencyPerYear) {
                return a.exposureFrequencyPerYear - b.exposureFrequencyPerYear;
            }
        } else if (strategy === 'chainFreqFirst') {
            if (a.exposureFrequencyPerYear !== b.exposureFrequencyPerYear) {
                return a.exposureFrequencyPerYear - b.exposureFrequencyPerYear;
            }
            if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
        } else if (strategy === 'chainRiskFirst') {
            if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
            if (a.exposureFrequencyPerYear !== b.exposureFrequencyPerYear) {
                return a.exposureFrequencyPerYear - b.exposureFrequencyPerYear;
            }
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
        }
        if (b.score !== a.score) return b.score - a.score;
        if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
        return a.key.localeCompare(b.key);
    };
}

function serializeChain(candidate) {
    return {
        key: candidate.key,
        tier: candidate.tier,
        score: Math.round(candidate.score * 10) / 10,
        numberRiskScore: Math.round(getCandidateRiskScore(candidate) * 1000) / 10,
        currentLen: candidate.currentLen,
        baseLen: candidate.baseLen,
        targetLen: candidate.targetLen,
        recordLen: candidate.recordLen,
        riskRate: Math.round(candidate.riskRate * 1000) / 10,
        exposureFrequencyPerYear: Math.round(candidate.exposureFrequencyPerYear * 100) / 100,
        numbers: candidate.numbers.map(num => String(num).padStart(2, '0'))
    };
}

function getNumberMemberships(num, candidates, strategy) {
    return candidates
        .filter(item => item.tier <= 3 && item.numbers.includes(num))
        .filter(item => strategy !== 'activeOnlyAvgRisk' || !item.isPotential);
}

function rankNumbersByMembership(candidates, strategy) {
    return ALL_NUMBERS.map(num => {
        const memberships = getNumberMemberships(num, candidates, strategy);
        if (memberships.length === 0) {
            return { num, score: 0, memberships: 0, topChains: [] };
        }
        const scores = memberships
            .map(item => ({
                item,
                score: getCandidateRiskScore(item)
            }))
            .sort((a, b) => b.score - a.score);
        const sumScore = scores.reduce((sum, row) => sum + row.score, 0);
        const avgScore = sumScore / scores.length;
        const top3Avg = scores.slice(0, 3).reduce((sum, row) => sum + row.score, 0) / Math.min(3, scores.length);
        const tier1Count = scores.filter(row => row.item.tier === 1).length;
        const consensus = Math.log1p(scores.length) * 0.08 + tier1Count * 0.06;
        let score;
        if (strategy === 'numberWeightedRisk') {
            score = sumScore + avgScore * 0.5 + consensus;
        } else if (strategy === 'numberConsensusRisk') {
            score = top3Avg + consensus + Math.min(0.3, scores.length * 0.018);
        } else {
            score = avgScore + top3Avg * 0.35 + consensus;
        }
        return {
            num,
            score,
            memberships: scores.length,
            topChains: scores.slice(0, 3).map(row => row.item)
        };
    }).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.memberships !== a.memberships) return b.memberships - a.memberships;
        return a.num - b.num;
    });
}

function buildPredictionFromNumberScores(candidates, targetExcluded, strategy) {
    const ranked = rankNumbersByMembership(candidates, strategy);
    const excluded = ranked.slice(0, targetExcluded).map(row => row.num).sort((a, b) => a - b);
    const excludedSet = new Set(excluded);
    const topChains = [];
    const seen = new Set();
    for (const row of ranked.slice(0, targetExcluded)) {
        for (const chain of row.topChains) {
            if (seen.has(chain.key)) continue;
            seen.add(chain.key);
            topChains.push(chain);
            if (topChains.length >= 20) break;
        }
        if (topChains.length >= 20) break;
    }
    return {
        strategy,
        targetExcluded,
        excluded,
        toBet: ALL_NUMBERS.filter(num => !excludedSet.has(num)),
        selectedChains: topChains.map(serializeChain)
    };
}

function buildPrediction(candidates, targetExcluded, strategy = 'chainTier') {
    if (NUMBER_SCORE_STRATEGIES.has(strategy)) {
        return buildPredictionFromNumberScores(candidates, targetExcluded, strategy);
    }

    const orderedCandidates = candidates.slice().sort(compareCandidatesForStrategy(strategy));
    const excluded = new Set();
    const selectedChains = [];

    for (const candidate of orderedCandidates.filter(item => item.tier <= 3)) {
        const additions = candidate.numbers
            .filter(num => !excluded.has(num))
            .sort((a, b) => a - b);
        if (additions.length > 0) selectedChains.push(candidate);
        for (const num of additions) {
            excluded.add(num);
            if (excluded.size >= targetExcluded) break;
        }
        if (excluded.size >= targetExcluded) break;
    }

    if (excluded.size < targetExcluded) {
        const numberScores = ALL_NUMBERS
            .filter(num => !excluded.has(num))
            .map(num => {
                const memberships = candidates.filter(item => item.numbers.includes(num));
                const totalScore = memberships.reduce((sum, item) => sum + item.score, 0);
                const avgScore = memberships.length > 0 ? totalScore / memberships.length : 0;
                return { num, score: totalScore + avgScore, memberships: memberships.length };
            })
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.memberships !== a.memberships) return b.memberships - a.memberships;
                return a.num - b.num;
            });
        for (const row of numberScores) {
            excluded.add(row.num);
            if (excluded.size >= targetExcluded) break;
        }
    }

    const excludedNumbers = [...excluded].sort((a, b) => a - b);
    const toBet = ALL_NUMBERS.filter(num => !excluded.has(num));
    return {
        strategy,
        targetExcluded,
        excluded: excludedNumbers,
        toBet,
        selectedChains: selectedChains.slice(0, 20).map(serializeChain)
    };
}

function settle(prediction, actualNumber, winMultiplier) {
    const hit = prediction.toBet.includes(actualNumber);
    const stakeK = prediction.toBet.length * BET_PER_NUMBER_K;
    const payoutK = hit ? BET_PER_NUMBER_K * winMultiplier : 0;
    return {
        hit,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        betCount: prediction.toBet.length,
        excludedCount: prediction.excluded.length
    };
}

function emptySummary(target) {
    return {
        strategy: '',
        target,
        days: 0,
        wins: 0,
        losses: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        currentType: '',
        currentLength: 0
    };
}

function updateSummary(summary, result) {
    summary.days++;
    summary.stakeK += result.stakeK;
    summary.payoutK += result.payoutK;
    summary.profitK += result.profitK;
    const type = result.hit ? 'win' : 'loss';
    if (result.hit) summary.wins++;
    else summary.losses++;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    if (type === 'win') summary.longestWin = Math.max(summary.longestWin, summary.currentLength);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.currentLength);
}

function finalizeSummary(summary) {
    return {
        strategy: summary.strategy,
        target: summary.target,
        days: summary.days,
        wins: summary.wins,
        losses: summary.losses,
        winRate: summary.days ? Math.round((summary.wins / summary.days) * 10000) / 100 : 0,
        stakeK: summary.stakeK,
        payoutK: summary.payoutK,
        profitK: summary.profitK,
        roi: summary.stakeK ? Math.round((summary.profitK / summary.stakeK) * 10000) / 100 : 0,
        longestWin: summary.longestWin,
        longestLoss: summary.longestLoss
    };
}

function csvEscape(value) {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

async function main() {
    const options = parseArgs();
    options.targets = options.targets
        .filter(target => 100 - target <= options.maxBetCount)
        .sort((a, b) => a - b);
    if (options.targets.length === 0) {
        throw new Error(`Không còn target hợp lệ sau khi lọc maxBetCount=${options.maxBetCount}.`);
    }
    await lotteryService.loadAll();
    const rawData = lotteryService.getRawData()
        .filter(row => row && row.date && row.special !== null && row.special !== undefined)
        .slice()
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const entries = buildStatsIndex();
    const baselines = new Map();
    const summaryKeys = [];
    for (const strategy of options.strategies) {
        for (const target of options.targets) summaryKeys.push(`${strategy}|${target}`);
    }
    const summaries = new Map(summaryKeys.map(key => {
        const [strategy, target] = key.split('|');
        const summary = emptySummary(Number(target));
        summary.strategy = strategy;
        return [key, summary];
    }));
    const yearly = new Map();
    const details = [];
    let skippedBeforeWarmup = 0;
    let lastProgressYear = null;
    let evaluatedDays = 0;

    for (let index = 1; index < rawData.length; index++) {
        const targetRow = rawData[index];
        const targetDate = parseDate(targetRow.date);
        if (!targetDate) continue;
        const year = targetDate.getFullYear();
        if (options.startYear && year < options.startYear) continue;
        if (options.endYear && year > options.endYear) continue;
        if (options.progress && year !== lastProgressYear) {
            lastProgressYear = year;
            console.log(`[Annual20Y] Processing year ${year} with baseline ${options.fixedBaselineYear || year}...`);
        }

        const baselineYear = options.fixedBaselineYear || year;
        if (!options.fixedBaselineYear) {
            const baselineCutoff = new Date(year - 1, 11, 31);
            const minStart = new Date(baselineCutoff);
            minStart.setFullYear(minStart.getFullYear() - options.historyYears);
            const firstDate = parseDate(rawData[0].date);
            if (!firstDate || firstDate > minStart) {
                skippedBeforeWarmup++;
                continue;
            }
        }

        if (!baselines.has(baselineYear)) {
            baselines.set(baselineYear, buildAnnualBaseline(entries, baselineYear, options));
        }
        const baseline = baselines.get(baselineYear);
        const targetDisplay = formatDisplayDate(targetDate);
        const candidates = buildCandidatesForDate(targetDisplay, baseline, options);
        const actual = toSpecialNumber(targetRow);
        if (actual === null) continue;
        evaluatedDays++;

        const day = options.includeDetails
            ? {
                date: formatIso(targetDate),
                year,
                baselineYear,
                actual: String(actual).padStart(2, '0'),
                candidateCount: candidates.length,
                results: {}
            }
            : null;

        for (const strategy of options.strategies) {
            for (const target of options.targets) {
                const prediction = buildPrediction(candidates, target, strategy);
                const result = settle(prediction, actual, options.winMultiplier);
                const summaryKey = `${strategy}|${target}`;
                updateSummary(summaries.get(summaryKey), result);
                const yearKey = `${year}|${strategy}|${target}`;
                if (!yearly.has(yearKey)) {
                    const yearSummary = emptySummary(target);
                    yearSummary.strategy = strategy;
                    yearly.set(yearKey, yearSummary);
                }
                updateSummary(yearly.get(yearKey), result);
                if (day) {
                    day.results[`${strategy}:hold${target}`] = {
                        ...result,
                        toBet: options.compact ? prediction.toBet.map(n => String(n).padStart(2, '0')) : prediction.toBet,
                        excluded: options.compact ? prediction.excluded.map(n => String(n).padStart(2, '0')) : prediction.excluded,
                        selectedChains: prediction.selectedChains
                    };
                }
            }
        }
        if (day) details.push(day);
    }

    const summaryRows = [...summaries.values()].map(finalizeSummary)
        .sort((a, b) => b.profitK - a.profitK || b.winRate - a.winRate);
    const yearlyRows = [...yearly.entries()]
        .map(([key, value]) => {
            const [year] = key.split('|');
            return { year: Number(year), ...finalizeSummary(value) };
        })
        .sort((a, b) => a.year - b.year || a.strategy.localeCompare(b.strategy) || a.target - b.target);

    const output = {
        generatedAt: new Date().toISOString(),
        options,
        skippedBeforeWarmup,
        evaluatedDays,
        baselineYears: [...baselines.keys()].sort(),
        summary: summaryRows,
        yearly: yearlyRows,
        details
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const jsonPath = path.join(outDir, `annual_20y_milestone_backtest_${stamp}.json`);
    const csvPath = path.join(outDir, `annual_20y_milestone_backtest_summary_${stamp}.csv`);
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
    const headers = ['strategy', 'target', 'days', 'wins', 'losses', 'winRate', 'stakeK', 'payoutK', 'profitK', 'roi', 'longestWin', 'longestLoss'];
    fs.writeFileSync(csvPath, [
        headers.join(','),
        ...summaryRows.map(row => headers.map(header => csvEscape(row[header])).join(','))
    ].join('\n'));

    console.log('[Annual20Y] Summary');
    console.table(summaryRows);
    console.log(`[Annual20Y] skippedBeforeWarmup=${skippedBeforeWarmup}, baselineYears=${output.baselineYears.join(',')}`);
    console.log(`[Annual20Y] JSON: ${jsonPath}`);
    console.log(`[Annual20Y] CSV: ${csvPath}`);
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exit(1);
});
