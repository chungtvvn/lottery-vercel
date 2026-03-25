import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET(request) {
    try {
        const lotteryService = require('../../../../lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        
        const rawData = lotteryService.getRawData();
        if (!rawData || rawData.length === 0) {
            return cachedResponse({ predictions: null, message: 'No data' }, 'MEDIUM');
        }

        const futureSimulationService = require('../../../../lib/services/futureSimulationService');
        
        const legacyExcl = futureSimulationService.exclusionByRecordMethod(rawData);
        const legacyExclPlus = futureSimulationService.exclusionByRecordMethod(rawData);
        const unified = futureSimulationService.unifiedMethod(rawData);
        const advanced = futureSimulationService.advancedMethod(rawData);
        const hybridAI = futureSimulationService.hybridAIMethod(rawData);

        const combinedSet = new Set([...legacyExcl.toBet, ...unified.toBet, ...advanced.toBet, ...hybridAI.toBet]);
        const combinedBet = Array.from(combinedSet).sort((a,b) => a-b);

        const scoreMap = new Map();
        legacyExclPlus.toBetPlus.forEach((n, idx) => scoreMap.set(n, (scoreMap.get(n)||0) + 3 + (legacyExclPlus.toBetPlus.length - idx)/(legacyExclPlus.toBetPlus.length||1)));
        [unified.toBet, advanced.toBet, hybridAI.toBet].forEach(arr => {
            arr.forEach((n, idx) => scoreMap.set(n, (scoreMap.get(n)||0) + 1 + (arr.length - idx)/(arr.length||1)));
        });
        const smart25 = Array.from(scoreMap.entries()).sort((a,b) => b[1]-a[1]).slice(0, 25).map(e => e[0]).sort((a,b) => a-b);

        const mapStrs = arr => arr.map(n => String(n).padStart(2, '0'));
        
        // Find next date 
        const lastDateParts = rawData[rawData.length-1].date.split('-');
        const nextDt = new Date(Date.UTC(parseInt(lastDateParts[0]), parseInt(lastDateParts[1])-1, parseInt(lastDateParts[2])));
        nextDt.setUTCDate(nextDt.getUTCDate() + 1);
        const nextDateStr = nextDt.toISOString().split('T')[0];

        const result = {
            date: nextDateStr,
            danh: { numbers: mapStrs(legacyExcl.toBet), isSkipped: legacyExcl.skipped },
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
