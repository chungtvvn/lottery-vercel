#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { buildPointInTimeCoverageRows } = require('../lib/research/numberCoverageHazard');
const {
    buildFusionRows,
    refineFusionPrediction,
    trainFusionModel
} = require('../lib/research/chainCoverageFusion');
const { settle, withoutDaily } = require('./research-fixed30-method-fusion');

const ROOT = path.resolve(__dirname, '..');
const SPARSE_SOURCES = {
    2014: 'research_true_pit_strategies_2026-07-18T05-07-58-141Z.json',
    2015: 'research_true_pit_strategies_2026-07-18T05-10-27-615Z.json',
    2016: 'research_true_pit_strategies_2026-07-18T05-13-50-218Z.json',
    2017: 'research_true_pit_strategies_2026-07-18T05-17-18-007Z.json',
    2018: 'research_true_pit_strategies_2026-07-18T05-20-47-671Z.json',
    2019: 'research_true_pit_strategies_2026-07-18T05-24-29-803Z.json',
    2020: 'research_true_pit_strategies_2026-07-18T05-28-05-368Z.json',
    2021: 'research_true_pit_strategies_2026-07-18T05-32-38-749Z.json',
    2022: 'research_true_pit_strategies_2026-07-18T05-37-44-713Z.json',
    2023: 'research_true_pit_strategies_2026-07-18T05-42-58-943Z.json'
};
const FULL_SOURCES = [
    'research_true_pit_strategies_2026-07-07T02-46-07-493Z.json',
    'research_true_pit_strategies_2026-07-07T03-27-03-079Z.json',
    'research_true_pit_strategies_2026-07-06T08-16-57-490Z.json',
    'research_true_pit_strategies_2026-07-16T15-48-19-598Z.json'
];
// chainSmallFirst is the only unchanged 30-number baseline present in every
// historical snapshot. Do not synthesize missing strategies for comparison.
const BASELINES = ['chainSmallFirst'];
const L2_VALUES = [0.2, 1, 5];
const SWAP_LIMITS = [1, 2, 3, 5];

function readReport(file) {
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', file), 'utf8'));
    if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
        throw new Error(`${file} khong phai strict-prefix-point-in-time-v1`);
    }
    return report;
}

function uniqueRows(rows) {
    const byDate = new Map();
    for (const row of rows) byDate.set(row.date, row);
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function loadSourceRows() {
    const sparse = uniqueRows(Object.values(SPARSE_SOURCES).flatMap(file => readReport(file).rows || []));
    const full = uniqueRows(FULL_SOURCES.flatMap(file => readReport(file).rows || []));
    return { sparse, full };
}

function range(rows, start, end) {
    return rows.filter(row => row.date >= start && row.date <= end);
}

function baselinePredictor(method) {
    return row => row.strategies[method].map(Number);
}

function candidatePredictor(method, model, config) {
    return row => refineFusionPrediction(row, row.strategies[method], model, {
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
        daily: candidate.daily
    };
}

function selectConfig(validationRows, method, models) {
    const baseline = baselinePredictor(method);
    const candidates = [{
        config: { id: `${method}-no-change`, l2: 0, swapLimit: 0, minMargin: 0 },
        ...evaluate(validationRows, baseline, baseline)
    }];
    for (const l2 of L2_VALUES) {
        for (const swapLimit of SWAP_LIMITS) {
            const config = {
                id: `${method}-chain-coverage-l2-${l2}-s${swapLimit}`,
                l2,
                swapLimit,
                minMargin: 0
            };
            candidates.push({
                config,
                ...evaluate(validationRows, candidatePredictor(method, models.get(l2), config), baseline)
            });
        }
    }
    candidates.sort((left, right) =>
        right.minAnnualWinDelta - left.minAnnualWinDelta ||
        right.totalWinDelta - left.totalWinDelta ||
        right.candidate.profitK - left.candidate.profitK ||
        left.config.swapLimit - right.config.swapLimit ||
        left.config.id.localeCompare(right.config.id)
    );
    return { selected: candidates[0], candidates };
}

function recordGroup(candidate) {
    const state = String(candidate.state || '');
    const record = String(candidate.recordState || '');
    if (state === 'potential' && record === 'never-pattern') return 'potential-never-formed';
    if (state === 'potential' && ['at-record', 'super-record'].includes(record)) return 'potential-record';
    if (state === 'active' && record === 'super-record') return 'active-super-record';
    if (state === 'active' && record === 'at-record') return 'active-at-record';
    if (state === 'active' && record === 'near-record') return 'active-near-record';
    return null;
}

function summarizeRecordEvidence(rows) {
    const groups = new Map();
    for (const row of rows) {
        const seen = new Set();
        for (const candidate of row.candidateDiagnostics || []) {
            const group = recordGroup(candidate);
            if (!group || !Array.isArray(candidate.numbers) || !candidate.numbers.length) continue;
            const numbers = [...new Set(candidate.numbers.map(Number))].sort((a, b) => a - b);
            const signature = `${row.date}|${group}|${candidate.family}|${candidate.pattern}|${numbers.join(',')}`;
            if (seen.has(signature)) continue;
            seen.add(signature);
            if (!groups.has(group)) groups.set(group, {
                samples: 0,
                correct: 0,
                expectedCorrect: 0,
                days: new Map()
            });
            const target = groups.get(group);
            target.samples++;
            const correct = Number(!numbers.includes(Number(row.actual)));
            const expectedCorrect = 1 - numbers.length / 100;
            target.correct += correct;
            target.expectedCorrect += expectedCorrect;
            if (!target.days.has(row.date)) target.days.set(row.date, { samples: 0, correct: 0, expectedCorrect: 0 });
            const day = target.days.get(row.date);
            day.samples++;
            day.correct += correct;
            day.expectedCorrect += expectedCorrect;
        }
    }
    return Object.fromEntries([...groups].map(([group, value]) => {
        const dailyEdges = [...value.days.values()].map(day =>
            (day.correct - day.expectedCorrect) / Math.max(1, day.samples)
        );
        const dailyEdgeMean = dailyEdges.reduce((sum, edge) => sum + edge, 0) / Math.max(1, dailyEdges.length);
        const variance = dailyEdges.length > 1
            ? dailyEdges.reduce((sum, edge) => sum + (edge - dailyEdgeMean) ** 2, 0) / (dailyEdges.length - 1)
            : 0;
        const standardError = Math.sqrt(variance / Math.max(1, dailyEdges.length));
        return [group, {
            days: value.days.size,
            samples: value.samples,
            correctRate: value.samples ? value.correct / value.samples : 0,
            expectedCorrectRate: value.samples ? value.expectedCorrect / value.samples : 0,
            edge: value.samples ? (value.correct - value.expectedCorrect) / value.samples : 0,
            dailyEdgeMean,
            dailyEdge95Low: dailyEdgeMean - 1.96 * standardError,
            dailyEdge95High: dailyEdgeMean + 1.96 * standardError
        }];
    }));
}

function pct(value) {
    return `${(100 * Number(value || 0)).toFixed(2)}%`;
}

function main() {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'lib/data/xsmb-2-digits.json'), 'utf8'));
    const coverageByDate = new Map(buildPointInTimeCoverageRows(raw, 'de').map(row => [row.date, row.samples]));
    const sources = loadSourceRows();
    const sparse = buildFusionRows(sources.sparse, coverageByDate);
    const full = buildFusionRows(sources.full, coverageByDate);
    const train = range(sparse, '2014-01-01', '2020-12-31');
    const validation = range(sparse, '2021-01-01', '2023-12-31');
    const fit = range(sparse, '2014-01-01', '2023-12-31');
    const test = range(full, '2024-01-01', '2025-12-31');
    const diagnostic2026 = full.filter(row => row.date >= '2026-01-01');
    console.log(`[Fusion-DE] train=${train.length}, validation=${validation.length}, test=${test.length}, 2026=${diagnostic2026.length}`);
    const selectionModels = new Map();
    for (const l2 of L2_VALUES) {
        console.log(`[Fusion-DE] train selection l2=${l2}`);
        selectionModels.set(l2, trainFusionModel(train, { epochs: 35, l2 }));
    }
    const selection = Object.fromEntries(BASELINES.map(method => [method, selectConfig(validation, method, selectionModels)]));
    const neededL2 = [...new Set(Object.values(selection).map(value => value.selected.config.l2).filter(Boolean))];
    const testModels = new Map();
    const diagnosticModels = new Map();
    for (const l2 of neededL2) {
        testModels.set(l2, trainFusionModel(fit, { epochs: 35, l2 }));
        diagnosticModels.set(l2, trainFusionModel([...fit, ...test], { epochs: 35, l2 }));
    }
    const results = {};
    for (const method of BASELINES) {
        const chosen = selection[method].selected;
        const config = chosen.config;
        const baseline = baselinePredictor(method);
        const testPredictor = config.swapLimit
            ? candidatePredictor(method, testModels.get(config.l2), config)
            : baseline;
        const diagnosticPredictor = config.swapLimit
            ? candidatePredictor(method, diagnosticModels.get(config.l2), config)
            : baseline;
        const testResult = evaluate(test, testPredictor, baseline);
        const diagnosticResult = evaluate(diagnostic2026, diagnosticPredictor, baseline);
        const promote = config.swapLimit > 0 &&
            chosen.minAnnualWinDelta >= 0 && chosen.totalWinDelta > 0 &&
            testResult.minAnnualWinDelta >= 0 && testResult.totalWinDelta > 0 &&
            diagnosticResult.minAnnualWinDelta >= 0 && diagnosticResult.totalWinDelta >= 0 &&
            diagnosticResult.candidate.longestLoss <= Math.ceil(diagnosticResult.baseline.longestLoss * 1.2);
        results[method] = {
            decision: promote ? 'promote-candidate' : 'do-not-promote',
            selectedConfig: config,
            validation: {
                baseline: chosen.baseline,
                candidate: chosen.candidate,
                annual: chosen.annual,
                minAnnualWinDelta: chosen.minAnnualWinDelta,
                totalWinDelta: chosen.totalWinDelta
            },
            test: testResult,
            diagnostic2026: diagnosticResult,
            topValidationCandidates: selection[method].candidates.slice(0, 8).map(value => ({
                config: value.config,
                minAnnualWinDelta: value.minAnnualWinDelta,
                totalWinDelta: value.totalWinDelta,
                annual: value.annual
            }))
        };
    }
    const recordValidation = summarizeRecordEvidence(range(sources.sparse, '2021-01-01', '2023-12-31'));
    const recordTestReports = [
        readReport('research_true_pit_strategies_2026-07-18T08-07-35-994Z.json'),
        readReport('research_true_pit_strategies_2026-07-18T08-15-14-027Z.json')
    ];
    const recordTest = summarizeRecordEvidence(recordTestReports.flatMap(report => report.rows || []));
    const record2026 = summarizeRecordEvidence(readReport('research_true_pit_strategies_2026-07-16T17-18-22-555Z.json').rows || []);
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-chain-coverage-fusion-v1',
        decision: Object.values(results).some(value => value.decision === 'promote-candidate')
            ? 'candidate-passes-gates'
            : 'research-only-no-production-change',
        split: {
            train: { range: '2014-2020 sampled strict PIT', days: train.length },
            validation: { range: '2021-2023 sampled strict PIT', days: validation.length },
            test: { range: '2024-2025 full daily strict PIT', days: test.length },
            diagnostic2026: { range: `${diagnostic2026[0]?.date}..${diagnostic2026.at(-1)?.date}`, days: diagnostic2026.length }
        },
        design: {
            fixedBetCount: 30,
            stakeK: 1000,
            payoutMultiplier: 84,
            candidateEvidence: 'Family/pattern/set deduplicated active, potential, Tier and posterior strength summaries.',
            numberEvidence: 'Strict PIT coverage, gap, hazard and current-cycle state.',
            methodEvidence: 'Pre-result membership in five existing chain/risk strategies.',
            selection: 'Worst validation-year hit delta first; no-change eligible; 2024-2025 and 2026 untouched during selection.'
        },
        recordEvidence: {
            validation: recordValidation,
            testSample: recordTest,
            diagnostic2026: record2026
        },
        results
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(ROOT, 'reports', `chain-coverage-fusion-de-${stamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const rows = Object.entries(results).map(([method, item]) =>
        `| ${method} | ${item.selectedConfig.id} | ${item.validation.totalWinDelta >= 0 ? '+' : ''}${item.validation.totalWinDelta} | ${item.test.totalWinDelta >= 0 ? '+' : ''}${item.test.totalWinDelta} | ${item.diagnostic2026.totalWinDelta >= 0 ? '+' : ''}${item.diagnostic2026.totalWinDelta} | ${pct(item.test.candidate.hitRate)} | ${pct(item.diagnostic2026.candidate.hitRate)} | ${item.decision} |`
    );
    const recordRows = Object.entries(recordTest).map(([group, item]) =>
        `| ${group} | ${item.days} | ${item.samples} | ${pct(item.correctRate)} | ${pct(item.expectedCorrectRate)} | ${item.edge >= 0 ? '+' : ''}${pct(item.edge)} | ${pct(item.dailyEdge95Low)} .. ${pct(item.dailyEdge95High)} |`
    );
    const md = `# Fusion dang chuoi + coverage/gap/hazard cho De\n\n`
        + `Cau hinh chon tren validation mau 2021-2023, test tren toan bo ngay 2024-2025, 2026 chi dung chan doan.\n\n`
        + `| Baseline | Cau hinh | Delta validation | Delta test | Delta 2026 | Hit test | Hit 2026 | Quyet dinh |\n|---|---|---:|---:|---:|---:|---:|---|\n`
        + `${rows.join('\n')}\n\n`
        + `## Tin hieu ky luc/chua tung hinh thanh tren mau test 2024-2025\n\n`
        + `Correct la candidate loai dung ket qua; expected da dieu chinh theo kich thuoc tap so. Edge duong moi la bang chung co gia tri.\n\n`
        + `| Nhom | Ngay | Mau candidate | Correct | Expected | Edge | CI95 edge theo ngay |\n|---|---:|---:|---:|---:|---:|---:|\n`
        + `${recordRows.join('\n')}\n`;
    fs.writeFileSync(mdPath, md);
    console.log(md);
    console.log(`Reports: ${jsonPath}\n         ${mdPath}`);
}

if (require.main === module) main();

module.exports = {
    evaluate,
    loadSourceRows,
    selectConfig,
    summarizeRecordEvidence
};
