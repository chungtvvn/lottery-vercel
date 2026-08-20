const {
    descriptorIds,
    fitReliabilityModel,
    lengthBucket,
    normalizeCandidate
} = require('./chainReliabilityRanker');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function buildQualityMap(rows, options = {}) {
    const priorStrengths = options.priorStrengths || [60, 90, 120];
    const conservativeZ = Math.max(0, Number(options.conservativeZ ?? 1.28));
    const reliabilityDays = Math.max(1, Number(options.reliabilityDays ?? 60));
    const model = fitReliabilityModel(rows, { priorStrengths });
    const years = [...new Set(rows.map(row => String(row.date).slice(0, 4)))].sort();
    const yearlyModels = years.map(year => ({
        year,
        model: fitReliabilityModel(
            rows.filter(row => String(row.date).startsWith(year)),
            { priorStrengths }
        )
    }));
    return new Map([...model.values()].map(entry => {
        const conservativeRate = clamp(
            entry.posteriorExclusionRate - conservativeZ * Math.sqrt(Math.max(0, entry.variance))
        );
        const conservativeEdge = conservativeRate - entry.baseline;
        const reliability = Math.sqrt(entry.opportunities / (entry.opportunities + reliabilityDays));
        const yearlyEdges = yearlyModels.map(item => {
            const current = item.model.get(entry.id);
            return current ? current.posteriorExclusionRate - current.baseline : null;
        }).filter(value => value !== null);
        const positiveYears = yearlyEdges.filter(value => value > 0).length;
        const stability = yearlyEdges.length ? positiveYears / yearlyEdges.length : 0;
        const credibleStrength = clamp(Math.max(0, conservativeEdge) / 0.05);
        const regimeReliability = yearlyEdges.length >= 2
            ? 0.5 + 0.5 * stability
            : clamp(options.singleRegimeReliability ?? 0.2);
        const qualityScore = Math.round(
            100 * credibleStrength * reliability * regimeReliability
        );
        return [entry.id, {
            ...entry,
            conservativeRate,
            conservativeEdge,
            reliability,
            positiveYears,
            evaluatedYears: yearlyEdges.length,
            stability,
            qualityScore
        }];
    }));
}

function scoreNumbers(row, qualityMap, config = {}) {
    const byNumberFamily = ALL_NUMBERS.map(() => new Map());
    const deduplicated = new Map();
    for (const rawCandidate of row.candidateDiagnostics || []) {
        const candidate = normalizeCandidate(rawCandidate);
        if (!candidate) continue;
        const entry = descriptorIds(candidate).reverse()
            .map(descriptor => qualityMap.get(descriptor.id))
            .find(current => current
                && current.qualityScore >= Number(config.minQualityScore || 0)
                && current.opportunities >= Number(config.minOpportunities || 1));
        if (!entry) continue;
        const signature = `${candidate.state}|${candidate.family}|${candidate.numbers.join(',')}|${lengthBucket(candidate)}`;
        const score = entry.qualityScore / 100;
        const existing = deduplicated.get(signature);
        if (!existing || score > existing.score) {
            deduplicated.set(signature, { candidate, entry, score });
        }
    }
    for (const evidence of deduplicated.values()) {
        for (const number of evidence.candidate.numbers) {
            const existing = byNumberFamily[number].get(evidence.candidate.family);
            if (!existing || evidence.score > existing.score) {
                byNumberFamily[number].set(evidence.candidate.family, evidence);
            }
        }
    }
    const weights = config.familyWeights || [1, 0.55, 0.3, 0.16];
    return ALL_NUMBERS.map(number => {
        const evidence = [...byNumberFamily[number].values()]
            .sort((left, right) => right.score - left.score)
            .slice(0, Math.max(1, Number(config.topFamilies || 1)));
        return {
            number,
            riskScore: evidence.reduce(
                (sum, item, index) => sum + item.score * (weights[index] || 0.1),
                0
            ),
            supportFamilies: evidence.length,
            evidence: evidence.slice(0, 3).map(item => ({
                key: item.candidate.key,
                family: item.candidate.family,
                state: item.candidate.state,
                qualityScore: item.entry.qualityScore,
                opportunities: item.entry.opportunities,
                conservativeEdge: item.entry.conservativeEdge
            }))
        };
    });
}

function refinePrediction(row, qualityMap, config = {}) {
    const baseline = new Set((row.strategies?.chainSmallFirst || []).map(Number));
    const scores = scoreNumbers(row, qualityMap, config);
    const riskyBets = scores.filter(item => baseline.has(item.number))
        .sort((left, right) => right.riskScore - left.riskScore || left.number - right.number);
    const saferExcluded = scores.filter(item => !baseline.has(item.number))
        .sort((left, right) => left.riskScore - right.riskScore || left.number - right.number);
    const result = new Set(baseline);
    const swaps = [];
    for (let index = 0; index < Math.min(riskyBets.length, saferExcluded.length); index++) {
        if (swaps.length >= Number(config.swapLimit || 0)) break;
        const risky = riskyBets[index];
        const safe = saferExcluded[index];
        const margin = risky.riskScore - safe.riskScore;
        if (risky.riskScore < Number(config.minRiskScore || 0)) break;
        if (margin < Number(config.minMargin || 0)) break;
        result.delete(risky.number);
        result.add(safe.number);
        swaps.push({
            out: risky.number,
            in: safe.number,
            riskyScore: risky.riskScore,
            safeScore: safe.riskScore,
            margin,
            evidence: risky.evidence
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
    buildQualityMap,
    refinePrediction,
    scoreNumbers
};
