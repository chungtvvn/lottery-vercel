// services/scoringService.js (Đã sửa lỗi ngày bắt đầu)
const lotteryService = require('./lotteryService');
const lotteryScoring = require('../utils/lotteryScoring');

let scoringCache = null;

const _formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
};

const loadScoringStatistics = async () => {
    try {
        console.log('[ScoringService] Bắt đầu quy trình tính toán và nạp cache điểm...');
        
        let rawData = lotteryService.getRawData();
        if (!rawData || rawData.length === 0) {
            await lotteryService.loadRawData();
            rawData = lotteryService.getRawData();
        }

        if (!rawData || rawData.length === 0) {
            throw new Error('Không có dữ liệu xổ số thô để thực hiện tính toán.');
        }

        // ====> SỬA LỖI LOGIC NGÀY BẮT ĐẦU TẠI ĐÂY <====
        const currentYear = new Date().getFullYear();
        const startDateObj = new Date(`${currentYear}-01-01`);

        const filteredData = rawData.filter(entry => new Date(entry.date) >= startDateObj);
        
        if (filteredData.length === 0) {
            throw new Error(`Không có dữ liệu cho năm ${currentYear}.`);
        }

        // Sử dụng startDateObj đã định nghĩa thay vì lấy từ dữ liệu đã lọc
        const startDate = startDateObj.toISOString(); 
        const endDate = filteredData[filteredData.length - 1].date;
        const mode = 'de';
        // ====> KẾT THÚC SỬA LỖI <====

        const processedData = filteredData.map(day => ({
            date: _formatDate(day.date),
            numbers: day.special !== undefined ? [day.special] : []
        }));

        const { results } = lotteryScoring.calculateAggregateScoreForAllNumbers(processedData);

        if (!results) {
             throw new Error('Quá trình tính điểm không trả về kết quả.');
        }

        results.forEach(result => {
            const scoreRatio = parseFloat(result.scoreRatio) / 100;
            if (scoreRatio >= 0.8) { result.statusClass = 'bg-green-500'; }
            else if (scoreRatio >= 0.6) { result.statusClass = 'bg-blue-500'; }
            else if (scoreRatio >= 0.4) { result.statusClass = 'bg-gray-500'; }
            else if (scoreRatio >= 0.2) { result.statusClass = 'bg-yellow-500 text-black'; }
            else { result.statusClass = 'bg-red-500'; }
        });

        scoringCache = {
            aggStartDate: _formatDate(startDate),
            aggEndDate: _formatDate(endDate),
            aggMode: mode.toUpperCase(),
            results,
            scoringForms: lotteryScoring.scoringForms,
            lastUpdated: new Date().toISOString()
        };

        console.log(`✅ [ScoringService] Dữ liệu điểm cho ${filteredData.length} ngày trong năm ${currentYear} đã được nạp.`);
    } catch (error) {
        console.error(`❌ [ScoringService] Lỗi khi nạp thống kê điểm vào cache:`, error);
        scoringCache = null;
    }
};

const getScoringStats = async () => {
    if (!scoringCache) {
        console.log('[ScoringService] Cache trống, đang kích hoạt nạp lại...');
        await loadScoringStatistics();
    }
    return scoringCache;
};

const clearCache = () => {
    scoringCache = null;
    console.log('[ScoringService] Cache điểm đã được xóa.');
};

module.exports = {
    loadScoringStatistics,
    getScoringStats,
    clearCache
};