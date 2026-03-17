import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
    try {
        // Try cache first
        const { getQuickStatsHistoryFromCache } = require('@/lib/data-access');
        const cached = await getQuickStatsHistoryFromCache();
        if (cached && cached.length > 0) {
            if (cached[0].streaks && cached[0].streaks.length > 0) {
                 return NextResponse.json(cached);
            }
        }

        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        if (historicalExclusionService.clearCache) {
             historicalExclusionService.clearCache();
        }

        const statisticsService = require('../../../../lib/services/statisticsService');
        if (statisticsService.clearCache) {
             statisticsService.clearCache();
        }

        console.log('[quick-stats-history] Cache miss or empty, computing on-the-fly...');
        const lotteryService = require('../../../../lib/services/lotteryService');
        
        if (lotteryService.clearCache) {
            lotteryService.clearCache();
        }
        await lotteryService.loadRawData();
        
        const history = await statisticsService.getQuickStatsHistory();

        if (!history || history.length === 0) {
            return NextResponse.json({ error: 'History chưa được tính toán.' }, { status: 404 });
        }
        return NextResponse.json(history);
    } catch (error) {
        console.error('Error in quick-stats-history:', error);
        return NextResponse.json({ error: 'Lỗi server: ' + error.message }, { status: 500 });
    }
}
