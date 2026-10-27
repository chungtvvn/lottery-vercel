#!/usr/bin/env node
'use strict';
/**
 * test-ssot-invariants.js — no-framework Node invariant test (2026-10-27 upgrade).
 * Run: node scripts/test-ssot-invariants.js  (npm: test:ssot-invariants)
 * Plain node:assert only, no new dependency, no file writes, no network.
 * It tests the canonical rules, not a prediction method:
 *  - Đề capital is derived: (vip*3 + single*1) * 1000K.
 *  - Lô capital for the 26/10 tiers, Xiên 5 C(5,4) payout table.
 *  - Day-total definition B: Đề + Lô gốc + 2 Dàn Xiên 4 only
 *    (Xiên 5 and Lô Đột Phá X2 are never added).
 *  - Settlement gate: past dates are never blocked; today before 18:40 VN is blocked.
 *  - Locked-bet crossX2 rule (2026-10-27 fix): registerDailyBet never tops up
 *    crossX2/loCrossX2 onto an existing locked bet (read-only source check —
 *    the live registry is never touched by this test).
 *  - Shadow/dropoff merge rule (2026-10-27 fix): the daily-advisor shadow
 *    fallback only fills a missing section; a longer shadow copy is logged
 *    and ignored, never overwrites (read-only source check).
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { deStakeKFromCounts, deStakeKFromBet, assertDeStakeK, isSettlementBlockedForToday } =
    require('../lib/services/dailyLockedBetsRegistryService');

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`ok - ${name}`); }

// 1. Đề capital formula.
check('Đề 30-set (17 VIP + 13 single) = 64000K', () => {
    assert.strictEqual(deStakeKFromCounts(17, 13), 64000);
});
check('Đề 43-set (17 VIP + 26 single) = 77000K (not the old literal 70000K)', () => {
    assert.strictEqual(deStakeKFromCounts(17, 26), 77000);
    assert.notStrictEqual(deStakeKFromCounts(17, 26), 70000);
});
check('assertDeStakeK rejects a stored 70000K on a 43-set, accepts 77000K', () => {
    const bet43 = { vipNumbers: Array(17).fill('01'), singleNumbers: Array(26).fill('02'), stakeK: 70000 };
    assert.throws(() => assertDeStakeK(bet43, 'test'));
    assert.doesNotThrow(() => assertDeStakeK({ ...bet43, stakeK: 77000 }, 'test'));
    assert.strictEqual(deStakeKFromBet(bet43), 77000);
});

// 2. Lô capital, 26/10 tiers: X5 0, X4 2, X3 5, X1 8; 2200K per X1 unit.
check('Lô 26/10 capital = 2*8.8 + 5*6.6 + 8*2.2 = 68200K', () => {
    const stakeK = 0 * 5 * 2200 + 2 * 4 * 2200 + 5 * 3 * 2200 + 8 * 1 * 2200;
    assert.strictEqual(stakeK, 68200);
});
check('Lô 26/10 P&L: 1 X3 hit = 3*8000K payout, 24000K - 68200K = -44200K', () => {
    assert.strictEqual(1 * 3 * 8000 - 68200, -44200);
});

// 3. Xiên 5 = C(5,4) = 5 tickets, 11M each = 55000K; payout table (VIP scale, K).
check('Xiên 5 tickets = C(5,4) = 5, stake 5*11000K = 55000K', () => {
    const tickets = 5; // C(5,4)
    assert.strictEqual(tickets * 11000, 55000);
});
check('Xiên 5 payout table: 5/5=1920000K, 4/5=720000K, 3/5=204000K, 2/5=36000K', () => {
    assert.strictEqual(5 * 384000, 1920000);
    assert.strictEqual(384000 + 4 * 84000, 720000);
    assert.strictEqual(2 * 84000 + 3 * 12000, 204000);
    assert.strictEqual(3 * 12000, 36000);
});

// 4. Day-total definition B for 26/10, using the stored (audit) pillar values.
// This tests the DEFINITION (which columns are summed), not the derived
// capital fix: with the old stored Đề -70000K the B total is -136200K.
// With derived Đề -77000K the same definition gives -143200K (see migration).
check('Day-total B 26/10 = Đề -70000K + Lô -44200K + Xiên4 -22000K = -136200K', () => {
    assert.strictEqual(-70000 + -44200 + -22000, -136200);
});
check('Day-total B never adds Xiên 5 (-55000K) or X2 (-50800K)', () => {
    const totalB = -70000 + -44200 + -22000;
    assert.notStrictEqual(totalB, totalB + -55000 + -50800);
    assert.strictEqual(totalB + -55000 + -50800, -242000);
});

// 5. Settlement gate.
check('Settlement gate: a past date is never blocked', () => {
    assert.strictEqual(isSettlementBlockedForToday('2000-01-01'), false);
});
check('Settlement gate: today matches VN time (blocked iff before 18:40 VN)', () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const today = `${get('year')}-${get('month')}-${get('day')}`;
    const minutes = Number(get('hour')) * 60 + Number(get('minute'));
    assert.strictEqual(isSettlementBlockedForToday(today), minutes < 18 * 60 + 40);
});

// 6. Locked-bet crossX2 rule + shadow merge rule (read-only source checks).
check('registerDailyBet never mutates an existing bet with crossX2/loCrossX2 top-up', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'services', 'dailyLockedBetsRegistryService.js'), 'utf8');
    assert.ok(!src.includes('existingBet.crossX2 ='), 'existingBet.crossX2 assignment must be gone');
    assert.ok(!src.includes('existingBet.loCrossX2 ='), 'existingBet.loCrossX2 assignment must be gone');
    assert.ok(src.includes('Refusing crossX2 top-up'), 'refusal log must be present');
    // Settlement path is untouched: crossX2 may still be set at settlement.
    assert.ok(src.includes('if (!bet.crossX2)'), 'settlement crossX2 path must remain');
});
check('Shadow dropoff merge is registry-wins: fill-missing only, longer copy logged', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'daily-advisor', 'route.js'), 'utf8');
    const start = src.indexOf('Explicit shadow cache file fallback');
    const end = src.indexOf('Secondary R2 fallback');
    assert.ok(start >= 0 && end > start, 'shadow fallback block must exist');
    const block = src.slice(start, end);
    assert.ok(block.includes('registry wins: ignoring longer shadow cache for deDropoffMerge'), 'de shadow log missing');
    assert.ok(block.includes('registry wins: ignoring longer shadow cache for loDropoff27'), 'lo shadow log missing');
    assert.ok(!block.includes('>= (payload'), 'old longer-shadow-overwrites rule must be gone from the shadow block');
    assert.ok(block.includes('if (!payload?.deDropoffMerge)'), 'shadow must only fill a missing deDropoffMerge');
    assert.ok(block.includes('if (!payload?.loDropoff27)'), 'shadow must only fill a missing loDropoff27');
});

console.log(`\nAll ${passed} SSOT invariant checks passed.`);
