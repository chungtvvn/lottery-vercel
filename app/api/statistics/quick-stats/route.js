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
        
        // Buộc xoá cache cục bộ ở instance này vì cache Postgres đã xoá (người dùng vừa cập nhật)
        const historicalExclusionService = require('../../../../lib/services/historicalExclusionService');
        if (historicalExclusionService.clearCache) historicalExclusionService.clearCache();
        
        const statisticsService = require('../../../../lib/services/statisticsService');
        if (statisticsService.clearCache) statisticsService.clearCache();

        const lotteryService = require('../../../../lib/services/lotteryService');
        if (lotteryService.clearCache) lotteryService.clearCache();
        
        // Tải lại dữ liệu mới từ Database
        await lotteryService.loadRawData();
        
        const quickStats = await statisticsService.getQuickStats();
        
        return NextResponse.json(quickStats);
    } catch (error) {
        console.error('Error in quick-stats:', error);
        return NextResponse.json({ error: 'Lỗi server: ' + error.message }, { status: 500 });
    }
}
