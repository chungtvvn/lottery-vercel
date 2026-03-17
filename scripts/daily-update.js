/**
 * daily-update.js
 * Script chạy bởi GitHub Actions hàng ngày (19:30 VN time)
 * 
 * Workflow:
 * 1. Fetch dữ liệu mới nhất từ GitHub
 * 2. Upload raw data vào Supabase Postgres
 * 3. Chạy 3 generators tạo file thống kê
 * 4. Tách stats theo category và upload lên Supabase Storage
 * 5. Pre-compute quick-stats và lưu cache
 */
require('dotenv').config({ path: '.env.local' });

const axios = require('axios');
const { getAdminClient } = require('../lib/supabase');
const { upsertLotteryResults, uploadCategoryStats, saveCacheEntry } = require('../lib/data-access');

const API_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/refs/heads/main/data/xsmb-2-digits.json';

async function main() {
    const startTime = Date.now();
    console.log('=== DAILY LOTTERY DATA UPDATE ===');
    console.log('Started at:', new Date().toISOString());

    try {
        // =========== STEP 1: Fetch raw data ===========
        console.log('\n[Step 1] Fetching data from GitHub...');
        const response = await axios.get(API_URL);
        const githubData = response.data;

        if (!githubData || !Array.isArray(githubData) || githubData.length === 0) {
            throw new Error('Invalid data from GitHub');
        }

        githubData.sort((a, b) => new Date(a.date) - new Date(b.date));
        console.log(`[Step 1] Fetched ${githubData.length} records`);

        // =========== STEP 2: Upload raw data to Postgres ===========
        console.log('\n[Step 2] Uploading raw data to Supabase Postgres...');
        await upsertLotteryResults(githubData);
        console.log('[Step 2] Done');

        // =========== STEP 3: Generate statistics (in memory) ===========
        console.log('\n[Step 3] Generating statistics...');
        
        // Temporarily write data to a file for generators to use
        const fs = require('fs');
        const path = require('path');
        const tmpDataDir = path.join(__dirname, '..', 'tmp_data');
        const tmpStatsDir = path.join(tmpDataDir, 'statistics');
        
        fs.mkdirSync(tmpStatsDir, { recursive: true });
        fs.writeFileSync(path.join(tmpDataDir, 'xsmb-2-digits.json'), JSON.stringify(githubData));

        // Patch generators to use tmp paths
        const origDir = path.join(__dirname, '..');
        process.env.LOTTERY_DATA_DIR = tmpDataDir;
        process.env.LOTTERY_STATS_DIR = tmpStatsDir;

        // Import and run generators
        // NOTE: These generators must be adapted to use env-based paths
        // For now, we run them and read results from tmp
        const { generateNumberStats } = require('../lib/generators/statisticsGenerator');
        const { generateHeadTailStats } = require('../lib/generators/headTailStatsGenerator');
        const { generateSumDifferenceStats } = require('../lib/generators/sumDifferenceStatsGenerator');

        await Promise.all([
            generateNumberStats(tmpDataDir, tmpStatsDir),
            generateHeadTailStats(tmpDataDir, tmpStatsDir),
            generateSumDifferenceStats(tmpDataDir, tmpStatsDir)
        ]);
        console.log('[Step 3] All generators completed');

        // =========== STEP 4: Upload stats to Supabase Storage ===========
        console.log('\n[Step 4] Uploading stats to Supabase Storage...');

        // Create storage bucket if not exists
        const admin = getAdminClient();
        try {
            await admin.storage.createBucket('stats', { public: true });
            console.log('[Step 4] Created storage bucket "stats"');
        } catch (e) {
            // Bucket already exists, that's fine
        }

        // Upload head_tail stats (split by category)
        const headTailStats = JSON.parse(fs.readFileSync(path.join(tmpStatsDir, 'head_tail_stats.json'), 'utf8'));
        for (const [category, data] of Object.entries(headTailStats)) {
            await uploadCategoryStats('head_tail', category, data);
        }
        console.log(`[Step 4] Uploaded ${Object.keys(headTailStats).length} head_tail categories`);

        // Upload sum_difference stats
        const sumDiffStats = JSON.parse(fs.readFileSync(path.join(tmpStatsDir, 'sum_difference_stats.json'), 'utf8'));
        for (const [category, data] of Object.entries(sumDiffStats)) {
            await uploadCategoryStats('sum_diff', category, data);
        }
        console.log(`[Step 4] Uploaded ${Object.keys(sumDiffStats).length} sum_diff categories`);

        // Upload number stats
        const numberStats = JSON.parse(fs.readFileSync(path.join(tmpStatsDir, 'number_stats.json'), 'utf8'));
        for (const [category, data] of Object.entries(numberStats)) {
            await uploadCategoryStats('number', category, data);
        }
        console.log(`[Step 4] Uploaded ${Object.keys(numberStats).length} number categories`);

        // =========== STEP 5: Pre-compute quick stats ===========
        console.log('\n[Step 5] Pre-computing quick stats...');
        
        // Load all stats into the service pattern expected by statisticsService
        const allStats = { ...numberStats, ...headTailStats, ...sumDiffStats };
        
        // Use the existing compute functions (they work with data objects, not files)
        const { computeQuickStats, computeQuickStatsHistory } = require('../lib/services/statsComputer');
        
        const quickStats = computeQuickStats(allStats, githubData);
        await saveCacheEntry('quick_stats', quickStats);
        console.log(`[Step 5] Quick stats saved (${Object.keys(quickStats).length} keys)`);

        const quickStatsHistory = computeQuickStatsHistory(allStats, githubData);
        await saveCacheEntry('quick_stats_history', quickStatsHistory);
        console.log(`[Step 5] Quick stats history saved (${quickStatsHistory.length} days)`);

        // =========== CLEANUP ===========
        fs.rmSync(tmpDataDir, { recursive: true, force: true });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n=== UPDATE COMPLETE in ${elapsed}s ===`);

    } catch (error) {
        console.error('\n=== UPDATE FAILED ===');
        console.error(error);
        process.exit(1);
    }
}

main();
