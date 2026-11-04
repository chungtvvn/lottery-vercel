'use strict';

/**
 * scripts/test-de-fusion.js
 * 
 * Test suite for De Fusion & Anti-Parity Engine
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    OPPOSITE_FORM_MAP,
    getParityForm,
    applyAntiParityFilter,
    evaluateDeBet,
    buildDeFusionReport,
    getDeFusionReport
} = require('../lib/services/deFusionService');

console.log('🧪 [TEST] Bắt đầu kiểm thử Đề Fusion & Anti-Parity Engine...');

// 1. Kiểm thử Logic Chẵn Lẻ Đối Lập
assert.strictEqual(getParityForm('00'), 'CC');
assert.strictEqual(getParityForm('08'), 'CC');
assert.strictEqual(getParityForm('11'), 'LL');
assert.strictEqual(getParityForm('95'), 'LL');
assert.strictEqual(getParityForm('29'), 'CL');
assert.strictEqual(getParityForm('74'), 'LC');

assert.strictEqual(OPPOSITE_FORM_MAP['LL'], 'CC');
assert.strictEqual(OPPOSITE_FORM_MAP['CC'], 'LL');
assert.strictEqual(OPPOSITE_FORM_MAP['CL'], 'LC');
assert.strictEqual(OPPOSITE_FORM_MAP['LC'], 'CL');
console.log('  ✅ 1. Kiểm thử xác định dạng và đối lập: PASS');

// 2. Kiểm thử Bộ lọc Anti-Parity
const sampleTop = ['00', '11', '22', '33', '44', '55']; // CC, LL, CC, LL, CC, LL
const sampleBot = ['01', '10', '02', '13']; // CL, LC, CC, LL
const filteredLL = applyAntiParityFilter(sampleTop, sampleBot, 'CC'); // Đoán LL -> Loại CC

assert.strictEqual(filteredLL.origCount, 10);
assert.deepStrictEqual(filteredLL.removedTop, ['00', '22', '44']);
assert.deepStrictEqual(filteredLL.removedBot, ['02']);
assert.strictEqual(filteredLL.removedCount, 4);
assert.strictEqual(filteredLL.filteredCount, 6);
assert.strictEqual(filteredLL.filteredTop.length, 3); // 11, 33, 55
assert.strictEqual(filteredLL.filteredBot.length, 3); // 01, 10, 13
assert.strictEqual(filteredLL.origStakeK, 6 * 400 + 4 * 200); // 2400 + 800 = 3200K
assert.strictEqual(filteredLL.filteredStakeK, 3 * 400 + 3 * 200); // 1200 + 600 = 1800K
assert.strictEqual(filteredLL.savedStakeK, 1400); // Tiết kiệm 1.4M
console.log('  ✅ 2. Kiểm thử hàm lọc applyAntiParityFilter: PASS');

// 3. Kiểm thử Đánh giá cược evaluateDeBet
// Trường hợp 1: Trúng số trong tầng X2 sau lọc (VD về 11)
const evalHitX2 = evaluateDeBet(filteredLL, '11');
assert.strictEqual(evalHitX2.isBaseHit, true);
assert.strictEqual(evalHitX2.baseHitX2, true);
assert.strictEqual(evalHitX2.basePayoutK, 33600);
assert.strictEqual(evalHitX2.isFilteredHit, true);
assert.strictEqual(evalHitX2.fHitX2, true);
assert.strictEqual(evalHitX2.fPayoutK, 33600);
assert.strictEqual(evalHitX2.filteredProfitK, 33600 - 1800); // +31.8M
assert.strictEqual(evalHitX2.isEliminatedLoss, false);

// Trường hợp 2: Trúng số nằm trong danh sách bị loại (VD về 00)
const evalHitRemoved = evaluateDeBet(filteredLL, '00');
assert.strictEqual(evalHitRemoved.isBaseHit, true);
assert.strictEqual(evalHitRemoved.baseHitX2, true);
assert.strictEqual(evalHitRemoved.isFilteredHit, false);
assert.strictEqual(evalHitRemoved.fPayoutK, 0);
assert.strictEqual(evalHitRemoved.filteredProfitK, -1800);
assert.strictEqual(evalHitRemoved.isEliminatedLoss, true); // Đánh dấu bị loại nhầm

// Trường hợp 3: Trượt cả hai (VD về 99)
const evalMissBoth = evaluateDeBet(filteredLL, '99');
assert.strictEqual(evalMissBoth.isBaseHit, false);
assert.strictEqual(evalMissBoth.isFilteredHit, false);
assert.strictEqual(evalMissBoth.isEliminatedLoss, false);
console.log('  ✅ 3. Kiểm thử hàm đánh giá evaluateDeBet: PASS');

// 4. Kiểm thử Báo cáo tổng thể buildDeFusionReport
const report = buildDeFusionReport();
assert.strictEqual(report.success, true);
assert.strictEqual(typeof report.totalEvaluatedDays, 'number');
assert(report.totalEvaluatedDays >= 280, 'Phải đánh giá ít nhất 280 ngày năm 2026');
assert(report.summary.shadow, 'Summary phải có shadow');
assert(report.summary.daily, 'Summary phải có daily');
assert(report.summary.triCore, 'Summary phải có triCore');
assert(report.summary.fusion, 'Summary phải có fusion');

// Kiểm tra kết quả Tri-Core đảo chiều PnL dương
console.log(`  📊 [Summary TriCore] Base: ${report.summary.triCore.base.netProfitM}M -> Filtered: +${report.summary.triCore.filtered.netProfitM}M (ROI: +${report.summary.triCore.filtered.roi}%)`);
assert(report.summary.triCore.filtered.netProfitM > 0, 'Tri-Core sau lọc phải có lãi ròng dương');
assert(report.summary.triCore.filtered.savedStakeM > 400, 'Tri-Core sau lọc phải tiết kiệm trên 400M vốn');

// Kiểm tra Today Recommendation
assert(report.todayRecommendation, 'Phải có todayRecommendation');
assert(report.todayRecommendation.shadow.filteredNumbers.length > 0, 'Shadow hôm nay phải có số');
assert(report.todayRecommendation.daily.filteredNumbers.length > 0, 'Daily hôm nay phải có số');
assert(report.todayRecommendation.triCore.filteredNumbers.length > 0, 'TriCore hôm nay phải có số');
assert(report.todayRecommendation.fusion.filteredNumbers.length > 0, 'Fusion hôm nay phải có số');
console.log('  ✅ 4. Kiểm thử buildDeFusionReport trên dữ liệu thực tế 2026: PASS');

// 5. Kiểm thử các file Views và Routes
const filesToCheck = [
    'views/de-fusion.html',
    'public/js/de-fusion.js',
    'app/de-fusion/route.js',
    'app/api/de-fusion/route.js'
];
filesToCheck.forEach(f => {
    const fullPath = path.join(__dirname, '..', f);
    assert(fs.existsSync(fullPath), `File ${f} phải tồn tại`);
});
console.log('  ✅ 5. Kiểm thử cấu trúc view & route files: PASS');

console.log('\n🎉 TẤT CẢ CÁC BÀI TEST ĐỀ FUSION & ANTI-PARITY ĐÃ ĐẠT 100% THÀNH CÔNG!');
