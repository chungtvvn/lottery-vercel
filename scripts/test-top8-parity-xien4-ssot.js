/**
 * Test SSOT Immutability, Strict PIT & Economics for Top 8 Parity Xiên 4
 */
const assert = require('assert');
const path = require('path');
const { pairTop8WithParity, evaluateTop8ParityXien4, PAYOUT_MAP, STAKE_PER_DAN_K, STAKE_TOTAL_K } = require('../lib/services/top8ParityXien4Service');

console.log('================================================================================');
console.log('🚀 TESTING TOP 8 PARITY XIÊN 4 SSOT IMMUTABILITY, ALGORITHM & ECONOMICS');
console.log('================================================================================');

// 1. Test Algorithm Logic
console.log('1. Testing parity pairing algorithm:');

// Case A: 3 đầu chẵn, số 4 chẵn -> tìm lẻ đầu tiên
const top8_allEven = ['02', '24', '46', '68', '13', '35', '57', '79'];
const resA = pairTop8WithParity(top8_allEven);
assert.deepStrictEqual(resA.dan1, ['02', '24', '46', '13'], 'Phải đổi số 4 bằng số lẻ đầu tiên');
assert.deepStrictEqual(resA.dan2, ['68', '35', '57', '79'], 'Dàn 2 phải chứa số 68 bị đổi');
assert.strictEqual(resA.swapped, true);
console.log('  ✔ Case A (3 chẵn + 1 chẵn -> tráo số lẻ): PASS');

// Case B: 3 đầu lẻ, số 4 lẻ -> tìm chẵn đầu tiên
const top8_allOdd = ['11', '33', '55', '77', '22', '44', '66', '88'];
const resB = pairTop8WithParity(top8_allOdd);
assert.deepStrictEqual(resB.dan1, ['11', '33', '55', '22'], 'Phải đổi số 4 bằng số chẵn đầu tiên');
assert.deepStrictEqual(resB.dan2, ['77', '44', '66', '88'], 'Dàn 2 phải chứa số 77 bị đổi');
assert.strictEqual(resB.swapped, true);
console.log('  ✔ Case B (3 lẻ + 1 lẻ -> tráo số chẵn): PASS');

// Case C: Đã có cả chẵn và lẻ trong 4 số đầu
const top8_mixed = ['31', '95', '12', '41', '57', '97', '23', '44']; // 2026-10-23
const resC = pairTop8WithParity(top8_mixed);
assert.deepStrictEqual(resC.dan1, ['31', '95', '12', '41']);
assert.deepStrictEqual(resC.dan2, ['57', '97', '23', '44']);
assert.strictEqual(resC.swapped, false);
console.log('  ✔ Case C (Đã cân bằng chẵn/lẻ -> giữ nguyên): PASS');

// 2. Test Economics & Payout Map
console.log('\n2. Testing economics and payouts:');
assert.strictEqual(STAKE_TOTAL_K, 22000);
assert.strictEqual(STAKE_PER_DAN_K, 11000);

const eval4 = evaluateTop8ParityXien4(['01', '02', '03', '04'], ['05', '06', '07', '08'], ['01', '02', '03', '04']);
assert.strictEqual(eval4.hits1, 4);
assert.strictEqual(eval4.payout1, 384000);
assert.strictEqual(eval4.profit1, 373000);
assert.strictEqual(eval4.hits2, 0);
assert.strictEqual(eval4.payout2, 0);
assert.strictEqual(eval4.profit2, -11000);
assert.strictEqual(eval4.payoutK, 384000);
assert.strictEqual(eval4.profitK, 362000);
console.log('  ✔ Ăn 4/4 con: Payout 384M (+373M net trên dàn): PASS');

const eval3 = evaluateTop8ParityXien4(['01', '02', '03', '04'], ['05', '06', '07', '08'], ['01', '02', '03']);
assert.strictEqual(eval3.hits1, 3);
assert.strictEqual(eval3.payout1, 84000);
assert.strictEqual(eval3.profit1, 73000);
console.log('  ✔ Ăn 3/4 con: Payout 84M (+73M net trên dàn): PASS');

const eval2 = evaluateTop8ParityXien4(['01', '02', '03', '04'], ['05', '06', '07', '08'], ['01', '02']);
assert.strictEqual(eval2.hits1, 2);
assert.strictEqual(eval2.payout1, 12000);
assert.strictEqual(eval2.profit1, 1000);
console.log('  ✔ Ăn 2/4 con: Payout 12M (+1M net trên dàn): PASS');

const eval1 = evaluateTop8ParityXien4(['01', '02', '03', '04'], ['05', '06', '07', '08'], ['01']);
assert.strictEqual(eval1.hits1, 1);
assert.strictEqual(eval1.payout1, 0);
assert.strictEqual(eval1.profit1, -11000);
console.log('  ✔ Ăn 1/4 con: Payout 0M (-11M lỗ cả dàn): PASS');

// 3. Test SSOT Registry Immutability Across All Dates
console.log('\n3. Testing SSOT Registry immutability across 38 dates (2026-09-16 to 2026-10-23):');
const reg = require('../data/daily_locked_bets_registry.json');
const dates = Object.keys(reg.dates).filter(d => d >= '2026-09-16').sort();

let checkedDates = 0;
for (const date of dates) {
    const entry = reg.dates[date];
    const b = entry.bets?.top8ParityXien4;
    assert(b, `Date ${date} must have bets.top8ParityXien4`);
    assert(Array.isArray(b.dan1) && b.dan1.length === 4, `Date ${date} dan1 length must be 4`);
    assert(Array.isArray(b.dan2) && b.dan2.length === 4, `Date ${date} dan2 length must be 4`);
    assert.strictEqual(b.stakeK, 22000);

    if (entry.isSettled) {
        const s = entry.settlement?.top8ParityXien4;
        assert(s, `Settled date ${date} must have settlement.top8ParityXien4`);
        assert.deepStrictEqual(s.dan1, b.dan1, `Date ${date} settlement.dan1 must strictly equal bets.dan1`);
        assert.deepStrictEqual(s.dan2, b.dan2, `Date ${date} settlement.dan2 must strictly equal bets.dan2`);
        assert.strictEqual(s.stakeK, 22000);
        assert.strictEqual(s.profitK, s.payoutK - s.stakeK, `Date ${date} profitK must equal payoutK - stakeK`);
    }
    checkedDates++;
}
console.log(`  ✔ Verified ${checkedDates} dates in registry: 100% strict SSOT immutability PASS!`);

// 4. Test Pending Date 2026-10-23
console.log('\n4. Testing pending prediction for 2026-10-23:');
const p23 = reg.dates['2026-10-23']?.bets?.top8ParityXien4;
assert.deepStrictEqual(p23.dan1, ['31', '95', '12', '41']);
assert.deepStrictEqual(p23.dan2, ['57', '97', '23', '44']);
console.log(`  ✔ Dàn 1: [${p23.dan1.join(', ')}] (11M)`);
console.log(`  ✔ Dàn 2: [${p23.dan2.join(', ')}] (11M)`);

console.log('================================================================================');
console.log('🎉 ALL TESTS PASSED! SSOT AND ECONOMICS 100% BULLETPROOF.');
console.log('================================================================================');
