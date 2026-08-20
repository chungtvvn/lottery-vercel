'use strict';

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function parseBlockShape(key = '') {
    const match = String(key).match(/block(\d+)x(\d+)SoLe/i);
    if (!match) return null;
    const aLength = Number(match[1]);
    const bLength = Number(match[2]);
    return {
        id: `${aLength}-${bLength}`,
        aLength,
        bLength,
        cycleLength: aLength + bLength,
        minimumLength: aLength * 2 + bLength
    };
}

function widthBucket(size) {
    const value = Math.max(1, Number(size) || 100);
    if (value <= 5) return 'w05';
    if (value <= 10) return 'w10';
    if (value <= 20) return 'w20';
    if (value <= 30) return 'w30';
    if (value <= 40) return 'w40';
    return 'w99';
}

function sampleBucket(value) {
    const count = Math.max(0, Number(value || 0));
    if (count <= 1) return 'n1';
    if (count <= 3) return 'n3';
    if (count <= 7) return 'n7';
    return 'n8p';
}

function frequencyBucket(value) {
    const frequency = Math.max(0, Number(value || 0));
    if (frequency <= 0.25) return 'f025';
    if (frequency <= 0.5) return 'f050';
    if (frequency <= 1) return 'f100';
    if (frequency <= 2) return 'f200';
    return 'f201p';
}

function extensionBucket(candidate, shape) {
    const extension = Math.max(0, Number(candidate.baseLen || 0) - shape.minimumLength);
    if (extension === 0) return 'x0';
    if (extension <= 2) return 'x2';
    if (extension <= 5) return 'x5';
    return 'x6p';
}

function phaseBucket(candidate, shape) {
    const extension = Math.max(0, Number(candidate.baseLen || 0) - shape.minimumLength);
    const phase = extension % shape.cycleLength;
    return phase < shape.aLength ? 'nextA' : 'nextB';
}

function normalizeActiveBlock(candidate = {}, options = {}) {
    if (candidate.state !== 'active' || candidate.family !== 'block') return null;
    if (options.recordOnly && !['at-record', 'super-record'].includes(candidate.recordState)) return null;
    const shape = parseBlockShape(candidate.key);
    if (!shape) return null;
    const numbers = [...new Set((candidate.numbers || []).map(Number))]
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
        .sort((left, right) => left - right);
    const maxSetSize = Math.max(1, Number(options.maxSetSize || 40));
    if (!numbers.length || numbers.length > maxSetSize) return null;
    return {
        ...candidate,
        shape,
        numbers,
        setSize: numbers.length,
        baseExclusionRate: Number.isFinite(Number(candidate.baseExclusionRate))
            ? clamp(candidate.baseExclusionRate)
            : 1 - numbers.length / 100,
        observedExcluded: Boolean(candidate.observedExcluded),
        recordState: String(candidate.recordState || 'unknown')
    };
}

function descriptorIds(candidate = {}) {
    const shape = candidate.shape || parseBlockShape(candidate.key);
    if (!shape) return [];
    const width = widthBucket(candidate.setSize);
    const record = candidate.recordState;
    const sample = sampleBucket(candidate.currentCount);
    const frequency = frequencyBucket(candidate.exposureFrequencyPerYear);
    const extension = extensionBucket(candidate, shape);
    const phase = phaseBucket(candidate, shape);
    const root = `block|${shape.id}`;
    const scoped = `${root}|${width}`;
    const boundary = `${scoped}|${record}`;
    const recurrence = `${boundary}|${frequency}`;
    const maturity = `${recurrence}|${sample}|${extension}`;
    const phaseState = `${maturity}|${phase}`;
    return [
        { id: root, parentId: null, depth: 0 },
        { id: scoped, parentId: root, depth: 1 },
        { id: boundary, parentId: scoped, depth: 2 },
        { id: recurrence, parentId: boundary, depth: 3 },
        { id: maturity, parentId: recurrence, depth: 4 },
        { id: phaseState, parentId: maturity, depth: 5 }
    ];
}

function collectDailyBlockCohorts(rows = [], options = {}) {
    const aggregate = new Map();
    for (const row of rows) {
        const daily = new Map();
        for (const rawCandidate of row.candidateDiagnostics || []) {
            const candidate = normalizeActiveBlock(rawCandidate, options);
            if (!candidate) continue;
            for (const descriptor of descriptorIds(candidate)) {
                if (!daily.has(descriptor.id)) {
                    daily.set(descriptor.id, {
                        ...descriptor,
                        candidates: 0,
                        observedExcluded: 0,
                        expectedExcluded: 0,
                        recordCandidates: 0,
                        recordBreaks: 0
                    });
                }
                const current = daily.get(descriptor.id);
                current.candidates++;
                current.observedExcluded += Number(candidate.observedExcluded);
                current.expectedExcluded += candidate.baseExclusionRate;
                if (['at-record', 'super-record'].includes(candidate.recordState)) {
                    current.recordCandidates++;
                    current.recordBreaks += Number(!candidate.observedExcluded);
                }
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
                    expectedExcluded: 0,
                    recordDays: 0,
                    recordBreakRateSum: 0
                });
            }
            const target = aggregate.get(current.id);
            target.days++;
            target.candidateOpportunities += current.candidates;
            target.observedExcluded += current.observedExcluded / Math.max(1, current.candidates);
            target.expectedExcluded += current.expectedExcluded / Math.max(1, current.candidates);
            if (current.recordCandidates > 0) {
                target.recordDays++;
                target.recordBreakRateSum += current.recordBreaks / current.recordCandidates;
            }
        }
    }
    return aggregate;
}

function fitStableBlockAdmissionModel(yearGroups = [], options = {}) {
    const groups = (yearGroups || []).filter(rows => Array.isArray(rows) && rows.length > 0);
    const yearly = groups.map(rows => collectDailyBlockCohorts(rows, options));
    const combined = collectDailyBlockCohorts(groups.flat(), options);
    const minDaysPerYear = Math.max(1, Number(options.minDaysPerYear || 5));
    const minYears = Math.max(1, Number(options.minYears || Math.ceil(groups.length * 0.6)));
    const minPositiveShare = clamp(options.minPositiveShare ?? 0.7);
    const minConservativeEdge = Number(options.minConservativeEdge || 0.005);
    const stabilityZ = Math.max(0, Number(options.stabilityZ ?? 0.67));
    const model = new Map();

    for (const [id, cohort] of combined.entries()) {
        const observations = yearly.map(map => map.get(id))
            .filter(row => row && row.days >= minDaysPerYear)
            .map(row => ({
                days: row.days,
                edge: (row.observedExcluded - row.expectedExcluded) / row.days,
                recordDays: row.recordDays,
                recordBreakRate: row.recordDays > 0
                    ? row.recordBreakRateSum / row.recordDays
                    : null
            }));
        if (observations.length < minYears) continue;
        const edges = observations.map(row => row.edge);
        const meanEdge = edges.reduce((sum, value) => sum + value, 0) / edges.length;
        const variance = edges.length > 1
            ? edges.reduce((sum, value) => sum + (value - meanEdge) ** 2, 0) / (edges.length - 1)
            : 0;
        const conservativeEdge = meanEdge - stabilityZ * Math.sqrt(variance / edges.length);
        const positiveYears = edges.filter(value => value > 0).length;
        const positiveShare = positiveYears / edges.length;
        if (positiveShare < minPositiveShare || conservativeEdge < minConservativeEdge) continue;
        model.set(id, {
            ...cohort,
            trainYears: observations.length,
            positiveYears,
            positiveShare,
            meanYearlyEdge: meanEdge,
            yearlyEdgeVariance: variance,
            conservativeEdge,
            meanRecordBreakRate: (() => {
                const values = observations.map(row => row.recordBreakRate).filter(Number.isFinite);
                return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
            })()
        });
    }
    return model;
}

function fitStableBlockBreakModel(yearGroups = [], options = {}) {
    const groups = (yearGroups || []).filter(rows => Array.isArray(rows) && rows.length > 0);
    const yearly = groups.map(rows => collectDailyBlockCohorts(rows, options));
    const combined = collectDailyBlockCohorts(groups.flat(), options);
    const minDaysPerYear = Math.max(1, Number(options.minDaysPerYear || 5));
    const minYears = Math.max(1, Number(options.minYears || Math.ceil(groups.length * 0.6)));
    const minPositiveShare = clamp(options.minPositiveShare ?? 0.7);
    const minConservativeLift = Number(options.minConservativeLift || 0.005);
    const stabilityZ = Math.max(0, Number(options.stabilityZ ?? 0.67));
    const model = new Map();

    for (const [id, cohort] of combined.entries()) {
        const observations = yearly.map(map => map.get(id))
            .filter(row => row && row.days >= minDaysPerYear)
            .map(row => ({
                days: row.days,
                continuationLift: (row.expectedExcluded - row.observedExcluded) / row.days
            }));
        if (observations.length < minYears) continue;
        const lifts = observations.map(row => row.continuationLift);
        const meanLift = lifts.reduce((sum, value) => sum + value, 0) / lifts.length;
        const variance = lifts.length > 1
            ? lifts.reduce((sum, value) => sum + (value - meanLift) ** 2, 0) / (lifts.length - 1)
            : 0;
        const conservativeLift = meanLift - stabilityZ * Math.sqrt(variance / lifts.length);
        const positiveYears = lifts.filter(value => value > 0).length;
        const positiveShare = positiveYears / lifts.length;
        if (positiveShare < minPositiveShare || conservativeLift < minConservativeLift) continue;
        model.set(id, {
            ...cohort,
            trainYears: observations.length,
            positiveYears,
            positiveShare,
            meanYearlyLift: meanLift,
            yearlyLiftVariance: variance,
            conservativeLift
        });
    }
    return model;
}

function getBlockAdmissionEvidence(candidate, model, options = {}) {
    const normalized = normalizeActiveBlock(candidate, options);
    if (!normalized) return null;
    const minDays = Math.max(1, Number(options.minEvidenceDays || 20));
    for (const descriptor of descriptorIds(normalized).reverse()) {
        const cohort = model.get(descriptor.id);
        if (!cohort || cohort.days < minDays) continue;
        return {
            candidate: normalized,
            cohort,
            edge: cohort.conservativeEdge,
            recordBreakProbability: 1 - (
                cohort.observedExcluded / Math.max(1, cohort.days)
            )
        };
    }
    return null;
}

function scoreBlockNumbers(row, model, options = {}) {
    const byNumber = ALL_NUMBERS.map(() => new Map());
    const deduplicated = new Map();
    for (const rawCandidate of row.candidateDiagnostics || []) {
        const evidence = getBlockAdmissionEvidence(rawCandidate, model, options);
        if (!evidence || evidence.edge <= 0) continue;
        const signature = evidence.candidate.numbers.join(',');
        const existing = deduplicated.get(signature);
        if (!existing || evidence.edge > existing.edge) deduplicated.set(signature, evidence);
    }
    for (const evidence of deduplicated.values()) {
        const shape = evidence.candidate.shape.id;
        for (const number of evidence.candidate.numbers) {
            const existing = byNumber[number].get(shape);
            if (!existing || evidence.edge > existing.edge) byNumber[number].set(shape, evidence);
        }
    }
    const weights = options.shapeWeights || [1, 0.55, 0.3];
    return ALL_NUMBERS.map(number => {
        const evidence = [...byNumber[number].values()]
            .sort((left, right) => right.edge - left.edge)
            .slice(0, weights.length);
        return {
            number,
            score: evidence.reduce((sum, item, index) => sum + item.edge * weights[index], 0),
            supportShapes: evidence.length,
            evidence: evidence.slice(0, 3)
        };
    });
}

function getBlockBreakEvidence(candidate, model, options = {}) {
    const normalized = normalizeActiveBlock(candidate, options);
    if (!normalized) return null;
    const minDays = Math.max(1, Number(options.minEvidenceDays || 20));
    for (const descriptor of descriptorIds(normalized).reverse()) {
        const cohort = model.get(descriptor.id);
        if (!cohort || cohort.days < minDays) continue;
        return {
            candidate: normalized,
            cohort,
            lift: cohort.conservativeLift
        };
    }
    return null;
}

function scoreBlockBreakNumbers(row, model, options = {}) {
    const byNumber = ALL_NUMBERS.map(() => new Map());
    const deduplicated = new Map();
    for (const rawCandidate of row.candidateDiagnostics || []) {
        const evidence = getBlockBreakEvidence(rawCandidate, model, options);
        if (!evidence || evidence.lift <= 0) continue;
        const signature = evidence.candidate.numbers.join(',');
        const existing = deduplicated.get(signature);
        if (!existing || evidence.lift > existing.lift) deduplicated.set(signature, evidence);
    }
    for (const evidence of deduplicated.values()) {
        const shape = evidence.candidate.shape.id;
        for (const number of evidence.candidate.numbers) {
            const existing = byNumber[number].get(shape);
            if (!existing || evidence.lift > existing.lift) byNumber[number].set(shape, evidence);
        }
    }
    const weights = options.shapeWeights || [1, 0.55, 0.3];
    return ALL_NUMBERS.map(number => {
        const evidence = [...byNumber[number].values()]
            .sort((left, right) => right.lift - left.lift)
            .slice(0, weights.length);
        return {
            number,
            score: evidence.reduce((sum, item, index) => sum + item.lift * weights[index], 0),
            supportShapes: evidence.length,
            evidence: evidence.slice(0, 3)
        };
    });
}

function refinePredictionWithBlockGuard(row, admissionModel, breakModel, options = {}) {
    const baselineStrategy = String(options.baselineStrategy || 'chainSmallFirst');
    const baseline = new Set((row.strategies?.[baselineStrategy] || []).map(Number));
    const exclusionScores = scoreBlockNumbers(row, admissionModel, options);
    const protectionScores = scoreBlockBreakNumbers(row, breakModel, options);
    const removable = exclusionScores.filter(item => baseline.has(item.number) && item.score > 0)
        .sort((left, right) => right.score - left.score || left.number - right.number);
    const protectedExcluded = protectionScores.filter(item => !baseline.has(item.number) && item.score > 0)
        .sort((left, right) => right.score - left.score || left.number - right.number);
    const result = new Set(baseline);
    const swaps = [];
    const swapLimit = Math.max(0, Number(options.swapLimit || 1));
    const minAdmissionScore = Number(options.minAdmissionScore || 0);
    const minProtectionScore = Number(options.minProtectionScore || 0);
    const minAdmissionShapes = Math.max(1, Number(options.minAdmissionShapes || 1));
    const minProtectionShapes = Math.max(1, Number(options.minProtectionShapes || 1));
    const minCombinedScore = Number(options.minCombinedScore || 0);
    for (let index = 0; index < Math.min(removable.length, protectedExcluded.length); index++) {
        if (swaps.length >= swapLimit) break;
        const out = removable[index];
        const incoming = protectedExcluded[index];
        if (out.score < minAdmissionScore || incoming.score < minProtectionScore) break;
        if (
            out.supportShapes < minAdmissionShapes ||
            incoming.supportShapes < minProtectionShapes
        ) continue;
        const combinedScore = out.score + incoming.score;
        if (combinedScore < minCombinedScore) continue;
        result.delete(out.number);
        result.add(incoming.number);
        swaps.push({
            out: out.number,
            in: incoming.number,
            exclusionScore: out.score,
            protectionScore: incoming.score,
            exclusionShapes: out.supportShapes,
            protectionShapes: incoming.supportShapes,
            combinedScore
        });
    }
    return {
        betNumbers: [...result].sort((left, right) => left - right),
        exclusionScores,
        protectionScores,
        swaps
    };
}

function refinePredictionWithBlockAdmission(row, model, options = {}) {
    const baselineStrategy = String(options.baselineStrategy || 'chainSmallFirst');
    const baseline = new Set((row.strategies?.[baselineStrategy] || []).map(Number));
    const scores = scoreBlockNumbers(row, model, options);
    const riskyBets = scores.filter(item => baseline.has(item.number))
        .sort((left, right) => right.score - left.score || left.number - right.number);
    const saferExcluded = scores.filter(item => !baseline.has(item.number))
        .sort((left, right) => left.score - right.score || left.number - right.number);
    const result = new Set(baseline);
    const swaps = [];
    const swapLimit = Math.max(0, Number(options.swapLimit || 1));
    for (let index = 0; index < Math.min(riskyBets.length, saferExcluded.length); index++) {
        if (swaps.length >= swapLimit) break;
        const risky = riskyBets[index];
        const safer = saferExcluded[index];
        const margin = risky.score - safer.score;
        if (risky.score <= 0 || margin < Number(options.minSwapMargin || 0.0025)) break;
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
    collectDailyBlockCohorts,
    descriptorIds,
    extensionBucket,
    frequencyBucket,
    fitStableBlockAdmissionModel,
    fitStableBlockBreakModel,
    getBlockAdmissionEvidence,
    getBlockBreakEvidence,
    normalizeActiveBlock,
    parseBlockShape,
    phaseBucket,
    refinePredictionWithBlockAdmission,
    refinePredictionWithBlockGuard,
    sampleBucket,
    scoreBlockBreakNumbers,
    scoreBlockNumbers,
    widthBucket
};
