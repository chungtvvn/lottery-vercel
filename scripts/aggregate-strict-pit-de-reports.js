#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPORT_DIR = path.join(__dirname, '..', 'reports');
const OUTPUT_JSON = path.join(REPORT_DIR, 'strict_pit_de_comparison_2016_2026.json');
const OUTPUT_MD = path.join(REPORT_DIR, 'strict_pit_de_comparison_2016_2026.md');
const STAKE_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;
const HOLD_TARGET = 70;
// These rows all use the same fixed Hold70 economics. The parallel method is
// reported separately because its union size varies and intersection numbers
// carry a second stake/payout unit.
const FIXED_METHODS = [
    'chainSmallFirst',
    'chainBlockFirst',
    'chainCredibleFirst',
    'chainFreqFirst',
    'chainRiskFirst',
    'numberAvgRisk',
    'numberConsensusRisk',
    'numberPosteriorDiversity',
    'numberLikelihoodRatio',
    'numberWeightedRisk',
    'activeOnlyAvgRisk',
    'dedupEdge50Hold',
    'dedupEdge50CombinedB40S05'
];
const PARALLEL_REPORT_FILE = path.join(
    __dirname,
    '..',
    'outputs',
    'de-parallel-2016-2026',
    'bao_cao_de_song_song_hold70_2016_2026.json'
);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isoWeekKey(isoDate) {
    const date = new Date(`${isoDate}T12:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 12));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function periodKey(isoDate, period) {
    if (period === 'week') return isoWeekKey(isoDate);
    if (period === 'month') return isoDate.slice(0, 7);
    if (period === 'quarter') return `${isoDate.slice(0, 4)}-Q${Math.floor((Number(isoDate.slice(5, 7)) - 1) / 3) + 1}`;
    return isoDate.slice(0, 4);
}

function phaseForDate(isoDate) {
    return isoDate <= '2025-12-31' ? '2016-2025' : '2026-to-date';
}

function createSummary(key = '') {
    return {
        key,
        days: 0,
        hits: 0,
        losses: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        currentType: '',
        currentLength: 0,
        longestWin: 0,
        longestLoss: 0
    };
}

function updateSummary(summary, row, methodId) {
    const betNumbers = (row.strategies?.[methodId] || []).map(Number);
    const actual = Number(row.actual);
    const hit = betNumbers.includes(actual);
    const stakeK = betNumbers.length * STAKE_PER_NUMBER_K;
    const payoutK = hit ? STAKE_PER_NUMBER_K * WIN_MULTIPLIER : 0;
    const profitK = payoutK - stakeK;
    const type = hit ? 'win' : 'loss';
    summary.days += 1;
    summary.hits += Number(hit);
    summary.losses += Number(!hit);
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += profitK;
    if (summary.currentType === type) summary.currentLength += 1;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    if (hit) summary.longestWin = Math.max(summary.longestWin, summary.currentLength);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.currentLength);
}

function finalizeSummary(summary) {
    const result = { ...summary };
    delete result.currentType;
    delete result.currentLength;
    result.hitRate = result.days ? result.hits / result.days : 0;
    result.roi = result.stakeK ? result.profitK / result.stakeK : 0;
    return result;
}

function summarizeRows(rows, methodId, keySelector = null) {
    const groups = new Map();
    const sorted = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    for (const row of sorted) {
        const key = keySelector ? keySelector(row) : 'all';
        if (!groups.has(key)) groups.set(key, createSummary(key));
        updateSummary(groups.get(key), row, methodId);
    }
    return Array.from(groups.values()).map(finalizeSummary);
}

function chooseReports() {
    const files = fs.readdirSync(REPORT_DIR)
        .filter(file => /^research_true_pit_strategies_.*\.json$/.test(file));
    const desired = [];
    for (let year = 2016; year <= 2025; year += 1) {
        desired.push({ startDate: `${year}-01-01`, endDate: `${year}-12-31`, year });
    }
    desired.push({ startDate: '2026-01-01', endDate: '2026-07-10', year: 2026 });

    const selected = [];
    for (const target of desired) {
        const candidates = files
            .map(file => ({ file, report: readJson(path.join(REPORT_DIR, file)) }))
            .filter(item => {
                const options = item.report.options || {};
                return options.startDate === target.startDate
                    && options.endDate === target.endDate
                    && Number(options.dateStep) === 1
                    && Number(options.target) === HOLD_TARGET
                    && Number(options.betPerNumberK) === STAKE_PER_NUMBER_K
                    && Number(options.winMultiplier) === WIN_MULTIPLIER
                    && item.report.methodologyVersion === 'strict-prefix-point-in-time-v1'
                    && Array.isArray(item.report.rows)
                    && item.report.errors?.length === 0;
            })
            .sort((left, right) => String(left.report.generatedAt).localeCompare(String(right.report.generatedAt)));
        if (candidates.length === 0) {
            throw new Error(`Thiếu report strict PIT ${target.startDate} -> ${target.endDate}.`);
        }
        const picked = candidates[candidates.length - 1];
        selected.push({ ...target, file: picked.file, report: picked.report });
    }
    return selected;
}

function rankPhase(rows, phase) {
    const phaseRows = rows.filter(row => phaseForDate(row.date) === phase);
    return FIXED_METHODS.map(methodId => {
        const summary = summarizeRows(phaseRows, methodId)[0] || finalizeSummary(createSummary('all'));
        const annual = summarizeRows(phaseRows, methodId, row => row.date.slice(0, 4));
        const monthly = summarizeRows(phaseRows, methodId, row => row.date.slice(0, 7));
        const profitableYears = annual.filter(row => row.profitK > 0).length;
        const losingYears = annual.filter(row => row.profitK < 0).length;
        const worstYear = annual.slice().sort((a, b) => a.profitK - b.profitK)[0] || null;
        const worstMonth = monthly.slice().sort((a, b) => a.profitK - b.profitK)[0] || null;
        return {
            methodId,
            ...summary,
            profitableYears,
            losingYears,
            totalYears: annual.length,
            worstYear,
            worstMonth,
            breakEvenHitRate: summary.days && (summary.stakeK / STAKE_PER_NUMBER_K)
                ? (summary.stakeK / STAKE_PER_NUMBER_K) / (summary.days * WIN_MULTIPLIER)
                : 0
        };
    }).sort((a, b) => b.profitK - a.profitK || b.hitRate - a.hitRate);
}

function formatK(value) {
    return `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString('vi-VN')}K`;
}

function formatPct(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function markdownTable(rows, columns) {
    const header = `| ${columns.map(column => column.label).join(' | ')} |`;
    const separator = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map(row => `| ${columns.map(column => column.value(row)).join(' | ')} |`);
    return [header, separator, ...body].join('\n');
}

function buildMarkdown(report) {
    const lines = [
        '# Strict PIT Đề: 2016–2025 và 2026 đến hiện tại',
        '',
        `- Phương pháp: mỗi ngày tái sinh thống kê từ prefix trước ngày dự đoán; baseline năm khóa tại 31/12 năm trước.`,
        `- Hold: loại ${HOLD_TARGET} số, đánh 30 số; stake: ${STAKE_PER_NUMBER_K}K/số; ăn: ${WIN_MULTIPLIER}x.`,
        `- Ngưỡng hòa vốn lý thuyết: ${formatPct(report.economics.breakEvenHitRate)} ngày trúng.`,
        `- Report nguồn: ${report.sourceReports.map(item => item.file).join(', ')}`,
        ''
    ];
    for (const phase of report.phases) {
        lines.push(`## ${phase}`, '');
        lines.push(markdownTable(report.ranking[phase].slice(0, 10), [
            { label: 'Phương pháp', value: row => row.methodId },
            { label: 'Ngày', value: row => row.days },
            { label: 'Hit', value: row => `${row.hits}/${row.days} (${formatPct(row.hitRate)})` },
            { label: 'Profit', value: row => formatK(row.profitK) },
            { label: 'ROI', value: row => formatPct(row.roi) },
            { label: 'Năm dương/âm', value: row => `${row.profitableYears}/${row.losingYears}` },
            { label: 'Thua dài nhất', value: row => row.longestLoss },
            { label: 'Năm tệ nhất', value: row => row.worstYear ? `${row.worstYear.key}: ${formatK(row.worstYear.profitK)}` : '-' }
        ]), '');
    }
    if (report.parallel) {
        lines.push('## Đề Song Song: báo cáo kinh tế riêng', '');
        lines.push(`- Dàn song song là hợp của Block Hold85 và Chuỗi nhỏ Hold65; số giao nhau đánh 2 đơn vị. Vì vậy không được tính như dàn cố định 30 số.`, '');
        lines.push(`- Nguồn: ${report.parallel.sourceFile}; điểm PIT: ${report.parallel.pointInTime ? 'có gắn cờ strict' : 'không xác định'}.`, '');
        lines.push(markdownTable([
            { phase: '2016-2025', ...report.parallel.comparison.historical10y },
            { phase: '2026 đến hiện tại', ...report.parallel.comparison.current2026 }
        ], [
            { label: 'Giai đoạn', value: row => row.phase },
            { label: 'Ngày', value: row => row.days },
            { label: 'Hit', value: row => `${row.hitDays}/${row.days} (${formatPct(row.hitRate)})` },
            { label: 'Stake', value: row => formatK(row.stakeK) },
            { label: 'Profit', value: row => formatK(row.profitK) },
            { label: 'ROI', value: row => formatPct(row.roi) },
            { label: 'Thắng/thua dài nhất', value: row => `${row.longestWin}/${row.longestLoss}` }
        ]), '');
    }
    lines.push('## Kết luận thận trọng', '');
    lines.push('- Không phương pháp nào được coi là bảo đảm lợi nhuận; chỉ đánh giá trên dữ liệu lịch sử.', '- Phương pháp chỉ nên được nâng mặc định nếu vẫn dương trên giai đoạn holdout và không làm tăng đáng kể chuỗi thua.', '- Cần đối chiếu các bảng tuần/tháng/quý/năm trong JSON để kiểm tra các đoạn suy giảm, không chỉ nhìn tổng profit.', '');
    return lines.join('\n');
}

function main() {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const sourceReports = chooseReports();
    const rows = sourceReports.flatMap(item => item.report.rows)
        .sort((a, b) => a.date.localeCompare(b.date));
    const uniqueRows = Array.from(new Map(rows.map(row => [row.date, row])).values())
        .sort((a, b) => a.date.localeCompare(b.date));
    const phases = ['2016-2025', '2026-to-date'];
    const ranking = Object.fromEntries(phases.map(phase => [phase, rankPhase(uniqueRows, phase)]));
    const periods = {};
    for (const period of ['week', 'month', 'quarter', 'year']) {
        periods[period] = Object.fromEntries(phases.map(phase => [
            phase,
            Object.fromEntries(FIXED_METHODS.map(methodId => [
                methodId,
                summarizeRows(uniqueRows.filter(row => phaseForDate(row.date) === phase), methodId, row => periodKey(row.date, period))
            ]))
        ]));
    }
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-prefix-point-in-time-v1',
        configuration: {
            holdExcluded: HOLD_TARGET,
            betCount: 100 - HOLD_TARGET,
            stakePerNumberK: STAKE_PER_NUMBER_K,
            winMultiplier: WIN_MULTIPLIER,
            sourceRowCount: uniqueRows.length,
            dateRange: { start: uniqueRows[0]?.date || null, end: uniqueRows.at(-1)?.date || null }
        },
        economics: {
            breakEvenHitRate: (100 - HOLD_TARGET) / WIN_MULTIPLIER
        },
        phases,
        sourceReports: sourceReports.map(item => ({
            year: item.year,
            file: item.file,
            startDate: item.report.options.startDate,
            endDate: item.report.options.endDate,
            rows: item.report.rows.length,
            fingerprint: item.report.fingerprint || null,
            resultSha256: item.report.resultSha256 || null
        })),
        ranking,
        periods
    };
    if (fs.existsSync(PARALLEL_REPORT_FILE)) {
        const parallel = readJson(PARALLEL_REPORT_FILE);
        report.parallel = {
            sourceFile: path.relative(process.cwd(), PARALLEL_REPORT_FILE),
            pointInTime: Boolean(parallel.pointInTime),
            ranges: parallel.ranges,
            economics: parallel.economics,
            comparison: parallel.comparison,
            periods: {
                historical10y: parallel.historical10y,
                current2026: parallel.current2026
            }
        };
    }
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
    fs.writeFileSync(OUTPUT_MD, buildMarkdown(report));
    console.log(JSON.stringify({
        outputJson: OUTPUT_JSON,
        outputMarkdown: OUTPUT_MD,
        rows: uniqueRows.length,
            ranking: Object.fromEntries(phases.map(phase => [phase, ranking[phase].slice(0, 5).map(row => ({
            methodId: row.methodId,
            days: row.days,
            hitRate: row.hitRate,
            profitK: row.profitK,
            roi: row.roi,
            longestLoss: row.longestLoss
            }))])),
        parallel: report.parallel?.comparison || null
    }, null, 2));
}

main();
