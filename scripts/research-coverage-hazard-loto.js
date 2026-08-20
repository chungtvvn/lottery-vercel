#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { buildPointInTimeCoverageRows } = require('../lib/research/numberCoverageHazard');
const {
    scoreLotoRow,
    trainLotoCoverageHazardModel
} = require('../lib/research/lotoCoverageHazardModel');

const TOP_COUNTS = [6, 7];
const L2_VALUES = [0.2, 1, 5];
const STAKE_K = 2200;
const PAYOUT_K = 8000;

function range(rows, start, end) {
    return rows.filter(row => row.date >= start && row.date <= end);
}

function longestStreak(rows, predicate) {
    let current = 0;
    let longest = 0;
    for (const row of rows) {
        current = predicate(row) ? current + 1 : 0;
        longest = Math.max(longest, current);
    }
    return longest;
}

function rankByField(row, field) {
    return row.samples.slice().sort((left, right) => Number(right[field] || 0) - Number(left[field] || 0) || left.number - right.number);
}

function predictorFor(config, model) {
    if (config.type === 'model') return row => scoreLotoRow(row, model).map(item => item.number);
    return row => rankByField(row, config.field).map(item => Number(item.number));
}

function settle(rows, predictor, topCount) {
    let hitDays = 0;
    let atLeast2Days = 0;
    let totalHits = 0;
    const daily = rows.map(row => {
        const numbers = predictor(row).slice(0, topCount);
        const selected = new Set(numbers);
        const hits = row.actualOccurrences.reduce((sum, number) => sum + Number(selected.has(Number(number))), 0);
        const profitK = hits * PAYOUT_K - topCount * STAKE_K;
        hitDays += Number(hits >= 1);
        atLeast2Days += Number(hits >= 2);
        totalHits += hits;
        return { date: row.date, numbers, hits, profitK };
    });
    const stakeK = rows.length * topCount * STAKE_K;
    const payoutK = totalHits * PAYOUT_K;
    return {
        days: rows.length,
        topCount,
        hitDays,
        atLeast2Days,
        totalHits,
        hitDayRate: hitDays / Math.max(1, rows.length),
        atLeast2Rate: atLeast2Days / Math.max(1, rows.length),
        averageHits: totalHits / Math.max(1, rows.length),
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: (payoutK - stakeK) / Math.max(1, stakeK),
        longestNoHit: longestStreak(daily, row => row.hits === 0),
        longestUnder2: longestStreak(daily, row => row.hits < 2),
        daily
    };
}

function withoutDaily(summary) {
    const { daily, ...result } = summary;
    return result;
}

function evaluate(rows, predictor, topCount) {
    const groups = new Map();
    for (const row of rows) {
        const year = row.date.slice(0, 4);
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push(row);
    }
    const summary = settle(rows, predictor, topCount);
    const annual = Object.fromEntries([...groups].map(([year, values]) => [year, withoutDaily(settle(values, predictor, topCount))]));
    return {
        ...withoutDaily(summary),
        annual,
        worstAnnualProfitK: Math.min(...Object.values(annual).map(value => value.profitK)),
        daily: summary.daily
    };
}

function pct(value) {
    return `${(100 * Number(value || 0)).toFixed(2)}%`;
}

function main() {
    const root = path.resolve(__dirname, '..');
    const rawData = JSON.parse(fs.readFileSync(path.join(root, 'lib/data/xsmb-2-digits.json'), 'utf8'));
    console.log('[Coverage-Loto] Build strict PIT features...');
    const rows = buildPointInTimeCoverageRows(rawData, 'loto').filter(row => row.date >= '2016-01-01');
    const trainRows = range(rows, '2016-01-01', '2020-12-31');
    const validationRows = range(rows, '2021-01-01', '2023-12-31');
    const fitRows = range(rows, '2016-01-01', '2023-12-31');
    const testRows = range(rows, '2024-01-01', '2025-12-31');
    const pre2026Rows = range(rows, '2016-01-01', '2025-12-31');
    const diagnosticRows = rows.filter(row => row.date >= '2026-01-01');
    const baseRate = trainRows.reduce((sum, row) => sum + new Set(row.actualNumbers).size, 0) / (trainRows.length * 100);
    const selectionModels = new Map();
    for (const l2 of L2_VALUES) {
        console.log(`[Coverage-Loto] selection train l2=${l2}`);
        selectionModels.set(l2, trainLotoCoverageHazardModel(trainRows, { epochs: 25, l2, baseRate }));
    }
    const configs = [
        { id: 'hazard-only', type: 'field', field: 'hazard' },
        { id: 'lifetime-frequency', type: 'field', field: 'lifetimeRate' },
        { id: 'recent30-frequency', type: 'field', field: 'rate30' },
        { id: 'recent365-frequency', type: 'field', field: 'rate365' },
        ...L2_VALUES.map(l2 => ({ id: `coverage-logistic-l2-${l2}`, type: 'model', l2 }))
    ];
    const selected = {};
    for (const topCount of TOP_COUNTS) {
        const candidates = configs.map(config => ({
            config,
            validation: evaluate(validationRows, predictorFor(config, selectionModels.get(config.l2)), topCount)
        }));
        candidates.sort((left, right) =>
            right.validation.worstAnnualProfitK - left.validation.worstAnnualProfitK
            || right.validation.profitK - left.validation.profitK
            || right.validation.atLeast2Rate - left.validation.atLeast2Rate
            || left.config.id.localeCompare(right.config.id)
        );
        selected[topCount] = { selected: candidates[0], candidates };
    }
    const neededL2 = [...new Set(Object.values(selected).map(item => item.selected.config.l2).filter(Number.isFinite))];
    const testModels = new Map();
    const diagnosticModels = new Map();
    for (const l2 of neededL2) {
        testModels.set(l2, trainLotoCoverageHazardModel(fitRows, { epochs: 25, l2, baseRate }));
        diagnosticModels.set(l2, trainLotoCoverageHazardModel(pre2026Rows, { epochs: 25, l2, baseRate }));
    }
    const results = {};
    for (const topCount of TOP_COUNTS) {
        const selection = selected[topCount];
        const config = selection.selected.config;
        const test = evaluate(testRows, predictorFor(config, testModels.get(config.l2)), topCount);
        const diagnostic2026 = evaluate(diagnosticRows, predictorFor(config, diagnosticModels.get(config.l2)), topCount);
        results[topCount] = {
            selectedConfig: config,
            validation: selection.selected.validation,
            test,
            diagnostic2026,
            topValidationCandidates: selection.candidates.map(candidate => ({
                config: candidate.config,
                validation: withoutDaily(candidate.validation)
            }))
        };
    }
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-number-frequency-point-in-time-v1',
        decision: 'research-only-do-not-replace-chain-baseline',
        split: {
            train: { range: '2016-01-01..2020-12-31', days: trainRows.length },
            validation: { range: '2021-01-01..2023-12-31', days: validationRows.length },
            test: { range: '2024-01-01..2025-12-31', days: testRows.length },
            diagnostic2026: { range: `${diagnosticRows[0].date}..${diagnosticRows.at(-1).date}`, days: diagnosticRows.length }
        },
        economics: { stakePerNumberK: STAKE_K, payoutPerHitK: PAYOUT_K },
        design: {
            scope: 'Standalone Lô frequency/hazard ranking; no chain candidate enters this experiment.',
            labels: 'Daily presence is used for training; settlement counts all 27 prize-position occurrences.',
            selection: 'Worst validation-year profit, then total validation profit; Top 6 and Top 7 selected independently.'
        },
        baseDailyPresenceRate: baseRate,
        results
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(root, 'reports', `coverage-hazard-loto-${stamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const lines = Object.entries(results).map(([top, item]) =>
        `| Top ${top} | ${item.selectedConfig.id} | ${pct(item.validation.hitDayRate)} | ${item.validation.profitK.toLocaleString('vi-VN')}K | ${pct(item.test.hitDayRate)} | ${item.test.profitK.toLocaleString('vi-VN')}K | ${pct(item.diagnostic2026.hitDayRate)} | ${item.diagnostic2026.profitK.toLocaleString('vi-VN')}K |`
    );
    const md = `# Coverage/hazard độc lập cho Lô\n\n`
        + `Mô hình dùng feature strict PIT của 100 số, không dùng chain. Train theo daily presence; profit được kết toán theo mọi lần xuất hiện trong 27 vị trí.\n\n`
        + `| Dàn | Cấu hình chọn trên validation | Hit validation | Profit validation | Hit test | Profit test | Hit 2026 | Profit 2026 |\n|---|---|---:|---:|---:|---:|---:|---:|\n`
        + `${lines.join('\n')}\n\n`
        + `Đây là kiểm tra feature độc lập. Chỉ được ghép với RRF production sau khi có nguồn dàn Lô strict PIT đủ dài trên đúng cùng ngày.\n`;
    fs.writeFileSync(mdPath, md);
    console.log(md);
    console.log(`Reports: ${jsonPath}\n         ${mdPath}`);
}

if (require.main === module) main();

module.exports = { evaluate, predictorFor, settle };
