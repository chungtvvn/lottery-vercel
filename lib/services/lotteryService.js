/**
 * lotteryService.js
 * 
 * OPTIMIZED: Tách loadRawData (nhẹ, nhanh) khỏi loadStats (nặng).
 * Hầu hết API routes chỉ cần rawData, không cần stats.
 * Stats được lazy-load khi cần.
 */
const { getPublicClient } = require('../supabase');
const { loadStatsFromDb } = require('../data-access');

let rawDataCache = null;
let numberStatsCache = null;
let headTailStatsCache = null;
let sumDiffStatsCache = null;
let _loadRawPromise = null;
let _loadStatsPromise = null;

/**
 * Load CHỈ raw lottery data từ Postgres (nhẹ, ~7000 rows × 27 columns)
 * Đây là hàm được gọi nhiều nhất — phải nhanh.
 */
const loadRawData = async () => {
    if (rawDataCache) return;
    if (_loadRawPromise) return _loadRawPromise;

    _loadRawPromise = (async () => {
        console.log('[LotteryService] Loading raw data from Static JSON Layer...');
        const { getRawData: fetchRawData } = require('../data-access');
        const allRawRows = await fetchRawData();

        if (allRawRows && allRawRows.length > 0) {
            rawDataCache = allRawRows.map(row => ({
                date: row.date,
                special: row.special,
                prize1: row.prize1,
                prize2_1: row.prize2_1, prize2_2: row.prize2_2,
                prize3_1: row.prize3_1, prize3_2: row.prize3_2, prize3_3: row.prize3_3,
                prize3_4: row.prize3_4, prize3_5: row.prize3_5, prize3_6: row.prize3_6,
                prize4_1: row.prize4_1, prize4_2: row.prize4_2, prize4_3: row.prize4_3, prize4_4: row.prize4_4,
                prize5_1: row.prize5_1, prize5_2: row.prize5_2, prize5_3: row.prize5_3,
                prize5_4: row.prize5_4, prize5_5: row.prize5_5, prize5_6: row.prize5_6,
                prize6_1: row.prize6_1, prize6_2: row.prize6_2, prize6_3: row.prize6_3,
                prize7_1: row.prize7_1, prize7_2: row.prize7_2, prize7_3: row.prize7_3, prize7_4: row.prize7_4
            }));
            console.log(`[LotteryService] Raw data loaded via Static File: ${rawDataCache.length} records.`);
        }

        _loadRawPromise = null;
    })();

    return _loadRawPromise;
};

/**
 * Load stats từ DB — LAZY, chỉ gọi khi thực sự cần stats.
 * Tách riêng khỏi loadRawData để tối ưu các API chỉ cần rawData.
 */
const loadStats = async () => {
    if (numberStatsCache) return; // Already loaded
    if (_loadStatsPromise) return _loadStatsPromise;

    _loadStatsPromise = (async () => {
        console.log('[LotteryService] Loading stats from Postgres (lazy)...');
        
        // OPTIMIZATION: Có thể dùng Promise.all vì data đã được minify (~70% nhỏ hơn)
        const [numberFromDb, headTailFromDb, sumDiffFromDb] = await Promise.all([
            loadStatsFromDb('number'),
            loadStatsFromDb('head_tail'),
            loadStatsFromDb('sum_diff')
        ]);

        if (numberFromDb && Object.keys(numberFromDb).length > 0) {
            numberStatsCache = numberFromDb;
            headTailStatsCache = headTailFromDb || {};
            sumDiffStatsCache = sumDiffFromDb || {};
            console.log(`[LotteryService] Stats loaded: number=${Object.keys(numberStatsCache).length}, head_tail=${Object.keys(headTailStatsCache).length}, sum_diff=${Object.keys(sumDiffStatsCache).length}`);
        } else {
            console.warn('[LotteryService] No stats found in DB. Stats will be empty until daily-update runs.');
            numberStatsCache = {};
            headTailStatsCache = {};
            sumDiffStatsCache = {};
        }

        _loadStatsPromise = null;
    })();

    return _loadStatsPromise;
};

/**
 * Đảm bảo cả rawData + stats đều loaded.
 * Dùng cho các API cần full data (quick-stats, suggestions, etc.)
 */
const loadAll = async () => {
    await loadRawData();
    await loadStats();
};

const getRawData = () => rawDataCache;

// Getters tự động trigger lazy load nếu chưa có stats
const getNumberStats = () => numberStatsCache;
const getHeadTailStats = () => headTailStatsCache;
const getSumDiffStats = () => sumDiffStatsCache;

const getTotalYears = () => {
    let firstDate = new Date('2005-10-01');
    let lastDate = new Date();
    
    // Hàm parse nhanh DD/MM/YYYY hoặc YYYY-MM-DD
    const parseAnyDate = (dStr) => {
        if (!dStr) return new Date();
        if (dStr.includes('/')) {
            const parts = dStr.split('/');
            return new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return new Date(dStr);
    };

    if (rawDataCache && rawDataCache.length > 0) {
        firstDate = parseAnyDate(rawDataCache[0].date);
        lastDate = parseAnyDate(rawDataCache[rawDataCache.length - 1].date);
    }
    const years = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    return years > 1 ? years : 1;
};

const clearCache = () => {
    rawDataCache = null;
    numberStatsCache = null;
    headTailStatsCache = null;
    sumDiffStatsCache = null;
    _loadRawPromise = null;
    _loadStatsPromise = null;
    console.log('[LotteryService] All caches cleared.');
};

module.exports = {
    loadRawData,
    loadStats,
    loadAll,
    getRawData,
    getNumberStats,
    getHeadTailStats,
    getSumDiffStats,
    getTotalYears,
    clearCache
};