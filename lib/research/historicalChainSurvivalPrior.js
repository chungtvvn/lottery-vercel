const fs = require('fs');
const path = require('path');
const { isInvalidStatsKey } = require('../utils/statsOptionsManifest');

const DEFAULT_STATS_FILES = [
    'number_stats.json',
    'head_tail_stats.json',
    'sum_difference_stats.json'
];

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function dateOrdinal(value) {
    const [day, month, year] = String(value || '').split('/').map(Number);
    if (!day || !month || !year) return null;
    return year * 10000 + month * 100 + day;
}

function evidenceFamily(key = '') {
    const normalized = String(key).toLowerCase();
    if (/block\d+x\d+sole/.test(normalized)) return 'block';
    if (/^(bo_|bo:)/.test(normalized)) return 'fixed-set';
    if (/^dau_.*dit_|^dit_.*dau_/.test(normalized)) return 'head-tail';
    if (/^(dau_|dau:)/.test(normalized)) return 'head';
    if (/^(dit_|dit:)/.test(normalized)) return 'tail';
    if (/^(tong_moi|tong_tt|tong_|tong:)/.test(normalized)) return 'sum';
    if (/^(hieu_|hieu:)/.test(normalized)) return 'difference';
    if (/^(so_|so:|dong_)/.test(normalized)) return 'number';
    if (/(chan|le|to|nho|nguyen_to|hop_so)/.test(normalized)) return 'class';
    return normalized.split(/[:_]/)[0] || 'other';
}

function evidencePattern(key = '') {
    const normalized = String(key).toLowerCase();
    if (/block\d+x\d+sole/.test(normalized)) return 'blockAlternation';
    if (normalized.includes('vesoletheothutului')) return 'orderedAlternationDown';
    if (normalized.includes('vesoletheothututien')) return 'orderedAlternationUp';
    if (normalized.includes('vesoletheothutu')) return 'orderedAlternation';
    if (normalized.includes('soletheocap')) return 'pairAlternation';
    if (normalized.includes('tienluisole')) return 'upDownAlternation';
    if (normalized.includes('luitiensole')) return 'downUpAlternation';
    if (normalized.includes('tiendeulientiep')) return 'uniformUp';
    if (normalized.includes('luideulientiep')) return 'uniformDown';
    if (normalized.includes('tien')) return 'up';
    if (normalized.includes('lui')) return 'down';
    if (normalized.includes('sole')) return 'alternation';
    if (normalized.includes('lientiep')) return 'consecutive';
    return 'other';
}

function patternStep(key = '') {
    const normalized = String(key).toLowerCase();
    const alternatingGap = (normalized.includes('vesole') || normalized.includes('solemoi'))
        && !normalized.includes('tienluisole')
        && !normalized.includes('luitiensole')
        && !normalized.includes('soletheocap')
        && !/block\d+x\d+sole/.test(normalized);
    return alternatingGap ? 2 : 1;
}

function flattenStats(stats) {
    const rows = [];
    const add = (key, value) => {
        if (isInvalidStatsKey(key) || !value || !Array.isArray(value.streaks)) return;
        rows.push({ key, streaks: value.streaks });
    };
    for (const [key, value] of Object.entries(stats || {})) {
        if (value && Array.isArray(value.streaks)) add(key, value);
        else if (value && typeof value === 'object') {
            for (const [subKey, subValue] of Object.entries(value)) {
                add(`${key}:${subKey}`, subValue);
            }
        }
    }
    return rows;
}

function createAccumulator() {
    return {
        patternsSeen: 0,
        patternsUsed: 0,
        episodesUsed: 0,
        transitionsUsed: 0,
        blockPatternsExcluded: 0,
        groups: new Map(),
        families: new Map()
    };
}

function addCappedTransition(target, trials, continues, capPerPattern) {
    const effectiveTrials = Math.min(trials, capPerPattern);
    const continuationRate = trials > 0 ? continues / trials : 0;
    const effectiveContinues = effectiveTrials * continuationRate;
    target.patterns += 1;
    target.rawTrials += trials;
    target.rawContinues += continues;
    target.effectiveTrials += effectiveTrials;
    target.effectiveContinues += effectiveContinues;
}

function addStatsToAccumulator(stats, accumulator, options = {}) {
    const startOrdinal = dateOrdinal(options.startDate || '01/01/2006');
    const cutoffOrdinal = dateOrdinal(options.cutoffDate || '31/12/2023');
    const capPerPattern = Math.max(1, Number(options.capPerPattern || 40));
    for (const { key, streaks } of flattenStats(stats)) {
        accumulator.patternsSeen++;
        if (/block\d+x\d+sole/i.test(key)) {
            accumulator.blockPatternsExcluded++;
            continue;
        }
        const exact = new Map();
        for (const streak of streaks) {
            const ordinal = dateOrdinal(streak.endDate);
            const length = Number(streak.length) || 0;
            if (!ordinal || ordinal < startOrdinal || ordinal > cutoffOrdinal || length <= 0) continue;
            exact.set(length, (exact.get(length) || 0) + 1);
            accumulator.episodesUsed++;
        }
        if (exact.size < 2) continue;
        const lengths = [...exact.keys()].sort((left, right) => left - right);
        const minLength = lengths[0];
        const recordLength = lengths.at(-1);
        const cumulative = new Map();
        let running = 0;
        for (let length = recordLength; length >= 1; length--) {
            running += exact.get(length) || 0;
            cumulative.set(length, running);
        }
        const step = patternStep(key);
        let trials = 0;
        let continues = 0;
        for (let length = minLength; length < recordLength; length += step) {
            const current = cumulative.get(length) || 0;
            if (!current) continue;
            trials += current;
            continues += Math.min(current, cumulative.get(length + step) || 0);
            accumulator.transitionsUsed++;
        }
        if (!trials) continue;
        accumulator.patternsUsed++;
        const family = evidenceFamily(key);
        const pattern = evidencePattern(key);
        const groupId = `${family}|${pattern}`;
        if (!accumulator.groups.has(groupId)) {
            accumulator.groups.set(groupId, {
                id: groupId,
                family,
                pattern,
                patterns: 0,
                rawTrials: 0,
                rawContinues: 0,
                effectiveTrials: 0,
                effectiveContinues: 0
            });
        }
        if (!accumulator.families.has(family)) {
            accumulator.families.set(family, {
                id: family,
                patterns: 0,
                rawTrials: 0,
                rawContinues: 0,
                effectiveTrials: 0,
                effectiveContinues: 0
            });
        }
        addCappedTransition(accumulator.groups.get(groupId), trials, continues, capPerPattern);
        addCappedTransition(accumulator.families.get(family), trials, continues, capPerPattern);
    }
    return accumulator;
}

function seededRandom(seed = 20260716) {
    let state = Number(seed) >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function sampleNormal(random) {
    const first = Math.max(Number.EPSILON, random());
    const second = Math.max(Number.EPSILON, random());
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function sampleGamma(shape, random) {
    if (shape < 1) {
        return sampleGamma(shape + 1, random) * Math.pow(Math.max(Number.EPSILON, random()), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
        const normal = sampleNormal(random);
        const value = 1 + c * normal;
        if (value <= 0) continue;
        const cube = value ** 3;
        const uniform = random();
        if (uniform < 1 - 0.0331 * normal ** 4) return d * cube;
        if (Math.log(uniform) < 0.5 * normal ** 2 + d * (1 - cube + Math.log(cube))) return d * cube;
    }
}

function sampleBeta(alpha, beta, random) {
    const left = sampleGamma(alpha, random);
    const right = sampleGamma(beta, random);
    return left / Math.max(Number.EPSILON, left + right);
}

function quantile(sorted, probability) {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * clamp(probability);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function simulatePosterior(alpha, beta, options = {}) {
    const draws = Math.max(1000, Number(options.draws || 20000));
    const futureOpportunities = Math.max(1, Number(options.futureOpportunities || 100));
    const random = seededRandom(options.seed || 20260716);
    const parameter = [];
    const predictive = [];
    for (let index = 0; index < draws; index++) {
        const breakProbability = sampleBeta(alpha, beta, random);
        parameter.push(breakProbability);
        let breaks = 0;
        for (let trial = 0; trial < futureOpportunities; trial++) {
            breaks += Number(random() < breakProbability);
        }
        predictive.push(breaks / futureOpportunities);
    }
    parameter.sort((left, right) => left - right);
    predictive.sort((left, right) => left - right);
    return {
        draws,
        futureOpportunities,
        q05: quantile(parameter, 0.05),
        q10: quantile(parameter, 0.1),
        q50: quantile(parameter, 0.5),
        q90: quantile(parameter, 0.9),
        q95: quantile(parameter, 0.95),
        predictiveQ05: quantile(predictive, 0.05),
        predictiveQ50: quantile(predictive, 0.5),
        predictiveQ95: quantile(predictive, 0.95)
    };
}

function posteriorRow(row, parentMean, priorStrength, simulationOptions) {
    const effectiveBreaks = row.effectiveTrials - row.effectiveContinues;
    const alpha = effectiveBreaks + priorStrength * parentMean;
    const beta = row.effectiveContinues + priorStrength * (1 - parentMean);
    return {
        ...row,
        rawBreakRate: row.rawTrials > 0 ? 1 - row.rawContinues / row.rawTrials : null,
        alpha,
        beta,
        posteriorBreakMean: alpha / (alpha + beta),
        simulation: simulatePosterior(alpha, beta, simulationOptions)
    };
}

function finalizeSurvivalPriors(accumulator, options = {}) {
    const familyPriorStrength = Math.max(1, Number(options.familyPriorStrength || 80));
    const patternPriorStrength = Math.max(1, Number(options.patternPriorStrength || 45));
    let globalTrials = 0;
    let globalBreaks = 0;
    for (const row of accumulator.families.values()) {
        globalTrials += row.effectiveTrials;
        globalBreaks += row.effectiveTrials - row.effectiveContinues;
    }
    const globalBreakMean = (globalBreaks + 1) / Math.max(2, globalTrials + 2);
    const families = new Map();
    for (const [family, row] of accumulator.families.entries()) {
        families.set(family, posteriorRow(
            row,
            globalBreakMean,
            familyPriorStrength,
            { ...options, seed: Number(options.seed || 20260716) + families.size * 17 }
        ));
    }
    const groups = new Map();
    for (const [id, row] of accumulator.groups.entries()) {
        const family = families.get(row.family);
        const current = posteriorRow(
            row,
            family?.posteriorBreakMean ?? globalBreakMean,
            patternPriorStrength,
            { ...options, seed: Number(options.seed || 20260716) + groups.size * 97 }
        );
        const familyMean = family?.posteriorBreakMean ?? globalBreakMean;
        const delta = current.posteriorBreakMean - familyMean;
        const directionConfidence = delta >= 0
            ? clamp((current.simulation.q10 - familyMean) / Math.max(0.01, 1 - familyMean))
            : clamp((familyMean - current.simulation.q90) / Math.max(0.01, familyMean));
        current.familyBreakMean = familyMean;
        current.breakLift = delta;
        current.standardizedBreakLift = Math.tanh(delta / 0.08) * (0.35 + 0.65 * directionConfidence);
        groups.set(id, current);
    }
    return {
        metadata: {
            startDate: options.startDate || '01/01/2006',
            cutoffDate: options.cutoffDate || '31/12/2023',
            capPerPattern: Math.max(1, Number(options.capPerPattern || 40)),
            globalBreakMean,
            patternsSeen: accumulator.patternsSeen,
            patternsUsed: accumulator.patternsUsed,
            episodesUsed: accumulator.episodesUsed,
            transitionsUsed: accumulator.transitionsUsed,
            blockPatternsExcluded: accumulator.blockPatternsExcluded,
            groups: groups.size,
            families: families.size,
            simulationDraws: Math.max(1000, Number(options.draws || 20000)),
            futureOpportunities: Math.max(1, Number(options.futureOpportunities || 100))
        },
        families,
        groups
    };
}

function buildHistoricalSurvivalPriors(options = {}) {
    const statsDir = options.statsDir || path.join(process.cwd(), 'lib', 'data', 'statistics');
    const accumulator = createAccumulator();
    for (const filename of options.statsFiles || DEFAULT_STATS_FILES) {
        const payload = JSON.parse(fs.readFileSync(path.join(statsDir, filename), 'utf8'));
        addStatsToAccumulator(payload, accumulator, options);
    }
    return finalizeSurvivalPriors(accumulator, options);
}

module.exports = {
    addStatsToAccumulator,
    buildHistoricalSurvivalPriors,
    createAccumulator,
    dateOrdinal,
    evidenceFamily,
    evidencePattern,
    finalizeSurvivalPriors,
    flattenStats,
    patternStep,
    sampleBeta,
    seededRandom,
    simulatePosterior
};
