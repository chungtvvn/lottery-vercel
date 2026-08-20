const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function normalizeScores(rows = []) {
    const byNumber = new Map(rows.map(row => [Number(row.number), Math.max(0, Number(row.score) || 0)]));
    const maximum = Math.max(0, ...byNumber.values());
    return new Map(ALL_NUMBERS.map(number => [
        number,
        maximum > 0 ? (byNumber.get(number) || 0) / maximum : 0
    ]));
}

function fuseNumberScores(hierarchicalScores, stateScores, config = {}) {
    const hierarchical = normalizeScores(hierarchicalScores);
    const state = normalizeScores(stateScores);
    const stateWeight = Math.min(1, Math.max(0, Number(config.stateWeight) || 0));
    const hierarchicalWeight = 1 - stateWeight;
    return ALL_NUMBERS.map(number => {
        const hierarchicalScore = hierarchical.get(number) || 0;
        const stateScore = state.get(number) || 0;
        return {
            number,
            score: hierarchicalWeight * hierarchicalScore + stateWeight * stateScore,
            hierarchicalScore,
            stateScore,
            confirmed: hierarchicalScore > 0 && stateScore > 0
        };
    });
}

function refineCombinedPrediction(baselineNumbers, hierarchicalScores, stateScores, config = {}) {
    const baseline = new Set((baselineNumbers || []).map(Number));
    const fused = fuseNumberScores(hierarchicalScores, stateScores, config);
    const requireStateConfirmation = config.gate === 'confirm';
    const riskyBets = fused.filter(item => {
        if (!baseline.has(item.number) || item.hierarchicalScore <= 0) return false;
        return !requireStateConfirmation || item.confirmed;
    }).sort((left, right) => right.score - left.score || left.number - right.number);
    const safeExcluded = fused.filter(item => !baseline.has(item.number))
        .sort((left, right) => left.score - right.score || left.number - right.number);
    const refined = new Set(baseline);
    const swaps = [];
    const swapLimit = Math.max(0, Number(config.swapLimit) || 0);
    const minMargin = Math.max(0, Number(config.minMargin) || 0);
    for (let index = 0; index < Math.min(riskyBets.length, safeExcluded.length); index++) {
        if (swaps.length >= swapLimit) break;
        const risky = riskyBets[index];
        const safe = safeExcluded[index];
        const margin = risky.score - safe.score;
        if (risky.score <= 0 || margin < minMargin) break;
        refined.delete(risky.number);
        refined.add(safe.number);
        swaps.push({
            out: risky.number,
            in: safe.number,
            margin,
            outHierarchical: risky.hierarchicalScore,
            outState: risky.stateScore,
            inHierarchical: safe.hierarchicalScore,
            inState: safe.stateScore
        });
    }
    return {
        betNumbers: [...refined].sort((left, right) => left - right),
        swaps,
        scores: fused
    };
}

module.exports = {
    ALL_NUMBERS,
    fuseNumberScores,
    normalizeScores,
    refineCombinedPrediction
};
