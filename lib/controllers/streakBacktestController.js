// controllers/streakBacktestController.js
// Controller cho trang backtest Streak Continuation

const streakBacktestService = require('../services/streakBacktestService');

/**
 * GET /api/streak-backtest
 * Chạy backtest và trả về kết quả
 */
async function getBacktestResults(req, res) {
    try {
        const days = parseInt(req.query.days) || 30;
        const results = await streakBacktestService.runBacktest(days);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getBacktestResults
};
