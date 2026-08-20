#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    refineSmallChain,
    trainSafetyModel
} = require('../lib/research/diagnosticSafetyModel');

const ROOT = path.join(__dirname, '..');
const SOURCES = {
    2014: 'reports/research_true_pit_strategies_2026-07-18T05-07-58-141Z.json',
    2015: 'reports/research_true_pit_strategies_2026-07-18T05-10-27-615Z.json',
    2016: 'reports/research_true_pit_strategies_2026-07-18T05-13-50-218Z.json',
    2017: 'reports/research_true_pit_strategies_2026-07-18T05-17-18-007Z.json',
    2018: 'reports/research_true_pit_strategies_2026-07-18T05-20-47-671Z.json',
    2019: 'reports/research_true_pit_strategies_2026-07-18T05-24-29-803Z.json',
    2020: 'reports/research_true_pit_strategies_2026-07-18T05-28-05-368Z.json',
    2021: 'reports/research_true_pit_strategies_2026-07-18T05-32-38-749Z.json',
    2022: 'reports/research_true_pit_strategies_2026-07-18T05-37-44-713Z.json',
    2023: 'reports/research_true_pit_strategies_2026-07-18T05-42-58-943Z.json',
    2024: 'reports/research_true_pit_strategies_2026-07-18T08-07-35-994Z.json',
    2025: 'reports/research_true_pit_strategies_2026-07-18T08-15-14-027Z.json',
    2026: 'reports/research_true_pit_strategies_2026-07-16T17-18-22-555Z.json'
};
const ECONOMICS = { betCount: 30, stakeK: 1000, payoutMultiplier: 84 };

function loadRows(years) {
    const rows = [];
    for (const year of years) {
        const file = path.join(ROOT, SOURCES[year]);
        const report = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const row of report.rows || []) {
            if (!Array.isArray(row.candidateDiagnostics) || !Array.isArray(row.strategies?.chainSmallFirst)) continue;
            rows.push(row);
        }
    }
    return rows.sort((left, right) => left.date.localeCompare(right.date));
}

function createSummary() {
    return { days: 0, wins: 0, profitK: 0, stakeK: 0, longestWin: 0, longestLoss: 0, current: '', length: 0, rows: [] };
}

function add(summary, row, bets, swaps = []) {
    const win = bets.includes(Number(row.actual));
    const profitK = (win ? ECONOMICS.payoutMultiplier : 0) * ECONOMICS.stakeK - bets.length * ECONOMICS.stakeK;
    const type = win ? 'W' : 'L';
    summary.days++;
    summary.wins += Number(win);
    summary.profitK += profitK;
    summary.stakeK += bets.length * ECONOMICS.stakeK;
    summary.length = summary.current === type ? summary.length + 1 : 1;
    summary.current = type;
    if (win) summary.longestWin = Math.max(summary.longestWin, summary.length);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.length);
    summary.rows.push({ date: row.date, actual: Number(row.actual), win, profitK, swaps, bets });
}

function finalize(summary) {
    const { current, length, ...result } = summary;
    return {
        ...result,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0,
        averageSwaps: result.days ? result.rows.reduce((sum, row) => sum + row.swaps.length, 0) / result.days : 0
    };
}

function evaluateBaseline(rows) {
    const summary = createSummary();
    rows.forEach(row => add(summary, row, row.strategies.chainSmallFirst.map(Number)));
    return finalize(summary);
}

function evaluateModel(rows, model, config) {
    const summary = createSummary();
    rows.forEach(row => {
        const prediction = refineSmallChain(row, model, config);
        add(summary, row, prediction.betNumbers, prediction.swaps);
    });
    return finalize(summary);
}

function compact(summary) {
    const { rows, ...result } = summary;
    return result;
}

function delta(candidate, baseline) {
    return {
        wins: candidate.wins - baseline.wins,
        hitRate: candidate.hitRate - baseline.hitRate,
        profitK: candidate.profitK - baseline.profitK,
        longestLoss: candidate.longestLoss - baseline.longestLoss
    };
}

function paired(candidate, baseline) {
    const b = new Map(baseline.rows.map(row => [row.date, row]));
    let candidateOnly = 0;
    let baselineOnly = 0;
    for (const row of candidate.rows) {
        const other = b.get(row.date);
        if (!other || row.win === other.win) continue;
        if (row.win) candidateOnly++;
        else baselineOnly++;
    }
    return { candidateOnly, baselineOnly, netAdditionalWins: candidateOnly - baselineOnly };
}

function configs() {
    return [
        { id: 'diag-safe-l2.01-lr.02-e80-s1', l2: 0.01, learningRate: 0.02, epochs: 80, swapLimit: 1 },
        { id: 'diag-safe-l2.01-lr.02-e80-s2', l2: 0.01, learningRate: 0.02, epochs: 80, swapLimit: 2 },
        { id: 'diag-safe-l2.01-lr.02-e80-s3', l2: 0.01, learningRate: 0.02, epochs: 80, swapLimit: 3 },
        { id: 'diag-safe-l2.05-lr.02-e80-s1', l2: 0.05, learningRate: 0.02, epochs: 80, swapLimit: 1 },
        { id: 'diag-safe-l2.05-lr.02-e80-s2', l2: 0.05, learningRate: 0.02, epochs: 80, swapLimit: 2 },
        { id: 'diag-safe-l2.05-lr.02-e80-s3', l2: 0.05, learningRate: 0.02, epochs: 80, swapLimit: 3 }
    ];
}

function renderMarkdown(report) {
    const compactRow = (name, result) => `| ${name} | ${result.days} | ${result.wins} | ${(result.hitRate * 100).toFixed(2)}% | ${result.profitK.toLocaleString('vi-VN')}K | ${(result.roi * 100).toFixed(2)}% | ${result.longestLoss} | ${result.averageSwaps.toFixed(2)} |`;
    return [
        '# SmallChainFirst Safety Refiner - strict PIT',
        '',
        '- Chỉ dùng daily candidate diagnostics được sinh trước kết quả ngày dự đoán.',
        '- Baseline cố định: ChainSmallFirst Hold70, đánh 30 số; candidate chỉ swap tối đa 1-3 số.',
        '- Train: 2014-2020 sampled 10 ngày; chọn cấu hình: 2021-2023 sampled; test: 2024-2025 sampled; holdout: 2026 full-daily.',
        '',
        '| Giai đoạn / phương pháp | Ngày | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thua dài nhất | TB swap |',
        '|---|---:|---:|---:|---:|---:|---:|---:|',
        compactRow('Test baseline', report.test.baseline),
        compactRow('Test safety', report.test.candidate),
        compactRow('Holdout 2026 baseline', report.holdout.baseline),
        compactRow('Holdout 2026 safety', report.holdout.candidate),
        '',
        `- Cấu hình chọn trước test/holdout: \`${report.selected.config.id}\`.`,
        `- Quyết định: **${report.promotionDecision}**.`,
        ''
    ].join('\n');
}

function main() {
    const train = loadRows([2014, 2015, 2016, 2017, 2018, 2019, 2020]);
    const validationByYear = [2021, 2022, 2023].map(year => loadRows([year]));
    const validation = validationByYear.flat();
    const test = loadRows([2024, 2025]);
    const holdout = loadRows([2026]);
    const options = configs();
    const candidates = options.map(config => {
        const model = trainSafetyModel(train, config);
        const folds = validationByYear.map(rows => {
            const baseline = evaluateBaseline(rows);
            const candidate = evaluateModel(rows, model, config);
            return { baseline: compact(baseline), candidate: compact(candidate), delta: delta(candidate, baseline) };
        });
        return {
            config,
            model,
            folds,
            minimumWinDelta: Math.min(...folds.map(fold => fold.delta.wins)),
            totalWinDelta: folds.reduce((sum, fold) => sum + fold.delta.wins, 0),
            totalProfitDeltaK: folds.reduce((sum, fold) => sum + fold.delta.profitK, 0),
            maximumLossDelta: Math.max(...folds.map(fold => fold.delta.longestLoss))
        };
    }).sort((left, right) => right.minimumWinDelta - left.minimumWinDelta || right.totalWinDelta - left.totalWinDelta || left.maximumLossDelta - right.maximumLossDelta || right.totalProfitDeltaK - left.totalProfitDeltaK);
    const selected = candidates[0];
    const finalModel = trainSafetyModel([...train, ...validation], selected.config);
    const testBaseline = evaluateBaseline(test);
    const testCandidate = evaluateModel(test, finalModel, selected.config);
    const holdoutBaseline = evaluateBaseline(holdout);
    const holdoutCandidate = evaluateModel(holdout, finalModel, selected.config);
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: 'diagnostic-safety-softmax-v1; strict PIT candidate diagnostics; fixed 30 bets; bounded swaps around chainSmallFirst',
        split: { train: '2014-2020 sampled step 10', validation: '2021-2023 sampled step 10', test: '2024-2025 sampled step 10', holdout: '2026 full daily' },
        economics: ECONOMICS,
        selected: { config: selected.config, validation: selected.folds.map(fold => fold.delta) },
        test: { baseline: compact(testBaseline), candidate: compact(testCandidate), delta: delta(testCandidate, testBaseline), paired: paired(testCandidate, testBaseline) },
        holdout: { baseline: compact(holdoutBaseline), candidate: compact(holdoutCandidate), delta: delta(holdoutCandidate, holdoutBaseline), paired: paired(holdoutCandidate, holdoutBaseline) },
        selectionTop: candidates.slice(0, 6).map(item => ({ config: item.config, minimumWinDelta: item.minimumWinDelta, totalWinDelta: item.totalWinDelta, totalProfitDeltaK: item.totalProfitDeltaK, maximumLossDelta: item.maximumLossDelta })),
        promotionDecision: holdoutCandidate.wins > holdoutBaseline.wins && holdoutCandidate.profitK > holdoutBaseline.profitK && testCandidate.wins >= testBaseline.wins && testCandidate.profitK >= testBaseline.profitK && holdoutCandidate.longestLoss <= Math.ceil(holdoutBaseline.longestLoss * 1.2)
            ? 'eligible-for-independent-full-daily-validation'
            : 'research-only-do-not-promote'
    };
    const prefix = path.join(ROOT, 'reports', `small-chain-safety-strict-pit-${new Date().toISOString().slice(0, 10)}`);
    fs.writeFileSync(`${prefix}.json`, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(`${prefix}.md`, `${renderMarkdown(report)}\n`);
    console.log(JSON.stringify({ report: `${prefix}.md`, selected: report.selected, test: report.test, holdout: report.holdout, promotionDecision: report.promotionDecision }, null, 2));
}

main();
