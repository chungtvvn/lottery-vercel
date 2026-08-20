#!/usr/bin/env node
'use strict';

/*
 * Strict-PIT consensus calibration.
 *
 * A number receives 0..N votes from the already-issued strict-PIT strategy
 * dàn for D.  Before choosing D's 30 numbers, estimate P(actual | vote count)
 * only from settled dates before D.  This avoids choosing a method after seeing
 * D's result and is intentionally research-only.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'reports', 'strict_pit_all_methods_2016_2026.json');
const BET_COUNT = 30;
const STAKE_K = 1000;
const PAYOUT = 84;
const SELECT_RANGE = ['2016-01-01', '2023-12-31'];
const TEST_RANGE = ['2024-01-01', '2025-12-31'];
const HOLDOUT_START = '2026-01-01';
const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function loadRows() {
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const ids = index.fixed?.methodIds || [];
    if (!ids.length) throw new Error('Thiếu methodIds từ strict PIT index.');
    const byDate = new Map();
    for (const source of index.sourceReports || []) {
        const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', source.file), 'utf8'));
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1' || report.options?.dateStep !== 1) {
            throw new Error(`${source.file} không phải strict PIT theo ngày.`);
        }
        for (const sourceRow of report.rows || []) {
            if (!ids.every(id => Array.isArray(sourceRow.strategies?.[id]) && sourceRow.strategies[id].length === BET_COUNT)) continue;
            const actual = Number(sourceRow.actual);
            if (!Number.isInteger(actual) || actual < 0 || actual > 99) continue;
            byDate.set(sourceRow.date, {
                date: sourceRow.date,
                actual,
                votes: ALL_NUMBERS.map(number => ids.reduce((sum, id) =>
                    sum + Number(sourceRow.strategies[id].includes(number)), 0))
            });
        }
    }
    return { rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), ids };
}

function createState(maxVote, priorStrength) {
    // A symmetric daily draw has a base P=1/100 for an individual number.
    const alpha = Array(maxVote + 1).fill(priorStrength / 100);
    const beta = Array(maxVote + 1).fill(priorStrength * 99 / 100);
    return { alpha, beta };
}

function rank(row, state) {
    return ALL_NUMBERS.map(number => {
        const vote = row.votes[number];
        const probability = state.alpha[vote] / (state.alpha[vote] + state.beta[vote]);
        return { number, vote, probability };
    }).sort((left, right) => right.probability - left.probability || right.vote - left.vote || left.number - right.number);
}

function settle(row, state) {
    for (const vote of row.votes) state.beta[vote] += 1;
    state.alpha[row.votes[row.actual]] += 1;
}

function summarize(rows) {
    let wins = 0;
    let stakeK = 0;
    let profitK = 0;
    let current = '';
    let currentLen = 0;
    let longestWin = 0;
    let longestLoss = 0;
    for (const row of rows) {
        wins += Number(row.hit);
        stakeK += BET_COUNT * STAKE_K;
        profitK += row.hit ? PAYOUT * STAKE_K - BET_COUNT * STAKE_K : -BET_COUNT * STAKE_K;
        const kind = row.hit ? 'win' : 'loss';
        currentLen = current === kind ? currentLen + 1 : 1;
        current = kind;
        if (kind === 'win') longestWin = Math.max(longestWin, currentLen);
        else longestLoss = Math.max(longestLoss, currentLen);
    }
    return {
        days: rows.length,
        wins,
        losses: rows.length - wins,
        hitRate: rows.length ? wins / rows.length : 0,
        breakEvenHitRate: BET_COUNT / PAYOUT,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin,
        longestLoss
    };
}

function run(rows, priorStrength, maxVote) {
    const state = createState(maxVote, priorStrength);
    return rows.map(row => {
        const ranked = rank(row, state);
        const betNumbers = ranked.slice(0, BET_COUNT).map(item => item.number);
        const result = {
            date: row.date,
            actual: row.actual,
            hit: betNumbers.includes(row.actual),
            betNumbers,
            actualVote: row.votes[row.actual],
            cutoffVote: ranked[BET_COUNT - 1].vote,
            cutoffProbability: ranked[BET_COUNT - 1].probability
        };
        settle(row, state);
        return result;
    });
}

function partition(rows, [start, end]) {
    return rows.filter(row => row.date >= start && row.date <= end);
}

function baseline(rows) {
    // Vote count is not required for the baseline; independent of selector.
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const byDate = new Map();
    for (const source of index.sourceReports || []) {
        const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', source.file), 'utf8'));
        for (const sourceRow of report.rows || []) {
            const betNumbers = sourceRow.strategies?.chainSmallFirst;
            if (Array.isArray(betNumbers) && betNumbers.length === BET_COUNT) byDate.set(sourceRow.date, {
                date: sourceRow.date,
                actual: Number(sourceRow.actual),
                hit: betNumbers.includes(Number(sourceRow.actual))
            });
        }
    }
    return rows.map(row => byDate.get(row.date)).filter(Boolean);
}

function paired(candidate, reference, range) {
    const ref = new Map(reference.map(row => [row.date, row]));
    let gain = 0;
    let loss = 0;
    for (const row of candidate) {
        if (row.date < range[0] || row.date > range[1]) continue;
        const other = ref.get(row.date);
        if (!other) continue;
        if (row.hit && !other.hit) gain++;
        if (!row.hit && other.hit) loss++;
    }
    return { gainedWins: gain, lostWins: loss, netWins: gain - loss };
}

function compact(item) {
    const { daily, ...result } = item;
    return result;
}

function main() {
    const { rows, ids } = loadRows();
    const maxVote = ids.length;
    const reference = baseline(rows);
    const candidates = [5, 10, 20, 40, 80, 160, 320, 640]
        .map(priorStrength => {
            const daily = run(rows, priorStrength, maxVote);
            return {
                id: `vote-calibration-beta-${priorStrength}`,
                priorStrength,
                daily,
                selection: summarize(partition(daily, SELECT_RANGE)),
                test: summarize(partition(daily, TEST_RANGE)),
                holdout: summarize(daily.filter(row => row.date >= HOLDOUT_START))
            };
        })
        .sort((left, right) => right.selection.profitK - left.selection.profitK
            || right.selection.wins - left.selection.wins
            || left.selection.longestLoss - right.selection.longestLoss
            || left.priorStrength - right.priorStrength);
    const selected = candidates[0];
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        methodology: {
            strictPointInTime: 'Vote profile for D comes from strict PIT dàn D. Beta counts update only after result D settles.',
            feature: `Number vote count across ${ids.length} independently emitted strategy dàn; no raw future outcomes or current-day actual enters score.`,
            selection: `${SELECT_RANGE.join('..')} only; ${TEST_RANGE.join('..')} and 2026 remain untouched for prior selection.`,
            limitation: 'Methods are correlated, so consensus can be weaker than a single method. Promotion requires positive independent test and holdout.'
        },
        economics: { betCount: BET_COUNT, stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT, breakEvenHitRate: BET_COUNT / PAYOUT },
        source: { rows: rows.length, range: [rows[0]?.date, rows.at(-1)?.date], methodIds: ids },
        selected: compact(selected),
        topCandidates: candidates.slice(0, 8).map(compact),
        comparison: {
            test: { candidate: selected.test, baseline: summarize(partition(reference, TEST_RANGE)), paired: paired(selected.daily, reference, TEST_RANGE) },
            holdout: { candidate: selected.holdout, baseline: summarize(reference.filter(row => row.date >= HOLDOUT_START)), paired: paired(selected.daily, reference, [HOLDOUT_START, rows.at(-1)?.date]) }
        }
    };
    const output = path.join(ROOT, 'reports', `research_online_vote_calibration_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ output, selected: report.selected, comparison: report.comparison }, null, 2));
}

main();
