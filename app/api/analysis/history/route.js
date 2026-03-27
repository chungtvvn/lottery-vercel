import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET() {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        const futureSimulationService = require('@/lib/services/futureSimulationService');
        
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        
        const rawData = lotteryService.getRawData();
        if (!rawData || rawData.length === 0) {
            return cachedResponse([], 'DAILY');
        }

        const days = 14;
        const startIndex = Math.max(0, rawData.length - days);
        const historyData = [];

        for (let i = startIndex; i < rawData.length; i++) {
            const dataForPrediction = rawData.slice(0, i);
            if (dataForPrediction.length < 100) continue;

            const actualDay = rawData[i];
            const actualNumber = futureSimulationService.getSpecialNumber(actualDay);
            if (actualNumber === null) continue;

            // Exclusion/Exclusion+ from raw data (fast, deterministic)
            const exclResult = futureSimulationService.exclusionByRecordMethod(dataForPrediction);
            const unified = futureSimulationService.unifiedMethod(dataForPrediction);
            const advanced = futureSimulationService.advancedMethod(dataForPrediction);
            const hybridAI = futureSimulationService.hybridAIMethod(dataForPrediction);

            const combinedSet = new Set([...exclResult.toBet, ...unified.toBet, ...advanced.toBet, ...hybridAI.toBet]);
            const combinedBet = Array.from(combinedSet).sort((a,b) => a-b);

            const scoreMap = new Map();
            (exclResult.toBetPlus || []).forEach((n, idx) => {
                const len = (exclResult.toBetPlus || []).length || 1;
                scoreMap.set(n, (scoreMap.get(n)||0) + 3 + (len - idx)/len);
            });
            [unified.toBet, advanced.toBet, hybridAI.toBet].forEach(arr => {
                arr.forEach((n, idx) => scoreMap.set(n, (scoreMap.get(n)||0) + 1 + (arr.length - idx)/(arr.length||1)));
            });
            const smart25 = Array.from(scoreMap.entries()).sort((a,b) => b[1]-a[1]).slice(0, 25).map(e => e[0]).sort((a,b) => a-b);

            const betSize = 10;
            const payoutRate = 99;
            const calcRes = (betArr, winNum, skipped = false) => {
                const isWin = !skipped && betArr.includes(winNum);
                const totalBet = skipped ? 0 : betArr.length * betSize;
                const winAmount = isWin ? betSize * payoutRate : 0;
                return {
                    isWin, profit: winAmount - totalBet, winAmount, totalBet, skipped, winningNumber: String(winNum).padStart(2, '0')
                };
            };

            const mapStrs = arr => arr.map(n => String(n).padStart(2, '0'));

            historyData.push({
                date: actualDay.date,
                danh: { numbers: mapStrs(exclResult.toBet), isSkipped: exclResult.skipped },
                danhUnified: { numbers: mapStrs(unified.toBet) },
                danhAdvanced: { numbers: mapStrs(advanced.toBet) },
                danhHybrid: { numbers: mapStrs(hybridAI.toBet) },
                danhCombined: { numbers: mapStrs(combinedBet) },
                danhSmart: { numbers: mapStrs(smart25) },
                
                result: calcRes(exclResult.toBet, actualNumber, exclResult.skipped),
                resultUnified: calcRes(unified.toBet, actualNumber),
                resultAdvanced: calcRes(advanced.toBet, actualNumber),
                resultHybrid: calcRes(hybridAI.toBet, actualNumber),
                resultCombined: calcRes(combinedBet, actualNumber),
                resultSmart: calcRes(smart25, actualNumber),
            });
        }

        return cachedResponse(historyData, 'DAILY');
    } catch (error) {
        console.error('[Analysis History] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
