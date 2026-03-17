/**
 * lotteryService.js - Vercel version
 * Giữ nguyên interface (getRawData, getNumberStats, etc.)
 * nhưng load data từ Supabase thay vì filesystem
 */
const { getPublicClient } = require('../supabase');

let rawDataCache = null;
let numberStatsCache = null;
let headTailStatsCache = null;
let sumDiffStatsCache = null;
let _loadPromise = null;

/**
 * Download tất cả category files từ 1 bucket và merge thành 1 object
 */
async function downloadAllCategories(supabase, bucket) {
    const { data: files, error } = await supabase.storage
        .from('stats')
        .list(bucket, { limit: 200 });

    if (error || !files) {
        console.error(`[LotteryService] Error listing ${bucket}:`, error?.message);
        return {};
    }

    const result = {};
    // Download in parallel batches of 10
    for (let i = 0; i < files.length; i += 10) {
        const batch = files.slice(i, i + 10);
        const downloads = await Promise.all(
            batch.map(async (file) => {
                try {
                    const { data, error } = await supabase.storage
                        .from('stats')
                        .download(`${bucket}/${file.name}`);
                    if (error) return null;
                    const text = await data.text();
                    const categoryName = file.name.replace('.json', '');
                    return { name: categoryName, data: JSON.parse(text) };
                } catch (e) {
                    return null;
                }
            })
        );
        downloads.filter(Boolean).forEach(d => {
            result[d.name] = d.data;
        });
    }
    return result;
}

const loadRawData = async () => {
    // Prevent multiple concurrent loads
    if (_loadPromise) return _loadPromise;
    if (rawDataCache) return;

    _loadPromise = (async () => {
        console.log('[LotteryService] Đang tải dữ liệu từ Supabase...');
        const supabase = getPublicClient();

        // Load raw data from Postgres
        const { data: rawRows, error } = await supabase
            .from('lottery_results')
            .select('*')
            .order('draw_date', { ascending: true });

        if (error) {
            console.error('[LotteryService] Error loading raw data:', error.message);
        } else {
            rawDataCache = rawRows.map(row => ({
                date: row.draw_date,
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
            console.log(`[LotteryService] Đã tải thành công ${rawDataCache.length} bản ghi.`);
        }

        // Load stats from Supabase Storage (in parallel)
        const [numberStats, headTailStats, sumDiffStats] = await Promise.all([
            downloadAllCategories(supabase, 'number'),
            downloadAllCategories(supabase, 'head_tail'),
            downloadAllCategories(supabase, 'sum_diff')
        ]);

        numberStatsCache = numberStats;
        headTailStatsCache = headTailStats;
        sumDiffStatsCache = sumDiffStats;

        console.log(`[LotteryService] Stats loaded: number=${Object.keys(numberStatsCache).length}, head_tail=${Object.keys(headTailStatsCache).length}, sum_diff=${Object.keys(sumDiffStatsCache).length}`);
        _loadPromise = null;
    })();

    return _loadPromise;
};

const getRawData = () => rawDataCache;
const getNumberStats = () => numberStatsCache;
const getHeadTailStats = () => headTailStatsCache;
const getSumDiffStats = () => sumDiffStatsCache;

const getTotalYears = () => {
    let firstDate = new Date('2005-10-01');
    let lastDate = new Date();
    if (rawDataCache && rawDataCache.length > 0) {
        firstDate = new Date(rawDataCache[0].date);
        lastDate = new Date(rawDataCache[rawDataCache.length - 1].date);
    }
    const years = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365.25);
    return years > 1 ? years : 1;
};

const clearCache = () => {
    rawDataCache = null;
    numberStatsCache = null;
    headTailStatsCache = null;
    sumDiffStatsCache = null;
    _loadPromise = null;
    console.log('[LotteryService] Cache đã được xóa.');
};

module.exports = {
    loadRawData,
    getRawData,
    getNumberStats,
    getHeadTailStats,
    getSumDiffStats,
    getTotalYears,
    clearCache
};