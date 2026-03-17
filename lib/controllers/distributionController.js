/**
 * Distribution Analysis Controller
 * API endpoints cho phân tích phân bổ và dự đoán trực quan
 */

const distributionService = require('../services/distributionAnalysisService');
const predictionCache = require('../services/predictionCacheService');
const unifiedPrediction = require('../services/unifiedPredictionService');
const advancedAnalysis = require('../services/advancedAnalysisService');
const hybridAIPrediction = require('../services/hybridAIPredictionService');
const lotteryService = require('../services/lotteryService');

/**
 * GET /api/distribution/all
 * Lấy tất cả phân bổ cho dashboard
 */
async function getAllDistributions(req, res) {
    try {
        const distributions = await distributionService.getAllDistributions();
        res.json({
            success: true,
            data: distributions
        });
    } catch (error) {
        console.error('[Distribution API] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/distribution/category/:category
 * Lấy phân bổ cho một category cụ thể
 */
async function getCategoryDistribution(req, res) {
    try {
        const { category } = req.params;
        const data = await distributionService.loadLotteryData();
        const distribution = distributionService.calculateDistribution(data, category);

        if (!distribution) {
            return res.status(404).json({
                success: false,
                error: 'Category not found'
            });
        }

        distribution.trends = distributionService.calculateTrends(distribution);

        res.json({
            success: true,
            data: distribution
        });
    } catch (error) {
        console.error('[Distribution API] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/distribution/heatmap
 * Lấy heatmap data cho số 00-99
 */
async function getNumberHeatmap(req, res) {
    try {
        const heatmapData = await distributionService.generateNumberHeatmap();
        res.json({
            success: true,
            data: heatmapData
        });
    } catch (error) {
        console.error('[Distribution API] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/distribution/predictions
 * Lấy các số có khả năng xuất hiện cao
 */
async function getPredictions(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const candidates = await distributionService.getPredictionCandidates();

        res.json({
            success: true,
            data: {
                topCandidates: candidates.slice(0, limit),
                breakingRecords: candidates.filter(c => c.breakingRecord),
                allCandidates: candidates
            }
        });
    } catch (error) {
        console.error('[Distribution API] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * GET /api/distribution/categories
 * Lấy danh sách các categories có sẵn
 */
function getCategories(req, res) {
    const categories = Object.entries(distributionService.CATEGORY_DEFINITIONS).map(([key, def]) => ({
        key,
        name: def.name,
        valuesCount: def.values.length
    }));

    res.json({
        success: true,
        data: categories
    });
}

/**
 * GET /api/distribution/cached-predictions
 * Lấy predictions từ cache (đã tính toán trước)
 * Tối ưu performance - không cần tính toán lại mỗi lần
 */
async function getCachedPredictions(req, res) {
    try {
        // Lấy data date hiện tại
        const rawData = lotteryService.getRawData();
        const currentDataDate = rawData && rawData.length > 0
            ? rawData[rawData.length - 1].date.substring(0, 10)
            : null;

        // Load cache nếu chưa load
        if (!predictionCache.initialized) {
            await predictionCache.loadCache();
        }

        // Kiểm tra cache có hợp lệ không
        if (predictionCache.isValid(currentDataDate)) {
            console.log('[Distribution API] Returning cached predictions');
            return res.json({
                success: true,
                cached: true,
                data: predictionCache.getAll()
            });
        }

        // Cache không hợp lệ, cần tính toán lại
        console.log('[Distribution API] Cache invalid, regenerating...');

        // Tính toán song song tất cả predictions
        const [unifiedResult, advancedResult, hybridResult] = await Promise.all([
            unifiedPrediction.getDailyPrediction({ topCount: 40 }),
            advancedAnalysis.getDailyAdvancedPrediction({ topCount: 40, excludeCount: 60 }),
            hybridAIPrediction.getHybridPrediction({ topCount: 40, excludeCount: 60 })
        ]);

        const predictions = {
            unified: unifiedResult,
            advanced: {
                predictions: advancedResult.predictions,
                exclusions: advancedResult.exclusions,
                allNumbers: advancedResult.allNumbers
            },
            hybrid: hybridResult
        };

        // Lưu vào cache
        await predictionCache.updateAll(predictions, currentDataDate);

        res.json({
            success: true,
            cached: false,
            data: predictionCache.getAll()
        });
    } catch (error) {
        console.error('[Distribution API] Error getting cached predictions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

module.exports = {
    getAllDistributions,
    getCategoryDistribution,
    getNumberHeatmap,
    getPredictions,
    getCategories,
    getCachedPredictions
};
