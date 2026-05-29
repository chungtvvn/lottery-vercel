import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        await lotteryService.loadAll();

        const rawData = lotteryService.getRawData();
        if (!rawData || rawData.length === 0) {
            return cachedResponse({ predictions: null, message: 'No data' }, 'MEDIUM');
        }

        const { getQuickStatsFromCache } = require('@/lib/data-access');
        const exclusionLogic = require('@/lib/services/exclusionLogicService');

        const cachedQuickStats = await getQuickStatsFromCache();
        const statisticsService = require('@/lib/services/statisticsService');
        const quickStats = statisticsService.rehydrateCurrentStreaks(cachedQuickStats);
        const url = new URL(request.url);
        const rawMinPriority = parseFloat(url.searchParams.get('minPriority'));
        const rawMinDropOff = parseFloat(url.searchParams.get('minDropOff'));
        const minPriority = Number.isFinite(rawMinPriority)
            ? Math.min(100, Math.max(0, rawMinPriority))
            : (Number.isFinite(rawMinDropOff)
                ? Math.min(100, Math.max(0, rawMinDropOff <= 1 ? rawMinDropOff * 100 : rawMinDropOff))
                : 85);

        // === PHƯƠNG PHÁP DUY NHẤT: Exclusion priority >= ngưỡng ===
        // Chuỗi đã hình thành dùng tỷ lệ gãy; chuỗi tiềm năng dùng tỷ lệ không hình thành.
        // exclusionLogicService.getDropOffExclusions() là SINGLE SOURCE OF TRUTH
        // Không sử dụng bất kỳ phương pháp nào khác
        const dropOffResult = exclusionLogic.getDropOffExclusions(quickStats, { minPriority });

        const toBet = dropOffResult.skipped ? [] : dropOffResult.toBet;
        const excluded = dropOffResult.excluded;
        const explanations = dropOffResult.explanations;
        const isSkipped = dropOffResult.skipped;

        const mapStrs = arr => arr.map(n => String(n).padStart(2, '0'));

        const lastDateParts = rawData[rawData.length - 1].date.split('-');
        const nextDt = new Date(Date.UTC(+lastDateParts[0], +lastDateParts[1] - 1, +lastDateParts[2]));
        nextDt.setUTCDate(nextDt.getUTCDate() + 1);
        const nextDateStr = nextDt.toISOString().split('T')[0];

        const result = {
            date: nextDateStr,
            // Exclusion priority >= ngưỡng — phương pháp duy nhất
            danh: {
                numbers: mapStrs(toBet),
                excluded: mapStrs(excluded),
                isSkipped,
                explanations,
                minPriority,
                minDropOff: minPriority / 100
            },
            // Legacy compatibility — tất cả trỏ về cùng 1 kết quả
            danhStreak: {
                numbers: mapStrs(toBet),
                excluded: mapStrs(excluded),
                isSkipped
            }
        };

        return cachedResponse(result, 'DAILY');
    } catch (error) {
        console.error('[Analysis Latest] Error:', error);
        return NextResponse.json({ predictions: null, error: error.message }, { status: 500 });
    }
}
