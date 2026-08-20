#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const OUTPUT_JSON = path.join(REPORT_DIR, 'strict_pit_all_methods_2016_2026.json');
const OUTPUT_MD = path.join(REPORT_DIR, 'strict_pit_all_methods_2016_2026.md');
const RAW_CANDIDATES = [
    process.env.STRICT_PIT_RAW_FILE,
    '/tmp/xsmb-r2-current.json',
    path.join(ROOT, 'lib', 'data', 'xsmb-2-digits.json')
].filter(Boolean);

const FIXED_STAKE_K = 1000;
const FIXED_WIN_MULTIPLIER = 84;
const FIXED_BET_COUNT = 30;
const STRICT_VERSION = 'strict-prefix-point-in-time-v1';
const PHASES = [
    { id: '2016-2025', start: '2016-01-01', end: '2025-12-31' },
    { id: '2026-to-date', start: '2026-01-01', end: '2026-07-10' }
];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function number(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
}

function uniqueSorted(values) {
    return [...new Set((values || []).map(number).filter(value => value !== null))]
        .sort((a, b) => a - b);
}

function isoWeekKey(dateText) {
    const date = new Date(`${dateText}T12:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 12));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function periodKey(dateText, period) {
    if (period === 'week') return isoWeekKey(dateText);
    if (period === 'month') return dateText.slice(0, 7);
    if (period === 'quarter') {
        return `${dateText.slice(0, 4)}-Q${Math.floor((Number(dateText.slice(5, 7)) - 1) / 3) + 1}`;
    }
    return dateText.slice(0, 4);
}

function phaseForDate(dateText) {
    return dateText <= '2025-12-31' ? '2016-2025' : '2026-to-date';
}

function createSummary(key) {
    return {
        key,
        days: 0,
        hits: 0,
        losses: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        _currentType: null,
        _currentLength: 0
    };
}

function addFixedResult(summary, row, methodId) {
    const actual = number(row.actual);
    const bets = uniqueSorted(row.strategies?.[methodId]);
    const hit = actual !== null && bets.includes(actual);
    const profitK = hit
        ? FIXED_STAKE_K * FIXED_WIN_MULTIPLIER - bets.length * FIXED_STAKE_K
        : -bets.length * FIXED_STAKE_K;

    summary.days += 1;
    summary.hits += hit ? 1 : 0;
    summary.losses += hit ? 0 : 1;
    summary.stakeK += bets.length * FIXED_STAKE_K;
    summary.payoutK += hit ? FIXED_STAKE_K * FIXED_WIN_MULTIPLIER : 0;
    summary.profitK += profitK;
    const type = hit ? 'win' : 'loss';
    if (summary._currentType === type) summary._currentLength += 1;
    else {
        summary._currentType = type;
        summary._currentLength = 1;
    }
    if (hit) summary.longestWin = Math.max(summary.longestWin, summary._currentLength);
    else summary.longestLoss = Math.max(summary.longestLoss, summary._currentLength);
}

function finalizeSummary(summary) {
    const result = { ...summary };
    delete result._currentType;
    delete result._currentLength;
    result.hitRate = result.days ? result.hits / result.days : 0;
    result.roi = result.stakeK ? result.profitK / result.stakeK : 0;
    return result;
}

function summarize(rows, methodId, selector = () => 'all') {
    const groups = new Map();
    for (const row of rows.slice().sort((a, b) => a.date.localeCompare(b.date))) {
        const key = selector(row);
        if (!groups.has(key)) groups.set(key, createSummary(key));
        addFixedResult(groups.get(key), row, methodId);
    }
    return [...groups.values()].map(finalizeSummary);
}

function compareByProfit(left, right) {
    return right.profitK - left.profitK || right.hitRate - left.hitRate || left.methodId.localeCompare(right.methodId);
}

function chooseStrictReport(startDate, endDate) {
    const candidates = fs.readdirSync(REPORT_DIR)
        .filter(file => /^research_true_pit_strategies_.*\.json$/.test(file))
        .map(file => ({ file, report: readJson(path.join(REPORT_DIR, file)) }))
        .filter(item => {
            const options = item.report.options || {};
            return item.report.methodologyVersion === STRICT_VERSION
                && item.report.errors?.length === 0
                && options.startDate === startDate
                && options.endDate === endDate
                && Number(options.dateStep) === 1
                && Number(options.target) === 70
                && Number(options.betPerNumberK) === FIXED_STAKE_K
                && Number(options.winMultiplier) === FIXED_WIN_MULTIPLIER
                && Array.isArray(item.report.rows);
        })
        .sort((left, right) => String(left.report.generatedAt).localeCompare(String(right.report.generatedAt)));
    if (!candidates.length) throw new Error(`Thiếu strict report ${startDate} -> ${endDate}`);
    return candidates.at(-1);
}

function validateRawRows(rows, rawByDate) {
    const issues = [];
    const dates = rows.map(row => row.date);
    if (dates.length !== new Set(dates).size) issues.push('duplicate prediction dates');
    for (const row of rows) {
        const rawRow = rawByDate.get(row.date);
        if (!rawRow) issues.push(`date missing in raw: ${row.date}`);
        if (!Number.isInteger(number(row.actual))) issues.push(`invalid actual: ${row.date}`);
        if (rawRow && number(row.actual) !== rawRow.actual) {
            issues.push(`actual mismatch ${row.date}: report=${row.actual}, raw=${rawRow.actual}`);
        }
        for (const [methodId, values] of Object.entries(row.strategies || {})) {
            const bets = uniqueSorted(values);
            if (bets.some(value => value < 0 || value > 99)) issues.push(`invalid number ${methodId}:${row.date}`);
            if (!methodId.startsWith('deParallel') && bets.length !== FIXED_BET_COUNT) {
                issues.push(`wrong fixed bet count ${methodId}:${row.date}:${bets.length}`);
            }
            if (bets.length !== (values || []).length) issues.push(`duplicate bets ${methodId}:${row.date}`);
        }
    }
    return issues;
}

function buildFixedAnalysis(allRows, methodIds) {
    const ranking = {};
    const periods = {};
    for (const phase of PHASES.map(item => item.id)) {
        const phaseRows = allRows.filter(row => phaseForDate(row.date) === phase);
        ranking[phase] = methodIds.map(methodId => {
            const overall = summarize(phaseRows, methodId)[0] || finalizeSummary(createSummary('all'));
            const years = summarize(phaseRows, methodId, row => row.date.slice(0, 4));
            const months = summarize(phaseRows, methodId, row => row.date.slice(0, 7));
            const weeks = summarize(phaseRows, methodId, row => periodKey(row.date, 'week'));
            return {
                methodId,
                ...overall,
                profitableYears: years.filter(row => row.profitK > 0).length,
                losingYears: years.filter(row => row.profitK < 0).length,
                profitableMonths: months.filter(row => row.profitK > 0).length,
                losingMonths: months.filter(row => row.profitK < 0).length,
                profitableWeeks: weeks.filter(row => row.profitK > 0).length,
                losingWeeks: weeks.filter(row => row.profitK < 0).length,
                worstYear: years.slice().sort((a, b) => a.profitK - b.profitK)[0] || null,
                worstMonth: months.slice().sort((a, b) => a.profitK - b.profitK)[0] || null
            };
        }).sort(compareByProfit);

        periods[phase] = {};
        for (const period of ['week', 'month', 'quarter', 'year']) {
            periods[phase][period] = Object.fromEntries(methodIds.map(methodId => [
                methodId,
                summarize(phaseRows, methodId, row => periodKey(row.date, period))
            ]));
        }
    }
    return { ranking, periods };
}

function readRaw() {
    const file = RAW_CANDIDATES.find(candidate => fs.existsSync(candidate));
    if (!file) throw new Error('Không tìm thấy raw snapshot để kiểm tra actual theo ngày.');
    const raw = readJson(file)
        .map(row => ({ ...row, date: isoDate(row.date), actual: number(row.special) }))
        .filter(row => row.date && row.actual !== null);
    return { file, rows: raw, byDate: new Map(raw.map(row => [row.date, row])) };
}

function buildParallelSection() {
    const file = path.join(ROOT, 'outputs', 'de-parallel-2016-2026', 'bao_cao_de_song_song_hold70_2016_2026.json');
    if (!fs.existsSync(file)) return { status: 'missing', file };
    const report = readJson(file);
    return {
        status: report.pointInTime ? 'strict-source' : 'rejected-not-strict',
        file: path.relative(ROOT, file),
        pointInTime: Boolean(report.pointInTime),
        economics: report.economics,
        ranges: report.ranges,
        comparison: report.comparison,
        periods: {
            historical10y: report.historical10y,
            current2026: report.current2026
        },
        note: 'Báo cáo này dùng simulationService với strict PIT mặc định và settle riêng số giao nhau x2; phạm vi 2026 của source kết thúc 2026-07-09.'
    };
}

function inspectLotoStrictReports() {
    const files = fs.readdirSync(REPORT_DIR).filter(file => /^backtest_loto_milestone20y_.*\.json$/.test(file));
    const accepted = [];
    const rejected = [];
    for (const file of files) {
        const report = readJson(path.join(REPORT_DIR, file));
        if (report.config?.strictPointInTime === true && report.methodology?.strictPointInTime === true) {
            accepted.push({
                file,
                generatedAt: report.generatedAt,
                startDate: report.config.startDate,
                endDate: report.config.endDate,
                positions: report.config.positions?.length || 0,
                strategies: report.config.strategies || [],
                holds: report.config.holdCounts || [],
                bets: report.config.betCounts || [],
                rows: Object.values(report.dailyDetailsByWindow || {}).reduce((sum, rows) => sum + rows.length, 0)
            });
        } else if (report.config?.strictPointInTime === false || report.methodology?.dailyState === 'fast-full-history-index') {
            rejected.push(file);
        }
    }
    return {
        accepted: accepted.sort((a, b) => String(a.generatedAt).localeCompare(String(b.generatedAt))),
        rejectedFastCount: rejected.length,
        note: accepted.length
            ? 'Chỉ các report accepted được xem là strict; phạm vi hiện có chưa đủ để xếp hạng Lô 20 năm.'
            : 'Chưa có report Lô strict đủ phạm vi để kết luận.'
    };
}

function pct(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function money(value) {
    return `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString('vi-VN')}K`;
}

function buildMarkdown(report) {
    const lines = [
        '# Audit Strict PIT toàn bộ phương pháp 2016–2026',
        '',
        '- Fast history bị loại khỏi ranking và không được dùng để chọn phương pháp.',
        '- Đề cố định: Hold 70, đánh 30 số, 1.000K/số, ăn 84; hòa vốn lý thuyết 35,71%.',
        '- Mỗi report được kiểm tra actual theo raw snapshot, trùng ngày, duplicate số và số lượng dàn.',
        `- Raw snapshot: ${report.audit.rawFile}; ${report.audit.rawRows} ngày, ${report.audit.rawFirstDate} -> ${report.audit.rawLastDate}.`,
        ''
    ];
    for (const phase of PHASES.map(item => item.id)) {
        lines.push(`## ${phase}`, '', '| Phương pháp | Hit | Profit | ROI | Năm dương/ tổng | Thua dài nhất | Tháng dương/ tổng |', '|---|---:|---:|---:|---:|---:|---:|');
        for (const row of report.fixed.ranking[phase]) {
            lines.push(`| ${row.methodId} | ${row.hits}/${row.days} (${pct(row.hitRate)}) | ${money(row.profitK)} | ${pct(row.roi)} | ${row.profitableYears}/${row.profitableYears + row.losingYears} | ${row.longestLoss} | ${row.profitableMonths}/${row.profitableMonths + row.losingMonths} |`);
        }
        lines.push('');
    }
    const parallel = report.parallel;
    if (parallel.status === 'strict-source') {
        lines.push('## Đề Song Song', '',
            `- ${parallel.note}`,
            `- 2016–2025: ${parallel.comparison.historical10y.hitDays}/${parallel.comparison.historical10y.days} (${pct(parallel.comparison.historical10y.hitRate)}), profit ${money(parallel.comparison.historical10y.profitK)}, ROI ${pct(parallel.comparison.historical10y.roi)}, thua dài nhất ${parallel.comparison.historical10y.longestLoss}.`,
            `- 2026 source đến 09/07: ${parallel.comparison.current2026.hitDays}/${parallel.comparison.current2026.days} (${pct(parallel.comparison.current2026.hitRate)}), profit ${money(parallel.comparison.current2026.profitK)}, ROI ${pct(parallel.comparison.current2026.roi)}, thua dài nhất ${parallel.comparison.current2026.longestLoss}.`,
            '');
    }
    lines.push('## Kết luận', '',
        `- Phương pháp tốt nhất theo profit strict ở 2016–2025 trong nhóm cố định: **${report.fixed.ranking['2016-2025'][0].methodId}**, nhưng vẫn âm ${money(report.fixed.ranking['2016-2025'][0].profitK)}; không đủ điều kiện coi là tốt để triển khai độc lập.`,
        `- Phương pháp tốt nhất theo profit strict ở 2026 đến 10/07 trong nhóm cố định: **${report.fixed.ranking['2026-to-date'][0].methodId}**, nhưng chỉ là holdout ngắn và profit ${money(report.fixed.ranking['2026-to-date'][0].profitK)}; không đủ để thay mặc định.`,
        parallel.status === 'strict-source'
            ? '- Phương án có lợi nhuận dương ở cả hai giai đoạn là **Đề Song Song Block 85 + Chuỗi nhỏ 65, Hold 70**, với số giao nhau được tính 2 đơn vị; đây là ứng viên tốt nhất hiện có sau khi bỏ fast history.'
            : '- Chưa có ứng viên strict đủ dữ liệu để chọn.',
        '- Lô: các report fast bị loại; report Lô strict hiện có quá ngắn để xếp hạng. Không được dùng profit fast cũ để kết luận hoặc đổi mặc định.',
        '- Đây là bằng chứng lịch sử, không phải bảo đảm lợi nhuận tương lai.'
    );
    return lines.join('\n');
}

function main() {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const raw = readRaw();
    const targets = [];
    for (let year = 2016; year <= 2025; year += 1) {
        targets.push({ id: String(year), start: `${year}-01-01`, end: `${year}-12-31` });
    }
    targets.push({ id: '2026', start: '2026-01-01', end: '2026-07-10' });
    const selected = targets.map(target => ({ ...target, ...chooseStrictReport(target.start, target.end) }));
    const validation = [];
    const allRows = [];
    for (const item of selected) {
        const rows = item.report.rows.slice().sort((a, b) => a.date.localeCompare(b.date));
        const issues = validateRawRows(rows, raw.byDate);
        validation.push({
            year: item.id,
            file: item.file,
            generatedAt: item.report.generatedAt,
            rows: rows.length,
            firstDate: rows[0]?.date || null,
            lastDate: rows.at(-1)?.date || null,
            errors: item.report.errors || [],
            issues
        });
        allRows.push(...rows);
    }
    const uniqueRows = [...new Map(allRows.map(row => [row.date, row])).values()]
        .sort((a, b) => a.date.localeCompare(b.date));
    const methodIds = Object.keys(uniqueRows[0]?.strategies || {})
        .filter(id => !id.startsWith('deParallel'))
        .sort();
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: STRICT_VERSION,
        policy: 'fast-history-excluded',
        economics: {
            unit: 'K_VND',
            fixedStakePerNumberK: FIXED_STAKE_K,
            fixedBetCount: FIXED_BET_COUNT,
            winMultiplier: FIXED_WIN_MULTIPLIER,
            breakEvenHitRate: FIXED_BET_COUNT / FIXED_WIN_MULTIPLIER
        },
        audit: {
            rawFile: raw.file,
            rawRows: raw.rows.length,
            rawFirstDate: raw.rows[0]?.date || null,
            rawLastDate: raw.rows.at(-1)?.date || null,
            strictReports: validation,
            passed: validation.every(item => item.errors.length === 0 && item.issues.length === 0)
        },
        sourceReports: selected.map(item => ({
            year: item.id,
            file: item.file,
            generatedAt: item.report.generatedAt,
            fingerprint: item.report.fingerprint,
            resultSha256: item.report.resultSha256,
            rows: item.report.rows.length
        })),
        fixed: {
            methodIds,
            ...buildFixedAnalysis(uniqueRows, methodIds)
        },
        parallel: buildParallelSection(),
        loto: inspectLotoStrictReports()
    };
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
    fs.writeFileSync(OUTPUT_MD, buildMarkdown(report));
    console.log(JSON.stringify({
        outputJson: OUTPUT_JSON,
        outputMarkdown: OUTPUT_MD,
        auditPassed: report.audit.passed,
        validation: report.audit.strictReports,
        bestFixed: Object.fromEntries(Object.entries(report.fixed.ranking).map(([phase, rows]) => [phase, rows.slice(0, 3).map(row => ({ methodId: row.methodId, hitRate: row.hitRate, profitK: row.profitK, roi: row.roi, longestLoss: row.longestLoss }))])),
        parallel: report.parallel.status,
        lotoStrictReports: report.loto.accepted.length
    }, null, 2));
}

main();
