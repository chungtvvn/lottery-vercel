const TELEGRAM_DE_STRATEGIES = [
    'deMilestoneHistoryEdge75UnionX2',
    'deParallelBlock85Small65'
];
const TELEGRAM_HISTORY_METHODS = [
    'deParallelBlock85Small65Hold70',
    'dedupEdge75Hold70'
];
const TELEGRAM_LOTO_STRATEGIES = [
    'rrfParallelBlock85Small65',
    'dedupEdge75Pit',
    'milestoneEdge75PitFusion'
];
const TELEGRAM_LOTO_COUNTS = [6, 7, 20, 25, 30];

function pick(source, keys) {
    if (!source || typeof source !== 'object') return {};
    return Object.fromEntries(
        keys
            .filter(key => source[key] !== undefined)
            .map(key => [key, source[key]])
    );
}

function compactDeHold(hold = {}) {
    return pick(hold, [
        'betNumbers',
        'numbers',
        'intersectionNumbers',
        'doubleNumbers',
        'x2Numbers',
        'betCount',
        'unitCount'
    ]);
}

function compactDeStrategy(strategy = {}) {
    const hold = strategy.holds?.['70'] || strategy.holds?.[70];
    return {
        ...pick(strategy, ['strategy', 'methodId', 'methodName', 'label']),
        holds: hold ? { 70: compactDeHold(hold) } : {}
    };
}

function compactDeResult(result = {}) {
    return pick(result, [
        'actual',
        'hit',
        'betNumbers',
        'intersectionNumbers',
        'betCount',
        'unitCount',
        'stakeK',
        'payoutK',
        'profitK'
    ]);
}

function compactMilestoneRow(row = {}) {
    const strategies = {};
    const results = {};
    for (const strategyId of TELEGRAM_DE_STRATEGIES) {
        if (row.strategies?.[strategyId]) {
            strategies[strategyId] = compactDeStrategy(row.strategies[strategyId]);
        }
        const resultKey = `${strategyId}:hold70`;
        if (row.results?.[resultKey]) {
            results[resultKey] = compactDeResult(row.results[resultKey]);
        }
    }
    return {
        ...pick(row, ['predictionIsoDate', 'predictionDate', 'sourceDrawDate', 'status', 'actualSpecial']),
        strategies,
        results
    };
}

function compactMilestoneTelegramPayload(payload = {}) {
    const nextStrategies = {};
    for (const strategyId of TELEGRAM_DE_STRATEGIES) {
        if (payload.nextPrediction?.strategies?.[strategyId]) {
            nextStrategies[strategyId] = compactDeStrategy(
                payload.nextPrediction.strategies[strategyId]
            );
        }
    }

    return {
        ...pick(payload, ['generatedAt', 'latestDataDate']),
        config: pick(payload.config || {}, ['defaultBetStrategy', 'defaultBetTarget']),
        nextPrediction: {
            ...pick(payload.nextPrediction || {}, ['predictionIsoDate', 'predictionDate', 'sourceDrawDate']),
            strategies: nextStrategies
        },
        livePredictions: {
            ...pick(payload.livePredictions || {}, [
                'generatedAt',
                'startedAt',
                'latestDataDate'
            ]),
            predictions: (payload.livePredictions?.predictions || [])
                .slice(-90)
                .map(compactMilestoneRow)
        }
    };
}

function compactLotoBet(value = {}) {
    return pick(value, [
        'count',
        'numbers',
        'betNumbers',
        'doubleNumbers',
        'x2Numbers',
        'overlapNumbers',
        'intersection',
        'uniqueCount',
        'unitCount',
        'betUnitCount',
        'weightedBetCount',
        'betCount',
        'hits',
        'profitK'
    ]);
}

function compactLotoPredictions(predictions = {}) {
    const compact = {};
    for (const count of TELEGRAM_LOTO_COUNTS) {
        const key = `top${count}`;
        if (predictions?.[key]) compact[key] = compactLotoBet(predictions[key]);
    }
    return compact;
}

function compactLotoStrategy(strategy = {}, includeMethods = true) {
    return {
        ...pick(strategy, ['strategy', 'methodId', 'methodName', 'label']),
        predictions: compactLotoPredictions(strategy.predictions),
        ...(includeMethods ? { methods: compactLotoPredictions(strategy.methods) } : {})
    };
}

function compactLotoRow(row = {}) {
    const strategies = {};
    for (const strategyId of TELEGRAM_LOTO_STRATEGIES) {
        if (row.strategies?.[strategyId]) {
            strategies[strategyId] = compactLotoStrategy(row.strategies[strategyId]);
        }
    }
    return {
        ...pick(row, [
            'predictionIsoDate',
            'predictionDate',
            'sourceDrawDate',
            'status',
            'actual',
            'actualNumbers'
        ]),
        predictions: compactLotoPredictions(row.predictions),
        methods: compactLotoPredictions(row.methods),
        strategies
    };
}

function compactLotoSummary(summary = {}) {
    const compact = {};
    const summaryKeys = [];
    for (const count of TELEGRAM_LOTO_COUNTS) summaryKeys.push(`top${count}`);
    for (const strategyId of TELEGRAM_LOTO_STRATEGIES) {
        for (const count of TELEGRAM_LOTO_COUNTS) {
            summaryKeys.push(`${strategyId}_top${count}`);
        }
    }
    for (const key of summaryKeys) {
        if (summary?.[key]) compact[key] = pick(summary[key], [
            'days',
            'hitDays',
            'wins',
            'losses',
            'hitRate',
            'profitK',
            'roi'
        ]);
    }
    return compact;
}

function compactLotoTelegramPayload(payload = {}) {
    const nextStrategies = {};
    for (const strategyId of TELEGRAM_LOTO_STRATEGIES) {
        if (payload.nextPrediction?.strategies?.[strategyId]) {
            nextStrategies[strategyId] = compactLotoStrategy(
                payload.nextPrediction.strategies[strategyId],
                false
            );
        }
    }
    return {
        ...pick(payload, ['generatedAt', 'latestDataDate']),
        config: pick(payload.config || {}, [
            'strategy',
            'methodId',
            'methodName',
            'defaultBetCount',
            'stakePerNumberK',
            'payoutPerHitK'
        ]),
        nextPrediction: {
            ...pick(payload.nextPrediction || {}, [
                'predictionIsoDate',
                'predictionDate',
                'sourceDrawDate',
                'methodId'
            ]),
            predictions: compactLotoPredictions(payload.nextPrediction?.predictions),
            strategies: nextStrategies
        },
        livePredictions: {
            ...pick(payload.livePredictions || {}, [
                'generatedAt',
                'startedAt',
                'latestDataDate'
            ]),
            summary: compactLotoSummary(payload.livePredictions?.summary),
            predictions: (payload.livePredictions?.predictions || [])
                .slice(-90)
                .map(compactLotoRow)
        }
    };
}

function compactHistoryMethod(method = {}) {
    return pick(method, [
        'numbersToBet',
        'betNumbers',
        'intersectionNumbers',
        'actualSpecial',
        'betWin',
        'betCount',
        'unitCount',
        'methodVersion',
        'profitK'
    ]);
}

function compactPredictionHistoryTelegramRows(rows = []) {
    return (rows || []).slice(-90).map(row => {
        const methods = {};
        for (const methodId of TELEGRAM_HISTORY_METHODS) {
            if (row.summary?.methods?.[methodId]) {
                methods[methodId] = compactHistoryMethod(row.summary.methods[methodId]);
            }
        }
        return {
            ...pick(row, ['predictionDate', 'sourceDrawDate']),
            summary: {
                ...pick(row.summary || {}, ['resolved', 'actualSpecial']),
                methods
            }
        };
    });
}

module.exports = {
    TELEGRAM_DE_STRATEGIES,
    TELEGRAM_HISTORY_METHODS,
    TELEGRAM_LOTO_STRATEGIES,
    TELEGRAM_LOTO_COUNTS,
    compactMilestoneTelegramPayload,
    compactLotoTelegramPayload,
    compactPredictionHistoryTelegramRows
};
