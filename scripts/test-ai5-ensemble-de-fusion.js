#!/usr/bin/env node
'use strict';

/**
 * scripts/test-ai5-ensemble-de-fusion.js
 * 
 * Kiểm thử toàn diện Dàn Đề 50s Đồng Thuận 5 AI (Ensemble 5 AI Suite)
 * và Tích hợp Bộ Lọc Đối Xứng Nghịch Chẵn Lẻ (Anti-Parity Exclusion Engine).
 */

const assert = require('assert');
const path = require('path');
const { get5AIEnsembleDeForDate, getAll2026EnsembleDeMap, loadCompactDraws } = require('../lib/services/ai5EnsembleDeService');
const { getDeFusionReport, applyAntiParityFilter, evaluateDeBet } = require('../lib/services/deFusionService');

console.log('=== BẮT ĐẦU KIỂM THỬ ENSEMBLE 5 AI ĐỀ 50S & DE FUSION ===\n');

// 1. Kiểm thử Strict PIT & Kết quả ngày 05/11/2026
console.log('1. Kiểm tra dàn số ngày 05/11/2026 (Strict PIT, data qua 04/11/2026)...');
const pred = get5AIEnsembleDeForDate('2026-11-05');
assert(pred !== null, 'Dự đoán ngày 05/11/2026 không được null');
assert.strictEqual(pred.drawsUsed, 7604, 'Số kỳ sử dụng phải đúng 7,604 kỳ');
assert.strictEqual(pred.dataThrough, '2026-11-04', 'Dữ liệu chốt phải đúng ngày 04/11/2026');
assert.strictEqual(pred.top50.length, 50, 'Dàn phải đủ 50 số');
assert.strictEqual(pred.top25.length, 25, 'Dàn VIP phải đủ 25 số');
assert.strictEqual(pred.bot25.length, 25, 'Dàn Lót phải đủ 25 số');

// Top 5 số phải đúng chuẩn: 32, 09, 38, 22, 39
const expectedTop5 = ['32', '09', '38', '22', '39'];
assert.deepStrictEqual(pred.top50.slice(0, 5), expectedTop5, 'Top 5 số phải đúng tuyệt đối với Python script');
console.log('   ✓ Khớp chính xác 100% với Python script: Top 5 =', expectedTop5.join(' '));

// 2. Kiểm thử Bộ Lọc Anti-Parity ngày 05/11/2026
console.log('\n2. Kiểm tra Bộ Lọc Anti-Parity ngày 05/11/2026...');
// Ngày 05/11/2026: ĐB 46 về 2 ngày liên tiếp CC -> Dự đoán bẻ cầu sang LL -> Loại toàn bộ CC
const filtered = applyAntiParityFilter(pred.top25, pred.bot25, 'CC', 2000, 1000);
assert.strictEqual(filtered.origCount, 50, 'Số gốc phải là 50');
assert.strictEqual(filtered.filteredCount, 37, 'Sau lọc phải còn đúng 37 số');
assert.strictEqual(filtered.removedCount, 13, 'Số bị loại phải đúng 13 số');
assert.strictEqual(filtered.filteredTop.length, 19, 'VIP sau lọc phải còn 19 số');
assert.strictEqual(filtered.filteredBot.length, 18, 'Lót sau lọc phải còn 18 số');
assert.strictEqual(filtered.savedStakeK, 19000, 'Tiền vốn tiết kiệm phải là 19M (19,000K)');
assert.strictEqual(filtered.savedPct, 25.3, 'Tỷ lệ tiết kiệm vốn phải là 25.3%');

// Đảm bảo không có số nào trong dàn sau lọc thuộc dạng CC
filtered.filteredNumbers.forEach(n => {
    const isEven = (parseInt(n[0], 10) % 2 === 0) && (parseInt(n[1], 10) % 2 === 0);
    assert(!isEven, `Số ${n} là dạng CC nhưng không bị loại khỏi dàn sau lọc!`);
});
// Đảm bảo toàn bộ 13 số bị loại đều thuộc dạng CC
filtered.removedNumbers.forEach(n => {
    const isEven = (parseInt(n[0], 10) % 2 === 0) && (parseInt(n[1], 10) % 2 === 0);
    assert(isEven, `Số ${n} bị loại nhưng KHÔNG phải dạng CC!`);
});
console.log('   ✓ Bộ lọc loại trừ sạch sẽ 13 số CC (25.3% vốn cược), dàn cược còn 37 số.');

// 3. Kiểm thử Tích Hợp deFusionService
console.log('\n3. Kiểm tra Báo cáo deFusionService tổng hợp...');
const report = getDeFusionReport({ forceRefresh: true });
assert.strictEqual(report.success, true, 'Report phải thành công');
assert(report.summary.ai5Ensemble !== undefined, 'Summary phải có chiến lược ai5Ensemble');
assert(report.todayRecommendation.ai5Ensemble !== undefined, 'TodayRecommendation phải có ai5Ensemble');

const sLive = report.summary.ai5Ensemble.live;
const sFull = report.summary.ai5Ensemble.full2026;

console.log('   === THỐNG KÊ CHI TIẾT AI 5 ENSEMBLE ===');
console.log(`   🔴 Live Thực Chiến (${sLive.totalDays} kỳ):`);
console.log(`      - Dàn Gốc 50s:    Trúng ${sLive.base.wins}/${sLive.totalDays} (${sLive.base.winRate}%) · Lãi ${sLive.base.netProfitM >= 0 ? '+' : ''}${sLive.base.netProfitM}M (ROI: ${sLive.base.roi}%)`);
console.log(`      - Sau Lọc ~37s:   Trúng ${sLive.filtered.wins}/${sLive.totalDays} (${sLive.filtered.winRate}%) · Lãi ${sLive.filtered.netProfitM >= 0 ? '+' : ''}${sLive.filtered.netProfitM}M (ROI: ${sLive.filtered.roi}%)`);
console.log(`      - Vốn Tiết Kiệm:  +${sLive.filtered.savedStakeM}M (-${sLive.filtered.savedPct}% vốn) · Loại nhầm: ${sLive.filtered.eliminatedLosses} lần`);

console.log(`   📚 Toàn Năm 2026 (${sFull.totalDays} kỳ tham khảo):`);
console.log(`      - Dàn Gốc 50s:    Trúng ${sFull.base.wins}/${sFull.totalDays} (${sFull.base.winRate}%) · Lãi ${sFull.base.netProfitM}M`);
console.log(`      - Sau Lọc ~37s:   Trúng ${sFull.filtered.wins}/${sFull.totalDays} (${sFull.filtered.winRate}%) · Lãi ${sFull.filtered.netProfitM}M`);
console.log(`      - Vốn Tiết Kiệm:  +${sFull.filtered.savedStakeM}M (-${sFull.filtered.savedPct}% vốn)`);

// 4. Kiểm thử Chế độ Đánh Phẳng (Flat 1M ăn 84M)
console.log('\n4. Kiểm tra Chế độ Đánh Phẳng (Flat)...');
const flatReport = getDeFusionReport({ forceRefresh: true, betMode: 'flat' });
const flatLive = flatReport.summary.ai5Ensemble.live;
console.log(`   🎯 Đánh Phẳng 1M/số Live (${flatLive.totalDays} kỳ):`);
console.log(`      - Dàn Gốc 50s:  Lãi ${flatLive.base.netProfitM >= 0 ? '+' : ''}${flatLive.base.netProfitM}M`);
console.log(`      - Sau Lọc ~37s: Lãi ${flatLive.filtered.netProfitM >= 0 ? '+' : ''}${flatLive.filtered.netProfitM}M (Tăng thêm +${(flatLive.filtered.netProfitM - flatLive.base.netProfitM).toFixed(1)}M lãi)`);
assert(flatLive.filtered.netProfitM > flatLive.base.netProfitM, 'Sau lọc phải có lãi cao hơn gốc ở chế độ đánh phẳng');

console.log('\n=== TẤT CẢ 4 HẠNG MỤC KIỂM THỬ ĐÃ VƯỢT QUA 100% TUYỆT ĐỐI! ===');
