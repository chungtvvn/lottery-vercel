/**
 * scripts/test-xien-fusion.js
 * 
 * Unit Test xác minh toàn diện tính năng Dàn Xiên Ghép Tổng Hợp (Fusion Engine)
 */

const assert = require('assert');
const {
    fusePair,
    fuseXien4,
    evalSingleDan,
    extractXien2Pairs,
    getXienFusionReport,
    PAYOUT_MAP,
    DAILY_STAKE_K,
    SHADOW_STAKE_K,
    FUSION_STAKE_K
} = require('../lib/services/xienFusionService');

console.log('🧪 Bắt đầu kiểm thử tính năng Dàn Xiên Ghép Tổng Hợp...');

// 1. Kiểm thử hàm ghép dàn cơ bản fusePair
const d1 = ['92', '64', '10', '54'];
const s1 = ['59', '52', '75', '49'];
const f1 = fusePair(d1, s1);

assert.strictEqual(f1.danA.length, 4, 'Dàn A phải có đúng 4 số');
assert.strictEqual(f1.danB.length, 4, 'Dàn B phải có đúng 4 số');
assert.deepStrictEqual(f1.danA, ['92', '64', '59', '52'], 'Dàn A phải lấy 2 số đầu Daily + 2 số đầu Shadow');
assert.deepStrictEqual(f1.danB, ['10', '54', '75', '49'], 'Dàn B phải lấy các số còn lại của Daily + Shadow');

// 2. Kiểm thử khi có số trùng lặp giữa Daily và Shadow
const dOverlap = ['92', '64', '10', '54'];
const sOverlap = ['92', '52', '75', '49']; // 92 trùng với d[0]
const fOverlap = fusePair(dOverlap, sOverlap);
assert.strictEqual(fOverlap.danA.length, 4, 'Dàn A khi trùng phải vẫn đủ 4 số');
assert.strictEqual(new Set(fOverlap.danA).size, 4, 'Dàn A không được có số trùng lặp');
assert.deepStrictEqual(fOverlap.danA, ['92', '64', '52', '75'], 'Khi 92 trùng, phải lấy 52 và 75 từ Shadow');

// 3. Kiểm thử tính thưởng Quây 11 vé
const actSetTest = new Set(['92', '64', '59', '52']); // Nổ 4/4
const eval4 = evalSingleDan(['92', '64', '59', '52'], actSetTest);
assert.strictEqual(eval4.hits, 4, 'Trúng 4 số');
assert.strictEqual(eval4.payoutK, 384000, 'Nổ X4 phải ăn 384M');
assert.strictEqual(eval4.profitK, 373000, 'Nổ X4 lãi net +373M');

const actSet3 = new Set(['92', '64', '59', '00']); // Nổ 3/4
const eval3 = evalSingleDan(['92', '64', '59', '52'], actSet3);
assert.strictEqual(eval3.hits, 3, 'Trúng 3 số');
assert.strictEqual(eval3.payoutK, 84000, 'Nổ X3 phải ăn 84M');
assert.strictEqual(eval3.profitK, 73000, 'Nổ X3 lãi net +73M');

const actSet2 = new Set(['92', '64', '11', '00']); // Nổ 2/4
const eval2 = evalSingleDan(['92', '64', '59', '52'], actSet2);
assert.strictEqual(eval2.hits, 2, 'Trúng 2 số');
assert.strictEqual(eval2.payoutK, 12000, 'Nổ X2 phải ăn 12M');
assert.strictEqual(eval2.profitK, 1000, 'Nổ X2 lãi net +1M');

// 4. Kiểm thử trích xuất Cặp Xiên 2
const pairs = extractXien2Pairs([
    { id: '1A', numbers: ['92', '64', '59', '52'] }
]);
assert.strictEqual(pairs.length, 6, '1 dàn 4 số phải sinh ra đúng C(4,2) = 6 cặp Xiên 2');

// 5. Kiểm thử toàn bộ báo cáo lịch sử (Registry 46 ngày)
const report = getXienFusionReport({ forceRefresh: true });
assert.strictEqual(report.success, true, 'Báo cáo phải thành công');
assert.strictEqual(report.summary.totalDays, 46, 'Phải đối soát đủ 46 ngày');
assert.strictEqual(report.summary.daily.stakeK, 1012000, 'Vốn Daily 46 ngày = 1.012M');
assert.strictEqual(report.summary.shadow.stakeK, 1012000, 'Vốn Shadow 46 ngày = 1.012M');
assert.strictEqual(report.summary.fusion.stakeK, 2024000, 'Vốn Fusion 4 dàn = 2.024M');

// Xác nhận Fusion tăng gấp đôi số nháy nổ X3 và X2
assert.strictEqual(report.summary.fusion.h3, 16, 'Fusion nổ đúng 16 lần X3 (gấp đôi Daily)');
assert.strictEqual(report.summary.fusion.h2, 46, 'Fusion nổ đúng 46 lần X2 (gấp đôi Daily)');

console.log('✅ TẤT CẢ 5 BÀI TEST ĐỀU PASSED 100%!');
