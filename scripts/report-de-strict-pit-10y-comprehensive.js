#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const OUTPUT_DIR = path.join(ROOT, 'outputs', 'de-strict-pit-all-methods-2016-2025');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'bao_cao_de_strict_pit_10_nam.json');
const OUTPUT_MD = path.join(OUTPUT_DIR, 'bao_cao_de_strict_pit_10_nam.md');
const AUDIT_FILE = path.join(REPORT_DIR, 'strict_pit_all_methods_2016_2026.json');
const RAW_FILE = path.join(ROOT, 'lib', 'data', 'xsmb-2-digits.json');

const START_DATE = '2016-01-01';
const END_DATE = '2025-12-31';
const STAKE_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const EXPECTED_VERSION = 'strict-prefix-point-in-time-v1';

const METHOD_META = {
    chainSmallFirst: ['Chuỗi nhỏ trước', 'core'],
    chainBlockFirst: ['Nhịp block trước', 'core'],
    chainCredibleFirst: ['Chuỗi đủ tin cậy trước', 'core'],
    chainFreqFirst: ['Tần suất thấp trước', 'core'],
    chainRiskFirst: ['Rủi ro cao trước', 'core'],
    numberAvgRisk: ['Rủi ro trung bình từng số', 'core'],
    numberConsensusRisk: ['Đồng thuận từng số', 'core'],
    numberPosteriorDiversity: ['Posterior đa dạng chuỗi', 'core'],
    numberLikelihoodRatio: ['Likelihood ratio bảo thủ', 'core'],
    numberWeightedRisk: ['Trọng số membership', 'core'],
    activeOnlyAvgRisk: ['Chỉ chuỗi đang diễn ra', 'core'],
    dedupEdge50Hold: ['Edge khử trùng 50% nền', 'production-family'],
    dedupEdge50CombinedB40S05: ['Edge + Boost B40S05', 'production-family'],
    deParallelBlock85Small65: ['Song song Block 85 + Chuỗi nhỏ 65', 'production-family']
};

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
}

function toActual(row) {
    const value = Number(row?.special);
    return Number.isInteger(value) ? value : null;
}

function isoWeek(dateText) {
    const date = new Date(`${dateText}T12:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 12));
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function periodKey(dateText, type) {
    if (type === 'week') return isoWeek(dateText);
    if (type === 'month') return dateText.slice(0, 7);
    return dateText.slice(0, 4);
}

function createSummary(id, label = id) {
    return {
        id,
        label,
        days: 0,
        hitDays: 0,
        missDays: 0,
        totalUniqueNumbers: 0,
        minNumbers: Infinity,
        maxNumbers: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        currentType: null,
        currentLength: 0
    };
}

function addResult(summary, count, hitUnits) {
    const hit = hitUnits > 0;
    const stakeK = count * STAKE_K;
    const payoutK = hitUnits * STAKE_K * PAYOUT_MULTIPLIER;
    summary.days += 1;
    summary.hitDays += hit ? 1 : 0;
    summary.missDays += hit ? 0 : 1;
    summary.totalUniqueNumbers += count;
    summary.minNumbers = Math.min(summary.minNumbers, count);
    summary.maxNumbers = Math.max(summary.maxNumbers, count);
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += payoutK - stakeK;
    const type = hit ? 'win' : 'loss';
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
    result.avgNumbers = result.days ? result.totalUniqueNumbers / result.days : 0;
    result.hitRate = result.days ? result.hitDays / result.days : 0;
    result.roi = result.stakeK ? result.profitK / result.stakeK : 0;
    if (!Number.isFinite(result.minNumbers)) result.minNumbers = 0;
    return result;
}

function buildPeriodSummaries(dailyLong, type) {
    const groups = new Map();
    for (const row of dailyLong) {
        const key = `${row.methodId}|${periodKey(row.date, type)}`;
        if (!groups.has(key)) {
            groups.set(key, createSummary(periodKey(row.date, type), row.methodLabel));
        }
        addResult(groups.get(key), row.numberCount, row.hit ? 1 : 0);
    }
    return [...groups.entries()].map(([key, summary]) => {
        const [methodId, period] = key.split('|');
        return { methodId, period, ...finalizeSummary(summary) };
    });
}

function formatPct(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function formatMoney(value) {
    return `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString('vi-VN')}K`;
}

function main() {
    if (!fs.existsSync(AUDIT_FILE)) throw new Error(`Thiếu ${AUDIT_FILE}`);
    const audit = readJson(AUDIT_FILE);
    if (!audit.audit?.passed) throw new Error('Nguồn strict PIT chưa vượt audit hiện có.');

    const sourceRefs = audit.audit.strictReports
        .filter(item => item.year >= '2016' && item.year <= '2025')
        .sort((a, b) => a.year.localeCompare(b.year));
    if (sourceRefs.length !== 10) throw new Error(`Cần đúng 10 source năm, hiện có ${sourceRefs.length}.`);

    const raw = readJson(RAW_FILE);
    const rawByDate = new Map(raw.map(row => [String(row.date).slice(0, 10), toActual(row)]));
    const sourceFiles = [];
    const rows = [];
    const issues = [];

    for (const ref of sourceRefs) {
        const file = path.join(REPORT_DIR, ref.file);
        const report = readJson(file);
        const year = Number(ref.year);
        const expectedCutoff = `${year - 1}-12-31`;
        if (report.methodologyVersion !== EXPECTED_VERSION) issues.push(`${ref.year}: methodology=${report.methodologyVersion}`);
        if (Number(report.options?.dateStep) !== 1) issues.push(`${ref.year}: dateStep=${report.options?.dateStep}`);
        if (report.baselineCutoffDate !== expectedCutoff) issues.push(`${ref.year}: cutoff=${report.baselineCutoffDate}`);
        if (report.errors?.length) issues.push(`${ref.year}: errors=${report.errors.length}`);
        sourceFiles.push({
            year: ref.year,
            file: path.relative(ROOT, file),
            generatedAt: report.generatedAt,
            baselineCutoffDate: report.baselineCutoffDate,
            rows: report.rows.length,
            resultSha256: report.resultSha256 || null
        });
        rows.push(...report.rows);
    }

    rows.sort((a, b) => a.date.localeCompare(b.date));
    const duplicateDates = rows.length - new Set(rows.map(row => row.date)).size;
    if (duplicateDates) issues.push(`Trùng ${duplicateDates} ngày dự đoán.`);
    for (const row of rows) {
        if (rawByDate.get(row.date) !== Number(row.actual)) {
            issues.push(`Actual lệch raw tại ${row.date}: report=${row.actual}, raw=${rawByDate.get(row.date)}`);
            if (issues.length > 50) break;
        }
    }
    if (rows[0]?.date !== START_DATE || rows.at(-1)?.date !== END_DATE) {
        issues.push(`Phạm vi thực tế ${rows[0]?.date} -> ${rows.at(-1)?.date}`);
    }
    if (issues.length) throw new Error(`Strict PIT audit thất bại:\n${issues.join('\n')}`);

    const methodIds = Object.keys(rows[0].strategies || {});
    for (const row of rows) {
        const rowMethods = Object.keys(row.strategies || {});
        if (rowMethods.length !== methodIds.length || methodIds.some(id => !rowMethods.includes(id))) {
            throw new Error(`Danh sách phương pháp không đồng nhất tại ${row.date}`);
        }
    }

    const methodSummaries = new Map(methodIds.map(id => [id, createSummary(id, METHOD_META[id]?.[0] || id)]));
    const dailyLong = [];
    const dailyConsensus = [];

    for (const row of rows) {
        const actual = Number(row.actual);
        const votes = Array.from({ length: 100 }, () => 0);
        const hitMethods = [];
        let totalMethodSelections = 0;
        let portfolioPayoutUnits = 0;
        const methodDaily = {};

        for (const methodId of methodIds) {
            const numbers = normalizeNumbers(row.strategies[methodId]);
            const hit = numbers.includes(actual);
            numbers.forEach(number => { votes[number] += 1; });
            totalMethodSelections += numbers.length;
            portfolioPayoutUnits += hit ? 1 : 0;
            if (hit) hitMethods.push(methodId);
            addResult(methodSummaries.get(methodId), numbers.length, hit ? 1 : 0);
            const detail = {
                date: row.date,
                actual,
                methodId,
                methodLabel: METHOD_META[methodId]?.[0] || methodId,
                methodStatus: METHOD_META[methodId]?.[1] || 'strict-source',
                numberCount: numbers.length,
                numbers,
                hit,
                stakeK: numbers.length * STAKE_K,
                payoutK: hit ? STAKE_K * PAYOUT_MULTIPLIER : 0,
                profitK: (hit ? STAKE_K * PAYOUT_MULTIPLIER : 0) - numbers.length * STAKE_K
            };
            dailyLong.push(detail);
            methodDaily[methodId] = detail;
        }

        const union = votes.map((vote, number) => vote > 0 ? number : null).filter(Number.isInteger);
        const consensus = {};
        for (const threshold of [2, 3, 5, 7, 10, methodIds.length]) {
            const numbers = votes.map((vote, number) => vote >= threshold ? number : null).filter(Number.isInteger);
            consensus[`vote${threshold}`] = {
                numbers,
                count: numbers.length,
                hit: numbers.includes(actual)
            };
        }
        dailyConsensus.push({
            date: row.date,
            year: row.date.slice(0, 4),
            month: row.date.slice(0, 7),
            week: isoWeek(row.date),
            actual,
            candidateCount: row.candidateCount,
            methodCount: methodIds.length,
            methodsHit: hitMethods.length,
            hitMethodIds: hitMethods,
            actualVoteCount: votes[actual],
            totalMethodSelections,
            unionNumbers: union,
            unionCount: union.length,
            unionHit: union.includes(actual),
            portfolioStakeK: totalMethodSelections * STAKE_K,
            portfolioPayoutK: portfolioPayoutUnits * STAKE_K * PAYOUT_MULTIPLIER,
            portfolioProfitK: portfolioPayoutUnits * STAKE_K * PAYOUT_MULTIPLIER - totalMethodSelections * STAKE_K,
            consensus,
            methodDaily
        });
    }

    const ranking = [...methodSummaries.entries()].map(([methodId, summary]) => ({
        methodId,
        methodLabel: METHOD_META[methodId]?.[0] || methodId,
        methodStatus: METHOD_META[methodId]?.[1] || 'strict-source',
        ...finalizeSummary(summary)
    })).sort((a, b) => b.profitK - a.profitK || b.hitRate - a.hitRate);

    const periods = {
        week: buildPeriodSummaries(dailyLong, 'week'),
        month: buildPeriodSummaries(dailyLong, 'month'),
        year: buildPeriodSummaries(dailyLong, 'year')
    };

    for (const method of ranking) {
        const years = periods.year.filter(row => row.methodId === method.methodId);
        const months = periods.month.filter(row => row.methodId === method.methodId);
        const weeks = periods.week.filter(row => row.methodId === method.methodId);
        method.profitableYears = years.filter(row => row.profitK > 0).length;
        method.profitableMonths = months.filter(row => row.profitK > 0).length;
        method.profitableWeeks = weeks.filter(row => row.profitK > 0).length;
        method.worstYear = years.slice().sort((a, b) => a.profitK - b.profitK)[0] || null;
        method.bestYear = years.slice().sort((a, b) => b.profitK - a.profitK)[0] || null;
    }

    const voteDistribution = Array.from({ length: methodIds.length + 1 }, (_, voteCount) => ({
        voteCount,
        days: dailyConsensus.filter(row => row.actualVoteCount === voteCount).length
    })).filter(row => row.days > 0);
    voteDistribution.forEach(row => { row.rate = row.days / dailyConsensus.length; });

    const portfolio = createSummary('all-method-portfolio', 'Danh mục đánh riêng tất cả phương pháp');
    for (const row of dailyConsensus) {
        addResult(portfolio, row.totalMethodSelections, row.methodsHit);
    }

    const report = {
        generatedAt: new Date().toISOString(),
        title: 'Backtest strict PIT toàn bộ phương pháp Đề - 10 năm 2016-2025',
        scope: {
            startDate: START_DATE,
            endDate: END_DATE,
            days: rows.length,
            years: 10,
            methodCount: methodIds.length,
            methodIds,
            stakePerNumberK: STAKE_K,
            payoutMultiplier: PAYOUT_MULTIPLIER,
            breakEvenHitRateFor30Numbers: 30 / PAYOUT_MULTIPLIER
        },
        methodology: {
            version: EXPECTED_VERSION,
            annualBaseline: '31/12 năm trước ngày dự đoán',
            dailyState: 'raw prefix kết thúc trước ngày dự đoán',
            actualVerification: 'đối chiếu lại lib/data/xsmb-2-digits.json',
            sourceAuditPassed: true,
            parallelProfitCaveat: 'Dàn Song song trong source chỉ lưu hợp số duy nhất; profit trong report là proxy 1 đơn vị/số duy nhất, không tái dựng giao x2.'
        },
        sourceFiles,
        audit: {
            passed: true,
            rawFile: path.relative(ROOT, RAW_FILE),
            rawRows: raw.length,
            checkedPredictionRows: rows.length,
            duplicateDates,
            actualMismatches: 0
        },
        ranking,
        portfolio: finalizeSummary(portfolio),
        voteDistribution,
        periods,
        dailyConsensus,
        dailyLong
    };

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));

    const best = ranking[0];
    const lines = [
        '# Báo cáo Đề strict PIT 10 năm (2016–2025)',
        '',
        `- Phạm vi: ${START_DATE} -> ${END_DATE}, ${rows.length.toLocaleString('vi-VN')} ngày, ${methodIds.length} phương pháp.`,
        `- Công thức chuẩn hóa: ${STAKE_K.toLocaleString('vi-VN')}K/số, ăn ${PAYOUT_MULTIPLIER}; hòa vốn dàn 30 số = ${formatPct(30 / PAYOUT_MULTIPLIER)}.`,
        '- Baseline được chốt 31/12 năm trước; trạng thái ngày dùng raw prefix trước ngày dự đoán; actual đã đối chiếu lại raw hiện tại.',
        '- Profit Song song là proxy mỗi số duy nhất 1 đơn vị vì source strict cũ không lưu giao x2.',
        '',
        '## Xếp hạng tổng hợp',
        '',
        '| # | Phương pháp | Số TB | Trúng | Profit | ROI | Năm dương | Thua dài nhất |',
        '|---:|---|---:|---:|---:|---:|---:|---:|'
    ];
    ranking.forEach((row, index) => lines.push(
        `| ${index + 1} | ${row.methodLabel} | ${row.avgNumbers.toFixed(2)} | ${row.hitDays}/${row.days} (${formatPct(row.hitRate)}) | ${formatMoney(row.profitK)} | ${formatPct(row.roi)} | ${row.profitableYears}/10 | ${row.longestLoss} |`
    ));
    lines.push('', '## Kết luận chính', '');
    lines.push(`- Dẫn đầu theo profit chuẩn hóa: **${best.methodLabel}**, hit ${formatPct(best.hitRate)}, profit ${formatMoney(best.profitK)}, ROI ${formatPct(best.roi)}.`);
    lines.push(`- Dàn 30 số cần hit ít nhất ${formatPct(30 / PAYOUT_MULTIPLIER)} để hòa vốn; kết quả phải được so với mốc này thay vì chỉ so với 30%.`);
    lines.push('- Danh mục đánh tất cả phương pháp cùng lúc chủ yếu đo mức đồng thuận; không nên coi union gần 100 số là một chiến lược vốn khả thi.');
    lines.push('- Nghiên cứu tiếp theo nên giữ nguyên 2025 hoặc 2026 làm holdout, hiệu chỉnh trên các năm trước và chỉ nâng production khi cải thiện ít nhất hai chế độ lịch độc lập.');
    lines.push('- Cần sinh lại strict source có lưu giao x2 của Song song và thêm đúng Edge75 PIT hiện tại trước khi so sánh profit production cuối cùng.');
    fs.writeFileSync(OUTPUT_MD, `${lines.join('\n')}\n`);

    console.log(JSON.stringify({ outputJson: OUTPUT_JSON, outputMd: OUTPUT_MD, days: rows.length, methods: methodIds.length, best }, null, 2));
}

main();
