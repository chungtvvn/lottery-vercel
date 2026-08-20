#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { buildAuditRow, summarizeAudit } = require('../lib/research/exclusionFailureAudit');

const ROOT = path.join(__dirname, '..');
const SOURCES = {
    2014: 'reports/research_true_pit_strategies_2026-07-18T05-07-58-141Z.json',
    2015: 'reports/research_true_pit_strategies_2026-07-18T05-10-27-615Z.json',
    2016: 'reports/research_true_pit_strategies_2026-07-18T05-13-50-218Z.json',
    2017: 'reports/research_true_pit_strategies_2026-07-18T05-17-18-007Z.json',
    2018: 'reports/research_true_pit_strategies_2026-07-18T05-20-47-671Z.json',
    2019: 'reports/research_true_pit_strategies_2026-07-18T05-24-29-803Z.json',
    2020: 'reports/research_true_pit_strategies_2026-07-18T05-28-05-368Z.json',
    2021: 'reports/research_true_pit_strategies_2026-07-18T05-32-38-749Z.json',
    2022: 'reports/research_true_pit_strategies_2026-07-18T05-37-44-713Z.json',
    2023: 'reports/research_true_pit_strategies_2026-07-18T05-42-58-943Z.json',
    2024: 'reports/research_true_pit_strategies_2026-07-18T08-07-35-994Z.json',
    2025: 'reports/research_true_pit_strategies_2026-07-18T08-15-14-027Z.json',
    2026: 'reports/research_true_pit_strategies_2026-07-16T17-18-22-555Z.json'
};

function loadYear(year) {
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, SOURCES[year]), 'utf8'));
    return (report.rows || []).map(row => buildAuditRow(row)).filter(Boolean);
}

function percent(value, total) {
    return total ? `${(value * 100 / total).toFixed(2)}%` : '0.00%';
}

function topEntries(values, limit = 15) {
    return Object.entries(values || {})
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, limit);
}

function table(values, denominator, limit) {
    return topEntries(values, limit)
        .map(([key, count]) => `| ${key} | ${count} | ${percent(count, denominator)} |`)
        .join('\n');
}

function renderMarkdown(report) {
    const overall = report.summary.overall;
    return [
        '# Audit nguyên nhân loại trừ sai - ChainSmallFirst Hold70',
        '',
        '- Nguồn: candidate diagnostics strict PIT, chỉ dùng dữ liệu có trước ngày dự đoán.',
        '- Bằng chứng được khử trùng theo trạng thái + family + pattern + record state + độ rộng + độ dài + tập số.',
        '- Báo cáo không mặc định quy kết mọi candidate chứa số thực tế là nguyên nhân duy nhất; `fill-or-tie-break` đánh dấu số bị loại nhưng không có candidate liên quan.',
        '',
        '## Tổng quan',
        '',
        `- Số ngày: **${overall.days}**; sai: **${overall.wrongDays}**; trúng: **${percent(overall.days - overall.wrongDays, overall.days)}**.`,
        `- Sai có bằng chứng phá/vượt kỷ lục: **${overall.wrongWithRecordBreakEvidence}/${overall.wrongDays} (${percent(overall.wrongWithRecordBreakEvidence, overall.wrongDays)})**.`,
        `- Sai có bằng chứng hình thành lần đầu: **${overall.wrongWithFirstFormationEvidence}/${overall.wrongDays} (${percent(overall.wrongWithFirstFormationEvidence, overall.wrongDays)})**.`,
        `- Sai không có candidate gắn với số thực tế (fill/tie-break): **${overall.wrongWithNoAssociatedEvidence}/${overall.wrongDays} (${percent(overall.wrongWithNoAssociatedEvidence, overall.wrongDays)})**.`,
        `- Mỗi ngày sai có trung bình **${overall.meanWrongEvidenceCount.toFixed(1)}** bằng chứng sau khử trùng, thuộc **${overall.meanWrongSupportFamilies.toFixed(1)}** family.`,
        '',
        '## Nguyên nhân trội trên ngày sai',
        '',
        '| Nguyên nhân | Ngày | Tỷ lệ trên ngày sai |',
        '|---|---:|---:|',
        table(overall.wrongByDominantCause, overall.wrongDays),
        '',
        '## Lift điều kiện của từng loại bằng chứng',
        '',
        '> Lift > 1 nghĩa là ngày có loại bằng chứng này sai nhiều hơn mức chung; chỉ số này hữu ích hơn đếm thô.',
        '',
        '| Loại bằng chứng gắn với số thực tế | Số ngày | Ngày sai | Tỷ lệ sai | Lift |',
        '|---|---:|---:|---:|---:|',
        ...Object.entries(overall.causeDayOutcomes)
            .sort((left, right) => right[1].liftVsOverall - left[1].liftVsOverall)
            .map(([cause, outcome]) => `| ${cause} | ${outcome.days} | ${outcome.wrongDays} | ${percent(outcome.wrongDays, outcome.days)} | ${outcome.liftVsOverall.toFixed(3)} |`),
        '',
        '## Family xuất hiện trong bằng chứng sai',
        '',
        '> Đây là số lượt bằng chứng đã khử trùng, không phải số ngày; dùng để phát hiện family tương quan/phủ quá rộng.',
        '',
        '| Family | Lượt | Lượt / ngày sai |',
        '|---|---:|---:|',
        topEntries(overall.wrongFamilies, 20)
            .map(([key, count]) => `| ${key} | ${count} | ${(count / Math.max(1, overall.wrongDays)).toFixed(2)} |`)
            .join('\n'),
        '',
        '## Theo giai đoạn',
        '',
        '| Giai đoạn | Ngày | Sai | Tỷ lệ trúng | Phá/vượt KL | Hình thành đầu | Không evidence |',
        '|---|---:|---:|---:|---:|---:|---:|',
        ...Object.entries(report.summary.periods).map(([period, row]) =>
            `| ${period} | ${row.days} | ${row.wrongDays} | ${percent(row.days - row.wrongDays, row.days)} | ${percent(row.wrongWithRecordBreakEvidence, row.wrongDays)} | ${percent(row.wrongWithFirstFormationEvidence, row.wrongDays)} | ${percent(row.wrongWithNoAssociatedEvidence, row.wrongDays)} |`
        ),
        '',
        '## Dataset train',
        '',
        `- File JSONL: \`${path.relative(ROOT, report.datasetFile)}\`.`,
        '- Mỗi dòng là một số 00-99 trong một ngày: `wasExcluded`, `actualNumber`, nhãn `isActual`/`failed`, nhóm nguyên nhân, số family hỗ trợ, active/potential, Tier 1, độ rộng nhỏ nhất và tần suất trung bình.',
        '- Khi train phải chia theo thời gian; không shuffle xuyên tương lai và không chọn cấu hình bằng 2026.',
        ''
    ].join('\n');
}

function compactSample(row, sample) {
    return {
        date: row.date,
        actualNumber: row.actual,
        strategyId: row.strategyId,
        betCount: row.betCount,
        number: sample.number,
        wasExcluded: sample.wasExcluded,
        isActual: sample.actual,
        failed: sample.failed,
        dominantCause: sample.dominantCause,
        evidenceCount: sample.evidenceCount,
        supportFamilies: sample.supportFamilies,
        activeCount: sample.activeCount,
        potentialCount: sample.potentialCount,
        tier1Count: sample.tier1Count,
        minimumSetSize: sample.minimumSetSize,
        meanFrequencyPerYear: sample.meanFrequencyPerYear,
        causes: sample.causes,
        families: sample.families,
        patterns: sample.patterns
    };
}

function main() {
    const byYear = {};
    for (const year of Object.keys(SOURCES).map(Number)) {
        byYear[year] = loadYear(year);
        console.log(`[audit] ${year}: ${byYear[year].length} ngày`);
    }
    const allRows = Object.values(byYear).flat().sort((left, right) => left.date.localeCompare(right.date));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const datasetFile = path.join(ROOT, 'reports', `exclusion-failure-risk-dataset-${stamp}.jsonl`);
    const stream = fs.createWriteStream(datasetFile);
    for (const row of allRows) {
        for (const sample of row.numberSamples) stream.write(`${JSON.stringify(compactSample(row, sample))}\n`);
    }
    stream.end();
    const periods = {
        'Train 2014-2020': summarizeAudit([2014, 2015, 2016, 2017, 2018, 2019, 2020].flatMap(year => byYear[year])),
        'Validation 2021-2023': summarizeAudit([2021, 2022, 2023].flatMap(year => byYear[year])),
        'Test 2024-2025': summarizeAudit([2024, 2025].flatMap(year => byYear[year])),
        'Holdout 2026': summarizeAudit(byYear[2026])
    };
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: 'strict-pit exclusion failure audit; chainSmallFirst hold70; deduplicated candidate evidence',
        sources: SOURCES,
        datasetFile,
        summary: { overall: summarizeAudit(allRows), periods }
    };
    const prefix = path.join(ROOT, 'reports', `exclusion-failure-audit-${stamp}`);
    fs.writeFileSync(`${prefix}.json`, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(`${prefix}.md`, `${renderMarkdown(report)}\n`);
    console.log(JSON.stringify({ report: `${prefix}.md`, dataset: datasetFile, summary: report.summary }, null, 2));
}

main();
