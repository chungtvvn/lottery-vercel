'use strict';

// Point-in-time-safe number-distribution model.
//
// Unlike the broad scoring-form catalog, every partition below is mutually
// exclusive and covers 00-99 exactly once. This lets us inspect whether a
// semantic axis (for example head/tail parity or digit sum) has an observable
// sequential signal without counting nested groups as independent evidence.

const NUMBERS = Array.from({ length: 100 }, (_, number) => number);

const DEFAULTS = {
    minWarmup: 180,
    recentWindow: 90,
    basePriorStrength: 120,
    transitionPriorStrength: 36,
    contextPriorStrength: 24,
    transitionWarmup: 40,
    residualTemperature: 0.28,
    maxTransitionReliability: 0.72,
    maxContextReliability: 0.54,
    maxResidualReliability: 0.36,
    transitionWeight: 0.62,
    contextWeight: 0.23,
    residualWeight: 0.15,
    transitionClip: 1.1,
    contextClip: 0.9,
    residualClip: 2.4,
    minInformativeReliability: 0.08,
    minInformativeSpread: 0.004
};

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function normalizeRows(rows) {
    return (rows || []).map(row => {
        const source = row?.actual ?? row?.special ?? row?.db ?? row?.giaiDb ?? row?.giai_dac_biet;
        return {
            date: isoDate(row?.date || row?.ngay),
            actual: source === null || source === undefined || source === '' ? null : Number(source)
        };
    }).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isInteger(row.actual) && row.actual >= 0 && row.actual < 100)
        .sort((left, right) => left.date.localeCompare(right.date));
}

function numberLabel(number) {
    return String(number).padStart(2, '0');
}

function isPrime(number) {
    if (number < 2) return false;
    for (let divisor = 2; divisor * divisor <= number; divisor += 1) {
        if (number % divisor === 0) return false;
    }
    return true;
}

function makePartition({ id, family = 'general', label, description, categoryForNumber, categoryLabels }) {
    const categories = Object.entries(categoryLabels).map(([categoryId, categoryLabel]) => ({
        id: categoryId,
        label: categoryLabel,
        numbers: NUMBERS.filter(number => categoryForNumber(number) === categoryId)
    })).filter(category => category.numbers.length > 0);
    const categoryIndex = new Map(categories.map((category, index) => [category.id, index]));
    const categoryByNumber = NUMBERS.map(number => categoryIndex.get(categoryForNumber(number)));
    return {
        id,
        family,
        label,
        description,
        categories: categories.map((category, index) => ({
            ...category,
            index,
            structuralProbability: category.numbers.length / NUMBERS.length
        })),
        categoryByNumber
    };
}

function buildSemanticPartitions() {
    const head = number => Math.floor(number / 10);
    const tail = number => number % 10;
    const small = digit => digit <= 4;
    return [
        makePartition({
            id: 'parity',
            family: 'fundamental',
            label: 'Chẵn / lẻ',
            description: 'Phân nhóm theo chẵn hoặc lẻ của toàn bộ số 00–99.',
            categoryForNumber: number => number % 2 === 0 ? 'even' : 'odd',
            categoryLabels: { even: 'Chẵn', odd: 'Lẻ' }
        }),
        makePartition({
            id: 'numberQuartile',
            family: 'fundamental',
            label: 'Bốn khoảng số',
            description: 'Bốn khoảng rời nhau 00–24, 25–49, 50–74 và 75–99; mỗi khoảng có đúng 25 số.',
            categoryForNumber: number => `q${Math.floor(number / 25) + 1}`,
            categoryLabels: {
                q1: '00–24',
                q2: '25–49',
                q3: '50–74',
                q4: '75–99'
            }
        }),
        makePartition({
            id: 'headTailParity',
            family: 'digit-combination',
            label: 'Chẵn lẻ đầu/đít',
            description: 'Bốn nhóm đầu chẵn/đít chẵn, đầu chẵn/đít lẻ, đầu lẻ/đít chẵn, đầu lẻ/đít lẻ.',
            categoryForNumber: number => `${head(number) % 2 === 0 ? 'e' : 'o'}${tail(number) % 2 === 0 ? 'e' : 'o'}`,
            categoryLabels: { ee: 'Đầu chẵn · đít chẵn', eo: 'Đầu chẵn · đít lẻ', oe: 'Đầu lẻ · đít chẵn', oo: 'Đầu lẻ · đít lẻ' }
        }),
        makePartition({
            id: 'headTailSize',
            family: 'digit-combination',
            label: 'Đầu/đít to nhỏ',
            description: 'Bốn nhóm đầu nhỏ/to và đít nhỏ/to; nhỏ là 0–4, to là 5–9.',
            categoryForNumber: number => `${small(head(number)) ? 's' : 'b'}${small(tail(number)) ? 's' : 'b'}`,
            categoryLabels: { ss: 'Đầu nhỏ · đít nhỏ', sb: 'Đầu nhỏ · đít to', bs: 'Đầu to · đít nhỏ', bb: 'Đầu to · đít to' }
        }),
        makePartition({
            id: 'head',
            family: 'digit-coordinate',
            label: 'Đầu số',
            description: 'Mười nhóm theo chữ số đầu 0–9.',
            categoryForNumber: number => `h${head(number)}`,
            categoryLabels: Object.fromEntries(Array.from({ length: 10 }, (_, digit) => [`h${digit}`, `Đầu ${digit}`]))
        }),
        makePartition({
            id: 'tail',
            family: 'digit-coordinate',
            label: 'Đít số',
            description: 'Mười nhóm theo chữ số đít 0–9.',
            categoryForNumber: number => `t${tail(number)}`,
            categoryLabels: Object.fromEntries(Array.from({ length: 10 }, (_, digit) => [`t${digit}`, `Đít ${digit}`]))
        }),
        makePartition({
            id: 'digitSum',
            family: 'digit-arithmetic',
            label: 'Tổng chữ số',
            description: 'Nhóm theo tổng hai chữ số từ 0 đến 18.',
            categoryForNumber: number => `s${head(number) + tail(number)}`,
            categoryLabels: Object.fromEntries(Array.from({ length: 19 }, (_, total) => [`s${total}`, `Tổng ${total}`]))
        }),
        makePartition({
            id: 'digitDiff',
            family: 'digit-arithmetic',
            label: 'Hiệu chữ số',
            description: 'Nhóm theo hiệu tuyệt đối giữa đầu và đít từ 0 đến 9.',
            categoryForNumber: number => `d${Math.abs(head(number) - tail(number))}`,
            categoryLabels: Object.fromEntries(Array.from({ length: 10 }, (_, diff) => [`d${diff}`, `Hiệu ${diff}`]))
        }),
        makePartition({
            id: 'numberClass',
            family: 'fundamental',
            label: 'Loại số',
            description: 'Phân nhóm số nguyên tố, hợp số, 00 và 01 để phủ toàn bộ 100 số không chồng lấn.',
            categoryForNumber: number => number === 0 ? 'zero' : number === 1 ? 'one' : isPrime(number) ? 'prime' : 'composite',
            categoryLabels: { zero: '00', one: '01', prime: 'Số nguyên tố', composite: 'Hợp số' }
        })
    ];
}

function validatePartitions(partitions = buildSemanticPartitions()) {
    const failures = [];
    for (const partition of partitions) {
        const assigned = Array(100).fill(0);
        partition.categories.forEach(category => category.numbers.forEach(number => { assigned[number] += 1; }));
        assigned.forEach((count, number) => {
            if (count !== 1) failures.push(`${partition.id}:${numberLabel(number)}=${count}`);
        });
    }
    return { valid: failures.length === 0, failures };
}

function softmax(values) {
    const maximum = Math.max(...values);
    const exps = values.map(value => Math.exp(clamp(value - maximum, -30, 30)));
    const total = exps.reduce((sum, value) => sum + value, 0) || 1;
    return exps.map(value => value / total);
}

function rankPercentile(values) {
    const output = Array(values.length).fill(0.5);
    const rows = values.map((value, index) => ({ index, value: Number(value) || 0 }))
        .sort((left, right) => right.value - left.value || left.index - right.index);
    const denominator = Math.max(1, rows.length - 1);
    for (let start = 0; start < rows.length;) {
        let end = start + 1;
        while (end < rows.length && Math.abs(rows[end].value - rows[start].value) < 1e-12) end += 1;
        const percentile = 1 - ((start + end - 1) / 2) / denominator;
        for (let index = start; index < end; index += 1) output[rows[index].index] = percentile;
        start = end;
    }
    return output;
}

function emptyMatrix(size) {
    return Array.from({ length: size }, () => Array(size).fill(0));
}

function createPartitionState(partition) {
    const size = partition.categories.length;
    return {
        partition,
        counts: Array(size).fill(0),
        transitions: emptyMatrix(size),
        transitionTotals: Array(size).fill(0),
        recentCounts: Array(size).fill(0),
        recentQueue: [],
        observations: 0,
        previousCategory: null,
        lastCategory: null,
        transitionLogLift: 0,
        transitionEvaluations: 0,
        // A sequential axis should be trusted only for the state that is
        // active right now.  Averaging every origin state can cancel a useful
        // "after A -> B" signal with unrelated transitions from C or D.
        transitionLogLiftBySource: Array(size).fill(0),
        transitionEvaluationsBySource: Array(size).fill(0),
        contextTransitions: new Map(),
        contextTotals: new Map(),
        contextLogLiftBySource: new Map(),
        contextEvaluationsBySource: new Map(),
        residualLogLift: 0,
        residualEvaluations: 0,
        residualLogLiftBySource: Array(size).fill(0),
        residualEvaluationsBySource: Array(size).fill(0)
    };
}

function baseProbabilities(state, config) {
    const denominator = state.observations + config.basePriorStrength;
    return state.partition.categories.map((category, index) => (
        (state.counts[index] + config.basePriorStrength * category.structuralProbability) / Math.max(1, denominator)
    ));
}

function transitionProbabilities(state, base, config) {
    if (!Number.isInteger(state.lastCategory)) return base.slice();
    const total = state.transitionTotals[state.lastCategory];
    const denominator = total + config.transitionPriorStrength;
    return base.map((probability, categoryIndex) => (
        (state.transitions[state.lastCategory][categoryIndex] + config.transitionPriorStrength * probability) / Math.max(1, denominator)
    ));
}

function contextKey(previousCategory, lastCategory) {
    return Number.isInteger(previousCategory) && Number.isInteger(lastCategory)
        ? `${previousCategory}:${lastCategory}`
        : null;
}

// Second-order transitions are smoothed toward the one-step distribution.
// This captures compact sequences such as chẵn-lẻ-lẻ or đầu nhỏ/đít to
// without pretending a sparse exact sequence is a certainty.
function contextualProbabilities(state, transition, config) {
    const key = contextKey(state.previousCategory, state.lastCategory);
    if (!key) return transition.slice();
    const counts = state.contextTransitions.get(key);
    const total = state.contextTotals.get(key) || 0;
    if (!counts || !total) return transition.slice();
    const denominator = total + config.contextPriorStrength;
    return transition.map((probability, categoryIndex) => (
        (counts[categoryIndex] + config.contextPriorStrength * probability) / Math.max(1, denominator)
    ));
}

function residualZ(state, base) {
    const span = state.recentQueue.length;
    return base.map((probability, categoryIndex) => {
        const expected = span * probability;
        const variance = Math.max(1, expected * Math.max(0.0001, 1 - probability));
        return (expected - state.recentCounts[categoryIndex]) / Math.sqrt(variance);
    });
}

function reliability(logLift, evaluations, maxReliability, scale, minimumEvaluations = 30) {
    if (evaluations < minimumEvaluations) return 0;
    const meanLift = logLift / Math.max(1, evaluations);
    if (!Number.isFinite(meanLift) || meanLift <= 0) return 0;
    const sampleRamp = Math.min(1, evaluations / 240);
    return clamp((meanLift / scale) * sampleRamp, 0, maxReliability);
}

function updateState(state, category, config) {
    if (Number.isInteger(state.lastCategory) && state.observations >= config.transitionWarmup) {
        const sourceCategory = state.lastCategory;
        const base = baseProbabilities(state, config);
        const transition = transitionProbabilities(state, base, config);
        const transitionLift = Math.log(Math.max(1e-12, transition[category])) - Math.log(Math.max(1e-12, base[category]));
        state.transitionLogLift += transitionLift;
        state.transitionEvaluations += 1;
        state.transitionLogLiftBySource[sourceCategory] += transitionLift;
        state.transitionEvaluationsBySource[sourceCategory] += 1;

        const key = contextKey(state.previousCategory, sourceCategory);
        if (key) {
            const contextual = contextualProbabilities(state, transition, config);
            const contextLift = Math.log(Math.max(1e-12, contextual[category])) - Math.log(Math.max(1e-12, transition[category]));
            state.contextLogLiftBySource.set(key, (state.contextLogLiftBySource.get(key) || 0) + contextLift);
            state.contextEvaluationsBySource.set(key, (state.contextEvaluationsBySource.get(key) || 0) + 1);
        }

        const residual = residualZ(state, base);
        const residualProbabilities = softmax(residual.map(value => value * config.residualTemperature));
        const residualLift = Math.log(Math.max(1e-12, residualProbabilities[category])) - Math.log(Math.max(1e-12, base[category]));
        state.residualLogLift += residualLift;
        state.residualEvaluations += 1;
        state.residualLogLiftBySource[sourceCategory] += residualLift;
        state.residualEvaluationsBySource[sourceCategory] += 1;
    }

    if (Number.isInteger(state.lastCategory)) {
        state.transitions[state.lastCategory][category] += 1;
        state.transitionTotals[state.lastCategory] += 1;
        const key = contextKey(state.previousCategory, state.lastCategory);
        if (key) {
            const counts = state.contextTransitions.get(key) || Array(state.partition.categories.length).fill(0);
            counts[category] += 1;
            state.contextTransitions.set(key, counts);
            state.contextTotals.set(key, (state.contextTotals.get(key) || 0) + 1);
        }
    }
    state.counts[category] += 1;
    state.observations += 1;
    state.previousCategory = state.lastCategory;
    state.lastCategory = category;
    state.recentQueue.push(category);
    state.recentCounts[category] += 1;
    if (state.recentQueue.length > config.recentWindow) {
        const dropped = state.recentQueue.shift();
        state.recentCounts[dropped] -= 1;
    }
}

function axisSnapshot(state, config) {
    const base = baseProbabilities(state, config);
    const transition = transitionProbabilities(state, base, config);
    const contextual = contextualProbabilities(state, transition, config);
    const residual = residualZ(state, base);
    const residualDistribution = softmax(residual.map(value => value * config.residualTemperature));
    const sourceIndex = state.lastCategory;
    const activeContextKey = contextKey(state.previousCategory, sourceIndex);
    const transitionReliability = reliability(
        Number.isInteger(sourceIndex) ? state.transitionLogLiftBySource[sourceIndex] : 0,
        Number.isInteger(sourceIndex) ? state.transitionEvaluationsBySource[sourceIndex] : 0,
        config.maxTransitionReliability,
        0.018
    );
    const residualReliability = reliability(
        Number.isInteger(sourceIndex) ? state.residualLogLiftBySource[sourceIndex] : 0,
        Number.isInteger(sourceIndex) ? state.residualEvaluationsBySource[sourceIndex] : 0,
        config.maxResidualReliability,
        0.012
    );
    const contextReliability = reliability(
        activeContextKey ? state.contextLogLiftBySource.get(activeContextKey) || 0 : 0,
        activeContextKey ? state.contextEvaluationsBySource.get(activeContextKey) || 0 : 0,
        config.maxContextReliability,
        0.016,
        24
    );
    const transitionBlend = transitionReliability * config.transitionWeight;
    const contextBlend = contextReliability * config.contextWeight;
    const residualBlend = residualReliability * config.residualWeight;
    const forecastDenominator = 1 + transitionBlend + contextBlend + residualBlend;
    const recentSpan = state.recentQueue.length;
    const activeTransitionSample = Number.isInteger(sourceIndex) ? state.transitionTotals[sourceIndex] : 0;
    const categories = state.partition.categories.map((category, index) => {
        const logLift = Math.log(Math.max(1e-12, transition[index]) / Math.max(1e-12, base[index]));
        const forecastProbability = (
            base[index]
            + transitionBlend * transition[index]
            + contextBlend * contextual[index]
            + residualBlend * residualDistribution[index]
        ) / forecastDenominator;
        return {
            id: category.id,
            label: category.label,
            size: category.numbers.length,
            structuralProbability: category.structuralProbability,
            historicalCount: state.counts[index],
            historicalProbability: state.observations ? state.counts[index] / state.observations : category.structuralProbability,
            recentCount: state.recentCounts[index],
            recentProbability: recentSpan ? state.recentCounts[index] / recentSpan : category.structuralProbability,
            baseProbability: base[index],
            transitionProbability: transition[index],
            contextProbability: contextual[index],
            forecastProbability,
            transitionCount: Number.isInteger(sourceIndex) ? state.transitions[sourceIndex][index] : 0,
            transitionLogLift: logLift,
            contextLogLift: Math.log(Math.max(1e-12, contextual[index]) / Math.max(1e-12, transition[index])),
            residualZ: residual[index]
        };
    });
    return {
        id: state.partition.id,
        family: state.partition.family,
        label: state.partition.label,
        description: state.partition.description,
        observations: state.observations,
        recentWindowSize: recentSpan,
        lastCategoryIndex: state.lastCategory,
        lastCategory: Number.isInteger(state.lastCategory) ? categories[state.lastCategory] : null,
        transitionReliability,
        contextReliability,
        residualReliability,
        transitionEvaluations: state.transitionEvaluations,
        residualEvaluations: state.residualEvaluations,
        activeTransitionEvaluations: Number.isInteger(sourceIndex) ? state.transitionEvaluationsBySource[sourceIndex] : 0,
        activeTransitionSample,
        activeContextKey,
        activeContextLabel: Number.isInteger(state.previousCategory) && Number.isInteger(sourceIndex)
            ? `${categories[state.previousCategory].label} → ${categories[sourceIndex].label}`
            : null,
        activeContextEvaluations: activeContextKey ? state.contextEvaluationsBySource.get(activeContextKey) || 0 : 0,
        activeResidualEvaluations: Number.isInteger(sourceIndex) ? state.residualEvaluationsBySource[sourceIndex] : 0,
        categories
    };
}

function createDistributionEngine(rawRows, options = {}) {
    const rows = normalizeRows(rawRows);
    const config = { ...DEFAULTS, ...options };
    const partitions = options.partitions || buildSemanticPartitions();
    const validation = validatePartitions(partitions);
    if (!validation.valid) throw new Error(`Partition không hợp lệ: ${validation.failures.join(', ')}`);
    const states = partitions.map(createPartitionState);
    let index = 0;

    function advance() {
        if (index >= rows.length) return false;
        const actual = rows[index].actual;
        states.forEach(state => updateState(state, state.partition.categoryByNumber[actual], config));
        index += 1;
        return true;
    }

    function prime(targetIndex) {
        while (index < Math.min(targetIndex, rows.length)) advance();
    }

    function rank(optionsForRank = {}) {
        const mode = optionsForRank.mode || 'calibrated';
        const includeEvidence = Boolean(optionsForRank.includeEvidence);
        const axes = states.map(state => axisSnapshot(state, config));
        const values = Array(100).fill(0);
        const evidence = includeEvidence ? Array.from({ length: 100 }, () => []) : null;
        const weightsForAxis = axis => ({
            transitionWeight: ['residual', 'context'].includes(mode) ? 0 : axis.transitionReliability * config.transitionWeight,
            contextWeight: ['transition', 'residual'].includes(mode) ? 0 : axis.contextReliability * config.contextWeight,
            residualWeight: ['transition', 'context'].includes(mode) ? 0 : axis.residualReliability * config.residualWeight
        });
        const activeAxesByFamily = new Map();
        axes.forEach(axis => {
            const weights = weightsForAxis(axis);
            if (weights.transitionWeight + weights.contextWeight + weights.residualWeight <= 0) return;
            activeAxesByFamily.set(axis.family, (activeAxesByFamily.get(axis.family) || 0) + 1);
        });
        axes.forEach((axis, axisIndex) => {
            const { transitionWeight, contextWeight, residualWeight } = weightsForAxis(axis);
            // Related axes (for example head and tail, or sum and difference)
            // share one evidence budget. Adding another view of the same two
            // digits must not count as an independent extra vote.
            const familyScale = 1 / Math.max(1, activeAxesByFamily.get(axis.family) || 0);
            axis.categories.forEach((category, categoryIndex) => {
                const contribution = familyScale * (transitionWeight * clamp(category.transitionLogLift, -config.transitionClip, config.transitionClip)
                    + contextWeight * clamp(category.contextLogLift, -config.contextClip, config.contextClip)
                    + residualWeight * clamp(category.residualZ / 2, -config.residualClip / 2, config.residualClip / 2));
                states[axisIndex].partition.categories[categoryIndex].numbers.forEach(number => {
                    values[number] += contribution;
                    if (includeEvidence && (Math.abs(contribution) > 1e-12 || categoryIndex === axis.lastCategoryIndex)) {
                        evidence[number].push({
                            partitionId: axis.id,
                            family: axis.family,
                            partition: axis.label,
                            category: category.label,
                            transitionProbability: Number(category.transitionProbability.toFixed(5)),
                            baseProbability: Number(category.baseProbability.toFixed(5)),
                            transitionLogLift: Number(category.transitionLogLift.toFixed(4)),
                            contextProbability: Number(category.contextProbability.toFixed(5)),
                            contextLogLift: Number(category.contextLogLift.toFixed(4)),
                            residualZ: Number(category.residualZ.toFixed(3)),
                            transitionReliability: Number(axis.transitionReliability.toFixed(3)),
                            contextReliability: Number(axis.contextReliability.toFixed(3)),
                            residualReliability: Number(axis.residualReliability.toFixed(3)),
                            familyScale: Number(familyScale.toFixed(3)),
                            contribution: Number(contribution.toFixed(4))
                        });
                    }
                });
            });
        });
        const percentiles = rankPercentile(values);
        const ranked = NUMBERS.map(number => ({
            number,
            rawScore: values[number],
            score: Math.round(percentiles[number] * 100),
            rankPercentile: percentiles[number],
            evidence: includeEvidence ? evidence[number].sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution)).slice(0, 6) : undefined
        })).sort((left, right) => right.rawScore - left.rawScore || left.number - right.number)
            .map((row, position) => ({ ...row, rank: position + 1 }));
        const activeReliabilities = axes.map(axis => (
            (['calibrated', 'transition'].includes(mode) ? axis.transitionReliability : 0)
            + (['calibrated', 'context'].includes(mode) ? axis.contextReliability : 0)
            + (['calibrated', 'residual'].includes(mode) ? axis.residualReliability : 0)
        ));
        const activeAxisCount = activeReliabilities.filter(value => value > 0).length;
        const aggregateReliability = activeReliabilities.reduce((sum, value) => sum + value, 0);
        const scoreSpread = Math.max(...values) - Math.min(...values);
        const isInformative = activeAxisCount > 0
            && aggregateReliability >= config.minInformativeReliability
            && scoreSpread >= config.minInformativeSpread;
        return { ranked, axes, activeAxisCount, aggregateReliability, scoreSpread, isInformative };
    }

    // Exposed for research/audit only.  The production snapshot uses `rank`;
    // diagnostics make it possible to verify that a sequential axis genuinely
    // has prequential support instead of appearing influential by accident.
    function diagnostics() {
        return states.map(state => ({
            id: state.partition.id,
            label: state.partition.label,
            sources: state.partition.categories.map((category, index) => ({
                label: category.label,
                transitionEvaluations: state.transitionEvaluationsBySource[index],
                transitionMeanLogLift: state.transitionLogLiftBySource[index] / Math.max(1, state.transitionEvaluationsBySource[index]),
                context: state.partition.categories.map((next, nextIndex) => {
                    const key = contextKey(index, nextIndex);
                    return {
                        label: `${category.label} → ${next.label}`,
                        evaluations: state.contextEvaluationsBySource.get(key) || 0,
                        meanLogLift: (state.contextLogLiftBySource.get(key) || 0) / Math.max(1, state.contextEvaluationsBySource.get(key) || 0)
                    };
                }),
                residualEvaluations: state.residualEvaluationsBySource[index],
                residualMeanLogLift: state.residualLogLiftBySource[index] / Math.max(1, state.residualEvaluationsBySource[index])
            }))
        }));
    }

    return {
        rows,
        config,
        partitions,
        get index() { return index; },
        advance,
        prime,
        rank,
        diagnostics
    };
}

function buildDistributionSnapshot(rawRows, predictionDate, options = {}) {
    const rows = normalizeRows(rawRows);
    const targetDate = isoDate(predictionDate);
    const targetIndex = rows.findIndex(row => row.date >= targetDate);
    const priorLength = targetIndex === -1 ? rows.length : targetIndex;
    const config = { ...DEFAULTS, ...options };
    if (priorLength < config.minWarmup) throw new Error(`Không đủ dữ liệu trước ${targetDate} để chấm phân bổ nhóm.`);
    const engine = createDistributionEngine(rows, config);
    engine.prime(priorLength);
    const result = engine.rank({ mode: options.mode || 'calibrated', includeEvidence: true });
    const issued = result.isInformative;
    const actual = rows.find(row => row.date === targetDate)?.actual;
    const activeAxes = result.axes.map(axis => ({
        id: axis.id,
        family: axis.family,
        label: axis.label,
        description: axis.description,
        observations: axis.observations,
        recentWindowSize: axis.recentWindowSize,
        lastCategory: axis.lastCategory?.label || null,
        transitionReliability: Number(axis.transitionReliability.toFixed(3)),
        contextReliability: Number(axis.contextReliability.toFixed(3)),
        residualReliability: Number(axis.residualReliability.toFixed(3)),
        activeTransitionEvaluations: axis.activeTransitionEvaluations,
        activeTransitionSample: axis.activeTransitionSample,
        activeContextKey: axis.activeContextKey,
        activeContextLabel: axis.activeContextLabel,
        activeContextEvaluations: axis.activeContextEvaluations,
        activeResidualEvaluations: axis.activeResidualEvaluations,
        categories: axis.categories.map(category => ({
            id: category.id,
            label: category.label,
            size: category.size,
            structuralProbability: Number(category.structuralProbability.toFixed(6)),
            historicalCount: category.historicalCount,
            historicalProbability: Number(category.historicalProbability.toFixed(6)),
            recentCount: category.recentCount,
            recentProbability: Number(category.recentProbability.toFixed(6)),
            baseProbability: Number(category.baseProbability.toFixed(6)),
            transitionProbability: Number(category.transitionProbability.toFixed(6)),
            contextProbability: Number(category.contextProbability.toFixed(6)),
            forecastProbability: Number(category.forecastProbability.toFixed(6)),
            transitionCount: category.transitionCount,
            transitionLogLift: Number(category.transitionLogLift.toFixed(4)),
            contextLogLift: Number(category.contextLogLift.toFixed(4)),
            residualZ: Number(category.residualZ.toFixed(3))
        })),
        topTransitions: axis.categories.slice().sort((left, right) => right.transitionLogLift - left.transitionLogLift || left.label.localeCompare(right.label)).slice(0, 3).map(category => ({
            label: category.label,
            baseProbability: Number(category.baseProbability.toFixed(5)),
            transitionProbability: Number(category.transitionProbability.toFixed(5)),
            transitionLogLift: Number(category.transitionLogLift.toFixed(4)),
            contextProbability: Number(category.contextProbability.toFixed(5)),
            contextLogLift: Number(category.contextLogLift.toFixed(4)),
            residualZ: Number(category.residualZ.toFixed(3))
        }))
    }));
    return {
        modelVersion: 'probability-distribution-v4',
        predictionDate: targetDate,
        sourceDataThrough: rows[priorLength - 1]?.date || null,
        strictPointInTime: true,
        mode: options.mode || 'calibrated',
        config: {
            recentWindow: config.recentWindow,
            basePriorStrength: config.basePriorStrength,
            transitionPriorStrength: config.transitionPriorStrength,
            contextPriorStrength: config.contextPriorStrength,
            transitionWeight: config.transitionWeight,
            contextWeight: config.contextWeight,
            residualWeight: config.residualWeight,
            familyNormalization: true
        },
        rankedNumbers: result.ranked.map(row => ({
            ...row,
            rawScore: Number(row.rawScore.toFixed(5)),
            rankPercentile: Number(row.rankPercentile.toFixed(5))
        })),
        topNumbers: issued ? result.ranked.slice(0, options.betCount || 30) : [],
        signalStatus: issued ? 'qualified-semantic-signal' : 'no-qualified-semantic-signal',
        activeAxisCount: result.activeAxisCount,
        aggregateReliability: Number(result.aggregateReliability.toFixed(4)),
        scoreSpread: Number(result.scoreSpread.toFixed(6)),
        abstained: !issued,
        partitionSignals: activeAxes,
        settled: Number.isInteger(actual),
        actual: Number.isInteger(actual) ? actual : null,
        hit: issued && Number.isInteger(actual) ? result.ranked.slice(0, options.betCount || 30).some(row => row.number === actual) : null
    };
}

function runStrictDistributionWalkForward(rawRows, options = {}) {
    const rows = normalizeRows(rawRows);
    const config = { ...DEFAULTS, ...options };
    const betCount = Number(options.betCount || 30);
    if (rows.length <= config.minWarmup) return { rows: [], config, partitions: buildSemanticPartitions() };
    const engine = createDistributionEngine(rows, config);
    engine.prime(config.minWarmup);
    const output = [];
    for (let targetIndex = config.minWarmup; targetIndex < rows.length; targetIndex += 1) {
        const prediction = engine.rank({ mode: options.mode || 'calibrated', includeEvidence: false });
        const issued = prediction.isInformative;
        const numbers = issued
            ? prediction.ranked.slice(0, betCount).map(row => row.number).sort((left, right) => left - right)
            : [];
        const actual = rows[targetIndex].actual;
        output.push({
            date: rows[targetIndex].date,
            actual,
            numbers,
            hit: issued ? numbers.includes(actual) : null,
            abstained: !issued,
            activeAxisCount: prediction.activeAxisCount,
            axes: prediction.axes.map(axis => ({
                id: axis.id,
                transitionReliability: Number(axis.transitionReliability.toFixed(4)),
                contextReliability: Number(axis.contextReliability.toFixed(4)),
                residualReliability: Number(axis.residualReliability.toFixed(4))
            }))
        });
        engine.advance();
    }
    return { rows: output, config, partitions: engine.partitions };
}

module.exports = {
    DEFAULTS,
    NUMBERS,
    buildSemanticPartitions,
    buildDistributionSnapshot,
    createDistributionEngine,
    normalizeRows,
    runStrictDistributionWalkForward,
    validatePartitions
};
