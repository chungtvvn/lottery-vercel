import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function GET() {
    try {
        const { cachedResponse, errorResponse } = require('@/lib/cache-headers');

        // Try cache first
        const { getQuickStatsHistoryFromCache } = require('@/lib/data-access');
        const cached = await getQuickStatsHistoryFromCache();
        if (cached && cached.length > 0) {
            if (cached[0].streaks && cached[0].streaks.length > 0) {
                 return cachedResponse(cached, 'DAILY');
            }
        }

        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        if (historicalExclusionService.clearCache) historicalExclusionService.clearCache();

        const statisticsService = require('../../../../lib/services/statisticsService');
        if (statisticsService.clearCache) statisticsService.clearCache();

        console.log('[quick-stats-history] Cache miss or empty, computing on-the-fly...');
        const lotteryService = require('../../../../lib/services/lotteryService');
        if (lotteryService.clearCache) lotteryService.clearCache();
        await lotteryService.loadRawData();
        
        const history = await statisticsService.getQuickStatsHistory();

        if (!history || history.length === 0) {
            return errorResponse('History chưa được tính toán.', 404);
        }
        return cachedResponse(history, 'DAILY');
    } catch (error) {
        console.error('Error in quick-stats-history:', error);
        const { errorResponse } = require('@/lib/cache-headers');
        return errorResponse('Lỗi server: ' + error.message);
    }
}
