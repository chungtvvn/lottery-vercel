/**
 * Advanced Analysis Service
 * Các phương pháp phân tích xác suất và số học nâng cao
 * 
 * Bao gồm:
 * 1. Chi-Square Test - Kiểm định độ lệch khỏi phân phối đều
 * 2. Z-Score Analysis - Chuẩn hóa tần suất xuất hiện
 * 3. Poisson Probability - Xác suất Poisson
 * 4. Bayesian Probability - Xác suất Bayesian có điều kiện
 * 5. Mean Reversion - Hồi quy về trung bình
 * 6. Moving Average Deviation - Độ lệch từ MA
 * 7. Momentum Score - Xung lực
 * 8. Cycle Detection - Phát hiện chu kỳ
 * 9. Markov Chain - Xác suất chuyển tiếp
 * 10. Fibonacci Gap Analysis - Fibonacci cho gap
 * 11. Prime Number Analysis - Phân tích số nguyên tố
 * 12. Digit Sum Pattern - Mẫu Tổng các chữ số
 * 13. Modular Arithmetic - Số học đồng dư
 */

const distributionService = require('./distributionAnalysisService');

// ============ CONSTANTS ============
const EXPECTED_FREQUENCY = 1 / 100; // Mỗi số có xác suất 1%
const FIBONACCI_SEQUENCE = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
const PRIME_NUMBERS = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

// ============ HELPER FUNCTIONS ============

/**
 * Tính factorial
 */
function factorial(n) {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
        result *= i;
    }
    return result;
}

/**
 * Tính Poisson probability
 * P(X=k) = (λ^k * e^(-λ)) / k!
 */
function poissonProbability(lambda, k) {
    if (lambda <= 0) return 0;
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Tính Z-score
 * Z = (X - μ) / σ
 */
function calculateZScore(observed, mean, stdDev) {
    if (stdDev === 0) return 0;
    return (observed - mean) / stdDev;
}

/**
 * Tính Standard Deviation
 */
function calculateStdDev(values, mean) {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * Lấy Tổng các chữ số (Tổng Truyền Thống)
 */
function getDigitSum(num) {
    const str = String(num).padStart(2, '0');
    return parseInt(str[0]) + parseInt(str[1]);
}

/**
 * Kiểm tra số nguyên tố
 */
function isPrime(n) {
    return PRIME_NUMBERS.includes(n);
}

// ============ METHOD 1: CHI-SQUARE TEST ============
/**
 * Kiểm định Chi-Square (χ²)
 * Đánh giá độ lệch khỏi phân phối đều
 * χ² = Σ((O - E)² / E)
 * 
 * Score cao = số đang lệch khỏi kỳ vọng nhiều → khả năng "điều chỉnh"
 */
async function getChiSquareScores() {
    const data = await distributionService.loadLotteryData();
    const heatmapData = await distributionService.generateNumberHeatmap();
    const { heatmap, totalDays } = heatmapData;

    const scores = {};
    const expectedCount = totalDays / 100; // Expected frequency for each number

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const observed = heatmap[num]?.count || 0;

        // Chi-square contribution for this number
        const chiSquare = Math.pow(observed - expectedCount, 2) / expectedCount;

        // Nếu observed < expected → số đang "thiếu" → điểm cao
        // Nếu observed > expected → số đang "thừa" → điểm thấp
        let score = 0.5; // baseline

        if (observed < expectedCount) {
            // Under-represented: higher score
            const deficit = (expectedCount - observed) / expectedCount;
            score = 0.5 + Math.min(0.5, deficit * 0.8);
        } else {
            // Over-represented: lower score
            const surplus = (observed - expectedCount) / expectedCount;
            score = 0.5 - Math.min(0.4, surplus * 0.6);
        }

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            chiSquare: Math.round(chiSquare * 100) / 100,
            observed,
            expected: Math.round(expectedCount * 100) / 100,
            deviation: observed - expectedCount,
            deviationPercent: Math.round(((observed - expectedCount) / expectedCount) * 100)
        };
    }

    return scores;
}

// ============ METHOD 2: Z-SCORE ANALYSIS ============
/**
 * Phân tích Z-Score
 * Chuẩn hóa tần suất xuất hiện
 * Z-score âm lớn = số "lạnh" quá mức → khả năng cao xuất hiện
 */
async function getZScoreAnalysis() {
    const heatmapData = await distributionService.generateNumberHeatmap();
    const { heatmap, totalDays } = heatmapData;

    // Thu thập tất cả counts
    const counts = [];
    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        counts.push(heatmap[num]?.count || 0);
    }

    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const stdDev = calculateStdDev(counts, mean);

    const scores = {};

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const count = heatmap[num]?.count || 0;
        const zScore = calculateZScore(count, mean, stdDev);

        // Z-score âm lớn → số ít xuất hiện → điểm cao
        // Z-score dương lớn → số xuất hiện nhiều → điểm thấp
        let score = 0.5 - (zScore * 0.15); // Map z-score to 0-1
        score = Math.max(0, Math.min(1, score));

        scores[num] = {
            score,
            zScore: Math.round(zScore * 100) / 100,
            count,
            mean: Math.round(mean * 100) / 100,
            stdDev: Math.round(stdDev * 100) / 100,
            interpretation: zScore < -1.5 ? 'Rất lạnh' : zScore < -0.5 ? 'Lạnh' : zScore > 1.5 ? 'Rất nóng' : zScore > 0.5 ? 'Nóng' : 'Bình thường'
        };
    }

    return scores;
}

// ============ METHOD 3: POISSON PROBABILITY ============
/**
 * Tính xác suất Poisson
 * Xác suất để số xuất hiện k lần trong n ngày tới
 */
async function getPoissonScores(lookAheadDays = 7) {
    const heatmapData = await distributionService.generateNumberHeatmap();
    const { heatmap, totalDays } = heatmapData;

    const scores = {};

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const numData = heatmap[num];
        const count = numData?.count || 0;
        const currentGap = numData?.currentGap || 0;

        // Lambda = tần suất trung bình trong lookAheadDays
        const avgFrequency = count / totalDays;
        const lambda = avgFrequency * lookAheadDays;

        // P(X >= 1) = 1 - P(X = 0) = xác suất xuất hiện ít nhất 1 lần
        const probAtLeastOne = 1 - poissonProbability(lambda, 0);

        // Điều chỉnh theo current gap
        const avgGap = parseFloat(numData?.avgGap) || (totalDays / count);
        const gapFactor = currentGap >= avgGap ? 1.2 : 0.9;

        let score = probAtLeastOne * gapFactor;
        score = Math.max(0, Math.min(1, score));

        scores[num] = {
            score,
            lambda: Math.round(lambda * 1000) / 1000,
            probAtLeastOne: Math.round(probAtLeastOne * 100) / 100,
            avgFrequency: Math.round(avgFrequency * 10000) / 10000,
            currentGap,
            lookAheadDays
        };
    }

    return scores;
}

// ============ METHOD 4: BAYESIAN PROBABILITY ============
/**
 * Xác suất Bayesian có điều kiện
 * P(số X | số trước đó là Y)
 */
async function getBayesianScores() {
    const data = await distributionService.loadLotteryData();
    const scores = {};

    // Tính transition matrix
    const transitionCounts = {};
    const totalFromNumber = {};

    // Đếm số lần chuyển tiếp
    for (let i = 1; i < data.length; i++) {
        const prevNum = String(data[i - 1].special).padStart(2, '0');
        const currNum = String(data[i].special).padStart(2, '0');

        const key = `${prevNum}->${currNum}`;
        transitionCounts[key] = (transitionCounts[key] || 0) + 1;
        totalFromNumber[prevNum] = (totalFromNumber[prevNum] || 0) + 1;
    }

    // Số gần nhất
    const latestNum = String(data[data.length - 1].special).padStart(2, '0');
    const totalFromLatest = totalFromNumber[latestNum] || 1;

    // Tính xác suất có điều kiện cho mỗi số
    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const key = `${latestNum}->${num}`;
        const count = transitionCounts[key] || 0;

        // P(num | latestNum)
        const conditionalProb = count / totalFromLatest;

        // Prior probability (uniform)
        const priorProb = 0.01;

        // Combined Bayesian score
        // Nếu conditional > prior → số có xu hướng theo sau latestNum
        const score = conditionalProb > priorProb
            ? 0.5 + Math.min(0.5, (conditionalProb / priorProb - 1) * 0.1)
            : 0.3 + conditionalProb * 20;

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            conditionalProb: Math.round(conditionalProb * 10000) / 10000,
            priorProb,
            transitionCount: count,
            givenNumber: latestNum,
            likelihood: conditionalProb > priorProb ? 'Cao hơn kỳ vọng' : 'Thấp hơn kỳ vọng'
        };
    }

    return scores;
}

// ============ METHOD 5: MEAN REVERSION ============
/**
 * Hồi quy về trung bình
 * Số lệch xa trung bình có xu hướng quay lại
 */
async function getMeanReversionScores() {
    const heatmapData = await distributionService.generateNumberHeatmap();
    const { heatmap, totalDays } = heatmapData;

    const expectedCount = totalDays / 100;
    const scores = {};

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const count = heatmap[num]?.count || 0;
        const currentGap = heatmap[num]?.currentGap || 0;
        const avgGap = parseFloat(heatmap[num]?.avgGap) || (totalDays / count);

        // Độ lệch từ trung bình
        const countDeviation = count - expectedCount;
        const gapDeviation = currentGap - avgGap;

        let score = 0.5;

        // Nếu count < expected VÀ gap > avgGap → rất có khả năng revert
        if (countDeviation < 0 && gapDeviation > 0) {
            score = 0.6 + Math.min(0.4, (Math.abs(countDeviation) / expectedCount + gapDeviation / avgGap) * 0.15);
        }
        // Nếu count > expected VÀ gap < avgGap → ít khả năng
        else if (countDeviation > 0 && gapDeviation < 0) {
            score = 0.4 - Math.min(0.3, (countDeviation / expectedCount) * 0.15);
        }
        // Các trường hợp khác
        else if (countDeviation < 0) {
            score = 0.55 + Math.abs(countDeviation) / expectedCount * 0.1;
        } else {
            score = 0.45 - countDeviation / expectedCount * 0.1;
        }

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            countDeviation: Math.round(countDeviation * 100) / 100,
            gapDeviation: Math.round(gapDeviation * 100) / 100,
            expectedCount: Math.round(expectedCount * 100) / 100,
            avgGap: Math.round(avgGap * 100) / 100,
            reversionSignal: countDeviation < 0 && gapDeviation > 0 ? 'Mạnh' : countDeviation > 0 && gapDeviation < 0 ? 'Yếu' : 'Trung bình'
        };
    }

    return scores;
}

// ============ METHOD 6: MOVING AVERAGE DEVIATION ============
/**
 * Độ lệch từ Moving Average 30 ngày
 */
async function getMovingAverageScores(maPeriod = 30) {
    const data = await distributionService.loadLotteryData();
    const recentData = data.slice(-maPeriod);

    // Đếm xuất hiện trong MA period
    const maCount = {};
    for (let i = 0; i < 100; i++) {
        maCount[String(i).padStart(2, '0')] = 0;
    }

    for (const entry of recentData) {
        const num = String(entry.special).padStart(2, '0');
        maCount[num]++;
    }

    const expectedInPeriod = maPeriod / 100;
    const scores = {};

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const count = maCount[num];

        // Dưới MA → điểm cao
        const deviation = count - expectedInPeriod;
        let score = 0.5;

        if (deviation < 0) {
            score = 0.6 + Math.min(0.4, Math.abs(deviation) * 0.15);
        } else if (deviation > 0) {
            score = 0.4 - Math.min(0.3, deviation * 0.1);
        }

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            maCount: count,
            expectedInPeriod: Math.round(expectedInPeriod * 100) / 100,
            deviation: Math.round(deviation * 100) / 100,
            maPeriod,
            trend: deviation < -0.5 ? 'Dưới MA (tốt)' : deviation > 0.5 ? 'Trên MA (xấu)' : 'Gần MA'
        };
    }

    return scores;
}

// ============ METHOD 7: MOMENTUM SCORE ============
/**
 * Xung lực - tốc độ thay đổi tần suất
 * So sánh 15 ngày gần với 15 ngày trước đó
 */
async function getMomentumScores() {
    const data = await distributionService.loadLotteryData();
    const recent15 = data.slice(-15);
    const prev15 = data.slice(-30, -15);

    const recentCount = {};
    const prevCount = {};

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        recentCount[num] = 0;
        prevCount[num] = 0;
    }

    for (const entry of recent15) {
        recentCount[String(entry.special).padStart(2, '0')]++;
    }
    for (const entry of prev15) {
        prevCount[String(entry.special).padStart(2, '0')]++;
    }

    const scores = {};

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const recent = recentCount[num];
        const prev = prevCount[num];

        // Momentum = (recent - prev) / max(1, prev)
        const momentum = (recent - prev) / Math.max(1, (prev + recent) / 2);

        // Momentum âm → số đang "cooling down" → có thể hồi phục
        // Momentum dương → số đang "heating up" → có thể tiếp tục hoặc dừng
        let score = 0.5;

        if (momentum < -0.5 && recent === 0) {
            // Số đã nguội hoàn toàn, có thể sắp xuất hiện
            score = 0.7;
        } else if (momentum < 0) {
            score = 0.55;
        } else if (momentum > 0.5) {
            // Đang nóng, có thể tiếp tục ngắn hạn
            score = 0.45;
        }

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            recentCount: recent,
            prevCount: prev,
            momentum: Math.round(momentum * 100) / 100,
            trend: momentum < -0.5 ? 'Giảm mạnh' : momentum < 0 ? 'Giảm nhẹ' : momentum > 0.5 ? 'Tăng mạnh' : momentum > 0 ? 'Tăng nhẹ' : 'Ổn định'
        };
    }

    return scores;
}

// ============ METHOD 8: CYCLE DETECTION ============
/**
 * Phát hiện chu kỳ xuất hiện
 * Tìm pattern lặp lại trong gaps
 */
async function getCycleScores() {
    const data = await distributionService.loadLotteryData();
    const heatmapData = await distributionService.generateNumberHeatmap();
    const { heatmap, totalDays } = heatmapData;

    const scores = {};

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const numData = heatmap[num];
        const currentGap = numData?.currentGap || 0;
        const avgGap = parseFloat(numData?.avgGap) || 10;
        const maxGap = numData?.maxGap || 30;

        // Tìm các lần xuất hiện
        const appearances = [];
        for (let j = 0; j < data.length; j++) {
            if (String(data[j].special).padStart(2, '0') === num) {
                appearances.push(j);
            }
        }

        // Tính gaps giữa các lần xuất hiện
        const gaps = [];
        for (let j = 1; j < appearances.length; j++) {
            gaps.push(appearances[j] - appearances[j - 1]);
        }

        // Phát hiện chu kỳ: kiểm tra xem gaps có pattern không
        let dominantCycle = avgGap;
        let cycleStrength = 0;

        if (gaps.length >= 5) {
            // Đếm tần suất của các giá trị gap (cho phép ±2)
            const gapFreq = {};
            for (const gap of gaps) {
                const roundedGap = Math.round(gap / 3) * 3; // Round to nearest 3
                gapFreq[roundedGap] = (gapFreq[roundedGap] || 0) + 1;
            }

            // Tìm gap phổ biến nhất
            let maxFreq = 0;
            for (const [gap, freq] of Object.entries(gapFreq)) {
                if (freq > maxFreq) {
                    maxFreq = freq;
                    dominantCycle = parseInt(gap);
                }
            }
            cycleStrength = maxFreq / gaps.length;
        }

        // Score dựa trên vị trí trong chu kỳ
        let score = 0.5;
        const positionInCycle = currentGap / dominantCycle;

        if (positionInCycle >= 0.9 && positionInCycle <= 1.2) {
            // Đúng thời điểm trong chu kỳ
            score = 0.7 + cycleStrength * 0.2;
        } else if (positionInCycle > 1.2) {
            // Quá hạn chu kỳ
            score = 0.6 + Math.min(0.3, (positionInCycle - 1) * 0.15);
        } else {
            // Chưa đến thời điểm
            score = 0.3 + positionInCycle * 0.2;
        }

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            dominantCycle: Math.round(dominantCycle),
            cycleStrength: Math.round(cycleStrength * 100) / 100,
            currentGap,
            positionInCycle: Math.round(positionInCycle * 100) / 100,
            cycleStatus: positionInCycle >= 0.9 && positionInCycle <= 1.2 ? 'Đúng chu kỳ' : positionInCycle > 1.2 ? 'Quá hạn' : 'Chưa đến'
        };
    }

    return scores;
}

// ============ METHOD 9: MARKOV CHAIN ============
/**
 * Xác suất chuyển tiếp Markov
 * Tính P(số tiếp theo | thuộc tính số hôm qua)
 */
async function getMarkovScores() {
    const data = await distributionService.loadLotteryData();
    const scores = {};

    // Định nghĩa các trạng thái dựa trên thuộc tính
    const getState = (num) => {
        const n = parseInt(num);
        const head = Math.floor(n / 10);
        const tail = n % 10;
        const sum = head + tail;

        return {
            isEven: n % 2 === 0,
            headEven: head % 2 === 0,
            tailEven: tail % 2 === 0,
            sumEven: sum % 2 === 0,
            headRange: head < 5 ? 'low' : 'high',
            tailRange: tail < 5 ? 'low' : 'high'
        };
    };

    // Số gần nhất
    const latestNum = String(data[data.length - 1].special).padStart(2, '0');
    const latestState = getState(latestNum);

    // Đếm transitions dựa trên state
    const stateTransitions = {};
    let totalTransitions = 0;

    for (let i = 1; i < data.length; i++) {
        const prevNum = String(data[i - 1].special).padStart(2, '0');
        const currNum = String(data[i].special).padStart(2, '0');
        const prevState = getState(prevNum);
        const currState = getState(currNum);

        // Match specific transitions
        const stateKey = JSON.stringify(prevState);
        if (!stateTransitions[stateKey]) {
            stateTransitions[stateKey] = { total: 0, toEven: 0, toOdd: 0, toSameParity: 0 };
        }
        stateTransitions[stateKey].total++;

        if (parseInt(currNum) % 2 === 0) stateTransitions[stateKey].toEven++;
        else stateTransitions[stateKey].toOdd++;

        if (currState.isEven === prevState.isEven) stateTransitions[stateKey].toSameParity++;

        totalTransitions++;
    }

    const latestStateKey = JSON.stringify(latestState);
    const latestTransitions = stateTransitions[latestStateKey] || { total: 1, toEven: 0.5, toOdd: 0.5, toSameParity: 0.5 };

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const numState = getState(num);

        let score = 0.5;

        // Tính xác suất dựa trên Markov transition
        const isEven = numState.isEven;
        const probNextParity = isEven
            ? latestTransitions.toEven / latestTransitions.total
            : latestTransitions.toOdd / latestTransitions.total;

        const sameParity = numState.isEven === latestState.isEven;
        const probSameParity = latestTransitions.toSameParity / latestTransitions.total;

        // Combine probabilities
        score = probNextParity * 0.6 + (sameParity ? probSameParity : 1 - probSameParity) * 0.4;

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            prevNumber: latestNum,
            transitionProb: Math.round(probNextParity * 100) / 100,
            sameParityProb: Math.round(probSameParity * 100) / 100,
            sameParity
        };
    }

    return scores;
}

// ============ METHOD 10: FIBONACCI GAP ANALYSIS ============
/**
 * Phân tích Gap theo Fibonacci
 * Gap tiến dần theo dãy Fibonacci
 */
async function getFibonacciScores() {
    const heatmapData = await distributionService.generateNumberHeatmap();
    const { heatmap } = heatmapData;

    const scores = {};

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const currentGap = heatmap[num]?.currentGap || 0;

        // Tìm vị trí gần nhất trong dãy Fibonacci
        let closestFib = 1;
        let minDiff = Math.abs(currentGap - 1);
        let fibIndex = 0;

        for (let j = 0; j < FIBONACCI_SEQUENCE.length; j++) {
            const diff = Math.abs(currentGap - FIBONACCI_SEQUENCE[j]);
            if (diff < minDiff) {
                minDiff = diff;
                closestFib = FIBONACCI_SEQUENCE[j];
                fibIndex = j;
            }
        }

        // Xác định next Fibonacci
        const nextFib = FIBONACCI_SEQUENCE[Math.min(fibIndex + 1, FIBONACCI_SEQUENCE.length - 1)];

        // Score cao khi gap gần với số Fibonacci (breakpoint)
        let score = 0.5;

        if (minDiff <= 1) {
            // Đúng vào số Fibonacci → breakpoint!
            score = 0.8;
        } else if (currentGap > closestFib && currentGap < nextFib) {
            // Đang tiến về số Fibonacci tiếp theo
            const progress = (currentGap - closestFib) / (nextFib - closestFib);
            score = 0.5 + progress * 0.3;
        } else if (currentGap > nextFib) {
            // Đã vượt qua Fibonacci → rất có khả năng xuất hiện
            score = 0.7 + Math.min(0.2, (currentGap - nextFib) / nextFib * 0.2);
        }

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            currentGap,
            closestFib,
            nextFib,
            fibIndex,
            distanceToFib: minDiff,
            analysis: minDiff <= 1 ? 'Tại Fibonacci!' : currentGap > nextFib ? 'Vượt Fibonacci' : 'Chưa đến Fibonacci'
        };
    }

    return scores;
}

// ============ METHOD 11: PRIME NUMBER ANALYSIS ============
/**
 * Phân tích số nguyên tố
 * Tần suất và gap của các số nguyên tố (02, 03, 05, 07, ...)
 */
async function getPrimeNumberScores() {
    const heatmapData = await distributionService.generateNumberHeatmap();
    const { heatmap, totalDays } = heatmapData;

    const scores = {};

    // Tính stats riêng cho prime numbers
    let primeTotal = 0;
    let primeCount = 0;

    for (const p of PRIME_NUMBERS) {
        if (p < 100) {
            const num = String(p).padStart(2, '0');
            primeTotal += heatmap[num]?.count || 0;
            primeCount++;
        }
    }

    const primeAvg = primeTotal / primeCount;
    const nonPrimeAvg = (totalDays - primeTotal) / (100 - primeCount);

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const count = heatmap[num]?.count || 0;
        const currentGap = heatmap[num]?.currentGap || 0;
        const avgGap = parseFloat(heatmap[num]?.avgGap) || 10;

        const isP = isPrime(i);
        let score = 0.5;

        if (isP) {
            // Số nguyên tố: đánh giá dựa trên tần suất so với prime avg
            if (count < primeAvg && currentGap > avgGap) {
                score = 0.65 + Math.min(0.25, (avgGap - currentGap) / avgGap * -0.2);
            } else {
                score = 0.5 + (currentGap / avgGap - 1) * 0.1;
            }
        } else {
            // Không phải số nguyên tố
            if (count < nonPrimeAvg && currentGap > avgGap) {
                score = 0.6;
            } else {
                score = 0.45;
            }
        }

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            isPrime: isP,
            count,
            primeAvg: Math.round(primeAvg * 100) / 100,
            nonPrimeAvg: Math.round(nonPrimeAvg * 100) / 100,
            currentGap,
            avgGap: Math.round(avgGap * 100) / 100
        };
    }

    return scores;
}

// ============ METHOD 12: DIGIT SUM PATTERN ============
/**
 * Phân tích mẫu Tổng các chữ số (Tổng Truyền Thống 0-18)
 */
async function getDigitSumScores() {
    const data = await distributionService.loadLotteryData();

    // Đếm tần suất theo digit sum
    const sumCounts = {};
    for (let s = 0; s <= 18; s++) {
        sumCounts[s] = 0;
    }

    for (const entry of data) {
        const sum = getDigitSum(entry.special);
        sumCounts[sum]++;
    }

    // Số gần nhất và digit sum của nó
    const latestNum = data[data.length - 1].special;
    const latestSum = getDigitSum(latestNum);

    // Tìm tần suất transition theo sum
    const sumTransitions = {};
    for (let i = 1; i < data.length; i++) {
        const prevSum = getDigitSum(data[i - 1].special);
        const currSum = getDigitSum(data[i].special);
        const key = prevSum;
        if (!sumTransitions[key]) sumTransitions[key] = {};
        sumTransitions[key][currSum] = (sumTransitions[key][currSum] || 0) + 1;
    }

    const scores = {};
    const totalDays = data.length;

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const numSum = getDigitSum(i);

        // Base probability từ digit sum frequency
        const sumFreq = sumCounts[numSum] / totalDays;

        // Transition probability từ latest sum
        const transitions = sumTransitions[latestSum] || {};
        const transTotal = Object.values(transitions).reduce((a, b) => a + b, 0) || 1;
        const transProb = (transitions[numSum] || 0) / transTotal;

        // Combined score
        let score = sumFreq * 0.4 + transProb * 0.6;
        score = 0.3 + score * 0.5; // Normalize to 0.3-0.8 range

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            digitSum: numSum,
            sumFrequency: Math.round(sumFreq * 10000) / 10000,
            transitionProb: Math.round(transProb * 1000) / 1000,
            latestSum,
            sumCount: sumCounts[numSum]
        };
    }

    return scores;
}

// ============ METHOD 13: MODULAR ARITHMETIC ============
/**
 * Số học đồng dư (mod 5, mod 10)
 * Phân tích theo nhóm đồng dư
 */
async function getModularScores() {
    const data = await distributionService.loadLotteryData();

    // Đếm theo mod 5 và mod 10
    const mod5Counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    const mod10Counts = {};
    for (let m = 0; m < 10; m++) mod10Counts[m] = 0;

    for (const entry of data) {
        const n = entry.special;
        mod5Counts[n % 5]++;
        mod10Counts[n % 10]++;
    }

    // Recent trend (30 ngày)
    const recent30 = data.slice(-30);
    const recentMod5 = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    const recentMod10 = {};
    for (let m = 0; m < 10; m++) recentMod10[m] = 0;

    for (const entry of recent30) {
        const n = entry.special;
        recentMod5[n % 5]++;
        recentMod10[n % 10]++;
    }

    const totalDays = data.length;
    const scores = {};

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        const m5 = i % 5;
        const m10 = i % 10;

        // Historical vs expected
        const expectedMod5 = totalDays / 5;
        const expectedMod10 = totalDays / 10;

        const mod5Dev = (expectedMod5 - mod5Counts[m5]) / expectedMod5;
        const mod10Dev = (expectedMod10 - mod10Counts[m10]) / expectedMod10;

        // Recent trend
        const recentMod5Dev = (30 / 5 - recentMod5[m5]) / (30 / 5);
        const recentMod10Dev = (30 / 10 - recentMod10[m10]) / (30 / 10);

        // Combined score
        let score = 0.5 + mod5Dev * 0.15 + mod10Dev * 0.15 + recentMod5Dev * 0.1 + recentMod10Dev * 0.1;

        scores[num] = {
            score: Math.max(0, Math.min(1, score)),
            mod5: m5,
            mod10: m10,
            mod5Count: mod5Counts[m5],
            mod10Count: mod10Counts[m10],
            mod5Deviation: Math.round(mod5Dev * 100) / 100,
            mod10Deviation: Math.round(mod10Dev * 100) / 100,
            recentMod5Count: recentMod5[m5],
            recentMod10Count: recentMod10[m10]
        };
    }

    return scores;
}

// ============ COMBINED ANALYSIS ============
/**
 * Tổng hợp tất cả các phương pháp phân tích nâng cao
 */
async function getAllAdvancedScores() {
    const [
        chiSquare,
        zScore,
        poisson,
        bayesian,
        meanReversion,
        movingAverage,
        momentum,
        cycle,
        markov,
        fibonacci,
        prime,
        digitSum,
        modular
    ] = await Promise.all([
        getChiSquareScores(),
        getZScoreAnalysis(),
        getPoissonScores(),
        getBayesianScores(),
        getMeanReversionScores(),
        getMovingAverageScores(),
        getMomentumScores(),
        getCycleScores(),
        getMarkovScores(),
        getFibonacciScores(),
        getPrimeNumberScores(),
        getDigitSumScores(),
        getModularScores()
    ]);

    return {
        chiSquare,
        zScore,
        poisson,
        bayesian,
        meanReversion,
        movingAverage,
        momentum,
        cycle,
        markov,
        fibonacci,
        prime,
        digitSum,
        modular
    };
}

/**
 * Lấy chi tiết phân tích nâng cao cho một số cụ thể
 */
async function getNumberAdvancedAnalysis(number) {
    const num = String(number).padStart(2, '0');
    const allScores = await getAllAdvancedScores();

    const result = {
        number: num,
        methods: {}
    };

    // Map method names
    const methodNames = {
        chiSquare: { name: 'Chi-Square Test', icon: 'χ²', description: 'Kiểm định độ lệch khỏi phân phối đều' },
        zScore: { name: 'Z-Score', icon: 'Z', description: 'Chuẩn hóa tần suất xuất hiện' },
        poisson: { name: 'Poisson', icon: 'λ', description: 'Xác suất Poisson trong 7 ngày tới' },
        bayesian: { name: 'Bayesian', icon: 'P', description: 'Xác suất có điều kiện' },
        meanReversion: { name: 'Mean Reversion', icon: 'μ', description: 'Hồi quy về trung bình' },
        movingAverage: { name: 'Moving Average', icon: 'MA', description: 'Độ lệch từ MA-30' },
        momentum: { name: 'Momentum', icon: 'M', description: 'Xung lực thay đổi tần suất' },
        cycle: { name: 'Cycle', icon: '⟳', description: 'Phát hiện chu kỳ xuất hiện' },
        markov: { name: 'Markov Chain', icon: '→', description: 'Xác suất chuyển tiếp' },
        fibonacci: { name: 'Fibonacci', icon: 'F', description: 'Phân tích Gap theo Fibonacci' },
        prime: { name: 'Prime', icon: 'P', description: 'Phân tích số nguyên tố' },
        digitSum: { name: 'Digit Sum', icon: 'Σ', description: 'Mẫu Tổng các chữ số' },
        modular: { name: 'Modular', icon: 'mod', description: 'Số học đồng dư' }
    };

    for (const [key, scores] of Object.entries(allScores)) {
        if (scores[num]) {
            result.methods[key] = {
                ...methodNames[key],
                ...scores[num]
            };
        }
    }

    // Calculate average score
    const methodScores = Object.values(result.methods).map(m => m.score);
    result.averageScore = methodScores.length > 0
        ? Math.round(methodScores.reduce((a, b) => a + b, 0) / methodScores.length * 100) / 100
        : 0.5;

    return result;
}

/**
 * Tạo daily prediction từ 13 phương pháp nâng cao
 * Trả về danh sách số đánh và loại trừ riêng biệt
 */
async function getDailyAdvancedPrediction(options = {}) {
    const topCount = options.topCount || 40;
    const excludeCount = options.excludeCount || 60;

    console.log('[Advanced Analysis] Generating prediction from 13 methods...');

    // Lấy điểm từ tất cả 13 phương pháp
    const allScores = await getAllAdvancedScores();

    // Tính điểm trung bình cho mỗi số
    const combinedScores = {};
    const methodWeights = {
        chiSquare: 0.10,
        zScore: 0.10,
        poisson: 0.08,
        bayesian: 0.08,
        meanReversion: 0.10,
        movingAverage: 0.08,
        momentum: 0.06,
        cycle: 0.08,
        markov: 0.06,
        fibonacci: 0.08,
        prime: 0.04,
        digitSum: 0.08,
        modular: 0.06
    };

    for (let i = 0; i < 100; i++) {
        const num = String(i).padStart(2, '0');
        let weightedScore = 0;
        let totalWeight = 0;
        const methodDetails = {};

        for (const [method, scores] of Object.entries(allScores)) {
            if (scores[num] && !isNaN(scores[num].score)) {
                const weight = methodWeights[method] || (1 / 13);
                weightedScore += scores[num].score * weight;
                totalWeight += weight;
                methodDetails[method] = {
                    score: scores[num].score,
                    weight
                };
            }
        }

        combinedScores[num] = {
            number: num,
            score: totalWeight > 0 ? weightedScore / totalWeight : 0.5,
            methodDetails
        };
    }

    // Sắp xếp theo điểm
    const sortedNumbers = Object.values(combinedScores)
        .sort((a, b) => b.score - a.score);

    // Top N số để đánh
    const predictions = sortedNumbers.slice(0, topCount).map(item => item.number);

    // Bottom M số để loại trừ
    const exclusions = sortedNumbers.slice(-excludeCount).reverse().map(item => item.number);

    const result = {
        date: new Date().toISOString().substring(0, 10),
        generatedAt: new Date().toISOString(),
        method: 'advanced',
        description: 'Kết hợp 13 phương pháp xác suất và số học nâng cao',

        // Danh sách số đánh
        predictions: predictions,
        predictionsCount: predictions.length,

        // Danh sách số loại trừ
        exclusions: exclusions,
        exclusionsCount: exclusions.length,

        // Chi tiết điểm của từng số
        allNumbers: sortedNumbers,

        // Thống kê
        summary: {
            avgScore: sortedNumbers.reduce((sum, n) => sum + n.score, 0) / 100,
            highScoreCount: sortedNumbers.filter(n => n.score >= 0.7).length,
            midScoreCount: sortedNumbers.filter(n => n.score >= 0.5 && n.score < 0.7).length,
            lowScoreCount: sortedNumbers.filter(n => n.score < 0.5).length
        },

        // Trọng số phương pháp
        weights: methodWeights
    };

    console.log(`[Advanced Analysis] Generated: ${predictions.length} predictions, ${exclusions.length} exclusions`);

    return result;
}

module.exports = {
    // Individual methods
    getChiSquareScores,
    getZScoreAnalysis,
    getPoissonScores,
    getBayesianScores,
    getMeanReversionScores,
    getMovingAverageScores,
    getMomentumScores,
    getCycleScores,
    getMarkovScores,
    getFibonacciScores,
    getPrimeNumberScores,
    getDigitSumScores,
    getModularScores,

    // Combined
    getAllAdvancedScores,
    getNumberAdvancedAnalysis,
    getDailyAdvancedPrediction,

    // Constants
    PRIME_NUMBERS,
    FIBONACCI_SEQUENCE
};
