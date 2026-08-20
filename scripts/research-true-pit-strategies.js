#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const simulationService = require('../lib/services/simulationService');
const generateNumberStats = require('../lib/generators/statisticsGenerator');
const generateHeadTailStats = require('../lib/generators/headTailStatsGenerator');
const generateSumDiffStats = require('../lib/generators/sumDifferenceStatsGenerator');
const { isInvalidStatsKey } = require('../lib/utils/statsOptionsManifest');
const {
    buildBacktestFingerprint,
    hashCanonical,
    readJsonSnapshot
} = require('../lib/utils/backtestFingerprint');

const STRATEGIES = annualMilestoneService.STRATEGY_IDS;
const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
// These are the rolling (D-1) strategies that have an equivalent production
// implementation.  They are kept explicit so research reports cannot silently
// include an experimental method that is not available to users.
const ROLLING_SMALL_DAN_METHODS = [
    'chainSmallFirst',
    'chainBlockFirst',
    'dedupEdge75',
    'deParallelBlock85Small65'
];

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    const target = Number(args.get('target') || 70);
    const targets = [...new Set(
        String(args.get('targets') || target)
            .split(',')
            .map(value => Number(value.trim()))
            .filter(value => Number.isInteger(value) && value > 0 && value < 100)
    )];
    if (!targets.includes(target)) targets.push(target);
    targets.sort((a, b) => a - b);
    const rollingTargets = [...new Set(
        String(args.get('rollingTargets') || '')
            .split(',')
            .map(value => Number(value.trim()))
            .filter(value => Number.isInteger(value) && value > 0 && value < 100)
    )].sort((a, b) => a - b);
    const rollingSmallDanMethods = args.get('rollingSmallDanMethods')
        ? String(args.get('rollingSmallDanMethods'))
            .split(',')
            .map(value => value.trim())
            .filter(value => ROLLING_SMALL_DAN_METHODS.includes(value))
        : ROLLING_SMALL_DAN_METHODS.slice();
    const strategyIds = args.get('strategies')
        ? String(args.get('strategies'))
            .split(',')
            .map(value => value.trim())
            .filter(value => STRATEGIES.includes(value))
        : STRATEGIES.slice();
    if (strategyIds.length === 0) {
        throw new Error('Không có strategy hợp lệ trong --strategies.');
    }
    return {
        startDate: args.get('startDate') || '2026-01-01',
        endDate: args.get('endDate') || '2026-07-02',
        target,
        targets,
        strategyIds,
        historyYears: Number(args.get('historyYears') || 20),
        minPotentialLen: Number(args.get('minPotentialLen') || 4),
        dateStep: Math.max(1, Number(args.get('dateStep') || 3)),
        dateOffset: Math.max(0, Number(args.get('dateOffset') || 0)),
        workers: Math.max(1, Number(args.get('workers') || 8)),
        // Inline mode trades throughput for a bounded memory footprint. It is
        // useful for full daily strict-PIT research on machines with limited RAM.
        inline: String(args.get('inline') || '0') === '1',
        betPerNumberK: Number(args.get('betPerNumberK') || 1000),
        winMultiplier: Number(args.get('winMultiplier') || 84),
        includeEvidence: String(args.get('includeEvidence') || '1') !== '0',
        includeCandidateDiagnostics: String(args.get('includeCandidateDiagnostics') || '0') === '1',
        includeRollingParallel: String(args.get('includeRollingParallel') || '0') === '1',
        includeRollingEdge75: String(args.get('includeRollingEdge75') || '0') === '1',
        includeRollingSmallDan: String(args.get('includeRollingSmallDan') || '0') === '1',
        rollingTargets,
        rollingSmallDanMethods,
        rawFile: args.get('rawFile') || null,
        baselineCutoffDate: args.get('baselineCutoffDate') || null,
        checkpointFile: args.get('checkpointFile') || null,
        resumeRowsFile: args.get('resumeRowsFile') || null,
        reportFile: args.get('reportFile') || null
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

async function generateStats(raw, quiet = true) {
    const input = raw.map(row => ({ date: row.date, special: Number(row.special) }));
    const originalLog = console.log;
    if (quiet) console.log = () => {};
    const startedAt = Date.now();
    try {
        // These generators each create a substantial transient object graph.
        // Running them together is faster but exceeds the GitHub runner and
        // local Node heap during 20-year strict-PIT baselines.
        const numberStats = await generateNumberStats(null, null, input);
        if (global.gc) global.gc();
        const headTailStats = await generateHeadTailStats(null, null, input);
        if (global.gc) global.gc();
        const sumDiffStats = await generateSumDiffStats(null, null, input);
        return {
            numberStats,
            headTailStats,
            sumDiffStats,
            elapsedMs: Date.now() - startedAt
        };
    } finally {
        console.log = originalLog;
    }
}

function serializeBaseline(baseline) {
    return Array.from(baseline.entries()).map(([key, row]) => ({
        ...row,
        key,
        exactCounts: Array.from(row.exactCounts || []),
        cumulative: Array.from(row.cumulative || [])
    }));
}

function deserializeBaseline(rows) {
    return new Map((rows || []).map(row => [row.key, {
        ...row,
        exactCounts: new Map(row.exactCounts || []),
        cumulative: new Map(row.cumulative || [])
    }]));
}

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function evidenceFamily(key = '') {
    const normalized = String(key).toLowerCase();
    if (/block\d+x\d+sole/.test(normalized)) return 'block';
    if (/^(bo_|bo:)/.test(normalized)) return 'fixed-set';
    if (/^dau_.*dit_|^dit_.*dau_/.test(normalized)) return 'head-tail';
    if (/^(dau_|dau:)/.test(normalized)) return 'head';
    if (/^(dit_|dit:)/.test(normalized)) return 'tail';
    if (/^(tong_moi|tong_tt|tong_|tong:)/.test(normalized)) return 'sum';
    if (/^(hieu_|hieu:)/.test(normalized)) return 'difference';
    if (/^(so_|so:|dong_)/.test(normalized)) return 'number';
    if (/(chan|le|to|nho|nguyen_to|hop_so)/.test(normalized)) return 'class';
    return normalized.split(/[:_]/)[0] || 'other';
}

function evidencePattern(key = '') {
    const normalized = String(key).toLowerCase();
    if (/block\d+x\d+sole/.test(normalized)) return 'blockAlternation';
    if (normalized.includes('vesoletheothutului')) return 'orderedAlternationDown';
    if (normalized.includes('vesoletheothututien')) return 'orderedAlternationUp';
    if (normalized.includes('vesoletheothutu')) return 'orderedAlternation';
    if (normalized.includes('soletheocap')) return 'pairAlternation';
    if (normalized.includes('tienluisole')) return 'upDownAlternation';
    if (normalized.includes('luitiensole')) return 'downUpAlternation';
    if (normalized.includes('tiendeulientiep')) return 'uniformUp';
    if (normalized.includes('luideulientiep')) return 'uniformDown';
    if (normalized.includes('tien')) return 'up';
    if (normalized.includes('lui')) return 'down';
    if (normalized.includes('sole')) return 'alternation';
    if (normalized.includes('lientiep')) return 'consecutive';
    return 'other';
}

function posteriorRisk(candidate) {
    const trials = Math.max(0, Number(candidate.currentCount || 0));
    const continues = Math.min(trials, Math.max(0, Number(candidate.nextCount || 0)));
    const breaks = Math.max(0, trials - continues);
    let alpha = 1.5;
    let beta = 1.5;
    if (candidate.neverFormed) {
        alpha = 8;
        beta = 2;
    } else if (candidate.isRecordOrSuper) {
        alpha = 6;
        beta = 2;
    } else if (candidate.tier === 2) {
        alpha = 4;
        beta = 2.5;
    } else if (candidate.tier === 3) {
        alpha = 3;
        beta = 3;
    }
    return clamp((breaks + alpha) / Math.max(1, trials + alpha + beta));
}

function candidateStrength(candidate) {
    const trials = Math.max(0, Number(candidate.currentCount || 0));
    const reliability = trials > 0
        ? Math.sqrt(trials / (trials + 12))
        : (candidate.neverFormed ? 0.42 : 0.1);
    const specificity = 1 / Math.sqrt(Math.max(1, candidate.numbers?.length || 100));
    const tierWeight = candidate.tier === 1 ? 1
        : candidate.tier === 2 ? 0.78
            : candidate.tier === 3 ? 0.54
                : 0.12;
    return posteriorRisk(candidate) * (0.45 + reliability * 0.35) *
        (0.58 + specificity * 0.42) * tierWeight;
}

function getCandidateTransition(candidate) {
    // Potential opportunities are not represented by cumulative streak counts.
    // They must be learned by replaying every historical day where the same
    // precursor state was present. Until that table exists, keep them unknown.
    const hasFormationTrials = candidate.formationTrials !== null
        && candidate.formationTrials !== undefined
        && Number.isFinite(Number(candidate.formationTrials));
    if (candidate.isPotential && !hasFormationTrials) {
        return {
            trials: null,
            successes: null,
            failures: null,
            failureRate: null,
            opportunitySource: 'unavailable-requires-daily-replay'
        };
    }
    const recordLen = Math.max(0, Number(candidate.maxStreak ?? candidate.recordLen ?? 0));
    const testedLen = Math.max(0, Number(candidate.currentLen ?? candidate.baseLen ?? 0));
    if (!candidate.isPotential && (recordLen <= 0 || testedLen >= recordLen)) {
        return {
            trials: null,
            successes: null,
            failures: null,
            failureRate: null,
            opportunitySource: 'unavailable-in-sample-record-boundary'
        };
    }
    const trials = candidate.isPotential
        ? Math.max(0, Number(candidate.formationTrials || 0))
        : Math.max(0, Number(candidate.currentCount || 0));
    const successes = candidate.isPotential
        ? Math.min(trials, Math.max(0, Number(candidate.formationCount || 0)))
        : Math.min(trials, Math.max(0, Number(candidate.nextCount || 0)));
    const failures = Math.max(0, trials - successes);
    return {
        trials,
        successes,
        failures,
        failureRate: trials > 0 ? failures / trials : null,
        opportunitySource: candidate.isPotential ? 'daily-replay' : 'annual-streak-transition'
    };
}

function getRecordState(candidate) {
    const recordLen = Math.max(0, Number(candidate.maxStreak ?? candidate.recordLen ?? 0));
    const testedLen = candidate.isPotential
        ? Math.max(0, Number(candidate.baseLen || 0))
        : Math.max(0, Number(candidate.currentLen ?? candidate.baseLen ?? 0));
    if (recordLen <= 0) return 'never-pattern';
    if (testedLen > recordLen) return 'super-record';
    if (testedLen === recordLen) return 'at-record';
    if (testedLen === recordLen - 1) return 'near-record';
    if (Number(candidate.currentCount || 0) <= 0) return 'unseen-target';
    return 'below-record';
}

function optionalNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function buildCandidateDiagnostics(candidates, actual) {
    const deduplicated = new Map();
    for (const candidate of candidates || []) {
        if (!Array.isArray(candidate.numbers) || candidate.numbers.length === 0) continue;
        const numbers = [...new Set(candidate.numbers.map(Number))]
            .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
            .sort((a, b) => a - b);
        if (numbers.length === 0 || numbers.length >= 100) continue;
        const transition = getCandidateTransition(candidate);
        const family = evidenceFamily(candidate.key);
        const pattern = evidencePattern(candidate.key);
        const state = candidate.isPotential ? 'potential' : 'active';
        const signature = [
            state,
            family,
            numbers.join(','),
            Number(candidate.baseLen || 0),
            Number(candidate.targetLen || 0)
        ].join('|');
        const row = {
            key: candidate.key,
            family,
            pattern,
            state,
            recordState: getRecordState(candidate),
            tier: Number(candidate.tier || 4),
            currentLen: Number(candidate.currentLen || 0),
            baseLen: Number(candidate.baseLen || 0),
            targetLen: Number(candidate.targetLen || 0),
            recordLen: Number(candidate.maxStreak ?? candidate.recordLen ?? 0),
            setSize: numbers.length,
            numbers,
            baseExclusionRate: 1 - (numbers.length / 100),
            exposureFrequencyPerYear: Number(candidate.exposureFrequencyPerYear || 0),
            baseOccurrenceCount: Number(candidate.baseOccurrenceCount || 0),
            baseFrequencyPerYear: Number(candidate.baseFrequencyPerYear || 0),
            baseAvgLength: optionalNumber(candidate.baseAvgLength),
            baseAvgGapDays: optionalNumber(candidate.baseAvgGapDays),
            baseDaysSinceLatestEnd: optionalNumber(candidate.baseDaysSinceLatestEnd),
            baseGapRatio: optionalNumber(candidate.baseGapRatio),
            targetOccurrenceCount: Number(candidate.targetOccurrenceCount || 0),
            targetFrequencyPerYear: Number(candidate.targetFrequencyPerYear || 0),
            targetAvgLength: optionalNumber(candidate.targetAvgLength),
            targetAvgGapDays: optionalNumber(candidate.targetAvgGapDays),
            targetDaysSinceLatestEnd: optionalNumber(candidate.targetDaysSinceLatestEnd),
            targetGapRatio: optionalNumber(candidate.targetGapRatio),
            formationTrials: candidate.formationTrials !== null
                && candidate.formationTrials !== undefined
                && Number.isFinite(Number(candidate.formationTrials))
                ? Number(candidate.formationTrials)
                : null,
            formationCount: candidate.formationCount !== null
                && candidate.formationCount !== undefined
                && Number.isFinite(Number(candidate.formationCount))
                ? Number(candidate.formationCount)
                : null,
            currentCount: Number(candidate.currentCount || 0),
            nextCount: Number(candidate.nextCount || 0),
            ...transition,
            observedExcluded: !numbers.includes(Number(actual))
        };
        const existing = deduplicated.get(signature);
        if (!existing || row.trials > existing.trials || (
            row.trials === existing.trials && row.tier < existing.tier
        )) {
            deduplicated.set(signature, row);
        }
    }
    return [...deduplicated.values()];
}

function buildNumberEvidence(candidates) {
    const evidenceByNumber = ALL_NUMBERS.map(() => new Map());
    for (const candidate of candidates) {
        if (candidate.tier > 3 || !Array.isArray(candidate.numbers)) continue;
        const family = evidenceFamily(candidate.key);
        const pattern = evidencePattern(candidate.key);
        const group = `${family}|${pattern}`;
        const numberSignature = candidate.numbers.slice().sort((a, b) => a - b).join(',');
        const signature = `${group}|${numberSignature}`;
        const strength = candidateStrength(candidate);
        const row = { candidate, family, pattern, group, strength };
        for (const rawNumber of candidate.numbers) {
            const number = Number(rawNumber);
            if (!Number.isInteger(number) || number < 0 || number > 99) continue;
            const deduplicated = evidenceByNumber[number];
            const existing = deduplicated.get(signature);
            if (!existing || strength > existing.strength) {
                deduplicated.set(signature, row);
            }
        }
    }
    return ALL_NUMBERS.map(number => {
        const deduplicated = evidenceByNumber[number];
        const rowsByGroup = new Map();
        for (const row of deduplicated.values()) {
            if (!rowsByGroup.has(row.group)) rowsByGroup.set(row.group, []);
            rowsByGroup.get(row.group).push(row);
        }
        const combineIndependentStrengths = rows => {
            const discounts = [1, 0.5, 0.25, 0.125, 0.0625];
            return 1 - rows
                .slice()
                .sort((left, right) => right.strength - left.strength)
                .slice(0, discounts.length)
                .reduce(
                    (remaining, row, index) =>
                        remaining * (1 - clamp(row.strength * discounts[index])),
                    1
                );
        };
        const groupDetails = {};
        for (const [group, groupRows] of rowsByGroup) {
            const strengths = groupRows.map(row => row.strength);
            const setSizes = groupRows.map(row => Math.max(1, row.candidate.numbers?.length || 100));
            const baseLengths = groupRows.map(row => Math.max(1, Number(
                row.candidate.baseLen || row.candidate.currentLen || 1
            )));
            const recordStates = [...new Set(groupRows.map(row => getRecordState(row.candidate)))].sort();
            groupDetails[group] = {
                maxStrength: Number(Math.max(...strengths).toFixed(6)),
                combinedStrength: Number(combineIndependentStrengths(groupRows).toFixed(6)),
                independentSets: groupRows.length,
                activeSets: groupRows.filter(row => !row.candidate.isPotential).length,
                potentialSets: groupRows.filter(row => row.candidate.isPotential).length,
                tier1Sets: groupRows.filter(row => row.candidate.tier === 1).length,
                minSetSize: Math.min(...setSizes),
                meanSetSize: Number((
                    setSizes.reduce((sum, value) => sum + value, 0) / setSizes.length
                ).toFixed(3)),
                minBaseLen: Math.min(...baseLengths),
                maxBaseLen: Math.max(...baseLengths),
                meanBaseLen: Number((
                    baseLengths.reduce((sum, value) => sum + value, 0) / baseLengths.length
                ).toFixed(3)),
                recordStates
            };
        }
        const rows = [...deduplicated.values()];
        const strengths = rows.map(row => row.strength);
        const setSizes = rows.map(row => Math.max(1, row.candidate.numbers?.length || 100));
        return {
            number,
            groups: Object.fromEntries(
                Object.entries(groupDetails).map(([group, detail]) => [group, detail.maxStrength])
            ),
            groupDetails,
            supportGroups: rowsByGroup.size,
            supportFamilies: new Set(rows.map(row => row.family)).size,
            activeGroups: Object.values(groupDetails)
                .filter(detail => detail.activeSets > 0).length,
            potentialGroups: Object.values(groupDetails)
                .filter(detail => detail.potentialSets > 0).length,
            tier1Groups: Object.values(groupDetails)
                .filter(detail => detail.tier1Sets > 0).length,
            independentSets: rows.length,
            activeSets: rows.filter(row => !row.candidate.isPotential).length,
            potentialSets: rows.filter(row => row.candidate.isPotential).length,
            tier1Sets: rows.filter(row => row.candidate.tier === 1).length,
            minSetSize: setSizes.length ? Math.min(...setSizes) : 100,
            meanSetSize: setSizes.length
                ? setSizes.reduce((sum, value) => sum + value, 0) / setSizes.length
                : 100,
            evidenceMass: Object.values(groupDetails)
                .reduce((sum, detail) => sum + detail.combinedStrength, 0),
            maxStrength: strengths.length ? Math.max(...strengths) : 0,
            meanStrength: strengths.length
                ? strengths.reduce((sum, value) => sum + value, 0) / strengths.length
                : 0
        };
    });
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
        currentType: null,
        currentLength: 0,
        longestWin: 0,
        longestLoss: 0,
        rows: []
    };
}

function updateSummary(summary, row, options) {
    const betNumbers = row.strategies[summary.id] || [];
    const win = betNumbers.includes(row.actual);
    const stakeK = betNumbers.length * options.betPerNumberK;
    const payoutK = win ? options.betPerNumberK * options.winMultiplier : 0;
    const profitK = payoutK - stakeK;
    summary.days++;
    summary.wins += Number(win);
    summary.losses += Number(!win);
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += profitK;
    const type = win ? 'win' : 'loss';
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, type === 'win' ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, type === 'loss' ? summary.currentLength : 0);
    summary.rows.push({
        date: row.date,
        actual: row.actual,
        win,
        profitK,
        betNumbers
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

function summarizeMonthly(rows, strategy, options) {
    const groups = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!groups.has(month)) groups.set(month, createSummary(strategy));
        updateSummary(groups.get(month), row, options);
    }
    return Array.from(groups.entries()).map(([month, summary]) => ({
        month,
        ...finalizeSummary(summary),
        rows: undefined
    }));
}

async function processDate(date, raw, baseline, options) {
    const index = raw.findIndex(row => row._iso === date);
    if (index <= 0) return null;
    const actual = raw[index].special;
    const truncatedRaw = raw.slice(0, index);
    const stats = await generateStats(truncatedRaw);
    lotteryService.__setInMemoryCachesForBacktest({ rawData: truncatedRaw, ...stats });
    historicalExclusionService.clearCache();
    const candidates = annualMilestoneService.buildCandidatesForDate(formatDisplayDate(date), baseline, {
        historyYears: options.historyYears,
        minPotentialCurrentLenForNeverFormed: options.minPotentialLen,
        activeFrequencyLimit: 0.5,
        recordFrequencyLimit: 1.1
    });
    const strategiesByTarget = {};
    for (const target of options.targets || [options.target]) {
        const targetStrategies = {};
        for (const strategy of options.strategyIds || STRATEGIES) {
            const prediction = annualMilestoneService.buildPrediction(candidates, target, strategy);
            targetStrategies[strategy] = (prediction.betNumbers || []).map(Number).sort((a, b) => a - b);
        }
        strategiesByTarget[String(target)] = targetStrategies;
    }
    const strategies = strategiesByTarget[String(options.target)];
    const result = {
        date,
        actual,
        candidateCount: candidates.length,
        generationSeconds: Number((stats.elapsedMs / 1000).toFixed(2)),
        strategies,
        strategiesByTarget
    };
    if (options.includeEvidence) result.numberEvidence = buildNumberEvidence(candidates);
    if (options.includeCandidateDiagnostics) {
        result.candidateDiagnostics = buildCandidateDiagnostics(candidates, actual);
    }
    if (options.includeRollingParallel || options.includeRollingEdge75 || options.includeRollingSmallDan) {
        // Stats and raw caches currently contain only the prefix ending at D-1.
        // Build rolling-history methods without asking simulationService to
        // regenerate that same prefix a second time.
        const methodIds = [];
        if (options.includeRollingParallel) methodIds.push('deParallelBlock85Small65Hold70');
        if (options.includeRollingEdge75) methodIds.push('dedupEdge75Hold70');
        if (options.includeRollingSmallDan) {
            for (const target of options.rollingTargets || []) {
                for (const method of options.rollingSmallDanMethods || []) {
                    methodIds.push(`${method}Hold${target}`);
                }
            }
        }
        const rollingPrediction = await simulationService.buildNextPrediction(truncatedRaw, {
            methodIds,
            playMode: 'bet',
            betWinMultiplier: options.winMultiplier,
            betWinFactor: 1,
            forceComputeQuickStats: true,
            strictPointInTime: false,
            compactDetails: true,
            selectedStreakDetailLimit: 0,
            predictionDate: formatDisplayDate(date)
        });
        if (options.includeRollingParallel) {
            const rollingMethod = rollingPrediction?.methods?.deParallelBlock85Small65Hold70;
            if (!rollingMethod) {
                throw new Error(`Không sinh được dàn Song song Lịch sử D-1 cho ${date}.`);
            }
            result.rollingParallel = {
                basisDate: rollingPrediction.basisIsoDate,
                predictionDate: formatIsoDate(rollingPrediction.predictionDate),
                betNumbers: (rollingMethod.betNumbers || []).map(Number).sort((a, b) => a - b),
                intersectionNumbers: (rollingMethod.intersectionNumbers || []).map(Number).sort((a, b) => a - b)
            };
        }
        if (options.includeRollingEdge75) {
            const edgeMethod = rollingPrediction?.methods?.dedupEdge75Hold70;
            if (!edgeMethod) {
                throw new Error(`Không sinh được dàn Edge75 Lịch sử D-1 cho ${date}.`);
            }
            result.rollingEdge75 = {
                basisDate: rollingPrediction.basisIsoDate,
                predictionDate: formatIsoDate(rollingPrediction.predictionDate),
                betNumbers: (edgeMethod.betNumbers || []).map(Number).sort((a, b) => a - b)
            };
        }
        if (options.includeRollingSmallDan) {
            result.rollingStrategiesByTarget = {};
            for (const target of options.rollingTargets || []) {
                const methods = {};
                for (const method of options.rollingSmallDanMethods || []) {
                    const id = `${method}Hold${target}`;
                    const built = rollingPrediction?.methods?.[id];
                    if (!built) {
                        throw new Error(`Không sinh được dàn D-1 ${id} cho ${date}.`);
                    }
                    methods[method] = {
                        id,
                        betNumbers: (built.betNumbers || []).map(Number).sort((a, b) => a - b),
                        excludedNumbers: (built.excludedNumbers || []).map(Number).sort((a, b) => a - b),
                        intersectionNumbers: (built.intersectionNumbers || [])
                            .map(Number)
                            .sort((a, b) => a - b)
                    };
                }
                result.rollingStrategiesByTarget[String(target)] = methods;
            }
        }
    }
    return result;
}

function releaseBacktestDayCaches() {
    lotteryService.clearCache();
    historicalExclusionService.clearCache();
    if (global.gc) global.gc();
}

async function runWorker() {
    const raw = normalizeRaw(readJsonSnapshot(workerData.rawPath));
    const baseline = deserializeBaseline(JSON.parse(fs.readFileSync(workerData.baselinePath, 'utf8')));
    for (const date of workerData.dates) {
        try {
            const row = await processDate(date, raw, baseline, workerData.options);
            parentPort.postMessage({ type: 'row', row });
        } catch (error) {
            parentPort.postMessage({
                type: 'error',
                date,
                error: error && error.stack ? error.stack : String(error)
            });
        }
    }
    parentPort.postMessage({ type: 'done' });
}

async function runMain() {
    const options = parseArgs();
    const rawPath = options.rawFile
        ? path.resolve(options.rawFile)
        : path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');
    const raw = normalizeRaw(readJsonSnapshot(rawPath));
    const allDates = raw
        .filter(row => row._iso >= options.startDate && row._iso <= options.endDate)
        .map(row => row._iso);
    const normalizedOffset = options.dateOffset % options.dateStep;
    const requestedDates = allDates.filter((_, index) => index % options.dateStep === normalizedOffset);
    if (requestedDates.length === 0) throw new Error('Không có ngày phù hợp để backtest.');
    const years = [...new Set(requestedDates.map(date => Number(date.slice(0, 4))))];
    if (years.length !== 1) {
        throw new Error('Script nghiên cứu hiện chỉ chạy một năm mỗi lần để khóa baseline chính xác.');
    }
    const year = years[0];
    const expectedCutoffDate = `${year - 1}-12-31`;
    const baselineCutoffDate = options.baselineCutoffDate || expectedCutoffDate;
    if (baselineCutoffDate !== expectedCutoffDate) {
        throw new Error(
            `Cutoff ${baselineCutoffDate} không hợp lệ cho năm ${year}; ` +
            `point-in-time theo năm phải dùng ${expectedCutoffDate}.`
        );
    }
    const baselinePath = path.join(__dirname, '..', 'reports', `.true_pit_baseline_${year}.json`);
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    const checkpointPath = options.checkpointFile ? path.resolve(options.checkpointFile) : null;
    const checkpointSignature = hashCanonical({
        year,
        startDate: options.startDate,
        endDate: options.endDate,
        target: options.target,
        targets: options.targets,
        strategyIds: options.strategyIds,
        historyYears: options.historyYears,
        minPotentialLen: options.minPotentialLen,
        dateStep: options.dateStep,
        dateOffset: options.dateOffset,
        includeEvidence: options.includeEvidence,
        includeCandidateDiagnostics: options.includeCandidateDiagnostics,
        includeRollingParallel: options.includeRollingParallel,
        includeRollingEdge75: options.includeRollingEdge75,
        includeRollingSmallDan: options.includeRollingSmallDan,
        rollingTargets: options.rollingTargets,
        rollingSmallDanMethods: options.rollingSmallDanMethods,
        baselineCutoffDate,
        source: fs.readFileSync(__filename, 'utf8')
    });
    const resumedByDate = new Map();
    if (checkpointPath && fs.existsSync(checkpointPath)) {
        const lines = fs.readFileSync(checkpointPath, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line));
        const metadata = lines.find(line => line._checkpoint);
        if (!metadata || metadata._checkpoint.signature !== checkpointSignature) {
            throw new Error(`Checkpoint ${checkpointPath} không cùng cấu hình/mã nguồn.`);
        }
        for (const row of lines.filter(line => line.date)) resumedByDate.set(row.date, row);
        console.log(`[TruePIT] Tiếp tục từ checkpoint: ${resumedByDate.size} ngày đã xong.`);
    } else if (checkpointPath) {
        fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
        fs.writeFileSync(
            checkpointPath,
            `${JSON.stringify({ _checkpoint: { signature: checkpointSignature } })}\n`
        );
    }

    if (options.resumeRowsFile) {
        const resumeRowsPath = path.resolve(options.resumeRowsFile);
        const importedRows = fs.readFileSync(resumeRowsPath, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line))
            .filter(row => row && row.date && requestedDates.includes(row.date));
        let imported = 0;
        for (const row of importedRows) {
            const hasRequiredPredictions = options.targets.every(target =>
                options.strategyIds.every(strategy =>
                    Array.isArray(row.strategiesByTarget?.[String(target)]?.[strategy])
                )
            );
            if (!hasRequiredPredictions) {
                throw new Error(`Resume row ${row.date} thiếu target/strategy cần thiết.`);
            }
            if (options.includeRollingParallel && !row.rollingParallel) {
                throw new Error(`Resume row ${row.date} thiếu rollingParallel.`);
            }
            if (options.includeRollingEdge75 && !row.rollingEdge75) {
                throw new Error(`Resume row ${row.date} thiếu rollingEdge75.`);
            }
            if (options.includeRollingSmallDan && !row.rollingStrategiesByTarget) {
                throw new Error(`Resume row ${row.date} thiếu rollingStrategiesByTarget.`);
            }
            if (!resumedByDate.has(row.date)) {
                resumedByDate.set(row.date, row);
                if (checkpointPath) fs.appendFileSync(checkpointPath, `${JSON.stringify(row)}\n`);
                imported++;
            }
        }
        console.log(`[TruePIT] Nhập ${imported} ngày đã xác minh từ ${resumeRowsPath}.`);
    }

    const dates = requestedDates.filter(date => !resumedByDate.has(date));
    const rows = [...resumedByDate.values()];
    const errors = [];
    if (dates.length > 0) {
        let baselineRaw = raw.filter(row => row._iso <= baselineCutoffDate);
        console.log(`[TruePIT] Sinh baseline ${year} từ ${baselineRaw.length} ngày...`);
        let baselineStats = await generateStats(baselineRaw, false);
        let baseline = annualMilestoneService.buildAnnualBaseline(
            mergeEntries(baselineStats),
            year,
            { historyYears: options.historyYears, writeBaseline: false }
        );
        fs.writeFileSync(baselinePath, JSON.stringify(serializeBaseline(baseline)));
        const baselineSeconds = baselineStats.elapsedMs / 1000;
        // Worker chỉ cần baseline đã serialise. Giữ cả ba khối thống kê 20 năm
        // trong process cha làm tăng đỉnh bộ nhớ trước khi tái sinh từng ngày.
        baseline = null;
        baselineStats = null;
        baselineRaw = null;
        if (global.gc) global.gc();
        console.log(`[TruePIT] Baseline xong sau ${baselineSeconds.toFixed(1)}s; ` +
            `${dates.length} còn lại/${requestedDates.length} ngày, ` +
            `${options.inline ? 'inline tuần tự' : `${Math.min(options.workers, dates.length)} worker`}.`);

        if (options.inline) {
            const inlineBaseline = deserializeBaseline(JSON.parse(fs.readFileSync(baselinePath, 'utf8')));
            let completedDates = 0;
            for (const date of dates) {
                try {
                    const row = await processDate(date, raw, inlineBaseline, options);
                    if (row) {
                        rows.push(row);
                        if (checkpointPath) {
                            fs.appendFileSync(checkpointPath, `${JSON.stringify(row)}\n`);
                        }
                        completedDates++;
                        console.log(`[TruePIT] ${completedDates}/${dates.length} ${row.date} ` +
                            `(${row.generationSeconds}s, ${row.candidateCount} chuỗi)`);
                    }
                } catch (error) {
                    errors.push({
                        date,
                        error: error && error.stack ? error.stack : String(error)
                    });
                    console.error(`[TruePIT] Lỗi ${date}:`, error);
                } finally {
                    releaseBacktestDayCaches();
                }
            }
        } else {

            const workerCount = Math.min(options.workers, dates.length);
            const assignments = Array.from({ length: workerCount }, () => []);
            dates.forEach((date, index) => assignments[index % workerCount].push(date));
            let completedWorkers = 0;
            let completedDates = 0;

            await new Promise((resolve, reject) => {
                assignments.forEach(workerDates => {
                    const worker = new Worker(__filename, {
                        workerData: {
                            rawPath,
                            baselinePath,
                            dates: workerDates,
                            options
                        }
                    });
                    worker.on('message', message => {
                        if (message.type === 'row' && message.row) {
                            rows.push(message.row);
                            if (checkpointPath) {
                                fs.appendFileSync(checkpointPath, `${JSON.stringify(message.row)}\n`);
                            }
                            completedDates++;
                            console.log(`[TruePIT] ${completedDates}/${dates.length} ${message.row.date} ` +
                                `(${message.row.generationSeconds}s, ${message.row.candidateCount} chuỗi)`);
                        } else if (message.type === 'error') {
                            errors.push(message);
                            console.error(`[TruePIT] Lỗi ${message.date}: ${message.error}`);
                        } else if (message.type === 'done') {
                            completedWorkers++;
                            if (completedWorkers === workerCount) resolve();
                        }
                    });
                    worker.on('error', reject);
                    worker.on('exit', code => {
                        if (code !== 0) reject(new Error(`Worker thoát với mã ${code}`));
                    });
                });
            });
        }
    }

    rows.sort((a, b) => a.date.localeCompare(b.date));
    const summaries = {};
    for (const strategy of options.strategyIds) {
        const summary = createSummary(strategy);
        rows.forEach(row => updateSummary(summary, row, options));
        summaries[strategy] = {
            ...finalizeSummary(summary),
            monthly: summarizeMonthly(rows, strategy, options)
        };
    }
    const ranking = Object.values(summaries)
        .map(({ rows: ignoredRows, ...summary }) => summary)
        .sort((a, b) => b.profitK - a.profitK || b.hitRate - a.hitRate);
    const targetSummaries = {};
    const targetRankings = {};
    for (const target of options.targets) {
        const targetKey = String(target);
        const perStrategy = {};
        for (const strategy of options.strategyIds) {
            const summary = createSummary(strategy);
            rows.forEach(row => updateSummary(summary, {
                ...row,
                strategies: row.strategiesByTarget?.[targetKey] || row.strategies
            }, options));
            const finalized = finalizeSummary(summary);
            delete finalized.rows;
            perStrategy[strategy] = finalized;
        }
        targetSummaries[targetKey] = perStrategy;
        targetRankings[targetKey] = Object.values(perStrategy)
            .slice()
            .sort((a, b) => b.profitK - a.profitK || b.hitRate - a.hitRate);
    }
    const fingerprintConfig = {
        startDate: options.startDate,
        endDate: options.endDate,
        target: options.target,
        targets: options.targets,
        strategyIds: options.strategyIds,
        historyYears: options.historyYears,
        minPotentialLen: options.minPotentialLen,
        dateStep: options.dateStep,
        dateOffset: options.dateOffset,
        betPerNumberK: options.betPerNumberK,
        winMultiplier: options.winMultiplier,
        includeEvidence: options.includeEvidence,
        includeCandidateDiagnostics: options.includeCandidateDiagnostics,
        includeRollingParallel: options.includeRollingParallel,
        includeRollingEdge75: options.includeRollingEdge75,
        includeRollingSmallDan: options.includeRollingSmallDan,
        rollingTargets: options.rollingTargets,
        rollingSmallDanMethods: options.rollingSmallDanMethods
    };
    const fingerprint = buildBacktestFingerprint({
        rawData: raw.filter(row => row._iso <= options.endDate),
        config: fingerprintConfig,
        baselineCutoffDate,
        methodologyVersion: 'strict-prefix-point-in-time-v1',
        sourceFiles: [
            __filename,
            path.join(__dirname, '..', 'lib', 'services', 'annualMilestoneService.js'),
            path.join(__dirname, '..', 'lib', 'services', 'simulationService.js'),
            path.join(__dirname, '..', 'lib', 'services', 'historicalExclusionService.js'),
            path.join(__dirname, '..', 'lib', 'generators', 'statisticsGenerator.js'),
            path.join(__dirname, '..', 'lib', 'generators', 'headTailStatsGenerator.js'),
            path.join(__dirname, '..', 'lib', 'generators', 'sumDifferenceStatsGenerator.js')
        ],
        sourceLabel: path.relative(process.cwd(), rawPath)
    });
    const resultSha256 = hashCanonical({
        ranking,
        targetRankings,
        rows: rows.map(({ generationSeconds, ...row }) => row)
    });
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: 'Mỗi ngày tái sinh toàn bộ thống kê chỉ từ dữ liệu trước ngày dự đoán; baseline sinh từ dữ liệu đến 31/12 năm trước.',
        methodologyVersion: 'strict-prefix-point-in-time-v1',
        baselineCutoffDate,
        fingerprint,
        resultSha256,
        options,
        sourceDays: allDates.length,
        sampledDays: requestedDates.length,
        errors,
        ranking,
        summaries,
        targetRankings,
        targetSummaries,
        rows
    };
    const reportPath = options.reportFile
        ? path.resolve(options.reportFile)
        : path.join(
            __dirname,
            '..',
            'reports',
            `research_true_pit_strategies_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
        );
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    fs.rmSync(baselinePath, { force: true });
    if (checkpointPath && errors.length === 0 && rows.length === requestedDates.length) {
        fs.rmSync(checkpointPath, { force: true });
    }
    console.log(JSON.stringify({
        reportPath,
        top: ranking.slice(0, 5).map(row => ({
            id: row.id,
            days: row.days,
            wins: row.wins,
            hitRate: row.hitRate,
            profitK: row.profitK,
            roi: row.roi,
            longestLoss: row.longestLoss
        }))
    }, null, 2));
}

if (isMainThread && require.main === module) {
    runMain().catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
} else if (!isMainThread) {
    runWorker().catch(error => {
        parentPort.postMessage({ type: 'error', error: error && error.stack ? error.stack : String(error) });
        process.exitCode = 1;
    });
}

module.exports = {
    buildNumberEvidence,
    candidateStrength,
    evidenceFamily,
    evidencePattern,
    formatDisplayDate,
    generateStats,
    mergeEntries,
    normalizeRaw,
    posteriorRisk
};
