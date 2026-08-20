const { SETS, BO_GROUPS } = require('../utils/numberAnalysis');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const DEFAULT_WINDOWS = Object.freeze([
    { id: 'history20y', days: 365 * 20 },
    { id: 'yearToDate', calendarYear: true },
    { id: 'days365', days: 365 },
    { id: 'days90', days: 90 },
    { id: 'days30', days: 30 }
]);
const TRANSITION_WINDOWS = Object.freeze([
    { id: 'transition20y', days: 365 * 20 },
    { id: 'transition365', days: 365 }
]);

function normalizeNumbers(values) {
    return [...new Set((values || [])
        .map(Number)
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99))]
        .sort((left, right) => left - right);
}

function buildFamily(id, axis, keys) {
    const groups = keys.map(key => ({
        key,
        numbers: normalizeNumbers(SETS[key])
    }));
    return { id, axis, groups };
}

function createHierarchicalFamilies() {
    return [
        buildFamily('headParity', 'head', ['DAU_CHAN', 'DAU_LE']),
        buildFamily('headSize', 'head', ['DAU_NHO', 'DAU_TO']),
        buildFamily('headExact', 'head', Array.from({ length: 10 }, (_, value) => `DAU_${value}`)),
        buildFamily('tailParity', 'tail', ['DIT_CHAN', 'DIT_LE']),
        buildFamily('tailSize', 'tail', ['DIT_NHO', 'DIT_TO']),
        buildFamily('tailExact', 'tail', Array.from({ length: 10 }, (_, value) => `DIT_${value}`)),
        buildFamily('digitParity', 'digitJoint', ['CHAN_CHAN', 'CHAN_LE', 'LE_CHAN', 'LE_LE']),
        buildFamily('digitSize', 'digitJoint', [
            'DAU_NHO_DIT_NHO',
            'DAU_NHO_DIT_TO',
            'DAU_TO_DIT_NHO',
            'DAU_TO_DIT_TO'
        ]),
        buildFamily('traditionalSumParity', 'traditionalSum', ['TONG_TT_CHAN', 'TONG_TT_LE']),
        buildFamily(
            'traditionalSumExact',
            'traditionalSum',
            Array.from({ length: 10 }, (_, value) => `TONG_TT_${value + 1}`)
        ),
        buildFamily('newSumParity', 'newSum', ['TONG_MOI_CHAN', 'TONG_MOI_LE']),
        buildFamily(
            'newSumExact',
            'newSum',
            Array.from({ length: 19 }, (_, value) => `TONG_MOI_${value}`)
        ),
        buildFamily('differenceParity', 'difference', ['HIEU_CHAN', 'HIEU_LE']),
        buildFamily(
            'differenceExact',
            'difference',
            Array.from({ length: 10 }, (_, value) => `HIEU_${value}`)
        ),
        buildFamily('boGroup', 'bo', BO_GROUPS.map(group => group.setKey))
    ];
}

function validatePartitionFamilies(families) {
    const diagnostics = [];
    for (const family of families) {
        const membership = Array.from({ length: 100 }, () => 0);
        for (const group of family.groups) {
            if (group.numbers.length === 0) {
                throw new Error(`Nhóm ${family.id}/${group.key} không có số.`);
            }
            for (const number of group.numbers) membership[number] += 1;
        }
        const uncovered = ALL_NUMBERS.filter(number => membership[number] === 0);
        const overlapping = ALL_NUMBERS.filter(number => membership[number] > 1);
        if (uncovered.length || overlapping.length) {
            throw new Error(
                `Phân hoạch ${family.id} không hợp lệ: thiếu=${uncovered.join(',')}; trùng=${overlapping.join(',')}.`
            );
        }
        diagnostics.push({
            id: family.id,
            axis: family.axis,
            groups: family.groups.length,
            minSize: Math.min(...family.groups.map(group => group.numbers.length)),
            maxSize: Math.max(...family.groups.map(group => group.numbers.length))
        });
    }
    return diagnostics;
}

function createFamilyIndex(families, draws) {
    return families.map(family => {
        const groupByNumber = new Int16Array(100);
        const groupSets = family.groups.map(group => new Set(group.numbers));
        family.groups.forEach((group, groupIndex) => {
            for (const number of group.numbers) groupByNumber[number] = groupIndex;
        });

        const prefixes = family.groups.map(() => new Int32Array(draws.length + 1));
        const occurrences = family.groups.map(() => []);
        const groupSequence = new Int16Array(draws.length);
        for (let index = 0; index < draws.length; index += 1) {
            const actual = Number(draws[index].special);
            const actualGroup = groupByNumber[actual];
            groupSequence[index] = actualGroup;
            for (let groupIndex = 0; groupIndex < prefixes.length; groupIndex += 1) {
                prefixes[groupIndex][index + 1] = prefixes[groupIndex][index]
                    + (groupIndex === actualGroup ? 1 : 0);
            }
            occurrences[actualGroup].push(index);
        }
        const transitionOccurrences = Array.from(
            { length: family.groups.length },
            () => Array.from({ length: family.groups.length }, () => [])
        );
        const outgoingOccurrences = Array.from(
            { length: family.groups.length },
            () => []
        );
        for (let index = 1; index < groupSequence.length; index += 1) {
            const fromGroup = groupSequence[index - 1];
            const toGroup = groupSequence[index];
            transitionOccurrences[fromGroup][toGroup].push(index);
            outgoingOccurrences[fromGroup].push(index);
        }

        return {
            ...family,
            groupByNumber,
            groupSets,
            prefixes,
            occurrences,
            groupSequence,
            transitionOccurrences,
            outgoingOccurrences
        };
    });
}

function lowerBound(values, target) {
    let left = 0;
    let right = values.length;
    while (left < right) {
        const middle = (left + right) >> 1;
        if (values[middle] < target) left = middle + 1;
        else right = middle;
    }
    return left;
}

function findYearStartIndex(draws, index) {
    const year = String(draws[index].date).slice(0, 4);
    let left = index;
    while (left > 0 && String(draws[left - 1].date).slice(0, 4) === year) left -= 1;
    return left;
}

function countWindow(prefix, start, end) {
    return prefix[end] - prefix[start];
}

function countOccurrencesWindow(occurrences, start, end) {
    return lowerBound(occurrences, end) - lowerBound(occurrences, start);
}

function posteriorLogRatio(count, sampleSize, baselineProbability, priorStrength, clip = 2.5) {
    if (sampleSize <= 0 || baselineProbability <= 0) return 0;
    const posterior = (count + baselineProbability * priorStrength)
        / (sampleSize + priorStrength);
    const value = Math.log(Math.max(1e-9, posterior) / baselineProbability);
    return Math.max(-clip, Math.min(clip, value));
}

function lastOccurrenceGap(occurrences, index) {
    const position = lowerBound(occurrences, index) - 1;
    return position >= 0 ? index - occurrences[position] : index + 1;
}

function buildFeatureRow(draws, familyIndex, index, options = {}) {
    const windows = options.windows || DEFAULT_WINDOWS;
    const priorStrength = Number(options.priorStrength ?? 120);
    const axisIds = [...new Set(familyIndex.map(family => family.axis))];
    const axisFamilies = new Map(axisIds.map(axis => [
        axis,
        familyIndex.filter(family => family.axis === axis)
    ]));
    const yearStart = findYearStartIndex(draws, index);
    const dimension = windows.length + 1 + TRANSITION_WINDOWS.length;
    const featuresByNumber = ALL_NUMBERS.map(() => new Float64Array(dimension));

    for (const number of ALL_NUMBERS) {
        const axisScores = new Map(axisIds.map(axis => [
            axis,
            new Float64Array(dimension)
        ]));

        for (const family of familyIndex) {
            const groupIndex = family.groupByNumber[number];
            const group = family.groups[groupIndex];
            const baselineProbability = group.numbers.length / 100;
            const prefix = family.prefixes[groupIndex];
            const familyFeatures = new Float64Array(dimension);

            windows.forEach((window, featureIndex) => {
                const start = window.calendarYear
                    ? yearStart
                    : Math.max(0, index - Number(window.days || 0));
                const sampleSize = index - start;
                const count = countWindow(prefix, start, index);
                familyFeatures[featureIndex] = posteriorLogRatio(
                    count,
                    sampleSize,
                    baselineProbability,
                    priorStrength
                );
            });

            const gap = lastOccurrenceGap(family.occurrences[groupIndex], index);
            familyFeatures[windows.length] = Math.max(
                -2.5,
                Math.min(2.5, Math.log(Math.max(1e-9, gap * baselineProbability)))
            );
            const previousGroup = family.groupSequence[index - 1];
            TRANSITION_WINDOWS.forEach((window, transitionIndex) => {
                const start = Math.max(1, index - window.days);
                const denominator = countOccurrencesWindow(
                    family.outgoingOccurrences[previousGroup],
                    start,
                    index
                );
                const count = countOccurrencesWindow(
                    family.transitionOccurrences[previousGroup][groupIndex],
                    start,
                    index
                );
                familyFeatures[windows.length + 1 + transitionIndex] = posteriorLogRatio(
                    count,
                    denominator,
                    baselineProbability,
                    Math.max(30, priorStrength / 2)
                );
            });

            const axisScore = axisScores.get(family.axis);
            for (let featureIndex = 0; featureIndex < dimension; featureIndex += 1) {
                axisScore[featureIndex] += familyFeatures[featureIndex];
            }
        }

        const output = featuresByNumber[number];
        for (const axis of axisIds) {
            const score = axisScores.get(axis);
            const divisor = axisFamilies.get(axis).length;
            for (let featureIndex = 0; featureIndex < dimension; featureIndex += 1) {
                output[featureIndex] += score[featureIndex] / divisor;
            }
        }
        for (let featureIndex = 0; featureIndex < dimension; featureIndex += 1) {
            output[featureIndex] /= axisIds.length;
        }
    }

    return {
        date: draws[index].date,
        actual: Number(draws[index].special),
        featuresByNumber
    };
}

function buildFeatureRows(draws, options = {}) {
    const families = options.families || createHierarchicalFamilies();
    validatePartitionFamilies(families);
    const familyIndex = createFamilyIndex(families, draws);
    const minimumHistory = Number(options.minimumHistory ?? 365 * 2);
    const rows = [];
    for (let index = minimumHistory; index < draws.length; index += 1) {
        rows.push(buildFeatureRow(draws, familyIndex, index, options));
    }
    return { rows, families, familyIndex };
}

function dot(weights, features) {
    let value = 0;
    for (let index = 0; index < weights.length; index += 1) {
        value += weights[index] * features[index];
    }
    return value;
}

function softmaxScores(row, weights) {
    const raw = row.featuresByNumber.map(features => dot(weights, features));
    const maximum = Math.max(...raw);
    const exponentials = raw.map(value => Math.exp(value - maximum));
    const total = exponentials.reduce((sum, value) => sum + value, 0);
    return {
        raw,
        probabilities: exponentials.map(value => value / total)
    };
}

function trainConditionalSoftmax(rows, config = {}) {
    if (!rows.length) throw new Error('Không có dữ liệu huấn luyện.');
    const dimension = rows[0].featuresByNumber[0].length;
    const weights = new Float64Array(dimension);
    const epochs = Number(config.epochs ?? 8);
    const learningRate = Number(config.learningRate ?? 0.2);
    const l2 = Number(config.l2 ?? 0.05);

    for (let epoch = 0; epoch < epochs; epoch += 1) {
        const gradient = new Float64Array(dimension);
        for (const row of rows) {
            const { probabilities } = softmaxScores(row, weights);
            for (let featureIndex = 0; featureIndex < dimension; featureIndex += 1) {
                let expected = 0;
                for (let number = 0; number < 100; number += 1) {
                    expected += probabilities[number] * row.featuresByNumber[number][featureIndex];
                }
                gradient[featureIndex] += row.featuresByNumber[row.actual][featureIndex] - expected;
            }
        }
        const epochRate = learningRate / Math.sqrt(epoch + 1);
        for (let featureIndex = 0; featureIndex < dimension; featureIndex += 1) {
            const averageGradient = gradient[featureIndex] / rows.length;
            weights[featureIndex] += epochRate * (
                averageGradient - l2 * weights[featureIndex]
            );
        }
    }
    return Array.from(weights);
}

function evaluateProbabilities(rows, weights) {
    let logLoss = 0;
    let brier = 0;
    for (const row of rows) {
        const { probabilities } = softmaxScores(row, weights);
        logLoss -= Math.log(Math.max(1e-12, probabilities[row.actual]));
        for (let number = 0; number < 100; number += 1) {
            const target = number === row.actual ? 1 : 0;
            brier += (probabilities[number] - target) ** 2;
        }
    }
    return {
        days: rows.length,
        logLoss: logLoss / rows.length,
        uniformLogLoss: Math.log(100),
        logLossLift: Math.log(100) - (logLoss / rows.length),
        brier: brier / rows.length
    };
}

function rankGroupProbabilities(row, weights) {
    const { raw, probabilities } = softmaxScores(row, weights);
    return ALL_NUMBERS.map(number => ({
        number,
        score: raw[number],
        probability: probabilities[number]
    })).sort((left, right) =>
        right.score - left.score
        || left.number - right.number
    );
}

function selectTopNumbers(row, weights, betCount = 30) {
    return rankGroupProbabilities(row, weights)
        .slice(0, betCount)
        .map(item => item.number)
        .sort((left, right) => left - right);
}

function summarizeSelections(rows, selector, options = {}) {
    const stakePerNumberK = Number(options.stakePerNumberK ?? 1000);
    const payoutMultiplier = Number(options.payoutMultiplier ?? 84);
    let wins = 0;
    let stakeK = 0;
    let payoutK = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let currentType = null;
    let currentLength = 0;
    const daily = [];

    for (const row of rows) {
        const numbers = normalizeNumbers(selector(row));
        const hit = numbers.includes(row.actual);
        const dayStake = numbers.length * stakePerNumberK;
        const dayPayout = hit ? stakePerNumberK * payoutMultiplier : 0;
        wins += hit ? 1 : 0;
        stakeK += dayStake;
        payoutK += dayPayout;
        if (currentType === hit) currentLength += 1;
        else {
            currentType = hit;
            currentLength = 1;
        }
        if (hit) longestWin = Math.max(longestWin, currentLength);
        else longestLoss = Math.max(longestLoss, currentLength);
        daily.push({
            date: row.date,
            actual: row.actual,
            numbers,
            hit,
            stakeK: dayStake,
            payoutK: dayPayout,
            profitK: dayPayout - dayStake
        });
    }

    const days = rows.length;
    const profitK = payoutK - stakeK;
    return {
        days,
        wins,
        losses: days - wins,
        hitRate: days ? wins / days : 0,
        averageBetCount: days
            ? daily.reduce((sum, row) => sum + row.numbers.length, 0) / days
            : 0,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin,
        longestLoss,
        daily
    };
}

function annualDistributionDiagnostics(draws, families = createHierarchicalFamilies()) {
    const byYear = new Map();
    for (const draw of draws) {
        const year = String(draw.date).slice(0, 4);
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year).push(Number(draw.special));
    }

    return families.map(family => {
        const groupByNumber = new Int16Array(100);
        family.groups.forEach((group, groupIndex) => {
            for (const number of group.numbers) groupByNumber[number] = groupIndex;
        });
        const years = [];
        for (const [year, values] of byYear.entries()) {
            if (values.length < 300) continue;
            const counts = Array.from({ length: family.groups.length }, () => 0);
            for (const number of values) counts[groupByNumber[number]] += 1;
            let chiSquare = 0;
            let totalVariation = 0;
            family.groups.forEach((group, groupIndex) => {
                const expectedProbability = group.numbers.length / 100;
                const expected = values.length * expectedProbability;
                chiSquare += expected > 0 ? ((counts[groupIndex] - expected) ** 2) / expected : 0;
                totalVariation += Math.abs((counts[groupIndex] / values.length) - expectedProbability);
            });
            years.push({
                year,
                days: values.length,
                chiSquare,
                totalVariation: totalVariation / 2
            });
        }
        return {
            id: family.id,
            axis: family.axis,
            groups: family.groups.length,
            years: years.length,
            averageChiSquare: years.reduce((sum, row) => sum + row.chiSquare, 0)
                / Math.max(1, years.length),
            averageTotalVariation: years.reduce((sum, row) => sum + row.totalVariation, 0)
                / Math.max(1, years.length),
            worstTotalVariation: Math.max(0, ...years.map(row => row.totalVariation))
        };
    });
}

module.exports = {
    DEFAULT_WINDOWS,
    TRANSITION_WINDOWS,
    createHierarchicalFamilies,
    validatePartitionFamilies,
    createFamilyIndex,
    buildFeatureRow,
    buildFeatureRows,
    posteriorLogRatio,
    trainConditionalSoftmax,
    evaluateProbabilities,
    rankGroupProbabilities,
    selectTopNumbers,
    summarizeSelections,
    annualDistributionDiagnostics
};
