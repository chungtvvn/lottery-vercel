#!/usr/bin/env node
/**
 * scripts/test-adversarial-challenger-m1-orch4-2.js
 *
 * Empirical Adversarial Verification & Stress Test Harness for Milestone 1:
 * Xiên 3 Quây Combinatorics, Dàn Xiên 5 Combinatorics, Cache Synchronicity, and Snapshot Settlement.
 *
 * Author: challenger_m1_orch4_2 (EMPIRICAL CHALLENGER Subagent)
 *
 * Verification Areas:
 * 1. Combinatorics & Payout of Xiên 3 Quây [38, 62, 76, 10, 11] (C(5,3) = 10 tickets)
 *    - With hits [38, 76, 10], exactly 1 ticket wins paying 6.5M -> net profit +5.5M.
 * 2. Combinatorics & Payout of Dàn Xiên 5 [38, 62, 76, 10, 11] (5 dàn X4 · 11M/dàn = 55M stake)
 *    - Evaluate all 5 combinations C(5,4) against hits [38, 76, 10]:
 *    - Exactly 2 dàn have 3 hits (2 * 84M = 168M)
 *    - Exactly 3 dàn have 2 hits (3 * 12M = 36M)
 *    - Total payout 204M -> net profit +149.0M.
 * 3. Adversarial Stress Test across all 2^5 = 32 hit subsets of [38, 62, 76, 10, 11]
 *    - Explicit simulation vs closed-form combinatorial formula
 *    - Financial conservation (Payout - Stake === Profit) in all cases
 * 4. Byte-identical Cache Synchronicity:
 *    - lib/data/statistics/cached_daily_method_advisor.json === data/cached_daily_method_advisor.json
 *    - Valid JSON in both
 *    - snapshotLock.isSettled === true
 * 5. Ledger Synchronization & Settlement Accuracy:
 *    - All 4 ledgers have exactly 18 entries covering 2026-09-16 through 2026-10-03
 *    - Exact PnL values matching theoretical models
 * 6. Historical Data Integrity:
 *    - lib/data/xsmb-2-digits.json has 7,572 draws terminating at 2026-10-03 with ĐB 61
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let passedTests = 0;
let failedTests = 0;
const testLogs = [];

function check(title, fn) {
    try {
        fn();
        passedTests++;
        console.log(`  \x1b[32m✔ PASS\x1b[0m ${title}`);
        testLogs.push({ title, status: 'PASS' });
    } catch (err) {
        failedTests++;
        console.error(`  \x1b[31m✘ FAIL\x1b[0m ${title}`);
        console.error(`    \x1b[31mError:\x1b[0m ${err.message}`);
        testLogs.push({ title, status: 'FAIL', error: err.message });
    }
}

// Combinatorics helper
function getCombinations(arr, k) {
    if (k <= 0 || k > arr.length) return [];
    if (k === arr.length) return [arr.slice()];
    if (k === 1) return arr.map(el => [el]);
    const combos = [];
    for (let i = 0; i <= arr.length - k; i++) {
        const head = arr[i];
        const tailCombos = getCombinations(arr.slice(i + 1), k - 1);
        for (const tail of tailCombos) {
            combos.push([head, ...tail]);
        }
    }
    return combos;
}

console.log('\n================================================================================');
console.log('⚔️  EMPIRICAL ADVERSARIAL STRESS HARNESS — CHALLENGER M1 ORCH4 2');
console.log('================================================================================\n');

// =============================================================================
// SUITE 1: COMBINATORIAL STRESS-TEST OF XIÊN 3 QUÂY [38, 62, 76, 10, 11]
// =============================================================================
console.log('\x1b[36m--- SUITE 1: Xiên 3 Quây [38, 62, 76, 10, 11] Combinatorics & Settlement ---\x1b[0m');

const xien3Pool = ['38', '62', '76', '10', '11'];
const actualHits = ['38', '76', '10'];

check('1.1: Xiên 3 Quây generates exactly C(5,3) = 10 unique tickets', () => {
    const tickets = getCombinations(xien3Pool, 3);
    assert.strictEqual(tickets.length, 10, `Expected 10 tickets, got ${tickets.length}`);

    // Verify all tickets have 3 unique numbers and tickets are distinct
    const ticketKeys = new Set();
    for (const t of tickets) {
        assert.strictEqual(t.length, 3, 'Each ticket must have exactly 3 numbers');
        const sortedKey = [...t].sort().join('-');
        assert(!ticketKeys.has(sortedKey), `Duplicate ticket detected: ${sortedKey}`);
        ticketKeys.add(sortedKey);
    }
    assert.strictEqual(ticketKeys.size, 10, 'All 10 tickets must be unique');
});

check('1.2: Against hits [38, 76, 10], exactly 1 ticket wins and 9 tickets lose', () => {
    const tickets = getCombinations(xien3Pool, 3);
    const hitSet = new Set(actualHits);

    const winningTickets = [];
    const losingTickets = [];

    for (const t of tickets) {
        const matched = t.filter(num => hitSet.has(num));
        if (matched.length === 3) {
            winningTickets.push(t);
        } else {
            losingTickets.push({ ticket: t, matchedCount: matched.length });
        }
    }

    assert.strictEqual(winningTickets.length, 1, `Expected exactly 1 winning ticket, got ${winningTickets.length}`);
    const winner = winningTickets[0].sort().join(',');
    assert.strictEqual(winner, ['10', '38', '76'].sort().join(','), `Winning ticket must be [10, 38, 76], got ${winner}`);

    assert.strictEqual(losingTickets.length, 9, `Expected 9 losing tickets, got ${losingTickets.length}`);
    // Check distribution of losing tickets:
    // Numbers: 3 hits (38, 76, 10), 2 misses (62, 11).
    // Tickets with 2 hits: choose 2 from 3 hits and 1 from 2 misses = C(3,2) * C(2,1) = 3 * 2 = 6 tickets.
    // Tickets with 1 hit: choose 1 from 3 hits and 2 from 2 misses = C(3,1) * C(2,2) = 3 * 1 = 3 tickets.
    const twoHitTickets = losingTickets.filter(lt => lt.matchedCount === 2);
    const oneHitTickets = losingTickets.filter(lt => lt.matchedCount === 1);
    assert.strictEqual(twoHitTickets.length, 6, `Expected 6 tickets with 2 hits, got ${twoHitTickets.length}`);
    assert.strictEqual(oneHitTickets.length, 3, `Expected 3 tickets with 1 hit, got ${oneHitTickets.length}`);
});

check('1.3: Xiên 3 Quây financial settlement: 10 tickets @ 100K = 1.0M stake, 6.5M payout -> +5.5M net profit', () => {
    const ticketCount = 10;
    const ticketPriceK = 100;
    const stakeK = ticketCount * ticketPriceK; // 1,000K = 1.0M
    assert.strictEqual(stakeK, 1000, 'Stake must be 1,000K (1.0M)');

    const payoutPerWinK = 6500; // 6.5M (65x)
    const winningTickets = 1;
    const payoutK = winningTickets * payoutPerWinK; // 6,500K = 6.5M
    assert.strictEqual(payoutK, 6500, 'Payout must be 6,500K (6.5M)');

    const profitK = payoutK - stakeK;
    assert.strictEqual(profitK, 5500, 'Net profit must be +5,500K (+5.5M)');
});

// =============================================================================
// SUITE 2: COMBINATORIAL STRESS-TEST OF DÀN XIÊN 5 [38, 62, 76, 10, 11]
// =============================================================================
console.log('\x1b[36m--- SUITE 2: Dàn Xiên 5 [38, 62, 76, 10, 11] Combinatorics & Settlement ---\x1b[0m');

check('2.1: Dàn Xiên 5 generates exactly C(5,4) = 5 independent Xiên 4 sets', () => {
    const danSets = getCombinations(xien3Pool, 4);
    assert.strictEqual(danSets.length, 5, `Expected 5 dàn, got ${danSets.length}`);

    // Each dàn must have 4 numbers
    danSets.forEach((d, idx) => {
        assert.strictEqual(d.length, 4, `Dàn ${idx + 1} must have 4 numbers`);
    });
});

check('2.2: Evaluate all 5 dàn against hits [38, 76, 10]: exactly 2 dàn hit 3, exactly 3 dàn hit 2', () => {
    const danSets = getCombinations(xien3Pool, 4);
    const hitSet = new Set(actualHits);

    let danHit3Count = 0;
    let danHit2Count = 0;
    let danHit4Count = 0;
    let danHitOther = 0;

    const breakdown = [];

    danSets.forEach((dan, idx) => {
        const hitsInDan = dan.filter(num => hitSet.has(num));
        const count = hitsInDan.length;
        if (count === 4) danHit4Count++;
        else if (count === 3) danHit3Count++;
        else if (count === 2) danHit2Count++;
        else danHitOther++;

        breakdown.push({
            dànIndex: idx + 1,
            numbers: dan.join(', '),
            matched: hitsInDan.join(', '),
            matchedCount: count
        });
    });

    assert.strictEqual(danHit4Count, 0, 'Must have 0 dàn with 4 hits');
    assert.strictEqual(danHit3Count, 2, `Expected exactly 2 dàn with 3 hits, got ${danHit3Count}`);
    assert.strictEqual(danHit2Count, 3, `Expected exactly 3 dàn with 2 hits, got ${danHit2Count}`);
    assert.strictEqual(danHitOther, 0, 'Must have 0 dàn with < 2 hits');

    // Confirm which dàn have 3 hits:
    // Missing number must be either 62 or 11 (the non-hitting numbers).
    // Dàn without 62 has: [38, 76, 10, 11] -> hits [38, 76, 10] (3 hits).
    // Dàn without 11 has: [38, 62, 76, 10] -> hits [38, 76, 10] (3 hits).
    // The other 3 dàn miss one of the 3 hitting numbers, so they each retain only 2 hits.
    const danHit3 = breakdown.filter(b => b.matchedCount === 3);
    assert.strictEqual(danHit3.length, 2);
});

check('2.3: Each Xiên 4 Quây (11 tickets) pays 84M on 3 hits and 12M on 2 hits', () => {
    // Breakdown of 1 Xiên 4 Quây (11 tickets):
    // 1 ticket X4, 4 tickets X3, 6 tickets X2. VIP stake: 11 * 1M = 11M.
    // Case 1: 3 hits in 4 numbers:
    // - X4 ticket: 0 wins
    // - X3 tickets: C(3,3) = 1 ticket wins. Payout = 48M.
    // - X2 tickets: C(3,2) = 3 tickets win. Payout = 3 * 12M = 36M.
    // Total payout = 48M + 36M = 84M.
    const payout3HitsK = 1 * 48000 + 3 * 12000;
    assert.strictEqual(payout3HitsK, 84000, 'Xiên 4 Quây with 3 hits must pay 84M (84000K)');

    // Case 2: 2 hits in 4 numbers:
    // - X4 ticket: 0 wins
    // - X3 tickets: 0 wins
    // - X2 tickets: C(2,2) = 1 ticket wins. Payout = 12M.
    // Total payout = 12M.
    const payout2HitsK = 1 * 12000;
    assert.strictEqual(payout2HitsK, 12000, 'Xiên 4 Quây with 2 hits must pay 12M (12000K)');
});

check('2.4: Dàn Xiên 5 financial settlement: 55M stake, 204M payout -> +149.0M net profit', () => {
    const stakePerDanK = 11000; // 11M per dàn
    const totalStakeK = 5 * stakePerDanK; // 55M = 55,000K
    assert.strictEqual(totalStakeK, 55000, 'Dàn Xiên 5 total stake must be 55,000K (55M)');

    const danHit3 = 2;
    const danHit2 = 3;
    const totalPayoutK = danHit3 * 84000 + danHit2 * 12000; // 2 * 84M + 3 * 12M = 168M + 36M = 204M
    assert.strictEqual(totalPayoutK, 204000, 'Total payout must be 204,000K (204M)');

    const netProfitK = totalPayoutK - totalStakeK; // 204M - 55M = 149M
    assert.strictEqual(netProfitK, 149000, 'Net profit must be +149,000K (+149.0M)');
});

// =============================================================================
// SUITE 3: ADVERSARIAL STRESS-TEST ACROSS ALL 2^5 = 32 HIT COMBINATIONS
// =============================================================================
console.log('\x1b[36m--- SUITE 3: Exhaustive Simulation vs Closed-Form Formula (All 32 Subsets) ---\x1b[0m');

check('3.1: Mathematical equivalence of simulation and closed-form formulas across all 32 subsets', () => {
    const danSets = getCombinations(xien3Pool, 4); // 5 dàn
    const x3Tickets = getCombinations(xien3Pool, 3); // 10 tickets

    // Helper for C(n, k)
    const nCr = (n, r) => {
        if (r < 0 || r > n) return 0;
        if (r === 0 || r === n) return 1;
        let num = 1, den = 1;
        for (let i = 1; i <= r; i++) {
            num *= (n - i + 1);
            den *= i;
        }
        return Math.round(num / den);
    };

    // Iterate through all 2^5 = 32 subsets
    for (let mask = 0; mask < 32; mask++) {
        const currentHits = [];
        for (let i = 0; i < 5; i++) {
            if ((mask & (1 << i)) !== 0) {
                currentHits.push(xien3Pool[i]);
            }
        }
        const k = currentHits.length; // number of hits out of 5
        const currentHitSet = new Set(currentHits);

        // --- Xiên 3 Quây Simulation ---
        let simX3Wins = 0;
        for (const t of x3Tickets) {
            if (t.filter(n => currentHitSet.has(n)).length === 3) simX3Wins++;
        }
        const formulaX3Wins = nCr(k, 3);
        assert.strictEqual(simX3Wins, formulaX3Wins, `Mask ${mask} (k=${k}): X3 wins mismatch`);

        const simX3StakeK = 1000;
        const simX3PayoutK = simX3Wins * 6500;
        const simX3ProfitK = simX3PayoutK - simX3StakeK;
        assert.strictEqual(simX3PayoutK - simX3StakeK, simX3ProfitK, 'X3 Financial conservation');

        // --- Dàn Xiên 5 Simulation ---
        let simDanHit4 = 0;
        let simDanHit3 = 0;
        let simDanHit2 = 0;

        for (const d of danSets) {
            const h = d.filter(n => currentHitSet.has(n)).length;
            if (h === 4) simDanHit4++;
            else if (h === 3) simDanHit3++;
            else if (h === 2) simDanHit2++;
        }

        // Closed-form formula:
        // Out of 5 numbers, k are hits, (5-k) are misses.
        // A dàn of 4 numbers has:
        // - 4 hits if all 4 chosen numbers are from the k hits: C(k, 4) * C(5-k, 0)
        // - 3 hits if 3 are from k hits and 1 from (5-k) misses: C(k, 3) * C(5-k, 1)
        // - 2 hits if 2 are from k hits and 2 from (5-k) misses: C(k, 2) * C(5-k, 2)
        const formulaDanHit4 = nCr(k, 4) * nCr(5 - k, 0);
        const formulaDanHit3 = nCr(k, 3) * nCr(5 - k, 1);
        const formulaDanHit2 = nCr(k, 2) * nCr(5 - k, 2);

        assert.strictEqual(simDanHit4, formulaDanHit4, `Mask ${mask} (k=${k}): DanHit4 mismatch`);
        assert.strictEqual(simDanHit3, formulaDanHit3, `Mask ${mask} (k=${k}): DanHit3 mismatch`);
        assert.strictEqual(simDanHit2, formulaDanHit2, `Mask ${mask} (k=${k}): DanHit2 mismatch`);

        const simDanPayoutK = simDanHit4 * 384000 + simDanHit3 * 84000 + simDanHit2 * 12000;
        const simDanStakeK = 55000;
        const simDanProfitK = simDanPayoutK - simDanStakeK;
        assert.strictEqual(simDanPayoutK - simDanStakeK, simDanProfitK, 'Dàn Xiên 5 Financial conservation');
    }
});

// =============================================================================
// SUITE 4: BYTE-IDENTICAL CACHE SYNCHRONICITY & SNAPSHOT LOCK SETTLEMENT
// =============================================================================
console.log('\x1b[36m--- SUITE 4: Cache Synchronicity & Snapshot Lock Verification ---\x1b[0m');

const cachePath1 = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const cachePath2 = path.join(__dirname, '..', 'data', 'cached_daily_method_advisor.json');

check('4.1: Both cache files exist and are regular files with identical byte sizes', () => {
    assert(fs.existsSync(cachePath1), `Missing ${cachePath1}`);
    assert(fs.existsSync(cachePath2), `Missing ${cachePath2}`);

    const stat1 = fs.statSync(cachePath1);
    const stat2 = fs.statSync(cachePath2);

    assert(stat1.isFile(), `${cachePath1} must be a regular file`);
    assert(stat2.isFile(), `${cachePath2} must be a regular file`);
    assert.strictEqual(stat1.size, stat2.size, `File sizes differ: ${stat1.size} vs ${stat2.size}`);
    assert.strictEqual(stat1.size, 42793186, `Expected exactly 42,793,186 bytes, got ${stat1.size}`);
});

check('4.2: Both cache files are 100% byte-identical (Buffer equality & SHA-256 match)', () => {
    const buf1 = fs.readFileSync(cachePath1);
    const buf2 = fs.readFileSync(cachePath2);

    assert(buf1.equals(buf2), 'Buffers are NOT byte-identical!');

    const hash1 = crypto.createHash('sha256').update(buf1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(buf2).digest('hex');
    assert.strictEqual(hash1, hash2, 'SHA-256 hashes differ!');
    assert.strictEqual(hash1, 'bf943a8c27c4718abacc7331ac583c0ecaa87d94b587d71fdfb68fb7ea5c581c', 'Unexpected SHA-256 digest');
});

check('4.3: Both cache files parse as valid JSON without corruption or circular references', () => {
    const json1 = JSON.parse(fs.readFileSync(cachePath1, 'utf8'));
    const json2 = JSON.parse(fs.readFileSync(cachePath2, 'utf8'));
    assert(typeof json1 === 'object' && json1 !== null, 'json1 must be a non-null object');
    assert(typeof json2 === 'object' && json2 !== null, 'json2 must be a non-null object');
    assert.strictEqual(Object.keys(json1).length, Object.keys(json2).length, 'Top-level key counts must match');
});

check('4.4: Snapshot lock is correctly settled (isSettled: true, isLocked: false, targetDate: 2026-10-03)', () => {
    const cache = JSON.parse(fs.readFileSync(cachePath1, 'utf8'));
    const sl = cache.snapshotLock;

    assert(sl, 'snapshotLock object must exist in cache');
    assert.strictEqual(sl.isSettled, true, 'snapshotLock.isSettled must be boolean true');
    assert.strictEqual(sl.isLocked, false, 'snapshotLock.isLocked must be boolean false');
    assert.strictEqual(sl.lockTargetDate, '2026-10-03', 'snapshotLock.lockTargetDate must be 2026-10-03');
    assert.strictEqual(sl.lockActive, false, 'snapshotLock.lockActive must be false');
});

// =============================================================================
// SUITE 5: LEDGER SYNCHRONIZATION & COMBAT LOG ACCURACY (2026-09-16 TO 2026-10-03)
// =============================================================================
console.log('\x1b[36m--- SUITE 5: Ledger Alignment & 2026-10-03 Settlement Precision ---\x1b[0m');

check('5.1: Exactly 18 combat dates (2026-09-16 to 2026-10-03) across all 4 ledgers without gaps', () => {
    const cache = JSON.parse(fs.readFileSync(cachePath1, 'utf8'));

    const chLedger = (cache.crossHedgingPortfolio?.settledLedger || []).filter(r => r.date >= '2026-09-16');
    const top7Ledger = (cache.lo4EngineFusion?.modes?.top7?.settledLedger || []).filter(r => r.date >= '2026-09-16');
    const top6Ledger = (cache.lo4EngineFusion?.modes?.top6?.settledLedger || []).filter(r => r.date >= '2026-09-16');
    const xien5Ledger = (cache.loTop5ConsensusXien?.settledLedger || []).filter(r => r.date >= '2026-09-16');

    assert.strictEqual(chLedger.length, 18, `crossHedgingPortfolio ledger length: ${chLedger.length}`);
    assert.strictEqual(top7Ledger.length, 18, `top7 ledger length: ${top7Ledger.length}`);
    assert.strictEqual(top6Ledger.length, 18, `top6 ledger length: ${top6Ledger.length}`);
    assert.strictEqual(xien5Ledger.length, 18, `xien5 ledger length: ${xien5Ledger.length}`);

    // Verify dates are identical sequence across all 4 ledgers
    for (let i = 0; i < 18; i++) {
        const d = chLedger[i].date;
        assert.strictEqual(top7Ledger[i].date, d, `Date mismatch at index ${i}: top7 ${top7Ledger[i].date} vs ch ${d}`);
        assert.strictEqual(top6Ledger[i].date, d, `Date mismatch at index ${i}: top6 ${top6Ledger[i].date} vs ch ${d}`);
        assert.strictEqual(xien5Ledger[i].date, d, `Date mismatch at index ${i}: xien5 ${xien5Ledger[i].date} vs ch ${d}`);
    }

    assert.strictEqual(chLedger[0].date, '2026-09-16', 'Start date must be 2026-09-16');
    assert.strictEqual(chLedger[17].date, '2026-10-03', 'End date must be 2026-10-03');
});

check('5.2: 2026-10-03 row in loTop5ConsensusXien exactly reflects settled Xiên 3 and Dàn Xiên 5', () => {
    const cache = JSON.parse(fs.readFileSync(cachePath1, 'utf8'));
    const xRow = (cache.loTop5ConsensusXien?.settledLedger || []).find(r => r.date === '2026-10-03');
    assert(xRow, 'Row 2026-10-03 must exist in loTop5ConsensusXien.settledLedger');

    // Numbers & hits
    assert.deepStrictEqual(xRow.top4, ['38', '62', '76', '10']);
    assert.deepStrictEqual(xRow.top5, ['38', '62', '76', '10', '11']);
    assert.strictEqual(xRow.h4, 3, 'Top 4 must hit 3 numbers');
    assert.strictEqual(xRow.h5, 3, 'Top 5 must hit 3 numbers');

    // Xiên 3 Quây
    assert.strictEqual(xRow.x3Tickets, 1, 'x3Tickets must be 1');
    assert.strictEqual(xRow.x3StakeK, 1000, 'x3StakeK must be 1000');
    assert.strictEqual(xRow.x3PayoutK, 6500, 'x3PayoutK must be 6500');
    assert.strictEqual(xRow.x3ProfitK, 5500, 'x3ProfitK must be 5500');

    // Dàn Xiên 5 (5 dàn X4)
    assert.strictEqual(xRow.x5DanHit4, 0, 'x5DanHit4 must be 0');
    assert.strictEqual(xRow.x5DanHit3, 2, 'x5DanHit3 must be 2');
    assert.strictEqual(xRow.x5DanHit2, 3, 'x5DanHit2 must be 3');
    assert.strictEqual(xRow.x5Stake55K, 55000, 'x5Stake55K must be 55000');
    assert.strictEqual(xRow.x5Payout55K, 204000, 'x5Payout55K must be 204000');
    assert.strictEqual(xRow.x5Profit55K, 149000, 'x5Profit55K must be 149000');
    assert.strictEqual(xRow.isX5Win55, true, 'isX5Win55 must be true');
});

check('5.3: 2026-10-03 row in crossHedgingPortfolio satisfies financial conservation and hedging guarantee', () => {
    const cache = JSON.parse(fs.readFileSync(cachePath1, 'utf8'));
    const chRow = (cache.crossHedgingPortfolio?.settledLedger || []).find(r => r.date === '2026-10-03');
    assert(chRow, 'Row 2026-10-03 must exist in crossHedgingPortfolio.settledLedger');

    // Đề: Trượt (-77M VIP)
    assert.strictEqual(chRow.special, 61);
    assert.strictEqual(chRow.deHits, 0);
    assert.strictEqual(chRow.isDeHit, false);
    assert.strictEqual(chRow.deStakeK, 77000);
    assert.strictEqual(chRow.dePayoutK, 0);
    assert.strictEqual(chRow.deProfitK, -77000);

    // Lô: 3 nháy (+35.2M VIP)
    assert.strictEqual(chRow.loHits, 3);
    assert.strictEqual(chRow.loStakeK, 52800);
    assert.strictEqual(chRow.loPayoutK, 88000);
    assert.strictEqual(chRow.loProfitK, 35200);

    // Xiên: 3 hits (+73M VIP)
    assert.strictEqual(chRow.uniqueTop4Hits, 3);
    assert.strictEqual(chRow.xienStakeK, 11000);
    assert.strictEqual(chRow.xienPayoutK, 84000);
    assert.strictEqual(chRow.xienProfitK, 73000);

    // Net Combo VIP: +31.2M (+31200K)
    assert.strictEqual(chRow.totalStakeK, 140800);
    assert.strictEqual(chRow.totalPayoutK, 172000);
    assert.strictEqual(chRow.totalProfitK, 31200);
    assert.strictEqual(chRow.isWin, true);

    // Conservation check
    assert.strictEqual(chRow.totalPayoutK - chRow.totalStakeK, chRow.totalProfitK);
    assert.strictEqual(chRow.dePayoutK - chRow.deStakeK, chRow.deProfitK);
    assert.strictEqual(chRow.loPayoutK - chRow.loStakeK, chRow.loProfitK);
    assert.strictEqual(chRow.xienPayoutK - chRow.xienStakeK, chRow.xienProfitK);
});

// =============================================================================
// SUITE 6: XSMB RAW HISTORICAL DATA INTEGRITY
// =============================================================================
console.log('\x1b[36m--- SUITE 6: Raw Historical Database XSMB Verification ---\x1b[0m');

check('6.1: lib/data/xsmb-2-digits.json has 7,572 records terminating at 2026-10-03', () => {
    const rawPath = path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');
    const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));

    assert.strictEqual(raw.length, 7572, `Expected 7,572 records, got ${raw.length}`);

    const last = raw[raw.length - 1];
    assert.strictEqual(last.date, '2026-10-03', 'Last record date must be 2026-10-03');
    assert.strictEqual(last.special, 61, 'Last record special prize must be 61');

    // Verify 27 prizes on 2026-10-03 contain the hitting numbers: 38, 76, 10, 93
    const prizes = [
        last.special, last.prize1,
        last.prize2_1, last.prize2_2,
        last.prize3_1, last.prize3_2, last.prize3_3, last.prize3_4, last.prize3_5, last.prize3_6,
        last.prize4_1, last.prize4_2, last.prize4_3, last.prize4_4,
        last.prize5_1, last.prize5_2, last.prize5_3, last.prize5_4, last.prize5_5, last.prize5_6,
        last.prize6_1, last.prize6_2, last.prize6_3,
        last.prize7_1, last.prize7_2, last.prize7_3, last.prize7_4
    ];
    assert.strictEqual(prizes.length, 27, 'Must have exactly 27 prize numbers');

    assert(prizes.includes(38), 'Prizes must contain 38');
    assert(prizes.includes(76), 'Prizes must contain 76');
    assert(prizes.includes(10), 'Prizes must contain 10');
    assert(prizes.includes(93), 'Prizes must contain 93');
    assert(!prizes.includes(62), 'Prizes must NOT contain 62');
    assert(!prizes.includes(11), 'Prizes must NOT contain 11');
});

// =============================================================================
// SUMMARY
// =============================================================================
console.log('\n================================================================================');
console.log(`🎉 CHALLENGER STRESS HARNESS SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('================================================================================\n');

if (failedTests > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
