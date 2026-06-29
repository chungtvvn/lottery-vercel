#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const BET_PER_NUMBER_K = 1000;
const DEFAULT_WIN_MULTIPLIER = 84;

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        startDate: args.get('startDate') || '2026-01-01',
        endDate: args.get('endDate') || null,
        baselineYear: Number(args.get('baselineYear') || 2026),
        historyYears: Number(args.get('historyYears') || 20),
        targets: String(args.get('targets') || '35,40,45,50,55,60,65,70,75,80')
            .split(',')
            .map(value => Number(value.trim()))
            .filter(value => Number.isInteger(value) && value > 0 && value < 100),
        winMultiplier: Number(args.get('winMultiplier') || DEFAULT_WIN_MULTIPLIER),
        activeFrequencyLimit: Number(args.get('activeFrequencyLimit') || 0.5),
        recordFrequencyLimit: Number(args.get('recordFrequencyLimit') || 1.1),
        minPotentialCurrentLenForNeverFormed: Number(args.get('minPotentialLen') || 1)
    };
}

function parseDate(value) {
    return historicalExclusionService.parseDate(value);
}

function formatIso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDisplayDate(date) {
    return historicalExclusionService.formatDate(date);
}

function normalizeNumber(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 && parsed < 100 ? parsed : null;
}

function toSpecialNumber(row) {
    return normalizeNumber(row && row.special);
}

function flattenStats(allStats) {
    const rows = [];
    const add = (key, data) => {
        if (isInvalidStatsKey(key)) return;
        if (!data || !Array.isArray(data.streaks)) return;
        rows.push({ key, categoryData: data });
    };

    for (const [key, value] of Object.entries(allStats || {})) {
        if (value && Array.isArray(value.streaks)) add(key, value);
        else if (value && typeof value === 'object') {
            for (const [subKey, subValue] of Object.entries(value)) add(`${key}:${subKey}`, subValue);
        }
    }
    return rows;
}

function buildStatsIndex() {
    const allStats = historicalExclusionService.loadAllStats();
    const entries = new Map();
    for (const row of flattenStats(allStats)) entries.set(row.key, row.categoryData);
    return entries;
}

function isBlockPattern(candidate) {
    return /block\d+x\d+sole/i.test(candidate?.key || '');
}

function tierWeight(candidate) {
    return candidate.tier === 1 ? 1
        : candidate.tier === 2 ? 0.82
            : candidate.tier === 3 ? 0.65
                : 0.2;
}

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function logit(value) {
    const p = clamp(value, 0.001, 0.999);
    return Math.log(p / (1 - p));
}

function wilsonLower(successes, trials, z = 1.64) {
    const n = Number(trials) || 0;
    if (n <= 0) return 0;
    const p = clamp((Number(successes) || 0) / n);
    const z2 = z * z;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return clamp((center - margin) / (1 + z2 / n));
}

function bayesBreakRisk(candidate) {
    const trials = Math.max(0, Number(candidate.currentCount || 0));
    const continues = Math.max(0, Number(candidate.nextCount || 0));
    const breaks = Math.max(0, trials - continues);
    const rawRisk = clamp(candidate.riskRate || 0);
    const priorMean = candidate.neverFormed ? 0.96
        : candidate.isRecordOrSuper ? 0.92
            : candidate.tier === 2 ? 0.82
                : candidate.tier === 3 ? 0.72
                    : 0.58;
    const priorWeight = candidate.neverFormed ? 8
        : candidate.isRecordOrSuper ? 7
            : candidate.tier <= 2 ? 5
                : 3;
    const posterior = (breaks + priorMean * priorWeight) / Math.max(1, trials + priorWeight);
    const lower = trials > 0 ? wilsonLower(breaks, trials) : priorMean * 0.72;
    return clamp(posterior * 0.66 + lower * 0.24 + rawRisk * 0.1);
}

function reliabilityWeight(candidate) {
    const sample = candidate.currentCount > 0
        ? Math.min(1, Math.log1p(candidate.currentCount) / Math.log(80))
        : (candidate.neverFormed ? 0.58 : 0.12);
    const scarcity = 1 / (1 + Math.max(0, Number(candidate.exposureFrequencyPerYear || 0)));
    const small = 1 / Math.sqrt(Math.max(1, candidate.numbers?.length || 100));
    const activeBoost = candidate.isPotential ? 0.82 : 1.08;
    const blockBoost = isBlockPattern(candidate) ? 1.08 : 1;
    const recordBoost = candidate.isRecordOrSuper ? 1.1 : 1;
    return tierWeight(candidate) * (0.4 + sample * 0.6) * (0.45 + scarcity * 0.55) *
        (0.5 + small * 0.5) * activeBoost * blockBoost * recordBoost;
}

function bayesChainScore(candidate, options = {}) {
    const risk = bayesBreakRisk(candidate);
    const weight = reliabilityWeight(candidate);
    const small = 1 / Math.sqrt(Math.max(1, candidate.numbers?.length || 100));
    const freq = 1 / (1 + Math.max(0, Number(candidate.exposureFrequencyPerYear || 0)));
    const activeBoost = options.activeFirst && !candidate.isPotential ? 0.08 : 0;
    const potentialPenalty = options.activeFirst && candidate.isPotential ? 0.06 : 0;
    const consensusPenalty = (candidate.numbers?.length || 0) > 40 ? 0.06 : 0;
    return risk * 0.55 + weight * 0.22 + small * 0.13 + freq * 0.1 + activeBoost - potentialPenalty - consensusPenalty;
}

function riskScore(candidate, variant = '') {
    const freq = Math.max(0, Number(candidate.exposureFrequencyPerYear || 0));
    const scarcity = 1 / (1 + freq);
    const small = 1 / Math.sqrt(Math.max(1, candidate.numbers?.length || 100));
    const sample = candidate.currentCount > 0
        ? Math.min(1, Math.log1p(candidate.currentCount) / Math.log(60))
        : (candidate.neverFormed ? 0.7 : 0.15);
    const block = isBlockPattern(candidate) ? 1 : 0;
    const record = candidate.isRecordOrSuper ? 1 : 0;
    const potentialPenalty = candidate.isPotential ? 0.035 : 0;
    const broadPenalty = (candidate.numbers?.length || 100) > 35 ? 0.045 : 0;

    if (variant === 'blockAggressive') {
        return tierWeight(candidate) * (
            Number(candidate.riskRate || 0) * 0.42 +
            scarcity * 0.21 +
            small * 0.18 +
            sample * 0.09 +
            block * 0.13 +
            record * 0.08 -
            potentialPenalty -
            broadPenalty
        );
    }

    if (variant === 'smallGuard') {
        return tierWeight(candidate) * (
            Number(candidate.riskRate || 0) * 0.44 +
            scarcity * 0.25 +
            small * 0.22 +
            sample * 0.08 +
            record * 0.08 +
            block * 0.04 -
            potentialPenalty -
            broadPenalty * 1.2
        );
    }

    return tierWeight(candidate) * (
        Number(candidate.riskRate || 0) * 0.46 +
        scarcity * 0.22 +
        small * 0.16 +
        sample * 0.1 +
        record * 0.08 +
        block * 0.06 -
        potentialPenalty -
        broadPenalty
    );
}

function compareChainVariant(name) {
    return (a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (name === 'chainBlockFirst') {
            const blockDiff = Number(isBlockPattern(b)) - Number(isBlockPattern(a));
            if (blockDiff) return blockDiff;
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
            if (a.exposureFrequencyPerYear !== b.exposureFrequencyPerYear) return a.exposureFrequencyPerYear - b.exposureFrequencyPerYear;
            if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
        }
        if (name === 'chainSmallGuard') {
            const sa = riskScore(a, 'smallGuard');
            const sb = riskScore(b, 'smallGuard');
            if (sb !== sa) return sb - sa;
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
        }
        if (name === 'chainBlockScore') {
            const sa = riskScore(a, 'blockAggressive');
            const sb = riskScore(b, 'blockAggressive');
            if (sb !== sa) return sb - sa;
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
        }
        if (name === 'chainBayesFirst' || name === 'chainActiveBayesFirst') {
            const activeFirst = name === 'chainActiveBayesFirst';
            if (activeFirst && Number(!a.isPotential) !== Number(!b.isPotential)) {
                return Number(!b.isPotential) - Number(!a.isPotential);
            }
            const sa = bayesChainScore(a, { activeFirst });
            const sb = bayesChainScore(b, { activeFirst });
            if (sb !== sa) return sb - sa;
            if (a.numbers.length !== b.numbers.length) return a.numbers.length - b.numbers.length;
        }
        if (b.score !== a.score) return b.score - a.score;
        if (b.riskRate !== a.riskRate) return b.riskRate - a.riskRate;
        return String(a.key).localeCompare(String(b.key));
    };
}

function buildChainPrediction(candidates, targetExcluded, name) {
    const excluded = new Set();
    const selectedChains = [];
    for (const candidate of candidates.slice().sort(compareChainVariant(name)).filter(item => item.tier <= 3)) {
        const additions = candidate.numbers.filter(num => !excluded.has(num)).sort((a, b) => a - b);
        if (additions.length > 0) selectedChains.push(candidate);
        for (const num of additions) {
            excluded.add(num);
            if (excluded.size >= targetExcluded) break;
        }
        if (excluded.size >= targetExcluded) break;
    }
    return finalizePrediction(excluded, selectedChains);
}

function buildNumberPrediction(candidates, targetExcluded, name) {
    const variant = name === 'numberBlockConsensus' ? 'blockAggressive' : 'smallGuard';
    const ranked = ALL_NUMBERS.map(num => {
        const memberships = candidates
            .filter(item => item.tier <= 3 && item.numbers.includes(num))
            .filter(item => !name.includes('Active') || !item.isPotential);
        if (!memberships.length) return { num, score: 0, memberships: 0 };
        const scored = memberships.map(item => {
            const denominator = Math.sqrt(Math.max(1, item.numbers.length));
            const baseRisk = name.includes('Bayes') || name.includes('LogOdds')
                ? bayesBreakRisk(item)
                : riskScore(item, variant);
            const score = name.includes('Bayes') || name.includes('LogOdds')
                ? baseRisk * reliabilityWeight(item) / denominator
                : baseRisk / denominator;
            return { item, score, risk: baseRisk };
        }).sort((a, b) => b.score - a.score);
        const sum = scored.reduce((total, row) => total + row.score, 0);
        const avg = sum / scored.length;
        const top5 = scored.slice(0, 5).reduce((total, row) => total + row.score, 0) / Math.min(5, scored.length);
        const top8 = scored.slice(0, 8).reduce((total, row) => total + row.score, 0) / Math.min(8, scored.length);
        const tier1 = scored.filter(row => row.item.tier === 1).length;
        const block = scored.filter(row => isBlockPattern(row.item)).length;
        const active = scored.filter(row => !row.item.isPotential).length;
        const consensus = Math.log1p(scored.length) * 0.065 + tier1 * 0.055 + block * 0.018 + active * 0.006;
        const logOdds = scored.slice(0, 10).reduce((total, row) => {
            const evidenceWeight = reliabilityWeight(row.item) / Math.sqrt(Math.max(1, row.item.numbers.length));
            return total + logit(row.risk) * evidenceWeight;
        }, 0);
        let score;
        if (name === 'numberBlockConsensus') {
            score = top5 * 0.78 + avg * 0.35 + consensus;
        } else if (name === 'numberBayesTop') {
            score = top5 * 0.95 + top8 * 0.35 + consensus * 0.55;
        } else if (name === 'numberBayesActive') {
            score = top5 * 1.05 + avg * 0.35 + consensus * 0.4;
        } else if (name === 'numberLogOddsActive') {
            score = logOdds + top5 * 0.55 + consensus * 0.3;
        } else if (name === 'numberRobustConsensus') {
            score = top5 * 0.72 + avg * 0.42 + Math.min(0.45, consensus);
        } else {
            score = sum * 0.62 + top5 * 0.45 + consensus;
        }
        return { num, score, memberships: scored.length };
    }).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.memberships !== a.memberships) return b.memberships - a.memberships;
        return a.num - b.num;
    });

    return finalizePrediction(new Set(ranked.slice(0, targetExcluded).map(row => row.num)), []);
}

function normalizeProductionPrediction(prediction) {
    if (prediction.toBet) return prediction;
    const excluded = (prediction.excludedNumbers || []).map(Number).filter(Number.isFinite);
    const excludedSet = new Set(excluded);
    return {
        excluded,
        toBet: ALL_NUMBERS.filter(num => !excludedSet.has(num)),
        selectedChains: prediction.selectedChains || []
    };
}

function buildEnsemblePrediction(candidates, targetExcluded, name) {
    const chainWeights = name === 'ensembleBalancedVote'
        ? [
            ['chainBlockFirst', 1],
            ['chainSmallFirst', 0.85],
            ['activeOnlyAvgRisk', 0.72],
            ['numberRobustConsensus', 0.46],
            ['chainBlockScore', 0.38]
        ]
        : [
            ['chainBlockFirst', 1],
            ['chainSmallFirst', 0.62],
            ['activeOnlyAvgRisk', 0.5],
            ['numberRobustConsensus', 0.28]
        ];
    const rows = ALL_NUMBERS.map(num => ({ num, score: 0, votes: 0 }));
    const byNumber = new Map(rows.map(row => [row.num, row]));

    for (const [strategy, weight] of chainWeights) {
        let prediction;
        if (strategy === 'chainBlockScore' || strategy === 'numberRobustConsensus') {
            prediction = strategy === 'chainBlockScore'
                ? buildChainPrediction(candidates, targetExcluded, strategy)
                : buildNumberPrediction(candidates, targetExcluded, strategy);
        } else {
            prediction = normalizeProductionPrediction(
                annualMilestoneService.buildPrediction(candidates, targetExcluded, strategy)
            );
        }
        for (const num of prediction.excluded || []) {
            const row = byNumber.get(num);
            if (!row) continue;
            row.score += weight;
            row.votes += 1;
        }
    }

    const membershipScores = ALL_NUMBERS.map(num => {
        const memberships = candidates.filter(item => item.tier <= 3 && item.numbers.includes(num));
        if (!memberships.length) return { num, score: 0 };
        const scored = memberships
            .map(item => bayesBreakRisk(item) * reliabilityWeight(item) / Math.sqrt(Math.max(1, item.numbers.length)))
            .sort((a, b) => b - a);
        const top3 = scored.slice(0, 3).reduce((sum, value) => sum + value, 0);
        return { num, score: top3 };
    });
    const maxMembershipScore = Math.max(1e-9, ...membershipScores.map(row => row.score));
    for (const row of membershipScores) {
        const voteRow = byNumber.get(row.num);
        if (voteRow) voteRow.score += (row.score / maxMembershipScore) * (name === 'ensembleBalancedVote' ? 0.3 : 0.18);
    }

    rows.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.votes !== a.votes) return b.votes - a.votes;
        return a.num - b.num;
    });
    return finalizePrediction(new Set(rows.slice(0, targetExcluded).map(row => row.num)), []);
}

function finalizePrediction(excludedSet, selectedChains) {
    const excluded = [...excludedSet].sort((a, b) => a - b);
    const excludedLookup = new Set(excluded);
    return {
        excluded,
        toBet: ALL_NUMBERS.filter(num => !excludedLookup.has(num)),
        selectedChains
    };
}

function settle(prediction, actualNumber, winMultiplier) {
    const hit = prediction.toBet.includes(actualNumber);
    const stakeK = prediction.toBet.length * BET_PER_NUMBER_K;
    const payoutK = hit ? BET_PER_NUMBER_K * winMultiplier : 0;
    return { hit, stakeK, payoutK, profitK: payoutK - stakeK };
}

function emptySummary(strategy, target) {
    return {
        strategy,
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
    summary.days += 1;
    summary.stakeK += result.stakeK;
    summary.payoutK += result.payoutK;
    summary.profitK += result.profitK;
    const type = result.hit ? 'win' : 'loss';
    if (result.hit) summary.wins += 1;
    else summary.losses += 1;
    if (summary.currentType === type) summary.currentLength += 1;
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

async function main() {
    const options = parseArgs();
    await lotteryService.loadAll();
    const rawData = lotteryService.getRawData()
        .filter(row => row && row.date && row.special !== null && row.special !== undefined)
        .slice()
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const entries = buildStatsIndex();
    const baseline = annualMilestoneService.buildAnnualBaseline(entries, options.baselineYear, {
        historyYears: options.historyYears,
        writeBaseline: false
    });
    const endDate = options.endDate ? parseDate(options.endDate) : parseDate(rawData[rawData.length - 1].date);
    const startDate = parseDate(options.startDate);
    const variantNames = [
        'chainSmallFirst',
        'chainBlockFirst',
        'chainBlockScore',
        'chainSmallGuard',
        'chainBayesFirst',
        'chainActiveBayesFirst',
        'numberBlockConsensus',
        'numberSmallWeighted',
        'numberBayesTop',
        'numberBayesActive',
        'numberLogOddsActive',
        'numberRobustConsensus',
        'ensembleProfitVote',
        'ensembleBalancedVote'
    ];
    const summaries = new Map();
    for (const variant of variantNames) {
        for (const target of options.targets) summaries.set(`${variant}|${target}`, emptySummary(variant, target));
    }

    for (const row of rawData) {
        const targetDate = parseDate(row.date);
        if (!targetDate || targetDate < startDate || targetDate > endDate) continue;
        const actual = toSpecialNumber(row);
        if (actual === null) continue;
        const candidates = annualMilestoneService.buildCandidatesForDate(formatDisplayDate(targetDate), baseline, {
            historyYears: options.historyYears,
            activeFrequencyLimit: options.activeFrequencyLimit,
            recordFrequencyLimit: options.recordFrequencyLimit,
            minPotentialCurrentLenForNeverFormed: options.minPotentialCurrentLenForNeverFormed
        });

        for (const variant of variantNames) {
            for (const target of options.targets) {
                const prediction = variant === 'chainSmallFirst'
                    ? annualMilestoneService.buildPrediction(candidates, target, 'chainSmallFirst')
                    : variant.startsWith('ensemble')
                        ? buildEnsemblePrediction(candidates, target, variant)
                    : variant.startsWith('number')
                        ? buildNumberPrediction(candidates, target, variant)
                        : buildChainPrediction(candidates, target, variant);
                const normalizedPrediction = prediction.toBet
                    ? prediction
                    : {
                        toBet: (prediction.betNumbers || []).map(Number),
                        excluded: (prediction.excludedNumbers || []).map(Number)
                    };
                updateSummary(summaries.get(`${variant}|${target}`), settle(normalizedPrediction, actual, options.winMultiplier));
            }
        }
    }

    const summary = [...summaries.values()]
        .map(finalizeSummary)
        .sort((a, b) => {
            if (b.profitK !== a.profitK) return b.profitK - a.profitK;
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return a.strategy.localeCompare(b.strategy);
        });
    console.table(summary.slice(0, 40));
    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = path.join(outputDir, `research_milestone20y_variants_${stamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), options, summary }, null, 2), 'utf8');
    console.log(`[Research] JSON: ${outputPath}`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
