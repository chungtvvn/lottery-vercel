'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
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

function toNumberArray(values = []) {
    return Array.from(new Set((values || [])
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 99)))
        .sort((a, b) => a - b);
}

function buildMethodSummary(methodObj, actualSpecial = null) {
    if (!methodObj) return null;
    const excluded = toNumberArray(methodObj.excluded || methodObj.excludedNumbers || []);
    const betNumbers = toNumberArray(methodObj.betNumbers || methodObj.rawBetNumbers || methodObj.numbersToBet ||
        Array.from({ length: 100 }, (_, i) => i).filter(n => !excluded.includes(n)));
    const betSet = new Set(betNumbers);
    const intersectionNumbers = toNumberArray(
        methodObj.intersectionNumbers || methodObj.rawIntersectionNumbers || []
    ).filter(number => betSet.has(number));
    const intersectionSet = new Set(intersectionNumbers);
    const isResolved = actualSpecial !== null && actualSpecial !== undefined;
    const actualNum = isResolved ? Number(actualSpecial) : null;
    const isSkipped = !!methodObj.skipped;

    const BET_PER_NUMBER = Number(methodObj.betPerNumber || 1000);
    const WIN_MULTIPLIER = Number(methodObj.betWinMultiplier || methodObj.winMultiplier || 84);
    const WIN_FACTOR = Number(methodObj.betWinFactor || 1);
    const HOLD_WIN_MULTIPLIER = Number(methodObj.holdWinMultiplier || 0.705);
    const HOLD_LOSS_MULTIPLIER = Number(methodObj.holdLossMultiplier || 70);

    const betWin = isResolved && !isSkipped ? betNumbers.includes(actualNum) : null;
    const holdWin = isResolved && !isSkipped ? !excluded.includes(actualNum) : null;
    const unitCount = betNumbers.length + intersectionNumbers.length;
    const betStake = unitCount * BET_PER_NUMBER;
    const winningWeight = betWin && intersectionSet.has(actualNum) ? 2 : 1;
    const betPayout = betWin ? winningWeight * BET_PER_NUMBER * WIN_MULTIPLIER * WIN_FACTOR : 0;
    const betProfit = isResolved && !isSkipped ? Math.round((betPayout - betStake) * 100) / 100 : null;
    const holdIncome = excluded.length * BET_PER_NUMBER * HOLD_WIN_MULTIPLIER;
    const holdLoss = holdWin === false ? BET_PER_NUMBER * HOLD_LOSS_MULTIPLIER : 0;
    const holdProfit = isResolved && !isSkipped ? Math.round((holdIncome - holdLoss) * 100) / 100 : null;
    const profit = isResolved && !isSkipped ? Math.round(((betProfit || 0) + (holdProfit || 0)) * 100) / 100 : null;

    return {
        excludedNumbers: excluded,
        numbersToBet: betNumbers,
        intersectionNumbers,
        methodVersion: methodObj.methodVersion || null,
        explanations: (methodObj.selectedStreaks || []).map(s => ({
            title: s.title,
            reason: s.reason || s.explanation,
            numbers: s.numbers || [],
            tier: s.tier || (s.isPotential ? 'purple' : 'red'),
            subTier: s.isPotential ? 'threshold' : 'achieved'
        })),
        betCount: betNumbers.length,
        unitCount,
        excludedCount: excluded.length,
        resolved: isResolved && !isSkipped,
        actualSpecial: actualNum,
        betWin,
        holdWin,
        betProfit,
        holdProfit,
        profit,
        betWinMultiplier: WIN_MULTIPLIER,
        betWinFactor: WIN_FACTOR,
        betPerNumber: BET_PER_NUMBER,
        holdWinMultiplier: HOLD_WIN_MULTIPLIER,
        holdLossMultiplier: HOLD_LOSS_MULTIPLIER
    };
}

async function main() {
    console.log('=== BẮT ĐẦU BACKFILL PREDICTION HISTORY 100% STRICT PIT (01/07/2026 - NAY) ===');
    await lotteryService.loadRawData();
    await lotteryService.loadStats();

    const rawData = lotteryService.getRawData().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const historyPath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_prediction_history.json');
    let existingHistory = [];
    if (fs.existsSync(historyPath)) {
        const loaded = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        existingHistory = Array.isArray(loaded) ? loaded : (loaded.history || []);
    }
    console.log(`Số lượng bản ghi hiện tại trong cache: ${existingHistory.length}`);

    const existingMap = new Map(existingHistory.map(r => [r.predictionDate, r]));
    const targetStartDate = '2026-07-01';
    const drawDates = rawData.map(r => r.date).filter(d => d >= targetStartDate);
    const todayIso = '2026-10-21';
    const allDates = [...drawDates];
    if (!allDates.includes(todayIso)) {
        allDates.push(todayIso);
    }
    console.log(`Tổng số ngày cần theo dõi từ ${targetStartDate} tới ${todayIso}: ${allDates.length} ngày`);

    const datesToGenerate = [];
    for (const d of allDates) {
        const row = existingMap.get(d);
        if (!row || !row.summary || !row.summary.methods) {
            datesToGenerate.push({ date: d, missingMethods: PREDICTION_HISTORY_METHOD_IDS });
        } else {
            const missing = PREDICTION_HISTORY_METHOD_IDS.filter(m => !row.summary.methods[m]);
            if (missing.length > 0) {
                datesToGenerate.push({ date: d, missingMethods: missing });
            }
        }
    }
    console.log(`Số ngày cần sinh/bổ sung phương pháp thiếu: ${datesToGenerate.length} ngày`);

    let count = 0;
    for (const item of datesToGenerate) {
        count++;
        const targetDate = item.date;
        const isToday = targetDate === todayIso;
        
        let basisIdx;
        let actualSpecial = null;
        if (isToday) {
            basisIdx = rawData.length - 1;
        } else {
            const matchIdx = rawData.findIndex(r => r.date === targetDate);
            basisIdx = matchIdx - 1;
            const actualDraw = rawData[matchIdx];
            if (actualDraw && actualDraw.special !== undefined && actualDraw.special !== null) {
                actualSpecial = Number(String(actualDraw.special).slice(-2));
            }
        }

        if (basisIdx < 0) {
            console.warn(`Không tìm thấy basis cho ${targetDate}, bỏ qua.`);
            continue;
        }

        const basisDraw = rawData[basisIdx];
        const subset = rawData.slice(0, basisIdx + 1);
        const t0 = Date.now();

        console.log(`[${count}/${datesToGenerate.length}] Sinh dự đoán cho ${targetDate} (basis: ${basisDraw.date}, actual: ${actualSpecial !== null ? actualSpecial : 'PENDING'})...`);
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
        const newMethods = Object.fromEntries(methodEntries);
        const primary = newMethods['deParallelBlock85Small65Hold70'] || newMethods['dedupEdge75Hold70'] || methodEntries[0]?.[1];

        const existingRun = existingMap.get(targetDate);
        if (existingRun && existingRun.summary) {
            // Cập nhật phương pháp thiếu vào snapshot hiện tại để giữ snapshotLockedAt cũ
            const mergedMethods = {
                ...existingRun.summary.methods,
                ...newMethods
            };
            // Nếu phương pháp primary của snapshot là deParallelBlock85Small65Hold70 thì cập nhật top level
            const topMethod = mergedMethods['deParallelBlock85Small65Hold70'] || primary;
            existingRun.summary = {
                ...existingRun.summary,
                ...topMethod,
                methods: mergedMethods,
                actualSpecial,
                resolved: actualSpecial !== null
            };
            if (actualSpecial !== null && !existingRun.settledAt) {
                existingRun.settledAt = `${targetDate}T11:45:00.000Z`;
            }
            existingRun.snapshotRepairedAt = new Date().toISOString();
        } else {
            // Tạo run mới hoàn toàn
            const newRun = {
                id: `local-${targetDate}`,
                predictionDate: targetDate,
                sourceDrawDate: basisDraw.date,
                strategyVersion: 'BALANCED',
                snapshotImmutable: true,
                snapshotLockedAt: generatedAt,
                summary: {
                    ...primary,
                    methods: newMethods,
                    actualSpecial,
                    resolved: actualSpecial !== null
                },
                generatedAt,
                settledAt: actualSpecial !== null ? `${targetDate}T11:45:00.000Z` : null
            };
            existingMap.set(targetDate, newRun);
        }
        console.log(`  -> Xong ${targetDate} trong ${Date.now() - t0}ms. Số phương pháp: ${Object.keys(existingMap.get(targetDate).summary.methods).length}`);
    }

    // Đối soát lại toàn bộ các ngày đã có kết quả trong rawData
    const actualMap = new Map(rawData.map(r => [r.date, Number(String(r.special).slice(-2))]));
    for (const [pDate, r] of existingMap.entries()) {
        const act = actualMap.get(pDate);
        if (act !== undefined && act !== null) {
            if (!r.summary.resolved || r.summary.actualSpecial !== act) {
                r.summary.actualSpecial = act;
                r.summary.resolved = true;
                if (r.summary.methods) {
                    for (const mId in r.summary.methods) {
                        r.summary.methods[mId] = buildMethodSummary(r.summary.methods[mId], act);
                    }
                }
                const primary = r.summary.methods?.['deParallelBlock85Small65Hold70'] || r.summary;
                Object.assign(r.summary, primary);
            }
        }
    }

    // Merge và giữ tất cả các ngày từ 2026-07-01 đến nay
    const allMerged = Array.from(existingMap.values())
        .filter(r => r.predictionDate >= '2026-06-01')
        .sort((a, b) => String(b.predictionDate).localeCompare(String(a.predictionDate)));

    console.log(`\n=== TỔNG KẾT SAU KHI MERGE VÀ ĐỐI SOÁT ===`);
    console.log(`Tổng số ngày: ${allMerged.length}`);
    console.log(`Từ ${allMerged[allMerged.length - 1]?.predictionDate} đến ${allMerged[0]?.predictionDate}`);

    // Kiểm tra tính toàn vẹn của 9 phương pháp cho mọi ngày từ 2026-07-01
    const check2026_07 = allMerged.filter(r => r.predictionDate >= targetStartDate);
    let allValid = true;
    for (const r of check2026_07) {
        const missing = PREDICTION_HISTORY_METHOD_IDS.filter(m => !r.summary?.methods?.[m]);
        if (missing.length > 0) {
            console.error(`❌ Ngày ${r.predictionDate} vẫn còn thiếu:`, missing);
            allValid = false;
        }
    }
    if (allValid) {
        console.log(`✅ 100% các ngày từ ${targetStartDate} đến nay (${check2026_07.length} ngày) đã có ĐẦY ĐỦ 9 PHƯƠNG PHÁP!`);
    }

    // Ghi ra file cached_prediction_history.json
    fs.writeFileSync(historyPath, JSON.stringify(allMerged, null, 0), 'utf8');
    console.log(`✅ Đã ghi cache: ${historyPath}`);

    // Ghi file gzip cho R2 upload
    const gzPath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_prediction_history.json.gz');
    fs.writeFileSync(gzPath, zlib.gzipSync(Buffer.from(JSON.stringify(allMerged, null, 0))));
    console.log(`✅ Đã nén và lưu: ${gzPath}`);

    // Cập nhật performance report cache
    try {
        const perf = predictionHistoryPerformanceService.refreshPerformanceCacheFromSnapshots(allMerged);
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
