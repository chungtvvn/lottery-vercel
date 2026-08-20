'use strict';

const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function safeLog(value) {
    return Math.log1p(Math.max(0, Number(value) || 0));
}

function sigmoid(value) {
    return 1 / (1 + Math.exp(-Number(value || 0)));
}

function softmax(values) {
    const maximum = Math.max(...values);
    const exponents = values.map(value => Math.exp(value - maximum));
    const total = exponents.reduce((sum, value) => sum + value, 0);
    return exponents.map(value => value / Math.max(total, 1e-12));
}

function familyWeight(family) {
    return family === 'block' ? 1.1
        : family === 'number' ? 1
            : family === 'fixed-set' ? 0.9
                : 0.75;
}

function normalizeCandidates(candidates) {
    const unique = new Map();
    for (const raw of candidates || []) {
        const numbers = [...new Set((raw.numbers || []).map(Number))]
            .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
            .sort((left, right) => left - right);
        if (numbers.length === 0 || numbers.length >= 100) continue;
        const family = String(raw.family || 'other');
        const key = `${family}|${numbers.join(',')}`;
        const candidate = {
            ...raw,
            numbers,
            family,
            state: String(raw.state || ''),
            recordState: String(raw.recordState || ''),
            tier: Math.max(1, Number(raw.tier || 4)),
            setSize: numbers.length,
            currentLen: Math.max(0, Number(raw.currentLen || 0)),
            recordLen: Math.max(0, Number(raw.recordLen || 0)),
            exposureFrequencyPerYear: Math.max(0, Number(raw.exposureFrequencyPerYear || 0))
        };
        const previous = unique.get(key);
        const previousScore = previous
            ? (5 - previous.tier) * 100 + previous.currentLen * 3 - previous.setSize
            : -Infinity;
        const nextScore = (5 - candidate.tier) * 100 + candidate.currentLen * 3 - candidate.setSize;
        if (!previous || nextScore > previousScore) unique.set(key, candidate);
    }
    return [...unique.values()];
}

function candidateFeaturesForNumber(number, candidates, smallBets) {
    const memberships = candidates.filter(candidate => candidate.numbers.includes(number));
    const bestByFamily = new Map();
    for (const candidate of memberships) {
        const score = (5 - candidate.tier) * 3 + candidate.currentLen / 4 +
            1 / Math.sqrt(candidate.setSize) + 1 / (1 + candidate.exposureFrequencyPerYear);
        const previous = bestByFamily.get(candidate.family);
        if (!previous || score > previous.score) bestByFamily.set(candidate.family, { candidate, score });
    }
    const rows = [...bestByFamily.values()].map(row => row.candidate);
    const active = rows.filter(row => row.state === 'active');
    const potential = rows.filter(row => row.state === 'potential');
    const tier1 = rows.filter(row => row.tier === 1);
    const recordActive = active.filter(row => ['at-record', 'super-record'].includes(row.recordState));
    const neverPotential = potential.filter(row => row.recordState === 'never-pattern');
    const average = (values, fallback = 0) => values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : fallback;
    const supportMass = rows.reduce((sum, row) => sum + familyWeight(row.family) / Math.sqrt(row.setSize), 0);
    return [
        Number(smallBets.has(number)),
        rows.length / 9,
        active.length / 9,
        potential.length / 9,
        tier1.length / 6,
        1 / Math.max(1, Math.min(...rows.map(row => row.setSize), 100)),
        1 / Math.max(1, average(rows.map(row => row.setSize), 100)),
        average(rows.map(row => Math.min(12, row.currentLen)), 0) / 12,
        recordActive.length / 4,
        neverPotential.length / 4,
        average(rows.map(row => 1 / (1 + row.exposureFrequencyPerYear)), 0),
        Number(rows.some(row => row.family === 'block')),
        Number(rows.some(row => row.family === 'number')),
        Number(rows.some(row => row.family === 'fixed-set')),
        Math.min(1, supportMass / 4),
        safeLog(memberships.length) / safeLog(30)
    ];
}

function buildDataset(rows) {
    return (rows || []).map(row => {
        const candidates = normalizeCandidates(row.candidateDiagnostics);
        const smallBets = new Set((row.strategies?.chainSmallFirst || []).map(Number));
        return {
            date: row.date,
            actual: Number(row.actual),
            baseline: [...smallBets].sort((left, right) => left - right),
            samples: ALL_NUMBERS.map(number => ({
                number,
                features: candidateFeaturesForNumber(number, candidates, smallBets)
            }))
        };
    }).filter(row => row.baseline.length === 30 && Number.isInteger(row.actual));
}

function fitScaler(dataset) {
    const dimension = dataset[0]?.samples[0]?.features.length || 0;
    const count = Math.max(1, dataset.length * 100);
    const means = Array(dimension).fill(0);
    const squares = Array(dimension).fill(0);
    for (const row of dataset) {
        for (const sample of row.samples) {
            sample.features.forEach((value, index) => {
                means[index] += value;
                squares[index] += value * value;
            });
        }
    }
    return {
        means: means.map(value => value / count),
        scales: squares.map((value, index) => Math.sqrt(Math.max(1e-8, value / count - (means[index] / count) ** 2)))
    };
}

function transform(values, scaler) {
    return values.map((value, index) => (value - scaler.means[index]) / scaler.scales[index]);
}

function trainSafetyModel(rows, options = {}) {
    const dataset = buildDataset(rows);
    if (!dataset.length) throw new Error('Không có daily diagnostics hợp lệ để train safety model.');
    const scaler = fitScaler(dataset);
    const dimensions = scaler.means.length;
    const weights = Array(dimensions).fill(0);
    const firstMoment = Array(dimensions).fill(0);
    const secondMoment = Array(dimensions).fill(0);
    const epochs = Math.max(1, Number(options.epochs || 80));
    const learningRate = Math.max(0.0001, Number(options.learningRate || 0.02));
    const l2 = Math.max(0, Number(options.l2 || 0.01));
    let finalLoss = 0;
    let iteration = 0;
    for (let epoch = 0; epoch < epochs; epoch++) {
        const gradient = Array(dimensions).fill(0);
        let loss = 0;
        for (const row of dataset) {
            const vectors = row.samples.map(sample => transform(sample.features, scaler));
            const scores = vectors.map(vector => vector.reduce((sum, value, index) => sum + value * weights[index], 0));
            const probabilities = softmax(scores);
            const actualIndex = row.samples.findIndex(sample => sample.number === row.actual);
            loss -= Math.log(Math.max(1e-12, probabilities[actualIndex] || 0));
            vectors.forEach((vector, sampleIndex) => {
                const residual = probabilities[sampleIndex] - Number(sampleIndex === actualIndex);
                vector.forEach((value, index) => { gradient[index] += residual * value; });
            });
        }
        iteration++;
        weights.forEach((weight, index) => {
            const value = gradient[index] / dataset.length + l2 * weight;
            firstMoment[index] = 0.9 * firstMoment[index] + 0.1 * value;
            secondMoment[index] = 0.999 * secondMoment[index] + 0.001 * value * value;
            const first = firstMoment[index] / (1 - 0.9 ** iteration);
            const second = secondMoment[index] / (1 - 0.999 ** iteration);
            weights[index] -= learningRate * first / (Math.sqrt(second) + 1e-8);
        });
        finalLoss = loss / dataset.length;
    }
    return { weights, scaler, options: { epochs, learningRate, l2 }, trainingDays: dataset.length, finalLoss };
}

function rankRow(row, model) {
    const datasetRow = buildDataset([row])[0];
    const ranked = datasetRow.samples.map(sample => ({
        number: sample.number,
        score: transform(sample.features, model.scaler)
            .reduce((sum, value, index) => sum + value * model.weights[index], 0)
    })).sort((left, right) => right.score - left.score || left.number - right.number);
    return { baseline: datasetRow.baseline, ranked };
}

function refineSmallChain(row, model, options = {}) {
    const { baseline, ranked } = rankRow(row, model);
    const baselineSet = new Set(baseline);
    const limit = Math.max(0, Number(options.swapLimit || 0));
    const margin = Number(options.minMargin || 0);
    const rankByNumber = new Map(ranked.map(item => [item.number, item]));
    const outgoing = baseline.slice().sort((left, right) => rankByNumber.get(left).score - rankByNumber.get(right).score || left - right);
    const incoming = ranked.filter(item => !baselineSet.has(item.number));
    const final = new Set(baseline);
    const swaps = [];
    for (let index = 0; index < Math.min(limit, outgoing.length, incoming.length); index++) {
        const out = outgoing[index];
        const candidate = incoming[index];
        if (candidate.score - rankByNumber.get(out).score < margin) continue;
        final.delete(out);
        final.add(candidate.number);
        swaps.push({ out, in: candidate.number, margin: candidate.score - rankByNumber.get(out).score });
    }
    return { betNumbers: [...final].sort((left, right) => left - right), swaps, ranked };
}

module.exports = {
    buildDataset,
    refineSmallChain,
    trainSafetyModel
};
