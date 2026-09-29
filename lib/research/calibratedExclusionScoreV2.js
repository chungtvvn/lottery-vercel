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

// Abramowitz & Stegun erf/erfc approximation (error < 1.5e-7)
function erfc(x) {
    if (x < 0) return 2 - erfc(-x);
    const t = 1.0 / (1.0 + 0.3275911 * x);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return poly * Math.exp(-x * x);
}

function calculateCandidatePValue(transition, numbersLength) {
    const trials = Number(transition?.trials || 0);
    const breaks = Number(transition?.breaks || 0);
    if (trials <= 0) return 1.0;
    const p0 = 1 - Math.max(1, Math.min(99, Number(numbersLength || 1))) / 100;
    const expectedBreaks = trials * p0;
    if (breaks <= expectedBreaks) return 1.0; // Không có excess breaks so với ngẫu nhiên

    const variance = trials * p0 * (1 - p0);
    if (variance <= 0) return 1.0;
    const z = (breaks - 0.5 - expectedBreaks) / Math.sqrt(variance);
    const pValue = 0.5 * erfc(z / Math.SQRT2);
    return clamp(pValue, 0, 1);
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

    // Split-stability check (Point 6): Loại bỏ candidate không ổn định qua 2 giai đoạn lịch sử
    if (candidate.isStableAcrossSplits === false) return null;
    if (candidate.split1Edge !== undefined && candidate.split2Edge !== undefined) {
        if (Number(candidate.split1Edge) <= 0 || Number(candidate.split2Edge) <= 0) {
            return null;
        }
    }

    const transition = getTransition(candidate);
    // Point 3: Yêu cầu mẫu tối thiểu cao hơn (nâng từ 5 lên 20-30 mẫu)
    const minTrials = Math.max(1, Number(options.minTrials !== undefined ? options.minTrials : 20));
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

/**
 * Point 6: Kiểm soát False Discovery bằng Benjamini-Hochberg (BH FDR).
 * Lọc bỏ các pattern "trông rất chuẩn" nhưng thực chất là ngẫu nhiên do kiểm định nhiều giả thuyết (multiple testing).
 */
function filterCandidatesByBenjaminiHochberg(candidates, options = {}) {
    const alpha = Math.max(0.01, Math.min(0.5, Number(options.fdrAlpha !== undefined ? options.fdrAlpha : 0.10)));
    const scoredItems = [];

    for (const candidate of candidates || []) {
        const numbers = normalizeNumbers(candidate?.numbers);
        if (numbers.length === 0 || numbers.length >= 100) continue;
        const transition = getTransition(candidate);
        const minTrials = Math.max(1, Number(options.minTrials !== undefined ? options.minTrials : 20));
        if (!transition || transition.trials < minTrials) continue;

        // Split-stability check:
        if (candidate.isStableAcrossSplits === false) continue;
        if (candidate.split1Edge !== undefined && candidate.split2Edge !== undefined) {
            if (Number(candidate.split1Edge) <= 0 || Number(candidate.split2Edge) <= 0) {
                continue;
            }
        }

        const pValue = calculateCandidatePValue(transition, numbers.length);
        scoredItems.push({ candidate, pValue });
    }

    if (scoredItems.length === 0) return [];

    // Sắp xếp tăng dần theo p-value
    scoredItems.sort((a, b) => a.pValue - b.pValue);
    const m = scoredItems.length;
    let maxSignificantIndex = -1;

    for (let i = 0; i < m; i++) {
        const rank = i + 1;
        const threshold = (rank / m) * alpha;
        if (scoredItems[i].pValue <= threshold) {
            maxSignificantIndex = i;
        }
    }

    if (maxSignificantIndex < 0) {
        // Không có candidate nào vượt qua ngưỡng Benjamini-Hochberg
        return [];
    }

    return scoredItems.slice(0, maxSignificantIndex + 1).map(item => item.candidate);
}

/**
 * Point 4: Không ép đủ số lượng.
 * Evidence tới đâu loại tới đó, thiếu thì kích hoạt abstain hoặc trả về tập số loại tự nhiên.
 * Tuyệt đối không nới lỏng threshold vô căn cứ để ép đủ 40-70 số.
 */
function getCalibratedExclusionSet(candidates, options = {}) {
    const filteredCandidates = options.applyFDR !== false
        ? filterCandidatesByBenjaminiHochberg(candidates, options)
        : candidates;

    const ranked = rankNumbersByCalibratedExclusionV2(filteredCandidates, options);

    // Chỉ loại các số thực sự có điểm bằng chứng tin cậy > 0 (credibleEdge > 0)
    const minScore = Math.max(0, Number(options.minExclusionScore || 0.0001));
    const credibleRows = ranked.filter(row => row.score > minScore && row.memberships > 0);
    const candidateExcluded = credibleRows.map(row => row.num);

    const minRequiredExclusions = Number(options.minRequiredExclusions || 20);
    const isAbstained = Boolean(options.strictAbstain && candidateExcluded.length < minRequiredExclusions);

    const finalExcluded = isAbstained ? [] : candidateExcluded;
    const toBet = ALL_NUMBERS.filter(num => !finalExcluded.includes(num));

    return {
        excluded: finalExcluded,
        toBet,
        excludedCount: finalExcluded.length,
        toBetCount: toBet.length,
        abstained: isAbstained,
        abstainReason: isAbstained
            ? `Chỉ có ${candidateExcluded.length} số có evidence tin cậy (cần tối thiểu ${minRequiredExclusions}). Kích hoạt Abstain bảo vệ vốn.`
            : null,
        rankedNumbers: ranked,
        significantCandidatesCount: filteredCandidates.length
    };
}

module.exports = {
    calculateCandidatePValue,
    erfc,
    filterCandidatesByBenjaminiHochberg,
    getCalibratedExclusionSet,
    getPatternFamily,
    normalizeNumbers,
    rankNumbersByCalibratedExclusionV2,
    scoreCandidateEvidence,
    wilsonLower
};
