/**
 * Data Access Layer
 * Thay thế tất cả filesystem reads bằng Supabase queries.
 * Logic tính toán KHÔNG thay đổi, chỉ thay I/O.
 */
const { getPublicClient, getAdminClient } = require('./supabase');

// ========== IN-MEMORY CACHE (per serverless invocation) ==========
// Trên Vercel, mỗi container serverless có thể reuse trong ~5-15 phút
// Cache sẽ tồn tại trong khoảng này, giúp tăng tốc warm starts
let _rawDataCache = null;
let _quickStatsCache = null;
let _quickStatsHistoryCache = null;

// ========== RAW LOTTERY DATA ==========

/**
 * Lấy raw lottery data từ Supabase Postgres
 * Tương đương: fs.readFileSync('data/xsmb-2-digits.json')
 * @returns {Array} Format giống file JSON gốc
 */
async function getRawData() {
    if (_rawDataCache) return _rawDataCache;

    const supabase = getPublicClient();
    
    // Supabase defaults to 1000 rows - paginate to get all
    let allData = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('lottery_results')
            .select('*')
            .order('draw_date', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

        if (error) {
            console.error('[DataAccess] Error fetching raw data:', error.message);
            break;
        }

        if (data && data.length > 0) {
            allData = allData.concat(data);
            from += PAGE_SIZE;
            hasMore = data.length === PAGE_SIZE;
        } else {
            hasMore = false;
        }
    }

    console.log(`[DataAccess] Fetched ${allData.length} total lottery records`);

    // Convert to legacy format (matching xsmb-2-digits.json structure)
    _rawDataCache = allData.map(row => ({
        date: new Date(row.draw_date).toISOString().replace('Z', ''),
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

    return _rawDataCache;
}

/**
 * Lấy ngày có kết quả mới nhất
 */
async function getLatestDate() {
    const supabase = getPublicClient();
    const { data, error } = await supabase
        .from('lottery_results')
        .select('draw_date')
        .order('draw_date', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) return null;
    const d = new Date(data.draw_date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Lấy N kết quả gần nhất
 */
async function getRecentResults(count = 7) {
    const supabase = getPublicClient();
    const { data, error } = await supabase
        .from('lottery_results')
        .select('*')
        .order('draw_date', { ascending: false })
        .limit(count);

    if (error) return [];
    return data.reverse(); // oldest first
}

// ========== PRE-COMPUTED STATISTICS ==========

/**
 * Lấy stats cho 1 category từ Supabase Storage
 * Tương đương: JSON.parse(fs.readFileSync('data/statistics/head_tail_stats.json'))[category]
 * @param {string} bucket - 'head_tail', 'sum_diff', 'number'
 * @param {string} category - tên category (e.g., 'dau_chan', 'motSoVeLienTiep')
 */
async function getCategoryStats(bucket, category) {
    const supabase = getPublicClient();

    // Try Postgres cache_store first (faster)
    const cacheKey = `stats:${bucket}:${category}`;
    const { data: cacheData, error: cacheError } = await supabase
        .from('cache_store')
        .select('data')
        .eq('key', cacheKey)
        .single();

    if (!cacheError && cacheData && cacheData.data) {
        return cacheData.data;
    }

    // Fallback to Supabase Storage
    const filePath = `${bucket}/${category}.json`;
    const { data, error } = await supabase.storage
        .from('stats')
        .download(filePath);

    if (error) {
        console.error(`[DataAccess] Error downloading ${filePath}:`, error.message);
        return null;
    }

    const text = await data.text();
    return JSON.parse(text);
}

/**
 * Lấy pre-computed quick stats từ cache_store
 */
async function getQuickStatsFromCache() {
    if (_quickStatsCache) return _quickStatsCache;

    const supabase = getPublicClient();
    const { data, error } = await supabase
        .from('cache_store')
        .select('data')
        .like('key', 'quick_stats_chunk_%');

    if (error || !data || data.length === 0) {
        console.error('[DataAccess] Quick stats cache miss');
        return null;
    }

    _quickStatsCache = {};
    for (const row of data) {
        Object.assign(_quickStatsCache, row.data);
    }

    return _quickStatsCache;
}

/**
 * Lấy pre-computed quick stats history (7 ngày)
 */
async function getQuickStatsHistoryFromCache() {
    if (_quickStatsHistoryCache) return _quickStatsHistoryCache;

    const supabase = getPublicClient();
    const { data, error } = await supabase
        .from('cache_store')
        .select('data')
        .eq('key', 'quick_stats_history')
        .single();

    if (error || !data) return null;

    _quickStatsHistoryCache = data.data;
    return _quickStatsHistoryCache;
}

// ========== PREDICTIONS ==========

async function getLatestPrediction() {
    const supabase = getPublicClient();
    const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .order('prediction_date', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) return null;
    return data.data;
}

async function getPredictionHistory() {
    const supabase = getPublicClient();
    const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .order('prediction_date', { ascending: true });

    if (error) return [];
    return data.map(row => row.data);
}

// ========== CONFIG ==========

async function getAppConfig() {
    const supabase = getPublicClient();
    const { data, error } = await supabase
        .from('app_config')
        .select('value')
        .eq('key', 'stats_config')
        .single();

    if (error || !data) {
        return {
            GAP_STRATEGY: 'COMBINED',
            GAP_BUFFER_PERCENT: 0,
            GAP_THRESHOLD_PERCENT: 0,
            USE_CONFIDENCE_SCORE: false,
            EXCLUSION_STRATEGY: '4tier',
            INITIAL_BET_AMOUNT: 10,
            BET_STEP_AMOUNT: 5
        };
    }
    return data.value;
}

// ========== WRITE OPS (admin only, used by GitHub Actions script) ==========

/**
 * Upsert lottery results vào Postgres
 */
async function upsertLotteryResults(results) {
    const admin = getAdminClient();
    const rows = results.map(r => {
        const d = new Date(r.date);
        return {
            draw_date: d.toISOString().split('T')[0],
            special: r.special,
            prize1: r.prize1,
            prize2_1: r.prize2_1, prize2_2: r.prize2_2,
            prize3_1: r.prize3_1, prize3_2: r.prize3_2, prize3_3: r.prize3_3,
            prize3_4: r.prize3_4, prize3_5: r.prize3_5, prize3_6: r.prize3_6,
            prize4_1: r.prize4_1, prize4_2: r.prize4_2, prize4_3: r.prize4_3, prize4_4: r.prize4_4,
            prize5_1: r.prize5_1, prize5_2: r.prize5_2, prize5_3: r.prize5_3,
            prize5_4: r.prize5_4, prize5_5: r.prize5_5, prize5_6: r.prize5_6,
            prize6_1: r.prize6_1, prize6_2: r.prize6_2, prize6_3: r.prize6_3,
            prize7_1: r.prize7_1, prize7_2: r.prize7_2, prize7_3: r.prize7_3, prize7_4: r.prize7_4
        };
    });

    // Upsert in batches of 500
    for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await admin
            .from('lottery_results')
            .upsert(batch, { onConflict: 'draw_date' });

        if (error) {
            console.error(`[DataAccess] Error upserting batch ${i}:`, error.message);
            throw error;
        }
    }
    console.log(`[DataAccess] Upserted ${rows.length} lottery results`);
}

/**
 * Upload category stats file lên Supabase Storage (legacy - kept for backward compat)
 */
async function uploadCategoryStats(bucket, category, data) {
    const admin = getAdminClient();
    const filePath = `${bucket}/${category}.json`;
    const content = JSON.stringify(data);

    const { error } = await admin.storage
        .from('stats')
        .upload(filePath, content, {
            contentType: 'application/json',
            upsert: true
        });

    if (error) {
        console.error(`[DataAccess] Error uploading ${filePath}:`, error.message);
        throw error;
    }
}

/**
 * Lưu TOÀN BỘ stats của một loại vào Postgres cache_store
 * Mỗi category = 1 row với key format: stats:{statType}:{categoryName}
 * @param {string} statType - 'number', 'head_tail', 'sum_diff'
 * @param {Object} stats - object {categoryName: categoryData}
 */
/**
 * @param {Object} stats - object {categoryName: categoryData}
 */
async function saveStatsToDb(statType, stats) {
    const admin = getAdminClient();
    console.log(`[DataAccess] Saving FAST full stats to DB in chunks for: ${statType}...`);

    const keys = Object.keys(stats);
    const CHUNK_SIZE = 5; 
    const chunks = [];
    
    // Xóa tất cả chunk cũ trước (nếu có)
    await admin.from('cache_store').delete().like('key', `stats_full_${statType}_%`);

    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
        const chunkKeys = keys.slice(i, i + CHUNK_SIZE);
        const chunkData = {};
        for (const k of chunkKeys) {
            chunkData[k] = stats[k];
        }
        chunks.push({
            key: `stats_full_${statType}_${i / CHUNK_SIZE}`,
            data: chunkData,
            updated_at: new Date().toISOString()
        });
    }

    // Insert new chunks safely
    for (const chunk of chunks) {
        const { error } = await admin.from('cache_store').upsert(chunk, { onConflict: 'key' });
        if (error) {
            console.error(`[DataAccess] Error saving FAST stats ${statType} chunk ${chunk.key}:`, error.message);
            throw error;
        }
    }
    console.log(`[DataAccess] Saved ${keys.length} ${statType} categories into ${chunks.length} DB chunks successfully.`);
}

/**
 * Upload the ENTIRE stats object as one single file for extremely fast <1s loading.
 */
async function uploadFullStatsToStorage(bucket, data) {
    // Deprecated. Storage API occasionally fails out with timeout in serverless limits.
    // Instead, we rely on the single-row Postgres approach below.
    return Promise.resolve();
}

/**
 * Load stats từ Storage (Fast) hoặc Postgres cache_store
 * @param {string} statType - 'number', 'head_tail', 'sum_diff'
 * @returns {Object} merged stats object {categoryName: categoryData}
 */
async function loadStatsFromDb(statType) {
    const supabase = getPublicClient();
    
    const { data, error } = await supabase
        .from('cache_store')
        .select('data')
        .like('key', `stats_full_${statType}_%`);
    
    if (error || !data || data.length === 0) {
        console.log(`[DataAccess] FAST chunked DB absent for ${statType}`);
        return null;
    }
    
    const result = {};
    for (const row of data) {
        Object.assign(result, row.data);
    }

    console.log(`[DataAccess] FAST-Loaded ${Object.keys(result).length} ${statType} categories from DB chunks.`);
    return result;
}

/**
 * Lưu pre-computed cache vào Postgres
 */
async function saveCacheEntry(key, data) {
    const admin = getAdminClient();

    // Nếu là quick_stats khổng lồ (12MB), ta CHUNK NÓ bằng cách rã từng keys!
    if (key === 'quick_stats' && typeof data === 'object' && !Array.isArray(data)) {
        console.log(`[DataAccess] Chunking cache ${key} before saving...`);
        const itemKeys = Object.keys(data).filter(k => k !== '_meta');
        const CHUNK_SIZE = 15;
        const chunks = [];
        
        await admin.from('cache_store').delete().like('key', `quick_stats_chunk_%`);

        for (let i = 0; i < itemKeys.length; i += CHUNK_SIZE) {
            const chunkKeys = itemKeys.slice(i, i + CHUNK_SIZE);
            const chunkData = {};
            for (const k of chunkKeys) chunkData[k] = data[k];
            if (i === 0 && data._meta) chunkData._meta = data._meta; // include meta in chunk 0

            chunks.push({
                key: `quick_stats_chunk_${i / CHUNK_SIZE}`,
                data: chunkData,
                updated_at: new Date().toISOString()
            });
        }
        
        for (const chunk of chunks) {
            const { error } = await admin.from('cache_store').upsert(chunk, { onConflict: 'key' });
            if (error) throw error;
        }
        console.log(`[DataAccess] Saved cache ${key} securely across ${chunks.length} chunks.`);
        return;
    }

    // Single item fallback for small arrays/strings
    const { error } = await admin
        .from('cache_store')
        .upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
        console.error(`[DataAccess] Error saving cache ${key}:`, error.message);
        throw error;
    }
    console.log(`[DataAccess] Saved standard cache: ${key} (${JSON.stringify(data).length} bytes)`);
}

/**
 * Lưu prediction
 */
async function savePrediction(date, predictionData) {
    const admin = getAdminClient();
    const { error } = await admin
        .from('predictions')
        .upsert({
            prediction_date: date,
            data: predictionData,
            created_at: new Date().toISOString()
        }, { onConflict: 'prediction_date' });

    if (error) throw error;
}

/**
 * Xóa cache
 */
function clearMemoryCache() {
    _rawDataCache = null;
    _quickStatsCache = null;
    _quickStatsHistoryCache = null;
}

module.exports = {
    // Read ops (public client)
    getRawData,
    getLatestDate,
    getRecentResults,
    getCategoryStats,
    getQuickStatsFromCache,
    getQuickStatsHistoryFromCache,
    getLatestPrediction,
    getPredictionHistory,
    getAppConfig,
    // Write ops (admin client)
    upsertLotteryResults,
    uploadCategoryStats,
    uploadFullStatsToStorage,
    saveStatsToDb,
    loadStatsFromDb,
    saveCacheEntry,
    savePrediction,
    clearMemoryCache
};
