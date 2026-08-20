#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    buildDailyPredictions,
    summarizeCombinedBetHold,
    withinRange,
    wilsonLower
} = require('../lib/research/walkforwardWilsonGate');

const SOURCE = path.resolve('reports/strict_pit_all_methods_2016_2026.json');
const ECONOMICS = {
    stakePerNumberK: 1000,
    payoutMultiplier: 84,
    holdWinMultiplier: 0.705,
    holdLossMultiplier: 70
};
const TRAIN = ['2016-01-01', '2020-12-31'];
const VALIDATION = ['2021-01-01', '2023-12-31'];
const HOLDOUT = ['2024-01-01', '2025-12-31'];
const BET_COUNTS = [3, 5, 6, 7, 10];
const SCORE_MODES = ['equalVote', 'weightedBeta'];

function loadRows(source) {
    const root = path.dirname(SOURCE);
    return (source.sourceReports || [])
        .filter(item => Number(item.year) >= 2016 && Number(item.year) <= 2025)
        .flatMap(item => JSON.parse(fs.readFileSync(path.join(root, item.file), 'utf8')).rows || [])
        .sort((left, right) => left.date.localeCompare(right.date));
}

function compact(result) {
    return {
        days: result.days,
        betCount: result.betCount,
        holdCount: result.holdCount,
        wins: result.wins,
        losses: result.losses,
        hitRate: result.hitRate,
        breakEvenHitRate: result.breakEvenHitRate,
        wilsonLower90: wilsonLower(result.wins, result.days, 1.64),
        wilsonLower95: wilsonLower(result.wins, result.days, 1.96),
        profitK: result.profitK,
        roi: result.roi,
        longestWin: result.longestWin,
        longestLoss: result.longestLoss
    };
}

function isoWeekKey(dateText) {
    const date = new Date(`${dateText}T00:00:00Z`);
    const weekday = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function groupRows(rows, keyOf, options) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyOf(row);
        const bucket = groups.get(key) || [];
        bucket.push(row);
        groups.set(key, bucket);
    }
    return [...groups.entries()].map(([key, values]) => ({
        key,
        ...compact(summarizeCombinedBetHold(values, options))
    }));
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatK(value) {
    return `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}K`;
}

function markdownSummary(name, result) {
    return `| ${name} | ${result.days} | ${result.wins}/${result.days} | ${formatPercent(result.hitRate)} | ${formatPercent(result.breakEvenHitRate)} | ${formatK(result.profitK)} | ${formatPercent(result.roi)} | ${result.longestWin}/${result.longestLoss} |`;
}

function main() {
    const sourceBytes = fs.readFileSync(SOURCE);
    const source = JSON.parse(sourceBytes);
    const methodIds = source.fixed?.methodIds || [];
    const rows = loadRows(source).filter(row => methodIds.every(id => Array.isArray(row.strategies?.[id])));
    const candidates = [];
    for (const scoreMode of SCORE_MODES) {
        for (const betCount of BET_COUNTS) {
            const daily = buildDailyPredictions(rows, {
                methodIds,
                scoreMode,
                betCount,
                priorMean: 0.3,
                priorStrength: 60
            });
            candidates.push({
                id: `${scoreMode}:top${betCount}`,
                scoreMode,
                betCount,
                train: compact(summarizeCombinedBetHold(withinRange(daily, ...TRAIN), { ...ECONOMICS, betCount })),
                validation: compact(summarizeCombinedBetHold(withinRange(daily, ...VALIDATION), { ...ECONOMICS, betCount })),
                holdout: compact(summarizeCombinedBetHold(withinRange(daily, ...HOLDOUT), { ...ECONOMICS, betCount })),
                all: compact(summarizeCombinedBetHold(daily, { ...ECONOMICS, betCount })),
                daily
            });
        }
    }
    const selected = [...candidates].sort((left, right) =>
        right.train.profitK - left.train.profitK ||
        right.train.hitRate - left.train.hitRate ||
        left.betCount - right.betCount ||
        left.id.localeCompare(right.id)
    )[0];
    const decision = selected.validation.profitK > 0 && selected.holdout.profitK > 0
        ? 'candidate-clears-two-independent-regimes-needs-separate-production-validation'
        : 'do-not-promote';
    const selectedFull = summarizeCombinedBetHold(selected.daily, {
        ...ECONOMICS,
        betCount: selected.betCount
    });
    const selectedDaily = selected.daily.map(row => ({
        date: row.date,
        actual: row.actual,
        betNumbers: row.betNumbers,
        hit: row.hit,
        confidence: row.confidence,
        topSupport: row.topSupport,
        meanSupport: row.meanSupport,
        profitK: row.hit ? selectedFull.winProfitPerDayK : selectedFull.lossProfitPerDayK
    }));
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        source: path.relative(process.cwd(), SOURCE),
        sourceSha256: crypto.createHash('sha256').update(sourceBytes).digest('hex'),
        methodology: {
            predictionSource: '13 dàn strict-prefix-point-in-time-v1 đã được khóa trước kết quả từng ngày.',
            ranker: 'Equal vote hoặc beta-weighted vote. Beta chỉ cập nhật sau khi ngày đó kết toán.',
            economics: 'Đánh n số 1.000K; ăn 84. Ôm 100-n số, nhận 0,705/số nếu dàn ôm không về và mất 70 nếu có số ôm về.',
            selection: 'Chọn một cấu hình duy nhất theo profit 2016-2020; validation 2021-2023 và holdout 2024-2025 không được dùng để chọn.',
            caveat: 'Dàn nhỏ thay đổi rủi ro và không tương đương chiến lược Hold 70/Đánh 30. Không triển khai nếu một trong hai tập kiểm chứng âm.'
        },
        economics: ECONOMICS,
        selection: { train: TRAIN, validation: VALIDATION, holdout: HOLDOUT, selectedId: selected.id },
        candidates: candidates.map(candidate => ({
            id: candidate.id,
            scoreMode: candidate.scoreMode,
            betCount: candidate.betCount,
            train: candidate.train,
            validation: candidate.validation,
            holdout: candidate.holdout,
            all: candidate.all
        })),
        selected: {
            id: selected.id,
            scoreMode: selected.scoreMode,
            betCount: selected.betCount,
            train: selected.train,
            validation: selected.validation,
            holdout: selected.holdout,
            all: selected.all,
            annual: Object.fromEntries(Array.from({ length: 10 }, (_, index) => String(2016 + index)).map(year => [
                year,
                compact(summarizeCombinedBetHold(selected.daily.filter(row => row.date.startsWith(year)), {
                    ...ECONOMICS,
                    betCount: selected.betCount
                }))
            ])),
            monthly: groupRows(selected.daily, row => row.date.slice(0, 7), {
                ...ECONOMICS,
                betCount: selected.betCount
            }),
            weekly: groupRows(selected.daily, row => isoWeekKey(row.date), {
                ...ECONOMICS,
                betCount: selected.betCount
            }),
            daily: selectedDaily
        },
        decision
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.resolve('reports', `strict-small-dan-bet-hold-${stamp}.json`);
    const markdownPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const lines = [
        '# Strict PIT - dàn nhỏ Đánh + Ôm',
        '',
        'Nghiên cứu riêng, không thay đổi phương pháp production.',
        '',
        `- Dàn strict PIT: ${rows.length} ngày, 2016–2025.`,
        `- Cấu hình được chọn từ train: **${selected.id}**.`,
        `- Quyết định: **${decision}**.`,
        '',
        '| Giai đoạn | Ngày | Trúng | Hit | Hòa vốn | Profit | ROI | Chuỗi W/L |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        markdownSummary('Train 2016–2020', selected.train),
        markdownSummary('Validation 2021–2023', selected.validation),
        markdownSummary('Holdout 2024–2025', selected.holdout),
        markdownSummary('Toàn bộ 2016–2025', selected.all),
        '',
        '## Bảng cấu hình',
        '',
        '| Cấu hình | Train profit | Validation profit | Holdout profit | Holdout hit |',
        '| --- | ---: | ---: | ---: | ---: |',
        ...report.candidates.map(candidate => `| ${candidate.id} | ${formatK(candidate.train.profitK)} | ${formatK(candidate.validation.profitK)} | ${formatK(candidate.holdout.profitK)} | ${formatPercent(candidate.holdout.hitRate)} |`),
        '',
        'Một phương án dương khi nhìn toàn bộ 10 năm vẫn bị từ chối nếu validation hoặc holdout âm, vì đó là dấu hiệu chọn theo nhiễu lịch sử.'
    ];
    fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({
        jsonPath,
        markdownPath,
        decision,
        selected: {
            id: selected.id,
            train: selected.train,
            validation: selected.validation,
            holdout: selected.holdout,
            all: selected.all
        }
    }, null, 2));
}

main();
