#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildDailyLedgerRow } = require('../lib/research/chainProtectionLedger');
const {
    evaluate,
    fitModel
} = require('../lib/research/chainProtectionCalibrator');

const ROOT = path.join(__dirname, '..');
const INPUTS = [
    'reports/research_true_pit_strategies_2026-07-18T05-07-58-141Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-10-27-615Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-13-50-218Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-17-18-007Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-20-47-671Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-24-29-803Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-28-05-368Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-32-38-749Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-37-44-713Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-42-58-943Z.json',
    'reports/research_true_pit_strategies_2026-07-18T08-07-35-994Z.json',
    'reports/research_true_pit_strategies_2026-07-18T08-15-14-027Z.json',
    'reports/research_true_pit_strategies_2026-07-16T17-18-22-555Z.json'
];

function loadOpportunities() {
    const byDate = new Map();
    for (const input of INPUTS) {
        const report = JSON.parse(fs.readFileSync(path.join(ROOT, input), 'utf8'));
        for (const row of report.rows || []) {
            if (!Array.isArray(row.candidateDiagnostics)) continue;
            const ledger = buildDailyLedgerRow(row);
            byDate.set(row.date, ledger.opportunities.map(opportunity => ({
                ...opportunity,
                date: row.date
            })));
        }
    }
    return [...byDate.values()].flat().sort((left, right) => left.date.localeCompare(right.date));
}

function splitRows(rows) {
    return {
        train: rows.filter(row => row.date >= '2014-01-01' && row.date <= '2020-12-31'),
        validation: rows.filter(row => row.date >= '2021-01-01' && row.date <= '2023-12-31'),
        test: rows.filter(row => row.date >= '2024-01-01' && row.date <= '2025-12-31'),
        holdout: rows.filter(row => row.date >= '2026-01-01')
    };
}

function selectionScore(evaluation) {
    if (evaluation.protectedTrials < 100) return -Infinity;
    const lift = evaluation.protectedEventRate - evaluation.protectedExpectedRate;
    return lift * Math.sqrt(evaluation.protectedTrials) + evaluation.logLossImprovement * 5;
}

function selectConfig(train, validation) {
    const grid = [];
    for (const minEffectiveTrials of [8, 12, 18, 25, 35, 50]) {
        for (const minAbsoluteLift of [0.0025, 0.005, 0.01, 0.015, 0.025]) {
            const options = { minEffectiveTrials, minAbsoluteLift };
            const model = fitModel(train, options);
            const result = evaluate(validation, model);
            grid.push({ options, result, score: selectionScore(result) });
        }
    }
    grid.sort((left, right) => right.score - left.score);
    return { selected: grid[0], grid };
}

function percent(value) {
    return `${(Number(value || 0) * 100).toFixed(3)}%`;
}

function metricRow(label, result) {
    return `| ${label} | ${result.rows.toLocaleString('vi-VN')} | ${result.brierModel.toFixed(6)} | ${result.brierBaseline.toFixed(6)} | ${result.logLossModel.toFixed(6)} | ${result.logLossBaseline.toFixed(6)} | ${result.protectedTrials.toLocaleString('vi-VN')} | ${percent(result.protectedEventRate)} | ${percent(result.protectedExpectedRate)} |`;
}

function main() {
    const rows = loadOpportunities();
    const split = splitRows(rows);
    const selection = selectConfig(split.train, split.validation);
    const model = fitModel(split.train, selection.selected.options);
    const evaluations = Object.fromEntries(
        Object.entries(split).map(([key, values]) => [key, evaluate(values, model)])
    );
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: 'hierarchical-log-odds-family-day-balanced-v1',
        selectedOptions: selection.selected.options,
        selectedOnValidationOnly: true,
        splitRanges: {
            train: '2014-2020 sampled step 10',
            validation: '2021-2023 sampled step 10',
            test: '2024-2025 sampled step 10 untouched',
            holdout: '2026 full daily untouched'
        },
        evaluations,
        topValidationGrid: selection.grid.slice(0, 10),
        cohortCount: model.cohorts.size
    };
    const lines = [
        '# Hiệu chỉnh xác suất cảnh báo bảo vệ chuỗi',
        '',
        `- Cấu hình được chọn chỉ trên validation: minEffectiveTrials=${report.selectedOptions.minEffectiveTrials}, minAbsoluteLift=${percent(report.selectedOptions.minAbsoluteLift)}.`,
        '- Train dùng 2014-2020; test 2024-2025 và holdout 2026 không tham gia chọn tham số.',
        '- Mỗi family trong một ngày có tổng trọng số 1 để giảm ảo giác cỡ mẫu do hàng trăm chuỗi tương quan.',
        '- Xác suất mô hình là log-odds lift phân cấp so với xác suất nền `setSize/100`.',
        '',
        '| Giai đoạn | Candidate | Brier model | Brier nền | Log loss model | Log loss nền | Tín hiệu protect | Event protect | Nền protect |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
        metricRow('Train 2014-2020', evaluations.train),
        metricRow('Validation 2021-2023', evaluations.validation),
        metricRow('Test 2024-2025', evaluations.test),
        metricRow('Holdout 2026', evaluations.holdout),
        '',
        '## Diễn giải',
        '',
        '- `Event protect` lớn hơn `Nền protect` mới cho thấy cohort cảnh báo chứa kết quả thực tế nhiều hơn độ rộng tập số vốn có.',
        '- Nếu Brier/log loss không tốt hơn nền trên test và holdout, cảnh báo chưa đủ để thay đổi dàn Hold70 production.',
        '- Đây mới là calibration cấp chuỗi; bước kế tiếp mới tổng hợp sang cấp số và giới hạn số lượt swap.',
        ''
    ];
    const base = path.join(ROOT, 'reports', `chain-protection-calibration-${new Date().toISOString().slice(0, 10)}`);
    fs.writeFileSync(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(`${base}.md`, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({
        report: `${base}.md`,
        selectedOptions: report.selectedOptions,
        evaluations
    }, null, 2));
}

main();
