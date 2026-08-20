#!/usr/bin/env node
'use strict';

/*
 * Research-only daily method advisor.  A recommendation for D is made from
 * settlements strictly before D.  It does not change any issued prediction.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'reports', 'strict_pit_all_methods_2016_2026.json');
const BET_COUNT = 30;
const PAYOUT = 84;
const BREAK_EVEN = BET_COUNT / PAYOUT;
const WINDOWS = [30, 90, 180];
const PRIOR = { alpha: 9, beta: 21 };

function parseArgs() {
    return new Map(process.argv.slice(2).map(token => {
        const [key, value] = token.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function wilsonLower(wins, total, z = 1.645) {
    if (!total) return 0;
    const rate = wins / total;
    const z2 = z * z;
    return Math.max(0, ((rate + z2 / (2 * total)) - z * Math.sqrt(
        (rate * (1 - rate) + z2 / (4 * total)) / total
    )) / (1 + z2 / total));
}

function load() {
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const methodIds = index.fixed?.methodIds || [];
    const rows = index.sourceReports.flatMap(source => {
        const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', source.file), 'utf8'));
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1' || Number(report.options?.dateStep) !== 1) {
            throw new Error(`${source.file} không phải strict PIT hàng ngày.`);
        }
        return report.rows || [];
    }).filter(row => methodIds.every(id => Array.isArray(row.strategies?.[id]) && row.strategies[id].length === BET_COUNT))
        .sort((left, right) => left.date.localeCompare(right.date));
    return { rows, methodIds };
}

function methodStats(rows, index, id, window) {
    const outcomes = [];
    for (let cursor = index - 1; cursor >= 0 && outcomes.length < window; cursor--) {
        const numbers = rows[cursor].strategies[id];
        if (!numbers) continue;
        outcomes.push(numbers.includes(rows[cursor].actual));
    }
    const wins = outcomes.filter(Boolean).length;
    const total = outcomes.length;
    const posteriorMean = (wins + PRIOR.alpha) / (total + PRIOR.alpha + PRIOR.beta);
    return { wins, total, posteriorMean, lower: wilsonLower(wins, total) };
}

function choose(rows, index, methodIds, config) {
    const candidates = methodIds.map(id => ({ id, ...methodStats(rows, index, id, config.window) }))
        .filter(row => row.total >= config.minSamples)
        .sort((left, right) =>
            right[config.score] - left[config.score]
            || right.posteriorMean - left.posteriorMean
            || right.total - left.total
            || left.id.localeCompare(right.id)
        );
    const chosen = candidates[0] || null;
    if (config.gate && (!chosen || chosen.lower <= BREAK_EVEN)) return { chosen: null, candidates };
    return { chosen, candidates };
}

function summarize(rows, methodIds, config, range) {
    const selected = [];
    let wins = 0;
    let stakeK = 0;
    let longestLoss = 0;
    let currentLoss = 0;
    for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        if (row.date < range.start || row.date > range.end) continue;
        const { chosen } = choose(rows, index, methodIds, config);
        if (!chosen) continue;
        const hit = row.strategies[chosen.id].includes(row.actual);
        wins += Number(hit);
        stakeK += BET_COUNT * 1000;
        currentLoss = hit ? 0 : currentLoss + 1;
        longestLoss = Math.max(longestLoss, currentLoss);
        selected.push({ date: row.date, actual: row.actual, id: chosen.id, hit, ...chosen });
    }
    const payoutK = wins * PAYOUT * 1000;
    return {
        calendarDays: rows.filter(row => row.date >= range.start && row.date <= range.end).length,
        playedDays: selected.length,
        skippedDays: rows.filter(row => row.date >= range.start && row.date <= range.end).length - selected.length,
        wins,
        hitRate: selected.length ? wins / selected.length : 0,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestLoss,
        selections: selected.reduce((result, row) => {
            result[row.id] = (result[row.id] || 0) + 1;
            return result;
        }, {}),
        rows: selected
    };
}

function currentRanking(rows, methodIds) {
    const index = rows.length;
    return WINDOWS.map(window => ({
        window,
        ranking: methodIds.map(id => ({ id, ...methodStats(rows, index, id, window) }))
            .sort((left, right) => right.lower - left.lower || right.posteriorMean - left.posteriorMean || left.id.localeCompare(right.id))
    }));
}

function compact(summary) {
    const { rows, ...rest } = summary;
    return rest;
}

function main() {
    const args = parseArgs();
    const { rows, methodIds } = load();
    const endDate = args.get('endDate') || rows.at(-1).date;
    const configs = WINDOWS.flatMap(window => [
        { id: `posterior-${window}`, window, minSamples: window, score: 'posteriorMean', gate: false },
        { id: `wilson-${window}`, window, minSamples: window, score: 'lower', gate: false },
        { id: `wilson-gated-${window}`, window, minSamples: window, score: 'lower', gate: true }
    ]);
    const ranges = {
        train: { start: '2016-01-01', end: '2023-12-31' },
        validation: { start: '2024-01-01', end: '2025-12-31' },
        holdout: { start: '2026-01-01', end: endDate }
    };
    const candidates = configs.map(config => ({
        config,
        train: summarize(rows, methodIds, config, ranges.train),
        validation: summarize(rows, methodIds, config, ranges.validation),
        holdout: summarize(rows, methodIds, config, ranges.holdout)
    }));
    const recommendation = candidates.filter(candidate =>
        candidate.validation.playedDays >= 180 && candidate.holdout.playedDays >= 45 &&
        candidate.validation.profitK > 0 && candidate.holdout.profitK > 0
    ).sort((left, right) => right.holdout.profitK - left.holdout.profitK || right.validation.profitK - left.validation.profitK)[0] || null;
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        methodology: {
            prediction: 'Mỗi ngày chọn một trong 13 dàn 30 số bằng kết quả của chính các phương pháp trước ngày dự đoán; không xem kết quả D.',
            recentWindows: '30/90/180 ngày gần nhất; Beta(9,21) shrinkage và Wilson 90% one-sided.',
            gate: `Chỉ đánh nếu Wilson lower > hòa vốn ${BREAK_EVEN.toFixed(6)} (${(BREAK_EVEN * 100).toFixed(2)}%).`,
            promotion: 'Chỉ đề xuất khi dương độc lập ở validation 2024-2025 và holdout 2026.'
        },
        source: { dates: [rows[0].date, rows.at(-1).date], rows: rows.length, methodIds },
        ranges,
        currentRanking: currentRanking(rows.filter(row => row.date <= endDate), methodIds),
        candidates: candidates.map(candidate => ({
            config: candidate.config,
            train: compact(candidate.train),
            validation: compact(candidate.validation),
            holdout: compact(candidate.holdout)
        })),
        recommendation: recommendation ? {
            config: recommendation.config,
            validation: compact(recommendation.validation),
            holdout: compact(recommendation.holdout)
        } : null,
        decision: recommendation ? 'candidate-requires-implementation-audit' : 'no-recent-window-selector-clears-independent-profit-gates'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = path.join(ROOT, 'reports', `recent-method-advisor-${stamp}.json`);
    const markdownFile = jsonFile.replace(/\.json$/, '.md');
    const percent = value => `${(Number(value || 0) * 100).toFixed(2)}%`;
    const lines = [
        '# Bộ chọn phương pháp theo hiệu quả gần đây (strict PIT)',
        '',
        `- Dữ liệu: ${report.source.dates.join(' -> ')}, ${report.source.rows} ngày, ${methodIds.length} phương pháp, mỗi dàn 30 số.`,
        `- Hòa vốn với ăn 84: ${percent(BREAK_EVEN)}.`,
        '- Mỗi lựa chọn ngày D dùng kết quả đã chốt trước D; không dùng kết quả D hay dữ liệu tương lai.',
        '',
        '## Xếp hạng hiện tại theo Wilson 90% one-sided',
        '',
        ...report.currentRanking.flatMap(item => [
            `### ${item.window} ngày`,
            '',
            '| Phương pháp | Trúng/mẫu | Posterior | Wilson lower |',
            '|---|---:|---:|---:|',
            ...item.ranking.slice(0, 5).map(row => `| ${row.id} | ${row.wins}/${row.total} | ${percent(row.posteriorMean)} | ${percent(row.lower)} |`),
            ''
        ]),
        '## Kiểm định bộ chọn',
        '',
        '| Cấu hình | Validation 2024-2025 profit | Holdout 2026 profit | Holdout trúng | Ngày đánh holdout |',
        '|---|---:|---:|---:|---:|',
        ...report.candidates.map(item => `| ${item.config.id} | ${Math.round(item.validation.profitK).toLocaleString('vi-VN')}K | ${Math.round(item.holdout.profitK).toLocaleString('vi-VN')}K | ${percent(item.holdout.hitRate)} | ${item.holdout.playedDays} |`),
        '',
        `## Kết luận: ${report.decision}`,
        '',
        'Điểm Scoring hiện tại không được dùng trực tiếp: các nhóm số chồng lấp và score tần suất thô chưa phải feature strict PIT. Chỉ xem xét sau khi xây dựng feature snapshot D-1, khử trùng nhóm và hiệu chỉnh out-of-sample.'
    ];
    fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(markdownFile, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ jsonFile, markdownFile, decision: report.decision, recommendation: report.recommendation, currentRanking: report.currentRanking }, null, 2));
}

if (require.main === module) main();

module.exports = { methodStats, choose, summarize, wilsonLower };
