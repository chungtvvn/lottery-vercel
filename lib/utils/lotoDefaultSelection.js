function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function selectBestLotoDefault(summary = {}, options = {}) {
    const strategies = Array.isArray(options.strategies) ? options.strategies : [];
    const betCounts = Array.isArray(options.betCounts) ? options.betCounts : [];
    const fallbackStrategy = options.fallbackStrategy || strategies[0] || null;
    const fallbackBetCount = finiteNumber(options.fallbackBetCount, betCounts[0] || 6);
    const candidates = [];

    for (const strategy of strategies) {
        for (const betCount of betCounts) {
            const key = `${strategy}_top${betCount}`;
            const row = summary?.[key];
            const days = finiteNumber(row?.days, 0);
            const profitK = Number(row?.profitK);
            if (days <= 0 || !Number.isFinite(profitK)) continue;
            candidates.push({
                strategy,
                betCount,
                key,
                days,
                profitK,
                roi: finiteNumber(row?.roi, 0),
                hitRate: finiteNumber(row?.hitRate, 0)
            });
        }
    }

    candidates.sort((left, right) =>
        right.profitK - left.profitK
        || right.roi - left.roi
        || right.days - left.days
        || left.betCount - right.betCount
        || left.strategy.localeCompare(right.strategy)
    );

    return candidates[0] || {
        strategy: fallbackStrategy,
        betCount: fallbackBetCount,
        key: fallbackStrategy ? `${fallbackStrategy}_top${fallbackBetCount}` : null,
        days: 0,
        profitK: 0,
        roi: 0,
        hitRate: 0,
        fallback: true
    };
}

module.exports = {
    selectBestLotoDefault
};
