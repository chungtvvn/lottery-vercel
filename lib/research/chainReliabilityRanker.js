const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
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
    const current = candidate.state === 'potential'
        ? Number(candidate.baseLen || 0)
        : Number(candidate.currentLen || candidate.baseLen || 0);
    const target = Number(candidate.targetLen || current + 1);
    const gap = Math.max(1, target - current);
    const depth = Math.max(1, current);
    return `${depth >= 6 ? 'd6p' : `d${depth}`}|${gap >= 3 ? 'g3p' : `g${gap}`}`;
}

function normalizeCandidate(candidate = {}) {
    const numbers = [...new Set((candidate.numbers || []).map(Number))]
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
        .sort((left, right) => left - right);
    if (!numbers.length || numbers.length >= 100) return null;
    return {
        ...candidate,
        family: String(candidate.family || 'other'),
        pattern: String(candidate.pattern || 'other'),
        state: candidate.state === 'potential' ? 'potential' : 'active',
        recordState: String(candidate.recordState || 'unknown'),
        numbers,
        setSize: numbers.length,
        baseExclusionRate: Number.isFinite(Number(candidate.baseExclusionRate))
            ? clamp(candidate.baseExclusionRate)
            : 1 - numbers.length / 100,
        observedExcluded: Boolean(candidate.observedExcluded)
    };
}

function descriptorIds(candidate) {
    const suffix = [
        candidate.state,
        candidate.recordState,
        widthBucket(candidate.setSize),
        lengthBucket(candidate)
    ].join('|');
    const root = `state|${suffix}`;
    const family = `family|${candidate.family}|${suffix}`;
    const pattern = `pattern|${candidate.family}|${candidate.pattern}|${suffix}`;
    return [
        { id: root, parentId: null, depth: 0 },
        { id: family, parentId: root, depth: 1 },
        { id: pattern, parentId: family, depth: 2 }
    ];
}

function collectCohortStats(rows = []) {
    const stats = new Map();
    for (const row of rows) {
        // Các candidate trong cùng ngày cùng chịu một kết quả và có tương quan mạnh.
        // Mỗi cohort vì vậy chỉ được tính một đơn vị ngày, với rate trung bình của
        // các tập số thành viên, thay vì giả vờ hàng nghìn candidate là độc lập.
        const daily = new Map();
        for (const rawCandidate of row.candidateDiagnostics || []) {
            const candidate = normalizeCandidate(rawCandidate);
            if (!candidate) continue;
            for (const descriptor of descriptorIds(candidate)) {
                if (!daily.has(descriptor.id)) {
                    daily.set(descriptor.id, {
                        ...descriptor,
                        candidateOpportunities: 0,
                        observedExcluded: 0,
                        expectedExcluded: 0
                    });
                }
                const current = daily.get(descriptor.id);
                current.candidateOpportunities++;
                current.observedExcluded += Number(candidate.observedExcluded);
                current.expectedExcluded += candidate.baseExclusionRate;
            }
        }
        for (const dailyRow of daily.values()) {
            if (!stats.has(dailyRow.id)) {
                stats.set(dailyRow.id, {
                    id: dailyRow.id,
                    parentId: dailyRow.parentId,
                    depth: dailyRow.depth,
                    opportunities: 0,
                    candidateOpportunities: 0,
                    observedExcluded: 0,
                    expectedExcluded: 0
                });
            }
            const current = stats.get(dailyRow.id);
            const divisor = Math.max(1, dailyRow.candidateOpportunities);
            current.opportunities++;
            current.candidateOpportunities += dailyRow.candidateOpportunities;
            current.observedExcluded += dailyRow.observedExcluded / divisor;
            current.expectedExcluded += dailyRow.expectedExcluded / divisor;
        }
    }
    return stats;
}

function fitReliabilityModel(rows = [], options = {}) {
    const priorStrengths = options.priorStrengths || [40, 60, 90];
    const stats = collectCohortStats(rows);
    const model = new Map();
    const ordered = [...stats.values()].sort((left, right) =>
        left.depth - right.depth || left.id.localeCompare(right.id)
    );
    for (const current of ordered) {
        const baseline = current.expectedExcluded / Math.max(1, current.opportunities);
        const parent = current.parentId ? model.get(current.parentId) : null;
        const parentMean = parent?.posteriorExclusionRate ?? baseline;
        const priorStrength = Math.max(
            1,
            Number(priorStrengths[current.depth] || priorStrengths.at(-1) || 60)
        );
        const posteriorExclusionRate = (
            current.observedExcluded + priorStrength * parentMean
        ) / (current.opportunities + priorStrength);
        const variance = posteriorExclusionRate * (1 - posteriorExclusionRate)
            / Math.max(1, current.opportunities + priorStrength + 1);
        model.set(current.id, {
            ...current,
            baseline,
            priorStrength,
            posteriorExclusionRate,
            variance,
            rawExclusionRate: current.observedExcluded / Math.max(1, current.opportunities)
        });
    }
    return model;
}

function cohortEvidence(entry, config = {}) {
    if (!entry || entry.opportunities < Number(config.minOpportunities || 10)) return 0;
    const z = Math.max(0, Number(config.conservativeZ || 0));
    const conservativeRate = clamp(
        entry.posteriorExclusionRate - z * Math.sqrt(Math.max(0, entry.variance))
    );
    const edge = conservativeRate - entry.baseline;
    if (edge <= Number(config.minEdge || 0)) return 0;
    const reliabilityDays = Math.max(1, Number(config.reliabilityDays || 40));
    const reliability = Math.sqrt(
        entry.opportunities / (entry.opportunities + reliabilityDays)
    );
    return edge * reliability;
}

function scoreCandidate(candidate, model, config = {}) {
    const normalized = normalizeCandidate(candidate);
    if (!normalized) return { score: 0, candidate: null, cohort: null };
    const descriptors = descriptorIds(normalized).reverse();
    for (const descriptor of descriptors) {
        const cohort = model.get(descriptor.id);
        const score = cohortEvidence(cohort, config);
        if (score > 0) return { score, candidate: normalized, cohort };
    }
    return { score: 0, candidate: normalized, cohort: null };
}

function scoreNumbers(row, model, config = {}) {
    const byNumberFamily = ALL_NUMBERS.map(() => new Map());
    const selectedCandidates = [];
    const deduplicated = new Map();
    for (const rawCandidate of row.candidateDiagnostics || []) {
        const scored = scoreCandidate(rawCandidate, model, config);
        if (!scored.candidate || scored.score <= 0) continue;
        const signature = `${scored.candidate.state}|${scored.candidate.family}|` +
            `${scored.candidate.numbers.join(',')}|${lengthBucket(scored.candidate)}`;
        const existing = deduplicated.get(signature);
        if (!existing || scored.score > existing.score) deduplicated.set(signature, scored);
    }
    for (const scored of deduplicated.values()) {
        selectedCandidates.push(scored);
        for (const number of scored.candidate.numbers) {
            const existing = byNumberFamily[number].get(scored.candidate.family);
            if (!existing || scored.score > existing.score) {
                byNumberFamily[number].set(scored.candidate.family, scored);
            }
        }
    }
    const weights = config.familyWeights || [1, 0.5, 0.25, 0.125];
    const numbers = ALL_NUMBERS.map(number => {
        const families = [...byNumberFamily[number].values()]
            .sort((left, right) => right.score - left.score)
            .slice(0, weights.length);
        return {
            number,
            score: families.reduce(
                (sum, item, index) => sum + item.score * weights[index],
                0
            ),
            supportFamilies: families.length,
            topEvidence: families.slice(0, 3).map(item => ({
                key: item.candidate.key,
                family: item.candidate.family,
                pattern: item.candidate.pattern,
                state: item.candidate.state,
                recordState: item.candidate.recordState,
                score: item.score,
                opportunities: item.cohort?.opportunities || 0,
                posteriorExclusionRate: item.cohort?.posteriorExclusionRate || 0,
                baseline: item.cohort?.baseline || 0
            }))
        };
    });
    return { numbers, selectedCandidates };
}

function refinePrediction(row, model, config = {}) {
    const baseStrategyId = String(config.baseStrategyId || 'chainSmallFirst');
    const baseline = new Set((row.strategies?.[baseStrategyId] || []).map(Number));
    const { numbers, selectedCandidates } = scoreNumbers(row, model, config);
    const riskyBets = numbers.filter(item => baseline.has(item.number))
        .sort((left, right) => right.score - left.score || left.number - right.number);
    const saferExcluded = numbers.filter(item => !baseline.has(item.number))
        .sort((left, right) => left.score - right.score || left.number - right.number);
    const result = new Set(baseline);
    const swaps = [];
    const swapLimit = Math.max(0, Number(config.swapLimit || 0));
    for (let index = 0; index < Math.min(riskyBets.length, saferExcluded.length); index++) {
        if (swaps.length >= swapLimit) break;
        const risky = riskyBets[index];
        const safe = saferExcluded[index];
        const margin = risky.score - safe.score;
        if (risky.score <= 0 || margin < Number(config.minSwapMargin || 0)) break;
        result.delete(risky.number);
        result.add(safe.number);
        swaps.push({
            out: risky.number,
            in: safe.number,
            riskyScore: risky.score,
            safeScore: safe.score,
            margin
        });
    }
    return {
        baseStrategyId,
        betNumbers: [...result].sort((left, right) => left - right),
        scores: numbers,
        selectedCandidates,
        swaps
    };
}

module.exports = {
    ALL_NUMBERS,
    cohortEvidence,
    collectCohortStats,
    descriptorIds,
    fitReliabilityModel,
    lengthBucket,
    normalizeCandidate,
    refinePrediction,
    scoreCandidate,
    scoreNumbers,
    widthBucket
};
