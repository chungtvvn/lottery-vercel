const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function erf(value) {
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value);
    const t = 1 / (1 + 0.3275911 * x);
    const polynomial = (((((1.061405429 * t - 1.453152027) * t)
        + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
    return sign * (1 - polynomial * Math.exp(-x * x));
}

function normalCdf(value) {
    return 0.5 * (1 + erf(Number(value || 0) / Math.sqrt(2)));
}

function stateBucket(detail = {}) {
    const active = Math.max(0, Number(detail.activeSets || 0));
    const potential = Math.max(0, Number(detail.potentialSets || 0));
    if (active > 0 && potential > 0) return 'mixed';
    if (active > 0) return 'active';
    return 'potential';
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

function parseGroup(group) {
    const [family = 'other', pattern = 'other'] = String(group || '').split('|');
    return { family: family || 'other', pattern: pattern || 'other' };
}

function buildDailyLeaves(row) {
    const leaves = new Map();
    for (const evidence of row.numberEvidence || []) {
        const number = Number(evidence.number);
        if (!Number.isInteger(number) || number < 0 || number > 99) continue;
        for (const [group, rawStrength] of Object.entries(evidence.groups || {})) {
            const detail = evidence.groupDetails?.[group] || {};
            const { family, pattern } = parseGroup(group);
            const state = stateBucket(detail);
            const key = `${family}|${pattern}|${state}`;
            if (!leaves.has(key)) {
                leaves.set(key, {
                    key,
                    family,
                    pattern,
                    state,
                    members: new Set(),
                    maxStrength: 0
                });
            }
            const leaf = leaves.get(key);
            leaf.members.add(number);
            leaf.maxStrength = Math.max(leaf.maxStrength, clamp(rawStrength));
        }
    }
    return [...leaves.values()].map(leaf => ({
        ...leaf,
        width: leaf.members.size,
        widthBucket: widthBucket(leaf.members.size)
    }));
}

function scopeDescriptors(leaf) {
    const suffix = `${leaf.state}|${leaf.widthBucket}`;
    const globalId = `state|${suffix}`;
    const familyId = `family|${leaf.family}|${suffix}`;
    const leafId = `pattern|${leaf.family}|${leaf.pattern}|${suffix}`;
    return [
        { id: globalId, depth: 0, parentId: null },
        { id: familyId, depth: 1, parentId: globalId },
        { id: leafId, depth: 2, parentId: familyId }
    ];
}

function collectScopeStats(rows) {
    const stats = new Map();
    for (const row of rows) {
        const dailyScopes = new Map();
        for (const leaf of buildDailyLeaves(row)) {
            for (const descriptor of scopeDescriptors(leaf)) {
                if (!dailyScopes.has(descriptor.id)) {
                    dailyScopes.set(descriptor.id, {
                        ...descriptor,
                        members: new Set()
                    });
                }
                const scope = dailyScopes.get(descriptor.id);
                leaf.members.forEach(number => scope.members.add(number));
            }
        }
        const actual = Number(row.actual);
        for (const scope of dailyScopes.values()) {
            if (!stats.has(scope.id)) {
                stats.set(scope.id, {
                    id: scope.id,
                    depth: scope.depth,
                    parentId: scope.parentId,
                    days: 0,
                    expectedHits: 0,
                    observedHits: 0
                });
            }
            const current = stats.get(scope.id);
            current.days++;
            current.expectedHits += scope.members.size / 100;
            current.observedHits += Number(scope.members.has(actual));
        }
    }
    return stats;
}

function fitHierarchicalModel(rows, options = {}) {
    const strengths = options.priorStrengths || [30, 45, 60];
    const stats = collectScopeStats(rows);
    const model = new Map();
    const ordered = [...stats.values()].sort((left, right) =>
        left.depth - right.depth || left.id.localeCompare(right.id)
    );
    for (const current of ordered) {
        const baseline = current.expectedHits / Math.max(1, current.days);
        const parent = current.parentId ? model.get(current.parentId) : null;
        const priorMean = parent?.posteriorHitRate ?? baseline;
        const priorStrength = Math.max(1, Number(strengths[current.depth] || strengths.at(-1) || 30));
        const posteriorHitRate = (
            current.observedHits + priorStrength * priorMean
        ) / (current.days + priorStrength);
        const posteriorVariance = posteriorHitRate * (1 - posteriorHitRate)
            / Math.max(1, current.days + priorStrength + 1);
        const edge = baseline - posteriorHitRate;
        const z = edge / Math.sqrt(Math.max(1e-9, posteriorVariance));
        model.set(current.id, {
            ...current,
            baseline,
            priorMean,
            priorStrength,
            posteriorHitRate,
            posteriorVariance,
            exclusionEdge: edge,
            probabilityBelowBaseline: normalCdf(z)
        });
    }
    return model;
}

function evidenceScore(entry, config) {
    if (!entry || entry.days < config.minDays) return 0;
    if (entry.exclusionEdge <= 0) return 0;
    if (entry.probabilityBelowBaseline < config.minConfidence) return 0;
    const reliability = Math.sqrt(entry.days / (entry.days + config.reliabilityDays));
    return entry.exclusionEdge * entry.probabilityBelowBaseline * reliability;
}

function historicalSurvivalMultiplier(leaf, config = {}) {
    const weight = Math.max(0, Number(config.survivalWeight || 0));
    const priors = config.survivalPriors?.groups || config.survivalPriors;
    if (!weight || !(priors instanceof Map) || leaf.state === 'potential') return 1;
    const prior = priors.get(`${leaf.family}|${leaf.pattern}`);
    if (!prior) return 1;
    const stateWeight = leaf.state === 'mixed' ? 0.5 : 1;
    const signal = clamp(prior.standardizedBreakLift, -1, 1) * stateWeight;
    return clamp(Math.exp(weight * signal), 0.5, 2);
}

function scoreNumbers(row, model, config) {
    const byNumberFamily = ALL_NUMBERS.map(() => new Map());
    for (const leaf of buildDailyLeaves(row)) {
        const descriptors = scopeDescriptors(leaf);
        const learned = [...descriptors].reverse()
            .map(descriptor => model.get(descriptor.id))
            .find(entry => evidenceScore(entry, config) > 0);
        if (!learned) continue;
        const score = evidenceScore(learned, config) * (0.8 + leaf.maxStrength * 0.2) *
            historicalSurvivalMultiplier(leaf, config);
        for (const number of leaf.members) {
            const existing = byNumberFamily[number].get(leaf.family) || 0;
            if (score > existing) byNumberFamily[number].set(leaf.family, score);
        }
    }
    const weights = [1, 0.55, 0.3, 0.16];
    return ALL_NUMBERS.map(number => {
        const familyScores = [...byNumberFamily[number].values()]
            .sort((left, right) => right - left)
            .slice(0, config.topFamilies);
        return {
            number,
            score: familyScores.reduce(
                (sum, value, index) => sum + value * (weights[index] || 0.1),
                0
            ),
            supportFamilies: familyScores.length
        };
    });
}

function refineBaselinePrediction(row, model, config) {
    const baseline = new Set((row.strategies?.chainSmallFirst || []).map(Number));
    const scores = scoreNumbers(row, model, config);
    const riskyBets = scores.filter(item => baseline.has(item.number))
        .sort((left, right) => right.score - left.score || left.number - right.number);
    const safeExcluded = scores.filter(item => !baseline.has(item.number))
        .sort((left, right) => left.score - right.score || left.number - right.number);
    const refined = new Set(baseline);
    const swaps = [];
    for (let index = 0; index < Math.min(riskyBets.length, safeExcluded.length); index++) {
        if (swaps.length >= config.swapLimit) break;
        const risky = riskyBets[index];
        const safe = safeExcluded[index];
        if (risky.score <= 0 || risky.score - safe.score < config.minMargin) break;
        refined.delete(risky.number);
        refined.add(safe.number);
        swaps.push({ out: risky.number, in: safe.number, margin: risky.score - safe.score });
    }
    return {
        betNumbers: [...refined].sort((left, right) => left - right),
        swaps,
        scores
    };
}

module.exports = {
    ALL_NUMBERS,
    buildDailyLeaves,
    collectScopeStats,
    fitHierarchicalModel,
    historicalSurvivalMultiplier,
    normalCdf,
    refineBaselinePrediction,
    scoreNumbers,
    scopeDescriptors,
    stateBucket,
    widthBucket
};
