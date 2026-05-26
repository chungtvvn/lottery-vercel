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
        this.markov2HeadMatrix = {};
        this.markov2TailMatrix = {};
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
            this.buildMarkov2Matrix();
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
    // 1b. MARKOV CHAIN BẬC 2 (SECOND-ORDER MARKOV)
    // ============================================

    buildMarkov2Matrix() {
        const headCounts = {};
        const tailCounts = {};
        const headTotals = {};
        const tailTotals = {};

        for (let i = 0; i < this.lotteryData.length - 2; i++) {
            const v0 = this.lotteryData[i].value;
            const v1 = this.lotteryData[i + 1].value;
            const v2 = this.lotteryData[i + 2].value;

            const h0 = Math.floor(v0 / 10), t0 = v0 % 10;
            const h1 = Math.floor(v1 / 10), t1 = v1 % 10;
            const h2 = Math.floor(v2 / 10), t2 = v2 % 10;

            const headKey = `${h0}-${h1}`;
            const tailKey = `${t0}-${t1}`;

            if (!headCounts[headKey]) { headCounts[headKey] = {}; headTotals[headKey] = 0; }
            if (!tailCounts[tailKey]) { tailCounts[tailKey] = {}; tailTotals[tailKey] = 0; }

            headCounts[headKey][h2] = (headCounts[headKey][h2] || 0) + 1;
            headTotals[headKey]++;

            tailCounts[tailKey][t2] = (tailCounts[tailKey][t2] || 0) + 1;
            tailTotals[tailKey]++;
        }

        this.markov2HeadMatrix = {};
        for (const key in headCounts) {
            this.markov2HeadMatrix[key] = {};
            for (const next in headCounts[key]) {
                this.markov2HeadMatrix[key][next] = headCounts[key][next] / headTotals[key];
            }
        }

        this.markov2TailMatrix = {};
        for (const key in tailCounts) {
            this.markov2TailMatrix[key] = {};
            for (const next in tailCounts[key]) {
                this.markov2TailMatrix[key][next] = tailCounts[key][next] / tailTotals[key];
            }
        }

        console.log(`[Markov 2] Built 2nd-order head matrix (${Object.keys(this.markov2HeadMatrix).length} states) and tail matrix (${Object.keys(this.markov2TailMatrix).length} states)`);
    }

    getMarkov2Probabilities(lastTwoNumbers) {
        const probabilities = {};
        for (let i = 0; i < 100; i++) {
            probabilities[i] = 0.01; // Base probability
        }

        if (!lastTwoNumbers || lastTwoNumbers.length < 2) return probabilities;

        const v0 = lastTwoNumbers[0];
        const v1 = lastTwoNumbers[1];

        const h0 = Math.floor(v0 / 10), t0 = v0 % 10;
        const h1 = Math.floor(v1 / 10), t1 = v1 % 10;

        const headKey = `${h0}-${h1}`;
        const tailKey = `${t0}-${t1}`;

        const headProbs = this.markov2HeadMatrix[headKey] || {};
        const tailProbs = this.markov2TailMatrix[tailKey] || {};

        for (let h = 0; h < 10; h++) {
            const pH = headProbs[h] !== undefined ? headProbs[h] : 0.1;
            for (let t = 0; t < 10; t++) {
                const pT = tailProbs[t] !== undefined ? tailProbs[t] : 0.1;
                const num = h * 10 + t;
                probabilities[num] = pH * pT;
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

    calculateEntropy(combinedScores) {
        let entropy = 0;
        const total = combinedScores.reduce((sum, item) => sum + item.score, 0);
        if (total <= 0) return 6.6438; // log2(100)

        for (const item of combinedScores) {
            const p = item.score / total;
            if (p > 0) {
                entropy -= p * Math.log2(p);
            }
        }
        return entropy;
    }

    async getDynamicWeights(basisIndex, lookbackDays = 15) {
        if (basisIndex < lookbackDays + 2) {
            return { markov: 0.25, monteCarlo: 0.25, timeSeries: 0.25, pattern: 0.25 };
        }

        const hitCounts = { markov: 0, monteCarlo: 0, timeSeries: 0, pattern: 0 };
        const originalData = this.lotteryData;

        // Simple sliding window simulation
        for (let idx = basisIndex - lookbackDays; idx < basisIndex; idx++) {
            const actualVal = originalData[idx].value;
            const prevVal = originalData[idx - 1].value;

            // Slicing and rebuilding for stats services to eliminate look-ahead bias
            this.lotteryData = originalData.slice(0, idx);
            this.buildMarkovMatrix();
            this.buildMarkov2Matrix();
            this.buildFrequencyData();
            this.buildPatternDatabase();

            const markovScores = this.getMarkovProbabilities(prevVal);
            
            // Approximation for Monte Carlo to avoid deep loops
            const mcScores = {};
            const recentFreq = Array(100).fill(0);
            const recentData = originalData.slice(Math.max(0, idx - 90), idx);
            recentData.forEach(item => recentFreq[item.value]++);
            for (let i = 0; i < 100; i++) {
                mcScores[i] = 0.4 * (this.frequencyData[i] || 0.01) + 0.6 * (recentFreq[i] / 90 || 0.01);
            }

            const tsScores = this.timeSeriesAnalysis(30);
            const patScores = this.patternRecognition();

            const getTop30 = (scores) => {
                return Object.entries(scores)
                    .map(([num, val]) => ({ num: parseInt(num), val }))
                    .sort((a, b) => b.val - a.val)
                    .slice(0, 30)
                    .map(item => item.num);
            };

            if (getTop30(markovScores).includes(actualVal)) hitCounts.markov++;
            if (getTop30(mcScores).includes(actualVal)) hitCounts.monteCarlo++;
            if (getTop30(tsScores).includes(actualVal)) hitCounts.timeSeries++;
            if (getTop30(patScores).includes(actualVal)) hitCounts.pattern++;
        }

        this.lotteryData = originalData; // Restore
        this.buildMarkovMatrix();
        this.buildMarkov2Matrix();
        this.buildFrequencyData();
        this.buildPatternDatabase();

        const totalHits = hitCounts.markov + hitCounts.monteCarlo + hitCounts.timeSeries + hitCounts.pattern;
        if (totalHits <= 0) {
            return { markov: 0.25, monteCarlo: 0.25, timeSeries: 0.25, pattern: 0.25 };
        }

        const rawWeights = {
            markov: Math.max(0.1, hitCounts.markov / totalHits),
            monteCarlo: Math.max(0.1, hitCounts.monteCarlo / totalHits),
            timeSeries: Math.max(0.1, hitCounts.timeSeries / totalHits),
            pattern: Math.max(0.1, hitCounts.pattern / totalHits)
        };

        const sum = rawWeights.markov + rawWeights.monteCarlo + rawWeights.timeSeries + rawWeights.pattern;
        return {
            markov: rawWeights.markov / sum,
            monteCarlo: rawWeights.monteCarlo / sum,
            timeSeries: rawWeights.timeSeries / sum,
            pattern: rawWeights.pattern / sum
        };
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

        const originalLotteryData = this.lotteryData;
        const basisIndex = options.basisIndex !== undefined ? options.basisIndex : originalLotteryData.length - 1;

        if (options.basisIndex !== undefined) {
            this.lotteryData = originalLotteryData.slice(0, basisIndex + 1);
            // Rebuild stats/matrices for the sliced data to avoid look-ahead bias
            this.buildMarkovMatrix();
            this.buildMarkov2Matrix();
            this.buildFrequencyData();
            this.buildPatternDatabase();
        }

        const {
            topCount = 40,
            excludeCount = 60,
            weights = {
                markov: 0.25,
                monteCarlo: 0.25,
                timeSeries: 0.25,
                pattern: 0.25
            },
            useMarkov2 = false,
            dynamicWeights = false,
            dynamicWeightsLookback = 15
        } = options;

        const lastNumber = this.lotteryData[this.lotteryData.length - 1].value;
        const lastTwo = this.lotteryData.slice(-2).map(item => item.value);

        // Lấy điểm từ các phương pháp
        console.log('[Hybrid AI] Running Markov Chain...');
        const markovScores = this.getMarkovProbabilities(lastNumber);
        
        let blendedMarkov = markovScores;
        if (useMarkov2) {
            console.log('[Hybrid AI] Blending with Markov 2...');
            const markov2Scores = this.getMarkov2Probabilities(lastTwo);
            blendedMarkov = {};
            for (let i = 0; i < 100; i++) {
                blendedMarkov[i] = 0.5 * (markovScores[i] || 0) + 0.5 * (markov2Scores[i] || 0);
            }
        }

        console.log('[Hybrid AI] Running Monte Carlo Simulation...');
        const monteCarloScores = this.monteCarloSimulation(10000, 90);

        console.log('[Hybrid AI] Running Time Series Analysis...');
        const timeSeriesScores = this.timeSeriesAnalysis(30);

        console.log('[Hybrid AI] Running Pattern Recognition...');
        const patternScores = this.patternRecognition();

        let finalWeights = weights;
        if (dynamicWeights) {
            console.log('[Hybrid AI] Computing dynamic weights...');
            finalWeights = await this.getDynamicWeights(this.lotteryData.length - 1, dynamicWeightsLookback);
        }

        // Kết hợp điểm
        const combinedScores = [];
        for (let i = 0; i < 100; i++) {
            const score =
                (blendedMarkov[i] || 0) * finalWeights.markov +
                (monteCarloScores[i] || 0) * finalWeights.monteCarlo +
                (timeSeriesScores[i] || 0) * finalWeights.timeSeries +
                (patternScores[i] || 0) * finalWeights.pattern;

            combinedScores.push({
                number: String(i).padStart(2, '0'),
                score: score,
                markov: blendedMarkov[i] || 0,
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
        const entropy = this.calculateEntropy(combinedScores);

        console.log(`[Hybrid AI] Generated ${predictions.length} predictions, ${exclusions.length} exclusions. Entropy: ${entropy.toFixed(4)}`);

        // Restore original data and matrices
        this.lotteryData = originalLotteryData;
        if (options.basisIndex !== undefined) {
            this.buildMarkovMatrix();
            this.buildMarkov2Matrix();
            this.buildFrequencyData();
            this.buildPatternDatabase();
        }

        return {
            predictions,
            exclusions,
            allNumbers: combinedScores,
            entropy,
            weights: finalWeights,
            methodology: {
                markov: useMarkov2 ? 'Blended 1st & 2nd Order Markov Chain' : 'Markov Chain Transition Probability',
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
