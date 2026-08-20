'use strict';

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function wilsonLower(successes, trials, z = 1.28) {
    const n = Math.max(0, Number(trials) || 0);
    if (n <= 0) return 0;
    const p = clamp((Number(successes) || 0) / n);
    const z2 = z * z;
    const denominator = 1 + z2 / n;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return clamp((center - margin) / denominator);
}

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number))]
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
        .sort((left, right) => left - right);
}

function transitionEvidence(candidate, config) {
    const numbers = normalizeNumbers(candidate.numbers);
    const setSize = numbers.length;
    if (setSize === 0 || setSize >= 100) return null;
    const baseFailure = 1 - setSize / 100;
    const trials = Number(candidate.trials);
    const failures = Number(candidate.failures);
    if (!Number.isFinite(trials) || !Number.isFinite(failures)) return null;
    if (trials < config.minTrials) return null;
    const lowerFailure = wilsonLower(failures, trials, config.wilsonZ);
    const edge = lowerFailure - baseFailure;
    const requiredEdge = (1 - baseFailure) * config.margin;
    if (edge < requiredEdge) return null;
    return {
        reason: candidate.state === 'potential' ? 'formation-evidence' : 'transition-evidence',
        edge,
        requiredEdge,
        reliability: Math.sqrt(trials / (trials + config.reliabilityPrior)),
        baseFailure,
        lowerFailure
    };
}

function boundaryEvidence(candidate, config) {
    const numbers = normalizeNumbers(candidate.numbers);
    const setSize = numbers.length;
    const frequency = Math.max(0, Number(candidate.exposureFrequencyPerYear) || 0);
    const recordState = String(candidate.recordState || '');
    const isBoundary = ['never-pattern', 'at-record', 'super-record'].includes(recordState);
    if (!isBoundary || setSize === 0 || setSize > config.maxBoundarySetSize) return null;
    if (frequency > config.recordFrequencyLimit) return null;

    const observedSamples = Math.max(
        0,
        Number(candidate.currentCount) || 0,
        Number(candidate.formationCount) || 0
    );
    if (recordState !== 'super-record' && observedSamples < config.minBoundarySamples) return null;
    if (candidate.state === 'potential' && !config.allowUnknownPotentialBoundary) return null;
    if (candidate.state === 'potential' && Number(candidate.currentLen || 0) < config.minPotentialCurrentLen) {
        return null;
    }

    const rarity = clamp(1 - frequency / Math.max(config.recordFrequencyLimit, 0.0001));
    const specificity = 1 - setSize / 100;
    const stateBonus = recordState === 'super-record' ? 0.05
        : recordState === 'never-pattern' ? 0.035
            : 0.02;
    return {
        reason: `boundary-${recordState}`,
        edge: (1 - specificity) * config.margin + rarity * 0.05 + stateBonus,
        reliability: Math.sqrt(Math.max(1, observedSamples) / (
            Math.max(1, observedSamples) + config.reliabilityPrior
        )),
        baseFailure: specificity,
        lowerFailure: null
    };
}

function qualifyCandidate(candidate, config) {
    if (!candidate || Number(candidate.tier || 4) > 3) return null;
    const transition = transitionEvidence(candidate, config);
    const boundary = boundaryEvidence(candidate, config);
    const evidence = transition && boundary
        ? (transition.edge >= boundary.edge ? transition : boundary)
        : transition || boundary;
    if (!evidence) return null;
    const numbers = normalizeNumbers(candidate.numbers);
    const frequency = Math.max(0, Number(candidate.exposureFrequencyPerYear) || 0);
    const frequencyLimit = candidate.state === 'active'
        ? config.activeFrequencyLimit
        : config.recordFrequencyLimit;
    if (frequency > frequencyLimit && !transition) return null;
    const tierWeight = Number(candidate.tier) === 1 ? 1
        : Number(candidate.tier) === 2 ? 0.88
            : 0.7;
    const specificity = 0.8 + 0.2 / Math.sqrt(Math.max(1, numbers.length));
    return {
        ...candidate,
        numbers,
        admissionReason: evidence.reason,
        admissionScore: Math.max(0, evidence.edge) *
            (0.55 + 0.45 * evidence.reliability) * tierWeight * specificity
    };
}

function rankNumbers(candidates, baselineBets, config) {
    const baselineBetSet = new Set(normalizeNumbers(baselineBets));
    const qualified = (candidates || [])
        .map(candidate => qualifyCandidate(candidate, config))
        .filter(Boolean);
    const rows = ALL_NUMBERS.map(number => {
        const strongestByFamily = new Map();
        for (const candidate of qualified) {
            if (!candidate.numbers.includes(number)) continue;
            const family = String(candidate.family || 'other');
            const signature = `${family}|${candidate.numbers.join(',')}`;
            const existing = strongestByFamily.get(signature);
            if (!existing || candidate.admissionScore > existing.admissionScore) {
                strongestByFamily.set(signature, candidate);
            }
        }
        const familyBest = new Map();
        for (const candidate of strongestByFamily.values()) {
            const family = String(candidate.family || 'other');
            const existing = familyBest.get(family);
            if (!existing || candidate.admissionScore > existing.admissionScore) {
                familyBest.set(family, candidate);
            }
        }
        const strongest = [...familyBest.values()]
            .sort((left, right) => right.admissionScore - left.admissionScore)
            .slice(0, config.maxFamiliesPerNumber);
        const weights = [1, 0.62, 0.38, 0.24, 0.15];
        const score = strongest.reduce(
            (sum, candidate, index) => sum + candidate.admissionScore * (weights[index] || 0.1),
            0
        );
        return {
            number,
            score,
            support: strongest.length,
            baselineExcluded: !baselineBetSet.has(number)
        };
    }).sort((left, right) =>
        right.score - left.score
        || right.support - left.support
        || Number(right.baselineExcluded) - Number(left.baselineExcluded)
        || left.number - right.number
    );
    return { ranked: rows, qualified };
}

function buildPrediction(candidates, baselineBets, hold, config) {
    const { ranked, qualified } = rankNumbers(candidates, baselineBets, config);
    const baselineBetSet = new Set(normalizeNumbers(baselineBets));
    const baselineExcluded = new Set(ALL_NUMBERS.filter(number => !baselineBetSet.has(number)));
    const proposedExcluded = new Set(ranked.slice(0, hold).map(row => row.number));
    const maxSwaps = Number.isFinite(Number(config.maxSwaps))
        ? Math.max(0, Number(config.maxSwaps))
        : Infinity;
    const rankByNumber = new Map(ranked.map(row => [row.number, row]));
    const toExclude = [...baselineBetSet]
        .filter(number => proposedExcluded.has(number))
        .sort((left, right) => {
            const leftRow = rankByNumber.get(left);
            const rightRow = rankByNumber.get(right);
            return rightRow.score - leftRow.score
                || rightRow.support - leftRow.support
                || left - right;
        });
    const toProtect = [...baselineExcluded]
        .filter(number => !proposedExcluded.has(number))
        .sort((left, right) => {
            const leftRow = rankByNumber.get(left);
            const rightRow = rankByNumber.get(right);
            return leftRow.score - rightRow.score
                || leftRow.support - rightRow.support
                || left - right;
        });
    const swapCount = Math.min(maxSwaps, toExclude.length, toProtect.length);
    const excluded = new Set(baselineExcluded);
    for (let index = 0; index < swapCount; index++) {
        excluded.delete(toProtect[index]);
        excluded.add(toExclude[index]);
    }
    return {
        betNumbers: ALL_NUMBERS.filter(number => !excluded.has(number)),
        excludedNumbers: [...excluded].sort((left, right) => left - right),
        qualifiedChains: qualified.length,
        coveredNumbers: ranked.filter(row => row.score > 0).length,
        swapCount,
        changedNumbers: ALL_NUMBERS.filter(number =>
            baselineBetSet.has(number) !== !excluded.has(number)
        ).length
    };
}

module.exports = {
    buildPrediction,
    qualifyCandidate,
    rankNumbers,
    transitionEvidence,
    wilsonLower
};
