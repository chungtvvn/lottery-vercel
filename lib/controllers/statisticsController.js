const statisticsService = require('../services/statisticsService');
const suggestionService = require('../services/suggestionService');

/**
 * Handler chung để lấy dữ liệu thống kê
 */
exports.getStats = async (req, res) => {
    try {
        // Lấy các tham số từ query string của URL
        // SỬA LỖI: Đổi tên 'minLength' thành 'exactLength' để khớp với yêu cầu từ client (HTML)
        const { category, subcategory, startDate, endDate, exactLength } = req.query;

        if (!category) {
            return res.status(400).json({ message: 'Thiếu tham số "category"' });
        }

        // Truyền đúng tham số 'exactLength' vào bộ lọc
        const filters = { startDate, endDate, minLength: exactLength };

        const results = await statisticsService.getFilteredStreaks(category, subcategory, filters);

        res.json(results);
    } catch (error) {
        console.error('Lỗi xử lý yêu cầu thống kê:', error);
        res.status(500).json({ message: "Lỗi máy chủ nội bộ" });
    }
};

/**
 * Handler để lấy dữ liệu cho phần "Thống kê kỷ lục"
 */
exports.getQuickStats = async (req, res) => {
    try {
        const results = await statisticsService.getQuickStats();
        res.json(results);
    } catch (error) {
        console.error('Lỗi khi lấy thống kê nhanh:', error);
        res.status(500).json({ message: "Lỗi máy chủ nội bộ" });
    }
};

exports.getSuggestions = async (req, res) => {
    try {
        // Chỉ cần lấy chuỗi nóng và thống kê tổng thể
        const recentStreaks = await statisticsService.getRecentStreaks();
        const overallStats = await statisticsService.getQuickStats();

        const suggestions = await suggestionService.generateSuggestions(recentStreaks, overallStats);
        res.json(suggestions);
    } catch (error) {
        console.error('Lỗi khi tạo gợi ý:', error);
        res.status(500).json({ message: "Lỗi máy chủ nội bộ khi tạo gợi ý" });
    }
};

exports.getQuickStatsHistory = async (req, res) => {
    try {
        const results = await statisticsService.getQuickStatsHistory();
        res.json(results);
    } catch (error) {
        console.error('Lỗi khi lấy lịch sử thống kê nhanh:', error);
        res.status(500).json({ message: "Lỗi máy chủ nội bộ" });
    }
};

exports.getRecentLotteryResults = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 7;
        const results = await statisticsService.getRecentResults(limit);
        res.json(results);
    } catch (error) {
        console.error('Lỗi khi lấy kết quả xổ số gần đây:', error);
        res.status(500).json({ message: "Lỗi máy chủ nội bộ" });
    }
};

/**
 * Handler để lấy thông tin về Potential Streaks (Chuỗi có thể xảy ra)
 */
exports.getPotentialStreaks = async (req, res) => {
    try {
        const potentialStreakService = require('../services/potentialStreakService');

        // Lấy số mới nhất từ database
        const recentResults = await statisticsService.getRecentResults(1);
        if (!recentResults || recentResults.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy kết quả xổ số' });
        }

        const latestNumber = String(recentResults[0].special).padStart(2, '0');

        // Phân tích potential streaks
        const result = await potentialStreakService.getPotentialStreakExclusions(latestNumber);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Lỗi khi phân tích potential streaks:', error);
        res.status(500).json({
            success: false,
            message: "Lỗi máy chủ nội bộ khi phân tích potential streaks",
            error: error.message
        });
    }
};