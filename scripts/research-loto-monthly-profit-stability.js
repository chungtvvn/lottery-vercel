#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
}

function summarize(rows, availableDays) {
    const stakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = rows.reduce((sum, row) => sum + row.payoutK, 0);
    const profitK = payoutK - stakeK;
    const hitDays = rows.filter(row => row.hits > 0).length;
    const winDays = rows.filter(row => row.profitK > 0).length;
    return {
        availableDays,
        playedDays: rows.length,
        skippedDays: availableDays - rows.length,
        hitDays,
        hitRate: rows.length ? hitDays / rows.length : 0,
        winDays,
        winRate: rows.length ? winDays / rows.length : 0,
        totalHits: rows.reduce((sum, row) => sum + row.hits, 0),
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0
    };
}

function groupMonthly(rows) {
    const groups = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!groups.has(month)) groups.set(month, []);
        groups.get(month).push(row);
    }
    return groups;
}

function fixedPolicy(rows) {
    return rows.map(row => ({ ...row, decisionReason: 'fixed-daily' }));
}

function monthlyLockPositive(rows) {
    const selected = [];
    for (const monthRows of groupMonthly(rows).values()) {
        let cumulativeProfitK = 0;
        let locked = false;
        for (const row of monthRows) {
            // The play/skip decision only uses profit settled before this date.
            if (locked) continue;
            selected.push({ ...row, decisionReason: 'monthly-profit-not-yet-positive' });
            cumulativeProfitK += row.profitK;
            if (cumulativeProfitK > 0) locked = true;
        }
    }
    return selected;
}

function monthlyRows(selectedRows, allRows) {
    const availableByMonth = groupMonthly(allRows);
    const selectedByMonth = groupMonthly(selectedRows);
    return [...availableByMonth.entries()].map(([month, available]) => ({
        month,
        ...summarize(selectedByMonth.get(month) || [], available.length)
    }));
}

function evaluate(rows, policy) {
    const selectedRows = policy(rows);
    const monthly = monthlyRows(selectedRows, rows);
    return {
        summary: summarize(selectedRows, rows.length),
        positiveMonths: monthly.filter(row => row.profitK > 0).length,
        totalMonths: monthly.length,
        allMonthsPositive: monthly.every(row => row.profitK > 0),
        monthly,
        rows: selectedRows
    };
}

function percent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function markdown(output) {
    const lines = [
        '# Nghiên cứu ổn định lợi nhuận Lô RRF theo tháng',
        '',
        `- Nguồn: ${output.sourceReport}`,
        '- Strict PIT: quyết định chơi/bỏ ngày chỉ dùng trạng thái và kết quả đã kết toán trước ngày dự đoán.',
        '- Kinh tế: 2.200K/số, nhận 8.000K/hit.',
        '- Chính sách khóa tháng: chơi cho tới khi lợi nhuận lũy kế tháng > 0, sau đó dừng đến đầu tháng kế tiếp.',
        '',
        '| Top | Chính sách | Ngày chơi/ngày có sẵn | Tỷ lệ ngày có hit | Profit | ROI | Tháng dương |',
        '|---:|---|---:|---:|---:|---:|---:|'
    ];
    for (const result of output.results) {
        const s = result.result.summary;
        lines.push(`| ${result.top} | ${result.policy} | ${s.playedDays}/${s.availableDays} | ${percent(s.hitRate)} | ${s.profitK.toLocaleString('en-US')}K | ${percent(s.roi)} | ${result.result.positiveMonths}/${result.result.totalMonths} |`);
    }
    lines.push('', '## Chi tiết khóa lợi nhuận theo tháng', '');
    for (const result of output.results.filter(row => row.policy === 'monthlyLockPositive')) {
        lines.push(`### Top ${result.top}`, '', '| Tháng | Ngày chơi | Hit days | Profit | ROI |', '|---|---:|---:|---:|---:|');
        for (const row of result.result.monthly) {
            lines.push(`| ${row.month} | ${row.playedDays} | ${row.hitDays} | ${row.profitK.toLocaleString('en-US')}K | ${percent(row.roi)} |`);
        }
        lines.push('');
    }
    lines.push(
        '## Kết luận kiểm soát',
        '',
        '- Việc tất cả tháng dương trên cùng giai đoạn dùng để phát hiện chính sách chỉ là bằng chứng mô tả, chưa phải bảo đảm tương lai.',
        '- Chính sách giảm số ngày chơi mạnh; nó quản trị vốn chứ không làm mô hình dự đoán chính xác hơn.',
        '- Không đưa production trước khi kiểm tra trên ít nhất một năm độc lập chưa dùng để chọn chính sách.',
        ''
    );
    return lines.join('\n');
}

function main() {
    const args = parseArgs();
    const reportFile = args.get('report');
    if (!reportFile) throw new Error('Thiếu --report=<backtest_loto...json>.');
    const sourceReport = path.resolve(reportFile);
    const report = JSON.parse(fs.readFileSync(sourceReport, 'utf8'));
    const all = report.dailyDetailsByWindow?.dateRange || [];
    const results = [];
    for (const top of [6, 7]) {
        const rows = all
            .filter(row => row.methodId === `rrfParallelBlock85Small65:top${top}`)
            .sort((a, b) => a.date.localeCompare(b.date));
        if (!rows.length) throw new Error(`Không có dữ liệu RRF Top ${top}.`);
        results.push({ top, policy: 'fixedDaily', result: evaluate(rows, fixedPolicy) });
        results.push({ top, policy: 'monthlyLockPositive', result: evaluate(rows, monthlyLockPositive) });
    }
    const output = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'loto-monthly-profit-stability-pit-v1',
        sourceReport,
        config: {
            stakeK: report.config?.stakeK,
            payoutK: report.config?.payoutK,
            baselineCutoffDate: report.baselineCutoffDate,
            startDate: report.config?.startDate,
            endDate: report.config?.endDate
        },
        results
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = path.join(process.cwd(), 'reports', `loto-monthly-profit-stability-${stamp}`);
    fs.writeFileSync(`${base}.json`, JSON.stringify(output, null, 2));
    fs.writeFileSync(`${base}.md`, markdown(output));
    console.log(JSON.stringify({
        json: `${base}.json`,
        markdown: `${base}.md`,
        results: results.map(row => ({ top: row.top, policy: row.policy, ...row.result.summary, positiveMonths: row.result.positiveMonths, totalMonths: row.result.totalMonths }))
    }, null, 2));
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.stack || error.message);
        process.exit(1);
    }
}

module.exports = { evaluate, fixedPolicy, monthlyLockPositive, summarize };
