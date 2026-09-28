const fs = require('fs');
const path = require('path');
const annualMilestoneService = require('../lib/services/annualMilestoneService');
const lotteryService = require('../lib/services/lotteryService');

function formatIsoDate(d) {
    if (!d) return null;
    const date = d instanceof Date ? d : new Date(d);
    return date.toISOString().slice(0, 10);
}

function formatDisplayDate(d) {
    if (!d) return '';
    const date = d instanceof Date ? d : new Date(d);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

async function main() {
    console.log('=== BẮT ĐẦU PHỤC HỒI & ĐIỀN ĐẦY ĐỦ CACHE MỐC 20 NĂM ===');
    await lotteryService.loadRawData();
    await lotteryService.loadStats();

    const rawData = lotteryService.getRawData().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
    const liveFile = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_milestone20y_live_predictions.json');
    const predFile = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_milestone20y_prediction.json');

    let existingLive = { predictions: [], config: {}, summary: {} };
    if (fs.existsSync(liveFile)) {
        existingLive = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
    }
    const existingRows = Array.isArray(existingLive.predictions) ? existingLive.predictions : [];
    console.log(`Số bản ghi live hiện tại: ${existingRows.length}`);

    const existingMap = new Map(existingRows.map(r => [r.predictionIsoDate || r.predictionDate, r]));
    const targetStartDate = '2026-06-01';
    const targetEndDate = '2026-09-27';

    const drawDates = rawData.map(r => r.date).filter(d => d >= targetStartDate && d <= targetEndDate);
    console.log(`Tổng số kỳ quay từ ${targetStartDate} đến ${targetEndDate}: ${drawDates.length}`);

    const missingDates = drawDates.filter(d => {
        const row = existingMap.get(d);
        if (!row || !row.strategies) return true;
        return false;
    });
    console.log(`Số ngày thiếu cần sinh cho Mốc 20 năm: ${missingDates.length} ngày:`, missingDates);

    const actualMap = new Map(rawData.map(r => [r.date, Number(String(r.special).slice(-2))]));

    // Tạo các ngày còn thiếu
    for (let i = 0; i < missingDates.length; i++) {
        const targetDate = missingDates[i];
        const basisIdx = rawData.findIndex(r => r.date === targetDate) - 1;
        if (basisIdx < 0) continue;
        const basisDraw = rawData[basisIdx];
        const actualSpecial = actualMap.get(targetDate);

        console.log(`[${i + 1}/${missingDates.length}] Sinh dự đoán Mốc 20 năm cho ${targetDate} (basis: ${basisDraw.date}, actual: ${actualSpecial})...`);
        const bundle = annualMilestoneService.buildPredictionBundleForDate(targetDate);

        const row = {
            id: `annual20y-${targetDate}`,
            status: 'pending',
            predictionDate: formatDisplayDate(new Date(targetDate)),
            predictionIsoDate: targetDate,
            dataIsoDate: basisDraw.date,
            generatedAt: `${basisDraw.date}T11:45:00.000Z`,
            liveCacheVersion: 'annual20y-live-compact-v5',
            baseline: bundle.baseline,
            summary: bundle.summary,
            strategies: annualMilestoneService.compactLiveStrategies(bundle.strategies),
            presets: annualMilestoneService.DEFAULT_PRESETS,
            actualSpecial: null,
            results: {},
            backfilledAt: new Date().toISOString()
        };

        if (actualSpecial !== undefined && actualSpecial !== null) {
            annualMilestoneService.settleLiveRowOnce(row, actualSpecial, {
                betPerNumberK: 1000,
                winMultiplier: 84
            });
        }
        existingMap.set(targetDate, row);
    }

    // Settle lại toàn bộ các ngày đã có kết quả và compact strategies
    for (const [date, row] of existingMap.entries()) {
        if (row.strategies) {
            row.strategies = annualMilestoneService.compactLiveStrategies(row.strategies);
        }
        const actualSpecial = actualMap.get(date);
        if (actualSpecial !== undefined && actualSpecial !== null) {
            if (row.status !== 'settled' || !row.results || Object.keys(row.results).length === 0) {
                row.status = 'pending'; // reset to allow settleLiveRowOnce to settle
                annualMilestoneService.settleLiveRowOnce(row, actualSpecial, {
                    betPerNumberK: 1000,
                    winMultiplier: 84
                });
            }
        }
    }

    // Sinh dự đoán ngày kế tiếp 2026-09-28 (Pending)
    const latestDraw = rawData[rawData.length - 1];
    const tomorrowIso = '2026-09-28';
    console.log(`Sinh dự đoán Mốc 20 năm cho ngày kế tiếp: ${tomorrowIso} (basis: ${latestDraw.date})...`);
    const nextBundle = annualMilestoneService.buildPredictionBundleForDate(tomorrowIso);
    const pendingRow = {
        id: `annual20y-${tomorrowIso}`,
        status: 'pending',
        predictionDate: formatDisplayDate(new Date(tomorrowIso)),
        predictionIsoDate: tomorrowIso,
        dataIsoDate: latestDraw.date,
        generatedAt: new Date().toISOString(),
        liveCacheVersion: 'annual20y-live-compact-v5',
        baseline: nextBundle.baseline,
        summary: nextBundle.summary,
        strategies: annualMilestoneService.compactLiveStrategies(nextBundle.strategies),
        presets: annualMilestoneService.DEFAULT_PRESETS,
        actualSpecial: null,
        results: {}
    };
    existingMap.set(tomorrowIso, pendingRow);

    const sortedRows = Array.from(existingMap.values())
        .sort((a, b) => String(a.predictionIsoDate).localeCompare(String(b.predictionIsoDate)))
        .slice(-120);

    const liveSummary = annualMilestoneService.summarizeLive(sortedRows);

    const livePayload = {
        generatedAt: new Date().toISOString(),
        startedAt: existingLive.startedAt || sortedRows[0]?.generatedAt,
        latestDataDate: latestDraw.date,
        config: {
            historyYears: 20,
            defaultBetStrategy: annualMilestoneService.DEFAULT_BET_STRATEGY,
            defaultBetTarget: annualMilestoneService.DEFAULT_BET_TARGET,
            targets: annualMilestoneService.DEFAULT_TARGETS,
            strategies: annualMilestoneService.STRATEGY_IDS.map(id => annualMilestoneService.STRATEGIES[id]),
            presets: annualMilestoneService.DEFAULT_PRESETS,
            betPerNumberK: annualMilestoneService.BET_PER_NUMBER_K,
            winMultiplier: annualMilestoneService.DEFAULT_WIN_MULTIPLIER
        },
        summary: liveSummary,
        predictions: sortedRows
    };

    fs.writeFileSync(liveFile, JSON.stringify(livePayload, null, 0), 'utf8');
    console.log(`✅ Đã lưu ${liveFile} với ${sortedRows.length} bản ghi liên tục`);

    // Đồng thời cập nhật nextPrediction trong cached_milestone20y_prediction.json
    const nextCache = {
        generatedAt: new Date().toISOString(),
        latestDataDate: latestDraw.date,
        latestSpecial: String(latestDraw.special).padStart(2, '0'),
        config: livePayload.config,
        nextPrediction: nextBundle
    };
    fs.writeFileSync(predFile, JSON.stringify(nextCache, null, 0), 'utf8');
    console.log(`✅ Đã lưu ${predFile}`);
}

main().catch(err => {
    console.error('Lỗi backfill milestone:', err.stack || err.message);
    process.exit(1);
});
