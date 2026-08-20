#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    mulberry32,
    sampleBeta,
    quantile
} = require('./research-strict-posterior-bootstrap');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const BET_COUNT = 30;
const TARGET_EXCLUDED = 70;
const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        validation: String(args.get('validation') || '').split(',').filter(Boolean),
        holdout: String(args.get('holdout') || '').split(',').filter(Boolean),
        samples: Math.max(1000, Number(args.get('samples') || 3000)),
        seed: Number(args.get('seed') || 20260716)
    };
}

function loadRows(files) {
    const rows = new Map();
    for (const filename of files) {
        const report = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
        for (const row of report.rows || []) {
            const existing = rows.get(row.date) || {};
            rows.set(row.date, {
                ...existing,
                ...row,
                strategies: { ...(existing.strategies || {}), ...(row.strategies || {}) },
                strategiesByTarget: {
                    ...(existing.strategiesByTarget || {}),
                    ...(row.strategiesByTarget || {})
                },
                candidateDiagnostics: Array.isArray(row.candidateDiagnostics)
                    ? row.candidateDiagnostics
                    : existing.candidateDiagnostics
            });
        }
    }
    const result = [...rows.values()]
        .filter(row => Array.isArray(row.candidateDiagnostics))
        .filter(row => Array.isArray(row.strategies?.chainSmallFirst) && row.strategies.chainSmallFirst.length === BET_COUNT)
        .sort((left, right) => left.date.localeCompare(right.date));
    if (!result.length) throw new Error('Không có ngày nào đồng thời đủ candidateDiagnostics và chainSmallFirst.');
    return result;
}

function hashTuple(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
}

function logit(value) {
    const safe = clamp(Number(value) || 0, 1e-6, 1 - 1e-6);
    return Math.log(safe / (1 - safe));
}

function posteriorForCandidate(candidate, config, cache, samples, seed) {
    const trials = Number(candidate.trials);
    const failures = Number(candidate.failures);
    const successes = Number(candidate.successes);
    const baseline = clamp(Number(candidate.baseExclusionRate), 0.01, 0.99);
    if (candidate.state !== 'active' || !(trials > 0) || !Number.isFinite(failures) || !Number.isFinite(successes)) {
        return null;
    }
    const cacheKey = [candidate.setSize, trials, failures, config.priorWeight].join('|');
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const alpha = failures + config.priorWeight * baseline;
    const beta = successes + config.priorWeight * (1 - baseline);
    const random = mulberry32((seed ^ hashTuple(cacheKey)) >>> 0);
    const draws = Array.from({ length: samples }, () => sampleBeta(alpha, beta, random))
        .sort((left, right) => left - right);
    const mean = alpha / (alpha + beta);
    const probabilityAboveBaseline = draws.filter(value => value > baseline).length / samples;
    const summary = {
        baseline,
        mean,
        q10: quantile(draws, 0.1),
        q20: quantile(draws, 0.2),
        probabilityAboveBaseline
    };
    cache.set(cacheKey, summary);
    return summary;
}

function candidateScore(candidate, config, cache, samples, seed) {
    const posterior = posteriorForCandidate(candidate, config, cache, samples, seed);
    if (!posterior) return 0;
    let edge;
    if (config.metric === 'q10') edge = posterior.q10 - posterior.baseline;
    else if (config.metric === 'q20') edge = posterior.q20 - posterior.baseline;
    else if (config.metric === 'logQ10') edge = logit(posterior.q10) - logit(posterior.baseline);
    else edge = (posterior.mean - posterior.baseline) * posterior.probabilityAboveBaseline;
    if (!(edge > 0)) return 0;
    const reliability = Math.sqrt(Number(candidate.trials) / (Number(candidate.trials) + 20));
    const tierWeight = candidate.tier === 1 ? 1 : candidate.tier === 2 ? 0.86 : candidate.tier === 3 ? 0.68 : 0;
    const specificity = 0.82 + 0.18 / Math.sqrt(Math.max(1, Number(candidate.setSize || 100)));
    return edge * reliability * tierWeight * specificity;
}

function scoreNumbers(row, config, samples, seed, cache) {
    const byNumber = ALL_NUMBERS.map(() => new Map());
    for (const candidate of row.candidateDiagnostics || []) {
        if (!Array.isArray(candidate.numbers) || candidate.numbers.length === 0) continue;
        const score = candidateScore(candidate, config, cache, samples, seed);
        if (!(score > 0)) continue;
        const signature = `${candidate.family}|${candidate.numbers.join(',')}`;
        for (const number of candidate.numbers) {
            const existing = byNumber[number].get(signature);
            if (!existing || score > existing.score) byNumber[number].set(signature, { candidate, score });
        }
    }
    return ALL_NUMBERS.map(number => {
        const strongestByFamily = new Map();
        for (const row of byNumber[number].values()) {
            const existing = strongestByFamily.get(row.candidate.family);
            if (!existing || row.score > existing.score) strongestByFamily.set(row.candidate.family, row);
        }
        const values = [...strongestByFamily.values()].sort((left, right) => right.score - left.score);
        const weights = config.aggregation === 'top1' ? [1] : [1, 0.65, 0.4];
        const selected = values.slice(0, weights.length);
        const weight = selected.reduce((sum, _, index) => sum + weights[index], 0);
        return {
            number,
            score: weight ? selected.reduce((sum, item, index) => sum + item.score * weights[index], 0) / weight : 0,
            support: selected.length
        };
    });
}

function predict(row, config, samples, seed, cache) {
    const baseline = new Set((row.strategies?.chainSmallFirst || []).map(Number));
    const scored = scoreNumbers(row, config, samples, seed, cache);
    if (config.selector === 'standalone') {
        const excluded = new Set(scored.sort((left, right) =>
            right.score - left.score
            || Number(!baseline.has(right.number)) - Number(!baseline.has(left.number))
            || left.number - right.number
        ).slice(0, TARGET_EXCLUDED).map(item => item.number));
        return { betNumbers: ALL_NUMBERS.filter(number => !excluded.has(number)), swaps: 0 };
    }
    const inside = scored.filter(item => baseline.has(item.number))
        .sort((left, right) => right.score - left.score || left.number - right.number);
    const outside = scored.filter(item => !baseline.has(item.number))
        .sort((left, right) => left.score - right.score || left.number - right.number);
    const result = new Set(baseline);
    let swaps = 0;
    for (let index = 0; index < Math.min(config.swapLimit, inside.length, outside.length); index++) {
        if (inside[index].score <= outside[index].score) break;
        result.delete(inside[index].number);
        result.add(outside[index].number);
        swaps++;
    }
    return { betNumbers: [...result].sort((a, b) => a - b), swaps };
}

function summary(id) {
    return { id, days: 0, wins: 0, profitK: 0, stakeK: 0, longestLoss: 0, currentLoss: 0, swaps: 0 };
}

function addResult(result, row, numbers, swaps = 0) {
    const hit = numbers.includes(Number(row.actual));
    result.days++;
    result.wins += Number(hit);
    result.stakeK += numbers.length * BET_PER_NUMBER_K;
    result.profitK += (hit ? WIN_MULTIPLIER * BET_PER_NUMBER_K : 0) - numbers.length * BET_PER_NUMBER_K;
    result.currentLoss = hit ? 0 : result.currentLoss + 1;
    result.longestLoss = Math.max(result.longestLoss, result.currentLoss);
    result.swaps += swaps;
}

function finish(result) {
    const { currentLoss, ...clean } = result;
    return { ...clean, hitRate: clean.days ? clean.wins / clean.days : 0, roi: clean.stakeK ? clean.profitK / clean.stakeK : 0, avgSwaps: clean.days ? clean.swaps / clean.days : 0 };
}

function evaluate(rows, config, samples, seed, sharedCache = new Map()) {
    const result = summary(config.id);
    for (const row of rows) {
        const prediction = predict(row, config, samples, seed, sharedCache);
        addResult(result, row, prediction.betNumbers, prediction.swaps);
    }
    return finish(result);
}

function baseline(rows) {
    const result = summary('chainSmallFirst');
    for (const row of rows) addResult(result, row, (row.strategies?.chainSmallFirst || []).map(Number));
    return finish(result);
}

function configs() {
    const rows = [];
    for (const priorWeight of [12, 24, 50, 100]) for (const metric of ['q10', 'q20', 'confidence']) {
        for (const aggregation of ['top1', 'top3']) for (const selectorRow of [
            { selector: 'refine', swapLimit: 2 },
            { selector: 'refine', swapLimit: 4 },
            { selector: 'refine', swapLimit: 8 },
            { selector: 'standalone', swapLimit: 0 }
        ]) {
            const config = { priorWeight, metric, aggregation, ...selectorRow };
            config.id = `candidateBootstrap_p${priorWeight}_${metric}_${aggregation}_${selectorRow.selector}${selectorRow.swapLimit || ''}`;
            rows.push(config);
        }
    }
    return rows;
}

function delta(candidate, base) {
    return { wins: candidate.wins - base.wins, profitK: candidate.profitK - base.profitK, longestLoss: candidate.longestLoss - base.longestLoss };
}

function main() {
    const options = parseArgs();
    if (!options.validation.length || !options.holdout.length) throw new Error('Cần --validation=... --holdout=...');
    const validationRows = loadRows(options.validation);
    const holdoutRows = loadRows(options.holdout);
    const validationBaseline = baseline(validationRows);
    const validationPosteriorCache = new Map();
    const ranked = configs().map(config => {
        const result = evaluate(
            validationRows,
            config,
            options.samples,
            options.seed,
            validationPosteriorCache
        );
        return { config, result, delta: delta(result, validationBaseline) };
    }).sort((left, right) =>
        right.delta.wins - left.delta.wins
        || right.delta.profitK - left.delta.profitK
        || left.delta.longestLoss - right.delta.longestLoss
        || left.config.id.localeCompare(right.config.id)
    );
    const selected = ranked[0];
    const holdoutBaseline = baseline(holdoutRows);
    const holdoutCandidate = evaluate(
        holdoutRows,
        selected.config,
        Math.max(10000, options.samples),
        options.seed,
        new Map()
    );
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            id: 'strictCandidatePosteriorBootstrap',
            description: 'Beta posterior cho xác suất gãy của từng chuỗi active; mẫu giả đo cận dưới xác suất, không tạo quan sát mới.',
            pointInTime: 'Mỗi candidate dùng baseline 20 năm chốt trước năm dự đoán và trạng thái ngày liền trước.',
            selection: 'Chọn cấu hình trên mẫu ngày 2024-2025; khóa trước holdout 2026.',
            promotionStatus: 'research-only'
        },
        coverage: {
            validation: { days: validationRows.length, first: validationRows[0]?.date, last: validationRows.at(-1)?.date },
            holdout: { days: holdoutRows.length, first: holdoutRows[0]?.date, last: holdoutRows.at(-1)?.date }
        },
        selected,
        top10Validation: ranked.slice(0, 10),
        holdout: { baseline: holdoutBaseline, candidate: holdoutCandidate, delta: delta(holdoutCandidate, holdoutBaseline) }
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const output = path.resolve('reports', `strict-candidate-bootstrap-${stamp}.json`);
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report }, null, 2));
}

main();
