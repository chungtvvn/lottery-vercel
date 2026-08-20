// services/simulationService.js
//
// Simulation mới đo các chiến lược loại trừ dựa trên cùng nguồn dự đoán
// với "Tổng hợp dự đoán" / "Số Đánh & Loại Trừ".

const lotteryService = require('./lotteryService');
const exclusionLogic = require('./exclusionLogicService');
const historicalExclusionService = require('./historicalExclusionService');
const annualMilestoneService = require('./annualMilestoneService');
const dataAccess = require('../data-access');
const generateNumberStats = require('../generators/statisticsGenerator');
const generateHeadTailStats = require('../generators/headTailStatsGenerator');
const generateSumDiffStats = require('../generators/sumDifferenceStatsGenerator');
const BET_PER_NUMBER = 1000; // 1.000.000 VND (đơn vị K VND)
const WIN_MULTIPLIER = 84;
const HOLD_WIN_MULTIPLIER = 0.705;
const HOLD_LOSS_MULTIPLIER = 70;
const DEFAULT_DAYS = 7;
const DROP_OFF_THRESHOLD = 0.85;
const PRIORITY_THRESHOLD = 85;
const MIN_EXCLUDED_TO_PLAY = 30;
const RANKED_TARGET_MIN = 60;
const RANKED_TARGET_MAX = 70;
const COMBINED_TARGET_MIN = 75;
const COMBINED_TARGET_MAX = 75;
const CHAIN_ORDER_TARGET_EXCLUDED = 60;
const CHAIN_ORDER_TARGET_MIN = 55;
const CHAIN_ORDER_TARGET_MAX = 65;
const CHAIN_FREQUENCY_TARGET_BET = 25;
const CHAIN_FREQUENCY_PROTECTED_COUNT = 10;
const EDGE_PER_NUMBER_TARGET_EXCLUDED = 95;
const EDGE_PER_NUMBER_TARGET_EXCLUDED_2 = 98;
const BAYES_LOG_ODDS_ALPHA = 100;
const BAYES_LOG_ODDS_ALPHA_STABLE = 500;
const BAYES_LOG_ODDS_TARGET_EXCLUDED_2 = 98;
const BAYES_LOG_ODDS_TARGET_EXCLUDED_3 = 97;
const BAYES_LOG_ODDS_TARGET_EXCLUDED_5 = 95;
const SIMULATION_METHOD_VERSION = '2026-07-15-parallel-shared-ranking-v3';
const COMBINED_RISK_CAP = Number.POSITIVE_INFINITY;
const COMBINED_NUMBER_PENALTY = 0.45;
const MAX_POTENTIAL_FORMATION_COUNT = exclusionLogic.DEFAULT_MAX_POTENTIAL_FORMATION_COUNT || 10;
const MAX_POTENTIAL_FREQUENCY_PER_YEAR = exclusionLogic.DEFAULT_MAX_POTENTIAL_FORMATION_PER_YEAR || 1;
const HIGH_FREQUENCY_LIMIT_PER_YEAR = exclusionLogic.DEFAULT_HIGH_FREQUENCY_LIMIT_PER_YEAR || 20;
const SELECTED_STREAK_DETAIL_LIMIT = 24;
const COMPACT_SELECTED_STREAK_DETAIL_LIMIT = 2;
const CUSTOM_DEFAULTS = {
    minPriority: 85,
    minDropOffPercent: 0,
    maxFrequencyPerYear: 0,
    maxPotentialFrequencyPerYear: MAX_POTENTIAL_FREQUENCY_PER_YEAR,
    minLowerBoundPercent: 0,
    minSampleSize: 0,
    targetExcluded: 0,
    requirePositiveEdge: false,
    includeFormed: true,
    includePotential: true,
    includeHighFrequency: true,
    maxPotentialFormationCount: MAX_POTENTIAL_FORMATION_COUNT,
    excludeFixedThreeValueGroups: false,
    exactTargetExcluded: false
};
const ALL_NUMBERS = Array.from({ length: 100 }, (_, i) => i);
const PLAY_MODE_LABELS = {
    both: 'Đánh + Ôm',
    bet: 'Chỉ đánh',
    hold: 'Chỉ ôm'
};

// Compatibility for dailyAnalysisService. Simulation itself uses fixed 10k.
const LEGACY_BASE_BET = 10;
const LEGACY_BET_STEP = 5;
const LEGACY_NUM_COUNT = 25;
const _backtestCache = new Map();

/**
 * Generate the three statistic groups from exactly the raw prefix supplied by
 * the caller. This is intentionally separate from the static/cache loading
 * path: a full-history index filtered by date is not strict point-in-time.
 */
async function generateStrictStatsForPrefix(rawPrefix) {
    const input = (rawPrefix || []).map(row => ({
        date: row.date,
        special: Number(row.special)
    }));
    const originalLog = console.log;
    console.log = () => {};
    try {
        const [numberStats, headTailStats, sumDiffStats] = await Promise.all([
            generateNumberStats(null, null, input),
            generateHeadTailStats(null, null, input),
            generateSumDiffStats(null, null, input)
        ]);
        return { numberStats, headTailStats, sumDiffStats };
    } finally {
        console.log = originalLog;
    }
}

function calculateBetAmount(totalLossSoFar) {
    let betAmount = LEGACY_BASE_BET;
    while (true) {
        const totalBetToday = LEGACY_NUM_COUNT * betAmount;
        const totalCostIfWin = totalLossSoFar + totalBetToday;
        const potentialWin = betAmount * WIN_MULTIPLIER;
        if (potentialWin > totalCostIfWin) return betAmount;
        betAmount += LEGACY_BET_STEP;
    }
}

function calculateWinLoss(numbersToBet, winningNumber, betAmount, totalLossSoFar) {
    const normalizedWinning = normalizeNumber(winningNumber);
    const normalizedBet = normalizeNumberList(numbersToBet);
    const totalBetToday = normalizedBet.length * betAmount;
    if (normalizedBet.includes(normalizedWinning)) {
        const winAmount = betAmount * WIN_MULTIPLIER;
        return {
            isWin: true,
            profit: winAmount - (totalBetToday + totalLossSoFar),
            winAmount,
            totalBet: totalBetToday,
            totalLossToDate: 0
        };
    }

    return {
        isWin: false,
        profit: -totalBetToday,
        winAmount: 0,
        totalBet: totalBetToday,
        totalLossToDate: totalLossSoFar + totalBetToday
    };
}

function normalizeNumber(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 && parsed < 100 ? parsed : null;
}

function normalizeNumberList(values) {
    return [...new Set((values || [])
        .map(normalizeNumber)
        .filter(value => value !== null))]
        .sort((a, b) => a - b);
}

function formatNumber(value) {
    return String(value).padStart(2, '0');
}

function formatMoneyK(value) {
    return Math.round(value);
}

function parseRawDate(rawDate) {
    return historicalExclusionService.parseDate(rawDate);
}

function formatRawDate(rawDate) {
    const parsed = parseRawDate(rawDate);
    return parsed ? historicalExclusionService.formatDate(parsed) : '';
}

function formatIsoDate(rawDate) {
    const parsed = parseRawDate(rawDate);
    if (!parsed) return '';
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function addDaysToRawDate(rawDate, days = 1) {
    const parsed = parseRawDate(rawDate);
    if (!parsed) return '';
    const next = new Date(parsed);
    next.setDate(next.getDate() + days);
    return historicalExclusionService.formatDate(next);
}

function getHistoryYearsAtIndex(sortedData, basisIndex) {
    if (!sortedData || sortedData.length === 0 || basisIndex <= 0) return 1;
    const firstDate = parseRawDate(sortedData[0].date);
    const basisDate = parseRawDate(sortedData[basisIndex].date);
    if (!firstDate || !basisDate || basisDate <= firstDate) return 1;
    const days = (basisDate - firstDate) / (1000 * 60 * 60 * 24);
    return Math.max(days / 365.25, 0.01);
}

function getSortedLotteryData(rawData) {
    return (rawData || [])
        .filter(item => item && item.date && item.special !== null && item.special !== undefined)
        .slice()
        .sort((a, b) => {
            const da = parseRawDate(a.date);
            const db = parseRawDate(b.date);
            return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
        });
}

function parseStatsKey(key) {
    if (key.includes(':')) {
        const [category, subcategory] = key.split(':');
        return { category, subcategory };
    }

    const patterns = [
        'VeSoLeTheoThuTuTien', 'VeSoLeTheoThuTuLui', 'VeSoLeTheoThuTu', 'VeTheoThuTu',
        'LuiDeuLienTiep', 'TienDeuLienTiep',
        'LuiLienTiep', 'TienLienTiep',
        'LuiDeu', 'TienDeu',
        'VeLienTiep', 'VeCungGiaTri', 'VeSole', 'VeSoleMoi',
        'DongTien', 'DongLui',
        'TienLuiSoLe', 'LuiTienSoLe', 'SoLeTheoCap',
        'Lui', 'Tien'
    ];

    for (const pattern of patterns) {
        if (key.endsWith(pattern)) {
            return {
                category: key.slice(0, -pattern.length),
                subcategory: pattern.charAt(0).toLowerCase() + pattern.slice(1)
            };
        }
    }

    return { category: key, subcategory: '' };
}

function getPatternStep(key = '') {
    const lowerKey = String(key).toLowerCase();
    const isAlternatingGapPattern = (lowerKey.includes('vesole') || lowerKey.includes('solemoi')) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap');
    return isAlternatingGapPattern ? 2 : 1;
}

function getDropOffStartLen(key = '') {
    const lowerKey = String(key).toLowerCase();
    if (getPatternStep(key) === 2) return 3;
    if (lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole')) return 4;
    if (lowerKey.includes('soletheocap')) return 4;
    return 2;
}

function daysBetween(a, b) {
    const da = parseRawDate(a);
    const db = parseRawDate(b);
    if (!da || !db) return null;
    return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function wilsonLowerBound(successes, total, z = 1.64) {
    if (!total || total <= 0) return 0;
    const phat = successes / total;
    const z2 = z * z;
    const denominator = 1 + z2 / total;
    const centre = phat + z2 / (2 * total);
    const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
    return Math.max(0, (centre - margin) / denominator);
}

function clamp(value, min = 0, max = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function roundOne(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.round(number * 10) / 10;
}

function normalizeScorePercent(value) {
    return Math.round(clamp(value) * 100);
}

function parseNumericOption(value, fallback, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY) {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function parseBooleanOption(value, fallback = false) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function normalizeMethodFilter(value) {
    if (!value) return null;
    const values = Array.isArray(value)
        ? value
        : String(value).split(',');
    const ids = values
        .map(item => String(item || '').trim())
        .filter(Boolean);
    return ids.length > 0 ? new Set(ids) : null;
}

function methodFilterAllows(methodFilter, methodId) {
    return !methodFilter || methodFilter.has(methodId);
}

function parseRiskHoldTargetFromId(methodId) {
    const match = String(methodId || '').match(/^riskHold(\d{1,3})$/);
    if (!match) return null;
    const target = Number(match[1]);
    if (!Number.isFinite(target)) return null;
    return Math.max(0, Math.min(100, Math.round(target)));
}

function parseHoldMethodFromId(methodId) {
    const boostMatch = String(methodId || '').match(/^dedupEdge50CombinedB(\d+)S(\d+)Hold(\d{1,3})$/);
    if (boostMatch) {
        return {
            id: String(methodId),
            type: 'dedupEdge50CombinedHoldCustom',
            blockBoost: Number(boostMatch[1]) / 100,
            smallBoost: Number(boostMatch[2]) / 100,
            targetExcluded: Math.max(0, Math.min(100, Math.round(Number(boostMatch[3]))))
        };
    }
    const match = String(methodId || '').match(/^(riskHold|frequencyHold|tierHold|edgeHold|confidentEdgeHold|avgDropoffHold|avgEdge25Hold|avgEdge50Hold|avgEdge75Hold|dedupDropoffHold|dedupEdgeHold|dedupEdge25Hold|dedupEdge50Hold|dedupEdge75Hold|bayesHold|scarcityHold|recordHold|recordFirstHold|potentialHold|wilsonHold|chainSmallFirstHold|chainBlockFirstHold|deParallelBlock85Small65Hold|deParallelDedupEdge75DropoffHold|dedupEdge50CombinedHold|ensembleCombinedHold)(\d{1,3})$/);
    if (!match) return null;
    const target = Number(match[2]);
    if (!Number.isFinite(target)) return null;
    return {
        id: String(methodId),
        type: match[1],
        targetExcluded: Math.max(0, Math.min(100, Math.round(target)))
    };
}

function normalizePlayMode(value) {
    const normalized = String(value || 'both').trim().toLowerCase();
    if (['bet', 'bet-only', 'only-bet', 'danh', 'đánh', 'chi-danh', 'chỉ-đánh'].includes(normalized)) return 'bet';
    if (['hold', 'hold-only', 'only-hold', 'om', 'ôm', 'chi-om', 'chỉ-ôm'].includes(normalized)) return 'hold';
    return 'both';
}

function normalizeBetWinMultiplier(value, fallback = WIN_MULTIPLIER) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(70, Math.min(90, Math.round(parsed)));
}

function normalizeBetWinFactor(value, fallback = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0.01, Math.min(100, Math.round(parsed * 100) / 100));
}

function normalizeHoldWinMultiplier(value, fallback = HOLD_WIN_MULTIPLIER) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0.5, Math.min(1, Math.round(parsed * 1000) / 1000));
}

function normalizeCustomOptions(options = {}) {
    const source = options && options.custom ? options.custom : (options || {});
    return {
        minPriority: parseNumericOption(source.minPriority, CUSTOM_DEFAULTS.minPriority, 0, 100),
        minDropOffPercent: parseNumericOption(
            source.minDropOffPercent ?? source.minDropOff ?? source.dropOff,
            CUSTOM_DEFAULTS.minDropOffPercent,
            0,
            100
        ),
        maxFrequencyPerYear: parseNumericOption(
            source.maxFrequencyPerYear ?? source.frequencyPerYearMax,
            CUSTOM_DEFAULTS.maxFrequencyPerYear,
            0,
            365
        ),
        maxPotentialFrequencyPerYear: parseNumericOption(
            source.maxPotentialFrequencyPerYear ?? source.potentialFrequencyPerYearMax,
            CUSTOM_DEFAULTS.maxPotentialFrequencyPerYear,
            0,
            365
        ),
        minLowerBoundPercent: parseNumericOption(
            source.minLowerBoundPercent ?? source.minLowerBound ?? source.lowerBound,
            CUSTOM_DEFAULTS.minLowerBoundPercent,
            0,
            100
        ),
        minSampleSize: Math.round(parseNumericOption(source.minSampleSize, CUSTOM_DEFAULTS.minSampleSize, 0, 100000)),
        targetExcluded: Math.round(parseNumericOption(source.targetExcluded, CUSTOM_DEFAULTS.targetExcluded, 0, 100)),
        requirePositiveEdge: parseBooleanOption(source.requirePositiveEdge, CUSTOM_DEFAULTS.requirePositiveEdge),
        includeFormed: parseBooleanOption(source.includeFormed, CUSTOM_DEFAULTS.includeFormed),
        includePotential: parseBooleanOption(source.includePotential, CUSTOM_DEFAULTS.includePotential),
        includeHighFrequency: parseBooleanOption(source.includeHighFrequency, CUSTOM_DEFAULTS.includeHighFrequency),
        maxPotentialFormationCount: Math.round(parseNumericOption(
            source.maxPotentialFormationCount,
            CUSTOM_DEFAULTS.maxPotentialFormationCount,
            0,
            100000
        )),
        excludeFixedThreeValueGroups: parseBooleanOption(
            source.excludeFixedThreeValueGroups ?? source.excludeFixed3ValueGroups,
            CUSTOM_DEFAULTS.excludeFixedThreeValueGroups
        ),
        exactTargetExcluded: parseBooleanOption(
            source.exactTargetExcluded,
            CUSTOM_DEFAULTS.exactTargetExcluded
        )
    };
}

function parseCandidateCategoryKey(key = '') {
    return String(key || '').split(':')[0];
}

function isFixedThreeValueGroupKey(key = '') {
    const category = parseCandidateCategoryKey(key);
    return /^dau_3d_(\d_){2}\d$/.test(category) ||
        /^dit_3d_(\d_){2}\d$/.test(category) ||
        /^tong_tt_\d+_\d+_\d+$/.test(category) ||
        /^tong_moi_\d+_\d+_\d+$/.test(category) ||
        /^hieu_\d+_\d+_\d+$/.test(category);
}

function isFixedThreeValueGroupCandidate(item = {}) {
    return isFixedThreeValueGroupKey(item.key);
}

function getCandidateFrequencyPerYear(item, totalYears) {
    if (!Number.isFinite(Number(totalYears)) || Number(totalYears) <= 0) return null;
    if (item && item.isPotential && Number.isFinite(Number(item.formFrequencyPerYear))) {
        return Number(item.formFrequencyPerYear);
    }
    const sampleSize = Number(item && (item.sampleSize ?? item.currentCount));
    if (!Number.isFinite(sampleSize)) return null;
    return sampleSize / Number(totalYears);
}

function getPotentialFormationCount(item) {
    const value = Number(item && item.formationCount);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function isPotentialCandidateEligible(item, maxPotentialFormationCount = MAX_POTENTIAL_FORMATION_COUNT) {
    if (!item || !item.isPotential) return true;
    if (Number.isFinite(Number(item.formFrequencyPerYear))) {
        return Number(item.formFrequencyPerYear) <= MAX_POTENTIAL_FREQUENCY_PER_YEAR;
    }
    return getPotentialFormationCount(item) <= maxPotentialFormationCount;
}

function isHighFrequencyCandidate(item, totalYears, limit = HIGH_FREQUENCY_LIMIT_PER_YEAR) {
    if (!limit || limit <= 0) return false;
    const frequencyPerYear = getCandidateFrequencyPerYear(item, totalYears);
    return Number.isFinite(frequencyPerYear) && frequencyPerYear > limit;
}

function sampleSizeScore(sampleSize) {
    const sample = Math.max(0, Number(sampleSize) || 0);
    return clamp(Math.log10(sample + 1) / Math.log10(80));
}

function recencyScore(daysSinceLatestEnd) {
    if (daysSinceLatestEnd === null || daysSinceLatestEnd === undefined) return 0.45;
    return clamp(1 / (1 + Math.max(0, Number(daysSinceLatestEnd) || 0) / 180));
}

function gapTimingScore(daysSinceLatestEnd, avgGapDays) {
    const gap = Number(avgGapDays);
    if (!Number.isFinite(gap) || gap <= 0 || daysSinceLatestEnd === null || daysSinceLatestEnd === undefined) {
        return 0.5;
    }
    const ratio = Math.max(0, Number(daysSinceLatestEnd) || 0) / gap;
    if (ratio <= 1) return clamp(0.45 + ratio * 0.55);
    return clamp(1 - Math.min(0.35, (ratio - 1) * 0.12));
}

function avgLengthScore(streakLength, avgLength) {
    const avg = Number(avgLength);
    if (!Number.isFinite(avg) || avg <= 0) return 0.5;
    return clamp((Number(streakLength) || 0) / avg / 1.5);
}

function edgeScore(edge) {
    return clamp(0.5 + (Number(edge) || 0) * 2);
}

function safeLogit(probability) {
    const p = clamp(probability, 0.0001, 0.9999);
    return Math.log(p / (1 - p));
}

function collectStatsEntries(allStats) {
    const entries = [];
    for (const key in allStats || {}) {
        const categoryData = allStats[key];
        if (categoryData && Array.isArray(categoryData.streaks)) {
            entries.push({ key, categoryData });
        } else if (categoryData && typeof categoryData === 'object') {
            for (const subKey in categoryData) {
                const sub = categoryData[subKey];
                if (sub && Array.isArray(sub.streaks)) {
                    entries.push({ key: `${key}:${subKey}`, categoryData: sub });
                }
            }
        }
    }
    return entries;
}

function analyzeReliabilityForEntry(key, categoryData, latestDate, totalYears) {
    const streaks = (categoryData.streaks || [])
        .filter(item => item && Number.isFinite(Number(item.length)) && item.length > 0);
    if (streaks.length === 0) return null;

    const lengths = streaks.map(item => Number(item.length));
    const maxLen = Math.max(...lengths);
    const totalLength = lengths.reduce((sum, len) => sum + len, 0);
    const avgLength = totalLength / lengths.length;
    const sortedByStart = streaks
        .filter(item => item.startDate)
        .slice()
        .sort((a, b) => parseRawDate(a.startDate) - parseRawDate(b.startDate));
    const sortedByEnd = streaks
        .filter(item => item.endDate)
        .slice()
        .sort((a, b) => parseRawDate(a.endDate) - parseRawDate(b.endDate));

    let avgGapDays = null;
    if (sortedByStart.length > 1) {
        const gaps = [];
        for (let i = 1; i < sortedByStart.length; i++) {
            const gap = daysBetween(sortedByStart[i - 1].startDate, sortedByStart[i].startDate);
            if (gap !== null && gap >= 0) gaps.push(gap);
        }
        if (gaps.length > 0) avgGapDays = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    }

    const latestEndDate = sortedByEnd.length > 0 ? sortedByEnd[sortedByEnd.length - 1].endDate : '';
    const daysSinceLatestEnd = latestEndDate && latestDate ? daysBetween(latestEndDate, latestDate) : null;
    const step = getPatternStep(key);
    const startLen = getDropOffStartLen(key);
    const dropOffPoints = [];

    for (let len = startLen; len <= maxLen; len += step) {
        const reached = lengths.filter(value => value >= len).length;
        if (reached <= 0) continue;
        const continued = lengths.filter(value => value >= len + step).length;
        const broke = reached - continued;
        const dropOffRate = broke / reached;
        const lowerBound = wilsonLowerBound(broke, reached);
        const frequencyPerYear = totalYears > 0 ? reached / totalYears : 0;
        const sampleScore = Math.min(1, Math.log10(reached + 1) / Math.log10(100));
        const recencyScore = daysSinceLatestEnd === null ? 0 : 1 / (1 + Math.max(daysSinceLatestEnd, 0) / 365);
        const reliabilityScore = Math.round((lowerBound * 0.68 + sampleScore * 0.22 + recencyScore * 0.10) * 100);

        dropOffPoints.push({
            length: len,
            nextLength: len + step,
            reached,
            continued,
            broke,
            dropOffRate,
            dropOffPercent: Math.round(dropOffRate * 1000) / 10,
            lowerBound,
            lowerBoundPercent: Math.round(lowerBound * 1000) / 10,
            frequencyPerYear: Math.round(frequencyPerYear * 10) / 10,
            reliabilityScore
        });
    }

    if (dropOffPoints.length === 0) return null;

    const bestPoint = dropOffPoints
        .slice()
        .sort((a, b) => {
            if (b.reliabilityScore !== a.reliabilityScore) return b.reliabilityScore - a.reliabilityScore;
            if (b.dropOffRate !== a.dropOffRate) return b.dropOffRate - a.dropOffRate;
            return b.reached - a.reached;
        })[0];

    const { category, subcategory } = parseStatsKey(key);
    const title = exclusionLogic.getCategoryName
        ? exclusionLogic.getCategoryName(category, subcategory, key)
        : key;

    return {
        key,
        title,
        occurrences: streaks.length,
        avgLength: Math.round(avgLength * 10) / 10,
        maxLength: maxLen,
        avgGapDays: avgGapDays === null ? null : Math.round(avgGapDays * 10) / 10,
        daysSinceLatestEnd,
        latestEndDate,
        bestPoint,
        dropOffPoints
    };
}

function buildReliabilityReport(candidates, sortedData) {
    const latest = sortedData[sortedData.length - 1];
    const latestDate = latest ? formatRawDate(latest.date) : '';
    const totalYears = getHistoryYearsAtIndex(sortedData, sortedData.length - 1);
    const allStats = historicalExclusionService.loadAllStats();
    const entries = collectStatsEntries(allStats)
        .map(({ key, categoryData }) => analyzeReliabilityForEntry(key, categoryData, latestDate, totalYears))
        .filter(Boolean);

    const byKey = new Map(entries.map(item => [item.key, item]));
    const currentCandidates = (candidates || []).map(candidate => {
        const entry = byKey.get(candidate.key);
        let matchingPoint = null;
        if (entry) {
            matchingPoint = entry.dropOffPoints.find(point => point.length === candidate.streak) || entry.bestPoint;
        }
        return {
            key: candidate.key,
            title: candidate.title,
            isPotential: !!candidate.isPotential,
            numbersCount: candidate.numbers.length,
            dropOffRate: candidate.dropOffRate,
            exclusionPriority: candidate.exclusionPriority,
            dropOffPercent: candidate.dropOffPercent,
            edgePercent: candidate.edgePercent,
            reliabilityScore: candidate.reliabilityScore || (matchingPoint ? matchingPoint.reliabilityScore : 0),
            lowerBoundPercent: candidate.lowerBoundPercent || (matchingPoint ? matchingPoint.lowerBoundPercent : 0),
            sampleSize: candidate.sampleSize || (matchingPoint ? matchingPoint.reached : 0),
            avgLength: entry ? entry.avgLength : null,
            avgGapDays: entry ? entry.avgGapDays : null,
            daysSinceLatestEnd: entry ? entry.daysSinceLatestEnd : null
        };
    }).sort((a, b) => {
        if ((b.exclusionPriority || 0) !== (a.exclusionPriority || 0)) return (b.exclusionPriority || 0) - (a.exclusionPriority || 0);
        if (b.reliabilityScore !== a.reliabilityScore) return b.reliabilityScore - a.reliabilityScore;
        return (b.dropOffRate || 0) - (a.dropOffRate || 0);
    });

    const highReliability = entries.filter(item => item.bestPoint.reliabilityScore >= 70);
    const highDropLowTrust = entries
        .filter(item => item.bestPoint.dropOffRate >= 0.85 && item.bestPoint.reliabilityScore < 55)
        .sort((a, b) => b.bestPoint.dropOffRate - a.bestPoint.dropOffRate)
        .slice(0, 20);

    const compactEntry = item => ({
        key: item.key,
        title: item.title,
        occurrences: item.occurrences,
        avgLength: item.avgLength,
        maxLength: item.maxLength,
        avgGapDays: item.avgGapDays,
        daysSinceLatestEnd: item.daysSinceLatestEnd,
        latestEndDate: item.latestEndDate,
        bestPoint: item.bestPoint
    });

    return {
        latestDate,
        totalYears: Math.round(totalYears * 10) / 10,
        totalPatterns: entries.length,
        highReliabilityCount: highReliability.length,
        avgReliabilityScore: entries.length > 0
            ? Math.round(entries.reduce((sum, item) => sum + item.bestPoint.reliabilityScore, 0) / entries.length)
            : 0,
        topReliable: entries
            .slice()
            .sort((a, b) => b.bestPoint.reliabilityScore - a.bestPoint.reliabilityScore)
            .slice(0, 30)
            .map(compactEntry),
        highDropLowTrust: highDropLowTrust.map(compactEntry),
        currentCandidates: currentCandidates.slice(0, 80)
    };
}

function getCandidateHistoryMetrics(item, quickStats) {
    const stat = quickStats ? quickStats[item.key] : null;
    const step = getPatternStep(item.key);
    const length = Number(item.streak || 0);
    const targetLength = Number(item.targetLength || (item.isPotential ? item.streak : length + step));
    const reachedInfo = stat && stat.gapStats ? stat.gapStats[length] : null;
    const continuedInfo = stat && stat.gapStats ? stat.gapStats[length + step] : null;
    const fallbackSampleSize = reachedInfo ? Number(reachedInfo.count || 0) : 0;
    const fallbackContinuedCount = continuedInfo ? Number(continuedInfo.count || 0) : 0;
    const sampleSize = Number.isFinite(Number(item.exclusionSampleSize)) && Number(item.exclusionSampleSize) > 0
        ? Number(item.exclusionSampleSize)
        : fallbackSampleSize;
    const continuedCount = item.isPotential && Number.isFinite(Number(item.formationCount))
        ? Number(item.formationCount)
        : fallbackContinuedCount;
    const breakCount = Number.isFinite(Number(item.nonFormationCount))
        ? Number(item.nonFormationCount)
        : Math.max(0, sampleSize - continuedCount);
    const lowerBound = Number.isFinite(Number(item.exclusionLowerBound))
        ? Number(item.exclusionLowerBound)
        : wilsonLowerBound(breakCount, sampleSize);
    const targetHistory = item.targetHistoryLength
        ? {
            occurrences: item.targetOccurrenceCount,
            avgLength: item.targetAvgLength,
            avgGapDays: item.targetAvgGapDays,
            latestEndDate: item.targetLatestEndDate,
            daysSinceLatestEnd: item.targetDaysSinceLatestEnd
        }
        : null;
    const statTargetHistory = stat && stat.lengthHistoryMetrics
        ? (stat.lengthHistoryMetrics[targetLength] || stat.lengthHistoryMetrics[String(targetLength)])
        : null;
    const history = targetHistory || statTargetHistory || (stat && stat.historyMetrics ? stat.historyMetrics : {});

    return {
        sampleSize,
        continuedCount,
        breakCount,
        lowerBound,
        lowerBoundPercent: Math.round(lowerBound * 1000) / 10,
        targetLength,
        occurrences: Number(history.occurrences || 0),
        avgLength: roundOne(history.avgLength),
        avgGapDays: roundOne(history.avgGapDays),
        latestEndDate: history.latestEndDate || '',
        daysSinceLatestEnd: history.daysSinceLatestEnd === null || history.daysSinceLatestEnd === undefined
            ? null
            : Number(history.daysSinceLatestEnd),
        targetTimingRatio: item.targetTimingRatio,
        targetTimingScore: item.targetTimingScore
    };
}

function buildCandidateScores(item) {
    const sampleScore = sampleSizeScore(item.sampleSize);
    const recentScore = recencyScore(item.daysSinceLatestEnd);
    const gapScore = gapTimingScore(item.daysSinceLatestEnd, item.avgGapDays);
    const lengthScore = avgLengthScore(item.streak, item.avgLength);
    const edgeComponent = edgeScore(item.edge);
    const dropOffComponent = clamp(item.dropOffRate || 0);
    const priorityComponent = clamp((item.exclusionPriority || 0) / 100);
    const lowerComponent = clamp(item.lowerBound || 0);
    const coverageScore = clamp((item.numbers ? item.numbers.length : 0) / 25);
    const potentialBoost = item.isPotential ? 0.03 : 0;

    const reliabilityScore = normalizeScorePercent(
        lowerComponent * 0.62 +
        sampleScore * 0.25 +
        recentScore * 0.13
    );
    const combinedScore = normalizeScorePercent(
        priorityComponent * 0.20 +
        lowerComponent * 0.18 +
        dropOffComponent * 0.14 +
        edgeComponent * 0.14 +
        sampleScore * 0.12 +
        recentScore * 0.08 +
        gapScore * 0.05 +
        lengthScore * 0.05 +
        coverageScore * 0.04 +
        potentialBoost
    );

    return {
        sampleScore: roundOne(sampleScore * 100),
        recencyScore: roundOne(recentScore * 100),
        gapTimingScore: roundOne(gapScore * 100),
        avgLengthScore: roundOne(lengthScore * 100),
        edgeScore: roundOne(edgeComponent * 100),
        reliabilityScore,
        combinedScore
    };
}

function sortCandidatesByPriority(candidates) {
    return candidates.sort((a, b) => {
        const groupCompare = exclusionLogic.compareExclusionCandidates
            ? exclusionLogic.compareExclusionCandidates(a, b)
            : 0;
        if (groupCompare !== 0) return groupCompare;
        if ((b.exclusionPriority || 0) !== (a.exclusionPriority || 0)) {
            return (b.exclusionPriority || 0) - (a.exclusionPriority || 0);
        }
        if (Math.abs((b.dropOffRate || 0) - (a.dropOffRate || 0)) > 0.000001) {
            return (b.dropOffRate || 0) - (a.dropOffRate || 0);
        }
        if ((b.streak || 0) !== (a.streak || 0)) return (b.streak || 0) - (a.streak || 0);
        return String(a.title || a.key).localeCompare(String(b.title || b.key), 'vi');
    });
}

function enrichCandidateExplanations(explanations, quickStats) {
    return (explanations || [])
        .map(item => ({
            ...item,
            numbers: normalizeNumberList(item.numbers),
            exclusionPriority: roundOne(item.exclusionPriority || 0),
            dropOffPercent: Math.round((item.dropOffRate || 0) * 1000) / 10
        }))
        .filter(item => item.numbers.length > 0)
        .map(item => {
            const baselineBreakRate = 1 - (item.numbers.length / 100);
            const edge = (item.dropOffRate || 0) - baselineBreakRate;
            const historyMetrics = getCandidateHistoryMetrics(item, quickStats);
            const enriched = {
                ...item,
                ...historyMetrics,
                baselineBreakRate,
                edge,
                edgePercent: Math.round(edge * 1000) / 10
            };
            return {
                ...enriched,
                ...buildCandidateScores(enriched)
            };
        });
}

function buildCandidateList(quickStats, options = {}) {
    const exclusionOptions = { minPriority: 0 };
    if (Number.isFinite(Number(options.minDropOffRate))) {
        exclusionOptions.minDropOffRate = Math.max(0, Math.min(1, Number(options.minDropOffRate)));
    }
    const all = exclusionLogic.getDropOffExclusions(quickStats, exclusionOptions);
    const candidates = enrichCandidateExplanations(all.explanations, quickStats);
    const filtered = options.excludeFixedThreeValueGroups
        ? candidates.filter(item => !isFixedThreeValueGroupCandidate(item))
        : candidates;
    return sortCandidatesByPriority(filtered);
}

function buildThresholdMethod(candidates) {
    const selected = candidates.filter(item =>
        (item.exclusionPriority || 0) >= PRIORITY_THRESHOLD &&
        isPotentialCandidateEligible(item)
    );
    const excluded = new Set();
    selected.forEach(item => item.numbers.forEach(num => excluded.add(num)));

    return {
        id: 'dropoff85',
        name: 'Tier loại trừ tự động',
        description: 'Ưu tiên Tier 1 kỷ lục/siêu kỷ lục, Tier 2 chuỗi đang diễn ra có tần suất target <1/năm, sau đó Tier 3 theo dropoff/không hình thành.',
        selectedStreaks: selected,
        excluded: [...excluded].sort((a, b) => a - b)
    };
}

function buildThresholdMethodFromQuickStats(quickStats) {
    const result = exclusionLogic.getDropOffExclusions(quickStats, {
        minPriority: PRIORITY_THRESHOLD,
        includePotential: true,
        maxPotentialFormationCount: MAX_POTENTIAL_FORMATION_COUNT,
        maxPotentialFormationPerYear: MAX_POTENTIAL_FREQUENCY_PER_YEAR
    });
    const selected = sortCandidatesByPriority(enrichCandidateExplanations(result.explanations || [], quickStats));

    return {
        id: 'dropoff85',
        name: 'Tier loại trừ tự động',
        description: 'Ưu tiên Tier 1 kỷ lục/siêu kỷ lục, Tier 2 chuỗi đang diễn ra có tần suất target <1/năm, sau đó Tier 3 theo dropoff/không hình thành.',
        selectedStreaks: selected,
        excluded: normalizeNumberList(result.excluded || [])
    };
}

function buildThresholdChainFrequencyMethod(candidates, totalYears = 20, options = {}) {
    const minPriority = parseNumericOption(options.minPriority, PRIORITY_THRESHOLD, 0, 100);
    const protectedCount = Math.round(parseNumericOption(
        options.protectedCount,
        CHAIN_FREQUENCY_PROTECTED_COUNT,
        0,
        100
    ));
    const minChainSignal = parseNumericOption(options.minChainSignal, 55, 0, 100);
    const skipChainSignal = parseNumericOption(options.skipChainSignal, 75, 0, 100) / 100;
    const rankedNumbers = calculateChainFrequencyNumberScores(candidates, totalYears);
    const protectedNumbers = new Set(
        rankedNumbers
            .filter(item => Number(item.finalScore || 0) > 0)
            .slice(0, protectedCount)
            .map(item => item.number)
    );
    const selectedCandidates = (candidates || [])
        .filter(item =>
            (item.exclusionPriority || 0) >= minPriority &&
            isPotentialCandidateEligible(item)
        );

    const excluded = new Set();
    const selected = [];

    for (const item of selectedCandidates) {
        const signal = getChainAppearanceWeight(item, totalYears);
        const action = classifyChainFrequencyAction(item, signal || {}, {
            minExclusionPriority: minPriority,
            minChainSignal
        });
        if (
            action === 'bet' &&
            signal &&
            Number(signal.rawSignal || 0) >= skipChainSignal &&
            Number(signal.riskDiscount || 0) >= 0.45
        ) {
            continue;
        }

        const originalNumbers = normalizeNumberList(item.numbers);
        const numbers = originalNumbers.filter(num => !protectedNumbers.has(num));
        if (numbers.length === 0) continue;

        numbers.forEach(num => excluded.add(num));
        selected.push({
            ...item,
            numbers,
            numbersCount: numbers.length,
            originalNumbersCount: originalNumbers.length,
            addedNumbersCount: numbers.length,
            combinedStage: action === 'exclude'
                ? 'ưu tiên 85 + tần suất: nên loại'
                : 'ưu tiên 85 + tần suất: theo dõi',
            protectedNumbersCount: originalNumbers.length - numbers.length,
            chainAction: action,
            chainSignalScore: signal ? roundOne(signal.weight * 1000) : null,
            chainRawSignalScore: signal ? roundOne(signal.rawSignal * 100) : null,
            chainRiskDiscountScore: signal ? roundOne(signal.riskDiscount * 100) : null,
            chainDueScore: signal ? roundOne(signal.dueScore * 100) : null,
            chainFrequencyPerYear: signal ? roundOne(signal.frequencyPerYear) : null,
            chainAppearanceRate: signal ? signal.appearanceRate : null
        });
    }

    return {
        id: 'dropoff85ChainFrequency',
        name: 'Tier + Gap bảo vệ',
        description: `Nền là Tier loại trừ. Gap/xác suất tiếp tục được dùng để bỏ qua chuỗi có tín hiệu giữ số rất mạnh và bảo vệ ${protectedNumbers.size} số có tín hiệu tiếp tục/hình thành cao nhất.`,
        selectedStreaks: selected,
        excluded: [...excluded].sort((a, b) => a - b),
        protectedNumbers: [...protectedNumbers].sort((a, b) => a - b)
    };
}

function shouldIncludeOvershoot(currentCount, projectedCount, target = CHAIN_ORDER_TARGET_EXCLUDED, targetMax = CHAIN_ORDER_TARGET_MAX) {
    if (projectedCount <= target) return true;
    if (projectedCount > targetMax) return false;
    return Math.abs(projectedCount - target) <= Math.abs(currentCount - target);
}

function rankNumbersForExactChainTarget(sortedCandidates = [], totalYears = 20, mode = 'risk') {
    const scores = new Map(ALL_NUMBERS.map(number => [number, 0]));
    const maxRank = Math.max(1, sortedCandidates.length);

    sortedCandidates.forEach((item, index) => {
        const nums = normalizeNumberList(item.numbers);
        if (nums.length === 0) return;
        const sortScore = Math.max(0, getChainExclusionSortScore(item, totalYears, mode));
        const riskRate = Math.max(0, getCandidateRiskRate(item));
        const edge = Math.max(0, getCandidateExclusionEdge(item));
        const priority = clamp((Number(item.exclusionPriority) || 0) / 100);
        const rankBonus = (maxRank - index) / maxRank;
        const weight = (sortScore * 4) + (riskRate * 2) + (edge * 2) + priority + (rankBonus * 0.25);
        const perNumberWeight = Number.isFinite(weight) && weight > 0
            ? weight / Math.sqrt(nums.length)
            : 0;
        nums.forEach(number => {
            scores.set(number, (scores.get(number) || 0) + perNumberWeight);
        });
    });

    return ALL_NUMBERS
        .map(number => ({ number, score: scores.get(number) || 0 }))
        .sort((a, b) => b.score - a.score || a.number - b.number);
}

function applyExactChainTarget(excluded, selected, sortedCandidates, target, totalYears, mode) {
    const targetCount = Math.max(0, Math.min(100, Math.round(Number(target) || 0)));
    if (targetCount <= 0) {
        return { excluded: [], selected: [] };
    }

    const ranked = rankNumbersForExactChainTarget(sortedCandidates, totalYears, mode);
    const rankScore = new Map(ranked.map(item => [item.number, item.score]));
    let exactExcluded = normalizeNumberList(excluded);

    if (exactExcluded.length > targetCount) {
        exactExcluded = exactExcluded
            .sort((a, b) => (rankScore.get(b) || 0) - (rankScore.get(a) || 0) || a - b)
            .slice(0, targetCount)
            .sort((a, b) => a - b);
    } else if (exactExcluded.length < targetCount) {
        const exactSet = new Set(exactExcluded);
        for (const item of ranked) {
            if (exactSet.has(item.number)) continue;
            exactSet.add(item.number);
            exactExcluded.push(item.number);
            if (exactExcluded.length >= targetCount) break;
        }
        exactExcluded = normalizeNumberList(exactExcluded);
    }

    const exactSet = new Set(exactExcluded);
    const covered = new Set();
    const exactSelected = [];
    for (const item of selected || []) {
        const nums = normalizeNumberList(item.numbers)
            .filter(number => exactSet.has(number) && !covered.has(number));
        if (nums.length === 0) continue;
        nums.forEach(number => covered.add(number));
        exactSelected.push({
            ...item,
            numbers: nums,
            addedNumbersCount: nums.length
        });
    }

    const filledNumbers = exactExcluded.filter(number => !covered.has(number));
    if (filledNumbers.length > 0) {
        exactSelected.push({
            key: `exact_target_fill_${mode}_${targetCount}`,
            title: `Bổ sung đủ target loại ${targetCount} số`,
            streak: 0,
            maxStreak: 0,
            dropOffRate: 0,
            dropOffPercent: 0,
            exclusionPriority: 0,
            baselineBreakRate: 0,
            edge: 0,
            edgePercent: 0,
            reliabilityScore: 0,
            sampleSize: 0,
            continuedCount: 0,
            breakCount: 0,
            lowerBound: 0,
            lowerBoundPercent: 0,
            avgLength: 0,
            avgGapDays: 0,
            daysSinceLatestEnd: 0,
            targetLength: 0,
            numbers: filledNumbers,
            numbersCount: filledNumbers.length,
            addedNumbersCount: filledNumbers.length,
            combinedStage: 'exact-target-fill',
            chainOrderSortMode: mode,
            reason: 'Bổ sung theo điểm rủi ro từng số để phương pháp giữ đúng số lượng loại trừ đã cấu hình.'
        });
    }

    return { excluded: exactExcluded, selected: exactSelected };
}

function buildChainOrderHoldMethod(candidates, totalYears = 20, sortBy = 'frequency', options = {}) {
    const mode = normalizeChainSortBy(sortBy);
    const includePotential = options.includePotential !== false;

    // Use dynamic target excluded size if provided, otherwise default to 60
    const target = Number(options.targetExcluded) || CHAIN_ORDER_TARGET_EXCLUDED;
    const targetMin = options.targetMin !== undefined ? Number(options.targetMin) : Math.max(0, target - 5);
    const targetMax = options.targetMax !== undefined ? Number(options.targetMax) : Math.min(100, target + 5);

    const sorted = (candidates || [])
        .filter(item => normalizeNumberList(item.numbers).length > 0)
        .filter(item => includePotential || !item.isPotential)
        .slice()
        .sort((a, b) => compareChainItems(a, b, mode, totalYears));
    const excluded = new Set();
    const selected = [];
    const overshootCandidates = [];

    for (const item of sorted) {
        const nums = normalizeNumberList(item.numbers);
        const newNumbers = nums.filter(num => !excluded.has(num));
        if (newNumbers.length === 0) continue;

        const projectedCount = excluded.size + newNumbers.length;
        if (projectedCount <= target) {
            newNumbers.forEach(num => excluded.add(num));
            selected.push({
                ...item,
                numbers: nums,
                addedNumbersCount: newNumbers.length,
                frequencyPerYear: roundFrequency(getCandidateFrequencyRaw(item, totalYears)),
                riskRate: getCandidateRiskRate(item),
                chainSortScore: roundOne(getChainExclusionSortScore(item, totalYears, mode) * 100),
                chainOrderSortMode: mode
            });
            if (excluded.size >= target) break;
            continue;
        }

        overshootCandidates.push({ item, nums, newNumbers, projectedCount });
    }

    if (excluded.size < targetMin && overshootCandidates.length > 0) {
        const best = overshootCandidates
            .filter(candidate => candidate.projectedCount <= targetMax)
            .sort((a, b) => {
                const aDistance = Math.abs(a.projectedCount - target);
                const bDistance = Math.abs(b.projectedCount - target);
                if (aDistance !== bDistance) return aDistance - bDistance;
                return compareChainItems(a.item, b.item, mode, totalYears);
            })[0];

        if (best && shouldIncludeOvershoot(excluded.size, best.projectedCount, target, targetMax)) {
            best.newNumbers.forEach(num => excluded.add(num));
            selected.push({
                ...best.item,
                numbers: best.nums,
                addedNumbersCount: best.newNumbers.length,
                frequencyPerYear: roundFrequency(getCandidateFrequencyRaw(best.item, totalYears)),
                riskRate: getCandidateRiskRate(best.item),
                chainSortScore: roundOne(getChainExclusionSortScore(best.item, totalYears, mode) * 100),
                chainOrderSortMode: mode
            });
        }
    }

    let finalExcluded = [...excluded].sort((a, b) => a - b);
    let finalSelected = selected;
    if (options.exactTargetExcluded === true) {
        const exact = applyExactChainTarget(finalExcluded, selected, sorted, target, totalYears, mode);
        finalExcluded = exact.excluded;
        finalSelected = exact.selected;
    }

    const modeLabel = mode === 'tierRisk'
        ? 'Tier/kỷ lục trước, rồi rủi ro cao -> thấp'
        : (mode === 'scarcityRisk'
            ? 'Tiềm năng không hình thành/hiếm trước, rồi rủi ro'
            : (mode === 'recordAdjusted'
                ? 'Kỷ lục/siêu kỷ lục có hiệu chỉnh khả năng tiếp diễn'
                : (mode === 'potentialFirstRisk'
                    ? 'Chuỗi tiềm năng không hình thành trước, rồi theo độ hiếm/rủi ro'
                    : (mode === 'recordFirstRisk'
                        ? 'Chuỗi kỷ lục/siêu kỷ lục trước, rồi theo rủi ro hiệu chỉnh'
                        : (mode === 'wilsonRisk'
                            ? 'Wilson lower bound + edge + mẫu lịch sử'
                            : (mode === 'risk' ? 'Rủi ro cao -> thấp' : 'HT/Target thấp -> cao'))))));
    return {
        id: mode === 'tierRisk' ? 'tierHold60' : (mode === 'scarcityRisk' ? 'scarcityHold60' : (mode === 'recordAdjusted' ? 'recordHold60' : (mode === 'potentialFirstRisk' ? 'potentialHold60' : (mode === 'recordFirstRisk' ? 'recordFirstHold60' : (mode === 'wilsonRisk' ? 'wilsonHold60' : (mode === 'risk' ? 'riskHold60' : 'frequencyHold60')))))),
        name: mode === 'tierRisk'
            ? 'Ôm 60 theo Tier/kỷ lục'
            : (mode === 'scarcityRisk'
                ? 'Ôm 60 theo tiềm năng hiếm'
                : (mode === 'recordAdjusted'
                    ? 'Ôm 60 theo kỷ lục hiệu chỉnh'
                    : (mode === 'potentialFirstRisk'
                        ? 'Ôm 60 theo tiềm năng trước'
                        : (mode === 'recordFirstRisk'
                            ? 'Ôm 60 theo kỷ lục trước'
                            : (mode === 'wilsonRisk'
                                ? 'Ôm 60 theo Wilson/edge'
                                : (mode === 'risk' ? 'Ôm 60 theo rủi ro' : 'Ôm 60 theo HT/Target')))))),
        description: `${modeLabel}; lấy chuỗi dự đoán từ trên xuống tới khoảng ${target} số ôm, các số còn lại dùng để đánh.`,
        selectedStreaks: finalSelected,
        excluded: finalExcluded,
        targetExcluded: target
    };
}

function buildEdgeThresholdMethod(candidates) {
    const selected = candidates.filter(item => {
        const qualifiesByPriority = (item.exclusionPriority || 0) >= PRIORITY_THRESHOLD;
        return qualifiesByPriority && item.edge > 0 && isPotentialCandidateEligible(item);
    });
    const excluded = new Set();
    selected.forEach(item => item.numbers.forEach(num => excluded.add(num)));

    return {
        id: 'dropoff85Edge',
        name: 'Ưu tiên >= 85 + Edge dương',
        description: 'Chỉ dùng chuỗi ưu tiên >= 85 khi rủi ro vượt xác suất nền theo số lượng số bị loại.',
        selectedStreaks: selected,
        excluded: [...excluded].sort((a, b) => a - b)
    };
}

function buildRankedMethod(candidates, options = {}) {
    const targetMin = options.targetMin || RANKED_TARGET_MIN;
    const targetMax = options.targetMax || RANKED_TARGET_MAX;
    const minPriority = Number.isFinite(Number(options.minPriority)) ? Number(options.minPriority) : PRIORITY_THRESHOLD;
    const excluded = new Set();
    const selected = [];

    for (const item of candidates) {
        if ((item.exclusionPriority || 0) < minPriority) continue;
        const newNumbers = item.numbers.filter(num => !excluded.has(num));
        if (newNumbers.length === 0) continue;

        const projectedCount = excluded.size + newNumbers.length;
        if (projectedCount > targetMax) {
            continue;
        }

        newNumbers.forEach(num => excluded.add(num));
        selected.push({
            ...item,
            addedNumbersCount: newNumbers.length
        });

        if (excluded.size >= targetMin) break;
    }

    return {
        id: options.id || 'ranked60to70',
        name: options.name || 'Xếp hạng ưu tiên loại 60-70 số',
        description: options.description || 'Lấy lần lượt chuỗi có điểm ưu tiên loại cao nhất cho tới khi vùng loại trừ đạt khoảng 60-70 số.',
        selectedStreaks: selected,
        excluded: [...excluded].sort((a, b) => a - b)
    };
}

function compareCustomCandidates(a, b) {
    const recordCriticalDiff = Number(!!b.isRecordDropOffCritical) - Number(!!a.isRecordDropOffCritical);
    if (recordCriticalDiff !== 0) return recordCriticalDiff;
    return compareCombinedCandidates(a, b);
}

function buildCustomExclusionMethod(candidates, customOptions = {}, totalYears = 20) {
    const options = normalizeCustomOptions(customOptions);
    const minDropOff = options.minDropOffPercent / 100;
    const minLowerBound = options.minLowerBoundPercent / 100;

    const selectedCandidates = (candidates || [])
        .filter(item => {
            if (!options.includeFormed && !item.isPotential) return false;
            if (!options.includePotential && item.isPotential) return false;
            if (!isPotentialCandidateEligible(item, options.maxPotentialFormationCount)) return false;
            if ((item.exclusionPriority || 0) < options.minPriority) return false;
            if ((item.dropOffRate || 0) < minDropOff) return false;
            if ((item.lowerBound || 0) < minLowerBound) return false;
            if ((item.sampleSize || 0) < options.minSampleSize) return false;
            if (options.requirePositiveEdge && (item.edge || 0) <= 0) return false;

            const frequencyPerYear = getCandidateFrequencyPerYear(item, totalYears);
            if (
                !options.includeHighFrequency &&
                isHighFrequencyCandidate(item, totalYears, HIGH_FREQUENCY_LIMIT_PER_YEAR)
            ) {
                return false;
            }
            if (
                options.maxFrequencyPerYear > 0 &&
                Number.isFinite(frequencyPerYear) &&
                frequencyPerYear > options.maxFrequencyPerYear
            ) {
                return false;
            }
            if (
                item.isPotential &&
                options.maxPotentialFrequencyPerYear > 0 &&
                Number.isFinite(frequencyPerYear) &&
                frequencyPerYear > options.maxPotentialFrequencyPerYear
            ) {
                return false;
            }
            return true;
        })
        .slice()
        .sort(compareCustomCandidates);

    const excluded = new Set();
    const selected = [];

    for (const item of selectedCandidates) {
        const newNumbers = item.numbers.filter(num => !excluded.has(num));
        if (newNumbers.length === 0) continue;

        if (options.targetExcluded > 0 && excluded.size + newNumbers.length > options.targetExcluded) {
            continue;
        }

        newNumbers.forEach(num => excluded.add(num));
        selected.push({
            ...item,
            addedNumbersCount: newNumbers.length,
            frequencyPerYear: roundOne(getCandidateFrequencyPerYear(item, totalYears))
        });

        if (options.targetExcluded > 0 && excluded.size >= options.targetExcluded) break;
    }

    const frequencyText = options.maxFrequencyPerYear > 0
        ? `tần suất đạt <= ${options.maxFrequencyPerYear}/năm`
        : 'không giới hạn tần suất chuỗi đã hình thành';
    const potentialText = options.maxPotentialFrequencyPerYear > 0
        ? `tiềm năng <= ${options.maxPotentialFrequencyPerYear}/năm`
        : `tiềm năng HT <= ${options.maxPotentialFormationCount} lần`;
    const highFrequencyText = options.includeHighFrequency
        ? 'có lấy chuỗi tần suất lớn'
        : `bỏ chuỗi > ${HIGH_FREQUENCY_LIMIT_PER_YEAR}/năm`;
    const fixedThreeValueText = options.excludeFixedThreeValueGroups
        ? ', bỏ nhóm 3 giá trị cố định'
        : '';

    return {
        id: 'customExclusion',
        name: 'Custom loại trừ',
        description: `Tuỳ chỉnh theo ưu tiên >= ${options.minPriority}, dropoff/không HT >= ${options.minDropOffPercent}%, lower >= ${options.minLowerBoundPercent}%, mẫu >= ${options.minSampleSize}, ${frequencyText}, ${potentialText}, ${highFrequencyText}${fixedThreeValueText}, target loại ${options.targetExcluded || 'không giới hạn'} số.`,
        selectedStreaks: selected,
        excluded: [...excluded].sort((a, b) => a - b),
        customOptions: options
    };
}

function compareCombinedCandidates(a, b) {
    const priorityOrder = exclusionLogic.compareExclusionCandidates
        ? exclusionLogic.compareExclusionCandidates(a, b)
        : 0;
    if (priorityOrder !== 0) return priorityOrder;
    if ((b.exclusionPriority || 0) !== (a.exclusionPriority || 0)) return (b.exclusionPriority || 0) - (a.exclusionPriority || 0);
    if ((b.combinedScore || 0) !== (a.combinedScore || 0)) return (b.combinedScore || 0) - (a.combinedScore || 0);
    if ((b.reliabilityScore || 0) !== (a.reliabilityScore || 0)) return (b.reliabilityScore || 0) - (a.reliabilityScore || 0);
    if ((b.lowerBound || 0) !== (a.lowerBound || 0)) return (b.lowerBound || 0) - (a.lowerBound || 0);
    if ((b.edge || 0) !== (a.edge || 0)) return (b.edge || 0) - (a.edge || 0);
    if ((b.sampleSize || 0) !== (a.sampleSize || 0)) return (b.sampleSize || 0) - (a.sampleSize || 0);
    return (b.dropOffRate || 0) - (a.dropOffRate || 0);
}

function getCombinedNumberRiskScore(item) {
    const numbersCount = Math.max(1, item.numbers ? item.numbers.length : 1);
    const edgeComponent = Math.max(0, Number(item.edge || 0));
    const lowerComponent = clamp(item.lowerBound || 0);
    const dropOffComponent = clamp(item.dropOffRate || 0);
    const priorityComponent = clamp((item.exclusionPriority || 0) / 100);
    const sampleComponent = clamp((Number(item.sampleScore) || 0) / 100);
    const recencyComponent = clamp((Number(item.recencyScore) || 0) / 100);
    const reliabilityComponent = clamp((Number(item.reliabilityScore) || 0) / 100);
    const gapComponent = clamp((Number(item.gapTimingScore) || 0) / 100);
    const lengthComponent = clamp((Number(item.avgLengthScore) || 0) / 100);

    const score =
        priorityComponent * 0.26 +
        edgeComponent * 0.23 +
        lowerComponent * 0.18 +
        dropOffComponent * 0.10 +
        sampleComponent * 0.08 +
        reliabilityComponent * 0.06 +
        recencyComponent * 0.05 +
        gapComponent * 0.05 +
        lengthComponent * 0.04;

    return score / Math.pow(numbersCount, COMBINED_NUMBER_PENALTY);
}

function buildCombinedReliabilityMethod(candidates) {
    const excluded = new Set();
    const selectedStreaks = [];

    const orderedCandidates = (candidates || [])
        .filter(item =>
            isPotentialCandidateEligible(item) &&
            normalizeNumberList(item.numbers).length > 0
        )
        .slice()
        .sort(compareCombinedCandidates);

    for (const item of orderedCandidates) {
        if (excluded.size >= COMBINED_TARGET_MAX) break;
        const newNumbers = normalizeNumberList(item.numbers).filter(num => !excluded.has(num));
        if (newNumbers.length === 0) continue;

        const remaining = COMBINED_TARGET_MAX - excluded.size;
        const addedNumbers = newNumbers.slice(0, remaining);
        addedNumbers.forEach(num => excluded.add(num));

        selectedStreaks.push({
            ...item,
            numbers: addedNumbers,
            numbersCount: addedNumbers.length,
            originalNumbersCount: normalizeNumberList(item.numbers).length,
            addedNumbersCount: addedNumbers.length,
            combinedStage: 'ưu tiên từ trên xuống',
            numberRiskScore: roundOne(getCombinedNumberRiskScore(item) * 100)
        });
    }

    return {
        id: 'combined20to30',
        name: 'Tổng hợp rủi ro 25 số đánh',
        description: 'Loại đúng 75 số theo thứ tự ưu tiên mới từ Tổng hợp dự đoán: kỷ lục trước, chuỗi đang diễn ra, rồi chuỗi tiềm năng <=1/năm. 25 số còn lại là số đánh.',
        selectedStreaks,
        excluded: [...excluded].sort((a, b) => a - b)
    };
}

function buildCombinedReliabilityMethodFromQuickStats(quickStats) {
    const result = exclusionLogic.getDropOffExclusions(quickStats, {
        minPriority: 0,
        includePotential: true,
        maxPotentialFormationPerYear: MAX_POTENTIAL_FREQUENCY_PER_YEAR
    });
    const candidates = (result.explanations || []).map(item => ({
        ...item,
        numbers: normalizeNumberList(item.numbers),
        dropOffRate: item.dropOffRate ?? item.exclusionRate,
        lowerBound: item.exclusionLowerBound,
        lowerBoundPercent: Number.isFinite(Number(item.exclusionLowerBound))
            ? roundOne(Number(item.exclusionLowerBound) * 100)
            : null,
        sampleSize: item.exclusionSampleSize,
        reliabilityScore: 0,
        combinedScore: item.exclusionPriority || 0,
        edge: 0
    }));
    return buildCombinedReliabilityMethod(candidates);
}

function getCandidateAppearanceStats(item = {}) {
    const sampleSize = Number.isFinite(Number(item.sampleSize))
        ? Number(item.sampleSize)
        : Number(item.exclusionSampleSize ?? item.currentCount ?? item.prefixCount ?? 0);
    const appearanceCount = Number.isFinite(Number(item.continuedCount))
        ? Number(item.continuedCount)
        : Number(item.formationCount ?? item.nextCount ?? 0);
    const safeSample = Math.max(0, sampleSize);
    const safeAppearance = Math.max(0, Math.min(safeSample || appearanceCount, appearanceCount));
    const fallbackRate = clamp(1 - Number(item.dropOffRate || item.exclusionRate || 0));
    const appearanceRate = safeSample > 0 ? clamp(safeAppearance / safeSample) : fallbackRate;

    return {
        sampleSize: safeSample,
        appearanceCount: safeAppearance,
        appearanceRate,
        appearanceLowerBound: wilsonLowerBound(safeAppearance, safeSample)
    };
}

function getCandidateTargetFrequencyPerYear(item = {}, totalYears = 20) {
    const years = Number(totalYears);
    if (!Number.isFinite(years) || years <= 0) return null;
    if (Number.isFinite(Number(item.targetOccurrenceCount))) {
        return Number(item.targetOccurrenceCount) / years;
    }
    if (item.isPotential && Number.isFinite(Number(item.formFrequencyPerYear))) {
        return Number(item.formFrequencyPerYear);
    }
    const stats = getCandidateAppearanceStats(item);
    return stats.appearanceCount / years;
}

function getChainRowFrequency(item = {}, totalYears = 20) {
    const years = Number(totalYears);
    if (!Number.isFinite(years) || years <= 0) {
        return {
            frequencyPerYear: null,
            frequencyCount: null,
            frequencyYears: null,
            frequencyKind: item && item.isPotential ? 'formation' : 'target'
        };
    }

    if (item && item.isPotential) {
        const formationCount = Number(item.formationCount);
        const direct = Number(item.formFrequencyPerYear);
        const count = Number.isFinite(formationCount) ? formationCount : null;
        return {
            frequencyPerYear: Number.isFinite(direct) ? direct : (count === null ? null : count / years),
            frequencyCount: count,
            frequencyYears: years,
            frequencyKind: 'formation'
        };
    }

    const occurrenceCount = Number(item.targetOccurrenceCount);
    const direct = Number(item.targetFrequencyPerYear);
    const fallbackNextCount = Number(item.nextCount);
    const count = Number.isFinite(occurrenceCount)
        ? occurrenceCount
        : (Number.isFinite(fallbackNextCount) ? fallbackNextCount : null);

    return {
        frequencyPerYear: Number.isFinite(direct) ? direct : (count === null ? null : count / years),
        frequencyCount: count,
        frequencyYears: years,
        frequencyKind: 'target'
    };
}

function roundFrequency(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    if (number === 0) return 0;
    if (Math.abs(number) < 0.1) return Math.round(number * 1000) / 1000;
    if (Math.abs(number) < 1) return Math.round(number * 100) / 100;
    return Math.round(number * 10) / 10;
}

function getCandidateRiskRate(item = {}) {
    const direct = Number(item.isPotential ? item.nonFormationRate : item.dropOffRate);
    if (Number.isFinite(direct)) return direct;
    const fallback = Number(item.exclusionRate);
    return Number.isFinite(fallback) ? fallback : 0;
}

function getCandidateFrequencyRaw(item = {}, totalYears = 20) {
    const info = getChainRowFrequency(item, totalYears);
    const value = Number(info.frequencyPerYear);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function getCandidateNumbersCount(item = {}) {
    return normalizeNumberList(item.numbers).length;
}

function getPotentialFormationFrequency(item = {}, totalYears = 20) {
    if (!item || !item.isPotential) return Number.POSITIVE_INFINITY;
    if (Number.isFinite(Number(item.formFrequencyPerYear))) {
        return Math.max(0, Number(item.formFrequencyPerYear));
    }
    const formationCount = Number(item.formationCount);
    const years = Number(totalYears);
    if (Number.isFinite(formationCount) && Number.isFinite(years) && years > 0) {
        return Math.max(0, formationCount / years);
    }
    return getCandidateFrequencyRaw(item, totalYears);
}

function getPotentialScarcityScore(item = {}, totalYears = 20) {
    if (!item || !item.isPotential) return 0;
    const recordLen = Number(item.recordLen ?? item.maxStreak ?? 0);
    if (recordLen === 0) return 1;

    const frequency = getPotentialFormationFrequency(item, totalYears);
    if (!Number.isFinite(frequency)) return 0.2;
    if (frequency <= 0) return 1;
    if (frequency <= 1) return clamp(1 - frequency * 0.15, 0.82, 1);
    return clamp(1 - Math.log10(frequency + 1) / Math.log10(12), 0, 0.82);
}

function getCandidatePosteriorBreakRate(item = {}, alpha = BAYES_LOG_ODDS_ALPHA) {
    const numsCount = getCandidateNumbersCount(item);
    const baselineBreakRate = Number.isFinite(Number(item.baselineBreakRate))
        ? clamp(Number(item.baselineBreakRate), 0.0001, 0.9999)
        : clamp(1 - numsCount / 100, 0.0001, 0.9999);
    const { sampleSize, breakCount } = getCandidateBreakSample(item);
    return clamp(
        (breakCount + alpha * baselineBreakRate) / Math.max(1, sampleSize + alpha),
        0.0001,
        0.9999
    );
}

function getCandidateLowerBound(item = {}) {
    const direct = Number(item.lowerBound ?? item.exclusionLowerBound);
    if (Number.isFinite(direct)) return clamp(direct);
    const { sampleSize, breakCount } = getCandidateBreakSample(item);
    return wilsonLowerBound(breakCount, sampleSize);
}

function getRecordCriticalScore(item = {}) {
    if (!item || item.isPotential) return 0;
    const tierRank = Number(item.exclusionTierRank ?? item.tierRank ?? 3);
    const currentLen = Number(item.currentLen ?? item.streak ?? 0);
    const targetLen = Number(item.targetLen ?? item.targetLength ?? currentLen);
    const recordLen = Number(item.recordLen ?? item.maxStreak ?? 0);
    if (recordLen <= 0) return 0;

    const reachesRecord = currentLen >= recordLen || targetLen > recordLen || item.isRecordDropOffCritical;
    if (!reachesRecord && tierRank !== 1) return 0;

    const overByTarget = Math.max(0, targetLen - recordLen);
    const overByCurrent = Math.max(0, currentLen - recordLen);
    const tieScore = currentLen >= recordLen ? 0.78 : 0.55;
    const overScore = clamp((overByTarget + overByCurrent) / 3, 0, 1);
    return clamp(Math.max(tieScore, 0.82 + overScore * 0.18));
}

function getRecordContinuationRisk(item = {}) {
    if (item && item.isPotential) return 0;
    const { sampleSize, continuedCount } = getCandidateBreakSample(item);
    const continuationRate = sampleSize > 0 ? continuedCount / sampleSize : 0;
    const timingScore = Number.isFinite(Number(item.targetTimingScore))
        ? clamp(Number(item.targetTimingScore))
        : 0.35;
    const continuationPenalty = clamp(continuationRate * 1.4);
    const smallSamplePenalty = sampleSize <= 0 ? 0.25 : (sampleSize < 8 ? 0.16 : (sampleSize < 20 ? 0.08 : 0));
    return clamp(continuationPenalty * 0.55 + timingScore * 0.25 + smallSamplePenalty * 0.20);
}

function getCoveragePenalty(item = {}) {
    const count = getCandidateNumbersCount(item);
    if (count <= 1) return 0;
    return clamp(Math.log10(count + 1) / Math.log10(101));
}

function getChainExclusionSortScore(item = {}, totalYears = 20, mode = 'risk') {
    const posterior = getCandidatePosteriorBreakRate(item);
    const lowerBound = getCandidateLowerBound(item);
    const riskRate = clamp(getCandidateRiskRate(item));
    const sampleComponent = sampleSizeScore(item.sampleSize ?? item.exclusionSampleSize);
    const edgeComponent = clamp(Math.max(0, getCandidateExclusionEdge(item)) * 2);
    const priorityComponent = clamp((Number(item.exclusionPriority) || 0) / 100);
    const scarcityComponent = getPotentialScarcityScore(item, totalYears);
    const recordComponent = getRecordCriticalScore(item);
    const continuationPenalty = getRecordContinuationRisk(item);
    const coveragePenalty = getCoveragePenalty(item);

    if (mode === 'scarcityRisk') {
        return clamp(
            scarcityComponent * 0.40 +
            lowerBound * 0.20 +
            posterior * 0.18 +
            edgeComponent * 0.10 +
            priorityComponent * 0.07 +
            sampleComponent * 0.05 -
            coveragePenalty * 0.08,
            -1,
            1.25
        );
    }

    if (mode === 'recordAdjusted') {
        return clamp(
            recordComponent * 0.34 +
            lowerBound * 0.20 +
            posterior * 0.18 +
            priorityComponent * 0.12 +
            edgeComponent * 0.08 +
            sampleComponent * 0.08 -
            continuationPenalty * 0.18 -
            coveragePenalty * 0.05,
            -1,
            1.25
        );
    }

    if (mode === 'wilsonRisk') {
        return clamp(
            lowerBound * 0.36 +
            posterior * 0.22 +
            edgeComponent * 0.16 +
            sampleComponent * 0.10 +
            priorityComponent * 0.08 +
            recordComponent * 0.05 +
            scarcityComponent * 0.03 -
            coveragePenalty * 0.06,
            -1,
            1.25
        );
    }

    if (mode === 'potentialFirstRisk') {
        return clamp(
            (item.isPotential ? 0.46 : 0) +
            scarcityComponent * 0.22 +
            lowerBound * 0.14 +
            posterior * 0.10 +
            edgeComponent * 0.05 +
            sampleComponent * 0.03 -
            coveragePenalty * 0.08,
            -1,
            1.25
        );
    }

    if (mode === 'recordFirstRisk') {
        return clamp(
            recordComponent * 0.46 +
            (!item.isPotential ? 0.08 : 0) +
            lowerBound * 0.17 +
            posterior * 0.13 +
            priorityComponent * 0.08 +
            edgeComponent * 0.05 +
            sampleComponent * 0.03 -
            continuationPenalty * 0.16 -
            coveragePenalty * 0.05,
            -1,
            1.25
        );
    }

    return riskRate;
}

function normalizeChainSortBy(value, fallback = 'frequency') {
    const normalized = String(value || fallback).trim().toLowerCase();
    if (['risk', 'rui-ro', 'rủi-ro', 'riskdesc'].includes(normalized)) return 'risk';
    if (['frequency', 'freq', 'ht-target', 'target', 'httarget'].includes(normalized)) return 'frequency';
    if (['tier', 'tier-risk', 'tierfirst', 'tier-first', 'record', 'ky-luc', 'kỷ-lục'].includes(normalized)) return 'tierRisk';
    if (['scarcity', 'scarcity-risk', 'rare-potential', 'potential-scarcity'].includes(normalized)) return 'scarcityRisk';
    if (['record-adjusted', 'recordadjusted', 'record-break', 'recordbreak'].includes(normalized)) return 'recordAdjusted';
    if (['potential-first', 'potentialfirst', 'potential-first-risk', 'nonformation-first', 'non-formation-first'].includes(normalized)) return 'potentialFirstRisk';
    if (['record-first', 'recordfirst', 'record-first-risk', 'ky-luc-first', 'kỷ-lục-first'].includes(normalized)) return 'recordFirstRisk';
    if (['wilson', 'wilson-risk', 'lower-bound', 'lowerbound'].includes(normalized)) return 'wilsonRisk';
    return fallback;
}

function compareChainItems(a = {}, b = {}, sortBy = 'frequency', totalYears = 20) {
    const mode = normalizeChainSortBy(sortBy);
    if (['scarcityRisk', 'recordAdjusted', 'wilsonRisk', 'potentialFirstRisk', 'recordFirstRisk'].includes(mode)) {
        if (mode === 'potentialFirstRisk') {
            const potentialDiff = Number(!!b.isPotential) - Number(!!a.isPotential);
            if (potentialDiff !== 0) return potentialDiff;
        }
        if (mode === 'recordFirstRisk') {
            const recordDiff = Number(getRecordCriticalScore(b) > 0) - Number(getRecordCriticalScore(a) > 0);
            if (recordDiff !== 0) return recordDiff;
        }
        const scoreDiff = getChainExclusionSortScore(b, totalYears, mode) - getChainExclusionSortScore(a, totalYears, mode);
        if (Math.abs(scoreDiff) > 0.000001) return scoreDiff;
        const riskDiff = getCandidateRiskRate(b) - getCandidateRiskRate(a);
        if (Math.abs(riskDiff) > 0.000001) return riskDiff;
        const freqDiff = getCandidateFrequencyRaw(a, totalYears) - getCandidateFrequencyRaw(b, totalYears);
        if (freqDiff !== 0) return freqDiff;
    } else if (mode === 'tierRisk') {
        const tierDiff = Number(a.exclusionTierRank || a.tierRank || 3) - Number(b.exclusionTierRank || b.tierRank || 3);
        if (tierDiff !== 0) return tierDiff;
        const recordDiff = Number(!!b.isRecordDropOffCritical) - Number(!!a.isRecordDropOffCritical);
        if (recordDiff !== 0) return recordDiff;
        const priorityDiff = Number(b.exclusionPriority || 0) - Number(a.exclusionPriority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        const riskDiff = getCandidateRiskRate(b) - getCandidateRiskRate(a);
        if (riskDiff !== 0) return riskDiff;
        const freqDiff = getCandidateFrequencyRaw(a, totalYears) - getCandidateFrequencyRaw(b, totalYears);
        if (freqDiff !== 0) return freqDiff;
    } else if (mode === 'risk') {
        const riskDiff = getCandidateRiskRate(b) - getCandidateRiskRate(a);
        if (riskDiff !== 0) return riskDiff;
        const freqDiff = getCandidateFrequencyRaw(a, totalYears) - getCandidateFrequencyRaw(b, totalYears);
        if (freqDiff !== 0) return freqDiff;
    } else {
        const freqDiff = getCandidateFrequencyRaw(a, totalYears) - getCandidateFrequencyRaw(b, totalYears);
        if (freqDiff !== 0) return freqDiff;
        const riskDiff = getCandidateRiskRate(b) - getCandidateRiskRate(a);
        if (riskDiff !== 0) return riskDiff;
    }

    const tierDiff = Number(a.exclusionTierRank || a.tierRank || 3) - Number(b.exclusionTierRank || b.tierRank || 3);
    if (tierDiff !== 0) return tierDiff;
    return String(a.title || a.key).localeCompare(String(b.title || b.key), 'vi');
}

function compareChainRows(a = {}, b = {}, sortBy = 'frequency') {
    const mode = normalizeChainSortBy(sortBy);
    const aFreq = Number.isFinite(Number(a.frequencyPerYearRaw)) ? Number(a.frequencyPerYearRaw) : Number.POSITIVE_INFINITY;
    const bFreq = Number.isFinite(Number(b.frequencyPerYearRaw)) ? Number(b.frequencyPerYearRaw) : Number.POSITIVE_INFINITY;

    if (mode === 'risk') {
        const riskDiff = Number(b.riskRate || 0) - Number(a.riskRate || 0);
        if (riskDiff !== 0) return riskDiff;
        const freqDiff = aFreq - bFreq;
        if (freqDiff !== 0) return freqDiff;
    } else {
        const freqDiff = aFreq - bFreq;
        if (freqDiff !== 0) return freqDiff;
        const riskDiff = Number(b.riskRate || 0) - Number(a.riskRate || 0);
        if (riskDiff !== 0) return riskDiff;
    }

    const tierDiff = Number(a.tierRank || 3) - Number(b.tierRank || 3);
    if (tierDiff !== 0) return tierDiff;
    return String(a.title || a.key).localeCompare(String(b.title || b.key), 'vi');
}

function getChainDueScore(item = {}) {
    const avgGap = Number(item.avgGapDays ?? item.targetAvgGapDays);
    const daysSince = Number(item.daysSinceLatestEnd ?? item.targetDaysSinceLatestEnd);
    const occurrences = Number(item.occurrences ?? item.targetOccurrenceCount ?? 0);

    if (occurrences <= 0) return 0.2;
    if (!Number.isFinite(avgGap) || avgGap <= 0 || !Number.isFinite(daysSince)) {
        return occurrences <= 2 ? 0.35 : 0.5;
    }

    const ratio = Math.max(0, daysSince) / avgGap;
    if (ratio <= 0.2) return clamp(0.08 + ratio * 0.6);
    if (ratio <= 1.15) return clamp(0.25 + (ratio / 1.15) * 0.70);
    if (ratio <= 2.5) return clamp(0.95 - (ratio - 1.15) * 0.18, 0.68, 0.95);
    return 0.58;
}

function getChainFrequencyScore(frequencyPerYear) {
    const frequency = Number(frequencyPerYear);
    if (!Number.isFinite(frequency) || frequency <= 0) return 0;
    return clamp(Math.log10(frequency + 1) / Math.log10(30));
}

function getChainAppearanceWeight(item = {}, totalYears = 20) {
    const nums = normalizeNumberList(item.numbers);
    if (nums.length === 0) return null;

    const appearance = getCandidateAppearanceStats(item);
    const frequencyPerYear = getCandidateTargetFrequencyPerYear(item, totalYears);
    const dueScore = getChainDueScore(item);
    const frequencyScore = getChainFrequencyScore(frequencyPerYear);
    const sampleComponent = sampleSizeScore(appearance.sampleSize);
    const riskRate = clamp(Number(item.dropOffRate ?? item.exclusionRate ?? 0));
    const priorityPenalty = clamp((Number(item.exclusionPriority) || 0) / 100);
    const recordPenalty = item.isRecordDropOffCritical ? 0.25 : 0;

    const rawSignal =
        appearance.appearanceLowerBound * 0.30 +
        appearance.appearanceRate * 0.25 +
        dueScore * 0.20 +
        frequencyScore * 0.15 +
        sampleComponent * 0.10;
    const riskDiscount = clamp(1 - riskRate * 0.42 - priorityPenalty * 0.18 - recordPenalty, 0.03, 1);
    const coveragePenalty = Math.pow(Math.max(1, nums.length), 0.62);
    const weight = rawSignal * riskDiscount / coveragePenalty;

    return {
        weight,
        rawSignal,
        riskDiscount,
        dueScore,
        frequencyPerYear,
        frequencyScore,
        appearanceRate: appearance.appearanceRate,
        appearanceLowerBound: appearance.appearanceLowerBound,
        appearanceCount: appearance.appearanceCount,
        appearanceSampleSize: appearance.sampleSize
    };
}

function buildNumberRiskPenalty(candidates = []) {
    const scores = Array.from({ length: 100 }, (_, number) => ({ number, risk: 0 }));

    for (const item of candidates || []) {
        const nums = normalizeNumberList(item.numbers);
        if (nums.length === 0) continue;
        const riskWeight = Math.max(0, getCombinedNumberRiskScore(item));
        if (!Number.isFinite(riskWeight) || riskWeight <= 0) continue;
        nums.forEach(num => {
            scores[num].risk += riskWeight;
        });
    }

    const maxRisk = Math.max(0, ...scores.map(item => item.risk));
    return new Map(scores.map(item => [
        item.number,
        maxRisk > 0 ? item.risk / maxRisk : 0
    ]));
}

function calculateChainFrequencyNumberScores(candidates = [], totalYears = 20) {
    const scores = Array.from({ length: 100 }, (_, number) => ({
        number,
        positiveScore: 0,
        finalScore: 0,
        riskPenalty: 0,
        contributors: []
    }));

    for (const item of candidates || []) {
        const nums = normalizeNumberList(item.numbers);
        if (nums.length === 0) continue;

        const signal = getChainAppearanceWeight(item, totalYears);
        if (!signal || !Number.isFinite(signal.weight) || signal.weight <= 0) continue;

        nums.forEach(num => {
            scores[num].positiveScore += signal.weight;
            scores[num].contributors.push({ item, signal });
        });
    }

    const riskPenaltyByNumber = buildNumberRiskPenalty(candidates);
    const maxPositive = Math.max(0, ...scores.map(item => item.positiveScore));
    scores.forEach(item => {
        const positiveRatio = maxPositive > 0 ? item.positiveScore / maxPositive : 0;
        const riskPenalty = riskPenaltyByNumber.get(item.number) || 0;
        item.riskPenalty = riskPenalty;
        item.finalScore = positiveRatio * (1 - riskPenalty * 0.35) - riskPenalty * 0.05;
    });

    const rankedNumbers = scores
        .slice()
        .sort((a, b) => b.finalScore - a.finalScore || b.positiveScore - a.positiveScore || a.number - b.number);
    return rankedNumbers;
}

function classifyChainFrequencyAction(item = {}, signal = {}, options = {}) {
    const minExclusionPriority = Number.isFinite(Number(options.minExclusionPriority))
        ? Number(options.minExclusionPriority)
        : PRIORITY_THRESHOLD;
    const minChainSignal = Number.isFinite(Number(options.minChainSignal))
        ? Number(options.minChainSignal) / 100
        : 0.55;
    const lowerBound = Number(item.lowerBound ?? item.exclusionLowerBound ?? 0);
    const sampleSize = Number(item.sampleSize ?? item.exclusionSampleSize ?? 0);
    const dropOffRate = Number(item.dropOffRate ?? item.exclusionRate ?? 0);
    const priority = Number(item.exclusionPriority || 0);
    const riskDiscount = Number(signal.riskDiscount ?? 1);
    const rawSignal = Number(signal.rawSignal ?? 0);
    const isReliableRisk = item.isRecordDropOffCritical ||
        lowerBound >= 0.45 ||
        (sampleSize >= 50 && dropOffRate >= 0.85);

    if (
        priority >= minExclusionPriority &&
        isReliableRisk &&
        (dropOffRate >= 0.85 || riskDiscount <= 0.55) &&
        rawSignal < Math.max(0.35, minChainSignal + 0.10)
    ) {
        return 'exclude';
    }

    if (rawSignal >= minChainSignal && riskDiscount >= 0.28) {
        return 'bet';
    }

    return 'watch';
}

function buildChainFrequencyAnalysis(candidates, options = {}) {
    const targetBetCount = Math.round(parseNumericOption(options.targetBetCount, CHAIN_FREQUENCY_TARGET_BET, 1, 100));
    const totalYears = parseNumericOption(options.totalYears, 20, 0.01, Number.POSITIVE_INFINITY);
    const minExclusionPriority = parseNumericOption(options.minExclusionPriority, PRIORITY_THRESHOLD, 0, 100);
    const rankedNumbers = calculateChainFrequencyNumberScores(candidates, totalYears);
    const selectedNumbers = rankedNumbers.slice(0, targetBetCount);
    const selectedSet = new Set(selectedNumbers.map(item => item.number));

    const numberRows = rankedNumbers.map((entry, index) => ({
        rank: index + 1,
        number: entry.number,
        numberText: formatNumber(entry.number),
        selected: selectedSet.has(entry.number),
        finalScore: roundOne(entry.finalScore * 100),
        positiveScore: roundOne(entry.positiveScore * 1000),
        riskPenalty: roundOne(entry.riskPenalty * 100),
        contributors: (entry.contributors || [])
            .slice()
            .sort((a, b) => (b.signal.weight || 0) - (a.signal.weight || 0))
            .slice(0, 6)
            .map(({ item, signal }) => ({
                key: item.key,
                title: item.title,
                isPotential: !!item.isPotential,
                numbersCount: normalizeNumberList(item.numbers).length,
                chainSignalScore: roundOne(signal.weight * 1000),
                rawSignalScore: roundOne(signal.rawSignal * 100),
                dueScore: roundOne(signal.dueScore * 100),
                riskDiscountScore: roundOne(signal.riskDiscount * 100),
                frequencyPerYear: roundOne(signal.frequencyPerYear),
                appearanceRate: signal.appearanceRate,
                exclusionPriority: item.exclusionPriority,
                dropOffRate: item.dropOffRate,
                lowerBoundPercent: item.lowerBoundPercent
            }))
    }));

    const chainRows = (candidates || [])
        .map(item => {
            const nums = normalizeNumberList(item.numbers);
            const signal = getChainAppearanceWeight(item, totalYears);
            if (!signal || nums.length === 0) return null;
            const selectedNumbersInChain = nums.filter(num => selectedSet.has(num));
            const avgGap = Number(item.avgGapDays ?? item.targetAvgGapDays);
            const daysSince = Number(item.daysSinceLatestEnd ?? item.targetDaysSinceLatestEnd);
            const gapRatio = Number.isFinite(avgGap) && avgGap > 0 && Number.isFinite(daysSince)
                ? daysSince / avgGap
                : null;
            const action = classifyChainFrequencyAction(item, signal, {
                ...options,
                minExclusionPriority
            });

            return {
                key: item.key,
                title: item.title,
                isPotential: !!item.isPotential,
                action,
                actionLabel: action === 'exclude'
                    ? 'Nên loại'
                    : action === 'bet' ? 'Giữ số' : 'Theo dõi',
                streak: item.streak,
                targetLength: item.targetLength,
                maxStreak: item.maxStreak,
                numbers: nums,
                numbersCount: nums.length,
                selectedNumbers: selectedNumbersInChain,
                selectedNumbersCount: selectedNumbersInChain.length,
                chainSignalScore: roundOne(signal.weight * 1000),
                rawSignalScore: roundOne(signal.rawSignal * 100),
                dueScore: roundOne(signal.dueScore * 100),
                riskDiscountScore: roundOne(signal.riskDiscount * 100),
                frequencyPerYear: roundOne(signal.frequencyPerYear),
                frequencyScore: roundOne(signal.frequencyScore * 100),
                appearanceRate: signal.appearanceRate,
                appearanceLowerBound: signal.appearanceLowerBound,
                appearanceCount: signal.appearanceCount,
                appearanceSampleSize: signal.appearanceSampleSize,
                exclusionPriority: item.exclusionPriority,
                dropOffRate: item.dropOffRate,
                lowerBoundPercent: item.lowerBoundPercent,
                sampleSize: item.sampleSize,
                edgePercent: item.edgePercent,
                avgGapDays: item.avgGapDays,
                daysSinceLatestEnd: item.daysSinceLatestEnd,
                gapRatio: gapRatio === null ? null : roundOne(gapRatio),
                formFrequencyPerYear: item.formFrequencyPerYear,
                formationCount: item.formationCount,
                reason: item.reason || ''
            };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (a.action !== b.action) {
                const order = { bet: 0, exclude: 1, watch: 2 };
                return order[a.action] - order[b.action];
            }
            return (b.chainSignalScore || 0) - (a.chainSignalScore || 0);
        });

    const recommendedExclusions = chainRows
        .filter(item => item.action === 'exclude')
        .sort((a, b) => {
            if ((b.exclusionPriority || 0) !== (a.exclusionPriority || 0)) return (b.exclusionPriority || 0) - (a.exclusionPriority || 0);
            return (b.dropOffRate || 0) - (a.dropOffRate || 0);
        });
    const betSignalChains = chainRows
        .filter(item => item.action === 'bet')
        .sort((a, b) => (b.chainSignalScore || 0) - (a.chainSignalScore || 0));

    return {
        targetBetCount,
        targetExcluded: 100 - targetBetCount,
        minExclusionPriority,
        selectedNumbers: selectedNumbers.map(item => item.number),
        excludedNumbers: ALL_NUMBERS.filter(num => !selectedSet.has(num)),
        numberRows,
        chainRows,
        betSignalChains,
        recommendedExclusions
    };
}

function getCandidateExclusionEdge(item = {}) {
    if (Number.isFinite(Number(item.edge))) return Number(item.edge);
    const numbersCount = normalizeNumberList(item.numbers).length;
    const baselineBreakRate = 1 - (numbersCount / 100);
    const rate = Number(item.dropOffRate ?? item.exclusionRate ?? 0);
    return rate - baselineBreakRate;
}

function buildEdgePerNumberMethod(candidates, targetExcluded = EDGE_PER_NUMBER_TARGET_EXCLUDED, options = {}) {
    const scores = Array.from({ length: 100 }, (_, number) => ({
        number,
        score: 0,
        contributors: [],
        supportCount: 0,
        distinctSets: new Set(),
        maxDropOffRate: 0,
        maxEdge: 0
    }));

    for (const item of candidates || []) {
        const nums = normalizeNumberList(item.numbers);
        if (nums.length === 0) continue;

        const edge = getCandidateExclusionEdge(item);
        const priority = Number(item.exclusionPriority || 0);
        const weight = Math.max(0, edge) * priority / nums.length;
        if (!Number.isFinite(weight) || weight <= 0) continue;

        nums.forEach(num => {
            scores[num].score += weight;
            scores[num].contributors.push({ item, weight });
            scores[num].supportCount += 1;
            scores[num].distinctSets.add(nums.join(','));
            scores[num].maxDropOffRate = Math.max(
                scores[num].maxDropOffRate,
                Number(item.dropOffRate ?? item.exclusionRate ?? 0) || 0
            );
            scores[num].maxEdge = Math.max(scores[num].maxEdge, edge);
        });
    }

    const rankedNumbers = scores
        .slice()
        .sort((a, b) => b.score - a.score || a.number - b.number);
    const excluded = rankedNumbers
        .slice(0, Math.max(0, Math.min(100, targetExcluded)))
        .map(item => item.number);
    const excludedSet = new Set(excluded);

    const contributorMap = new Map();
    rankedNumbers.slice(0, targetExcluded).forEach(numberScore => {
        numberScore.contributors.forEach(({ item, weight }) => {
            const key = item.key || item.title;
            if (!key) return;
            if (!contributorMap.has(key)) {
                contributorMap.set(key, {
                    item,
                    supportScore: 0,
                    numbers: new Set()
                });
            }
            const entry = contributorMap.get(key);
            entry.supportScore += weight;
            entry.numbers.add(numberScore.number);
        });
    });

    const selectedStreaks = [...contributorMap.values()]
        .map(entry => ({
            ...entry.item,
            numbers: [...entry.numbers].sort((a, b) => a - b),
            numbersCount: entry.numbers.size,
            addedNumbersCount: entry.numbers.size,
            combinedStage: 'edge/số',
            numberRiskScore: roundOne(entry.supportScore * 100)
        }))
        .sort((a, b) => (b.numberRiskScore || 0) - (a.numberRiskScore || 0));

    return {
        id: options.id || 'edgePerNumber5',
        name: options.name || 'Edge từng số - đánh 5 số',
        description: options.description || 'Chấm điểm từng số bằng edge dương của chuỗi chia đều cho số lượng số trong chuỗi, loại 95 số điểm cao nhất và chỉ đánh 5 số còn lại.',
        selectedStreaks,
        excluded,
        numberScores: rankedNumbers.map((row, index) => ({
            rank: index + 1,
            number: row.number,
            score: row.score,
            supportCount: row.supportCount,
            distinctSetCount: row.distinctSets.size,
            maxDropOffRate: row.maxDropOffRate,
            maxEdge: row.maxEdge,
            excluded: index < targetExcluded
        }))
    };
}

function buildAverageDropoffPerNumberMethod(candidates, targetExcluded = EDGE_PER_NUMBER_TARGET_EXCLUDED, options = {}) {
    const baselineWeight = clamp(Number(options.baselineWeight ?? 0));
    const scores = Array.from({ length: 100 }, (_, number) => ({
        number,
        dropOffSum: 0,
        supportCount: 0,
        contributors: [],
        distinctSets: new Set(),
        maxDropOffRate: 0
    }));

    for (const item of candidates || []) {
        const nums = normalizeNumberList(item.numbers);
        if (nums.length === 0) continue;

        const dropOffRate = clamp(Number(
            item.isPotential ? item.nonFormationRate : (item.dropOffRate ?? item.exclusionRate)
        ) || 0);
        if (!Number.isFinite(dropOffRate)) continue;
        const baselineDropoff = 1 - (nums.length / 100);
        const adjustedRate = dropOffRate - (baselineWeight * baselineDropoff);

        nums.forEach(num => {
            const row = scores[num];
            row.dropOffSum += adjustedRate;
            row.supportCount += 1;
            row.contributors.push({ item, dropOffRate, adjustedRate, baselineDropoff });
            row.distinctSets.add(nums.join(','));
            row.maxDropOffRate = Math.max(row.maxDropOffRate, adjustedRate);
        });
    }

    const rankedNumbers = scores
        .map(row => ({
            ...row,
            score: row.supportCount > 0 ? row.dropOffSum / row.supportCount : 0.99
        }))
        .sort((a, b) => b.score - a.score || b.supportCount - a.supportCount || a.number - b.number);
    const cappedTarget = Math.max(0, Math.min(100, targetExcluded));
    const excluded = rankedNumbers.slice(0, cappedTarget).map(item => item.number);

    const contributorMap = new Map();
    rankedNumbers.slice(0, cappedTarget).forEach(numberScore => {
        numberScore.contributors.forEach(({ item, dropOffRate, adjustedRate }) => {
            const key = item.key || item.title;
            if (!key) return;
            if (!contributorMap.has(key)) {
                contributorMap.set(key, { item, dropOffTotal: 0, numbers: new Set() });
            }
            const entry = contributorMap.get(key);
            entry.dropOffTotal += Number.isFinite(adjustedRate) ? adjustedRate : dropOffRate;
            entry.numbers.add(numberScore.number);
        });
    });

    const selectedStreaks = [...contributorMap.values()]
        .map(entry => ({
            ...entry.item,
            numbers: [...entry.numbers].sort((a, b) => a - b),
            numbersCount: entry.numbers.size,
            addedNumbersCount: entry.numbers.size,
            combinedStage: 'dropoff TB/số',
            numberRiskScore: roundOne((entry.dropOffTotal / Math.max(1, entry.numbers.size)) * 100)
        }))
        .sort((a, b) => (b.numberRiskScore || 0) - (a.numberRiskScore || 0));

    return {
        id: options.id || `avgDropoffHold${cappedTarget}`,
        name: options.name || `Dropoff trung bình từng số - Hold ${cappedTarget}`,
        description: options.description || `Mỗi số nhận trung bình cộng dropoff của tất cả chuỗi đang diễn ra và tiềm năng chứa số đó; loại ${cappedTarget} số có trung bình cao nhất.`,
        selectedStreaks,
        excluded,
        numberScores: rankedNumbers.map((row, index) => ({
            rank: index + 1,
            number: row.number,
            score: row.score,
            averageDropOffRate: row.score,
            supportCount: row.supportCount,
            distinctSetCount: row.distinctSets.size,
            maxDropOffRate: row.maxDropOffRate,
            maxEdge: 0,
            excluded: index < cappedTarget,
            contributors: (row.contributors || []).map(({ item, dropOffRate, adjustedRate, baselineDropoff }) => ({
                key: item.key || item.title || '',
                title: item.title || item.explanation || item.description || '',
                dropOffRate: dropOffRate,
                adjustedRate,
                baselineDropoff,
                isPotential: !!item.isPotential
            }))
        }))
    };
}

function getCandidateBreakSample(item = {}) {
    const sampleSize = Number.isFinite(Number(item.sampleSize))
        ? Number(item.sampleSize)
        : Number(item.exclusionSampleSize ?? item.currentCount ?? 0);
    const continuedCount = Number.isFinite(Number(item.continuedCount))
        ? Number(item.continuedCount)
        : Number(item.nextCount ?? item.formationCount ?? 0);
    const breakCount = Number.isFinite(Number(item.breakCount))
        ? Number(item.breakCount)
        : Math.max(0, sampleSize - continuedCount);
    return {
        sampleSize: Math.max(0, sampleSize),
        continuedCount: Math.max(0, continuedCount),
        breakCount: Math.max(0, breakCount)
    };
}

function buildDeduplicatedAverageDropoffMethod(candidates, targetExcluded, options = {}) {
    const scores = Array.from({ length: 100 }, (_, number) => ({
        number,
        grouped: new Map(),
        supportCount: 0,
        maxDropOffRate: 0
    }));

    for (const item of candidates || []) {
        const nums = normalizeNumberList(item.numbers);
        if (nums.length === 0) continue;

        const rawRate = clamp(Number(
            item.isPotential ? item.nonFormationRate : (item.dropOffRate ?? item.exclusionRate)
        ) || 0);
        const setKey = nums.join(',');

        for (const num of nums) {
            const row = scores[num];
            row.supportCount += 1;
            row.maxDropOffRate = Math.max(row.maxDropOffRate, rawRate);
            const group = row.grouped.get(setKey) || { sum: 0, count: 0, contributors: [] };
            group.sum += rawRate;
            group.count += 1;
            group.contributors.push({
                item,
                key: item.key || item.title || '',
                title: item.title || item.explanation || item.description || '',
                dropOffRate: rawRate,
                isPotential: !!item.isPotential
            });
            row.grouped.set(setKey, group);
        }
    }

    const rankedNumbers = scores
        .map(row => {
            const groups = [...row.grouped.values()];
            const groupRates = groups.map(group => group.sum / Math.max(1, group.count));
            const score = groupRates.length > 0
                ? groupRates.reduce((sum, rate) => sum + rate, 0) / groupRates.length
                : 0.99;
            return { ...row, score, distinctSetCount: groups.length, groups };
        })
        .sort((a, b) => b.score - a.score || b.supportCount - a.supportCount || a.number - b.number);

    const cappedTarget = Math.max(0, Math.min(100, targetExcluded));
    const contributorMap = new Map();
    rankedNumbers.slice(0, cappedTarget).forEach(numberScore => {
        numberScore.groups.forEach(group => {
            group.contributors.forEach(({ item, dropOffRate }) => {
                const key = item.key || item.title;
                if (!key) return;
                if (!contributorMap.has(key)) {
                    contributorMap.set(key, { item, dropOffTotal: 0, numbers: new Set() });
                }
                const entry = contributorMap.get(key);
                entry.dropOffTotal += dropOffRate;
                entry.numbers.add(numberScore.number);
            });
        });
    });
    const selectedStreaks = [...contributorMap.values()]
        .map(entry => ({
            ...entry.item,
            numbers: [...entry.numbers].sort((a, b) => a - b),
            numbersCount: entry.numbers.size,
            addedNumbersCount: entry.numbers.size,
            combinedStage: 'dropoff TB khử trùng tập số',
            numberRiskScore: roundOne((entry.dropOffTotal / Math.max(1, entry.numbers.size)) * 100)
        }))
        .sort((a, b) => (b.numberRiskScore || 0) - (a.numberRiskScore || 0));

    return {
        id: options.id,
        name: options.name,
        description: options.description,
        selectedStreaks,
        excluded: rankedNumbers.slice(0, cappedTarget).map(item => item.number),
        numberScores: rankedNumbers.map((row, index) => ({
            rank: index + 1,
            number: row.number,
            score: row.score,
            supportCount: row.supportCount,
            distinctSetCount: row.distinctSetCount,
            maxDropOffRate: row.maxDropOffRate,
            excluded: index < cappedTarget,
            contributors: row.groups.flatMap(group => group.contributors).map(({ item, ...contributor }) => contributor)
        }))
    };
}

function buildDeduplicatedEdgeMethod(candidates, targetExcluded, options = {}) {
    const baselineWeight = clamp(Number(options.baselineWeight ?? 1));
    const groupedSets = new Map();
    for (const item of candidates || []) {
        const nums = normalizeNumberList(item.numbers);
        if (nums.length === 0) continue;
        const observedDropoff = clamp(Number(
            item.isPotential ? item.nonFormationRate : (item.dropOffRate ?? item.exclusionRate)
        ) || 0);
        const setKey = nums.join(',');
        const group = groupedSets.get(setKey) || { nums, rateSum: 0, count: 0, contributors: [] };
        group.rateSum += observedDropoff;
        group.count += 1;
        group.contributors.push({
            item,
            key: item.key || item.title || '',
            title: item.title || item.explanation || item.description || '',
            dropOffRate: observedDropoff,
            isPotential: !!item.isPotential
        });
        groupedSets.set(setKey, group);
    }

    const scores = Array.from({ length: 100 }, (_, number) => ({
        number,
        edgeSum: 0,
        edgeCount: 0,
        maxEdge: -1,
        contributors: []
    }));
    for (const group of groupedSets.values()) {
        const observedDropoff = group.rateSum / Math.max(1, group.count);
        const baselineDropoff = 1 - (group.nums.length / 100);
        const edge = observedDropoff - (baselineWeight * baselineDropoff);
        for (const number of group.nums) {
            const row = scores[number];
            row.edgeSum += edge;
            row.edgeCount += 1;
            row.maxEdge = Math.max(row.maxEdge, edge);
            row.contributors.push(...group.contributors.map(item => ({
                ...item,
                setSize: group.nums.length,
                baselineDropoff,
                edge
            })));
        }
    }

    const rankedNumbers = scores.map(row => ({
        ...row,
        score: row.edgeCount > 0 ? row.edgeSum / row.edgeCount : -1
    })).sort((a, b) => b.score - a.score || b.maxEdge - a.maxEdge || b.edgeCount - a.edgeCount || a.number - b.number);
    const cappedTarget = Math.max(0, Math.min(100, targetExcluded));
    const selectedContributorMap = new Map();
    for (const numberScore of rankedNumbers.slice(0, cappedTarget)) {
        for (const contributor of numberScore.contributors) {
            const item = contributor.item;
            const key = contributor.key || item?.key || item?.title;
            if (!key || !item) continue;
            const entry = selectedContributorMap.get(key) || { item, edgeTotal: 0, numbers: new Set() };
            entry.edgeTotal += contributor.edge;
            entry.numbers.add(numberScore.number);
            selectedContributorMap.set(key, entry);
        }
    }
    const selectedStreaks = [...selectedContributorMap.values()].map(entry => ({
        ...entry.item,
        numbers: [...entry.numbers].sort((a, b) => a - b),
        numbersCount: entry.numbers.size,
        addedNumbersCount: entry.numbers.size,
        combinedStage: 'edge khử trùng tập số',
        numberRiskScore: roundOne((entry.edgeTotal / Math.max(1, entry.numbers.size)) * 100)
    })).sort((a, b) => (b.numberRiskScore || 0) - (a.numberRiskScore || 0));
    return {
        id: options.id,
        name: options.name,
        description: options.description,
        selectedStreaks,
        excluded: rankedNumbers.slice(0, cappedTarget).map(item => item.number),
        numberScores: rankedNumbers.map((row, index) => ({
            rank: index + 1,
            number: row.number,
            score: row.score,
            averageEdge: row.score,
            distinctSetCount: row.edgeCount,
            maxEdge: row.maxEdge,
            excluded: index < cappedTarget,
            contributors: row.contributors.map(({ item, ...contributor }) => contributor)
        }))
    };
}

function isBlockPattern(key) {
    return /block\d+x\d+sole/i.test(String(key || ''));
}

function buildParallelBetUnionMethod(firstMethod, secondMethod, options = {}) {
    const firstExcluded = new Set(normalizeNumberList(firstMethod.excluded));
    const secondExcluded = new Set(normalizeNumberList(secondMethod.excluded));
    const firstBet = ALL_NUMBERS.filter(number => !firstExcluded.has(number));
    const secondBet = ALL_NUMBERS.filter(number => !secondExcluded.has(number));
    const secondBetSet = new Set(secondBet);
    const betNumbers = [...new Set([...firstBet, ...secondBet])].sort((a, b) => a - b);
    const betSet = new Set(betNumbers);
    const intersectionNumbers = firstBet.filter(number => secondBetSet.has(number));
    const selectedStreaks = [
        ...(firstMethod.selectedStreaks || []).map(item => ({
            ...item,
            parallelStage: options.firstStage || 'Phương pháp 1'
        })),
        ...(secondMethod.selectedStreaks || []).map(item => ({
            ...item,
            parallelStage: options.secondStage || 'Phương pháp 2'
        }))
    ];

    return {
        id: options.id,
        name: options.name,
        description: options.description,
        methodVersion: SIMULATION_METHOD_VERSION,
        excluded: ALL_NUMBERS.filter(number => !betSet.has(number)),
        betNumbers,
        intersectionNumbers,
        selectedStreaks
    };
}

function buildDeParallelBlock85Small65Method(candidates, targetExcluded, options = {}) {
    // Both tabs share annualMilestoneService's exact ranking/union algorithm.
    // Only the candidate metrics differ: Lịch sử is rolling through D-1 while
    // Mốc 20 năm is frozen at 31/12 of the previous prediction year.
    const sharedCandidates = (candidates || []).map(item => {
        const numbers = normalizeNumberList(item.numbers);
        const riskRate = Number(item.riskRate ?? (
            item.isPotential
                ? item.nonFormationRate
                : (item.dropOffRate ?? item.exclusionRate)
        ));
        const exposureFrequencyPerYear = Number(
            item.exposureFrequencyPerYear
            ?? item.targetFrequencyPerYear
            ?? item.frequencyPerYear
            ?? item.formFrequencyPerYear
            ?? 0
        );
        // Simulation candidates use a display tier such as "critical/high/medium".
        // The annual ranker expects a numeric Tier 1..4, so prefer the explicit
        // numeric rank and only accept item.tier when it is actually numeric.
        const explicitTierRank = Number(
            item.exclusionTierRank
            ?? item.tierRank
            ?? (Number.isFinite(Number(item.sortGroup)) ? Number(item.sortGroup) + 1 : NaN)
        );
        const numericTier = Number(item.tier);
        const tier = Number.isFinite(explicitTierRank)
            ? explicitTierRank
            : (Number.isFinite(numericTier) ? numericTier : 4);
        return {
            ...item,
            key: String(item.key || item.title || ''),
            numbers,
            tier: Math.max(1, Math.min(4, Number.isFinite(tier) ? tier : 4)),
            score: Number(item.score ?? item.exclusionPriority ?? item.combinedScore ?? 0),
            riskRate: Number.isFinite(riskRate) ? riskRate : 0,
            exposureFrequencyPerYear: Number.isFinite(exposureFrequencyPerYear)
                ? exposureFrequencyPerYear
                : 0
        };
    }).filter(item => item.key && item.numbers.length > 0 && item.numbers.length < 100);
    const shared = annualMilestoneService.buildPrediction(
        sharedCandidates,
        targetExcluded,
        'deParallelBlock85Small65'
    );
    const betNumbers = normalizeNumberList(shared.betNumbers);
    const intersectionNumbers = normalizeNumberList(shared.intersectionNumbers);
    const unitCount = betNumbers.length + intersectionNumbers.length;
    if (betNumbers.length < 35 || betNumbers.length > 50 || unitCount !== 50) {
        throw new Error(
            `Dan De Song Song Lich su khong hop le: ` +
            `${betNumbers.length} so duy nhat, ${unitCount} don vi.`
        );
    }
    return {
        id: options.id || 'deParallelBlock85Small65Hold70',
        name: options.name || 'Đề Song Song Lịch sử (Block 85 · Small 65)',
        description: options.description ||
            'Cùng công thức Mốc 20 năm: hợp dàn Nhịp Block Hold 85 và Chuỗi nhỏ Hold 65; số giao nhau đánh x2. Lịch sử dùng metric rolling đến D-1.',
        methodVersion: SIMULATION_METHOD_VERSION,
        excluded: normalizeNumberList(shared.excludedNumbers),
        betNumbers,
        intersectionNumbers,
        selectedStreaks: shared.selectedChains || []
    };
}

function buildDeParallelDedupEdge75DropoffMethod(candidates, targetExcluded, options = {}) {
    const edgeMethod = buildDeduplicatedEdgeMethod(candidates, targetExcluded, {
        id: `dedupEdge75Hold${targetExcluded}`,
        name: `Edge khử trùng 75% nền - Hold ${targetExcluded}`,
        baselineWeight: 0.75
    });
    const dropoffMethod = buildDeduplicatedAverageDropoffMethod(candidates, targetExcluded, {
        id: `dedupDropoffHold${targetExcluded}`,
        name: `Dropoff TB khử trùng tập số - Hold ${targetExcluded}`
    });

    return buildParallelBetUnionMethod(edgeMethod, dropoffMethod, {
        id: options.id || `deParallelDedupEdge75DropoffHold${targetExcluded}`,
        name: options.name || 'Đề Song Song Edge 75% + Dropoff khử trùng',
        description: options.description ||
            'Đánh song song Edge khử trùng 75% nền và Dropoff TB khử trùng; số nằm trong cả hai dàn đánh được tính x2.',
        firstStage: `Edge khử trùng 75% nền · Hold ${targetExcluded}`,
        secondStage: `Dropoff TB khử trùng · Hold ${targetExcluded}`
    });
}

function buildChainSmallFirstMethod(candidates, targetExcluded, options = {}) {
    const sorted = (candidates || [])
        .filter(item => normalizeNumberList(item.numbers).length > 0)
        .slice()
        .sort((a, b) => {
            const ap = Number(a.exclusionPriority || 0);
            const bp = Number(b.exclusionPriority || 0);
            if (bp !== ap) return bp - ap;
            
            const al = normalizeNumberList(a.numbers).length;
            const bl = normalizeNumberList(b.numbers).length;
            if (al !== bl) return al - bl;
            
            const ar = Number(a.isPotential ? a.nonFormationRate : (a.dropOffRate ?? a.exclusionRate)) || 0;
            const br = Number(b.isPotential ? b.nonFormationRate : (b.dropOffRate ?? b.exclusionRate)) || 0;
            return br - ar;
        });

    const excluded = new Set();
    const selectedStreaks = [];
    for (const item of sorted) {
        const nums = normalizeNumberList(item.numbers);
        const additions = [];
        for (const num of nums) {
            if (!excluded.has(num)) additions.push(num);
            excluded.add(num);
            if (excluded.size >= targetExcluded) break;
        }
        if (additions.length > 0) {
            selectedStreaks.push({
                ...item,
                numbers: additions,
                addedNumbersCount: additions.length
            });
        }
        if (excluded.size >= targetExcluded) break;
    }
    if (excluded.size < targetExcluded) {
        const fallback = ALL_NUMBERS.filter(num => !excluded.has(num));
        for (const num of fallback) {
            excluded.add(num);
            if (excluded.size >= targetExcluded) break;
        }
    }
    return {
        id: options.id,
        name: options.name,
        selectedStreaks,
        excluded: [...excluded].sort((a, b) => a - b)
    };
}

function buildChainBlockFirstMethod(candidates, targetExcluded, options = {}) {
    const sorted = (candidates || [])
        .filter(item => normalizeNumberList(item.numbers).length > 0)
        .slice()
        .sort((a, b) => {
            const ap = Number(a.exclusionPriority || 0);
            const bp = Number(b.exclusionPriority || 0);
            if (bp !== ap) return bp - ap;
            
            const ab = isBlockPattern(a.key) ? 1 : 0;
            const bb = isBlockPattern(b.key) ? 1 : 0;
            if (bb !== ab) return bb - ab;
            
            const al = normalizeNumberList(a.numbers).length;
            const bl = normalizeNumberList(b.numbers).length;
            if (al !== bl) return al - bl;
            
            const ar = Number(a.isPotential ? a.nonFormationRate : (a.dropOffRate ?? a.exclusionRate)) || 0;
            const br = Number(b.isPotential ? b.nonFormationRate : (b.dropOffRate ?? b.exclusionRate)) || 0;
            return br - ar;
        });

    const excluded = new Set();
    const selectedStreaks = [];
    for (const item of sorted) {
        const nums = normalizeNumberList(item.numbers);
        const additions = [];
        for (const num of nums) {
            if (!excluded.has(num)) additions.push(num);
            excluded.add(num);
            if (excluded.size >= targetExcluded) break;
        }
        if (additions.length > 0) {
            selectedStreaks.push({
                ...item,
                numbers: additions,
                addedNumbersCount: additions.length
            });
        }
        if (excluded.size >= targetExcluded) break;
    }
    if (excluded.size < targetExcluded) {
        const fallback = ALL_NUMBERS.filter(num => !excluded.has(num));
        for (const num of fallback) {
            excluded.add(num);
            if (excluded.size >= targetExcluded) break;
        }
    }
    return {
        id: options.id,
        name: options.name,
        selectedStreaks,
        excluded: [...excluded].sort((a, b) => a - b)
    };
}

function buildDeduplicatedEdgeCombinedMethod(candidates, targetExcluded, options = {}) {
    const baselineWeight = clamp(Number(options.baselineWeight ?? 0.5));
    const blockBoostVal = Number(options.blockBoost ?? 0.2);
    const smallBoostVal = Number(options.smallBoost ?? 0.1);
    const groupedSets = new Map();
    for (const item of candidates || []) {
        const nums = normalizeNumberList(item.numbers);
        if (nums.length === 0) continue;
        const observedDropoff = clamp(Number(
            item.isPotential ? item.nonFormationRate : (item.dropOffRate ?? item.exclusionRate)
        ) || 0);
        const setKey = nums.join(',');
        const group = groupedSets.get(setKey) || { nums, rateSum: 0, count: 0, contributors: [] };
        group.rateSum += observedDropoff;
        group.count += 1;
        group.contributors.push({
            item,
            key: item.key || item.title || '',
            title: item.title || item.explanation || item.description || '',
            dropOffRate: observedDropoff,
            isPotential: !!item.isPotential
        });
        groupedSets.set(setKey, group);
    }

    const scores = Array.from({ length: 100 }, (_, number) => ({
        number,
        edgeSum: 0,
        edgeCount: 0,
        maxEdge: -1,
        contributors: []
    }));
    for (const group of groupedSets.values()) {
        const observedDropoff = group.rateSum / Math.max(1, group.count);
        const baselineDropoff = 1 - (group.nums.length / 100);
        
        let boost = 1;
        const hasBlock = group.contributors.some(c => isBlockPattern(c.key || c.item?.key));
        if (hasBlock) boost += blockBoostVal;
        const hasSmall = group.nums.length <= 20;
        if (hasSmall) boost += smallBoostVal;

        const edge = (observedDropoff - (baselineWeight * baselineDropoff)) * boost;
        for (const number of group.nums) {
            const row = scores[number];
            row.edgeSum += edge;
            row.edgeCount += 1;
            row.maxEdge = Math.max(row.maxEdge, edge);
            row.contributors.push(...group.contributors.map(item => ({
                ...item,
                setSize: group.nums.length,
                baselineDropoff,
                edge
            })));
        }
    }

    const rankedNumbers = scores.map(row => ({
        ...row,
        score: row.edgeCount > 0 ? row.edgeSum / row.edgeCount : -1
    })).sort((a, b) => b.score - a.score || b.maxEdge - a.maxEdge || b.edgeCount - a.edgeCount || a.number - b.number);
    const cappedTarget = Math.max(0, Math.min(100, targetExcluded));
    return {
        id: options.id,
        name: options.name,
        excluded: rankedNumbers.slice(0, cappedTarget).map(item => item.number),
        numberScores: rankedNumbers.map((row, index) => ({
            rank: index + 1,
            number: row.number,
            score: row.score,
            averageEdge: row.score,
            distinctSetCount: row.edgeCount,
            maxEdge: row.maxEdge,
            excluded: index < cappedTarget
        }))
    };
}

function buildEnsembleCombinedMethod(candidates, targetExcluded, options = {}) {
    const dedup = buildDeduplicatedEdgeMethod(candidates, targetExcluded, { baselineWeight: 0.5 });
    const small = buildChainSmallFirstMethod(candidates, targetExcluded);
    const block = buildChainBlockFirstMethod(candidates, targetExcluded);

    const dedupSet = new Set(dedup.excluded);
    const smallSet = new Set(small.excluded);
    const blockSet = new Set(block.excluded);

    const weights = {
        dedup: 0.6,
        small: 0.2,
        block: 0.2
    };

    const scores = ALL_NUMBERS.map(num => {
        let score = 0;
        let votes = 0;
        if (dedupSet.has(num)) {
            score += weights.dedup;
            votes++;
        }
        if (smallSet.has(num)) {
            score += weights.small;
            votes++;
        }
        if (blockSet.has(num)) {
            score += weights.block;
            votes++;
        }
        return { num, score, votes };
    });

    scores.sort((a, b) => b.score - a.score || b.votes - a.votes || a.num - b.num);

    const excluded = scores.slice(0, targetExcluded).map(row => row.num).sort((a, b) => a - b);
    return {
        id: options.id,
        name: options.name,
        excluded
    };
}

function getCandidateBayesianLogOddsWeight(item = {}, alpha = BAYES_LOG_ODDS_ALPHA) {
    const nums = normalizeNumberList(item.numbers);
    if (nums.length === 0) return 0;

    const positiveEdge = Math.max(0, getCandidateExclusionEdge(item));
    if (positiveEdge <= 0) return 0;

    const { sampleSize, breakCount } = getCandidateBreakSample(item);
    const baselineBreakRate = Number.isFinite(Number(item.baselineBreakRate))
        ? clamp(Number(item.baselineBreakRate), 0.0001, 0.9999)
        : clamp(1 - nums.length / 100, 0.0001, 0.9999);
    const posteriorBreakRate = clamp(
        (breakCount + alpha * baselineBreakRate) / Math.max(1, sampleSize + alpha),
        0.0001,
        0.9999
    );
    const logOddsLift = Math.max(0, safeLogit(posteriorBreakRate) - safeLogit(baselineBreakRate));
    if (logOddsLift <= 0) return 0;

    const reliability = Math.sqrt(sampleSize / Math.max(1, sampleSize + alpha));
    const priority = clamp((Number(item.exclusionPriority) || 0) / 100);

    return logOddsLift * reliability * priority / nums.length;
}

function buildBayesianLogOddsMethod(candidates, options = {}) {
    const targetExcluded = Number.isFinite(Number(options.targetExcluded))
        ? Math.max(0, Math.min(100, Math.round(Number(options.targetExcluded))))
        : BAYES_LOG_ODDS_TARGET_EXCLUDED_3;
    const alpha = Number.isFinite(Number(options.alpha)) && Number(options.alpha) > 0
        ? Number(options.alpha)
        : BAYES_LOG_ODDS_ALPHA;

    const scores = Array.from({ length: 100 }, (_, number) => ({
        number,
        score: 0,
        contributors: []
    }));

    for (const item of candidates || []) {
        if (!isPotentialCandidateEligible(item)) continue;
        const nums = normalizeNumberList(item.numbers);
        if (nums.length === 0) continue;

        const weight = getCandidateBayesianLogOddsWeight(item, alpha);
        if (!Number.isFinite(weight) || weight <= 0) continue;

        nums.forEach(num => {
            scores[num].score += weight;
            scores[num].contributors.push({ item, weight });
        });
    }

    const rankedNumbers = scores
        .slice()
        .sort((a, b) => b.score - a.score || b.contributors.length - a.contributors.length || a.number - b.number);
    const positiveRankedNumbers = rankedNumbers.filter(item => item.score > 0);
    const excluded = positiveRankedNumbers.slice(0, targetExcluded).map(item => item.number);

    const contributorMap = new Map();
    positiveRankedNumbers.slice(0, targetExcluded).forEach(numberScore => {
        numberScore.contributors.forEach(({ item, weight }) => {
            const key = item.key || item.title;
            if (!key) return;
            if (!contributorMap.has(key)) {
                contributorMap.set(key, {
                    item,
                    supportScore: 0,
                    numbers: new Set()
                });
            }
            const entry = contributorMap.get(key);
            entry.supportScore += weight;
            entry.numbers.add(numberScore.number);
        });
    });

    const selectedStreaks = [...contributorMap.values()]
        .map(entry => ({
            ...entry.item,
            numbers: [...entry.numbers].sort((a, b) => a - b),
            numbersCount: entry.numbers.size,
            addedNumbersCount: entry.numbers.size,
            combinedStage: 'bayes log-odds',
            numberRiskScore: roundOne(entry.supportScore * 100)
        }))
        .sort((a, b) => (b.numberRiskScore || 0) - (a.numberRiskScore || 0));

    return {
        id: options.id || 'bayesianLogOdds3',
        name: options.name || 'Bayes log-odds - đánh 3 số',
        description: options.description || 'Hiệu chỉnh tỷ lệ gãy bằng Bayesian shrinkage về xác suất nền, đổi sang log-odds lift rồi cộng điểm từng số; loại 97 số và đánh 3 số còn lại.',
        selectedStreaks,
        excluded
    };
}

function evaluateMethod(method, actualNumber, options = {}) {
    const excluded = normalizeNumberList(method.excluded);
    const excludedSet = new Set(excluded);
    const playMode = normalizePlayMode(options.playMode);
    const betWinMultiplier = normalizeBetWinMultiplier(options.betWinMultiplier ?? options.winMultiplier);
    const betWinFactor = normalizeBetWinFactor(options.betWinFactor);
    const holdWinMultiplier = normalizeHoldWinMultiplier(options.holdWinMultiplier);
    const includeBet = playMode !== 'hold';
    const includeHold = playMode !== 'bet';
    const hasActualNumber = actualNumber !== null && actualNumber !== undefined;
    const excludedCount = excluded.length;
    const selectedNumbersUnion = new Set();
    let selectedNumbersRawCount = 0;
    for (const streak of method.selectedStreaks || []) {
        const nums = normalizeNumberList(streak.numbers);
        selectedNumbersRawCount += nums.length;
        nums.forEach(num => selectedNumbersUnion.add(num));
    }
    const rawBetCount = 100 - excludedCount;
    const skipped = excludedCount < MIN_EXCLUDED_TO_PLAY || !!method.forceSkip;
    const rawBetNumbers = skipped ? [] : ALL_NUMBERS.filter(num => !excludedSet.has(num));
    const betNumbers = includeBet ? rawBetNumbers : [];
    const betCount = betNumbers.length;
    const actualExcluded = hasActualNumber && excludedSet.has(actualNumber);
    const hit = hasActualNumber && !skipped && !actualExcluded;
    const miss = hasActualNumber && !skipped && actualExcluded;
    const intersectionNumbers = normalizeNumberList(method.intersectionNumbers || []);
    const intersectSet = new Set(intersectionNumbers);
    let betStake = 0;
    if (includeBet && !skipped) {
        if (intersectSet.size > 0) {
            for (const num of betNumbers) {
                const weight = intersectSet.has(num) ? 2 : 1;
                betStake += weight * BET_PER_NUMBER;
            }
        } else {
            betStake = betCount * BET_PER_NUMBER;
        }
    }
    let betPayout = 0;
    if (includeBet && hit) {
        const weight = intersectSet.has(actualNumber) ? 2 : 1;
        betPayout = weight * BET_PER_NUMBER * betWinMultiplier * betWinFactor;
    }
    const betProfit = includeBet && hasActualNumber && !skipped ? betPayout - betStake : 0;
    const holdIncome = includeHold && !skipped ? excludedCount * BET_PER_NUMBER * holdWinMultiplier : 0;
    const holdLoss = includeHold && hasActualNumber && !skipped && actualExcluded ? BET_PER_NUMBER * HOLD_LOSS_MULTIPLIER : 0;
    const holdProfit = includeHold && hasActualNumber && !skipped ? holdIncome - holdLoss : 0;
    const stake = betStake;
    const payout = betPayout + holdIncome;
    const profit = hasActualNumber && !skipped ? betProfit + holdProfit : 0;
    const profitWin = hasActualNumber && !skipped && profit > 0;
    const profitLoss = hasActualNumber && !skipped && profit < 0;

    const detailLimit = Number.isFinite(Number(options.selectedStreakDetailLimit))
        ? Math.max(0, Math.round(Number(options.selectedStreakDetailLimit)))
        : SELECTED_STREAK_DETAIL_LIMIT;
    const compactNumbers = !!options.compactDetails;
    const selectedStreakDetails = (method.selectedStreaks || []).slice(0, detailLimit).map(item => ({
        key: item.key,
        title: item.title,
        streak: item.streak,
        maxStreak: item.maxStreak,
        dropOffRate: item.dropOffRate,
        dropOffPercent: item.dropOffPercent,
        exclusionPriority: item.exclusionPriority,
        baselineBreakRate: item.baselineBreakRate,
        edge: item.edge,
        edgePercent: item.edgePercent,
        reliabilityScore: item.reliabilityScore,
        combinedScore: item.combinedScore,
        chainSortScore: item.chainSortScore,
        chainOrderSortMode: item.chainOrderSortMode,
        sampleSize: item.sampleSize,
        continuedCount: item.continuedCount,
        breakCount: item.breakCount,
        lowerBound: item.lowerBound,
        lowerBoundPercent: item.lowerBoundPercent,
        avgLength: item.avgLength,
        avgGapDays: item.avgGapDays,
        daysSinceLatestEnd: item.daysSinceLatestEnd,
        latestEndDate: item.latestEndDate,
        targetLength: item.targetLength,
        targetTimingRatio: item.targetTimingRatio,
        targetTimingScore: item.targetTimingScore,
        sampleScore: item.sampleScore,
        recencyScore: item.recencyScore,
        gapTimingScore: item.gapTimingScore,
        avgLengthScore: item.avgLengthScore,
        edgeScore: item.edgeScore,
        numberRiskScore: item.numberRiskScore,
        numberSupportScore: item.numberSupportScore,
        numberSupportCount: item.numberSupportCount,
        chainSignalScore: item.chainSignalScore,
        chainRawSignalScore: item.chainRawSignalScore,
        chainRiskDiscountScore: item.chainRiskDiscountScore,
        chainDueScore: item.chainDueScore,
        chainFrequencyPerYear: item.chainFrequencyPerYear,
        chainAppearanceRate: item.chainAppearanceRate,
        chainAppearanceLowerBound: item.chainAppearanceLowerBound,
        chainAction: item.chainAction,
        protectedNumbersCount: item.protectedNumbersCount,
        combinedStage: item.combinedStage,
        frequencyPerYear: item.frequencyPerYear,
        formFrequencyPerYear: item.formFrequencyPerYear,
        formationCount: item.formationCount,
        isPotential: !!item.isPotential,
        numbersCount: item.numbers.length,
        addedNumbersCount: item.addedNumbersCount,
        numbers: compactNumbers ? item.numbers.slice(0, 36) : item.numbers,
        reason: compactNumbers ? '' : item.reason
    }));

    const skipReason = skipped
        ? (method.skipReason || `Loại trừ ${excludedCount} số, dưới ngưỡng ${MIN_EXCLUDED_TO_PLAY} số nên bỏ qua.`)
        : '';

    const numberScores = Array.isArray(method.numberScores) ? method.numberScores : [];
    const actualNumberScore = hasActualNumber
        ? numberScores.find(item => Number(item.number) === Number(actualNumber))
        : null;
    const lastExcludedScore = numberScores.filter(item => item.excluded).at(-1);
    const firstRetainedScore = numberScores.find(item => !item.excluded);
    const positiveScoreCount = numberScores.filter(item => Number(item.score) > 0).length;
    const result = {
        methodVersion: method.methodVersion || SIMULATION_METHOD_VERSION,
        skipped,
        hit,
        miss,
        profitWin,
        profitLoss,
        actualExcluded,
        excluded,
        excludedCount,
        holdCount: includeHold ? excludedCount : 0,
        betNumbers,
        betCount,
        rawBetNumbers,
        rawBetCount,
        playMode,
        playModeLabel: PLAY_MODE_LABELS[playMode],
        betWinMultiplier,
        betWinFactor,
        holdWinMultiplier,
        includeBet,
        includeHold,
        selectedStreaks: selectedStreakDetails,
        intersectionNumbers: method.intersectionNumbers || [],
        customOptions: method.customOptions,
        selectedStreakCount: (method.selectedStreaks || []).length,
        selectedNumbersRawCount,
        selectedNumbersUnionCount: selectedNumbersUnion.size,
        duplicateNumbersCount: Math.max(0, selectedNumbersRawCount - selectedNumbersUnion.size),
        stake: formatMoneyK(stake),
        payout: formatMoneyK(payout),
        betStake: formatMoneyK(betStake),
        betPayout: formatMoneyK(betPayout),
        betProfit: formatMoneyK(betProfit),
        holdIncome: formatMoneyK(holdIncome),
        holdLoss: formatMoneyK(holdLoss),
        holdProfit: formatMoneyK(holdProfit),
        combinedProfit: formatMoneyK(profit),
        holdWin: hasActualNumber && !skipped ? !actualExcluded : false,
        profit: formatMoneyK(profit),
        scoreDiagnostics: numberScores.length > 0 ? {
            positiveScoreCount,
            cutoffScore: Number(lastExcludedScore?.score || 0),
            firstRetainedScore: Number(firstRetainedScore?.score || 0),
            maxScore: Number(numberScores[0]?.score || 0),
            actualRank: actualNumberScore?.rank ?? null,
            actualScore: Number(actualNumberScore?.score || 0),
            actualSupportCount: Number(
                actualNumberScore?.supportCount
                ?? actualNumberScore?.rawSupportCount
                ?? actualNumberScore?.positiveSupportCount
                ?? 0
            ),
            actualDistinctSetCount: Number(
                actualNumberScore?.distinctSetCount
                ?? actualNumberScore?.distinctSupportCount
                ?? 0
            ),
            actualMaxEdge: Number(actualNumberScore?.maxEdge || 0)
        } : null
    };

    if (!compactNumbers) {
        result.id = method.id;
        result.name = method.name;
        result.description = method.description;
        result.skipReason = skipReason;
        result.numberScores = numberScores;
    } else if (skipReason) {
        result.skipReason = skipReason;
    }

    return result;
}

function summarizeMethod(details, methodId) {
    const methodResults = details
        .map(day => day.methods[methodId])
        .filter(Boolean);
    const played = methodResults.filter(item => !item.skipped);
    const wins = played.filter(item => item.profit > 0).length;
    const losses = played.filter(item => item.profit < 0).length;
    const totalStake = played.reduce((sum, item) => sum + item.stake, 0);
    const totalPayout = played.reduce((sum, item) => sum + item.payout, 0);
    const totalProfit = played.reduce((sum, item) => sum + item.profit, 0);
    const totalBetProfit = played.reduce((sum, item) => sum + (item.betProfit || 0), 0);
    const totalHoldProfit = played.reduce((sum, item) => sum + (item.holdProfit || 0), 0);
    const excludedCounts = played.map(item => item.excludedCount);
    const betCounts = played.map(item => item.betCount);

    return {
        totalDays: methodResults.length,
        playedDays: played.length,
        skippedDays: methodResults.length - played.length,
        wins,
        losses,
        hitRate: played.length > 0 ? wins / played.length : 0,
        missRate: played.length > 0 ? losses / played.length : 0,
        totalStake: formatMoneyK(totalStake),
        totalPayout: formatMoneyK(totalPayout),
        totalProfit: formatMoneyK(totalProfit),
        totalBetProfit: formatMoneyK(totalBetProfit),
        totalHoldProfit: formatMoneyK(totalHoldProfit),
        averageExcluded: excludedCounts.length > 0
            ? Math.round((excludedCounts.reduce((sum, count) => sum + count, 0) / excludedCounts.length) * 10) / 10
            : 0,
        averageBetCount: betCounts.length > 0
            ? Math.round((betCounts.reduce((sum, count) => sum + count, 0) / betCounts.length) * 10) / 10
            : 0
    };
}

function emptyYearSummary(year) {
    return {
        year: String(year),
        totalDays: 0,
        playedDays: 0,
        skippedDays: 0,
        wins: 0,
        losses: 0,
        hitRate: 0,
        missRate: 0,
        totalStake: 0,
        totalPayout: 0,
        totalProfit: 0,
        roi: 0,
        averageExcluded: 0,
        averageBetCount: 0,
        averageSelectedStreaks: 0,
        bestProfit: 0,
        worstProfit: 0
    };
}

function updateYearSummary(summary, method) {
    summary.totalDays += 1;
    if (method.skipped) {
        summary.skippedDays += 1;
        return;
    }

    summary.playedDays += 1;
    if ((method.profit || 0) > 0) summary.wins += 1;
    if ((method.profit || 0) < 0) summary.losses += 1;
    summary.totalStake += method.stake || 0;
    summary.totalPayout += method.payout || 0;
    summary.totalProfit += method.profit || 0;
    summary.averageExcluded += method.excludedCount || 0;
    summary.averageBetCount += method.betCount || 0;
    summary.averageSelectedStreaks += method.selectedStreakCount || 0;
    summary.bestProfit = summary.playedDays === 1 ? method.profit : Math.max(summary.bestProfit, method.profit);
    summary.worstProfit = summary.playedDays === 1 ? method.profit : Math.min(summary.worstProfit, method.profit);
}

function finalizeYearSummary(summary) {
    if (summary.playedDays > 0) {
        summary.hitRate = summary.wins / summary.playedDays;
        summary.missRate = summary.losses / summary.playedDays;
        summary.averageExcluded = roundOne(summary.averageExcluded / summary.playedDays);
        summary.averageBetCount = roundOne(summary.averageBetCount / summary.playedDays);
        summary.averageSelectedStreaks = roundOne(summary.averageSelectedStreaks / summary.playedDays);
    }
    summary.roi = summary.totalStake > 0 ? summary.totalProfit / summary.totalStake : 0;
    return summary;
}

function getYearFromDateString(value) {
    if (!value) return '';
    const str = String(value);
    if (/^\d{4}-/.test(str)) return str.slice(0, 4);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str.slice(6, 10);
    const parsed = new Date(str);
    return Number.isNaN(parsed.getTime()) ? '' : String(parsed.getFullYear());
}

function summarizeYearlyReportRows(rows) {
    const overall = emptyYearSummary('Tổng');
    rows.forEach(row => {
        overall.totalDays += row.totalDays;
        overall.playedDays += row.playedDays;
        overall.skippedDays += row.skippedDays;
        overall.wins += row.wins;
        overall.losses += row.losses;
        overall.totalStake += row.totalStake;
        overall.totalPayout += row.totalPayout;
        overall.totalProfit += row.totalProfit;
        if (row.playedDays > 0) {
            overall.bestProfit = overall.playedDays === row.playedDays
                ? row.bestProfit
                : Math.max(overall.bestProfit, row.bestProfit);
            overall.worstProfit = overall.playedDays === row.playedDays
                ? row.worstProfit
                : Math.min(overall.worstProfit, row.worstProfit);
            overall.averageExcluded += row.averageExcluded * row.playedDays;
            overall.averageBetCount += row.averageBetCount * row.playedDays;
            overall.averageSelectedStreaks += row.averageSelectedStreaks * row.playedDays;
        }
    });
    if (overall.playedDays > 0) {
        overall.hitRate = overall.wins / overall.playedDays;
        overall.missRate = overall.losses / overall.playedDays;
        overall.averageExcluded = roundOne(overall.averageExcluded / overall.playedDays);
        overall.averageBetCount = roundOne(overall.averageBetCount / overall.playedDays);
        overall.averageSelectedStreaks = roundOne(overall.averageSelectedStreaks / overall.playedDays);
    }
    overall.roi = overall.totalStake > 0 ? overall.totalProfit / overall.totalStake : 0;
    return overall;
}

async function runCombinedRisk25YearlyReport(options = {}, inputData = null) {
    await ensureLotteryLoaded();

    const rawData = inputData || lotteryService.getRawData();
    const sortedData = getSortedLotteryData(rawData);
    if (sortedData.length < 2) {
        return { error: 'Không đủ dữ liệu để chạy báo cáo.' };
    }

    const requestedYears = Number.isFinite(Number(options.years)) ? Math.max(1, Number(options.years)) : 20;
    const requestedDays = Number.isFinite(Number(options.days)) && Number(options.days) > 0
        ? Math.round(Number(options.days))
        : Math.round(requestedYears * 365.25);
    const effectiveDays = Math.max(1, Math.min(requestedDays, sortedData.length - 1));
    const startIndex = sortedData.length - effectiveDays;
    const strictPointInTime = parseBooleanOption(
        options.strictPointInTime ?? options.strictPIT,
        true
    );
    const yearlyMap = new Map();

    for (let actualIndex = startIndex; actualIndex < sortedData.length; actualIndex++) {
        const actualDay = sortedData[actualIndex];
        const basisDay = sortedData[actualIndex - 1];
        if (!actualDay || !basisDay) continue;

        const predictionDate = formatRawDate(actualDay.date);
        const predictionIsoDate = formatIsoDate(actualDay.date);
        const actualNumber = normalizeNumber(actualDay.special);
        const totalYears = getHistoryYearsAtIndex(sortedData, actualIndex - 1);
        if (strictPointInTime) {
            const prefixRaw = sortedData.slice(0, actualIndex);
            const prefixStats = await generateStrictStatsForPrefix(prefixRaw);
            lotteryService.__setInMemoryCachesForBacktest({
                rawData: prefixRaw,
                ...prefixStats
            });
            historicalExclusionService.clearCache();
        }
        const quickStats = historicalExclusionService.computeQuickStatsForDateFast(predictionDate, totalYears);
        const method = evaluateMethod(buildCombinedReliabilityMethodFromQuickStats(quickStats), actualNumber, {
            compactDetails: true,
            selectedStreakDetailLimit: 0
        });
        const year = getYearFromDateString(predictionIsoDate);
        if (!year) continue;
        if (!yearlyMap.has(year)) yearlyMap.set(year, emptyYearSummary(year));
        updateYearSummary(yearlyMap.get(year), method);
    }

    const yearly = [...yearlyMap.values()]
        .sort((a, b) => Number(a.year) - Number(b.year))
        .map(finalizeYearSummary);

    return {
        generatedAt: new Date().toISOString(),
        method: {
            id: 'combined20to30',
            name: 'Tổng hợp rủi ro 25 số đánh',
            description: 'Loại đúng 75 số theo thứ tự ưu tiên mới từ Tổng hợp dự đoán: kỷ lục trước, chuỗi đang diễn ra, rồi chuỗi tiềm năng <=1/năm.'
        },
        config: {
            requestedYears,
            requestedDays,
            effectiveDays,
            betPerNumber: BET_PER_NUMBER,
            winMultiplier: WIN_MULTIPLIER,
            minExcludedToPlay: MIN_EXCLUDED_TO_PLAY,
            combinedTargetMin: COMBINED_TARGET_MIN,
            combinedTargetMax: COMBINED_TARGET_MAX,
            edgePerNumberTargetExcluded: EDGE_PER_NUMBER_TARGET_EXCLUDED,
            maxPotentialFormationCount: MAX_POTENTIAL_FORMATION_COUNT,
            maxPotentialFormationPerYear: MAX_POTENTIAL_FREQUENCY_PER_YEAR,
            methodVersion: SIMULATION_METHOD_VERSION,
            pointInTime: {
                rollingHistory: true,
                strict: strictPointInTime,
                dailyState: strictPointInTime
                    ? 'strict-prefix-regenerated-before-each-prediction'
                    : 'fast-full-history-index',
                eligibleForPromotion: false,
                warning: strictPointInTime
                    ? 'Mỗi ngày tái sinh stats/index từ dữ liệu trước ngày dự đoán; không dùng full-history index.'
                    : 'Đường nhanh dùng full-history index; chỉ dùng thăm dò.'
            },
            moneyUnit: 'K VND'
        },
        overall: summarizeYearlyReportRows(yearly),
        yearly
    };
}

function emptySearchSummary(id, config = {}) {
    return {
        id,
        config,
        days: 0,
        play: 0,
        skip: 0,
        win: 0,
        loss: 0,
        stake: 0,
        payout: 0,
        profit: 0,
        bet: 0,
        excluded: 0,
        best: null,
        worst: null,
        year: {}
    };
}

function updateSearchSummary(summary, method, predictionIsoDate) {
    summary.days += 1;
    const year = getYearFromDateString(predictionIsoDate) || 'unknown';
    if (!summary.year[year]) summary.year[year] = emptySearchSummary(`${summary.id}_${year}`, summary.config);
    const yearSummary = summary.year[year];
    yearSummary.days += 1;

    if (method.skipped) {
        summary.skip += 1;
        yearSummary.skip += 1;
        return;
    }

    summary.play += 1;
    yearSummary.play += 1;
    if ((method.profit || 0) > 0) {
        summary.win += 1;
        yearSummary.win += 1;
    } else if ((method.profit || 0) < 0) {
        summary.loss += 1;
        yearSummary.loss += 1;
    }

    summary.stake += method.stake || 0;
    summary.payout += method.payout || 0;
    summary.profit += method.profit || 0;
    summary.bet += method.betCount || 0;
    summary.excluded += method.excludedCount || 0;
    summary.best = summary.best === null ? method.profit : Math.max(summary.best, method.profit);
    summary.worst = summary.worst === null ? method.profit : Math.min(summary.worst, method.profit);

    yearSummary.stake += method.stake || 0;
    yearSummary.payout += method.payout || 0;
    yearSummary.profit += method.profit || 0;
    yearSummary.bet += method.betCount || 0;
    yearSummary.excluded += method.excludedCount || 0;
    yearSummary.best = yearSummary.best === null ? method.profit : Math.max(yearSummary.best, method.profit);
    yearSummary.worst = yearSummary.worst === null ? method.profit : Math.min(yearSummary.worst, method.profit);
}

function finalizeSearchSummary(summary) {
    const finalized = {
        ...summary,
        hitRate: summary.play > 0 ? summary.win / summary.play : 0,
        roi: summary.stake > 0 ? summary.profit / summary.stake : 0,
        avgBet: summary.play > 0 ? roundOne(summary.bet / summary.play) : 0,
        avgExcluded: summary.play > 0 ? roundOne(summary.excluded / summary.play) : 0
    };
    finalized.year = Object.fromEntries(Object.entries(summary.year)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([year, row]) => {
            const clean = { ...row };
            delete clean.year;
            return [year, {
                ...clean,
                hitRate: clean.play > 0 ? clean.win / clean.play : 0,
                roi: clean.stake > 0 ? clean.profit / clean.stake : 0,
                avgBet: clean.play > 0 ? roundOne(clean.bet / clean.play) : 0,
                avgExcluded: clean.play > 0 ? roundOne(clean.excluded / clean.play) : 0
            }];
        }));
    finalized.positiveYears = Object.values(finalized.year).filter(row => row.profit > 0).length;
    finalized.negativeYears = Object.values(finalized.year).filter(row => row.profit < 0).length;
    finalized.minYearProfit = Math.min(...Object.values(finalized.year).map(row => row.profit));
    finalized.maxYearProfit = Math.max(...Object.values(finalized.year).map(row => row.profit));
    return finalized;
}

async function runModernExclusionSearchReport(options = {}, inputData = null) {
    await ensureLotteryLoaded();

    const rawData = inputData || lotteryService.getRawData();
    const sortedData = getSortedLotteryData(rawData);
    if (sortedData.length < 2) {
        return { error: 'Không đủ dữ liệu để chạy báo cáo.' };
    }

    const minHistoryDays = Number.isFinite(Number(options.minHistoryDays))
        ? Math.max(30, Math.round(Number(options.minHistoryDays)))
        : 365;
    const requestedMaxDays = Number.isFinite(Number(options.maxDays)) && Number(options.maxDays) > 0
        ? Math.round(Number(options.maxDays))
        : null;
    const minStartIndex = Math.min(Math.max(1, minHistoryDays), sortedData.length - 1);
    const startIndex = requestedMaxDays
        ? Math.max(minStartIndex, sortedData.length - requestedMaxDays)
        : minStartIndex;
    const targets = (options.targets || [99, 98, 97, 96, 95, 94, 93, 92, 91, 90])
        .map(Number)
        .filter(value => Number.isFinite(value) && value >= 0 && value <= 100);
    const alphas = (options.alphas || [20, 50, 100, 200, 500])
        .map(Number)
        .filter(value => Number.isFinite(value) && value > 0);

    const configs = [];
    for (const target of targets) {
        configs.push({
            id: `edgePerNumber_${target}`,
            kind: 'edgePerNumber',
            target
        });
        for (const alpha of alphas) {
            configs.push({
                id: `bayesLogOddsA${alpha}_${target}`,
                kind: 'bayesLogOdds',
                alpha,
                target
            });
        }
    }

    const summaries = new Map(configs.map(config => [config.id, emptySearchSummary(config.id, config)]));

    for (let actualIndex = startIndex; actualIndex < sortedData.length; actualIndex++) {
        const actualDay = sortedData[actualIndex];
        if (!actualDay) continue;
        const processedDays = actualIndex - startIndex + 1;
        if (typeof options.onProgress === 'function' && (processedDays === 1 || processedDays % 500 === 0)) {
            options.onProgress({
                processedDays,
                effectiveDays: sortedData.length - startIndex,
                predictionDate: formatRawDate(actualDay.date)
            });
        }

        const predictionDate = formatRawDate(actualDay.date);
        const predictionIsoDate = formatIsoDate(actualDay.date);
        const actualNumber = normalizeNumber(actualDay.special);
        const totalYears = getHistoryYearsAtIndex(sortedData, actualIndex - 1);
        const quickStats = historicalExclusionService.computeQuickStatsForDateFast(predictionDate, totalYears);
        const candidates = buildCandidateList(quickStats, {
            excludeFixedThreeValueGroups: !!options.excludeFixedThreeValueGroups
        });

        for (const config of configs) {
            const method = config.kind === 'edgePerNumber'
                ? buildEdgePerNumberMethod(candidates, config.target)
                : buildBayesianLogOddsMethod(candidates, {
                    id: config.id,
                    name: `Bayes log-odds A${config.alpha} - loại ${config.target}`,
                    targetExcluded: config.target,
                    alpha: config.alpha
                });
            updateSearchSummary(
                summaries.get(config.id),
                evaluateMethod(method, actualNumber, {
                    compactDetails: true,
                    selectedStreakDetailLimit: 0
                }),
                predictionIsoDate
            );
        }
    }

    const overall = [...summaries.values()]
        .map(finalizeSearchSummary)
        .sort((a, b) => b.profit - a.profit || b.roi - a.roi);

    return {
        generatedAt: new Date().toISOString(),
        config: {
            totalRows: sortedData.length,
            startIndex,
            effectiveDays: Math.max(0, sortedData.length - startIndex),
            minHistoryDays,
            requestedMaxDays,
            targets,
            alphas,
            betPerNumber: BET_PER_NUMBER,
            winMultiplier: WIN_MULTIPLIER,
            moneyUnit: 'K VND',
            methodVersion: SIMULATION_METHOD_VERSION
        },
        overall
    };
}

async function runChainFrequencyAnalysis(options = {}, inputData = null) {
    if (inputData) {
        await ensureLotteryLoaded();
    } else if (!lotteryService.getRawData() || lotteryService.getRawData().length === 0) {
        await lotteryService.loadRawData();
    }

    const rawData = inputData || lotteryService.getRawData();
    const sortedData = getSortedLotteryData(rawData);
    if (sortedData.length < 2) {
        return { error: 'Không đủ dữ liệu để phân tích chuỗi loại trừ.' };
    }

    const basisIndex = sortedData.length - 1;
    const basisDay = sortedData[basisIndex];
    const predictionDate = addDaysToRawDate(basisDay.date, 1);
    const totalYears = getHistoryYearsAtIndex(sortedData, basisIndex);
    let quickStats = null;
    if (!inputData) {
        quickStats = await dataAccess.getQuickStatsFromCache();
        if (quickStats && !quickStats._meta) {
            quickStats._meta = { totalYears };
        }
    }
    if (!quickStats || Object.keys(quickStats).length <= 1) {
        await lotteryService.loadStats();
        quickStats = historicalExclusionService.computeQuickStatsForDateFast(predictionDate, totalYears, {
            useFullHistoryStats: true
        });
    }
    const includePotential = parseBooleanOption(options.includePotential, true);
    const sortBy = normalizeChainSortBy(options.sortBy, 'risk');
    const excludeFixedThreeValueGroups = parseBooleanOption(options.excludeFixedThreeValueGroups, false);
    const candidates = buildCandidateList(quickStats, {
        excludeFixedThreeValueGroups
    }).filter(item => includePotential || !item.isPotential);
    const averageDropoffCandidates = buildCandidateList(quickStats, {
        minDropOffRate: 0,
        excludeFixedThreeValueGroups
    }).filter(item => includePotential || !item.isPotential);
    const rows = candidates.map((item, index) => {
        const nums = normalizeNumberList(item.numbers);
        const tierRank = Number(item.exclusionTierRank || item.sortGroup + 1 || 3);
        const riskRate = Number(item.isPotential ? item.nonFormationRate : item.dropOffRate);
        const frequencyInfo = getChainRowFrequency(item, totalYears);
        const selectedByDefault = false;
        return {
            key: item.key || `${index}`,
            title: item.title || item.pattern || item.key,
            tier: item.exclusionTier || `tier${tierRank}`,
            tierRank,
            tierLabel: item.tierLabel || (tierRank === 1 ? 'Tier 1 - Kỷ lục' : tierRank === 2 ? 'Tier 2 - Tần suất < 1/năm' : 'Tier 3 - Xác suất'),
            selectedByDefault,
            isPotential: !!item.isPotential,
            isRecord: tierRank === 1,
            recordType: item.recordType || '',
            streak: item.streak,
            currentLength: item.currentLength,
            targetLength: item.targetLength,
            maxStreak: item.maxStreak,
            riskRate,
            riskPercent: roundOne(riskRate * 100),
            dropOffRate: item.dropOffRate,
            nonFormationRate: item.nonFormationRate,
            formationRate: item.formationRate,
            formationPercent: roundOne(Number(item.formationRate || 0) * 100),
            formationCount: Number.isFinite(Number(item.formationCount)) ? Number(item.formationCount) : null,
            targetOccurrenceCount: Number.isFinite(Number(item.targetOccurrenceCount)) ? Number(item.targetOccurrenceCount) : null,
            formFrequencyPerYear: roundFrequency(item.formFrequencyPerYear),
            targetFrequencyPerYear: roundFrequency(item.targetFrequencyPerYear),
            frequencyPerYear: roundFrequency(frequencyInfo.frequencyPerYear),
            frequencyPerYearRaw: frequencyInfo.frequencyPerYear,
            frequencyCount: frequencyInfo.frequencyCount,
            frequencyYears: roundOne(frequencyInfo.frequencyYears),
            frequencyKind: frequencyInfo.frequencyKind,
            sampleSize: item.sampleSize,
            lowerBoundPercent: item.lowerBoundPercent,
            targetAvgGapDays: item.targetAvgGapDays,
            targetDaysSinceLatestEnd: item.targetDaysSinceLatestEnd,
            targetTimingScore: item.targetTimingScore,
            numbers: nums,
            numbersCount: nums.length,
            reason: item.reason || ''
        };
    }).sort((a, b) => compareChainRows(a, b, sortBy));
    const defaultExcluded = new Set();
    rows.filter(row => row.selectedByDefault).forEach(row => row.numbers.forEach(num => defaultExcluded.add(num)));
    const excludedNumbers = [...defaultExcluded].sort((a, b) => a - b);
    const excludedSet = new Set(excludedNumbers);
    const betNumbers = ALL_NUMBERS.filter(num => !excludedSet.has(num));
    const averageDropoffMethod = buildAverageDropoffPerNumberMethod(averageDropoffCandidates, 70, {
        id: 'avgDropoffHold70',
        name: 'Dropoff trung bình từng số - Hold 70'
    });
    const averageDropoffRanking = (averageDropoffMethod.numberScores || []).map(item => ({
        rank: item.rank,
        number: item.number,
        averageDropOffRate: item.averageDropOffRate,
        averageDropOffPercent: roundOne(Number(item.averageDropOffRate || 0) * 100),
        supportCount: item.supportCount,
        distinctSetCount: item.distinctSetCount,
        maxDropOffPercent: roundOne(Number(item.maxDropOffRate || 0) * 100),
        contributors: item.contributors || []
    }));
    const averageDropoffHolds = Object.fromEntries(
        [60, 65, 70, 75, 80, 85, 90, 95].map(holdCount => {
            const hold = averageDropoffRanking.slice(0, holdCount).map(item => item.number);
            const holdSet = new Set(hold);
            return [String(holdCount), {
                excludedNumbers: hold,
                betNumbers: ALL_NUMBERS.filter(number => !holdSet.has(number))
            }];
        })
    );
    const recommendedMethod = buildAverageDropoffPerNumberMethod(averageDropoffCandidates, 70, {
        id: 'avgEdge50Hold70',
        name: 'Dropoff TB hiệu chỉnh 50% nền - Hold 70',
        baselineWeight: 0.5
    });
    const recommendedRanking = (recommendedMethod.numberScores || []).map(item => ({
        rank: item.rank,
        number: item.number,
        score: item.score,
        scorePercent: roundOne(Number(item.score || 0) * 100),
        supportCount: item.supportCount,
        distinctSetCount: item.distinctSetCount,
        maxDropOffPercent: roundOne(Number(item.maxDropOffRate || 0) * 100),
        contributors: item.contributors || []
    }));
    const recommendedHolds = Object.fromEntries(
        [60, 65, 70, 75, 80, 85, 90, 95].map(holdCount => {
            const hold = recommendedRanking.slice(0, holdCount).map(item => item.number);
            const holdSet = new Set(hold);
            return [String(holdCount), {
                excludedNumbers: hold,
                betNumbers: ALL_NUMBERS.filter(number => !holdSet.has(number))
            }];
        })
    );

    return {
        generatedAt: new Date().toISOString(),
        predictionDate,
        basisDate: formatRawDate(basisDay.date),
        basisIsoDate: formatIsoDate(basisDay.date),
        totalYears: roundOne(totalYears),
        candidatesCount: candidates.length,
        config: {
            includePotential,
            sortBy,
            excludeFixedThreeValueGroups,
            methodVersion: SIMULATION_METHOD_VERSION
        },
        summary: {
            selectedChainCount: rows.filter(row => row.selectedByDefault).length,
            excludedNumberCount: excludedNumbers.length,
            betNumberCount: betNumbers.length,
            tier1Count: rows.filter(row => row.tierRank === 1).length,
            tier2Count: rows.filter(row => row.tierRank === 2).length,
            tier3Count: rows.filter(row => row.tierRank === 3).length
        },
        excludedNumbers,
        betNumbers,
        averageDropoff: {
            methodId: 'avgDropoffHold70',
            description: averageDropoffMethod.description,
            candidatesCount: averageDropoffCandidates.length,
            ranking: averageDropoffRanking,
            holds: averageDropoffHolds
        },
        recommendedExclusion: {
            methodId: 'avgEdge50Hold70',
            description: 'Điểm mỗi số là trung bình dropoff của các chuỗi chứa số đó sau khi trừ 50% xác suất gãy nền theo độ rộng tập số.',
            candidatesCount: averageDropoffCandidates.length,
            ranking: recommendedRanking,
            holds: recommendedHolds
        },
        chainRows: rows
    };
}

function createHoldMethodDefinition(parsed) {
    const target = parsed.targetExcluded;
    if (parsed.type === 'dedupEdge50CombinedHoldCustom') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Custom Combined (Block=${parsed.blockBoost}, Small=${parsed.smallBoost}) Hold ${target}`,
            targetExcluded: target,
            blockBoost: parsed.blockBoost,
            smallBoost: parsed.smallBoost,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'frequencyHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo HT/Target`,
            targetExcluded: target,
            sortBy: 'frequency',
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'tierHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo Tier/kỷ lục`,
            targetExcluded: target,
            sortBy: 'tierRisk',
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'scarcityHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo tiềm năng không HT/hiếm`,
            targetExcluded: target,
            sortBy: 'scarcityRisk',
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'recordHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo kỷ lục hiệu chỉnh`,
            targetExcluded: target,
            sortBy: 'recordAdjusted',
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'potentialHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} ưu tiên không hình thành`,
            targetExcluded: target,
            sortBy: 'potentialFirstRisk',
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'recordFirstHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} ưu tiên kỷ lục`,
            targetExcluded: target,
            sortBy: 'recordFirstRisk',
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'wilsonHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo Wilson/edge`,
            targetExcluded: target,
            sortBy: 'wilsonRisk',
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'edgeHold' || parsed.type === 'confidentEdgeHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: parsed.type === 'confidentEdgeHold'
                ? `Edge đủ bằng chứng - Hold ${target}`
                : `Ôm ${target} theo edge từng số`,
            targetExcluded: target,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (['avgDropoffHold', 'avgEdge25Hold', 'avgEdge50Hold', 'avgEdge75Hold'].includes(parsed.type)) {
        const baselineWeight = parsed.type === 'avgEdge25Hold'
            ? 0.25
            : (parsed.type === 'avgEdge50Hold' ? 0.5 : (parsed.type === 'avgEdge75Hold' ? 0.75 : 0));
        return {
            id: parsed.id,
            type: parsed.type,
            name: baselineWeight > 0
                ? `Ôm ${target} theo dropoff TB hiệu chỉnh ${Math.round(baselineWeight * 100)}% nền`
                : `Ôm ${target} theo dropoff trung bình từng số`,
            targetExcluded: target,
            baselineWeight,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'dedupDropoffHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo dropoff TB khử trùng tập số`,
            targetExcluded: target,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (['dedupEdgeHold', 'dedupEdge25Hold', 'dedupEdge50Hold', 'dedupEdge75Hold'].includes(parsed.type)) {
        const baselineWeight = parsed.type === 'dedupEdge25Hold'
            ? 0.25
            : (parsed.type === 'dedupEdge50Hold' ? 0.5 : (parsed.type === 'dedupEdge75Hold' ? 0.75 : 1));
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo edge khử trùng tập số (${Math.round(baselineWeight * 100)}% nền)`,
            targetExcluded: target,
            baselineWeight,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'deParallelBlock85Small65Hold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: 'Đề Song Song Lịch sử (Block 85 · Small 65)',
            targetExcluded: target,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'deParallelDedupEdge75DropoffHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: 'Đề Song Song Edge 75% + Dropoff khử trùng',
            targetExcluded: target,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'chainSmallFirstHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo chuỗi nhỏ ưu tiên`,
            targetExcluded: target,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'chainBlockFirstHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo nhịp block ưu tiên`,
            targetExcluded: target,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'dedupEdge50CombinedHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo Edge Combined (dedupEdge50 + block + small)`,
            targetExcluded: target,
            baselineWeight: 0.5,
            blockBoost: 0.2,
            smallBoost: 0.1,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'ensembleCombinedHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo Ensemble Combined`,
            targetExcluded: target,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    if (parsed.type === 'bayesHold') {
        return {
            id: parsed.id,
            type: parsed.type,
            name: `Ôm ${target} theo Bayes log-odds`,
            targetExcluded: target,
            minExcludedToPlay: Math.max(0, 100 - target)
        };
    }
    return {
        id: parsed.id,
        type: 'riskHold',
        name: `Ôm ${target} theo rủi ro (Risk ${target})`,
        targetExcluded: target,
        sortBy: 'risk',
        minExcludedToPlay: Math.max(0, 100 - target)
    };
}

function buildMethodDefinitions(customOptions = {}, methodFilter = null) {
    const defaultMethods = ['riskHold70', 'riskHold80', 'riskHold90', 'riskHold60'];
    const sourceMethods = methodFilter ? [...methodFilter] : defaultMethods;
    const definitions = [];
    const seen = new Set();

    for (const methodId of sourceMethods) {
        if (methodId === 'dropoff85') {
            definitions.push({
                id: 'dropoff85',
                name: 'Tier loại trừ tự động',
                description: 'Ưu tiên Tier 1 kỷ lục/siêu kỷ lục, Tier 2 chuỗi đang diễn ra có tần suất target <1/năm, sau đó Tier 3 theo dropoff/không hình thành.'
            });
            continue;
        }
        if (methodId === 'dropoff85ChainFrequency') {
            definitions.push({
                id: 'dropoff85ChainFrequency',
                name: 'Tier + Gap bảo vệ',
                description: 'Nền là Tier loại trừ. Gap/xác suất tiếp tục được dùng để bỏ qua chuỗi có tín hiệu giữ số rất mạnh.'
            });
            continue;
        }
        if (methodId === 'dropoff85Edge') {
            definitions.push({
                id: 'dropoff85Edge',
                name: 'Ưu tiên >= 85 + Edge dương',
                description: 'Chỉ dùng chuỗi ưu tiên >= 85 khi rủi ro vượt xác suất nền theo số lượng số bị loại.'
            });
            continue;
        }
        const parsed = parseHoldMethodFromId(methodId);
        if (!parsed || seen.has(parsed.id)) continue;
        seen.add(parsed.id);
        definitions.push(createHoldMethodDefinition(parsed));
    }

    return definitions;
}

function isDefaultCustomOptions(options = {}) {
    const normalized = normalizeCustomOptions(options);
    return Object.keys(CUSTOM_DEFAULTS).every(key => normalized[key] === CUSTOM_DEFAULTS[key]);
}

function cloneMethodWithId(method, id, name) {
    return {
        ...method,
        id,
        name,
        selectedStreaks: (method.selectedStreaks || []).map(item => ({ ...item })),
        excluded: normalizeNumberList(method.excluded || [])
    };
}

async function buildEvaluatedMethods(quickStats, candidates, actualNumber, options = {}, totalYears = 20, runtimeOptions = {}) {
    const customOptions = normalizeCustomOptions(options);
    const methodFilter = runtimeOptions.methodFilter || null;
    const explicitDetailLimit = Number(runtimeOptions.selectedStreakDetailLimit);
    const detailOptions = {
        compactDetails: !!runtimeOptions.compactDetails,
        selectedStreakDetailLimit: Number.isFinite(explicitDetailLimit)
            ? Math.max(0, Math.round(explicitDetailLimit))
            : (runtimeOptions.compactDetails
                ? COMPACT_SELECTED_STREAK_DETAIL_LIMIT
                : SELECTED_STREAK_DETAIL_LIMIT),
        playMode: normalizePlayMode(runtimeOptions.playMode),
        betWinMultiplier: normalizeBetWinMultiplier(runtimeOptions.betWinMultiplier ?? options.betWinMultiplier ?? options.winMultiplier),
        betWinFactor: normalizeBetWinFactor(runtimeOptions.betWinFactor ?? options.betWinFactor),
        holdWinMultiplier: normalizeHoldWinMultiplier(runtimeOptions.holdWinMultiplier ?? options.holdWinMultiplier)
    };
    const evaluated = {};
    let averageDropoffCandidates = null;
    for (const method of buildMethodDefinitions(customOptions, methodFilter)) {
        if (!methodFilterAllows(methodFilter, method.id)) continue;
        let builtMethod;
        if (method.id === 'dropoff85') {
            builtMethod = buildThresholdMethodFromQuickStats(quickStats);
        } else if (method.id === 'dropoff85ChainFrequency') {
            builtMethod = buildThresholdChainFrequencyMethod(candidates, totalYears, customOptions);
        } else if (method.id === 'dropoff85Edge') {
            builtMethod = buildEdgeThresholdMethod(candidates);
        } else if (method.type === 'edgeHold') {
            builtMethod = buildEdgePerNumberMethod(candidates, method.targetExcluded);
        } else if (method.type === 'confidentEdgeHold') {
            builtMethod = buildEdgePerNumberMethod(candidates, method.targetExcluded, {
                id: method.id,
                name: method.name,
                description: `Chỉ chơi khi có edge dương cho đủ ${method.targetExcluded} số cần loại; ngày phải lấp bằng số score 0 sẽ bỏ qua.`
            });
            const positiveScoreCount = builtMethod.numberScores.filter(item => Number(item.score) > 0).length;
            if (positiveScoreCount < method.targetExcluded) {
                builtMethod.forceSkip = true;
                builtMethod.skipReason = `Chỉ có ${positiveScoreCount}/${method.targetExcluded} số loại có edge dương; bỏ qua để không ép loại số thiếu bằng chứng.`;
            }
        } else if (['avgDropoffHold', 'avgEdge25Hold', 'avgEdge50Hold', 'avgEdge75Hold'].includes(method.type)) {
            if (!averageDropoffCandidates) {
                averageDropoffCandidates = buildCandidateList(quickStats, { minDropOffRate: 0 });
            }
            builtMethod = buildAverageDropoffPerNumberMethod(averageDropoffCandidates, method.targetExcluded, {
                id: method.id,
                name: method.name,
                baselineWeight: method.baselineWeight,
                description: method.baselineWeight > 0
                    ? `${method.name}; điểm = dropoff trừ ${Math.round(method.baselineWeight * 100)}% xác suất nền theo độ rộng tập số.`
                    : undefined
            });
        } else if (method.type === 'dedupDropoffHold') {
            if (!averageDropoffCandidates) {
                averageDropoffCandidates = buildCandidateList(quickStats, { minDropOffRate: 0 });
            }
            builtMethod = buildDeduplicatedAverageDropoffMethod(averageDropoffCandidates, method.targetExcluded, {
                id: method.id,
                name: method.name,
                description: `${method.name}; mỗi tập số chỉ đóng góp một lần dù có nhiều pattern trùng nhau.`
            });
        } else if (['dedupEdgeHold', 'dedupEdge25Hold', 'dedupEdge50Hold', 'dedupEdge75Hold'].includes(method.type)) {
            if (!averageDropoffCandidates) {
                averageDropoffCandidates = buildCandidateList(quickStats, { minDropOffRate: 0 });
            }
            builtMethod = buildDeduplicatedEdgeMethod(averageDropoffCandidates, method.targetExcluded, {
                id: method.id,
                name: method.name,
                description: `${method.name}; điểm = dropoff lịch sử trừ ${Math.round(Number(method.baselineWeight ?? 1) * 100)}% xác suất nền theo độ rộng tập số.`,
                baselineWeight: method.baselineWeight
            });
        } else if (method.type === 'chainSmallFirstHold') {
            builtMethod = buildChainSmallFirstMethod(averageDropoffCandidates || candidates, method.targetExcluded, {
                id: method.id,
                name: method.name
            });
        } else if (method.type === 'deParallelBlock85Small65Hold') {
            builtMethod = buildDeParallelBlock85Small65Method(averageDropoffCandidates || candidates, method.targetExcluded, {
                id: method.id,
                name: method.name,
                predictionDate: runtimeOptions.predictionDate,
                strictPointInTime: runtimeOptions.strictPointInTime === true
            });
        } else if (method.type === 'deParallelDedupEdge75DropoffHold') {
            if (!averageDropoffCandidates) {
                averageDropoffCandidates = buildCandidateList(quickStats, { minDropOffRate: 0 });
            }
            builtMethod = buildDeParallelDedupEdge75DropoffMethod(
                averageDropoffCandidates,
                method.targetExcluded,
                {
                    id: method.id,
                    name: method.name
                }
            );
        } else if (method.type === 'chainBlockFirstHold') {
            builtMethod = buildChainBlockFirstMethod(averageDropoffCandidates || candidates, method.targetExcluded, {
                id: method.id,
                name: method.name
            });
        } else if (method.type === 'dedupEdge50CombinedHold') {
            if (!averageDropoffCandidates) {
                averageDropoffCandidates = buildCandidateList(quickStats, { minDropOffRate: 0 });
            }
            builtMethod = buildDeduplicatedEdgeCombinedMethod(averageDropoffCandidates, method.targetExcluded, {
                id: method.id,
                name: method.name,
                baselineWeight: 0.5,
                blockBoost: method.blockBoost,
                smallBoost: method.smallBoost
            });
        } else if (method.type === 'dedupEdge50CombinedHoldCustom') {
            if (!averageDropoffCandidates) {
                averageDropoffCandidates = buildCandidateList(quickStats, { minDropOffRate: 0 });
            }
            builtMethod = buildDeduplicatedEdgeCombinedMethod(averageDropoffCandidates, method.targetExcluded, {
                id: method.id,
                name: method.name,
                baselineWeight: 0.5,
                blockBoost: method.blockBoost,
                smallBoost: method.smallBoost
            });
        } else if (method.type === 'ensembleCombinedHold') {
            if (!averageDropoffCandidates) {
                averageDropoffCandidates = buildCandidateList(quickStats, { minDropOffRate: 0 });
            }
            builtMethod = buildEnsembleCombinedMethod(averageDropoffCandidates, method.targetExcluded, {
                id: method.id,
                name: method.name
            });
        } else if (method.type === 'bayesHold') {
            builtMethod = buildBayesianLogOddsMethod(candidates, {
                targetExcluded: method.targetExcluded,
                id: method.id,
                name: method.name,
                description: `Bayesian shrinkage về xác suất nền, đổi sang log-odds lift rồi cộng điểm từng số; loại ${method.targetExcluded} số và đánh ${100 - method.targetExcluded} số còn lại.`
            });
        } else {
            builtMethod = buildChainOrderHoldMethod(
                candidates,
                totalYears,
                method.sortBy || 'risk',
                { ...customOptions, targetExcluded: method.targetExcluded }
            );
        }
        builtMethod = {
            ...builtMethod,
            id: method.id,
            name: method.name
        };
        evaluated[method.id] = evaluateMethod(
            builtMethod,
            actualNumber,
            detailOptions
        );
    }
    return evaluated;
}


async function buildNextPrediction(sortedData, options = {}) {
    if (!Array.isArray(sortedData) || sortedData.length === 0) return null;
    const basisIndex = sortedData.length - 1;
    const basisDay = sortedData[basisIndex];
    const predictionDate = options.predictionDate || addDaysToRawDate(basisDay.date, 1);
    if (!predictionDate) return null;

    const strictPointInTime = options.strictPointInTime === true;
    const originalCaches = strictPointInTime ? {
        rawData: lotteryService.getRawData(),
        numberStats: lotteryService.getNumberStats(),
        headTailStats: lotteryService.getHeadTailStats(),
        sumDiffStats: lotteryService.getSumDiffStats()
    } : null;

    try {
        if (strictPointInTime) {
            const prefixStats = await generateStrictStatsForPrefix(sortedData);
            lotteryService.__setInMemoryCachesForBacktest({
                rawData: sortedData,
                ...prefixStats
            });
            historicalExclusionService.clearCache();
        }

        const totalYears = getHistoryYearsAtIndex(sortedData, basisIndex);
        let quickStats = options.forceComputeQuickStats || strictPointInTime
            ? null
            : await dataAccess.getQuickStatsFromCache();
        if (!quickStats || Object.keys(quickStats).length <= 1) {
            console.log('[buildNextPrediction] Cache miss for quick_stats, computing fast...');
            quickStats = historicalExclusionService.computeQuickStatsForDateFast(predictionDate, totalYears, {
                useFullHistoryStats: !strictPointInTime
            });
        }
        const customOptions = normalizeCustomOptions(options);
        const playMode = normalizePlayMode(options.playMode);
        const betWinMultiplier = normalizeBetWinMultiplier(options.betWinMultiplier ?? options.winMultiplier);
        const betWinFactor = normalizeBetWinFactor(options.betWinFactor);
        const holdWinMultiplier = normalizeHoldWinMultiplier(options.holdWinMultiplier);
        const candidates = buildCandidateList(quickStats, customOptions);

        return {
            predictionDate,
            basisDate: formatRawDate(basisDay.date),
            basisIsoDate: formatIsoDate(basisDay.date),
            candidatesCount: candidates.length,
            methods: await buildEvaluatedMethods(quickStats, candidates, null, customOptions, totalYears, {
                compactDetails: !!options.compactDetails,
                selectedStreakDetailLimit: options.selectedStreakDetailLimit,
                historyData: sortedData,
                methodFilter: normalizeMethodFilter(options.methodIds ?? options.methods),
                playMode,
                betWinMultiplier,
                betWinFactor,
                holdWinMultiplier,
                predictionDate,
                strictPointInTime
            })
        };
    } finally {
        if (strictPointInTime && originalCaches) {
            lotteryService.__setInMemoryCachesForBacktest(originalCaches);
            historicalExclusionService.clearCache();
        }
    }
}

async function buildNextBetNumberPrediction(options = {}) {
    await ensureLotteryLoaded();

    const rawData = lotteryService.getRawData();
    const sortedData = getSortedLotteryData(rawData);
    if (!Array.isArray(sortedData) || sortedData.length === 0) {
        return { error: 'Không đủ dữ liệu xổ số để sinh dự đoán.' };
    }

    const strategy = String(options.strategy || options.source || 'risk').trim().toLowerCase();
    const methodPrefix = strategy === 'bayes' || strategy === 'bayesian'
        ? 'bayesHold'
        : (strategy === 'edge' ? 'edgeHold' : 'riskHold');
    const normalizedStrategy = methodPrefix === 'bayesHold'
        ? 'bayes'
        : (methodPrefix === 'edgeHold' ? 'edge' : 'risk');
    const defaultCounts = normalizedStrategy === 'risk' ? [10, 20, 30, 40] : [1, 2, 3, 4, 5];
    const countsInput = Array.isArray(options.counts) && options.counts.length > 0
        ? options.counts
        : defaultCounts;
    const counts = [...new Set(countsInput
        .map(value => parseInt(value, 10))
        .filter(value => Number.isInteger(value) && value >= 1 && value <= 40))]
        .sort((a, b) => a - b);

    if (counts.length === 0) {
        return { error: 'count chỉ hỗ trợ các giá trị từ 1 đến 40 hoặc all.' };
    }

    const methodIds = counts.map(count => `${methodPrefix}${100 - count}`);
    const nextPrediction = await buildNextPrediction(sortedData, {
        ...options,
        playMode: 'bet',
        methodIds,
        compactDetails: true,
        selectedStreakDetailLimit: Number.isFinite(Number(options.selectedStreakDetailLimit))
            ? Number(options.selectedStreakDetailLimit)
            : 12
    });
    if (!nextPrediction || !nextPrediction.methods) {
        return { error: 'Không sinh được dự đoán ngày tiếp theo.' };
    }

    const predictions = {};
    counts.forEach(count => {
        const methodId = `${methodPrefix}${100 - count}`;
        const method = nextPrediction.methods[methodId];
        if (!method) return;
        predictions[String(count)] = {
            count,
            methodId,
            methodName: method.name,
            betNumbers: normalizeNumberList(method.rawBetNumbers || method.betNumbers).map(formatNumber),
            excludedNumbers: normalizeNumberList(method.excluded).map(formatNumber),
            betCount: method.rawBetCount ?? method.betCount,
            excludedCount: method.excludedCount,
            skipped: !!method.skipped,
            skipReason: method.skipReason || '',
            selectedChainCount: method.selectedStreakCount || 0,
            selectedChains: (method.selectedStreaks || []).map(item => ({
                key: item.key,
                title: item.title,
                streak: item.streak,
                maxStreak: item.maxStreak,
                riskPercent: item.dropOffPercent ?? item.riskPercent ?? null,
                priority: item.exclusionPriority ?? null,
                frequencyPerYear: item.frequencyPerYear ?? item.formFrequencyPerYear ?? null,
                numbers: normalizeNumberList(item.numbers).map(formatNumber),
                reason: item.reason || ''
            }))
        };
    });

    return {
        generatedAt: new Date().toISOString(),
        dataDate: nextPrediction.basisDate,
        dataIsoDate: nextPrediction.basisIsoDate,
        predictionDate: nextPrediction.predictionDate,
        counts,
        candidatesCount: nextPrediction.candidatesCount,
        config: {
            methodVersion: SIMULATION_METHOD_VERSION,
            source: `simulation.${methodPrefix}`,
            strategy: normalizedStrategy,
            supportedCounts: normalizedStrategy === 'risk' ? [10, 20, 30, 40] : [1, 2, 3, 4, 5],
            supportedCountRange: [1, 40],
            moneyUnit: 'K VND'
        },
        predictions
    };
}

async function ensureLotteryLoaded() {
    if (!lotteryService.getRawData() || lotteryService.getRawData().length === 0) {
        await lotteryService.loadRawData();
    }
    if (!lotteryService.getNumberStats() || !lotteryService.getHeadTailStats() || !lotteryService.getSumDiffStats()) {
        await lotteryService.loadStats();
    }
}

async function runBacktest(days = DEFAULT_DAYS, inputData = null, options = {}) {
    await ensureLotteryLoaded();

    const rawData = inputData || lotteryService.getRawData();
    const sortedData = getSortedLotteryData(rawData);
    const requestedDays = parseInt(days, 10) || DEFAULT_DAYS;
    let effectiveDays = Math.max(1, Math.min(requestedDays, sortedData.length - 1));
    const customOptions = normalizeCustomOptions(options);
    const playMode = normalizePlayMode(options.playMode);
    const betWinMultiplier = normalizeBetWinMultiplier(options.betWinMultiplier ?? options.winMultiplier);
    const betWinFactor = normalizeBetWinFactor(options.betWinFactor);
    const holdWinMultiplier = normalizeHoldWinMultiplier(options.holdWinMultiplier);
    const compactDetails = parseBooleanOption(options.compactDetails ?? options.compact, effectiveDays > 90);
    const methodFilter = normalizeMethodFilter(options.methodIds ?? options.methods);
    // Strict PIT is the default. The legacy fast path remains available only
    // when explicitly requested for exploratory diagnostics.
    const strictPointInTime = parseBooleanOption(
        options.strictPointInTime ?? options.strictPIT,
        true
    );
    const rollingHistory = parseBooleanOption(options.rollingHistory ?? options.rolling, false) || strictPointInTime;
    const onlyThresholdMethod = methodFilter &&
        methodFilter.size === 1 &&
        methodFilter.has('dropoff85') &&
        !customOptions.excludeFixedThreeValueGroups;
    // Backtest depends on daily-updated static data and scoring logic. Recompute to avoid stale
    // method results after a data refresh or hot reload.
    const cacheKey = null;

    if (sortedData.length < 2) {
        return { error: 'Không đủ dữ liệu để chạy simulation.' };
    }
    if (cacheKey && _backtestCache.has(cacheKey)) {
        return _backtestCache.get(cacheKey);
    }

    const details = [];
    const runningSummaries = {};
    let latestCandidates = [];
    let startIndex = sortedData.length - effectiveDays;
    let endIndexExclusive = sortedData.length;
    if (Number.isFinite(Number(options.startIndex)) || Number.isFinite(Number(options.endIndexExclusive))) {
        const requestedStart = Number.isFinite(Number(options.startIndex)) ? Number(options.startIndex) : startIndex;
        const requestedEnd = Number.isFinite(Number(options.endIndexExclusive)) ? Number(options.endIndexExclusive) : endIndexExclusive;
        startIndex = Math.max(1, Math.min(sortedData.length - 1, Math.floor(requestedStart)));
        endIndexExclusive = Math.max(startIndex + 1, Math.min(sortedData.length, Math.floor(requestedEnd)));
        effectiveDays = endIndexExclusive - startIndex;
    }
    const fullHistoryYears = getHistoryYearsAtIndex(sortedData, sortedData.length - 1);
    const originalBacktestCaches = {
        rawData: sortedData,
        numberStats: lotteryService.getNumberStats(),
        headTailStats: lotteryService.getHeadTailStats(),
        sumDiffStats: lotteryService.getSumDiffStats()
    };
    const clearHistoryCacheInterval = Math.max(50, Number(options.clearHistoryCacheInterval || process.env.BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL || 120));
    const showProgress = process.env.BACKTEST_PROGRESS === '1' || options.progress === true;
    if (historicalExclusionService.clearStaticHistoryCaches) {
        historicalExclusionService.clearStaticHistoryCaches();
    }

    for (let actualIndex = startIndex; actualIndex < endIndexExclusive; actualIndex++) {
        const loopOffset = actualIndex - startIndex;
        if (options.debugMemory) {
            if (historicalExclusionService.clearStaticHistoryCaches) {
                historicalExclusionService.clearStaticHistoryCaches();
            }
            if (global.gc) {
                global.gc();
            }
            console.log(`[MemDebug] Day ${loopOffset}: Heap = ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
        } else if (loopOffset > 0 && loopOffset % clearHistoryCacheInterval === 0) {
            if (historicalExclusionService.clearStaticHistoryCaches) {
                historicalExclusionService.clearStaticHistoryCaches();
            }
            if (global.gc) {
                global.gc();
            }
        }
        if (showProgress && loopOffset > 0 && loopOffset % 500 === 0) {
            console.log(`[Backtest] ${loopOffset}/${effectiveDays} days processed`);
        }
        const actualDay = sortedData[actualIndex];
        const basisDay = sortedData[actualIndex - 1];
        if (!actualDay || !basisDay) continue;

        const predictionDate = formatRawDate(actualDay.date);
        const basisDate = formatRawDate(basisDay.date);
        const actualNumber = normalizeNumber(actualDay.special);
        const totalYears = rollingHistory
            ? getHistoryYearsAtIndex(sortedData, actualIndex - 1)
            : fullHistoryYears;
        if (strictPointInTime) {
            const prefixRaw = sortedData.slice(0, actualIndex);
            const prefixStats = await generateStrictStatsForPrefix(prefixRaw);
            lotteryService.__setInMemoryCachesForBacktest({
                rawData: prefixRaw,
                ...prefixStats
            });
            historicalExclusionService.clearCache();
        }

        const quickStats = historicalExclusionService.computeQuickStatsForDateFast(predictionDate, totalYears, {
            useFullHistoryStats: !rollingHistory
        });
        const candidates = onlyThresholdMethod ? [] : buildCandidateList(quickStats, customOptions);
        latestCandidates = candidates;

        const methods = await buildEvaluatedMethods(quickStats, candidates, actualNumber, customOptions, totalYears, {
            compactDetails,
            selectedStreakDetailLimit: options.selectedStreakDetailLimit,
            historyData: sortedData.slice(0, actualIndex),
            methodFilter,
            playMode,
            betWinMultiplier,
            betWinFactor,
            holdWinMultiplier,
            predictionDate,
            strictPointInTime
        });

        if (options.discardDetails || options.summaryOnly) {
            const methodsList = buildMethodDefinitions(customOptions, methodFilter)
                .filter(method => methodFilterAllows(methodFilter, method.id));
            for (const method of methodsList) {
                if (!runningSummaries[method.id]) {
                    runningSummaries[method.id] = {
                        totalDays: 0, playedDays: 0, skippedDays: 0, wins: 0, losses: 0,
                        totalStake: 0, totalPayout: 0, totalProfit: 0, totalBetProfit: 0, totalHoldProfit: 0,
                        excludedCounts: [], betCounts: []
                    };
                }
                const methodResult = methods[method.id];
                if (methodResult) {
                    const s = runningSummaries[method.id];
                    s.totalDays++;
                    if (methodResult.skipped) {
                        s.skippedDays++;
                    } else {
                        s.playedDays++;
                        if (methodResult.profit > 0) s.wins++;
                        if (methodResult.profit < 0) s.losses++;
                        s.totalStake += methodResult.stake;
                        s.totalPayout += methodResult.payout;
                        s.totalProfit += methodResult.profit;
                        s.totalBetProfit += (methodResult.betProfit || 0);
                        s.totalHoldProfit += (methodResult.holdProfit || 0);
                        s.excludedCounts.push(methodResult.excludedCount);
                        s.betCounts.push(methodResult.betCount);
                        if (options.keepDailyProfits) {
                            if (!s.dailyResults) s.dailyResults = [];
                            s.dailyResults.push({
                                date: predictionDate,
                                hit: methodResult.hit,
                                miss: methodResult.miss,
                                profit: methodResult.profit,
                                stake: methodResult.stake
                            });
                        }
                    }
                }
            }
        } else {
            details.push({
                predictionDate,
                predictionIsoDate: formatIsoDate(actualDay.date),
                basisDate,
                actualNumber,
                actualNumberText: actualNumber !== null ? formatNumber(actualNumber) : '',
                candidatesCount: candidates.length,
                methods
            });
        }
    }

    // Strict iterations temporarily install a prefix cache. Restore the full
    // current cache before building informational nextPrediction data.
    if (strictPointInTime) {
        lotteryService.__setInMemoryCachesForBacktest(originalBacktestCaches);
        historicalExclusionService.clearCache();
    }

    const methods = buildMethodDefinitions(customOptions, methodFilter)
        .filter(method => methodFilterAllows(methodFilter, method.id));
    
    let summary;
    if (options.discardDetails || options.summaryOnly) {
        summary = Object.fromEntries(methods.map(method => {
            const s = runningSummaries[method.id] || {
                totalDays: 0, playedDays: 0, skippedDays: 0, wins: 0, losses: 0,
                totalStake: 0, totalPayout: 0, totalProfit: 0, totalBetProfit: 0, totalHoldProfit: 0,
                excludedCounts: [], betCounts: []
            };
            return [
                method.id,
                {
                    totalDays: s.totalDays,
                    playedDays: s.playedDays,
                    skippedDays: s.skippedDays,
                    wins: s.wins,
                    losses: s.losses,
                    hitRate: s.playedDays > 0 ? s.wins / s.playedDays : 0,
                    missRate: s.playedDays > 0 ? s.losses / s.playedDays : 0,
                    totalStake: formatMoneyK(s.totalStake),
                    totalPayout: formatMoneyK(s.totalPayout),
                    totalProfit: formatMoneyK(s.totalProfit),
                    totalBetProfit: formatMoneyK(s.totalBetProfit),
                    totalHoldProfit: formatMoneyK(s.totalHoldProfit),
                    averageExcluded: s.excludedCounts.length > 0
                        ? Math.round((s.excludedCounts.reduce((sum, count) => sum + count, 0) / s.excludedCounts.length) * 10) / 10
                        : 0,
                    averageBetCount: s.betCounts.length > 0
                        ? Math.round((s.betCounts.reduce((sum, count) => sum + count, 0) / s.betCounts.length) * 10) / 10
                        : 0,
                    dailyResults: options.keepDailyProfits ? s.dailyResults : undefined
                }
            ];
        }));
    } else {
        summary = Object.fromEntries(methods.map(method => [
            method.id,
            summarizeMethod(details, method.id)
        ]));
    }

    const result = {
        generatedAt: new Date().toISOString(),
        config: {
            requestedDays,
            effectiveDays,
            betPerNumber: BET_PER_NUMBER,
            winMultiplier: WIN_MULTIPLIER,
            dropOffThreshold: DROP_OFF_THRESHOLD,
            priorityThreshold: PRIORITY_THRESHOLD,
            minExcludedToPlay: MIN_EXCLUDED_TO_PLAY,
            rankedTargetMin: RANKED_TARGET_MIN,
            rankedTargetMax: RANKED_TARGET_MAX,
            combinedTargetMin: COMBINED_TARGET_MIN,
            combinedTargetMax: COMBINED_TARGET_MAX,
            chainFrequencyProtectedCount: CHAIN_FREQUENCY_PROTECTED_COUNT,
            edgePerNumberTargetExcluded: EDGE_PER_NUMBER_TARGET_EXCLUDED,
            edgePerNumberTargetExcluded2: EDGE_PER_NUMBER_TARGET_EXCLUDED_2,
            bayesLogOddsAlpha: BAYES_LOG_ODDS_ALPHA,
            bayesLogOddsAlphaStable: BAYES_LOG_ODDS_ALPHA_STABLE,
            bayesLogOddsTargetExcluded2: BAYES_LOG_ODDS_TARGET_EXCLUDED_2,
            bayesLogOddsTargetExcluded3: BAYES_LOG_ODDS_TARGET_EXCLUDED_3,
            bayesLogOddsTargetExcluded5: BAYES_LOG_ODDS_TARGET_EXCLUDED_5,
            maxPotentialFormationCount: MAX_POTENTIAL_FORMATION_COUNT,
            maxPotentialFormationPerYear: MAX_POTENTIAL_FREQUENCY_PER_YEAR,
            highFrequencyLimitPerYear: HIGH_FREQUENCY_LIMIT_PER_YEAR,
            methodIds: methodFilter ? [...methodFilter] : null,
            playMode,
            playModeLabel: PLAY_MODE_LABELS[playMode],
            betWinMultiplier,
            betWinFactor,
            holdWinMultiplier,
            compactDetails,
            customOptions,
            methodVersion: SIMULATION_METHOD_VERSION,
            pointInTime: {
                rollingHistory,
                strict: strictPointInTime,
                dailyState: strictPointInTime
                    ? 'strict-prefix-regenerated-before-each-prediction'
                    : (rollingHistory
                        ? 'fast-full-history-index-filtered-by-date'
                        : 'full-history'),
                eligibleForPromotion: false,
                warning: strictPointInTime
                    ? 'Mỗi ngày tái sinh stats/index từ dữ liệu trước ngày dự đoán; không dùng full-history index.'
                    : (rollingHistory
                        ? 'Đường nhanh lọc theo ngày nhưng vẫn dùng index sinh từ toàn bộ stats; chỉ dùng thăm dò.'
                        : 'Backtest dùng toàn bộ lịch sử, không phải point-in-time.')
            },
            moneyUnit: 'K VND'
        },
        methods,
        nextPrediction: await buildNextPrediction(sortedData, {
            ...customOptions,
            playMode,
            betWinMultiplier,
            holdWinMultiplier,
            methodIds: methodFilter ? [...methodFilter] : null,
            compactDetails,
            selectedStreakDetailLimit: options.selectedStreakDetailLimit,
            strictPointInTime
        }),
        summary,
        reliability: buildReliabilityReport(latestCandidates, sortedData),
        details: details.slice().reverse()
    };
    if (cacheKey) _backtestCache.set(cacheKey, result);
    return result;
}

async function runProgressiveSimulation(options = {}, lotteryData = null) {
    const days = options.simulationDays || options.days || DEFAULT_DAYS;
    return runBacktest(days, lotteryData, options);
}

async function runSimulation(options = {}, lotteryData = null) {
    const days = options.days || options.simulationDays || DEFAULT_DAYS;
    return runBacktest(days, lotteryData, options);
}

module.exports = {
    BET_PER_NUMBER,
    WIN_MULTIPLIER,
    DROP_OFF_THRESHOLD,
    PRIORITY_THRESHOLD,
    MIN_EXCLUDED_TO_PLAY,
    RANKED_TARGET_MIN,
    RANKED_TARGET_MAX,
    COMBINED_TARGET_MIN,
    COMBINED_TARGET_MAX,
    CHAIN_FREQUENCY_TARGET_BET,
    CHAIN_FREQUENCY_PROTECTED_COUNT,
    EDGE_PER_NUMBER_TARGET_EXCLUDED,
    EDGE_PER_NUMBER_TARGET_EXCLUDED_2,
    BAYES_LOG_ODDS_ALPHA,
    BAYES_LOG_ODDS_ALPHA_STABLE,
    BAYES_LOG_ODDS_TARGET_EXCLUDED_2,
    BAYES_LOG_ODDS_TARGET_EXCLUDED_3,
    BAYES_LOG_ODDS_TARGET_EXCLUDED_5,
    SIMULATION_METHOD_VERSION,
    CUSTOM_DEFAULTS,
    MAX_POTENTIAL_FORMATION_COUNT,
    MAX_POTENTIAL_FREQUENCY_PER_YEAR,
    HIGH_FREQUENCY_LIMIT_PER_YEAR,
    isDefaultCustomOptions,
    calculateBetAmount,
    calculateWinLoss,
    buildDeParallelBlock85Small65Method,
    buildNextPrediction,
    buildNextBetNumberPrediction,
    runBacktest,
    runCombinedRisk25YearlyReport,
    runChainFrequencyAnalysis,
    runModernExclusionSearchReport,
    runProgressiveSimulation,
    runSimulation
};
