require('dotenv').config({path: '.env.local'});
const lotteryService = require('../lib/services/lotteryService');
const statisticsService = require('../lib/services/statisticsService');
const { saveCacheEntry } = require('../lib/data-access');

async function rebuild() {
    console.log('[1] Xóa cache local...');
    lotteryService.clearCache();
    statisticsService.clearCache();

    console.log('[2] Tải toàn bộ dữ liệu 7400 rows...');
    await lotteryService.loadRawData();
    console.log('Tổng số ngày:', lotteryService.getRawData().length);
    
    console.log('[3] Tải base chunk stats...');
    await lotteryService.loadStats();

    console.log('[4] Sinh Quick Stats và tự động Hydrate với format ngày chuẩn...');
    const quickStats = await statisticsService.getQuickStats();
    
    console.log('[5] Lưu Quick Stats vào Database...');
    await saveCacheEntry('quick_stats', quickStats);

    console.log('[6] Sinh Quick Stats History...');
    const history = await statisticsService.getQuickStatsHistory();
    
    console.log('[7] Lưu Quick Stats History vào Database...');
    await saveCacheEntry('quick_stats_history', history);

    console.log('HOÀN TẤT! CÁC BONG BÓNG CHUỖI ĐÃ ĐƯỢC CHỨA ĐẦY DỮ LIỆU CHUẨN!');
    process.exit(0);
}

rebuild().catch(err => {
    console.error(err);
    process.exit(1);
});
