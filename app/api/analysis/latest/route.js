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

        const futureSimulationService = require('@/lib/services/futureSimulationService');
        const { getQuickStatsFromCache } = require('@/lib/data-access');
        const exclusionLogic = require('@/lib/services/exclusionLogicService');

        const quickStats = await getQuickStatsFromCache();

        // === PHƯƠNG PHÁP DUY NHẤT: Drop-off >= 85% ===
        // exclusionLogicService.getDropOffExclusions() là SINGLE SOURCE OF TRUTH
        const dropOffResult = exclusionLogic.getDropOffExclusions(quickStats);

        const exclToBet = dropOffResult.skipped ? [] : dropOffResult.toBet;
        const excluded = dropOffResult.excluded;
        const explanations = dropOffResult.explanations;
        const isSkipped = dropOffResult.skipped;

        // --- Other methods (kept for comparison) ---
        const unified = futureSimulationService.unifiedMethod(rawData);
        const advanced = futureSimulationService.advancedMethod(rawData);
        const hybridAI = futureSimulationService.hybridAIMethod(rawData);

        const combinedSet = new Set([...exclToBet, ...unified.toBet, ...advanced.toBet, ...hybridAI.toBet]);
        const combinedBet = Array.from(combinedSet).sort((a, b) => a - b);

        const scoreMap = new Map();
        exclToBet.forEach((n, idx) =>
            scoreMap.set(n, (scoreMap.get(n) || 0) + 3 + (exclToBet.length - idx) / (exclToBet.length || 1))
        );
        [unified.toBet, advanced.toBet, hybridAI.toBet].forEach(arr => {
            arr.forEach((n, idx) =>
                scoreMap.set(n, (scoreMap.get(n) || 0) + 1 + (arr.length - idx) / (arr.length || 1))
            );
        });
        const smart25 = Array.from(scoreMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 25)
            .map(e => e[0])
            .sort((a, b) => a - b);

        const mapStrs = arr => arr.map(n => String(n).padStart(2, '0'));

        const lastDateParts = rawData[rawData.length - 1].date.split('-');
        const nextDt = new Date(Date.UTC(+lastDateParts[0], +lastDateParts[1] - 1, +lastDateParts[2]));
        nextDt.setUTCDate(nextDt.getUTCDate() + 1);
        const nextDateStr = nextDt.toISOString().split('T')[0];

        // --- Streak Drop-off method (futureSimulationService - basic categories) ---
        const streakResult = futureSimulationService.streakDropOffExclusion(rawData);

        const result = {
            date: nextDateStr,
            // Primary method: Drop-off >= 85% from quickStats (comprehensive)
            danh: { numbers: mapStrs(exclToBet), excluded: mapStrs(excluded), isSkipped, explanations },
            danhUnified: { numbers: mapStrs(unified.toBet) },
            danhAdvanced: { numbers: mapStrs(advanced.toBet) },
            danhHybrid: { numbers: mapStrs(hybridAI.toBet) },
            danhCombined: { numbers: mapStrs(combinedBet) },
            danhSmart: { numbers: mapStrs(smart25) },
            // Streak Drop-off (basic categories from futureSimulationService)
            danhStreak: { numbers: mapStrs(streakResult.toBet), excluded: mapStrs(streakResult.excluded), isSkipped: streakResult.skipped }
        };

        return cachedResponse(result, 'DAILY');
    } catch (error) {
        console.error('[Analysis Latest] Error:', error);
        return NextResponse.json({ predictions: null, error: error.message }, { status: 500 });
    }
}
