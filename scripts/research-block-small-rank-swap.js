#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { rankBlockOnly } = require('../lib/research/blockOnlyRanker');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const STAKE_K = 1000;
const PAYOUT = 84;
const BET_COUNT = 30;

const EVALUATION = {
    2024: {
        diagnostics: 'research_true_pit_strategies_2026-07-18T08-07-35-994Z.json',
        verified: 'research_true_pit_strategies_2026-07-15T09-12-54-384Z.json'
    },
    2025: {
        diagnostics: 'research_true_pit_strategies_2026-07-18T08-15-14-027Z.json',
        verified: 'research_true_pit_strategies_2026-07-15T10-36-27-359Z.json'
    },
    2026: {
        diagnostics: 'research_true_pit_strategies_2026-07-16T17-18-22-555Z.json',
        verified: 'research_true_pit_strategies_2026-07-15T09-41-35-326Z.json'
    }
};

const CONFIGS = [
    'blockSequential',
    'blockAverageDropoff',
    'blockConsensusEdge'
].flatMap(method => [1, 2, 3, 4, 5].flatMap(swapLimit =>
    [0, 0.01, 0.03].map(minMargin => ({
        id: `${method}-s${swapLimit}-m${String(minMargin).replace('.', '')}`,
        method,
        swapLimit,
        minMargin
    }))
));

function readReport(fileName) {
    return JSON.parse(fs.readFileSync(path.join(REPORT_DIR, fileName), 'utf8'));
}

function joinRows(config) {
    const verified = new Map((readReport(config.verified).rows || [])
        .filter(row => Array.isArray(row.strategies?.chainSmallVerifiedExact))
        .map(row => [row.date, row]));
    return (readReport(config.diagnostics).rows || []).map(row => {
        const baseline = verified.get(row.date);
        if (!baseline || !Array.isArray(row.candidateDiagnostics)) return null;
        if (Number(baseline.actual) !== Number(row.actual)) throw new Error(`Actual mismatch ${row.date}`);
        return {
            ...row,
            verifiedNumbers: baseline.strategies.chainSmallVerifiedExact.map(Number)
        };
    }).filter(Boolean).sort((left, right) => left.date.localeCompare(right.date));
}

function predict(row, config) {
    const ranking = rankBlockOnly(row.candidateDiagnostics, config.method);
    const byNumber = new Map(ranking.map((item, index) => [item.number, { ...item, index }]));
    const result = new Set(row.verifiedNumbers);
    const removable = row.verifiedNumbers.map(number => byNumber.get(number))
        .filter(item => item && item.support > 0)
        .sort((left, right) => left.index - right.index || left.number - right.number);
    const incoming = ranking.filter(item => !result.has(item.number))
        .sort((left, right) => right.index - left.index || left.number - right.number);
    const swaps = [];
    for (let index = 0; index < Math.min(removable.length, incoming.length); index++) {
        if (swaps.length >= config.swapLimit) break;
        const out = removable[index];
        const add = incoming[index];
        const normalizedMargin = (add.index - out.index) / 99;
        if (normalizedMargin < config.minMargin) continue;
        result.delete(out.number);
        result.add(add.number);
        swaps.push({
            out: out.number,
            in: add.number,
            normalizedMargin,
            outSupport: out.support,
            inSupport: add.support
        });
    }
    return { betNumbers: [...result].sort((a, b) => a - b), swaps };
}

function summarize(rows, config = null) {
    let wins = 0;
    let profitK = 0;
    let totalSwaps = 0;
    let helpful = 0;
    let harmful = 0;
    let longestLoss = 0;
    let currentLoss = 0;
    const daily = [];
    for (const row of rows) {
        const baselineHit = row.verifiedNumbers.includes(Number(row.actual));
        const prediction = config
            ? predict(row, config)
            : { betNumbers: row.verifiedNumbers, swaps: [] };
        const hit = prediction.betNumbers.includes(Number(row.actual));
        wins += Number(hit);
        profitK += (hit ? PAYOUT * STAKE_K : 0) - BET_COUNT * STAKE_K;
        totalSwaps += prediction.swaps.length;
        helpful += Number(hit && !baselineHit);
        harmful += Number(!hit && baselineHit);
        currentLoss = hit ? 0 : currentLoss + 1;
        longestLoss = Math.max(longestLoss, currentLoss);
        daily.push({ date: row.date, actual: Number(row.actual), hit, betNumbers: prediction.betNumbers, swaps: prediction.swaps });
    }
    const stakeK = rows.length * BET_COUNT * STAKE_K;
    return {
        days: rows.length,
        wins,
        hitRate: rows.length ? wins / rows.length : 0,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        totalSwaps,
        averageSwaps: rows.length ? totalSwaps / rows.length : 0,
        helpful,
        harmful,
        longestLoss,
        daily
    };
}

function compact(summary) {
    const { daily, ...result } = summary;
    return result;
}

function percent(value) {
    return `${(100 * value).toFixed(2)}%`;
}

function main() {
    const rows = Object.fromEntries(Object.entries(EVALUATION).map(([year, config]) => [year, joinRows(config)]));
    const baseline = Object.fromEntries(Object.entries(rows).map(([year, values]) => [year, summarize(values)]));
    const selection = CONFIGS.map(config => {
        const y2024 = summarize(rows[2024], config);
        const y2025 = summarize(rows[2025], config);
        return {
            config,
            byYear: {
                2024: compact(y2024),
                2025: compact(y2025)
            },
            minimumWinDelta: Math.min(y2024.wins - baseline[2024].wins, y2025.wins - baseline[2025].wins),
            totalWinDelta: y2024.wins + y2025.wins - baseline[2024].wins - baseline[2025].wins,
            totalProfitDeltaK: y2024.profitK + y2025.profitK - baseline[2024].profitK - baseline[2025].profitK,
            maximumLoss: Math.max(y2024.longestLoss, y2025.longestLoss)
        };
    }).sort((left, right) =>
        right.minimumWinDelta - left.minimumWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || left.maximumLoss - right.maximumLoss
        || right.totalProfitDeltaK - left.totalProfitDeltaK
        || left.config.id.localeCompare(right.config.id)
    );
    const selected = selection[0];
    const holdout = summarize(rows[2026], selected.config);
    const holdoutSensitivity = selection.map(item => {
        const result = summarize(rows[2026], item.config);
        return {
            id: item.config.id,
            selectedBeforeHoldout: item.config.id === selected.config.id,
            validationMinimumWinDelta: item.minimumWinDelta,
            validationTotalWinDelta: item.totalWinDelta,
            summary: compact(result),
            deltaWins: result.wins - baseline[2026].wins
        };
    }).sort((left, right) =>
        right.deltaWins - left.deltaWins
        || right.validationMinimumWinDelta - left.validationMinimumWinDelta
        || right.validationTotalWinDelta - left.validationTotalWinDelta
        || left.id.localeCompare(right.id)
    );

    const output = {
        generatedAt: new Date().toISOString(),
        methodology: {
            strictPointInTime: true,
            baseline: 'chainSmallVerifiedExact',
            selection: '2024 and 2025 sampled every 10 days; maximize worst-year delta',
            holdout: '2026 full daily, untouched during selection',
            targetExcluded: 70,
            betCount: BET_COUNT,
            stakeK: STAKE_K,
            payout: PAYOUT
        },
        selected,
        baseline: Object.fromEntries(Object.entries(baseline).map(([year, value]) => [year, compact(value)])),
        holdout2026: compact(holdout),
        holdoutDeltaWins: holdout.wins - baseline[2026].wins,
        selectionLeaderboard: selection.slice(0, 12),
        holdoutSensitivity: holdoutSensitivity.slice(0, 12),
        holdoutDaily: holdout.daily
    };
    fs.writeFileSync(
        path.join(REPORT_DIR, 'block-small-rank-swap-2026-07-18.json'),
        JSON.stringify(output, null, 2)
    );

    const periods = [2024, 2025, 2026].map(year => {
        const candidate = year === 2026 ? compact(holdout) : selected.byYear[year];
        const base = compact(baseline[year]);
        return { year, base, candidate };
    });
    const md = [
        '# SmallChain hiệu chỉnh + hoán đổi theo thứ hạng Block',
        '',
        `Cấu hình khóa trước holdout: \`${selected.config.id}\`.`,
        '',
        '| Giai đoạn | Small hiệu chỉnh | Hybrid | Delta hit | Profit Hybrid | ROI | Đổi/ngày | Cứu/Hại | Chuỗi thua |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...periods.map(({ year, base, candidate }) =>
            `| ${year}${year < 2026 ? ' mẫu' : ' full'} | ${base.wins}/${base.days} (${percent(base.hitRate)}) | ${candidate.wins}/${candidate.days} (${percent(candidate.hitRate)}) | ${candidate.wins - base.wins >= 0 ? '+' : ''}${candidate.wins - base.wins} | ${candidate.profitK >= 0 ? '+' : ''}${candidate.profitK.toLocaleString('en-US')}K | ${percent(candidate.roi)} | ${candidate.averageSwaps.toFixed(2)} | ${candidate.helpful}/${candidate.harmful} | ${candidate.longestLoss} |`
        ),
        '',
        holdout.wins > baseline[2026].wins
            ? '- Có lift trên holdout, nhưng chỉ được xem xét nếu validation không âm và mức thay đổi đủ lớn.'
            : holdout.wins === baseline[2026].wins
                ? '- Không tạo lift trên holdout; giữ SmallChain hiệu chỉnh.'
                : '- Làm giảm holdout; loại cấu hình.',
        '- Không thay production default.'
    ].join('\n');
    fs.writeFileSync(path.join(REPORT_DIR, 'block-small-rank-swap-2026-07-18.md'), `${md}\n`);

    console.log(JSON.stringify({
        selected,
        baseline2026: compact(baseline[2026]),
        holdout2026: compact(holdout),
        holdoutDeltaWins: output.holdoutDeltaWins,
        sensitivityTop: output.holdoutSensitivity
    }, null, 2));
}

main();
