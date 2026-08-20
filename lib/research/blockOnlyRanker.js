'use strict';

const { parseBlockShape } = require('./blockAdmissionCalibrator');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function normalizeBlock(candidate = {}, options = {}) {
    if (candidate.family !== 'block') return null;
    if (options.activeOnly !== false && candidate.state !== 'active') return null;
    const shape = parseBlockShape(candidate.key);
    if (!shape) return null;
    const numbers = [...new Set((candidate.numbers || []).map(Number))]
        .filter(number => Number.isInteger(number) && number >= 0 && number <= 99)
        .sort((left, right) => left - right);
    if (!numbers.length || numbers.length >= 100) return null;
    return {
        ...candidate,
        shape,
        numbers,
        setSize: numbers.length,
        baseExclusionRate: Number.isFinite(Number(candidate.baseExclusionRate))
            ? clamp(candidate.baseExclusionRate)
            : 1 - numbers.length / 100
    };
}

function rawBlockDropoff(candidate) {
    const trials = Math.max(0, Number(candidate.currentCount || candidate.trials || 0));
    const continues = Math.min(trials, Math.max(0, Number(candidate.nextCount || candidate.successes || 0)));
    if (trials <= 0) return candidate.baseExclusionRate;
    return clamp(1 - continues / trials);
}

function shrunkBlockDropoff(candidate) {
    const trials = Math.max(0, Number(candidate.currentCount || candidate.trials || 0));
    const continues = Math.min(trials, Math.max(0, Number(candidate.nextCount || candidate.successes || 0)));
    const breaks = Math.max(0, trials - continues);
    const priorWeight = 30;
    return clamp((breaks + priorWeight * candidate.baseExclusionRate) / (trials + priorWeight));
}

function deduplicateBlocks(candidates = [], options = {}) {
    const deduplicated = new Map();
    for (const raw of candidates) {
        const candidate = normalizeBlock(raw, options);
        if (!candidate) continue;
        const signature = `${candidate.shape.id}|${candidate.numbers.join(',')}`;
        const strength = shrunkBlockDropoff(candidate);
        const existing = deduplicated.get(signature);
        if (!existing || strength > existing.strength) {
            deduplicated.set(signature, { candidate, strength });
        }
    }
    return [...deduplicated.values()].map(row => row.candidate);
}

function recordPriority(candidate) {
    if (candidate.recordState === 'super-record') return 3;
    if (candidate.recordState === 'at-record') return 2;
    if (candidate.recordState === 'near-record') return 1;
    return 0;
}

function rankSequential(candidates) {
    const ordered = deduplicateBlocks(candidates).sort((left, right) =>
        Number(left.tier || 4) - Number(right.tier || 4)
        || recordPriority(right) - recordPriority(left)
        || shrunkBlockDropoff(right) - shrunkBlockDropoff(left)
        || left.setSize - right.setSize
        || Number(left.exposureFrequencyPerYear || 0) - Number(right.exposureFrequencyPerYear || 0)
        || left.key.localeCompare(right.key)
    );
    const seen = new Set();
    const ranking = [];
    for (const candidate of ordered) {
        for (const number of candidate.numbers) {
            if (seen.has(number)) continue;
            seen.add(number);
            ranking.push({
                number,
                score: 1 - ranking.length / 100,
                support: 1,
                sources: [candidate]
            });
        }
    }
    for (const number of ALL_NUMBERS) {
        if (!seen.has(number)) ranking.push({ number, score: 0, support: 0, sources: [] });
    }
    return ranking;
}

function rankAverage(candidates) {
    const blocks = deduplicateBlocks(candidates);
    return ALL_NUMBERS.map(number => {
        const memberships = blocks.filter(candidate => candidate.numbers.includes(number));
        const scores = memberships.map(rawBlockDropoff);
        return {
            number,
            score: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : 0,
            support: scores.length,
            sources: memberships.slice().sort((left, right) =>
                rawBlockDropoff(right) - rawBlockDropoff(left)
            ).slice(0, 3)
        };
    }).sort((left, right) =>
        right.score - left.score
        || right.support - left.support
        || left.number - right.number
    );
}

function rankConsensusEdge(candidates) {
    const blocks = deduplicateBlocks(candidates);
    return ALL_NUMBERS.map(number => {
        const strongestByShape = new Map();
        for (const candidate of blocks) {
            if (!candidate.numbers.includes(number)) continue;
            const trials = Math.max(0, Number(candidate.currentCount || candidate.trials || 0));
            const reliability = Math.sqrt(trials / (trials + 30));
            const edge = Math.max(0, shrunkBlockDropoff(candidate) - candidate.baseExclusionRate)
                * reliability;
            if (edge <= 0) continue;
            const existing = strongestByShape.get(candidate.shape.id);
            if (!existing || edge > existing.edge) strongestByShape.set(candidate.shape.id, { candidate, edge });
        }
        const rows = [...strongestByShape.values()].sort((left, right) => right.edge - left.edge);
        const weights = [1, 0.55, 0.3, 0.16];
        return {
            number,
            score: rows.slice(0, weights.length)
                .reduce((sum, row, index) => sum + row.edge * weights[index], 0),
            support: rows.length,
            sources: rows.slice(0, 3).map(row => row.candidate)
        };
    }).sort((left, right) =>
        right.score - left.score
        || right.support - left.support
        || left.number - right.number
    );
}

function rankBlockOnly(candidates, method = 'blockConsensusEdge') {
    if (method === 'blockSequential') return rankSequential(candidates);
    if (method === 'blockAverageDropoff') return rankAverage(candidates);
    if (method === 'blockConsensusEdge') return rankConsensusEdge(candidates);
    throw new Error(`Unknown Block-only method: ${method}`);
}

function buildBlockOnlyPrediction(candidates, target = 70, method = 'blockConsensusEdge') {
    const ranking = rankBlockOnly(candidates, method);
    const excludedNumbers = ranking.slice(0, target).map(row => row.number).sort((a, b) => a - b);
    const excluded = new Set(excludedNumbers);
    return {
        method,
        target,
        excludedNumbers,
        betNumbers: ALL_NUMBERS.filter(number => !excluded.has(number)),
        ranking
    };
}

module.exports = {
    ALL_NUMBERS,
    buildBlockOnlyPrediction,
    deduplicateBlocks,
    normalizeBlock,
    rankBlockOnly,
    rawBlockDropoff,
    shrunkBlockDropoff
};

