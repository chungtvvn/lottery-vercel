const crypto = require('crypto');

const MEMBERSHIP_METHODS = [
    'chainSmallFirst',
    'chainBlockFirst',
    'chainCredibleFirst',
    'chainRiskFirst',
    'numberAvgRisk',
    'numberConsensusRisk',
    'numberPosteriorDiversity',
    'numberLikelihoodRatio',
    'numberWeightedRisk',
    'activeOnlyAvgRisk',
    'dedupEdge50Hold'
];

const FEATURE_NAMES = [
    ...MEMBERSHIP_METHODS.map(method => `in:${method}`),
    'voteFraction',
    'smallAndBlock',
    'smallAndActive',
    'blockAndActive'
];

function methodSets(row) {
    return Object.fromEntries(MEMBERSHIP_METHODS.map(method => [
        method,
        new Set((row.strategies?.[method] || []).map(Number))
    ]));
}

function extractNumberFeatures(row, number) {
    const sets = methodSets(row);
    const memberships = MEMBERSHIP_METHODS.map(method => Number(sets[method].has(number)));
    const byMethod = Object.fromEntries(MEMBERSHIP_METHODS.map((method, index) => [method, memberships[index]]));
    return [
        ...memberships,
        memberships.reduce((sum, value) => sum + value, 0) / MEMBERSHIP_METHODS.length,
        byMethod.chainSmallFirst * byMethod.chainBlockFirst,
        byMethod.chainSmallFirst * byMethod.activeOnlyAvgRisk,
        byMethod.chainBlockFirst * byMethod.activeOnlyAvgRisk
    ];
}

function buildDataset(rows) {
    return rows.map(row => ({
        date: row.date,
        actual: Number(row.actual),
        baselineNumbers: row.strategies.chainSmallFirst.map(Number),
        samples: Array.from({ length: 100 }, (_, number) => ({
            number,
            features: extractNumberFeatures(row, number)
        }))
    }));
}

function fitScaler(dataset) {
    const dimensions = FEATURE_NAMES.length;
    const count = dataset.length * 100;
    const means = Array(dimensions).fill(0);
    const squares = Array(dimensions).fill(0);
    for (const row of dataset) {
        for (const sample of row.samples) {
            for (let index = 0; index < dimensions; index++) {
                const value = sample.features[index];
                means[index] += value;
                squares[index] += value * value;
            }
        }
    }
    for (let index = 0; index < dimensions; index++) {
        means[index] /= Math.max(1, count);
        squares[index] = Math.sqrt(Math.max(1e-8, squares[index] / Math.max(1, count) - means[index] ** 2));
    }
    return { means, scales: squares };
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

function trainMembershipModel(rows, options = {}) {
    const dataset = buildDataset(rows);
    const scaler = fitScaler(dataset);
    const dimensions = FEATURE_NAMES.length;
    const weights = Array(dimensions).fill(0);
    const firstMoment = Array(dimensions).fill(0);
    const secondMoment = Array(dimensions).fill(0);
    const epochs = Math.max(1, Number(options.epochs || 30));
    const learningRate = Math.max(1e-5, Number(options.learningRate || 0.02));
    const l2 = Math.max(0, Number(options.l2 || 0.2));
    const beta1 = 0.9;
    const beta2 = 0.999;
    let finalLoss = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
        const gradient = Array(dimensions).fill(0);
        let epochLoss = 0;
        for (const row of dataset) {
            const vectors = row.samples.map(sample => transform(sample.features, scaler));
            const logits = vectors.map(vector => vector.reduce((sum, value, index) => sum + value * weights[index], 0));
            const probabilities = softmax(logits);
            epochLoss -= Math.log(Math.max(1e-12, probabilities[row.actual]));
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
            firstMoment[index] = beta1 * firstMoment[index] + (1 - beta1) * value;
            secondMoment[index] = beta2 * secondMoment[index] + (1 - beta2) * value * value;
            const correctedFirst = firstMoment[index] / (1 - beta1 ** step);
            const correctedSecond = secondMoment[index] / (1 - beta2 ** step);
            weights[index] -= learningRate * correctedFirst / (Math.sqrt(correctedSecond) + 1e-8);
        }
        finalLoss = epochLoss / Math.max(1, dataset.length);
    }

    return {
        featureNames: FEATURE_NAMES,
        membershipMethods: MEMBERSHIP_METHODS,
        weights,
        scaler,
        trainingDays: dataset.length,
        finalLoss,
        options: { epochs, learningRate, l2 }
    };
}

function stableTie(date, number, salt) {
    return crypto.createHash('sha256').update(`${salt}|${date}|${number}`).digest().readUInt32BE(0);
}

function scoreRow(row, model) {
    const logits = Array.from({ length: 100 }, (_, number) => {
        const vector = transform(extractNumberFeatures(row, number), model.scaler);
        return vector.reduce((sum, value, index) => sum + value * model.weights[index], 0);
    });
    const probabilities = softmax(logits);
    return probabilities.map((probability, number) => ({ number, probability, logit: logits[number] }));
}

function refineBaseline(row, model, options = {}) {
    const baseline = new Set(row.strategies.chainSmallFirst.map(Number));
    const scores = scoreRow(row, model);
    const salt = options.salt || 'walkforward-membership';
    const current = scores.filter(item => baseline.has(item.number)).sort((left, right) =>
        left.probability - right.probability
        || stableTie(row.date, left.number, salt) - stableTie(row.date, right.number, salt)
    );
    const excluded = scores.filter(item => !baseline.has(item.number)).sort((left, right) =>
        right.probability - left.probability
        || stableTie(row.date, left.number, salt) - stableTie(row.date, right.number, salt)
    );
    const refined = new Set(baseline);
    const swaps = [];
    const swapLimit = Math.max(0, Number(options.swapLimit || 0));
    const minMargin = Math.max(0, Number(options.minMargin || 0));
    for (let index = 0; index < Math.min(swapLimit, current.length, excluded.length); index++) {
        const outgoing = current[index];
        const incoming = excluded[index];
        const margin = incoming.probability - outgoing.probability;
        if (margin < minMargin) break;
        refined.delete(outgoing.number);
        refined.add(incoming.number);
        swaps.push({ out: outgoing.number, in: incoming.number, margin });
    }
    return {
        betNumbers: [...refined].sort((left, right) => left - right),
        swaps,
        scores
    };
}

module.exports = {
    FEATURE_NAMES,
    MEMBERSHIP_METHODS,
    buildDataset,
    extractNumberFeatures,
    fitScaler,
    refineBaseline,
    scoreRow,
    softmax,
    trainMembershipModel,
    transform
};
