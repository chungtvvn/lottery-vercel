'use strict';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function binomialCoefficient(n, k) {
    const total = Number(n);
    let selected = Number(k);
    if (!Number.isInteger(total) || !Number.isInteger(selected) || total < 0 || selected < 0 || selected > total) {
        return 0n;
    }
    selected = Math.min(selected, total - selected);
    let result = 1n;
    for (let index = 1; index <= selected; index++) {
        result = (result * BigInt(total - selected + index)) / BigInt(index);
    }
    return result;
}

function combinationHitProbability(populationSize, selectedCount) {
    const n = Number(populationSize);
    const k = Number(selectedCount);
    if (!Number.isInteger(n) || !Number.isInteger(k) || n <= 0 || k < 0 || k > n) return 0;
    if (k === 0) return 0;
    const hitCombinations = binomialCoefficient(n - 1, k - 1);
    const allCombinations = binomialCoefficient(n, k);
    return Number(hitCombinations) / Number(allCombinations);
}

function logGamma(value) {
    const coefficients = [
        676.5203681218851,
        -1259.1392167224028,
        771.3234287776531,
        -176.6150291621406,
        12.507343278686905,
        -0.13857109526572012,
        9.984369578019572e-6,
        1.5056327351493116e-7
    ];
    if (value < 0.5) {
        return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
    }
    let shifted = value - 1;
    let sum = 0.9999999999998099;
    for (let index = 0; index < coefficients.length; index++) {
        sum += coefficients[index] / (shifted + index + 1);
    }
    const t = shifted + coefficients.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum);
}

function logBinomialProbability(trials, successes, probability) {
    const n = Number(trials);
    const k = Number(successes);
    const p = Number(probability);
    if (k < 0 || k > n || p < 0 || p > 1) return Number.NEGATIVE_INFINITY;
    if (p === 0) return k === 0 ? 0 : Number.NEGATIVE_INFINITY;
    if (p === 1) return k === n ? 0 : Number.NEGATIVE_INFINITY;
    return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1) +
        k * Math.log(p) + (n - k) * Math.log1p(-p);
}

function binomialTail(trials, minimumSuccesses, probability) {
    const n = Number(trials);
    const minimum = Math.max(0, Math.ceil(Number(minimumSuccesses)));
    if (minimum <= 0) return 1;
    if (minimum > n) return 0;
    let total = 0;
    for (let successes = minimum; successes <= n; successes++) {
        total += Math.exp(logBinomialProbability(n, successes, probability));
    }
    return clamp(total, 0, 1);
}

function probabilityAtLeastHits(selectedCount, positions = 27, minimumHits = 1, populationSize = 100) {
    const perPosition = combinationHitProbability(populationSize, selectedCount);
    return binomialTail(positions, minimumHits, perPosition);
}

function seededRandom(seed) {
    let state = Number(seed) >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function monteCarloBinomial(options = {}) {
    const trials = Math.max(1, Number(options.trials || 1));
    const paths = Math.max(1, Number(options.paths || 10000));
    const probability = clamp(Number(options.probability || 0), 0, 1);
    const stakePerDay = Number(options.stakePerDay || 0);
    const payoutPerHit = Number(options.payoutPerHit || 0);
    const observedHits = Number(options.observedHits ?? Number.POSITIVE_INFINITY);
    const random = seededRandom(options.seed || 20260718);
    const profits = new Array(paths);
    let atLeastObserved = 0;
    for (let pathIndex = 0; pathIndex < paths; pathIndex++) {
        let hits = 0;
        for (let trial = 0; trial < trials; trial++) hits += Number(random() < probability);
        profits[pathIndex] = hits * payoutPerHit - trials * stakePerDay;
        atLeastObserved += Number(hits >= observedHits);
    }
    profits.sort((left, right) => left - right);
    const percentile = probabilityValue => profits[Math.floor((profits.length - 1) * probabilityValue)];
    return {
        paths,
        trials,
        probability,
        probabilityAtLeastObserved: atLeastObserved / paths,
        probabilityPositiveProfit: profits.filter(value => value > 0).length / paths,
        profitP05: percentile(0.05),
        profitMedian: percentile(0.5),
        profitP95: percentile(0.95)
    };
}

function dot(weights, features) {
    let sum = 0;
    for (let index = 0; index < weights.length; index++) sum += weights[index] * features[index];
    return sum;
}

function softmaxProbabilities(weights, row) {
    const scores = row.numbers.map(item => dot(weights, item.features));
    const maximum = Math.max(...scores);
    const exponentials = scores.map(score => Math.exp(clamp(score - maximum, -30, 30)));
    const total = exponentials.reduce((sum, value) => sum + value, 0);
    return exponentials.map(value => value / Math.max(total, 1e-12));
}

function standardizeRows(rows, standardizer = null) {
    if (!rows.length) return { rows: [], standardizer: { means: [], scales: [] } };
    const dimensions = rows[0].numbers[0].features.length;
    const means = standardizer ? standardizer.means : new Array(dimensions).fill(0);
    const scales = standardizer ? standardizer.scales : new Array(dimensions).fill(1);
    if (!standardizer) {
        let count = 0;
        for (const row of rows) {
            for (const item of row.numbers) {
                count++;
                for (let index = 0; index < dimensions; index++) means[index] += item.features[index];
            }
        }
        for (let index = 0; index < dimensions; index++) means[index] /= count;
        const variances = new Array(dimensions).fill(0);
        for (const row of rows) {
            for (const item of row.numbers) {
                for (let index = 0; index < dimensions; index++) {
                    const difference = item.features[index] - means[index];
                    variances[index] += difference * difference;
                }
            }
        }
        for (let index = 0; index < dimensions; index++) {
            scales[index] = Math.sqrt(variances[index] / Math.max(1, count));
            if (!Number.isFinite(scales[index]) || scales[index] < 1e-8) scales[index] = 1;
        }
    }
    const normalized = rows.map(row => ({
        ...row,
        numbers: row.numbers.map(item => ({
            ...item,
            features: item.features.map((value, index) => (value - means[index]) / scales[index])
        }))
    }));
    return { rows: normalized, standardizer: { means, scales } };
}

function trainSoftmax(rows, options = {}) {
    if (!rows.length) throw new Error('Không có dữ liệu để train softmax.');
    const dimensions = rows[0].numbers[0].features.length;
    const weights = new Float64Array(dimensions);
    const epochs = Math.max(1, Number(options.epochs || 5));
    const baseLearningRate = Number(options.learningRate || 0.02);
    const l2 = Math.max(0, Number(options.l2 || 0.01));
    for (let epoch = 0; epoch < epochs; epoch++) {
        const learningRate = baseLearningRate / Math.sqrt(epoch + 1);
        for (const row of rows) {
            const probabilities = softmaxProbabilities(weights, row);
            const gradient = new Float64Array(dimensions);
            for (let position = 0; position < row.numbers.length; position++) {
                const item = row.numbers[position];
                const coefficient = probabilities[position] - Number(item.number === row.actual);
                for (let index = 0; index < dimensions; index++) {
                    gradient[index] += coefficient * item.features[index];
                }
            }
            for (let index = 0; index < dimensions; index++) {
                weights[index] -= learningRate * (gradient[index] + l2 * weights[index]);
                weights[index] = clamp(weights[index], -8, 8);
            }
        }
    }
    return [...weights];
}

function predictTopK(row, weights, count) {
    const probabilities = softmaxProbabilities(weights, row);
    return row.numbers
        .map((item, index) => ({ number: item.number, probability: probabilities[index] }))
        .sort((left, right) => right.probability - left.probability || left.number - right.number)
        .slice(0, count)
        .map(item => item.number)
        .sort((left, right) => left - right);
}

function evaluateRows(rows, selector, options = {}) {
    const count = Number(options.count || 30);
    const stakeK = Number(options.stakeK || 1000);
    const payoutMultiplier = Number(options.payoutMultiplier || 84);
    let hits = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let currentWin = 0;
    let currentLoss = 0;
    const details = [];
    for (const row of rows) {
        const numbers = selector(row);
        const hit = numbers.includes(row.actual);
        hits += Number(hit);
        currentWin = hit ? currentWin + 1 : 0;
        currentLoss = hit ? 0 : currentLoss + 1;
        longestWin = Math.max(longestWin, currentWin);
        longestLoss = Math.max(longestLoss, currentLoss);
        details.push({ date: row.date, actual: row.actual, hit, numbers });
    }
    const stakeTotalK = rows.length * count * stakeK;
    const payoutK = hits * payoutMultiplier * stakeK;
    return {
        days: rows.length,
        hits,
        losses: rows.length - hits,
        hitRate: rows.length ? hits / rows.length : 0,
        stakeK: stakeTotalK,
        payoutK,
        profitK: payoutK - stakeTotalK,
        roi: stakeTotalK ? (payoutK - stakeTotalK) / stakeTotalK : 0,
        longestWin,
        longestLoss,
        details
    };
}

module.exports = {
    binomialCoefficient,
    binomialTail,
    combinationHitProbability,
    evaluateRows,
    monteCarloBinomial,
    predictTopK,
    probabilityAtLeastHits,
    softmaxProbabilities,
    standardizeRows,
    trainSoftmax
};
