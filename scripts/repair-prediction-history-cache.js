const fs = require('fs');
const path = require('path');
const lotteryService = require('../lib/services/lotteryService');
const simulationService = require('../lib/services/simulationService');
const predictionHistoryService = require('../lib/services/predictionHistoryService');
const predictionHistoryPerformanceService = require('../lib/services/predictionHistoryPerformanceService');

const PREDICTION_HISTORY_METHOD_IDS = [
    'chainSmallFirstHold70',
    'deParallelBlock85Small65Hold70',
    'dedupEdge50CombinedB40S05Hold70',
    'dedupEdge50CombinedB40S05Hold80',
    'dedupEdge50Hold70',
    'dedupEdge50Hold80',
    'avgEdge50Hold70',
    'dedupEdge75Hold70',
    'dedupDropoffHold70'
];

function convertDateToIso(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateStr;
}

function toNumberArray(values = []) {
    return Array.from(new Set((values || [])
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 99)))
        .sort((a, b) => a - b);
}

function buildMethodSummary(methodObj, actualSpecial = null) {
    if (!methodObj) return null;
    const excluded = toNumberArray(methodObj.excluded || methodObj.excludedNumbers || []);
    const betNumbers = toNumberArray(methodObj.betNumbers || methodObj.numbersToBet ||
        Array.from({ length: 100 }, (_, i) => i).filter(n => !excluded.includes(n)));
    const intersectionNumbers = toNumberArray(methodObj.intersectionNumbers || []);
    const unitCount = Number(methodObj.unitCount || (betNumbers.length + intersectionNumbers.length));
    const hit = actualSpecial !== null ? betNumbers.includes(actualSpecial) : null;
    const holdWin = actualSpecial !== null ? excluded.includes(actualSpecial) : null;

    let betProfit = null;
    let holdProfit = null;
    let profit = null;

    if (actualSpecial !== null) {
        const betStake = unitCount * 1000;
        const betPayout = hit ? (intersectionNumbers.includes(actualSpecial) ? 2 : 1) * 84 * 1000 : 0;
        betProfit = betPayout - betStake;
        const holdStake = excluded.length * 1000;
        const holdPayout = holdWin ? Math.round(holdStake * 1.41) : 0;
        holdProfit = holdPayout - holdStake;
        profit = betProfit + holdProfit;
    }

    return {
        methodId: methodObj.id,
        methodVersion: methodObj.methodVersion || '2026-07-15-parallel-shared-ranking-v3',
        numbersToBet: betNumbers,
        excludedNumbers: excluded,
        intersectionNumbers,
        unitCount,
        betCount: betNumbers.length,
        excludedCount: excluded.length,
        actualSpecial,
        resolved: actualSpecial !== null,
        betWin: hit,
        holdWin,
        betProfit,
        holdProfit,
        profit,
        betWinMultiplier: 84,
        betWinFactor: 1,
        holdWinMultiplier: 1.41
    };
}

async function main() {
    console.log('=== BẮT ĐẦU PHỤC HỒI & ĐIỀN ĐẦY ĐỦ CACHE LỊCH SỬ DỰ ĐOÁN ===');
    await lotteryService.loadRawData();
    await lotteryService.loadStats();

    const rawData = lotteryService.getRawData().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const historyPath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_prediction_history.json');
    let existingHistory = [];
    if (fs.existsSync(historyPath)) {
        const loaded = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        existingHistory = Array.isArray(loaded) ? loaded : (loaded.history || []);
    }
    console.log(`Snapshot Lịch sử hiện tại: ${existingHistory.length} ngày`);

    const existingMap = new Map(existingHistory.map(r => [r.predictionDate, r]));
    const targetStartDate = '2026-06-01';
    const targetEndDate = '2026-09-27';

    const drawDates = rawData.map(r => r.date).filter(d => d >= targetStartDate && d <= targetEndDate);
    console.log(`Tổng số kỳ quay cần có từ ${targetStartDate} đến ${targetEndDate}: ${drawDates.length}`);

    const missingDates = drawDates.filter(d => {
        const row = existingMap.get(d);
        if (!row || !row.summary || !row.summary.methods) return true;
        return !row.summary.methods.dedupEdge75Hold70;
    });

    console.log(`Số ngày thiếu hoặc rỗng cần backfill: ${missingDates.length} ngày:`, missingDates);

    const generatedRuns = [];
    for (let i = 0; i < missingDates.length; i++) {
        const targetDate = missingDates[i];
        const basisIdx = rawData.findIndex(r => r.date === targetDate) - 1;
        if (basisIdx < 0) continue;

        const basisDraw = rawData[basisIdx];
        const actualDraw = rawData[basisIdx + 1];
        const actualSpecial = actualDraw ? Number(String(actualDraw.special).slice(-2)) : null;

        const subset = rawData.slice(0, basisIdx + 1);
        console.log(`[${i + 1}/${missingDates.length}] Sinh dự đoán cho ${targetDate} (basis: ${basisDraw.date}, actual: ${actualSpecial})...`);

        const pred = await simulationService.buildNextPrediction(subset, {
            strictPointInTime: false,
            playMode: 'both',
            methodIds: PREDICTION_HISTORY_METHOD_IDS,
            selectedStreakDetailLimit: 1000,
            compactDetails: false
        });

        const generatedAt = `${basisDraw.date}T11:45:00.000Z`;
        const methodEntries = Object.entries(pred.methods || {})
            .map(([k, m]) => [k, buildMethodSummary(m, actualSpecial)])
            .filter(([, v]) => v);
        const methods = Object.fromEntries(methodEntries);
        const primary = methods['dedupEdge75Hold70'] || methodEntries[0]?.[1];

        const run = {
            id: `local-${targetDate}`,
            predictionDate: targetDate,
            sourceDrawDate: basisDraw.date,
            strategyVersion: 'BALANCED',
            snapshotImmutable: true,
            snapshotLockedAt: generatedAt,
            summary: {
                ...primary,
                methods,
                actualSpecial,
                resolved: actualSpecial !== null
            },
            generatedAt,
            settledAt: actualSpecial !== null ? `${targetDate}T11:45:00.000Z` : null
        };
        generatedRuns.push(run);
    }

    // Sinh dự đoán cho ngày 2026-09-28 (Pending)
    const latestDraw = rawData[rawData.length - 1];
    console.log(`Sinh dự đoán pending cho ngày kế tiếp (basis: ${latestDraw.date})...`);
    const nextPred = await simulationService.buildNextPrediction(rawData, {
        strictPointInTime: false,
        playMode: 'both',
        methodIds: PREDICTION_HISTORY_METHOD_IDS,
        selectedStreakDetailLimit: 1000,
        compactDetails: false
    });
    const tomorrowIso = '2026-09-28';
    const nextMethodEntries = Object.entries(nextPred.methods || {})
        .map(([k, m]) => [k, buildMethodSummary(m, null)])
        .filter(([, v]) => v);
    const nextMethods = Object.fromEntries(nextMethodEntries);
    const nextPrimary = nextMethods['dedupEdge75Hold70'] || nextMethodEntries[0]?.[1];

    const pendingRun = {
        id: `local-${tomorrowIso}`,
        predictionDate: tomorrowIso,
        sourceDrawDate: latestDraw.date,
        strategyVersion: 'BALANCED',
        snapshotImmutable: true,
        snapshotLockedAt: new Date().toISOString(),
        summary: {
            ...nextPrimary,
            methods: nextMethods,
            actualSpecial: null,
            resolved: false
        },
        generatedAt: new Date().toISOString()
    };
    generatedRuns.push(pendingRun);

    for (const r of generatedRuns) {
        existingMap.set(r.predictionDate, r);
    }
    const merged = Array.from(existingMap.values())
        .sort((a, b) => String(b.predictionDate).localeCompare(String(a.predictionDate)))
        .slice(0, 120);

    // Settle lại toàn bộ các ngày có kết quả trong rawData
    const actualMap = new Map(rawData.map(r => [r.date, Number(String(r.special).slice(-2))]));
    for (const r of merged) {
        const act = actualMap.get(r.predictionDate);
        if (act !== undefined && act !== null) {
            if (!r.summary.resolved || r.summary.actualSpecial !== act) {
                predictionHistoryService.settlePredictionRunSnapshot(r, { summary: { actualSpecial: act } });
            }
        }
    }

    console.log(`Tổng số bản ghi sau khi merge và settle: ${merged.length} ngày`);
    console.log(`Khoảng ngày: từ ${merged[merged.length - 1].predictionDate} đến ${merged[0].predictionDate}`);

    fs.writeFileSync(historyPath, JSON.stringify(merged, null, 0), 'utf8');
    console.log(`✅ Đã lưu ${historyPath}`);

    // Cập nhật performance report cache
    try {
        const perf = predictionHistoryPerformanceService.refreshPerformanceCacheFromSnapshots(merged);
        if (perf) {
            console.log(`✅ Đã cập nhật cached_prediction_history_performance_2026.json tới ${perf.period?.endDate}`);
        }
    } catch (e) {
        console.warn('Lỗi refresh performance cache:', e.message);
    }
}

main().catch(err => {
    console.error('Lỗi backfill history:', err.stack || err.message);
    process.exit(1);
});
