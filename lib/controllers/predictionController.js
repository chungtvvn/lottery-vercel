/**
 * Unified Prediction Controller
 * API endpoints cho hệ thống dự đoán kết hợp
 */

const unifiedPrediction = require('../services/unifiedPredictionService');
const advancedAnalysis = require('../services/advancedAnalysisService');

/**
 * GET /api/prediction/daily
 * Lấy dự đoán hàng ngày kết hợp tất cả phương pháp
 */
async function getDailyPrediction(req, res) {
    try {
        const targetDate = req.query.date;
        const prediction = await unifiedPrediction.getDailyPrediction({ targetDate });

        res.json({
            success: true,
            data: prediction
        });
    } catch (error) {
        console.error('[Unified Prediction API] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/prediction/advanced
 * Lấy dự đoán từ 13 phương pháp nâng cao
 */
async function getAdvancedPrediction(req, res) {
    try {
        const topCount = parseInt(req.query.top) || 40;
        const excludeCount = parseInt(req.query.exclude) || 60;

        const prediction = await advancedAnalysis.getDailyAdvancedPrediction({
            topCount,
            excludeCount
        });

        res.json({
            success: true,
            data: prediction
        });
    } catch (error) {
        console.error('[Advanced Prediction API] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/prediction/yearly-comparison
 * So sánh xu hướng các năm
 */
async function getYearlyComparison(req, res) {
    try {
        const comparison = await unifiedPrediction.getYearComparison();

        res.json({
            success: true,
            data: comparison
        });
    } catch (error) {
        console.error('[Unified Prediction API] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * POST /api/prediction/evaluate
 * Đánh giá độ chính xác của dự đoán
 */
async function evaluatePrediction(req, res) {
    try {
        const { date, actualNumber } = req.body;

        if (!date || !actualNumber) {
            return res.status(400).json({
                success: false,
                error: 'Cần date và actualNumber'
            });
        }

        const evaluation = await unifiedPrediction.evaluatePredictionAccuracy(date, actualNumber);

        res.json({
            success: true,
            data: evaluation
        });
    } catch (error) {
        console.error('[Unified Prediction API] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/prediction/ai-prompt
 * Lấy prompt để sử dụng với AI (ChatGPT/Claude)
 */
async function getAIPrompt(req, res) {
    try {
        const prompt = await unifiedPrediction.generateAIAnalysisPrompt();

        res.json({
            success: true,
            data: {
                prompt,
                instruction: 'Copy prompt này và paste vào ChatGPT hoặc Claude để nhận phân tích AI'
            }
        });
    } catch (error) {
        console.error('[Unified Prediction API] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/prediction/config
 * Lấy cấu hình dự đoán hiện tại
 */
function getConfig(req, res) {
    res.json({
        success: true,
        data: unifiedPrediction.CONFIG
    });
}

/**
 * GET /api/prediction/number/:number
 * Lấy giải thích chi tiết cho một số cụ thể
 */
async function getNumberDetail(req, res) {
    try {
        const { number } = req.params;

        if (!number || isNaN(parseInt(number))) {
            return res.status(400).json({
                success: false,
                error: 'Số không hợp lệ'
            });
        }

        const detail = await unifiedPrediction.getNumberDetailedExplanation(number);

        res.json({
            success: true,
            data: detail
        });
    } catch (error) {
        console.error('[Unified Prediction API] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    getDailyPrediction,
    getAdvancedPrediction,
    getYearlyComparison,
    evaluatePrediction,
    getAIPrompt,
    getConfig,
    getNumberDetail
};
