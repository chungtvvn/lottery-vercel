'use strict';

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function wilsonInterval(successes, trials, z = 1.96) {
    const n = Math.max(0, Number(trials) || 0);
    const x = clamp(Number(successes) || 0, 0, n);
    if (!n) return { lower: 0, upper: 1, mean: 0 };
    const p = x / n;
    const z2 = z * z;
    const denominator = 1 + z2 / n;
    const center = (p + z2 / (2 * n)) / denominator;
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n) / denominator;
    return {
        lower: clamp(center - margin, 0, 1),
        upper: clamp(center + margin, 0, 1),
        mean: p
    };
}

function inferParallelSegments(summary, options = {}) {
    const unitStakeK = Number(options.unitStakeK || 1000);
    const payoutMultiplier = Number(options.payoutMultiplier || 84);
    const payoutPerUnitK = unitStakeK * payoutMultiplier;
    const days = Number(summary.days || 0);
    const hitDays = Number(summary.hitDays ?? summary.hits ?? 0);
    const totalUniqueUnits = Number(summary.totalBetNumbers || 0);
    const totalStakeUnits = Number(summary.stakeK || 0) / unitStakeK;
    const payoutUnits = Number(summary.payoutK || 0) / payoutPerUnitK;
    const overlapHits = Math.round(payoutUnits - hitDays);
    const uniqueOnlyHits = hitDays - overlapHits;
    const overlapUnits = Math.round(totalStakeUnits - totalUniqueUnits);
    const uniqueOnlyUnits = totalUniqueUnits - overlapUnits;

    if (
        !Number.isInteger(overlapHits)
        || overlapHits < 0
        || uniqueOnlyHits < 0
        || overlapUnits < 0
        || uniqueOnlyUnits < 0
    ) {
        throw new Error(`Khong the phan ra bao cao song song ${summary.key || ''}.`);
    }

    return {
        key: String(summary.key || ''),
        days,
        unionHits: hitDays,
        overlapHits,
        uniqueOnlyHits,
        overlapUnits,
        uniqueOnlyUnits,
        unionUniqueUnits: totalUniqueUnits
    };
}

function settleSegment(segment, kind, payoutMultiplier, unitStakeK = 1000) {
    const multiplier = Number(payoutMultiplier);
    let hits;
    let units;
    let hitDays;
    if (kind === 'overlapOnly') {
        hits = segment.overlapHits;
        units = segment.overlapUnits;
        hitDays = segment.overlapHits;
    } else if (kind === 'uniqueOnly') {
        hits = segment.uniqueOnlyHits;
        units = segment.uniqueOnlyUnits;
        hitDays = segment.uniqueOnlyHits;
    } else if (kind === 'unionSingle') {
        hits = segment.uniqueOnlyHits + segment.overlapHits;
        units = segment.uniqueOnlyUnits + segment.overlapUnits;
        hitDays = segment.unionHits;
    } else if (kind === 'parallelX2') {
        hits = segment.uniqueOnlyHits + segment.overlapHits * 2;
        units = segment.uniqueOnlyUnits + segment.overlapUnits * 2;
        hitDays = segment.unionHits;
    } else {
        throw new Error(`Loai phan ra khong ho tro: ${kind}`);
    }

    const stakeK = units * unitStakeK;
    const payoutK = hits * multiplier * unitStakeK;
    const profitK = payoutK - stakeK;
    const averageBetCount = segment.days ? units / segment.days : 0;
    const hitRate = segment.days ? hitDays / segment.days : 0;
    const expectedCoverageRate = averageBetCount / 100;
    const interval = wilsonInterval(hitDays, segment.days);
    return {
        key: segment.key,
        days: segment.days,
        hitDays,
        payoutUnits: hits,
        betUnits: units,
        averageBetCount,
        hitRate,
        expectedCoverageRate,
        liftVsCoverage: expectedCoverageRate ? hitRate / expectedCoverageRate : 0,
        wilson95: interval,
        conservativeEdge: interval.lower - expectedCoverageRate,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        breakEvenMultiplier: hitDays ? units / hitDays : null,
        profitable: profitK > 0
    };
}

function createSeededRandom(seed = 20260717) {
    let state = Number(seed) >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function percentile(values, probability) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const index = (sorted.length - 1) * clamp(probability, 0, 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function blockBootstrapAnnualProfit(weeklyProfits, options = {}) {
    const values = (weeklyProfits || []).map(Number).filter(Number.isFinite);
    if (!values.length) return null;
    const iterations = Math.max(100, Number(options.iterations || 10000));
    const weeksPerYear = Math.max(1, Number(options.weeksPerYear || 52));
    const blockSize = Math.max(1, Math.min(values.length, Number(options.blockSize || 4)));
    const random = createSeededRandom(options.seed);
    const samples = [];
    for (let iteration = 0; iteration < iterations; iteration++) {
        let total = 0;
        let sampled = 0;
        while (sampled < weeksPerYear) {
            const start = Math.floor(random() * values.length);
            for (let offset = 0; offset < blockSize && sampled < weeksPerYear; offset++) {
                total += values[(start + offset) % values.length];
                sampled++;
            }
        }
        samples.push(total);
    }
    return {
        iterations,
        weeksPerYear,
        blockSize,
        probabilityPositive: samples.filter(value => value > 0).length / samples.length,
        p025: percentile(samples, 0.025),
        median: percentile(samples, 0.5),
        p975: percentile(samples, 0.975)
    };
}

module.exports = {
    wilsonInterval,
    inferParallelSegments,
    settleSegment,
    blockBootstrapAnnualProfit
};
