import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function GET() {
    try {
        const { cachedResponse, errorResponse } = require('@/lib/cache-headers');
        const lotteryService = require('../../../../lib/services/lotteryService');
        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        const statisticsService = require('../../../../lib/services/statisticsService');

        // LUÔN load rawData vì buildFullSequenceFromRaw() cần nó
        if (!lotteryService.getRawData()) {
            await lotteryService.loadRawData();
        }
        // LUÔN load stats vì computeQuickStatsForDate() cần nó
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
