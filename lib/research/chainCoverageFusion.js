const crypto = require('crypto');
const {
    extractFeatures: extractCoverageFeatures,
    fitScaler,
    softmax,
    transform
} = require('./coverageHazardModel');

const FAMILY_NAMES = [
    'block', 'fixed-set', 'number', 'head', 'tail',
    'head-tail', 'sum', 'difference', 'class', 'other'
];
const BASELINE_NAMES = [
    'chainSmallFirst',
    'chainBlockFirst',
    'chainCredibleFirst',
    'numberPosteriorDiversity',
    'activeOnlyAvgRisk'
];

const CHAIN_FEATURE_NAMES = [
    'logSupportGroups',
    'logSupportFamilies',
    'logActiveGroups',
    'logPotentialGroups',
    'logTier1Groups',
    'logIndependentSets',
    'logActiveSets',
    'logPotentialSets',
    'logTier1Sets',
    'specificity',
    'logMeanSetSize',
    'evidenceMass',
    'maxStrength',
    'meanStrength',
    ...FAMILY_NAMES.map(name => `family:${name}`),
    ...BASELINE_NAMES.map(name => `baseline:${name}`)
];

const FEATURE_NAMES = [
    ...require('./coverageHazardModel').FEATURE_NAMES.map(name => `coverage:${name}`),
    ...CHAIN_FEATURE_NAMES
];

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function normalizeFamily(value = '') {
    const family = String(value || '').toLowerCase();
    return FAMILY_NAMES.includes(family) ? family : 'other';
}

function approximateStrength(candidate) {
    const trials = Math.max(0, Number(candidate.currentCount ?? candidate.trials ?? 0));
    const continues = Math.min(trials, Math.max(0, Number(candidate.nextCount ?? candidate.successes ?? 0)));
    const breaks = Math.max(0, trials - continues);
    const recordState = String(candidate.recordState || '');
    let alpha = 1.5;
    let beta = 1.5;
    if (recordState === 'never-pattern') {
        alpha = 8;
        beta = 2;
    } else if (recordState === 'at-record' || recordState === 'super-record') {
        alpha = 6;
        beta = 2;
    } else if (Number(candidate.tier) === 2) {
        alpha = 4;
        beta = 2.5;
    } else if (Number(candidate.tier) === 3) {
        alpha = 3;
        beta = 3;
    }
    const posteriorBreak = (breaks + alpha) / Math.max(1, trials + alpha + beta);
    const reliability = trials > 0
        ? Math.sqrt(trials / (trials + 12))
        : (recordState === 'never-pattern' ? 0.42 : 0.1);
    const specificity = 1 / Math.sqrt(Math.max(1, Number(candidate.setSize || candidate.numbers?.length || 100)));
    const tierWeight = Number(candidate.tier) === 1 ? 1
        : Number(candidate.tier) === 2 ? 0.78
            : Number(candidate.tier) === 3 ? 0.54
                : 0.12;
    return clamp(posteriorBreak * (0.45 + reliability * 0.35) *
        (0.58 + specificity * 0.42) * tierWeight);
}

function evidenceFromDiagnostics(candidates = []) {
    const byNumber = Array.from({ length: 100 }, () => new Map());
    for (const candidate of candidates) {
        if (Number(candidate.tier || 4) > 3 || !Array.isArray(candidate.numbers)) continue;
        const numbers = [...new Set(candidate.numbers.map(Number))]
            .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
            .sort((left, right) => left - right);
        if (!numbers.length || numbers.length >= 100) continue;
        const family = normalizeFamily(candidate.family);
        const pattern = String(candidate.pattern || 'other');
        const group = `${family}|${pattern}`;
        const signature = `${group}|${numbers.join(',')}`;
        const strength = approximateStrength(candidate);
        for (const number of numbers) {
            const existing = byNumber[number].get(signature);
            if (!existing || strength > existing.strength) {
                byNumber[number].set(signature, {
                    family,
                    group,
                    strength,
                    active: candidate.state === 'active',
                    potential: candidate.state === 'potential',
                    tier1: Number(candidate.tier) === 1,
                    setSize: numbers.length
                });
            }
        }
    }
    return byNumber.map((values, number) => {
        const rows = [...values.values()];
        const groups = new Map();
        for (const row of rows) {
            if (!groups.has(row.group)) groups.set(row.group, []);
            groups.get(row.group).push(row);
        }
        const groupDetails = {};
        for (const [group, members] of groups) {
            const strengths = members.map(member => member.strength).sort((left, right) => right - left);
            const discounts = [1, 0.5, 0.25, 0.125, 0.0625];
            const combinedStrength = 1 - strengths.slice(0, discounts.length)
                .reduce((remaining, strength, index) => remaining * (1 - strength * discounts[index]), 1);
            groupDetails[group] = {
                maxStrength: strengths[0] || 0,
                combinedStrength,
                independentSets: members.length,
                activeSets: members.filter(member => member.active).length,
                potentialSets: members.filter(member => member.potential).length,
                tier1Sets: members.filter(member => member.tier1).length,
                minSetSize: Math.min(...members.map(member => member.setSize)),
                meanSetSize: members.reduce((sum, member) => sum + member.setSize, 0) / members.length
            };
        }
        const details = Object.values(groupDetails);
        const setSizes = rows.map(row => row.setSize);
        const strengths = rows.map(row => row.strength);
        return {
            number,
            groupDetails,
            supportGroups: groups.size,
            supportFamilies: new Set(rows.map(row => row.family)).size,
            activeGroups: details.filter(detail => detail.activeSets > 0).length,
            potentialGroups: details.filter(detail => detail.potentialSets > 0).length,
            tier1Groups: details.filter(detail => detail.tier1Sets > 0).length,
            independentSets: rows.length,
            activeSets: rows.filter(row => row.active).length,
            potentialSets: rows.filter(row => row.potential).length,
            tier1Sets: rows.filter(row => row.tier1).length,
            minSetSize: setSizes.length ? Math.min(...setSizes) : 100,
            meanSetSize: setSizes.length ? setSizes.reduce((sum, value) => sum + value, 0) / setSizes.length : 100,
            evidenceMass: details.reduce((sum, detail) => sum + detail.combinedStrength, 0),
            maxStrength: strengths.length ? Math.max(...strengths) : 0,
            meanStrength: strengths.length ? strengths.reduce((sum, value) => sum + value, 0) / strengths.length : 0
        };
    });
}

function familyStrength(evidence, family) {
    let maximum = 0;
    for (const [group, detail] of Object.entries(evidence.groupDetails || {})) {
        if (normalizeFamily(group.split('|')[0]) !== family) continue;
        maximum = Math.max(maximum, Number(detail.combinedStrength ?? detail.maxStrength ?? 0));
    }
    return maximum;
}

function extractChainFeatures(evidence, strategies, number) {
    const meanSetSize = Math.max(1, Number(evidence.meanSetSize || 100));
    return [
        Math.log1p(Number(evidence.supportGroups || 0)),
        Math.log1p(Number(evidence.supportFamilies || 0)),
        Math.log1p(Number(evidence.activeGroups || 0)),
        Math.log1p(Number(evidence.potentialGroups || 0)),
        Math.log1p(Number(evidence.tier1Groups || 0)),
        Math.log1p(Number(evidence.independentSets || 0)),
        Math.log1p(Number(evidence.activeSets || 0)),
        Math.log1p(Number(evidence.potentialSets || 0)),
        Math.log1p(Number(evidence.tier1Sets || 0)),
        1 - clamp(Number(evidence.minSetSize || 100) / 100),
        Math.log1p(meanSetSize),
        Math.log1p(Number(evidence.evidenceMass || 0)),
        clamp(evidence.maxStrength),
        clamp(evidence.meanStrength),
        ...FAMILY_NAMES.map(family => familyStrength(evidence, family)),
        ...BASELINE_NAMES.map(name => Number((strategies?.[name] || []).map(Number).includes(number)))
    ];
}

function buildFusionRows(rows, coverageByDate) {
    return rows.map(row => {
        const coverage = coverageByDate.get(row.date);
        const evidence = Array.isArray(row.numberEvidence)
            ? row.numberEvidence
            : evidenceFromDiagnostics(row.candidateDiagnostics);
        if (!Array.isArray(coverage) || coverage.length !== 100 || evidence.length !== 100) return null;
        const evidenceByNumber = new Map(evidence.map(value => [Number(value.number), value]));
        return {
            ...row,
            samples: coverage.map(sample => ({
                number: Number(sample.number),
                features: [
                    ...extractCoverageFeatures(sample, 0.01),
                    ...extractChainFeatures(evidenceByNumber.get(Number(sample.number)) || {}, row.strategies, Number(sample.number))
                ]
            }))
        };
    }).filter(Boolean);
}

function trainFusionModel(rows, options = {}) {
    const scaler = fitScaler(rows);
    const weights = Array(FEATURE_NAMES.length).fill(0);
    const firstMoment = Array(FEATURE_NAMES.length).fill(0);
    const secondMoment = Array(FEATURE_NAMES.length).fill(0);
    const epochs = Math.max(1, Number(options.epochs || 30));
    const learningRate = Math.max(1e-5, Number(options.learningRate || 0.02));
    const l2 = Math.max(0, Number(options.l2 || 1));
    for (let epoch = 0; epoch < epochs; epoch++) {
        const gradient = Array(FEATURE_NAMES.length).fill(0);
        for (const row of rows) {
            const vectors = row.samples.map(sample => transform(sample.features, scaler));
            const probabilities = softmax(vectors.map(vector =>
                vector.reduce((sum, value, index) => sum + value * weights[index], 0)
            ));
            for (let number = 0; number < 100; number++) {
                const residual = probabilities[number] - Number(number === Number(row.actual));
                for (let feature = 0; feature < weights.length; feature++) {
                    gradient[feature] += residual * vectors[number][feature];
                }
            }
        }
        const step = epoch + 1;
        for (let feature = 0; feature < weights.length; feature++) {
            const value = gradient[feature] / Math.max(1, rows.length) + l2 * weights[feature];
            firstMoment[feature] = 0.9 * firstMoment[feature] + 0.1 * value;
            secondMoment[feature] = 0.999 * secondMoment[feature] + 0.001 * value * value;
            weights[feature] -= learningRate * (firstMoment[feature] / (1 - 0.9 ** step)) /
                (Math.sqrt(secondMoment[feature] / (1 - 0.999 ** step)) + 1e-8);
        }
    }
    return { featureNames: FEATURE_NAMES, weights, scaler, options: { epochs, learningRate, l2 } };
}

function scoreFusionRow(row, model) {
    const logits = row.samples.map(sample => transform(sample.features, model.scaler)
        .reduce((sum, value, index) => sum + value * model.weights[index], 0));
    const probabilities = softmax(logits);
    return probabilities.map((probability, number) => ({ number, probability }));
}

function stableTie(date, number, salt) {
    return crypto.createHash('sha256').update(`${salt}|${date}|${number}`).digest().readUInt32BE(0);
}

function refineFusionPrediction(row, baselineNumbers, model, options = {}) {
    const baseline = new Set(baselineNumbers.map(Number));
    const scores = scoreFusionRow(row, model);
    const salt = options.salt || 'chain-coverage-fusion';
    const outgoing = scores.filter(item => baseline.has(item.number)).sort((left, right) =>
        left.probability - right.probability || stableTie(row.date, left.number, salt) - stableTie(row.date, right.number, salt)
    );
    const incoming = scores.filter(item => !baseline.has(item.number)).sort((left, right) =>
        right.probability - left.probability || stableTie(row.date, left.number, salt) - stableTie(row.date, right.number, salt)
    );
    const result = new Set(baseline);
    const swaps = [];
    for (let index = 0; index < Math.min(Number(options.swapLimit || 0), outgoing.length, incoming.length); index++) {
        const margin = incoming[index].probability - outgoing[index].probability;
        if (margin < Number(options.minMargin || 0)) break;
        result.delete(outgoing[index].number);
        result.add(incoming[index].number);
        swaps.push({ out: outgoing[index].number, in: incoming[index].number, margin });
    }
    return { numbers: [...result].sort((left, right) => left - right), swaps, scores };
}

module.exports = {
    BASELINE_NAMES,
    CHAIN_FEATURE_NAMES,
    FAMILY_NAMES,
    FEATURE_NAMES,
    approximateStrength,
    buildFusionRows,
    evidenceFromDiagnostics,
    extractChainFeatures,
    refineFusionPrediction,
    scoreFusionRow,
    trainFusionModel
};
