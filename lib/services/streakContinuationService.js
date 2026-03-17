// services/streakContinuationService.js
// Phương pháp Streak Continuation - đánh vào các số có khả năng tiếp tục chuỗi
// Logic: Sử dụng quickStats để tìm các chuỗi đang diễn ra và đánh theo

const statisticsService = require('./statisticsService');
const suggestionsController = require('../controllers/suggestionsController');

/**
 * Lấy các số để đánh theo phương pháp Streak Continuation
 * Dựa trên các chuỗi đang diễn ra trong quickStats
 * @param {Object} options - Các tùy chọn
 * @returns {Object} { toBet: number[], excluded: number[], streakInfo: object[] }
 */
async function getStreakContinuationNumbers(options = {}) {
    const { topCount = 30 } = options;

    try {
        // Lấy quickStats từ statisticsService
        const quickStats = await statisticsService.getQuickStats();

        if (!quickStats || Object.keys(quickStats).length === 0) {
            console.log('[Streak Continuation] Không có quickStats');
            return { toBet: [], excluded: Array.from({ length: 100 }, (_, i) => i), streakInfo: [] };
        }

        // Map điểm số cho mỗi số 0-99
        const scoreMap = new Map();
        for (let i = 0; i < 100; i++) {
            scoreMap.set(i, 0);
        }

        const streakInfo = [];

        // Duyệt qua tất cả các chuỗi đang diễn ra
        for (const key in quickStats) {
            const stat = quickStats[key];

            // Chỉ xét các chuỗi đang diễn ra (current !== null)
            if (!stat.current) continue;

            const currentLen = stat.current.length;
            const recordLen = stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0;
            const [category, subcategory] = key.split(':');

            // Lấy các số từ chuỗi này - wrap trong try-catch vì có thể lỗi
            let numbersFromStreak = [];
            try {
                numbersFromStreak = suggestionsController.predictNextInSequence(stat, category, subcategory);
            } catch (e) {
                // Bỏ qua nếu không thể lấy số
                continue;
            }

            if (!numbersFromStreak || !Array.isArray(numbersFromStreak) || numbersFromStreak.length === 0) {
                continue;
            }

            // Convert to numbers
            numbersFromStreak = numbersFromStreak.map(n => {
                if (typeof n === 'string') return parseInt(n, 10);
                return n;
            }).filter(n => !isNaN(n) && n >= 0 && n < 100);

            // Tính điểm dựa trên độ dài chuỗi và vị trí so với kỷ lục
            // Chuỗi dài hơn = khả năng tiếp tục cao hơn (theo momentum)
            // Nhưng nếu gần kỷ lục = khả năng dừng cao hơn

            let score = 0;

            // Điểm cơ bản theo độ dài chuỗi
            score += currentLen * 5;

            // Bonus nếu chuỗi còn xa kỷ lục (có room để tiếp tục)
            if (recordLen > 0) {
                const percentOfRecord = currentLen / recordLen;
                if (percentOfRecord < 0.5) {
                    // Còn xa kỷ lục - bonus cao
                    score += 15;
                } else if (percentOfRecord < 0.8) {
                    // Trung bình
                    score += 8;
                } else {
                    // Gần kỷ lục - giảm điểm (sắp dừng)
                    score -= 5;
                }
            }

            // Ghi nhận thông tin chuỗi
            streakInfo.push({
                key: key,
                category: category,
                subcategory: subcategory,
                currentLen: currentLen,
                recordLen: recordLen,
                numbers: numbersFromStreak,
                score: score
            });

            // Cộng điểm cho các số thuộc chuỗi này
            numbersFromStreak.forEach(num => {
                scoreMap.set(num, scoreMap.get(num) + score);
            });
        }

        // Sắp xếp theo điểm giảm dần
        const sortedNumbers = Array.from(scoreMap.entries())
            .sort((a, b) => b[1] - a[1])
            .filter(entry => entry[1] > 0) // Chỉ lấy số có điểm > 0
            .map(entry => entry[0]);

        // Tất cả số có thể tiếp tục (không giới hạn - dùng để loại trừ nếu cần)
        const allContinuationNumbers = sortedNumbers;

        // Top số có điểm cao nhất để đánh
        const toBet = sortedNumbers.slice(0, topCount);

        // Excluded = tất cả số không đánh
        const excluded = [];
        for (let i = 0; i < 100; i++) {
            if (!toBet.includes(i)) excluded.push(i);
        }

        console.log(`[Streak Continuation] Tìm được ${toBet.length} số đánh từ ${streakInfo.length} chuỗi đang diễn ra (tổng ${allContinuationNumbers.length} số có thể tiếp tục)`);

        return {
            toBet: toBet,
            excluded: excluded,
            streakInfo: streakInfo,
            allContinuationNumbers: allContinuationNumbers, // Tất cả số có thể tiếp tục
            scoreMap: Object.fromEntries(scoreMap) // Điểm của từng số
        };
    } catch (error) {
        console.error('[Streak Continuation] Lỗi:', error.message);
        return { toBet: [], excluded: Array.from({ length: 100 }, (_, i) => i), streakInfo: [], allContinuationNumbers: [] };
    }
}

module.exports = {
    getStreakContinuationNumbers
};
