import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { cachedResponse, errorResponse } = require('@/lib/cache-headers');
        const lotteryService = require('../../../../lib/services/lotteryService');
        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        const statisticsService = require('../../../../lib/services/statisticsService');

        // Cache lịch sử đã được daily job ghi sẵn trên R2/local và đã chứa đủ
        // fullSequence/gap/reliability. Không hydrate lại bằng quick_stats đầy đủ
        // ở runtime vì file đó rất lớn và dễ làm Vercel timeout.
        const { getQuickStatsHistoryFromCache } = require('@/lib/data-access');
        const cached = await getQuickStatsHistoryFromCache().catch(() => null);
        if (cached && cached.length > 0) {
            return cachedResponse(cached, 'NO_CACHE');
        }

        console.log('[quick-stats-history] Cache miss or empty, computing on-the-fly...');

        // Fallback khi cache miss mới cần tải stats đầy đủ để compute trên backend.
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
