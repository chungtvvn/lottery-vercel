'use strict';

// Pure, point-in-time-safe feature and online-ranking helpers.  This module
// deliberately has no data-access dependency so it can be exercised in local
// research jobs as well as the daily R2 cache builder.

const NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BASE_PROBABILITY = 1 / 100;

const DEFAULTS = {
    groupWindow: 180,
    shortWindow: 45,
    trainingWindow: 1095,
    minWarmup: 180,
    calibrationWindow: 180,
    learningRate: 0.12,
    l2: 0.012,
    groupOverlapCap: 0.72,
    maxDiverseGroups: 10,
    groupMinSize: 4,
    groupMaxSize: 50,
    hazardPriorStrength: 50
};

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function normalizeRows(rows) {
    return (rows || []).map(row => {
        const source = row?.actual ?? row?.special ?? row?.db ?? row?.giaiDb ?? row?.giai_dac_biet;
        return {
            date: String(row?.date || row?.ngay || '').slice(0, 10),
            actual: source === null || source === undefined || source === '' ? null : Number(source)
        };
    }).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isInteger(row.actual) && row.actual >= 0 && row.actual < 100)
        .sort((left, right) => left.date.localeCompare(right.date));
}

function familyForForm(form) {
    const id = String(form?.n || 'other');
    if (/^(head|tail|dau|dit)/.test(id)) return 'đầu/đít';
    if (/^(tsum|nsum|sum)/.test(id)) return 'tổng';
    if (/^diff/.test(id)) return 'hiệu';
    if (/^(even|odd|parity|size|big|small)/.test(id)) return 'chẵn lẻ/to nhỏ';
    if (/^\d{2}$/.test(id)) return 'số riêng';
    return id.split('-')[0] || 'khác';
}

function buildGroupCatalog(forms, options = {}) {
    const config = { ...DEFAULTS, ...options };
    const unique = new Map();
    for (const form of forms || []) {
        const numbers = NUMBERS.filter(number => Boolean(form?.checkFunction?.(number)));
        if (numbers.length < config.groupMinSize || numbers.length > config.groupMaxSize) continue;
        const signature = numbers.join(',');
        const current = unique.get(signature) || { numbers, labels: [], families: [] };
        current.labels.push(String(form?.description || form?.n || 'Nhóm số'));
        current.families.push(familyForForm(form));
        unique.set(signature, current);
    }
    const groups = [...unique.values()].map((group, id) => ({
        id,
        numbers: group.numbers,
        size: group.numbers.length,
        probability: group.numbers.length / 100,
        label: group.labels[0],
        aliases: [...new Set(group.labels)].slice(1, 4),
        family: [...new Set(group.families)][0] || 'khác'
    }));
    const byNumber = Array.from({ length: 100 }, () => []);
    groups.forEach(group => group.numbers.forEach(number => byNumber[number].push(group.id)));
    return { groups, byNumber, config: { minSize: config.groupMinSize, maxSize: config.groupMaxSize } };
}

function rankPercentile(values, descending = true) {
    const result = Array(values.length).fill(0.5);
    const rows = values.map((value, index) => ({ value: Number(value) || 0, index }))
        .sort((left, right) => descending ? right.value - left.value : left.value - right.value);
    const denominator = Math.max(1, rows.length - 1);
    for (let start = 0; start < rows.length;) {
        let end = start + 1;
        while (end < rows.length && Math.abs(rows[end].value - rows[start].value) < 1e-12) end += 1;
        const averageRank = (start + end - 1) / 2;
        const percentile = 1 - averageRank / denominator;
        for (let index = start; index < end; index += 1) result[rows[index].index] = percentile;
        start = end;
    }
    return result;
}

function jaccard(left, right) {
    const leftSet = new Set(left || []);
    const rightSet = new Set(right || []);
    let intersection = 0;
    leftSet.forEach(value => { if (rightSet.has(value)) intersection += 1; });
    const union = leftSet.size + rightSet.size - intersection;
    return union ? intersection / union : 0;
}

function softmax(logits) {
    const maximum = Math.max(...logits);
    const exp = logits.map(value => Math.exp(clamp(value - maximum, -30, 30)));
    const total = exp.reduce((sum, value) => sum + value, 0) || 1;
    return exp.map(value => value / total);
}

function wilsonLower(wins, total, z = 1.2815515655446004) {
    if (!total) return 0;
    const probability = wins / total;
    const denominator = 1 + (z * z) / total;
    const centre = probability + (z * z) / (2 * total);
    const margin = z * Math.sqrt((probability * (1 - probability) + (z * z) / (4 * total)) / total);
    return Math.max(0, (centre - margin) / denominator);
}

function createRollingFeatureEngine(rows, catalog, options = {}) {
    const rawRows = normalizeRows(rows);
    const config = { ...DEFAULTS, ...options };
    const groupCounts = Array(catalog.groups.length).fill(0);
    const shortCounts = Array(100).fill(0);
    const longCounts = Array(100).fill(0);
    const occurrences = Array.from({ length: 100 }, () => []);
    let index = 0;

    function incrementGroup(actual, delta) {
        (catalog.byNumber[actual] || []).forEach(groupId => { groupCounts[groupId] += delta; });
    }

    function advance() {
        if (index >= rawRows.length) return false;
        const actual = rawRows[index].actual;
        incrementGroup(actual, 1);
        shortCounts[actual] += 1;
        longCounts[actual] += 1;
        occurrences[actual].push(index);
        if (index >= config.groupWindow) incrementGroup(rawRows[index - config.groupWindow].actual, -1);
        if (index >= config.shortWindow) shortCounts[rawRows[index - config.shortWindow].actual] -= 1;
        if (index >= config.groupWindow) longCounts[rawRows[index - config.groupWindow].actual] -= 1;
        index += 1;
        return true;
    }

    function prime(targetIndex) {
        while (index < Math.min(targetIndex, rawRows.length)) advance();
    }

    function selectedGroups() {
        const span = Math.min(index, config.groupWindow);
        const rowsWithZ = catalog.groups.map(group => {
            const expected = span * group.probability;
            const variance = Math.max(1, expected * (1 - group.probability));
            return { ...group, z: span ? (groupCounts[group.id] - expected) / Math.sqrt(variance) : 0 };
        }).sort((left, right) => Math.abs(right.z) - Math.abs(left.z) || left.id - right.id);
        const selected = [];
        for (const group of rowsWithZ) {
            if (!Number.isFinite(group.z) || Math.abs(group.z) < 0.15) continue;
            if (selected.every(other => jaccard(group.numbers, other.numbers) <= config.groupOverlapCap)) {
                selected.push(group);
                if (selected.length >= config.maxDiverseGroups) break;
            }
        }
        return { span, selected, all: rowsWithZ };
    }

    function groupFeature() {
        const source = selectedGroups();
        const values = NUMBERS.map(number => {
            const evidence = source.selected.filter(group => group.numbers.includes(number))
                .map(group => ({
                    label: group.label,
                    family: group.family,
                    size: group.size,
                    z: Number(group.z.toFixed(3))
                }))
                .sort((left, right) => Math.abs(right.z) - Math.abs(left.z))
                .slice(0, 2);
            const value = evidence.length
                ? evidence.reduce((sum, row) => sum + clamp(row.z, -2.5, 2.5), 0) / evidence.length
                : 0;
            return { value, evidence };
        });
        return { span: source.span, selected: source.selected, values, ranks: rankPercentile(values.map(row => row.value)) };
    }

    function frequencyFeature() {
        const shortSpan = Math.min(index, config.shortWindow);
        const longSpan = Math.min(index, config.groupWindow);
        const priorStrength = 100;
        const values = NUMBERS.map(number => {
            const longProbability = (longCounts[number] + priorStrength * BASE_PROBABILITY) / Math.max(1, longSpan + priorStrength);
            const shortProbability = (shortCounts[number] + priorStrength * BASE_PROBABILITY) / Math.max(1, shortSpan + priorStrength);
            const value = 0.55 * Math.log(longProbability / BASE_PROBABILITY) + 0.45 * Math.log(shortProbability / BASE_PROBABILITY);
            return { value, longProbability, shortProbability, longCount: longCounts[number], shortCount: shortCounts[number] };
        });
        return { shortSpan, longSpan, values, ranks: rankPercentile(values.map(row => row.value)) };
    }

    function hazardFeature() {
        const values = NUMBERS.map(number => {
            const positions = occurrences[number];
            const currentGap = positions.length ? index - 1 - positions.at(-1) : index;
            let atRisk = 1; // Current unfinished gap is censored but contributes exposure.
            let events = 0;
            for (let position = 1; position < positions.length; position += 1) {
                const gap = positions[position] - positions[position - 1] - 1;
                if (gap >= currentGap) atRisk += 1;
                if (gap === currentGap) events += 1;
            }
            const posterior = (events + config.hazardPriorStrength * BASE_PROBABILITY) / (atRisk + config.hazardPriorStrength);
            return {
                value: posterior,
                posterior,
                currentGap,
                atRisk,
                events,
                reliability: atRisk / (atRisk + config.hazardPriorStrength)
            };
        });
        return { values, ranks: rankPercentile(values.map(row => row.value)) };
    }

    function features() {
        const group = groupFeature();
        const frequency = frequencyFeature();
        const hazard = hazardFeature();
        const rowsForNumber = NUMBERS.map(number => ({
            number,
            vector: [
                group.ranks[number] * 2 - 1,
                frequency.ranks[number] * 2 - 1,
                hazard.ranks[number] * 2 - 1,
                (frequency.ranks[number] - hazard.ranks[number])
            ],
            group: group.values[number],
            frequency: frequency.values[number],
            hazard: hazard.values[number]
        }));
        return { rows: rowsForNumber, group, frequency, hazard };
    }

    return {
        rawRows,
        config,
        get index() { return index; },
        advance,
        prime,
        features
    };
}

function predict(featureRows, weights) {
    const logits = featureRows.map(row => row.vector.reduce((sum, value, index) => sum + value * (weights[index] || 0), 0));
    const probabilities = softmax(logits);
    return { logits, probabilities, ranks: rankPercentile(probabilities) };
}

function updateWeights(weights, featureRows, probabilities, actual, config) {
    const actualRow = featureRows[actual];
    if (!actualRow) return weights;
    const expected = Array(weights.length).fill(0);
    featureRows.forEach((row, number) => row.vector.forEach((value, index) => { expected[index] += probabilities[number] * value; }));
    return weights.map((weight, index) => clamp(
        weight * (1 - config.l2) + config.learningRate * (actualRow.vector[index] - expected[index]),
        -2.5,
        2.5
    ));
}

function summarizeCalibration(entries, betCount) {
    const settled = entries || [];
    const wins = settled.filter(row => row.hit).length;
    const logLoss = settled.length ? settled.reduce((sum, row) => sum - Math.log(Math.max(1e-12, row.actualProbability)), 0) / settled.length : null;
    const brier = settled.length ? settled.reduce((sum, row) => sum + row.brier, 0) / settled.length : null;
    const expectedTopMass = settled.length ? settled.reduce((sum, row) => sum + row.topMass, 0) / settled.length : 0;
    const hitRate = settled.length ? wins / settled.length : 0;
    const breakEvenHitRate = betCount / 84;
    return {
        days: settled.length,
        wins,
        losses: settled.length - wins,
        hitRate,
        wilsonLower: wilsonLower(wins, settled.length),
        breakEvenHitRate,
        expectedTopMass,
        logLoss,
        uniformLogLoss: Math.log(100),
        brier,
        uniformBrier: 0.99,
        eligible: settled.length >= 90
            && wilsonLower(wins, settled.length) >= breakEvenHitRate
            && logLoss !== null
            && logLoss <= Math.log(100)
    };
}

function runOnlineModel(rawRows, targetIndex, catalog, options = {}) {
    const config = { ...DEFAULTS, ...options };
    const rows = normalizeRows(rawRows);
    // This must use the same online update path as runStrictWalkForward.
    // Resetting the weights at a rolling three-year boundary made the live
    // snapshot materially different from the strict PIT research result.
    // The model only sees rows before targetIndex, but learns from the full
    // available past in chronological order.
    const startIndex = Math.max(config.minWarmup, 0);
    const engine = createRollingFeatureEngine(rows, catalog, config);
    engine.prime(startIndex);
    let weights = Array(4).fill(0);
    const calibration = [];
    const calibrationStart = Math.max(startIndex, targetIndex - config.calibrationWindow);

    for (let index = startIndex; index < targetIndex; index += 1) {
        const matrix = engine.features();
        const prediction = predict(matrix.rows, weights);
        const actual = rows[index].actual;
        const ordered = NUMBERS.map(number => ({ number, probability: prediction.probabilities[number] }))
            .sort((left, right) => right.probability - left.probability || left.number - right.number);
        if (index >= calibrationStart) {
            const top = ordered.slice(0, options.betCount || 30).map(row => row.number);
            const actualProbability = prediction.probabilities[actual];
            calibration.push({
                hit: top.includes(actual),
                actualProbability,
                topMass: ordered.slice(0, options.betCount || 30).reduce((sum, row) => sum + row.probability, 0),
                brier: prediction.probabilities.reduce((sum, probability, number) => sum + (probability - Number(number === actual)) ** 2, 0)
            });
            if (calibration.length > config.calibrationWindow) calibration.shift();
        }
        weights = updateWeights(weights, matrix.rows, prediction.probabilities, actual, config);
        engine.advance();
    }

    const matrix = engine.features();
    const prediction = predict(matrix.rows, weights);
    return {
        matrix,
        prediction,
        weights: weights.map(value => Number(value.toFixed(6))),
        trainingDays: Math.max(0, targetIndex - startIndex),
        calibration: summarizeCalibration(calibration, options.betCount || 30),
        config
    };
}

function rankNumbers(model, chainConsensus = null, betCount = 30) {
    const hasChain = Boolean(chainConsensus?.effectiveMethods >= 2);
    const chainRanks = hasChain ? rankPercentile(chainConsensus.values || []) : Array(100).fill(0.5);
    const onlineWeight = hasChain ? 0.88 : 1;
    const chainWeight = hasChain ? 0.12 : 0;
    const ranked = NUMBERS.map(number => {
        const row = model.matrix.rows[number];
        const onlineRank = model.prediction.ranks[number];
        const score = 100 * (onlineWeight * onlineRank + chainWeight * chainRanks[number]);
        const agreement = [
            onlineRank >= 0.7,
            model.matrix.group.ranks[number] >= 0.7,
            model.matrix.frequency.ranks[number] >= 0.7,
            model.matrix.hazard.ranks[number] >= 0.7,
            chainRanks[number] >= 0.7
        ].filter(Boolean).length;
        return {
            number,
            score: Number(score.toFixed(2)),
            band: 'D',
            probability: Number(model.prediction.probabilities[number].toFixed(6)),
            relativeConfidence: Number((agreement / (hasChain ? 5 : 4)).toFixed(2)),
            components: {
                onlineModel: Math.round(onlineRank * 100),
                groupResidual: Math.round(model.matrix.group.ranks[number] * 100),
                frequencyPosterior: Math.round(model.matrix.frequency.ranks[number] * 100),
                gapHazard: Math.round(model.matrix.hazard.ranks[number] * 100),
                chainConsensus: Math.round(chainRanks[number] * 100)
            },
            evidence: {
                groupSignals: row.group.evidence,
                frequency: {
                    longCount: row.frequency.longCount,
                    shortCount: row.frequency.shortCount,
                    longPosterior: Number(row.frequency.longProbability.toFixed(5)),
                    shortPosterior: Number(row.frequency.shortProbability.toFixed(5))
                },
                gapHazard: {
                    currentGap: row.hazard.currentGap,
                    posterior: Number(row.hazard.posterior.toFixed(5)),
                    atRisk: row.hazard.atRisk,
                    reliability: Number(row.hazard.reliability.toFixed(3))
                },
                chainMethods: (chainConsensus?.evidenceByNumber?.[number] || []).map(item => item.methodId)
            }
        };
    }).sort((left, right) => right.score - left.score || right.relativeConfidence - left.relativeConfidence || left.number - right.number);
    ranked.forEach((row, index) => {
        row.rank = index + 1;
        row.band = index < 10 ? 'A' : index < betCount ? 'B' : index < 60 ? 'C' : 'D';
    });
    return ranked;
}

function runStrictWalkForward(rawRows, options = {}) {
    const rows = normalizeRows(rawRows);
    const config = { ...DEFAULTS, ...options };
    const catalog = options.catalog;
    if (!catalog?.groups || !catalog?.byNumber) throw new Error('Thiếu group catalog cho score walk-forward.');
    const startIndex = Math.max(config.minWarmup, 0);
    const engine = createRollingFeatureEngine(rows, catalog, config);
    engine.prime(startIndex);
    let weights = Array(4).fill(0);
    const entries = [];
    const betCount = options.betCount || 30;
    for (let index = startIndex; index < rows.length; index += 1) {
        const matrix = engine.features();
        const prediction = predict(matrix.rows, weights);
        const ranked = rankNumbers({ matrix, prediction }, null, betCount);
        const row = rows[index];
        if ((!options.startDate || row.date >= options.startDate) && (!options.endDate || row.date <= options.endDate)) {
            const topNumbers = ranked.slice(0, betCount).map(item => item.number);
            const topMass = ranked.slice(0, betCount)
                .reduce((sum, item) => sum + Number(item.probability || 0), 0);
            const cutoffMargin = Number(ranked[betCount - 1]?.probability || 0)
                - Number(ranked[betCount]?.probability || 0);
            entries.push({
                date: row.date,
                actual: row.actual,
                hit: topNumbers.includes(row.actual),
                numbers: topNumbers,
                topMass: Number(topMass.toFixed(8)),
                cutoffMargin: Number(cutoffMargin.toFixed(8)),
                meanRelativeConfidence: Number((ranked.slice(0, betCount)
                    .reduce((sum, item) => sum + Number(item.relativeConfidence || 0), 0) / betCount).toFixed(4))
            });
        }
        weights = updateWeights(weights, matrix.rows, prediction.probabilities, row.actual, config);
        engine.advance();
    }
    const wins = entries.filter(row => row.hit).length;
    const stakeK = entries.length * betCount * 1000;
    const profitK = wins * 84 * 1000 - stakeK;
    return {
        strictPointInTime: true,
        strategy: 'online-regularized-probability-score-v2',
        config: { ...config, betCount },
        days: entries.length,
        wins,
        losses: entries.length - wins,
        hitRate: entries.length ? wins / entries.length : 0,
        wilsonLower: wilsonLower(wins, entries.length),
        breakEvenHitRate: betCount / 84,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        rows: entries
    };
}

function stableTieValue(date, salt, number) {
    const text = `${date}|${salt}|${number}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function topByValues(values, date, salt, count) {
    return NUMBERS.map(number => ({
        number,
        value: Number(values[number] || 0),
        tie: stableTieValue(date, salt, number)
    })).sort((left, right) => right.value - left.value || left.tie - right.tie || left.number - right.number)
        .slice(0, count);
}

function featureExpertSets(matrix, prediction, date, betCount) {
    const sources = {
        online: prediction.probabilities,
        groupHigh: matrix.group.ranks,
        groupLow: matrix.group.ranks.map(value => 1 - value),
        frequencyHigh: matrix.frequency.ranks,
        frequencyLow: matrix.frequency.ranks.map(value => 1 - value),
        hazardHigh: matrix.hazard.ranks,
        hazardLow: matrix.hazard.ranks.map(value => 1 - value)
    };
    return Object.fromEntries(Object.entries(sources).map(([id, values]) => [
        id,
        topByValues(values, date, `score-v2-expert-${id}`, betCount).map(item => item.number)
    ]));
}

// Online Hedge-style aggregation is deliberately evaluated without a future
// train/test split leak. Each expert gets updated only after that draw has
// settled; the next dàn receives the resulting weights.
function runOnlineExpertEnsemble(rawRows, options = {}) {
    const rows = normalizeRows(rawRows);
    const config = {
        ...DEFAULTS,
        hedgeLearningRate: 0.85,
        hedgeDecay: 0.995,
        ...options
    };
    const catalog = options.catalog;
    if (!catalog?.groups || !catalog?.byNumber) throw new Error('Thiếu group catalog cho ensemble strict PIT.');
    const betCount = options.betCount || 30;
    const startIndex = Math.max(config.minWarmup, 0);
    const engine = createRollingFeatureEngine(rows, catalog, config);
    engine.prime(startIndex);
    let onlineWeights = Array(4).fill(0);
    const expertIds = options.expertIds || ['online', 'groupHigh', 'groupLow', 'frequencyHigh', 'frequencyLow', 'hazardHigh', 'hazardLow'];
    let expertLogWeights = Array(expertIds.length).fill(0);
    const entries = [];

    for (let index = startIndex; index < rows.length; index += 1) {
        const matrix = engine.features();
        const prediction = predict(matrix.rows, onlineWeights);
        const expertSets = featureExpertSets(matrix, prediction, rows[index].date, betCount);
        const normalizedWeights = softmax(expertLogWeights);
        const support = Array(100).fill(0);
        expertIds.forEach((id, expertIndex) => {
            (expertSets[id] || []).forEach(number => { support[number] += normalizedWeights[expertIndex]; });
        });
        const ranked = topByValues(support, rows[index].date, 'score-v2-hedge', 100);
        const topNumbers = ranked.slice(0, betCount).map(item => item.number);
        const actual = rows[index].actual;
        const expertHits = Object.fromEntries(expertIds.map(id => [id, Number((expertSets[id] || []).includes(actual))]));

        if ((!options.startDate || rows[index].date >= options.startDate) && (!options.endDate || rows[index].date <= options.endDate)) {
            entries.push({
                date: rows[index].date,
                actual,
                hit: topNumbers.includes(actual),
                numbers: topNumbers,
                expertWeights: Object.fromEntries(expertIds.map((id, expertIndex) => [id, Number(normalizedWeights[expertIndex].toFixed(4))])),
                expertHits
            });
        }

        expertLogWeights = expertLogWeights.map((value, expertIndex) => {
            const reward = expertHits[expertIds[expertIndex]] - betCount / 100;
            return clamp(value * config.hedgeDecay + config.hedgeLearningRate * reward, -6, 6);
        });
        onlineWeights = updateWeights(onlineWeights, matrix.rows, prediction.probabilities, actual, config);
        engine.advance();
    }

    const wins = entries.filter(entry => entry.hit).length;
    const stakeK = entries.length * betCount * 1000;
    const profitK = wins * 84 * 1000 - stakeK;
    return {
        strictPointInTime: true,
        strategy: 'online-hedge-feature-experts-v2',
        config: { ...config, betCount, expertIds },
        days: entries.length,
        wins,
        losses: entries.length - wins,
        hitRate: entries.length ? wins / entries.length : 0,
        wilsonLower: wilsonLower(wins, entries.length),
        breakEvenHitRate: betCount / 84,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        rows: entries
    };
}

module.exports = {
    BASE_PROBABILITY,
    DEFAULTS,
    NUMBERS,
    buildGroupCatalog,
    normalizeRows,
    rankPercentile,
    runOnlineModel,
    runOnlineExpertEnsemble,
    rankNumbers,
    runStrictWalkForward,
    wilsonLower
};
