const statisticsService = require('./statisticsService');
const { identifyCategories } = require('../utils/numberAnalysis');
const exclusionLogic = require('./exclusionLogicService');

/**
 * Service để phân tích các chuỗi có thể xảy ra (Potential Streaks)
 * ĐÃ ĐỒNG BỘ: Sử dụng exclusionLogicService.calculateDropOff() - cùng logic drop-off >= 85%
 */

const MIN_DROPOFF = exclusionLogic.MIN_DROPOFF; // 0.85

/**
 * Lấy danh sách tất cả các pattern có tỷ lệ gãy >= 85% (drop-off rate)
 * @returns {Array} Danh sách các pattern tiềm năng
 */
async function getPatternsWithHighDropoff() {
    const quickStats = await statisticsService.getQuickStats();
    const highDropoffPatterns = [];

    for (const [key, stat] of Object.entries(quickStats)) {
        if (key === '_meta') continue;

        const dropOffInfo = exclusionLogic.calculateDropOff(stat, key);
        if (!dropOffInfo) continue;
        if (dropOffInfo.dropOffRate < MIN_DROPOFF) continue;

        // Xác định tier đơn giản
        let probability = 'medium';
        if (dropOffInfo.dropOffRate >= 0.95) probability = 'critical';
        else if (dropOffInfo.dropOffRate >= 0.90) probability = 'high';

        let reason;
        if (dropOffInfo.nextCount === 0) {
            reason = `Tỷ lệ gãy 100%: Chuỗi ${dropOffInfo.currentLen} ngày chưa từng kéo dài thêm trong lịch sử!`;
        } else {
            reason = `Tỷ lệ gãy ${(dropOffInfo.dropOffRate * 100).toFixed(1)}%: Lịch sử ${dropOffInfo.curCount} lần đạt ≥${dropOffInfo.currentLen}d → chỉ ${dropOffInfo.nextCount} lần tới ≥${dropOffInfo.targetLen}d`;
        }

        highDropoffPatterns.push({
            key,
            category: key.split(':')[0],
            subcategory: key.split(':')[1] || 'default',
            recordLength: dropOffInfo.recordLen,
            currentLength: dropOffInfo.currentLen,
            dropOffRate: dropOffInfo.dropOffRate,
            probability,
            reason,
            gapStats: stat.gapStats ? stat.gapStats[dropOffInfo.currentLen] : null,
            longest: stat.longest,
            patternNumbers: stat.current ? (stat.current.patternNumbers || null) : null
        });
    }

    // Sắp xếp theo drop-off rate giảm dần
    highDropoffPatterns.sort((a, b) => b.dropOffRate - a.dropOffRate);

    return highDropoffPatterns;
}

/**
 * Phân tích potential streaks dựa trên kết quả mới nhất
 * @param {string} latestNumber - Số mới nhất (ví dụ: "12")
 * @returns {Object} Kết quả phân tích potential streaks
 */
async function analyzePotentialStreaks(latestNumber) {
    const normalizedNumber = String(latestNumber).padStart(2, '0');
    const categories = identifyCategories(normalizedNumber);
    const allHighDropoff = await getPatternsWithHighDropoff();

    // Lọc ra các pattern phù hợp với số mới nhất
    const matchingPatterns = allHighDropoff.filter(pattern => {
        return categories.includes(pattern.category);
    });

    return {
        latestNumber: normalizedNumber,
        categories,
        totalHighDropoffPatterns: allHighDropoff.length,
        potentialStreaks: matchingPatterns,
        count: matchingPatterns.length
    };
}

/**
 * Lấy danh sách số cần loại trừ từ potential streaks
 * ĐÃ ĐỒNG BỘ: Sử dụng resolveNumbersForPattern từ exclusionLogicService
 * @param {string} latestNumber - Số mới nhất
 * @returns {Object} Danh sách số loại trừ và thông tin chi tiết
 */
async function getPotentialStreakExclusions(latestNumber) {
    const analysis = await analyzePotentialStreaks(latestNumber);
    const excludedNumbers = new Set();
    const explanations = [];

    const suggestionsController = require('../controllers/suggestionsController');

    for (const pattern of analysis.potentialStreaks) {
        const { category, subcategory, key, probability, reason, dropOffRate, patternNumbers } = pattern;
        const quickStats = await statisticsService.getQuickStats();
        const stat = quickStats[key];

        if (!stat) continue;

        // Dùng chung hàm resolveNumbersForPattern từ exclusionLogicService
        let numbers = exclusionLogic.resolveNumbersForPattern(stat, key, category, subcategory, suggestionsController);

        if (numbers && numbers.length > 0) {
            numbers.forEach(n => {
                const num = typeof n === 'number' ? n : parseInt(n, 10);
                if (!isNaN(num)) {
                    excludedNumbers.add(num);
                }
            });

            explanations.push({
                key: `[TIỀM NĂNG] ${key}`,
                category,
                subcategory,
                probability,
                dropOffRate: (dropOffRate * 100).toFixed(1) + '%',
                reason,
                numbersCount: numbers.length,
                numbers: numbers.slice(0, 10)
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

// Legacy compatibility
const getPatternsWithRecord2Days = getPatternsWithHighDropoff;

module.exports = {
    getPatternsWithRecord2Days,
    getPatternsWithHighDropoff,
    analyzePotentialStreaks,
    getPotentialStreakExclusions
};
