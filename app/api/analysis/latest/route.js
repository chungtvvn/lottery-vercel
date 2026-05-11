import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET() {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        await lotteryService.loadAll();

        const rawData = lotteryService.getRawData();
        if (!rawData || rawData.length === 0) {
            return cachedResponse({ predictions: null, message: 'No data' }, 'MEDIUM');
        }

        const { getQuickStatsFromCache } = require('@/lib/data-access');
        const exclusionLogic = require('@/lib/services/exclusionLogicService');

        const quickStats = await getQuickStatsFromCache();

        // === PHƯƠNG PHÁP DUY NHẤT: Drop-off >= 85% ===
        // exclusionLogicService.getDropOffExclusions() là SINGLE SOURCE OF TRUTH
        // Không sử dụng bất kỳ phương pháp nào khác
        const dropOffResult = exclusionLogic.getDropOffExclusions(quickStats);

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
            // Drop-off >= 85% — phương pháp duy nhất
            danh: {
                numbers: mapStrs(toBet),
                excluded: mapStrs(excluded),
                isSkipped,
                explanations
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
