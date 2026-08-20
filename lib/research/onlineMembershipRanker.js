const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function sigmoid(value) {
    if (value >= 0) return 1 / (1 + Math.exp(-value));
    const exp = Math.exp(value);
    return exp / (1 + exp);
}

function buildLayout(strategyIds, config) {
    const familyByStrategy = strategyIds.map(id => {
        if (id.startsWith('chain')) return 0;
        if (id.startsWith('number')) return 1;
        if (id.startsWith('dedup')) return 2;
        return 3;
    });
    const baseCount = 1 + strategyIds.length + 2 + 4;
    const pairs = [];
    if (config.interactions) {
        for (let left = 0; left < strategyIds.length; left++) {
            for (let right = left + 1; right < strategyIds.length; right++) {
                pairs.push([left, right]);
            }
        }
    }
    const pairOffset = baseCount;
    const numberOffset = pairOffset + pairs.length;
    return {
        strategyIds,
        familyByStrategy,
        pairs,
        pairOffset,
        numberOffset,
        size: numberOffset + (config.numberBias ? 100 : 0)
    };
}

function createState(strategyIds, config) {
    const layout = buildLayout(strategyIds, config);
    return {
        layout,
        weights: new Float64Array(layout.size),
        squaredGradients: new Float64Array(layout.size)
    };
}

function featureVector(mask, number, state, config) {
    const { layout } = state;
    const indices = [0];
    const values = [1];
    const selected = [];
    const familyCounts = [0, 0, 0, 0];
    let support = 0;
    for (let index = 0; index < layout.strategyIds.length; index++) {
        const active = Boolean(mask & (1 << index));
        selected.push(active);
        if (!active) continue;
        indices.push(1 + index);
        values.push(1);
        support++;
        familyCounts[layout.familyByStrategy[index]]++;
    }
    const normalizedSupport = support / Math.max(1, layout.strategyIds.length);
    const supportOffset = 1 + layout.strategyIds.length;
    indices.push(supportOffset, supportOffset + 1);
    values.push(normalizedSupport, normalizedSupport * normalizedSupport);
    for (let family = 0; family < familyCounts.length; family++) {
        indices.push(supportOffset + 2 + family);
        values.push(familyCounts[family] / Math.max(1, layout.strategyIds.length));
    }
    layout.pairs.forEach(([left, right], pairIndex) => {
        if (!selected[left] || !selected[right]) return;
        indices.push(layout.pairOffset + pairIndex);
        values.push(1);
    });
    if (config.numberBias) {
        indices.push(layout.numberOffset + number);
        values.push(1);
    }
    return { indices, values };
}

function membershipMasks(row, strategyIds) {
    const sets = strategyIds.map(id => new Set((row.strategies?.[id] || []).map(Number)));
    return ALL_NUMBERS.map(number => {
        let mask = 0;
        sets.forEach((set, index) => {
            if (set.has(number)) mask |= (1 << index);
        });
        return mask;
    });
}

function scoreFeature(state, feature) {
    let score = 0;
    feature.indices.forEach((index, position) => {
        score += state.weights[index] * feature.values[position];
    });
    return score;
}

function rankRow(row, strategyIds, state, config) {
    const masks = membershipMasks(row, strategyIds);
    const ranked = ALL_NUMBERS.map(number => {
        const feature = featureVector(masks[number], number, state, config);
        return { number, feature, score: scoreFeature(state, feature) };
    }).sort((left, right) => right.score - left.score || left.number - right.number);
    return ranked;
}

function updateState(state, ranked, actual, config) {
    const gradients = new Float64Array(state.weights.length);
    for (const item of ranked) {
        const label = Number(item.number === Number(actual));
        const probability = sigmoid(item.score);
        const error = (label - probability) * (label ? config.positiveWeight : 1);
        item.feature.indices.forEach((index, position) => {
            gradients[index] += error * item.feature.values[position];
        });
    }
    const scale = 1 / ranked.length;
    for (let index = 0; index < state.weights.length; index++) {
        state.weights[index] *= config.decay;
        const gradient = gradients[index] * scale - config.l2 * state.weights[index];
        state.squaredGradients[index] += gradient * gradient;
        state.weights[index] += config.learningRate * gradient /
            Math.sqrt(state.squaredGradients[index] + 1e-8);
    }
}

function runOnline(rows, strategyIds, config) {
    const state = createState(strategyIds, config);
    const predictions = [];
    for (const row of rows) {
        const ranked = rankRow(row, strategyIds, state, config);
        predictions.push({
            date: row.date,
            actual: Number(row.actual),
            ranking: ranked.map(item => item.number),
            actualRank: ranked.findIndex(item => item.number === Number(row.actual)) + 1
        });
        updateState(state, ranked, row.actual, config);
    }
    return { state, predictions };
}

module.exports = {
    ALL_NUMBERS,
    buildLayout,
    createState,
    featureVector,
    membershipMasks,
    rankRow,
    runOnline,
    sigmoid,
    updateState
};
