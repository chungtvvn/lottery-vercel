const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function createState(strategyIds, options = {}) {
    const priorMean = Number(options.priorMean ?? 0.3);
    const priorStrength = Math.max(1, Number(options.priorStrength ?? 10));
    const decay = Math.min(0.999, Math.max(0.5, Number(options.decay ?? 0.95)));
    return {
        strategyIds: [...strategyIds],
        priorMean,
        priorStrength,
        decay,
        experts: Object.fromEntries(strategyIds.map(id => [id, {
            wins: priorMean * priorStrength,
            days: priorStrength,
            ema: priorMean
        }]))
    };
}

function expertWeight(expert, mode) {
    if (mode === 'ema') return expert.ema;
    return expert.wins / Math.max(1, expert.days);
}

function bestExpertId(state, mode) {
    return state.strategyIds.reduce((best, id) => {
        if (!best) return id;
        const currentWeight = expertWeight(state.experts[id], mode);
        const bestWeight = expertWeight(state.experts[best], mode);
        return currentWeight > bestWeight ? id : best;
    }, null);
}

function strategySet(row, id) {
    return new Set((row.strategies?.[id] || []).map(Number));
}

function predict(row, state, options = {}) {
    const mode = String(options.mode || 'betaWeighted');
    const betCount = Math.max(1, Number(options.betCount || 30));
    const weightMode = mode.includes('ema') ? 'ema' : 'beta';
    const bestId = bestExpertId(state, weightMode);
    const sets = Object.fromEntries(
        state.strategyIds.map(id => [id, strategySet(row, id)])
    );
    if (mode === 'leaderBeta' || mode === 'leaderEma') {
        return [...sets[bestId]].sort((left, right) => left - right);
    }
    const ranked = ALL_NUMBERS.map(number => {
        const support = state.strategyIds.reduce(
            (sum, id) => sum + Number(sets[id].has(number)),
            0
        );
        const weightedSupport = state.strategyIds.reduce(
            (sum, id) => sum + expertWeight(state.experts[id], weightMode)
                * Number(sets[id].has(number)),
            0
        );
        return {
            number,
            support,
            weightedSupport,
            baselineBet: sets[bestId].has(number)
        };
    });
    ranked.sort((left, right) => {
        if (mode === 'majority') {
            return right.support - left.support ||
                Number(right.baselineBet) - Number(left.baselineBet) ||
                left.number - right.number;
        }
        return right.weightedSupport - left.weightedSupport ||
            Number(right.baselineBet) - Number(left.baselineBet) ||
            left.number - right.number;
    });
    return ranked.slice(0, betCount).map(item => item.number);
}

function settle(row, state) {
    const actual = Number(row.actual);
    for (const id of state.strategyIds) {
        const expert = state.experts[id];
        const hit = strategySet(row, id).has(actual);
        expert.wins += Number(hit);
        expert.days++;
        expert.ema = state.decay * expert.ema + (1 - state.decay) * Number(hit);
    }
}

function evaluate(rows, options = {}) {
    const strategyIds = options.strategyIds || [
        'chainBlockFirst',
        'chainSmallFirst',
        'numberSurvivalCredibleRisk'
    ];
    const state = createState(strategyIds, options);
    const betCount = Math.max(1, Number(options.betCount || 30));
    const stakePerNumberK = Number(options.stakePerNumberK || 1000);
    const winMultiplier = Number(options.winMultiplier || 84);
    let wins = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let currentType = null;
    let currentLength = 0;
    const details = [];
    for (const row of [...rows].sort((left, right) => left.date.localeCompare(right.date))) {
        const betNumbers = predict(row, state, options);
        if (betNumbers.length !== betCount) {
            throw new Error(`${row.date}: ensemble có ${betNumbers.length} số, cần ${betCount}.`);
        }
        const hit = betNumbers.includes(Number(row.actual));
        const profitK = (hit ? winMultiplier * stakePerNumberK : 0)
            - betCount * stakePerNumberK;
        wins += Number(hit);
        const type = hit ? 'win' : 'loss';
        currentLength = currentType === type ? currentLength + 1 : 1;
        currentType = type;
        if (hit) longestWin = Math.max(longestWin, currentLength);
        else longestLoss = Math.max(longestLoss, currentLength);
        details.push({
            date: row.date,
            actual: Number(row.actual),
            betNumbers,
            hit,
            profitK
        });
        // Cập nhật sau khi dàn của ngày hiện tại đã được khóa.
        settle(row, state);
    }
    const days = details.length;
    const stakeK = days * betCount * stakePerNumberK;
    const payoutK = wins * winMultiplier * stakePerNumberK;
    return {
        id: String(options.mode || 'betaWeighted'),
        days,
        wins,
        losses: days - wins,
        hitRate: days ? wins / days : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin,
        longestLoss,
        rows: details
    };
}

module.exports = {
    ALL_NUMBERS,
    bestExpertId,
    createState,
    evaluate,
    expertWeight,
    predict,
    settle
};
