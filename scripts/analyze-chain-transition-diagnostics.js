#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function round(value, digits = 4) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
}

function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
    const clean = values.filter(Number.isFinite);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function finiteOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function standardDeviation(values) {
    const clean = values.filter(Number.isFinite);
    if (clean.length < 2) return null;
    const average = mean(clean);
    const variance = clean.reduce((sum, value) => sum + ((value - average) ** 2), 0) / (clean.length - 1);
    return Math.sqrt(variance);
}

function normalizeRecordState(row) {
    const recordLen = Math.max(0, Number(row.recordLen || 0));
    const testedLen = row.state === 'potential'
        ? Math.max(0, Number(row.baseLen || 0))
        : Math.max(0, Number(row.currentLen || row.baseLen || 0));
    if (recordLen <= 0) return 'never-pattern';
    if (testedLen > recordLen) return 'super-record';
    if (testedLen === recordLen) return 'at-record';
    if (testedLen === recordLen - 1) return 'near-record';
    if (Number(row.currentCount || 0) <= 0) return 'unseen-target';
    return 'below-record';
}

function hasValidHistoricalTransition(row) {
    if (row.state !== 'active') return row.opportunitySource === 'daily-replay';
    const recordState = normalizeRecordState(row);
    return row.pattern !== 'blockAlternation'
        && recordState !== 'never-pattern'
        && recordState !== 'at-record'
        && recordState !== 'super-record'
        && row.opportunitySource !== 'unavailable-block-completed-cycles-only'
        && row.opportunitySource !== 'unavailable-in-sample-record-boundary';
}

function transitionTrialBin(row) {
    return hasValidHistoricalTransition(row) ? trialBin(row.trials) : 'chưa có daily replay';
}

function trialBin(value) {
    const trials = Number(value || 0);
    if (trials === 0) return '0';
    if (trials <= 2) return '1-2';
    if (trials <= 5) return '3-5';
    if (trials <= 10) return '6-10';
    if (trials <= 30) return '11-30';
    return '31+';
}

function lengthBin(value) {
    const length = Number(value || 0);
    if (length <= 2) return '2';
    if (length === 3) return '3';
    if (length === 4) return '4';
    if (length === 5) return '5';
    if (length <= 7) return '6-7';
    return '8+';
}

function frequencyBin(value) {
    const frequency = Number(value || 0);
    if (frequency === 0) return '0/năm';
    if (frequency < 0.1) return '<0,1/năm';
    if (frequency < 0.5) return '0,1-<0,5/năm';
    if (frequency < 1) return '0,5-<1/năm';
    return '>=1/năm';
}

function summarize(rows, keyFn) {
    const grouped = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        if (!grouped.has(key)) grouped.set(key, new Map());
        const byDate = grouped.get(key);
        if (!byDate.has(row.date)) byDate.set(row.date, []);
        byDate.get(row.date).push(row);
    }

    return [...grouped.entries()].map(([group, byDate]) => {
        const daily = [...byDate.entries()].map(([date, candidates]) => ({
            date,
            year: date.slice(0, 4),
            actual: mean(candidates.map(item => finiteOrNull(item.observedExcluded)).filter(Number.isFinite)),
            baseline: mean(candidates.map(item => finiteOrNull(item.baseExclusionRate)).filter(Number.isFinite)),
            historical: mean(candidates
                .filter(hasValidHistoricalTransition)
                .map(item => finiteOrNull(item.failureRate))
                .filter(Number.isFinite)),
            observations: candidates.length,
            trials: median(candidates
                .filter(hasValidHistoricalTransition)
                .map(item => finiteOrNull(item.trials))
                .filter(Number.isFinite))
        }));
        const byYear = new Map();
        for (const day of daily) {
            if (!byYear.has(day.year)) byYear.set(day.year, []);
            byYear.get(day.year).push(day);
        }
        const yearly = Object.fromEntries([...byYear.entries()].map(([year, days]) => {
            const actual = mean(days.map(day => day.actual));
            const baseline = mean(days.map(day => day.baseline));
            return [year, {
                days: days.length,
                actualExclusionRate: round(actual),
                baseExclusionRate: round(baseline),
                realizedEdge: round(actual - baseline)
            }];
        }));
        const actual = mean(daily.map(day => day.actual));
        const baseline = mean(daily.map(day => day.baseline));
        const historical = mean(daily.map(day => day.historical));
        const yearlyEdges = Object.values(yearly).map(year => year.realizedEdge).filter(Number.isFinite);
        const stablePositiveYears = yearlyEdges.filter(edge => edge > 0).length;
        const dailyEdges = daily.map(day => day.actual - day.baseline).filter(Number.isFinite);
        const edgeStdDev = standardDeviation(dailyEdges);
        const edgeStdError = Number.isFinite(edgeStdDev) ? edgeStdDev / Math.sqrt(dailyEdges.length) : null;
        const edgeCiLower = Number.isFinite(edgeStdError) ? (actual - baseline) - 1.96 * edgeStdError : null;
        const edgeCiUpper = Number.isFinite(edgeStdError) ? (actual - baseline) + 1.96 * edgeStdError : null;
        const recommendation = daily.length >= 30
            && stablePositiveYears === yearlyEdges.length
            && Number.isFinite(edgeCiLower)
            && edgeCiLower > 0
            ? 'ưu tiên cao'
            : daily.length >= 30
                && stablePositiveYears >= Math.ceil(yearlyEdges.length * 2 / 3)
                && actual - baseline > 0
                ? 'ưu tiên có điều kiện'
                : 'không ưu tiên';
        return {
            group,
            days: daily.length,
            observations: daily.reduce((sum, day) => sum + day.observations, 0),
            medianTrials: round(median(daily.map(day => day.trials)), 1),
            historicalFailureRate: round(historical),
            actualExclusionRate: round(actual),
            baseExclusionRate: round(baseline),
            historicalEdge: round(historical - baseline),
            realizedEdge: round(actual - baseline),
            realizedEdgeStdError: round(edgeStdError),
            realizedEdgeCi95: [round(edgeCiLower), round(edgeCiUpper)],
            stablePositiveYears,
            testedYears: yearlyEdges.length,
            recommendation,
            yearly
        };
    }).sort((a, b) => b.realizedEdge - a.realizedEdge || b.days - a.days);
}

function renderTable(title, rows, limit = 30) {
    const lines = [
        `## ${title}`,
        '',
        '| Nhóm | Ngày | Quan sát | Mẫu vị giữa | Rủi ro LS | Loại đúng TT | Nền | Edge TT | CI 95% Edge | Ổn định năm | Đánh giá |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|'
    ];
    for (const row of rows.slice(0, limit)) {
        const percent = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '-';
        const ci = Array.isArray(row.realizedEdgeCi95)
            ? `${percent(row.realizedEdgeCi95[0])} → ${percent(row.realizedEdgeCi95[1])}`
            : '-';
        lines.push(`| ${row.group} | ${row.days} | ${row.observations} | ${row.medianTrials ?? '-'} | ${percent(row.historicalFailureRate)} | ${percent(row.actualExclusionRate)} | ${percent(row.baseExclusionRate)} | ${percent(row.realizedEdge)} | ${ci} | ${row.stablePositiveYears}/${row.testedYears} | ${row.recommendation} |`);
    }
    lines.push('');
    return lines.join('\n');
}

function main() {
    const reportFiles = process.argv.slice(2);
    if (reportFiles.length === 0) {
        throw new Error('Truyền ít nhất một report strict PIT có candidateDiagnostics.');
    }
    const rows = [];
    for (const file of reportFiles) {
        const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const day of payload.rows || []) {
            for (const candidate of day.candidateDiagnostics || []) {
                rows.push({ ...candidate, date: day.date });
            }
        }
    }
    if (rows.length === 0) throw new Error('Không có candidateDiagnostics trong report.');

    const summaries = {
        state: summarize(rows, row => row.state),
        recordState: summarize(rows, row => `${row.state}|${normalizeRecordState(row)}`),
        tier: summarize(rows, row => `${row.state}|Tier ${row.tier}`),
        length: summarize(rows, row => `${row.state}|dài ${lengthBin(row.baseLen)}`),
        trials: summarize(rows, row => `${row.state}|mẫu ${transitionTrialBin(row)}`),
        frequency: summarize(rows, row => `${row.state}|${frequencyBin(row.exposureFrequencyPerYear)}`),
        pattern: summarize(rows, row => `${row.state}|${row.pattern}`),
        family: summarize(rows, row => `${row.state}|${row.family}`),
        priorityCohort: summarize(rows, row => [
            row.state,
            normalizeRecordState(row),
            `Tier ${row.tier}`,
            `dài ${lengthBin(row.baseLen)}`,
            frequencyBin(row.exposureFrequencyPerYear),
            row.pattern
        ].join('|'))
    };

    const outputDir = path.join(process.cwd(), 'reports');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(outputDir, `chain-transition-reliability-${stamp}.json`);
    const mdPath = path.join(outputDir, `chain-transition-reliability-${stamp}.md`);
    const payload = {
        generatedAt: new Date().toISOString(),
        sourceReports: reportFiles,
        observations: rows.length,
        distinctDates: new Set(rows.map(row => row.date)).size,
        summaries
    };
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    const markdown = [
        '# Độ tin cậy chuyển trạng thái chuỗi',
        '',
        `- Ngày strict PIT: ${payload.distinctDates}`,
        `- Quan sát candidate sau khử trùng: ${payload.observations}`,
        '- Edge thực tế = tỷ lệ loại đúng thực tế trừ xác suất loại nền theo độ rộng tập số.',
        '- Mỗi nhóm lấy trung bình theo ngày trước khi gộp, tránh ngày có nhiều candidate chi phối.',
        '- Rủi ro lịch sử của chuỗi tiềm năng để trống nếu chưa có bảng cơ hội hình thành từ daily replay.',
        '- `never-pattern` nghĩa là toàn bộ pattern chưa có kỷ lục; `unseen-target` nghĩa là target cụ thể chưa đạt nhưng pattern đã từng tồn tại.',
        '- Chỉ gắn ưu tiên cao khi cận dưới CI 95% của Edge > 0 và Edge dương ở mọi năm kiểm tra.',
        '',
        renderTable('Theo trạng thái', summaries.state),
        renderTable('Theo mốc kỷ lục', summaries.recordState),
        renderTable('Theo Tier', summaries.tier),
        renderTable('Theo độ dài', summaries.length),
        renderTable('Theo cỡ mẫu chuyển trạng thái', summaries.trials),
        renderTable('Theo tần suất năm', summaries.frequency),
        renderTable('Theo dạng chuỗi', summaries.pattern),
        renderTable('Theo họ thống kê', summaries.family),
        renderTable(
            'Theo cohort ưu tiên kết hợp (ít nhất 20 ngày)',
            summaries.priorityCohort
                .filter(row => row.days >= 20)
                .sort((a, b) => {
                    const aLower = a.realizedEdgeCi95?.[0] ?? -Infinity;
                    const bLower = b.realizedEdgeCi95?.[0] ?? -Infinity;
                    return bLower - aLower || b.realizedEdge - a.realizedEdge || b.days - a.days;
                }),
            50
        )
    ].join('\n');
    fs.writeFileSync(mdPath, markdown);
    console.log(JSON.stringify({ jsonPath, mdPath, observations: rows.length, distinctDates: payload.distinctDates }, null, 2));
}

main();
