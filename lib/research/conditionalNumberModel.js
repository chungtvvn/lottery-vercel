const FAMILIES = [
    'sum',
    'block',
    'difference',
    'head',
    'tail',
    'head-tail',
    'number',
    'fixed-set',
    'class'
];

const FEATURE_NAMES = [
    'baselineBet',
    'logSupportGroups',
    'supportFamilies',
    'activeGroups',
    'potentialGroups',
    'tier1Groups',
    'logIndependentSets',
    'logActiveSets',
    'logPotentialSets',
    'logTier1Sets',
    'inverseMinSetSize',
    'inverseMeanSetSize',
    'evidenceMass',
    'maxStrength',
    'meanStrength',
    ...FAMILIES.map(family => `familyStrength:${family}`),
    ...FAMILIES.map(family => `familyActive:${family}`),
    ...FAMILIES.map(family => `familyPotential:${family}`)
];

function safeLog1p(value) {
    return Math.log1p(Math.max(0, Number(value) || 0));
}

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function extractFeatures(row, evidence) {
    const baseline = new Set((row.strategies?.chainSmallFirst || []).map(Number));
    const groupDetails = evidence.groupDetails || {};
    const groups = evidence.groups || {};
    const familyStrength = new Map();
    const familyActive = new Map();
    const familyPotential = new Map();
    for (const [group, strength] of Object.entries(groups)) {
        const family = String(group).split('|')[0];
        familyStrength.set(family, Math.max(familyStrength.get(family) || 0, clamp(strength)));
        const detail = groupDetails[group] || {};
        familyActive.set(family, (familyActive.get(family) || 0) + Number(detail.activeSets || 0));
        familyPotential.set(family, (familyPotential.get(family) || 0) + Number(detail.potentialSets || 0));
    }
    return [
        Number(baseline.has(Number(evidence.number))),
        safeLog1p(evidence.supportGroups),
        Number(evidence.supportFamilies || 0),
        Number(evidence.activeGroups || 0),
        Number(evidence.potentialGroups || 0),
        Number(evidence.tier1Groups || 0),
        safeLog1p(evidence.independentSets),
        safeLog1p(evidence.activeSets),
        safeLog1p(evidence.potentialSets),
        safeLog1p(evidence.tier1Sets),
        1 / Math.max(1, Number(evidence.minSetSize || 100)),
        1 / Math.max(1, Number(evidence.meanSetSize || 100)),
        Number(evidence.evidenceMass || 0),
        clamp(evidence.maxStrength),
        clamp(evidence.meanStrength),
        ...FAMILIES.map(family => familyStrength.get(family) || 0),
        ...FAMILIES.map(family => safeLog1p(familyActive.get(family) || 0)),
        ...FAMILIES.map(family => safeLog1p(familyPotential.get(family) || 0))
    ];
}

function buildDataset(rows) {
    return rows.map(row => ({
        date: row.date,
        actual: Number(row.actual),
        baselineNumbers: (row.strategies?.chainSmallFirst || []).map(Number),
        samples: (row.numberEvidence || []).map(evidence => ({
            number: Number(evidence.number),
            features: extractFeatures(row, evidence)
        }))
    })).filter(row => row.samples.length === 100);
}

function fitScaler(dataset) {
    const count = dataset.reduce((sum, row) => sum + row.samples.length, 0);
    const means = Array(FEATURE_NAMES.length).fill(0);
    const squares = Array(FEATURE_NAMES.length).fill(0);
    for (const row of dataset) {
        for (const sample of row.samples) {
            for (let index = 0; index < means.length; index++) {
                const value = Number(sample.features[index] || 0);
                means[index] += value;
                squares[index] += value * value;
            }
        }
    }
    for (let index = 0; index < means.length; index++) {
        means[index] /= Math.max(1, count);
        squares[index] = Math.sqrt(Math.max(1e-8, squares[index] / Math.max(1, count) - means[index] ** 2));
    }
    return { means, scales: squares };
}

function transform(features, scaler) {
    return features.map((value, index) =>
        (Number(value || 0) - scaler.means[index]) / scaler.scales[index]
    );
}

function softmax(values) {
    const maximum = Math.max(...values);
    const exponents = values.map(value => Math.exp(value - maximum));
    const total = exponents.reduce((sum, value) => sum + value, 0);
    return exponents.map(value => value / Math.max(1e-12, total));
}

function trainConditionalModel(rows, options = {}) {
    const dataset = buildDataset(rows);
    const scaler = fitScaler(dataset);
    const dimensions = FEATURE_NAMES.length;
    const weights = Array(dimensions).fill(0);
    const firstMoment = Array(dimensions).fill(0);
    const secondMoment = Array(dimensions).fill(0);
    const epochs = Math.max(1, Number(options.epochs || 100));
    const learningRate = Math.max(1e-5, Number(options.learningRate || 0.03));
    const l2 = Math.max(0, Number(options.l2 || 0.01));
    const beta1 = 0.9;
    const beta2 = 0.999;
    let step = 0;
    let finalLoss = 0;
    for (let epoch = 0; epoch < epochs; epoch++) {
        let epochLoss = 0;
        const gradient = Array(dimensions).fill(0);
        for (const row of dataset) {
            const features = row.samples.map(sample => transform(sample.features, scaler));
            const logits = features.map(vector =>
                vector.reduce((sum, value, index) => sum + value * weights[index], 0)
            );
            const probabilities = softmax(logits);
            const actualIndex = row.samples.findIndex(sample => sample.number === row.actual);
            if (actualIndex < 0) continue;
            epochLoss -= Math.log(Math.max(1e-12, probabilities[actualIndex]));
            for (let sampleIndex = 0; sampleIndex < row.samples.length; sampleIndex++) {
                const residual = probabilities[sampleIndex] - Number(sampleIndex === actualIndex);
                for (let featureIndex = 0; featureIndex < dimensions; featureIndex++) {
                    gradient[featureIndex] += residual * features[sampleIndex][featureIndex];
                }
            }
        }
        step++;
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
        weights,
        scaler,
        trainingDays: dataset.length,
        finalLoss,
        options: { epochs, learningRate, l2 }
    };
}

function scoreRow(row, model) {
    return (row.numberEvidence || []).map(evidence => {
        const features = transform(extractFeatures(row, evidence), model.scaler);
        const score = features.reduce((sum, value, index) => sum + value * model.weights[index], 0);
        return { number: Number(evidence.number), score };
    });
}

function refineBaseline(row, model, options = {}) {
    const baseline = new Set((row.strategies?.chainSmallFirst || []).map(Number));
    const scores = scoreRow(row, model);
    const riskyBets = scores.filter(rowScore => baseline.has(rowScore.number))
        .sort((left, right) => left.score - right.score || left.number - right.number);
    const safeExcluded = scores.filter(rowScore => !baseline.has(rowScore.number))
        .sort((left, right) => right.score - left.score || left.number - right.number);
    const refined = new Set(baseline);
    const swaps = [];
    const swapLimit = Math.max(0, Number(options.swapLimit || 0));
    const minMargin = Math.max(0, Number(options.minMargin || 0));
    for (let index = 0; index < Math.min(riskyBets.length, safeExcluded.length, swapLimit); index++) {
        const out = riskyBets[index];
        const incoming = safeExcluded[index];
        const margin = incoming.score - out.score;
        if (margin < minMargin) break;
        refined.delete(out.number);
        refined.add(incoming.number);
        swaps.push({ out: out.number, in: incoming.number, margin });
    }
    return {
        betNumbers: [...refined].sort((left, right) => left - right),
        swaps,
        scores
    };
}

module.exports = {
    FAMILIES,
    FEATURE_NAMES,
    buildDataset,
    extractFeatures,
    fitScaler,
    refineBaseline,
    scoreRow,
    softmax,
    trainConditionalModel,
    transform
};
