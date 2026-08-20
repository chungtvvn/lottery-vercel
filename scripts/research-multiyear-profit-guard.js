#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    inferParallelSegments,
    settleSegment,
    blockBootstrapAnnualProfit
} = require('../lib/research/multiyearProfitGuard');

const ROOT = path.join(__dirname, '..');
const PARALLEL_REPORT = path.join(
    ROOT,
    'outputs',
    'de-parallel-2016-2026',
    'bao_cao_de_song_song_hold70_2016_2026.json'
);
const FIXED_REPORT = path.join(ROOT, 'reports', 'strict_pit_all_methods_2016_2026.json');
const PAYOUT_MULTIPLIERS = [70, 84];
const EXPECTED_PARALLEL_METHOD_VERSION = '2026-07-15-parallel-shared-ranking-v3';

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function formatK(value) {
    return `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}K`;
}

function annualRows(report) {
    return [
        ...(report.historical10y?.year || []),
        ...(report.current2026?.year || [])
    ].sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function weeklySegmentProfits(report, kind, payoutMultiplier) {
    const rows = [
        ...(report.historical10y?.week || []),
        ...(report.current2026?.week || [])
    ];
    return rows.map(row => settleSegment(
        inferParallelSegments(row, { payoutMultiplier: 84 }),
        kind,
        payoutMultiplier
    ).profitK);
}

function summarizeStrategy(report, kind, payoutMultiplier) {
    const years = annualRows(report).map(row => settleSegment(
        inferParallelSegments(row, { payoutMultiplier: 84 }),
        kind,
        payoutMultiplier
    ));
    return {
        id: kind,
        payoutMultiplier,
        positiveYears: years.filter(row => row.profitK > 0).length,
        totalYears: years.length,
        allYearsPositive: years.every(row => row.profitK > 0),
        worstYear: years.slice().sort((a, b) => a.profitK - b.profitK)[0],
        totalProfitK: years.reduce((sum, row) => sum + row.profitK, 0),
        totalStakeK: years.reduce((sum, row) => sum + row.stakeK, 0),
        years,
        weeklyBlockBootstrap: blockBootstrapAnnualProfit(
            weeklySegmentProfits(report, kind, payoutMultiplier),
            { iterations: 20000, weeksPerYear: 52, blockSize: 4, seed: 20260717 }
        )
    };
}

function fixedMethodAnnualAudit(report) {
    const methodIds = report.fixed?.methodIds || [];
    return methodIds.map(methodId => {
        const years = [
            ...(report.fixed?.periods?.['2016-2025']?.year?.[methodId] || []),
            ...(report.fixed?.periods?.['2026-to-date']?.year?.[methodId] || [])
        ];
        return {
            methodId,
            positiveYears: years.filter(row => Number(row.profitK) > 0).length,
            totalYears: years.length,
            allYearsPositive: years.length > 0 && years.every(row => Number(row.profitK) > 0),
            worstYear: years.slice().sort((a, b) => Number(a.profitK) - Number(b.profitK))[0] || null,
            totalProfitK: years.reduce((sum, row) => sum + Number(row.profitK || 0), 0)
        };
    }).sort((a, b) => b.positiveYears - a.positiveYears || b.totalProfitK - a.totalProfitK);
}

function renderMarkdown(payload) {
    const lines = [
        '# Nghiên cứu đa năm: điều kiện profit dương từng năm',
        '',
        `- Nguồn chuỗi: raw từ ${payload.dataPolicy.rawStart}; đánh giá strict PIT từ ${payload.dataPolicy.evaluationStart}.`,
        '- Mỗi ngày dự đoán chỉ dùng raw prefix đến D-1; baseline năm khóa tại 31/12 năm trước.',
        '- Số mô phỏng bootstrap chỉ đo độ bất định, không được cộng vào cỡ mẫu lịch sử.',
        '- Điều kiện “dương từng năm” là tiêu chuẩn lịch sử, không phải bảo đảm tương lai.',
        '',
        '## Kết quả chính',
        '',
        '| Phương án | Ăn | Năm dương | Profit tổng | Năm tệ nhất | Bootstrap năm dương |',
        '|---|---:|---:|---:|---:|---:|'
    ];
    for (const row of payload.parallelStrategies) {
        lines.push(
            `| ${row.id} | ${row.payoutMultiplier} | ${row.positiveYears}/${row.totalYears} | ${formatK(row.totalProfitK)} | ` +
            `${row.worstYear.key}: ${formatK(row.worstYear.profitK)} | ${formatPercent(row.weeklyBlockBootstrap.probabilityPositive)} |`
        );
    }
    lines.push('', '## Chi tiết phần giao ở mức ăn 84', '');
    lines.push('| Năm | Số/ngày | Hit | Lift/độ phủ | Wilson lower | Profit | ROI |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    const overlap84 = payload.parallelStrategies.find(row => row.id === 'overlapOnly' && row.payoutMultiplier === 84);
    for (const year of overlap84.years) {
        lines.push(
            `| ${year.key} | ${year.averageBetCount.toFixed(2)} | ${year.hitDays}/${year.days} (${formatPercent(year.hitRate)}) | ` +
            `${year.liftVsCoverage.toFixed(2)}x | ${formatPercent(year.wilson95.lower)} | ${formatK(year.profitK)} | ${formatPercent(year.roi)} |`
        );
    }
    lines.push('', '## Đối chiếu các dàn cố định 30 số', '');
    lines.push('| Phương pháp | Năm dương | Profit tổng | Năm tệ nhất |');
    lines.push('|---|---:|---:|---:|');
    for (const row of payload.fixedMethodAudit) {
        lines.push(
            `| ${row.methodId} | ${row.positiveYears}/${row.totalYears} | ${formatK(row.totalProfitK)} | ` +
            `${row.worstYear?.key || 'N/A'}: ${formatK(row.worstYear?.profitK || 0)} |`
        );
    }
    lines.push(
        '',
        '## Quy trình chọn và loại mô hình',
        '',
        '- Dữ liệu 2005-2015 được giữ làm warm-up để ngày đánh giá đầu tiên đã có khoảng 10 năm lịch sử.',
        '- Bayes membership/Naive Bayes: fit 2016-2020, chọn tham số 2021-2023, kiểm tra 2024-2026; vẫn âm ở 2024 và 2025.',
        '- Vote/consensus giữa 13 dàn fixed: kiểm tra cả số có nhiều phiếu loại và ít phiếu loại; không vượt hòa vốn ổn định theo năm.',
        '- Gating theo profit/ROI/Bayes của 4-104 tuần trước: không cải thiện holdout 2024-2026; cấu hình tốt nhất vẫn chọn song song x2.',
        '- Phần không giao của Block85/Small65 không đạt guard ở tỷ lệ ăn 70; lợi thế tập trung chủ yếu trong phần giao.',
        '- Bootstrap theo block 4 tuần chỉ đo độ bất định của chuỗi profit đã quan sát, không tạo thêm bằng chứng lịch sử.'
    );
    lines.push(
        '',
        '## Kết luận kỹ thuật',
        '',
        '- Các mô hình dàn cố định 30 số, vote cao/thấp, Bayes membership và Naive Bayes đã kiểm tra không đạt điều kiện dương từng năm.',
        '- Chỉ phần giao của Block85 và Small65 dương ở mọi năm đã chấm, đồng thời dùng trung bình khoảng 9–10 số/ngày.',
        '- Hợp dàn hiện tại có hit-day cao hơn; phần giao có ROI tốt hơn nhưng hit-day thấp hơn. Đây là hai mục tiêu vốn khác nhau, không được so chỉ bằng profit tuyệt đối.',
        '- Chưa thay production: cần sinh snapshot giao bất biến theo ngày và xác nhận thêm trên một năm chưa từng được dùng để chọn mô hình.'
    );
    return `${lines.join('\n')}\n`;
}

function main() {
    const parallel = readJson(PARALLEL_REPORT);
    const fixed = readJson(FIXED_REPORT);
    if (parallel.pointInTime !== true) throw new Error('Bao cao song song khong duoc danh dau strict PIT.');
    if (parallel.methodVersion !== EXPECTED_PARALLEL_METHOD_VERSION) {
        throw new Error(
            `Bao cao song song da cu hoac thieu version ` +
            `(actual=${parallel.methodVersion || 'missing'}, expected=${EXPECTED_PARALLEL_METHOD_VERSION}). ` +
            `Khong duoc dung artifact nay de ket luan production.`
        );
    }
    if (fixed.methodologyVersion !== 'strict-prefix-point-in-time-v1' || fixed.audit?.passed !== true) {
        throw new Error('Bao cao fixed methods khong qua audit strict PIT.');
    }

    const parallelStrategies = [];
    for (const payoutMultiplier of PAYOUT_MULTIPLIERS) {
        for (const kind of ['overlapOnly', 'uniqueOnly', 'unionSingle', 'parallelX2']) {
            parallelStrategies.push(summarizeStrategy(parallel, kind, payoutMultiplier));
        }
    }
    const payload = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'multiyear-profit-guard-v1',
        dataPolicy: {
            rawStart: fixed.audit.rawFirstDate,
            rawEnd: fixed.audit.rawLastDate,
            evaluationStart: '2016-01-01',
            rationale: 'Can it nhat 10 nam raw lich su truoc nam danh gia dau tien; expanding strict prefix sau do.'
        },
        economics: {
            unitStakeK: 1000,
            payoutMultipliers: PAYOUT_MULTIPLIERS,
            fixedHold70BreakEven: {
                payout70: 30 / 70,
                payout84: 30 / 84
            }
        },
        sourceIntegrity: {
            parallelPointInTime: parallel.pointInTime,
            fixedAuditPassed: fixed.audit.passed,
            immutableDailySnapshotsRequiredBeforePromotion: true
        },
        fixedMethodAudit: fixedMethodAnnualAudit(fixed),
        parallelStrategies,
        rejectedResearch: [
            {
                family: 'Bayes membership / Naive Bayes dàn cố định 30 số',
                reason: 'Chọn trên 2021-2023 vẫn âm cả ba năm; test 2024-2025 tiếp tục âm.'
            },
            {
                family: 'Vote cao / vote thấp giữa 13 dàn fixed',
                reason: 'Không vượt hòa vốn theo năm và không ổn định qua regime.'
            },
            {
                family: 'Gating giao/không giao/song song theo 4-104 tuần gần nhất',
                reason: 'Fit 2016-2020 và validation 2021-2023 không cải thiện holdout 2024-2026; selector tốt nhất quay về song song x2.'
            }
        ],
        recommendation: {
            researchCandidate: 'parallelIntersectionOnly',
            productionChange: false,
            reason: 'Dat guard profit duong moi nam trong lich su, nhung can holdout moi va snapshot giao bat bien truoc khi promote.'
        }
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(ROOT, 'reports', `multiyear-profit-guard-${stamp}.json`);
    const mdPath = path.join(ROOT, 'reports', `multiyear-profit-guard-${stamp}.md`);
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(payload));
    console.log(JSON.stringify({ jsonPath, mdPath, recommendation: payload.recommendation, parallelStrategies: parallelStrategies.map(row => ({ id: row.id, payoutMultiplier: row.payoutMultiplier, positiveYears: row.positiveYears, totalYears: row.totalYears, totalProfitK: row.totalProfitK, worstYear: row.worstYear.key, worstYearProfitK: row.worstYear.profitK, bootstrapPositive: row.weeklyBlockBootstrap.probabilityPositive })) }, null, 2));
}

main();
