'use strict';

function clamp(value, min = 1e-6, max = 1 - 1e-6) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function logit(value) {
    const probability = clamp(value);
    return Math.log(probability / (1 - probability));
}

function logistic(value) {
    return 1 / (1 + Math.exp(-Number(value || 0)));
}

function wilsonLower(successes, trials, z = 1.28) {
    const n = Math.max(0, Number(trials) || 0);
    if (n <= 0) return 0;
    const p = clamp(Number(successes || 0) / n);
    const z2 = z * z;
    const denominator = 1 + z2 / n;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return clamp((center - margin) / denominator);
}

function widthBucket(setSize) {
    const size = Math.max(1, Number(setSize || 0));
    if (size === 1) return '01';
    if (size === 2) return '02';
    if (size <= 5) return '03-05';
    if (size <= 10) return '06-10';
    if (size <= 20) return '11-20';
    if (size <= 40) return '21-40';
    return '41-99';
}

function lengthBucket(targetLen) {
    const length = Math.max(0, Number(targetLen || 0));
    if (length <= 2) return '02';
    if (length === 3) return '03';
    if (length === 4) return '04';
    if (length === 5) return '05';
    return '06+';
}

function cohortKeys(row) {
    const type = String(row.eventType || 'unknown');
    const family = String(row.family || 'other');
    const width = widthBucket(row.setSize);
    const length = lengthBucket(row.targetLen);
    const pattern = String(row.pattern || 'other');
    return [
        type,
        `${type}|${family}`,
        `${type}|${family}|${width}|${length}`,
        `${type}|${family}|${width}|${length}|${pattern}`
    ];
}

function addObservation(target, row, weight) {
    target.rawTrials++;
    target.effectiveTrials += weight;
    target.events += weight * Number(Boolean(row.eventOccurred));
    target.expectedEvents += weight * (Number(row.setSize || 0) / 100);
}

function buildWeightedAggregates(rows) {
    const familyDayCounts = new Map();
    for (const row of rows) {
        const key = `${row.date}|${row.eventType}|${row.family}`;
        familyDayCounts.set(key, (familyDayCounts.get(key) || 0) + 1);
    }
    const levels = [new Map(), new Map(), new Map(), new Map()];
    for (const row of rows) {
        const familyDayKey = `${row.date}|${row.eventType}|${row.family}`;
        const weight = 1 / Math.max(1, familyDayCounts.get(familyDayKey) || 1);
        cohortKeys(row).forEach((key, level) => {
            if (!levels[level].has(key)) {
                levels[level].set(key, {
                    key,
                    level,
                    rawTrials: 0,
                    effectiveTrials: 0,
                    events: 0,
                    expectedEvents: 0
                });
            }
            addObservation(levels[level].get(key), row, weight);
        });
    }
    return levels;
}

function parentKey(key) {
    const parts = String(key).split('|');
    return parts.length > 1 ? parts.slice(0, -1).join('|') : null;
}

function fitModel(rows, options = {}) {
    const priorStrengthByLevel = options.priorStrengthByLevel || [80, 50, 35, 25];
    const levels = buildWeightedAggregates(rows);
    const cohorts = new Map();
    levels.forEach((levelRows, level) => {
        for (const aggregate of levelRows.values()) {
            const expectedRate = aggregate.expectedEvents / Math.max(1e-9, aggregate.effectiveTrials);
            const parent = cohorts.get(parentKey(aggregate.key));
            const parentLift = parent ? parent.logOddsLift : 0;
            const priorMean = logistic(logit(expectedRate) + parentLift);
            const priorStrength = Number(priorStrengthByLevel[level] || 25);
            const posteriorRate = (
                aggregate.events + priorStrength * priorMean
            ) / Math.max(1e-9, aggregate.effectiveTrials + priorStrength);
            const posteriorTrials = aggregate.effectiveTrials + priorStrength;
            const posteriorEvents = aggregate.events + priorStrength * priorMean;
            const logOddsLift = logit(posteriorRate) - logit(expectedRate);
            cohorts.set(aggregate.key, {
                ...aggregate,
                expectedRate,
                priorMean,
                priorStrength,
                posteriorRate,
                posteriorTrials,
                posteriorEvents,
                lowerPosteriorRate: wilsonLower(posteriorEvents, posteriorTrials),
                logOddsLift
            });
        }
    });
    return {
        cohorts,
        options: {
            minEffectiveTrials: Number(options.minEffectiveTrials || 18),
            minAbsoluteLift: Number(options.minAbsoluteLift || 0.0025)
        }
    };
}

function scoreOpportunity(row, model) {
    const keys = cohortKeys(row);
    let cohort = null;
    for (let index = keys.length - 1; index >= 0; index--) {
        const candidate = model.cohorts.get(keys[index]);
        if (candidate && candidate.effectiveTrials >= model.options.minEffectiveTrials) {
            cohort = candidate;
            break;
        }
    }
    const baseProbability = clamp(Number(row.setSize || 0) / 100);
    const predictedProbability = cohort
        ? logistic(logit(baseProbability) + cohort.logOddsLift)
        : baseProbability;
    const lowerProbability = cohort
        ? cohort.lowerPosteriorRate
        : baseProbability;
    return {
        cohortKey: cohort?.key || null,
        cohortLevel: cohort?.level ?? -1,
        effectiveTrials: cohort?.effectiveTrials || 0,
        baseProbability,
        predictedProbability,
        lowerProbability,
        absoluteLift: predictedProbability - baseProbability,
        lowerAbsoluteLift: lowerProbability - baseProbability,
        logOddsLift: cohort?.logOddsLift || 0,
        protect: lowerProbability - baseProbability >= model.options.minAbsoluteLift
    };
}

function evaluate(rows, model) {
    let brierModel = 0;
    let brierBaseline = 0;
    let logLossModel = 0;
    let logLossBaseline = 0;
    let protectedTrials = 0;
    let protectedEvents = 0;
    let protectedExpected = 0;
    for (const row of rows) {
        const scored = scoreOpportunity(row, model);
        const outcome = Number(Boolean(row.eventOccurred));
        const predicted = clamp(scored.predictedProbability);
        const baseline = clamp(scored.baseProbability);
        brierModel += (predicted - outcome) ** 2;
        brierBaseline += (baseline - outcome) ** 2;
        logLossModel -= outcome * Math.log(predicted) + (1 - outcome) * Math.log(1 - predicted);
        logLossBaseline -= outcome * Math.log(baseline) + (1 - outcome) * Math.log(1 - baseline);
        if (scored.protect) {
            protectedTrials++;
            protectedEvents += outcome;
            protectedExpected += baseline;
        }
    }
    const count = Math.max(1, rows.length);
    return {
        rows: rows.length,
        brierModel: brierModel / count,
        brierBaseline: brierBaseline / count,
        brierImprovement: (brierBaseline - brierModel) / count,
        logLossModel: logLossModel / count,
        logLossBaseline: logLossBaseline / count,
        logLossImprovement: (logLossBaseline - logLossModel) / count,
        protectedTrials,
        protectedEvents,
        protectedEventRate: protectedTrials ? protectedEvents / protectedTrials : 0,
        protectedExpectedRate: protectedTrials ? protectedExpected / protectedTrials : 0
    };
}

module.exports = {
    cohortKeys,
    evaluate,
    fitModel,
    lengthBucket,
    scoreOpportunity,
    widthBucket
};
