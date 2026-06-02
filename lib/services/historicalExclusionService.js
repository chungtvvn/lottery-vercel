/**
 * historicalExclusionService.js
 *
 * Tính toán số loại trừ (Exclusion & Exclusion+) cho BẤT KỲ NGÀY LỊCH SỬ NÀO.
 * 
 * Chiến lược: Filter pre-computed streak JSON files theo ngày → compute quickStats
 * at-point-in-time → áp dụng logic của suggestionsController (freq ≤ 1.5).
 *
 * Dùng cho: backtest và future simulation.
 */

const lotteryService = require('./lotteryService');

const {
    SETS,
    findNextInSet,
    findPreviousInSet,
    INDEX_MAPS,
    identifyCategories,
    getTongTT,
    getTongMoi,
    getHieu
} = require('../utils/numberAnalysis');
const { getNumbersFromCategory } = require('../controllers/suggestionsController');
const {
    getSoLeTheoCapLabel,
    isSoLeTheoCapCategory,
    formatSoLeTheoCapPairValue
} = require('../utils/soLeTheoCapPairs');
const { isInvalidStatsKey } = require('../utils/statsOptionsManifest');

// MAX_BET_COUNT removed per user request

// ==== CACHE ====
let _allStats = null;
let _fastStatsIndex = null;
const _dateCache = new Map();
const _parsedDateCache = new Map();
const _fullSequenceCache = new Map();
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function loadAllStats() {
    if (_allStats) return _allStats;
    try {
        const headTail = lotteryService.getHeadTailStats() || {};
        const sumDiff = lotteryService.getSumDiffStats() || {};
        const number = lotteryService.getNumberStats() || {};
        _allStats = { ...headTail, ...sumDiff, ...number };
        return _allStats;
    } catch (e) {
        console.error('[HistoricalExclusion] Lỗi load stats:', e.message);
        return {};
    }
}

function addMapList(map, key, value) {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
}

function upperBound(sortedValues, value) {
    let low = 0;
    let high = sortedValues.length;
    while (low < high) {
        const mid = (low + high) >> 1;
        if (sortedValues[mid] <= value) low = mid + 1;
        else high = mid;
    }
    return low;
}

function flattenStatsEntries(allStats) {
    const entries = [];
    const addEntry = (key, categoryData) => {
        if (isInvalidStatsKey(key)) return;
        if (!categoryData || !Array.isArray(categoryData.streaks) || categoryData.streaks.length === 0) return;
        entries.push({ key, categoryData });
    };

    for (const key in allStats) {
        const categoryData = allStats[key];
        if (categoryData && Array.isArray(categoryData.streaks)) {
            addEntry(key, categoryData);
        } else if (categoryData && typeof categoryData === 'object') {
            for (const subKey in categoryData) {
                const sub = categoryData[subKey];
                if (sub && Array.isArray(sub.streaks)) addEntry(`${key}:${subKey}`, sub);
            }
        }
    }
    return entries;
}

function getFastStatsIndex() {
    if (_fastStatsIndex) return _fastStatsIndex;
    const allStats = loadAllStats();
    const entriesByKey = new Map();
    const activeByDate = new Map();
    const soLeByDate = new Map();

    for (const rawEntry of flattenStatsEntries(allStats)) {
        const key = rawEntry.key;
        const lowerKey = key.toLowerCase();
        const parsedKey = parseStatsKey(key);
        const isSoLePattern = (lowerKey.includes('sole') || lowerKey.includes('solemoi')) &&
            !lowerKey.includes('tienluisole') &&
            !lowerKey.includes('luitiensole') &&
            !lowerKey.includes('soletheocap');
        const isTienLuiSoLe = lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole');
        const lengthBuckets = new Map();
        const indexedStreaks = [];

        rawEntry.categoryData.streaks.forEach((streak, index) => {
            const start = parseDate(streak.startDate);
            const end = parseDate(streak.endDate);
            if (!start || !end) return;
            const length = Number(streak.length) || 0;
            if (length <= 0) return;
            const indexed = {
                index,
                original: streak,
                startTime: start.getTime(),
                endTime: end.getTime(),
                startDate: streak.startDate,
                endDate: streak.endDate,
                length,
                dates: Array.isArray(streak.dates) ? streak.dates : [],
                values: Array.isArray(streak.values) ? streak.values : [],
                fullSequence: Array.isArray(streak.fullSequence) ? streak.fullSequence : []
            };
            indexedStreaks.push(indexed);
            if (!lengthBuckets.has(length)) lengthBuckets.set(length, []);
            lengthBuckets.get(length).push(indexed.endTime);
            const map = isSoLePattern ? soLeByDate : activeByDate;
            indexed.dates.forEach(date => addMapList(map, date, { key, index }));
        });

        const sortedByEnd = indexedStreaks.slice().sort((a, b) => a.endTime - b.endTime);
        const endTimes = sortedByEnd.map(item => item.endTime);
        const prefixLengthSums = [];
        let lengthSum = 0;
        sortedByEnd.forEach(item => {
            lengthSum += item.length;
            prefixLengthSums.push(lengthSum);
        });
        let maxLen = 0;
        for (const [len, times] of lengthBuckets.entries()) {
            times.sort((a, b) => a - b);
            if (len > maxLen) maxLen = len;
        }

        entriesByKey.set(key, {
            ...rawEntry,
            ...parsedKey,
            lowerKey,
            isSoLePattern,
            isTienLuiSoLe,
            indexedStreaks,
            indexedByOriginalIndex: new Map(indexedStreaks.map(item => [item.index, item])),
            lengthBuckets,
            sortedByEnd,
            endTimes,
            prefixLengthSums,
            maxLen
        });
    }

    _fastStatsIndex = { entriesByKey, activeByDate, soLeByDate };
    return _fastStatsIndex;
}

function getCachedStaticHistoryCore(entry, historyBasisDate, totalYears, minCalcLimit = 2) {
    const historyBasisTime = historyBasisDate instanceof Date
        ? historyBasisDate.getTime()
        : (parseDate(historyBasisDate)?.getTime() ?? null);
    if (historyBasisTime === null) return null;

    const normalizedLimit = Math.max(Number(entry.maxLen || 0) + 2, Number(minCalcLimit) || 2);
    const yearsKey = Math.round((Number(totalYears) || 0) * 1000) / 1000;
    const cacheKey = `${historyBasisTime}|${yearsKey}|${normalizedLimit}`;
    if (!entry.staticHistoryCache) entry.staticHistoryCache = new Map();
    if (entry.staticHistoryCache.has(cacheKey)) return entry.staticHistoryCache.get(cacheKey);

    const endedCount = upperBound(entry.endTimes, historyBasisTime);
    const exactCounts = new Map();
    let maxLen = 0;
    let totalOccurrences = 0;
    const totalLength = endedCount > 0 ? entry.prefixLengthSums[endedCount - 1] : 0;

    for (const [len, times] of entry.lengthBuckets.entries()) {
        const count = upperBound(times, historyBasisTime);
        if (count > 0) {
            exactCounts.set(len, count);
            totalOccurrences += count;
            if (len > maxLen) maxLen = len;
        }
    }

    if (totalOccurrences === 0) {
        entry.staticHistoryCache.set(cacheKey, null);
        return null;
    }

    const calcLimit = Math.max(maxLen + 1, normalizedLimit);
    const exactGapStats = {};
    const gapStats = {};
    let geCount = 0;
    for (let len = calcLimit; len >= 1; len--) {
        geCount += exactCounts.get(len) || 0;
        exactGapStats[len] = {
            count: exactCounts.get(len) || 0,
            pastCount: exactCounts.get(len) || 0
        };
        gapStats[len] = { count: geCount, pastCount: geCount };
    }

    let computedMaxStreak = maxLen;
    let isSuperMaxThreshold = false;
    let startLen = 2;
    let increment = 1;
    if (entry.isSoLePattern) { startLen = 3; increment = 2; }
    else if (entry.isTienLuiSoLe) { startLen = 4; increment = 1; }
    for (let len = startLen; len <= calcLimit; len += increment) {
        const cnt = exactGapStats[len] ? exactGapStats[len].count : 0;
        const freqYear = totalYears > 0 ? cnt / totalYears : 0;
        if (freqYear <= 1.5) {
            computedMaxStreak = len;
            isSuperMaxThreshold = freqYear <= 0.5;
            break;
        }
    }

    const firstEnded = endedCount > 0 ? entry.sortedByEnd[0] : null;
    const latestEnded = endedCount > 0 ? entry.sortedByEnd[endedCount - 1] : null;
    const firstStartTime = firstEnded ? firstEnded.startTime : null;
    const latestStartTime = latestEnded ? latestEnded.startTime : firstStartTime;
    const latestEndDate = latestEnded ? latestEnded.endDate : '';
    const avgGapDays = totalOccurrences > 1 && firstStartTime !== null && latestStartTime !== null
        ? Math.round((((latestStartTime - firstStartTime) / MS_PER_DAY) / (totalOccurrences - 1)) * 10) / 10
        : null;
    const metricStreaks = entry.sortedByEnd.slice(0, endedCount);
    const lengthHistoryMetrics = buildIndexedLengthHistoryMetrics(metricStreaks, historyBasisDate, calcLimit);

    const core = {
        maxLen,
        computedMaxStreak,
        isSuperMaxThreshold,
        exactGapStats,
        gapStats,
        lengthHistoryMetrics,
        historyMetrics: {
            occurrences: totalOccurrences,
            avgLength: totalOccurrences > 0 ? Math.round((totalLength / totalOccurrences) * 10) / 10 : null,
            avgGapDays,
            latestEndDate,
            daysSinceLatestEnd: latestEndDate ? diffDays(latestEndDate, formatDate(historyBasisDate)) : null
        }
    };
    entry.staticHistoryCache.set(cacheKey, core);
    return core;
}

// ==== DATE HELPERS ====
function parseDate(str) {
    if (!str) return null;
    const cacheKey = String(str);
    if (_parsedDateCache.has(cacheKey)) return _parsedDateCache.get(cacheKey);

    let parsed = null;
    // Handle YYYY-MM-DD format (from DB/rawData)
    if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length >= 3) {
            parsed = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].substring(0, 2)));
            _parsedDateCache.set(cacheKey, parsed);
            return parsed;
        }
        return null;
    }
    // Handle DD/MM/YYYY format
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    parsed = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    _parsedDateCache.set(cacheKey, parsed);
    return parsed;
}

function formatDate(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function diffDays(from, to) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (!fromDate || !toDate) return null;
    return Math.round((toDate - fromDate) / MS_PER_DAY);
}

function buildTruncatedCurrent(indexed, cutoffDate) {
    if (!indexed || !cutoffDate) return null;
    const cutoffTime = cutoffDate.getTime();
    const truncDates = indexed.dates.filter(d => {
        const parsed = parseDate(d);
        return parsed && parsed.getTime() <= cutoffTime;
    });
    if (truncDates.length === 0) return null;
    const truncValues = indexed.values ? indexed.values.slice(0, truncDates.length) : [];
    const baseFullSeq = indexed.fullSequence && indexed.fullSequence.length > 0
        ? indexed.fullSequence
        : buildFullSequenceFromRaw(indexed.original);
    const truncFullSeq = baseFullSeq.filter(item => {
        const parsed = parseDate(item.date);
        return parsed && parsed.getTime() <= cutoffTime;
    });
    const startD = parseDate(truncDates[0]);
    const endD = parseDate(truncDates[truncDates.length - 1]);
    if (!startD || !endD) return null;

    return {
        startDate: truncDates[0],
        endDate: truncDates[truncDates.length - 1],
        dates: truncDates,
        values: truncValues,
        length: Math.floor((endD - startD) / MS_PER_DAY) + 1,
        fullSequence: truncFullSeq
    };
}

function buildFastStatForDate(entry, prevDate, activeIndexed, targetLotteryDay, totalYears, options = {}) {
    const prevTime = prevDate.getTime();
    const historyBasisDate = options.useFullHistoryStats && options.historyBasisDate
        ? options.historyBasisDate
        : prevDate;
    const historyBasisTime = historyBasisDate.getTime();
    let current = null;
    let currentAddsToHistory = false;

    if (activeIndexed) {
        if (entry.isSoLePattern) {
            const refDate = new Date(prevDate);
            refDate.setDate(refDate.getDate() - 1);
            let isValid = true;
            if ((entry.lowerKey.includes('solemoi') || entry.lowerKey.includes('sole_moi')) &&
                targetLotteryDay && targetLotteryDay.special !== undefined) {
                try {
                    const { predictNextInSequence } = require('../controllers/suggestionsController');
                    const matchNumbers = predictNextInSequence(
                        { current: activeIndexed.original },
                        entry.category,
                        entry.subcategory || ''
                    );
                    if (matchNumbers && matchNumbers.length > 0) {
                        const stringNumbers = matchNumbers.map(n => String(n).padStart(2, '0'));
                        const specialNum = String(targetLotteryDay.special).padStart(2, '0');
                        if (stringNumbers.includes(specialNum)) isValid = false;
                    }
                } catch (e) {
                    console.error('Lỗi validate So le mới fast history:', e.message);
                }
            }
            if (isValid) current = buildTruncatedCurrent(activeIndexed, refDate);
            if (current && current.dates.length < 2) current = null;
        } else {
            current = buildTruncatedCurrent(activeIndexed, prevDate);
            if (current && entry.isTienLuiSoLe && current.length < 4) current = null;
        }
        currentAddsToHistory = !!(current && activeIndexed.endTime > historyBasisTime);
    }

    if (options.useFullHistoryStats && !currentAddsToHistory) {
        const minCalcLimit = Math.max(current ? current.length + 2 : 2, Number(entry.maxLen || 0) + 2);
        const cachedCore = getCachedStaticHistoryCore(entry, historyBasisDate, totalYears, minCalcLimit);
        if (!cachedCore) return null;
        return {
            description: entry.categoryData.description,
            longest: [{ length: cachedCore.maxLen }],
            secondLongest: [],
            current,
            computedMaxStreak: cachedCore.computedMaxStreak,
            isSuperMaxThreshold: cachedCore.isSuperMaxThreshold,
            isPotentialRecord: false,
            exactGapStats: cachedCore.exactGapStats,
            gapStats: cachedCore.gapStats,
            lengthHistoryMetrics: cachedCore.lengthHistoryMetrics,
            historyMetrics: cachedCore.historyMetrics
        };
    }

    const endedCount = upperBound(entry.endTimes, historyBasisTime);
    const exactCounts = new Map();
    let maxLen = 0;
    let totalOccurrences = 0;
    let totalLength = endedCount > 0 ? entry.prefixLengthSums[endedCount - 1] : 0;

    for (const [len, times] of entry.lengthBuckets.entries()) {
        const count = upperBound(times, historyBasisTime);
        if (count > 0) {
            exactCounts.set(len, count);
            totalOccurrences += count;
            if (len > maxLen) maxLen = len;
        }
    }

    if (currentAddsToHistory && current) {
        const len = current.length;
        exactCounts.set(len, (exactCounts.get(len) || 0) + 1);
        totalOccurrences += 1;
        totalLength += len;
        if (len > maxLen) maxLen = len;
    }

    if (totalOccurrences === 0) return null;

    const calcLimit = Math.max(maxLen + 1, current ? current.length + 2 : 2);
    const exactGapStats = {};
    const gapStats = {};
    let geCount = 0;
    for (let len = calcLimit; len >= 1; len--) {
        geCount += exactCounts.get(len) || 0;
        exactGapStats[len] = {
            count: exactCounts.get(len) || 0,
            pastCount: exactCounts.get(len) || 0
        };
        gapStats[len] = { count: geCount, pastCount: geCount };
    }

    let computedMaxStreak = maxLen;
    let isSuperMaxThreshold = false;
    let startLen = 2;
    let increment = 1;
    if (entry.isSoLePattern) { startLen = 3; increment = 2; }
    else if (entry.isTienLuiSoLe) { startLen = 4; increment = 1; }
    for (let len = startLen; len <= calcLimit; len += increment) {
        const cnt = exactGapStats[len] ? exactGapStats[len].count : 0;
        const freqYear = totalYears > 0 ? cnt / totalYears : 0;
        if (freqYear <= 1.5) {
            computedMaxStreak = len;
            isSuperMaxThreshold = freqYear <= 0.5;
            break;
        }
    }

    const firstEnded = endedCount > 0 ? entry.sortedByEnd[0] : null;
    const latestEnded = endedCount > 0 ? entry.sortedByEnd[endedCount - 1] : null;
    const firstStartTime = firstEnded ? firstEnded.startTime : (current ? parseDate(current.startDate)?.getTime() : null);
    const latestStartTime = currentAddsToHistory && current
        ? parseDate(current.startDate)?.getTime()
        : (latestEnded ? latestEnded.startTime : firstStartTime);
    const latestEndDate = currentAddsToHistory && current
        ? current.endDate
        : (latestEnded ? latestEnded.endDate : '');
    const avgGapDays = totalOccurrences > 1 && firstStartTime !== null && latestStartTime !== null
        ? Math.round((((latestStartTime - firstStartTime) / MS_PER_DAY) / (totalOccurrences - 1)) * 10) / 10
        : null;
    const metricStreaks = entry.sortedByEnd.slice(0, endedCount);
    if (currentAddsToHistory && current) {
        metricStreaks.push({
            startDate: current.startDate,
            endDate: current.endDate,
            length: current.length,
            startTime: parseDate(current.startDate)?.getTime(),
            endTime: parseDate(current.endDate)?.getTime()
        });
    }
    const lengthHistoryMetrics = buildIndexedLengthHistoryMetrics(metricStreaks, historyBasisDate, calcLimit);

    return {
        description: entry.categoryData.description,
        longest: [{ length: maxLen }],
        secondLongest: [],
        current,
        computedMaxStreak,
        isSuperMaxThreshold,
        isPotentialRecord: false,
        exactGapStats,
        gapStats,
        lengthHistoryMetrics,
        historyMetrics: {
            occurrences: totalOccurrences,
            avgLength: totalOccurrences > 0 ? Math.round((totalLength / totalOccurrences) * 10) / 10 : null,
            avgGapDays,
            latestEndDate,
            daysSinceLatestEnd: latestEndDate ? diffDays(latestEndDate, formatDate(historyBasisDate)) : null
        }
    };
}

function fastPotentialKeyMatches(entry, context) {
    const { todayNum, yesterdayNum, dayBeforeNum, matchedToday, matchedYesterday, matchedDayBefore } = context;
    if (!todayNum) return false;
    const lowerKey = entry.lowerKey;
    const lowerSub = String(entry.subcategory || '').toLowerCase();
    const step = getPotentialStep(entry.key, entry.subcategory);

    if (entry.key.startsWith('pattern_seq_')) {
        if (!yesterdayNum || !dayBeforeNum) return false;
        const pattern = entry.key.replace('pattern_seq_', '').split('_').map(p => p.toUpperCase());
        if (pattern.length < 4) return false;
        return getParityType(dayBeforeNum) === pattern[0] &&
            getParityType(yesterdayNum) === pattern[1] &&
            getParityType(todayNum) === pattern[2];
    }

    const isTienLuiSoLe = lowerSub === 'tienluisole' || lowerSub === 'luitiensole' ||
        lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole');
    if (isTienLuiSoLe) {
        if (!isAllowedTienLuiSoLeAxis(entry.key, entry.category)) return false;
        if (!yesterdayNum || !dayBeforeNum) return false;
        if (!matchesTienLuiFixedCategory(entry.key, entry.category, matchedDayBefore, matchedYesterday, matchedToday)) return false;
        const v0 = extractTienLuiOrderedValue(dayBeforeNum, entry.key, entry.category);
        const v1 = extractTienLuiOrderedValue(yesterdayNum, entry.key, entry.category);
        const v2 = extractTienLuiOrderedValue(todayNum, entry.key, entry.category);
        if (v0 === null || v1 === null || v2 === null) return false;
        const d1 = Number(v1) - Number(v0);
        const d2 = Number(v2) - Number(v1);
        const wantsTienFirst = lowerSub === 'tienluisole' || lowerKey.includes('tienluisole');
        return wantsTienFirst ? (d1 > 0 && d2 < 0) : (d1 < 0 && d2 > 0);
    }

    const isSoLeTheoCap = lowerSub === 'soletheocap' || lowerKey.includes('soletheocap');
    if (isSoLeTheoCap) {
        if (!isSoLeTheoCapCategory(entry.category)) return false;
        if (!yesterdayNum || !dayBeforeNum) return false;
        const v0 = getSoLeTheoCapLabel(dayBeforeNum, entry.category);
        const v1 = getSoLeTheoCapLabel(yesterdayNum, entry.category);
        const v2 = getSoLeTheoCapLabel(todayNum, entry.category);
        return !!(v0 && v1 && v2 && v0 !== v1 && v0 === v2);
    }

    if (step === 2) {
        return !!(yesterdayNum && matchedYesterday.includes(entry.category) && !matchedToday.includes(entry.category));
    }

    const isGenericTopLevel = !entry.key.includes(':') && (
        entry.key.startsWith('motSo') || entry.key.startsWith('motDau') || entry.key.startsWith('motDit') ||
        entry.key.startsWith('cacSo') || entry.key.startsWith('cacDau') || entry.key.startsWith('cacDit')
    );
    return matchedToday.includes(entry.category) || isGenericTopLevel;
}

function computeQuickStatsForDateFast(targetDateStr, totalYears, options = {}) {
    const debugTimings = process.env.DEBUG_FAST_STATS === '1';
    const timingStart = debugTimings ? Date.now() : 0;
    let timingCandidateStart = 0;
    let timingBuildStart = 0;
    let timingAugmentStart = 0;
    const targetDate = parseDate(targetDateStr);
    if (!targetDate) return {};

    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = formatDate(prevDate);
    const refDate = new Date(prevDate);
    refDate.setDate(refDate.getDate() - 1);
    const refDateStr = formatDate(refDate);
    const prevDateISOPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
    const rawData = lotteryService.getRawData() || [];
    const latestRawDate = rawData.reduce((latest, item) => {
        const itemDate = parseDate(item && item.date);
        if (!itemDate) return latest;
        return !latest || itemDate > latest ? itemDate : latest;
    }, null);
    const historyBasisDate = options.useFullHistoryStats && latestRawDate ? latestRawDate : prevDate;
    const targetLotteryDay = rawData.find(r => r.date && String(r.date).startsWith(prevDateISOPrefix));
    const known = rawData.filter(item => {
        const itemDate = parseDate(item.date);
        return itemDate && itemDate <= prevDate;
    }).slice(-3);
    const today = known[known.length - 1];
    const yesterday = known[known.length - 2];
    const dayBefore = known[known.length - 3];
    const todayNum = toRawNumber(today);
    const yesterdayNum = toRawNumber(yesterday);
    const dayBeforeNum = toRawNumber(dayBefore);
    const context = {
        todayNum,
        yesterdayNum,
        dayBeforeNum,
        matchedToday: todayNum ? identifyCategories(todayNum) : [],
        matchedYesterday: yesterdayNum ? identifyCategories(yesterdayNum) : [],
        matchedDayBefore: dayBeforeNum ? identifyCategories(dayBeforeNum) : []
    };

    const index = getFastStatsIndex();
    const candidateMap = new Map();
    timingCandidateStart = debugTimings ? Date.now() : 0;
    (index.activeByDate.get(prevDateStr) || []).forEach(item => {
        if (!candidateMap.has(item.key)) candidateMap.set(item.key, item.index);
    });
    (index.soLeByDate.get(refDateStr) || []).forEach(item => {
        if (!candidateMap.has(item.key)) candidateMap.set(item.key, item.index);
    });
    for (const [key, entry] of index.entriesByKey.entries()) {
        if (isInvalidStatsKey(key)) continue;
        if (!candidateMap.has(key) && fastPotentialKeyMatches(entry, context)) {
            candidateMap.set(key, null);
        }
    }

    const quickStats = {};
    timingBuildStart = debugTimings ? Date.now() : 0;
    for (const [key, activeIndex] of candidateMap.entries()) {
        if (isInvalidStatsKey(key)) continue;
        const entry = index.entriesByKey.get(key);
        if (!entry) continue;
        const activeIndexed = activeIndex === null ? null : entry.indexedByOriginalIndex.get(activeIndex);
        const stat = buildFastStatForDate(entry, prevDate, activeIndexed, targetLotteryDay, totalYears, {
            useFullHistoryStats: !!options.useFullHistoryStats,
            historyBasisDate
        });
        if (stat) quickStats[key] = stat;
    }

    timingAugmentStart = debugTimings ? Date.now() : 0;
    augmentPotentialStreaksForDate(quickStats, targetDateStr);
    quickStats._meta = { totalYears };
    if (debugTimings) {
        console.error('[FastStatsTiming]', {
            targetDateStr,
            candidates: candidateMap.size,
            quickStats: Object.keys(quickStats).length,
            setupMs: timingCandidateStart - timingStart,
            candidateMs: timingBuildStart - timingCandidateStart,
            buildMs: timingAugmentStart - timingBuildStart,
            augmentMs: Date.now() - timingAugmentStart,
            totalMs: Date.now() - timingStart
        });
    }
    return quickStats;
}

function computeHistoryMetrics(streaks, basisDate) {
    const valid = (streaks || [])
        .filter(item => item && Number.isFinite(Number(item.length)) && Number(item.length) > 0);
    if (valid.length === 0) {
        return {
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
    }

    const lengths = valid.map(item => Number(item.length));
    const avgLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const sortedByStart = valid.filter(item => item.startDate);
    const sortedByEnd = valid.filter(item => item.endDate);

    const gaps = [];
    for (let i = 1; i < sortedByStart.length; i++) {
        const gap = diffDays(sortedByStart[i - 1].startDate, sortedByStart[i].startDate);
        if (gap !== null && gap >= 0) gaps.push(gap);
    }

    const latestEndDate = sortedByEnd.length > 0 ? sortedByEnd[sortedByEnd.length - 1].endDate : '';
    const daysSinceLatestEnd = latestEndDate ? diffDays(latestEndDate, formatDate(basisDate)) : null;

    return {
        occurrences: valid.length,
        avgLength: Math.round(avgLength * 10) / 10,
        avgGapDays: gaps.length > 0 ? Math.round((gaps.reduce((sum, value) => sum + value, 0) / gaps.length) * 10) / 10 : null,
        latestEndDate,
        daysSinceLatestEnd
    };
}

function computeLengthHistoryMetrics(streaks, basisDate, targetLen) {
    const length = Number(targetLen);
    const basisDateStr = basisDate instanceof Date ? formatDate(basisDate) : String(basisDate || '');
    if (!Number.isFinite(length) || length <= 0) {
        return {
            targetLength: null,
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
    }

    const basis = basisDate instanceof Date ? basisDate : parseDate(basisDateStr);
    const valid = (streaks || [])
        .filter(item => item && Number(item.length) >= length && item.startDate && item.endDate)
        .filter(item => {
            if (!basis) return true;
            const end = parseDate(item.endDate);
            return end && end <= basis;
        });

    if (valid.length === 0) {
        return {
            targetLength: length,
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
    }

    const lengths = valid.map(item => Number(item.length));
    const avgLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const sortedByStart = valid;
    const sortedByEnd = valid;

    const gaps = [];
    for (let i = 1; i < sortedByStart.length; i++) {
        const gap = diffDays(sortedByStart[i - 1].endDate, sortedByStart[i].startDate);
        if (gap !== null && gap >= 0) gaps.push(gap);
    }

    const latestEndDate = sortedByEnd.length > 0 ? sortedByEnd[sortedByEnd.length - 1].endDate : '';

    return {
        targetLength: length,
        occurrences: valid.length,
        avgLength: Math.round(avgLength * 10) / 10,
        avgGapDays: gaps.length > 0 ? Math.round((gaps.reduce((sum, value) => sum + value, 0) / gaps.length) * 10) / 10 : null,
        latestEndDate,
        daysSinceLatestEnd: latestEndDate && basisDateStr ? diffDays(latestEndDate, basisDateStr) : null
    };
}

function computeIndexedLengthHistoryMetrics(streaks, basisDate, targetLen) {
    const length = Number(targetLen);
    const basisTime = basisDate instanceof Date ? basisDate.getTime() : (parseDate(basisDate)?.getTime() ?? null);
    if (!Number.isFinite(length) || length <= 0) {
        return {
            targetLength: null,
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
    }

    const valid = [];
    let totalLength = 0;
    let latest = null;
    for (const item of streaks || []) {
        if (!item || Number(item.length) < length) continue;
        const endTime = Number(item.endTime);
        const startTime = Number(item.startTime);
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) continue;
        if (basisTime !== null && endTime > basisTime) continue;
        valid.push(item);
        totalLength += Number(item.length);
        if (!latest || endTime > latest.endTime) latest = item;
    }

    if (valid.length === 0) {
        return {
            targetLength: length,
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
    }

    valid.sort((a, b) => a.startTime - b.startTime);
    const gaps = [];
    for (let i = 1; i < valid.length; i++) {
        const gap = Math.round((valid[i].startTime - valid[i - 1].endTime) / MS_PER_DAY);
        if (gap >= 0) gaps.push(gap);
    }

    return {
        targetLength: length,
        occurrences: valid.length,
        avgLength: Math.round((totalLength / valid.length) * 10) / 10,
        avgGapDays: gaps.length > 0 ? Math.round((gaps.reduce((sum, value) => sum + value, 0) / gaps.length) * 10) / 10 : null,
        latestEndDate: latest ? latest.endDate : '',
        daysSinceLatestEnd: latest && basisTime !== null ? Math.round((basisTime - latest.endTime) / MS_PER_DAY) : null
    };
}

function buildIndexedLengthHistoryMetrics(streaks, basisDate, calcLimit) {
    const limit = Math.max(1, Number(calcLimit) || 1);
    const basisTime = basisDate instanceof Date ? basisDate.getTime() : (parseDate(basisDate)?.getTime() ?? null);

    const occurrences = new Int32Array(limit + 1);
    const totalLengths = new Int32Array(limit + 1);
    const latestEndTime = new Float64Array(limit + 1);
    const latestStreak = new Array(limit + 1);
    const prevStreak = new Array(limit + 1);
    const gapsSum = new Float64Array(limit + 1);
    const gapsCount = new Int32Array(limit + 1);

    const lenStreaks = streaks || [];
    for (let i = 0; i < lenStreaks.length; i++) {
        const item = lenStreaks[i];
        if (!item) continue;
        const endTime = Number(item.endTime);
        const startTime = Number(item.startTime);
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) continue;
        if (basisTime !== null && endTime > basisTime) continue;

        const itemLen = Number(item.length);
        const maxApplicableLen = Math.min(limit, itemLen);

        for (let len = 1; len <= maxApplicableLen; len++) {
            occurrences[len]++;
            totalLengths[len] += itemLen;
            if (endTime > latestEndTime[len]) {
                latestEndTime[len] = endTime;
                latestStreak[len] = item;
            }
            const prev = prevStreak[len];
            if (prev) {
                const gap = Math.round((startTime - prev.endTime) / MS_PER_DAY);
                if (gap >= 0) {
                    gapsSum[len] += gap;
                    gapsCount[len]++;
                }
            }
            prevStreak[len] = item;
        }
    }

    const metrics = {};
    for (let len = 1; len <= limit; len++) {
        const occ = occurrences[len];
        if (occ === 0) {
            metrics[len] = {
                targetLength: len,
                occurrences: 0,
                avgLength: null,
                avgGapDays: null,
                latestEndDate: '',
                daysSinceLatestEnd: null
            };
        } else {
            const latest = latestStreak[len];
            const avgGapDays = gapsCount[len] > 0
                ? Math.round((gapsSum[len] / gapsCount[len]) * 10) / 10
                : null;
            metrics[len] = {
                targetLength: len,
                occurrences: occ,
                avgLength: Math.round((totalLengths[len] / occ) * 10) / 10,
                avgGapDays,
                latestEndDate: latest ? latest.endDate : '',
                daysSinceLatestEnd: latest && basisTime !== null ? Math.round((basisTime - latest.endTime) / MS_PER_DAY) : null
            };
        }
    }
    return metrics;
}

/**
 * Build fullSequence from rawData for a streak that doesn't have it.
 * Returns array of {date: 'DD/MM/YYYY', value: '...'}
 */
function buildFullSequenceFromRaw(streak) {
    if (!streak || !streak.startDate || !streak.endDate) return [];
    const cacheKey = `${streak.startDate}|${streak.endDate}`;
    if (_fullSequenceCache.has(cacheKey)) return _fullSequenceCache.get(cacheKey);

    const rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) return [];
    
    const startD = parseDate(streak.startDate);
    const endD = parseDate(streak.endDate);
    if (!startD || !endD) return [];
    
    const result = [];
    for (const item of rawData) {
        const itemD = parseDate(item.date);
        if (!itemD) continue;
        if (itemD < startD) continue;
        if (itemD > endD) break;
        if (item.special !== null && item.special !== undefined) {
            result.push({
                date: formatDate(itemD),
                value: String(item.special).padStart(2, '0')
            });
        }
    }
    _fullSequenceCache.set(cacheKey, result);
    return result;
}

function getParityType(numberStr) {
    const n = String(numberStr).padStart(2, '0');
    const headEven = parseInt(n[0], 10) % 2 === 0;
    const tailEven = parseInt(n[1], 10) % 2 === 0;
    if (headEven && tailEven) return 'CC';
    if (headEven && !tailEven) return 'CL';
    if (!headEven && tailEven) return 'LC';
    return 'LL';
}

function parseStatsKey(key) {
    if (key.includes(':')) {
        const [category, subcategory] = key.split(':');
        return { category, subcategory };
    }

    const patterns = [
        'VeSoLeTheoThuTu', 'VeTheoThuTu',
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

    if (key.startsWith('pattern_seq_')) return { category: key, subcategory: '' };
    return { category: key, subcategory: 'veLienTiep' };
}

function getPotentialStep(key, subcategory = '') {
    const lowerKey = String(key).toLowerCase();
    const lowerSub = String(subcategory).toLowerCase();
    const isAlternatingGapPattern = (
        lowerSub === 'vesole' ||
        lowerSub === 'vesolemoi' ||
        lowerKey.includes('vesole') ||
        lowerKey.includes('solemoi')
    ) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap');

    return isAlternatingGapPattern ? 2 : 1;
}

function isAllowedTienLuiSoLeAxis(key, category) {
    return !!key && !!category;
}

function isGenericTienLuiAxis(key, category) {
    const lowerKey = String(key).toLowerCase();
    return lowerKey === 'tienluisole' ||
        lowerKey === 'luitiensole' ||
        category === 'cacSo' ||
        category === 'cacDau' ||
        category === 'cacDit' ||
        category === 'tong_tt_cac_tong' ||
        category === 'tong_moi_cac_tong' ||
        category === 'hieu_cac_hieu';
}

function matchesTienLuiFixedCategory(key, category, matchedDayBefore, matchedYesterday, matchedToday) {
    if (isGenericTienLuiAxis(key, category)) return true;
    return (matchedDayBefore || []).includes(category) &&
        (matchedYesterday || []).includes(category) &&
        (matchedToday || []).includes(category);
}

function extractTienLuiOrderedValue(numberStr, key, category) {
    const normalized = String(numberStr).padStart(2, '0');
    const n = parseInt(normalized, 10);
    if (Number.isNaN(n)) return null;

    const lowerKey = String(key).toLowerCase();
    if (lowerKey === 'tienluisole' || lowerKey === 'luitiensole' || category === 'cacSo') return n;
    if (category === 'cacDau') return Math.floor(n / 10);
    if (category === 'cacDit') return n % 10;
    if (category === 'tong_tt_cac_tong') return getTongTT(normalized);
    if (category === 'tong_moi_cac_tong') return getTongMoi(normalized);
    if (category === 'hieu_cac_hieu') return getHieu(normalized);

    return n;
}

function shouldAttachPotential(stat, formLen, step) {
    if (!stat || stat.current) return false;
    const recordLen = stat.computedMaxStreak || (stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0);
    if (recordLen === 0) {
        const prefixLen = formLen - step;
        return prefixLen === 1 || prefixLen === 3;
    }
    if (!recordLen || recordLen < 2) return false;
    const prefixLen = formLen - step;
    if (prefixLen === 1) {
        return recordLen === formLen;
    }
    return formLen >= recordLen - step;
}

function attachPatternNumbers(current, key) {
    try {
        const { predictNextInSequence, getNumbersFromCategory } = require('../controllers/suggestionsController');
        const { category, subcategory } = parseStatsKey(key);
        const nums = predictNextInSequence({ current }, category, subcategory || '');
        if (nums && nums.length > 0 && nums.length < 100) return nums;
        const fallback = getNumbersFromCategory(category);
        return fallback && fallback.length < 100 ? fallback : [];
    } catch (e) {
        return [];
    }
}

function toRawNumber(rawItem) {
    if (!rawItem || rawItem.special === null || rawItem.special === undefined) return '';
    return String(rawItem.special).padStart(2, '0');
}

function augmentPotentialStreaksForDate(quickStats, targetDateStr) {
    if (!quickStats || typeof quickStats !== 'object') return quickStats;
    const debugTimings = process.env.DEBUG_FAST_STATS === '1';
    const timingStart = debugTimings ? Date.now() : 0;
    let timingLoopStart = 0;
    let timingNeverFormedStart = 0;

    const targetDate = parseDate(targetDateStr);
    if (!targetDate) return quickStats;

    const latestKnownDate = new Date(targetDate);
    latestKnownDate.setDate(latestKnownDate.getDate() - 1);
    const latestKnownTime = latestKnownDate.getTime();

    const rawData = lotteryService.getRawData() || [];
    const known = rawData
        .filter(item => {
            const itemDate = parseDate(item.date);
            return itemDate && itemDate.getTime() <= latestKnownTime;
        })
        .slice(-3);

    const today = known[known.length - 1];
    const yesterday = known[known.length - 2];
    const dayBefore = known[known.length - 3];
    const todayNum = toRawNumber(today);
    if (!todayNum) return quickStats;

    const todayDate = formatDate(parseDate(today.date));
    const matchedToday = identifyCategories(todayNum);

    const yesterdayNum = toRawNumber(yesterday);
    const yesterdayDate = yesterday ? formatDate(parseDate(yesterday.date)) : '';
    const matchedYesterday = yesterdayNum ? identifyCategories(yesterdayNum) : [];

    const dayBeforeNum = toRawNumber(dayBefore);
    const dayBeforeDate = dayBefore ? formatDate(parseDate(dayBefore.date)) : '';
    const matchedDayBefore = dayBeforeNum ? identifyCategories(dayBeforeNum) : [];

    const setPotential = (key, current) => {
        const stat = quickStats[key];
        if (!stat || stat.current) return;
        quickStats[key] = {
            ...stat,
            current: {
                ...current,
                patternNumbers: current.patternNumbers && current.patternNumbers.length < 100
                    ? current.patternNumbers
                    : [],
                isPotential: true
            },
            isPotentialRecord: true
        };
    };

    timingLoopStart = debugTimings ? Date.now() : 0;
    for (const key of Object.keys(quickStats)) {
        if (key === '_meta') continue;
        const stat = quickStats[key];
        if (!stat || stat.current) continue;

        const { category, subcategory } = parseStatsKey(key);
        const lowerKey = key.toLowerCase();
        const lowerSub = String(subcategory || '').toLowerCase();
        const step = getPotentialStep(key, subcategory);

        if (key.startsWith('pattern_seq_')) {
            if (!yesterdayNum || !dayBeforeNum) continue;
            const pattern = key.replace('pattern_seq_', '').split('_').map(p => p.toUpperCase());
            if (pattern.length < 4) continue;
            const prefixMatches =
                getParityType(dayBeforeNum) === pattern[0] &&
                getParityType(yesterdayNum) === pattern[1] &&
                getParityType(todayNum) === pattern[2];
            const formLen = 4;
            if (prefixMatches && shouldAttachPotential(stat, formLen, 1)) {
                setPotential(key, {
                    length: 3,
                    startDate: dayBeforeDate,
                    endDate: todayDate,
                    values: [dayBeforeNum, yesterdayNum, todayNum],
                    dates: [dayBeforeDate, yesterdayDate, todayDate],
                    fullSequence: [
                        { date: dayBeforeDate, value: dayBeforeNum },
                        { date: yesterdayDate, value: yesterdayNum },
                        { date: todayDate, value: todayNum, isLatest: true }
                    ],
                    isPotential: true
                });
            }
            continue;
        }

        const isTienLuiSoLe = lowerSub === 'tienluisole' || lowerSub === 'luitiensole' ||
            lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole');
        const isSoLeTheoCap = lowerSub === 'soletheocap' || lowerKey.includes('soletheocap');
        const isAlternatingGap = step === 2;

        if (isTienLuiSoLe) {
            if (!isAllowedTienLuiSoLeAxis(key, category)) continue;
            if (!yesterdayNum || !dayBeforeNum) continue;
            if (!matchesTienLuiFixedCategory(key, category, matchedDayBefore, matchedYesterday, matchedToday)) continue;
            const v0 = extractTienLuiOrderedValue(dayBeforeNum, key, category);
            const v1 = extractTienLuiOrderedValue(yesterdayNum, key, category);
            const v2 = extractTienLuiOrderedValue(todayNum, key, category);
            if (v0 === null || v1 === null || v2 === null) continue;
            const d1 = Number(v1) - Number(v0);
            const d2 = Number(v2) - Number(v1);
            const wantsTienFirst = lowerSub === 'tienluisole' || lowerKey.includes('tienluisole');
            const directionsOk = wantsTienFirst ? (d1 > 0 && d2 < 0) : (d1 < 0 && d2 > 0);
            const formLen = 4;
            if (directionsOk && shouldAttachPotential(stat, formLen, 1)) {
                setPotential(key, {
                    length: 3,
                    startDate: dayBeforeDate,
                    endDate: todayDate,
                    values: [dayBeforeNum, yesterdayNum, todayNum],
                    dates: [dayBeforeDate, yesterdayDate, todayDate],
                    fullSequence: [
                        { date: dayBeforeDate, value: dayBeforeNum },
                        { date: yesterdayDate, value: yesterdayNum },
                        { date: todayDate, value: todayNum, isLatest: true }
                    ],
                    isPotential: true
                });
            }
            continue;
        }

        if (isSoLeTheoCap) {
            if (!isSoLeTheoCapCategory(category)) continue;
            if (!yesterdayNum || !dayBeforeNum) continue;
            const v0 = getSoLeTheoCapLabel(dayBeforeNum, category);
            const v1 = getSoLeTheoCapLabel(yesterdayNum, category);
            const v2 = getSoLeTheoCapLabel(todayNum, category);
            const ababPrefix = v0 && v1 && v2 && v0 !== v1 && v0 === v2;
            const formLen = 4;
            if (ababPrefix && shouldAttachPotential(stat, formLen, 1)) {
                const patternLabels = [v0, v1, v2];
                setPotential(key, {
                    length: 3,
                    startDate: dayBeforeDate,
                    endDate: todayDate,
                    values: [dayBeforeNum, yesterdayNum, todayNum],
                    patternLabels,
                    pairCategory: category,
                    value: formatSoLeTheoCapPairValue(category, patternLabels),
                    dates: [dayBeforeDate, yesterdayDate, todayDate],
                    fullSequence: [
                        { date: dayBeforeDate, value: dayBeforeNum },
                        { date: yesterdayDate, value: yesterdayNum },
                        { date: todayDate, value: todayNum, isLatest: true }
                    ],
                    isPotential: true
                });
            }
            continue;
        }

        if (isAlternatingGap) {
            const formLen = 3;
            if (yesterdayNum && matchedYesterday.includes(category) && !matchedToday.includes(category) && shouldAttachPotential(stat, formLen, step)) {
                setPotential(key, {
                    length: 1,
                    startDate: yesterdayDate,
                    endDate: yesterdayDate,
                    values: [yesterdayNum],
                    dates: [yesterdayDate],
                    fullSequence: [
                        { date: yesterdayDate, value: yesterdayNum },
                        { date: todayDate, value: todayNum, isLatest: true }
                    ],
                    isPotential: true
                });
            }
            continue;
        }

        const isGenericTopLevel = !key.includes(':') && (
            key.startsWith('motSo') || key.startsWith('motDau') || key.startsWith('motDit') ||
            key.startsWith('cacSo') || key.startsWith('cacDau') || key.startsWith('cacDit')
        );
        const matchesCategory = matchedToday.includes(category) || isGenericTopLevel;
        const formLen = 2;
        if (matchesCategory && shouldAttachPotential(stat, formLen, 1)) {
            let patternNumbers;
            if (key.startsWith('motSo')) {
                patternNumbers = [parseInt(todayNum, 10)];
            } else if (key.startsWith('motDau')) {
                const head = todayNum[0];
                patternNumbers = Array.from({ length: 100 }, (_, i) => i)
                    .filter(n => String(n).padStart(2, '0')[0] === head);
            } else if (key.startsWith('motDit')) {
                const tail = todayNum[1];
                patternNumbers = Array.from({ length: 100 }, (_, i) => i)
                    .filter(n => String(n).padStart(2, '0')[1] === tail);
            }
            setPotential(key, {
                length: 1,
                startDate: todayDate,
                endDate: todayDate,
                value: todayNum,
                values: [todayNum],
                dates: [todayDate],
                fullSequence: [{ date: todayDate, value: todayNum, isLatest: true }],
                patternNumbers,
                isPotential: true
            });
        }
    }

    timingNeverFormedStart = debugTimings ? Date.now() : 0;
    try {
        const { augmentNeverFormedPotentialStreaks } = require('../utils/neverFormedPotential');
        augmentNeverFormedPotentialStreaks(quickStats, {
            todayNum,
            todayDate,
            yesterdayNum,
            yesterdayDate,
            dayBeforeNum,
            dayBeforeDate,
            matchedToday,
            matchedYesterday,
            matchedDayBefore,
            totalYears: quickStats._meta?.totalYears || 20
        });
    } catch (error) {
        console.error('[historicalExclusionService] Failed to augment never-formed no-data potentials:', error.message);
    }

    if (debugTimings) {
        console.error('[PotentialTiming]', {
            targetDateStr,
            setupMs: timingLoopStart - timingStart,
            loopMs: timingNeverFormedStart - timingLoopStart,
            neverFormedMs: Date.now() - timingNeverFormedStart,
            totalMs: Date.now() - timingStart
        });
    }
    return quickStats;
}

// ==== COMPUTE quickStats FOR A SPECIFIC DATE ====
/**
 * Tính quickStats cho một ngày cụ thể (chỉ dùng dữ liệu lịch sử đến trước ngày đó)
 * @param {string} targetDateStr - 'dd/mm/yyyy'
 * @param {number} totalYears
 * @returns {Object} quickStats object (tương tự statisticsService.getQuickStats())
 */
function computeQuickStatsForDate(targetDateStr, totalYears, options = {}) {
    const allStats = loadAllStats();
    const targetDate = parseDate(targetDateStr);
    if (!targetDate) return {};
    const activeOnly = !!options.activeOnly;
    const useFullHistoryStats = !!options.useFullHistoryStats;

    // Ngày có kết quả cuối cùng (ngày hôm qua so với ngày cần dự đoán)
    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = formatDate(prevDate);

    const lotteryService = require('./lotteryService');
    const { getNumbersFromCategory } = require('../controllers/suggestionsController');
    const rawData = lotteryService.getRawData() || [];
    const latestRawDate = rawData.reduce((latest, item) => {
        const itemDate = parseDate(item && item.date);
        if (!itemDate) return latest;
        return !latest || itemDate > latest ? itemDate : latest;
    }, null);
    const historyBasisDate = useFullHistoryStats && latestRawDate ? latestRawDate : prevDate;
    const prevDateISOPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
    const targetLotteryDay = rawData.find(r => r.date && String(r.date).startsWith(prevDateISOPrefix));
    const known = activeOnly
        ? rawData.filter(item => {
            const itemDate = parseDate(item.date);
            return itemDate && itemDate <= prevDate;
        }).slice(-3)
        : [];
    const today = known[known.length - 1];
    const yesterday = known[known.length - 2];
    const dayBefore = known[known.length - 3];
    const todayNum = toRawNumber(today);
    const yesterdayNum = toRawNumber(yesterday);
    const dayBeforeNum = toRawNumber(dayBefore);
    const matchedToday = todayNum ? identifyCategories(todayNum) : [];
    const matchedYesterday = yesterdayNum ? identifyCategories(yesterdayNum) : [];
    const matchedDayBefore = dayBeforeNum ? identifyCategories(dayBeforeNum) : [];

    const quickStats = {};

    const hasActiveStreakCandidate = (key, categoryData, lowerKey, isSoLePattern) => {
        if (!activeOnly) return true;
        if (!categoryData || !Array.isArray(categoryData.streaks)) return false;
        if (isSoLePattern) {
            const refDate = new Date(prevDate);
            refDate.setDate(refDate.getDate() - 1);
            const refDateStr = formatDate(refDate);
            return categoryData.streaks.some(s => s.dates && s.dates.includes(refDateStr));
        }
        return categoryData.streaks.some(s => {
            const start = parseDate(s.startDate);
            const end = parseDate(s.endDate);
            return start && end && start <= prevDate && end >= prevDate;
        });
    };

    const hasPotentialCandidate = (key, category, subcategory) => {
        if (!activeOnly || !todayNum) return false;
        const lowerKey = String(key).toLowerCase();
        const lowerSub = String(subcategory || '').toLowerCase();
        const step = getPotentialStep(key, subcategory);

        if (key.startsWith('pattern_seq_')) {
            if (!yesterdayNum || !dayBeforeNum) return false;
            const pattern = key.replace('pattern_seq_', '').split('_').map(p => p.toUpperCase());
            if (pattern.length < 4) return false;
            return getParityType(dayBeforeNum) === pattern[0] &&
                getParityType(yesterdayNum) === pattern[1] &&
                getParityType(todayNum) === pattern[2];
        }

        const isTienLuiSoLe = lowerSub === 'tienluisole' || lowerSub === 'luitiensole' ||
            lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole');
        if (isTienLuiSoLe) {
            if (!isAllowedTienLuiSoLeAxis(key, category)) return false;
            if (!yesterdayNum || !dayBeforeNum) return false;
            if (!matchesTienLuiFixedCategory(key, category, matchedDayBefore, matchedYesterday, matchedToday)) return false;
            const v0 = extractTienLuiOrderedValue(dayBeforeNum, key, category);
            const v1 = extractTienLuiOrderedValue(yesterdayNum, key, category);
            const v2 = extractTienLuiOrderedValue(todayNum, key, category);
            if (v0 === null || v1 === null || v2 === null) return false;
            const d1 = Number(v1) - Number(v0);
            const d2 = Number(v2) - Number(v1);
            const wantsTienFirst = lowerSub === 'tienluisole' || lowerKey.includes('tienluisole');
            return wantsTienFirst ? (d1 > 0 && d2 < 0) : (d1 < 0 && d2 > 0);
        }

        const isSoLeTheoCap = lowerSub === 'soletheocap' || lowerKey.includes('soletheocap');
        if (isSoLeTheoCap) {
            if (!isSoLeTheoCapCategory(category)) return false;
            if (!yesterdayNum || !dayBeforeNum) return false;
            const v0 = getSoLeTheoCapLabel(dayBeforeNum, category);
            const v1 = getSoLeTheoCapLabel(yesterdayNum, category);
            const v2 = getSoLeTheoCapLabel(todayNum, category);
            return !!(v0 && v1 && v2 && v0 !== v1 && v0 === v2);
        }

        const isAlternatingGap = step === 2;
        if (isAlternatingGap) {
            return !!(yesterdayNum && matchedYesterday.includes(category) && !matchedToday.includes(category));
        }

        const isGenericTopLevel = !key.includes(':') && (
            key.startsWith('motSo') || key.startsWith('motDau') || key.startsWith('motDit') ||
            key.startsWith('cacSo') || key.startsWith('cacDau') || key.startsWith('cacDit')
        );
        return matchedToday.includes(category) || isGenericTopLevel;
    };

    const analyzeCategory = (key, categoryData) => {
        if (isInvalidStatsKey(key)) return;
        if (!categoryData || !Array.isArray(categoryData.streaks) || categoryData.streaks.length === 0) {
            return;
        }

        // Lấy các chuỗi ĐÃ HOÀN THÀNH trước ngày đang chọn (prevDate)
        // + TRUNCATE các chuỗi đang diễn ra tại ngày đang chọn
        const historicalStreaks = [];
        for (const s of categoryData.streaks) {
            const endDate = parseDate(s.endDate);
            const startDate = parseDate(s.startDate);
            if (!endDate || !startDate) continue;

            if (useFullHistoryStats) {
                historicalStreaks.push(s);
            } else if (endDate <= prevDate) {
                // Chuỗi hoàn thành trước hoặc tại ngày đang chọn
                historicalStreaks.push(s);
            } else if (startDate <= prevDate) {
                // Chuỗi spans ngày đang chọn → truncate
                const truncDates = s.dates ? s.dates.filter(d => parseDate(d) <= prevDate) : [];
                if (truncDates.length >= 2) {
                    const truncStartD = parseDate(truncDates[0]);
                    const truncEndD = parseDate(truncDates[truncDates.length - 1]);
                    const daySpan = Math.floor((truncEndD - truncStartD) / (1000 * 60 * 60 * 24)) + 1;
                    historicalStreaks.push({
                        ...s,
                        endDate: truncDates[truncDates.length - 1],
                        dates: truncDates,
                        values: s.values ? s.values.slice(0, truncDates.length) : [],
                        length: daySpan,
                        fullSequence: s.fullSequence ? s.fullSequence.filter(item => parseDate(item.date) <= prevDate) : []
                    });
                }
            }
        }

        if (historicalStreaks.length === 0) return;

        const historyMetrics = computeHistoryMetrics(historicalStreaks, historyBasisDate);
        const streaks = [...historicalStreaks].sort((a, b) => b.length - a.length);
        const longestLength = streaks[0].length;
        const longest = streaks.filter(s => s.length === longestLength);

        let secondLongest = [];
        for (let i = 0; i < streaks.length; i++) {
            if (streaks[i].length < longestLength) {
                const secondLength = streaks[i].length;
                secondLongest = streaks.filter(s => s.length === secondLength);
                break;
            }
        }

        // Xác định loại pattern
        const lowerKey = key.toLowerCase();
        const isSoLePattern = (lowerKey.includes('sole') || lowerKey.includes('solemoi')) &&
            !lowerKey.includes('tienluisole') &&
            !lowerKey.includes('luitiensole') &&
            !lowerKey.includes('soletheocap');
        const isTienLuiSoLe = lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole');
        const parsedKey = parseStatsKey(key);

        if (
            activeOnly &&
            !hasActiveStreakCandidate(key, categoryData, lowerKey, isSoLePattern) &&
            !hasPotentialCandidate(key, parsedKey.category, parsedKey.subcategory)
        ) {
            return;
        }

        // === TÌM CHUỖI ĐANG DIỄN RA TẠI NGÀY ĐANG CHỌN ===
        // Logic chuẩn:
        // - Ngày đang chọn (prevDate = selectedDate) làm mốc
        // - Regular patterns: tìm streak CHỨA selectedDate, truncate đến selectedDate
        // - So le / So le mới: dùng selectedDate - 1 làm mốc (vì pattern cách ngày)
        // - Không quan tâm dữ liệu SAU ngày đang chọn
        let current = null;

        if (isSoLePattern) {
            // So le: Mốc = ngày TRƯỚC ngày đang chọn 1 ngày
            // prevDate LUÔN được coi là ngày xen kẽ (gap day)
            const refDate = new Date(prevDate); // prevDate = selectedDate
            refDate.setDate(refDate.getDate() - 1);
            const refDateStr = formatDate(refDate);

            // Tìm streak có chứa refDate trong dates[]
            let streak = categoryData.streaks.find(s => s.dates && s.dates.includes(refDateStr));

            if (streak) {
                const isSoLeMoi = lowerKey.includes('solemoi') || lowerKey.includes('sole_moi');
                let isValid = true;

                // Validate So le mới: ngày xen kẽ (prevDate) KHÔNG được trùng pattern
                if (isSoLeMoi && targetLotteryDay && targetLotteryDay.special !== undefined) {
                    try {
                        const { predictNextInSequence } = require('../controllers/suggestionsController');
                        const [categoryName, subcategoryStr] = key.split(':');
                        const matchNumbers = predictNextInSequence({ current: streak }, categoryName, subcategoryStr || '');
                        if (matchNumbers && matchNumbers.length > 0) {
                            const stringNumbers = matchNumbers.map(n => String(n).padStart(2, '0'));
                            const specialNum = String(targetLotteryDay.special).padStart(2, '0');
                            if (stringNumbers.includes(specialNum)) {
                                isValid = false; // Bị gãy chuỗi
                            }
                        }
                    } catch (e) {
                        console.error('Lỗi validate So le mới for history:', e.message);
                    }
                }

                if (isValid) {
                    // Truncate: chỉ giữ dates <= refDate
                    const truncDates = streak.dates.filter(d => parseDate(d) <= refDate);
                    const truncValues = streak.values ? streak.values.slice(0, truncDates.length) : [];
                    // Build fullSequence from rawData nếu streak không có sẵn
                    const baseFullSeq = (streak.fullSequence && streak.fullSequence.length > 0)
                        ? streak.fullSequence
                        : buildFullSequenceFromRaw(streak);
                    const truncFullSeq = baseFullSeq.filter(item => parseDate(item.date) <= refDate);

                    if (truncDates.length >= 2) {
                        const startD = parseDate(truncDates[0]);
                        const endD = parseDate(truncDates[truncDates.length - 1]);
                        const daySpan = Math.floor((endD - startD) / (1000 * 60 * 60 * 24)) + 1;

                        current = {
                            startDate: truncDates[0],
                            endDate: truncDates[truncDates.length - 1],
                            dates: truncDates,
                            values: truncValues,
                            length: daySpan,
                            fullSequence: [...truncFullSeq]
                        };
                    }
                }
            }
        } else {
            // Regular patterns & TienLuiSoLe: Mốc = ngày đang chọn (prevDate)
            // Tìm streak CHỨA prevDate (startDate <= prevDate AND endDate >= prevDate)
            let streak = categoryData.streaks.find(s => {
                const start = parseDate(s.startDate);
                const end = parseDate(s.endDate);
                return start && end && start <= prevDate && end >= prevDate;
            });

            if (streak) {
                // Truncate: chỉ giữ dates <= prevDate
                const truncDates = streak.dates.filter(d => parseDate(d) <= prevDate);
                const truncValues = streak.values ? streak.values.slice(0, truncDates.length) : [];
                // Build fullSequence from rawData nếu streak không có sẵn
                const baseFullSeq = (streak.fullSequence && streak.fullSequence.length > 0)
                    ? streak.fullSequence
                    : buildFullSequenceFromRaw(streak);
                const truncFullSeq = baseFullSeq.filter(item => parseDate(item.date) <= prevDate);

                if (truncDates.length >= 1) {
                    const startD = parseDate(truncDates[0]);
                    const endD = parseDate(truncDates[truncDates.length - 1]);
                    const daySpan = Math.floor((endD - startD) / (1000 * 60 * 60 * 24)) + 1;

                    current = {
                        startDate: truncDates[0],
                        endDate: truncDates[truncDates.length - 1],
                        dates: truncDates,
                        values: truncValues,
                        length: daySpan,
                        fullSequence: truncFullSeq
                    };

                    // TienLuiSoLe phải >= 4 ngày
                    if (isTienLuiSoLe && current.length < 4) {
                        current = null;
                    }
                }
            }
        }

        // Tính exactGapStats và gapStats (dùng để xác định freq + drop-off rate)
        const exactGapStats = {};
        const gapStats = {};
        const maxLen = longestLength;
        const calcLimit = maxLen + 1;

        for (let len = 1; len <= calcLimit; len++) {
            // exactGapStats: chính xác == len
            const exactStreaks = historicalStreaks.filter(s => s.length === len);
            exactGapStats[len] = { count: exactStreaks.length, pastCount: exactStreaks.length };

            // gapStats: >= len (dùng cho drop-off rate)
            const geStreaks = historicalStreaks.filter(s => s.length >= len);
            gapStats[len] = { count: geStreaks.length, pastCount: geStreaks.length };
        }

        const lengthHistoryMetrics = buildIndexedLengthHistoryMetrics(historicalStreaks, historyBasisDate, calcLimit);

        // Tính computedMaxStreak (freq <= 1.5)
        let startLen = 2;
        let increment = 1;
        if (isSoLePattern) { startLen = 3; increment = 2; }
        else if (isTienLuiSoLe) { startLen = 4; increment = 1; }

        let computedMaxStreak = longestLength;
        let isSuperMaxThreshold = false;
        for (let len = startLen; len <= calcLimit; len += increment) {
            const cnt = exactGapStats[len] ? exactGapStats[len].count : 0;
            const freqYear = totalYears > 0 ? cnt / totalYears : 0;
            if (freqYear <= 1.5) {
                computedMaxStreak = len;
                isSuperMaxThreshold = freqYear <= 0.5;
                break;
            }
        }

        let isPotentialRecord = false;
        if (!current && computedMaxStreak === 2 && !isSoLePattern && !isTienLuiSoLe) {
            const isGeneric = (key.includes('veLienTiep') || key.includes('veCungGiaTri') || key.includes('dongTien') || key.includes('dongLui'));
            const isSingleChar = (key.startsWith('cacDau') || key.startsWith('motDau') || key.startsWith('cacDit') || key.startsWith('motDit'));

            if (isGeneric || isSingleChar) {
                const todayStreak = historicalStreaks.find(s => s.endDate === prevDateStr && s.length === 1);
                if (todayStreak) {
                    const potentialCurrent = {
                        ...todayStreak,
                        isPotential: true,
                        length: 1
                    };
                    current = {
                        ...potentialCurrent,
                        patternNumbers: attachPatternNumbers(potentialCurrent, key)
                    };
                    isPotentialRecord = true;
                }
            }
        }

        quickStats[key] = {
            description: categoryData.description,
            longest,
            secondLongest,
            current,
            computedMaxStreak,
            isSuperMaxThreshold,
            isPotentialRecord,
            exactGapStats,
            gapStats, // Proper >= counts for drop-off rate calculation
            lengthHistoryMetrics,
            historyMetrics
        };
    };

    for (const key in allStats) {
        const categoryData = allStats[key];
        if (categoryData && Array.isArray(categoryData.streaks)) {
            analyzeCategory(key, categoryData);
        } else if (categoryData && typeof categoryData === 'object') {
            for (const subKey in categoryData) {
                const sub = categoryData[subKey];
                if (sub && Array.isArray(sub.streaks)) {
                    analyzeCategory(`${key}:${subKey}`, sub);
                }
            }
        }
    }

    augmentPotentialStreaksForDate(quickStats, targetDateStr);
    quickStats._meta = { totalYears };
    return quickStats;
}

// ==== MAIN FUNCTION ====
// Delegate sang exclusionLogicService.getDropOffExclusions() - SINGLE SOURCE OF TRUTH
const exclusionLogic = require('./exclusionLogicService');

/**
 * Tính exclusions cho một ngày cụ thể dựa trên quickStats lịch sử tại thời điểm đó.
 * Sử dụng phương pháp duy nhất: Drop-off >= 85%
 * 
 * @param {string} targetDateStr - 'dd/mm/yyyy'
 * @param {number} totalYears
 * @returns {Object}
 */
function getExclusionsForDate(targetDateStr, totalYears) {
    const quickStats = computeQuickStatsForDate(targetDateStr, totalYears);
    const result = exclusionLogic.getDropOffExclusions(quickStats);

    return {
        toBet: result.skipped ? [] : result.toBet,
        toBetPlus: result.skipped ? [] : result.toBet, // Cung 1 logic, khong phan biet Plus
        excluded: result.excluded,
        excludedPlus: result.excluded,
        skipped: result.skipped,
        skippedPlus: result.skipped,
        totalBet4: result.toBet.length,
        totalBet3: result.toBet.length
    };
}

/**
 * Phien ban cache - dung cho backtest nhieu ngay
 */
function getExclusionsForDateCached(targetDateStr, totalYears) {
    if (_dateCache.has(targetDateStr)) {
        return _dateCache.get(targetDateStr);
    }
    const result = getExclusionsForDate(targetDateStr, totalYears);
    _dateCache.set(targetDateStr, result);
    return result;
}

function clearCache() {
    _allStats = null;
    _fastStatsIndex = null;
    _dateCache.clear();
    _parsedDateCache.clear();
    _fullSequenceCache.clear();
}

function clearStaticHistoryCaches() {
    if (!_fastStatsIndex || !_fastStatsIndex.entriesByKey) return;
    for (const entry of _fastStatsIndex.entriesByKey.values()) {
        if (entry && entry.staticHistoryCache) {
            entry.staticHistoryCache.clear();
        }
    }
}

module.exports = {
    loadAllStats,
    getExclusionsForDate,
    getExclusionsForDateCached,
    computeQuickStatsForDate,
    computeQuickStatsForDateFast,
    clearStaticHistoryCaches,
    clearCache,
    parseDate,
    formatDate
};
