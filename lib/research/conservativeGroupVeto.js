const { rankGroupProbabilities } = require('./hierarchicalSetDistribution');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);

function stableTieValue(date, methodId, number) {
    const text = `${date}|${methodId}|${number}`;
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function normalizeStrategyNumbers(row, strategyId) {
    const values = row?.strategies?.[strategyId];
    if (!Array.isArray(values)) {
        throw new Error(`Thiếu ${strategyId} ngày ${row?.date || 'không rõ'}.`);
    }
    return new Set(values.map(Number));
}

function rankMethodConsensusSnapshot(row, methodIds, baseId = 'method-consensus') {
    const normalizedIds = [...new Set(methodIds || [])];
    if (!normalizedIds.length) throw new Error('Cần ít nhất một methodId.');
    const methodSets = normalizedIds.map(strategyId =>
        normalizeStrategyNumbers(row, strategyId)
    );
    return ALL_NUMBERS.map(number => {
        const support = methodSets.reduce(
            (sum, methodSet) => sum + (methodSet.has(number) ? 1 : 0),
            0
        );
        return {
            number,
            support,
            shared: support === normalizedIds.length ? 1 : 0,
            score: support,
            tieValue: stableTieValue(row.date, baseId, number)
        };
    }).sort((left, right) =>
        right.score - left.score
        || left.tieValue - right.tieValue
        || left.number - right.number
    );
}

function rankBlockSmallSnapshot(row, baseId = 'consensus') {
    const block = normalizeStrategyNumbers(row, 'chainBlockFirst');
    const small = normalizeStrategyNumbers(row, 'chainSmallFirst');
    const weights = {
        block: [1, 0],
        small: [0, 1],
        consensus: [1, 1]
    }[baseId];
    if (!weights) throw new Error(`baseId không hợp lệ: ${baseId}`);

    return ALL_NUMBERS.map(number => {
        const blockSelected = block.has(number) ? 1 : 0;
        const smallSelected = small.has(number) ? 1 : 0;
        return {
            number,
            blockSelected,
            smallSelected,
            shared: blockSelected && smallSelected ? 1 : 0,
            score: blockSelected * weights[0] + smallSelected * weights[1],
            tieValue: stableTieValue(row.date, baseId, number)
        };
    }).sort((left, right) =>
        right.score - left.score
        || right.shared - left.shared
        || left.tieValue - right.tieValue
        || left.number - right.number
    );
}

function oneSidedWilsonUpper(wins, total, z = 1.282) {
    if (!total) return 1;
    const probability = wins / total;
    const zSquared = z * z;
    const denominator = 1 + zSquared / total;
    const center = probability + zSquared / (2 * total);
    const margin = z * Math.sqrt(
        (probability * (1 - probability) + zSquared / (4 * total)) / total
    );
    return Math.min(1, (center + margin) / denominator);
}

function oneSidedWilsonLower(wins, total, z = 1.282) {
    if (!total) return 0;
    const probability = wins / total;
    const zSquared = z * z;
    const denominator = 1 + zSquared / total;
    const center = probability + zSquared / (2 * total);
    const margin = z * Math.sqrt(
        (probability * (1 - probability) + zSquared / (4 * total)) / total
    );
    return Math.max(0, (center - margin) / denominator);
}

function buildGroupRankBins(featureRow, weights, binCount) {
    if (100 % binCount !== 0) {
        throw new Error(`binCount phải chia hết 100, nhận ${binCount}.`);
    }
    const ranking = rankGroupProbabilities(featureRow, weights);
    const binSize = 100 / binCount;
    const binByNumber = new Int16Array(100);
    ranking.forEach((item, rankIndex) => {
        binByNumber[item.number] = Math.min(
            binCount - 1,
            Math.floor(rankIndex / binSize)
        );
    });
    return { ranking, binByNumber, binSize };
}

function calibrateGroupVeto(rows, weights, options = {}) {
    const binCount = Number(options.binCount ?? 10);
    const z = Number(options.z ?? 1.282);
    const minimumLift = Number(options.minimumLift ?? 0);
    const tailFraction = Number(options.tailFraction ?? 0.2);
    const tailStart = Math.floor(binCount * (1 - tailFraction));
    const hits = Array.from({ length: binCount }, () => 0);

    for (const row of rows) {
        const { binByNumber } = buildGroupRankBins(row, weights, binCount);
        hits[binByNumber[row.actual]] += 1;
    }

    const baselineShare = 1 / binCount;
    const bins = hits.map((hitCount, bin) => {
        const observedShare = rows.length ? hitCount / rows.length : 0;
        const upperShare = oneSidedWilsonUpper(hitCount, rows.length, z);
        const exclusionLiftLower = baselineShare - upperShare;
        return {
            bin,
            rankStart: bin * (100 / binCount) + 1,
            rankEnd: (bin + 1) * (100 / binCount),
            hits: hitCount,
            days: rows.length,
            baselineShare,
            observedShare,
            upperShare,
            exclusionLiftLower,
            veto: bin >= tailStart && exclusionLiftLower >= minimumLift
        };
    });

    return {
        binCount,
        z,
        minimumLift,
        tailFraction,
        days: rows.length,
        vetoBins: bins.filter(bin => bin.veto).map(bin => bin.bin),
        bins
    };
}

function selectWithConservativeGroupVeto(
    featureRow,
    strictRow,
    weights,
    calibration,
    options = {}
) {
    const baseId = options.baseId || 'consensus';
    const betCount = Number(options.betCount ?? 30);
    const maxSwaps = Number(options.maxSwaps ?? 3);
    const baseRanking = rankBlockSmallSnapshot(strictRow, baseId);
    const { binByNumber } = buildGroupRankBins(
        featureRow,
        weights,
        calibration.binCount
    );
    const vetoBins = new Set(calibration.vetoBins);
    const selected = baseRanking.slice(0, betCount).map(item => item.number);
    const selectedSet = new Set(selected);
    const rejected = selected
        .filter(number => {
            const item = baseRanking.find(entry => entry.number === number);
            if (options.protectShared && item?.shared) return false;
            return vetoBins.has(binByNumber[number]);
        })
        .slice(0, maxSwaps);
    const rejectedSet = new Set(rejected);
    const replacements = [];

    for (const item of baseRanking.slice(betCount)) {
        if (replacements.length >= rejected.length) break;
        if (selectedSet.has(item.number)) continue;
        if (vetoBins.has(binByNumber[item.number])) continue;
        const support = item.blockSelected + item.smallSelected;
        if (support < Number(options.replacementMinSupport ?? 0)) continue;
        replacements.push(item.number);
    }

    const replaceCount = Math.min(rejected.length, replacements.length);
    const actuallyRejected = new Set(rejected.slice(0, replaceCount));
    const numbers = selected
        .filter(number => !actuallyRejected.has(number))
        .concat(replacements.slice(0, replaceCount))
        .sort((left, right) => left - right);

    if (numbers.length !== betCount || new Set(numbers).size !== betCount) {
        throw new Error(
            `Bộ lọc phủ quyết làm sai số lượng ngày ${strictRow.date}: `
            + `${numbers.length}/${betCount}.`
        );
    }

    return {
        numbers,
        rejected: rejected.slice(0, replaceCount),
        replacements: replacements.slice(0, replaceCount),
        vetoBins: [...vetoBins]
    };
}

module.exports = {
    stableTieValue,
    rankMethodConsensusSnapshot,
    rankBlockSmallSnapshot,
    oneSidedWilsonUpper,
    oneSidedWilsonLower,
    buildGroupRankBins,
    calibrateGroupVeto,
    selectWithConservativeGroupVeto
};
