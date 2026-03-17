/**
 * Unified Prediction Service
 * Kết hợp TẤT CẢ các phương pháp phân tích để đưa ra dự đoán hàng ngày
 * 
 * Phương pháp bao gồm:
 * 1. Distribution Analysis - Phân tích phân bổ và gap
 * 2. Streak Analysis - Phân tích chuỗi đang diễn ra
 * 3. Exclusion Logic - Logic loại trừ với confidence score
 * 4. Year-over-Year Comparison - So sánh xu hướng theo năm
 * 5. Day-of-Week/Month Pattern - Mẫu theo thứ/ngày trong tháng
 * 6. AI/ML Analysis - Phân tích bằng AI (optional)
 */

const fs = require('fs').promises;
const path = require('path');
const distributionService = require('./distributionAnalysisService');
const statisticsService = require('./statisticsService');
const exclusionLogic = require('./exclusionLogicService');
const advancedAnalysis = require('./advancedAnalysisService');

// ============ CONFIGURATION ============
const CONFIG = {
    // Weights for combining methods (total = 1.0)
    WEIGHTS: {
        DISTRIBUTION: 0.20,      // Gap và tần suất
        STREAK: 0.25,            // Chuỗi đang diễn ra
        EXCLUSION: 0.20,         // Logic loại trừ
        YEARLY_TREND: 0.15,      // Xu hướng theo năm
        DAY_PATTERN: 0.10,       // Mẫu theo thứ/ngày
        RECENT_HISTORY: 0.10     // Lịch sử gần đây
    },

    // Prediction thresholds
    THRESHOLDS: {
        HOT: 0.7,                // Số "nóng" - khả năng cao
        WARM: 0.5,               // Số "ấm" - khả năng trung bình
        COLD: 0.3                // Số "lạnh" - khả năng thấp
    },

    // Number of predictions to return
    TOP_PREDICTIONS: 20,
    TOP_EXCLUSIONS: 60
};

// ============ HELPER FUNCTIONS ============

/**
 * Get day of week and day of month for a date
 */
function getDayInfo(dateStr) {
    const [d, m, y] = dateStr.split('/').map(Number);
    const date = new Date(y, m - 1, d);
    return {
        dayOfWeek: date.getDay(), // 0 = Sunday
        dayOfMonth: d,
        month: m,
        year: y,
        weekOfMonth: Math.ceil(d / 7)
    };
}

/**
 * Normalize scores to 0-1 range
 */
function normalizeScores(scores) {
    const values = Object.values(scores);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const normalized = {};
    for (const [num, score] of Object.entries(scores)) {
        normalized[num] = (score - min) / range;
    }
    return normalized;
}

// ============ METHOD 1: DISTRIBUTION ANALYSIS ============

async function getDistributionScores() {
    const predictions = await distributionService.getPredictionCandidates();
    const scores = {};

    // Initialize all 100 numbers
    for (let i = 0; i < 100; i++) {
        scores[String(i).padStart(2, '0')] = 0;
    }

    // Convert prediction scores to 0-1 range
    predictions.forEach(p => {
        scores[p.number] = p.predictionScore / 100;
    });

    return scores;
}

// ============ METHOD 2: STREAK ANALYSIS ============

async function getStreakScores() {
    const quickStats = await statisticsService.getQuickStats();
    const scores = {};

    // Initialize all 100 numbers
    for (let i = 0; i < 100; i++) {
        scores[String(i).padStart(2, '0')] = 0.5; // Neutral score
    }

    // Analyze current streaks
    for (const [key, stat] of Object.entries(quickStats)) {
        if (!stat.current) continue;

        const currentLen = stat.current.length;
        const recordLen = stat.longest?.[0]?.length || 1;

        // Calculate streak intensity (how close to record)
        const intensity = currentLen / recordLen;

        // Get numbers from the streak
        const numbers = extractNumbersFromStat(key, stat);

        // High intensity = more likely to end (exclusion)
        // So we DECREASE score for these numbers
        numbers.forEach(num => {
            const decrease = intensity * 0.3; // Max 30% decrease for record-breaking streaks
            scores[num] = Math.max(0, (scores[num] || 0.5) - decrease);
        });
    }

    return scores;
}

/**
 * Extract affected numbers from a stat key
 */
function extractNumbersFromStat(key, stat) {
    const numbers = [];

    // Try to extract from fullSequence or numbers property
    if (stat.current?.fullSequence) {
        stat.current.fullSequence.forEach(item => {
            if (item.value) {
                numbers.push(String(item.value).padStart(2, '0'));
            }
        });
    }

    if (stat.numbers) {
        stat.numbers.forEach(n => numbers.push(String(n).padStart(2, '0')));
    }

    return [...new Set(numbers)];
}

// ============ METHOD 3: EXCLUSION LOGIC ============

async function getExclusionScores() {
    const quickStats = await statisticsService.getQuickStats();
    const exclusions = await exclusionLogic.getUnifiedExclusions(quickStats, {});

    const scores = {};

    // Initialize all 100 numbers with high score
    for (let i = 0; i < 100; i++) {
        scores[String(i).padStart(2, '0')] = 0.7; // Default: relatively high chance
    }

    // Excluded numbers get lower scores
    if (exclusions.excludedNumbers) {
        exclusions.excludedNumbers.forEach(num => {
            const numStr = String(num).padStart(2, '0');
            scores[numStr] = 0.2; // Low chance for excluded numbers
        });
    }

    return { scores, explanations: exclusions.explanations };
}

// ============ METHOD 4: ROLLING 360-DAY TREND ANALYSIS ============
// Sử dụng 360 ngày gần nhất thay vì năm cố định để dự đoán chính xác hơn

async function getYearlyTrendScores(targetDate = null) {
    const data = await distributionService.loadLotteryData();

    const scores = {};
    const ROLLING_DAYS = 360;
    const EXPECTED_PER_360_DAYS = 360 / 100; // Mỗi số kỳ vọng xuất hiện 3.6 lần trong 360 ngày

    // Lấy 360 ngày gần nhất
    const recentData = data.slice(-ROLLING_DAYS);

    // Đếm số lần xuất hiện của mỗi số trong 360 ngày gần nhất
    const countIn360Days = {};
    for (let i = 0; i < 100; i++) {
        countIn360Days[String(i).padStart(2, '0')] = 0;
    }

    recentData.forEach(item => {
        countIn360Days[item.value]++;
    });

    // Tính điểm dựa trên độ lệch so với kỳ vọng
    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const actualCount = countIn360Days[num];
        const deviation = (actualCount - EXPECTED_PER_360_DAYS) / EXPECTED_PER_360_DAYS;

        // Nếu xuất hiện ít hơn kỳ vọng -> điểm cao (đang "nợ")
        // Nếu xuất hiện nhiều hơn kỳ vọng -> điểm thấp (đã "thừa")
        let score = 0.5;
        if (actualCount < EXPECTED_PER_360_DAYS * 0.7) {
            // Xuất hiện < 70% kỳ vọng -> điểm cao
            score = 0.7 + Math.min(0.3, (1 - actualCount / EXPECTED_PER_360_DAYS) * 0.5);
        } else if (actualCount < EXPECTED_PER_360_DAYS * 0.9) {
            // Xuất hiện 70-90% kỳ vọng -> điểm khá
            score = 0.6;
        } else if (actualCount > EXPECTED_PER_360_DAYS * 1.3) {
            // Xuất hiện > 130% kỳ vọng -> điểm thấp
            score = 0.3;
        } else if (actualCount > EXPECTED_PER_360_DAYS * 1.1) {
            // Xuất hiện 110-130% kỳ vọng -> điểm hơi thấp
            score = 0.4;
        }

        scores[num] = Math.min(1, Math.max(0, score));
    }

    return scores;
}

// ============ METHOD 5: DAY PATTERN ANALYSIS ============

async function getDayPatternScores(targetDate = null) {
    const data = await distributionService.loadLotteryData();
    const dayInfo = targetDate ? getDayInfo(targetDate) : getDayInfo(formatCurrentDate());

    const scores = {};
    const dayOfWeekCounts = {};
    const dayOfMonthCounts = {};

    // Initialize
    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        dayOfWeekCounts[num] = Array(7).fill(0);
        dayOfMonthCounts[num] = {};
    }

    // Count occurrences by day of week and day of month
    data.forEach(item => {
        const itemDayInfo = getDayInfo(item.date);
        const num = item.value;

        dayOfWeekCounts[num][itemDayInfo.dayOfWeek]++;

        if (!dayOfMonthCounts[num][itemDayInfo.dayOfMonth]) {
            dayOfMonthCounts[num][itemDayInfo.dayOfMonth] = 0;
        }
        dayOfMonthCounts[num][itemDayInfo.dayOfMonth]++;
    });

    // Calculate scores based on patterns
    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');

        // Day of week score
        const totalDayOfWeek = dayOfWeekCounts[num].reduce((a, b) => a + b, 0);
        const avgDayOfWeek = totalDayOfWeek / 7;
        const todayDayOfWeekCount = dayOfWeekCounts[num][dayInfo.dayOfWeek];
        const dowScore = todayDayOfWeekCount / (avgDayOfWeek || 1);

        // Day of month score
        const totalDayOfMonth = Object.values(dayOfMonthCounts[num]).reduce((a, b) => a + b, 0);
        const avgDayOfMonth = totalDayOfMonth / 31;
        const todayDayOfMonthCount = dayOfMonthCounts[num][dayInfo.dayOfMonth] || 0;
        const domScore = todayDayOfMonthCount / (avgDayOfMonth || 1);

        // Combined pattern score
        scores[num] = Math.min(1, (dowScore * 0.6 + domScore * 0.4) / 2);
    }

    return normalizeScores(scores);
}

function formatCurrentDate() {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}

// ============ METHOD 6: RECENT HISTORY ============

async function getRecentHistoryScores(lookbackDays = 30) {
    const data = await distributionService.loadLotteryData();
    const recentData = data.slice(-lookbackDays);

    const scores = {};
    const recentCounts = {};

    // Initialize
    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        recentCounts[num] = 0;
    }

    // Count recent occurrences
    recentData.forEach(item => {
        recentCounts[item.value]++;
    });

    // Numbers that appeared less recently have higher scores
    const maxCount = Math.max(...Object.values(recentCounts));
    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        scores[num] = 1 - (recentCounts[num] / (maxCount || 1));
    }

    return scores;
}

// ============ COMBINED PREDICTION ============

/**
 * Get comprehensive daily prediction combining ALL methods
 */
async function getDailyPrediction(options = {}) {
    const targetDate = options.targetDate || formatCurrentDate();
    const weights = options.weights || CONFIG.WEIGHTS;

    console.log(`[Unified Prediction] Generating prediction for ${targetDate}...`);

    // Get scores from all methods in parallel
    const [
        distributionScores,
        streakScores,
        exclusionResult,
        yearlyScores,
        dayPatternScores,
        recentScores
    ] = await Promise.all([
        getDistributionScores(),
        getStreakScores(),
        getExclusionScores(), // Now we will make this return { scores, explanations }
        getYearlyTrendScores(targetDate),
        getDayPatternScores(targetDate),
        getRecentHistoryScores()
    ]);

    const exclusionScores = exclusionResult.scores || exclusionResult;
    const explanations = exclusionResult.explanations || [];

    // Combine scores with weights
    const combinedScores = {};
    const methodScores = {};

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');

        const distribution = distributionScores[num] || 0;
        const streak = streakScores[num] || 0.5;
        const exclusion = exclusionScores[num] || 0.5;
        const yearly = yearlyScores[num] || 0.5;
        const dayPattern = dayPatternScores[num] || 0.5;
        const recent = recentScores[num] || 0.5;

        combinedScores[num] =
            distribution * weights.DISTRIBUTION +
            streak * weights.STREAK +
            exclusion * weights.EXCLUSION +
            yearly * weights.YEARLY_TREND +
            dayPattern * weights.DAY_PATTERN +
            recent * weights.RECENT_HISTORY;

        methodScores[num] = {
            distribution,
            streak,
            exclusion,
            yearly,
            dayPattern,
            recent
        };
    }

    // Sort and categorize
    const sortedNumbers = Object.entries(combinedScores)
        .sort((a, b) => b[1] - a[1])
        .map(([num, score]) => ({
            number: num,
            score: Math.round(score * 100) / 100,
            category: getCategoryFromScore(score),
            methods: methodScores[num]
        }));

    // Prepare result
    const result = {
        date: targetDate,
        generatedAt: new Date().toISOString(),

        // Top predictions (numbers to BET)
        predictions: sortedNumbers.slice(0, CONFIG.TOP_PREDICTIONS),

        // Top exclusions (numbers to AVOID)
        exclusions: sortedNumbers.slice(-CONFIG.TOP_EXCLUSIONS).reverse(),

        // Include explanations for exclusions
        explanations: explanations,

        // All numbers with scores
        allNumbers: sortedNumbers,

        // Summary statistics
        summary: generateSummary(sortedNumbers),

        // Method weights used
        weights
    };

    return result;
}

function getCategoryFromScore(score) {
    if (score >= CONFIG.THRESHOLDS.HOT) return 'hot';
    if (score >= CONFIG.THRESHOLDS.WARM) return 'warm';
    if (score >= CONFIG.THRESHOLDS.COLD) return 'cold';
    return 'frozen';
}

function generateSummary(sortedNumbers) {
    const hot = sortedNumbers.filter(n => n.category === 'hot');
    const warm = sortedNumbers.filter(n => n.category === 'warm');
    const cold = sortedNumbers.filter(n => n.category === 'cold');
    const frozen = sortedNumbers.filter(n => n.category === 'frozen');

    return {
        totalNumbers: 100,
        hotCount: hot.length,
        warmCount: warm.length,
        coldCount: cold.length,
        frozenCount: frozen.length,
        topHotNumbers: hot.slice(0, 10).map(n => n.number),
        topFrozenNumbers: frozen.slice(-10).map(n => n.number),
        averageScore: sortedNumbers.reduce((sum, n) => sum + n.score, 0) / 100
    };
}

// ============ YEAR-OVER-YEAR COMPARISON ============

/**
 * Compare current trends with historical years
 */
async function getYearComparison() {
    const distributions = await distributionService.getAllDistributions();
    const heatmap = await distributionService.generateNumberHeatmap();

    const years = heatmap.years.sort();
    const currentYear = years[years.length - 1];
    const comparison = [];

    // For each number, compare across years
    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const yearlyData = {};
        let totalCount = 0;

        years.forEach(year => {
            const count = heatmap.yearlyHeatmap[year]?.[num] || 0;
            yearlyData[year] = count;
            totalCount += count;
        });

        const avgPerYear = totalCount / years.length;
        const currentYearCount = yearlyData[currentYear] || 0;
        const deviation = ((currentYearCount - avgPerYear) / avgPerYear * 100).toFixed(1);

        // Find best and worst years
        const sortedYears = Object.entries(yearlyData).sort((a, b) => b[1] - a[1]);

        comparison.push({
            number: num,
            totalCount,
            avgPerYear: Math.round(avgPerYear * 10) / 10,
            currentYear: currentYearCount,
            deviation: parseFloat(deviation),
            trend: currentYearCount > avgPerYear ? 'up' : currentYearCount < avgPerYear ? 'down' : 'stable',
            bestYear: { year: sortedYears[0][0], count: sortedYears[0][1] },
            worstYear: { year: sortedYears[sortedYears.length - 1][0], count: sortedYears[sortedYears.length - 1][1] },
            yearlyData
        });
    }

    return {
        years,
        currentYear,
        comparison: comparison.sort((a, b) => a.deviation - b.deviation), // Sort by deviation (lowest first = most overdue)
        averages: {
            expectedPerNumber: heatmap.totalDays / 100 / years.length
        }
    };
}

// ============ HISTORICAL ACCURACY TRACKING ============

/**
 * Track prediction accuracy for improvement
 */
async function evaluatePredictionAccuracy(predictionDate, actualNumber) {
    const prediction = await getDailyPrediction({ targetDate: predictionDate });

    const predictedRank = prediction.allNumbers.findIndex(n => n.number === actualNumber) + 1;
    const isInTop10 = predictedRank <= 10;
    const isInTop20 = predictedRank <= 20;
    const isExcluded = prediction.exclusions.some(n => n.number === actualNumber);

    return {
        date: predictionDate,
        actualNumber,
        predictedRank,
        isInTop10,
        isInTop20,
        isExcluded,
        success: isInTop20 && !isExcluded,
        score: prediction.allNumbers.find(n => n.number === actualNumber)?.score || 0
    };
}

// ============ AI INTEGRATION PLACEHOLDER ============

/**
 * AI-enhanced prediction (placeholder for future integration)
 * Can integrate with OpenAI, local models, etc.
 */
async function getAIPrediction(options = {}) {
    // This is a placeholder for AI integration
    // In production, this could:
    // 1. Send historical data to GPT-4 for pattern analysis
    // 2. Use a trained local ML model
    // 3. Integrate with external prediction APIs

    const basePrediction = await getDailyPrediction(options);

    // For now, return base prediction with AI flag
    return {
        ...basePrediction,
        aiEnhanced: false,
        aiNote: 'AI integration cần API key. Có thể tích hợp OpenAI GPT-4 hoặc local model.'
    };
}

/**
 * Generate AI analysis prompt (for manual use with ChatGPT/Claude)
 */
async function generateAIAnalysisPrompt() {
    const yearComparison = await getYearComparison();
    const distributions = await distributionService.getAllDistributions();
    const prediction = await getDailyPrediction();

    const prompt = `
Phân tích xổ số XSMB (2 số cuối đặc biệt):

📊 DỮ LIỆU PHÂN BỔ:
- Tổng số ngày dữ liệu: ${yearComparison.years.length} năm
- Trung bình mỗi số xuất hiện: ${yearComparison.averages.expectedPerNumber.toFixed(1)} lần/năm

📉 TOP 10 SỐ ĐANG "NỢ" (xuất hiện ít hơn trung bình):
${yearComparison.comparison.slice(0, 10).map((n, i) =>
        `${i + 1}. Số ${n.number}: ${n.deviation}% so với TB (${n.currentYear}/${n.avgPerYear.toFixed(1)} lần)`
    ).join('\n')}

📈 TOP 10 SỐ ĐANG "THỪA" (xuất hiện nhiều hơn trung bình):
${yearComparison.comparison.slice(-10).reverse().map((n, i) =>
        `${i + 1}. Số ${n.number}: +${n.deviation}% so với TB (${n.currentYear}/${n.avgPerYear.toFixed(1)} lần)`
    ).join('\n')}

🎯 DỰ ĐOÁN HIỆN TẠI (Top 10):
${prediction.predictions.slice(0, 10).map((n, i) =>
        `${i + 1}. Số ${n.number}: Score ${n.score} (${n.category})`
    ).join('\n')}

🚫 LOẠI TRỪ (Top 10):
${prediction.exclusions.slice(0, 10).map((n, i) =>
        `${i + 1}. Số ${n.number}: Score ${n.score}`
    ).join('\n')}

Hãy phân tích và đưa ra:
1. Nhận xét về xu hướng phân bổ
2. Top 10 số khuyên NÊN đánh
3. Top 10 số khuyên NÊN loại trừ
4. Lý do cho mỗi gợi ý
`;

    return prompt;
}

module.exports = {
    getDailyPrediction,
    getYearComparison,
    evaluatePredictionAccuracy,
    getAIPrediction,
    generateAIAnalysisPrompt,
    getNumberDetailedExplanation,
    CONFIG
};

/**
 * Get extremely detailed explanation for a specific number
 * Giải thích chi tiết từng phương pháp một cách dễ hiểu
 */
async function getNumberDetailedExplanation(number) {
    const num = String(number).padStart(2, '0');

    // Get raw data for detailed explanation
    const data = await distributionService.loadLotteryData();
    const heatmap = await distributionService.generateNumberHeatmap();
    const predictions = await distributionService.getPredictionCandidates();
    const quickStats = await statisticsService.getQuickStats();
    const exclusions = await exclusionLogic.getUnifiedExclusions(quickStats, {});

    const dayInfo = getDayInfo(formatCurrentDate());
    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

    // ============ METHOD 1: DISTRIBUTION ============
    const numHeatmap = heatmap.heatmap[num];
    const numPrediction = predictions.find(p => p.number === num) || {};

    const avgGap = parseFloat(numHeatmap.avgGap) || 100;
    const currentGap = numHeatmap.currentGap || 0;
    const maxGap = numHeatmap.maxGap || avgGap;
    const gapRatio = currentGap / avgGap;

    const distScore = (numPrediction.predictionScore || 0) / 100; // Normalize to 0-1 range

    const distributionExplanation = {
        score: distScore, // 0-1 range for consistency with other methods
        rawScore: numPrediction.predictionScore || 0, // Original 0-100 score for display
        details: {
            totalAppearances: numHeatmap.count,
            percentage: numHeatmap.percentage,
            currentGap: currentGap,
            avgGap: avgGap,
            minGap: numHeatmap.minGap,
            maxGap: maxGap,
            gapRatio: gapRatio.toFixed(2)
        },
        interpretation: getDistributionInterpretation(currentGap, avgGap, maxGap, numHeatmap.count),
        formula: `Điểm = (Gap hiện tại / Gap TB) × 40% + (Gần phá kỷ lục) × 30% + (Tần suất thấp) × 30%`
    };

    // ============ METHOD 2: STREAK ============
    let streakScore = 0.5;
    let affectedStreaks = [];

    for (const [key, stat] of Object.entries(quickStats)) {
        if (!stat.current) continue;

        const numbers = extractNumbersFromStat(key, stat);
        if (numbers.includes(num)) {
            const currentLen = stat.current.length;
            const recordLen = stat.longest?.[0]?.length || 1;
            const intensity = currentLen / recordLen;

            affectedStreaks.push({
                pattern: stat.description || key,
                currentLength: currentLen,
                recordLength: recordLen,
                intensity: (intensity * 100).toFixed(0),
                impact: intensity > 0.8 ? 'Rất cao' : intensity > 0.5 ? 'Cao' : 'Trung bình'
            });

            streakScore = Math.max(0, streakScore - intensity * 0.3);
        }
    }

    const streakExplanation = {
        score: streakScore,
        affectedBy: affectedStreaks.length,
        streaks: affectedStreaks,
        interpretation: getStreakInterpretation(affectedStreaks),
        formula: `Điểm cơ sở = 0.5. Nếu số thuộc chuỗi đang diễn ra: Điểm -= (Độ dài hiện tại / Kỷ lục) × 0.3`
    };

    // ============ METHOD 3: EXCLUSION ============
    const isExcluded = exclusions.excludedNumbers?.has(parseInt(num)) ||
        exclusions.excludedNumbers?.has(num);

    const exclusionExplanation = {
        score: isExcluded ? 0.2 : 0.7,
        isExcluded: isExcluded,
        interpretation: isExcluded
            ? `Số ${num} BỊ LOẠI TRỪ bởi hệ thống vì thuộc các chuỗi có xác suất cao sẽ tiếp tục.`
            : `Số ${num} KHÔNG bị loại trừ - không thuộc chuỗi nguy hiểm nào.`,
        formula: `Nếu bị loại trừ: Điểm = 0.2. Nếu không: Điểm = 0.7`
    };

    // ============ METHOD 4: ROLLING 360-DAY TREND ============
    const ROLLING_DAYS = 360;
    const EXPECTED_PER_360_DAYS = 360 / 100; // 3.6 lần
    const recentData360 = data.slice(-ROLLING_DAYS);

    // Đếm số lần xuất hiện trong 360 ngày gần nhất
    const countIn360Days = recentData360.filter(d => d.value === num).length;
    const deviationPercent = ((countIn360Days - EXPECTED_PER_360_DAYS) / EXPECTED_PER_360_DAYS * 100);

    let yearlyScore = 0.5;
    if (countIn360Days < EXPECTED_PER_360_DAYS * 0.7) {
        yearlyScore = 0.7 + Math.min(0.3, (1 - countIn360Days / EXPECTED_PER_360_DAYS) * 0.5);
    } else if (countIn360Days < EXPECTED_PER_360_DAYS * 0.9) {
        yearlyScore = 0.6;
    } else if (countIn360Days > EXPECTED_PER_360_DAYS * 1.3) {
        yearlyScore = 0.3;
    } else if (countIn360Days > EXPECTED_PER_360_DAYS * 1.1) {
        yearlyScore = 0.4;
    }
    yearlyScore = Math.min(1, Math.max(0, yearlyScore));

    const yearlyExplanation = {
        score: yearlyScore,
        rollingDays: ROLLING_DAYS,
        countIn360Days: countIn360Days,
        expectedCount: EXPECTED_PER_360_DAYS.toFixed(1),
        deviation: deviationPercent.toFixed(1),
        interpretation: getRolling360Interpretation(countIn360Days, EXPECTED_PER_360_DAYS, deviationPercent),
        formula: `Kỳ vọng: ${EXPECTED_PER_360_DAYS.toFixed(1)} lần/360 ngày. Nếu < 70% → điểm cao. Nếu > 130% → điểm thấp.`
    };

    // ============ METHOD 5: DAY PATTERN ============
    const dayOfWeekCounts = Array(7).fill(0);
    const dayOfMonthCounts = {};

    data.forEach(item => {
        if (item.value === num) {
            const itemDayInfo = getDayInfo(item.date);
            dayOfWeekCounts[itemDayInfo.dayOfWeek]++;
            dayOfMonthCounts[itemDayInfo.dayOfMonth] = (dayOfMonthCounts[itemDayInfo.dayOfMonth] || 0) + 1;
        }
    });

    const totalDayOfWeek = dayOfWeekCounts.reduce((a, b) => a + b, 0);
    const avgDayOfWeek = totalDayOfWeek / 7;
    const todayDayOfWeekCount = dayOfWeekCounts[dayInfo.dayOfWeek];
    const dowRatio = todayDayOfWeekCount / (avgDayOfWeek || 1);

    const avgDayOfMonth = Object.values(dayOfMonthCounts).reduce((a, b) => a + b, 0) / 31;
    const todayDayOfMonthCount = dayOfMonthCounts[dayInfo.dayOfMonth] || 0;
    const domRatio = todayDayOfMonthCount / (avgDayOfMonth || 1);

    const dayPatternScore = Math.min(1, (dowRatio * 0.6 + domRatio * 0.4) / 2);

    const dayPatternExplanation = {
        score: dayPatternScore,
        today: {
            dayOfWeek: dayNames[dayInfo.dayOfWeek],
            dayOfMonth: dayInfo.dayOfMonth
        },
        dayOfWeekStats: {
            countToday: todayDayOfWeekCount,
            avgPerDay: avgDayOfWeek.toFixed(1),
            ratio: dowRatio.toFixed(2),
            allDays: dayNames.map((name, i) => ({ name, count: dayOfWeekCounts[i] }))
        },
        dayOfMonthStats: {
            countToday: todayDayOfMonthCount,
            avgPerDay: avgDayOfMonth.toFixed(1),
            ratio: domRatio.toFixed(2)
        },
        interpretation: getDayPatternInterpretation(todayDayOfWeekCount, avgDayOfWeek, dayNames[dayInfo.dayOfWeek], dayInfo.dayOfMonth),
        formula: `Điểm = (Tỷ lệ thứ × 0.6 + Tỷ lệ ngày × 0.4) / 2. Tỷ lệ = Số lần vào ngày này / TB các ngày`
    };

    // ============ METHOD 6: RECENT HISTORY ============
    const last30Days = data.slice(-30);
    const recentCount = last30Days.filter(d => d.value === num).length;
    const lastAppearance = [...data].reverse().findIndex(d => d.value === num);
    const lastAppearanceDate = lastAppearance >= 0 ? data[data.length - 1 - lastAppearance].date : null;

    const maxRecentCount = Math.max(...Object.values(
        last30Days.reduce((acc, d) => {
            acc[d.value] = (acc[d.value] || 0) + 1;
            return acc;
        }, {})
    ));

    const recentScore = 1 - (recentCount / (maxRecentCount || 1));

    const recentExplanation = {
        score: recentScore,
        appearancesIn30Days: recentCount,
        daysSinceLastAppearance: lastAppearance >= 0 ? lastAppearance : 'Chưa xuất hiện',
        lastAppearanceDate: lastAppearanceDate,
        interpretation: getRecentInterpretation(recentCount, lastAppearance),
        formula: `Điểm = 1 - (Số lần xuất hiện trong 30 ngày / Max xuất hiện của bất kỳ số nào)`
    };

    // ============ ADVANCED ANALYSIS METHODS ============
    // Lấy tất cả phân tích nâng cao cho số này
    let advancedMethods = {};
    try {
        const advancedResult = await advancedAnalysis.getNumberAdvancedAnalysis(num);
        advancedMethods = advancedResult.methods || {};
    } catch (error) {
        console.error('[Unified Prediction] Error getting advanced analysis:', error.message);
    }

    // ============ FINAL COMBINED SCORE ============
    const weights = CONFIG.WEIGHTS;
    const basicFinalScore =
        distributionExplanation.score * weights.DISTRIBUTION +
        streakExplanation.score * weights.STREAK +
        exclusionExplanation.score * weights.EXCLUSION +
        yearlyExplanation.score * weights.YEARLY_TREND +
        dayPatternExplanation.score * weights.DAY_PATTERN +
        recentExplanation.score * weights.RECENT_HISTORY;

    // Tính điểm từ advanced methods (trung bình)
    const advancedScores = Object.values(advancedMethods).map(m => m.score).filter(s => !isNaN(s));
    const advancedAvgScore = advancedScores.length > 0
        ? advancedScores.reduce((a, b) => a + b, 0) / advancedScores.length
        : 0.5;

    // Kết hợp: 70% basic methods + 30% advanced methods
    const finalScore = basicFinalScore * 0.7 + advancedAvgScore * 0.3;

    return {
        number: num,
        finalScore: Math.round(finalScore * 100) / 100,
        basicScore: Math.round(basicFinalScore * 100) / 100,
        advancedScore: Math.round(advancedAvgScore * 100) / 100,
        category: getCategoryFromScore(finalScore),
        recommendation: getFinalRecommendation(finalScore),

        methods: {
            distribution: distributionExplanation,
            streak: streakExplanation,
            exclusion: exclusionExplanation,
            yearly: yearlyExplanation,
            dayPattern: dayPatternExplanation,
            recent: recentExplanation
        },

        // 13 phương pháp phân tích nâng cao
        advancedMethods: advancedMethods,

        weights: weights,

        summary: generateNumberSummary(num, finalScore, {
            distribution: distributionExplanation,
            streak: streakExplanation,
            exclusion: exclusionExplanation,
            yearly: yearlyExplanation,
            dayPattern: dayPatternExplanation,
            recent: recentExplanation
        })
    };
}

// ============ INTERPRETATION HELPERS ============

function getDistributionInterpretation(currentGap, avgGap, maxGap, count) {
    const gapRatio = currentGap / avgGap;
    let text = '';

    if (currentGap >= maxGap) {
        text = `🔥 ĐANG PHÁ KỶ LỤC! Gap hiện tại (${currentGap}) đã vượt kỷ lục (${maxGap}). Xác suất xuất hiện RẤT CAO.`;
    } else if (gapRatio >= 1.5) {
        text = `⚠️ Gap cao bất thường (${currentGap} ngày, gấp ${gapRatio.toFixed(1)}× TB). Số này "đang nợ" rất nhiều.`;
    } else if (gapRatio >= 1.0) {
        text = `📈 Gap trên trung bình (${currentGap} ngày vs TB ${avgGap.toFixed(0)}). Có xu hướng sẽ xuất hiện.`;
    } else if (gapRatio >= 0.5) {
        text = `📊 Gap bình thường (${currentGap} ngày). Xác suất ở mức trung bình.`;
    } else {
        text = `📉 Mới xuất hiện gần đây (${currentGap} ngày trước). Xác suất thấp theo quy luật gap.`;
    }

    return text;
}

function getStreakInterpretation(streaks) {
    if (streaks.length === 0) {
        return '✅ Số này KHÔNG thuộc chuỗi đang diễn ra nào. Không bị ảnh hưởng tiêu cực từ streak.';
    }

    const highIntensity = streaks.filter(s => parseInt(s.intensity) > 80);

    if (highIntensity.length > 0) {
        return `⚠️ Số này thuộc ${streaks.length} chuỗi đang diễn ra, trong đó ${highIntensity.length} chuỗi đã đạt >80% kỷ lục. Xác suất chuỗi kết thúc (loại trừ số này) CAO.`;
    }

    return `📋 Số này thuộc ${streaks.length} chuỗi đang diễn ra nhưng chưa gần kỷ lục. Ảnh hưởng TRUNG BÌNH.`;
}

function getRolling360Interpretation(actualCount, expectedCount, deviation) {
    if (deviation < -30) {
        return `🔥 Trong 360 ngày gần đây, số này xuất hiện RẤT ÍT (${actualCount} lần vs kỳ vọng ${expectedCount.toFixed(1)}, thiếu ${Math.abs(deviation).toFixed(0)}%). Đang "nợ" nhiều → xác suất cao.`;
    } else if (deviation < -10) {
        return `📈 Trong 360 ngày qua, số này xuất hiện ÍT HƠN kỳ vọng (${actualCount} vs ${expectedCount.toFixed(1)}, ${deviation.toFixed(0)}%). Có xu hướng bù lại.`;
    } else if (deviation > 30) {
        return `📉 Trong 360 ngày qua, số này xuất hiện QUÁ NHIỀU (+${deviation.toFixed(0)}%). Có thể sẽ "nghỉ" một thời gian.`;
    } else if (deviation > 10) {
        return `⚠️ Trong 360 ngày qua, số này hơi nhiều hơn kỳ vọng (+${deviation.toFixed(0)}%). Cân nhắc.`;
    }

    return `📊 Trong 360 ngày qua, số này xuất hiện BÌNH THƯỜNG (${actualCount} lần, kỳ vọng ${expectedCount.toFixed(1)}).`;
}

function getDayPatternInterpretation(todayCount, avgCount, dayName, dayOfMonth) {
    const ratio = todayCount / (avgCount || 1);

    if (ratio >= 1.5) {
        return `🔥 Số này xuất hiện NHIỀU HƠN trung bình vào ${dayName} và ngày ${dayOfMonth}. Pattern lịch sử ủng hộ.`;
    } else if (ratio >= 1.0) {
        return `📊 Pattern ngày bình thường. Số này xuất hiện với tần suất trung bình vào ${dayName}.`;
    } else if (ratio >= 0.5) {
        return `📉 Số này xuất hiện ÍT HƠN trung bình vào ${dayName}. Pattern không ủng hộ lắm.`;
    }

    return `⚠️ Số này HIẾM KHI xuất hiện vào ${dayName}. Pattern lịch sử không ủng hộ.`;
}

function getRecentInterpretation(recentCount, daysSince) {
    if (recentCount === 0) {
        return `🔥 Số này CHƯA xuất hiện trong 30 ngày gần đây. Theo quy luật, xác suất xuất hiện TĂNG.`;
    } else if (recentCount === 1) {
        return `📈 Số này chỉ xuất hiện 1 lần trong 30 ngày (${daysSince} ngày trước). Vẫn có tiềm năng.`;
    } else if (recentCount >= 3) {
        return `📉 Số này đã xuất hiện ${recentCount} lần trong 30 ngày gần đây. Có thể sẽ "nghỉ".`;
    }

    return `📊 Số này xuất hiện ${recentCount} lần trong 30 ngày. Tần suất trung bình.`;
}

function getFinalRecommendation(score) {
    if (score >= 0.7) {
        return {
            action: 'STRONGLY_RECOMMEND',
            text: '🔥 KHUYÊN NÊN ĐÁNH - Điểm CAO từ nhiều phương pháp',
            color: 'green'
        };
    } else if (score >= 0.5) {
        return {
            action: 'RECOMMEND',
            text: '✅ CÓ THỂ ĐÁNH - Điểm trung bình khá, cân nhắc',
            color: 'yellow'
        };
    } else if (score >= 0.3) {
        return {
            action: 'NEUTRAL',
            text: '⚠️ CÂN NHẮC KỸ - Điểm thấp, nhiều yếu tố không ủng hộ',
            color: 'orange'
        };
    }

    return {
        action: 'AVOID',
        text: '❌ NÊN LOẠI TRỪ - Điểm rất thấp, khuyên không nên đánh',
        color: 'red'
    };
}

function generateNumberSummary(num, score, methods) {
    const pros = [];
    const cons = [];

    // Distribution
    if (methods.distribution.normalizedScore >= 0.5) {
        pros.push(`Gap cao (${methods.distribution.details.currentGap} ngày)`);
    } else {
        cons.push(`Gap thấp (${methods.distribution.details.currentGap} ngày)`);
    }

    // Streak
    if (methods.streak.affectedBy === 0) {
        pros.push('Không thuộc chuỗi nguy hiểm');
    } else {
        cons.push(`Thuộc ${methods.streak.affectedBy} chuỗi đang diễn ra`);
    }

    // Exclusion
    if (!methods.exclusion.isExcluded) {
        pros.push('Không bị loại trừ bởi hệ thống');
    } else {
        cons.push('Bị hệ thống loại trừ');
    }

    // Yearly
    if (parseFloat(methods.yearly.deviation) < -10) {
        pros.push(`Năm nay "nợ" ${Math.abs(methods.yearly.deviation)}%`);
    } else if (parseFloat(methods.yearly.deviation) > 10) {
        cons.push(`Năm nay "thừa" ${methods.yearly.deviation}%`);
    }

    // Day Pattern
    if (methods.dayPattern.score >= 0.6) {
        pros.push('Pattern ngày ủng hộ');
    } else if (methods.dayPattern.score < 0.4) {
        cons.push('Pattern ngày không ủng hộ');
    }

    // Recent
    if (methods.recent.appearancesIn30Days === 0) {
        pros.push('Chưa xuất hiện 30 ngày qua');
    } else if (methods.recent.appearancesIn30Days >= 3) {
        cons.push(`Đã xuất hiện ${methods.recent.appearancesIn30Days} lần gần đây`);
    }

    return { pros, cons };
}
