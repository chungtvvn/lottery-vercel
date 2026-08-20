#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    applyRanking,
    rankAuditRow,
    trainFailureCalibratorFromAudits
} = require('../lib/research/exclusionFailureCalibrator');
const { buildAuditRow } = require('../lib/research/exclusionFailureAudit');

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
const ECONOMICS = { stakeK: 1000, payoutMultiplier: 84 };

function loadYears(years) {
    return years.flatMap(year => {
        const report = JSON.parse(fs.readFileSync(path.join(ROOT, SOURCES[year]), 'utf8'));
        return (report.rows || []).filter(row =>
            Array.isArray(row.candidateDiagnostics) &&
            Array.isArray(row.strategies?.chainSmallFirst) &&
            row.strategies.chainSmallFirst.length === 30
        ).map(row => buildAuditRow(row)).filter(Boolean);
    }).sort((left, right) => left.date.localeCompare(right.date));
}

function evaluate(rows, predictor) {
    const result = { days: 0, wins: 0, profitK: 0, stakeK: 0, longestWin: 0, longestLoss: 0, current: '', streak: 0, averageSwaps: 0, rows: [] };
    for (const row of rows) {
        const prediction = predictor(row);
        const bets = prediction.betNumbers.map(Number);
        const win = bets.includes(Number(row.actual));
        const profitK = (win ? ECONOMICS.payoutMultiplier : 0) * ECONOMICS.stakeK - bets.length * ECONOMICS.stakeK;
        const type = win ? 'W' : 'L';
        result.days++;
        result.wins += Number(win);
        result.profitK += profitK;
        result.stakeK += bets.length * ECONOMICS.stakeK;
        result.averageSwaps += prediction.swaps?.length || 0;
        result.streak = result.current === type ? result.streak + 1 : 1;
        result.current = type;
        if (win) result.longestWin = Math.max(result.longestWin, result.streak);
        else result.longestLoss = Math.max(result.longestLoss, result.streak);
        result.rows.push({ date: row.date, actual: Number(row.actual), win, profitK, swaps: prediction.swaps || [] });
    }
    result.hitRate = result.days ? result.wins / result.days : 0;
    result.roi = result.stakeK ? result.profitK / result.stakeK : 0;
    result.averageSwaps = result.days ? result.averageSwaps / result.days : 0;
    delete result.current;
    delete result.streak;
    return result;
}

function baseline(rows) {
    return evaluate(rows, row => ({ betNumbers: row.betNumbers, swaps: [] }));
}

function compact(result) {
    const { rows, ...summary } = result;
    return summary;
}

function delta(candidate, base) {
    return {
        wins: candidate.wins - base.wins,
        hitRate: candidate.hitRate - base.hitRate,
        profitK: candidate.profitK - base.profitK,
        longestLoss: candidate.longestLoss - base.longestLoss
    };
}

function paired(candidate, base) {
    const baseByDate = new Map(base.rows.map(row => [row.date, row]));
    let candidateOnly = 0;
    let baselineOnly = 0;
    for (const row of candidate.rows) {
        const other = baseByDate.get(row.date);
        if (!other || row.win === other.win) continue;
        if (row.win) candidateOnly++;
        else baselineOnly++;
    }
    return { candidateOnly, baselineOnly, netAdditionalWins: candidateOnly - baselineOnly };
}

function configurations() {
    const configs = [];
    for (const priorStrength of [200, 500, 1000, 2000]) {
        for (const swapLimit of [1, 2, 3]) {
            for (const minimumMargin of [0, 0.01]) {
                configs.push({
                    id: `failure-cal-p${priorStrength}-s${swapLimit}-m${minimumMargin}`,
                    priorStrength,
                    swapLimit,
                    minimumMargin
                });
            }
        }
    }
    return configs;
}

function renderMarkdown(report) {
    const line = (name, value) => `| ${name} | ${value.days} | ${value.wins} | ${(value.hitRate * 100).toFixed(2)}% | ${value.profitK.toLocaleString('vi-VN')}K | ${(value.roi * 100).toFixed(2)}% | ${value.longestLoss} | ${value.averageSwaps.toFixed(2)} |`;
    return [
        '# Failure-risk calibrator - strict PIT',
        '',
        '- Baseline: ChainSmallFirst Hold70, 30 số, 1000K/số, ăn 84.',
        '- Train 2014-2020 sampled; chọn cấu hình riêng trên 2021, 2022, 2023; test 2024-2025; holdout 2026 full daily.',
        '- Mô hình học nguy cơ một số bị loại nhưng lại về, dùng Beta shrinkage và bằng chứng candidate đã khử trùng.',
        '- Giữ nguyên 30 số; chỉ swap số có nguy cơ failure cao vào dàn đánh.',
        '',
        '| Giai đoạn / phương pháp | Ngày | Trúng | Tỷ lệ | Profit | ROI | Thua dài nhất | TB swap |',
        '|---|---:|---:|---:|---:|---:|---:|---:|',
        line('Test baseline', report.test.baseline),
        line('Test candidate', report.test.candidate),
        line('Holdout 2026 baseline', report.holdout.baseline),
        line('Holdout 2026 candidate', report.holdout.candidate),
        '',
        `- Cấu hình đã chọn trước test: \`${report.selected.config.id}\`.`,
        `- Paired test: candidate-only ${report.test.paired.candidateOnly}, baseline-only ${report.test.paired.baselineOnly}.`,
        `- Paired holdout: candidate-only ${report.holdout.paired.candidateOnly}, baseline-only ${report.holdout.paired.baselineOnly}.`,
        `- Quyết định: **${report.promotionDecision}**.`,
        ''
    ].join('\n');
}

function main() {
    const train = loadYears([2014, 2015, 2016, 2017, 2018, 2019, 2020]);
    const validationByYear = [2021, 2022, 2023].map(year => loadYears([year]));
    const validation = validationByYear.flat();
    const test = loadYears([2024, 2025]);
    const holdout = loadYears([2026]);
    const modelByPrior = new Map();
    const validationRankingByPrior = new Map();
    for (const priorStrength of [200, 500, 1000, 2000]) {
        const model = trainFailureCalibratorFromAudits(train, { priorStrength });
        modelByPrior.set(priorStrength, model);
        validationRankingByPrior.set(priorStrength, new Map(validation.map(row => [row.date, rankAuditRow(row, model)])));
    }
    const candidates = configurations().map(config => {
        const rankings = validationRankingByPrior.get(config.priorStrength);
        const folds = validationByYear.map(rows => {
            const base = baseline(rows);
            const candidate = evaluate(rows, row => applyRanking(row.betNumbers, rankings.get(row.date), config));
            return { baseline: compact(base), candidate: compact(candidate), delta: delta(candidate, base) };
        });
        return {
            config,
            folds,
            minimumWinDelta: Math.min(...folds.map(fold => fold.delta.wins)),
            totalWinDelta: folds.reduce((sum, fold) => sum + fold.delta.wins, 0),
            totalProfitDeltaK: folds.reduce((sum, fold) => sum + fold.delta.profitK, 0),
            maximumLossDelta: Math.max(...folds.map(fold => fold.delta.longestLoss))
        };
    }).sort((left, right) =>
        right.minimumWinDelta - left.minimumWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || left.maximumLossDelta - right.maximumLossDelta
        || right.totalProfitDeltaK - left.totalProfitDeltaK
        || left.config.swapLimit - right.config.swapLimit
    );
    const selected = candidates[0];
    const finalModel = trainFailureCalibratorFromAudits([...train, ...validation], selected.config);
    const testRankings = new Map(test.map(row => [row.date, rankAuditRow(row, finalModel)]));
    const holdoutRankings = new Map(holdout.map(row => [row.date, rankAuditRow(row, finalModel)]));
    const testBase = baseline(test);
    const testCandidate = evaluate(test, row => applyRanking(row.betNumbers, testRankings.get(row.date), selected.config));
    const holdoutBase = baseline(holdout);
    const holdoutCandidate = evaluate(holdout, row => applyRanking(row.betNumbers, holdoutRankings.get(row.date), selected.config));
    const promotionDecision = testCandidate.wins >= testBase.wins
        && testCandidate.profitK >= testBase.profitK
        && holdoutCandidate.wins > holdoutBase.wins
        && holdoutCandidate.profitK > holdoutBase.profitK
        && holdoutCandidate.longestLoss <= Math.ceil(holdoutBase.longestLoss * 1.2)
        ? 'eligible-for-independent-full-daily-validation'
        : 'research-only-do-not-promote';
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: 'hierarchical failure-risk beta calibration; strict PIT; fixed 30 bets',
        economics: ECONOMICS,
        split: { train: '2014-2020 sampled step10', validation: '2021-2023 sampled step10', test: '2024-2025 sampled step10', holdout: '2026 full daily' },
        selected: { config: selected.config, validation: selected.folds.map(fold => fold.delta) },
        test: { baseline: compact(testBase), candidate: compact(testCandidate), delta: delta(testCandidate, testBase), paired: paired(testCandidate, testBase) },
        holdout: { baseline: compact(holdoutBase), candidate: compact(holdoutCandidate), delta: delta(holdoutCandidate, holdoutBase), paired: paired(holdoutCandidate, holdoutBase) },
        selectionTop: candidates.slice(0, 10).map(item => ({
            config: item.config,
            minimumWinDelta: item.minimumWinDelta,
            totalWinDelta: item.totalWinDelta,
            totalProfitDeltaK: item.totalProfitDeltaK,
            maximumLossDelta: item.maximumLossDelta
        })),
        promotionDecision
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const prefix = path.join(ROOT, 'reports', `exclusion-failure-calibrator-${stamp}`);
    fs.writeFileSync(`${prefix}.json`, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(`${prefix}.md`, `${renderMarkdown(report)}\n`);
    console.log(JSON.stringify({ report: `${prefix}.md`, selected: report.selected, test: report.test, holdout: report.holdout, promotionDecision }, null, 2));
}

main();
