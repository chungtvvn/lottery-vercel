import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
    try {
        // Try cache first
        const { getQuickStatsHistoryFromCache } = require('@/lib/data-access');
        const cached = await getQuickStatsHistoryFromCache();
        if (cached) {
            return NextResponse.json(cached);
        }

        // If no cache, compute on the fly
        console.log('[quick-stats-history] Cache miss, computing on-the-fly...');
        const lotteryService = require('../../../../lib/services/lotteryService');
        if (!lotteryService.getRawData()) {
            await lotteryService.loadRawData();
        }
        
        const statisticsService = require('../../../../lib/services/statisticsService');
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
