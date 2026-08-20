#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
    loadRows,
    settle,
    withoutDaily
} = require('./research-fixed30-method-fusion');
const { buildPointInTimeCoverageRows } = require('../lib/research/numberCoverageHazard');
const {
    refineNumbers,
    trainCoverageHazardModel
} = require('../lib/research/coverageHazardModel');
const { pairedComparison } = require('./research-walkforward-membership-model');

const BASELINES = ['chainSmallFirst', 'chainBlockFirst', 'activeOnlyAvgRisk'];
const L2_VALUES = [0.2, 1, 5];
const SWAP_LIMITS = [1, 2, 3, 5];
const MIN_MARGINS = [0, 0.00005];

function range(rows, start, end) {
    return rows.filter(row => row.date >= start && row.date <= end);
}

function baselinePredictor(method) {
    return row => row.strategies[method].map(Number);
}

function candidatePredictor(method, model, config) {
    return row => refineNumbers(row, row.strategies[method], model, {
        swapLimit: config.swapLimit,
        minMargin: config.minMargin,
        salt: config.id
    }).numbers;
}

function annual(rows, predictor, baseline) {
    const groups = new Map();
    for (const row of rows) {
        const year = row.date.slice(0, 4);
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push(row);
    }
    return Object.fromEntries([...groups].map(([year, values]) => {
        const candidate = settle(values, predictor);
        const base = settle(values, baseline);
        return [year, {
            baseline: withoutDaily(base),
            candidate: withoutDaily(candidate),
            winDelta: candidate.wins - base.wins
        }];
    }));
}

function evaluate(rows, predictor, baseline) {
    const base = settle(rows, baseline);
    const candidate = settle(rows, predictor, true);
    const byYear = annual(rows, predictor, baseline);
    return {
        baseline: withoutDaily(base),
        candidate: withoutDaily(candidate),
        annual: byYear,
        minAnnualWinDelta: Math.min(...Object.values(byYear).map(value => value.winDelta)),
        totalWinDelta: candidate.wins - base.wins,
        paired: pairedComparison(rows, baseline, predictor),
        daily: candidate.daily
    };
}

function selectConfig(validationRows, baselineMethod, models) {
    const baseline = baselinePredictor(baselineMethod);
    const candidates = [{
        config: { id: `${baselineMethod}-no-change`, l2: 0, swapLimit: 0, minMargin: 0 },
        ...evaluate(validationRows, baseline, baseline)
    }];
    for (const l2 of L2_VALUES) {
        for (const swapLimit of SWAP_LIMITS) {
            for (const minMargin of MIN_MARGINS) {
                const config = {
                    id: `${baselineMethod}-coverage-l2-${l2}-s${swapLimit}-m${minMargin}`,
                    l2,
                    swapLimit,
                    minMargin
                };
                const predictor = candidatePredictor(baselineMethod, models.get(l2), config);
                candidates.push({ config, ...evaluate(validationRows, predictor, baseline) });
            }
        }
    }
    candidates.sort((left, right) =>
        right.minAnnualWinDelta - left.minAnnualWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || right.candidate.profitK - left.candidate.profitK
        || left.config.swapLimit - right.config.swapLimit
        || left.config.l2 - right.config.l2
        || left.config.id.localeCompare(right.config.id)
    );
    return { selected: candidates[0], candidates };
}

function pct(value) {
    return `${(100 * Number(value || 0)).toFixed(2)}%`;
}

function main() {
    const root = path.resolve(__dirname, '..');
    const rawData = JSON.parse(fs.readFileSync(path.join(root, 'lib/data/xsmb-2-digits.json'), 'utf8'));
    console.log('[Coverage-DE] Build strict PIT coverage features...');
    const coverageByDate = new Map(buildPointInTimeCoverageRows(rawData, 'de').map(row => [row.date, row.samples]));
    const loaded = loadRows(root);
    const rows = loaded.rows.map(row => ({ ...row, coverageSamples: coverageByDate.get(row.date) }))
        .filter(row => Array.isArray(row.coverageSamples) && row.coverageSamples.length === 100);
    const trainRows = range(rows, '2016-01-01', '2020-12-31');
    const validationRows = range(rows, '2021-01-01', '2023-12-31');
    const fitRows = range(rows, '2016-01-01', '2023-12-31');
    const testRows = range(rows, '2024-01-01', '2025-12-31');
    const pre2026Rows = range(rows, '2016-01-01', '2025-12-31');
    const diagnosticRows = rows.filter(row => row.date >= '2026-01-01');
    const selectionModels = new Map();
    for (const l2 of L2_VALUES) {
        console.log(`[Coverage-DE] selection train l2=${l2} (${trainRows.length} ngày)`);
        selectionModels.set(l2, trainCoverageHazardModel(trainRows, { epochs: 28, l2 }));
    }
    const selectedByBaseline = Object.fromEntries(BASELINES.map(method => [method, selectConfig(validationRows, method, selectionModels)]));
    const neededL2 = [...new Set(Object.values(selectedByBaseline).map(item => item.selected.config.l2).filter(Boolean))];
    const testModels = new Map();
    const diagnosticModels = new Map();
    for (const l2 of neededL2) {
        console.log(`[Coverage-DE] refit test/diagnostic l2=${l2}`);
        testModels.set(l2, trainCoverageHazardModel(fitRows, { epochs: 28, l2 }));
        diagnosticModels.set(l2, trainCoverageHazardModel(pre2026Rows, { epochs: 28, l2 }));
    }
    const results = {};
    for (const method of BASELINES) {
        const selection = selectedByBaseline[method];
        const config = selection.selected.config;
        const baseline = baselinePredictor(method);
        const testPredictor = config.swapLimit
            ? candidatePredictor(method, testModels.get(config.l2), config)
            : baseline;
        const diagnosticPredictor = config.swapLimit
            ? candidatePredictor(method, diagnosticModels.get(config.l2), config)
            : baseline;
        const test = evaluate(testRows, testPredictor, baseline);
        const diagnostic2026 = evaluate(diagnosticRows, diagnosticPredictor, baseline);
        const promote = config.swapLimit > 0
            && selection.selected.minAnnualWinDelta >= 0
            && selection.selected.totalWinDelta > 0
            && test.minAnnualWinDelta >= 0
            && test.totalWinDelta > 0
            && diagnostic2026.minAnnualWinDelta >= 0
            && diagnostic2026.totalWinDelta >= 0;
        results[method] = {
            decision: promote ? 'promote-candidate' : 'do-not-promote',
            selectedConfig: config,
            validation: {
                baseline: selection.selected.baseline,
                candidate: selection.selected.candidate,
                annual: selection.selected.annual,
                minAnnualWinDelta: selection.selected.minAnnualWinDelta,
                totalWinDelta: selection.selected.totalWinDelta,
                paired: selection.selected.paired
            },
            test,
            diagnostic2026,
            topValidationCandidates: selection.candidates.slice(0, 8).map(item => ({
                config: item.config,
                minAnnualWinDelta: item.minAnnualWinDelta,
                totalWinDelta: item.totalWinDelta,
                annual: item.annual,
                paired: item.paired
            }))
        };
    }
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-prefix-point-in-time-v1',
        featureVersion: 'coverage-hazard-v1',
        split: {
            train: { range: '2016-01-01..2020-12-31', days: trainRows.length },
            validation: { range: '2021-01-01..2023-12-31', days: validationRows.length },
            test: { range: '2024-01-01..2025-12-31', days: testRows.length },
            diagnostic2026: { range: `${diagnosticRows[0].date}..${diagnosticRows.at(-1).date}`, days: diagnosticRows.length }
        },
        design: {
            fixedBetCount: 30,
            stakeK: 1000,
            payoutMultiplier: 84,
            baselines: BASELINES,
            selectionRule: 'Maximize worst validation-year hit delta, then total hit delta; no-change is an eligible configuration.',
            features: 'Strict PIT number frequency, current gap, empirical discrete hazard, and independent coverage-cycle state.',
            guardrail: 'Swap at most 1-5 numbers around each baseline; same dates and economics.'
        },
        sources: loaded.sources,
        results
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(root, 'reports', `coverage-hazard-de-${stamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const lines = Object.entries(results).map(([method, item]) =>
        `| ${method} | ${item.selectedConfig.id} | ${item.validation.totalWinDelta >= 0 ? '+' : ''}${item.validation.totalWinDelta} | ${item.test.totalWinDelta >= 0 ? '+' : ''}${item.test.totalWinDelta} | ${item.diagnostic2026.totalWinDelta >= 0 ? '+' : ''}${item.diagnostic2026.totalWinDelta} | ${pct(item.diagnostic2026.candidate.hitRate)} | ${item.diagnostic2026.candidate.profitK.toLocaleString('vi-VN')}K | ${item.decision} |`
    );
    const md = `# Coverage/hazard kết hợp phương pháp Đề\n\n`
        + `Feature được tính trước kết quả mỗi ngày. Cấu hình chọn trên 2021-2023; test 2024-2025; 2026 chỉ đánh giá sau khi khóa cấu hình.\n\n`
        + `| Baseline | Cấu hình | Δ validation | Δ test | Δ 2026 | Hit 2026 | Profit 2026 | Quyết định |\n|---|---|---:|---:|---:|---:|---:|---|\n`
        + `${lines.join('\n')}\n\n`
        + `Chỉ promote khi candidate không giảm ở bất kỳ năm validation/test nào và không giảm trong 2026.\n`;
    fs.writeFileSync(mdPath, md);
    console.log(md);
    console.log(`Reports: ${jsonPath}\n         ${mdPath}`);
}

if (require.main === module) main();

module.exports = {
    annual,
    evaluate,
    selectConfig
};
