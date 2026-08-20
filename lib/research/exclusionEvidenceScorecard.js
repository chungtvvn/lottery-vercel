const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function uniqueNumbers(values) {
    return [...new Set((values || []).map(Number))]
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 99)
        .sort((left, right) => left - right);
}

function methodFamily(methodId) {
    if (String(methodId).startsWith('chain')) return 'chain';
    if (String(methodId).startsWith('number')) return 'number';
    if (String(methodId).startsWith('dedup')) return 'dedup';
    if (String(methodId).startsWith('active')) return 'active';
    return 'other';
}

function collectMethodStats(rows, methodIds, options = {}) {
    const priorMean = Number(options.priorMean ?? 0.3);
    const priorStrength = Math.max(1, Number(options.priorStrength ?? 200));
    const conservativeZ = Math.max(0, Number(options.conservativeZ ?? 0.67));
    return methodIds.map(methodId => {
        const yearly = new Map();
        let days = 0;
        let hits = 0;
        for (const row of rows) {
            const bets = uniqueNumbers(row.strategies?.[methodId]);
            if (!bets.length) continue;
            const hit = bets.includes(Number(row.actual));
            const year = String(row.date).slice(0, 4);
            if (!yearly.has(year)) yearly.set(year, { days: 0, hits: 0 });
            yearly.get(year).days++;
            yearly.get(year).hits += Number(hit);
            days++;
            hits += Number(hit);
        }
        const posterior = (hits + priorStrength * priorMean) / (days + priorStrength);
        const variance = posterior * (1 - posterior) / Math.max(1, days + priorStrength + 1);
        const lower = clamp(posterior - conservativeZ * Math.sqrt(variance));
        const yearRows = [...yearly.values()];
        const profitableYears = yearRows.filter(item => item.days && item.hits / item.days > priorMean).length;
        const stability = yearRows.length ? profitableYears / yearRows.length : 0;
        return {
            methodId,
            family: methodFamily(methodId),
            days,
            hits,
            rawHitRate: days ? hits / days : 0,
            posteriorHitRate: posterior,
            conservativeHitRate: lower,
            edge: posterior - priorMean,
            conservativeEdge: lower - priorMean,
            years: yearRows.length,
            profitableYears,
            stability
        };
    });
}

function averagePredictionJaccard(rows, leftId, rightId) {
    let total = 0;
    let days = 0;
    for (const row of rows) {
        const left = new Set(uniqueNumbers(row.strategies?.[leftId]));
        const right = new Set(uniqueNumbers(row.strategies?.[rightId]));
        if (!left.size || !right.size) continue;
        let intersection = 0;
        for (const number of left) intersection += Number(right.has(number));
        total += intersection / Math.max(1, left.size + right.size - intersection);
        days++;
    }
    return days ? total / days : 0;
}

function buildSimilarityMatrix(rows, methodIds) {
    const matrix = new Map();
    for (let leftIndex = 0; leftIndex < methodIds.length; leftIndex++) {
        for (let rightIndex = leftIndex; rightIndex < methodIds.length; rightIndex++) {
            const leftId = methodIds[leftIndex];
            const rightId = methodIds[rightIndex];
            const value = leftId === rightId
                ? 1
                : averagePredictionJaccard(rows, leftId, rightId);
            matrix.set(`${leftId}|${rightId}`, value);
            matrix.set(`${rightId}|${leftId}`, value);
        }
    }
    return matrix;
}

function buildMethodWeights(rows, methodIds, config = {}) {
    const stats = collectMethodStats(rows, methodIds, config);
    const similarityPenalty = Math.max(0, Number(config.similarityPenalty ?? 0.75));
    const temperature = Math.max(0.001, Number(config.temperature ?? 0.02));
    const maxExperts = Math.max(1, Number(config.maxExperts ?? methodIds.length));
    const selected = stats.slice().sort((left, right) =>
        right.conservativeHitRate - left.conservativeHitRate
        || right.stability - left.stability
        || left.methodId.localeCompare(right.methodId)
    ).slice(0, maxExperts);
    const weights = [];
    for (const method of selected) {
        const similarities = weights.map(item => {
            const cached = config.similarityMatrix?.get?.(`${method.methodId}|${item.methodId}`);
            return cached === undefined
                ? averagePredictionJaccard(rows, method.methodId, item.methodId)
                : cached;
        });
        const redundancy = similarities.length
            ? similarities.reduce((sum, value) => sum + value, 0) / similarities.length
            : 0;
        const relative = (method.conservativeHitRate - 0.3) / temperature;
        const rawWeight = Math.exp(Math.max(-8, Math.min(8, relative)))
            * (0.5 + 0.5 * method.stability);
        weights.push({
            ...method,
            redundancy,
            weight: rawWeight / (1 + similarityPenalty * redundancy)
        });
    }
    const total = weights.reduce((sum, item) => sum + item.weight, 0) || 1;
    return weights.map(item => ({ ...item, normalizedWeight: item.weight / total }));
}

function rankNumbers(row, methodWeights) {
    const methodSets = methodWeights.map(method => ({
        method,
        bets: new Set(uniqueNumbers(row.strategies?.[method.methodId]))
    }));
    return ALL_NUMBERS.map(number => {
        const support = methodSets
            .filter(item => item.bets.has(number))
            .map(item => item.method);
        return {
            number,
            safeScore: support.reduce((sum, method) => sum + method.normalizedWeight, 0),
            supportCount: support.length,
            supportMethods: support.map(method => method.methodId)
        };
    }).sort((left, right) =>
        right.safeScore - left.safeScore
        || right.supportCount - left.supportCount
        || left.number - right.number
    );
}

function predict(row, methodWeights, betCount = 30) {
    return rankNumbers(row, methodWeights)
        .slice(0, Math.max(1, Number(betCount) || 30))
        .map(item => item.number)
        .sort((left, right) => left - right);
}

function settle(rows, predictionForRow, options = {}) {
    const stakePerNumberK = Number(options.stakePerNumberK ?? 1000);
    const winMultiplier = Number(options.winMultiplier ?? 84);
    const result = {
        days: 0,
        hits: 0,
        stakeK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        currentType: null,
        currentLength: 0,
        rows: []
    };
    for (const row of rows.slice().sort((left, right) => left.date.localeCompare(right.date))) {
        const bets = uniqueNumbers(predictionForRow(row));
        const hit = bets.includes(Number(row.actual));
        const stakeK = bets.length * stakePerNumberK;
        const profitK = (hit ? stakePerNumberK * winMultiplier : 0) - stakeK;
        const type = hit ? 'win' : 'loss';
        result.days++;
        result.hits += Number(hit);
        result.stakeK += stakeK;
        result.profitK += profitK;
        if (result.currentType === type) result.currentLength++;
        else {
            result.currentType = type;
            result.currentLength = 1;
        }
        if (hit) result.longestWin = Math.max(result.longestWin, result.currentLength);
        else result.longestLoss = Math.max(result.longestLoss, result.currentLength);
        result.rows.push({ date: row.date, actual: Number(row.actual), bets, hit, profitK });
    }
    delete result.currentType;
    delete result.currentLength;
    result.hitRate = result.days ? result.hits / result.days : 0;
    result.roi = result.stakeK ? result.profitK / result.stakeK : 0;
    return result;
}

module.exports = {
    ALL_NUMBERS,
    averagePredictionJaccard,
    buildSimilarityMatrix,
    buildMethodWeights,
    collectMethodStats,
    methodFamily,
    predict,
    rankNumbers,
    settle,
    uniqueNumbers
};
