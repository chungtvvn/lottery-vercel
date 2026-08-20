const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function wilsonLower(successes, trials, z = 1.28) {
    const n = Math.max(0, Number(trials || 0));
    if (n <= 0) return 0;
    const p = clamp(Number(successes || 0) / n);
    const z2 = z * z;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return clamp((center - margin) / (1 + z2 / n));
}

function normalizeNumbers(numbers) {
    return [...new Set((numbers || []).map(Number))]
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
        .sort((left, right) => left - right);
}

function getPatternFamily(key = '') {
    const normalized = String(key).toLowerCase();
    if (/block\d+x\d+sole/.test(normalized) || /nhip/.test(normalized)) return 'block';
    if (/^(bo_|bo:)/.test(normalized)) return 'fixed-set';
    if (/^(dau_dit|dau-dit|dau.*dit|dit.*dau)/.test(normalized)) return 'head-tail';
    if (/^(dau_|dau:)/.test(normalized)) return 'head';
    if (/^(dit_|dit:)/.test(normalized)) return 'tail';
    if (/^(tong_moi|tong_tt|tong_|tong:)/.test(normalized)) return 'sum';
    if (/^(hieu_|hieu:)/.test(normalized)) return 'difference';
    if (/^(so_|so:|dong_)/.test(normalized)) return 'number';
    if (/(chan|le|to|nho|nguyen_to|hop_so)/.test(normalized)) return 'class';
    return normalized.split(/[:_]/)[0] || 'other';
}

function getTransition(candidate) {
    if (candidate.isPotential) {
        if (!candidate.neverFormed || candidate.formationEvidenceSource !== 'daily-replay') {
            return null;
        }
        const trials = Math.max(0, Number(candidate.formationTrials || 0));
        const formations = Math.min(
            trials,
            Math.max(0, Number(candidate.formationCount || 0))
        );
        return {
            trials,
            breaks: Math.max(0, trials - formations),
            source: 'daily-replay'
        };
    }

    if (candidate.transitionEvidenceSource !== 'annual-streak-transition') return null;
    const trials = Math.max(0, Number(candidate.currentCount || 0));
    const continues = Math.min(
        trials,
        Math.max(0, Number(candidate.nextCount || 0))
    );
    return {
        trials,
        breaks: Math.max(0, Number.isFinite(Number(candidate.breakCount))
            ? Number(candidate.breakCount)
            : trials - continues),
        source: 'annual-streak-transition'
    };
}

function scoreCandidateEvidence(candidate, options = {}) {
    const numbers = normalizeNumbers(candidate?.numbers);
    if (numbers.length === 0 || numbers.length >= 100 || Number(candidate?.tier || 4) > 3) {
        return null;
    }

    const transition = getTransition(candidate);
    const minTrials = Math.max(1, Number(options.minTrials || 5));
    if (!transition || transition.trials < minTrials) return null;

    const baselineBreak = 1 - numbers.length / 100;
    const priorWeight = Math.max(1, Number(options.priorWeight || 30));
    const posteriorBreak = (
        transition.breaks + priorWeight * baselineBreak
    ) / (transition.trials + priorWeight);
    const lowerBreak = wilsonLower(transition.breaks, transition.trials);
    const conservativeBreak = posteriorBreak * 0.68 + lowerBreak * 0.32;
    const credibleEdge = Math.max(0, conservativeBreak - baselineBreak);
    if (credibleEdge <= 0) return null;

    const reliability = Math.sqrt(transition.trials / (transition.trials + 30));
    const specificity = 0.82 + 0.18 / Math.sqrt(numbers.length);
    const tierWeight = candidate.tier === 1 ? 1
        : candidate.tier === 2 ? 0.88
            : 0.72;

    // Frequency, gap and record may only refine valid transition evidence.
    const targetFrequency = Math.max(
        0,
        Number(candidate.targetFrequencyPerYear ?? candidate.continuationFrequencyPerYear ?? 0)
    );
    const frequencyFactor = targetFrequency >= 2
        ? 0.88
        : targetFrequency >= 1
            ? 0.96
            : 1;

    const gapSample = Math.max(0, Number(candidate.targetGapSample || 0));
    const gapRatio = Number(candidate.targetGapRatio);
    let recurrenceFactor = 1;
    if (gapSample >= 4 && Number.isFinite(gapRatio) && gapRatio >= 0) {
        const gapReliability = Math.sqrt(gapSample / (gapSample + 16));
        const boundedSignal = clamp((0.75 - gapRatio) / 0.75, -1, 1);
        recurrenceFactor += boundedSignal * gapReliability * 0.02;
    }

    const recordFactor = candidate.isRecordOrSuper && transition.trials >= 8
        ? 1.015
        : 1;
    const stateFactor = candidate.isPotential ? 0.82 : 1;
    const evidence = credibleEdge
        * reliability
        * specificity
        * tierWeight
        * frequencyFactor
        * recurrenceFactor
        * recordFactor
        * stateFactor;

    return {
        evidence,
        numbers,
        family: getPatternFamily(candidate.key),
        transition,
        baselineBreak,
        posteriorBreak,
        lowerBreak,
        conservativeBreak,
        credibleEdge,
        reliability
    };
}

function rankNumbersByCalibratedExclusionV2(candidates, options = {}) {
    const diversityWeights = options.diversityWeights || [1, 0.55, 0.3, 0.16, 0.08];
    const evidenceByNumber = ALL_NUMBERS.map(() => new Map());

    for (const candidate of candidates || []) {
        const scored = scoreCandidateEvidence(candidate, options);
        if (!scored) continue;
        const setSignature = scored.numbers.join(',');
        const signature = `${scored.family}|${setSignature}`;
        for (const number of scored.numbers) {
            const existing = evidenceByNumber[number].get(signature);
            if (!existing || scored.evidence > existing.scored.evidence) {
                evidenceByNumber[number].set(signature, { candidate, scored });
            }
        }
    }

    return ALL_NUMBERS.map(number => {
        const strongestByFamily = new Map();
        for (const row of evidenceByNumber[number].values()) {
            const existing = strongestByFamily.get(row.scored.family);
            if (!existing || row.scored.evidence > existing.scored.evidence) {
                strongestByFamily.set(row.scored.family, row);
            }
        }
        const diverse = [...strongestByFamily.values()]
            .sort((left, right) => right.scored.evidence - left.scored.evidence)
            .slice(0, diversityWeights.length);
        const score = diverse.reduce(
            (sum, row, index) => sum + row.scored.evidence * diversityWeights[index],
            0
        );
        return {
            num: number,
            rank: 0,
            score,
            memberships: diverse.length,
            topChains: diverse.slice(0, 3).map(row => row.candidate),
            evidence: diverse.map(row => ({
                key: row.candidate.key,
                family: row.scored.family,
                score: row.scored.evidence,
                trials: row.scored.transition.trials,
                credibleEdge: row.scored.credibleEdge
            }))
        };
    }).sort((left, right) =>
        right.score - left.score
        || right.memberships - left.memberships
        || left.num - right.num
    ).map((row, index) => ({ ...row, rank: index + 1 }));
}

module.exports = {
    getPatternFamily,
    normalizeNumbers,
    rankNumbersByCalibratedExclusionV2,
    scoreCandidateEvidence,
    wilsonLower
};
