// services/scoringStatsGenerator.js (Đã tái cấu trúc để tìm kiếm từ cache)
const lotteryService = require('./lotteryService'); // Sử dụng service để lấy dữ liệu thô
const lotteryScoring = require('../utils/lotteryScoring');

const _formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
};

const _getNumbersByMode = (dayData, mode = 'de') => {
    if (!dayData) return [];
    if (mode === 'lo') {
        const { date, special, ...prizes } = dayData;
        return Object.values(prizes);
    }
    if (mode === 'de') {
        return dayData.special !== undefined ? [dayData.special] : [];
    }
    return [];
};

/**
 * [ĐÃ TÁI CẤU TRÚC] - Thực hiện tìm kiếm tùy chỉnh trực tiếp từ dữ liệu thô trong cache.
 * @param {object} options - Tùy chọn tìm kiếm từ request body
 * @returns {Promise<object>} - Kết quả tìm kiếm
 */
const performCustomSearch = async (options) => {
    const { startDate, endDate, mode, searchType, occurrenceCount, selectedForms } = options;

    // 1. Lấy toàn bộ dữ liệu thô từ cache
    let rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) {
        throw new Error("Dữ liệu thô chưa được nạp vào cache.");
    }

    // 2. Lọc dữ liệu theo khoảng ngày người dùng chọn
    const start = new Date(startDate);
    const end = new Date(endDate);
    const filteredRawData = rawData.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= start && entryDate <= end;
    });

    if (filteredRawData.length === 0) {
        return {
            results: [],
            message: 'Không có dữ liệu trong khoảng thời gian đã chọn.'
        };
    }

    // 3. Chuẩn hóa dữ liệu đã lọc để tính toán
    const processedData = filteredRawData.map(day => ({
        date: _formatDate(day.date),
        numbers: _getNumbersByMode(day, mode)
    }));

    let results = [];
    let message = '';

    // 4. Thực hiện tìm kiếm dựa trên loại đã chọn
    if (searchType === 'occurrence') {
        const targetOccurrence = parseInt(occurrenceCount, 10);
        if (isNaN(targetOccurrence)) {
            throw new Error('Số lần về không hợp lệ.');
        }
        
        const allScores = lotteryScoring.calculateAllLotteryScores(processedData);
        results = allScores.results.filter(r => r.occurrences === targetOccurrence);
        message = `Tìm thấy ${results.length} dạng số có ${targetOccurrence} lần về.`;

    } else if (searchType === 'forms') {
        if (!selectedForms || selectedForms.length === 0) {
            return { results: [], message: 'Vui lòng chọn ít nhất một dạng số.' };
        }
        
        selectedForms.forEach(formN => {
            const formResult = lotteryScoring.calculateLotteryScores(processedData, formN);
            if (formResult && formResult.results.length > 0) {
                results.push(...formResult.results);
            }
        });
        message = `Kết quả cho ${selectedForms.length} dạng số đã chọn.`;
    }

    // 5. Sắp xếp kết quả theo điểm số
    results.sort((a, b) => b.score - a.score);

    return {
        results,
        total: results.length,
        message,
        searchType
    };
};

// Hàm này không còn cần thiết trong luồng chính nữa, nhưng giữ lại để không gây lỗi nếu có nơi nào đó gọi đến.
const generateScoringStats = async () => {
    console.log('[ScoringGenerator] Chức năng tạo file JSON đã được thay thế bằng logic tính toán trực tiếp.');
};

module.exports = {
    generateScoringStats,
    performCustomSearch
};