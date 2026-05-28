require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { saveAllStatsToDb, writeCacheStoreDirect } = require('../lib/data-access');

const STATS_DIR = path.join(process.cwd(), 'lib', 'data', 'statistics');

async function main() {
    console.log('[SupabaseDB] Bắt đầu đọc dữ liệu thống kê từ files...');
    
    const numberStatsPath = path.join(STATS_DIR, 'number_stats.json');
    const headTailStatsPath = path.join(STATS_DIR, 'head_tail_stats.json');
    const sumDiffStatsPath = path.join(STATS_DIR, 'sum_difference_stats.json');
    const quickStatsPath = path.join(STATS_DIR, 'quick_stats.json');

    if (!fs.existsSync(numberStatsPath) || !fs.existsSync(headTailStatsPath) || !fs.existsSync(sumDiffStatsPath) || !fs.existsSync(quickStatsPath)) {
        throw new Error('Các file thống kê JSON không tồn tại. Hãy chạy update-static-data trước.');
    }

    console.log('[SupabaseDB] Đang parse files JSON...');
    const numberStats = JSON.parse(fs.readFileSync(numberStatsPath, 'utf8'));
    const headTailStats = JSON.parse(fs.readFileSync(headTailStatsPath, 'utf8'));
    const sumDiffStats = JSON.parse(fs.readFileSync(sumDiffStatsPath, 'utf8'));
    const quickStats = JSON.parse(fs.readFileSync(quickStatsPath, 'utf8'));

    console.log('[SupabaseDB] Đang kết nối tới Supabase và đồng bộ hóa vào DB...');
    await saveAllStatsToDb(numberStats, headTailStats, sumDiffStats, quickStats);
    
    // Sync precomputed cache files to Supabase cache_store
    console.log('[SupabaseDB] Đang đồng bộ hóa tệp tin cache (suggestions & simulation)...');
    const files = fs.readdirSync(STATS_DIR);
    for (const file of files) {
        if (file.startsWith('cached_') && file.endsWith('.json')) {
            const cacheKey = path.basename(file, '.json');
            const namespace = cacheKey.startsWith('cached_simulation') ? 'simulation' : 'statistics';
            const filePath = path.join(STATS_DIR, file);
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                // Add cachedAt if not present
                if (!data.cachedAt) {
                    data.cachedAt = new Date().toISOString();
                }
                console.log(` -> Đang upload cache key [${cacheKey}]...`);
                await writeCacheStoreDirect(cacheKey, namespace, data);
            } catch (err) {
                console.error(` ⚠️ Lỗi khi đồng bộ cache file ${file}:`, err.message);
            }
        }
    }

    console.log('✅ [SupabaseDB] Đồng bộ hóa DB thành công!');
}

main().catch(error => {
    console.error('❌ [SupabaseDB] Lỗi đồng bộ hóa DB:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
});
