// services/streakBacktestService.js
// Backtest phương pháp Drop-off >= 85% - Sử dụng dữ liệu chuỗi đã lưu
// ĐÃ ĐỒNG BỘ: Dùng cùng logic với Statistics, Simulation, Distribution

const lotteryService = require('./lotteryService');
const historicalExclusionSvc = require('./historicalExclusionService');

/**
 * Đọc tất cả dữ liệu thống kê
 */
async function loadAllStats() {
    try {
        const numberStats = lotteryService.getNumberStats() || {};
        const headTailStats = lotteryService.getHeadTailStats() || {};
        const sumDiffStats = lotteryService.getSumDiffStats() || {};
        return { ...numberStats, ...headTailStats, ...sumDiffStats };
    } catch (error) {
        console.error('[Streak Backtest] Lỗi đọc thống kê:', error.message);
    }
}

function parseDate(dateStr) {
    if (!dateStr) return new Date(0);
    const [d, m, y] = dateStr.split('/').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Chạy backtest cho N ngày
 * Phương pháp duy nhất: Drop-off >= 85% (delegate sang historicalExclusionService)
 */
async function runBacktest(days = 30) {
    try {
        const rawData = lotteryService.getRawData();

        if (!rawData || rawData.length < days + 1) {
            return { error: 'Không đủ dữ liệu để backtest' };
        }

        const results = [];
        let totalWins = 0;
        let totalLosses = 0;

        // Lấy kết quả từ ngày gần nhất trở về trước
        const endIndex = rawData.length - 1;
        const startIndex = endIndex - days;

        for (let i = startIndex; i < endIndex; i++) {
            const dateData = rawData[i];
            const nextDayData = rawData[i + 1];

            if (!dateData || !nextDayData) continue;

            // Format ngày theo dd/mm/yyyy
            const dateObj = new Date(dateData.date);
            const dateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

            // Ngày tiếp theo cần dự đoán (ngày i+1)
            const nextDayObj = new Date(nextDayData.date);
            const nextDayStr = `${String(nextDayObj.getDate()).padStart(2, '0')}/${String(nextDayObj.getMonth() + 1).padStart(2, '0')}/${nextDayObj.getFullYear()}`;

            const actualNumber = nextDayData.special;

            // === DROP-OFF >= 85% EXCLUSION (unified logic) ===
            // historicalExclusionService.getExclusionsForDateCached()
            // → computeQuickStatsForDate() → exclusionLogicService.getDropOffExclusions()
            const totalYears = lotteryService.getTotalYears();
            const exclResult = historicalExclusionSvc.getExclusionsForDateCached(nextDayStr, totalYears);

            const betNumbers = exclResult.toBet;
            const excludedNumbers = exclResult.excluded;
            const isSkipped = exclResult.skipped;

            const isWin = !isSkipped && betNumbers.includes(actualNumber);

            if (isWin) totalWins++;
            else totalLosses++;

            results.push({
                date: dateData.date.substring(0, 10),
                nextDate: nextDayData.date.substring(0, 10),
                dateDisplay: dateStr,
                actualNumber: actualNumber,

                // Drop-off exclusion results
                exclusionCount: betNumbers.length,
                exclusionSkipped: isSkipped,
                isExclusionWin: isWin,
                exclusionNumbers: betNumbers,
                excludedCount: excludedNumbers.length,
                excludedNumbers: excludedNumbers,

                // Legacy compatibility (Exclusion+ = same as Exclusion now)
                exclusionPlusCount: betNumbers.length,
                exclusionPlusSkipped: isSkipped,
                isExclusionPlusWin: isWin,
                exclusionPlusNumbers: betNumbers,

                // Simplified fields
                finalCount: betNumbers.length,
                skipped: isSkipped,
                isFinalWin: isWin,
                finalNumbers: betNumbers,
                allContinuationCount: betNumbers.length,
                isWin: isWin,
                inAllContinuation: isWin
            });
        }

        // Tính thống kê
        const winRate = results.length > 0 ? totalWins / results.length : 0;

        // Exclusion Stats
        const exclusionPlayed = results.filter(r => !r.exclusionSkipped);
        const exclusionWins = exclusionPlayed.filter(r => r.isExclusionWin).length;
        const exclusionLosses = exclusionPlayed.length - exclusionWins;
        const exclusionWinRate = exclusionPlayed.length > 0 ? exclusionWins / exclusionPlayed.length : 0;
        const exclusionAvgCount = exclusionPlayed.length > 0
            ? (exclusionPlayed.reduce((a, b) => a + b.exclusionCount, 0) / exclusionPlayed.length).toFixed(1)
            : 0;

        return {
            summary: {
                totalDays: results.length,
                wins: totalWins,
                losses: totalLosses,
                winRate: (winRate * 100).toFixed(2) + '%',

                // Exclusion summary (primary method)
                exclusionPlayDays: exclusionPlayed.length,
                exclusionSkipDays: results.length - exclusionPlayed.length,
                exclusionWins: exclusionWins,
                exclusionLosses: exclusionLosses,
                exclusionWinRate: (exclusionWinRate * 100).toFixed(2) + '%',
                exclusionAvgCount: exclusionAvgCount,

                // Legacy compatibility (Exclusion+ = same)
                exclusionPlusPlayDays: exclusionPlayed.length,
                exclusionPlusSkipDays: results.length - exclusionPlayed.length,
                exclusionPlusWins: exclusionWins,
                exclusionPlusLosses: exclusionLosses,
                exclusionPlusWinRate: (exclusionWinRate * 100).toFixed(2) + '%',
                exclusionPlusAvgCount: exclusionAvgCount,

                // Legacy compatibility (Final = same as Exclusion)
                finalPlayDays: exclusionPlayed.length,
                finalSkipDays: results.length - exclusionPlayed.length,
                finalWins: exclusionWins,
                finalLosses: exclusionLosses,
                finalWinRate: (exclusionWinRate * 100).toFixed(2) + '%',
                avgFinalCount: exclusionAvgCount,

                // Legacy
                allContinuationWins: totalWins,
                allContinuationRate: (winRate * 100).toFixed(2) + '%',
                excludedSuccessRate: 'N/A',
                avgExcludedCount: '0'
            },
            results: results
        };
    } catch (error) {
        console.error('[Streak Backtest] Lỗi:', error.message, error.stack);
        return { error: error.message };
    }
}

module.exports = {
    runBacktest,
    loadAllStats
};
