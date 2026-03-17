const statisticsService = require('./statisticsService');
const { identifyCategories, extractValueForComparison } = require('../utils/numberAnalysis');
const STATS_CONFIG = require('../config/stats-config');

/**
 * Service để phân tích các chuỗi có thể xảy ra (Potential Streaks)
 * Mục đích: Tìm các pattern có kỷ lục 2 ngày và đánh giá khả năng đạt kỷ lục
 */

/**
 * Lấy danh sách tất cả các pattern có record streak = 2 ngày
 * @returns {Array} Danh sách các pattern có kỷ lục 2 ngày
 */
async function getPatternsWithRecord2Days() {
    const quickStats = await statisticsService.getQuickStats();
    const patternsWithRecord2 = [];

    // Duyệt qua tất cả các patterns trong quickStats
    for (const [key, stat] of Object.entries(quickStats)) {
        if (!stat || !stat.longest || stat.longest.length === 0) continue;

        const recordLen = stat.longest[0].length;

        if (recordLen === 2) {
            patternsWithRecord2.push({
                key: key,
                category: key.split(':')[0],
                subcategory: key.split(':')[1] || 'default',
                recordLength: recordLen,
                gapStats: stat.gapStats ? stat.gapStats[2] : null,
                longest: stat.longest
            });
        }
    }

    return patternsWithRecord2;
}

/**
 * Phân tích potential streaks dựa trên kết quả mới nhất
 * @param {string} latestNumber - Số mới nhất (ví dụ: "12")
 * @returns {Object} Kết quả phân tích potential streaks
 */
async function analyzePotentialStreaks(latestNumber) {
    // Chuẩn hóa số đầu vào
    const normalizedNumber = String(latestNumber).padStart(2, '0');

    // Bước 1: Xác định các dạng của số mới nhất
    const categories = identifyCategories(normalizedNumber);

    // Bước 2: Lấy danh sách các pattern có kỷ lục 2 ngày
    const patternsWithRecord2 = await getPatternsWithRecord2Days();

    // Bước 3: Lọc ra các pattern phù hợp với số mới nhất
    const matchingPatterns = [];

    for (const pattern of patternsWithRecord2) {
        const { category, subcategory, key, gapStats, longest } = pattern;

        // Kiểm tra xem số mới nhất có thuộc category này không
        // Với các pattern như "chanChan:veLienTiep", category là "chanChan"
        if (!categories.includes(category)) continue;

        // Kiểm tra gap stats
        if (!gapStats) continue;

        const { minGap, avgGap, lastGap } = gapStats;

        // Đánh giá khả năng đạt kỷ lục
        let probability = 'low';
        let reason = '';
        let shouldExclude = false;

        // Điều kiện 1: lastGap < minGap (rất có khả năng)
        if (minGap !== null && lastGap < minGap) {
            probability = 'high';
            reason = `Khoảng cách hiện tại (${lastGap}) < Khoảng cách ngắn nhất (${minGap})`;
            shouldExclude = true;
        }
        // Điều kiện 2: lastGap < threshold * avgGap (có khả năng)
        else if (avgGap > 0 && lastGap < STATS_CONFIG.GAP_THRESHOLD_PERCENT * avgGap) {
            probability = 'medium';
            const threshold = Math.round(STATS_CONFIG.GAP_THRESHOLD_PERCENT * avgGap);
            reason = `Khoảng cách hiện tại (${lastGap}) < ${Math.round(STATS_CONFIG.GAP_THRESHOLD_PERCENT * 100)}% TB (${threshold})`;
            shouldExclude = true;
        }

        if (shouldExclude) {
            matchingPatterns.push({
                key,
                category,
                subcategory,
                recordLength: 2,
                probability,
                reason,
                gapInfo: {
                    minGap,
                    avgGap,
                    lastGap
                },
                longestStreaks: longest
            });
        }
    }

    return {
        latestNumber: normalizedNumber,
        categories,
        totalPatternsWithRecord2: patternsWithRecord2.length,
        potentialStreaks: matchingPatterns,
        count: matchingPatterns.length
    };
}

/**
 * Lấy danh sách số cần loại trừ từ potential streaks
 * @param {string} latestNumber - Số mới nhất
 * @returns {Object} Danh sách số loại trừ và thông tin chi tiết
 */
async function getPotentialStreakExclusions(latestNumber) {
    const analysis = await analyzePotentialStreaks(latestNumber);
    const excludedNumbers = new Set();
    const explanations = [];

    // Import getNumbersFromCategory từ suggestionsController
    const { getNumbersFromCategory } = require('../controllers/suggestionsController');

    for (const pattern of analysis.potentialStreaks) {
        const { category, subcategory, key, probability, reason } = pattern;

        // Lấy danh sách số cần loại trừ dựa trên category
        let numbers = [];

        try {
            numbers = getNumbersFromCategory(category);
        } catch (error) {
            console.error(`Error getting numbers for ${category}:`, error.message);
            numbers = [];
        }

        // Thêm vào danh sách loại trừ
        if (numbers && numbers.length > 0) {
            numbers.forEach(n => {
                if (typeof n === 'number' && !isNaN(n)) {
                    excludedNumbers.add(n);
                }
            });

            explanations.push({
                key: `[TIỀM NĂNG] ${key}`,
                category,
                subcategory,
                probability,
                reason,
                numbersCount: numbers.length,
                numbers: numbers.slice(0, 10) // Chỉ hiển thị 10 số đầu
            });
        }
    }

    return {
        excludedNumbers: Array.from(excludedNumbers).sort((a, b) => a - b),
        count: excludedNumbers.size,
        explanations,
        analysis
    };
}

module.exports = {
    getPatternsWithRecord2Days,
    analyzePotentialStreaks,
    getPotentialStreakExclusions
};
