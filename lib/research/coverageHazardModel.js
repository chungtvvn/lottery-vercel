const crypto = require('crypto');

const FEATURE_NAMES = [
    'logHazardRatio',
    'logLifetimeRateRatio',
    'logRate7Ratio',
    'logRate30Ratio',
    'logRate90Ratio',
    'logRate365Ratio',
    'logGapRatio',
    'gapPercentile',
    'missingInCycle',
    'missingCycleProgress',
    'gapReliability',
    'hazardReliability',
    'reliableHazardRatio'
];

function signedLogRatio(value) {
    const numeric = Math.max(1e-6, Number(value) || 1e-6);
    return Math.log(numeric);
}

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function extractFeatures(sample, baseRate) {
    const gapReliability = Math.sqrt(Number(sample.gapSample || 0) / (Number(sample.gapSample || 0) + 20));
    const hazardReliability = Math.sqrt(Number(sample.hazardExposure || 0) / (Number(sample.hazardExposure || 0) + 50));
    const hazardRatio = Number(sample.hazard || baseRate) / Math.max(1e-9, baseRate);
    return [
        signedLogRatio(hazardRatio),
        signedLogRatio(Number(sample.lifetimeRate || baseRate) / baseRate),
        signedLogRatio(Number(sample.rate7 || baseRate) / baseRate),
        signedLogRatio(Number(sample.rate30 || baseRate) / baseRate),
        signedLogRatio(Number(sample.rate90 || baseRate) / baseRate),
        signedLogRatio(Number(sample.rate365 || baseRate) / baseRate),
        Math.log1p(Math.max(0, Number(sample.gapRatio || 0))),
        clamp(sample.gapPercentile),
        Number(Boolean(sample.missingInCycle)),
        Number(Boolean(sample.missingInCycle)) * clamp(Number(sample.cycleProgress || 0) / 2),
        gapReliability,
        hazardReliability,
        signedLogRatio(hazardRatio) * hazardReliability
    ];
}

function fitScaler(dataset) {
    const count = dataset.length * 100;
    const means = Array(FEATURE_NAMES.length).fill(0);
    const scales = Array(FEATURE_NAMES.length).fill(0);
    for (const row of dataset) {
        for (const sample of row.samples) {
            for (let index = 0; index < FEATURE_NAMES.length; index++) {
                const value = sample.features[index];
                means[index] += value;
                scales[index] += value * value;
            }
        }
    }
    for (let index = 0; index < FEATURE_NAMES.length; index++) {
        means[index] /= Math.max(1, count);
        scales[index] = Math.sqrt(Math.max(1e-8, scales[index] / Math.max(1, count) - means[index] ** 2));
    }
    return { means, scales };
}

function transform(features, scaler) {
    return features.map((value, index) => (value - scaler.means[index]) / scaler.scales[index]);
}

function softmax(values) {
    const maximum = Math.max(...values);
    const exponents = values.map(value => Math.exp(value - maximum));
    const total = exponents.reduce((sum, value) => sum + value, 0);
    return exponents.map(value => value / Math.max(1e-12, total));
}

function buildDataset(rows, baseRate = 0.01) {
    return rows.map(row => ({
        date: row.date,
        actual: Number(row.actual),
        samples: row.coverageSamples.map(sample => ({
            number: Number(sample.number),
            features: extractFeatures(sample, baseRate)
        }))
    })).filter(row => row.samples.length === 100);
}

function trainCoverageHazardModel(rows, options = {}) {
    const baseRate = Number(options.baseRate || 0.01);
    const dataset = buildDataset(rows, baseRate);
    const scaler = fitScaler(dataset);
    const dimensions = FEATURE_NAMES.length;
    const weights = Array(dimensions).fill(0);
    const firstMoment = Array(dimensions).fill(0);
    const secondMoment = Array(dimensions).fill(0);
    const epochs = Math.max(1, Number(options.epochs || 30));
    const learningRate = Math.max(1e-5, Number(options.learningRate || 0.02));
    const l2 = Math.max(0, Number(options.l2 || 1));
    for (let epoch = 0; epoch < epochs; epoch++) {
        const gradient = Array(dimensions).fill(0);
        let loss = 0;
        for (const row of dataset) {
            const vectors = row.samples.map(sample => transform(sample.features, scaler));
            const logits = vectors.map(vector => vector.reduce((sum, value, index) => sum + value * weights[index], 0));
            const probabilities = softmax(logits);
            loss -= Math.log(Math.max(1e-12, probabilities[row.actual]));
            for (let number = 0; number < 100; number++) {
                const residual = probabilities[number] - Number(number === row.actual);
                for (let feature = 0; feature < dimensions; feature++) {
                    gradient[feature] += residual * vectors[number][feature];
                }
            }
        }
        const step = epoch + 1;
        for (let index = 0; index < dimensions; index++) {
            const value = gradient[index] / Math.max(1, dataset.length) + l2 * weights[index];
            firstMoment[index] = 0.9 * firstMoment[index] + 0.1 * value;
            secondMoment[index] = 0.999 * secondMoment[index] + 0.001 * value * value;
            const first = firstMoment[index] / (1 - 0.9 ** step);
            const second = secondMoment[index] / (1 - 0.999 ** step);
            weights[index] -= learningRate * first / (Math.sqrt(second) + 1e-8);
        }
        if (epoch === epochs - 1) options.finalLoss = loss / Math.max(1, dataset.length);
    }
    return {
        featureNames: FEATURE_NAMES,
        weights,
        scaler,
        baseRate,
        trainingDays: dataset.length,
        finalLoss: options.finalLoss,
        options: { epochs, learningRate, l2 }
    };
}

function scoreRow(row, model) {
    const logits = row.coverageSamples.map(sample => {
        const vector = transform(extractFeatures(sample, model.baseRate), model.scaler);
        return vector.reduce((sum, value, index) => sum + value * model.weights[index], 0);
    });
    const probabilities = softmax(logits);
    return probabilities.map((probability, number) => ({ number, probability, logit: logits[number] }));
}

function stableTie(date, number, salt) {
    return crypto.createHash('sha256').update(`${salt}|${date}|${number}`).digest().readUInt32BE(0);
}

function refineNumbers(row, baselineNumbers, model, options = {}) {
    const baseline = new Set(baselineNumbers.map(Number));
    const scores = scoreRow(row, model);
    const salt = options.salt || 'coverage-hazard';
    const outgoing = scores.filter(item => baseline.has(item.number)).sort((left, right) =>
        left.probability - right.probability
        || stableTie(row.date, left.number, salt) - stableTie(row.date, right.number, salt)
    );
    const incoming = scores.filter(item => !baseline.has(item.number)).sort((left, right) =>
        right.probability - left.probability
        || stableTie(row.date, left.number, salt) - stableTie(row.date, right.number, salt)
    );
    const result = new Set(baseline);
    const swaps = [];
    const swapLimit = Math.max(0, Number(options.swapLimit || 0));
    const minMargin = Math.max(0, Number(options.minMargin || 0));
    for (let index = 0; index < Math.min(swapLimit, outgoing.length, incoming.length); index++) {
        const margin = incoming[index].probability - outgoing[index].probability;
        if (margin < minMargin) break;
        result.delete(outgoing[index].number);
        result.add(incoming[index].number);
        swaps.push({ out: outgoing[index].number, in: incoming[index].number, margin });
    }
    return { numbers: [...result].sort((left, right) => left - right), swaps, scores };
}

module.exports = {
    FEATURE_NAMES,
    buildDataset,
    extractFeatures,
    fitScaler,
    refineNumbers,
    scoreRow,
    softmax,
    trainCoverageHazardModel,
    transform
};
