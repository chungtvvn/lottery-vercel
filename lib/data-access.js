/**
 * Data Access Layer (STATIC JSON WORKFLOW)
 * Mọi dữ liệu giờ được lấy TRỰC TIẾP từ file JSON thông qua hệ thống fs tĩnh.
 * Xóa bỏ hoàn toàn Supabase để đẩy tốc độ lên tối đa (Vercel Serverless File System).
 * KHÔNG còn tốn dung lượng DB hay timeout mạng API!
 */
const fs = require('fs');
const path = require('path');

// Đường dẫn chọc thẳng vào JSON files được sinh sẵn qua github action
const DATA_DIR = path.join(process.cwd(), 'lib', 'data');
const STATS_DIR = path.join(DATA_DIR, 'statistics');

let _rawDataCache = null;
let _quickStatsCache = null;
let _quickStatsHistoryCache = null;
let _rawDataCacheMtimeMs = null;
let _quickStatsCacheMtimeMs = null;
let _quickStatsHistoryCacheMtimeMs = null;

// Helper: load local JSON file safely
function loadJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const fileContent = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileContent);
    } catch (e) {
        console.error(`[DataAccess] Lỗi đọc file ${filePath}:`, e.message);
        return null; // Gracefully fallback
    }
}

function getFileMtimeMs(filePath) {
    try {
        return fs.statSync(filePath).mtimeMs;
    } catch (e) {
        return null;
    }
}

function isFileCacheFresh(cacheMtimeMs, fileMtimeMs) {
    if (process.env.NODE_ENV !== 'development') return true;
    return cacheMtimeMs !== null && fileMtimeMs !== null && cacheMtimeMs === fileMtimeMs;
}

async function getRawData() {
    const dataPath = path.join(DATA_DIR, 'xsmb-2-digits.json');
    const fileMtimeMs = getFileMtimeMs(dataPath);
    if (_rawDataCache && isFileCacheFresh(_rawDataCacheMtimeMs, fileMtimeMs)) return _rawDataCache;

    const allData = loadJsonFile(dataPath) || [];

    _rawDataCache = allData.map(row => {
        let d = row.date;
        if (d.includes('T')) d = new Date(d).toISOString().replace('Z', '');
        return {
            date: d,
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
        };
    });

    console.log(`[DataAccess] Fetched ${_rawDataCache.length} total lottery records via Static JSON`);
    _rawDataCacheMtimeMs = fileMtimeMs;
    return _rawDataCache;
}

async function loadStatsFromDb(category) {
    console.log(`[DataAccess] Loading [${category}] stats from Static JSON Files`);
    let file = '';
    if (category === 'number') file = 'number_stats.json';
    else if (category === 'head_tail') file = 'head_tail_stats.json';
    else if (category === 'sum_diff') file = 'sum_difference_stats.json';

    return loadJsonFile(path.join(STATS_DIR, file)) || {};
}

async function getQuickStatsFromCache() {
    const filePath = path.join(STATS_DIR, 'quick_stats.json');
    const fileMtimeMs = getFileMtimeMs(filePath);
    if (_quickStatsCache && isFileCacheFresh(_quickStatsCacheMtimeMs, fileMtimeMs)) return _quickStatsCache;
    const data = loadJsonFile(filePath);
    if (data) {
        _quickStatsCache = data;
        _quickStatsCacheMtimeMs = fileMtimeMs;
    }
    return data;
}

async function getQuickStatsHistoryFromCache() {
    const filePath = path.join(STATS_DIR, 'quick_stats_history.json');
    const fileMtimeMs = getFileMtimeMs(filePath);
    if (_quickStatsHistoryCache && isFileCacheFresh(_quickStatsHistoryCacheMtimeMs, fileMtimeMs)) return _quickStatsHistoryCache;
    const data = loadJsonFile(filePath);
    if (data) {
        _quickStatsHistoryCache = data;
        _quickStatsHistoryCacheMtimeMs = fileMtimeMs;
    }
    return data;
}

async function getCachedPredictionsFromCache() {
    return loadJsonFile(path.join(STATS_DIR, 'cached_predictions.json'));
}

async function getHistoryDateCache(dateKey) { return null; }
async function setHistoryDateCache(dateKey, data) { }
async function getComputedSimCache(startDate, endDate) { return null; }
async function saveComputedSimCache(startDate, endDate, data) { }

async function getLatestDate() {
    const rawData = await getRawData();
    if (!rawData || rawData.length === 0) return null;
    return rawData[rawData.length - 1].date;
}

async function getCategoryStats(categoryType, categoryKey) {
    const data = await loadStatsFromDb(categoryType);
    if (!data) return null;
    return data[categoryKey] || null;
}

async function getRecentResults(limit = 7) {
    const rawData = await getRawData();
    if (!rawData || rawData.length === 0) return [];
    return rawData.slice(-limit);
}

async function getAppConfig() {
    // Static config — no DB dependency
    return {
        GAP_STRATEGY: 'COMBINED',
        GAP_BUFFER_PERCENT: 0
    };
}

function clearCache() {
    _rawDataCache = null;
    _quickStatsCache = null;
    _quickStatsHistoryCache = null;
    _rawDataCacheMtimeMs = null;
    _quickStatsCacheMtimeMs = null;
    _quickStatsHistoryCacheMtimeMs = null;
}

module.exports = {
    getRawData,
    loadStatsFromDb,
    getQuickStatsFromCache,
    getQuickStatsHistoryFromCache,
    getHistoryDateCache,
    setHistoryDateCache,
    getComputedSimCache,
    saveComputedSimCache,
    getLatestDate,
    getCategoryStats,
    getRecentResults,
    getAppConfig,
    clearCache,
    getCachedPredictionsFromCache
};
