#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
    buildDailyPredictions,
    evaluateGate,
    summarize,
    withinRange
} = require('../lib/research/walkforwardWilsonGate');

const SOURCE = path.resolve('reports/strict_pit_all_methods_2016_2026.json');
const ECONOMICS = {
    betCount: 30,
    stakePerNumberK: 1000,
    payoutMultiplier: 84
};
const TRAIN = ['2016-01-01', '2020-12-31'];
const VALIDATION = ['2021-01-01', '2023-12-31'];
const HOLDOUT = ['2024-01-01', '2025-12-31'];
const GATES = [
    { id: 'wilson90-n60', minSample: 60, z: 1.28 },
    { id: 'wilson95-n60', minSample: 60, z: 1.64 },
    { id: 'wilson90-n90', minSample: 90, z: 1.28 },
    { id: 'wilson95-n90', minSample: 90, z: 1.64 }
];
const SCORE_MODES = ['equalVote', 'weightedBeta'];

function loadRows(source) {
    const root = path.dirname(SOURCE);
    const rows = [];
    for (const report of source.sourceReports || []) {
        if (Number(report.year) < 2016 || Number(report.year) > 2025) continue;
        const file = path.join(root, report.file);
        const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
        rows.push(...(payload.rows || []));
    }
    return rows.sort((left, right) => left.date.localeCompare(right.date));
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatK(value) {
    return `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}K`;
}

function rowLine(label, summary) {
    return `| ${label} | ${summary.calendarDays} | ${summary.playedDays} | ${summary.skippedDays} | ${summary.wins}/${summary.playedDays} | ${formatPercent(summary.hitRate)} | ${formatK(summary.profitK)} | ${formatPercent(summary.roi)} | ${summary.longestWin}/${summary.longestLoss} |`;
}

function main() {
    const source = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
    const methodIds = source.fixed?.methodIds || [];
    const allRows = loadRows(source).filter(row =>
        methodIds.every(id => Array.isArray(row.strategies?.[id]))
    );
    if (!allRows.length) throw new Error('Không có nhật ký strict PIT đủ 13 chiến lược.');

    const candidates = [];
    for (const scoreMode of SCORE_MODES) {
        const predictions = buildDailyPredictions(allRows, {
            methodIds,
            scoreMode,
            ...ECONOMICS,
            priorMean: 0.3,
            priorStrength: 60
        });
        for (const gate of GATES) {
            const rows = evaluateGate(predictions, { ...ECONOMICS, ...gate });
            const train = summarize(withinRange(rows, ...TRAIN), ECONOMICS);
            const validation = summarize(withinRange(rows, ...VALIDATION), ECONOMICS);
            const holdout = summarize(withinRange(rows, ...HOLDOUT), ECONOMICS);
            const all = summarize(rows, ECONOMICS);
            candidates.push({
                id: `${scoreMode}:${gate.id}`,
                scoreMode,
                gate,
                train,
                validation,
                holdout,
                all,
                rows
            });
        }
    }

    const chosen = [...candidates].sort((left, right) =>
        right.train.profitK - left.train.profitK ||
        right.train.playedDays - left.train.playedDays ||
        right.train.hitRate - left.train.hitRate ||
        left.id.localeCompare(right.id)
    )[0];
    const outputCandidates = candidates.map(candidate => ({
        id: candidate.id,
        scoreMode: candidate.scoreMode,
        gate: candidate.gate,
        train: candidate.train,
        validation: candidate.validation,
        holdout: candidate.holdout,
        all: candidate.all
    }));
    const decision = chosen.validation.profitK > 0 && chosen.holdout.profitK > 0
        ? 'candidate-clears-two-independent-regimes-needs-code-and-cache-validation'
        : 'do-not-promote';
    const report = {
        generatedAt: new Date().toISOString(),
        status: 'research-only',
        source: path.relative(process.cwd(), SOURCE),
        sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(SOURCE)).digest('hex'),
        methodology: {
            input: 'Nhật ký dàn số strict-prefix-point-in-time-v1, mỗi ngày được sinh trước khi biết kết quả ngày đó.',
            ensemble: '13 chiến lược Hold 70 gốc. Trọng số beta được cập nhật sau khi ngày hiện tại kết toán; không dùng kết quả tương lai.',
            gate: 'Chỉ đánh khi cận dưới Wilson của các ngày quá khứ có độ đồng thuận ít nhất bằng ngày hiện tại vượt điểm hòa vốn.',
            selection: 'Chọn duy nhất một trong 8 cấu hình trên tập 2016-2020; 2021-2023 và 2024-2025 là hai tập kiểm chứng tách biệt.',
            warning: 'Lợi nhuận lịch sử không bảo đảm lợi nhuận tương lai. Cấu hình được chọn từ train không được xem là đạt chuẩn nếu một holdout âm.'
        },
        economics: {
            ...ECONOMICS,
            breakEvenHitRate: ECONOMICS.betCount / ECONOMICS.payoutMultiplier
        },
        rows: allRows.length,
        methodIds,
        selection: {
            train: { startDate: TRAIN[0], endDate: TRAIN[1] },
            validation: { startDate: VALIDATION[0], endDate: VALIDATION[1] },
            holdout: { startDate: HOLDOUT[0], endDate: HOLDOUT[1] },
            chosenId: chosen.id
        },
        candidates: outputCandidates,
        chosen: {
            id: chosen.id,
            scoreMode: chosen.scoreMode,
            gate: chosen.gate,
            train: chosen.train,
            validation: chosen.validation,
            holdout: chosen.holdout,
            all: chosen.all,
            monthly: Object.values(chosen.rows.reduce((result, row) => {
                const key = row.date.slice(0, 7);
                const bucket = result[key] || { key, rows: [] };
                bucket.rows.push(row);
                result[key] = bucket;
                return result;
            }, {})).map(bucket => ({ key: bucket.key, ...summarize(bucket.rows, ECONOMICS) }))
        },
        decision
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.resolve('reports', `walkforward-wilson-gated-de-${stamp}.json`);
    const markdownPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const lines = [
        '# Walk-forward Wilson gate - Đề',
        '',
        'Nghiên cứu độc lập, không thay đổi phương pháp production.',
        '',
        `- Nguồn: ${report.source}`, 
        `- Số ngày: ${report.rows}; dàn cố định 30 số, vốn 1.000K/số, ăn 84.`,
        `- Hòa vốn: ${formatPercent(report.economics.breakEvenHitRate)}.`,
        `- Chọn trên 2016-2020: ${chosen.id}.`,
        `- Kết luận: ${decision}.`,
        '',
        '| Giai đoạn | Ngày lịch | Ngày đánh | Bỏ qua | Trúng | Tỷ lệ | Profit | ROI | Chuỗi W/L |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        rowLine('Train 2016-2020', chosen.train),
        rowLine('Validation 2021-2023', chosen.validation),
        rowLine('Holdout 2024-2025', chosen.holdout),
        rowLine('Toàn bộ 2016-2025', chosen.all),
        '',
        '## Tất cả cấu hình đã thử',
        '',
        '| Cấu hình | Train profit | Validation profit | Holdout profit | Holdout hit | Holdout ngày đánh |',
        '| --- | ---: | ---: | ---: | ---: | ---: |',
        ...outputCandidates.map(candidate => `| ${candidate.id} | ${formatK(candidate.train.profitK)} | ${formatK(candidate.validation.profitK)} | ${formatK(candidate.holdout.profitK)} | ${formatPercent(candidate.holdout.hitRate)} | ${candidate.holdout.playedDays} |`)
    ];
    fs.writeFileSync(markdownPath, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({
        jsonPath,
        markdownPath,
        decision,
        chosen: {
            id: chosen.id,
            train: chosen.train,
            validation: chosen.validation,
            holdout: chosen.holdout,
            all: chosen.all
        },
        candidates: outputCandidates.map(candidate => ({
            id: candidate.id,
            trainProfitK: candidate.train.profitK,
            validationProfitK: candidate.validation.profitK,
            holdoutProfitK: candidate.holdout.profitK,
            holdoutPlayedDays: candidate.holdout.playedDays
        }))
    }, null, 2));
}

main();
