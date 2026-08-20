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

function widthBucket(value) {
    const size = Math.max(1, Number(value) || 100);
    if (size <= 2) return 'w02';
    if (size <= 5) return 'w05';
    if (size <= 10) return 'w10';
    if (size <= 20) return 'w20';
    if (size <= 40) return 'w40';
    return 'w99';
}

function lengthBucket(value) {
    const length = Math.max(1, Number(value) || 1);
    if (length <= 2) return `l${length}`;
    if (length === 3) return 'l3';
    if (length === 4) return 'l4';
    if (length <= 6) return 'l5-6';
    return 'l7+';
}

function recordBucket(value = '') {
    const normalized = String(value || 'unknown');
    if (normalized === 'super-record' || normalized === 'at-record') return 'record-or-super';
    if (normalized === 'never-pattern' || normalized === 'never-formed') return 'never';
    if (normalized === 'near-record') return 'near-record';
    return 'below-record';
}

function normalizeNumbers(values = []) {
    return [...new Set((values || []).map(Number).filter(number =>
        Number.isInteger(number) && number >= 0 && number <= 99
    ))].sort((left, right) => left - right);
}

function candidateLeaf(candidate) {
    const members = normalizeNumbers(candidate.numbers);
    if (members.length === 0 || members.length >= 100) return null;
    const family = String(candidate.family || 'other');
    const pattern = String(candidate.pattern || 'other');
    const state = candidate.state === 'potential' ? 'potential' : 'active';
    const baseLength = Math.max(1, Number(candidate.baseLen || candidate.currentLen || 1));
    return {
        family,
        pattern,
        state,
        lengthBucket: lengthBucket(baseLength),
        recordBucket: recordBucket(candidate.recordState),
        widthBucket: widthBucket(members.length),
        width: members.length,
        members,
        tier: Number(candidate.tier || 4),
        key: String(candidate.key || '')
    };
}

function leafId(leaf) {
    return [
        leaf.family,
        leaf.pattern,
        leaf.state,
        leaf.lengthBucket,
        leaf.recordBucket,
        leaf.widthBucket
    ].join('|');
}

function buildDailyLeaves(row) {
    const leaves = new Map();
    for (const candidate of row.candidateDiagnostics || []) {
        const leaf = candidateLeaf(candidate);
        if (!leaf) continue;
        const id = leafId(leaf);
        const setSignature = leaf.members.join(',');
        const uniqueId = `${id}|set:${setSignature}`;
        if (!leaves.has(uniqueId)) leaves.set(uniqueId, { ...leaf, id, setSignature });
        else leaves.get(uniqueId).tier = Math.min(leaves.get(uniqueId).tier, leaf.tier);
    }
    return [...leaves.values()];
}

function scopeDescriptors(leaf) {
    const stateWidth = `${leaf.state}|${leaf.widthBucket}`;
    const globalId = `state|${stateWidth}`;
    const familyId = `family|${leaf.family}|${stateWidth}`;
    const patternId = `pattern|${leaf.family}|${leaf.pattern}|${stateWidth}`;
    const lengthId = `length|${leaf.family}|${leaf.pattern}|${leaf.state}|${leaf.widthBucket}|` +
        `${leaf.lengthBucket}|${leaf.recordBucket}`;
    return [
        { id: globalId, depth: 0, parentId: null },
        { id: familyId, depth: 1, parentId: globalId },
        { id: patternId, depth: 2, parentId: familyId },
        { id: lengthId, depth: 3, parentId: patternId }
    ];
}

function collectScopeStats(rows) {
    const stats = new Map();
    for (const row of rows) {
        const dailyScopes = new Map();
        for (const leaf of buildDailyLeaves(row)) {
            for (const descriptor of scopeDescriptors(leaf)) {
                if (!dailyScopes.has(descriptor.id)) {
                    dailyScopes.set(descriptor.id, { ...descriptor, sets: new Map() });
                }
                dailyScopes.get(descriptor.id).sets.set(leaf.setSignature, leaf.members);
            }
        }
        const actual = Number(row.actual);
        for (const scope of dailyScopes.values()) {
            const sets = [...scope.sets.values()];
            if (!sets.length) continue;
            const expectedHit = sets.reduce((sum, members) => sum + members.length / 100, 0) / sets.length;
            const observedHit = sets.reduce((sum, members) => sum + Number(members.includes(actual)), 0) / sets.length;
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
            current.expectedHits += expectedHit;
            current.observedHits += observedHit;
        }
    }
    return stats;
}

function fitStateLengthModel(rows, options = {}) {
    const strengths = options.priorStrengths || [20, 30, 45, 60];
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
        const posteriorVariance = posteriorHitRate * (1 - posteriorHitRate) /
            Math.max(1, current.days + priorStrength + 1);
        const exclusionEdge = baseline - posteriorHitRate;
        const z = exclusionEdge / Math.sqrt(Math.max(1e-9, posteriorVariance));
        model.set(current.id, {
            ...current,
            baseline,
            priorMean,
            priorStrength,
            posteriorHitRate,
            posteriorVariance,
            exclusionEdge,
            probabilityBelowBaseline: normalCdf(z)
        });
    }
    return model;
}

function evidenceScore(entry, config) {
    if (!entry || entry.days < config.minDays) return 0;
    if (entry.exclusionEdge <= 0 || entry.probabilityBelowBaseline < config.minConfidence) return 0;
    const reliability = Math.sqrt(entry.days / (entry.days + config.reliabilityDays));
    return entry.exclusionEdge * entry.probabilityBelowBaseline * reliability;
}

function scoreNumbers(row, model, config) {
    const byNumberFamily = ALL_NUMBERS.map(() => new Map());
    const seenSets = new Set();
    for (const candidate of row.candidateDiagnostics || []) {
        const leaf = candidateLeaf(candidate);
        if (!leaf || leaf.tier > 3) continue;
        const signature = `${leaf.family}|${leaf.state}|${leaf.members.join(',')}`;
        if (seenSets.has(signature)) continue;
        seenSets.add(signature);
        const learned = scopeDescriptors(leaf).reverse()
            .map(descriptor => model.get(descriptor.id))
            .find(entry => evidenceScore(entry, config) > 0);
        if (!learned) continue;
        const specificity = Math.sqrt(100 / Math.max(1, leaf.members.length));
        const tierWeight = leaf.tier === 1 ? 1 : leaf.tier === 2 ? 0.8 : 0.58;
        const score = evidenceScore(learned, config) * tierWeight *
            Math.min(2, 0.7 + specificity * 0.15);
        for (const number of leaf.members) {
            const existing = byNumberFamily[number].get(leaf.family) || 0;
            if (score > existing) byNumberFamily[number].set(leaf.family, score);
        }
    }
    const weights = [1, 0.5, 0.25, 0.125];
    return ALL_NUMBERS.map(number => {
        const familyScores = [...byNumberFamily[number].values()]
            .sort((left, right) => right - left)
            .slice(0, config.topFamilies);
        return {
            number,
            score: familyScores.reduce((sum, value, index) =>
                sum + value * (weights[index] || 0.08), 0),
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
    candidateLeaf,
    collectScopeStats,
    evidenceScore,
    fitStateLengthModel,
    lengthBucket,
    normalCdf,
    recordBucket,
    refineBaselinePrediction,
    scoreNumbers,
    scopeDescriptors,
    widthBucket
};
