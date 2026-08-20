#!/usr/bin/env node
'use strict';

/*
 * Research-only test of a daily single-method selector among five methods.
 * The five candidates and selector configuration are chosen on 2016-2023;
 * 2024-2025 and 2026 are reported as independent calendar regimes.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'reports', 'strict_pit_all_methods_2016_2026.json');
const BET_COUNT = 30;
const PAYOUT = 84;
const STAKE_K = 1000;
const BREAK_EVEN = BET_COUNT / PAYOUT;

function wilsonLower(wins, total, z = 1.645) {
    if (!total) return 0;
    const rate = wins / total;
    const z2 = z * z;
    return Math.max(0, ((rate + z2 / (2 * total)) - z * Math.sqrt(
        (rate * (1 - rate) + z2 / (4 * total)) / total
    )) / (1 + z2 / total));
}

function loadRows() {
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const rows = index.sourceReports.flatMap(source => {
        const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', source.file), 'utf8'));
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1' || Number(report.options?.dateStep) !== 1) {
            throw new Error(`${source.file} không phải strict PIT từng ngày.`);
        }
        return report.rows || [];
    }).sort((left, right) => left.date.localeCompare(right.date));
    const ids = index.fixed.methodIds;
    return { rows: rows.filter(row => ids.every(id => row.strategies?.[id]?.length === BET_COUNT)), ids };
}

function interval(rows, start, end) {
    return rows.filter(row => row.date >= start && row.date <= end);
}

function summarize(selections, calendarDays) {
    let wins = 0;
    let lossRun = 0;
    let longestLoss = 0;
    let winRun = 0;
    let longestWin = 0;
    const methodUse = {};
    for (const row of selections) {
        wins += Number(row.hit);
        methodUse[row.id] = (methodUse[row.id] || 0) + 1;
        winRun = row.hit ? winRun + 1 : 0;
        lossRun = row.hit ? 0 : lossRun + 1;
        longestWin = Math.max(longestWin, winRun);
        longestLoss = Math.max(longestLoss, lossRun);
    }
    const stakeK = selections.length * BET_COUNT * STAKE_K;
    const profitK = wins * PAYOUT * STAKE_K - stakeK;
    return {
        calendarDays,
        playedDays: selections.length,
        wins,
        hitRate: selections.length ? wins / selections.length : 0,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin,
        longestLoss,
        methodUse
    };
}

function fixedTopFive(rows, ids, trainingEnd) {
    const training = rows.filter(row => row.date <= trainingEnd);
    return ids.map(id => {
        const wins = training.filter(row => row.strategies[id].includes(row.actual)).length;
        return { id, wins, profitK: wins * PAYOUT * STAKE_K - training.length * BET_COUNT * STAKE_K };
    }).sort((left, right) => right.profitK - left.profitK || right.wins - left.wins || left.id.localeCompare(right.id))
        .slice(0, 5).map(row => row.id);
}

function rankFromHistory(rows, index, ids, config) {
    return ids.map(id => {
        let wins = 0;
        let total = 0;
        for (let cursor = index - 1; cursor >= 0 && total < config.window; cursor--) {
            const numbers = rows[cursor].strategies[id];
            if (!numbers) continue;
            wins += Number(numbers.includes(rows[cursor].actual));
            total++;
        }
        const posterior = (wins + config.alpha) / (total + config.alpha + config.beta);
        return { id, wins, total, posterior, lower: wilsonLower(wins, total) };
    }).filter(row => row.total >= config.window)
        .sort((left, right) => right[config.metric] - left[config.metric]
            || right.posterior - left.posterior || left.id.localeCompare(right.id));
}

function run(rows, ids, config, range) {
    const selections = [];
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (row.date < range.start || row.date > range.end) continue;
        const chosen = rankFromHistory(rows, index, ids, config)[0];
        if (!chosen || (config.gate && chosen.lower <= BREAK_EVEN)) continue;
        selections.push({
            date: row.date,
            actual: row.actual,
            id: chosen.id,
            hit: row.strategies[chosen.id].includes(row.actual),
            posterior: chosen.posterior,
            lower: chosen.lower
        });
    }
    return summarize(selections, interval(rows, range.start, range.end).length);
}

function oracleAtLeastOne(rows, ids, range) {
    const values = interval(rows, range.start, range.end);
    const hits = values.map(row => ids.filter(id => row.strategies[id].includes(row.actual)));
    const unionSizes = values.map(row => new Set(ids.flatMap(id => row.strategies[id])).size);
    return {
        calendarDays: values.length,
        atLeastOneWinDays: hits.filter(row => row.length).length,
        atLeastOneWinRate: values.length ? hits.filter(row => row.length).length / values.length : 0,
        hitMethodCountDistribution: hits.reduce((result, hit) => {
            result[hit.length] = (result[hit.length] || 0) + 1;
            return result;
        }, {}),
        averageUnionSize: unionSizes.reduce((sum, value) => sum + value, 0) / Math.max(1, unionSizes.length),
        unionBreakEvenRate: unionSizes.reduce((sum, value) => sum + value, 0) / Math.max(1, unionSizes.length) / PAYOUT
    };
}

function compact(summary) { return summary; }

function main() {
    const { rows, ids } = loadRows();
    const ranges = {
        train: { start: '2016-01-01', end: '2023-12-31' },
        validation: { start: '2024-01-01', end: '2025-12-31' },
        holdout: { start: '2026-01-01', end: '2026-07-10' }
    };
    const selectedIds = fixedTopFive(rows, ids, ranges.train.end);
    const configs = [30, 60, 90, 180].flatMap(window => [
        { id: `posterior-${window}`, window, metric: 'posterior', alpha: 9, beta: 21, gate: false },
        { id: `wilson-${window}`, window, metric: 'lower', alpha: 9, beta: 21, gate: false },
        { id: `wilson-gated-${window}`, window, metric: 'lower', alpha: 9, beta: 21, gate: true }
    ]);
    const candidates = configs.map(config => ({
        config,
        train: run(rows, selectedIds, config, ranges.train),
        validation: run(rows, selectedIds, config, ranges.validation),
        holdout: run(rows, selectedIds, config, ranges.holdout)
    }));
    const selected = candidates.slice().sort((left, right) =>
        right.train.profitK - left.train.profitK || right.train.hitRate - left.train.hitRate ||
        right.train.playedDays - left.train.playedDays
    )[0];
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        methodology: {
            candidates: 'Top 5 được cố định chỉ từ profit strict PIT 2016-2023.',
            selector: 'Mỗi ngày chọn đúng một trong năm phương pháp từ kết quả đã kết toán trước ngày đó.',
            metrics: 'Beta(9,21) posterior hoặc cận dưới Wilson 90% một phía theo cửa sổ 30/60/90/180.',
            economics: `Dàn 30 số, ăn ${PAYOUT}; hòa vốn ${(BREAK_EVEN * 100).toFixed(2)}%.`,
            oracle: 'Ít nhất một phương pháp trúng là trần hậu nghiệm, không phải một bộ chọn có thể dùng trước kết quả.'
        },
        ranges,
        selectedIds,
        oracle: Object.fromEntries(Object.entries(ranges).map(([key, range]) => [key, oracleAtLeastOne(rows, selectedIds, range)])),
        candidates: candidates.map(candidate => ({ config: candidate.config, train: compact(candidate.train), validation: compact(candidate.validation), holdout: compact(candidate.holdout) })),
        trainSelected: { config: selected.config, train: compact(selected.train), validation: compact(selected.validation), holdout: compact(selected.holdout) },
        decision: selected.validation.profitK > 0 && selected.holdout.profitK > 0
            ? 'candidate-clears-two-independent-regimes-needs-separate-audit'
            : 'no-single-method-selector-clears-independent-profit-gates'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = path.join(ROOT, 'reports', `five-method-daily-selector-${stamp}.json`);
    const markdownFile = jsonFile.replace(/\.json$/, '.md');
    const pct = value => `${(100 * Number(value || 0)).toFixed(2)}%`;
    const lines = [
        '# Bộ chọn một phương pháp trong Top 5 strict PIT', '',
        `- Top 5 cố định từ 2016-2023: ${selectedIds.join(', ')}.`,
        '- “Ít nhất một phương pháp trúng” là benchmark oracle hậu nghiệm, không dùng làm khuyến nghị trước ngày quay.', '',
        '| Giai đoạn | Oracle ít nhất một trúng | Union TB số | Hòa vốn union |',
        '|---|---:|---:|---:|',
        ...Object.entries(report.oracle).map(([key, value]) => `| ${key} | ${value.atLeastOneWinDays}/${value.calendarDays} (${pct(value.atLeastOneWinRate)}) | ${value.averageUnionSize.toFixed(2)} | ${pct(value.unionBreakEvenRate)} |`), '',
        '## Cấu hình chọn từ train', '',
        `- ${selected.config.id}; kết luận: ${report.decision}.`,
        '| Giai đoạn | Ngày đánh | Trúng | Tỷ lệ | Profit | ROI | W/L dài nhất |',
        '|---|---:|---:|---:|---:|---:|---:|',
        ...['train', 'validation', 'holdout'].map(key => {
            const value = selected[key];
            return `| ${key} | ${value.playedDays}/${value.calendarDays} | ${value.wins} | ${pct(value.hitRate)} | ${Math.round(value.profitK).toLocaleString('vi-VN')}K | ${pct(value.roi)} | ${value.longestWin}/${value.longestLoss} |`;
        }), '',
        '## Tất cả cấu hình', '',
        '| Cấu hình | Validation profit | Holdout profit | Holdout hit | Holdout ngày đánh |',
        '|---|---:|---:|---:|---:|',
        ...report.candidates.map(item => `| ${item.config.id} | ${Math.round(item.validation.profitK).toLocaleString('vi-VN')}K | ${Math.round(item.holdout.profitK).toLocaleString('vi-VN')}K | ${pct(item.holdout.hitRate)} | ${item.holdout.playedDays} |`)
    ];
    fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(markdownFile, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ jsonFile, markdownFile, selectedIds, trainSelected: report.trainSelected, oracle: report.oracle, decision: report.decision }, null, 2));
}

if (require.main === module) main();

module.exports = { fixedTopFive, rankFromHistory, run, oracleAtLeastOne, wilsonLower };
