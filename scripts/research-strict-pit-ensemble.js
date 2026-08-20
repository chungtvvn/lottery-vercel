#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPORT_PREFIX = 'research_true_pit_strategies_';
const METHODOLOGY = 'strict-prefix-point-in-time-v1';
const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = 30;
const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;
const BREAK_EVEN_RATE = BET_COUNT / WIN_MULTIPLIER;
const MIN_METHODS = 13;

const METHOD_GROUPS = {
    all: [
        'chainSmallFirst',
        'chainBlockFirst',
        'chainCredibleFirst',
        'chainFreqFirst',
        'chainRiskFirst',
        'numberAvgRisk',
        'numberConsensusRisk',
        'numberPosteriorDiversity',
        'numberLikelihoodRatio',
        'numberWeightedRisk',
        'activeOnlyAvgRisk',
        'dedupEdge50Hold',
        'dedupEdge50CombinedB40S05'
    ],
    diverse: [
        'chainSmallFirst',
        'chainBlockFirst',
        'chainCredibleFirst',
        'numberPosteriorDiversity',
        'numberLikelihoodRatio',
        'numberConsensusRisk',
        'dedupEdge50Hold'
    ],
    chain: [
        'chainSmallFirst',
        'chainBlockFirst',
        'chainCredibleFirst',
        'chainFreqFirst',
        'chainRiskFirst'
    ]
};

function loadStrictRows(reportDir) {
    const selectedByYear = new Map();
    const files = fs.readdirSync(reportDir)
        .filter(file => file.startsWith(REPORT_PREFIX) && file.endsWith('.json'))
        .sort();
    for (const file of files) {
        let report;
        try {
            report = JSON.parse(fs.readFileSync(path.join(reportDir, file), 'utf8'));
        } catch {
            continue;
        }
        if (report.methodologyVersion !== METHODOLOGY || report.options?.dateStep !== 1) continue;
        if (!Array.isArray(report.rows) || report.rows.length === 0) continue;
        const year = Number(report.rows[0].date?.slice(0, 4));
        const strategyKeys = Object.keys(report.rows[0].strategies || {});
        const minimumDays = year === 2026 ? 180 : 330;
        if (!year || report.rows.length < minimumDays || strategyKeys.length < MIN_METHODS) continue;
        const previous = selectedByYear.get(year);
        const score = report.rows.length * 100 + strategyKeys.length;
        if (!previous || score > previous.score) {
            selectedByYear.set(year, { file, report, score });
        }
    }
    const sources = [...selectedByYear.entries()]
        .sort((left, right) => left[0] - right[0]);
    const rows = sources.flatMap(([, source]) => source.report.rows)
        .sort((left, right) => left.date.localeCompare(right.date));
    return {
        rows,
        sources: sources.map(([year, source]) => ({
            year,
            file: source.file,
            days: source.report.rows.length,
            baselineCutoffDate: source.report.baselineCutoffDate,
            fingerprint: source.report.fingerprint?.sha256 || source.report.fingerprint || null
        }))
    };
}

function betaSmoothedRate(state, priorStrength = 30) {
    return (state.wins + BREAK_EVEN_RATE * priorStrength) /
        Math.max(1, state.days + priorStrength);
}

function scoreNumbers(row, methods, weights) {
    const scores = new Float64Array(100);
    for (const method of methods) {
        const weight = Number(weights?.[method] ?? 1);
        for (const number of row.strategies?.[method] || []) scores[number] += weight;
    }
    return ALL_NUMBERS.slice()
        .sort((left, right) => scores[right] - scores[left] || left - right)
        .slice(0, BET_COUNT);
}

function buildFixedVoteSelector(methods) {
    return row => scoreNumbers(row, methods, null);
}

function buildOnlineSelector(methods, options = {}) {
    const window = Number(options.window || 0);
    const longBlend = Number(options.longBlend ?? 0.5);
    const history = Object.fromEntries(methods.map(method => [method, []]));
    const expanding = Object.fromEntries(methods.map(method => [method, { days: 0, wins: 0 }]));
    return {
        select(row) {
            const weights = {};
            for (const method of methods) {
                const longRate = betaSmoothedRate(expanding[method], 60);
                const recentRows = window > 0 ? history[method].slice(-window) : history[method];
                const recentWins = recentRows.reduce((sum, value) => sum + value, 0);
                const recentRate = (recentWins + BREAK_EVEN_RATE * 24) /
                    Math.max(1, recentRows.length + 24);
                const blended = longRate * longBlend + recentRate * (1 - longBlend);
                weights[method] = Math.max(0.2, Math.min(2, blended / BREAK_EVEN_RATE));
            }
            return scoreNumbers(row, methods, weights);
        },
        update(row) {
            for (const method of methods) {
                const hit = Number((row.strategies?.[method] || []).includes(row.actual));
                expanding[method].days++;
                expanding[method].wins += hit;
                history[method].push(hit);
            }
        }
    };
}

function summarize(rows, selectorFactory) {
    const selector = selectorFactory();
    const daily = [];
    let wins = 0;
    let stakeK = 0;
    let payoutK = 0;
    let currentWin = 0;
    let currentLoss = 0;
    let longestWin = 0;
    let longestLoss = 0;
    for (const row of rows) {
        const betNumbers = selector.select ? selector.select(row) : selector(row);
        const win = betNumbers.includes(row.actual);
        const dayStakeK = betNumbers.length * BET_PER_NUMBER_K;
        const dayPayoutK = win ? BET_PER_NUMBER_K * WIN_MULTIPLIER : 0;
        const profitK = dayPayoutK - dayStakeK;
        wins += Number(win);
        stakeK += dayStakeK;
        payoutK += dayPayoutK;
        currentWin = win ? currentWin + 1 : 0;
        currentLoss = win ? 0 : currentLoss + 1;
        longestWin = Math.max(longestWin, currentWin);
        longestLoss = Math.max(longestLoss, currentLoss);
        daily.push({ date: row.date, actual: row.actual, win, profitK, betNumbers });
        if (selector.update) selector.update(row);
    }
    return {
        days: rows.length,
        wins,
        losses: rows.length - wins,
        hitRate: rows.length ? wins / rows.length : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin,
        longestLoss,
        daily
    };
}

function stripDaily(summary) {
    const { daily, ...result } = summary;
    return result;
}

function main() {
    const root = path.resolve(__dirname, '..');
    const { rows, sources } = loadStrictRows(path.join(root, 'reports'));
    if (rows.length === 0) throw new Error('Không có report strict PIT đầy đủ để nghiên cứu.');
    const periods = {
        training2016To2023: rows.filter(row => row.date < '2024-01-01'),
        validation2024To2025: rows.filter(row => row.date >= '2024-01-01' && row.date < '2026-01-01'),
        holdout2026: rows.filter(row => row.date >= '2026-01-01'),
        all: rows
    };
    const candidates = {};
    for (const [groupId, methods] of Object.entries(METHOD_GROUPS)) {
        candidates[`vote_${groupId}`] = () => buildFixedVoteSelector(methods);
        for (const window of [90, 180, 365]) {
            for (const longBlend of [0.25, 0.5, 0.75]) {
                candidates[`online_${groupId}_w${window}_l${String(longBlend).replace('.', '')}`] = () =>
                    buildOnlineSelector(methods, { window, longBlend });
            }
        }
    }
    for (const method of METHOD_GROUPS.all) {
        candidates[`base_${method}`] = () => buildFixedVoteSelector([method]);
    }

    const results = {};
    for (const [candidateId, selectorFactory] of Object.entries(candidates)) {
        results[candidateId] = Object.fromEntries(Object.entries(periods).map(([period, periodRows]) => [
            period,
            stripDaily(summarize(periodRows, selectorFactory))
        ]));
    }
    const trainingRanking = Object.entries(results)
        .sort((left, right) => right[1].training2016To2023.profitK - left[1].training2016To2023.profitK)
        .map(([id]) => id);
    const selectedOnTraining = trainingRanking[0];
    const validationRanking = Object.entries(results)
        .sort((left, right) => right[1].validation2024To2025.profitK - left[1].validation2024To2025.profitK)
        .map(([id]) => id);
    const selectedDaily = summarize(periods.all, candidates[selectedOnTraining]).daily;
    const output = {
        generatedAt: new Date().toISOString(),
        methodology: METHODOLOGY,
        selectionRule: 'Chọn cấu hình chỉ bằng profit 2016-2023; 2024-2025 là validation và 2026 là holdout khóa.',
        economics: { betCount: BET_COUNT, betPerNumberK: BET_PER_NUMBER_K, winMultiplier: WIN_MULTIPLIER, breakEvenRate: BREAK_EVEN_RATE },
        sources,
        selectedOnTraining,
        selectedResult: results[selectedOnTraining],
        trainingTop10: trainingRanking.slice(0, 10).map(id => ({ id, ...results[id].training2016To2023 })),
        validationTop10DiagnosticOnly: validationRanking.slice(0, 10).map(id => ({ id, ...results[id].validation2024To2025 })),
        allResults: results,
        selectedDaily
    };
    const outputPath = path.join(root, 'reports', `research_strict_pit_ensemble_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(JSON.stringify({
        outputPath,
        selectedOnTraining,
        selectedResult: output.selectedResult,
        trainingTop5: output.trainingTop10.slice(0, 5).map(row => ({ id: row.id, profitK: row.profitK, hitRate: row.hitRate })),
        validationTop5DiagnosticOnly: output.validationTop10DiagnosticOnly.slice(0, 5).map(row => ({ id: row.id, profitK: row.profitK, hitRate: row.hitRate }))
    }, null, 2));
}

if (require.main === module) main();

