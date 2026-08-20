#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv = process.argv.slice(2)) {
    const values = new Map(argv.map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        train: values.get('train'),
        holdouts: values.get('holdouts')
    };
}

function loadReports(value) {
    return String(value || '').split(',').map(item => item.trim()).filter(Boolean).map(filename => {
        const absolute = path.resolve(filename);
        const payload = JSON.parse(fs.readFileSync(absolute, 'utf8'));
        if (payload.options?.includeCandidateDiagnostics !== true) {
            throw new Error(`${absolute} thiếu candidateDiagnostics strict PIT.`);
        }
        return {
            year: Number(payload.options.startDate.slice(0, 4)),
            rows: payload.rows || [],
            filename: absolute
        };
    }).sort((left, right) => left.year - right.year);
}

function widthBucket(value) {
    const size = Number(value || 100);
    if (size <= 2) return '≤2 số';
    if (size <= 5) return '3-5 số';
    if (size <= 10) return '6-10 số';
    if (size <= 20) return '11-20 số';
    if (size <= 40) return '21-40 số';
    return '>40 số';
}

function frequencyBucket(value) {
    const frequency = Math.max(0, Number(value || 0));
    if (frequency === 0) return '0/năm';
    if (frequency < 0.25) return '<0,25/năm';
    if (frequency < 0.75) return '0,25-0,75/năm';
    if (frequency < 1.5) return '0,75-1,5/năm';
    if (frequency < 3) return '1,5-3/năm';
    return '≥3/năm';
}

function durationBucket(candidate = {}) {
    const average = Number(candidate.targetAvgLength);
    const target = Number(candidate.targetLen || 0);
    if (!Number.isFinite(average) || target <= 0) return 'không có mẫu';
    const excess = average - target;
    if (excess < 0.25) return 'dư <0,25 ngày';
    if (excess < 0.75) return 'dư 0,25-0,75 ngày';
    if (excess < 1.5) return 'dư 0,75-1,5 ngày';
    return 'dư ≥1,5 ngày';
}

function gapBucket(value) {
    const ratio = Number(value);
    if (!Number.isFinite(ratio)) return 'không có nhịp';
    if (ratio < 0.5) return '<0,5 nhịp';
    if (ratio < 1) return '0,5-1 nhịp';
    if (ratio < 1.5) return '1-1,5 nhịp';
    if (ratio < 2.5) return '1,5-2,5 nhịp';
    return '≥2,5 nhịp';
}

function descriptors(candidate = {}) {
    const family = String(candidate.family || 'other');
    const width = widthBucket(candidate.setSize);
    const targetFrequency = frequencyBucket(candidate.targetFrequencyPerYear);
    const baseFrequency = frequencyBucket(candidate.baseFrequencyPerYear);
    const duration = durationBucket(candidate);
    const targetGap = gapBucket(candidate.targetGapRatio);
    const baseGap = gapBucket(candidate.baseGapRatio);
    const record = String(candidate.recordState || 'unknown');
    return [
        ['family', family],
        ['width', width],
        ['record', record],
        ['targetFrequency', targetFrequency],
        ['baseFrequency', baseFrequency],
        ['duration', duration],
        ['targetGap', targetGap],
        ['baseGap', baseGap],
        ['family×targetFrequency', `${family} | ${targetFrequency}`],
        ['family×duration', `${family} | ${duration}`],
        ['family×targetGap', `${family} | ${targetGap}`],
        ['frequency×duration', `${targetFrequency} | ${duration}`],
        ['record×frequency', `${record} | ${targetFrequency}`],
        ['width×frequency', `${width} | ${targetFrequency}`]
    ].map(([feature, value]) => ({ id: `${feature}|${value}`, feature, value }));
}

function summarizeYear(report) {
    const aggregate = new Map();
    for (const row of report.rows) {
        const daily = new Map();
        for (const candidate of row.candidateDiagnostics || []) {
            if (candidate.state !== 'potential') continue;
            for (const descriptor of descriptors(candidate)) {
                if (!daily.has(descriptor.id)) {
                    daily.set(descriptor.id, {
                        ...descriptor,
                        count: 0,
                        observed: 0,
                        expected: 0
                    });
                }
                const current = daily.get(descriptor.id);
                current.count++;
                current.observed += Number(Boolean(candidate.observedExcluded));
                current.expected += Number(candidate.baseExclusionRate || 0);
            }
        }
        for (const current of daily.values()) {
            if (!aggregate.has(current.id)) {
                aggregate.set(current.id, {
                    id: current.id,
                    feature: current.feature,
                    value: current.value,
                    days: 0,
                    observed: 0,
                    expected: 0
                });
            }
            const target = aggregate.get(current.id);
            const divisor = Math.max(1, current.count);
            target.days++;
            target.observed += current.observed / divisor;
            target.expected += current.expected / divisor;
        }
    }
    for (const row of aggregate.values()) {
        row.edge = (row.observed - row.expected) / Math.max(1, row.days);
    }
    return aggregate;
}

function buildReport(trainReports, holdoutReports) {
    const train = trainReports.map(report => ({
        year: report.year,
        metrics: summarizeYear(report)
    }));
    const holdouts = holdoutReports.map(report => ({
        year: report.year,
        metrics: summarizeYear(report)
    }));
    const ids = new Set(train.flatMap(year => [...year.metrics.keys()]));
    const rows = [];
    for (const id of ids) {
        const annual = train.map(year => ({ year: year.year, row: year.metrics.get(id) }))
            .filter(item => item.row && item.row.days >= 6);
        if (annual.length < Math.ceil(train.length * 0.6)) continue;
        const first = annual[0].row;
        const edges = annual.map(item => item.row.edge);
        const meanEdge = edges.reduce((sum, value) => sum + value, 0) / edges.length;
        const variance = edges.length > 1
            ? edges.reduce((sum, value) => sum + (value - meanEdge) ** 2, 0) / (edges.length - 1)
            : 0;
        const positiveYears = edges.filter(value => value > 0).length;
        rows.push({
            id,
            feature: first.feature,
            value: first.value,
            trainYears: annual.length,
            positiveYears,
            positiveShare: positiveYears / annual.length,
            meanEdge,
            standardDeviation: Math.sqrt(variance),
            conservativeEdge: meanEdge - 0.67 * Math.sqrt(variance / annual.length),
            annual: annual.map(item => ({
                year: item.year,
                days: item.row.days,
                edge: item.row.edge
            })),
            holdouts: holdouts.map(year => {
                const row = year.metrics.get(id);
                return {
                    year: year.year,
                    days: row?.days || 0,
                    edge: row?.edge ?? null
                };
            })
        });
    }
    rows.sort((left, right) =>
        right.conservativeEdge - left.conservativeEdge ||
        right.positiveShare - left.positiveShare
    );
    return {
        generatedAt: new Date().toISOString(),
        trainYears: trainReports.map(report => report.year),
        holdoutYears: holdoutReports.map(report => report.year),
        rows
    };
}

function renderMarkdown(report) {
    const percent = value => value === null || value === undefined
        ? '-'
        : `${(Number(value) * 100).toFixed(2)}%`;
    const robust = report.rows.filter(row =>
        row.positiveShare >= 0.7 &&
        row.conservativeEdge > 0 &&
        row.holdouts.every(item => item.days < 6 || Number(item.edge) > 0)
    );
    const lines = [
        '# Độ bền của tần suất, độ dài và nhịp chuỗi tiềm năng',
        '',
        `- Train: ${report.trainYears.join(', ')}.`,
        `- Holdout: ${report.holdoutYears.join(', ')}.`,
        '- Edge dương nghĩa là tỷ lệ không hình thành cao hơn xác suất nền của đúng tập số.',
        '- Mỗi feature/cohort chỉ đóng góp tối đa một đơn vị mỗi ngày.',
        '',
        '## Tín hiệu bền qua train và cùng dấu trên holdout',
        '',
        '| Biến | Nhóm | Năm dương/train | Edge train | Cận bảo thủ | Holdout |',
        '|---|---|---:|---:|---:|---|',
        ...robust.slice(0, 40).map(row =>
            `| ${row.feature} | ${row.value} | ${row.positiveYears}/${row.trainYears} | ` +
            `${percent(row.meanEdge)} | ${percent(row.conservativeEdge)} | ` +
            `${row.holdouts.map(item => `${item.year}: ${percent(item.edge)}`).join('; ')} |`
        ),
        '',
        '## Kết luận sử dụng',
        '',
        robust.length
            ? `Có ${robust.length} cohort đạt điều kiện mô tả, nhưng chỉ nên dùng làm tín hiệu phụ sau shrinkage; không được coi từng candidate là mẫu độc lập.`
            : 'Không có cohort nào đủ ổn định để dùng làm tín hiệu loại độc lập.',
        '',
        'Nhịp `Gần nhất/TB cách` không được dùng theo quy tắc “đến hạn” nếu edge đổi dấu giữa các năm.',
        '',
        '> Backtest lịch sử không bảo đảm lợi nhuận tương lai.'
    ];
    return `${lines.join('\n')}\n`;
}

function main() {
    const options = parseArgs();
    if (!options.train || !options.holdouts) {
        throw new Error('Cần --train=file1,file2,... --holdouts=file1,file2,...');
    }
    const report = buildReport(loadReports(options.train), loadReports(options.holdouts));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputBase = path.join(__dirname, '..', 'reports', `potential-feature-stability-${stamp}`);
    fs.writeFileSync(`${outputBase}.json`, JSON.stringify(report, null, 2));
    fs.writeFileSync(`${outputBase}.md`, renderMarkdown(report));
    console.log(`${outputBase}.md`);
}

main();
