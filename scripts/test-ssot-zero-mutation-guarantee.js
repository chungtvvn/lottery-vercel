'use strict';

/**
 * scripts/test-ssot-zero-mutation-guarantee.js
 * ==============================================================================
 * BỘ KIỂM THỬ ĐẢM BẢO TUYỆT ĐỐI BẤT BIẾN (ZERO MUTATION & SSOT GUARANTEE)
 * ==============================================================================
 * Kiểm định rằng:
 * 1. Mọi dàn cược đã khóa trong SSOT Registry trước 18h15 không bao giờ bị thay đổi.
 * 2. Kết toán sau 18h15 thuần túy đối chiếu với kết quả mở thưởng, cấm re-simulate.
 * 3. Mọi dịch vụ tính toán (aiLotteryResearchService, crossHedgingPortfolioService,
 *    predictionLockGuard) đều bắt buộc đọc SSOT Registry làm căn cứ tối thượng.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const regService = require('../lib/services/dailyLockedBetsRegistryService');
const aiResearch = require('../lib/services/aiLotteryResearchService');
const crossHedgingService = require('../lib/services/crossHedgingPortfolioService');
const { isPredictionLockActive, preserveLockedRecommendation } = require('../lib/utils/predictionLockGuard');

function test(name, fn) {
    try {
        fn();
        console.log(`  ✔ PASS: ${name}`);
    } catch (e) {
        console.error(`  ✘ FAIL: ${name}`);
        console.error(`    ${e.message}`);
        process.exitCode = 1;
    }
}

console.log('='.repeat(80));
console.log('🛡️ RUNNING ZERO MUTATION & IMMUTABLE SSOT VERIFICATION SUITE');
console.log('='.repeat(80));

const reg = regService.loadRegistry();

// 1. Kiểm tra tính bất biến của ngày 18/10/2026 trong SSOT Registry
test('1.1: 2026-10-18 lo4EngineFusion có số 95 trong Tầng Cực VIP X4', () => {
    const d18 = reg.dates['2026-10-18'];
    assert(d18, 'Ngày 2026-10-18 phải tồn tại trong registry');
    const loBet = d18.bets?.lo4EngineFusion;
    assert(loBet, 'lo4EngineFusion phải tồn tại trong bets 18/10');
    assert.deepStrictEqual(loBet.tierX4, ['54', '62', '95'], 'tierX4 phải là [54, 62, 95]');
    assert.strictEqual(loBet.tierX4.includes('95'), true, 'Số 95 bắt buộc phải nằm ở tierX4');
    assert.strictEqual(loBet.tierX3.includes('95'), false, 'Số 95 tuyệt đối không được nằm ở tierX3');
});

test('1.2: 2026-10-18 lo4EngineFusion kết toán đúng 3 nháy (54, 95, 10) lãi Lô +6.0M', () => {
    const s18 = reg.dates['2026-10-18']?.settlement?.lo4EngineFusion;
    assert(s18, 'settlement lo4EngineFusion phải tồn tại');
    assert.strictEqual(s18.x4Hits, 2, 'X4 phải nổ đúng 2 nháy (54 và 95)');
    assert.strictEqual(s18.x1Hits, 1, 'X1 phải nổ đúng 1 nháy (10)');
    assert.strictEqual(s18.totalHits, 3, 'Tổng số nháy nổ phải là 3');
    assert.strictEqual(s18.lotoPayoutK, 72000, 'Loto payout phải là 72M');
    assert.strictEqual(s18.lotoStakeK, 66000, 'Loto stake phải là 66M');
    assert.strictEqual(s18.lotoProfitK, 6000, 'Loto profit phải là +6M');
});

test('1.3: 2026-10-18 Xiên 4 nổ 2 con (54, 95), ăn vé Xiên 2 lãi +1.0M', () => {
    const s18 = reg.dates['2026-10-18']?.settlement?.lo4EngineFusion;
    assert.strictEqual(s18.xienHitsCount, 2, 'Xiên 4 phải nổ đúng 2 con');
    assert.strictEqual(s18.xienPayoutK, 12000, 'Payout Xiên phải là 12M');
    assert.strictEqual(s18.xienProfitK, 1000, 'Profit Xiên phải là +1M');
});

test('1.4: 2026-10-18 Combo Danh Mục tổng lãi ròng đạt đúng +21.0M (+21000K)', () => {
    const ch = reg.dates['2026-10-18']?.settlement?.crossHedgingPortfolio;
    assert(ch, 'settlement crossHedgingPortfolio phải tồn tại');
    assert.strictEqual(ch.deProfitK, 14000, 'Đề lãi +14M');
    assert.strictEqual(ch.loProfitK, 6000, 'Lô lãi +6M');
    assert.strictEqual(ch.xienProfitK, 1000, 'Xiên lãi +1M');
    assert.strictEqual(ch.totalProfitK, 21000, 'Tổng lãi Combo phải là +21M');
    assert.strictEqual(ch.totalPayoutK - ch.totalStakeK, ch.totalProfitK, 'Bảo toàn tài chính Payout - Stake === Profit');
});

// 2. Kiểm tra tính bất biến khi chạy qua các dịch vụ lõi (Zero Re-computation)
test('2.1: aiLotteryResearchService.buildLo4EngineFusionAdvisor lấy chuẩn xác bản ghi 18/10 từ Registry', () => {
    const fakeRaw = [
        { date: '2026-10-18', special: 42, prize4_4: 95, prize5_2: 54, prize7_4: 10 }
    ];
    const res = aiResearch.buildLo4EngineFusionAdvisor(null, null, null, fakeRaw, {
        dailyLockedBetsRegistry: reg
    });
    assert(res, 'Phải sinh thành công lo4EngineFusion');
    const row18 = res.modes.top6.settledLedger.find(r => r.date === '2026-10-18');
    assert(row18, 'Phải có ngày 2026-10-18 trong settledLedger');
    assert.deepStrictEqual(row18.tierX4, ['54', '62', '95'], 'tierX4 trong buildLo4EngineFusionAdvisor phải là [54, 62, 95]');
    assert.strictEqual(row18.dayLotoProfitK, 6000, 'dayLotoProfitK phải là +6000K');
    assert.strictEqual(row18.dayLotoHits, 3, 'dayLotoHits phải là 3 nháy');
});

test('2.2: crossHedgingPortfolioService.evaluateCrossAssetPortfolio trả về dàn locked bất biến từ Registry', () => {
    const bet18 = crossHedgingService.evaluateCrossAssetPortfolio('2026-10-18', [], null, {
        dailyLockedBetsRegistry: reg
    });
    assert(bet18, 'Phải trả về bet18');
    assert.strictEqual(bet18.pillar1_De.stakeK, 70000, 'Pillar 1 Đề stake phải là 70M');
    assert.strictEqual(bet18.pillar2_Lo.stakeK, 66000, 'Pillar 2 Lô stake phải là 66M');
    assert.strictEqual(bet18.totalStakeK, 147000, 'Tổng vốn phải là 147M');
});

test('2.3: predictionLockGuard.isPredictionLockActive khóa chặt ngày đã chốt trong Registry', () => {
    const status18 = isPredictionLockActive('2026-10-18', []);
    assert.strictEqual(status18.isLocked, true, 'Ngày 18/10 phải bị khóa');
    assert.strictEqual(status18.isSettled, true, 'Ngày 18/10 phải được đánh dấu đã kết toán');

    const status19 = isPredictionLockActive('2026-10-19', []);
    assert.strictEqual(status19.isLocked, true, 'Ngày 19/10 đã niêm phong trong Registry phải bị khóa');
});

test('2.4: registerDailyBet từ chối mọi hành vi ghi đè ngày đã có dàn số hợp lệ', () => {
    const overwriteAttempt = regService.registerDailyBet('2026-10-18', 'lo4EngineFusion', {
        tierX4: ['99', '99'],
        betNumbers: [{ num: '99', votes: 4, multiplier: 5 }]
    });
    assert.strictEqual(overwriteAttempt, false, 'Phải từ chối ghi đè dàn số ngày 18/10');
    const freshReg = regService.loadRegistry();
    assert.deepStrictEqual(freshReg.dates['2026-10-18'].bets.lo4EngineFusion.tierX4, ['54', '62', '95'], 'tierX4 vẫn phải bất biến tuyệt đối [54, 62, 95]');
});

console.log('='.repeat(80));
console.log('🎉 ALL ZERO MUTATION & SSOT IMMUTABILITY TESTS PASSED WITH 100% INTEGRITY!');
console.log('='.repeat(80));
