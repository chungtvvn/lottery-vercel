#!/usr/bin/env node
'use strict';

/*
 * Research-only walk-forward learner for exclusion evidence.
 *
 * For D it ranks 00..99 using model state settled through D-1, keeps the 30
 * highest estimated occurrence probabilities as the bet set and therefore
 * excludes the remaining 70.  Selection parameters are frozen before the two
 * later evaluation periods.  This is deliberately not wired to a UI/API.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    createState,
    rankRow,
    updateState
} = require('../lib/research/onlineMembershipRanker');

const ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'reports', 'strict_pit_all_methods_2016_2026.json');
const BET_COUNT = 30;
const STAKE_K = 1000;
const PAYOUT = 84;
const SELECT_START = '2022-01-01';
const SELECT_END = '2023-12-31';
const TEST_START = '2024-01-01';
const TEST_END = '2025-12-31';
const HOLDOUT_START = '2026-01-01';

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadRows() {
    const indexBytes = fs.readFileSync(INDEX_FILE);
    const index = JSON.parse(indexBytes);
    const strategyIds = index.fixed?.methodIds || [];
    const rows = [];
    for (const source of index.sourceReports || []) {
        const report = readJson(path.join(ROOT, 'reports', source.file));
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1'
            || report.options?.dateStep !== 1) {
            throw new Error(`${source.file} không phải strict PIT từng ngày.`);
        }
        for (const row of report.rows || []) {
            if (!strategyIds.every(id => Array.isArray(row.strategies?.[id])
                && row.strategies[id].length === BET_COUNT)) continue;
            rows.push({
                date: row.date,
                actual: Number(row.actual),
                strategies: Object.fromEntries(strategyIds.map(id => [id, row.strategies[id].map(Number)]))
            });
        }
    }
    rows.sort((left, right) => left.date.localeCompare(right.date));
    return { rows, strategyIds, sourceSha256: crypto.createHash('sha256').update(indexBytes).digest('hex') };
}

function summary(rows) {
    const wins = rows.filter(row => row.hit).length;
    const stakeK = rows.length * BET_COUNT * STAKE_K;
    const profitK = wins * PAYOUT * STAKE_K - stakeK;
    let last = null;
    let run = 0;
    let longestWin = 0;
    let longestLoss = 0;
    for (const row of rows) {
        const state = row.hit ? 'win' : 'loss';
        run = state === last ? run + 1 : 1;
        last = state;
        if (state === 'win') longestWin = Math.max(longestWin, run);
        else longestLoss = Math.max(longestLoss, run);
    }
    return {
        days: rows.length,
        wins,
        losses: rows.length - wins,
        hitRate: rows.length ? wins / rows.length : 0,
        exclusionErrorRate: rows.length ? 1 - wins / rows.length : 0,
        breakEvenHitRate: BET_COUNT / PAYOUT,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin,
        longestLoss
    };
}

function ranges(rows) {
    return {
        selection: rows.filter(row => row.date >= SELECT_START && row.date <= SELECT_END),
        test: rows.filter(row => row.date >= TEST_START && row.date <= TEST_END),
        holdout: rows.filter(row => row.date >= HOLDOUT_START)
    };
}

function runOnlineModel(rows, strategyIds, config) {
    const state = createState(strategyIds, config);
    const output = [];
    for (const row of rows) {
        // `rankRow` sees only model state from earlier settlements.
        const ranking = rankRow(row, strategyIds, state, config);
        const betNumbers = ranking.slice(0, BET_COUNT).map(item => item.number);
        const hit = betNumbers.includes(row.actual);
        output.push({
            date: row.date,
            actual: row.actual,
            hit,
            betNumbers,
            excludedActual: !hit,
            topScore: ranking[0]?.score ?? null,
            cutoffScore: ranking[BET_COUNT - 1]?.score ?? null
        });
        // The observed actual is available only after the prediction was fixed.
        updateState(state, ranking, row.actual, config);
    }
    return output;
}

function baseline(rows) {
    return rows.map(row => {
        const betNumbers = row.strategies.chainSmallFirst.map(Number);
        return {
            date: row.date,
            actual: row.actual,
            hit: betNumbers.includes(row.actual),
            betNumbers,
            excludedActual: !betNumbers.includes(row.actual)
        };
    });
}

function byPeriod(daily) {
    const partitions = ranges(daily);
    return Object.fromEntries(Object.entries(partitions).map(([key, values]) => [key, summary(values)]));
}

function annual(daily) {
    const grouped = new Map();
    for (const row of daily) {
        const year = row.date.slice(0, 4);
        if (!grouped.has(year)) grouped.set(year, []);
        grouped.get(year).push(row);
    }
    return Object.fromEntries([...grouped].map(([year, values]) => [year, summary(values)]));
}

function candidateConfigs() {
    const result = [];
    for (const learningRate of [0.002, 0.005, 0.01]) {
        for (const l2 of [0.0005, 0.002, 0.01]) {
            for (const decay of [0.995, 0.999, 1]) {
                result.push({
                    id: `online-membership-lr${learningRate}-l2${l2}-d${decay}`,
                    learningRate,
                    l2,
                    decay,
                    positiveWeight: 1,
                    interactions: false,
                    numberBias: false
                });
            }
        }
    }
    return result;
}

function compact(item) {
    const { daily, ...rest } = item;
    return rest;
}

function formatPct(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatMoney(value) {
    return `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}K`;
}

function main() {
    const { rows, strategyIds, sourceSha256 } = loadRows();
    const baselineDaily = baseline(rows);
    const base = { id: 'chainSmallFirst', daily: baselineDaily, periods: byPeriod(baselineDaily), annual: annual(baselineDaily) };
    const candidates = candidateConfigs().map(config => {
        const daily = runOnlineModel(rows, strategyIds, config);
        return { id: config.id, config, daily, periods: byPeriod(daily), annual: annual(daily) };
    });

    // Parameters are selected solely with 2022-2023.  2024-2025 and 2026 are
    // untouched evaluation periods, even though their earlier outcomes update
    // the model only after their own prediction was emitted.
    candidates.sort((left, right) =>
        right.periods.selection.profitK - left.periods.selection.profitK
        || right.periods.selection.wins - left.periods.selection.wins
        || left.periods.selection.longestLoss - right.periods.selection.longestLoss
        || left.id.localeCompare(right.id)
    );
    const selected = candidates[0];
    const paired = period => {
        const left = new Map(selected.daily.map(row => [row.date, row]));
        const right = new Map(base.daily.map(row => [row.date, row]));
        let gained = 0;
        let lost = 0;
        for (const [date, row] of left) {
            if (date < period[0] || date > period[1]) continue;
            const reference = right.get(date);
            if (row.hit && !reference.hit) gained++;
            if (!row.hit && reference.hit) lost++;
        }
        return { gained, lost, net: gained - lost };
    };
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only-do-not-promote-without-independent-positive-holdouts',
        methodology: {
            label: 'Kết quả thực tế đề sau mỗi ngày.',
            action: 'Mỗi số có 13 tín hiệu dàn strict PIT. Mô hình ước lượng P(số về), giữ 30 xác suất cao nhất và loại 70 số còn lại.',
            strictPointInTime: 'Dàn D được xếp hạng trước khi updateState nhận actual(D).',
            parameterSelection: 'Chỉ dùng 2022-2023; 2024-2025 và 2026 không dùng để chọn tham số.',
            limitation: 'Nguồn strict PIT hiện có đầy đủ 2016-10/07/2026. Các năm trước 2026 không có đủ 20 năm quan sát vì raw bắt đầu 2005-10-01.'
        },
        economics: { betCount: BET_COUNT, excludedCount: 100 - BET_COUNT, stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT, breakEvenHitRate: BET_COUNT / PAYOUT },
        source: { index: path.relative(ROOT, INDEX_FILE), sourceSha256, dateRange: [rows[0]?.date, rows.at(-1)?.date], days: rows.length, strategyIds },
        baseline: compact(base),
        selection: {
            parameterPeriod: [SELECT_START, SELECT_END],
            selected: compact(selected),
            topCandidates: candidates.slice(0, 10).map(compact)
        },
        evaluation: {
            test: { range: [TEST_START, TEST_END], candidate: selected.periods.test, baseline: base.periods.test, paired: paired([TEST_START, TEST_END]) },
            holdout: { range: [HOLDOUT_START, rows.at(-1)?.date], candidate: selected.periods.holdout, baseline: base.periods.holdout, paired: paired([HOLDOUT_START, rows.at(-1)?.date]) },
            selectedAnnual: selected.annual,
            baselineAnnual: base.annual
        }
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(ROOT, 'reports', `online_exclusion_training_${stamp}.json`);
    const markdownPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const lines = [
        '# Huấn luyện online theo kết quả thực tế và tín hiệu loại trừ',
        '',
        `Trạng thái: **${report.status}**. Tham số được khóa bằng ${SELECT_START} đến ${SELECT_END}.`,
        '',
        '| Giai đoạn | Mô hình: hit | Mô hình: profit | Mô hình: ROI | Chuỗi W/L | Chuỗi nhỏ: hit | Chuỗi nhỏ: profit | Net hit |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        ...[
            ['Chọn tham số', selected.periods.selection, base.periods.selection, null],
            ['Test độc lập', selected.periods.test, base.periods.test, paired([TEST_START, TEST_END])],
            ['Holdout 2026', selected.periods.holdout, base.periods.holdout, paired([HOLDOUT_START, rows.at(-1)?.date])]
        ].map(([name, candidate, reference, compare]) =>
            `| ${name} | ${candidate.wins}/${candidate.days} (${formatPct(candidate.hitRate)}) | ${formatMoney(candidate.profitK)} | ${formatPct(candidate.roi)} | ${candidate.longestWin}/${candidate.longestLoss} | ${reference.wins}/${reference.days} (${formatPct(reference.hitRate)}) | ${formatMoney(reference.profitK)} | ${compare ? compare.net : '—'} |`),
        '',
        'Diễn giải: `exclusionErrorRate = 1 - hitRate` là tỷ lệ ngày số thực tế vẫn rơi vào 70 số bị loại. Mô hình chỉ đủ điều kiện production nếu cả test độc lập và holdout có profit dương, đồng thời không thua baseline.'
    ];
    fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ jsonPath, markdownPath, selected: selected.config, evaluation: report.evaluation }, null, 2));
}

main();
