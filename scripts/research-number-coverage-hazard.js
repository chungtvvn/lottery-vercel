#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
    DEFAULT_PRIZE_KEYS,
    buildPointInTimeCoverageRows,
    extractDrawNumbers,
    summarizeCoverage
} = require('../lib/research/numberCoverageHazard');

function pct(value) {
    return `${(100 * Number(value || 0)).toFixed(2)}%`;
}

function round(value, digits = 2) {
    if (!Number.isFinite(Number(value))) return null;
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
}

function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function periodId(date) {
    if (date <= '2020-12-31') return 'train-2016-2020';
    if (date <= '2023-12-31') return 'validation-2021-2023';
    if (date <= '2025-12-31') return 'test-2024-2025';
    return 'diagnostic-2026';
}

function monthSummary(rolling, startDate) {
    const groups = new Map();
    for (const row of rolling.filter(item => item.date >= startDate)) {
        const month = row.date.slice(0, 7);
        if (!groups.has(month)) groups.set(month, []);
        groups.get(month).push(row.drawDays);
    }
    return Object.fromEntries([...groups].map(([month, values]) => [month, {
        days: values.length,
        mean: round(mean(values)),
        min: Math.min(...values),
        max: Math.max(...values)
    }]));
}

function rankDecileDiagnostics(rows) {
    const periods = {};
    for (const row of rows.filter(item => item.date >= '2016-01-01')) {
        const period = periodId(row.date);
        if (!periods[period]) periods[period] = {
            totalActuals: 0,
            deciles: Array.from({ length: 10 }, () => ({ exposure: 0, actual: 0 })),
            cycle: {
                missing: { exposure: 0, actual: 0 },
                seen: { exposure: 0, actual: 0 }
            }
        };
        const bucket = periods[period];
        const actuals = new Set(row.actualNumbers.map(Number));
        bucket.totalActuals += actuals.size;
        const ranked = row.samples.slice().sort((left, right) => right.hazard - left.hazard || left.number - right.number);
        ranked.forEach((sample, index) => {
            const decile = Math.min(9, Math.floor(index / 10));
            const isActual = actuals.has(sample.number);
            bucket.deciles[decile].exposure++;
            bucket.deciles[decile].actual += Number(isActual);
            const state = sample.missingInCycle ? bucket.cycle.missing : bucket.cycle.seen;
            state.exposure++;
            state.actual += Number(isActual);
        });
    }
    for (const bucket of Object.values(periods)) {
        bucket.deciles = bucket.deciles.map((value, index) => ({
            decile: index + 1,
            ...value,
            rate: value.actual / Math.max(1, value.exposure)
        }));
        for (const state of Object.values(bucket.cycle)) {
            state.rate = state.actual / Math.max(1, state.exposure);
        }
        bucket.hazardTopVsBottomLift = bucket.deciles[0].rate / Math.max(1e-12, bucket.deciles[9].rate);
        bucket.missingVsSeenLift = bucket.cycle.missing.rate / Math.max(1e-12, bucket.cycle.seen.rate);
    }
    return periods;
}

function perNumberLatest(rawData, pitRows, mode, lastYearStart) {
    const latest = pitRows.at(-1);
    const lastYear = rawData.filter(row => row.date >= lastYearStart);
    return latest.samples.map(sample => {
        let presenceDays = 0;
        let rawOccurrences = 0;
        for (const row of lastYear) {
            const numbers = extractDrawNumbers(row, mode, DEFAULT_PRIZE_KEYS);
            presenceDays += Number(numbers.includes(sample.number));
            rawOccurrences += mode === 'de'
                ? Number(Number(row.special) === sample.number)
                : DEFAULT_PRIZE_KEYS.reduce((sum, key) => sum + Number(Number(row[key]) === sample.number), 0);
        }
        return {
            number: sample.number,
            presenceDays,
            rawOccurrences,
            currentGap: sample.currentGap,
            averageGap: round(sample.averageGap),
            gapRatio: round(sample.gapRatio, 3),
            gapPercentile: round(sample.gapPercentile, 3),
            hazard: round(sample.hazard, 6),
            hazardRatio: round(sample.hazardRatio, 3),
            missingInCycle: sample.missingInCycle
        };
    });
}

function modeReport(rawData, mode, lastYearStart) {
    console.log(`[Coverage] ${mode}: build strict PIT features...`);
    const coverage = summarizeCoverage(rawData, mode);
    const pitRows = buildPointInTimeCoverageRows(rawData, mode);
    const recentRolling = coverage.rolling.filter(row => row.date >= lastYearStart);
    return {
        mode,
        coverage: {
            completedCycleCount: coverage.completedCycleCount,
            distribution: coverage.cycleDistribution,
            latestCompletedCycles: coverage.completedCycles.slice(-12),
            currentCycle: coverage.currentCycle,
            rollingLast12Months: {
                startDate: lastYearStart,
                days: recentRolling.length,
                mean: round(mean(recentRolling.map(row => row.drawDays))),
                min: recentRolling.length ? Math.min(...recentRolling.map(row => row.drawDays)) : null,
                max: recentRolling.length ? Math.max(...recentRolling.map(row => row.drawDays)) : null,
                latest: recentRolling.at(-1) || null,
                monthly: monthSummary(coverage.rolling, lastYearStart)
            }
        },
        diagnostics: rankDecileDiagnostics(pitRows),
        perNumberLatest: perNumberLatest(rawData, pitRows, mode, lastYearStart)
    };
}

function main() {
    const root = path.resolve(__dirname, '..');
    const rawData = JSON.parse(fs.readFileSync(path.join(root, 'lib/data/xsmb-2-digits.json'), 'utf8'));
    const latestDate = rawData.at(-1).date;
    const latest = new Date(`${latestDate}T00:00:00Z`);
    latest.setUTCFullYear(latest.getUTCFullYear() - 1);
    latest.setUTCDate(latest.getUTCDate() + 1);
    const lastYearStart = latest.toISOString().slice(0, 10);
    const report = {
        generatedAt: new Date().toISOString(),
        rawData: {
            rows: rawData.length,
            firstDate: rawData[0].date,
            latestDate,
            lastYearStart
        },
        definitions: {
            independentCycle: 'Bắt đầu lại ngay sau khi chu kỳ trước đã thấy đủ 00-99; các chu kỳ không chồng lặp.',
            rollingWindow: 'Số ngày nhìn lùi tối thiểu tại mỗi ngày để thấy đủ 00-99.',
            hazard: 'Xác suất xuất hiện ở tuổi gap hiện tại, ước lượng từ exposure/event lịch sử trước ngày dự đoán và co về mức nền.',
            missingInCycle: 'Số chưa xuất hiện trong chu kỳ không chồng lặp hiện tại; đây là feature kiểm chứng, không mặc định là số đến hạn.'
        },
        loto: modeReport(rawData, 'loto', lastYearStart),
        de: modeReport(rawData, 'de', lastYearStart)
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(root, 'reports', `number-coverage-hazard-${stamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const cycleLines = ['loto', 'de'].map(mode => {
        const item = report[mode].coverage;
        return `| ${mode === 'loto' ? 'Lô 27 vị trí' : 'Đề'} | ${item.completedCycleCount} | ${round(item.distribution.drawDays.mean)} | ${item.distribution.drawDays.median} | ${item.distribution.drawDays.p90} | ${item.distribution.drawDays.min} | ${item.distribution.drawDays.max} |`;
    });
    const diagnosticLines = [];
    for (const mode of ['loto', 'de']) {
        for (const [period, item] of Object.entries(report[mode].diagnostics)) {
            diagnosticLines.push(`| ${mode === 'loto' ? 'Lô' : 'Đề'} | ${period} | ${item.totalActuals} | ${item.hazardTopVsBottomLift.toFixed(3)} | ${item.missingVsSeenLift.toFixed(3)} |`);
        }
    }
    const md = `# Độ phủ 100 số, gap và hazard\n\n`
        + `- Dữ liệu: ${report.rawData.firstDate} → ${report.rawData.latestDate} (${report.rawData.rows.toLocaleString('vi-VN')} ngày quay).\n`
        + `- 12 tháng gần nhất: ${lastYearStart} → ${latestDate}.\n`
        + `- Tất cả feature theo ngày được tính trước khi đọc kết quả của chính ngày đó.\n\n`
        + `## Bao nhiêu ngày đủ 100 số?\n\n| Phạm vi | Chu kỳ | Trung bình | Trung vị | P90 | Min | Max |\n|---|---:|---:|---:|---:|---:|---:|\n`
        + `${cycleLines.join('\n')}\n\n`
        + `- Lô 12 tháng gần nhất: cửa sổ tối thiểu trung bình **${report.loto.coverage.rollingLast12Months.mean} ngày**, khoảng ${report.loto.coverage.rollingLast12Months.min}–${report.loto.coverage.rollingLast12Months.max} ngày.\n`
        + `- Đề 12 tháng gần nhất: cửa sổ tối thiểu trung bình **${report.de.coverage.rollingLast12Months.mean} ngày**, khoảng ${report.de.coverage.rollingLast12Months.min}–${report.de.coverage.rollingLast12Months.max} ngày.\n`
        + `- Chu kỳ Đề hiện tại còn thiếu: **${report.de.coverage.currentCycle.missingNumbers.map(number => String(number).padStart(2, '0')).join(', ')}**.\n\n`
        + `## Kiểm tra khả năng phân biệt\n\n`
        + `Lift >1 nghĩa là nhóm hazard cao hoặc nhóm còn thiếu xuất hiện nhiều hơn nhóm đối chứng; cần ổn định qua các giai đoạn mới được dùng.\n\n`
        + `| Phạm vi | Giai đoạn | Số kết quả | Hazard Top/Bottom | Thiếu/Đã thấy |\n|---|---|---:|---:|---:|\n`
        + `${diagnosticLines.join('\n')}\n\n`
        + `Không diễn giải số còn thiếu là chắc chắn sắp về. Báo cáo tiếp theo sẽ đánh giá feature này khi ghép với baseline trên validation/test/holdout cố định.\n`;
    fs.writeFileSync(mdPath, md);
    console.log(`Reports: ${jsonPath}\n         ${mdPath}`);
}

if (require.main === module) main();

module.exports = {
    monthSummary,
    rankDecileDiagnostics
};
