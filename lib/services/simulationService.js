// services/simulationService.js
//
// Simulation mới đo các chiến lược loại trừ dựa trên cùng nguồn dự đoán
// với "Tổng hợp dự đoán" / "Số Đánh & Loại Trừ".

const lotteryService = require('./lotteryService');
const exclusionLogic = require('./exclusionLogicService');
const historicalExclusionService = require('./historicalExclusionService');

const BET_PER_NUMBER = 10; // 10.000 VND
const WIN_MULTIPLIER = 70;
const DEFAULT_DAYS = 7;
const DROP_OFF_THRESHOLD = 0.85;
const PRIORITY_THRESHOLD = 85;
const MIN_EXCLUDED_TO_PLAY = 30;
const RANKED_TARGET_MIN = 60;
const RANKED_TARGET_MAX = 70;
const COMBINED_TARGET_MIN = 70;
const COMBINED_TARGET_MAX = 70;
const COMBINED_RISK_CAP = Number.POSITIVE_INFINITY;
const COMBINED_NUMBER_PENALTY = 0.45;
const CUSTOM_DEFAULTS = {
    minPriority: 85,
    minDropOffPercent: 85,
    maxFrequencyPerYear: 0,
    maxPotentialFrequencyPerYear: 1,
    minLowerBoundPercent: 0,
    minSampleSize: 0,
    targetExcluded: 70,
    requirePositiveEdge: false,
    includeFormed: true,
    includePotential: true
};
const ALL_NUMBERS = Array.from({ length: 100 }, (_, i) => i);

// Compatibility for dailyAnalysisService. Simulation itself uses fixed 10k.
const LEGACY_BASE_BET = 10;
const LEGACY_BET_STEP = 5;
const LEGACY_NUM_COUNT = 25;
const _backtestCache = new Map();

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
        includePotential: parseBooleanOption(source.includePotential, CUSTOM_DEFAULTS.includePotential)
    };
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
    const history = stat && stat.historyMetrics ? stat.historyMetrics : {};

    return {
        sampleSize,
        continuedCount,
        breakCount,
        lowerBound,
        lowerBoundPercent: Math.round(lowerBound * 1000) / 10,
        occurrences: Number(history.occurrences || 0),
        avgLength: roundOne(history.avgLength),
        avgGapDays: roundOne(history.avgGapDays),
        latestEndDate: history.latestEndDate || '',
        daysSinceLatestEnd: history.daysSinceLatestEnd === null || history.daysSinceLatestEnd === undefined
            ? null
            : Number(history.daysSinceLatestEnd)
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

function buildCandidateList(quickStats) {
    const all = exclusionLogic.getDropOffExclusions(quickStats, { minPriority: 0 });
    return (all.explanations || [])
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
        })
        .sort((a, b) => {
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

function buildThresholdMethod(candidates) {
    const selected = candidates.filter(item => (item.exclusionPriority || 0) >= PRIORITY_THRESHOLD);
    const excluded = new Set();
    selected.forEach(item => item.numbers.forEach(num => excluded.add(num)));

    return {
        id: 'dropoff85',
        name: 'Ưu tiên loại >= 85',
        description: 'Loại trừ chuỗi đã hình thành theo tỷ lệ gãy và chuỗi sắp hình thành theo tỷ lệ không hình thành, cùng điểm ưu tiên >= 85.',
        selectedStreaks: selected,
        excluded: [...excluded].sort((a, b) => a - b)
    };
}

function buildEdgeThresholdMethod(candidates) {
    const selected = candidates.filter(item => {
        const qualifiesByPriority = (item.exclusionPriority || 0) >= PRIORITY_THRESHOLD;
        return qualifiesByPriority && item.edge > 0;
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
            if ((item.exclusionPriority || 0) < options.minPriority) return false;
            if ((item.dropOffRate || 0) < minDropOff) return false;
            if ((item.lowerBound || 0) < minLowerBound) return false;
            if ((item.sampleSize || 0) < options.minSampleSize) return false;
            if (options.requirePositiveEdge && (item.edge || 0) <= 0) return false;

            const frequencyPerYear = getCandidateFrequencyPerYear(item, totalYears);
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
        : 'không giới hạn tần suất tiềm năng';

    return {
        id: 'customExclusion',
        name: 'Custom loại trừ',
        description: `Tuỳ chỉnh theo ưu tiên >= ${options.minPriority}, dropoff/không HT >= ${options.minDropOffPercent}%, lower >= ${options.minLowerBoundPercent}%, mẫu >= ${options.minSampleSize}, ${frequencyText}, ${potentialText}, target loại ${options.targetExcluded || 'không giới hạn'} số.`,
        selectedStreaks: selected,
        excluded: [...excluded].sort((a, b) => a - b),
        customOptions: options
    };
}

function compareCombinedCandidates(a, b) {
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
    const byNumber = new Map(ALL_NUMBERS.map(number => [number, {
        number,
        riskScore: 0,
        rawRiskScore: 0,
        supportScore: 0,
        supportCount: 0,
        contributors: []
    }]));

    for (const item of candidates) {
        if ((item.exclusionPriority || 0) < PRIORITY_THRESHOLD) continue;
        if ((item.sampleSize || 0) <= 0 || (item.dropOffRate || 0) <= 0 || (item.lowerBound || 0) <= 0) continue;

        const rawRiskScore = getCombinedNumberRiskScore(item);
        if (!Number.isFinite(rawRiskScore) || rawRiskScore <= 0) continue;

        const cappedRiskScore = Math.min(rawRiskScore, COMBINED_RISK_CAP);
        for (const number of item.numbers || []) {
            const row = byNumber.get(number);
            if (!row) continue;
            if (cappedRiskScore > row.riskScore) row.riskScore = cappedRiskScore;
            if (rawRiskScore > row.rawRiskScore) row.rawRiskScore = rawRiskScore;
            row.supportScore += rawRiskScore;
            row.supportCount += 1;
            row.contributors.push({ item, riskScore: rawRiskScore });
        }
    }

    const rankedNumbers = Array.from(byNumber.values())
        .sort((a, b) => {
            if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
            return a.number - b.number;
        });

    const selectedNumberRows = rankedNumbers.slice(0, COMBINED_TARGET_MIN);
    const selectedMap = new Map();
    for (const row of selectedNumberRows) {
        row.contributors
            .slice()
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 5)
            .forEach(({ item, riskScore }) => {
                if (!selectedMap.has(item.key)) {
                    selectedMap.set(item.key, {
                        ...item,
                        addedNumbersCount: 0,
                        numberRiskScore: roundOne(riskScore * 100),
                        numberSupportCount: 0,
                        numberSupportScore: 0
                    });
                }
                const selected = selectedMap.get(item.key);
                selected.addedNumbersCount += 1;
                selected.numberSupportCount += 1;
                selected.numberSupportScore += riskScore;
                selected.numberRiskScore = Math.max(selected.numberRiskScore || 0, roundOne(riskScore * 100) || 0);
            });
    }

    const selectedStreaks = Array.from(selectedMap.values())
        .map(item => ({
            ...item,
            numberSupportScore: roundOne((item.numberSupportScore || 0) * 100)
        }))
        .sort((a, b) => {
            if ((b.addedNumbersCount || 0) !== (a.addedNumbersCount || 0)) {
                return (b.addedNumbersCount || 0) - (a.addedNumbersCount || 0);
            }
            if ((b.numberRiskScore || 0) !== (a.numberRiskScore || 0)) {
                return (b.numberRiskScore || 0) - (a.numberRiskScore || 0);
            }
            return compareCombinedCandidates(a, b);
        })
        .slice(0, 80);

    return {
        id: 'combined20to30',
        name: 'Tổng hợp rủi ro 30 số đánh',
        description: 'Chấm điểm rủi ro theo từng số từ ưu tiên loại, dropoff/không hình thành, tin cậy, mẫu, Wilson lower, TB dài, TB cách, gần nhất và edge; loại 70 số rủi ro nhất để còn 30 số đánh.',
        selectedStreaks,
        excluded: selectedNumberRows.map(item => item.number).sort((a, b) => a - b)
    };
}

function evaluateMethod(method, actualNumber) {
    const excluded = normalizeNumberList(method.excluded);
    const excludedSet = new Set(excluded);
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
    const skipped = excludedCount < MIN_EXCLUDED_TO_PLAY || rawBetCount <= 0;
    const betNumbers = skipped ? [] : ALL_NUMBERS.filter(num => !excludedSet.has(num));
    const betCount = betNumbers.length;
    const actualExcluded = hasActualNumber && excludedSet.has(actualNumber);
    const hit = hasActualNumber && !skipped && !actualExcluded;
    const miss = hasActualNumber && !skipped && actualExcluded;
    const stake = skipped ? 0 : betCount * BET_PER_NUMBER;
    const payout = hit ? BET_PER_NUMBER * WIN_MULTIPLIER : 0;
    const profit = hasActualNumber && !skipped ? payout - stake : 0;

    return {
        id: method.id,
        name: method.name,
        description: method.description,
        skipped,
        skipReason: skipped
            ? (rawBetCount <= 0
                ? 'Loại trừ hết 100 số, không còn số đánh nên bỏ qua.'
                : `Loại trừ ${excludedCount} số, dưới ngưỡng ${MIN_EXCLUDED_TO_PLAY} số nên bỏ qua.`)
            : '',
        hit,
        miss,
        actualExcluded,
        excluded,
        excludedCount,
        betNumbers,
        betCount,
        selectedStreaks: method.selectedStreaks.map(item => ({
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
            sampleSize: item.sampleSize,
            continuedCount: item.continuedCount,
            breakCount: item.breakCount,
            lowerBound: item.lowerBound,
            lowerBoundPercent: item.lowerBoundPercent,
            avgLength: item.avgLength,
            avgGapDays: item.avgGapDays,
            daysSinceLatestEnd: item.daysSinceLatestEnd,
            latestEndDate: item.latestEndDate,
            sampleScore: item.sampleScore,
            recencyScore: item.recencyScore,
            gapTimingScore: item.gapTimingScore,
            avgLengthScore: item.avgLengthScore,
            edgeScore: item.edgeScore,
            numberRiskScore: item.numberRiskScore,
            numberSupportScore: item.numberSupportScore,
            numberSupportCount: item.numberSupportCount,
            frequencyPerYear: item.frequencyPerYear,
            formFrequencyPerYear: item.formFrequencyPerYear,
            isPotential: !!item.isPotential,
            numbersCount: item.numbers.length,
            addedNumbersCount: item.addedNumbersCount,
            numbers: item.numbers,
            reason: item.reason
        })),
        customOptions: method.customOptions,
        selectedStreakCount: method.selectedStreaks.length,
        selectedNumbersRawCount,
        selectedNumbersUnionCount: selectedNumbersUnion.size,
        duplicateNumbersCount: Math.max(0, selectedNumbersRawCount - selectedNumbersUnion.size),
        stake: formatMoneyK(stake),
        payout: formatMoneyK(payout),
        profit: formatMoneyK(profit)
    };
}

function summarizeMethod(details, methodId) {
    const methodResults = details
        .map(day => day.methods[methodId])
        .filter(Boolean);
    const played = methodResults.filter(item => !item.skipped);
    const wins = played.filter(item => item.hit).length;
    const losses = played.filter(item => item.miss).length;
    const totalStake = played.reduce((sum, item) => sum + item.stake, 0);
    const totalPayout = played.reduce((sum, item) => sum + item.payout, 0);
    const totalProfit = played.reduce((sum, item) => sum + item.profit, 0);
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
        averageExcluded: excludedCounts.length > 0
            ? Math.round((excludedCounts.reduce((sum, count) => sum + count, 0) / excludedCounts.length) * 10) / 10
            : 0,
        averageBetCount: betCounts.length > 0
            ? Math.round((betCounts.reduce((sum, count) => sum + count, 0) / betCounts.length) * 10) / 10
            : 0
    };
}

function buildMethodDefinitions(customOptions = {}) {
    const normalizedCustomOptions = normalizeCustomOptions(customOptions);
    return [
        {
            id: 'dropoff85',
            name: 'Ưu tiên loại >= 85',
            priorityThreshold: PRIORITY_THRESHOLD,
            threshold: DROP_OFF_THRESHOLD,
            minExcludedToPlay: MIN_EXCLUDED_TO_PLAY
        },
        {
            id: 'dropoff85Edge',
            name: 'Ưu tiên >= 85 + Edge dương',
            priorityThreshold: PRIORITY_THRESHOLD,
            threshold: DROP_OFF_THRESHOLD,
            minExcludedToPlay: MIN_EXCLUDED_TO_PLAY
        },
        {
            id: 'ranked60to70',
            name: 'Xếp hạng ưu tiên loại 60-70 số',
            priorityThreshold: PRIORITY_THRESHOLD,
            targetMin: RANKED_TARGET_MIN,
            targetMax: RANKED_TARGET_MAX,
            minExcludedToPlay: MIN_EXCLUDED_TO_PLAY
        },
        {
            id: 'combined20to30',
            name: 'Tổng hợp rủi ro 30 số đánh',
            priorityThreshold: PRIORITY_THRESHOLD,
            targetMin: COMBINED_TARGET_MIN,
            targetMax: COMBINED_TARGET_MAX,
            minExcludedToPlay: MIN_EXCLUDED_TO_PLAY
        },
        {
            id: 'customExclusion',
            name: 'Custom loại trừ',
            customOptions: normalizedCustomOptions,
            minExcludedToPlay: MIN_EXCLUDED_TO_PLAY
        }
    ];
}

function buildEvaluatedMethods(candidates, actualNumber, options = {}, totalYears = 20) {
    const customOptions = normalizeCustomOptions(options);
    return {
        dropoff85: evaluateMethod(buildThresholdMethod(candidates), actualNumber),
        dropoff85Edge: evaluateMethod(buildEdgeThresholdMethod(candidates), actualNumber),
        ranked60to70: evaluateMethod(buildRankedMethod(candidates), actualNumber),
        combined20to30: evaluateMethod(buildCombinedReliabilityMethod(candidates), actualNumber),
        customExclusion: evaluateMethod(buildCustomExclusionMethod(candidates, customOptions, totalYears), actualNumber)
    };
}

function buildNextPrediction(sortedData, options = {}) {
    if (!Array.isArray(sortedData) || sortedData.length === 0) return null;
    const basisIndex = sortedData.length - 1;
    const basisDay = sortedData[basisIndex];
    const predictionDate = addDaysToRawDate(basisDay.date, 1);
    if (!predictionDate) return null;

    const totalYears = getHistoryYearsAtIndex(sortedData, basisIndex);
    const quickStats = historicalExclusionService.computeQuickStatsForDate(predictionDate, totalYears);
    const candidates = buildCandidateList(quickStats);

    return {
        predictionDate,
        basisDate: formatRawDate(basisDay.date),
        basisIsoDate: formatIsoDate(basisDay.date),
        candidatesCount: candidates.length,
        methods: buildEvaluatedMethods(candidates, null, options, totalYears)
    };
}

async function ensureLotteryLoaded() {
    if (!lotteryService.getRawData() || lotteryService.getRawData().length === 0) {
        await lotteryService.loadAll();
    }
}

async function runBacktest(days = DEFAULT_DAYS, inputData = null, options = {}) {
    await ensureLotteryLoaded();

    const rawData = inputData || lotteryService.getRawData();
    const sortedData = getSortedLotteryData(rawData);
    const requestedDays = parseInt(days, 10) || DEFAULT_DAYS;
    const effectiveDays = Math.max(1, Math.min(requestedDays, sortedData.length - 1));
    const latest = sortedData[sortedData.length - 1];
    const customOptions = normalizeCustomOptions(options);
    const cacheKey = inputData
        ? null
        : `${effectiveDays}|${latest ? latest.date : ''}|${latest ? latest.special : ''}|${JSON.stringify(customOptions)}`;

    if (sortedData.length < 2) {
        return { error: 'Không đủ dữ liệu để chạy simulation.' };
    }
    if (cacheKey && _backtestCache.has(cacheKey)) {
        return _backtestCache.get(cacheKey);
    }

    const details = [];
    let latestCandidates = [];
    const startIndex = sortedData.length - effectiveDays;

    for (let actualIndex = startIndex; actualIndex < sortedData.length; actualIndex++) {
        const actualDay = sortedData[actualIndex];
        const basisDay = sortedData[actualIndex - 1];
        if (!actualDay || !basisDay) continue;

        const predictionDate = formatRawDate(actualDay.date);
        const basisDate = formatRawDate(basisDay.date);
        const actualNumber = normalizeNumber(actualDay.special);
        const totalYears = getHistoryYearsAtIndex(sortedData, actualIndex - 1);
        const quickStats = historicalExclusionService.computeQuickStatsForDate(predictionDate, totalYears);
        const candidates = buildCandidateList(quickStats);
        latestCandidates = candidates;

        const methods = buildEvaluatedMethods(candidates, actualNumber, customOptions, totalYears);

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

    const methods = buildMethodDefinitions(customOptions);
    const summary = Object.fromEntries(methods.map(method => [
        method.id,
        summarizeMethod(details, method.id)
    ]));

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
            customOptions,
            moneyUnit: 'K VND'
        },
        methods,
        nextPrediction: buildNextPrediction(sortedData, customOptions),
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
    CUSTOM_DEFAULTS,
    calculateBetAmount,
    calculateWinLoss,
    runBacktest,
    runProgressiveSimulation,
    runSimulation
};
