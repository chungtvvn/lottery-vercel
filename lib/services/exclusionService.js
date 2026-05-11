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
 * Uses getQuickStats() → getDropOffExclusions()
 */
async function getExclusions(lotteryData, currentIndex, globalStats, options = {}) {
    const quickStats = await statisticsService.getQuickStats();
    const result = exclusionLogic.getDropOffExclusions(quickStats, options);

    console.log(`[Exclusion Service] Drop-off ≥85%: Excluded ${result.excluded.length} numbers → ${result.toBet.length} bets`);
    return result.excludedNumbers;
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
    return exclusionLogic.getDropOffExclusions(quickStats, options);
}

module.exports = {
    getExclusions,
    getSmartExclusions,
    getFullExclusionResult
};
