const statisticsService = require('./statisticsService');
const { identifyCategories, extractValueForComparison } = require('../utils/numberAnalysis');

/**
 * Service để phân tích các chuỗi có thể xảy ra (Potential Streaks)
 * ĐÃ ĐỒNG BỘ: Sử dụng cùng mô hình Drop-Off Probability ≥85% với suggestionsController
 * Mục đích: Tìm các pattern có tỷ lệ gãy cao dựa trên xác suất có điều kiện
 */

const MIN_DROPOFF = 0.85; // Đồng bộ với suggestionsController

/**
 * Lấy danh sách tất cả các pattern có kỷ lục ngắn (2-3 ngày) và đang active
 * Mở rộng từ chỉ record=2 sang tất cả pattern đang có tỷ lệ gãy cao
 * @returns {Array} Danh sách các pattern tiềm năng
 */
async function getPatternsWithHighDropoff() {
    const quickStats = await statisticsService.getQuickStats();
    const highDropoffPatterns = [];

    for (const [key, stat] of Object.entries(quickStats)) {
        if (!stat || !stat.current) continue;

        const currentLen = stat.current.length;
        if (!currentLen || currentLen < 1) continue;

        // Lấy gapStats cho currentLen
        const currentGapInfo = stat.gapStats ? stat.gapStats[currentLen] : null;
        const currentCount = currentGapInfo ? currentGapInfo.count : 0;

        // Record length
        const recordLen = stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0;

        // Dynamic MIN_SAMPLES: đồng bộ với suggestionsController
        let minSamples = 5;
        if (recordLen > 0 && currentLen >= recordLen) {
            minSamples = 1;
        } else if (recordLen > 0 && currentLen >= recordLen - 1) {
            minSamples = 3;
        }
        if (currentCount < minSamples) continue;

        // Tính target length (look-ahead đến kỷ lục)
        const isSoLePattern = key.toLowerCase().includes('sole');
        let checkTargetLen = currentLen + (isSoLePattern ? 2 : 1);

        if (recordLen > currentLen) {
            const step = isSoLePattern ? 2 : 1;
            const stepsToRecord = (recordLen - currentLen) / step;
            if (stepsToRecord > 0 && stepsToRecord <= 2) {
                checkTargetLen = recordLen;
            }
        }

        // Tính drop-off rate
        const checkTargetGapInfo = stat.gapStats ? stat.gapStats[checkTargetLen] : null;
        const checkTargetCount = checkTargetGapInfo ? checkTargetGapInfo.count : 0;

        let dropOffRate = 0;
        if (currentCount > 0) {
            const continuationRate = checkTargetCount / currentCount;
            dropOffRate = 1 - continuationRate;
        } else {
            dropOffRate = 1;
        }

        if (dropOffRate >= MIN_DROPOFF) {
            // Xác định tier (đồng bộ với suggestionsController)
            let probability = 'medium';
            if (dropOffRate >= 0.95) probability = 'critical';
            else if (dropOffRate >= 0.90) probability = 'high';

            const reachedLabel = `đạt ≥${currentLen}d`;
            let reason;
            if (checkTargetCount === 0) {
                reason = `Tỷ lệ gãy 100%: Chuỗi ${currentLen} ngày chưa từng kéo dài thêm trong lịch sử!`;
            } else {
                reason = `Tỷ lệ gãy ${(dropOffRate*100).toFixed(1)}%: Lịch sử ${currentCount} lần ${reachedLabel} → chỉ ${checkTargetCount} lần tới ≥${checkTargetLen}d`;
            }

            highDropoffPatterns.push({
                key,
                category: key.split(':')[0],
                subcategory: key.split(':')[1] || 'default',
                recordLength: recordLen,
                currentLength: currentLen,
                dropOffRate,
                probability,
                reason,
                gapStats: stat.gapStats ? stat.gapStats[currentLen] : null,
                longest: stat.longest,
                patternNumbers: stat.current.patternNumbers || null
            });
        }
    }

    // Sắp xếp theo drop-off rate giảm dần
    highDropoffPatterns.sort((a, b) => b.dropOffRate - a.dropOffRate);

    return highDropoffPatterns;
}

/**
 * Phân tích potential streaks dựa trên kết quả mới nhất
 * ĐÃ ĐỒNG BỘ: Sử dụng drop-off probability thay vì gap-based logic
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
 * ĐÃ ĐỒNG BỘ: Sử dụng patternNumbers trước, fallback sang getNumbersFromCategory
 * @param {string} latestNumber - Số mới nhất
 * @returns {Object} Danh sách số loại trừ và thông tin chi tiết
 */
async function getPotentialStreakExclusions(latestNumber) {
    const analysis = await analyzePotentialStreaks(latestNumber);
    const excludedNumbers = new Set();
    const explanations = [];

    const { getNumbersFromCategory } = require('../controllers/suggestionsController');

    for (const pattern of analysis.potentialStreaks) {
        const { category, subcategory, key, probability, reason, dropOffRate, patternNumbers } = pattern;

        // Ưu tiên patternNumbers từ quickStats (đồng bộ 100% với suggestionsController)
        let numbers = [];
        if (patternNumbers && patternNumbers.length > 0) {
            numbers = [...patternNumbers];
        } else {
            try {
                numbers = getNumbersFromCategory(category);
            } catch (error) {
                console.error(`Error getting numbers for ${category}:`, error.message);
                numbers = [];
            }
        }

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

// Legacy compatibility: renamed but still exported
const getPatternsWithRecord2Days = getPatternsWithHighDropoff;

module.exports = {
    getPatternsWithRecord2Days,
    getPatternsWithHighDropoff,
    analyzePotentialStreaks,
    getPotentialStreakExclusions
};
