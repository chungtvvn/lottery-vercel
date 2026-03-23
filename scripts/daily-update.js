/**
 * daily-update.js — SMART INCREMENTAL VERSION
 * Script chạy bởi GitHub Actions hàng ngày (7AM + 7PM VN)
 * 
 * Tối ưu Supabase Free Tier:
 * - Chỉ 1 query nhẹ để kiểm tra ngày mới nhất trong DB
 * - SKIP toàn bộ nếu không có dữ liệu mới (0 writes)
 * - Chỉ INSERT các ngày còn thiếu (thay vì upsert toàn bộ ~7400 rows)
 * - Dùng dữ liệu GitHub JSON trong memory cho stats generation (không đọc lại từ DB)
 * - Stats & quick_stats chỉ tính lại khi có dữ liệu mới
 */
require('dotenv').config({ path: '.env.local' });

const { getAdminClient, getPublicClient } = require('../lib/supabase');
const { saveStatsToDb, saveCacheEntry } = require('../lib/data-access');
const generateNumberStats = require('../lib/generators/statisticsGenerator');
const generateHeadTailStats = require('../lib/generators/headTailStatsGenerator');
const generateSumDifferenceStats = require('../lib/generators/sumDifferenceStatsGenerator');
const lotteryService = require('../lib/services/lotteryService');
const statisticsService = require('../lib/services/statisticsService');

const API_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json';

/**
 * Lấy ngày mới nhất trong DB — chỉ 1 query nhẹ (~1 read)
 */
async function getLatestDbDate() {
    const supabase = getPublicClient();
    const { data, error } = await supabase
        .from('lottery_results')
        .select('draw_date')
        .order('draw_date', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) return null;
    return data.draw_date; // "2026-03-23" format
}

/**
 * Chỉ INSERT các ngày còn thiếu vào DB.
 * Trả về { newCount, latestDate }
 */
async function insertMissingDays(sortedData, latestDbDate) {
    let newRecords;

    if (!latestDbDate) {
        // DB trống — insert tất cả (lần đầu tiên)
        newRecords = sortedData;
        console.log(`   DB trống! Insert ALL ${sortedData.length} records`);
    } else {
        // Chỉ lấy các ngày > latestDbDate
        const latestTs = new Date(latestDbDate).getTime();
        newRecords = sortedData.filter(r => new Date(r.date).getTime() > latestTs);
    }

    if (newRecords.length === 0) {
        return { newCount: 0 };
    }

    console.log(`   Inserting ${newRecords.length} new records...`);

    // Convert to DB format
    const rows = newRecords.map(r => {
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

    // Insert in batches (thay vì upsert — vì ta đã biết chắc là ngày MỚI)
    const admin = getAdminClient();
    for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await admin
            .from('lottery_results')
            .upsert(batch, { onConflict: 'draw_date' });

        if (error) {
            console.error(`   Error inserting batch:`, error.message);
            throw error;
        }
    }

    return { newCount: newRecords.length };
}

async function main() {
    const startTime = Date.now();
    console.log('=== DAILY LOTTERY DATA UPDATE (SMART) ===');
    console.log('Started at:', new Date().toISOString());

    try {
        // ─── STEP 1: Kiểm tra ngày mới nhất trong DB (1 lightweight read) ───
        console.log('\n[Step 1] Checking latest date in DB...');
        const latestDbDate = await getLatestDbDate();
        console.log(`   Latest DB date: ${latestDbDate || 'EMPTY'}`);

        // ─── STEP 2: Fetch dữ liệu từ GitHub (free, không tốn Supabase quota) ───
        console.log('\n[Step 2] Fetching data from GitHub...');
        const rawJsonData = await fetch(API_URL).then(r => r.json());

        if (!rawJsonData || !Array.isArray(rawJsonData) || rawJsonData.length === 0) {
            throw new Error('Invalid data from GitHub');
        }

        const sortedData = [...rawJsonData].sort((a, b) => new Date(a.date) - new Date(b.date));
        const latestGithubDate = new Date(sortedData[sortedData.length - 1].date)
            .toISOString().split('T')[0];
        console.log(`   GitHub data: ${sortedData.length} records, latest: ${latestGithubDate}`);

        // ─── STEP 3: So sánh & early-exit nếu không có dữ liệu mới ───
        if (latestDbDate && latestDbDate >= latestGithubDate) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n✅ SKIP — DB đã cập nhật rồi (${latestDbDate}). Tốn 1 read, 0 writes. (${elapsed}s)`);
            console.log('=== NO UPDATE NEEDED ===');
            return;
        }

        // ─── STEP 4: Chỉ insert các ngày còn thiếu ───
        console.log('\n[Step 3] Inserting missing days...');
        const { newCount } = await insertMissingDays(sortedData, latestDbDate);
        console.log(`   ✅ Inserted ${newCount} new records`);

        // ─── STEP 5: Xóa cache cũ trong DB ───
        console.log('\n[Step 4] Clearing stale caches...');
        const admin = getAdminClient();
        await admin.from('cache_store').delete()
            .in('key', ['quick_stats', 'quick_stats_history']);
        await admin.from('cache_store').delete()
            .like('key', 'quick_stats_chunk_%');
        console.log('   ✅ Cache cleared');

        // ─── STEP 6: Generate stats IN-MEMORY từ GitHub data (KHÔNG đọc DB lại) ───
        console.log('\n[Step 5] Generating stats in-memory (from GitHub data, 0 DB reads)...');

        console.log('   → Number Stats...');
        const numStats = await generateNumberStats(null, null, sortedData);
        await saveStatsToDb('number', numStats);

        console.log('   → Head/Tail Stats...');
        const htStats = await generateHeadTailStats(null, null, sortedData);
        await saveStatsToDb('head_tail', htStats);

        console.log('   → Sum/Difference Stats...');
        const sdStats = await generateSumDifferenceStats(null, null, sortedData);
        await saveStatsToDb('sum_diff', sdStats);

        console.log('   ✅ All 3 stats saved');

        // ─── STEP 7: Pre-compute Quick Stats ───
        // Ở đây ta BẮT BUỘC phải dùng lotteryService vì statisticsService.getQuickStats()
        // cần stats đã load qua lotteryService (getNumberStats, etc.)
        // Thay vì đọc rawData từ DB (8 reads), ta inject trực tiếp vào cache
        console.log('\n[Step 6] Pre-computing Quick Stats...');
        try { if (lotteryService.clearCache) lotteryService.clearCache(); } catch(e) {}
        try { if (statisticsService.clearCache) statisticsService.clearCache(); } catch(e) {}

        // Load rawData + stats từ DB (stats vừa save ở step 5)
        // rawData cần đọc từ DB vì lotteryService format khác GitHub format
        await lotteryService.loadAll();

        const quickStats = await statisticsService.getQuickStats();
        const history = await statisticsService.getQuickStatsHistory();
        await saveCacheEntry('quick_stats', quickStats);
        await saveCacheEntry('quick_stats_history', history);
        console.log('   ✅ Quick Stats & History saved');

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n=== UPDATE COMPLETE in ${elapsed}s (${newCount} new records) ===`);

    } catch (error) {
        console.error('\n=== UPDATE FAILED ===');
        console.error(error);
        process.exit(1);
    }
}

main();
