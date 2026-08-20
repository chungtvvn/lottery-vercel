#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const BASE_RATE = 0.01;
const BET_COUNT = 30;
const TARGET_EXCLUDED = 70;
const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;
const DEFAULT_SAMPLE_COUNT = 10000;

const TOKEN_MODES = ['coarse', 'width', 'strength', 'full'];
const PRIOR_STRENGTHS = [100, 300, 600];
const POSTERIOR_METRICS = ['mean', 'q80', 'q90', 'confidenceMean'];
const AGGREGATIONS = ['top1', 'familyTop3'];
const SELECTORS = [
    { mode: 'standalone', swapLimit: 0 },
    { mode: 'refine', swapLimit: 2 },
    { mode: 'refine', swapLimit: 4 },
    { mode: 'refine', swapLimit: 8 }
];

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    const splitFiles = key => String(args.get(key) || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    return {
        train2024: splitFiles('train2024'),
        train2025: splitFiles('train2025'),
        test2026: splitFiles('test2026'),
        sampleCount: Math.max(1000, Number(args.get('samples') || DEFAULT_SAMPLE_COUNT)),
        seed: Number(args.get('seed') || 20260716)
    };
}

function loadRows(files) {
    const byDate = new Map();
    for (const filename of files) {
        const report = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
        for (const row of report.rows || []) {
            if (!Array.isArray(row.numberEvidence) || row.numberEvidence.length !== 100) {
                throw new Error(`Báo cáo ${filename} thiếu numberEvidence đủ 100 số ngày ${row.date}.`);
            }
            if (!row.numberEvidence.some(evidence => evidence.groupDetails)) {
                throw new Error(`Báo cáo ${filename} chưa có groupDetails ngày ${row.date}.`);
            }
            byDate.set(row.date, row);
        }
    }
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function widthBucket(value) {
    const width = Math.max(1, Number(value) || 100);
    if (width <= 2) return 'w02';
    if (width <= 5) return 'w05';
    if (width <= 10) return 'w10';
    if (width <= 20) return 'w20';
    if (width <= 40) return 'w40';
    return 'w99';
}

function strengthBucket(value) {
    return `s${Math.min(4, Math.floor(clamp(Number(value) || 0, 0, 0.999999) * 5))}`;
}

function evidenceState(detail = {}) {
    const active = Math.max(0, Number(detail.activeSets || 0));
    const potential = Math.max(0, Number(detail.potentialSets || 0));
    if (active > 0 && potential > 0) return 'mixed';
    if (active > 0) return 'active';
    return 'potential';
}

function tokenFor(group, detail, mode) {
    const parts = [group, evidenceState(detail)];
    if (mode === 'width' || mode === 'full') parts.push(widthBucket(detail.minSetSize));
    if (mode === 'strength' || mode === 'full') {
        parts.push(strengthBucket(detail.combinedStrength || detail.maxStrength));
    }
    return parts.join('|');
}

function hashString(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function standardNormal(random) {
    const first = Math.max(Number.EPSILON, random());
    const second = random();
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function sampleGamma(shape, random) {
    if (!(shape > 0)) throw new Error(`Gamma shape không hợp lệ: ${shape}`);
    if (shape < 1) {
        return sampleGamma(shape + 1, random) * Math.pow(Math.max(Number.EPSILON, random()), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
        const normal = standardNormal(random);
        const base = 1 + c * normal;
        if (base <= 0) continue;
        const value = base * base * base;
        const uniform = random();
        if (uniform < 1 - 0.0331 * normal ** 4) return d * value;
        if (Math.log(uniform) < 0.5 * normal * normal + d * (1 - value + Math.log(value))) {
            return d * value;
        }
    }
}

function sampleBeta(alpha, beta, random) {
    const left = sampleGamma(alpha, random);
    const right = sampleGamma(beta, random);
    return left / (left + right);
}

function quantile(sorted, probability) {
    if (!sorted.length) return NaN;
    const index = clamp(probability, 0, 1) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function buildTokenStats(rows, tokenMode) {
    const stats = new Map();
    for (const row of rows) {
        for (const evidence of row.numberEvidence) {
            const hit = Number(evidence.number) === Number(row.actual);
            for (const [group, detail] of Object.entries(evidence.groupDetails || {})) {
                const token = tokenFor(group, detail, tokenMode);
                const current = stats.get(token) || {
                    token,
                    group,
                    family: group.split('|')[0] || 'other',
                    exposures: 0,
                    hits: 0
                };
                current.exposures++;
                current.hits += Number(hit);
                stats.set(token, current);
            }
        }
    }
    return stats;
}

function posteriorSummary(stats, priorStrength, sampleCount, seed) {
    const alpha = stats.hits + BASE_RATE * priorStrength;
    const beta = stats.exposures - stats.hits + (1 - BASE_RATE) * priorStrength;
    const random = mulberry32((seed ^ hashString(`${stats.token}|${priorStrength}`)) >>> 0);
    const samples = Array.from({ length: sampleCount }, () => sampleBeta(alpha, beta, random))
        .sort((left, right) => left - right);
    const mean = alpha / (alpha + beta);
    const probabilityBelowBase = samples.filter(value => value < BASE_RATE).length / sampleCount;
    return {
        ...stats,
        priorStrength,
        alpha,
        beta,
        mean,
        q80: quantile(samples, 0.8),
        q90: quantile(samples, 0.9),
        q95: quantile(samples, 0.95),
        probabilityBelowBase
    };
}

function safeLogRatio(numerator, denominator) {
    return Math.log(clamp(numerator, 1e-8, 1) / clamp(denominator, 1e-8, 1));
}

function posteriorScore(summary, metric) {
    if (!summary) return 0;
    if (metric === 'q80') return safeLogRatio(BASE_RATE, summary.q80);
    if (metric === 'q90') return safeLogRatio(BASE_RATE, summary.q90);
    if (metric === 'confidenceMean') {
        return safeLogRatio(BASE_RATE, summary.mean) * Math.abs(2 * summary.probabilityBelowBase - 1);
    }
    return safeLogRatio(BASE_RATE, summary.mean);
}

function detailSignature(detail = {}) {
    return [
        evidenceState(detail),
        Number(detail.activeSets || 0),
        Number(detail.potentialSets || 0),
        Number(detail.tier1Sets || 0),
        Number(detail.independentSets || 0),
        Number(detail.minSetSize || 0),
        Number(detail.meanSetSize || 0).toFixed(3),
        Number(detail.combinedStrength || detail.maxStrength || 0).toFixed(5)
    ].join('|');
}

function scoreEvidence(evidence, posterior, config) {
    const strongestByFamily = new Map();
    const seenAliases = new Set();
    for (const [group, detail] of Object.entries(evidence.groupDetails || {})) {
        const family = group.split('|')[0] || 'other';
        const signature = `${family}|${detailSignature(detail)}`;
        if (seenAliases.has(signature)) continue;
        seenAliases.add(signature);
        const token = tokenFor(group, detail, config.tokenMode);
        const tokenPosterior = posterior.get(token);
        if (!tokenPosterior) continue;
        const evidenceStrength = clamp(Number(detail.combinedStrength || detail.maxStrength || 0), 0, 1);
        const setReliability = Math.sqrt(
            Math.max(1, Number(detail.independentSets || 1)) /
            (Math.max(1, Number(detail.independentSets || 1)) + 4)
        );
        const value = posteriorScore(tokenPosterior, config.posteriorMetric)
            * (0.5 + 0.5 * evidenceStrength)
            * setReliability;
        const existing = strongestByFamily.get(family);
        if (existing === undefined || Math.abs(value) > Math.abs(existing)) {
            strongestByFamily.set(family, value);
        }
    }
    const values = [...strongestByFamily.values()]
        .sort((left, right) => Math.abs(right) - Math.abs(left));
    if (!values.length) return 0;
    if (config.aggregation === 'top1') return values[0];
    const weights = [1, 0.65, 0.4];
    const selected = values.slice(0, weights.length);
    const totalWeight = selected.reduce((sum, _, index) => sum + weights[index], 0);
    return selected.reduce((sum, value, index) => sum + value * weights[index], 0) / totalWeight;
}

function scoreRow(row, posterior, config) {
    return row.numberEvidence.map(evidence => ({
        number: Number(evidence.number),
        score: scoreEvidence(evidence, posterior, config)
    }));
}

function selectBetNumbers(row, posterior, config) {
    const scores = scoreRow(row, posterior, config);
    if (config.selectorMode === 'standalone') {
        const excluded = new Set(scores
            .sort((left, right) => right.score - left.score || left.number - right.number)
            .slice(0, TARGET_EXCLUDED)
            .map(item => item.number));
        return {
            betNumbers: ALL_NUMBERS.filter(number => !excluded.has(number)),
            swaps: 0
        };
    }

    const baseline = new Set((row.strategies?.chainSmallFirst || []).map(Number));
    if (baseline.size !== BET_COUNT) {
        throw new Error(`Baseline chainSmallFirst ngày ${row.date} có ${baseline.size} số, cần ${BET_COUNT}.`);
    }
    const inside = scores
        .filter(item => baseline.has(item.number))
        .sort((left, right) => right.score - left.score || left.number - right.number);
    const outside = scores
        .filter(item => !baseline.has(item.number))
        .sort((left, right) => left.score - right.score || left.number - right.number);
    const refined = new Set(baseline);
    let swaps = 0;
    for (let index = 0; index < Math.min(config.swapLimit, inside.length, outside.length); index++) {
        if (inside[index].score <= outside[index].score) break;
        refined.delete(inside[index].number);
        refined.add(outside[index].number);
        swaps++;
    }
    return {
        betNumbers: [...refined].sort((left, right) => left - right),
        swaps
    };
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        losses: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        currentType: null,
        currentLength: 0,
        totalSwaps: 0,
        rows: []
    };
}

function addResult(summary, row, betNumbers, swaps = 0) {
    const hit = betNumbers.includes(Number(row.actual));
    const stakeK = betNumbers.length * BET_PER_NUMBER_K;
    const payoutK = hit ? BET_PER_NUMBER_K * WIN_MULTIPLIER : 0;
    const type = hit ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(hit);
    summary.losses += Number(!hit);
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += payoutK - stakeK;
    summary.totalSwaps += swaps;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    if (hit) summary.longestWin = Math.max(summary.longestWin, summary.currentLength);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.currentLength);
    summary.rows.push({
        date: row.date,
        actual: Number(row.actual),
        betNumbers,
        hit,
        swaps,
        profitK: payoutK - stakeK
    });
}

function finalizeSummary(summary) {
    const { currentType, currentLength, ...result } = summary;
    return {
        ...result,
        betCount: BET_COUNT,
        targetExcluded: TARGET_EXCLUDED,
        avgSwaps: result.days ? result.totalSwaps / result.days : 0,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0
    };
}

function evaluateBaseline(rows, method = 'chainSmallFirst') {
    const summary = createSummary(method);
    for (const row of rows) addResult(summary, row, (row.strategies?.[method] || []).map(Number));
    return finalizeSummary(summary);
}

function buildPosterior(rows, config, sampleCount, seed) {
    const stats = buildTokenStats(rows, config.tokenMode);
    return new Map([...stats.entries()].map(([token, tokenStats]) => [
        token,
        posteriorSummary(tokenStats, config.priorStrength, sampleCount, seed)
    ]));
}

function evaluateCandidate(trainingRows, evaluationRows, config, sampleCount, seed) {
    const posterior = buildPosterior(trainingRows, config, sampleCount, seed);
    const summary = createSummary(config.id);
    for (const row of evaluationRows) {
        const prediction = selectBetNumbers(row, posterior, config);
        addResult(summary, row, prediction.betNumbers, prediction.swaps);
    }
    return { posterior, summary: finalizeSummary(summary) };
}

function compactSummary(summary) {
    const { rows, ...result } = summary;
    return result;
}

function delta(candidate, baseline) {
    return {
        wins: candidate.wins - baseline.wins,
        hitRate: candidate.hitRate - baseline.hitRate,
        profitK: candidate.profitK - baseline.profitK,
        roi: candidate.roi - baseline.roi,
        longestLoss: candidate.longestLoss - baseline.longestLoss
    };
}

function configId(config) {
    const selector = config.selectorMode === 'standalone' ? 'standalone' : `swap${config.swapLimit}`;
    return `posteriorBootstrap_${config.tokenMode}_p${config.priorStrength}_${config.posteriorMetric}_${config.aggregation}_${selector}`;
}

function allConfigs() {
    const configs = [];
    for (const tokenMode of TOKEN_MODES) {
        for (const priorStrength of PRIOR_STRENGTHS) {
            for (const posteriorMetric of POSTERIOR_METRICS) {
                for (const aggregation of AGGREGATIONS) {
                    for (const selector of SELECTORS) {
                        const config = {
                            tokenMode,
                            priorStrength,
                            posteriorMetric,
                            aggregation,
                            selectorMode: selector.mode,
                            swapLimit: selector.swapLimit
                        };
                        config.id = configId(config);
                        configs.push(config);
                    }
                }
            }
        }
    }
    return configs;
}

function selectConfig(rows2024, rows2025, sampleCount, seed) {
    const splitIndex = Math.floor(rows2024.length * 2 / 3);
    const early2024 = rows2024.slice(0, splitIndex);
    const late2024 = rows2024.slice(splitIndex);
    const baselineLate2024 = evaluateBaseline(late2024);
    const baseline2025 = evaluateBaseline(rows2025);
    const posteriorCache = new Map();
    const posteriorFor = (trainingKey, trainingRows, config) => {
        const key = `${trainingKey}|${config.tokenMode}|${config.priorStrength}`;
        if (!posteriorCache.has(key)) {
            posteriorCache.set(key, buildPosterior(trainingRows, config, sampleCount, seed));
        }
        return posteriorCache.get(key);
    };
    const evaluateWithPosterior = (rows, posterior, config) => {
        const summary = createSummary(config.id);
        for (const row of rows) {
            const prediction = selectBetNumbers(row, posterior, config);
            addResult(summary, row, prediction.betNumbers, prediction.swaps);
        }
        return finalizeSummary(summary);
    };

    return allConfigs().map(config => {
        const fold2024 = evaluateWithPosterior(
            late2024,
            posteriorFor('early2024', early2024, config),
            config
        );
        const fold2025 = evaluateWithPosterior(
            rows2025,
            posteriorFor('all2024', rows2024, config),
            config
        );
        const delta2024 = delta(fold2024, baselineLate2024);
        const delta2025 = delta(fold2025, baseline2025);
        return {
            config,
            folds: [
                {
                    period: 'late-2024',
                    baseline: compactSummary(baselineLate2024),
                    candidate: compactSummary(fold2024),
                    delta: delta2024
                },
                {
                    period: '2025',
                    baseline: compactSummary(baseline2025),
                    candidate: compactSummary(fold2025),
                    delta: delta2025
                }
            ],
            minimumWinDelta: Math.min(delta2024.wins, delta2025.wins),
            totalWinDelta: delta2024.wins + delta2025.wins,
            minimumProfitDeltaK: Math.min(delta2024.profitK, delta2025.profitK),
            totalProfitDeltaK: delta2024.profitK + delta2025.profitK,
            maximumLossDelta: Math.max(delta2024.longestLoss, delta2025.longestLoss)
        };
    }).sort((left, right) =>
        right.minimumWinDelta - left.minimumWinDelta
        || right.minimumProfitDeltaK - left.minimumProfitDeltaK
        || right.totalWinDelta - left.totalWinDelta
        || right.totalProfitDeltaK - left.totalProfitDeltaK
        || left.maximumLossDelta - right.maximumLossDelta
        || left.config.swapLimit - right.config.swapLimit
        || left.config.id.localeCompare(right.config.id)
    );
}

function posteriorDiagnostics(posterior) {
    const rows = [...posterior.values()].map(item => ({
        token: item.token,
        family: item.family,
        exposures: item.exposures,
        hits: item.hits,
        empiricalRate: item.exposures ? item.hits / item.exposures : 0,
        posteriorMean: item.mean,
        q90: item.q90,
        probabilityBelowBase: item.probabilityBelowBase
    }));
    return {
        tokenCount: rows.length,
        strongestExclusion: rows
            .slice()
            .sort((left, right) => left.q90 - right.q90 || right.exposures - left.exposures)
            .slice(0, 20),
        strongestInclusion: rows
            .slice()
            .sort((left, right) => right.posteriorMean - left.posteriorMean || right.exposures - left.exposures)
            .slice(0, 20)
    };
}

function percent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function markdownSummary(report) {
    const selected = report.selection.selected;
    const lines = [
        '# Nghiên cứu mẫu giả hậu nghiệm theo nhóm chuỗi',
        '',
        `Sinh lúc: ${report.generatedAt}`,
        '',
        '## Phương pháp',
        '',
        `- Mỗi nhóm/trạng thái chuỗi dùng Beta-Binomial với prior nền ${percent(BASE_RATE)}.`,
        `- Sinh ${report.methodology.sampleCount.toLocaleString('vi-VN')} mẫu hậu nghiệm cho mỗi token; mẫu giả chỉ lượng hóa bất định, không được coi là quan sát thật.`,
        '- Train đầu 2024 → kiểm định cuối 2024; train 2024 → kiểm định 2025; khóa cấu hình rồi test 2026.',
        `- Giữ cố định ${BET_COUNT} số đánh / loại ${TARGET_EXCLUDED} số mỗi ngày.`,
        '',
        '## Cấu hình được chọn trước holdout',
        '',
        `- ID: \`${selected.config.id}\``,
        `- Mẫu token: ${selected.config.tokenMode}; prior: ${selected.config.priorStrength}; metric: ${selected.config.posteriorMetric}; tổng hợp: ${selected.config.aggregation}; selector: ${selected.config.selectorMode}; swap: ${selected.config.swapLimit}.`,
        '',
        '| Giai đoạn chọn | Baseline trúng | Mẫu giả trúng | Δ trúng | Baseline profit | Mẫu giả profit | Δ profit |',
        '|---|---:|---:|---:|---:|---:|---:|'
    ];
    for (const fold of selected.folds) {
        lines.push(`| ${fold.period} | ${fold.baseline.wins}/${fold.baseline.days} (${percent(fold.baseline.hitRate)}) | ${fold.candidate.wins}/${fold.candidate.days} (${percent(fold.candidate.hitRate)}) | ${fold.delta.wins} | ${fold.baseline.profitK.toLocaleString('vi-VN')}K | ${fold.candidate.profitK.toLocaleString('vi-VN')}K | ${fold.delta.profitK.toLocaleString('vi-VN')}K |`);
    }
    lines.push(
        '',
        '## Holdout 2026 chưa dùng để chọn cấu hình',
        '',
        '| Phương pháp | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất |',
        '|---|---:|---:|---:|---:|---:|',
        `| chainSmallFirst | ${report.holdout.baseline.wins}/${report.holdout.baseline.days} | ${percent(report.holdout.baseline.hitRate)} | ${report.holdout.baseline.profitK.toLocaleString('vi-VN')}K | ${percent(report.holdout.baseline.roi)} | ${report.holdout.baseline.longestLoss} |`,
        `| Mẫu giả hậu nghiệm | ${report.holdout.candidate.wins}/${report.holdout.candidate.days} | ${percent(report.holdout.candidate.hitRate)} | ${report.holdout.candidate.profitK.toLocaleString('vi-VN')}K | ${percent(report.holdout.candidate.roi)} | ${report.holdout.candidate.longestLoss} |`,
        `| Chênh lệch | ${report.holdout.delta.wins} | ${percent(report.holdout.delta.hitRate)} | ${report.holdout.delta.profitK.toLocaleString('vi-VN')}K | ${percent(report.holdout.delta.roi)} | ${report.holdout.delta.longestLoss} |`,
        '',
        '## Kết luận triển khai',
        '',
        report.promotion.recommendation,
        '',
        '> Mẫu giả không tạo thêm thông tin xổ số. Nó chỉ làm cho quyết định bảo thủ hơn khi nhóm chuỗi có ít mẫu; hiệu quả phải được xác nhận trên holdout độc lập.'
    );
    return `${lines.join('\n')}\n`;
}

function coverage(rows) {
    return {
        days: rows.length,
        firstDate: rows[0]?.date || null,
        lastDate: rows.at(-1)?.date || null
    };
}

function main() {
    const options = parseArgs();
    if (!options.train2024.length || !options.train2025.length || !options.test2026.length) {
        throw new Error('Cần --train2024=... --train2025=... --test2026=... với strict numberEvidence đầy đủ.');
    }
    const rows2024 = loadRows(options.train2024);
    const rows2025 = loadRows(options.train2025);
    const rows2026 = loadRows(options.test2026);
    const ranking = selectConfig(rows2024, rows2025, options.sampleCount, options.seed);
    const selected = ranking[0];
    const baseline = evaluateBaseline(rows2026);
    const holdoutTraining = [...rows2024, ...rows2025];
    const holdoutPosteriorCache = new Map();
    const evaluateHoldoutConfig = config => {
        const key = `${config.tokenMode}|${config.priorStrength}`;
        if (!holdoutPosteriorCache.has(key)) {
            holdoutPosteriorCache.set(
                key,
                buildPosterior(holdoutTraining, config, options.sampleCount, options.seed)
            );
        }
        const posterior = holdoutPosteriorCache.get(key);
        const summary = createSummary(config.id);
        for (const row of rows2026) {
            const prediction = selectBetNumbers(row, posterior, config);
            addResult(summary, row, prediction.betNumbers, prediction.swaps);
        }
        return { posterior, summary: finalizeSummary(summary) };
    };
    const holdout = evaluateHoldoutConfig(selected.config);
    const candidate = holdout.summary;
    const holdoutDelta = delta(candidate, baseline);
    const robustInSelection = selected.minimumWinDelta >= 0
        && selected.minimumProfitDeltaK >= 0
        && selected.totalWinDelta > 0;
    const improvesHoldout = holdoutDelta.wins > 0 && holdoutDelta.profitK > 0;
    const profitableHoldout = candidate.profitK > 0
        && candidate.hitRate > BET_COUNT / WIN_MULTIPLIER;
    const promote = robustInSelection && improvesHoldout && profitableHoldout;
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            id: 'strictPosteriorBootstrapHold70',
            sampleCount: options.sampleCount,
            seed: options.seed,
            pointInTime: 'numberEvidence từng ngày được sinh từ raw prefix đến ngày liền trước; posterior chỉ học từ năm trước.',
            model: 'Beta-Binomial posterior bootstrap theo group/pattern/state, khử alias và tương quan theo family.',
            selection: 'Đầu 2024 → cuối 2024; 2024 → 2025; khóa cấu hình; 2024+2025 → holdout 2026.',
            status: 'research-only'
        },
        economics: {
            targetExcluded: TARGET_EXCLUDED,
            betCount: BET_COUNT,
            betPerNumberK: BET_PER_NUMBER_K,
            winMultiplier: WIN_MULTIPLIER,
            breakEvenHitRate: BET_COUNT / WIN_MULTIPLIER
        },
        coverage: {
            train2024: coverage(rows2024),
            validation2025: coverage(rows2025),
            holdout2026: coverage(rows2026)
        },
        selection: {
            configCount: ranking.length,
            selected,
            top10: ranking.slice(0, 10)
        },
        holdout: {
            baseline: compactSummary(baseline),
            candidate: compactSummary(candidate),
            delta: holdoutDelta,
            preselectedTop10: ranking.slice(0, 10).map(row => {
                const result = evaluateHoldoutConfig(row.config).summary;
                return {
                    config: row.config,
                    candidate: compactSummary(result),
                    delta: delta(result, baseline)
                };
            })
        },
        posteriorDiagnostics: posteriorDiagnostics(holdout.posterior),
        promotion: {
            robustInSelection,
            improvesHoldout,
            profitableHoldout,
            promote,
            recommendation: promote
                ? 'Kết quả qua cả validation và holdout; vẫn chỉ nên shadow-test bằng snapshot bất biến trước khi cân nhắc production.'
                : 'Không đưa vào production: holdout phải vừa cải thiện dàn nền, vừa có profit dương và vượt tỷ lệ hòa vốn.'
        }
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputBase = path.resolve('reports', `strict-posterior-bootstrap-${timestamp}`);
    fs.writeFileSync(`${outputBase}.json`, JSON.stringify(report, null, 2));
    fs.writeFileSync(`${outputBase}.md`, markdownSummary(report));
    console.log(JSON.stringify({
        json: `${outputBase}.json`,
        markdown: `${outputBase}.md`,
        selected: selected.config,
        validation: selected.folds.map(fold => ({
            period: fold.period,
            baselineWins: fold.baseline.wins,
            candidateWins: fold.candidate.wins,
            deltaWins: fold.delta.wins,
            deltaProfitK: fold.delta.profitK
        })),
        holdout: {
            baseline: compactSummary(baseline),
            candidate: compactSummary(candidate),
            delta: holdoutDelta
        },
        promotion: report.promotion
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    BASE_RATE,
    evidenceState,
    tokenFor,
    mulberry32,
    sampleGamma,
    sampleBeta,
    quantile,
    posteriorSummary,
    posteriorScore,
    buildTokenStats,
    scoreEvidence,
    selectBetNumbers,
    evaluateBaseline,
    evaluateCandidate,
    allConfigs
};
