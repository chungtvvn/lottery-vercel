/**
 * exclusionService.js
 * 
 * Wrapper service cho logic loại trừ.
 * TẤT CẢ methods đều delegate sang exclusionLogicService.getDropOffExclusions()
 * 
 * Phương pháp duy nhất: Drop-off ≥ 85%
 */

const statisticsService = require('./statisticsService');
const exclusionLogic = require('./exclusionLogicService');

/**
 * Main function to get exclusions for a specific date (LIVE)
 * Mặc định sử dụng Calibrated V2 (không ép số lượng, BH FDR, minTrials >= 20, diversityWeights)
 */
async function getExclusions(lotteryData, currentIndex, globalStats, options = {}) {
    const quickStats = await statisticsService.getQuickStats();
    if (options.useLegacyDropoff) {
        const result = exclusionLogic.getDropOffExclusions(quickStats, options);
        console.log(`[Exclusion Service] Legacy Drop-off ≥85%: Excluded ${result.excluded.length} numbers → ${result.toBet.length} bets`);
        return result.excludedNumbers;
    }

    const result = exclusionLogic.getCalibratedExclusionsFromQuickStats(quickStats, options);
    console.log(`[Exclusion Service] Calibrated V2: Excluded ${result.excluded.length} numbers → ${result.toBet.length} bets (Abstained: ${result.abstained})`);
    return new Set(result.excluded);
}

/**
 * Lấy danh sách loại trừ hiệu chuẩn thống kê V2
 */
async function getCalibratedExclusions(options = {}) {
    const quickStats = await statisticsService.getQuickStats();
    return exclusionLogic.getCalibratedExclusionsFromQuickStats(quickStats, options);
}

/**
 * Smart exclusion - same as getExclusions (unified)
 */
async function getSmartExclusions(lotteryData, currentIndex, globalStats, options = {}) {
    return getExclusions(lotteryData, currentIndex, globalStats, options);
}

/**
 * Get full exclusion result with explanations (for API use)
 */
async function getFullExclusionResult(options = {}) {
    const quickStats = await statisticsService.getQuickStats();
    if (options.useLegacyDropoff) {
        return exclusionLogic.getDropOffExclusions(quickStats, options);
    }
    return exclusionLogic.getCalibratedExclusionsFromQuickStats(quickStats, options);
}

module.exports = {
    getExclusions,
    getSmartExclusions,
    getFullExclusionResult,
    getCalibratedExclusions
};
