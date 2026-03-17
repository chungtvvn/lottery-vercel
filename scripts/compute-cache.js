/**
 * compute-cache.js
 * Tính toán quick-stats và lưu vào Supabase cache_store
 * Chạy từ project CŨ (lottery-stats) vì có đủ data files
 */
require('dotenv').config({ path: '/Users/chungtv/Desktop/lottery-stats-vercel/.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
    console.log('[1] Loading services from old project...');
    
    // Use old project's services directly
    const oldPath = '/Users/chungtv/Desktop/lottery-stats';
    const statisticsService = require(`${oldPath}/services/statisticsService`);
    const lotteryService = require(`${oldPath}/services/lotteryService`);
    
    // Load data
    await lotteryService.loadRawData();
    
    // Compute quick stats (uses cached data from files)
    console.log('[2] Computing quick stats...');
    const quickStats = await statisticsService.getQuickStats();
    console.log(`   Quick stats keys: ${Object.keys(quickStats).length}`);
    
    // Save to Supabase
    console.log('[3] Saving quick_stats to Supabase...');
    const { error: e1 } = await supabase
        .from('cache_store')
        .upsert({ key: 'quick_stats', data: quickStats, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (e1) { console.error('Error:', e1.message); return; }
    console.log('   ✅ quick_stats saved');

    // Compute quick stats history
    console.log('[4] Computing quick stats history...');
    const history = await statisticsService.getQuickStatsHistory();
    console.log(`   History entries: ${history.length}`);
    
    console.log('[5] Saving quick_stats_history to Supabase...');
    const { error: e2 } = await supabase
        .from('cache_store')
        .upsert({ key: 'quick_stats_history', data: history, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (e2) { console.error('Error:', e2.message); return; }
    console.log('   ✅ quick_stats_history saved');
    
    console.log('\n=== CACHE COMPUTED AND SAVED ===');
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
