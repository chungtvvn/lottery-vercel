#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    EVENT_TYPES,
    buildDailyLedgerRow
} = require('../lib/research/chainProtectionLedger');

const ROOT = path.join(__dirname, '..');
const DEFAULT_INPUTS = [
    'reports/research_true_pit_strategies_2026-07-18T05-07-58-141Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-10-27-615Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-13-50-218Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-17-18-007Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-20-47-671Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-24-29-803Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-28-05-368Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-32-38-749Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-37-44-713Z.json',
    'reports/research_true_pit_strategies_2026-07-18T05-42-58-943Z.json',
    'reports/research_true_pit_strategies_2026-07-18T08-07-35-994Z.json',
    'reports/research_true_pit_strategies_2026-07-18T08-15-14-027Z.json',
    'reports/research_true_pit_strategies_2026-07-16T17-18-22-555Z.json'
];

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value ?? '1'];
    }));
    return {
        inputs: args.has('inputs')
            ? String(args.get('inputs')).split(',').map(value => value.trim()).filter(Boolean)
            : DEFAULT_INPUTS,
        outputPrefix: String(args.get('outputPrefix') || 'chain-protection-opportunities')
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

function summarizeDaily(rows) {
    const metric = field => {
        const values = rows.map(row => Number(row[field] || 0));
        const total = values.reduce((sum, value) => sum + value, 0);
        return {
            total,
            average: rows.length ? total / rows.length : 0,
            median: percentile(values, 0.5),
            p95: percentile(values, 0.95),
            maximum: values.length ? Math.max(...values) : 0
        };
    };
    return {
        days: rows.length,
        rawOpportunities: metric('rawOpportunities'),
        deduplicatedOpportunities: metric('deduplicatedOpportunities'),
        events: metric('events'),
        protectedNumbers: metric('protectedNumbers')
    };
}

function summarizeOpportunities(opportunities) {
    const trials = opportunities.length;
    const events = opportunities.filter(row => row.eventOccurred).length;
    const expectedEvents = opportunities.reduce((sum, row) => sum + row.setSize / 100, 0);
    const interval = wilson(events, trials);
    const expectedRate = trials ? expectedEvents / trials : 0;
    return {
        trials,
        events,
        eventRate: interval.rate,
        wilsonLower: interval.lower,
        wilsonUpper: interval.upper,
        expectedRate,
        absoluteLift: interval.rate - expectedRate,
        relativeLift: expectedRate > 0 ? interval.rate / expectedRate : null,
        averageSetSize: trials
            ? opportunities.reduce((sum, row) => sum + row.setSize, 0) / trials
            : 0
    };
}

function groupOpportunities(rows, keyFn) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return [...groups.entries()]
        .map(([key, values]) => ({ key, ...summarizeOpportunities(values) }))
        .sort((left, right) => right.trials - left.trials || left.key.localeCompare(right.key));
}

function loadRows(input) {
    const absolutePath = path.resolve(ROOT, input);
    const report = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    const dateStep = Number(report.options?.dateStep || 1);
    const rows = (report.rows || [])
        .filter(row => Array.isArray(row.candidateDiagnostics))
        .map(row => ({
            ...buildDailyLedgerRow(row),
            source: path.relative(ROOT, absolutePath),
            sampling: dateStep === 1 ? 'full-daily' : `sampled-step-${dateStep}`
        }));
    return rows;
}

function formatNumber(value, digits = 2) {
    return Number(value || 0).toLocaleString('vi-VN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function formatPercent(value) {
    return `${formatNumber(Number(value || 0) * 100)}%`;
}

function metricTable(rows) {
    return rows.map(row => `| ${row.key} | ${row.trials.toLocaleString('vi-VN')} | ${row.events.toLocaleString('vi-VN')} | ${formatPercent(row.eventRate)} | ${formatPercent(row.expectedRate)} | ${formatPercent(row.absoluteLift)} | ${row.relativeLift === null ? '-' : `${formatNumber(row.relativeLift)}x`} | ${formatNumber(row.averageSetSize)} |`).join('\n');
}

function renderMarkdown(report) {
    const daily = report.daily;
    const lines = [
        '# Ledger cơ hội bảo vệ chuỗi theo strict point-in-time',
        '',
        `- Dữ liệu: ${report.range.startDate} -> ${report.range.endDate}; ${daily.days.toLocaleString('vi-VN')} ngày quan sát.`,
        '- 2014-2025 là mẫu mỗi 10 ngày; 2026 là replay đầy đủ từng ngày. Không được diễn giải mẫu 2014-2025 như tổng số ngày lịch.',
        '- Cơ hội được tạo hoàn toàn từ candidate trước kết quả. Kết quả thực tế chỉ dùng sau đó để kết toán event.',
        '- Khử trùng chính: cùng loại event + cùng family + cùng tập số chỉ giữ đại diện mạnh nhất.',
        '',
        '## Phân phối mỗi ngày quan sát',
        '',
        '| Chỉ số | Tổng | TB/ngày | Trung vị | P95 | Cao nhất |',
        '|---|---:|---:|---:|---:|---:|',
        `| Cơ hội thô | ${daily.rawOpportunities.total.toLocaleString('vi-VN')} | ${formatNumber(daily.rawOpportunities.average)} | ${formatNumber(daily.rawOpportunities.median, 1)} | ${formatNumber(daily.rawOpportunities.p95, 1)} | ${daily.rawOpportunities.maximum.toLocaleString('vi-VN')} |`,
        `| Cơ hội đã khử trùng | ${daily.deduplicatedOpportunities.total.toLocaleString('vi-VN')} | ${formatNumber(daily.deduplicatedOpportunities.average)} | ${formatNumber(daily.deduplicatedOpportunities.median, 1)} | ${formatNumber(daily.deduplicatedOpportunities.p95, 1)} | ${daily.deduplicatedOpportunities.maximum.toLocaleString('vi-VN')} |`,
        `| Event thực tế | ${daily.events.total.toLocaleString('vi-VN')} | ${formatNumber(daily.events.average)} | ${formatNumber(daily.events.median, 1)} | ${formatNumber(daily.events.p95, 1)} | ${daily.events.maximum.toLocaleString('vi-VN')} |`,
        `| Số được phủ bởi mọi cảnh báo | ${daily.protectedNumbers.total.toLocaleString('vi-VN')} | ${formatNumber(daily.protectedNumbers.average)} | ${formatNumber(daily.protectedNumbers.median, 1)} | ${formatNumber(daily.protectedNumbers.p95, 1)} | ${daily.protectedNumbers.maximum.toLocaleString('vi-VN')} |`,
        '',
        '## Theo loại cơ hội',
        '',
        '| Loại | Cơ hội | Event | Tỷ lệ event | Xác suất nền theo độ rộng | Lift tuyệt đối | Lift tương đối | TB số/tập |',
        '|---|---:|---:|---:|---:|---:|---:|---:|',
        metricTable(report.byType),
        '',
        '## Theo family và loại',
        '',
        '| Cohort | Cơ hội | Event | Tỷ lệ event | Xác suất nền theo độ rộng | Lift tuyệt đối | Lift tương đối | TB số/tập |',
        '|---|---:|---:|---:|---:|---:|---:|---:|',
        metricTable(report.byTypeFamily),
        '',
        '## Kết luận dữ liệu nền',
        '',
        '- Không thể hard-veto toàn bộ cảnh báo: hợp các cảnh báo thường phủ gần đủ 100 số.',
        '- Tỷ lệ event phải so với xác suất nền `setSize/100`; tỷ lệ cao của tập rộng không tự động là tín hiệu tốt.',
        '- Bước kế tiếp là hiệu chỉnh Beta-Binomial phân cấp theo loại/family/độ rộng/độ dài và chỉ bảo vệ tín hiệu có cận tin cậy vượt nền.',
        ''
    ];
    return lines.join('\n');
}

function main() {
    const options = parseArgs();
    const rows = options.inputs.flatMap(loadRows).sort((left, right) => left.date.localeCompare(right.date));
    const uniqueRows = [...new Map(rows.map(row => [row.date, row])).values()];
    const opportunities = uniqueRows.flatMap(row => row.opportunities.map(opportunity => ({
        ...opportunity,
        date: row.date,
        actual: row.actual,
        sampling: row.sampling
    })));
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: 'strict-pit-opportunity-ledger-v1',
        inputs: options.inputs,
        range: {
            startDate: uniqueRows[0]?.date || '',
            endDate: uniqueRows[uniqueRows.length - 1]?.date || ''
        },
        daily: summarizeDaily(uniqueRows),
        byType: groupOpportunities(opportunities, row => row.eventType),
        byTypeFamily: groupOpportunities(opportunities, row => `${row.eventType}|${row.family}`),
        byYearType: groupOpportunities(opportunities, row => `${row.date.slice(0, 4)}|${row.eventType}`),
        bySamplingType: groupOpportunities(opportunities, row => `${row.sampling}|${row.eventType}`),
        dailyRows: uniqueRows.map(row => ({
            date: row.date,
            sampling: row.sampling,
            rawOpportunities: row.rawOpportunities,
            deduplicatedOpportunities: row.deduplicatedOpportunities,
            events: row.events,
            protectedNumbers: row.protectedNumbers,
            byType: row.byType
        }))
    };
    const jsonPath = path.join(ROOT, 'reports', `${options.outputPrefix}-${new Date().toISOString().slice(0, 10)}.json`);
    const markdownPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(markdownPath, `${renderMarkdown(report)}\n`);
    console.log(JSON.stringify({ jsonPath, markdownPath, days: uniqueRows.length }, null, 2));
}

main();
