const DEFAULT_BASE_RATE = 0.3;

function clampProbability(value) {
    return Math.min(1 - 1e-9, Math.max(1e-9, Number(value)));
}

function logit(value) {
    const probability = clampProbability(value);
    return Math.log(probability / (1 - probability));
}

function collectMethodStats(rows, strategyIds, options = {}) {
    const baseRate = Number(options.baseRate ?? DEFAULT_BASE_RATE);
    const priorStrength = Math.max(0, Number(options.priorStrength ?? 100));
    const byYear = new Map();
    const totals = new Map(strategyIds.map(id => [id, { days: 0, hits: 0 }]));

    for (const row of rows) {
        const year = String(row.date).slice(0, 4);
        if (!byYear.has(year)) {
            byYear.set(year, new Map(
                strategyIds.map(id => [id, { days: 0, hits: 0 }])
            ));
        }
        for (const id of strategyIds) {
            const selected = row.strategies?.[id] || [];
            const hit = Number(selected.includes(Number(row.actual)));
            totals.get(id).days++;
            totals.get(id).hits += hit;
            byYear.get(year).get(id).days++;
            byYear.get(year).get(id).hits += hit;
        }
    }

    return strategyIds.map(id => {
        const total = totals.get(id);
        const posteriorHitRate = (
            total.hits + priorStrength * baseRate
        ) / (total.days + priorStrength);
        const direction = Math.sign(posteriorHitRate - baseRate);
        const yearly = Array.from(byYear.entries()).map(([year, values]) => {
            const value = values.get(id);
            return {
                year,
                days: value.days,
                hits: value.hits,
                hitRate: value.days ? value.hits / value.days : baseRate
            };
        });
        const consistentYears = yearly.filter(item =>
            Math.sign(item.hitRate - baseRate) === direction
        ).length;
        const consistency = yearly.length ? consistentYears / yearly.length : 0;
        const stability = Math.max(0, (consistency - 0.5) * 2);
        const rawWeight = Math.abs(logit(posteriorHitRate) - logit(baseRate));
        return {
            id,
            days: total.days,
            hits: total.hits,
            hitRate: total.days ? total.hits / total.days : baseRate,
            posteriorHitRate,
            direction,
            consistency,
            weight: rawWeight * stability,
            yearly
        };
    });
}

function rankNumbers(row, methodStats, options = {}) {
    const useWeights = options.useWeights !== false;
    const missListSize = Math.max(0, Number(options.missListSize || 0));
    const betCount = Math.max(1, Math.min(99, Number(options.betCount || 30)));
    const scored = Array.from({ length: 100 }, (_, number) => {
        let hitScore = 0;
        let hitVotes = 0;
        let missScore = 0;
        let missVotes = 0;
        for (const method of methodStats) {
            if (method.weight <= 0) continue;
            const included = (row.strategies?.[method.id] || []).includes(number);
            if (!included) continue;
            const contribution = useWeights ? method.weight : 1;
            if (method.direction > 0) {
                hitScore += contribution;
                hitVotes++;
            } else if (method.direction < 0) {
                missScore += contribution;
                missVotes++;
            }
        }
        return { number, hitScore, hitVotes, missScore, missVotes };
    });

    const missNumbers = scored.slice().sort((left, right) =>
        right.missScore - left.missScore ||
        right.missVotes - left.missVotes ||
        left.hitScore - right.hitScore ||
        left.number - right.number
    ).slice(0, missListSize).map(item => item.number);
    const veto = new Set(missNumbers);
    const hitRanking = scored.slice().sort((left, right) =>
        right.hitScore - left.hitScore ||
        right.hitVotes - left.hitVotes ||
        left.missScore - right.missScore ||
        left.number - right.number
    );
    const betNumbers = hitRanking
        .filter(item => !veto.has(item.number))
        .slice(0, betCount)
        .map(item => item.number);

    return { betNumbers, missNumbers, ranking: hitRanking };
}

module.exports = {
    collectMethodStats,
    rankNumbers
};
