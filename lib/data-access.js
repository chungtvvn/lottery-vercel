/**
 * Data Access Layer
 * Primary source: Supabase when env is configured.
 * Fallback source: local static JSON, kept so local/dev can still run during migration.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const {
    hasSupabaseReadonlyConfig,
    hasSupabaseAdminConfig,
    getSupabaseReadonlyClient,
    getSupabaseAdminClient
} = require('./supabase/client');

// Đường dẫn chọc thẳng vào JSON files được sinh sẵn qua github action
const DATA_DIR = path.join(process.cwd(), 'lib', 'data');
const STATS_DIR = path.join(DATA_DIR, 'statistics');

let _rawDataCache = null;
let _quickStatsCache = null;
let _quickStatsHistoryCache = null;
let _cachedPredictionsCache = null;
let _storageJsonCache = new Map();
let _rawDataCacheMtimeMs = null;
let _quickStatsCacheMtimeMs = null;
let _quickStatsHistoryCacheMtimeMs = null;

const STAT_FILE_BY_CATEGORY = {
    number: 'number_stats.json',
    head_tail: 'head_tail_stats.json',
    sum_diff: 'sum_difference_stats.json'
};

const STATS_BUCKET = process.env.SUPABASE_STATS_BUCKET || 'lottery-stats';
const STATS_STORAGE_PREFIX = process.env.SUPABASE_STATS_PREFIX || 'statistics';

function normalizeCategoryType(categoryType) {
    if (categoryType === 'sum_difference') return 'sum_diff';
    return categoryType;
}

function categoryTypeAliases(categoryType) {
    const normalized = normalizeCategoryType(categoryType);
    if (normalized === 'sum_diff') return ['sum_diff', 'sum_difference'];
    return [normalized];
}

function stableStringify(value) {
    if (value === undefined) return '"__undefined__"';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashValue(value) {
    return crypto
        .createHash('sha256')
        .update(stableStringify(value))
        .digest('hex');
}

function readDataSourceMode(name) {
    return String(process.env[name] || 'auto').trim().toLowerCase();
}

function shouldUseSupabaseRaw() {
    const mode = readDataSourceMode('LOTTERY_DATA_SOURCE');
    if (['local', 'json', 'static', 'file'].includes(mode)) return false;
    if (mode === 'supabase') return true;
    return hasSupabaseReadonlyConfig();
}

function shouldUseSupabaseStats() {
    const mode = readDataSourceMode('LOTTERY_STATS_SOURCE');
    if (['local', 'json', 'static', 'file'].includes(mode)) return false;
    if (mode === 'supabase' || mode === 'supabase-storage' || mode === 'storage') return true;
    return hasSupabaseAdminConfig();
}

function shouldUseSupabaseDbStats() {
    const mode = readDataSourceMode('LOTTERY_STATS_SOURCE');
    if (['local', 'json', 'static', 'file'].includes(mode)) return false;
    if (mode === 'supabase-storage-only' || mode === 'storage-only') return false;
    // Legacy Vercel envs may still say supabase-storage. Prefer DB stats when the
    // schema exists, then fall back to Storage/local inside loadStatsFromDb().
    if (mode === 'supabase-storage' || mode === 'storage') return hasSupabaseAdminConfig();
    if (mode === 'supabase' || mode === 'supabase-db' || mode === 'db') return true;
    return hasSupabaseAdminConfig();
}

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

function mapSupabaseLotteryRow(row) {
    return {
        date: String(row.draw_date || '').substring(0, 10),
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
}

async function fetchRawDataFromSupabase() {
    const supabase = getSupabaseReadonlyClient();
    const pageSize = 1000;
    const rows = [];

    for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from('lottery_results')
            .select('*')
            .order('draw_date', { ascending: true })
            .range(from, to);

        if (error) throw error;
        if (!data || data.length === 0) break;

        rows.push(...data.map(mapSupabaseLotteryRow));
        if (data.length < pageSize) break;
    }

    return rows;
}

async function loadJsonFromSupabaseStorage(fileName) {
    const cacheKey = `${STATS_BUCKET}/${STATS_STORAGE_PREFIX}/${fileName}`;
    if (_storageJsonCache.has(cacheKey)) return _storageJsonCache.get(cacheKey);

    const supabase = getSupabaseAdminClient();
    const gzPath = `${STATS_STORAGE_PREFIX}/${fileName}.gz`;
    const { data, error } = await supabase.storage.from(STATS_BUCKET).download(gzPath);

    if (error) throw error;

    const compressed = Buffer.from(await data.arrayBuffer());
    const jsonText = zlib.gunzipSync(compressed).toString('utf8');
    const parsed = JSON.parse(jsonText);

    _storageJsonCache.set(cacheKey, parsed);
    return parsed;
}

async function loadJsonWithSupabaseFallback(fileName) {
    if (shouldUseSupabaseStats()) {
        try {
            const data = await loadJsonFromSupabaseStorage(fileName);
            if (data) return data;
        } catch (error) {
            console.warn(`[DataAccess] Supabase Storage load failed for ${fileName}, fallback local JSON:`, error.message);
        }
    }
    return loadJsonFile(path.join(STATS_DIR, fileName));
}

async function getRawData() {
    const dataPath = path.join(DATA_DIR, 'xsmb-2-digits.json');
    const fileMtimeMs = getFileMtimeMs(dataPath);
    if (_rawDataCache && isFileCacheFresh(_rawDataCacheMtimeMs, fileMtimeMs)) return _rawDataCache;

    let allData = null;
    if (shouldUseSupabaseRaw()) {
        try {
            allData = await fetchRawDataFromSupabase();
            console.log(`[DataAccess] Fetched ${allData.length} lottery records via Supabase`);
        } catch (error) {
            console.warn('[DataAccess] Supabase raw load failed, fallback local JSON:', error.message);
        }
    }

    if (!allData || allData.length === 0) {
        allData = loadJsonFile(dataPath) || [];
        console.log(`[DataAccess] Fetched ${allData.length} lottery records via Static JSON`);
    }

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

    _rawDataCacheMtimeMs = fileMtimeMs;
    return _rawDataCache;
}

async function loadStatsFromDb(category) {
    const normalizedCategory = normalizeCategoryType(category);
    if (shouldUseSupabaseDbStats()) {
        try {
            const data = await loadCategoryStatsFromSupabaseDb(normalizedCategory);
            if (data && Object.keys(data).length > 0) {
                console.log(`[DataAccess] Loaded [${normalizedCategory}] stats from Supabase DB`);
                return data;
            }
        } catch (dbError) {
            console.warn(`[DataAccess] Supabase DB stats load failed for ${normalizedCategory}, fallback storage/file:`, dbError.message);
        }
    }

    const file = STAT_FILE_BY_CATEGORY[normalizedCategory];
    if (!file) return {};
    console.log(`[DataAccess] Loading [${normalizedCategory}] stats from ${shouldUseSupabaseStats() ? 'Supabase Storage' : 'Static JSON Files'}`);
    return await loadJsonWithSupabaseFallback(file) || {};
}

async function getQuickStatsFromCache() {
    if (shouldUseSupabaseDbStats()) {
        const cachedQuickStats = await readCacheStore('quick_stats');
        if (cachedQuickStats && typeof cachedQuickStats === 'object' && Object.keys(cachedQuickStats).length > 0) {
            return cachedQuickStats;
        }

        try {
            const supabase = getSupabaseAdminClient();
            const pageSize = 1000;
            const rows = [];
            for (let from = 0; ; from += pageSize) {
                const to = from + pageSize - 1;
                const { data, error } = await supabase
                    .from('streak_statistics')
                    .select('*')
                    .range(from, to);
                if (error) throw error;
                if (!data || data.length === 0) break;
                rows.push(...data);
                if (data.length < pageSize) break;
            }
            if (rows && rows.length > 0) {
                const formatToDDMMYYYY = (dStr) => {
                    if (!dStr) return '';
                    if (dStr.includes('-')) {
                        const parts = dStr.split('-');
                        if (parts.length === 3) {
                            const day = parts[2].substring(0, 2);
                            return `${day}/${parts[1]}/${parts[0]}`;
                        }
                    }
                    return dStr;
                };

                const formatStreakObj = (streak) => {
                    if (!streak) return null;
                    return {
                        ...streak,
                        startDate: formatToDDMMYYYY(streak.startDate),
                        endDate: formatToDDMMYYYY(streak.endDate),
                        dates: streak.dates ? streak.dates.map(formatToDDMMYYYY) : []
                    };
                };

                const quickStats = {};
                for (const row of rows) {
                    const key = row.subcategory ? `${row.category}:${row.subcategory}` : row.category;
                    quickStats[key] = {
                        description: row.description,
                        longest: Array.isArray(row.longest_streak) ? row.longest_streak.map(formatStreakObj) : [],
                        secondLongest: Array.isArray(row.second_longest_streak) ? row.second_longest_streak.map(formatStreakObj) : [],
                        current: formatStreakObj(row.current_streak),
                        averageInterval: row.average_interval ? Number(row.average_interval) : null,
                        daysSinceLast: row.days_since_last !== null ? row.days_since_last : 'N/A',
                        gapStats: row.gap_stats,
                        exactGapStats: row.exact_gap_stats,
                        extensionGapStats: row.extension_gap_stats,
                        lengthHistoryMetrics: row.length_history_metrics,
                        historyMetrics: row.history_metrics,
                        reliability: row.reliability
                    };
                }
                return quickStats;
            }
        } catch (dbError) {
            console.warn(`[DataAccess] Supabase DB quick stats fetch failed, fallback to file:`, dbError.message);
        }
    }

    const filePath = path.join(STATS_DIR, 'quick_stats.json');
    const fileMtimeMs = getFileMtimeMs(filePath);
    if (_quickStatsCache && isFileCacheFresh(_quickStatsCacheMtimeMs, fileMtimeMs)) return _quickStatsCache;
    const data = await loadJsonWithSupabaseFallback('quick_stats.json');
    if (data) {
        _quickStatsCache = data;
        _quickStatsCacheMtimeMs = fileMtimeMs;
    }
    return data;
}

async function getQuickStatsHistoryFromCache() {
    if (shouldUseSupabaseDbStats()) {
        try {
            const data = await readCacheStore('quick_stats_history');
            if (data) return data;
        } catch (dbError) {
            console.warn(`[DataAccess] Supabase DB quick stats history fetch failed, fallback to file:`, dbError.message);
        }
    }

    const filePath = path.join(STATS_DIR, 'quick_stats_history.json');
    const fileMtimeMs = getFileMtimeMs(filePath);
    if (_quickStatsHistoryCache && isFileCacheFresh(_quickStatsHistoryCacheMtimeMs, fileMtimeMs)) return _quickStatsHistoryCache;
    const data = await loadJsonWithSupabaseFallback('quick_stats_history.json');
    if (data) {
        _quickStatsHistoryCache = data;
        _quickStatsHistoryCacheMtimeMs = fileMtimeMs;
    }
    return data;
}

async function getCachedPredictionsFromCache() {
    if (_cachedPredictionsCache) return _cachedPredictionsCache;
    if (shouldUseSupabaseDbStats()) {
        try {
            const data = await readCacheStore('cached_predictions');
            if (data) {
                _cachedPredictionsCache = data;
                return data;
            }
        } catch (dbError) {
            console.warn(`[DataAccess] Supabase DB cached predictions fetch failed, fallback to file:`, dbError.message);
        }
    }
    _cachedPredictionsCache = await loadJsonWithSupabaseFallback('cached_predictions.json');
    return _cachedPredictionsCache;
}

async function readCacheStore(cacheKey) {
    if (!hasSupabaseReadonlyConfig() && !hasSupabaseAdminConfig()) return null;
    try {
        const client = hasSupabaseAdminConfig() ? getSupabaseAdminClient() : getSupabaseReadonlyClient();
        const { data, error } = await client
            .from('cache_store')
            .select('data')
            .eq('cache_key', cacheKey)
            .maybeSingle();
        if (error) throw error;
        return data ? data.data : null;
    } catch (error) {
        console.warn(`[DataAccess] Supabase cache read failed (${cacheKey}):`, error.message);
        return null;
    }
}

async function writeCacheStore(cacheKey, namespace, data) {
    if (!hasSupabaseAdminConfig()) return;
    try {
        const { error } = await getSupabaseAdminClient()
            .from('cache_store')
            .upsert({
                cache_key: cacheKey,
                namespace,
                data,
                is_public: false,
                updated_at: new Date().toISOString()
            }, { onConflict: 'cache_key' });
        if (error) throw error;
    } catch (error) {
        console.warn(`[DataAccess] Supabase cache write failed (${cacheKey}):`, error.message);
    }
}

async function getHistoryDateCache(dateKey) {
    return await readCacheStore(`history:${dateKey}`);
}

async function setHistoryDateCache(dateKey, data) {
    await writeCacheStore(`history:${dateKey}`, 'history', data);
}

async function getComputedSimCache(startDate, endDate) {
    return await readCacheStore(`simulation:${startDate}:${endDate}`);
}

async function saveComputedSimCache(startDate, endDate, data) {
    await writeCacheStore(`simulation:${startDate}:${endDate}`, 'simulation', data);
}

async function getLatestDate() {
    const rawData = await getRawData();
    if (!rawData || rawData.length === 0) return null;
    return rawData[rawData.length - 1].date;
}

async function getCategoryStats(categoryType, categoryKey, subcategory = null) {
    if (shouldUseSupabaseDbStats()) {
        try {
            const supabase = getSupabaseAdminClient();
            const typeAliases = categoryTypeAliases(categoryType);
            let statsQuery = supabase
                .from('streak_statistics')
                .select('*')
                .in('category_type', typeAliases)
                .eq('category', categoryKey);

            if (subcategory) {
                statsQuery = statsQuery.eq('subcategory', subcategory);
            }

            const { data: statsRows, error: statsError } = await statsQuery;

            if (statsError) throw statsError;
            if (statsRows && statsRows.length > 0) {
                const streaksRows = [];
                const pageSize = 1000;
                for (let from = 0; ; from += pageSize) {
                    const to = from + pageSize - 1;
                    let streaksQuery = supabase
                        .from('historical_streaks')
                        .select('*')
                        .in('category_type', typeAliases)
                        .eq('category', categoryKey);

                    if (subcategory) {
                        streaksQuery = streaksQuery.eq('subcategory', subcategory);
                    }

                    const { data, error } = await streaksQuery.range(from, to);
                    if (error) throw error;
                    if (!data || data.length === 0) break;
                    streaksRows.push(...data);
                    if (data.length < pageSize) break;
                }

                const formatToDDMMYYYY = (isoStr) => {
                    if (!isoStr) return '';
                    const parts = isoStr.split('-');
                    if (parts.length === 3) return `${parts[2].substring(0, 2)}/${parts[1]}/${parts[0]}`;
                    return isoStr;
                };

                const historicalStreaksGrouped = {};
                for (const sRow of streaksRows || []) {
                    const subcat = sRow.subcategory || 'default';
                    if (!historicalStreaksGrouped[subcat]) {
                        historicalStreaksGrouped[subcat] = [];
                    }
                    historicalStreaksGrouped[subcat].push({
                        startDate: formatToDDMMYYYY(sRow.start_date),
                        endDate: formatToDDMMYYYY(sRow.end_date),
                        length: sRow.length,
                        values: sRow.values,
                        dates: sRow.dates ? sRow.dates.map(formatToDDMMYYYY) : []
                    });
                }

                const firstRow = statsRows[0];
                if (firstRow.subcategory === null || firstRow.subcategory === '') {
                    return {
                        description: firstRow.description,
                        streaks: historicalStreaksGrouped['default'] || []
                    };
                }

                const result = {};
                for (const row of statsRows) {
                    const subcat = row.subcategory;
                    if (subcat) {
                        result[subcat] = {
                            description: row.description,
                            streaks: historicalStreaksGrouped[subcat] || []
                        };
                    }
                }
                return result;
            }
        } catch (dbError) {
            console.warn(`[DataAccess] Supabase DB load failed for category ${categoryKey}, fallback to file:`, dbError.message);
        }
    }

    const data = await loadStatsFromDb(categoryType);
    if (!data) return null;
    return data[categoryKey] || null;
}

async function loadCategoryStatsFromSupabaseDb(categoryType) {
    const normalizedCategory = normalizeCategoryType(categoryType);
    const aliases = categoryTypeAliases(normalizedCategory);
    const supabase = getSupabaseAdminClient();
    const pageSize = 1000;
    const statsRows = [];
    const streakRows = [];

    for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from('streak_statistics')
            .select('pattern_key, category, subcategory, description')
            .in('category_type', aliases)
            .range(from, to);
        if (error) throw error;
        if (!data || data.length === 0) break;
        statsRows.push(...data);
        if (data.length < pageSize) break;
    }

    if (statsRows.length === 0) return {};

    for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
            .from('historical_streaks')
            .select('pattern_key, start_date, end_date, length, values, dates')
            .in('category_type', aliases)
            .range(from, to);
        if (error) throw error;
        if (!data || data.length === 0) break;
        streakRows.push(...data);
        if (data.length < pageSize) break;
    }

    const formatToDDMMYYYY = (isoStr) => {
        if (!isoStr) return '';
        const parts = String(isoStr).split('-');
        if (parts.length === 3) return `${parts[2].substring(0, 2)}/${parts[1]}/${parts[0]}`;
        return String(isoStr);
    };

    const streaksByPattern = new Map();
    for (const row of streakRows) {
        if (!streaksByPattern.has(row.pattern_key)) streaksByPattern.set(row.pattern_key, []);
        streaksByPattern.get(row.pattern_key).push({
            startDate: formatToDDMMYYYY(row.start_date),
            endDate: formatToDDMMYYYY(row.end_date),
            length: row.length,
            values: row.values || [],
            dates: Array.isArray(row.dates) ? row.dates.map(formatToDDMMYYYY) : []
        });
    }

    for (const rows of streaksByPattern.values()) {
        rows.sort((a, b) => {
            const ad = String(a.endDate || '').split('/').reverse().join('-');
            const bd = String(b.endDate || '').split('/').reverse().join('-');
            return ad.localeCompare(bd);
        });
    }

    const result = {};
    for (const row of statsRows) {
        const payload = {
            description: row.description,
            streaks: streaksByPattern.get(row.pattern_key) || []
        };

        if (row.subcategory) {
            if (!result[row.category]) result[row.category] = {};
            result[row.category][row.subcategory] = payload;
        } else {
            result[row.category] = payload;
        }
    }

    return result;
}

async function getRecentResults(limit = 7) {
    const rawData = await getRawData();
    if (!rawData || rawData.length === 0) return [];
    return rawData.slice(-limit);
}

async function getAppConfig() {
    if (hasSupabaseReadonlyConfig()) {
        try {
            const { data, error } = await getSupabaseReadonlyClient()
                .from('app_config')
                .select('value')
                .eq('key', 'stats_config')
                .maybeSingle();
            if (!error && data && data.value) return data.value;
        } catch (error) {
            console.warn('[DataAccess] Supabase app_config read failed, fallback defaults:', error.message);
        }
    }

    return {
        GAP_STRATEGY: 'COMBINED',
        GAP_BUFFER_PERCENT: 0
    };
}

async function saveAllStatsToDb(numberStats, headTailStats, sumDiffStats, quickStats) {
    if (!hasSupabaseAdminConfig()) {
        throw new Error('Supabase admin configuration missing');
    }

    console.log('[SupabaseDB] Bắt đầu đồng bộ hóa thống kê vào Database...');
    quickStats = quickStats || {};
    const buckets = [
        { type: 'number', stats: numberStats },
        { type: 'head_tail', stats: headTailStats },
        { type: 'sum_diff', stats: sumDiffStats }
    ];

    for (const bucket of buckets) {
        console.log(`[SupabaseDB] Đang xử lý bucket: ${bucket.type}...`);
        const entries = [];

        for (const [category, val] of Object.entries(bucket.stats)) {
            if (!val) continue;

            if (Array.isArray(val.streaks)) {
                const patternKey = category;
                entries.push({
                    patternKey,
                    categoryType: bucket.type,
                    category,
                    subcategory: null,
                    description: val.description,
                    streaks: val.streaks,
                    qs: quickStats[patternKey] || {}
                });
            } else if (typeof val === 'object') {
                for (const [subcategory, subval] of Object.entries(val)) {
                    if (subval && Array.isArray(subval.streaks)) {
                        const patternKey = `${category}:${subcategory}`;
                        entries.push({
                            patternKey,
                            categoryType: bucket.type,
                            category,
                            subcategory,
                            description: subval.description,
                            streaks: subval.streaks,
                            qs: quickStats[patternKey] || {}
                        });
                    }
                }
            }
        }

        await savePatternStatsBatchToDb(bucket.type, entries);
    }

    console.log('[SupabaseDB] Đang lưu quick_stats_history vào cache_store...');
    // We also write quick_stats_history directly to cache_store table
    const fs = require('fs').promises;
    const path = require('path');
    const DATA_DIR = path.join(process.cwd(), 'lib', 'data');
    try {
        const historyJson = await fs.readFile(path.join(DATA_DIR, 'statistics', 'quick_stats_history.json'), 'utf8');
        const historyData = JSON.parse(historyJson);
        await writeCacheStore('quick_stats_history', 'statistics', historyData);
        console.log('[SupabaseDB] Đã lưu quick_stats_history vào cache_store thành công.');
    } catch (e) {
        console.warn('[SupabaseDB] Không thể lưu quick_stats_history vào cache_store:', e.message);
    }
}

async function saveSinglePatternStatsToDb(patternKey, categoryType, category, subcategory, description, streaks, qs) {
    if (!hasSupabaseAdminConfig()) {
        throw new Error('Supabase admin configuration missing');
    }
    const supabase = getSupabaseAdminClient();

    const formatToISO = (dateStr) => {
        if (!dateStr) return null;
        if (dateStr.includes('-')) return dateStr.substring(0, 10);
        const parts = dateStr.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        return dateStr;
    };

    const formatStreakToISO = (streak) => {
        if (!streak) return null;
        return {
            ...streak,
            startDate: formatToISO(streak.startDate),
            endDate: formatToISO(streak.endDate),
            dates: streak.dates ? streak.dates.map(formatToISO) : []
        };
    };

    const statRow = {
        pattern_key: patternKey,
        category_type: categoryType,
        category: category,
        subcategory: subcategory || null,
        description: description,
        longest_streak: Array.isArray(qs.longest) ? qs.longest.map(formatStreakToISO) : null,
        second_longest_streak: Array.isArray(qs.secondLongest) ? qs.secondLongest.map(formatStreakToISO) : null,
        current_streak: formatStreakToISO(qs.current),
        average_interval: qs.averageInterval || null,
        days_since_last: qs.daysSinceLast !== undefined && qs.daysSinceLast !== 'N/A' && qs.daysSinceLast !== null ? Number(qs.daysSinceLast) : null,
        gap_stats: qs.gapStats || null,
        exact_gap_stats: qs.exactGapStats || null,
        extension_gap_stats: qs.extensionGapStats || null,
        length_history_metrics: qs.lengthHistoryMetrics || null,
        history_metrics: qs.historyMetrics || null,
        reliability: qs.reliability || null,
        updated_at: new Date().toISOString()
    };

    const { error: statError } = await supabase
        .from('streak_statistics')
        .upsert(statRow, { onConflict: 'pattern_key' });
    if (statError) {
        console.error(`[SupabaseDB] Lỗi upsert statistics cho ${patternKey}:`, statError.message);
        throw statError;
    }

    const { error: delError } = await supabase
        .from('historical_streaks')
        .delete()
        .eq('pattern_key', patternKey);
    if (delError) {
        console.error(`[SupabaseDB] Lỗi xóa streaks cũ cho ${patternKey}:`, delError.message);
        throw delError;
    }

    if (streaks && streaks.length > 0) {
        const streaksRows = streaks.map(streak => ({
            pattern_key: patternKey,
            category_type: categoryType,
            category: category,
            subcategory: subcategory || null,
            start_date: formatToISO(streak.startDate),
            end_date: formatToISO(streak.endDate),
            length: streak.length,
            values: streak.values || [],
            dates: streak.dates ? streak.dates.map(formatToISO) : []
        }));

        const streaksBatchSize = 2000;
        for (let i = 0; i < streaksRows.length; i += streaksBatchSize) {
            const batch = streaksRows.slice(i, i + streaksBatchSize);
            const { error: insError } = await supabase
                .from('historical_streaks')
                .insert(batch);
            if (insError) {
                console.error(`[SupabaseDB] Lỗi insert streaks batch cho ${patternKey}:`, insError.message);
                throw insError;
            }
        }
    }
}

async function savePatternStatsBatchToDb(categoryType, entries) {
    if (!hasSupabaseAdminConfig()) {
        throw new Error('Supabase admin configuration missing');
    }
    if (!Array.isArray(entries) || entries.length === 0) {
        console.log(`[SupabaseDB] Không có pattern nào để ghi cho ${categoryType}.`);
        return;
    }

    const supabase = getSupabaseAdminClient();
    let hashColumnsAvailable = true;

    const formatToISO = (dateStr) => {
        if (!dateStr) return null;
        if (dateStr.includes('-')) return dateStr.substring(0, 10);
        const parts = dateStr.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        return dateStr;
    };

    const formatStreakToISO = (streak) => {
        if (!streak) return null;
        return {
            ...streak,
            startDate: formatToISO(streak.startDate),
            endDate: formatToISO(streak.endDate),
            dates: streak.dates ? streak.dates.map(formatToISO) : []
        };
    };

    const statsRows = [];
    const streakRowsByPattern = new Map();
    const now = new Date().toISOString();

    for (const entry of entries) {
        const qs = entry.qs || {};
        const streakRows = [];
        for (const streak of entry.streaks || []) {
            streakRows.push({
                pattern_key: entry.patternKey,
                category_type: entry.categoryType || categoryType,
                category: entry.category,
                subcategory: entry.subcategory || null,
                start_date: formatToISO(streak.startDate),
                end_date: formatToISO(streak.endDate),
                length: streak.length,
                values: streak.values || [],
                dates: streak.dates ? streak.dates.map(formatToISO) : []
            });
        }
        streakRowsByPattern.set(entry.patternKey, streakRows);

        const statRow = {
            pattern_key: entry.patternKey,
            category_type: entry.categoryType || categoryType,
            category: entry.category,
            subcategory: entry.subcategory || null,
            description: entry.description,
            longest_streak: Array.isArray(qs.longest) ? qs.longest.map(formatStreakToISO) : null,
            second_longest_streak: Array.isArray(qs.secondLongest) ? qs.secondLongest.map(formatStreakToISO) : null,
            current_streak: formatStreakToISO(qs.current),
            average_interval: qs.averageInterval || null,
            days_since_last: qs.daysSinceLast !== undefined && qs.daysSinceLast !== 'N/A' && qs.daysSinceLast !== null ? Number(qs.daysSinceLast) : null,
            gap_stats: qs.gapStats || null,
            exact_gap_stats: qs.exactGapStats || null,
            extension_gap_stats: qs.extensionGapStats || null,
            length_history_metrics: qs.lengthHistoryMetrics || null,
            history_metrics: qs.historyMetrics || null,
            reliability: qs.reliability || null,
            updated_at: now
        };
        const { updated_at: _updatedAt, ...hashableStatRow } = statRow;
        statRow.stats_hash = hashValue(hashableStatRow);
        statRow.streaks_hash = hashValue(streakRows.map(row => ({
            category_type: row.category_type,
            category: row.category,
            subcategory: row.subcategory,
            start_date: row.start_date,
            end_date: row.end_date,
            length: row.length,
            values: row.values,
            dates: row.dates
        })));
        statsRows.push(statRow);
    }

    const existingHashes = new Map();
    try {
        const pageSize = 1000;
        const aliases = categoryTypeAliases(categoryType);
        for (let from = 0; ; from += pageSize) {
            const to = from + pageSize - 1;
            const { data, error } = await supabase
                .from('streak_statistics')
                .select('pattern_key, stats_hash, streaks_hash')
                .in('category_type', aliases)
                .order('pattern_key', { ascending: true })
                .range(from, to);
            if (error) throw error;
            if (!data || data.length === 0) break;
            data.forEach(row => existingHashes.set(row.pattern_key, row));
            if (data.length < pageSize) break;
        }
    } catch (hashReadError) {
        hashColumnsAvailable = false;
        console.warn(`[SupabaseDB] Không đọc được cột hash cho ${categoryType}; fallback rewrite full category:`, hashReadError.message);
    }

    let rowsToUpsert = statsRows;
    let changedStreakRows = statsRows;
    if (hashColumnsAvailable) {
        rowsToUpsert = statsRows.filter(row => {
            const existing = existingHashes.get(row.pattern_key);
            return !existing || existing.stats_hash !== row.stats_hash || existing.streaks_hash !== row.streaks_hash;
        });
        changedStreakRows = statsRows.filter(row => {
            const existing = existingHashes.get(row.pattern_key);
            return !existing || existing.streaks_hash !== row.streaks_hash;
        });
    } else {
        rowsToUpsert = statsRows.map(({ stats_hash, streaks_hash, ...row }) => row);
        changedStreakRows = rowsToUpsert;
    }

    const statsBatchSize = 500;
    for (let i = 0; i < rowsToUpsert.length; i += statsBatchSize) {
        const batch = rowsToUpsert.slice(i, i + statsBatchSize);
        const { error } = await supabase
            .from('streak_statistics')
            .upsert(batch, { onConflict: 'pattern_key' });
        if (error) {
            console.error(`[SupabaseDB] Lỗi upsert statistics batch ${categoryType}/${i}:`, error.message);
            throw error;
        }
    }
    console.log(`[SupabaseDB] Đã upsert ${rowsToUpsert.length}/${statsRows.length} dòng thống kê cho ${categoryType}.`);

    const patternKeys = [...new Set(changedStreakRows.map(row => row.pattern_key).filter(Boolean))];
    if (patternKeys.length === 0) {
        console.log(`[SupabaseDB] Không có historical streaks thay đổi cho ${categoryType}; bỏ qua delete/insert.`);
        return;
    }

    const deleteChunkSize = 50;
    for (let i = 0; i < patternKeys.length; i += deleteChunkSize) {
        const chunk = patternKeys.slice(i, i + deleteChunkSize);
        const { error: delError } = await supabase
            .from('historical_streaks')
            .delete()
            .in('pattern_key', chunk);
        if (delError) {
            console.error(`[SupabaseDB] Lỗi xóa streaks cũ cho ${categoryType}/${i}:`, delError.message);
            throw delError;
        }
    }
    console.log(`[SupabaseDB] Đã xóa streaks cũ cho ${patternKeys.length}/${statsRows.length} pattern ${categoryType}.`);

    const streaksRows = [];
    patternKeys.forEach(patternKey => {
        const rows = streakRowsByPattern.get(patternKey) || [];
        streaksRows.push(...rows);
    });
    const streaksBatchSize = 2000;
    for (let i = 0; i < streaksRows.length; i += streaksBatchSize) {
        const batch = streaksRows.slice(i, i + streaksBatchSize);
        const { error } = await supabase
            .from('historical_streaks')
            .insert(batch);
        if (error) {
            console.error(`[SupabaseDB] Lỗi insert streaks batch ${categoryType}/${i}:`, error.message);
            throw error;
        }
    }
    console.log(`[SupabaseDB] Đã insert ${streaksRows.length} dòng historical streaks cho ${categoryType}.`);
}

async function writeCacheStoreDirect(cacheKey, namespace, data) {
    await writeCacheStore(cacheKey, namespace, data);
}

function clearCache() {
    _rawDataCache = null;
    _quickStatsCache = null;
    _quickStatsHistoryCache = null;
    _cachedPredictionsCache = null;
    _storageJsonCache = new Map();
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
    getCachedPredictionsFromCache,
    saveAllStatsToDb,
    saveSinglePatternStatsToDb,
    savePatternStatsBatchToDb,
    writeCacheStoreDirect,
    readCacheStore,
    shouldUseSupabaseDbStats,
    normalizeCategoryType
};
