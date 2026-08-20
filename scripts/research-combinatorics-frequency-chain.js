#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const {
    binomialCoefficient,
    binomialTail,
    combinationHitProbability,
    evaluateRows,
    monteCarloBinomial,
    predictTopK,
    probabilityAtLeastHits,
    standardizeRows,
    trainSoftmax
} = require('../lib/research/combinatoricsFrequencyChain');

const ROOT = path.join(__dirname, '..');
const STRICT_INDEX = path.join(ROOT, 'reports', 'strict_pit_all_methods_2016_2026.json');
const POPULATION = 100;
const STAKE_K = 1000;
const PAYOUT = 84;
const COUNTS = [10, 20, 30, 40];
const MONTE_CARLO_PATHS = 20000;

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function dayNumber(value) {
    return Math.floor(new Date(`${value}T12:00:00Z`).getTime() / 86400000);
}

function formatPercent(value, digits = 2) {
    return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

function formatMoney(value) {
    return `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}K`;
}

function compact(summary) {
    const { details, ...result } = summary;
    return result;
}

function loadStrictRows() {
    if (!fs.existsSync(STRICT_INDEX)) throw new Error(`Thiếu strict index: ${STRICT_INDEX}`);
    const index = JSON.parse(fs.readFileSync(STRICT_INDEX, 'utf8'));
    if (index.policy !== 'fast-history-excluded') {
        throw new Error(`Strict index không loại fast-history: ${index.policy}`);
    }
    const rows = [];
    for (const source of index.sourceReports || []) {
        const filename = path.join(ROOT, 'reports', source.file);
        const report = JSON.parse(fs.readFileSync(filename, 'utf8'));
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
            throw new Error(`${source.file} không phải strict-prefix-point-in-time-v1.`);
        }
        rows.push(...(report.rows || []));
    }
    rows.sort((left, right) => left.date.localeCompare(right.date));
    if (new Set(rows.map(row => row.date)).size !== rows.length) throw new Error('Strict rows trùng ngày.');
    return { rows, index };
}

function commonFixedMethods(rows) {
    const common = new Set(Object.keys(rows[0]?.strategies || {}));
    for (const row of rows) {
        for (const method of [...common]) {
            const numbers = row.strategies?.[method];
            if (!Array.isArray(numbers) || numbers.length !== 30 || new Set(numbers).size !== 30) common.delete(method);
        }
    }
    return [...common].filter(method => !method.startsWith('deParallel')).sort();
}

function posteriorLogLift(count, total, alpha) {
    const posterior = (Number(count || 0) + alpha / POPULATION) / Math.max(1, Number(total || 0) + alpha);
    return Math.log(Math.max(1e-12, posterior / (1 / POPULATION)));
}

function buildFeatureRows(rawRows, strictRows, methods) {
    const raw = rawRows
        .map(row => ({ date: isoDate(row.date), actual: Number(row.special) }))
        .filter(row => row.date && Number.isInteger(row.actual) && row.actual >= 0 && row.actual < 100)
        .sort((left, right) => left.date.localeCompare(right.date));
    const fullCounts = new Array(100).fill(0);
    const counts90 = new Array(100).fill(0);
    const counts365 = new Array(100).fill(0);
    const queue90 = [];
    const queue365 = [];
    const lastSeen = new Array(100).fill(null);
    let rawIndex = 0;
    let total = 0;
    const featureNames = [
        ...methods.map(method => `method:${method}`),
        'chain:consensus',
        'chain:consensusSquared',
        'frequency:lifetimePosteriorLogLift',
        'frequency:365dPosteriorLogLift',
        'frequency:90dPosteriorLogLift',
        'frequency:gapRatio'
    ];
    const output = [];

    for (const row of strictRows) {
        const predictionDay = dayNumber(row.date);
        while (rawIndex < raw.length && raw[rawIndex].date < row.date) {
            const draw = raw[rawIndex++];
            const drawDay = dayNumber(draw.date);
            fullCounts[draw.actual]++;
            counts90[draw.actual]++;
            counts365[draw.actual]++;
            queue90.push({ ...draw, day: drawDay });
            queue365.push({ ...draw, day: drawDay });
            lastSeen[draw.actual] = drawDay;
            total++;
        }
        while (queue90.length && queue90[0].day < predictionDay - 90) {
            counts90[queue90.shift().actual]--;
        }
        while (queue365.length && queue365[0].day < predictionDay - 365) {
            counts365[queue365.shift().actual]--;
        }
        const methodSets = methods.map(method => new Set(row.strategies[method]));
        const numbers = Array.from({ length: 100 }, (_, number) => {
            const flags = methodSets.map(set => Number(set.has(number)));
            const consensus = flags.reduce((sum, value) => sum + value, 0) / Math.max(1, methods.length);
            const gap = lastSeen[number] === null ? 365 : Math.max(0, predictionDay - lastSeen[number]);
            return {
                number,
                features: [
                    ...flags,
                    consensus,
                    consensus * consensus,
                    posteriorLogLift(fullCounts[number], total, 1000),
                    posteriorLogLift(counts365[number], queue365.length, 300),
                    posteriorLogLift(counts90[number], queue90.length, 100),
                    Math.min(4, gap / 100)
                ]
            };
        });
        output.push({ date: row.date, actual: Number(row.actual), strategies: row.strategies, numbers });
    }
    return { rows: output, featureNames, rawFirstDate: raw[0]?.date, rawLatestDate: raw.at(-1)?.date };
}

function splitRows(rows) {
    return {
        train: rows.filter(row => row.date < '2021-01-01'),
        validation: rows.filter(row => row.date >= '2021-01-01' && row.date < '2024-01-01'),
        test: rows.filter(row => row.date >= '2024-01-01' && row.date < '2026-01-01'),
        holdout: rows.filter(row => row.date >= '2026-01-01')
    };
}

function rankByRawFeature(row, score) {
    return row.numbers
        .map(item => ({ number: item.number, score: score(item) }))
        .sort((left, right) => right.score - left.score || left.number - right.number);
}

function evaluateSelector(rows, selector, count) {
    return evaluateRows(rows, row => selector(row, count), {
        count,
        stakeK: STAKE_K,
        payoutMultiplier: PAYOUT
    });
}

function summarizeYears(summary) {
    const groups = new Map();
    for (const row of summary.details || []) {
        const year = row.date.slice(0, 4);
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push(row);
    }
    return [...groups.entries()].map(([year, rows]) => {
        const hits = rows.filter(row => row.hit).length;
        const count = rows[0]?.numbers.length || 0;
        const stakeK = rows.length * count * STAKE_K;
        const payoutK = hits * PAYOUT * STAKE_K;
        return {
            year,
            days: rows.length,
            hits,
            hitRate: hits / rows.length,
            profitK: payoutK - stakeK,
            roi: (payoutK - stakeK) / stakeK
        };
    });
}

function analyzeNumberFrequencies(rawRows) {
    const rows = rawRows.slice().sort((left, right) => isoDate(left.date).localeCompare(isoDate(right.date)));
    const fields = Object.keys(rows[0] || {}).filter(key => key !== 'date');
    const specialCounts = new Array(100).fill(0);
    const allPositionCounts = new Array(100).fill(0);
    let allPositionTotal = 0;
    for (const row of rows) {
        const special = Number(row.special);
        if (Number.isInteger(special) && special >= 0 && special < 100) specialCounts[special]++;
        for (const field of fields) {
            const number = Number(row[field]);
            if (!Number.isInteger(number) || number < 0 || number >= 100) continue;
            allPositionCounts[number]++;
            allPositionTotal++;
        }
    }
    const summarize = (counts, total) => {
        const expected = total / 100;
        const rowsByNumber = counts.map((count, number) => ({
            number: String(number).padStart(2, '0'),
            count,
            frequency: count / total,
            relativeToUniform: count / expected
        }));
        const chiSquare = rowsByNumber.reduce((sum, row) => {
            const difference = row.count - expected;
            return sum + difference * difference / expected;
        }, 0);
        return {
            total,
            expectedPerNumber: expected,
            chiSquare,
            top10: rowsByNumber.slice().sort((a, b) => b.count - a.count).slice(0, 10),
            bottom10: rowsByNumber.slice().sort((a, b) => a.count - b.count).slice(0, 10)
        };
    };
    return {
        firstDate: isoDate(rows[0]?.date),
        latestDate: isoDate(rows.at(-1)?.date),
        days: rows.length,
        special: summarize(specialCounts, rows.length),
        all27Positions: summarize(allPositionCounts, allPositionTotal)
    };
}

function modelSelector(weights) {
    return (row, count) => predictTopK(row, weights, count);
}

function baselineSelector(method) {
    return (row, count) => (row.strategies[method] || []).slice(0, count).sort((a, b) => a - b);
}

function consensusSelector(row, count) {
    const consensusIndex = row.numbers[0].features.length - 6;
    return rankByRawFeature(row, item => item.features[consensusIndex]).slice(0, count).map(item => item.number).sort((a, b) => a - b);
}

function frequencySelector(row, count) {
    const length = row.numbers[0].features.length;
    return rankByRawFeature(row, item =>
        item.features[length - 4] * 0.15 +
        item.features[length - 3] * 0.50 +
        item.features[length - 2] * 0.35
    ).slice(0, count).map(item => item.number).sort((a, b) => a - b);
}

function nullAudit(summary, count, seed) {
    const probability = combinationHitProbability(100, count);
    return {
        combinatorialProbability: probability,
        breakEvenProbability: count / PAYOUT,
        exactUpperTailPValue: binomialTail(summary.days, summary.hits, probability),
        monteCarlo: monteCarloBinomial({
            trials: summary.days,
            paths: MONTE_CARLO_PATHS,
            probability,
            observedHits: summary.hits,
            stakePerDay: count * STAKE_K,
            payoutPerHit: PAYOUT * STAKE_K,
            seed
        })
    };
}

function buildMarkdown(report) {
    const lines = [
        '# Tổ hợp + tần suất Bayesian + chuỗi strict PIT',
        '',
        `- Raw R2: ${report.data.rawFirstDate} -> ${report.data.rawLatestDate}, ${report.data.rawDays.toLocaleString('vi-VN')} ngày.`,
        `- Chuỗi strict PIT: ${report.data.strictFirstDate} -> ${report.data.strictLatestDate}, ${report.data.strictDays.toLocaleString('vi-VN')} ngày.`,
        `- Train ${report.splits.train.join(' -> ')}, validation ${report.splits.validation.join(' -> ')}, test ${report.splits.test.join(' -> ')}, holdout ${report.splits.holdout.join(' -> ')}.`,
        '- Tần suất của mỗi ngày chỉ dùng các kết quả trước ngày dự đoán; 2024-2025 và 2026 không dùng để chọn hyperparameter.',
        '',
        '## Xác suất tổ hợp nền',
        '',
        '| Dàn Đề | Công thức | P(trúng) | Hòa vốn ăn 84 |',
        '|---:|---|---:|---:|'
    ];
    for (const row of report.combinatorics.de) {
        lines.push(`| ${row.selectedCount} | C(99,${row.selectedCount - 1}) / C(100,${row.selectedCount}) | ${formatPercent(row.hitProbability)} | ${formatPercent(row.breakEvenProbability)} |`);
    }
    lines.push(
        '',
        'Với Lô, giả sử 27 vị trí độc lập và mỗi vị trí đều trên 00-99:',
        '',
        '| Số đánh | P(>=1 hit) | P(>=2 hit) |',
        '|---:|---:|---:|'
    );
    for (const row of report.combinatorics.loto) {
        lines.push(`| ${row.selectedCount} | ${formatPercent(row.atLeastOne)} | ${formatPercent(row.atLeastTwo)} |`);
    }
    lines.push('', '## Kết quả mô hình hybrid đã khóa', '');
    for (const period of ['test', 'holdout']) {
        lines.push(`### ${period === 'test' ? 'Test 2024-2025' : 'Holdout 2026'}`, '');
        lines.push('| Dàn | Hit | Profit | ROI | P-value so với nền | MC P(profit>0) nền | Thua dài nhất |');
        lines.push('|---:|---:|---:|---:|---:|---:|---:|');
        for (const row of report.results.hybrid[period]) {
            lines.push(`| ${row.count} | ${row.summary.hits}/${row.summary.days} (${formatPercent(row.summary.hitRate)}) | ${formatMoney(row.summary.profitK)} | ${formatPercent(row.summary.roi)} | ${formatPercent(row.nullAudit.exactUpperTailPValue)} | ${formatPercent(row.nullAudit.monteCarlo.probabilityPositiveProfit)} | ${row.summary.longestLoss} |`);
        }
        lines.push('');
    }
    lines.push(
        '## Đối chứng Top 30',
        '',
        '| Giai đoạn | Hybrid | Đồng thuận chuỗi | Tần suất Bayesian | Baseline strict tốt nhất |',
        '|---|---:|---:|---:|---:|'
    );
    for (const period of ['test', 'holdout']) {
        const row = report.results.comparison[period];
        lines.push(`| ${period} | ${formatPercent(row.hybrid.hitRate)}; ${formatMoney(row.hybrid.profitK)} | ${formatPercent(row.consensus.hitRate)}; ${formatMoney(row.consensus.profitK)} | ${formatPercent(row.frequency.hitRate)}; ${formatMoney(row.frequency.profitK)} | ${row.bestBaseline.id}: ${formatPercent(row.bestBaseline.hitRate)}; ${formatMoney(row.bestBaseline.profitK)} |`);
    }
    lines.push(
        '',
        '## Kết luận',
        '',
        `- Promotion: **${report.promotion.promote ? 'CÓ' : 'KHÔNG'}**. ${report.promotion.reason}`,
        '- Monte Carlo chỉ mô tả phân phối dưới giả thuyết nền; nó không tạo thêm bằng chứng dự báo.',
        '- Tần suất lịch sử được co về 1/100 bằng Dirichlet prior để tránh coi số nóng/lạnh ngắn hạn là quy luật chắc chắn.',
        '- Kết quả lịch sử có lãi không bảo đảm tương lai; chỉ phương pháp vượt cả test 2024-2025 và holdout 2026 mới đủ điều kiện xem xét.'
    );
    return `${lines.join('\n')}\n`;
}

async function main() {
    const { rows: strictRows, index } = loadStrictRows();
    await lotteryService.loadRawData();
    const rawRows = lotteryService.getRawData() || [];
    const methods = commonFixedMethods(strictRows);
    const features = buildFeatureRows(rawRows, strictRows, methods);
    const split = splitRows(features.rows);
    if (!split.train.length || !split.validation.length || !split.test.length || !split.holdout.length) {
        throw new Error('Không đủ bốn giai đoạn train/validation/test/holdout.');
    }

    const trainStandardized = standardizeRows(split.train);
    const validationStandardized = standardizeRows(split.validation, trainStandardized.standardizer).rows;
    const configs = [];
    for (const epochs of [2, 5, 10]) {
        for (const learningRate of [0.005, 0.015]) {
            for (const l2 of [0.001, 0.01]) configs.push({ epochs, learningRate, l2 });
        }
    }
    console.log(`[Hybrid] Tuning ${configs.length} cấu hình trên ${split.train.length} train / ${split.validation.length} validation rows...`);
    const tuning = configs.map(config => {
        const weights = trainSoftmax(trainStandardized.rows, config);
        const summary = evaluateSelector(validationStandardized, modelSelector(weights), 30);
        return { config, summary: compact(summary) };
    }).sort((left, right) =>
        right.summary.profitK - left.summary.profitK ||
        right.summary.hitRate - left.summary.hitRate ||
        left.summary.longestLoss - right.summary.longestLoss
    );
    const selectedConfig = tuning[0].config;
    const refitRaw = [...split.train, ...split.validation].sort((left, right) => left.date.localeCompare(right.date));
    const refitStandardized = standardizeRows(refitRaw);
    const testStandardized = standardizeRows(split.test, refitStandardized.standardizer).rows;
    const holdoutStandardized = standardizeRows(split.holdout, refitStandardized.standardizer).rows;
    const weights = trainSoftmax(refitStandardized.rows, selectedConfig);

    const hybrid = { test: [], holdout: [] };
    for (const [period, rows] of [['test', testStandardized], ['holdout', holdoutStandardized]]) {
        for (const count of COUNTS) {
            const summary = evaluateSelector(rows, modelSelector(weights), count);
            hybrid[period].push({
                count,
                summary: compact(summary),
                yearly: summarizeYears(summary),
                nullAudit: nullAudit(summary, count, 20260718 + count + (period === 'holdout' ? 1000 : 0))
            });
        }
    }

    const comparison = {};
    for (const [period, rawPeriodRows, standardizedRows] of [
        ['test', split.test, testStandardized],
        ['holdout', split.holdout, holdoutStandardized]
    ]) {
        const baselines = methods.map(method => ({
            id: method,
            ...compact(evaluateSelector(rawPeriodRows, baselineSelector(method), 30))
        })).sort((left, right) => right.profitK - left.profitK || right.hitRate - left.hitRate);
        comparison[period] = {
            hybrid: compact(evaluateSelector(standardizedRows, modelSelector(weights), 30)),
            consensus: compact(evaluateSelector(rawPeriodRows, consensusSelector, 30)),
            frequency: compact(evaluateSelector(rawPeriodRows, frequencySelector, 30)),
            bestBaseline: baselines[0],
            baselines
        };
    }

    const hybridTest30 = hybrid.test.find(row => row.count === 30);
    const hybridHoldout30 = hybrid.holdout.find(row => row.count === 30);
    const promote = hybridTest30.summary.profitK > 0 && hybridHoldout30.summary.profitK > 0 &&
        hybridTest30.summary.hitRate > 30 / PAYOUT && hybridHoldout30.summary.hitRate > 30 / PAYOUT;
    const frequencyAnalysis = analyzeNumberFrequencies(rawRows);
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'combinatorics-frequency-chain-strict-pit-v1',
        data: {
            rawFirstDate: features.rawFirstDate,
            rawLatestDate: features.rawLatestDate,
            rawDays: rawRows.length,
            strictFirstDate: strictRows[0].date,
            strictLatestDate: strictRows.at(-1).date,
            strictDays: strictRows.length,
            strictPolicy: index.policy,
            methods
        },
        splits: {
            train: [split.train[0].date, split.train.at(-1).date],
            validation: [split.validation[0].date, split.validation.at(-1).date],
            test: [split.test[0].date, split.test.at(-1).date],
            holdout: [split.holdout[0].date, split.holdout.at(-1).date]
        },
        economics: { population: 100, stakeK: STAKE_K, payoutMultiplier: PAYOUT },
        combinatorics: {
            de: COUNTS.map(selectedCount => ({
                selectedCount,
                combinations: binomialCoefficient(100, selectedCount).toString(),
                winningCombinations: binomialCoefficient(99, selectedCount - 1).toString(),
                hitProbability: combinationHitProbability(100, selectedCount),
                breakEvenProbability: selectedCount / PAYOUT
            })),
            loto: [3, 6, 10, 14, 20].map(selectedCount => ({
                selectedCount,
                atLeastOne: probabilityAtLeastHits(selectedCount, 27, 1),
                atLeastTwo: probabilityAtLeastHits(selectedCount, 27, 2)
            }))
        },
        frequencyAnalysis,
        model: {
            featureNames: features.featureNames,
            selectedConfig,
            tuning: tuning.slice(0, 12),
            weights: features.featureNames.map((feature, index) => ({ feature, weight: weights[index] }))
                .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))
        },
        results: { hybrid, comparison },
        promotion: {
            promote,
            reason: promote
                ? 'Hybrid vượt hòa vốn và có profit dương ở cả test 2024-2025 lẫn holdout 2026.'
                : 'Hybrid chưa đồng thời vượt hòa vốn và có profit dương ở cả hai chế độ độc lập; giữ ở research.'
        }
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(ROOT, 'reports', `combinatorics-frequency-chain-${timestamp}.json`);
    const markdownPath = path.join(ROOT, 'reports', `combinatorics-frequency-chain-${timestamp}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(markdownPath, buildMarkdown(report));
    console.log(JSON.stringify({
        jsonPath,
        markdownPath,
        selectedConfig,
        promotion: report.promotion,
        test: hybridTest30,
        holdout: hybridHoldout30,
        comparison
    }, null, 2));
}

main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
