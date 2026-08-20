#!/usr/bin/env node
'use strict';

/*
 * Research-only scoring fusion for Đề.
 * Scoring forms are evaluated from draws strictly before D.  The legacy UI
 * score is not used directly: it is scale-dependent and double-counts nested
 * groups.  This script deduplicates identical number sets and normalizes each
 * group by its baseline coverage before blending with a strict-PIT dàn.
 */
const fs = require('fs');
const path = require('path');
const { scoringForms } = require('../lib/utils/lotteryScoring');

const ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'reports', 'strict_pit_all_methods_2016_2026.json');
const RAW_FILE = path.join(ROOT, 'lib', 'data', 'xsmb-2-digits.json');
const NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = 30;
const STAKE_K = 1000;
const PAYOUT = 84;

function loadRows() {
    const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const methodIds = index.fixed?.methodIds || [];
    const rows = index.sourceReports.flatMap(source => {
        const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'reports', source.file), 'utf8'));
        if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1' || Number(report.options?.dateStep) !== 1) {
            throw new Error(`${source.file} không phải strict PIT hàng ngày.`);
        }
        return report.rows || [];
    }).filter(row => methodIds.every(id => row.strategies?.[id]?.length === BET_COUNT))
        .sort((left, right) => left.date.localeCompare(right.date));
    return { rows, methodIds };
}

function loadRaw() {
    const raw = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8')).map(row => ({
        date: String(row.date).slice(0, 10), actual: Number(row.special)
    })).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isInteger(row.actual))
        .sort((left, right) => left.date.localeCompare(right.date));
    return { raw, index: new Map(raw.map((row, position) => [row.date, position])) };
}

function buildGroups() {
    const groups = new Map();
    for (const form of scoringForms) {
        const numbers = NUMBERS.filter(number => form.checkFunction(number));
        if (!numbers.length || numbers.length === 100) continue;
        const signature = numbers.join(',');
        const current = groups.get(signature) || { numbers, forms: [] };
        current.forms.push({ id: form.n, title: form.description });
        groups.set(signature, current);
    }
    const unique = [...groups.values()].map((group, index) => ({
        id: index,
        ...group,
        probability: group.numbers.length / 100
    }));
    const byNumber = Array.from({ length: 100 }, () => []);
    for (const group of unique) for (const number of group.numbers) byNumber[number].push(group.id);
    return { groups: unique, byNumber };
}

function createScoringSnapshots(rows, raw, rawIndex, groupsData, lookback) {
    const counts = Array(groupsData.groups.length).fill(0);
    const snapshots = new Map();
    let left = 0;
    let right = 0;
    for (const row of rows) {
        const position = rawIndex.get(row.date);
        if (position === undefined) throw new Error(`Thiếu raw cho ${row.date}`);
        const begin = Math.max(0, position - lookback);
        while (right < position) {
            for (const groupId of groupsData.byNumber[raw[right].actual]) counts[groupId]++;
            right++;
        }
        while (left < begin) {
            for (const groupId of groupsData.byNumber[raw[left].actual]) counts[groupId]--;
            left++;
        }
        const scores = NUMBERS.map(number => {
            const memberships = groupsData.byNumber[number];
            if (!memberships.length) return 0;
            const values = memberships.map(groupId => {
                const p = groupsData.groups[groupId].probability;
                const expected = lookback * p;
                const variance = Math.max(1, lookback * p * (1 - p));
                // Positive: group appears less than baseline in the preceding window.
                return (expected - counts[groupId]) / Math.sqrt(variance);
            }).sort((a, b) => b - a);
            // Top-three mean limits the effect of deeply nested scoring forms.
            return values.slice(0, 3).reduce((sum, value) => sum + value, 0) / Math.min(3, values.length);
        });
        const sorted = scores.map((score, number) => ({ number, score })).sort((a, b) => b.score - a.score || a.number - b.number);
        const percentile = Array(100);
        sorted.forEach((rowScore, rank) => { percentile[rowScore.number] = 1 - rank / 99; });
        snapshots.set(row.date, { scores, percentile });
    }
    return snapshots;
}

function betFromFusion(baseNumbers, percentile, baseWeight, scoringWeight) {
    const base = new Set(baseNumbers);
    return NUMBERS.map(number => ({
        number,
        score: (base.has(number) ? baseWeight : 0) + scoringWeight * percentile[number]
    })).sort((left, right) => right.score - left.score || left.number - right.number)
        .slice(0, BET_COUNT).map(row => row.number);
}

function summarize(rows, strategy) {
    let wins = 0;
    let currentLoss = 0;
    let longestLoss = 0;
    const daily = [];
    for (const row of rows) {
        const betNumbers = strategy(row);
        const hit = betNumbers.includes(row.actual);
        wins += Number(hit);
        currentLoss = hit ? 0 : currentLoss + 1;
        longestLoss = Math.max(longestLoss, currentLoss);
        daily.push({ date: row.date, actual: row.actual, hit, betNumbers });
    }
    const stakeK = rows.length * BET_COUNT * STAKE_K;
    const profitK = wins * PAYOUT * STAKE_K - stakeK;
    return { days: rows.length, wins, hitRate: rows.length ? wins / rows.length : 0, profitK, roi: stakeK ? profitK / stakeK : 0, longestLoss, rows: daily };
}

function compact(summary) { const { rows, ...result } = summary; return result; }

function coverageCycles(raw) {
    const rows = [];
    let right = 0;
    const counts = Array(100).fill(0);
    let distinct = 0;
    for (let left = 0; left < raw.length; left++) {
        while (right < raw.length && distinct < 100) {
            if (counts[raw[right].actual]++ === 0) distinct++;
            right++;
        }
        if (distinct === 100) rows.push({ drawDays: right - left, calendarDays: Math.round((new Date(`${raw[right - 1].date}T12:00:00Z`) - new Date(`${raw[left].date}T12:00:00Z`)) / 86400000) + 1 });
        if (--counts[raw[left].actual] === 0) distinct--;
    }
    const summary = values => {
        const sorted = values.slice().sort((a, b) => a - b);
        const at = p => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
        return { count: sorted.length, min: sorted[0], median: at(0.5), mean: Number((sorted.reduce((sum, value) => sum + value, 0) / sorted.length).toFixed(2)), p90: at(0.9), max: sorted.at(-1) };
    };
    return { completedWindows: rows.length, drawDays: summary(rows.map(row => row.drawDays)), calendarDays: summary(rows.map(row => row.calendarDays)) };
}

function main() {
    const { rows, methodIds } = loadRows();
    const { raw, index: rawIndex } = loadRaw();
    const lookback = Number(process.argv.find(value => value.startsWith('--lookback='))?.split('=')[1] || 180);
    const groupsData = buildGroups();
    const features = createScoringSnapshots(rows, raw, rawIndex, groupsData, lookback);
    const ranges = {
        train: ['2016-01-01', '2023-12-31'],
        validation: ['2024-01-01', '2025-12-31'],
        holdout: ['2026-01-01', '2026-07-10']
    };
    const inRange = ([start, end]) => rows.filter(row => row.date >= start && row.date <= end);
    const configs = methodIds.flatMap(id => [0.15, 0.3, 0.5, 0.75, 1, 1.5].map(scoringWeight => ({ id: `${id}:score-${scoringWeight}`, baseId: id, baseWeight: 1, scoringWeight })));
    const evaluate = (range, config) => summarize(inRange(range), row => betFromFusion(row.strategies[config.baseId], features.get(row.date).percentile, config.baseWeight, config.scoringWeight));
    const candidateRows = configs.map(config => ({ config, train: evaluate(ranges.train, config) }));
    const chosen = candidateRows.slice().sort((left, right) => right.train.profitK - left.train.profitK || right.train.hitRate - left.train.hitRate)[0];
    const validation = evaluate(ranges.validation, chosen.config);
    const holdout = evaluate(ranges.holdout, chosen.config);
    const base = [chosen.config.baseId, 'chainSmallFirst', 'dedupEdge50Hold'].filter((id, index, values) => methodIds.includes(id) && values.indexOf(id) === index)
        .map(id => ({ id, train: summarize(inRange(ranges.train), row => row.strategies[id]), validation: summarize(inRange(ranges.validation), row => row.strategies[id]), holdout: summarize(inRange(ranges.holdout), row => row.strategies[id]) }));
    const decision = validation.profitK > 0 && holdout.profitK > 0 ? 'candidate-clears-independent-regimes-needs-audit' : 'do-not-promote-scoring-fusion';
    const report = {
        generatedAt: new Date().toISOString(), status: 'research-only',
        scoringAudit: {
            legacyIssue: 'UI score 90 - occurrences * multiplier is not normalized by group size and counts nested groups repeatedly.',
            replacement: 'Deduplicate identical number sets; compute prior-window standardized underrepresentation z-score; cap each number at top-three group signals.',
            forms: scoringForms.length, uniqueNumberSets: groupsData.groups.length, lookback, mode: 'Đề/special only, snapshot D-1.'
        },
        coverage100: coverageCycles(raw),
        ranges, chosen: { config: chosen.config, train: compact(chosen.train), validation: compact(validation), holdout: compact(holdout) },
        bases: base.map(item => ({ id: item.id, train: compact(item.train), validation: compact(item.validation), holdout: compact(item.holdout) })),
        topTrainingCandidates: candidateRows.sort((left, right) => right.train.profitK - left.train.profitK).slice(0, 20).map(item => ({ config: item.config, train: compact(item.train) })),
        decision
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = path.join(ROOT, 'reports', `scoring-pit-fusion-${stamp}.json`);
    const markdownFile = jsonFile.replace(/\.json$/, '.md');
    const pct = value => `${(Number(value || 0) * 100).toFixed(2)}%`;
    const rowLine = (name, summary) => `| ${name} | ${summary.wins}/${summary.days} | ${pct(summary.hitRate)} | ${Math.round(summary.profitK).toLocaleString('vi-VN')}K | ${pct(summary.roi)} | ${summary.longestLoss} |`;
    const lines = [
        '# Scoring PIT fusion - Đề', '',
        `- 100 số: cửa sổ đầy đủ từ raw thực tế có trung vị ${report.coverage100.calendarDays.median} ngày lịch / ${report.coverage100.drawDays.median} ngày quay; p90 ${report.coverage100.calendarDays.p90} ngày lịch.`,
        `- ${scoringForms.length} form UI được khử trùng còn ${groupsData.groups.length} tập số duy nhất; feature chỉ dùng ${lookback} ngày trước D.`,
        '- “Thiếu” của nhóm không được coi là bắt buộc sẽ về; chỉ là feature phải được kiểm định ngoài mẫu.', '',
        `## Cấu hình chọn từ train: ${chosen.config.id}`, '',
        '| Giai đoạn | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thua dài nhất |', '|---|---:|---:|---:|---:|---:|',
        rowLine('Train 2016-2023', chosen.train), rowLine('Validation 2024-2025', validation), rowLine('Holdout 2026', holdout), '',
        `Kết luận: **${decision}**.`, '', '## So sánh baseline', '',
        '| Phương pháp / giai đoạn | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thua dài nhất |', '|---|---:|---:|---:|---:|---:|',
        ...base.flatMap(item => [rowLine(`${item.id} - train`, item.train), rowLine(`${item.id} - validation`, item.validation), rowLine(`${item.id} - holdout`, item.holdout)])
    ];
    fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(markdownFile, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({ jsonFile, markdownFile, coverage100: report.coverage100, chosen: report.chosen, decision }, null, 2));
}

if (require.main === module) main();

module.exports = { buildGroups, betFromFusion, coverageCycles };
