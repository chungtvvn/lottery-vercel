#!/usr/bin/env node
'use strict';

// Builds a clean audit artifact from freshly generated strict-PIT inputs only.
// It deliberately never reads historical research reports or cached stress results.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DE_CACHE = path.join(ROOT, 'lib', 'data', 'statistics', 'cached_prediction_history_performance_2026.json');

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, ...value] = argument.replace(/^--/, '').split('=');
        return [key, value.join('=') || '1'];
    }));
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function isoWeekKey(dateText) {
    const date = new Date(`${dateText}T00:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function seedRandom(seed) {
    let state = Number(seed) >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function percentile(values, probability) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((left, right) => left - right);
    const index = (sorted.length - 1) * probability;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(rows) {
    const base = rows.reduce((summary, row) => {
        summary.days += 1;
        summary.hits += Number(row.hits || 0);
        summary.stakeK += Number(row.stakeK || 0);
        summary.payoutK += Number(row.payoutK || 0);
        summary.profitK += Number(row.profitK || 0);
        if (Number(row.profitK || 0) > 0) summary.winDays += 1;
        if (Number(row.profitK || 0) < 0) summary.lossDays += 1;
        return summary;
    }, { days: 0, hits: 0, stakeK: 0, payoutK: 0, profitK: 0, winDays: 0, lossDays: 0 });
    let currentWin = 0;
    let currentLoss = 0;
    let longestWin = 0;
    let longestLoss = 0;
    for (const row of rows) {
        if (Number(row.profitK || 0) > 0) {
            currentWin += 1;
            currentLoss = 0;
            longestWin = Math.max(longestWin, currentWin);
        } else if (Number(row.profitK || 0) < 0) {
            currentLoss += 1;
            currentWin = 0;
            longestLoss = Math.max(longestLoss, currentLoss);
        } else {
            currentWin = 0;
            currentLoss = 0;
        }
    }
    return {
        ...base,
        hitRate: base.days ? base.hits / base.days : 0,
        winRate: base.days ? base.winDays / base.days : 0,
        roi: base.stakeK ? base.profitK / base.stakeK : 0,
        averageHits: base.days ? base.hits / base.days : 0,
        longestWin,
        longestLoss
    };
}

function groupRows(rows, grouping) {
    const groups = new Map();
    for (const row of rows) {
        const key = grouping === 'weekly' ? isoWeekKey(row.date) : row.date.slice(0, 7);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return [...groups.entries()].map(([period, values]) => ({ period, ...summarize(values) }));
}

function bootstrap(rows, { horizonDays, iterations, blockSize, seed }) {
    const random = seedRandom(seed);
    const samples = [];
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        let cursor = 0;
        const sample = [];
        while (cursor < horizonDays) {
            const start = Math.floor(random() * rows.length);
            for (let offset = 0; offset < blockSize && cursor < horizonDays; offset += 1) {
                sample.push(rows[(start + offset) % rows.length]);
                cursor += 1;
            }
        }
        samples.push(summarize(sample));
    }
    return {
        iterations,
        horizonDays,
        blockSize,
        probabilityProfit: samples.filter(item => item.profitK > 0).length / iterations,
        profitP05K: percentile(samples.map(item => item.profitK), 0.05),
        profitMedianK: percentile(samples.map(item => item.profitK), 0.5),
        profitP95K: percentile(samples.map(item => item.profitK), 0.95),
        roiMedian: percentile(samples.map(item => item.roi), 0.5),
        winRateMedian: percentile(samples.map(item => item.winRate), 0.5),
        longestLossP95: percentile(samples.map(item => item.longestLoss), 0.95)
    };
}

function csvEscape(value) {
    const text = value === undefined || value === null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows) {
    const columns = ['methodId', 'period', 'days', 'hits', 'winDays', 'lossDays', 'stakeK', 'payoutK', 'profitK', 'roi', 'winRate', 'hitRate', 'longestWin', 'longestLoss'];
    const body = rows.map(row => columns.map(column => csvEscape(row[column])).join(','));
    fs.writeFileSync(file, `${columns.join(',')}\n${body.join('\n')}\n`);
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatMoney(value) {
    return `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}K`;
}

function toDeRows(cache) {
    const report = cache.methods?.dedupEdge75Hold70;
    if (!report) throw new Error('Cache Đề không có dedupEdge75Hold70. Hãy sinh lại strict PIT trước.');
    return (report.daily || []).map(row => {
        const stakeK = (Number(row.betNumberDays || 0) + Number(row.excludedNumberDays || 0)) * 10;
        const profitK = Number(row.profitK || 0);
        return {
            date: row.date || row.period,
            hits: Number(row.hitDays || 0),
            stakeK,
            payoutK: profitK + stakeK,
            profitK
        };
    }).sort((left, right) => left.date.localeCompare(right.date));
}

function toLotoRows(report) {
    const details = report.dailyDetailsByWindow?.dateRange || [];
    if (!details.length) throw new Error('Report Lô không có dailyDetailsByWindow.dateRange.');
    const accepted = details.filter(row => /^(rrfParallelBlock85Small65|dedupEdge75PitHold70)/.test(String(row.methodId || '')));
    const groups = new Map();
    for (const row of accepted) {
        if (!groups.has(row.methodId)) groups.set(row.methodId, []);
        groups.get(row.methodId).push({
            date: row.date,
            hits: Number(row.hits || 0),
            stakeK: Number(row.stakeK || 0),
            payoutK: Number(row.payoutK || 0),
            profitK: Number(row.profitK || 0)
        });
    }
    return Object.fromEntries([...groups.entries()].map(([methodId, rows]) => [
        methodId,
        rows.sort((left, right) => left.date.localeCompare(right.date))
    ]));
}

function markdown(report) {
    const lines = [
        '# Báo cáo làm mới strict PIT: Đề Edge75 và Lô',
        '',
        `- Raw/đầu vào Đề: ${report.sources.deCache}.`,
        `- Raw/đầu vào Lô: ${report.sources.lotoReport}.`,
        `- Dữ liệu thực tế: ${report.period.startDate} đến ${report.period.endDate}.`,
        `- Mô phỏng: ${report.future.startDate} đến ${report.future.endDate} (${report.future.horizonDays} ngày).`,
        '- Backtest tái sinh dữ liệu prefix trước từng ngày. Stress test chỉ bootstrap các kết quả strict PIT đã quan sát, không tạo lời khẳng định rằng kết quả tương lai được biết trước.',
        '',
        '## Tổng hợp',
        '',
        '| Nhóm | Phương pháp | Ngày | Hit | Tỷ lệ hit | Profit | ROI | Thắng dài | Thua dài |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|'
    ];
    for (const [methodId, item] of Object.entries(report.methods)) {
        const summary = item.summary;
        lines.push(`| ${item.kind} | ${methodId} | ${summary.days} | ${summary.hits} | ${formatPercent(summary.hitRate)} | ${formatMoney(summary.profitK)} | ${formatPercent(summary.roi)} | ${summary.longestWin} | ${summary.longestLoss} |`);
    }
    lines.push('', '## Stress test tới cuối năm', '', '| Phương pháp | Model | P(lãi) | P05 Profit | Trung vị | P95 Profit | ROI trung vị | Thua dài P95 |', '|---|---|---:|---:|---:|---:|---:|---:|');
    for (const [methodId, item] of Object.entries(report.methods)) {
        for (const stress of item.stress) {
            lines.push(`| ${methodId} | block ${stress.blockSize} ngày | ${formatPercent(stress.probabilityProfit)} | ${formatMoney(stress.profitP05K)} | ${formatMoney(stress.profitMedianK)} | ${formatMoney(stress.profitP95K)} | ${formatPercent(stress.roiMedian)} | ${Math.round(stress.longestLossP95)} |`);
        }
    }
    lines.push('', '## Ghi chú', '', '- Kết quả stress là phân phối lấy mẫu lại chuỗi ngày strict PIT, giữ một phần phụ thuộc theo block 7 và 28 ngày.', '- Không dùng report/backtest/stress cũ; checksum đầu vào được lưu trong JSON.');
    return `${lines.join('\n')}\n`;
}

function main() {
    const args = parseArgs();
    const lotoFile = args.get('lotoReport');
    if (!lotoFile) throw new Error('Cần --lotoReport=/đường/dẫn/report_lô.json');
    const cache = readJson(DE_CACHE);
    if (cache.source?.strictPointInTime !== true) {
        throw new Error('Cache Đề hiện không phải strict PIT; từ chối lập báo cáo.');
    }
    const lotoPath = path.resolve(lotoFile);
    const lotoReport = readJson(lotoPath);
    if (lotoReport.methodology?.strictPointInTime !== true) {
        throw new Error('Report Lô hiện không phải strict PIT; từ chối lập báo cáo.');
    }
    const deRows = toDeRows(cache);
    const lotoRows = toLotoRows(lotoReport);
    const horizonDays = Math.max(1, Number(args.get('horizonDays') || 161));
    const iterations = Math.max(1000, Number(args.get('iterations') || 5000));
    const methods = {
        dedupEdge75Hold70: { kind: 'Đề', rows: deRows }
    };
    for (const [methodId, rows] of Object.entries(lotoRows)) {
        methods[methodId] = { kind: 'Lô', rows };
    }
    for (const item of Object.values(methods)) {
        item.summary = summarize(item.rows);
        item.daily = item.rows.map(row => ({ period: row.date, ...summarize([row]) }));
        item.weekly = groupRows(item.rows, 'weekly');
        item.monthly = groupRows(item.rows, 'monthly');
        item.stress = [7, 28].map((blockSize, index) => bootstrap(item.rows, {
            horizonDays,
            iterations,
            blockSize,
            seed: 20260723 + index * 101 + item.rows.length
        }));
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = path.join(ROOT, 'outputs', `pit-edge75-rerun-${stamp.slice(0, 10)}`);
    fs.mkdirSync(outputDir, { recursive: true });
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            de: 'Lịch sử D-1, Edge khử trùng 75% nền, strict prefix regenerated before each prediction.',
            loto: '27 vị trí, strict prefix regenerated before each prediction per position; chỉ Top RRF và Edge75 PIT có trong report mới.',
            stress: 'Moving-block bootstrap từ các dòng strict PIT đã quan sát; không phải dự báo tất định.'
        },
        sources: {
            deCache: path.relative(ROOT, DE_CACHE),
            deCacheSha256: sha256(DE_CACHE),
            lotoReport: path.relative(ROOT, lotoPath),
            lotoReportSha256: sha256(lotoPath)
        },
        period: { startDate: deRows[0]?.date, endDate: deRows.at(-1)?.date },
        future: { startDate: args.get('futureStart') || '2026-07-23', endDate: args.get('futureEnd') || '2026-12-31', horizonDays, iterations },
        methods
    };
    const jsonPath = path.join(outputDir, 'bao_cao_strict_pit_edge75_de_lo.json');
    const markdownPath = path.join(outputDir, 'bao_cao_strict_pit_edge75_de_lo.md');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(markdownPath, markdown(report));
    const csvRows = [];
    for (const [methodId, item] of Object.entries(methods)) {
        for (const [periodName, rows] of Object.entries({ daily: item.daily, weekly: item.weekly, monthly: item.monthly })) {
            csvRows.push(...rows.map(row => ({ methodId, periodType: periodName, ...row })));
        }
    }
    const csvPath = path.join(outputDir, 'chi_tiet_ngay_tuan_thang.csv');
    const columns = ['methodId', 'periodType', 'period', 'days', 'hits', 'winDays', 'lossDays', 'stakeK', 'payoutK', 'profitK', 'roi', 'winRate', 'hitRate', 'longestWin', 'longestLoss'];
    fs.writeFileSync(csvPath, `${columns.join(',')}\n${csvRows.map(row => columns.map(column => csvEscape(row[column])).join(',')).join('\n')}\n`);
    console.log(JSON.stringify({ outputDir, jsonPath, markdownPath, csvPath, summaries: Object.fromEntries(Object.entries(methods).map(([id, item]) => [id, item.summary])) }, null, 2));
}

try {
    main();
} catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
}
