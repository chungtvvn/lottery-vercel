// services/dailyAnalysisService.js
const fs = require('fs').promises;
const path = require('path');
const lotteryService = require('./lotteryService');
const statisticsService = require('./statisticsService');
const { calculateBetAmount, calculateWinLoss } = require('./simulationService');
const exclusionService = require('./exclusionService');
const unifiedPrediction = require('./unifiedPredictionService');
const advancedAnalysis = require('./advancedAnalysisService');
const hybridAIPrediction = require('./hybridAIPredictionService');
const suggestionsController = require('../controllers/suggestionsController');

const PREDICTIONS_PATH = path.join(__dirname, '..', 'data', 'predictions.json');

async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        if (data.trim() === '') return [];
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') { return []; }
        throw error;
    }
}

async function checkAndUpdateHistory() {
    console.log('[Daily Analysis] === BẮT ĐẦU ĐỐI CHIẾU LỊCH SỬ ===');
    let predictions = await readJsonFile(PREDICTIONS_PATH);
    if (predictions.length === 0) {
        console.log('[Daily Analysis] File dự đoán trống. Bỏ qua.');
        return;
    }

    const rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) {
        console.error('[Daily Analysis] LỖI: Cache dữ liệu xổ số trống.');
        return;
    }

    const latestResult = rawData[rawData.length - 1];
    const latestDateStr = latestResult.date.substring(0, 10);
    console.log(`[Daily Analysis] Kết quả mới nhất trong CSDL: ${latestDateStr}, số về: ${latestResult.special}`);

    const predictionToUpdate = predictions.find(p => p.date === latestDateStr && !p.result);

    if (predictionToUpdate) {
        console.log(`[Daily Analysis] >>> TÌM THẤY dự đoán cần cập nhật cho ngày ${latestDateStr}.`);
        const winningNumber = latestResult.special.toString().padStart(2, '0');

        const lastPredictionIndex = predictions.findIndex(p => p.date === latestDateStr) - 1;
        const totalLossSoFar = lastPredictionIndex >= 0 ? (predictions[lastPredictionIndex].result?.totalLossToDate || 0) : 0;
        const totalLossSoFarUnified = lastPredictionIndex >= 0 ? (predictions[lastPredictionIndex].resultUnified?.totalLossToDate || 0) : 0;
        const totalLossSoFarAdvanced = lastPredictionIndex >= 0 ? (predictions[lastPredictionIndex].resultAdvanced?.totalLossToDate || 0) : 0;

        // ========== PHƯƠNG PHÁP 1: EXCLUSION (Bỏ qua nếu > 65 số) ==========
        if (predictionToUpdate.danh && predictionToUpdate.danh.numbers && predictionToUpdate.danh.numbers.length > 0) {
            const exclusionCount = predictionToUpdate.danh.numbers.length;
            if (exclusionCount > 65) {
                // Bỏ qua ngày này - quá nhiều số
                predictionToUpdate.result = { winningNumber, totalBet: 0, winAmount: 0, profit: 0, totalLossToDate: totalLossSoFar, isWin: false, skipped: true, skipReason: `Vượt 65 số (${exclusionCount} số)` };
                console.log(`[Daily Analysis] Exclusion: Bỏ QUA (${exclusionCount} số > 65)`);
            } else {
                const betAmount = predictionToUpdate.betAmount;
                const calculation = calculateWinLoss(predictionToUpdate.danh.numbers, winningNumber, betAmount, totalLossSoFar);
                predictionToUpdate.result = {
                    winningNumber,
                    totalBet: calculation.totalBet,
                    winAmount: calculation.winAmount,
                    profit: calculation.profit,
                    totalLossToDate: calculation.totalLossToDate,
                    isWin: calculation.isWin
                };
                console.log(`[Daily Analysis] Exclusion: ${calculation.isWin ? 'THắNG' : 'THUA'} (${winningNumber}) - ${exclusionCount} số`);
            }
        } else {
            predictionToUpdate.result = { winningNumber, totalBet: 0, winAmount: 0, profit: 0, totalLossToDate: totalLossSoFar, isWin: false, skipped: true };
        }

        // ========== PHƯƠNG PHÁP 2: UNIFIED ==========
        if (predictionToUpdate.danhUnified && predictionToUpdate.danhUnified.numbers && predictionToUpdate.danhUnified.numbers.length > 0) {
            const betAmountUnified = predictionToUpdate.betAmountUnified || 10;
            const calcUnified = calculateWinLoss(predictionToUpdate.danhUnified.numbers, winningNumber, betAmountUnified, totalLossSoFarUnified);
            predictionToUpdate.resultUnified = {
                winningNumber,
                totalBet: calcUnified.totalBet,
                winAmount: calcUnified.winAmount,
                profit: calcUnified.profit,
                totalLossToDate: calcUnified.totalLossToDate,
                isWin: calcUnified.isWin
            };
            console.log(`[Daily Analysis] Unified: ${calcUnified.isWin ? 'THẮNG' : 'THUA'} (${winningNumber})`);
        }

        // ========== PHƯƠNG PHÁP 3: ADVANCED (13 methods) ==========
        if (predictionToUpdate.danhAdvanced && predictionToUpdate.danhAdvanced.numbers && predictionToUpdate.danhAdvanced.numbers.length > 0) {
            const betAmountAdvanced = predictionToUpdate.betAmountAdvanced || 10;
            const calcAdvanced = calculateWinLoss(predictionToUpdate.danhAdvanced.numbers, winningNumber, betAmountAdvanced, totalLossSoFarAdvanced);
            predictionToUpdate.resultAdvanced = {
                winningNumber,
                totalBet: calcAdvanced.totalBet,
                winAmount: calcAdvanced.winAmount,
                profit: calcAdvanced.profit,
                totalLossToDate: calcAdvanced.totalLossToDate,
                isWin: calcAdvanced.isWin
            };
            console.log(`[Daily Analysis] Advanced: ${calcAdvanced.isWin ? 'THẮNG' : 'THUA'} (${winningNumber})`);
        }

        // ========== PHƯƠNG PHÁP 4: HYBRID AI (Markov + Monte Carlo + ARIMA + Pattern) ==========
        const totalLossSoFarHybrid = lastPredictionIndex >= 0 ? (predictions[lastPredictionIndex].resultHybrid?.totalLossToDate || 0) : 0;
        if (predictionToUpdate.danhHybrid && predictionToUpdate.danhHybrid.numbers && predictionToUpdate.danhHybrid.numbers.length > 0) {
            const betAmountHybrid = predictionToUpdate.betAmountHybrid || 10;
            const calcHybrid = calculateWinLoss(predictionToUpdate.danhHybrid.numbers, winningNumber, betAmountHybrid, totalLossSoFarHybrid);
            predictionToUpdate.resultHybrid = {
                winningNumber,
                totalBet: calcHybrid.totalBet,
                winAmount: calcHybrid.winAmount,
                profit: calcHybrid.profit,
                totalLossToDate: calcHybrid.totalLossToDate,
                isWin: calcHybrid.isWin
            };
            console.log(`[Daily Analysis] Hybrid AI: ${calcHybrid.isWin ? 'THẮNG' : 'THUA'} (${winningNumber})`);
        }

        // ========== PHƯƠNG PHÁP 5: COMBINED (Tổng hợp cả 4 phương pháp) ==========
        const totalLossSoFarCombined = lastPredictionIndex >= 0 ? (predictions[lastPredictionIndex].resultCombined?.totalLossToDate || 0) : 0;
        if (predictionToUpdate.danhCombined && predictionToUpdate.danhCombined.numbers && predictionToUpdate.danhCombined.numbers.length > 0) {
            const betAmountCombined = predictionToUpdate.betAmountCombined || 10;
            const calcCombined = calculateWinLoss(predictionToUpdate.danhCombined.numbers, winningNumber, betAmountCombined, totalLossSoFarCombined);
            predictionToUpdate.resultCombined = {
                winningNumber,
                totalBet: calcCombined.totalBet,
                winAmount: calcCombined.winAmount,
                profit: calcCombined.profit,
                totalLossToDate: calcCombined.totalLossToDate,
                isWin: calcCombined.isWin
            };
            console.log(`[Daily Analysis] Combined: ${calcCombined.isWin ? 'THẮNG' : 'THUA'} (${winningNumber})`);
        }

        // ========== PHƯƠNG PHÁP 6: EXCLUSION + (Bỏ qua nếu > 65 số) ==========
        const totalLossSoFarSmart = lastPredictionIndex >= 0 ? (predictions[lastPredictionIndex].resultSmart?.totalLossToDate || 0) : 0;
        if (predictionToUpdate.danhSmart && predictionToUpdate.danhSmart.numbers && predictionToUpdate.danhSmart.numbers.length > 0) {
            const smartCount = predictionToUpdate.danhSmart.numbers.length;
            if (smartCount > 65) {
                // Bỏ qua ngày này - quá nhiều số
                predictionToUpdate.resultSmart = { winningNumber, totalBet: 0, winAmount: 0, profit: 0, totalLossToDate: totalLossSoFarSmart, isWin: false, skipped: true, skipReason: `Vượt 65 số (${smartCount} số)` };
                console.log(`[Daily Analysis] Exclusion +: Bỏ QUA (${smartCount} số > 65)`);
            } else {
                const betAmountSmart = predictionToUpdate.betAmountSmart || 10;
                const calcSmart = calculateWinLoss(predictionToUpdate.danhSmart.numbers, winningNumber, betAmountSmart, totalLossSoFarSmart);
                predictionToUpdate.resultSmart = {
                    winningNumber,
                    totalBet: calcSmart.totalBet,
                    winAmount: calcSmart.winAmount,
                    profit: calcSmart.profit,
                    totalLossToDate: calcSmart.totalLossToDate,
                    isWin: calcSmart.isWin
                };
                console.log(`[Daily Analysis] Exclusion +: ${calcSmart.isWin ? 'THắNG' : 'THUA'} (${winningNumber}) - ${smartCount} số`);
            }
        }

        await fs.writeFile(PREDICTIONS_PATH, JSON.stringify(predictions, null, 2));
        console.log(`[Daily Analysis] >>> THÀNH CÔNG: Đã cập nhật kết quả cho ngày ${latestDateStr}.`);
    } else {
        console.log(`[Daily Analysis] Không tìm thấy dự đoán nào cần cập nhật cho ngày ${latestDateStr}.`);
    }
    console.log('[Daily Analysis] === KẾT THÚC ĐỐI CHIẾU ===');
}

async function analyzeAndSavePrediction() {
    console.log('[Daily Analysis] === BẮT ĐẦU PHÂN TÍCH CHO NGÀY TIẾP THEO ===');
    const rawData = lotteryService.getRawData();
    if (!rawData || rawData.length < 4) {
        console.log('[Daily Analysis] Không đủ dữ liệu.');
        return;
    }

    const historicalSpecials = rawData.map(d => d.special.toString().padStart(2, '0'));
    const latestResult = rawData[rawData.length - 1];
    const latestDateStr = latestResult.date.substring(0, 10);

    const [year, month, day] = latestDateStr.split('-').map(Number);
    const latestDate = new Date(Date.UTC(year, month - 1, day));
    latestDate.setUTCDate(latestDate.getUTCDate() + 1);
    const predictionDateStr = latestDate.toISOString().substring(0, 10);

    let predictions = await readJsonFile(PREDICTIONS_PATH);
    const existingIndex = predictions.findIndex(p => p.date === predictionDateStr);
    if (existingIndex !== -1) {
        console.log(`[Daily Analysis] Dự đoán cho ngày ${predictionDateStr} đã tồn tại. Sẽ ghi đè.`);
        // Remove existing prediction - will be replaced with new one
        predictions.splice(existingIndex, 1);
    }

    // ============ EXCLUSION & EXCLUSION+ - DÙNG CHUNG suggestionsController ============
    // Đồng bộ hoàn toàn với Distribution tab: dùng suggestionsController làm nguồn duy nhất
    // - Exclusion: loại CẢ 4 subTier (achieved + achievedSuper + threshold + superThreshold) → numbersToBet
    // - Exclusion+: loại 3 subTier (achieved + achievedSuper + superThreshold, KHÔNG loại threshold/cam)
    console.log('[Daily Analysis] Đang lấy dữ liệu từ suggestionsController (đồng bộ Distribution)...');

    const allNumbers = Array.from({ length: 100 }, (_, k) => k.toString().padStart(2, '0'));
    let suggestionsData = null;
    try {
        await new Promise((resolve) => {
            const mockReq = { query: {} };
            const mockRes = {
                json: (data) => { suggestionsData = data; resolve(); },
                status: () => mockRes
            };
            suggestionsController.getSuggestions(mockReq, mockRes).catch(() => resolve());
        });
    } catch (e) {
        console.error('[Daily Analysis] Lỗi khi lấy suggestions:', e.message);
    }

    let numbersBet = [];
    let excludedNumbers = new Set();
    let isSkipped = false;

    const MAX_BET_COUNT = 65; // Nếu số đánh > 65 thì bỏ qua ngày đó

    if (suggestionsData && suggestionsData.numbersToBet) {
        // Exclusion = numbersToBet = 100 - (achieved ∪ achievedSuper ∪ threshold ∪ superThreshold)
        numbersBet = suggestionsData.numbersToBet.map(n => String(n).padStart(2, '0')).sort();
        (suggestionsData.excludedNumbers || []).forEach(n => excludedNumbers.add(parseInt(n)));
        console.log(`[Daily Analysis] Exclusion (4 subTier): ${numbersBet.length} số đánh, ${excludedNumbers.size} loại trừ`);
    } else {
        // Fallback: dùng exclusionService nếu suggestionsController lỗi
        const fallbackExcl = await exclusionService.getExclusions(rawData, rawData.length - 1, {});
        numbersBet = allNumbers.filter(n => !fallbackExcl.has(parseInt(n)));
        fallbackExcl.forEach(n => excludedNumbers.add(n));
        console.warn(`[Daily Analysis] Exclusion (fallback exclusionService): ${numbersBet.length} số đánh`);
    }

    // Kiểm tra giới hạn 65 số cho Exclusion
    if (numbersBet.length > MAX_BET_COUNT) {
        console.log(`[Daily Analysis] Exclusion SKIP: ${numbersBet.length} số > ${MAX_BET_COUNT} → Bỏ qua ngày này.`);
        isSkipped = true;
        numbersBet = [];
    }

    // ============ UNIFIED PREDICTION METHOD ============
    console.log('[Daily Analysis] Đang tạo dự đoán theo phương pháp Unified...');
    let unifiedNumbers = [];
    let unifiedExcluded = [];
    try {
        // Format date for unified prediction (DD/MM/YYYY)
        const [uYear, uMonth, uDay] = predictionDateStr.split('-');
        const unifiedDateStr = `${uDay}/${uMonth}/${uYear}`;

        const unifiedResult = await unifiedPrediction.getDailyPrediction({ targetDate: unifiedDateStr });

        // Top 25 số có điểm cao nhất để đánh (lấy từ allNumbers đã sorted)
        unifiedNumbers = unifiedResult.allNumbers.slice(0, 25).map(p => p.number);
        // Top 75 số có điểm thấp nhất để loại trừ
        unifiedExcluded = unifiedResult.allNumbers.slice(-75).reverse().map(p => p.number);

        console.log(`[Daily Analysis] Unified: ${unifiedNumbers.length} số đánh, ${unifiedExcluded.length} số loại trừ`);
    } catch (error) {
        console.error('[Daily Analysis] Lỗi khi tạo unified prediction:', error.message);
        // Fallback: sử dụng top 40 số từ distribution
        unifiedNumbers = [];
    }

    // ============ ADVANCED PREDICTION METHOD (13 phương pháp nâng cao) ============
    console.log('[Daily Analysis] Đang tạo dự đoán theo phương pháp Advanced (13 methods)...');
    let advancedNumbers = [];
    let advancedExcluded = [];
    try {
        const advancedResult = await advancedAnalysis.getDailyAdvancedPrediction({ topCount: 25, excludeCount: 75 });
        advancedNumbers = advancedResult.predictions;
        advancedExcluded = advancedResult.exclusions;
        console.log(`[Daily Analysis] Advanced: ${advancedNumbers.length} số đánh, ${advancedExcluded.length} số loại trừ`);
    } catch (error) {
        console.error('[Daily Analysis] Lỗi khi tạo advanced prediction:', error.message);
        advancedNumbers = [];
    }

    // ============ HYBRID AI PREDICTION METHOD (Markov + Monte Carlo + ARIMA + Pattern) ============
    console.log('[Daily Analysis] Đang tạo dự đoán theo phương pháp Hybrid AI...');
    let hybridNumbers = [];
    let hybridExcluded = [];
    try {
        const hybridResult = await hybridAIPrediction.getHybridPrediction({ topCount: 25, excludeCount: 75 });
        hybridNumbers = hybridResult.predictions;
        hybridExcluded = hybridResult.exclusions;
        console.log(`[Daily Analysis] Hybrid AI: ${hybridNumbers.length} số đánh, ${hybridExcluded.length} số loại trừ`);
    } catch (error) {
        console.error('[Daily Analysis] Lỗi khi tạo hybrid prediction:', error.message);
        hybridNumbers = [];
    }

    // ============ STREAK CONTINUATION METHOD (Đánh theo các chuỗi đang diễn ra) ============
    // Logic: Dựa trên quickStats - tìm các chuỗi đang diễn ra và đánh theo
    console.log('[Daily Analysis] Đang tạo dự đoán theo phương pháp Streak Continuation...');
    let streakContNumbers = [];
    let streakContExcluded = [];
    try {
        const streakService = require('./streakContinuationService');
        const streakResult = await streakService.getStreakContinuationNumbers({ topCount: 30 });
        streakContNumbers = streakResult.toBet.map(n => String(n).padStart(2, '0'));
        streakContExcluded = streakResult.excluded.map(n => String(n).padStart(2, '0'));
        console.log(`[Daily Analysis] Streak Continuation: ${streakContNumbers.length} số đánh từ ${streakResult.streakInfo?.length || 0} chuỗi`);
    } catch (error) {
        console.error('[Daily Analysis] Lỗi khi tạo streak continuation prediction:', error.message);
        streakContNumbers = [];
    }

    // ============ COMBINED PREDICTION METHOD (Tổng hợp cả 5 phương pháp) ============
    // Logic: Lấy Union của 5 PP, loại số có count >= 2, đánh số còn lại (count === 1)
    console.log('[Daily Analysis] Đang tạo dự đoán theo phương pháp Combined (tổng hợp 5 phương pháp)...');
    let combinedNumbers = [];
    let combinedExcluded = [];
    try {
        // Đếm số lần xuất hiện của mỗi số trong 5 phương pháp
        const countMap = new Map();

        // Khởi tạo tất cả số với count = 0
        for (let i = 0; i < 100; i++) {
            countMap.set(i.toString().padStart(2, '0'), 0);
        }

        // Đếm từ mỗi phương pháp (5 phương pháp)
        [numbersBet, unifiedNumbers, advancedNumbers, hybridNumbers, streakContNumbers].forEach(methodNumbers => {
            methodNumbers.forEach(num => {
                const numStr = typeof num === 'string' ? num : String(num).padStart(2, '0');
                countMap.set(numStr, (countMap.get(numStr) || 0) + 1);
            });
        });

        // Lấy các số trong UNION (count >= 1) nhưng loại số trùng (count >= 2)
        // → Chỉ đánh số có count === 1 (xuất hiện trong đúng 1 phương pháp)
        combinedNumbers = Array.from(countMap.entries())
            .filter(entry => entry[1] === 1)
            .map(entry => entry[0])
            .sort();

        // Loại trừ = số không có trong union (count === 0) + số trùng (count >= 2)
        const allNumbers = Array.from({ length: 100 }, (_, k) => k.toString().padStart(2, '0'));
        combinedExcluded = allNumbers.filter(n => countMap.get(n) !== 1);

        console.log(`[Daily Analysis] Combined: ${combinedNumbers.length} số đánh (unique), ${combinedExcluded.length} số loại trừ`);
    } catch (error) {
        console.error('[Daily Analysis] Lỗi khi tạo combined prediction:', error.message);
        combinedNumbers = [];
    }

    const lastPrediction = predictions.length > 0 ? predictions[predictions.length - 1] : null;
    const lastTotalLoss = lastPrediction?.result?.totalLossToDate || 0;
    // User yêu cầu "vẫn đánh 10000 VND với bước nhảy 5000". Logic calculateBetAmount hiện tại có thể khác.
    // Tuy nhiên, để nhất quán với simulation, ta nên dùng logic progressive của simulationService.
    // Nhưng dailyAnalysisService chạy độc lập mỗi ngày, state được lưu trong predictions.json.
    // 3. Tính tiền cược (Gấp thếp)
    // Cần lấy totalLossToDate từ ngày gần nhất CÓ KẾT QUẢ
    // Tìm ngày gần nhất có result
    let lastLoss = 0;
    let lastUnifiedLoss = 0;
    let lastAdvancedLoss = 0;
    for (let i = predictions.length - 1; i >= 0; i--) {
        if (predictions[i].result) {
            lastLoss = predictions[i].result.totalLossToDate || 0;
            lastUnifiedLoss = predictions[i].resultUnified?.totalLossToDate || 0;
            lastAdvancedLoss = predictions[i].resultAdvanced?.totalLossToDate || 0;
            break;
        }
    }

    const betAmount = calculateBetAmount(lastLoss);
    const betAmountUnified = calculateBetAmount(lastUnifiedLoss);
    const betAmountAdvanced = calculateBetAmount(lastAdvancedLoss);

    const newPrediction = {
        date: predictionDateStr,
        // Phương pháp 1: Exclusion (Chuỗi + Gap) - ĐỒNG NHẤT với /api/suggestions
        danh: {
            numbers: numbersBet,
            count: numbersBet.length,
            excluded: Array.from(excludedNumbers),
            isSkipped: isSkipped
        },
        betAmount: betAmount,
        analysisDetails: {
            excludedCount: excludedNumbers.size,
            method: 'exclusion',
            description: 'Loại trừ dựa trên Chuỗi đang diễn ra và Gap Analysis (tier: đỏ, tím, cam, light_red)'
        },
        result: null, // Chưa có kết quả

        // Phương pháp 2: Unified (6 methods)
        danhUnified: {
            numbers: unifiedNumbers,
            count: unifiedNumbers.length,
            excluded: unifiedExcluded
        },
        betAmountUnified: betAmountUnified,
        analysisDetailsUnified: {
            method: 'unified',
            description: 'Kết hợp 6 phương pháp: Gap, Streak, Exclusion, Yearly, DayPattern, Recent'
        },
        resultUnified: null, // Chưa có kết quả

        // Phương pháp 3: Advanced (13 methods)
        danhAdvanced: {
            numbers: advancedNumbers,
            count: advancedNumbers.length,
            excluded: advancedExcluded
        },
        betAmountAdvanced: betAmountAdvanced,
        analysisDetailsAdvanced: {
            method: 'advanced',
            description: 'Kết hợp 13 phương pháp: Chi-Square, Z-Score, Poisson, Bayesian, Mean Reversion, MA, Momentum, Cycle, Markov, Fibonacci, Prime, Digit Sum, Modular'
        },
        resultAdvanced: null, // Chưa có kết quả

        // Phương pháp 4: Hybrid AI (Markov + Monte Carlo + ARIMA + Pattern)
        danhHybrid: {
            numbers: hybridNumbers,
            count: hybridNumbers.length,
            excluded: hybridExcluded
        },
        betAmountHybrid: calculateBetAmount(0), // Bắt đầu từ 0
        analysisDetailsHybrid: {
            method: 'hybrid',
            description: 'Kết hợp 4 phương pháp AI: Markov Chain, Monte Carlo, ARIMA Time Series, Pattern Recognition'
        },
        resultHybrid: null, // Chưa có kết quả

        // Phương pháp 5: Streak Continuation (Đánh theo chuỗi đang diễn ra)
        danhStreakCont: {
            numbers: streakContNumbers,
            count: streakContNumbers.length,
            excluded: streakContExcluded
        },
        betAmountStreakCont: calculateBetAmount(0), // Bắt đầu từ 0
        analysisDetailsStreakCont: {
            method: 'streakCont',
            description: 'Đánh theo các chuỗi đang diễn ra - tổng hợp từ quickStats'
        },
        resultStreakCont: null, // Chưa có kết quả

        // Phương pháp 6: Combined (Tổng hợp 5 phương pháp)
        danhCombined: {
            numbers: combinedNumbers,
            count: combinedNumbers.length,
            excluded: combinedExcluded
        },
        betAmountCombined: calculateBetAmount(0), // Bắt đầu từ 0
        analysisDetailsCombined: {
            method: 'combined',
            description: 'Tổng hợp cả 5 phương pháp: Exclusion, Unified, Advanced, Hybrid AI, Streak Continuation'
        },
        resultCombined: null // Chưa có kết quả
    };

    // ============ EXCLUSION PLUS PREDICTION METHOD (Loại trừ kỷ lục) ============
    // Logic: Chỉ dùng loại trừ RED + PURPLE từ suggestionsController
    // = Các chuỗi "Đạt kỷ lục" và "Tới hạn siêu kỷ lục"
    // Số đánh = 100 - các số bị loại đỏ+tím
    console.log('[Daily Analysis] Đang tạo dự đoán theo phương pháp Exclusion Plus...');
    let exclusionPlusNumbers = [];
    let exclusionPlusExcluded = [];
    try {
        // Exclusion+ = loại chỉ 3 subTier: achieved + achievedSuper + superThreshold (KHÔNG loại threshold/cam)
        // Dùng exclusionsBySubTier từ suggestionsData đã lấy ở trên
        if (suggestionsData && suggestionsData.exclusionsBySubTier) {
            const eSub = suggestionsData.exclusionsBySubTier;
            // Tập số bị loại bởi Exclusion+: achieved ∪ achievedSuper ∪ superThreshold
            const exPlusExcludedSet = new Set([
                ...(eSub.achieved || []).map(Number),
                ...(eSub.achievedSuper || []).map(Number),
                ...(eSub.superThreshold || []).map(Number)
            ]);
            exclusionPlusNumbers = allNumbers
                .filter(n => !exPlusExcludedSet.has(parseInt(n)))
                .sort();
            exclusionPlusExcluded = allNumbers
                .filter(n => exPlusExcludedSet.has(parseInt(n)))
                .sort();
        } else {
            // Fallback: dùng numbersBet từ Exclusion
            exclusionPlusNumbers = [...numbersBet];
            exclusionPlusExcluded = Array.from(excludedNumbers).map(n => String(n).padStart(2, '0'));
        }
        console.log(`[Daily Analysis] Exclusion Plus (3 subTier, không có threshold/cam): ${exclusionPlusNumbers.length} số đánh, ${exclusionPlusExcluded.length} loại trừ`);
    } catch (error) {
        console.error('[Daily Analysis] Lỗi khi tạo Exclusion Plus prediction:', error.message);
        exclusionPlusNumbers = [...numbersBet];
        exclusionPlusExcluded = [];
    }

    // Kiểm tra giới hạn 65 số cho Exclusion+
    let isSkippedSmart = false;
    if (exclusionPlusNumbers.length > MAX_BET_COUNT) {
        console.log(`[Daily Analysis] Exclusion+ SKIP: ${exclusionPlusNumbers.length} số > ${MAX_BET_COUNT} → Bỏ qua ngày này.`);
        isSkippedSmart = true;
        exclusionPlusNumbers = [];
    }

    // Thêm Exclusion Plus vào newPrediction (thay thế Smart Pick)
    newPrediction.danhSmart = {
        numbers: exclusionPlusNumbers,
        count: exclusionPlusNumbers.length,
        excluded: exclusionPlusExcluded,
        isSkipped: isSkippedSmart
    };
    newPrediction.betAmountSmart = calculateBetAmount(0);
    newPrediction.analysisDetailsSmart = {
        method: 'exclusionPlus',
        description: 'Exclusion +: Đánh tất cả số sau khi loại trừ Đạt kỷ lục và Tới hạn siêu kỷ lục (RED + PURPLE tiers). Bỏ qua nếu > 65 số.'
    };
    newPrediction.resultSmart = null;

    // Prediction was already removed from array if it existed (line 86-91)
    // So we just push the new one
    predictions.push(newPrediction);

    await fs.writeFile(PREDICTIONS_PATH, JSON.stringify(predictions, null, 2));
    console.log(`[Daily Analysis] Đã lưu dự đoán cho ngày ${predictionDateStr}.`);
    console.log('[Daily Analysis] === KẾT THÚC PHÂN TÍCH ===');
}

/**
 * [MỚI] Đồng bộ lại toàn bộ lịch sử dự đoán với kết quả thực tế
 * Được gọi khi khởi động server
 */
async function syncPredictionHistory() {
    console.log('[Daily Analysis] === BẮT ĐẦU ĐỒNG BỘ LỊCH SỬ ===');
    let predictions = await readJsonFile(PREDICTIONS_PATH);
    if (predictions.length === 0) {
        console.log('[Daily Analysis] Lịch sử trống.');
        return;
    }

    const rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) {
        console.log('[Daily Analysis] Chưa có dữ liệu xổ số để đồng bộ.');
        return;
    }

    // Map date -> special for fast lookup
    // rawData date is ISO string, we need YYYY-MM-DD
    const dateToResultMap = new Map(rawData.map(d => [d.date.substring(0, 10), d.special]));

    let totalLossSoFar = 0;
    let totalLossSoFarUnified = 0;
    let totalLossSoFarAdvanced = 0;
    let totalLossSoFarHybrid = 0;
    let totalLossSoFarCombined = 0;
    let totalLossSoFarSmart = 0; // Mới cho Smart Pick
    let updatedCount = 0;

    // Sắp xếp predictions theo ngày tăng dần để tính lũy kế đúng
    predictions.sort((a, b) => new Date(a.date) - new Date(b.date));

    for (let i = 0; i < predictions.length; i++) {
        const pred = predictions[i];

        // --- LOGIC TÁI TẠO DỮ LIỆU EXCLUSION PLUS CHO LỊCH SỬ CŨ ---
        if (!pred.danhSmart || !pred.danhSmart.numbers) {
            try {
                // Fallback: dùng danh sách số đánh từ Exclusion thông thường
                const exclusionNumbers = pred.danh?.numbers || [];
                if (exclusionNumbers.length > 0) {
                    pred.danhSmart = {
                        numbers: exclusionNumbers,
                        count: exclusionNumbers.length,
                        excluded: pred.danh?.excluded || []
                    };
                    pred.betAmountSmart = calculateBetAmount(0);
                    pred.analysisDetailsSmart = { method: 'exclusionPlus', description: 'Exclusion + (Reconstructed from Exclusion data)' };
                }
            } catch (e) {
                // Ignore error during reconstruction
            }
        }
        // -------------------------------------------------------

        const actualSpecial = dateToResultMap.get(pred.date);

        if (actualSpecial !== undefined) {
            // Có kết quả -> Tính toán lại
            const winningNumber = actualSpecial.toString().padStart(2, '0');

            // 1. EXCLUSION (Bỏ qua nếu > 65 số)
            if (pred.danh && pred.danh.numbers && pred.danh.numbers.length > 0) {
                const exclusionCount = pred.danh.numbers.length;
                if (exclusionCount > 65) {
                    pred.result = { winningNumber, totalBet: 0, winAmount: 0, profit: 0, totalLossToDate: totalLossSoFar, isWin: false, skipped: true, skipReason: `Vượt 65 số (${exclusionCount} số)` };
                } else {
                    const calculation = calculateWinLoss(pred.danh.numbers, winningNumber, pred.betAmount || 10, totalLossSoFar);
                    pred.result = { ...calculation, winningNumber };
                    totalLossSoFar = calculation.totalLossToDate;
                }
            } else {
                pred.result = { winningNumber, totalBet: 0, winAmount: 0, profit: 0, totalLossToDate: totalLossSoFar, isWin: false, skipped: true };
            }

            // 2. UNIFIED
            if (pred.danhUnified && pred.danhUnified.numbers && pred.danhUnified.numbers.length > 0) {
                const calc = calculateWinLoss(pred.danhUnified.numbers, winningNumber, pred.betAmountUnified || 10, totalLossSoFarUnified);
                pred.resultUnified = { ...calc, winningNumber };
                totalLossSoFarUnified = calc.totalLossToDate;
            } else { pred.resultUnified = null; }

            // 3. ADVANCED
            if (pred.danhAdvanced && pred.danhAdvanced.numbers && pred.danhAdvanced.numbers.length > 0) {
                const calc = calculateWinLoss(pred.danhAdvanced.numbers, winningNumber, pred.betAmountAdvanced || 10, totalLossSoFarAdvanced);
                pred.resultAdvanced = { ...calc, winningNumber };
                totalLossSoFarAdvanced = calc.totalLossToDate;
            } else { pred.resultAdvanced = null; }

            // 4. HYBRID AI
            if (pred.danhHybrid && pred.danhHybrid.numbers && pred.danhHybrid.numbers.length > 0) {
                const calc = calculateWinLoss(pred.danhHybrid.numbers, winningNumber, pred.betAmountHybrid || 10, totalLossSoFarHybrid);
                pred.resultHybrid = { ...calc, winningNumber };
                totalLossSoFarHybrid = calc.totalLossToDate;
            } else { pred.resultHybrid = null; }

            // 5. COMBINED
            if (pred.danhCombined && pred.danhCombined.numbers && pred.danhCombined.numbers.length > 0) {
                const calc = calculateWinLoss(pred.danhCombined.numbers, winningNumber, pred.betAmountCombined || 10, totalLossSoFarCombined);
                pred.resultCombined = { ...calc, winningNumber };
                totalLossSoFarCombined = calc.totalLossToDate;
            } else { pred.resultCombined = null; }

            // 6. EXCLUSION + (Bỏ qua nếu > 65 số)
            if (pred.danhSmart && pred.danhSmart.numbers && pred.danhSmart.numbers.length > 0) {
                const smartCount = pred.danhSmart.numbers.length;
                if (smartCount > 65) {
                    pred.resultSmart = { winningNumber, totalBet: 0, winAmount: 0, profit: 0, totalLossToDate: totalLossSoFarSmart, isWin: false, skipped: true, skipReason: `Vượt 65 số (${smartCount} số)` };
                } else {
                    const calc = calculateWinLoss(pred.danhSmart.numbers, winningNumber, pred.betAmountSmart || 10, totalLossSoFarSmart);
                    pred.resultSmart = { ...calc, winningNumber };
                    totalLossSoFarSmart = calc.totalLossToDate;
                }
            } else { pred.resultSmart = null; }

            updatedCount++;
        } else {
            // Chưa có kết quả
            pred.result = null;
            pred.resultUnified = null;
            pred.resultAdvanced = null;
            pred.resultHybrid = null;
            pred.resultCombined = null;
            pred.resultSmart = null;
        }
    }

    await fs.writeFile(PREDICTIONS_PATH, JSON.stringify(predictions, null, 2));
    console.log(`[Daily Analysis] === ĐỒNG BỘ HOÀN TẤT (${updatedCount} ngày đã cập nhật) ===`);
}

module.exports = {
    checkAndUpdateHistory,
    analyzeAndSavePrediction,
    syncPredictionHistory
};