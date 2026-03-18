/**
 * daily-update.js
 * Script chạy bởi GitHub Actions hàng ngày (19:30 VN time)
 * 
 * Workflow:
 * 1. Fetch dữ liệu mới nhất từ GitHub
 * 2. Upload raw data vào Supabase Postgres
 * 3. Chạy 3 generators in-memory
 * 4. Lưu FAST chunked data vào cache_store
 * 5. Pre-compute quick-stats và lưu cache
 */
require('dotenv').config({ path: '.env.local' });

const { getAdminClient } = require('../lib/supabase');
const { upsertLotteryResults, saveStatsToDb, saveCacheEntry } = require('../lib/data-access');
const generateNumberStats = require('../lib/generators/statisticsGenerator');
const generateHeadTailStats = require('../lib/generators/headTailStatsGenerator');
const generateSumDifferenceStats = require('../lib/generators/sumDifferenceStatsGenerator');
const lotteryService = require('../lib/services/lotteryService');
const statisticsService = require('../lib/services/statisticsService');

const API_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json';

async function main() {
    const startTime = Date.now();
    console.log('=== DAILY LOTTERY DATA UPDATE ===');
    console.log('Started at:', new Date().toISOString());

    try {
        console.log('\n[Step 1] Fetching raw data from GitHub...');
        const rawJsonData = await fetch(API_URL).then(r => r.json());
        
        if (!rawJsonData || !Array.isArray(rawJsonData) || rawJsonData.length === 0) {
            throw new Error('Invalid data from GitHub');
        }

        const sortedData = [...rawJsonData].sort((a,b) => new Date(a.date) - new Date(b.date));
        console.log(`[Step 1] Fetched ${sortedData.length} records`);

        console.log('\n[Step 2] Uploading raw data to Supabase Postgres...');
        await upsertLotteryResults(sortedData);
        console.log('[Step 2] Done');

        console.log('\n[Step 3] Generating Number Stats In-Memory...');
        const numStats = await generateNumberStats(null, null, sortedData);
        await saveStatsToDb('number', numStats);
        console.log('[Step 3] Done');

        console.log('\n[Step 4] Generating Head/Tail Stats In-Memory...');
        const htStats = await generateHeadTailStats(null, null, sortedData);
        await saveStatsToDb('head_tail', htStats);
        console.log('[Step 4] Done');

        console.log('\n[Step 5] Generating Sum/Difference Stats In-Memory...');
        const sdStats = await generateSumDifferenceStats(null, null, sortedData);
        await saveStatsToDb('sum_diff', sdStats);
        console.log('[Step 5] Done');

        console.log('\n[Step 6] Pre-computing Quick Stats...');
        try { if (lotteryService.clearCache) lotteryService.clearCache(); } catch(e) {}
        try { if (statisticsService.clearCache) statisticsService.clearCache(); } catch(e) {}
        await lotteryService.loadRawData();
        const quickStats = await statisticsService.getQuickStats();
        const history = await statisticsService.getQuickStatsHistory();
        await saveCacheEntry('quick_stats', quickStats);
        await saveCacheEntry('quick_stats_history', history);
        console.log('[Step 6] Done');

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n=== UPDATE COMPLETE in ${elapsed}s ===`);

    } catch (error) {
        console.error('\n=== UPDATE FAILED ===');
        console.error(error);
        process.exit(1);
    }
}

main();
