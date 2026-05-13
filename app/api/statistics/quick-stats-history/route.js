import { NextResponse } from 'next/server';

export const maxDuration = 60;

export async function GET() {
    try {
        const { cachedResponse, errorResponse } = require('@/lib/cache-headers');
        const lotteryService = require('../../../../lib/services/lotteryService');
        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        const statisticsService = require('../../../../lib/services/statisticsService');

        // LUÔN load đủ rawData + stats để hydrateStreak() và reliability enrichment hoạt động đúng
        await lotteryService.loadAll();

        // Try DB cache first 
        const { getQuickStatsHistoryFromCache } = require('@/lib/data-access');
        const cached = await getQuickStatsHistoryFromCache();
        if (cached && cached.length > 0) {
            if (cached[0].streaks && cached[0].streaks.length > 0) {
                 const hydratedHistory = statisticsService.rehydrateHistoryStreaks(cached);

                 // Cache history được sinh sẵn có thể thiếu các nhóm "tiềm năng còn 1 ngày".
                 // Bổ sung lại riêng ngày mới nhất từ quick_stats đầy đủ để UI hiện ngay mà không chờ bot regenerate JSON.
                 try {
                    const { getQuickStatsFromCache } = require('@/lib/data-access');
                    const quickStats = await getQuickStatsFromCache();
                    const latestRaw = lotteryService.getRawData()?.slice(-1)?.[0];
                    if (quickStats && latestRaw && latestRaw.date) {
                        const latestDate = latestRaw.date.includes('-')
                            ? `${latestRaw.date.split('-')[2].substring(0, 2)}/${latestRaw.date.split('-')[1]}/${latestRaw.date.split('-')[0]}`
                            : latestRaw.date;
                        const activeStreaks = statisticsService.buildActiveStreaksFromQuickStats(quickStats);
                        const latestIndex = hydratedHistory.findIndex(item => item.date === latestDate);
                        if (latestIndex >= 0) {
                            hydratedHistory[latestIndex] = {
                                ...hydratedHistory[latestIndex],
                                streaks: activeStreaks
                            };
                        }
                    }
                 } catch (augmentError) {
                    console.warn('[quick-stats-history] Cannot augment latest potential streaks:', augmentError.message);
                 }

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
