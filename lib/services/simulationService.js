// services/simulationService.js
//
// Simulation mới đo các chiến lược loại trừ dựa trên cùng nguồn dự đoán
// với "Tổng hợp dự đoán" / "Số Đánh & Loại Trừ".

const lotteryService = require('./lotteryService');
const exclusionLogic = require('./exclusionLogicService');
const historicalExclusionService = require('./historicalExclusionService');
const lotteryScoring = require('../utils/lotteryScoring');

const BET_PER_NUMBER = 10; // 10.000 VND
const WIN_MULTIPLIER = 70;
const DEFAULT_DAYS = 7;
const DROP_OFF_THRESHOLD = 0.85;
const PRIORITY_THRESHOLD = 85;
const MIN_EXCLUDED_TO_PLAY = 30;
const HIT_RATE_TARGET_MIN = 40;
const HIT_RATE_TARGET_MAX = 50;
const RANKED_TARGET_MIN = 60;
const RANKED_TARGET_MAX = 70;
const COMBINED_TARGET_MIN = 70;
const COMBINED_TARGET_MAX = 70;
const COMBINED_RISK_CAP = Number.POSITIVE_INFINITY;
const COMBINED_NUMBER_PENALTY = 0.45;
const SCORING_PROTECTED_TARGET_BET = 30;
const SCORING_MIN_HISTORY_DAYS = 30;
const SCORING_FALLBACK_DAYS = 120;
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

function buildScoringRowsForBasisData(sortedData, basisIndex) {
    if (!Array.isArray(sortedData) || basisIndex < 0 || !sortedData[basisIndex]) return [];

    const basisDate = parseRawDate(sortedData[basisIndex].date);
    if (!basisDate) return [];

    const basisYear = basisDate.getFullYear();
    const basisIso = formatIsoDate(sortedData[basisIndex].date);
    const yearStartIso = `${basisYear}-01-01`;

    let scoringData = sortedData
        .slice(0, basisIndex + 1)
        .filter(item => {
            const itemIso = formatIsoDate(item.date);
            return itemIso >= yearStartIso && itemIso <= basisIso;
        });

    if (scoringData.length < SCORING_MIN_HISTORY_DAYS) {
        scoringData = sortedData.slice(Math.max(0, basisIndex - SCORING_FALLBACK_DAYS + 1), basisIndex + 1);
    }

    if (scoringData.length === 0) return [];

    const processedData = scoringData.map(item => ({
        date: formatIsoDate(item.date),
        numbers: item.special !== undefined && item.special !== null ? [item.special] : []
    }));

    const { results } = lotteryScoring.calculateAggregateScoreForAllNumbers(processedData);
    return (results || [])
        .slice()
        .sort((a, b) => {
            if ((b.totalScore || 0) !== (a.totalScore || 0)) return (b.totalScore || 0) - (a.totalScore || 0);
            return parseInt(a.number, 10) - parseInt(b.number, 10);
        })
        .map((item, index) => ({
            number: normalizeNumber(item.number),
            scoringRank: index + 1,
            scoringScore: Number(item.totalScore || 0),
            scoringRatio: Number.parseFloat(String(item.scoreRatio || '0').replace('%', '')) || 0,
            scoringStatus: item.status || ''
        }))
        .filter(item => item.number !== null);
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

function buildScoringProtectedMethod(candidates, scoringRows) {
    const selected = candidates.filter(item => (item.exclusionPriority || 0) >= PRIORITY_THRESHOLD);
    const excluded = new Set();
    selected.forEach(item => item.numbers.forEach(num => excluded.add(num)));

    const protectedNumbers = [];
    const rankedScoringRows = Array.isArray(scoringRows) ? scoringRows : [];

    for (const row of rankedScoringRows) {
        if ((100 - excluded.size) >= SCORING_PROTECTED_TARGET_BET) break;
        if (!excluded.has(row.number)) continue;

        excluded.delete(row.number);
        protectedNumbers.push(row);
    }

    return {
        id: 'scoringProtected30',
        name: 'Scoring bảo vệ 30 số đánh',
        description: 'Bắt đầu từ chuỗi ưu tiên loại >= 85, sau đó mở lại các số có scoring cao nhất để còn khoảng 30 số đánh. Scoring được dùng như lớp bảo vệ số đánh, không thay thế dropoff.',
        selectedStreaks: selected,
        excluded: [...excluded].sort((a, b) => a - b),
        protectedNumbers,
        scoringTargetBet: SCORING_PROTECTED_TARGET_BET
    };
}

function evaluateMethod(method, actualNumber) {
    const excluded = normalizeNumberList(method.excluded);
    const excludedSet = new Set(excluded);
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
    const actualExcluded = actualNumber !== null && excludedSet.has(actualNumber);
    const hit = !skipped && !actualExcluded;
    const miss = !skipped && actualExcluded;
    const stake = skipped ? 0 : betCount * BET_PER_NUMBER;
    const payout = hit ? BET_PER_NUMBER * WIN_MULTIPLIER : 0;
    const profit = skipped ? 0 : payout - stake;

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
            isPotential: !!item.isPotential,
            numbersCount: item.numbers.length,
            addedNumbersCount: item.addedNumbersCount,
            numbers: item.numbers,
            reason: item.reason
        })),
        protectedNumbers: (method.protectedNumbers || []).map(item => ({
            number: item.number,
            scoringRank: item.scoringRank,
            scoringScore: item.scoringScore,
            scoringRatio: item.scoringRatio,
            scoringStatus: item.scoringStatus
        })),
        protectedCount: (method.protectedNumbers || []).length,
        scoringTargetBet: method.scoringTargetBet,
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

function buildMethodDefinitions() {
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
            id: 'ranked40to50',
            name: 'Ưu tiên loại 40-50 số',
            priorityThreshold: PRIORITY_THRESHOLD,
            targetMin: HIT_RATE_TARGET_MIN,
            targetMax: HIT_RATE_TARGET_MAX,
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
            id: 'scoringProtected30',
            name: 'Scoring bảo vệ 30 số đánh',
            priorityThreshold: PRIORITY_THRESHOLD,
            targetBetCount: SCORING_PROTECTED_TARGET_BET,
            minExcludedToPlay: MIN_EXCLUDED_TO_PLAY
        }
    ];
}

async function ensureLotteryLoaded() {
    if (!lotteryService.getRawData() || lotteryService.getRawData().length === 0) {
        await lotteryService.loadAll();
    }
}

async function runBacktest(days = DEFAULT_DAYS, inputData = null) {
    await ensureLotteryLoaded();

    const rawData = inputData || lotteryService.getRawData();
    const sortedData = getSortedLotteryData(rawData);
    const requestedDays = parseInt(days, 10) || DEFAULT_DAYS;
    const effectiveDays = Math.max(1, Math.min(requestedDays, sortedData.length - 1));
    const latest = sortedData[sortedData.length - 1];
    const cacheKey = inputData
        ? null
        : `${effectiveDays}|${latest ? latest.date : ''}|${latest ? latest.special : ''}`;

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
        const scoringRows = buildScoringRowsForBasisData(sortedData, actualIndex - 1);
        latestCandidates = candidates;

        const thresholdMethod = evaluateMethod(buildThresholdMethod(candidates), actualNumber);
        const edgeThresholdMethod = evaluateMethod(buildEdgeThresholdMethod(candidates), actualNumber);
        const hitRateMethod = evaluateMethod(buildRankedMethod(candidates, {
            id: 'ranked40to50',
            name: 'Ưu tiên loại 40-50 số',
            targetMin: HIT_RATE_TARGET_MIN,
            targetMax: HIT_RATE_TARGET_MAX,
            description: 'Lấy điểm ưu tiên loại cao nhất nhưng chỉ loại khoảng 40-50 số để tăng xác suất trúng.'
        }), actualNumber);
        const rankedMethod = evaluateMethod(buildRankedMethod(candidates), actualNumber);
        const combinedMethod = evaluateMethod(buildCombinedReliabilityMethod(candidates), actualNumber);
        const scoringProtectedMethod = evaluateMethod(buildScoringProtectedMethod(candidates, scoringRows), actualNumber);

        details.push({
            predictionDate,
            predictionIsoDate: formatIsoDate(actualDay.date),
            basisDate,
            actualNumber,
            actualNumberText: actualNumber !== null ? formatNumber(actualNumber) : '',
            candidatesCount: candidates.length,
            methods: {
                dropoff85: thresholdMethod,
                dropoff85Edge: edgeThresholdMethod,
                ranked40to50: hitRateMethod,
                ranked60to70: rankedMethod,
                combined20to30: combinedMethod,
                scoringProtected30: scoringProtectedMethod
            }
        });
    }

    const summary = {
        dropoff85: summarizeMethod(details, 'dropoff85'),
        dropoff85Edge: summarizeMethod(details, 'dropoff85Edge'),
        ranked40to50: summarizeMethod(details, 'ranked40to50'),
        ranked60to70: summarizeMethod(details, 'ranked60to70'),
        combined20to30: summarizeMethod(details, 'combined20to30'),
        scoringProtected30: summarizeMethod(details, 'scoringProtected30')
    };

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
            hitRateTargetMin: HIT_RATE_TARGET_MIN,
            hitRateTargetMax: HIT_RATE_TARGET_MAX,
            rankedTargetMin: RANKED_TARGET_MIN,
            rankedTargetMax: RANKED_TARGET_MAX,
            combinedTargetMin: COMBINED_TARGET_MIN,
            combinedTargetMax: COMBINED_TARGET_MAX,
            scoringProtectedTargetBet: SCORING_PROTECTED_TARGET_BET,
            moneyUnit: 'K VND'
        },
        methods: buildMethodDefinitions(),
        summary,
        reliability: buildReliabilityReport(latestCandidates, sortedData),
        details: details.slice().reverse()
    };
    if (cacheKey) _backtestCache.set(cacheKey, result);
    return result;
}

async function runProgressiveSimulation(options = {}, lotteryData = null) {
    const days = options.simulationDays || options.days || DEFAULT_DAYS;
    return runBacktest(days, lotteryData);
}

async function runSimulation(options = {}, lotteryData = null) {
    const days = options.days || options.simulationDays || DEFAULT_DAYS;
    return runBacktest(days, lotteryData);
}

module.exports = {
    BET_PER_NUMBER,
    WIN_MULTIPLIER,
    DROP_OFF_THRESHOLD,
    PRIORITY_THRESHOLD,
    MIN_EXCLUDED_TO_PLAY,
    HIT_RATE_TARGET_MIN,
    HIT_RATE_TARGET_MAX,
    RANKED_TARGET_MIN,
    RANKED_TARGET_MAX,
    COMBINED_TARGET_MIN,
    COMBINED_TARGET_MAX,
    calculateBetAmount,
    calculateWinLoss,
    runBacktest,
    runProgressiveSimulation,
    runSimulation
};
