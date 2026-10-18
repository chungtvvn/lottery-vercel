'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
    loadRegistry,
    saveRegistry,
    getLockedBetForDate,
    registerDailyBet,
    settleDateDirectly
} = require('../lib/services/dailyLockedBetsRegistryService');

console.log('='.repeat(80));
console.log('🧪 TESTING SINGLE SOURCE OF TRUTH (SSOT) DAILY LOCKED BETS & DIRECT SETTLEMENT');
console.log('='.repeat(80));

// 1. Kiểm tra tải và lưu Registry
const reg = loadRegistry();
assert.ok(reg && typeof reg === 'object', 'Registry phải tải được thành công');
assert.strictEqual(reg.version, '1.0.0');
console.log('✔ PASS 1.1: loadRegistry() tải thành công file registry cấu trúc v1.0.0');

// 2. Kiểm tra đối soát 10/10 đã chốt (Immutability & Correctness)
const bet10 = reg.dates['2026-10-10'];
assert.ok(bet10, 'Phải có bản ghi 2026-10-10 trong Registry');
assert.strictEqual(bet10.isSettled, true, '2026-10-10 phải đã kết toán');
assert.strictEqual(bet10.actualResult?.special, '53', 'Đặc biệt 10/10 phải là 53');

// Kiểm tra Lô Ghép 4 Động Cơ ngày 10/10:
// Đúng cấu trúc người dùng yêu cầu: X5 có duy nhất 70, X4 rỗng, X3 có 36-43-62-79, X1 có 8 số
const lo4_10 = bet10.bets.lo4EngineFusion;
assert.ok(lo4_10, 'Phải có dàn lo4EngineFusion ngày 10/10');
assert.deepStrictEqual(lo4_10.tierX5, ['70'], 'X5 ngày 10/10 chỉ có duy nhất số 70');
assert.deepStrictEqual(lo4_10.tierX4, [], 'X4 ngày 10/10 phải là mảng rỗng (không có X4)');
assert.deepStrictEqual(lo4_10.tierX3, ['36', '43', '62', '79'], 'X3 ngày 10/10 có 4 số 36, 43, 62, 79');
assert.strictEqual(lo4_10.tierX1.length, 8, 'X1 ngày 10/10 có 8 số');
console.log('✔ PASS 2.1: lo4EngineFusion ngày 10/10 chuẩn 100% (X5: [70], X4: [], X3: 4 số, X1: 8 số)');

// Kiểm tra kết quả kết toán 10/10:
const settle10 = bet10.settlement;
assert.ok(settle10 && settle10.lo4EngineFusion, 'Phải có settlement cho lo4EngineFusion ngày 10/10');
assert.strictEqual(settle10.lo4EngineFusion.x5Hits, 0, 'Số 70 ở X5 trượt 0 nháy');
assert.strictEqual(settle10.lo4EngineFusion.x4Hits, 0, 'X4 rỗng 0 nháy');
assert.strictEqual(settle10.lo4EngineFusion.x3Hits, 3, 'X3 nổ 3 nháy (36, 43, 79)');
assert.strictEqual(settle10.lo4EngineFusion.x1Hits, 4, 'X1 nổ 4 nháy (22 x2, 30 x1, 93 x1)');
assert.strictEqual(settle10.lo4EngineFusion.totalHits, 7, 'Tổng nổ 7 nháy');
assert.strictEqual(settle10.lo4EngineFusion.lotoProfitK, 49000, 'Lãi Lô tầng ngày 10/10 là +49.0M VNĐ');
console.log('✔ PASS 2.2: lo4EngineFusion 10/10 tính toán nổ 7 nháy, lãi Lô +49.0M VNĐ');

// Kiểm tra Xiên 4 Bộ 4 Quây ngày 10/10:
assert.strictEqual(settle10.lo4EngineFusion.xienHitsCount, 3, 'Xiên 4 [70, 36, 43, 79] nổ 3 con (36, 43, 79)');
assert.strictEqual(settle10.lo4EngineFusion.xienPayoutK, 84000, 'Ăn xiên 4 trúng 3 con là 84M');
console.log('✔ PASS 2.3: Xiên 4 Bộ 4 Quây 10/10 nổ 3 con, ăn 84.0M payout');

// 3. Kiểm tra các phương pháp Shadow ngày 10/10:
assert.ok(settle10.deDropoffMerge, 'Phải có kết toán deDropoffMerge ngày 10/10');
assert.strictEqual(settle10.deDropoffMerge.isHit40, false, 'Đề 10/10 về 53 trượt dàn 40s');
assert.strictEqual(settle10.deDropoffMerge.profit40K, -12000, 'Lỗ -12.0M dàn 40s');
assert.strictEqual(settle10.deDropoffMerge.profit36K, -10800, 'Lỗ -10.8M dàn 36s');
console.log('✔ PASS 3.1: deDropoffMerge 10/10 kết toán trượt 53 (-12.0M / 36s -10.8M)');

assert.ok(settle10.loDropoff27, 'Phải có kết toán loDropoff27 ngày 10/10');
assert.deepStrictEqual(settle10.loDropoff27.top7, ['62', '88', '84', '52', '70', '36', '19']);
assert.strictEqual(settle10.loDropoff27.hits7, 1, 'Nổ số 36 1 nháy');
assert.strictEqual(settle10.loDropoff27.flatProfit7K, -7400, 'Phẳng lỗ -7.4M');
assert.strictEqual(settle10.loDropoff27.tierProfitK, -14000, 'Tầng lỗ -14M');
console.log('✔ PASS 3.2: loDropoff27 10/10 kết toán nổ 36 1 nháy (Phẳng -7.4M, Tầng -14M)');

assert.ok(settle10.triCoreDe, 'Phải có kết toán triCoreDe ngày 10/10');
assert.strictEqual(settle10.triCoreDe.hit, false, 'Tri-Core 24s trượt 53');
assert.strictEqual(settle10.triCoreDe.profitK, -7200, 'Lỗ -7.2M');
console.log('✔ PASS 3.3: triCoreDe 10/10 kết toán trượt (-7.2M)');

assert.ok(settle10.semanticResonanceSuite, 'Phải có kết toán semanticResonanceSuite ngày 10/10');
assert.strictEqual(settle10.semanticResonanceSuite.de.isWin, false, 'Đề 36s trượt (-10.8M)');
assert.strictEqual(settle10.semanticResonanceSuite.lo.hits, 1, 'Lô ăn 1 nháy (-7.4M)');
assert.strictEqual(settle10.semanticResonanceSuite.xien5.hitsCount, 0, 'Xiên 5 trượt (-5.5M)');
assert.strictEqual(settle10.semanticResonanceSuite.comboFlat.profitK, -23700, 'Combo Flat lỗ -23.7M');
console.log('✔ PASS 3.4: semanticResonanceSuite 10/10 kết toán chuẩn xác (Combo Flat -23.7M)');

// 4. Kiểm tra dàn đánh ngày 11/10 (Dự đoán ngày tiếp theo không bị lấy trùng ngày cũ):
const bet11 = reg.dates['2026-10-11'];
assert.ok(bet11, 'Phải có bản ghi 2026-10-11 trong Registry');
assert.ok(bet11.isSettled != null, 'Bản ghi 2026-10-11 phải có trạng thái settled');

// Lô Dropoff 27 cho 11/10 phải là dàn mới của QMBF v6, KHÔNG ĐƯỢC trùng 10/10
const loDropoff11 = bet11.bets.loDropoff27;
assert.ok(loDropoff11, 'Phải có dàn loDropoff27 cho 11/10');
assert.deepStrictEqual(loDropoff11.top7, ['49', '52', '04', '43', '62', '54', '36'], 'Top 7 QMBF v6 ngày 11/10 phải là [49, 52, 04, 43, 62, 54, 36]');
assert.notDeepStrictEqual(loDropoff11.top7, ['62', '88', '84', '52', '70', '36', '19'], 'KHÔNG ĐƯỢC lấy trùng dàn cũ của ngày 10/10');
console.log('✔ PASS 4.1: loDropoff27 ngày 11/10 đã nạp chuẩn dàn mới [49, 52, 04, 43, 62, 54, 36]');

// Đề Đa Động Cơ Dropoff 40s cho 11/10 phải là dàn đồng thuận mới
const deDropoff11 = bet11.bets.deDropoffMerge;
assert.ok(deDropoff11, 'Phải có dàn deDropoffMerge cho 11/10');
assert.strictEqual(deDropoff11.numbers.length, 40, 'Dàn đề 11/10 phải đủ 40 số');
assert.strictEqual(deDropoff11.numbers[0], '05', 'Số đầu tiên của 11/10 phải là 05');
assert.notDeepStrictEqual(deDropoff11.numbers.slice(0, 5), ['18', '20', '48', '57', '59'], 'KHÔNG ĐƯỢC lấy trùng dàn cũ của ngày 10/10');
console.log('✔ PASS 4.2: deDropoffMerge ngày 11/10 đã nạp chuẩn dàn đồng thuận mới (bắt đầu bằng 05, 14, 16...)');

// Hệ 4 Semantic Resonance ngày 11/10
const srs11 = bet11.bets.semanticResonanceSuite;
assert.ok(srs11, 'Phải có dàn semanticResonanceSuite cho 11/10');
assert.deepStrictEqual(srs11.lo.top7, ['49', '52', '04', '43', '62', '54', '36'], 'Lô Hệ 4 ngày 11/10 đồng bộ với QMBF v6');
assert.deepStrictEqual(srs11.xien5.top5, ['49', '52', '04', '43', '62'], 'Xiên 5 Hệ 4 ngày 11/10 ghép từ Top 5');
console.log('✔ PASS 4.3: semanticResonanceSuite ngày 11/10 đồng bộ 100% với Top 7 và Xiên 5 mới');

// Lô Ghép 4 Động Cơ ngày 11/10
const lo4_11 = bet11.bets.lo4EngineFusion;
assert.ok(lo4_11, 'Phải có dàn lo4EngineFusion cho 11/10');
assert.deepStrictEqual(lo4_11.tierX4, ['04', '43', '49'], 'X4 ngày 11/10 là [04, 43, 49]');
assert.deepStrictEqual(lo4_11.tierX3, ['36', '70', '81'], 'X3 ngày 11/10 là [36, 70, 81]');
console.log('✔ PASS 4.4: lo4EngineFusion ngày 11/10 chốt dàn [04, 43, 49] X4 và [36, 70, 81] X3');

// 4.5 Kiểm tra ngày 12/10: Dàn Đề Tuyển Chọn 43 số KHÔNG CÓ SỐ 87, kết toán trượt 87 chuẩn xác
const bet12 = reg.dates['2026-10-12'];
assert.ok(bet12, 'Phải có bản ghi 2026-10-12');
assert.strictEqual(bet12.bets?.de?.numbers?.length, 43, 'Dàn Đề 12/10 phải là dàn 43 số Markov Gap Hazard');
assert.strictEqual(bet12.bets?.de?.numbers?.includes('87'), false, 'Dàn Đề 12/10 tuyệt đối KHÔNG có số 87');
assert.strictEqual(bet12.settlement?.de?.isHit, false, 'Đặc biệt về 87 kết toán trượt');
assert.strictEqual(bet12.settlement?.de?.profitK, -70000, 'Lỗ cược Đề -70M VNĐ');
assert.strictEqual(bet12.settlement?.crossHedgingPortfolio?.isDeHit, false, 'Combo Danh Mục ghi nhận Đề trượt');
assert.strictEqual(bet12.settlement?.crossHedgingPortfolio?.totalProfitK, -91000, 'Combo Danh Mục lỗ ròng -91M (không bị tính nhầm ăn Đề)');
console.log('✔ PASS 4.5: Ngày 12/10 Đề 43 số KHÔNG CÓ 87, kết toán Đề trượt (-70M), Combo lỗ -91M chuẩn xác 100%');

// 5. Kiểm tra tính bất biến của ngày đã kết toán khi gọi registerDailyBet
const overwriteAttempt = registerDailyBet('2026-10-10', 'lo4EngineFusion', { tierX5: ['99'] });
assert.strictEqual(overwriteAttempt, false, 'Không được phép ghi đè ngày đã kết toán');
const bet10After = getLockedBetForDate('2026-10-10', 'lo4EngineFusion');
assert.deepStrictEqual(bet10After.tierX5, ['70'], 'Dữ liệu 10/10 được bảo toàn bất biến tuyệt đối');
console.log('✔ PASS 5.1: registerDailyBet từ chối mọi nỗ lực ghi đè ngày đã kết toán (Zero Re-computation Guarantee)');

console.log('='.repeat(80));
console.log('🎉 ALL SINGLE SOURCE OF TRUTH (SSOT) REGISTRY TESTS PASSED WITH 100% INTEGRITY!');
console.log('='.repeat(80));
