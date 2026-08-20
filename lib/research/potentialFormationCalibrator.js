'use strict';

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function logit(value) {
    const probability = clamp(value, 1e-6, 1 - 1e-6);
    return Math.log(probability / (1 - probability));
}

function logistic(value) {
    return 1 / (1 + Math.exp(-Number(value || 0)));
}

function widthBucket(size) {
    const value = Math.max(1, Number(size) || 100);
    if (value <= 2) return 'w02';
    if (value <= 5) return 'w05';
    if (value <= 10) return 'w10';
    if (value <= 20) return 'w20';
    if (value <= 40) return 'w40';
    return 'w99';
}

function lengthBucket(candidate = {}) {
    const length = Math.max(1, Number(candidate.baseLen || candidate.currentLen || 1));
    if (length >= 7) return 'd7p';
    if (length >= 5) return 'd5p';
    return `d${length}`;
}

function frequencyBucket(candidate = {}) {
    const frequency = Math.max(0, Number(candidate.targetFrequencyPerYear || 0));
    if (frequency === 0) return 'f0';
    if (frequency < 0.25) return 'f025';
    if (frequency < 0.75) return 'f075';
    if (frequency < 1.5) return 'f150';
    return 'f150p';
}

function durationBucket(candidate = {}) {
    const averageLength = Number(candidate.targetAvgLength);
    const targetLength = Number(candidate.targetLen || 0);
    if (!Number.isFinite(averageLength) || targetLength <= 0) return 'du';
    const excess = averageLength - targetLength;
    if (excess < 0.25) return 'e025';
    if (excess < 0.75) return 'e075';
    return 'e075p';
}

function normalizePotential(candidate = {}) {
    if (candidate.state !== 'potential') return null;
    const numbers = [...new Set((candidate.numbers || []).map(Number))]
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
        .sort((left, right) => left - right);
    if (!numbers.length || numbers.length >= 100) return null;
    return {
        ...candidate,
        family: String(candidate.family || 'other'),
        pattern: String(candidate.pattern || 'other'),
        recordState: String(candidate.recordState || 'unknown'),
        numbers,
        setSize: numbers.length,
        baseExclusionRate: Number.isFinite(Number(candidate.baseExclusionRate))
            ? clamp(candidate.baseExclusionRate)
            : 1 - numbers.length / 100,
        observedExcluded: Boolean(candidate.observedExcluded)
    };
}

function descriptorIds(candidate = {}) {
    const width = widthBucket(candidate.setSize);
    const length = lengthBucket(candidate);
    const frequency = frequencyBucket(candidate);
    const duration = durationBucket(candidate);
    const root = `potential|${width}`;
    const family = `${root}|${candidate.family}`;
    const state = `${family}|${candidate.recordState}|${length}`;
    const pattern = `${state}|${candidate.pattern}`;
    const recurrence = `${pattern}|${frequency}|${duration}`;
    return [
        { id: root, parentId: null, depth: 0 },
        { id: family, parentId: root, depth: 1 },
        { id: state, parentId: family, depth: 2 },
        { id: pattern, parentId: state, depth: 3 },
        { id: recurrence, parentId: pattern, depth: 4 }
    ];
}

function collectDailyCohorts(rows = []) {
    const aggregate = new Map();
    for (const row of rows) {
        const daily = new Map();
        for (const rawCandidate of row.candidateDiagnostics || []) {
            const candidate = normalizePotential(rawCandidate);
            if (!candidate) continue;
            for (const descriptor of descriptorIds(candidate)) {
                if (!daily.has(descriptor.id)) {
                    daily.set(descriptor.id, {
                        ...descriptor,
                        candidates: 0,
                        observedExcluded: 0,
                        expectedExcluded: 0
                    });
                }
                const current = daily.get(descriptor.id);
                current.candidates++;
                current.observedExcluded += Number(candidate.observedExcluded);
                current.expectedExcluded += candidate.baseExclusionRate;
            }
        }
        for (const current of daily.values()) {
            if (!aggregate.has(current.id)) {
                aggregate.set(current.id, {
                    id: current.id,
                    parentId: current.parentId,
                    depth: current.depth,
                    days: 0,
                    candidateOpportunities: 0,
                    observedExcluded: 0,
                    expectedExcluded: 0
                });
            }
            const target = aggregate.get(current.id);
            const divisor = Math.max(1, current.candidates);
            target.days++;
            target.candidateOpportunities += current.candidates;
            target.observedExcluded += current.observedExcluded / divisor;
            target.expectedExcluded += current.expectedExcluded / divisor;
        }
    }
    return aggregate;
}

function fitPotentialFormationModel(rows = [], options = {}) {
    const priorStrengths = options.priorStrengths || [80, 70, 60, 50, 40];
    const cohorts = collectDailyCohorts(rows);
    const model = new Map();
    const ordered = [...cohorts.values()].sort((left, right) =>
        left.depth - right.depth || left.id.localeCompare(right.id)
    );
    for (const cohort of ordered) {
        const baseline = cohort.expectedExcluded / Math.max(1, cohort.days);
        const parent = cohort.parentId ? model.get(cohort.parentId) : null;
        const priorMean = parent?.posteriorExclusionRate ?? baseline;
        const priorStrength = Math.max(
            1,
            Number(priorStrengths[cohort.depth] || priorStrengths.at(-1) || 50)
        );
        const posteriorExclusionRate = (
            cohort.observedExcluded + priorStrength * priorMean
        ) / (cohort.days + priorStrength);
        const posteriorVariance = posteriorExclusionRate * (1 - posteriorExclusionRate)
            / Math.max(1, cohort.days + priorStrength + 1);
        model.set(cohort.id, {
            ...cohort,
            baseline,
            priorStrength,
            priorMean,
            rawExclusionRate: cohort.observedExcluded / Math.max(1, cohort.days),
            posteriorExclusionRate,
            posteriorVariance,
            logOddsShift: logit(posteriorExclusionRate) - logit(baseline)
        });
    }
    return model;
}

function fitStablePotentialFormationModel(yearGroups = [], options = {}) {
    const groups = (yearGroups || []).filter(rows => Array.isArray(rows) && rows.length > 0);
    const combined = groups.flat();
    const model = fitPotentialFormationModel(combined, options);
    const yearly = groups.map(rows => collectDailyCohorts(rows));
    const minDaysPerYear = Math.max(1, Number(options.minDaysPerYear || 6));
    const minYears = Math.max(1, Number(options.minYears || Math.ceil(groups.length * 0.6)));
    const minPositiveShare = clamp(options.minPositiveShare ?? 0.7);
    const minStableEdge = Number(options.minStableEdge || 0);
    const stabilityZ = Math.max(0, Number(options.stabilityZ ?? 0.67));

    for (const [id, cohort] of [...model.entries()]) {
        const observations = yearly.map(map => map.get(id))
            .filter(row => row && row.days >= minDaysPerYear)
            .map(row => ({
                days: row.days,
                edge: (row.observedExcluded - row.expectedExcluded) / row.days
            }));
        if (observations.length < minYears) {
            model.delete(id);
            continue;
        }
        const positiveYears = observations.filter(row => row.edge > 0).length;
        const positiveShare = positiveYears / observations.length;
        const meanEdge = observations.reduce((sum, row) => sum + row.edge, 0) / observations.length;
        const variance = observations.length > 1
            ? observations.reduce((sum, row) => sum + (row.edge - meanEdge) ** 2, 0)
                / (observations.length - 1)
            : 0;
        const standardError = Math.sqrt(variance / observations.length);
        const conservativeEdge = meanEdge - stabilityZ * standardError;
        if (positiveShare < minPositiveShare || conservativeEdge <= minStableEdge) {
            model.delete(id);
            continue;
        }
        const stableExclusionRate = clamp(cohort.baseline + conservativeEdge);
        model.set(id, {
            ...cohort,
            stableYears: observations.length,
            positiveYears,
            positiveShare,
            meanYearlyEdge: meanEdge,
            yearlyEdgeVariance: variance,
            conservativeYearlyEdge: conservativeEdge,
            posteriorExclusionRate: stableExclusionRate,
            logOddsShift: logit(stableExclusionRate) - logit(cohort.baseline)
        });
    }
    return model;
}

function getPotentialEvidence(candidate, model, options = {}) {
    const normalized = normalizePotential(candidate);
    if (!normalized) return null;
    const minDaysByDepth = options.minDaysByDepth || [20, 16, 14, 12, 10];
    const reliabilityDays = Math.max(1, Number(options.reliabilityDays || 45));
    const conservativeZ = Math.max(0, Number(options.conservativeZ || 0));
    const descriptors = descriptorIds(normalized).reverse();
    for (const descriptor of descriptors) {
        const cohort = model.get(descriptor.id);
        const minDays = Number(minDaysByDepth[descriptor.depth] || minDaysByDepth.at(-1) || 10);
        if (!cohort || cohort.days < minDays) continue;
        const reliability = Math.sqrt(cohort.days / (cohort.days + reliabilityDays));
        const adjusted = logistic(logit(normalized.baseExclusionRate) + cohort.logOddsShift * reliability);
        const uncertainty = conservativeZ * Math.sqrt(Math.max(0, cohort.posteriorVariance));
        const conservativeAdjusted = clamp(adjusted - uncertainty * reliability);
        return {
            candidate: normalized,
            cohort,
            adjustedExclusionRate: adjusted,
            conservativeExclusionRate: conservativeAdjusted,
            edge: conservativeAdjusted - normalized.baseExclusionRate,
            reliability
        };
    }
    return null;
}

function scorePotentialNumbers(row, model, options = {}) {
    const byNumberFamily = ALL_NUMBERS.map(() => new Map());
    const deduplicated = new Map();
    for (const rawCandidate of row.candidateDiagnostics || []) {
        const evidence = getPotentialEvidence(rawCandidate, model, options);
        if (!evidence || evidence.edge <= Number(options.minEdge || 0)) continue;
        const signature = `${evidence.candidate.family}|${evidence.candidate.numbers.join(',')}|` +
            `${lengthBucket(evidence.candidate)}|${frequencyBucket(evidence.candidate)}`;
        const existing = deduplicated.get(signature);
        if (!existing || evidence.edge > existing.edge) deduplicated.set(signature, evidence);
    }
    for (const evidence of deduplicated.values()) {
        for (const number of evidence.candidate.numbers) {
            const family = evidence.candidate.family;
            const existing = byNumberFamily[number].get(family);
            if (!existing || evidence.edge > existing.edge) {
                byNumberFamily[number].set(family, evidence);
            }
        }
    }
    const weights = options.familyWeights || [1, 0.5, 0.25, 0.125];
    return ALL_NUMBERS.map(number => {
        const evidence = [...byNumberFamily[number].values()]
            .sort((left, right) => right.edge - left.edge)
            .slice(0, weights.length);
        return {
            number,
            score: evidence.reduce((sum, item, index) => sum + item.edge * weights[index], 0),
            supportFamilies: evidence.length,
            evidence: evidence.slice(0, 3)
        };
    });
}

function refinePredictionWithPotential(row, model, options = {}) {
    const baselineId = String(options.baselineStrategy || 'numberAnnualCalibratedRisk');
    const baseline = new Set((row.strategies?.[baselineId] || []).map(Number));
    const scores = scorePotentialNumbers(row, model, options);
    const riskyBets = scores.filter(item => baseline.has(item.number))
        .sort((left, right) => right.score - left.score || left.number - right.number);
    const saferExcluded = scores.filter(item => !baseline.has(item.number))
        .sort((left, right) => left.score - right.score || left.number - right.number);
    const result = new Set(baseline);
    const swaps = [];
    const swapLimit = Math.max(0, Number(options.swapLimit || 0));
    for (let index = 0; index < Math.min(riskyBets.length, saferExcluded.length); index++) {
        if (swaps.length >= swapLimit) break;
        const risky = riskyBets[index];
        const safer = saferExcluded[index];
        const margin = risky.score - safer.score;
        if (risky.score <= 0 || margin < Number(options.minSwapMargin || 0)) break;
        result.delete(risky.number);
        result.add(safer.number);
        swaps.push({
            out: risky.number,
            in: safer.number,
            riskyScore: risky.score,
            saferScore: safer.score,
            margin
        });
    }
    return {
        betNumbers: [...result].sort((left, right) => left - right),
        scores,
        swaps
    };
}

module.exports = {
    ALL_NUMBERS,
    collectDailyCohorts,
    descriptorIds,
    durationBucket,
    fitPotentialFormationModel,
    fitStablePotentialFormationModel,
    frequencyBucket,
    getPotentialEvidence,
    lengthBucket,
    normalizePotential,
    refinePredictionWithPotential,
    scorePotentialNumbers,
    widthBucket
};
