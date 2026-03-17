/**
 * Hybrid AI Prediction Service
 * Kết hợp 4 phương pháp hiện đại:
 * 1. Markov Chain - Xác suất chuyển đổi trạng thái
 * 2. Monte Carlo Simulation - Mô phỏng ngẫu nhiên
 * 3. ARIMA-like Analysis - Phân tích chuỗi thời gian
 * 4. Pattern Recognition - Nhận dạng mẫu nâng cao
 */

const lotteryService = require('./lotteryService');

class HybridAIPredictionService {
    constructor() {
        this.lotteryData = [];
        this.markovMatrix = {};
        this.frequencyData = {};
        this.patternCache = {};
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            const data = lotteryService.getRawData();
            if (!data) throw new Error('Data not loaded');

            this.lotteryData = data
                .filter(item => item.special !== null && !isNaN(item.special))
                .map(item => ({
                    date: new Date(item.date),
                    value: parseInt(item.special, 10)
                }))
                .sort((a, b) => a.date - b.date);

            this.buildMarkovMatrix();
            this.buildFrequencyData();
            this.buildPatternDatabase();

            this.initialized = true;
            console.log(`[Hybrid AI] Initialized with ${this.lotteryData.length} records`);
        } catch (error) {
            console.error('[Hybrid AI] Initialization error:', error);
            throw error;
        }
    }

    // ============================================
    // 1. MARKOV CHAIN ANALYSIS
    // ============================================

    /**
     * Xây dựng ma trận chuyển đổi Markov
     * P(số tiếp theo | số hiện tại)
     */
    buildMarkovMatrix() {
        const transitionCounts = {};
        const totalCounts = {};

        for (let i = 0; i < this.lotteryData.length - 1; i++) {
            const current = this.lotteryData[i].value;
            const next = this.lotteryData[i + 1].value;

            if (!transitionCounts[current]) {
                transitionCounts[current] = {};
                totalCounts[current] = 0;
            }

            transitionCounts[current][next] = (transitionCounts[current][next] || 0) + 1;
            totalCounts[current]++;
        }

        // Chuyển đổi sang xác suất
        this.markovMatrix = {};
        for (const from in transitionCounts) {
            this.markovMatrix[from] = {};
            for (const to in transitionCounts[from]) {
                this.markovMatrix[from][to] = transitionCounts[from][to] / totalCounts[from];
            }
        }

        console.log(`[Markov] Built transition matrix for ${Object.keys(this.markovMatrix).length} states`);
    }

    /**
     * Lấy xác suất Markov cho từng số
     * @param {number} currentNumber - Số hiện tại (kết quả gần nhất)
     * @returns {Object} Xác suất cho từng số 00-99
     */
    getMarkovProbabilities(currentNumber) {
        const probabilities = {};

        // Khởi tạo với xác suất mặc định
        for (let i = 0; i < 100; i++) {
            probabilities[i] = 0.01; // Base probability
        }

        // Áp dụng xác suất Markov nếu có
        if (this.markovMatrix[currentNumber]) {
            for (const next in this.markovMatrix[currentNumber]) {
                probabilities[parseInt(next)] = this.markovMatrix[currentNumber][next];
            }
        }

        return probabilities;
    }

    // ============================================
    // 2. MONTE CARLO SIMULATION
    // ============================================

    /**
     * Xây dựng dữ liệu tần suất
     */
    buildFrequencyData() {
        this.frequencyData = {};

        // Tần suất tổng thể
        for (let i = 0; i < 100; i++) {
            this.frequencyData[i] = 0;
        }

        for (const item of this.lotteryData) {
            this.frequencyData[item.value]++;
        }

        // Chuyển sang xác suất
        const total = this.lotteryData.length;
        for (const num in this.frequencyData) {
            this.frequencyData[num] /= total;
        }
    }

    /**
     * Monte Carlo Simulation
     * @param {number} simulations - Số lần mô phỏng
     * @param {number} recentDays - Số ngày gần đây để tính trọng số
     * @returns {Object} Xác suất cho từng số
     */
    monteCarloSimulation(simulations = 10000, recentDays = 90) {
        const results = {};
        for (let i = 0; i < 100; i++) {
            results[i] = 0;
        }

        // Lấy dữ liệu gần đây để tính trọng số
        const recentData = this.lotteryData.slice(-recentDays);
        const recentFreq = {};
        for (let i = 0; i < 100; i++) {
            recentFreq[i] = 0;
        }
        for (const item of recentData) {
            recentFreq[item.value]++;
        }

        // Tạo weighted probability từ kết hợp historical + recent
        const weights = [];
        let totalWeight = 0;
        for (let i = 0; i < 100; i++) {
            const historicalWeight = this.frequencyData[i] || 0.01;
            const recentWeight = (recentFreq[i] / recentDays) || 0.01;
            // Kết hợp: 40% historical + 60% recent
            const combinedWeight = 0.4 * historicalWeight + 0.6 * recentWeight;
            weights.push(combinedWeight);
            totalWeight += combinedWeight;
        }

        // Chuẩn hóa
        const normalizedWeights = weights.map(w => w / totalWeight);

        // Chạy mô phỏng
        for (let sim = 0; sim < simulations; sim++) {
            const rand = Math.random();
            let cumulative = 0;
            for (let i = 0; i < 100; i++) {
                cumulative += normalizedWeights[i];
                if (rand < cumulative) {
                    results[i]++;
                    break;
                }
            }
        }

        // Chuyển sang xác suất
        for (let i = 0; i < 100; i++) {
            results[i] /= simulations;
        }

        return results;
    }

    // ============================================
    // 3. ARIMA-LIKE TIME SERIES ANALYSIS
    // ============================================

    /**
     * Phân tích chuỗi thời gian đơn giản
     * Tính xu hướng và tính mùa vụ
     * @param {number} lookbackDays - Số ngày nhìn lại
     * @returns {Object} Điểm cho từng số
     */
    timeSeriesAnalysis(lookbackDays = 30) {
        const scores = {};
        for (let i = 0; i < 100; i++) {
            scores[i] = 0;
        }

        const recentData = this.lotteryData.slice(-lookbackDays);

        // 1. Trend Analysis - Số nào đang tăng/giảm tần suất
        const halfPoint = Math.floor(lookbackDays / 2);
        const firstHalf = recentData.slice(0, halfPoint);
        const secondHalf = recentData.slice(halfPoint);

        const firstHalfFreq = {};
        const secondHalfFreq = {};
        for (let i = 0; i < 100; i++) {
            firstHalfFreq[i] = 0;
            secondHalfFreq[i] = 0;
        }

        firstHalf.forEach(item => firstHalfFreq[item.value]++);
        secondHalf.forEach(item => secondHalfFreq[item.value]++);

        // Số có xu hướng tăng
        for (let i = 0; i < 100; i++) {
            const trend = secondHalfFreq[i] - firstHalfFreq[i];
            scores[i] += trend * 0.3; // Trọng số cho trend
        }

        // 2. Seasonality - Tính theo ngày trong tuần
        const today = new Date();
        const dayOfWeek = today.getDay();

        const sameDayData = this.lotteryData.filter(item => {
            return item.date.getDay() === dayOfWeek;
        }).slice(-52); // 1 năm cùng thứ

        const dayFreq = {};
        for (let i = 0; i < 100; i++) {
            dayFreq[i] = 0;
        }
        sameDayData.forEach(item => dayFreq[item.value]++);

        // Chuẩn hóa và thêm vào scores
        const maxDayFreq = Math.max(...Object.values(dayFreq));
        for (let i = 0; i < 100; i++) {
            scores[i] += (dayFreq[i] / maxDayFreq) * 0.2; // Trọng số cho seasonality
        }

        // 3. Gap Analysis Inverse - Số lâu chưa về có xu hướng về
        const lastAppearance = {};
        for (let i = 0; i < 100; i++) {
            lastAppearance[i] = lookbackDays + 1; // Default = chưa về trong lookback
        }

        for (let i = recentData.length - 1; i >= 0; i--) {
            const num = recentData[i].value;
            if (lastAppearance[num] > lookbackDays) {
                lastAppearance[num] = recentData.length - 1 - i;
            }
        }

        // Số lâu chưa về -> điểm cao hơn (với giới hạn)
        for (let i = 0; i < 100; i++) {
            const gap = lastAppearance[i];
            if (gap > 5 && gap < 20) { // Khoảng "vàng" để về
                scores[i] += 0.2;
            } else if (gap >= 20 && gap <= 30) {
                scores[i] += 0.3; // Rất lâu chưa về
            }
        }

        // Chuẩn hóa về 0-1
        const minScore = Math.min(...Object.values(scores));
        const maxScore = Math.max(...Object.values(scores));
        const range = maxScore - minScore || 1;

        for (let i = 0; i < 100; i++) {
            scores[i] = (scores[i] - minScore) / range;
        }

        return scores;
    }

    // ============================================
    // 4. PATTERN RECOGNITION
    // ============================================

    /**
     * Xây dựng cơ sở dữ liệu pattern
     */
    buildPatternDatabase() {
        this.patternCache = {
            sequences: {},      // Chuỗi 2-3 số liên tiếp
            digitPatterns: {},  // Pattern đầu + đít
            sumPatterns: {},    // Pattern tổng 2 chữ số
        };

        // Sequences: Sau chuỗi [a, b] thường là gì?
        for (let i = 0; i < this.lotteryData.length - 3; i++) {
            const seq = `${this.lotteryData[i].value}-${this.lotteryData[i + 1].value}`;
            const next = this.lotteryData[i + 2].value;

            if (!this.patternCache.sequences[seq]) {
                this.patternCache.sequences[seq] = {};
            }
            this.patternCache.sequences[seq][next] = (this.patternCache.sequences[seq][next] || 0) + 1;
        }

        // Digit patterns: Sau đầu X thường là đầu gì?
        for (let i = 0; i < this.lotteryData.length - 1; i++) {
            const currentHead = Math.floor(this.lotteryData[i].value / 10);
            const nextHead = Math.floor(this.lotteryData[i + 1].value / 10);

            const key = `head_${currentHead}`;
            if (!this.patternCache.digitPatterns[key]) {
                this.patternCache.digitPatterns[key] = {};
            }
            this.patternCache.digitPatterns[key][nextHead] =
                (this.patternCache.digitPatterns[key][nextHead] || 0) + 1;
        }

        console.log(`[Pattern] Built ${Object.keys(this.patternCache.sequences).length} sequence patterns`);
    }

    /**
     * Nhận dạng pattern và dự đoán
     * @returns {Object} Điểm cho từng số
     */
    patternRecognition() {
        const scores = {};
        for (let i = 0; i < 100; i++) {
            scores[i] = 0;
        }

        const lastTwo = this.lotteryData.slice(-2);
        if (lastTwo.length < 2) return scores;

        // 1. Sequence pattern
        const seq = `${lastTwo[0].value}-${lastTwo[1].value}`;
        if (this.patternCache.sequences[seq]) {
            const pattern = this.patternCache.sequences[seq];
            const total = Object.values(pattern).reduce((a, b) => a + b, 0);

            for (const num in pattern) {
                scores[parseInt(num)] += (pattern[num] / total) * 0.4;
            }
        }

        // 2. Head pattern
        const currentHead = Math.floor(lastTwo[1].value / 10);
        const headKey = `head_${currentHead}`;

        if (this.patternCache.digitPatterns[headKey]) {
            const pattern = this.patternCache.digitPatterns[headKey];
            const total = Object.values(pattern).reduce((a, b) => a + b, 0);

            for (const nextHead in pattern) {
                const prob = pattern[nextHead] / total;
                // Áp dụng cho tất cả số có đầu này
                for (let tail = 0; tail < 10; tail++) {
                    const num = parseInt(nextHead) * 10 + tail;
                    scores[num] += prob * 0.03; // Chia đều cho 10 đuôi
                }
            }
        }

        // 3. Số đối xứng và số đẹp
        const lastNum = lastTwo[1].value;
        const lastHead = Math.floor(lastNum / 10);
        const lastTail = lastNum % 10;

        // Số đối xứng (ví dụ: sau 36 thường là 63)
        const mirror = lastTail * 10 + lastHead;
        scores[mirror] += 0.1;

        // Số kề (+-1)
        if (lastNum > 0) scores[lastNum - 1] += 0.05;
        if (lastNum < 99) scores[lastNum + 1] += 0.05;

        // Chuẩn hóa
        const maxScore = Math.max(...Object.values(scores));
        if (maxScore > 0) {
            for (let i = 0; i < 100; i++) {
                scores[i] /= maxScore;
            }
        }

        return scores;
    }

    // ============================================
    // HYBRID COMBINATION
    // ============================================

    /**
     * Kết hợp 4 phương pháp để tạo dự đoán cuối cùng
     * @param {Object} options - Tùy chọn
     * @returns {Object} Kết quả dự đoán
     */
    async getHybridPrediction(options = {}) {
        await this.initialize();

        const {
            topCount = 40,
            excludeCount = 60,
            weights = {
                markov: 0.25,
                monteCarlo: 0.25,
                timeSeries: 0.25,
                pattern: 0.25
            }
        } = options;

        const lastNumber = this.lotteryData[this.lotteryData.length - 1].value;

        // Lấy điểm từ 4 phương pháp
        console.log('[Hybrid AI] Running Markov Chain...');
        const markovScores = this.getMarkovProbabilities(lastNumber);

        console.log('[Hybrid AI] Running Monte Carlo Simulation...');
        const monteCarloScores = this.monteCarloSimulation(10000, 90);

        console.log('[Hybrid AI] Running Time Series Analysis...');
        const timeSeriesScores = this.timeSeriesAnalysis(30);

        console.log('[Hybrid AI] Running Pattern Recognition...');
        const patternScores = this.patternRecognition();

        // Kết hợp điểm
        const combinedScores = [];
        for (let i = 0; i < 100; i++) {
            const score =
                (markovScores[i] || 0) * weights.markov +
                (monteCarloScores[i] || 0) * weights.monteCarlo +
                (timeSeriesScores[i] || 0) * weights.timeSeries +
                (patternScores[i] || 0) * weights.pattern;

            combinedScores.push({
                number: String(i).padStart(2, '0'),
                score: score,
                markov: markovScores[i] || 0,
                monteCarlo: monteCarloScores[i] || 0,
                timeSeries: timeSeriesScores[i] || 0,
                pattern: patternScores[i] || 0
            });
        }

        // Sắp xếp theo điểm giảm dần
        combinedScores.sort((a, b) => b.score - a.score);

        // Lấy top và excluded
        const predictions = combinedScores.slice(0, topCount).map(p => p.number);
        const exclusions = combinedScores.slice(-excludeCount).map(p => p.number);

        console.log(`[Hybrid AI] Generated ${predictions.length} predictions, ${exclusions.length} exclusions`);

        return {
            predictions,
            exclusions,
            allNumbers: combinedScores,
            methodology: {
                markov: 'Markov Chain Transition Probability',
                monteCarlo: 'Monte Carlo Simulation (10,000 runs)',
                timeSeries: 'ARIMA-like Time Series Analysis',
                pattern: 'Sequence & Digit Pattern Recognition'
            },
            lastNumber: String(lastNumber).padStart(2, '0'),
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Lấy dự đoán cho ngày cụ thể (tương thích với các service khác)
     */
    async getDailyPrediction(options = {}) {
        return this.getHybridPrediction(options);
    }
}

// Singleton instance
const hybridAIPrediction = new HybridAIPredictionService();

module.exports = hybridAIPrediction;
