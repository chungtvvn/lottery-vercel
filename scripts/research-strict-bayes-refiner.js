#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    hashCanonical,
    hashSourceFiles
} = require('../lib/utils/backtestFingerprint');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const BASELINE_ID = 'chainSmallFirstHold70';
const METHOD_ID = 'strictBayesRefinerHold70';
const BET_COUNT = 30;
const TARGET_EXCLUDED = 70;
const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;
const BASE_RATE = 0.01;

const CONFIGS = [
    { tokenMode: 'coarse', priorStrength: 600, swapLimit: 0, margin: 0 },
    { tokenMode: 'coarse', priorStrength: 300, swapLimit: 2, margin: 0 },
    { tokenMode: 'coarse', priorStrength: 600, swapLimit: 4, margin: 0 },
    { tokenMode: 'width', priorStrength: 300, swapLimit: 2, margin: 0.02 },
    { tokenMode: 'width', priorStrength: 600, swapLimit: 4, margin: 0.02 },
    { tokenMode: 'strength', priorStrength: 300, swapLimit: 2, margin: 0.02 },
    { tokenMode: 'strength', priorStrength: 600, swapLimit: 4, margin: 0.02 },
    { tokenMode: 'count', priorStrength: 300, swapLimit: 2, margin: 0.02 },
    { tokenMode: 'count', priorStrength: 600, swapLimit: 4, margin: 0.02 },
    { tokenMode: 'full', priorStrength: 600, swapLimit: 2, margin: 0.05 },
    { tokenMode: 'full', priorStrength: 1000, swapLimit: 4, margin: 0.05 }
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
        test2026: splitFiles('test2026')
    };
}

function loadRows(files) {
    const byDate = new Map();
    for (const filename of files) {
        const report = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
        for (const row of report.rows || []) {
            if (!Array.isArray(row.numberEvidence) || row.numberEvidence.length !== 100) {
                throw new Error(`Báo cáo ${filename} thiếu numberEvidence ngày ${row.date}.`);
            }
            if (!row.numberEvidence.some(evidence => evidence.groupDetails)) {
                throw new Error(`Báo cáo ${filename} chưa có groupDetails nâng cao.`);
            }
            byDate.set(row.date, row);
        }
    }
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function logit(value) {
    const probability = clamp(Number(value) || 0, 1e-6, 1 - 1e-6);
    return Math.log(probability / (1 - probability));
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

function countBucket(value) {
    const count = Math.max(1, Number(value) || 1);
    if (count <= 1) return 'c01';
    if (count <= 2) return 'c02';
    if (count <= 4) return 'c04';
    if (count <= 8) return 'c08';
    if (count <= 16) return 'c16';
    return 'c99';
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
    if (mode === 'count' || mode === 'full') {
        parts.push(countBucket(detail.independentSets));
    }
    return parts.join('|');
}

function buildTokenStats(rows, config) {
    const stats = new Map();
    for (const row of rows) {
        for (const evidence of row.numberEvidence) {
            const hit = Number(evidence.number) === Number(row.actual);
            for (const [group, detail] of Object.entries(evidence.groupDetails || {})) {
                const token = tokenFor(group, detail, config.tokenMode);
                const current = stats.get(token) || { exposures: 0, hits: 0 };
                current.exposures++;
                current.hits += Number(hit);
                stats.set(token, current);
            }
        }
    }
    return stats;
}

function tokenContribution(row, priorStrength) {
    if (!row || row.exposures <= 0) return 0;
    const probability = (
        row.hits + BASE_RATE * priorStrength
    ) / (row.exposures + priorStrength);
    const confidence = row.exposures / (row.exposures + priorStrength);
    return (logit(probability) - logit(BASE_RATE)) * confidence;
}

function scoreEvidence(evidence, tokenStats, config) {
    const strongestByFamily = new Map();
    for (const [group, detail] of Object.entries(evidence.groupDetails || {})) {
        const [family = 'other'] = group.split('|');
        const token = tokenFor(group, detail, config.tokenMode);
        const contribution = tokenContribution(tokenStats.get(token), config.priorStrength);
        const reliability = clamp(
            Number(detail.independentSets || 1) / 4,
            0.25,
            1
        );
        const adjusted = contribution * reliability;
        const existing = strongestByFamily.get(family);
        if (existing === undefined || Math.abs(adjusted) > Math.abs(existing)) {
            strongestByFamily.set(family, adjusted);
        }
    }
    const weights = [1, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12];
    const rows = [...strongestByFamily.values()]
        .sort((left, right) => Math.abs(right) - Math.abs(left))
        .slice(0, weights.length);
    const weightTotal = rows.reduce((sum, _, index) => sum + weights[index], 0);
    return weightTotal
        ? rows.reduce((sum, value, index) => sum + value * weights[index], 0) / weightTotal
        : 0;
}

function refinePrediction(row, tokenStats, config) {
    const baseline = new Set((row.strategies?.chainSmallFirst || []).map(Number));
    const scored = row.numberEvidence.map(evidence => ({
        number: Number(evidence.number),
        score: scoreEvidence(evidence, tokenStats, config)
    }));
    const inside = scored
        .filter(item => baseline.has(item.number))
        .sort((left, right) => left.score - right.score || right.number - left.number);
    const outside = scored
        .filter(item => !baseline.has(item.number))
        .sort((left, right) => right.score - left.score || left.number - right.number);
    const refined = new Set(baseline);
    let swaps = 0;
    for (let index = 0; index < Math.min(inside.length, outside.length); index++) {
        if (swaps >= config.swapLimit) break;
        if (outside[index].score - inside[index].score <= config.margin) break;
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
        target: TARGET_EXCLUDED,
        avgSwaps: result.days ? result.totalSwaps / result.days : 0,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0
    };
}

function evaluateBaseline(rows) {
    const summary = createSummary(BASELINE_ID);
    for (const row of rows) {
        addResult(summary, row, (row.strategies?.chainSmallFirst || []).map(Number));
    }
    return finalizeSummary(summary);
}

function evaluateRefiner(trainingRows, evaluationRows, config) {
    const tokenStats = buildTokenStats(trainingRows, config);
    const summary = createSummary(METHOD_ID);
    for (const row of evaluationRows) {
        const prediction = refinePrediction(row, tokenStats, config);
        addResult(summary, row, prediction.betNumbers, prediction.swaps);
    }
    return { tokenStats, summary: finalizeSummary(summary) };
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

function selectConfig(rows2024, rows2025) {
    const splitIndex = Math.floor(rows2024.length * 2 / 3);
    const early2024 = rows2024.slice(0, splitIndex);
    const late2024 = rows2024.slice(splitIndex);
    const baselineLate2024 = evaluateBaseline(late2024);
    const baseline2025 = evaluateBaseline(rows2025);
    return CONFIGS.map(config => {
        const fold2024 = evaluateRefiner(early2024, late2024, config).summary;
        const fold2025 = evaluateRefiner(rows2024, rows2025, config).summary;
        const delta2024 = delta(fold2024, baselineLate2024);
        const delta2025 = delta(fold2025, baseline2025);
        return {
            config,
            folds: [
                { period: 'late-2024', baseline: compactSummary(baselineLate2024), candidate: compactSummary(fold2024), delta: delta2024 },
                { period: '2025', baseline: compactSummary(baseline2025), candidate: compactSummary(fold2025), delta: delta2025 }
            ],
            minimumWinDelta: Math.min(delta2024.wins, delta2025.wins),
            totalWinDelta: delta2024.wins + delta2025.wins,
            maximumLossDelta: Math.max(delta2024.longestLoss, delta2025.longestLoss),
            totalProfitDeltaK: delta2024.profitK + delta2025.profitK
        };
    }).sort((left, right) =>
        right.minimumWinDelta - left.minimumWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || left.maximumLossDelta - right.maximumLossDelta
        || right.totalProfitDeltaK - left.totalProfitDeltaK
        || left.config.swapLimit - right.config.swapLimit
        || left.config.priorStrength - right.config.priorStrength
        || left.config.tokenMode.localeCompare(right.config.tokenMode)
    );
}

function main() {
    const args = parseArgs();
    if (!args.train2024.length || !args.train2025.length || !args.test2026.length) {
        throw new Error(
            'Cần truyền --train2024=file --train2025=file --test2026=file với báo cáo strict evidence đầy đủ.'
        );
    }
    const rows2024 = loadRows(args.train2024);
    const rows2025 = loadRows(args.train2025);
    const rows2026 = loadRows(args.test2026);
    const ranking = selectConfig(rows2024, rows2025);
    const selected = ranking[0];
    const baseline = evaluateBaseline(rows2026);
    const candidate = evaluateRefiner(
        [...rows2024, ...rows2025],
        rows2026,
        selected.config
    ).summary;
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            strategyId: METHOD_ID,
            pointInTime: 'Evidence từng ngày chỉ dùng raw prefix đến ngày liền trước.',
            model: 'Empirical Bayes theo family/pattern/state, khử tương quan theo family và chỉ đổi số quanh biên baseline.',
            selection: 'Train đầu 2024 -> cuối 2024; train 2024 -> 2025; khóa cấu hình trước khi test 2026.',
            promotionStatus: 'research-only'
        },
        economics: {
            targetExcluded: TARGET_EXCLUDED,
            betCount: BET_COUNT,
            betPerNumberK: BET_PER_NUMBER_K,
            winMultiplier: WIN_MULTIPLIER,
            breakEvenHitRate: BET_COUNT / WIN_MULTIPLIER
        },
        coverage: {
            train2024: { days: rows2024.length, firstDate: rows2024[0]?.date, lastDate: rows2024.at(-1)?.date },
            validation2025: { days: rows2025.length, firstDate: rows2025[0]?.date, lastDate: rows2025.at(-1)?.date },
            holdout2026: { days: rows2026.length, firstDate: rows2026[0]?.date, lastDate: rows2026.at(-1)?.date }
        },
        selected,
        selectionRanking: ranking,
        summariesByWindow: {
            dateRange: {
                [BASELINE_ID]: baseline,
                [METHOD_ID]: candidate
            }
        },
        delta: delta(candidate, baseline),
        fingerprint: {
            inputSha256: hashCanonical({
                train2024: rows2024,
                train2025: rows2025,
                test2026: rows2026
            }),
            configSha256: hashCanonical(CONFIGS),
            source: hashSourceFiles([__filename]),
            resultSha256: hashCanonical({
                selected: selected.config,
                baseline: compactSummary(baseline),
                candidate: compactSummary(candidate)
            })
        }
    };
    const outputPath = path.join(
        process.cwd(),
        'reports',
        `research_strict_bayes_refiner_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        outputPath,
        selected: report.selected,
        baseline: compactSummary(baseline),
        candidate: compactSummary(candidate),
        delta: report.delta
    }, null, 2));
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}

module.exports = {
    buildTokenStats,
    evaluateRefiner,
    refinePrediction,
    scoreEvidence,
    selectConfig,
    tokenContribution,
    tokenFor
};
