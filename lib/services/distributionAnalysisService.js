/**
 * Distribution Analysis Service
 * Phân tích sự phân bổ của các dạng số theo thời gian để trực quan hoá và dự đoán
 */

const lotteryService = require('./lotteryService');

// Helper: Parse date string
function parseDate(dateStr) {
    if (!dateStr) return null;
    const [d, m, y] = dateStr.split('/').map(Number);
    return new Date(y, m - 1, d);
}

// Helper: Format date to dd/mm/yyyy
function formatDate(date) {
    if (typeof date === 'string') {
        const d = new Date(date);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

// Định nghĩa các categories
const CATEGORY_DEFINITIONS = {
    // Đầu (0-9)
    dau: {
        name: 'Đầu',
        values: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        extract: (num) => num.charAt(0)
    },
    // Đít (0-9)
    dit: {
        name: 'Đít',
        values: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        extract: (num) => num.charAt(1)
    },
    // Tổng TT (0-18 nhưng thực tế 1-17)
    tongTT: {
        name: 'Tổng TT',
        values: [...Array(19).keys()].map(String), // 0-18
        extract: (num) => String(parseInt(num.charAt(0)) + parseInt(num.charAt(1)))
    },
    // Hiệu (0-9)
    hieu: {
        name: 'Hiệu',
        values: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
        extract: (num) => String(Math.abs(parseInt(num.charAt(0)) - parseInt(num.charAt(1))))
    },
    // Chẵn/Lẻ
    chanLe: {
        name: 'Chẵn/Lẻ',
        values: ['Chẵn-Chẵn', 'Chẵn-Lẻ', 'Lẻ-Chẵn', 'Lẻ-Lẻ'],
        extract: (num) => {
            const d = parseInt(num.charAt(0));
            const t = parseInt(num.charAt(1));
            const dType = d % 2 === 0 ? 'Chẵn' : 'Lẻ';
            const tType = t % 2 === 0 ? 'Chẵn' : 'Lẻ';
            return `${dType}-${tType}`;
        }
    },
    // To/Nhỏ
    toNho: {
        name: 'To/Nhỏ',
        values: ['To-To', 'To-Nhỏ', 'Nhỏ-To', 'Nhỏ-Nhỏ'],
        extract: (num) => {
            const d = parseInt(num.charAt(0));
            const t = parseInt(num.charAt(1));
            const dType = d >= 5 ? 'To' : 'Nhỏ';
            const tType = t >= 5 ? 'To' : 'Nhỏ';
            return `${dType}-${tType}`;
        }
    }
};

/**
 * Load and prepare lottery data
 */
async function loadLotteryData() {
    const data = lotteryService.getRawData();
    if (!data) throw new Error('Lottery data not loaded');

    return data
        .filter(item => item.special !== null && !isNaN(item.special))
        .map(item => ({
            date: formatDate(item.date),
            value: String(item.special).padStart(2, '0'),
            year: new Date(item.date).getFullYear()
        }))
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

/**
 * Tính toán phân bổ cho một category
 */
function calculateDistribution(data, category) {
    const definition = CATEGORY_DEFINITIONS[category];
    if (!definition) return null;

    const distribution = {};
    const yearlyDistribution = {};
    const gaps = {};
    const lastAppearance = {};

    // Initialize
    definition.values.forEach(val => {
        distribution[val] = { count: 0, percentage: 0, gaps: [] };
        gaps[val] = [];
    });

    // Process data
    data.forEach((item, index) => {
        const val = definition.extract(item.value);
        const year = item.year;

        if (!yearlyDistribution[year]) {
            yearlyDistribution[year] = {};
            definition.values.forEach(v => {
                yearlyDistribution[year][v] = 0;
            });
        }

        if (distribution[val]) {
            distribution[val].count++;
            yearlyDistribution[year][val]++;

            // Calculate gap from last appearance
            if (lastAppearance[val] !== undefined) {
                const gap = index - lastAppearance[val];
                gaps[val].push(gap);
                distribution[val].gaps.push(gap);
            }
            lastAppearance[val] = index;
        }
    });

    // Calculate percentages and gap stats
    const total = data.length;
    definition.values.forEach(val => {
        distribution[val].percentage = ((distribution[val].count / total) * 100).toFixed(2);

        if (distribution[val].gaps.length > 0) {
            const gapArray = distribution[val].gaps;
            distribution[val].avgGap = (gapArray.reduce((a, b) => a + b, 0) / gapArray.length).toFixed(1);
            distribution[val].minGap = Math.min(...gapArray);
            distribution[val].maxGap = Math.max(...gapArray);

            // Current gap (days since last appearance)
            const lastIdx = lastAppearance[val];
            distribution[val].currentGap = data.length - 1 - lastIdx;

            // Gap ratio (how close to breaking record)
            distribution[val].gapRatio = (distribution[val].currentGap / distribution[val].maxGap).toFixed(2);
        }
    });

    return {
        name: definition.name,
        category,
        totalDays: total,
        distribution,
        yearlyDistribution,
        years: Object.keys(yearlyDistribution).sort()
    };
}

/**
 * Tính toán xu hướng và dự đoán
 */
function calculateTrends(distributionData) {
    const { distribution, yearlyDistribution, years } = distributionData;
    const trends = {};

    Object.keys(distribution).forEach(val => {
        const yearlyValues = years.map(y => yearlyDistribution[y][val] || 0);
        const avgYearly = yearlyValues.reduce((a, b) => a + b, 0) / yearlyValues.length;

        // Trend: so sánh năm gần nhất với trung bình
        const lastYear = years[years.length - 1];
        const lastYearCount = yearlyDistribution[lastYear][val] || 0;
        const trendPercent = ((lastYearCount - avgYearly) / avgYearly * 100).toFixed(1);

        // Prediction score based on:
        // 1. Current gap vs avg gap
        // 2. Trend direction
        // 3. Gap ratio
        const currentGap = distribution[val].currentGap || 0;
        const avgGap = parseFloat(distribution[val].avgGap) || 1;
        const gapScore = currentGap / avgGap;

        let predictionLevel = 'normal';
        if (gapScore >= 1.5) predictionLevel = 'high';
        else if (gapScore >= 1.2) predictionLevel = 'medium';
        else if (gapScore < 0.5) predictionLevel = 'low';

        trends[val] = {
            avgYearly: avgYearly.toFixed(1),
            lastYearCount,
            trend: parseFloat(trendPercent),
            trendDirection: parseFloat(trendPercent) > 0 ? 'up' : parseFloat(trendPercent) < 0 ? 'down' : 'stable',
            gapScore: gapScore.toFixed(2),
            predictionLevel
        };
    });

    return trends;
}

/**
 * Tạo dữ liệu heatmap cho số 00-99
 */
async function generateNumberHeatmap() {
    const data = await loadLotteryData();
    const heatmap = {};
    const yearlyHeatmap = {};
    const gaps = {};
    const lastAppearance = {};

    // Initialize all 100 numbers
    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        heatmap[num] = { count: 0, gaps: [] };
        gaps[num] = [];
    }

    // Process data
    data.forEach((item, index) => {
        const num = item.value;
        const year = item.year;

        if (!yearlyHeatmap[year]) {
            yearlyHeatmap[year] = {};
            for (let i = 0; i < 100; i++) {
                yearlyHeatmap[year][String(i).padStart(2, '0')] = 0;
            }
        }

        heatmap[num].count++;
        yearlyHeatmap[year][num]++;

        if (lastAppearance[num] !== undefined) {
            const gap = index - lastAppearance[num];
            heatmap[num].gaps.push(gap);
        }
        lastAppearance[num] = index;
    });

    // Calculate stats
    const total = data.length;
    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        heatmap[num].percentage = ((heatmap[num].count / total) * 100).toFixed(2);

        if (heatmap[num].gaps.length > 0) {
            const gapArray = heatmap[num].gaps;
            heatmap[num].avgGap = (gapArray.reduce((a, b) => a + b, 0) / gapArray.length).toFixed(1);
            heatmap[num].minGap = Math.min(...gapArray);
            heatmap[num].maxGap = Math.max(...gapArray);
            heatmap[num].currentGap = total - 1 - (lastAppearance[num] || 0);
        }
        delete heatmap[num].gaps; // Don't send raw gaps to frontend
    }

    return {
        heatmap,
        yearlyHeatmap,
        years: Object.keys(yearlyHeatmap).sort(),
        totalDays: total
    };
}

/**
 * Get all distributions for dashboard
 */
async function getAllDistributions() {
    const data = await loadLotteryData();
    const results = {};

    for (const category of Object.keys(CATEGORY_DEFINITIONS)) {
        const distribution = calculateDistribution(data, category);
        distribution.trends = calculateTrends(distribution);
        results[category] = distribution;
    }

    return results;
}

/**
 * Get prediction candidates - numbers that might appear soon
 */
async function getPredictionCandidates() {
    const data = await loadLotteryData();
    const candidates = [];

    // Analyze all 100 numbers
    const heatmapData = await generateNumberHeatmap();
    const { heatmap, totalDays } = heatmapData;

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const numData = heatmap[num];

        if (!numData.avgGap) continue;

        const avgGap = parseFloat(numData.avgGap);
        const currentGap = numData.currentGap || 0;
        const maxGap = numData.maxGap || avgGap;

        const score = {
            number: num,
            count: numData.count,
            avgGap,
            currentGap,
            maxGap,
            gapRatio: (currentGap / avgGap).toFixed(2),
            breakingRecord: currentGap >= maxGap,
            predictionScore: 0
        };

        // Calculate prediction score (0-100)
        // Higher = more likely to appear soon
        let predScore = 0;

        // Factor 1: Gap ratio (40%)
        const gapRatioScore = Math.min(currentGap / avgGap, 2) * 20;
        predScore += gapRatioScore;

        // Factor 2: Near or breaking record (30%)
        if (currentGap >= maxGap) {
            predScore += 30;
        } else if (currentGap >= maxGap * 0.8) {
            predScore += 20;
        } else if (currentGap >= maxGap * 0.6) {
            predScore += 10;
        }

        // Factor 3: Below average frequency (30%)
        const expectedCount = totalDays / 100;
        if (numData.count < expectedCount * 0.9) {
            predScore += 30 * (1 - numData.count / expectedCount);
        }

        score.predictionScore = Math.round(predScore);
        candidates.push(score);
    }

    // Sort by prediction score
    return candidates.sort((a, b) => b.predictionScore - a.predictionScore);
}

module.exports = {
    loadLotteryData,
    calculateDistribution,
    calculateTrends,
    generateNumberHeatmap,
    getAllDistributions,
    getPredictionCandidates,
    CATEGORY_DEFINITIONS
};
