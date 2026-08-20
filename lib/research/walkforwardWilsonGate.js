'use strict';

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function roundK(value) {
    return Math.round(Number(value) * 1000) / 1000;
}

function wilsonLower(successes, total, z = 1.64) {
    if (!total) return 0;
    const p = successes / total;
    const z2 = z * z;
    const centre = p + z2 / (2 * total);
    const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    return Math.max(0, (centre - spread) / (1 + z2 / total));
}

function createExpertState(methodIds, options = {}) {
    const priorMean = Number(options.priorMean ?? 0.3);
    const priorStrength = Math.max(1, Number(options.priorStrength ?? 60));
    return Object.fromEntries(methodIds.map(id => [id, {
        hits: priorMean * priorStrength,
        days: priorStrength
    }]));
}

function rankNumbers(strategies, methodIds, state, scoreMode) {
    const totalWeight = scoreMode === 'equalVote'
        ? methodIds.length
        : methodIds.reduce((sum, id) => sum + state[id].hits / state[id].days, 0);
    const ranked = ALL_NUMBERS.map(number => {
        let support = 0;
        let weightedSupport = 0;
        for (const id of methodIds) {
            const contains = strategies[id].has(number);
            if (!contains) continue;
            support++;
            weightedSupport += scoreMode === 'equalVote'
                ? 1
                : state[id].hits / state[id].days;
        }
        return {
            number,
            support,
            score: weightedSupport / Math.max(totalWeight, 1)
        };
    });
    ranked.sort((left, right) =>
        right.score - left.score ||
        right.support - left.support ||
        left.number - right.number
    );
    return ranked;
}

function buildDailyPredictions(rows, options = {}) {
    const methodIds = options.methodIds || [];
    const scoreMode = options.scoreMode || 'weightedBeta';
    const betCount = Math.max(1, Number(options.betCount ?? 30));
    const state = createExpertState(methodIds, options);
    const predictions = [];

    for (const row of [...rows].sort((left, right) => left.date.localeCompare(right.date))) {
        const strategies = Object.fromEntries(methodIds.map(id => [
            id,
            new Set((row.strategies[id] || []).map(Number))
        ]));
        const ranked = rankNumbers(strategies, methodIds, state, scoreMode);
        const betNumbers = ranked.slice(0, betCount).map(item => item.number);
        const confidence = ranked.slice(0, betCount)
            .reduce((sum, item) => sum + item.score, 0) / betCount;
        const actual = Number(row.actual);
        const hit = betNumbers.includes(actual);
        predictions.push({
            date: row.date,
            actual,
            betNumbers,
            hit,
            confidence,
            topSupport: ranked[0]?.support || 0,
            meanSupport: ranked.slice(0, betCount)
                .reduce((sum, item) => sum + item.support, 0) / betCount
        });

        // The current draw only updates experts after its prediction is frozen.
        for (const id of methodIds) {
            state[id].hits += Number(strategies[id].has(actual));
            state[id].days++;
        }
    }
    return predictions;
}

function evaluateGate(predictions, options = {}) {
    const betCount = Math.max(1, Number(options.betCount ?? 30));
    const payoutMultiplier = Number(options.payoutMultiplier ?? 84);
    const stakePerNumberK = Number(options.stakePerNumberK ?? 1000);
    const minSample = Math.max(1, Number(options.minSample ?? 60));
    const z = Number(options.z ?? 1.64);
    const breakEven = betCount / payoutMultiplier;
    const history = [];
    const rows = [];

    for (const prediction of predictions) {
        const comparable = history.filter(item => item.confidence >= prediction.confidence);
        const successes = comparable.reduce((sum, item) => sum + Number(item.hit), 0);
        const lowerBound = comparable.length >= minSample
            ? wilsonLower(successes, comparable.length, z)
            : 0;
        const played = comparable.length >= minSample && lowerBound > breakEven;
        const profitK = played
            ? (prediction.hit ? payoutMultiplier * stakePerNumberK : 0) - betCount * stakePerNumberK
            : 0;
        rows.push({
            ...prediction,
            played,
            comparableDays: comparable.length,
            comparableHits: successes,
            lowerBound,
            profitK
        });
        history.push({ confidence: prediction.confidence, hit: prediction.hit });
    }
    return rows;
}

function summarize(rows, options = {}) {
    const betCount = Math.max(1, Number(options.betCount ?? 30));
    const payoutMultiplier = Number(options.payoutMultiplier ?? 84);
    const stakePerNumberK = Number(options.stakePerNumberK ?? 1000);
    const played = rows.filter(row => row.played);
    let longestWin = 0;
    let longestLoss = 0;
    let currentType = null;
    let currentLength = 0;
    for (const row of played) {
        const type = row.hit ? 'win' : 'loss';
        currentLength = currentType === type ? currentLength + 1 : 1;
        currentType = type;
        if (type === 'win') longestWin = Math.max(longestWin, currentLength);
        else longestLoss = Math.max(longestLoss, currentLength);
    }
    const wins = played.filter(row => row.hit).length;
    const stakeK = played.length * betCount * stakePerNumberK;
    const payoutK = wins * payoutMultiplier * stakePerNumberK;
    const profitK = payoutK - stakeK;
    return {
        calendarDays: rows.length,
        playedDays: played.length,
        skippedDays: rows.length - played.length,
        wins,
        losses: played.length - wins,
        hitRate: played.length ? wins / played.length : 0,
        breakEvenHitRate: betCount / payoutMultiplier,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin,
        longestLoss
    };
}

function summarizeCombinedBetHold(rows, options = {}) {
    const betCount = Math.max(1, Number(options.betCount ?? 30));
    const payoutMultiplier = Number(options.payoutMultiplier ?? 84);
    const stakePerNumberK = Number(options.stakePerNumberK ?? 1000);
    const holdWinMultiplier = Number(options.holdWinMultiplier ?? 0.705);
    const holdLossMultiplier = Number(options.holdLossMultiplier ?? 70);
    const holdCount = 100 - betCount;
    const winProfitPerDayK = roundK((
        payoutMultiplier - betCount + holdCount * holdWinMultiplier
    ) * stakePerNumberK);
    const lossProfitPerDayK = roundK((
        -betCount + holdCount * holdWinMultiplier - holdLossMultiplier
    ) * stakePerNumberK);
    const wins = rows.filter(row => row.hit).length;
    const days = rows.length;
    let longestWin = 0;
    let longestLoss = 0;
    let currentType = null;
    let currentLength = 0;
    for (const row of rows) {
        const type = row.hit ? 'win' : 'loss';
        currentLength = currentType === type ? currentLength + 1 : 1;
        currentType = type;
        if (type === 'win') longestWin = Math.max(longestWin, currentLength);
        else longestLoss = Math.max(longestLoss, currentLength);
    }
    const stakeK = days * betCount * stakePerNumberK;
    const holdIncomeK = roundK(days * holdCount * holdWinMultiplier * stakePerNumberK);
    const holdLossK = (days - wins) * holdLossMultiplier * stakePerNumberK;
    const betPayoutK = wins * payoutMultiplier * stakePerNumberK;
    const profitK = roundK(wins * winProfitPerDayK + (days - wins) * lossProfitPerDayK);
    const breakEvenHitRate = -lossProfitPerDayK / (winProfitPerDayK - lossProfitPerDayK);
    return {
        days,
        betCount,
        holdCount,
        wins,
        losses: days - wins,
        hitRate: days ? wins / days : 0,
        breakEvenHitRate,
        stakeK,
        betPayoutK,
        holdIncomeK,
        holdLossK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        winProfitPerDayK,
        lossProfitPerDayK,
        longestWin,
        longestLoss
    };
}

function withinRange(rows, startDate, endDate) {
    return rows.filter(row =>
        (!startDate || row.date >= startDate) &&
        (!endDate || row.date <= endDate)
    );
}

module.exports = {
    buildDailyPredictions,
    evaluateGate,
    summarize,
    summarizeCombinedBetHold,
    wilsonLower,
    withinRange
};
