#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const lotteryService = require('../lib/services/lotteryService');
const {
    flattenStats,
    formatIsoDate,
    generateStats,
    mergeEntries,
    normalizeRaw
} = require('../lib/research/strictPitStats');

const ROOT = path.join(__dirname, '..');

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value ?? '1'];
    }));
    return {
        warmupDraws: Math.max(0, Number(args.get('warmupDraws') || 365)),
        startDate: String(args.get('startDate') || '').trim(),
        endDate: String(args.get('endDate') || '').trim()
    };
}

function percentile(values, probability) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((left, right) => left - right);
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarizeRows(rows) {
    const values = field => rows.map(row => row[field]);
    const sum = field => values(field).reduce((total, value) => total + value, 0);
    const totalDays = rows.length;
    const summarizeField = field => ({
        total: sum(field),
        averagePerDay: totalDays ? sum(field) / totalDays : 0,
        medianPerDay: percentile(values(field), 0.5),
        p95PerDay: percentile(values(field), 0.95),
        maximumPerDay: values(field).length ? Math.max(...values(field)) : 0,
        daysWithAtLeastOne: rows.filter(row => row[field] > 0).length,
        dayRate: totalDays ? rows.filter(row => row[field] > 0).length / totalDays : 0
    });
    return {
        totalDays,
        reachedRecord: summarizeField('reachedRecord'),
        touchedExistingRecord: summarizeField('touchedExistingRecord'),
        brokeRecord: summarizeField('brokeRecord'),
        initializedRecord: summarizeField('initializedRecord')
    };
}

function wilson(successes, trials, z = 1.96) {
    if (!trials) return { rate: 0, lower: 0, upper: 0 };
    const rate = successes / trials;
    const z2 = z * z;
    const denominator = 1 + z2 / trials;
    const center = (rate + z2 / (2 * trials)) / denominator;
    const margin = z * Math.sqrt((rate * (1 - rate) + z2 / (4 * trials)) / trials) / denominator;
    return {
        rate,
        lower: Math.max(0, center - margin),
        upper: Math.min(1, center + margin)
    };
}

function summarizeConditionalProbabilities(rows) {
    const sum = field => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
    const formationTrials = sum('notYetFormedAtStart');
    const formations = sum('initializedRecord');
    const breakTrials = sum('recordBreakExposure');
    const breaksNext = sum('recordBrokenNextDay');
    return {
        formationPerUnformedKeyDay: {
            successes: formations,
            trials: formationTrials,
            ...wilson(formations, formationTrials)
        },
        breakNextGivenAtRecord: {
            successes: breaksNext,
            trials: breakTrials,
            ...wilson(breaksNext, breakTrials)
        }
    };
}

function buildGroupIndex(stats) {
    const groups = [
        ['number', stats.numberStats],
        ['head_tail', stats.headTailStats],
        ['sum_difference', stats.sumDiffStats]
    ];
    const groupByKey = new Map();
    for (const [group, source] of groups) {
        for (const key of flattenStats(source).keys()) groupByKey.set(key, group);
    }
    return groupByKey;
}

function buildDailyRecordEvents(raw, stats) {
    const entries = mergeEntries(stats);
    const groupByKey = buildGroupIndex(stats);
    const dateIndex = new Map(raw.map((row, index) => [row._iso, index]));
    const daily = raw.map(row => ({
        date: row._iso,
        reachedRecord: 0,
        touchedExistingRecord: 0,
        brokeRecord: 0,
        initializedRecord: 0,
        recordBreakExposure: 0,
        recordBrokenNextDay: 0,
        notYetFormedAtStart: 0,
        groups: {}
    }));
    const diagnostics = {
        totalKeys: entries.size,
        keysWithStreaks: 0,
        streakRows: 0,
        invalidStreakRows: 0,
        observationDays: 0
    };

    const bump = (row, field, group) => {
        row[field]++;
        if (!row.groups[group]) {
            row.groups[group] = {
                reachedRecord: 0,
                touchedExistingRecord: 0,
                brokeRecord: 0,
                initializedRecord: 0
            };
        }
        row.groups[group][field]++;
    };

    for (const [key, stat] of entries) {
        const streaks = (stat.streaks || []).filter(streak => Number(streak?.length) > 0);
        if (!streaks.length) continue;
        diagnostics.keysWithStreaks++;
        diagnostics.streakRows += streaks.length;
        const minimumFormedLength = Math.min(...streaks.map(streak => Number(streak.length)));
        const observations = new Map();

        for (const streak of streaks) {
            const finalLength = Number(streak.length);
            const endIso = formatIsoDate(streak.endDate);
            const endIndex = dateIndex.get(endIso);
            if (!Number.isInteger(endIndex) || finalLength < minimumFormedLength) {
                diagnostics.invalidStreakRows++;
                continue;
            }
            for (let currentLength = minimumFormedLength; currentLength <= finalLength; currentLength++) {
                const index = endIndex - (finalLength - currentLength);
                if (index < 0 || index >= raw.length) continue;
                observations.set(index, Math.max(observations.get(index) || 0, currentLength));
            }
        }

        const group = groupByKey.get(key) || 'other';
        let runningRecord = 0;
        const orderedObservations = [...observations].sort((left, right) => left[0] - right[0]);
        for (let observationIndex = 0; observationIndex < orderedObservations.length; observationIndex++) {
            const [index, currentLength] = orderedObservations[observationIndex];
            diagnostics.observationDays++;
            const row = daily[index];
            if (runningRecord === 0) {
                bump(row, 'initializedRecord', group);
                runningRecord = currentLength;
                continue;
            }
            const recordBeforeToday = runningRecord;
            if (currentLength === runningRecord) {
                bump(row, 'reachedRecord', group);
                bump(row, 'touchedExistingRecord', group);
            }
            if (currentLength > runningRecord) {
                // A new super-record also reaches the maximum as observed after today's result.
                bump(row, 'reachedRecord', group);
                bump(row, 'brokeRecord', group);
                runningRecord = currentLength;
            }
            if (currentLength >= recordBeforeToday) {
                row.recordBreakExposure++;
                const nextObservation = orderedObservations[observationIndex + 1];
                if (nextObservation && nextObservation[0] === index + 1 && nextObservation[1] > currentLength) {
                    row.recordBrokenNextDay++;
                }
            }
        }
    }

    let formedKeys = 0;
    for (const row of daily) {
        row.notYetFormedAtStart = Math.max(0, entries.size - formedKeys);
        formedKeys += row.initializedRecord;
    }

    return { daily, diagnostics };
}

function groupSummary(rows) {
    const groupNames = new Set();
    for (const row of rows) {
        for (const group of Object.keys(row.groups || {})) groupNames.add(group);
    }
    return [...groupNames].sort().map(group => {
        const normalized = rows.map(row => ({
            reachedRecord: row.groups?.[group]?.reachedRecord || 0,
            touchedExistingRecord: row.groups?.[group]?.touchedExistingRecord || 0,
            brokeRecord: row.groups?.[group]?.brokeRecord || 0,
            initializedRecord: row.groups?.[group]?.initializedRecord || 0
        }));
        return { group, ...summarizeRows(normalized) };
    });
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatNumber(value, digits = 3) {
    return Number(value || 0).toLocaleString('vi-VN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function renderMarkdown(report) {
    const metricRows = [
        ['Đạt/chạm mốc hiện hành (gồm cả ngày phá)', report.summary.reachedRecord],
        ['Chạm lại đúng kỷ lục cũ', report.summary.touchedExistingRecord],
        ['Phá kỷ lục cũ, lập siêu kỷ lục mới', report.summary.brokeRecord],
        ['Khởi tạo kỷ lục lần đầu', report.summary.initializedRecord]
    ];
    const lines = [
        '# Thống kê chuỗi đạt và phá siêu kỷ lục theo ngày',
        '',
        `- Raw R2: ${report.source.firstDate} -> ${report.source.latestDate} (${report.source.days.toLocaleString('vi-VN')} ngày).`,
        `- Khoảng đánh giá: ${report.evaluation.startDate} -> ${report.evaluation.endDate} (${report.summary.totalDays.toLocaleString('vi-VN')} ngày).`,
        `- Warm-up: ${report.evaluation.warmupDraws.toLocaleString('vi-VN')} kỳ quay; sự kiện warm-up vẫn dùng để dựng kỷ lục nhưng không vào mẫu trung bình.`,
        `- Đơn vị chuỗi: key thống kê hợp lệ của hệ thống (${report.diagnostics.keysWithStreaks.toLocaleString('vi-VN')}/${report.diagnostics.totalKeys.toLocaleString('vi-VN')} key có streak).`,
        '',
        '## Tổng hợp',
        '',
        '| Chỉ số | Tổng sự kiện | TB/ngày | Trung vị | P95 | Cao nhất/ngày | Ngày có ≥1 | Tỷ lệ ngày |',
        '|---|---:|---:|---:|---:|---:|---:|---:|',
        ...metricRows.map(([label, metric]) => `| ${label} | ${metric.total.toLocaleString('vi-VN')} | ${formatNumber(metric.averagePerDay)} | ${formatNumber(metric.medianPerDay, 1)} | ${formatNumber(metric.p95PerDay, 1)} | ${metric.maximumPerDay.toLocaleString('vi-VN')} | ${metric.daysWithAtLeastOne.toLocaleString('vi-VN')} | ${formatPercent(metric.dayRate)} |`),
        '',
        '## Theo năm',
        '',
        '| Năm | Ngày | Đạt mốc/ngày | Phá KL/ngày | Ngày có phá KL | Tỷ lệ ngày phá KL |',
        '|---:|---:|---:|---:|---:|---:|',
        ...report.byYear.map(row => `| ${row.year} | ${row.totalDays.toLocaleString('vi-VN')} | ${formatNumber(row.reachedRecord.averagePerDay)} | ${formatNumber(row.brokeRecord.averagePerDay)} | ${row.brokeRecord.daysWithAtLeastOne.toLocaleString('vi-VN')} | ${formatPercent(row.brokeRecord.dayRate)} |`),
        '',
        '## Theo nhóm thống kê',
        '',
        '| Nhóm | Đạt mốc/ngày | Phá KL/ngày | Tổng phá KL |',
        '|---|---:|---:|---:|',
        ...report.byGroup.map(row => `| ${row.group} | ${formatNumber(row.reachedRecord.averagePerDay)} | ${formatNumber(row.brokeRecord.averagePerDay)} | ${row.brokeRecord.total.toLocaleString('vi-VN')} |`),
        '',
        '## Xác suất có điều kiện',
        '',
        `- Khởi tạo trên mỗi key chưa hình thành/ngày: ${formatPercent(report.conditionalProbabilities.formationPerUnformedKeyDay.rate)} (Wilson 95%: ${formatPercent(report.conditionalProbabilities.formationPerUnformedKeyDay.lower)}–${formatPercent(report.conditionalProbabilities.formationPerUnformedKeyDay.upper)}; ${report.conditionalProbabilities.formationPerUnformedKeyDay.successes.toLocaleString('vi-VN')}/${report.conditionalProbabilities.formationPerUnformedKeyDay.trials.toLocaleString('vi-VN')}).`,
        `- Phá mốc ở kỳ kế tiếp khi key đang tại kỷ lục: ${formatPercent(report.conditionalProbabilities.breakNextGivenAtRecord.rate)} (Wilson 95%: ${formatPercent(report.conditionalProbabilities.breakNextGivenAtRecord.lower)}–${formatPercent(report.conditionalProbabilities.breakNextGivenAtRecord.upper)}; ${report.conditionalProbabilities.breakNextGivenAtRecord.successes.toLocaleString('vi-VN')}/${report.conditionalProbabilities.breakNextGivenAtRecord.trials.toLocaleString('vi-VN')}).`,
        '',
        '## Định nghĩa',
        '',
        '- **Đạt mốc:** độ dài active trong ngày bằng kỷ lục đã có, hoặc vừa vượt kỷ lục để trở thành mức tối đa mới.',
        '- **Chạm lại:** độ dài active đúng bằng kỷ lục cũ, không làm thay đổi kỷ lục.',
        '- **Phá kỷ lục:** độ dài active lớn hơn kỷ lục đã biết đến hết ngày trước đó. Nếu cùng run tiếp tục tăng ở ngày sau, ngày đó là một lần phá mới nữa.',
        '- **Khởi tạo:** lần đầu key hình thành trong lịch sử; chưa có mốc cũ nên không tính là phá kỷ lục.',
        '- Đây là thống kê theo key pattern. Các key tương quan hoặc có cùng tập số vẫn được tính riêng như trong hệ thống hiện tại.'
    ];
    return `${lines.join('\n')}\n`;
}

async function main() {
    const config = parseArgs();
    await lotteryService.loadRawData();
    const raw = normalizeRaw(lotteryService.getRawData());
    if (!raw.length) throw new Error('Raw R2 rỗng.');

    console.log(`[SuperRecord] Sinh thống kê đầy đủ từ ${raw.length} ngày R2...`);
    const stats = await generateStats(raw, true);
    const { daily, diagnostics } = buildDailyRecordEvents(raw, stats);
    const defaultStartIndex = Math.min(config.warmupDraws, Math.max(0, raw.length - 1));
    const startDate = config.startDate || raw[defaultStartIndex]._iso;
    const endDate = config.endDate || raw.at(-1)._iso;
    const evaluationRows = daily.filter(row => row.date >= startDate && row.date <= endDate);
    const byYearMap = new Map();
    for (const row of evaluationRows) {
        const year = row.date.slice(0, 4);
        if (!byYearMap.has(year)) byYearMap.set(year, []);
        byYearMap.get(year).push(row);
    }

    const report = {
        generatedAt: new Date().toISOString(),
        source: {
            firstDate: raw[0]._iso,
            latestDate: raw.at(-1)._iso,
            days: raw.length,
            statsGenerationSeconds: stats.elapsedMs / 1000
        },
        evaluation: {
            startDate,
            endDate,
            warmupDraws: config.warmupDraws
        },
        diagnostics,
        summary: summarizeRows(evaluationRows),
        conditionalProbabilities: summarizeConditionalProbabilities(evaluationRows),
        byYear: [...byYearMap].map(([year, rows]) => ({
            year: Number(year),
            ...summarizeRows(rows),
            conditionalProbabilities: summarizeConditionalProbabilities(rows)
        })),
        byGroup: groupSummary(evaluationRows)
    };

    const timestamp = report.generatedAt.replace(/[:.]/g, '-');
    const reportDir = path.join(ROOT, 'reports');
    fs.mkdirSync(reportDir, { recursive: true });
    const jsonPath = path.join(reportDir, `daily-super-records-${timestamp}.json`);
    const markdownPath = path.join(reportDir, `daily-super-records-${timestamp}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(markdownPath, renderMarkdown(report));

    console.log(JSON.stringify({
        jsonPath,
        markdownPath,
        source: report.source,
        evaluation: report.evaluation,
        summary: report.summary
    }, null, 2));
}

if (require.main === module) {
    main().catch(error => {
        console.error(error?.stack || error);
        process.exit(1);
    });
}

module.exports = {
    buildDailyRecordEvents,
    summarizeRows
};
