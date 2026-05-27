const lotteryService = require('./lotteryService');
const {
    isSoLeTheoCapCategory,
    getSoLeTheoCapLabel,
    formatSoLeTheoCapPairValue
} = require('../utils/soLeTheoCapPairs');

let cachedStats = null;
let cachedQuickStats = null;
let cachedQuickStatsHistory = null;
let latestDate = null;
let augmentedQuickStatsSource = null;
let augmentedQuickStatsCache = null;
let activeStreaksSource = null;
let activeStreaksCache = null;
let hydratedHistorySource = null;
let hydratedHistoryCache = null;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
let historyMetricsCache = new Map();
let rawDataDateToIndexMap = null;

function roundOne(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.round(number * 10) / 10;
}

function clamp(value, min = 0, max = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
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

function daysBetween(from, to) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (!fromDate || !toDate) return null;
    return Math.round((toDate - fromDate) / MS_PER_DAY);
}

function getLoadedStatsDataSync() {
    try {
        const numberStats = lotteryService.getNumberStats() || {};
        const headTailStats = lotteryService.getHeadTailStats() || {};
        const sumDiffStats = lotteryService.getSumDiffStats() || {};
        return { ...numberStats, ...headTailStats, ...sumDiffStats };
    } catch (error) {
        return {};
    }
}

function getLatestDateFromRawSync() {
    if (latestDate) return latestDate;
    const rawData = lotteryService.getRawData();
    const lastEntry = rawData && rawData.length > 0 ? rawData[rawData.length - 1] : null;
    if (!lastEntry || !lastEntry.date) return null;
    return formatToDDMMYYYY(lastEntry.date);
}

function getCategoryDataByKey(key) {
    const allStats = cachedStats || getLoadedStatsDataSync();
    if (!allStats || !key) return null;
    if (key.includes(':')) {
        const [category, subcategory] = key.split(':');
        return allStats[category] && allStats[category][subcategory] ? allStats[category][subcategory] : null;
    }
    return allStats[key] || null;
}

function computeHistoryMetricsForKey(key, basisDateStr = null) {
    const cacheKey = `${key}|${basisDateStr || ''}`;
    if (historyMetricsCache.has(cacheKey)) return historyMetricsCache.get(cacheKey);

    const categoryData = getCategoryDataByKey(key);
    const streaks = categoryData && Array.isArray(categoryData.streaks) ? categoryData.streaks : [];
    const valid = streaks.filter(item => item && Number.isFinite(Number(item.length)) && Number(item.length) > 0);
    if (valid.length === 0) {
        const empty = {
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
        historyMetricsCache.set(cacheKey, empty);
        return empty;
    }

    const lengths = valid.map(item => Number(item.length));
    const avgLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const sortedByStart = valid.filter(item => item.startDate);
    const sortedByEnd = valid.filter(item => item.endDate);

    const gaps = [];
    for (let i = 1; i < sortedByStart.length; i++) {
        const gap = daysBetween(sortedByStart[i - 1].startDate, sortedByStart[i].startDate);
        if (gap !== null && gap >= 0) gaps.push(gap);
    }

    const latestEndDate = sortedByEnd.length > 0 ? sortedByEnd[sortedByEnd.length - 1].endDate : '';
    const basisDate = basisDateStr || getLatestDateFromRawSync();
    const metrics = {
        occurrences: valid.length,
        avgLength: roundOne(avgLength),
        avgGapDays: gaps.length > 0 ? roundOne(gaps.reduce((sum, value) => sum + value, 0) / gaps.length) : null,
        latestEndDate,
        daysSinceLatestEnd: latestEndDate && basisDate ? daysBetween(latestEndDate, basisDate) : null
    };
    historyMetricsCache.set(cacheKey, metrics);
    return metrics;
}

function computeLengthHistoryMetricsForKey(key, targetLen, basisDateStr = null) {
    const length = Number(targetLen);
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

    const cacheKey = `${key}|target:${length}|${basisDateStr || ''}`;
    if (historyMetricsCache.has(cacheKey)) return historyMetricsCache.get(cacheKey);

    const categoryData = getCategoryDataByKey(key);
    const basisDate = basisDateStr || getLatestDateFromRawSync();
    const basis = basisDate ? parseDate(basisDate) : null;
    const sourceStreaks = categoryData && Array.isArray(categoryData.streaks) ? categoryData.streaks : [];
    const valid = sourceStreaks
        .filter(item => item && Number(item.length) >= length && item.startDate && item.endDate)
        .filter(item => {
            if (!basis) return true;
            const end = parseDate(item.endDate);
            return end && end <= basis;
        });

    if (valid.length === 0) {
        const empty = {
            targetLength: length,
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
        historyMetricsCache.set(cacheKey, empty);
        return empty;
    }

    const lengths = valid.map(item => Number(item.length));
    const avgLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const sortedByStart = valid;
    const sortedByEnd = valid;

    const gaps = [];
    for (let i = 1; i < sortedByStart.length; i++) {
        const gap = daysBetween(sortedByStart[i - 1].endDate, sortedByStart[i].startDate);
        if (gap !== null && gap >= 0) gaps.push(gap);
    }

    const latestEndDate = sortedByEnd.length > 0 ? sortedByEnd[sortedByEnd.length - 1].endDate : '';
    const metrics = {
        targetLength: length,
        occurrences: valid.length,
        avgLength: roundOne(avgLength),
        avgGapDays: gaps.length > 0 ? roundOne(gaps.reduce((sum, value) => sum + value, 0) / gaps.length) : null,
        latestEndDate,
        daysSinceLatestEnd: latestEndDate && basisDate ? daysBetween(latestEndDate, basisDate) : null
    };
    historyMetricsCache.set(cacheKey, metrics);
    return metrics;
}

function buildLengthHistoryMetricsForKey(key, maxLen, basisDateStr = null) {
    const limit = Math.max(1, Number(maxLen) || 1);
    const categoryData = getCategoryDataByKey(key);
    const sourceStreaks = categoryData && Array.isArray(categoryData.streaks) ? categoryData.streaks : [];
    const basisDate = basisDateStr || getLatestDateFromRawSync();
    const basis = basisDate ? parseDate(basisDate) : null;

    // Filter and pre-parse valid streaks that are <= basis
    const filteredStreaks = [];
    for (let i = 0; i < sourceStreaks.length; i++) {
        const item = sourceStreaks[i];
        if (!item || !item.startDate || !item.endDate || !Number.isFinite(Number(item.length))) continue;
        if (basis) {
            const end = parseDate(item.endDate);
            if (!end || end > basis) continue;
        }
        filteredStreaks.push(item);
    }

    const metrics = {};
    for (let len = 1; len <= limit; len++) {
        // Find valid streaks with length >= len
        const valid = [];
        let totalLength = 0;
        for (let i = 0; i < filteredStreaks.length; i++) {
            const item = filteredStreaks[i];
            if (Number(item.length) >= len) {
                valid.push(item);
                totalLength += Number(item.length);
            }
        }

        if (valid.length === 0) {
            metrics[len] = {
                targetLength: len,
                occurrences: 0,
                avgLength: null,
                avgGapDays: null,
                latestEndDate: '',
                daysSinceLatestEnd: null
            };
            continue;
        }

        const avgLength = totalLength / valid.length;
        const gaps = [];
        for (let i = 1; i < valid.length; i++) {
            const gap = daysBetween(valid[i - 1].endDate, valid[i].startDate);
            if (gap !== null && gap >= 0) gaps.push(gap);
        }

        const latestEndDate = valid[valid.length - 1].endDate;
        metrics[len] = {
            targetLength: len,
            occurrences: valid.length,
            avgLength: roundOne(avgLength),
            avgGapDays: gaps.length > 0 ? roundOne(gaps.reduce((sum, value) => sum + value, 0) / gaps.length) : null,
            latestEndDate,
            daysSinceLatestEnd: latestEndDate && basisDate ? daysBetween(latestEndDate, basisDate) : null
        };
    }
    return metrics;
}

function buildReliabilityForCurrent(key, stat, current, basisDateStr = null) {
    if (!stat || !current) return null;
    const { subcategory } = parseStatsKey(key);
    const step = getPotentialStep(key, subcategory);
    const currentLen = Number(current.length || 0);
    const isPotential = !!current.isPotential;
    const evalLen = isPotential ? currentLen + step : currentLen;
    if (!evalLen || evalLen <= 0) return null;

    const gapStats = stat.gapStats || current.gapStats || {};
    const currentInfo = gapStats[isPotential ? currentLen : evalLen];
    const formInfo = isPotential ? gapStats[evalLen] : null;
    const nextInfo = gapStats[evalLen + step];
    const sampleSize = currentInfo ? Number(currentInfo.count || 0) : 0;
    const formedCount = formInfo ? Number(formInfo.count || 0) : 0;
    const continuedCount = nextInfo ? Number(nextInfo.count || 0) : 0;
    const totalHistoricalDays = Math.max(1, Math.round(lotteryService.getTotalYears() * 365.25));
    const hasConditionalPrefixSample = isPotential && sampleSize > formedCount;
    const effectiveSampleSize = isPotential && !hasConditionalPrefixSample ? totalHistoricalDays : sampleSize;
    const breakCount = isPotential
        ? Math.max(0, effectiveSampleSize - formedCount)
        : Math.max(0, effectiveSampleSize - continuedCount);
    const dropOffRate = effectiveSampleSize > 0 ? breakCount / effectiveSampleSize : 0;
    const formationRate = isPotential && effectiveSampleSize > 0 ? formedCount / effectiveSampleSize : null;
    const afterFormationDropOffRate = isPotential && formedCount > 0
        ? Math.max(0, formedCount - continuedCount) / formedCount
        : null;
    const lowerBound = wilsonLowerBound(breakCount, effectiveSampleSize);
    const history = stat.historyMetrics || current.historyMetrics || computeHistoryMetricsForKey(key, basisDateStr);

    const sampleScore = clamp(Math.log10(effectiveSampleSize + 1) / Math.log10(100));
    const recencyScore = history.daysSinceLatestEnd === null || history.daysSinceLatestEnd === undefined
        ? 0.45
        : clamp(1 / (1 + Math.max(0, Number(history.daysSinceLatestEnd) || 0) / 365));
    const cadenceRatio = history.avgGapDays && history.daysSinceLatestEnd !== null && history.daysSinceLatestEnd !== undefined
        ? Math.max(0, Number(history.daysSinceLatestEnd) || 0) / Number(history.avgGapDays)
        : null;
    const cadenceScore = cadenceRatio === null
        ? 0.5
        : (cadenceRatio <= 1 ? clamp(0.45 + cadenceRatio * 0.55) : clamp(1 - Math.min(0.35, (cadenceRatio - 1) * 0.12)));
    const lengthScore = history.avgLength
        ? clamp(evalLen / Math.max(Number(history.avgLength), 1) / 1.5)
        : 0.5;
    const reliabilityScore = Math.round((
        lowerBound * 0.48 +
        dropOffRate * 0.18 +
        sampleScore * 0.18 +
        recencyScore * 0.08 +
        cadenceScore * 0.04 +
        lengthScore * 0.04
    ) * 100);

    return {
        score: reliabilityScore,
        sampleSize: effectiveSampleSize,
        rawSampleSize: isPotential ? sampleSize : null,
        usesFrequencyFallback: isPotential && !hasConditionalPrefixSample,
        continuedCount,
        breakCount,
        dropOffRate,
        exclusionRate: dropOffRate,
        dropOffPercent: roundOne(dropOffRate * 100),
        formationRate,
        formationPercent: formationRate === null ? null : roundOne(formationRate * 100),
        formationCount: isPotential ? formedCount : null,
        afterFormationDropOffRate,
        afterFormationDropOffPercent: afterFormationDropOffRate === null ? null : roundOne(afterFormationDropOffRate * 100),
        lowerBound,
        lowerBoundPercent: roundOne(lowerBound * 100),
        evalLength: evalLen,
        nextLength: evalLen + step,
        step,
        occurrences: history.occurrences || 0,
        avgLength: history.avgLength,
        avgGapDays: history.avgGapDays,
        latestEndDate: history.latestEndDate || '',
        daysSinceLatestEnd: history.daysSinceLatestEnd,
        sampleScore: roundOne(sampleScore * 100),
        recencyScore: roundOne(recencyScore * 100),
        cadenceScore: roundOne(cadenceScore * 100),
        lengthScore: roundOne(lengthScore * 100)
    };
}

/**
 * Đọc và hợp nhất dữ liệu từ tất cả các file thống kê.
 */
async function getStatsData() {
    // Ensure raw data is loaded (needed for hydrateStreak)
    let rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) {
        await lotteryService.loadRawData();
    }

    // 1. Kiểm tra cache trước tiên
    if (cachedStats) {
        console.log('[CACHE] Sử dụng dữ liệu statistic từ cache.');
        return cachedStats;
    }

    // 2. Nếu cache trống, đọc file và tạo cache mới
    try {
        console.log('[CACHE] Cache trống, đang đọc dữ liệu thống kê từ lotteryService...');
        
        // OPTIMIZATION: Auto-trigger loadRawData() và loadStats() nếu chưa có
        let rawData = lotteryService.getRawData();
        if (!rawData || rawData.length === 0) {
            console.log('[CACHE] Raw data chưa load, đang gọi lotteryService.loadRawData()...');
            await lotteryService.loadRawData();
        }

        let numberStats = lotteryService.getNumberStats();
        if (!numberStats || Object.keys(numberStats).length === 0) {
            console.log('[CACHE] Stats chưa load, đang gọi lotteryService.loadStats()...');
            await lotteryService.loadStats();
            numberStats = lotteryService.getNumberStats() || {};
        }
        const headTailStats = lotteryService.getHeadTailStats() || {};
        const sumDiffStats = lotteryService.getSumDiffStats() || {};

        // Nạp dữ liệu vào cache
        cachedStats = { ...numberStats, ...headTailStats, ...sumDiffStats };
        preParseStreakDates(cachedStats);
        console.log('[CACHE] Đã nạp thành công dữ liệu statistic mới vào cache.');
        return cachedStats;

    } catch (error) {
        console.error('Lỗi khi đọc hoặc phân tích file thống kê:', error);
        return {}; // Trả về đối tượng rỗng nếu có lỗi
    }
}

function preParseStreakDates(allStats) {
    const processCategoryData = (catData) => {
        if (!catData || !Array.isArray(catData.streaks)) return;
        for (let i = 0; i < catData.streaks.length; i++) {
            const s = catData.streaks[i];
            if (s) {
                if (s.startDate && !s._startD) s._startD = parseDate(s.startDate);
                if (s.endDate && !s._endD) s._endD = parseDate(s.endDate);
            }
        }
    };

    for (const key in allStats) {
        const val = allStats[key];
        if (!val) continue;
        if (Array.isArray(val.streaks)) {
            processCategoryData(val);
        } else if (typeof val === 'object') {
            for (const subKey in val) {
                processCategoryData(val[subKey]);
            }
        }
    }
}

// === HÀM MỚI ĐỂ XÓA CACHE ===
function clearCache() {
    console.log('[CACHE] Xóa cache thống kê...');
    cachedStats = null;
    cachedQuickStats = null;
    cachedQuickStatsHistory = null;
    latestDate = null;
    augmentedQuickStatsSource = null;
    augmentedQuickStatsCache = null;
    activeStreaksSource = null;
    activeStreaksCache = null;
    hydratedHistorySource = null;
    hydratedHistoryCache = null;
    historyMetricsCache = new Map();
    rawDataDateToIndexMap = null;
};

/**
 * Lấy ngày mới nhất từ dữ liệu gốc
 */
async function getLatestDate() {
    if (latestDate && process.env.NODE_ENV !== 'development') {
        return latestDate;
    }
    try {
        let data = lotteryService.getRawData();
        if (!data || data.length === 0) {
            await lotteryService.loadRawData();
            data = lotteryService.getRawData();
        }
        if (!data || data.length === 0) return null;
        const lastEntry = data[data.length - 1];
        if (lastEntry && lastEntry.date) {
            const d = new Date(lastEntry.date);
            latestDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            return latestDate;
        }
        return null;
    } catch (error) {
        console.error('Không thể đọc ngày mới nhất:', error);
        return null;
    }
}

/**
 * Lấy kết quả xổ số gần đây (mặc định 7 ngày)
 */
async function getRecentResults(limit = 7) {
    try {
        let data = lotteryService.getRawData();
        if (!data || data.length === 0) {
            await lotteryService.loadRawData();
            data = lotteryService.getRawData();
        }
        if (!data) return [];
        const recentData = data.slice(-limit);
        return recentData;
    } catch (error) {
        console.error('Lỗi khi lấy kết quả gần đây:', error);
        return [];
    }
}


/**
 * Hàm tiện ích để chuyển đổi chuỗi ngày 'dd/mm/yyyy' thành đối tượng Date
 */
function parseDate(dateString) {
    if (!dateString) return null;
    // Handle YYYY-MM-DD format (from DB/rawData)
    if (dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length >= 3) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].substring(0, 2)));
        }
        return null;
    }
    // Handle DD/MM/YYYY format
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

function getRawDataDateToIndexMap() {
    if (rawDataDateToIndexMap) return rawDataDateToIndexMap;
    const rawData = lotteryService.getRawData() || [];
    const map = new Map();
    const formatToDDMMYYYY = (dateStr) => {
        if (!dateStr) return '';
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            const year = parts[0];
            const month = parts[1];
            const day = parts[2].substring(0, 2);
            return `${day}/${month}/${year}`;
        }
        return dateStr;
    };
    for (let i = 0; i < rawData.length; i++) {
        const item = rawData[i];
        if (item && item.date) {
            const standardDate = formatToDDMMYYYY(item.date);
            map.set(standardDate, i);
        }
    }
    rawDataDateToIndexMap = map;
    return map;
}

/**
 * Hydrate (phục hồi) dữ liệu chi tiết của streak (fullSequence, dates, values) 
 * từ rawData, dùng khi load stats từ DB đã được minify.
 */
function hydrateStreak(streak, categoryName = '') {
    if (!streak || !streak.startDate || !streak.endDate) return streak;
    // LUÔN re-hydrate để đảm bảo fullSequence có format date DD/MM/YYYY chuẩn

    const rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) return streak;

    const dateMap = getRawDataDateToIndexMap();
    const startIndex = dateMap.has(streak.startDate) ? dateMap.get(streak.startDate) : -1;
    const endIndex = dateMap.has(streak.endDate) ? dateMap.get(streak.endDate) : -1;

    const formatToDDMMYYYY = (dateStr) => {
        if (!dateStr) return '';
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            const year = parts[0];
            const month = parts[1];
            const day = parts[2].substring(0, 2);
            return `${day}/${month}/${year}`;
        }
        return dateStr;
    };
    
    if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
        // Ta cần map rawData (mà có key 'special') về cấu trúc { date, value } để frontend xử lý bình thường
        // QUAN TRỌNG: date PHẢI là DD/MM/YYYY vì frontend dùng format này để render bong bóng
        const fSeq = rawData.slice(startIndex, endIndex + 1).map(item => ({
            date: formatToDDMMYYYY(item.date),
            value: item.special !== null ? String(item.special).padStart(2, '0') : null
        })).filter(i => i.value !== null);

        const isSoLe = categoryName && categoryName.toLowerCase().includes('sole') &&
            !categoryName.toLowerCase().includes('tienluisole') &&
            !categoryName.toLowerCase().includes('luitiensole') &&
            !categoryName.toLowerCase().includes('soletheocap');

        // Đối với chuỗi So le, ngày tiếp theo của endDate chính là ngày xen kẽ (gap day)
        // Ta tự động nối vào fullSequence để UI hiển thị viền đứt nét (dù là ở current hay history)
        if (isSoLe && endIndex + 1 < rawData.length) {
            const nextItem = rawData[endIndex + 1];
            if (nextItem && nextItem.special !== null && nextItem.special !== undefined) {
                fSeq.push({
                    date: formatToDDMMYYYY(nextItem.date),
                    value: String(nextItem.special).padStart(2, '0'),
                    isLatest: true
                });
            }
        }


        let actualDates = streak.dates;
        let actualValues = streak.values;

        if (!actualDates || !actualValues) {
            if (isSoLe) {
                actualDates = [];
                actualValues = [];
                for (let i = startIndex; i <= endIndex; i += 2) {
                    const item = rawData[i];
                    if (item && item.special !== null) {
                        actualDates.push(formatToDDMMYYYY(item.date));
                        actualValues.push(String(item.special).padStart(2, '0'));
                    }
                }
            } else {
                actualDates = fSeq.map(i => i.date);
                actualValues = fSeq.map(i => i.value);
            }
        }

        return {
            ...streak,
            fullSequence: fSeq,
            dates: actualDates,
            values: actualValues
        };
    }
    return streak;
}

/**
 * Lấy và lọc các chuỗi thống kê
 */
async function getFilteredStreaks(category, subcategory, filters = {}) {
    let statsData;
    let finalStreaks = []; // Khai báo ở đây để đảm bảo luôn tồn tại

    const { getCategoryStats, shouldUseSupabaseDbStats } = require('../data-access');
    if (shouldUseSupabaseDbStats()) {
        const sumDiffPrefixes = ['tong_tt', 'tong_moi', 'hieu'];
        const isSumDiff = sumDiffPrefixes.some(p => category.startsWith(p));
        const numberCategories = [
            'motSoVeLienTiep', 'motSoVeSole', 'motSoVeSoleMoi',
            'motSoTienLienTiep', 'motSoTienDeuLienTiep', 'motSoLuiLienTiep', 'motSoLuiDeuLienTiep',
            'cacSoTienLienTiep', 'cacSoTienDeuLienTiep', 'cacSoLuiLienTiep', 'cacSoLuiDeuLienTiep',
            'cacSoVeLienTiep', 'cacSoVeSole', 'cacSoVeSoleMoi',
            'cacDauVeLienTiep', 'cacDauVeSole', 'cacDauVeSoleMoi',
            'cacDauTienLienTiep', 'cacDauTienDeuLienTiep', 'cacDauLuiLienTiep', 'cacDauLuiDeuLienTiep',
            'cacDitVeLienTiep', 'cacDitVeSole', 'cacDitVeSoleMoi',
            'cacDitTienLienTiep', 'cacDitTienDeuLienTiep', 'cacDitLuiLienTiep', 'cacDitLuiDeuLienTiep'
        ];
        const bucket = numberCategories.includes(category) ? 'number' : (isSumDiff ? 'sum_diff' : 'head_tail');
        
        const dbResult = await getCategoryStats(bucket, category, subcategory);
        if (dbResult) {
            // For nested, getCategoryStats(..., subcategory) returns { [subcategory]: { ... } }
            // For flat, it returns { description: "...", streaks: [...] }
            if (subcategory && dbResult[subcategory]) {
                statsData = dbResult[subcategory];
            } else {
                statsData = dbResult;
            }
        }
    } else {
        const allStats = await getStatsData();
        if (subcategory && allStats[category] && allStats[category][subcategory]) {
            statsData = allStats[category][subcategory];
        } else if (allStats[category]) {
            statsData = allStats[category];
        }
    }

    if (!statsData || !statsData.streaks) {
        return { description: 'Không tìm thấy dữ liệu', streaks: [] };
    }

    finalStreaks = statsData.streaks;

    if (filters.startDate) {
        const start = parseDate(filters.startDate);
        if (start) finalStreaks = finalStreaks.filter(s => parseDate(s.startDate) >= start);
    }
    if (filters.endDate) {
        const end = parseDate(filters.endDate);
        if (end) finalStreaks = finalStreaks.filter(s => parseDate(s.endDate) <= end);
    }
    if (filters.minLength && filters.minLength !== 'all') {
        // === SỬA LỖI CHÍNH TẠI ĐÂY ===
        // Thay đổi toán tử so sánh từ >= thành == để lọc chính xác.
        finalStreaks = finalStreaks.filter(s => s.length == filters.minLength);
    }

    // 🔥 HYDRATE STREAKS SO FRONTEND HAS FULLSEQUENCE AND VALUES TO RENDER BUBBLES
    finalStreaks = finalStreaks.map(s => hydrateStreak(s, category));

    try {
        const { predictNextInSequence } = require('../controllers/suggestionsController');
        finalStreaks = finalStreaks.map(streak => {
            const statObj = { current: { values: streak.values.map(String) } };
            const nums = predictNextInSequence(statObj, category, subcategory || '', true); // true = isHistory
            return { ...streak, patternNumbers: nums && nums.length < 100 ? nums : [] };
        });
    } catch (e) {
        console.error('Error attaching patternNumbers in getFilteredStreaks:', e);
    }

    return {
        description: statsData.description,
        streaks: finalStreaks
    };
};


/**
 * Lấy dữ liệu cho phần Thống kê kỷ lục
 */
async function getQuickStats() {
    if (cachedQuickStats) return cachedQuickStats;

    const allStats = await getStatsData();
    const quickStats = {};
    latestDate = await getLatestDate();
    const today = latestDate ? parseDate(latestDate) : new Date();
    const latestLotteryDay = await getLatestLotteryResult();

    const analyzeCategory = (key, categoryData) => {
        if (!categoryData || !Array.isArray(categoryData.streaks) || categoryData.streaks.length === 0) {
            return;
        }

        const streaks = [...categoryData.streaks].sort((a, b) => b.length - a.length);
        const longest = streaks.filter(s => s.length === streaks[0].length).map(s => hydrateStreak(s, key));

        let secondLongest = [];
        const longestLength = streaks[0].length;
        for (let i = 0; i < streaks.length; i++) {
            if (streaks[i].length < longestLength) {
                const secondLength = streaks[i].length;
                secondLongest = streaks.filter(s => s.length === secondLength).map(s => hydrateStreak(s, key));
                break;
            }
        }

        // Xác định chuỗi hiện tại (đang diễn ra)
        let current = null;
        if (latestDate) {
            const isSoLe = key.toLowerCase().includes('sole') &&
                !key.toLowerCase().includes('tienluisole') &&
                !key.toLowerCase().includes('luitiensole') &&
                !key.toLowerCase().includes('soletheocap');
            const isTienLuiSoLe = key.toLowerCase().includes('tienluisole') || key.toLowerCase().includes('luitiensole');

            if (isSoLe) {
                // So le: latestDate LUÔN là ngày xen kẽ (gap day)
                // Chỉ hiện chuỗi có ngày active cuối = yesterday (endDate === yesterday)
                // → Dự đoán cho ngày tiếp theo (latestDate + 1 = ngày active tiếp theo)
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = `${String(yesterday.getDate()).padStart(2, '0')}/${String(yesterday.getMonth() + 1).padStart(2, '0')}/${yesterday.getFullYear()}`;

                const rawStreak = categoryData.streaks.find(s => s.endDate === yesterdayStr);
                if (rawStreak) {
                    const streak = hydrateStreak(rawStreak, key);
                    const isSoLeMoi = key.toLowerCase().includes('solemoi') || key.toLowerCase().includes('sole_moi');
                    let isValid = true;

                    // Validate So le mới: ngày xen kẽ (latestDate) KHÔNG được trùng pattern
                    if (isSoLeMoi && latestLotteryDay && latestLotteryDay.special) {
                        try {
                            const { predictNextInSequence } = require('../controllers/suggestionsController');
                            const [categoryName, subcategoryStr] = key.split(':');
                            const matchNumbers = predictNextInSequence({ current: streak }, categoryName, subcategoryStr || '');
                            if (matchNumbers && matchNumbers.length > 0) {
                                const stringNumbers = matchNumbers.map(n => String(n).padStart(2, '0'));
                                const specialNum = String(latestLotteryDay.special).padStart(2, '0');
                                if (stringNumbers.includes(specialNum)) {
                                    // Ngày xen kẽ bị trùng kết quả -> Bị GÃY CHUỖI So le mới
                                    isValid = false;
                                }
                            }
                        } catch (e) {
                            console.error('Lỗi khi validate So le mới:', e);
                        }
                    }

                    if (isValid) {
                        current = {
                            ...streak,
                            fullSequence: streak.fullSequence ? [...streak.fullSequence] : []
                        };
                    }
                }
            } else if (isTienLuiSoLe) {
                // Với Tiến Lùi So Le: Chỉ lấy chuỗi kết thúc hôm nay (như các dạng khác)
                // VÀ phải có độ dài >= 4 (theo yêu cầu người dùng)
                const s = categoryData.streaks.find(s => s.endDate === latestDate && s.length >= 4);
                if (s) current = hydrateStreak(s, key);
            } else {
                // Với dạng khác: Chuỗi đang diễn ra = kết thúc đúng ngày mới nhất
                const s = categoryData.streaks.find(s => s.endDate === latestDate);
                if (s) current = hydrateStreak(s, key);
            }
        }

        // Tính toán khoảng cách trung bình chung (như cũ)
        const streaksByDate = categoryData.streaks;
        let totalInterval = 0;
        let daysSinceLast = 'N/A';

        if (streaksByDate.length > 1) {
            for (let i = 1; i < streaksByDate.length; i++) {
                const prevEndDate = parseDate(streaksByDate[i - 1].endDate);
                const currStartDate = parseDate(streaksByDate[i].startDate);
                const diffTime = Math.abs(currStartDate - prevEndDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                totalInterval += diffDays;
            }
        }

        const averageInterval = streaksByDate.length > 1 ? Math.round(totalInterval / (streaksByDate.length - 1)) : 0;

        if (latestDate && streaksByDate.length > 0) {
            const lastStreakEndDate = parseDate(streaksByDate[streaksByDate.length - 1].endDate);
            if (today && lastStreakEndDate) {
                const diffTime = Math.abs(today - lastStreakEndDate);
                daysSinceLast = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            }
        }

        // === TÍNH TOÁN GAP STATS CHI TIẾT CHO TỪNG ĐỘ DÀI ===
        const gapStats = {};
        const exactGapStats = {}; // NEW: Thống kê cho độ dài chính xác
        const maxLen = longestLength > 0 ? longestLength : 0;
        const calcLimit = maxLen + 1;

        // Detect if this is a "so le" pattern
        const isSoLePattern = (key.toLowerCase().includes('sole') || key.toLowerCase().includes('solemoi')) &&
            !key.toLowerCase().includes('tienluisole') &&
            !key.toLowerCase().includes('luitiensole') &&
            !key.toLowerCase().includes('soletheocap');

        // Helper function to calculate stats for a set of streaks
        // currentStreakInfo: the ongoing current streak (if any) to exclude from calculations
        const calculateGapStatsForStreaks = (streaks, isSoLe, currentStreakInfo = null) => {
            // Filter out the current streak from calculations
            const filteredStreaks = currentStreakInfo
                ? streaks.filter(s => !(s.startDate === currentStreakInfo.startDate && s.endDate === currentStreakInfo.endDate))
                : streaks;

            // Calculate cutoff date (1 day before current streak started) to exclude overlapping streaks
            let cutoffTime = null;
            if (currentStreakInfo && currentStreakInfo.startDate) {
                const cutoffDate = currentStreakInfo._startD || parseDate(currentStreakInfo.startDate);
                if (cutoffDate) {
                    cutoffTime = cutoffDate.getTime() - 86400000;
                }
            }

            // Only include streaks that ended before the cutoff (if there's a current streak)
            const validStreaks = cutoffTime !== null
                ? filteredStreaks.filter(s => {
                    const endD = s._endD || parseDate(s.endDate);
                    return endD && endD.getTime() <= cutoffTime;
                })
                : filteredStreaks;

            if (validStreaks.length < 1) {
                return { avgGap: 0, lastGap: 0, minGap: null, count: 0, pastCount: 0 };
            }

            if (validStreaks.length < 2) {
                let lastGap = 0;
                const lastEnd = validStreaks[0]._endD || parseDate(validStreaks[0].endDate);

                // Calculate lastGap to current streak's start (if exists) or to tomorrow
                if (currentStreakInfo && currentStreakInfo.startDate) {
                    const startD = currentStreakInfo._startD || parseDate(currentStreakInfo.startDate);
                    if (startD && lastEnd) lastGap = Math.ceil((startD - lastEnd) / 86400000);
                } else if (lastEnd) {
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    lastGap = Math.ceil((tomorrow - lastEnd) / 86400000);
                }

                return { avgGap: 0, lastGap, minGap: null, count: validStreaks.length, pastCount: validStreaks.length };
            }

            // Calculate individual gaps between consecutive streaks
            // Gap = startDate of next streak - endDate of previous streak
            const gaps = [];
            for (let i = 0; i < validStreaks.length - 1; i++) {
                const prevEnd = validStreaks[i]._endD || parseDate(validStreaks[i].endDate);
                const nextStart = validStreaks[i + 1]._startD || parseDate(validStreaks[i + 1].startDate);
                if (prevEnd && nextStart) {
                    const gap = Math.ceil((nextStart - prevEnd) / 86400000);
                    gaps.push(gap);
                }
            }

            // Filter gaps based on pattern type
            let filteredGaps;
            if (isSoLe) {
                filteredGaps = gaps.filter(g => g > 2);
            } else {
                filteredGaps = gaps.filter(g => g > 1);
            }

            const avgGap = filteredGaps.length > 0
                ? Math.round(filteredGaps.reduce((sum, g) => sum + g, 0) / filteredGaps.length)
                : 0;

            const minGap = filteredGaps.length > 0 ? Math.min(...filteredGaps) : null;
            const maxGap = filteredGaps.length > 0 ? Math.max(...filteredGaps) : null;

            // Count how many times minGap and maxGap appear
            const minCount = filteredGaps.filter(g => g === minGap).length;
            const maxCount = filteredGaps.filter(g => g === maxGap).length;

            // Calculate lastGap: From the last valid streak to current streak's start (or tomorrow if no current)
            let lastGap = 0;
            const lastValidStreak = validStreaks[validStreaks.length - 1];
            const lastValidEnd = lastValidStreak._endD || parseDate(lastValidStreak.endDate);

            if (currentStreakInfo && currentStreakInfo.startDate) {
                const startD = currentStreakInfo._startD || parseDate(currentStreakInfo.startDate);
                if (startD && lastValidEnd) lastGap = Math.ceil((startD - lastValidEnd) / 86400000);
            } else if (lastValidEnd) {
                // No current streak - gap to tomorrow
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                lastGap = Math.ceil((tomorrow - lastValidEnd) / 86400000);
            }

            return { avgGap, lastGap, minGap, maxGap, minCount, maxCount, count: validStreaks.length, pastCount: validStreaks.length };
        };

        // NEW: Calculate extension gap - gap from streak of length N to streak of length N+step
        // This measures how long it typically takes for a streak to "extend" to the next level
        const calculateExtensionGap = (allStreaks, fromLen, step, isSoLe, currentStreakInfo) => {
            const toLen = fromLen + step;

            // Get all streaks with length >= fromLen (already sorted by date chronologically)
            const sortedStreaks = allStreaks.filter(s => s.length >= fromLen);

            if (sortedStreaks.length < 1) {
                return { minGap: null, avgGap: 0, lastGap: 0, count: 0, lastStoppedDate: null };
            }

            // Find gaps from streaks of exactly fromLen to streaks of >= toLen
            const extensionGaps = [];

            for (let i = 0; i < sortedStreaks.length - 1; i++) {
                const currentStreak = sortedStreaks[i];

                // Only consider streaks that are exactly fromLen (not longer)
                // These are the ones that "stopped" at fromLen
                if (currentStreak.length === fromLen) {
                    const prevEnd = currentStreak._endD || parseDate(currentStreak.endDate);
                    if (!prevEnd) continue;
                    // Find the next streak that is >= toLen
                    for (let j = i + 1; j < sortedStreaks.length; j++) {
                        const nextStreak = sortedStreaks[j];
                        if (nextStreak.length >= toLen) {
                            const nextStart = nextStreak._startD || parseDate(nextStreak.startDate);
                            if (nextStart) {
                                const gap = Math.ceil((nextStart - prevEnd) / 86400000);
                                // Only count meaningful gaps
                                const minValidGap = isSoLe ? 2 : 1;
                                if (gap > minValidGap) {
                                    extensionGaps.push(gap);
                                }
                            }
                            break; // Found the next extension, move to next fromLen streak
                        }
                    }
                }
            }

            // Calculate lastGap: from the last streak that stopped at exactly fromLen to today
            // IMPORTANT: Must exclude streaks that are part of or overlap with current streak
            let lastGap = 0;
            let lastStoppedDate = null;

            // Find the most recent streak that stopped at exactly fromLen
            // Must end BEFORE the current streak started (if there's an ongoing current streak of >= fromLen)
            let cutoffTime = null;

            // Use the passed currentStreakInfo (if it exists and has length >= fromLen)
            if (currentStreakInfo && currentStreakInfo.length >= fromLen && currentStreakInfo.startDate) {
                // Cutoff time = 1 day before current streak started
                const cutoffDate = currentStreakInfo._startD || parseDate(currentStreakInfo.startDate);
                if (cutoffDate) {
                    cutoffTime = cutoffDate.getTime() - 86400000;
                }
            }

            const stoppedStreaks = [];
            for (let i = 0; i < sortedStreaks.length; i++) {
                const s = sortedStreaks[i];
                if (s.length !== fromLen) continue;
                if (currentStreakInfo &&
                    s.startDate === currentStreakInfo.startDate &&
                    s.endDate === currentStreakInfo.endDate) {
                    continue;
                }
                if (cutoffTime !== null) {
                    const endD = s._endD || parseDate(s.endDate);
                    if (!endD || endD.getTime() > cutoffTime) continue;
                }
                stoppedStreaks.push(s);
            }
            stoppedStreaks.reverse(); // Most recent first

            if (stoppedStreaks.length > 0) {
                const lastStopped = stoppedStreaks[0];
                lastStoppedDate = lastStopped.endDate;
                const lastEnd = lastStopped._endD || parseDate(lastStopped.endDate);
                if (lastEnd) {
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    lastGap = Math.ceil((tomorrow - lastEnd) / 86400000);
                }
            }

            if (extensionGaps.length === 0) {
                return { minGap: null, maxGap: null, avgGap: 0, lastGap, count: 0, minCount: 0, maxCount: 0, lastStoppedDate };
            }

            const minGap = Math.min(...extensionGaps);
            const maxGap = Math.max(...extensionGaps);
            const avgGap = Math.round(extensionGaps.reduce((sum, g) => sum + g, 0) / extensionGaps.length);

            // Count how many times minGap and maxGap appear
            const minCount = extensionGaps.filter(g => g === minGap).length;
            const maxCount = extensionGaps.filter(g => g === maxGap).length;

            return { minGap, maxGap, avgGap, lastGap, count: extensionGaps.length, minCount, maxCount, lastStoppedDate };
        };

        // Extension gap stats: gap from N to N+1 (or N+2 for solo patterns)
        const extensionGapStats = {};
        const step = isSoLePattern ? 2 : 1; // So le patterns extend by 2 days

        for (let len = 1; len <= calcLimit; len++) {
            // 1. Greater or Equal (>= len) (avoid expensive sort since streaks are chronologically sorted)
            const geStreaks = categoryData.streaks
                .filter(s => s.length >= len);
            // Pass current streak info for proper lastGap calculation
            gapStats[len] = calculateGapStatsForStreaks(geStreaks, isSoLePattern, current);

            // 2. Exact Length (== len)
            const exactStreaks = categoryData.streaks
                .filter(s => s.length === len);
            exactGapStats[len] = calculateGapStatsForStreaks(exactStreaks, isSoLePattern, current);

            // 3. Extension Gap: from len to len+step
            // Pass current streak info for proper cutoff calculation
            extensionGapStats[len] = calculateExtensionGap(categoryData.streaks, len, step, isSoLePattern, current);
        }

        const lengthHistoryMetrics = buildLengthHistoryMetricsForKey(key, calcLimit, latestDate);

        quickStats[key] = {
            description: categoryData.description,
            longest,
            secondLongest,
            current,
            averageInterval,
            daysSinceLast,
            gapStats,
            exactGapStats,
            extensionGapStats, // NEW: Gap from streak N to streak N+step
            lengthHistoryMetrics,
            historyMetrics: computeHistoryMetricsForKey(key, latestDate)
        };

        // === ÁP DỤNG CÁCH TÍNH MỐC KỶ LỤC MỚI ===
        // Công thức: Tần suất chính xác (số lần xảy ra == len) / tổng số năm thực tế <= 1.5 thì len là mốc kỷ lục
        let computedMaxStreak = longestLength;
        let isSuperMaxThreshold = false;

        const lotteryService = require('./lotteryService');
        const totalYears = lotteryService.getTotalYears();

        const isTienLuiSoLePattern = key.toLowerCase().includes('tienluisole') || key.toLowerCase().includes('luitiensole');
        let startLen = 2;
        let increment = 1;

        if (isSoLePattern) {
            // Dạng so le (tính theo số ngày kéo dài thực tế: 1, 3, 5, 7, 9)
            // Chuỗi độ dài 1 không phải là mốc kỷ lục, nên bắt đầu đánh giá từ 3, tăng dần 2
            startLen = 3;
            increment = 2;
        } else if (isTienLuiSoLePattern) {
            // Dạng tiến lùi / lùi tiến so le ít nhất 4 ngày mới hình thành chuỗi
            startLen = 4;
            increment = 1;
        }

        for (let len = startLen; len <= calcLimit; len += increment) {
            const count = exactGapStats[len] ? exactGapStats[len].count : 0;
            const freqYear = count / totalYears; // Sử dụng tổng số năm thực tế

            if (freqYear <= 1.5) {
                computedMaxStreak = len;
                isSuperMaxThreshold = freqYear <= 0.5;
                break; // Đạt mốc kỷ lục đầu tiên
            }
        }

        // Cập nhật vào quickStats
        quickStats[key].computedMaxStreak = computedMaxStreak;
        quickStats[key].isSuperMaxThreshold = isSuperMaxThreshold;

        // === ÁP DỤNG TIỀM NĂNG - PHÁT HIỆN CHUỖI SẮP HÌNH THÀNH ===
        // Với tiềm năng 1 ngày, chỉ giữ các dạng mà nếu ngày mai hình thành thì
        // chạm đúng kỷ lục: dạng thường kỷ lục 2d, dạng so le kỷ lục 3d.
        // Chỉ xử lý nested keys (có ':') vì category mapping từ identifyCategories
        if (!quickStats[key].current && key.includes(':')) {
            const [category, subcategory] = key.split(':');
            const canAttachOneDayPotential = (formLen, step) => {
                const prefixLen = formLen - step;
                if (prefixLen !== 1) return true;
                return computedMaxStreak === formLen;
            };
            
            // Xác định loại subcategory
            const isSoLeSubcat = (subcategory === 'veSole' || subcategory === 'veSoleMoi');
            const isSoLeTheoCapSubcat = subcategory === 'soLeTheoCap';
            const isTienLuiSoLeSubcat = subcategory === 'tienLuiSoLe' || subcategory === 'luiTienSoLe';
            
            // Bỏ qua tienLuiSoLe (cần minLength 4, quá phức tạp cho tiềm năng)
            if (hasLatest && !isTienLuiSoLeSubcat) {
                if (isSoLeTheoCapSubcat) {
                    // ABAB theo cặp chỉ hợp lệ khi A/B là 2 dạng khác nhau trên cùng một trục.
                    if (isSoLeTheoCapCategory(category) && hasYesterday && hasDayBeforeYesterday) {
                        const labelToday = getSoLeTheoCapLabel(numTodayStr, category);
                        const labelYesterday = getSoLeTheoCapLabel(numYesterdayStr, category);
                        const labelDayBeforeYesterday = getSoLeTheoCapLabel(numDayBeforeYesterdayStr, category);

                        if (labelToday && labelYesterday && labelDayBeforeYesterday &&
                            labelToday !== labelYesterday &&
                            labelToday === labelDayBeforeYesterday) {
                            const patternLabels = [labelDayBeforeYesterday, labelYesterday, labelToday];
                            quickStats[key].current = {
                                length: 3,
                                startDate: dayBeforeYestDate,
                                endDate: latestDate,
                                values: [numDayBeforeYesterdayStr, numYesterdayStr, numTodayStr],
                                patternLabels,
                                pairCategory: category,
                                value: formatSoLeTheoCapPairValue(category, patternLabels),
                                dates: [dayBeforeYestDate, yestDate, latestDate],
                                fullSequence: [
                                    { date: dayBeforeYestDate, value: numDayBeforeYesterdayStr, isLatest: false },
                                    { date: yestDate, value: numYesterdayStr, isLatest: false },
                                    { date: latestDate, value: numTodayStr, isLatest: true }
                                ],
                                isPotential: true
                            };
                        }
                    }
                } else if (isSoLeSubcat) {
                    // DẠNG SO LE: Hôm qua thoả mãn, hôm nay KHÔNG thoả mãn → gap day
                    if (canAttachOneDayPotential(3, 2) && hasYesterday && matchedYesterday.includes(category) && !matchedToday.includes(category)) {
                        quickStats[key].current = {
                            length: 1,
                            startDate: yestDate,
                            endDate: yestDate,
                            values: [numYesterdayStr],
                            dates: [yestDate],
                            fullSequence: [
                                { date: yestDate, value: numYesterdayStr, isLatest: false },
                                { date: latestDate, value: numTodayStr, isLatest: true }
                            ],
                            isPotential: true
                        };
                    }
                } else {
                    // DẠNG THƯỜNG (veLienTiep, tienLienTiep, luiLienTiep, etc.)
                    // Số hôm nay thoả mãn category → tiềm năng bắt đầu chuỗi
                    if (canAttachOneDayPotential(2, 1) && matchedToday.includes(category)) {
                        quickStats[key].current = {
                            length: 1,
                            startDate: latestDate,
                            endDate: latestDate,
                            values: [numTodayStr],
                            dates: [latestDate],
                            fullSequence: [{ date: latestDate, value: numTodayStr, isLatest: true }],
                            isPotential: true
                        };
                    }
                }
            }
        }

        // [MỚI] Dùng logic predictNextInSequence để lấy pattern numbers chuẩn (chạy sau khi mọi current đã hình thành)
        if (quickStats[key] && quickStats[key].current) {
            try {
                const { predictNextInSequence } = require('../controllers/suggestionsController');
                const [categoryName, subcategoryStr] = key.split(':');
                const statObj = { current: quickStats[key].current };
                const nums = predictNextInSequence(statObj, categoryName, subcategoryStr || '');
                if (nums && nums.length > 0 && nums.length < 100) {
                    quickStats[key].current.patternNumbers = nums;
                }
            } catch (e) {
                console.error('Lỗi khi lấy danh sách số cho pattern', key, e);
            }
        }
    };

    let processedCount = 0;
    
    // PRE-CALCULATE matchedToday and matchedYesterday
    const { identifyCategories } = require('../utils/numberAnalysis');
    let matchedToday = [];
    let matchedYesterday = [];
    let matchedDayBeforeYesterday = [];
    let numTodayStr = '';
    let numYesterdayStr = '';
    let numDayBeforeYesterdayStr = '';
    let yestDate = '';
    let dayBeforeYestDate = '';
    let hasLatest = false;
    let hasYesterday = false;
    let hasDayBeforeYesterday = false;
    
    if (latestDate && latestLotteryDay && latestLotteryDay.special) {
        hasLatest = true;
        numTodayStr = String(latestLotteryDay.special).padStart(2, '0');
        matchedToday = identifyCategories(numTodayStr);
        
        const rawData = require('./lotteryService').getRawData();
        if (rawData && rawData.length >= 2) {
            const yesterdayLotteryDay = rawData[rawData.length - 2];
            if (yesterdayLotteryDay && yesterdayLotteryDay.special) {
                hasYesterday = true;
                numYesterdayStr = String(yesterdayLotteryDay.special).padStart(2, '0');
                matchedYesterday = identifyCategories(numYesterdayStr);
                const formatToDDMMYYYY = (d) => {
                    if (d.includes('/')) return d;
                    const parts = d.split('-');
                    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                    return d;
                };
                yestDate = formatToDDMMYYYY(yesterdayLotteryDay.date);
            }
            
            if (rawData.length >= 3) {
                const dbYesterdayLotteryDay = rawData[rawData.length - 3];
                if (dbYesterdayLotteryDay && dbYesterdayLotteryDay.special) {
                    hasDayBeforeYesterday = true;
                    numDayBeforeYesterdayStr = String(dbYesterdayLotteryDay.special).padStart(2, '0');
                    matchedDayBeforeYesterday = identifyCategories(numDayBeforeYesterdayStr);
                    const formatToDDMMYYYY = (d) => {
                        if (d.includes('/')) return d;
                        const parts = d.split('-');
                        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                        return d;
                    };
                    dayBeforeYestDate = formatToDDMMYYYY(dbYesterdayLotteryDay.date);
                }
            }
        }
    }

    const { predictNextInSequence } = require('../controllers/suggestionsController');

    const startTotal = Date.now();
    for (const key in allStats) {
        processedCount++;
        
        const categoryData = allStats[key];
        
        // Pass the pre-calculated matched variables to analyzeCategory somehow?
        // Wait, analyzeCategory accesses `matchedToday` directly if we define it in the closure!
        // But analyzeCategory is already defined above...
        
        if (categoryData.streaks) { // Cấu trúc đơn
            analyzeCategory(key, categoryData);
        } else { // Cấu trúc lồng
            for (const subKey in categoryData) {
                analyzeCategory(`${key}:${subKey}`, categoryData[subKey]);
            }
        }
    }
    console.log('Finished analyzing all categories. Time taken:', Date.now() - startTotal, 'ms');

    augmentPotentialStreaks(quickStats);

    const lotteryServiceForMeta = require('./lotteryService');
    quickStats._meta = { totalYears: lotteryServiceForMeta.getTotalYears() };
    return quickStats;
};

/**
 * Lấy toàn bộ dữ liệu thống kê, sử dụng cache nếu có.
 */
async function getAllStreaks() {
    if (!cachedStats) {
        await getStatsData();
    }
    return cachedStats;
}

/**
 * Lấy các chuỗi đang diễn ra gần đây.
 */
async function getRecentStreaks(days = 30) {
    const allStreaks = await getAllStreaks();
    const recentStreaks = { streaks: {} };

    for (const key in allStreaks) {
        const streakInfo = allStreaks[key];
        if (streakInfo.current) {
            const currentLength = streakInfo.current.length;
            if (!recentStreaks.streaks[currentLength]) {
                recentStreaks.streaks[currentLength] = [];
            }
            recentStreaks.streaks[currentLength].push({
                statName: key,
                statDescription: streakInfo.description,
                details: [streakInfo.current]
            });
        }
    }
    return recentStreaks;
}

/**
 * Lấy thống kê chi tiết cho một loại chuỗi với độ dài cụ thể.
 * (Hàm đã được cải tiến để ổn định hơn)
 */
async function getStreakStats(statName, exactLength) {
    try {
        const allStreaks = await getAllStreaks();
        const streakData = allStreaks[statName];

        if (!streakData || !streakData.streaks) {
            return { runs: [] };
        }

        const runs = streakData.streaks
            .filter(streak => streak.length === exactLength)
            .map(streak => ({ date: streak.startDate })); // Lấy ngày bắt đầu của chuỗi

        // Sắp xếp các lần chạy theo ngày để tính toán cho chính xác
        return {
            runs: runs.sort((a, b) => new Date(a.date) - new Date(b.date)),
        };
    } catch (error) {
        console.error(`Lỗi khi lấy getStreakStats cho ${statName}:`, error);
        return { runs: [] }; // Trả về mảng rỗng nếu có lỗi
    }
}

/**
 * Lấy kết quả xổ số của ngày gần nhất.
 */
async function getLatestLotteryResult() {
    try {
        const data = lotteryService.getRawData();
        if (!data || data.length === 0) return null;
        return data[data.length - 1];
    } catch (error) {
        console.error('Lỗi khi đọc dữ liệu kết quả xổ số:', error);
        return null;
    }
}


/**
 * Lấy lịch sử 7 ngày gần nhất của 'Chuỗi đang diễn ra'
 * Tối ưu hóa: Trả về trực tiếp nếu có cache
 */
async function getQuickStatsHistory() {
    if (cachedQuickStatsHistory) return cachedQuickStatsHistory;

    const lotteryServiceForHistory = require('./lotteryService');
    const { computeQuickStatsForDateFast } = require('./historicalExclusionService');

    // Đảm bảo load rawData + stats (cần stats cho computeQuickStatsForDate)
    await lotteryServiceForHistory.loadAll();
    const rawData = lotteryServiceForHistory.getRawData();
    if (!rawData || rawData.length === 0) return [];

    let historyCount = 7;
    const historyDates = rawData.slice(-Math.min(historyCount, rawData.length)).map(entry => {
        const d = parseDate(entry.date);
        if (!d) return null;
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }).filter(d => d !== null);
    // historyDates đang xếp từ quá khứ đến hiện tại (ngày mới nhất cuối cùng)
    // lật lại để ngày mới nhất đứng đầu
    historyDates.reverse();

    const totalYears = lotteryServiceForHistory.getTotalYears();
    const historyResults = [];

    // Tính toán quickStats cho từng ngày trong 7 ngày
    for (const targetDateStr of historyDates) {
        // computeQuickStatsForDateFast(targetDate) dùng prevDate = targetDate - 1 làm mốc
        // rawData date = ngày có kết quả (VD: 17/03)
        // Shift +1: targetDate = 18/03 → prevDate = 17/03 = ngày hiển thị trên UI
        // Frontend hiển thị rawDate trực tiếp (KHÔNG getPrevDay)
        const dateObj = parseDate(targetDateStr);
        if (dateObj) {
            dateObj.setDate(dateObj.getDate() + 1);
            const shiftedTargetDateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

            const statsAtThatDay = computeQuickStatsForDateFast(shiftedTargetDateStr, totalYears);

            // Format lại dữ liệu cho nhẹ, chỉ lấy danh sách các chuỗi ĐANG DIỄN RA
            const activeStreaks = [];
            for (const key in statsAtThatDay) {
                if (key === '_meta') continue;
                if (statsAtThatDay[key] && statsAtThatDay[key].current) {
                    const currentObj = statsAtThatDay[key].current;
                    const recordLength = statsAtThatDay[key].computedMaxStreak || (statsAtThatDay[key].longest && statsAtThatDay[key].longest.length > 0 ? statsAtThatDay[key].longest[0].length : 0);

                    // Thêm logic patternNumbers như trang hiện tại
                    try {
                        const { predictNextInSequence } = require('../controllers/suggestionsController');
                        const [categoryName, subcategoryStr] = key.split(':');
                        const nums = predictNextInSequence({ current: currentObj }, categoryName, subcategoryStr || '');
                        if (nums && nums.length > 0 && nums.length < 100) {
                            currentObj.patternNumbers = nums;
                        }
                    } catch (e) { }

                    // === RE-HYDRATE fullSequence từ rawData ===
                    const hydratedObj = hydrateStreak(currentObj, key);

                    activeStreaks.push({
                        ...hydratedObj,
                        key: key,
                        description: statsAtThatDay[key].description,
                        recordLength: recordLength,
                        isSuperRecord: statsAtThatDay[key].isSuperMaxThreshold || false,
                        originalRecord: statsAtThatDay[key].longest && statsAtThatDay[key].longest.length > 0 ? statsAtThatDay[key].longest[0].length : 0,
                        gapStats: statsAtThatDay[key].gapStats,
                        exactGapStats: statsAtThatDay[key].exactGapStats,
                        extensionGapStats: statsAtThatDay[key].extensionGapStats,
                        lengthHistoryMetrics: statsAtThatDay[key].lengthHistoryMetrics,
                        historyMetrics: statsAtThatDay[key].historyMetrics,
                        reliability: buildReliabilityForCurrent(key, statsAtThatDay[key], hydratedObj, targetDateStr)
                    });
                }
            }

            historyResults.push({
                date: targetDateStr,
                streaks: activeStreaks
            });
        }
    }

    cachedQuickStatsHistory = historyResults;
    return historyResults;
}


/**
 * Re-hydrate tất cả current streaks trong quick_stats từ rawData.
 * Dùng khi load quick_stats từ DB cache mà fullSequence bị thiếu hoặc sai format.
 */
function rehydrateCurrentStreaks(quickStats) {
    if (!quickStats || typeof quickStats !== 'object') return quickStats;
    if (augmentedQuickStatsSource === quickStats && augmentedQuickStatsCache) {
        return augmentedQuickStatsCache;
    }

    const result = augmentPotentialStreaks({ ...quickStats });
    const basisDate = getLatestDateFromRawSync();
    for (const key of Object.keys(result)) {
        if (key === '_meta') continue;
        const cat = result[key];
        if (cat && cat.current) {
            const hydratedCurrent = hydrateStreak(cat.current, key);
            const refreshedPatternNumbers = attachPatternNumbers(hydratedCurrent, key);
            const { subcategory } = parseStatsKey(key);
            const step = getPotentialStep(key, subcategory);
            const currentLen = Number(hydratedCurrent.length || 0);
            const targetLen = currentLen + step;
            const lengthHistoryMetrics = cat.lengthHistoryMetrics || buildLengthHistoryMetricsForKey(key, Math.max(targetLen + step, 2), basisDate);
            const statForReliability = {
                ...cat,
                current: hydratedCurrent,
                lengthHistoryMetrics
            };
            result[key] = {
                ...cat,
                lengthHistoryMetrics,
                current: {
                    ...hydratedCurrent,
                    patternNumbers: refreshedPatternNumbers.length > 0
                        ? refreshedPatternNumbers
                        : (hydratedCurrent.patternNumbers && hydratedCurrent.patternNumbers.length < 100 ? hydratedCurrent.patternNumbers : []),
                    reliability: hydratedCurrent.reliability || buildReliabilityForCurrent(key, statForReliability, hydratedCurrent, basisDate)
                }
            };
        }
    }

    augmentedQuickStatsSource = quickStats;
    augmentedQuickStatsCache = result;
    return result;
}

function formatToDDMMYYYY(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('/')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length >= 3) return `${parts[2].substring(0, 2)}/${parts[1]}/${parts[0]}`;
    return dateStr;
}

function getParityType(numberStr) {
    const s = String(numberStr).padStart(2, '0');
    const d0 = parseInt(s[0], 10) % 2;
    const d1 = parseInt(s[1], 10) % 2;
    if (d0 === 0 && d1 === 0) return 'CC';
    if (d0 === 0 && d1 === 1) return 'CL';
    if (d0 === 1 && d1 === 0) return 'LC';
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
    const isAlternatingGapPattern = (lowerSub === 'vesole' || lowerSub === 'vesolemoi' || lowerKey.includes('vesole') || lowerKey.includes('solemoi')) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap');
    return isAlternatingGapPattern ? 2 : 1;
}

function getPotentialFormFrequencyPerYear(stat, key) {
    if (!stat || !stat.current || !stat.current.isPotential) return 0;
    const { subcategory } = parseStatsKey(key);
    const step = getPotentialStep(key, subcategory);
    const formLen = (stat.current.length || 0) + step;
    const countForm = stat.gapStats && stat.gapStats[formLen] ? stat.gapStats[formLen].count : 0;
    const totalYears = lotteryService.getTotalYears();
    return totalYears > 0 ? countForm / totalYears : 0;
}

function shouldIncludePotentialForUi(stat, key) {
    return true;
}

function pickStatsKeys(source, keys) {
    if (!source || typeof source !== 'object') return source;
    const compact = {};
    for (const key of keys) {
        if (source[key] !== undefined) compact[key] = source[key];
    }
    return compact;
}

function compactStatsForUi(source, key, current) {
    const { subcategory } = parseStatsKey(key);
    const step = getPotentialStep(key, subcategory);
    const currentLen = current && current.length ? current.length : 0;
    const nextLen = currentLen + step;
    const keys = current && current.isPotential
        ? [currentLen, nextLen, nextLen + step]
        : [currentLen, nextLen];

    return {
        gapStats: pickStatsKeys(source.gapStats, keys),
        exactGapStats: pickStatsKeys(source.exactGapStats, [nextLen]),
        extensionGapStats: pickStatsKeys(source.extensionGapStats, [currentLen]),
        lengthHistoryMetrics: pickStatsKeys(
            source.lengthHistoryMetrics || buildLengthHistoryMetricsForKey(key, Math.max(nextLen + step, currentLen + step), getLatestDateFromRawSync()),
            keys.concat([nextLen + step])
        ),
        historyMetrics: source.historyMetrics
    };
}

function isAllowedTienLuiSoLeAxis(key, category) {
    const lowerKey = String(key).toLowerCase();
    if (lowerKey === 'tienluisole' || lowerKey === 'luitiensole') return true;
    if (category === 'cacSo' || category === 'cacDau' || category === 'cacDit') return true;
    return category === 'tong_tt_cac_tong' ||
        category === 'tong_moi_cac_tong' ||
        category === 'hieu_cac_hieu';
}

function extractTienLuiOrderedValue(numberStr, key, category) {
    const n = parseInt(numberStr, 10);
    if (Number.isNaN(n)) return null;

    const lowerKey = String(key).toLowerCase();
    if (lowerKey === 'tienluisole' || lowerKey === 'luitiensole' || category === 'cacSo') return n;
    if (category === 'cacDau') return Math.floor(n / 10);
    if (category === 'cacDit') return n % 10;

    const { getTongTT, getTongMoi, getHieu } = require('../utils/numberAnalysis');
    if (category === 'tong_tt_cac_tong') return getTongTT(numberStr);
    if (category === 'tong_moi_cac_tong') return getTongMoi(numberStr);
    if (category === 'hieu_cac_hieu') return getHieu(numberStr);

    return null;
}

function shouldAttachPotential(stat, key, formLen, step) {
    if (!stat || stat.current) return false;
    const recordLen = stat.computedMaxStreak || (stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0);
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

function augmentPotentialStreaks(quickStats) {
    if (!quickStats || typeof quickStats !== 'object') return quickStats;

    const rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) return quickStats;

    const latest = rawData[rawData.length - 1];
    const yesterday = rawData[rawData.length - 2];
    const dayBefore = rawData[rawData.length - 3];
    if (!latest || latest.special === null || latest.special === undefined) return quickStats;

    const { identifyCategories } = require('../utils/numberAnalysis');
    const todayNum = String(latest.special).padStart(2, '0');
    const todayDate = formatToDDMMYYYY(latest.date);
    const matchedToday = identifyCategories(todayNum);

    const yesterdayNum = yesterday && yesterday.special !== null && yesterday.special !== undefined
        ? String(yesterday.special).padStart(2, '0')
        : '';
    const yesterdayDate = yesterday ? formatToDDMMYYYY(yesterday.date) : '';
    const matchedYesterday = yesterdayNum ? identifyCategories(yesterdayNum) : [];

    const dayBeforeNum = dayBefore && dayBefore.special !== null && dayBefore.special !== undefined
        ? String(dayBefore.special).padStart(2, '0')
        : '';
    const dayBeforeDate = dayBefore ? formatToDDMMYYYY(dayBefore.date) : '';
    const matchedDayBefore = dayBeforeNum ? identifyCategories(dayBeforeNum) : [];

    const setPotential = (key, current) => {
        const stat = quickStats[key];
        if (!stat || stat.current) return;
        const nums = attachPatternNumbers(current, key);
        quickStats[key] = {
            ...stat,
            current: {
                ...current,
                patternNumbers: nums && nums.length > 0
                    ? nums
                    : (current.patternNumbers && current.patternNumbers.length < 100 ? current.patternNumbers : []),
                isPotential: true
            }
        };
    };

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
            if (prefixMatches && shouldAttachPotential(stat, key, formLen, 1)) {
                const current = {
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
                };
                setPotential(key, current);
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
            const v0 = extractTienLuiOrderedValue(dayBeforeNum, key, category);
            const v1 = extractTienLuiOrderedValue(yesterdayNum, key, category);
            const v2 = extractTienLuiOrderedValue(todayNum, key, category);
            if (v0 === null || v1 === null || v2 === null) continue;
            const d1 = Number(v1) - Number(v0);
            const d2 = Number(v2) - Number(v1);
            const wantsTienFirst = lowerSub === 'tienluisole' || lowerKey.includes('tienluisole');
            const directionsOk = wantsTienFirst ? (d1 > 0 && d2 < 0) : (d1 < 0 && d2 > 0);
            const formLen = 4;
            if (directionsOk && shouldAttachPotential(stat, key, formLen, 1)) {
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
            if (ababPrefix && shouldAttachPotential(stat, key, formLen, 1)) {
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
            if (yesterdayNum && matchedYesterday.includes(category) && !matchedToday.includes(category) && shouldAttachPotential(stat, key, formLen, step)) {
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
        if (matchesCategory && shouldAttachPotential(stat, key, formLen, 1)) {
            let patternNumbers;
            if (key.startsWith('motSo')) {
                patternNumbers = [parseInt(todayNum, 10)];
            } else if (key.startsWith('motDau')) {
                const head = todayNum[0];
                patternNumbers = Array.from({ length: 100 }, (_, i) => i).filter(n => String(n).padStart(2, '0')[0] === head);
            } else if (key.startsWith('motDit')) {
                const tail = todayNum[1];
                patternNumbers = Array.from({ length: 100 }, (_, i) => i).filter(n => String(n).padStart(2, '0')[1] === tail);
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

    return quickStats;
}

function buildActiveStreaksFromQuickStats(quickStats) {
    if (activeStreaksSource === quickStats && activeStreaksCache) {
        return activeStreaksCache;
    }

    const activeStreaks = [];
    const hydrated = rehydrateCurrentStreaks(quickStats);
    const basisDate = getLatestDateFromRawSync();

    for (const key of Object.keys(hydrated || {})) {
        if (key === '_meta') continue;
        const stat = hydrated[key];
        if (!stat || !stat.current) continue;
        const { category, subcategory } = parseStatsKey(key);
        if (String(subcategory || '').toLowerCase() === 'soletheocap' && !isSoLeTheoCapCategory(category)) continue;
        if (!shouldIncludePotentialForUi(stat, key)) continue;
        const compactStats = compactStatsForUi(stat, key, stat.current);
        const displayDescription = String(subcategory || '').toLowerCase() === 'soletheocap' && stat.current.value
            ? `${stat.current.value} so le theo cặp`
            : stat.description;

        activeStreaks.push({
            ...stat.current,
            key,
            description: displayDescription,
            recordLength: stat.computedMaxStreak || (stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0),
            isSuperRecord: stat.isSuperMaxThreshold || false,
            originalRecord: stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0,
            gapStats: compactStats.gapStats,
            exactGapStats: compactStats.exactGapStats,
            extensionGapStats: compactStats.extensionGapStats,
            lengthHistoryMetrics: compactStats.lengthHistoryMetrics,
            historyMetrics: compactStats.historyMetrics,
            reliability: buildReliabilityForCurrent(key, {
                ...stat,
                gapStats: compactStats.gapStats,
                lengthHistoryMetrics: compactStats.lengthHistoryMetrics,
                historyMetrics: compactStats.historyMetrics
            }, stat.current, basisDate)
        });
    }

    activeStreaksSource = quickStats;
    activeStreaksCache = activeStreaks;
    return activeStreaks;
}

/**
 * Re-hydrate tất cả streaks trong history từ rawData.
 * Trả lại list obj { date, streaks: [ hydrated_streaks... ] }
 */
function rehydrateHistoryStreaks(historyCache) {
    if (!historyCache || !Array.isArray(historyCache)) return historyCache;
    if (hydratedHistorySource === historyCache && hydratedHistoryCache) {
        return hydratedHistoryCache;
    }

    hydratedHistorySource = historyCache;
    hydratedHistoryCache = historyCache.map(dayObj => {
        if (!dayObj.streaks) return dayObj;
        return {
            ...dayObj,
            streaks: dayObj.streaks.map(streak => {
                const hydrated = hydrateStreak(streak, streak.key);
                const refreshedPatternNumbers = attachPatternNumbers(hydrated, hydrated.key);
                const statLike = {
                    gapStats: hydrated.gapStats,
                    lengthHistoryMetrics: hydrated.lengthHistoryMetrics,
                    historyMetrics: hydrated.historyMetrics || computeHistoryMetricsForKey(hydrated.key, dayObj.date)
                };
                return {
                    ...hydrated,
                    patternNumbers: refreshedPatternNumbers.length > 0
                        ? refreshedPatternNumbers
                        : (hydrated.patternNumbers && hydrated.patternNumbers.length < 100 ? hydrated.patternNumbers : []),
                    historyMetrics: statLike.historyMetrics,
                    reliability: hydrated.reliability || buildReliabilityForCurrent(hydrated.key, statLike, hydrated, dayObj.date)
                };
            })
        };
    });
    return hydratedHistoryCache;
}

module.exports = {
    getStatsData,
    getFilteredStreaks,
    getQuickStats,
    clearCache,
    getAllStreaks,
    getRecentStreaks,
    getRecentResults,
    getLatestLotteryResult,
    getStreakStats,
    getLatestDate,
    getQuickStatsHistory,
    rehydrateCurrentStreaks,
    rehydrateHistoryStreaks,
    buildActiveStreaksFromQuickStats,
};
