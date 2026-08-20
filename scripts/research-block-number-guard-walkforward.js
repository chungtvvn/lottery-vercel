#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    fitStableBlockAdmissionModel,
    fitStableBlockBreakModel,
    refinePredictionWithBlockAdmission,
    refinePredictionWithBlockGuard
} = require('../lib/research/blockAdmissionCalibrator');

const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, 'reports');
const PAYOUT = 84;
const BET_COUNT = 30;
const STAKE_K = 1000;

const MODEL_CONFIGS = [
    { id: 'scope40', maxSetSize: 40, minYears: 5, minPositiveShare: 0.65, stabilityZ: 0.67, minEvidenceDays: 10 },
    { id: 'scope50', maxSetSize: 50, minYears: 5, minPositiveShare: 0.65, stabilityZ: 0.67, minEvidenceDays: 10 },
    { id: 'scope60', maxSetSize: 60, minYears: 5, minPositiveShare: 0.65, stabilityZ: 0.67, minEvidenceDays: 10 },
    { id: 'scope70', maxSetSize: 70, minYears: 5, minPositiveShare: 0.65, stabilityZ: 0.67, minEvidenceDays: 10 },
    { id: 'scope70Strict', maxSetSize: 70, minYears: 6, minPositiveShare: 0.7, stabilityZ: 1, minEvidenceDays: 15 },
    { id: 'scope70VeryStrict', maxSetSize: 70, minYears: 6, minPositiveShare: 0.8, stabilityZ: 1, minEvidenceDays: 20 },
    { id: 'rolling3Scope70', trainWindowYears: 3, maxSetSize: 70, minYears: 2, minPositiveShare: 0.67, stabilityZ: 0.67, minEvidenceDays: 10 },
    { id: 'rolling5Scope60', trainWindowYears: 5, maxSetSize: 60, minYears: 3, minPositiveShare: 0.6, stabilityZ: 0.67, minEvidenceDays: 10 },
    { id: 'rolling5Scope70', trainWindowYears: 5, maxSetSize: 70, minYears: 3, minPositiveShare: 0.6, stabilityZ: 0.67, minEvidenceDays: 10 },
    { id: 'rolling5Scope70Strict', trainWindowYears: 5, maxSetSize: 70, minYears: 4, minPositiveShare: 0.75, stabilityZ: 1, minEvidenceDays: 15 },
    { id: 'rolling7Scope70', trainWindowYears: 7, maxSetSize: 70, minYears: 5, minPositiveShare: 0.7, stabilityZ: 0.67, minEvidenceDays: 10 }
];

const GUARD_CONFIGS = [
    { id: 'guardShape1x1', mode: 'guard', minAdmissionShapes: 1, minProtectionShapes: 1, minCombinedScore: 0 },
    { id: 'guardShape1x1c01', mode: 'guard', minAdmissionShapes: 1, minProtectionShapes: 1, minCombinedScore: 0.01 },
    { id: 'guardShape1x1c02', mode: 'guard', minAdmissionShapes: 1, minProtectionShapes: 1, minCombinedScore: 0.02 },
    { id: 'guardShape2x1', mode: 'guard', minAdmissionShapes: 2, minProtectionShapes: 1, minCombinedScore: 0 },
    { id: 'guardShape1x2', mode: 'guard', minAdmissionShapes: 1, minProtectionShapes: 2, minCombinedScore: 0 },
    { id: 'guardShape2x2', mode: 'guard', minAdmissionShapes: 2, minProtectionShapes: 2, minCombinedScore: 0 },
    { id: 'admissionM000', mode: 'admission', minSwapMargin: 0 },
    { id: 'admissionM005', mode: 'admission', minSwapMargin: 0.005 },
    { id: 'admissionM010', mode: 'admission', minSwapMargin: 0.01 },
    { id: 'admissionM020', mode: 'admission', minSwapMargin: 0.02 }
];

function loadReportsByYear() {
    const byYear = new Map();
    for (const file of fs.readdirSync(REPORTS)) {
        if (!/^research_true_pit_strategies_.*\.json$/.test(file)) continue;
        let report;
        try {
            report = JSON.parse(fs.readFileSync(path.join(REPORTS, file), 'utf8'));
        } catch {
            continue;
        }
        const rows = report.rows || [];
        if (!rows.length || !rows[0].strategies?.chainSmallFirst) continue;
        const blockDiagnostics = rows.reduce((sum, row) => sum +
            (row.candidateDiagnostics || []).filter(candidate => candidate.family === 'block').length, 0);
        if (!blockDiagnostics) continue;
        const year = Number(rows[0].date.slice(0, 4));
        const current = byYear.get(year);
        if (
            !current ||
            rows.length > current.rows.length ||
            (rows.length === current.rows.length && blockDiagnostics > current.blockDiagnostics)
        ) {
            byYear.set(year, {
                year,
                file,
                rows,
                baselineCutoffDate: report.baselineCutoffDate,
                fingerprint: report.fingerprint,
                blockDiagnostics
            });
        }
    }
    return byYear;
}

function settle(rows, predictor) {
    let baselineHits = 0;
    let hits = 0;
    let changedDays = 0;
    let swaps = 0;
    let helpful = 0;
    let harmful = 0;
    let longestLoss = 0;
    let currentLoss = 0;
    for (const row of rows) {
        const baselineHit = row.strategies.chainSmallFirst.includes(row.actual);
        const prediction = predictor(row);
        const hit = prediction.betNumbers.includes(row.actual);
        baselineHits += Number(baselineHit);
        hits += Number(hit);
        changedDays += Number(prediction.swaps.length > 0);
        swaps += prediction.swaps.length;
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

function trainModels(byYear, endYear, modelConfig) {
    const groups = [];
    const windowYears = Math.max(0, Number(modelConfig.trainWindowYears || 0));
    const startYear = windowYears > 0 ? Math.max(2014, endYear - windowYears + 1) : 2014;
    for (let year = startYear; year <= endYear; year++) {
        const source = byYear.get(year);
        if (source) groups.push(source.rows);
    }
    const common = {
        baselineStrategy: 'chainSmallFirst',
        minDaysPerYear: 2,
        minConservativeEdge: 0,
        minConservativeLift: 0,
        swapLimit: 1,
        ...modelConfig
    };
    return {
        common,
        admission: fitStableBlockAdmissionModel(groups, common),
        breakGuard: fitStableBlockBreakModel(groups, common)
    };
}

function evaluate(byYear, year, models, guardConfig) {
    const source = byYear.get(year);
    return settle(source.rows, row => guardConfig.mode === 'admission'
        ? refinePredictionWithBlockAdmission(
            row,
            models.admission,
            { ...models.common, ...guardConfig }
        )
        : refinePredictionWithBlockGuard(
            row,
            models.admission,
            models.breakGuard,
            { ...models.common, ...guardConfig }
        ));
}

function compareValidation(left, right) {
    if (left.worstDelta !== right.worstDelta) return right.worstDelta - left.worstDelta;
    if (left.totalDelta !== right.totalDelta) return right.totalDelta - left.totalDelta;
    if (left.totalHarmful !== right.totalHarmful) return left.totalHarmful - right.totalHarmful;
    if (left.totalHelpful !== right.totalHelpful) return right.totalHelpful - left.totalHelpful;
    if (left.changedDays !== right.changedDays) return left.changedDays - right.changedDays;
    return left.id.localeCompare(right.id);
}

function percent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function main() {
    const byYear = loadReportsByYear();
    const requiredYears = Array.from({ length: 13 }, (_, index) => 2014 + index);
    const missing = requiredYears.filter(year => !byYear.has(year));
    if (missing.length) throw new Error(`Thieu report strict PIT co Block diagnostics: ${missing.join(', ')}`);

    const validationYears = [2020, 2021, 2022, 2023];
    const validation = [];
    for (const modelConfig of MODEL_CONFIGS) {
        for (const guardConfig of GUARD_CONFIGS) {
            const yearly = [];
            for (const year of validationYears) {
                const models = trainModels(byYear, year - 1, modelConfig);
                yearly.push({
                    year,
                    admissionModelSize: models.admission.size,
                    breakModelSize: models.breakGuard.size,
                    ...evaluate(byYear, year, models, guardConfig)
                });
            }
            validation.push({
                id: `${modelConfig.id}+${guardConfig.id}`,
                modelConfig,
                guardConfig,
                yearly,
                worstDelta: Math.min(...yearly.map(row => row.deltaHits)),
                totalDelta: yearly.reduce((sum, row) => sum + row.deltaHits, 0),
                totalHelpful: yearly.reduce((sum, row) => sum + row.helpful, 0),
                totalHarmful: yearly.reduce((sum, row) => sum + row.harmful, 0),
                changedDays: yearly.reduce((sum, row) => sum + row.changedDays, 0)
            });
        }
    }
    validation.sort(compareValidation);
    const activeValidation = validation
        .filter(row => row.changedDays >= 10)
        .sort(compareValidation);
    const selected = activeValidation[0] || validation.find(row => row.changedDays > 0) || validation[0];

    const evaluationYears = [2024, 2025, 2026];
    const evaluation = evaluationYears.map(year => {
        const yearlyModels = trainModels(byYear, year - 1, selected.modelConfig);
        return {
            year,
            source: byYear.get(year).file,
            baselineCutoffDate: byYear.get(year).baselineCutoffDate,
            admissionModelSize: yearlyModels.admission.size,
            breakModelSize: yearlyModels.breakGuard.size,
            ...evaluate(byYear, year, yearlyModels, selected.guardConfig)
        };
    });

    const generatedAt = new Date().toISOString();
    const stem = `block-number-guard-walkforward-${generatedAt.replace(/[:.]/g, '-')}`;
    const payload = {
        generatedAt,
        methodology: 'strict-pit-block-number-two-sided-walkforward-v1',
        economics: { payout: PAYOUT, betCount: BET_COUNT, stakeK: STAKE_K },
        trainingYears: 'Annual walk-forward: only reports ending at year-1; optional rolling 3/5/7-year windows.',
        validationYears,
        evaluationYears,
        selected,
        evaluation,
        validationRanking: validation,
        sources: Object.fromEntries(requiredYears.map(year => [year, {
            file: byYear.get(year).file,
            days: byYear.get(year).rows.length,
            baselineCutoffDate: byYear.get(year).baselineCutoffDate
        }]))
    };
    const jsonPath = path.join(REPORTS, `${stem}.json`);
    const markdownPath = path.join(REPORTS, `block-number-guard-walkforward-${generatedAt.slice(0, 10)}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));

    const lines = [
        '# Block guard hai chieu cap tung so',
        '',
        `- Cau hinh duoc chon: \`${selected.id}\`.`,
        '- Chon tham so bang walk-forward 2020-2023; khoa cong thuc truoc khi xem 2024-2026.',
        '- Moi nam chi fit cohort Block tu cac nam truoc do, dung moc 31/12; khong dung ket qua cua nam dang du doan.',
        '- Hold 70, danh 30, 1.000K/so, trung nhan 84.',
        '- Chi doi 1 so/ngay khi ca tin hieu loai va tin hieu bao ve deu dat nguong.',
        '',
        '## Validation walk-forward',
        '',
        '| Nam | Baseline | Guard | Chenh lech | Doi ngay | Cuu/Hai |',
        '|---:|---:|---:|---:|---:|---:|',
        ...selected.yearly.map(row => `| ${row.year} | ${row.baselineHits}/${row.days} | ${row.hits}/${row.days} | ${row.deltaHits} | ${row.changedDays} | ${row.helpful}/${row.harmful} |`),
        '',
        '## Evaluation khoa tham so',
        '',
        '| Nam | Baseline | Guard | Chenh lech | Hit rate | Profit | Thua dai nhat | Doi ngay | Cuu/Hai |',
        '|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...evaluation.map(row => `| ${row.year} | ${row.baselineHits}/${row.days} | ${row.hits}/${row.days} | ${row.deltaHits} | ${percent(row.hitRate)} | ${row.profitK.toLocaleString('vi-VN')}K | ${row.longestLoss} | ${row.changedDays} | ${row.helpful}/${row.harmful} |`),
        '',
        '## Quyet dinh',
        '',
        evaluation.every(row => row.deltaHits >= 0) && evaluation.some(row => row.deltaHits > 0)
            ? '- Co tin hieu cai thien qua cac regime; van can holdout moi truoc khi doi production default.'
            : '- Chua dat gate promotion; giu trong research, khong thay production default.'
    ];
    fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ jsonPath, markdownPath, selected, evaluation }, null, 2));
}

main();
