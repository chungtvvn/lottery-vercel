#!/usr/bin/env node
'use strict';

// Research-only: pick a conservative scorecard configuration using calendar
// years before the final holdout. It never changes a production strategy.
const fs = require('fs');
const path = require('path');
const {
    buildQualityMap,
    refinePrediction
} = require('../lib/research/chainScorecardStrategy');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const HOLDOUT_YEAR = 2026;
const VALIDATION_YEARS = [2023, 2024, 2025];
const STAKE_K = 1000;
const PAYOUT = 84;

function readDiagnosticReports() {
    const best = new Map();
    for (const name of fs.readdirSync(REPORT_DIR)) {
        if (!name.startsWith('research_true_pit_strategies_') || !name.endsWith('.json')) continue;
        try {
            const report = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, name), 'utf8'));
            const rows = report.rows || [];
            if (report.options?.includeCandidateDiagnostics !== true || report.errors?.length || !rows.length) continue;
            const years = [...new Set(rows.map(row => String(row.date).slice(0, 4)))];
            if (years.length !== 1 || !/^20\d{2}$/.test(years[0])) continue;
            const year = Number(years[0]);
            const candidate = { name, year, rows: rows.slice().sort((a, b) => a.date.localeCompare(b.date)), step: Number(report.options?.dateStep || 1) };
            const current = best.get(year);
            if (!current || candidate.rows.length > current.rows.length
                || (candidate.rows.length === current.rows.length && candidate.step < current.step)
                || (candidate.rows.length === current.rows.length && candidate.step === current.step && candidate.name > current.name)) {
                best.set(year, candidate);
            }
        } catch {
            // Ignore malformed historical research artifacts.
        }
    }
    return best;
}

function summarize(rows, config, qualityMap) {
    let hits = 0;
    let swaps = 0;
    let current = null;
    let length = 0;
    let longestLoss = 0;
    for (const row of rows) {
        const prediction = refinePrediction(row, qualityMap, config);
        const hit = prediction.betNumbers.includes(Number(row.actual));
        hits += Number(hit);
        swaps += prediction.swaps.length;
        const type = hit ? 'win' : 'loss';
        length = current === type ? length + 1 : 1;
        current = type;
        if (!hit) longestLoss = Math.max(longestLoss, length);
    }
    const days = rows.length;
    const profitK = hits * PAYOUT * STAKE_K - days * 30 * STAKE_K;
    return { days, hits, hitRate: days ? hits / days : 0, profitK, roi: days ? profitK / (days * 30 * STAKE_K) : 0, longestLoss, averageSwaps: days ? swaps / days : 0 };
}

function baseline(rows) {
    let hits = 0;
    let current = null;
    let length = 0;
    let longestLoss = 0;
    for (const row of rows) {
        const hit = (row.strategies?.chainSmallFirst || []).map(Number).includes(Number(row.actual));
        hits += Number(hit);
        const type = hit ? 'win' : 'loss';
        length = current === type ? length + 1 : 1;
        current = type;
        if (!hit) longestLoss = Math.max(longestLoss, length);
    }
    const days = rows.length;
    const profitK = hits * PAYOUT * STAKE_K - days * 30 * STAKE_K;
    return { days, hits, hitRate: days ? hits / days : 0, profitK, roi: days ? profitK / (days * 30 * STAKE_K) : 0, longestLoss };
}

function configs() {
    // Pre-registered conservative candidates. Keeping this small prevents
    // repeated parameter mining and makes the experiment fit normal RAM.
    return [
        [20, 10, 1.28, 60, 1, 0.05],
        [40, 20, 1.28, 60, 1, 0.05],
        [40, 20, 1.64, 120, 1, 0.10],
        [60, 40, 1.64, 120, 1, 0.10],
        [40, 20, 1.64, 120, 2, 0.10]
    ].map(([minQualityScore, minOpportunities, conservativeZ, reliabilityDays, swapLimit, minMargin]) => ({
        id: `q${minQualityScore}-n${minOpportunities}-z${conservativeZ}-r${reliabilityDays}-s${swapLimit}-m${minMargin}`,
        minQualityScore,
        minOpportunities,
        conservativeZ,
        reliabilityDays,
        swapLimit,
        minMargin,
        minRiskScore: minQualityScore / 100,
        topFamilies: 1,
        priorStrengths: [60, 90, 120],
        singleRegimeReliability: 0.2
    }));
}

function percentile(sorted, p) {
    if (!sorted.length) return 0;
    return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)))];
}

function evaluateConfig(config, reports) {
    const folds = [];
    for (const year of VALIDATION_YEARS) {
        const test = reports.get(year)?.rows;
        const train = [...reports.values()]
            .filter(item => item.year < year)
            .flatMap(item => item.rows);
        if (!test?.length || !train.length) continue;
        const qualityMap = buildQualityMap(train, config);
        const candidate = summarize(test, config, qualityMap);
        const base = baseline(test);
        folds.push({ year, candidate, baseline: base, deltaHits: candidate.hits - base.hits, deltaProfitK: candidate.profitK - base.profitK });
    }
    const deltas = folds.map(fold => fold.deltaHits);
    return {
        config,
        folds,
        minDeltaHits: Math.min(...deltas),
        totalDeltaHits: deltas.reduce((sum, value) => sum + value, 0),
        totalDeltaProfitK: folds.reduce((sum, fold) => sum + fold.deltaProfitK, 0),
        maxLossPenalty: Math.max(...folds.map(fold => fold.candidate.longestLoss - fold.baseline.longestLoss)),
        averageSwaps: folds.reduce((sum, fold) => sum + fold.candidate.averageSwaps, 0) / folds.length
    };
}

function fmtPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function fmtMoney(value) {
    return `${Number(value || 0).toLocaleString('vi-VN')}K`;
}

function markdown(report) {
    const lines = [
        '# Conservative scorecard grid - strict PIT',
        '',
        '- Baseline: Chuỗi nhỏ Hold 70, đánh 30 số, 1.000K/số, ăn 84.',
        '- Chọn tham số trên các fold 2023–2025; mỗi fold chỉ học các năm trước nó.',
        '- Holdout 2026 không tham gia chọn tham số.',
        '- Scorecard chỉ hoán đổi 0–4 số quanh dàn Chuỗi nhỏ và chỉ nhận bằng chứng một họ chuỗi.',
        '',
        `Cấu hình khóa: \`${report.selected.config.id}\`.`,
        '',
        '| Fold chọn | Baseline | Candidate | Delta hit | Delta profit | Swap TB |',
        '|---|---:|---:|---:|---:|---:|'
    ];
    for (const fold of report.selected.folds) {
        lines.push(`| ${fold.year} | ${fold.baseline.hits}/${fold.baseline.days} (${fmtPercent(fold.baseline.hitRate)}) | ${fold.candidate.hits}/${fold.candidate.days} (${fmtPercent(fold.candidate.hitRate)}) | ${fold.deltaHits >= 0 ? '+' : ''}${fold.deltaHits} | ${fmtMoney(fold.deltaProfitK)} | ${fold.candidate.averageSwaps.toFixed(2)} |`);
    }
    const holdout = report.holdout;
    lines.push('', '## Holdout 2026', '', '| Phương pháp | Hit | Profit | ROI | Thua dài nhất |', '|---|---:|---:|---:|---:|',
        `| Chuỗi nhỏ | ${holdout.baseline.hits}/${holdout.baseline.days} (${fmtPercent(holdout.baseline.hitRate)}) | ${fmtMoney(holdout.baseline.profitK)} | ${fmtPercent(holdout.baseline.roi)} | ${holdout.baseline.longestLoss} |`,
        `| Scorecard bảo thủ | ${holdout.candidate.hits}/${holdout.candidate.days} (${fmtPercent(holdout.candidate.hitRate)}) | ${fmtMoney(holdout.candidate.profitK)} | ${fmtPercent(holdout.candidate.roi)} | ${holdout.candidate.longestLoss} |`,
        '', `Kết luận: **${report.decision}**`, '', report.conclusion, '',
        '> Đây là kiểm chứng nghiên cứu. Các fold 2023–2025 hiện là replay cách ngày 7, không đủ để thay thế snapshot production.'
    );
    return `${lines.join('\n')}\n`;
}

function main() {
    const reports = readDiagnosticReports();
    for (const year of [...reports.keys()]) {
        if (year < 2014 || year > HOLDOUT_YEAR) reports.delete(year);
    }
    const missing = [...VALIDATION_YEARS, HOLDOUT_YEAR].filter(year => !reports.has(year));
    if (missing.length) throw new Error(`Thiếu report strict candidate diagnostics cho năm: ${missing.join(', ')}`);
    const selected = configs().map(config => evaluateConfig(config, reports)).sort((a, b) =>
        b.minDeltaHits - a.minDeltaHits
        || b.totalDeltaHits - a.totalDeltaHits
        || a.maxLossPenalty - b.maxLossPenalty
        || b.totalDeltaProfitK - a.totalDeltaProfitK
        || a.averageSwaps - b.averageSwaps
        || a.config.id.localeCompare(b.config.id)
    )[0];
    const train = [...reports.values()].filter(item => item.year < HOLDOUT_YEAR).flatMap(item => item.rows);
    const qualityMap = buildQualityMap(train, selected.config);
    const holdoutRows = reports.get(HOLDOUT_YEAR).rows;
    const candidate = summarize(holdoutRows, selected.config, qualityMap);
    const base = baseline(holdoutRows);
    const eligible = selected.minDeltaHits >= 0
        && selected.totalDeltaHits > 0
        && candidate.hits > base.hits
        && candidate.profitK > base.profitK
        && candidate.longestLoss <= Math.ceil(base.longestLoss * 1.2);
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-pit-calendar-fold-scorecard-v1',
        status: 'research-only',
        sources: [...reports.values()].map(item => ({ year: item.year, file: item.name, days: item.rows.length, dateStep: item.step })),
        selected,
        holdout: { baseline: base, candidate, deltaHits: candidate.hits - base.hits, deltaProfitK: candidate.profitK - base.profitK },
        decision: eligible ? 'eligible-for-second-independent-holdout' : 'do-not-promote',
        conclusion: eligible
            ? 'Vượt các fold lựa chọn và holdout hiện tại, nhưng cần một holdout độc lập đủ ngày trước khi theo dõi live.'
            : 'Không vượt baseline ổn định. Không thay đổi chiến lược production.'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = path.join(REPORT_DIR, `conservative-scorecard-grid-${stamp}.json`);
    const markdownFile = path.join(REPORT_DIR, `conservative-scorecard-grid-${stamp}.md`);
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
    fs.writeFileSync(markdownFile, markdown(report));
    console.log(JSON.stringify({ jsonFile, markdownFile, selected: selected.config, holdout: report.holdout, decision: report.decision }, null, 2));
}

main();
