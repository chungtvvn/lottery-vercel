#!/usr/bin/env node
'use strict';

/**
 * Audit Hiệu Quả Loại Trừ Theo Chuẩn Xác Suất Nghiêm Ngặt (Strict PIT):
 * - Lớp 1: Khẳng định tính ngẫu nhiên (loại 60-80 số không đổi xác suất 1/100 của số còn lại).
 * - Lớp 2: Đo lường "bớt sai" bằng Tỉ Lệ Loại Nhầm (False Exclusion Rate) & Precision vs Random Baseline.
 * - Kiểm định: Nếu một Tier có tỷ lệ loại nhầm >= Random Baseline (k/100), Tier đó vô hiệu và phải DROP hoặc gán weight 0.
 */

const fs = require('fs');
const path = require('path');
const { buildAuditRow, auditTierEffectiveness, auditContinuousPruning } = require('../lib/research/exclusionFailureAudit');

const ROOT = path.join(__dirname, '..');
const SOURCE_2026 = 'reports/research_true_pit_strategies_2026-07-16T17-18-22-555Z.json';

function runAudit() {
    const reportPath = path.join(ROOT, SOURCE_2026);
    if (!fs.existsSync(reportPath)) {
        console.error(`Không tìm thấy file dữ liệu audit: ${reportPath}`);
        process.exit(1);
    }

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const rows = (report.rows || []).map(row => buildAuditRow(row)).filter(Boolean);

    console.log(`\n========================================================================================`);
    console.log(`📊 BÁO CÁO KIỂM TOÁN HIỆU QUẢ CÁC TIER LOẠI TRỪ (STRICT PIT 2026 - ${rows.length} KỲ)`);
    console.log(`========================================================================================\n`);

    const tierAudit = auditTierEffectiveness(rows);
    const continuousPruning = auditContinuousPruning(rows, { minActiveDays: 10 });

    console.log(`| Tier / Phân lớp | Ngày HĐ | TB Số Loại | Số Kỳ Loại Nhầm | Tỉ Lệ Loại Nhầm | Baseline Random | Edge vs Random | Precision | Quyết Định (Verdict) |`);
    console.log(`| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |`);

    for (const [tier, stats] of Object.entries(tierAudit)) {
        const falsePct = (stats.falseExclusionRate * 100).toFixed(1) + '%';
        const basePct = (stats.baselineFalseRate * 100).toFixed(1) + '%';
        const edgeSign = stats.edgeVsBaseline > 0 ? '+' : '';
        const edgePct = edgeSign + (stats.edgeVsBaseline * 100).toFixed(2) + '%';
        const precisionPct = (stats.precision * 100).toFixed(2) + '%';
        const verdictBadge = stats.verdict === 'VALID_EDGE' ? '✅ VALID (Bớt sai)' : '❌ DROP_OR_REDUCE (Kém hơn random)';

        console.log(`| ${tier.padEnd(15)} | ${String(stats.daysActive).padStart(7)} | ${stats.meanExclusionSize.toFixed(1).padStart(10)} | ${String(stats.falseExclusionDays).padStart(15)} | ${falsePct.padStart(15)} | ${basePct.padStart(15)} | ${edgePct.padStart(14)} | ${precisionPct.padStart(9)} | ${verdictBadge} |`);
    }

    console.log(`\n----------------------------------------------------------------------------------------`);
    console.log(`🛡️ KẾT QUẢ VÒNG AUDIT LIÊN TỤC & CẮT TỈA (CONTINUOUS AUDIT & PRUNING):`);
    console.log(`----------------------------------------------------------------------------------------`);

    for (const [tier, weight] of Object.entries(continuousPruning.dynamicWeights)) {
        console.log(`- ${tier}: Trọng số hiệu chuẩn = ${weight.toFixed(3)} ${weight === 0 ? '(BỊ CẮT TỈA / PRUNED)' : '(HOẠT ĐỘNG)'}`);
    }

    if (continuousPruning.prunedTiers.length > 0) {
        console.log(`\n⚠️ CÁC TIER BỊ HỆ THỐNG TỰ ĐỘNG BỎ HOẶC GIẢM WEIGHT:`);
        for (const item of continuousPruning.prunedTiers) {
            console.log(`  * [${item.tier}]: ${item.reason}`);
        }
    } else {
        console.log(`\n✅ Tất cả các tier đang hoạt động đều vượt qua kiểm định baseline.`);
    }

    const outputPath = path.join(ROOT, 'lib/data/statistics/cached_exclusion_tier_audit.json');
    const payload = {
        updatedAt: new Date().toISOString(),
        drawsCount: rows.length,
        tierAudit,
        continuousPruning,
        summaryTable: Object.entries(tierAudit).map(([tier, stats]) => ({
            tier,
            daysActive: stats.daysActive,
            meanExclusionSize: stats.meanExclusionSize,
            falseExclusionDays: stats.falseExclusionDays,
            falseExclusionRate: stats.falseExclusionRate,
            baselineFalseRate: stats.baselineFalseRate,
            edgeVsBaseline: stats.edgeVsBaseline,
            precision: stats.precision,
            verdict: stats.verdict,
            recommendedWeight: stats.recommendedWeight
        }))
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`\n💾 Đã lưu cache kiểm toán vào: ${outputPath}`);

    console.log(`\n========================================================================================\n`);
}

runAudit();
