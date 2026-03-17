import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60s for computation

export async function GET() {
    try {
        // Try cache first
        const { getQuickStatsFromCache } = require('@/lib/data-access');
        const cached = await getQuickStatsFromCache();
        if (cached) {
            return NextResponse.json(cached);
        }

        // If no cache, compute on the fly
        console.log('[quick-stats] Cache miss, computing on-the-fly...');
        const lotteryService = require('../../../../lib/services/lotteryService');
        if (!lotteryService.getRawData()) {
            await lotteryService.loadRawData();
        }
        
        const statisticsService = require('../../../../lib/services/statisticsService');
        const quickStats = await statisticsService.getQuickStats();
        
        return NextResponse.json(quickStats);
    } catch (error) {
        console.error('Error in quick-stats:', error);
        return NextResponse.json({ error: 'Lỗi server: ' + error.message }, { status: 500 });
    }
}
