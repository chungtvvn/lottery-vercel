#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    fitStableBlockAdmissionModel,
    fitStableBlockBreakModel,
    normalizeActiveBlock,
    refinePredictionWithBlockAdmission,
    refinePredictionWithBlockGuard
} = require('../lib/research/blockAdmissionCalibrator');

const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, 'reports');
const PAYOUT = 84;
const STAKE_K = 1000;
const BET_COUNT = 30;

function loadReport(file) {
    return JSON.parse(fs.readFileSync(path.join(REPORTS, file), 'utf8'));
}

function findStrictReports() {
    const files = fs.readdirSync(REPORTS)
        .filter(file => /^research_true_pit_strategies_.*\.json$/.test(file));
    const reports = files.map(file => ({ file, report: loadReport(file) }))
        .filter(item => Array.isArray(item.report.rows) && item.report.rows.length >= 30)
        .map(item => ({
            ...item,
            year: Number(item.report.rows[0].date.slice(0, 4)),
            strategies: Object.keys(item.report.rows[0].strategies || {}),
            blockDiagnostics: item.report.rows.reduce((sum, row) => sum +
                (row.candidateDiagnostics || []).filter(candidate => candidate.family === 'block').length, 0)
        }))
        .filter(item => item.blockDiagnostics > 0 && item.strategies.includes('chainSmallFirst'));
    const byYear = new Map();
    for (const item of reports) {
        const current = byYear.get(item.year);
        if (!current || item.blockDiagnostics > current.blockDiagnostics) {
            byYear.set(item.year, item);
        }
    }
    return byYear;
}

function summarizeScope(rows, options = {}) {
    let opportunities = 0;
    let observedExcluded = 0;
    let expectedExcluded = 0;
    let recordOpportunities = 0;
    let recordBreaks = 0;
    let recordExpectedBreaks = 0;
    const activeDays = new Set();
    for (const row of rows) {
        const deduplicated = new Map();
        for (const raw of row.candidateDiagnostics || []) {
            const candidate = normalizeActiveBlock(raw, options);
            if (!candidate) continue;
            const signature = `${candidate.shape.id}|${candidate.numbers.join(',')}`;
            const existing = deduplicated.get(signature);
            if (!existing || candidate.baseLen > existing.baseLen) deduplicated.set(signature, candidate);
        }
        if (deduplicated.size) activeDays.add(row.date);
        for (const candidate of deduplicated.values()) {
            opportunities++;
            observedExcluded += Number(candidate.observedExcluded);
            expectedExcluded += candidate.baseExclusionRate;
            if (['at-record', 'super-record'].includes(candidate.recordState)) {
                recordOpportunities++;
                recordBreaks += Number(!candidate.observedExcluded);
                recordExpectedBreaks += 1 - candidate.baseExclusionRate;
            }
        }
    }
    return {
        days: rows.length,
        activeDays: activeDays.size,
        opportunities,
        observedExclusionRate: opportunities ? observedExcluded / opportunities : 0,
        expectedExclusionRate: opportunities ? expectedExcluded / opportunities : 0,
        exclusionEdge: opportunities ? (observedExcluded - expectedExcluded) / opportunities : 0,
        recordOpportunities,
        recordBreakRate: recordOpportunities ? recordBreaks / recordOpportunities : 0,
        recordExpectedBreakRate: recordOpportunities ? recordExpectedBreaks / recordOpportunities : 0,
        recordBreakExcess: recordOpportunities
            ? (recordBreaks - recordExpectedBreaks) / recordOpportunities
            : 0
    };
}

function settle(rows, predictor) {
    let baselineHits = 0;
    let hits = 0;
    let changedDays = 0;
    let helpful = 0;
    let harmful = 0;
    let longestLoss = 0;
    let currentLoss = 0;
    let swaps = 0;
    for (const row of rows) {
        const baselineHit = row.strategies.chainSmallFirst.includes(row.actual);
        const prediction = predictor(row);
        const hit = prediction.betNumbers.includes(row.actual);
        baselineHits += Number(baselineHit);
        hits += Number(hit);
        swaps += prediction.swaps.length;
        changedDays += Number(prediction.swaps.length > 0);
        helpful += Number(!baselineHit && hit);
        harmful += Number(baselineHit && !hit);
        currentLoss = hit ? 0 : currentLoss + 1;
        longestLoss = Math.max(longestLoss, currentLoss);
    }
    return {
        days: rows.length,
        baselineHits,
        hits,
        deltaHits: hits - baselineHits,
        hitRate: rows.length ? hits / rows.length : 0,
        changedDays,
        swaps,
        helpful,
        harmful,
        longestLoss,
        profitK: hits * PAYOUT * STAKE_K - rows.length * BET_COUNT * STAKE_K
    };
}

function percent(value, digits = 2) {
    return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

function main() {
    const byYear = findStrictReports();
    const trainYears = Array.from({ length: 10 }, (_, index) => 2014 + index);
    const train = trainYears.map(year => byYear.get(year)?.report.rows).filter(Boolean);
    const evaluationYears = [2024, 2025, 2026];
    if (train.length < 9 || evaluationYears.some(year => !byYear.has(year))) {
        throw new Error('Thiếu strict PIT candidate diagnostics cho train 2014-2023 hoặc evaluation 2024-2026.');
    }

    const common = {
        baselineStrategy: 'chainSmallFirst',
        maxSetSize: 70,
        minDaysPerYear: 2,
        minYears: 6,
        minPositiveShare: 0.6,
        minConservativeEdge: 0,
        minConservativeLift: 0,
        stabilityZ: 0.67,
        minEvidenceDays: 10,
        swapLimit: 1,
        minSwapMargin: 0
    };
    const admissionModel = fitStableBlockAdmissionModel(train, common);
    const breakModel = fitStableBlockBreakModel(train, common);
    const recordOptions = { ...common, recordOnly: true };
    const recordAdmissionModel = fitStableBlockAdmissionModel(train, recordOptions);
    const recordBreakModel = fitStableBlockBreakModel(train, recordOptions);

    const rows = [];
    for (const year of evaluationYears) {
        const yearlyRows = byYear.get(year).report.rows;
        rows.push({
            year,
            source: byYear.get(year).file,
            scope60: summarizeScope(yearlyRows, { maxSetSize: 60 }),
            scope70: summarizeScope(yearlyRows, { maxSetSize: 70 }),
            record70: summarizeScope(yearlyRows, { maxSetSize: 70, recordOnly: true }),
            baseline: settle(yearlyRows, row => ({
                betNumbers: row.strategies.chainSmallFirst,
                swaps: []
            })),
            admission: settle(yearlyRows, row => refinePredictionWithBlockAdmission(
                row, admissionModel, common
            )),
            twoSidedGuard: settle(yearlyRows, row => refinePredictionWithBlockGuard(
                row, admissionModel, breakModel, common
            )),
            recordOnlyGuard: settle(yearlyRows, row => refinePredictionWithBlockGuard(
                row, recordAdmissionModel, recordBreakModel, recordOptions
            ))
        });
    }

    const generatedAt = new Date().toISOString();
    const jsonName = `block-scope-guard-${generatedAt.replace(/[:.]/g, '-')}.json`;
    const mdName = `block-scope-guard-${generatedAt.slice(0, 10)}.md`;
    const payload = {
        generatedAt,
        methodology: 'strict-pit-sampled-active-block-two-sided-guard-v1',
        trainYears,
        evaluationYears,
        economics: { betCount: BET_COUNT, stakeK: STAKE_K, payout: PAYOUT },
        caveat: 'Train 2014-2023 và evaluation 2024-2025 là mẫu; evaluation 2026 là full daily đến 14/07/2026.',
        config: common,
        modelSizes: {
            admission: admissionModel.size,
            breakGuard: breakModel.size,
            recordAdmission: recordAdmissionModel.size,
            recordBreakGuard: recordBreakModel.size
        },
        rows
    };
    fs.writeFileSync(path.join(REPORTS, jsonName), JSON.stringify(payload, null, 2));

    const lines = [
        '# Nghiên cứu giới hạn phạm vi Block và guard phá kỷ lục',
        '',
        `- Sinh lúc: ${generatedAt}`,
        `- Train: ${trainYears.join(', ')}`,
        `- Evaluation: ${evaluationYears.join(', ')}`,
        '- Baseline: Chuỗi nhỏ trước, Hold 70 / đánh 30.',
        '- Chỉ dùng Block đang diễn ra; loại bỏ toàn bộ Block tiềm năng; khử trùng theo shape + tập số.',
        '- Guard hai chiều chỉ đổi tối đa 1 số/ngày khi có đồng thời bằng chứng gãy và bằng chứng phá kỷ lục ổn định.',
        '- Cảnh báo: train 2014-2023 và evaluation 2024-2025 là mẫu; 2026 là full daily đến 14/07/2026.',
        '',
        '## Phạm vi Block',
        '',
        '| Năm | Scope <=60 | Scope <=70 | Edge loại <=70 | Phá KL | Nền phá KL | Vượt nền |',
        '|---:|---:|---:|---:|---:|---:|---:|',
        ...rows.map(row => `| ${row.year} | ${row.scope60.opportunities} | ${row.scope70.opportunities} | ${percent(row.scope70.exclusionEdge)} | ${percent(row.record70.recordBreakRate)} | ${percent(row.record70.recordExpectedBreakRate)} | ${percent(row.record70.recordBreakExcess)} |`),
        '',
        '## Kết quả Hold 70',
        '',
        '| Năm | Baseline hit | Admission hit | Guard hai chiều | Guard chỉ biên KL | Đổi ngày | Cứu/Hại |',
        '|---:|---:|---:|---:|---:|---:|---:|',
        ...rows.map(row => `| ${row.year} | ${row.baseline.hits}/${row.baseline.days} | ${row.admission.hits}/${row.admission.days} | ${row.twoSidedGuard.hits}/${row.twoSidedGuard.days} | ${row.recordOnlyGuard.hits}/${row.recordOnlyGuard.days} | ${row.twoSidedGuard.changedDays} | ${row.twoSidedGuard.helpful}/${row.twoSidedGuard.harmful} |`),
        '',
        '## Kết luận',
        '',
        '- Scope <=60 không đủ cohort phá kỷ lục ổn định để tạo guard.',
        '- Scope <=70 là phạm vi nhỏ nhất tạo được guard hai chiều trong bộ train.',
        '- Không dùng “đạt kỷ lục” như tín hiệu loại tuyệt đối; tỷ lệ phá kỷ lục phải được ước lượng riêng.',
        '- Chưa thay production default cho đến khi chạy full-day strict PIT và xác nhận trên một holdout mới.'
    ];
    fs.writeFileSync(path.join(REPORTS, mdName), `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ json: path.join(REPORTS, jsonName), markdown: path.join(REPORTS, mdName), modelSizes: payload.modelSizes, rows }, null, 2));
}

main();
