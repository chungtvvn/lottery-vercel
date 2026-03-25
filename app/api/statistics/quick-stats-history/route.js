import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function GET() {
    try {
        const { cachedResponse, errorResponse } = require('@/lib/cache-headers');
        const lotteryService = require('../../../../lib/services/lotteryService');
        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        const statisticsService = require('../../../../lib/services/statisticsService');

        // LUÔN load rawData vì hydrateStreak() cần nó để build Bong Bóng
        if (!lotteryService.getRawData()) {
            await lotteryService.loadRawData();
        }

        // Try DB cache first 
        const { getQuickStatsHistoryFromCache } = require('@/lib/data-access');
        const cached = await getQuickStatsHistoryFromCache();
        if (cached && cached.length > 0) {
            if (cached[0].streaks && cached[0].streaks.length > 0) {
                 const hydratedHistory = statisticsService.rehydrateHistoryStreaks(cached);
                 return cachedResponse(hydratedHistory, 'NO_CACHE');
            }
        }

        console.log('[quick-stats-history] Cache miss or empty, computing on-the-fly...');

        // Cần tải stats đầy đủ để compute trên backend nếu miss cache
        await lotteryService.loadAll();

        // Clear cache để đảm bảo compute mới nhất
        if (historicalExclusionService.clearCache) historicalExclusionService.clearCache();
        if (statisticsService.clearCache) statisticsService.clearCache();

        const history = await statisticsService.getQuickStatsHistory();

        if (!history || history.length === 0) {
            return errorResponse('History chưa được tính toán.', 404);
        }
        return cachedResponse(history, 'NO_CACHE');
    } catch (error) {
        console.error('Error in quick-stats-history:', error);
        const { errorResponse } = require('@/lib/cache-headers');
        return errorResponse('Lỗi server: ' + error.message);
    }
}
