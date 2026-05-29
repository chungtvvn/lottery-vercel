import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const metaOnly = searchParams.get('metaOnly') === 'true';
        const keysStr = searchParams.get('keys');

        const { cachedResponse } = require('@/lib/cache-headers');
        const lotteryService = require('../../../../lib/services/lotteryService');

        // Chỉ cần rawData để hydrate current streaks; quick_stats lấy từ Supabase cache/DB.
        await lotteryService.loadRawData();

        if (metaOnly) {
            const totalYears = lotteryService.getTotalYears();
            return cachedResponse({ _meta: { totalYears } }, 'NO_CACHE');
        }

        const { getQuickStatsFromCache, getPatternStatsByKeysFromDb } = require('@/lib/data-access');

        if (keysStr) {
            const keys = keysStr.split(',').filter(Boolean);
            const stats = await getPatternStatsByKeysFromDb(keys);
            const statisticsService = require('../../../../lib/services/statisticsService');
            const hydrated = statisticsService.rehydrateCurrentStreaks(stats);
            return cachedResponse(hydrated, 'NO_CACHE');
        }

        // Try cache first
        const cached = await getQuickStatsFromCache();
        if (cached) {
            // Re-hydrate current streaks on-the-fly để đảm bảo fullSequence luôn có
            const statisticsService = require('../../../../lib/services/statisticsService');
            const hydrated = statisticsService.rehydrateCurrentStreaks(cached);
            return cachedResponse(hydrated, 'NO_CACHE');
        }

        // If no cache, compute on the fly
        console.log('[quick-stats] Cache miss, computing on-the-fly...');
        
        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        if (historicalExclusionService.clearCache) historicalExclusionService.clearCache();
        
        const statisticsService = require('../../../../lib/services/statisticsService');
        if (statisticsService.clearCache) statisticsService.clearCache();
        if (lotteryService.clearCache) lotteryService.clearCache();
        
        await lotteryService.loadRawData();
        const quickStats = await statisticsService.getQuickStats();
        
        return cachedResponse(quickStats, 'NO_CACHE');
    } catch (error) {
        console.error('Error in quick-stats:', error);
        const { errorResponse } = require('@/lib/cache-headers');
        return errorResponse('Lỗi server: ' + error.message);
    }
}
