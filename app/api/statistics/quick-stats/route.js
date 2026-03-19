import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function GET() {
    try {
        const { cachedResponse } = require('@/lib/cache-headers');

        // Try cache first
        const { getQuickStatsFromCache } = require('@/lib/data-access');
        const cached = await getQuickStatsFromCache();
        if (cached) {
            return cachedResponse(cached, 'DAILY');
        }

        // If no cache, compute on the fly
        console.log('[quick-stats] Cache miss, computing on-the-fly...');
        
        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        if (historicalExclusionService.clearCache) historicalExclusionService.clearCache();
        
        const statisticsService = require('../../../../lib/services/statisticsService');
        if (statisticsService.clearCache) statisticsService.clearCache();

        const lotteryService = require('../../../../lib/services/lotteryService');
        if (lotteryService.clearCache) lotteryService.clearCache();
        
        await lotteryService.loadRawData();
        const quickStats = await statisticsService.getQuickStats();
        
        return cachedResponse(quickStats, 'DAILY');
    } catch (error) {
        console.error('Error in quick-stats:', error);
        const { errorResponse } = require('@/lib/cache-headers');
        return errorResponse('Lỗi server: ' + error.message);
    }
}
