const {
    FEATURE_NAMES,
    extractFeatures,
    fitScaler,
    transform
} = require('./coverageHazardModel');

function sigmoid(value) {
    if (value >= 0) return 1 / (1 + Math.exp(-value));
    const exponential = Math.exp(value);
    return exponential / (1 + exponential);
}

function buildDataset(rows, baseRate) {
    return rows.map(row => {
        const actuals = new Set(row.actualNumbers.map(Number));
        return {
            date: row.date,
            actualNumbers: row.actualNumbers,
            actualOccurrences: row.actualOccurrences,
            samples: row.samples.map(sample => ({
                number: Number(sample.number),
                actual: actuals.has(Number(sample.number)),
                features: extractFeatures(sample, baseRate)
            }))
        };
    });
}

function trainLotoCoverageHazardModel(rows, options = {}) {
    const baseRate = Number(options.baseRate || 0.238);
    const dataset = buildDataset(rows, baseRate);
    const scaler = fitScaler(dataset);
    const dimensions = FEATURE_NAMES.length;
    const weights = Array(dimensions).fill(0);
    const firstMoment = Array(dimensions).fill(0);
    const secondMoment = Array(dimensions).fill(0);
    let intercept = Math.log(baseRate / (1 - baseRate));
    let interceptFirst = 0;
    let interceptSecond = 0;
    const epochs = Math.max(1, Number(options.epochs || 25));
    const learningRate = Math.max(1e-5, Number(options.learningRate || 0.02));
    const l2 = Math.max(0, Number(options.l2 || 1));
    for (let epoch = 0; epoch < epochs; epoch++) {
        const gradient = Array(dimensions).fill(0);
        let interceptGradient = 0;
        for (const row of dataset) {
            for (const sample of row.samples) {
                const vector = transform(sample.features, scaler);
                const logit = intercept + vector.reduce((sum, value, index) => sum + value * weights[index], 0);
                const residual = sigmoid(logit) - Number(sample.actual);
                interceptGradient += residual;
                for (let index = 0; index < dimensions; index++) gradient[index] += residual * vector[index];
            }
        }
        const step = epoch + 1;
        const sampleCount = Math.max(1, dataset.length * 100);
        const interceptValue = interceptGradient / sampleCount;
        interceptFirst = 0.9 * interceptFirst + 0.1 * interceptValue;
        interceptSecond = 0.999 * interceptSecond + 0.001 * interceptValue * interceptValue;
        intercept -= learningRate * (interceptFirst / (1 - 0.9 ** step)) /
            (Math.sqrt(interceptSecond / (1 - 0.999 ** step)) + 1e-8);
        for (let index = 0; index < dimensions; index++) {
            const value = gradient[index] / sampleCount + l2 * weights[index];
            firstMoment[index] = 0.9 * firstMoment[index] + 0.1 * value;
            secondMoment[index] = 0.999 * secondMoment[index] + 0.001 * value * value;
            weights[index] -= learningRate * (firstMoment[index] / (1 - 0.9 ** step)) /
                (Math.sqrt(secondMoment[index] / (1 - 0.999 ** step)) + 1e-8);
        }
    }
    return {
        featureNames: FEATURE_NAMES,
        weights,
        intercept,
        scaler,
        baseRate,
        trainingDays: dataset.length,
        options: { epochs, learningRate, l2 }
    };
}

function scoreLotoRow(row, model) {
    return row.samples.map(sample => {
        const vector = transform(extractFeatures(sample, model.baseRate), model.scaler);
        const logit = model.intercept + vector.reduce((sum, value, index) => sum + value * model.weights[index], 0);
        return { number: Number(sample.number), probability: sigmoid(logit), logit };
    }).sort((left, right) => right.probability - left.probability || left.number - right.number);
}

module.exports = {
    buildDataset,
    scoreLotoRow,
    sigmoid,
    trainLotoCoverageHazardModel
};
