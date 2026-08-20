'use strict';

const fs = require('fs');
const path = require('path');
const {
    buildBlockOnlyPrediction,
    deduplicateBlocks
} = require('../lib/research/blockOnlyRanker');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const STAKE_K = 1000;
const PAYOUT = 84;
const TARGET = 70;
const METHODS = [
    'blockSequential',
    'blockAverageDropoff',
    'blockConsensusEdge'
];

const SOURCE_REPORTS = {
    2014: 'research_true_pit_strategies_2026-07-18T05-07-58-141Z.json',
    2015: 'research_true_pit_strategies_2026-07-18T05-10-27-615Z.json',
    2016: 'research_true_pit_strategies_2026-07-18T05-13-50-218Z.json',
    2017: 'research_true_pit_strategies_2026-07-18T05-17-18-007Z.json',
    2018: 'research_true_pit_strategies_2026-07-18T05-20-47-671Z.json',
    2019: 'research_true_pit_strategies_2026-07-18T05-24-29-803Z.json',
    2020: 'research_true_pit_strategies_2026-07-18T05-28-05-368Z.json',
    2021: 'research_true_pit_strategies_2026-07-18T05-32-38-749Z.json',
    2022: 'research_true_pit_strategies_2026-07-18T05-37-44-713Z.json',
    2023: 'research_true_pit_strategies_2026-07-18T05-42-58-943Z.json',
    2024: 'research_true_pit_strategies_2026-07-18T08-07-35-994Z.json',
    2025: 'research_true_pit_strategies_2026-07-18T08-15-14-027Z.json',
    2026: 'research_true_pit_strategies_2026-07-16T17-18-22-555Z.json'
};

function readJson(fileName) {
    return JSON.parse(fs.readFileSync(path.join(REPORT_DIR, fileName), 'utf8'));
}

function longestStreak(rows, wanted) {
    let longest = 0;
    let current = 0;
    for (const row of rows) {
        if (row.hit === wanted) {
            current += 1;
            longest = Math.max(longest, current);
        } else {
            current = 0;
        }
    }
    return longest;
}

function summarize(rows) {
    const days = rows.length;
    const wins = rows.filter(row => row.hit).length;
    const totalStakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
    const profitK = rows.reduce((sum, row) => sum + row.profitK, 0);
    const expectedWinsAtRandom = days * 0.3;
    const standardDeviation = Math.sqrt(days * 0.3 * 0.7);
    return {
        days,
        wins,
        hitRate: days ? wins / days : 0,
        profitK,
        totalStakeK,
        roi: totalStakeK ? profitK / totalStakeK : 0,
        longestWin: longestStreak(rows, true),
        longestLoss: longestStreak(rows, false),
        randomExpectedHitRate: 0.3,
        zVsRandom: standardDeviation ? (wins - expectedWinsAtRandom) / standardDeviation : 0
    };
}

function settle(date, actual, betNumbers, metadata = {}) {
    const hit = betNumbers.includes(actual);
    const stakeK = betNumbers.length * STAKE_K;
    return {
        date,
        actual,
        hit,
        betNumbers,
        stakeK,
        profitK: (hit ? PAYOUT * STAKE_K : 0) - stakeK,
        ...metadata
    };
}

function baselineBetNumbers(row) {
    return row.strategies?.chainSmallFirst
        || row.strategiesByTarget?.[String(TARGET)]?.chainSmallFirst
        || [];
}

function evaluateRow(row, method) {
    const diagnostics = row.candidateDiagnostics || [];
    const prediction = buildBlockOnlyPrediction(diagnostics, TARGET, method);
    const activeBlocks = deduplicateBlocks(diagnostics);
    const supportedNumbers = prediction.ranking.filter(item => item.support > 0).length;
    return settle(row.date, Number(row.actual), prediction.betNumbers, {
        activeBlockCount: activeBlocks.length,
        supportedNumbers,
        deterministicFillCount: Math.max(0, TARGET - supportedNumbers)
    });
}

function percent(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function signed(value) {
    return `${value >= 0 ? '+' : ''}${value.toLocaleString('en-US')}K`;
}

function markdownTable(rows) {
    const lines = [
        '| Giai đoạn | Phương pháp | Ngày | Trúng | Tỷ lệ | Profit | ROI | Chuỗi thắng | Chuỗi thua | z so với ngẫu nhiên |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|'
    ];
    for (const row of rows) {
        const metric = row.summary;
        lines.push(`| ${row.period} | ${row.method} | ${metric.days} | ${metric.wins} | ${percent(metric.hitRate)} | ${signed(metric.profitK)} | ${percent(metric.roi)} | ${metric.longestWin} | ${metric.longestLoss} | ${metric.zVsRandom.toFixed(2)} |`);
    }
    return lines.join('\n');
}

function main() {
    const rowsByYear = {};
    const sources = {};
    for (const [yearText, fileName] of Object.entries(SOURCE_REPORTS)) {
        const year = Number(yearText);
        const report = readJson(fileName);
        const rows = (report.rows || []).filter(row =>
            Array.isArray(row.candidateDiagnostics)
            && row.candidateDiagnostics.length > 0
            && Number.isInteger(Number(row.actual))
        );
        if (!rows.length) throw new Error(`No usable diagnostic rows for ${year}: ${fileName}`);
        rowsByYear[year] = rows;
        sources[year] = { fileName, rows: rows.length, baselineCutoffDate: report.baselineCutoffDate };
    }

    const daily = {};
    for (const method of METHODS) daily[method] = [];
    daily.chainSmallFirst = [];

    for (const year of Object.keys(rowsByYear).map(Number).sort()) {
        for (const row of rowsByYear[year]) {
            for (const method of METHODS) daily[method].push(evaluateRow(row, method));
            daily.chainSmallFirst.push(settle(
                row.date,
                Number(row.actual),
                baselineBetNumbers(row),
                { activeBlockCount: null, supportedNumbers: null, deterministicFillCount: null }
            ));
        }
    }

    const periods = {
        'Khám phá 2014-2023 (mẫu 10 ngày/lần)': [2014, 2023],
        'Kiểm định 2024 (mẫu 10 ngày/lần)': [2024, 2024],
        'Kiểm định 2025 (mẫu 10 ngày/lần)': [2025, 2025],
        '2026 đầy đủ hằng ngày': [2026, 2026]
    };
    const comparisons = [];
    for (const [period, [startYear, endYear]] of Object.entries(periods)) {
        for (const method of [...METHODS, 'chainSmallFirst']) {
            const periodRows = daily[method].filter(row => {
                const year = Number(row.date.slice(0, 4));
                return year >= startYear && year <= endYear;
            });
            comparisons.push({ period, method, summary: summarize(periodRows) });
        }
    }

    const yearly = [];
    for (const year of Object.keys(rowsByYear).map(Number).sort()) {
        for (const method of [...METHODS, 'chainSmallFirst']) {
            yearly.push({
                year,
                method,
                summary: summarize(daily[method].filter(row => row.date.startsWith(String(year))))
            });
        }
    }

    const blockCoverage2026 = {};
    for (const method of METHODS) {
        const rows = daily[method].filter(row => row.date.startsWith('2026'));
        blockCoverage2026[method] = {
            averageActiveBlocks: rows.reduce((sum, row) => sum + row.activeBlockCount, 0) / rows.length,
            averageSupportedNumbers: rows.reduce((sum, row) => sum + row.supportedNumbers, 0) / rows.length,
            daysWithDeterministicFill: rows.filter(row => row.deterministicFillCount > 0).length,
            averageDeterministicFill: rows.reduce((sum, row) => sum + row.deterministicFillCount, 0) / rows.length
        };
    }

    const output = {
        generatedAt: new Date().toISOString(),
        methodology: {
            strictPointInTime: true,
            annualBaseline: '31/12 of previous year from source strict-PIT reports',
            targetExcluded: TARGET,
            betCount: 100 - TARGET,
            stakeK: STAKE_K,
            payout: PAYOUT,
            candidateScope: 'active block chains only',
            forbiddenField: 'observedExcluded is not read by the ranker',
            fallback: 'deterministic numeric order only when Block support cannot cover target',
            historicalSampling: '2014-2025 every 10 days; 2026 every available day'
        },
        sources,
        comparisons,
        yearly,
        blockCoverage2026,
        daily
    };

    const jsonPath = path.join(REPORT_DIR, 'block-only-strict-pit-2026-07-18.json');
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));

    const reportRows = comparisons;
    const coverageLines = METHODS.map(method => {
        const value = blockCoverage2026[method];
        return `- \`${method}\`: ${value.averageActiveBlocks.toFixed(1)} Block hoạt động/ngày, ${value.averageSupportedNumbers.toFixed(1)} số có tín hiệu; ${value.daysWithDeterministicFill}/${rowsByYear[2026].length} ngày phải điền số không có tín hiệu.`;
    }).join('\n');
    const md = `# Backtest Block thuần strict point-in-time\n\n` +
        `Ngày chạy: 18/07/2026. Hold ${TARGET}, đánh ${100 - TARGET} số, mỗi số ${STAKE_K}K, trúng nhận ${PAYOUT} lần. Điểm hòa vốn là ${(30 / PAYOUT * 100).toFixed(2)}%; chọn ngẫu nhiên 30/100 số có kỳ vọng trúng 30%.\n\n` +
        `## Phạm vi\n\n` +
        `Chỉ dùng chuỗi Block đang diễn ra. Không dùng Chuỗi nhỏ, Tier từ nhóm khác, kết quả ngày cần dự đoán hay trường \`observedExcluded\`. Các tham số được cố định trước khi xem kết quả phép thử.\n\n` +
        `${markdownTable(reportRows)}\n\n` +
        `## Độ phủ Block năm 2026\n\n${coverageLines}\n\n` +
        `## Cách đọc\n\n` +
        `- \`blockSequential\`: lấy lần lượt Block theo Tier, trạng thái kỷ lục, dropoff co mẫu và tập số nhỏ.\n` +
        `- \`blockAverageDropoff\`: xếp từng số theo dropoff trung bình của các Block chứa số đó.\n` +
        `- \`blockConsensusEdge\`: cộng đồng thuận từ các hình Block khác nhau sau khi khử trùng và co mẫu.\n` +
        `- \`chainSmallFirst\`: đối chứng production trên đúng cùng ngày và cùng kinh tế cược.\n\n` +
        `2014-2025 là mẫu cố định 10 ngày/lần nên chỉ dùng để kiểm tra hướng và độ ổn định, không được diễn giải như backtest đủ ngày. 2026 là toàn bộ ngày có trong snapshot strict PIT.\n`;
    const mdPath = path.join(REPORT_DIR, 'block-only-strict-pit-2026-07-18.md');
    fs.writeFileSync(mdPath, md);

    console.log(markdownTable(reportRows));
    console.log('\nBlock coverage 2026:', JSON.stringify(blockCoverage2026, null, 2));
    console.log(`\nJSON: ${jsonPath}`);
    console.log(`Markdown: ${mdPath}`);
}

main();
