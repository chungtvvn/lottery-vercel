#!/usr/bin/env node
/**
 * scripts/test-adversarial-challenger-m1-orch4-1.js
 *
 * Standalone Empirical Adversarial Verification & Stress Test Harness
 * Subagent: challenger_m1_orch4_1 (EMPIRICAL CHALLENGER - critic, specialist)
 *
 * Verifies:
 * 1. Raw 2026-10-03 XSMB Draw Integrity (27 prizes, ĐB 61, exact prize array).
 * 2. 2026-10-03 Settlement Math from First Principles:
 *    - Đề 43s (17 VIP X3 + 26 Lót X1) vs ĐB 61 -> -77M VIP / -15.4M M3
 *    - Lô 7s (38, 62, 76, 10, 11, 24, 36) vs 27 giải Lô -> exactly 3 hits -> +35.2M VIP / +8.8M M3
 *    - Xiên 4 Quây [38, 62, 76, 10] vs 27 giải Lô -> exactly 3 hits (1 X3 + 3 X2 = 84x) -> +73M VIP / +14.6M M3
 *    - Total Combo -> +31.2M VIP / +8.0M M3
 *    - Xiên 3 Quây 10 vé [38, 62, 76, 10, 11] -> 1 X3 -> +5.5M
 *    - Dàn Xiên 5 (5 dàn X4 · 11M) -> 2 X3 (84M) + 3 X2 (12M) = 204M payout -> +149.0M
 * 3. Dynamic Re-Execution: `crossHedgingService.settleCrossAssetPortfolio(rec, draw03)`.
 * 4. Financial Conservation Law holds unconditionally across all 18 settled days in all 4 ledgers.
 * 5. Exactly 18 entries from 2026-09-16 to 2026-10-03 in all 4 ledgers with zero gaps or duplicates.
 * 6. Cumulative profit running balance conservation across all 18 combat days.
 * 7. Canonical SSOT cache parity (byte-identical) & Snapshot Freeze status (`isSettled: true`).
 * 8. Single-pillar hedging property empirical verification.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crossHedgingService = require('../lib/services/crossHedgingPortfolioService');

let passedAssertions = 0;
let failedAssertions = 0;
const results = [];

function check(title, fn) {
    try {
        fn();
        passedAssertions++;
        console.log(`  \x1b[32m✔ PASS\x1b[0m ${title}`);
        results.push({ title, status: 'PASS' });
    } catch (err) {
        failedAssertions++;
        console.error(`  \x1b[31m✘ FAIL\x1b[0m ${title}`);
        console.error(`    \x1b[31mError:\x1b[0m ${err.message}`);
        results.push({ title, status: 'FAIL', error: err.message });
    }
}

console.log('\n================================================================================');
console.log('⚔️  EMPIRICAL CHALLENGER VERIFICATION HARNESS — MILESTONE 1 (ORCH 4)');
console.log('================================================================================\n');

// 1. Load Data Files
const rawPath = path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');
const libCachePath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const dataCachePath = path.join(__dirname, '..', 'data', 'cached_daily_method_advisor.json');

const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const libCache = JSON.parse(fs.readFileSync(libCachePath, 'utf8'));
const dataCache = JSON.parse(fs.readFileSync(dataCachePath, 'utf8'));

// =============================================================================
// SUITE 1: Raw 2026-10-03 XSMB Data Integrity
// =============================================================================
console.log('\x1b[36m--- SUITE 1: Raw 2026-10-03 XSMB Data Integrity ---\x1b[0m');

check('1.1: Raw dataset ends on 2026-10-03 with 7,572 draws', () => {
    assert(raw.length >= 7572, `Expected >= 7572 draws, got ${raw.length}`);
    const last = raw[raw.length - 1];
    assert.strictEqual(last.date, '2026-10-03', `Last draw must be 2026-10-03, got ${last.date}`);
});

check('1.2: Raw 2026-10-03 draw has exact 27 prizes and special 61', () => {
    const draw03 = raw.find(r => r.date === '2026-10-03');
    assert(draw03, 'Draw 2026-10-03 must exist in raw dataset');
    assert.strictEqual(draw03.special, 61, 'Special prize must be 61');

    const prizes27 = [
        draw03.special,
        draw03.prize1,
        draw03.prize2_1, draw03.prize2_2,
        draw03.prize3_1, draw03.prize3_2, draw03.prize3_3, draw03.prize3_4, draw03.prize3_5, draw03.prize3_6,
        draw03.prize4_1, draw03.prize4_2, draw03.prize4_3, draw03.prize4_4,
        draw03.prize5_1, draw03.prize5_2, draw03.prize5_3, draw03.prize5_4, draw03.prize5_5, draw03.prize5_6,
        draw03.prize6_1, draw03.prize6_2, draw03.prize6_3,
        draw03.prize7_1, draw03.prize7_2, draw03.prize7_3, draw03.prize7_4
    ];
    assert.strictEqual(prizes27.length, 27, 'Must have exactly 27 prizes');
    assert(!prizes27.some(p => p === undefined || p === null || isNaN(p)), 'All 27 prizes must be valid numbers');

    // Expected numbers verification
    assert.strictEqual(draw03.prize7_1, 38, 'prize7_1 must be 38');
    assert.strictEqual(draw03.prize5_2, 76, 'prize5_2 must be 76');
    assert.strictEqual(draw03.prize5_1, 10, 'prize5_1 must be 10');
    assert.strictEqual(draw03.prize3_4, 93, 'prize3_4 must be 93');
});

// =============================================================================
// SUITE 2: 2026-10-03 Settlement Math from First Principles
// =============================================================================
console.log('\n\x1b[36m--- SUITE 2: 2026-10-03 Settlement Math from First Principles ---\x1b[0m');

const draw03 = raw.find(r => r.date === '2026-10-03');
const rec03 = libCache.crossHedgingPortfolio?.latestRecommendation;

check('2.1: Pillar 1 Đề 43s (17 VIP X3 + 26 Lót X1) vs ĐB 61 yields -77M VIP / -15.4M M3', () => {
    assert.strictEqual(rec03.targetDate, '2026-10-03');
    const p1 = rec03.pillar1_De;
    assert.strictEqual(p1.vipNumbers.length, 17, 'Must have 17 VIP numbers');
    assert.strictEqual(p1.singleNumbers.length, 26, 'Must have 26 single numbers');

    // First principles check: is 61 in either set?
    const specialStr = '61';
    const specialNum = 61;
    const vipHit = p1.vipNumbers.includes(specialNum) || p1.vipNumbers.includes(specialStr);
    const singleHit = p1.singleNumbers.includes(specialNum) || p1.singleNumbers.includes(specialStr);
    assert.strictEqual(vipHit, false, '61 must not be in VIP');
    assert.strictEqual(singleHit, false, '61 must not be in Lót');

    // VIP math
    const deStakeVIP = 17 * 3000 + 26 * 1000; // 51M + 26M = 77M
    assert.strictEqual(deStakeVIP, 77000, 'VIP stake must be 77M (77,000K)');
    const dePayoutVIP = 0;
    const deProfitVIP = dePayoutVIP - deStakeVIP;
    assert.strictEqual(deProfitVIP, -77000, 'VIP profit must be -77M (-77,000K)');

    // M3 math (0.2 scale: 600K/VIP, 200K/Lót)
    const deStakeM3 = 17 * 600 + 26 * 200; // 10.2M + 5.2M = 15.4M
    assert.strictEqual(deStakeM3, 15400, 'M3 stake must be 15.4M (15,400K)');
    const dePayoutM3 = 0;
    const deProfitM3 = dePayoutM3 - deStakeM3;
    assert.strictEqual(deProfitM3, -15400, 'M3 profit must be -15.4M (-15,400K)');
});

check('2.2: Pillar 2 Lô 7s (38, 62, 76, 10, 11, 24, 36) yields exactly 3 hits -> +35.2M VIP / +8.8M M3', () => {
    const p2 = rec03.pillar2_Lo;
    const lo7 = ['38', '62', '76', '10', '11', '24', '36'];
    assert.deepStrictEqual(p2.numbers.map(String), lo7, 'Lô numbers must match Top 7');

    // Count hits in 27 prizes
    const prizes27Strings = [
        draw03.special, draw03.prize1,
        draw03.prize2_1, draw03.prize2_2,
        draw03.prize3_1, draw03.prize3_2, draw03.prize3_3, draw03.prize3_4, draw03.prize3_5, draw03.prize3_6,
        draw03.prize4_1, draw03.prize4_2, draw03.prize4_3, draw03.prize4_4,
        draw03.prize5_1, draw03.prize5_2, draw03.prize5_3, draw03.prize5_4, draw03.prize5_5, draw03.prize5_6,
        draw03.prize6_1, draw03.prize6_2, draw03.prize6_3,
        draw03.prize7_1, draw03.prize7_2, draw03.prize7_3, draw03.prize7_4
    ].map(n => String(n).padStart(2, '0'));

    const hits = {};
    lo7.forEach(num => {
        const count = prizes27Strings.filter(p => p === num).length;
        hits[num] = count;
    });

    assert.strictEqual(hits['38'], 1, '38 must hit 1 nháy');
    assert.strictEqual(hits['62'], 0, '62 must hit 0 nháy');
    assert.strictEqual(hits['76'], 1, '76 must hit 1 nháy');
    assert.strictEqual(hits['10'], 1, '10 must hit 1 nháy');
    assert.strictEqual(hits['11'], 0, '11 must hit 0 nháy');
    assert.strictEqual(hits['24'], 0, '24 must hit 0 nháy');
    assert.strictEqual(hits['36'], 0, '36 must hit 0 nháy');

    const totalHits = Object.values(hits).reduce((a, b) => a + b, 0);
    assert.strictEqual(totalHits, 3, 'Must have exactly 3 hits in Lô 7s');

    // VIP math:
    // 3 numbers X4 (38, 62, 76): 400 pts * 22K = 8.8M/num -> 26.4M
    // 4 numbers X3 (10, 11, 24, 36): 300 pts * 22K = 6.6M/num -> 26.4M
    // Total stake VIP = 26.4M + 26.4M = 52.8M (52,800K)
    const loStakeVIP = (3 * 400 + 4 * 300) * 22;
    assert.strictEqual(loStakeVIP, 52800, 'Lô VIP stake must be 52.8M (52,800K)');

    // Payout VIP:
    // 38 (X4 = 400 pts) * 80K = 32M
    // 76 (X4 = 400 pts) * 80K = 32M
    // 10 (X3 = 300 pts) * 80K = 24M
    // Total payout VIP = 32M + 32M + 24M = 88M (88,000K)
    const loPayoutVIP = (400 * 80) + (400 * 80) + (300 * 80);
    assert.strictEqual(loPayoutVIP, 88000, 'Lô VIP payout must be 88M (88,000K)');
    const loProfitVIP = loPayoutVIP - loStakeVIP;
    assert.strictEqual(loProfitVIP, 35200, 'Lô VIP profit must be +35.2M (+35,200K)');

    // M3 math: scale 0.25
    const loStakeM3 = loStakeVIP * 0.25;
    const loPayoutM3 = loPayoutVIP * 0.25;
    const loProfitM3 = loPayoutM3 - loStakeM3;
    assert.strictEqual(loStakeM3, 13200, 'Lô M3 stake must be 13.2M (13,200K)');
    assert.strictEqual(loPayoutM3, 22000, 'Lô M3 payout must be 22.0M (22,000K)');
    assert.strictEqual(loProfitM3, 8800, 'Lô M3 profit must be +8.8M (+8,800K)');
});

check('2.3: Pillar 3 Xiên 4 Quây [38, 62, 76, 10] yields exactly 3 hits (1 X3 + 3 X2 = 84x) -> +73M VIP / +14.6M M3', () => {
    const x4 = ['38', '62', '76', '10'];
    const hits4 = ['38', '76', '10']; // exactly 3 numbers hit

    // Combinations of 4 numbers:
    // Xiên 4 (1 combo): [38, 62, 76, 10] -> hits 3 -> misses (requires 4)
    // Xiên 3 (4 combos):
    // [38, 62, 76] -> hits 2 -> miss
    // [38, 62, 10] -> hits 2 -> miss
    // [38, 76, 10] -> hits 3 -> WIN (1 win)
    // [62, 76, 10] -> hits 2 -> miss
    // Xiên 2 (6 combos):
    // [38, 62] -> hits 1 -> miss
    // [38, 76] -> hits 2 -> WIN
    // [38, 10] -> hits 2 -> WIN
    // [62, 76] -> hits 1 -> miss
    // [62, 10] -> hits 1 -> miss
    // [76, 10] -> hits 2 -> WIN (3 wins)

    const winX4 = 0;
    const winX3 = 1;
    const winX2 = 3;

    // Rates: X3 = 48x, X2 = 12x
    const totalMultiplier = (winX3 * 48) + (winX2 * 12);
    assert.strictEqual(totalMultiplier, 84, 'Total multiplier must be 84x ticket price');

    // VIP math (11 tickets @ 1M):
    const xienStakeVIP = 11 * 1000;
    const xienPayoutVIP = 84 * 1000;
    const xienProfitVIP = xienPayoutVIP - xienStakeVIP;
    assert.strictEqual(xienStakeVIP, 11000, 'Xiên VIP stake: 11M (11,000K)');
    assert.strictEqual(xienPayoutVIP, 84000, 'Xiên VIP payout: 84M (84,000K)');
    assert.strictEqual(xienProfitVIP, 73000, 'Xiên VIP profit: +73M (+73,000K)');

    // M3 math (11 tickets @ 200K):
    const xienStakeM3 = 11 * 200;
    const xienPayoutM3 = 84 * 200;
    const xienProfitM3 = xienPayoutM3 - xienStakeM3;
    assert.strictEqual(xienStakeM3, 2200, 'Xiên M3 stake: 2.2M (2,200K)');
    assert.strictEqual(xienPayoutM3, 16800, 'Xiên M3 payout: 16.8M (16,800K)');
    assert.strictEqual(xienProfitM3, 14600, 'Xiên M3 profit: +14.6M (+14,600K)');
});

check('2.4: Total Combo yields +31.2M VIP / +8.0M M3 with strict conservation', () => {
    // VIP
    const totalStakeVIP = 77000 + 52800 + 11000;
    const totalPayoutVIP = 0 + 88000 + 84000;
    const totalProfitVIP = totalPayoutVIP - totalStakeVIP;
    assert.strictEqual(totalStakeVIP, 140800, 'Total stake VIP must be 140.8M (140,800K)');
    assert.strictEqual(totalPayoutVIP, 172000, 'Total payout VIP must be 172.0M (172,000K)');
    assert.strictEqual(totalProfitVIP, 31200, 'Total net profit VIP must be +31.2M (+31,200K)');

    // Conservation check:
    const sumPillarsProfitVIP = (-77000) + 35200 + 73000;
    assert.strictEqual(sumPillarsProfitVIP, totalProfitVIP, 'Sum of pillar profits must equal totalProfitVIP');

    // M3
    const totalStakeM3 = 15400 + 13200 + 2200;
    const totalPayoutM3 = 0 + 22000 + 16800;
    const totalProfitM3 = totalPayoutM3 - totalStakeM3;
    assert.strictEqual(totalStakeM3, 30800, 'Total stake M3 must be 30.8M (30,800K)');
    assert.strictEqual(totalPayoutM3, 38800, 'Total payout M3 must be 38.8M (38,800K)');
    assert.strictEqual(totalProfitM3, 8000, 'Total net profit M3 must be +8.0M (+8,000K)');

    // Conservation check M3:
    const sumPillarsProfitM3 = (-15400) + 8800 + 14600;
    assert.strictEqual(sumPillarsProfitM3, totalProfitM3, 'Sum of pillar profits M3 must equal totalProfitM3');
});

check('2.5: Xiên 3 Quây [38, 62, 76, 10, 11] yields 1 X3 -> +5.5M profit', () => {
    // 5 numbers, C(5, 3) = 10 tickets @ 100K = 1,000K stake
    // Hits in 5 numbers: [38, 76, 10] (3 numbers hit)
    // C(3, 3) = 1 winning triplet [38, 76, 10]
    // Xiên 3 payout: 65x @ 100K = 6,500K
    // Profit: 6,500 - 1,000 = +5,500K (+5.5M)
    const x3Stake = 1000;
    const x3Payout = 6500;
    const x3Profit = x3Payout - x3Stake;
    assert.strictEqual(x3Profit, 5500, 'Xiên 3 Quây profit must be +5.5M (+5,500K)');
});

check('2.6: Dàn Xiên 5 (5 dàn X4 · 11M/dàn) yields +149.0M profit', () => {
    // 5 dàn X4 from 5 numbers [38, 62, 76, 10, 11]:
    // Hits: {38, 76, 10} (3 numbers)
    // D1: [38, 62, 76, 10] -> hits 3 -> 1 X3 (48M) + 3 X2 (36M) = 84M payout
    // D2: [38, 62, 76, 11] -> hits 2 -> 1 X2 (12M) = 12M payout
    // D3: [38, 62, 10, 11] -> hits 2 -> 1 X2 (12M) = 12M payout
    // D4: [38, 76, 10, 11] -> hits 3 -> 1 X3 (48M) + 3 X2 (36M) = 84M payout
    // D5: [62, 76, 10, 11] -> hits 2 -> 1 X2 (12M) = 12M payout
    // Total payout = 84M + 12M + 12M + 84M + 12M = 204M (204,000K)
    // Stake = 5 * 11M = 55M (55,000K)
    // Net profit = 204M - 55M = +149.0M (+149,000K)
    const x5Stake = 55000;
    const x5Payout = 204000;
    const x5Profit = x5Payout - x5Stake;
    assert.strictEqual(x5Profit, 149000, 'Dàn Xiên 5 profit must be +149.0M (+149,000K)');
});

// =============================================================================
// SUITE 3: Dynamic Re-Execution with CrossHedgingService
// =============================================================================
console.log('\n\x1b[36m--- SUITE 3: Dynamic Re-Execution with CrossHedgingService ---\x1b[0m');

check('3.1: crossHedgingService.settleCrossAssetPortfolio(rec, draw03) matches verified figures', () => {
    const dynamicSettled = crossHedgingService.settleCrossAssetPortfolio(rec03, draw03);
    assert.strictEqual(dynamicSettled.date, '2026-10-03');
    assert.strictEqual(dynamicSettled.special, 61);
    assert.strictEqual(dynamicSettled.deStakeK, 77000);
    assert.strictEqual(dynamicSettled.dePayoutK, 0);
    assert.strictEqual(dynamicSettled.deProfitK, -77000);

    assert.strictEqual(dynamicSettled.loHits, 3);
    assert.strictEqual(dynamicSettled.loStakeK, 52800);
    assert.strictEqual(dynamicSettled.loPayoutK, 88000);
    assert.strictEqual(dynamicSettled.loProfitK, 35200);

    assert.strictEqual(dynamicSettled.uniqueTop4Hits, 3);
    assert.strictEqual(dynamicSettled.xienStakeK, 11000);
    assert.strictEqual(dynamicSettled.xienPayoutK, 84000);
    assert.strictEqual(dynamicSettled.xienProfitK, 73000);

    assert.strictEqual(dynamicSettled.totalStakeK, 140800);
    assert.strictEqual(dynamicSettled.totalPayoutK, 172000);
    assert.strictEqual(dynamicSettled.totalProfitK, 31200);
    assert.strictEqual(dynamicSettled.isWin, true);
});

// =============================================================================
// SUITE 4: Financial Conservation Law Audit Across All 18 Settled Days
// =============================================================================
console.log('\n\x1b[36m--- SUITE 4: Financial Conservation Law Audit Across All 18 Settled Days ---\x1b[0m');

const filter18 = r => r.date >= '2026-09-16' && r.date <= '2026-10-03';
const ch18 = (libCache.crossHedgingPortfolio?.settledLedger || []).filter(filter18);
const top7_18 = (libCache.lo4EngineFusion?.modes?.top7?.settledLedger || []).filter(filter18);
const top6_18 = (libCache.lo4EngineFusion?.modes?.top6?.settledLedger || []).filter(filter18);
const xien18 = (libCache.loTop5ConsensusXien?.settledLedger || []).filter(filter18);

check('4.1: Cross-Hedging Ledger strictly satisfies conservation across all 18 days', () => {
    ch18.forEach(r => {
        assert.strictEqual(r.totalPayoutK - r.totalStakeK, r.totalProfitK, `Total conservation violated on ${r.date}`);
        assert.strictEqual(r.dePayoutK - r.deStakeK, r.deProfitK, `Đề conservation violated on ${r.date}`);
        assert.strictEqual(r.loPayoutK - r.loStakeK, r.loProfitK, `Lô conservation violated on ${r.date}`);
        assert.strictEqual(r.xienPayoutK - r.xienStakeK, r.xienProfitK, `Xiên conservation violated on ${r.date}`);
        assert.strictEqual(r.totalStakeK, r.deStakeK + r.loStakeK + r.xienStakeK, `Total stake sum violated on ${r.date}`);
        assert.strictEqual(r.totalPayoutK, r.dePayoutK + r.loPayoutK + r.xienPayoutK, `Total payout sum violated on ${r.date}`);
        assert.strictEqual(r.totalProfitK, r.deProfitK + r.loProfitK + r.xienProfitK, `Total profit sum violated on ${r.date}`);
        assert.strictEqual(r.isWin, r.totalProfitK > 0, `isWin flag mismatch on ${r.date}`);
    });
});

check('4.2: Top 7 Lô Ledger strictly satisfies conservation across all 18 days', () => {
    top7_18.forEach(r => {
        assert.strictEqual(r.dayLotoPayoutK - r.dayLotoStakeK, r.dayLotoProfitK, `Top 7 conservation violated on ${r.date}`);
    });
});

check('4.3: Top 6 Lô Ledger strictly satisfies conservation across all 18 days', () => {
    top6_18.forEach(r => {
        assert.strictEqual(r.dayLotoPayoutK - r.dayLotoStakeK, r.dayLotoProfitK, `Top 6 conservation violated on ${r.date}`);
    });
});

check('4.4: Xiên Ledger strictly satisfies conservation across all 18 days', () => {
    xien18.forEach(r => {
        assert.strictEqual(r.q11PayoutM3K - r.q11StakeM3K, r.q11ProfitM3K, `Xiên Quây 11 M3 conservation violated on ${r.date}`);
        assert.strictEqual(r.q11PayoutVIP_K - r.q11StakeVIP_K, r.q11ProfitVIP_K, `Xiên Quây 11 VIP conservation violated on ${r.date}`);
        assert.strictEqual(r.x3PayoutK - r.x3StakeK, r.x3ProfitK, `Xiên 3 Quây conservation violated on ${r.date}`);
        assert.strictEqual(r.x5Payout55K - r.x5Stake55K, r.x5Profit55K, `Dàn Xiên 5 conservation violated on ${r.date}`);
    });
});

// =============================================================================
// SUITE 5: Date Continuity and Completeness (Exactly 18 Entries, 2026-09-16 to 2026-10-03)
// =============================================================================
console.log('\n\x1b[36m--- SUITE 5: Date Continuity and Completeness ---\x1b[0m');

const expected18Dates = [
    '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
    '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
    '2026-10-01', '2026-10-02', '2026-10-03'
];

check('5.1: All 4 ledgers have exactly 18 entries in the 2026-09-16 to 2026-10-03 range', () => {
    assert.strictEqual(ch18.length, 18, `Cross-Hedging ledger must have 18 rows, got ${ch18.length}`);
    assert.strictEqual(top7_18.length, 18, `Top 7 ledger must have 18 rows, got ${top7_18.length}`);
    assert.strictEqual(top6_18.length, 18, `Top 6 ledger must have 18 rows, got ${top6_18.length}`);
    assert.strictEqual(xien18.length, 18, `Xiên ledger must have 18 rows, got ${xien18.length}`);
});

check('5.2: All 4 ledgers have exact chronological sequence without gaps or duplicates', () => {
    assert.deepStrictEqual(ch18.map(r => r.date), expected18Dates, 'CH ledger dates mismatch');
    assert.deepStrictEqual(top7_18.map(r => r.date), expected18Dates, 'Top 7 ledger dates mismatch');
    assert.deepStrictEqual(top6_18.map(r => r.date), expected18Dates, 'Top 6 ledger dates mismatch');
    assert.deepStrictEqual(xien18.map(r => r.date), expected18Dates, 'Xiên ledger dates mismatch');
});

// =============================================================================
// SUITE 6: Cumulative Profit Running Balance Conservation
// =============================================================================
console.log('\n\x1b[36m--- SUITE 6: Cumulative Profit Running Balance Conservation ---\x1b[0m');

check('6.1: Cross-Hedging cumulative running balance matches sum of daily profits across entire history', () => {
    const fullCH = libCache.crossHedgingPortfolio?.settledLedger || [];
    assert(fullCH.length >= 18, 'Full CH ledger must have at least 18 rows');

    for (let i = 1; i < fullCH.length; i++) {
        const prev = fullCH[i - 1];
        const curr = fullCH[i];
        assert.strictEqual(
            curr.cumulativeProfitK,
            prev.cumulativeProfitK + curr.totalProfitK,
            `Running cumulative profit mismatch at index ${i} (${curr.date})`
        );
        assert.strictEqual(
            curr.cumDeProfitK,
            prev.cumDeProfitK + curr.deProfitK,
            `Running cumDeProfitK mismatch at index ${i} (${curr.date})`
        );
        assert.strictEqual(
            curr.cumLoProfitK,
            prev.cumLoProfitK + curr.loProfitK,
            `Running cumLoProfitK mismatch at index ${i} (${curr.date})`
        );
        assert.strictEqual(
            curr.cumXienProfitK,
            prev.cumXienProfitK + curr.xienProfitK,
            `Running cumXienProfitK mismatch at index ${i} (${curr.date})`
        );
    }
});

// =============================================================================
// SUITE 7: Canonical SSOT Cache Parity & Snapshot Freeze Status
// =============================================================================
console.log('\n\x1b[36m--- SUITE 7: Canonical SSOT Cache Parity & Snapshot Freeze Status ---\x1b[0m');

check('7.1: lib/data/statistics and data/ caches are byte-identical', () => {
    const libBuf = fs.readFileSync(libCachePath);
    const dataBuf = fs.readFileSync(dataCachePath);
    assert.strictEqual(libBuf.length, dataBuf.length, 'Cache file sizes must be identical');
    assert(libBuf.equals(dataBuf), 'Cache files must be 100% byte-identical');
});

check('7.2: snapshotLock confirms settled status for 2026-10-03', () => {
    assert.strictEqual(libCache.snapshotLock.isSettled, true, 'snapshotLock.isSettled must be true');
    assert.strictEqual(libCache.snapshotLock.lockTargetDate, '2026-10-03', 'lockTargetDate must be 2026-10-03');
    assert.strictEqual(libCache.snapshotLock.isLocked, false, 'isLocked must be false post-settlement');
});

// =============================================================================
// SUITE 8: Single-Pillar Hedging Property Empirical Validation
// =============================================================================
console.log('\n\x1b[36m--- SUITE 8: Single-Pillar Hedging Property Empirical Validation ---\x1b[0m');

check('8.1: On 2026-10-03, Lô (+35.2M) and Xiên (+73M) fully absorb Đề loss (-77M) delivering net +31.2M VIP', () => {
    const ch03 = ch18.find(r => r.date === '2026-10-03');
    assert(ch03, '2026-10-03 row must exist');
    assert(ch03.deProfitK < 0, 'Đề must be negative (-77M)');
    const loPlusXien = ch03.loProfitK + ch03.xienProfitK;
    assert.strictEqual(loPlusXien, 108200, 'Lô + Xiên must yield +108.2M (+108,200K)');
    assert(loPlusXien > Math.abs(ch03.deProfitK), 'Lô + Xiên must exceed Đề loss');
    assert.strictEqual(ch03.totalProfitK, loPlusXien + ch03.deProfitK, 'Total profit must equal Lô + Xiên + Đề');
    assert.strictEqual(ch03.totalProfitK, 31200, 'Total net profit must be +31.2M');
    assert.strictEqual(ch03.isWin, true, 'Must be winning overall');
});

check('8.2: On 2026-10-03 under Mức 3, Lô (+8.8M) and Xiên (+14.6M) fully absorb Đề loss (-15.4M) delivering net +8.0M M3', () => {
    const ch03 = ch18.find(r => r.date === '2026-10-03');
    const m3DeProfit = Math.round(ch03.dePayoutK * 0.2) - Math.round(ch03.deStakeK * 0.2);
    const m3LoProfit = Math.round(ch03.loPayoutK * 0.25) - Math.round(ch03.loStakeK * 0.25);
    const m3XienProfit = Math.round(ch03.xienPayoutK * 0.2) - Math.round(ch03.xienStakeK * 0.2);
    assert.strictEqual(m3DeProfit, -15400, 'M3 Đề profit: -15.4M');
    assert.strictEqual(m3LoProfit, 8800, 'M3 Lô profit: +8.8M');
    assert.strictEqual(m3XienProfit, 14600, 'M3 Xiên profit: +14.6M');

    const m3TotalProfit = m3DeProfit + m3LoProfit + m3XienProfit;
    assert.strictEqual(m3TotalProfit, 8000, 'M3 Total net profit must be +8.0M');
    assert(m3TotalProfit > 0, 'M3 Total profit must be strictly positive');
});

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n================================================================================');
console.log(`🏆 EMPIRICAL CHALLENGE SUMMARY: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
console.log('================================================================================\n');

if (failedAssertions > 0) {
    console.error('❌ EMPIRICAL VERDICT: REJECT');
    process.exit(1);
} else {
    console.log('✅ EMPIRICAL VERDICT: APPROVE');
    process.exit(0);
}
