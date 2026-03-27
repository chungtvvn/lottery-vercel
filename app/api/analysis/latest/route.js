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
        const { getNumbersFromCategory } = require('@/lib/controllers/suggestionsController');
        const { getQuickStatsFromCache } = require('@/lib/data-access');

        const totalYears = lotteryService.getTotalYears();
        const quickStats = await getQuickStatsFromCache();

        // --- Compute Exclusion / Exclusion+ from pre-computed quickStats ---
        const excluded4 = new Set(); 
        const excluded3 = new Set(); 

        for (const key in quickStats) {
            const stat = quickStats[key];
            if (!stat || !stat.current) continue;

            const currentLen = stat.current.length;
            const [category, subcategory] = key.split(':');

            const isSoLePattern =
                subcategory &&
                (subcategory.toLowerCase() === 'vesole' || subcategory.toLowerCase() === 'vesolemoi') &&
                key !== 'tienLuiSoLe' && key !== 'luiTienSoLe';
            const targetLen = isSoLePattern ? currentLen + 2 : currentLen + 1;

            const recordLen = stat.computedMaxStreak || (stat.longest && stat.longest[0] ? stat.longest[0].length : 0);
            const gapInfoExact = stat.exactGapStats ? stat.exactGapStats[targetLen] : null;
            const targetCount = gapInfoExact ? gapInfoExact.count : 0;
            const targetFreqYear = targetCount / totalYears;
            const isSuper = targetFreqYear <= 0.5 || stat.isSuperMaxThreshold;

            let shouldExclude = false;
            let subTier = null;

            if (targetFreqYear <= 1.5 || (currentLen >= recordLen && recordLen > 0)) {
                shouldExclude = true;
                if (currentLen >= recordLen && recordLen > 0) {
                    subTier = isSuper ? 'achievedSuper' : 'achieved';
                } else if (isSuper) {
                    subTier = 'superThreshold';
                } else {
                    subTier = 'threshold';
                }
            }

            if (!shouldExclude) continue;

            const isExcludedPattern =
                category === 'tong_tt_lon' || category === 'tong_tt_nho' ||
                category === 'tong_moi_lon' || category === 'tong_moi_nho' ||
                category === 'hieu_lon' || category === 'hieu_nho';
            if (isExcludedPattern) continue;

            let nums = [];
            if (stat.current.patternNumbers && stat.current.patternNumbers.length > 0) {
                nums = [...stat.current.patternNumbers];
            } else {
                nums = getNumbersFromCategory(category) || [];
            }
            nums = nums.filter(n => n !== null && n !== undefined && !isNaN(n) && typeof n === 'number');
            if (nums.length === 0) continue;

            nums.forEach(n => {
                excluded4.add(n);
                if (subTier === 'achieved' || subTier === 'achievedSuper' || subTier === 'superThreshold') {
                    excluded3.add(n);
                }
            });
        }

        const toBet4 = [], toBet3 = [];
        for (let i = 0; i < 100; i++) {
            if (!excluded4.has(i)) toBet4.push(i);
            if (!excluded3.has(i)) toBet3.push(i);
        }
        const MAX_BET = 65;
        const skipped4 = toBet4.length > MAX_BET || toBet4.length === 0;
        const skipped3 = toBet3.length > MAX_BET || toBet3.length === 0;

        const exclToBet = skipped4 ? [] : toBet4;
        const exclToBetPlus = skipped3 ? [] : toBet3;

        // --- Other methods ---
        const unified = futureSimulationService.unifiedMethod(rawData);
        const advanced = futureSimulationService.advancedMethod(rawData);
        const hybridAI = futureSimulationService.hybridAIMethod(rawData);

        const combinedSet = new Set([...exclToBet, ...unified.toBet, ...advanced.toBet, ...hybridAI.toBet]);
        const combinedBet = Array.from(combinedSet).sort((a, b) => a - b);

        const scoreMap = new Map();
        exclToBetPlus.forEach((n, idx) =>
            scoreMap.set(n, (scoreMap.get(n) || 0) + 3 + (exclToBetPlus.length - idx) / (exclToBetPlus.length || 1))
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

        const result = {
            date: nextDateStr,
            danh: { numbers: mapStrs(exclToBet), isSkipped: skipped4 },
            danhUnified: { numbers: mapStrs(unified.toBet) },
            danhAdvanced: { numbers: mapStrs(advanced.toBet) },
            danhHybrid: { numbers: mapStrs(hybridAI.toBet) },
            danhCombined: { numbers: mapStrs(combinedBet) },
            danhSmart: { numbers: mapStrs(smart25) }
        };

        return cachedResponse(result, 'DAILY');
    } catch (error) {
        console.error('[Analysis Latest] Error:', error);
        return NextResponse.json({ predictions: null, error: error.message }, { status: 500 });
    }
}
