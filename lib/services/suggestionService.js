const statisticsService = require('./statisticsService');
const { SETS } = require('../utils/numberAnalysis');

/**
 * Lấy ra bộ số (dàn số) tương ứng với một statName.
 * @param {string} statName - Tên của thống kê (ví dụ: 'chanLe:veLienTiep').
 * @returns {Array<string> | null} - Mảng các số thuộc dạng đó hoặc null.
 */
function getNumberSet(statName) {
    if (!statName) return null;
    const key = statName.toUpperCase().replace(/:/g, '_');
    return SETS[key] || null;
}

/**
 * Từ một chuỗi đang diễn ra, dự đoán các số cho ngày tiếp theo để "ôm" (đánh chặn).
 * @param {string} statName - Tên của thống kê.
 * @param {object} streakDetail - Chi tiết chuỗi.
 * @returns {Array<number>} - Các số dự đoán sẽ không về.
 */
function getNextNumbersFromStreak(statName, streakDetail) {
    if (!streakDetail || !streakDetail.values || streakDetail.values.length === 0) return [];
    
    const lastValue = streakDetail.values[streakDetail.values.length - 1];
    const lowerCaseStatName = statName.toLowerCase();

    // Đối với chuỗi 'một số về liên tiếp', số cần chặn chính là số đó
    if (lowerCaseStatName.includes('motsovelientiep')) {
        return [parseInt(lastValue, 10)];
    }

    // Đối với các dạng số, dạng đầu/đít, tổng, hiệu... bộ số cần chặn chính là bộ số của dạng đó
    const numberSet = getNumberSet(statName);
    if (numberSet) {
        return numberSet.map(n => parseInt(n, 10));
    }
    
    return [];
}


/**
 * Hàm chính để sinh ra tất cả các gợi ý, được thiết kế lại để tối đa hóa kết quả.
 */
async function generateSuggestions(recentStreaks, overallStats) {
    const suggestions = [];

    if (!overallStats) {
        return { numbersToBet: [], explanations: [] };
    }

    // --- Tạo một map để tra cứu chuỗi nóng nhanh hơn ---
    const hotStreaksMap = new Map();
    if (recentStreaks && recentStreaks.streaks) {
        Object.values(recentStreaks.streaks).flat().forEach(streak => {
            hotStreaksMap.set(streak.statName, streak);
        });
    }

    // --- Vòng lặp phân tích chính: Duyệt qua TẤT CẢ các dạng trong Thống kê Kỷ lục ---
    for (const statName in overallStats) {
        const stat = overallStats[statName];
        if (!stat || !stat.averageInterval || stat.daysSinceLast == null) continue;
        
        const avgInterval = parseFloat(stat.averageInterval);
        const daysSinceLast = stat.daysSinceLast;
        const hotStreak = hotStreaksMap.get(statName);
        const recordLength = (stat.longest && stat.longest.length > 0) ? stat.longest[0].length : 0;

        // --- Kịch bản 1: Phân tích các chuỗi đang "nóng" (HOT STREAKS) ---
        if (hotStreak) {
            const detail = hotStreak.details[0];
            const currentLength = detail.length;

            // Gợi ý NÊN ÔM: Chuỗi đã đạt kỷ lục và có khả năng gãy
            if (currentLength > 1 && currentLength === recordLength) {
                const numbers = getNextNumbersFromStreak(statName, detail);
                if (numbers.length > 0) {
                    suggestions.push({
                        title: `NÊN ÔM (Đạt Kỷ Lục): Dạng "${stat.description}"`,
                        explanation: `Chuỗi này đang "nóng" với độ dài ${currentLength} ngày, bằng với kỷ lục lịch sử. Thống kê cho thấy khi một chuỗi đạt đỉnh, khả năng nó gãy vào ngày tiếp theo là rất cao. Do đó, các số thuộc dạng này được dự đoán sẽ KHÔNG xuất hiện.`,
                        numbers: numbers,
                        type: 'bet-on' // Ôm vì dự đoán không về
                    });
                }
            }
             // Gợi ý NÊN ÔM: Chuỗi sắp đạt kỷ lục (còn cách 1 ngày)
            else if (currentLength > 1 && recordLength > 2 && currentLength === recordLength - 1) {
                 const numbers = getNextNumbersFromStreak(statName, detail);
                if (numbers.length > 0) {
                    suggestions.push({
                        title: `NÊN ÔM (Sắp Đạt Kỷ Lục): Dạng "${stat.description}"`,
                        explanation: `Chuỗi này đang "nóng" với độ dài ${currentLength} ngày và chỉ còn 1 ngày nữa là chạm kỷ lục (${recordLength} ngày). Đây là thời điểm nhạy cảm và khả năng chuỗi gãy là rất lớn. Các số thuộc dạng này được dự đoán sẽ KHÔNG xuất hiện.`,
                        numbers: numbers,
                        type: 'bet-on'
                    });
                }
            }
        }
        
        // --- Kịch bản 2: Phân tích các chuỗi đang "lạnh" (COLD STREAKS) ---
        // Điều kiện: Dạng số này vừa mới xuất hiện, sớm hơn nhiều so với chu kỳ trung bình của nó.
        // Logic này được áp dụng cho tất cả các dạng, dù nó có đang nóng hay không.
        if (daysSinceLast < (avgInterval * 0.7)) {
            const numbers = getNumberSet(statName); // Lấy cả bộ số của dạng đó
            if (numbers && numbers.length > 0) {
                 suggestions.push({
                    title: `NÊN ÔM (Tần Suất Thấp): Dạng "${stat.description}"`,
                    explanation: `Dạng này có chu kỳ xuất hiện trung bình là ${avgInterval.toFixed(1)} ngày, nhưng lần cuối chỉ mới ${daysSinceLast} ngày trước. Vì đang trong giai đoạn "lạnh" (về không đều, tần suất thấp), các số thuộc dạng này có khả năng KHÔNG xuất hiện hôm nay.`,
                    numbers: numbers.map(n => parseInt(n)),
                    type: 'bet-on'
                });
            }
        }

        // --- Kịch bản 3: Phân tích các chuỗi "Tới Hạn" (OVERDUE STREAKS) ---
        // Điều kiện: Đã quá lâu rồi dạng số này chưa xuất hiện trở lại.
        if (daysSinceLast > (avgInterval * 1.5) && avgInterval > 0) {
             const numbers = getNumberSet(statName);
             if (numbers && numbers.length > 0) {
                 suggestions.push({
                    title: `CÓ THỂ THEO (Tới Hạn): Dạng "${stat.description}"`,
                    explanation: `Dạng này có chu kỳ xuất hiện trung bình là ${avgInterval.toFixed(1)} ngày, nhưng đã ${daysSinceLast} ngày chưa về (quá 150% chu kỳ). Thống kê cho thấy dạng này có khả năng cao sẽ xuất hiện trở lại trong hôm nay hoặc vài ngày tới.`,
                    numbers: numbers.map(n => parseInt(n)),
                    type: 'bet-against' // Gợi ý này là để THEO, không phải để ÔM
                });
            }
        }
    }

    return consolidateSuggestions(suggestions);
}

/**
 * Tổng hợp và loại bỏ các gợi ý trùng lặp.
 */
function consolidateSuggestions(suggestions) {
    const consolidated = {
        numbersToBet: new Set(),
        explanations: []
    };

    const addedExplanations = new Set();

    for (const suggestion of suggestions) {
        // Chỉ thêm gợi ý nếu tiêu đề chưa tồn tại để tránh trùng lặp
        if (!addedExplanations.has(suggestion.title)) {
            // Chỉ thêm vào danh sách "ÔM" nếu gợi ý là "bet-on"
            if (suggestion.type === 'bet-on') {
                 suggestion.numbers.forEach(num => consolidated.numbersToBet.add(num));
            }
            consolidated.explanations.push({
                title: suggestion.title,
                explanation: suggestion.explanation,
                numbers: suggestion.numbers.sort((a, b) => a - b),
                type: suggestion.type
            });
            addedExplanations.add(suggestion.title);
        }
    }

    consolidated.numbersToBet = [...consolidated.numbersToBet].sort((a, b) => a - b);
    return consolidated;
}

module.exports = { generateSuggestions };