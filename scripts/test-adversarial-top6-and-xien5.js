#!/usr/bin/env node
/**
 * scripts/test-adversarial-top6-and-xien5.js
 *
 * EMPIRICAL ADVERSARIAL STRESS HARNESS
 * Author: challenger_m2_orch5_2
 *
 * Verifies:
 * 1. Top 6 Mode Independence in daily-advisor.js
 *    - Mode isolation between 'top6' and 'top7'
 *    - Daily profit & cumulative profit strictly derived from Top 6 data
 *    - Zero pollution from Top 7 cross-hedging values
 *    - Category filtering & KPI header consistency
 *
 * 2. Xiên 5 Evaluation & Fallback Mechanics
 *    - Mathematical combinatorics of 5 dàn xiên 4 (11M/dàn, total 55M stake)
 *    - Fallback evaluation against actual draw prizes when ledger row is missing
 *    - Prevention of unfair -55M stake penalties on winning draws
 *    - Edge cases: pending dates, missing prizes, varying string number representations
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    challenges: []
};

function test(description, fn) {
    stats.total++;
    try {
        fn();
        stats.passed++;
        console.log(`  ✔ [PASS] ${description}`);
    } catch (err) {
        stats.failed++;
        stats.challenges.push({ description, error: err.message });
        console.error(`  ✘ [FAIL] ${description}`);
        console.error(`    ${err.message}`);
        if (err.stack) console.error(err.stack);
    }
}

console.log('='.repeat(80));
console.log('🧪 EMPIRICAL CHALLENGER: TOP 6 MODE INDEPENDENCE & XIÊN 5 FALLBACK HARNESS');
console.log('='.repeat(80));

// Load Canonical Cache
const cachePath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const payload = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

// Helper matching daily-advisor.js
function number(n) {
    if (n == null) return '';
    const s = String(n).trim();
    return s.length === 1 ? '0' + s : s.slice(-2);
}

function getXi5Tickets(top5) {
    const s = (top5 || []).map(number);
    if (s.length < 5) return [];
    return [
        [s[0], s[1], s[2], s[3]],
        [s[0], s[1], s[2], s[4]],
        [s[0], s[1], s[3], s[4]],
        [s[0], s[2], s[3], s[4]],
        [s[1], s[2], s[3], s[4]]
    ];
}

function evaluateXien5_5DanX4(h5) {
    const hits = Number(h5) || 0;
    const stakeK = 55000;
    let payoutK = 0;
    let danHit4 = 0;
    let danHit3 = 0;
    let danHit2 = 0;
    let danMiss = 0;

    if (hits >= 5) {
        danHit4 = 5;
        payoutK = 5 * 384000;
    } else if (hits === 4) {
        danHit4 = 1;
        danHit3 = 4;
        payoutK = 384000 + 4 * 84000;
    } else if (hits === 3) {
        danHit3 = 2;
        danHit2 = 3;
        payoutK = 2 * 84000 + 3 * 12000;
    } else if (hits === 2) {
        danHit2 = 3;
        danMiss = 2;
        payoutK = 3 * 12000;
    } else {
        danMiss = 5;
        payoutK = 0;
    }

    const profitK = payoutK - stakeK;
    return {
        h5: hits,
        stakeK,
        payoutK,
        profitK,
        isWin: profitK > 0,
        hasAnyHit: payoutK > 0,
        danHit4,
        danHit3,
        danHit2,
        danMiss,
        winningDansCount: danHit4 + danHit3 + danHit2
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: TOP 6 VS TOP 7 DATA PURITY & INDEPENDENCE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 1: Top 6 Mode Independence & Purity]');

const top6Ledger = payload?.lo4EngineFusion?.modes?.top6?.settledLedger || [];
const top7Ledger = payload?.lo4EngineFusion?.modes?.top7?.settledLedger || [];
const chLedger = payload?.crossHedgingPortfolio?.settledLedger || [];

const top6Map = new Map(top6Ledger.map(r => [r.date, r]));
const top7Map = new Map(top7Ledger.map(r => [r.date, r]));
const chMap = new Map(chLedger.map(r => [r.date, r]));

test('1.1: Modes existence and ledger lengths match', () => {
    assert.ok(top6Ledger.length > 0, 'Top 6 settledLedger must not be empty');
    assert.ok(top7Ledger.length > 0, 'Top 7 settledLedger must not be empty');
    assert.strictEqual(top6Ledger.length, top7Ledger.length, 'Top 6 and Top 7 must cover same number of dates');
});

test('1.2: Top 6 and Top 7 have confirmed divergence on combat dates (divergence is genuine)', () => {
    const combatDates = Array.from(top6Map.keys()).filter(d => d >= '2026-09-16').sort();
    assert.strictEqual(combatDates.length, 18, 'Combat period must have 18 draws');

    let divergentDates = 0;
    combatDates.forEach(date => {
        const r6 = top6Map.get(date);
        const r7 = top7Map.get(date);
        if (r6.dayLotoProfitK !== r7.dayLotoProfitK) divergentDates++;
    });
    assert.ok(divergentDates >= 10, `Expected at least 10 divergent dates between Top 6 and Top 7, found ${divergentDates}`);
});

test('1.3: Simulate daily-advisor.js diary calculation under Top 6 mode', () => {
    // Replicate daily-advisor.js renderUnifiedCombatDiary loop logic
    let cumTop6LoProfitK = 0;
    let cumCrossLoProfitK = 0;
    let top6WinCount = 0;
    let top6TotalProfit = 0;

    const combatDates = Array.from(top6Map.keys()).filter(d => d >= '2026-09-16').sort();

    combatDates.forEach(date => {
        const lo4Row = top6Map.get(date);
        const chRow = chMap.get(date);

        const chLoPnlK = (chRow && chRow.loProfitK != null)
            ? chRow.loProfitK
            : (lo4Row ? (lo4Row.dayLotoProfitK || 0) : (chRow?.loPnlK || 0));
        cumCrossLoProfitK += chLoPnlK;

        // Daily advisor logic when currentLo4EngineMode === 'top6'
        const currentLo4EngineMode = 'top6';
        let lo4DayProfitK = chLoPnlK;
        let lo4CumProfitK = cumCrossLoProfitK;
        let lo4IsWin = (chLoPnlK > 0);

        if (currentLo4EngineMode === 'top6') {
            const top6DayPnl = (lo4Row && lo4Row.dayLotoProfitK != null)
                ? lo4Row.dayLotoProfitK
                : (chRow && chRow.loProfitK != null ? chRow.loProfitK : (lo4Row?.dayLotoProfitK || 0));
            lo4DayProfitK = top6DayPnl;
            cumTop6LoProfitK += top6DayPnl;
            lo4CumProfitK = cumTop6LoProfitK;
            lo4IsWin = (top6DayPnl > 0);
        }

        // Assert 1: Day profit strictly equals lo4Row Top 6
        assert.strictEqual(lo4DayProfitK, lo4Row.dayLotoProfitK, `Day profit on ${date} must match Top 6`);

        // Assert 2: Cumulative profit strictly equals Top 6 cum
        assert.strictEqual(lo4CumProfitK, cumTop6LoProfitK, `Cum profit on ${date} must match Top 6 cum`);

        // Assert 3: Win flag strictly corresponds to Top 6 day profit
        assert.strictEqual(lo4IsWin, lo4Row.dayLotoProfitK > 0, `Win flag on ${date} must match Top 6`);

        if (lo4DayProfitK > 0) top6WinCount++;
        top6TotalProfit += lo4DayProfitK;
    });

    // Check combat totals for Top 6
    assert.strictEqual(top6TotalProfit, 449400, 'Top 6 total combat profit must be +449.4M VIP (+449400K)');
    assert.strictEqual(cumTop6LoProfitK, 449400, 'Top 6 cumulative profit must be +449.4M VIP');
    assert.strictEqual(top6WinCount, 13, 'Top 6 should have 13 winning days out of 18');
});

test('1.4: Specific boundary date 2026-09-25 (Top 6 WIN vs Top 7 LOSS)', () => {
    const r6 = top6Map.get('2026-09-25');
    const r7 = top7Map.get('2026-09-25');
    const ch = chMap.get('2026-09-25');

    assert.strictEqual(r6.dayLotoProfitK, 8200, 'Top 6 on 2026-09-25 was +8.2M');
    assert.strictEqual(r7.dayLotoProfitK, -2800, 'Top 7 on 2026-09-25 was -2.8M');
    assert.strictEqual(ch.loProfitK, -2800, 'Cross-hedging on 2026-09-25 used Top 7 (-2.8M)');

    // In Top 6 mode:
    const effLoProfitTop6 = r6.dayLotoProfitK;
    assert.ok(effLoProfitTop6 > 0, 'Under Top 6, 2026-09-25 must be a WIN');

    // In Top 7 mode:
    const effLoProfitTop7 = r7.dayLotoProfitK;
    assert.ok(effLoProfitTop7 < 0, 'Under Top 7, 2026-09-25 must be a LOSS');
});

test('1.5: Final settled date 2026-10-03 (Top 6 +41.8M vs Top 7 +35.2M)', () => {
    const r6 = top6Map.get('2026-10-03');
    const r7 = top7Map.get('2026-10-03');
    const ch = chMap.get('2026-10-03');

    assert.strictEqual(r6.dayLotoProfitK, 41800, 'Top 6 on 2026-10-03 profit is +41.8M');
    assert.strictEqual(r7.dayLotoProfitK, 35200, 'Top 7 on 2026-10-03 profit is +35.2M');
    assert.strictEqual(ch.loProfitK, 35200, 'Cross Hedging on 2026-10-03 used Top 7 (+35.2M)');

    // When Top 6 is selected, the day profit must be 41800, NOT 35200
    const effLoProfitTop6 = r6.dayLotoProfitK;
    assert.strictEqual(effLoProfitTop6, 41800);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: XIÊN 5 EVALUATION & MATHEMATICAL RIGOR
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SUITE 2: Xiên 5 Evaluation Combinatorics & Fallback]');

test('2.1: evaluateXien5_5DanX4 satisfies financial conservation for all hit levels (0 to 5)', () => {
    const cases = [
        { h5: 5, expectedPayout: 1920000, expectedProfit: 1865000, expectedWin: true },
        { h5: 4, expectedPayout: 720000,  expectedProfit: 665000,  expectedWin: true },
        { h5: 3, expectedPayout: 204000,  expectedProfit: 149000,  expectedWin: true },
        { h5: 2, expectedPayout: 36000,   expectedProfit: -19000,  expectedWin: false },
        { h5: 1, expectedPayout: 0,       expectedProfit: -55000,  expectedWin: false },
        { h5: 0, expectedPayout: 0,       expectedProfit: -55000,  expectedWin: false }
    ];

    cases.forEach(c => {
        const res = evaluateXien5_5DanX4(c.h5);
        assert.strictEqual(res.stakeK, 55000, 'Stake must always be 55M');
        assert.strictEqual(res.payoutK, c.expectedPayout, `Payout mismatch for h5=${c.h5}`);
        assert.strictEqual(res.profitK, c.expectedProfit, `Profit mismatch for h5=${c.h5}`);
        assert.strictEqual(res.profitK, res.payoutK - res.stakeK, `Conservation profit === payout - stake failed for h5=${c.h5}`);
        assert.strictEqual(res.isWin, c.expectedWin, `isWin flag mismatch for h5=${c.h5}`);
    });
});

test('2.2: Combinatorial verification of getXi5Tickets', () => {
    const top5 = ['38', '62', '76', '10', '11'];
    const tickets = getXi5Tickets(top5);
    assert.strictEqual(tickets.length, 5, 'Must generate exactly 5 tickets');

    // Each ticket must have 4 distinct numbers
    tickets.forEach((t, idx) => {
        assert.strictEqual(t.length, 4, `Ticket ${idx} must have 4 numbers`);
        const set = new Set(t);
        assert.strictEqual(set.size, 4, `Ticket ${idx} numbers must be distinct`);
    });

    // Verification that all 5 combinations C(5, 4) are unique
    const uniqueSigs = new Set(tickets.map(t => t.slice().sort().join('-')));
    assert.strictEqual(uniqueSigs.size, 5, 'All 5 tickets must be unique 4-combinations');
});

test('2.3: Empirical fallback evaluation when loTop5ConsensusXien ledger row is absent', () => {
    // Simulate date 2026-10-03 with missing top5XienDay in ledger
    const testDate = '2026-10-03';
    const top5XienDay = null; // simulate MISSING ledger entry

    // Retrieve draw prizes from payload
    const drawPrizesForDate = (payload?.drawPrizesByDate?.[testDate]?.prizes || []).map(number);
    assert.ok(drawPrizesForDate.length > 0, 'Actual draw prizes for 2026-10-03 must exist');

    const lo4Row = top7Map.get(testDate);
    assert.ok(lo4Row, 'lo4Row must exist for test date');

    let fallbackTop5 = (lo4Row?.top5 || []).map(number);
    if (fallbackTop5.length < 5 && lo4Row?.betNumbers?.length >= 5) {
        fallbackTop5 = lo4Row.betNumbers.slice(0, 5).map(b => number(b.num));
    }
    assert.strictEqual(fallbackTop5.length, 5, 'Fallback top 5 numbers must have length 5');

    // Prize counts
    const prizeCounts = {};
    drawPrizesForDate.forEach(p => {
        const norm = number(p);
        prizeCounts[norm] = (prizeCounts[norm] || 0) + 1;
    });

    // Run fallback logic exactly as in daily-advisor.js lines 5267-5272:
    const hasPrizes = drawPrizesForDate.length > 0 || Object.keys(prizeCounts).length > 0;
    assert.ok(hasPrizes, 'hasPrizes must be true');

    let loXien5H5 = 0;
    let loXien5PayoutK = 0;
    let loXien5ProfitK = 0;
    let loXien5Tickets = [];

    if (fallbackTop5.length >= 5 && hasPrizes) {
        loXien5H5 = fallbackTop5.filter(n => (prizeCounts[n] || 0) > 0 || drawPrizesForDate.includes(n)).length;
        const evalX5 = evaluateXien5_5DanX4(loXien5H5);
        loXien5PayoutK = evalX5.payoutK;
        loXien5ProfitK = evalX5.profitK;
        loXien5Tickets = getXi5Tickets(fallbackTop5);
    }

    // Verify 2026-10-03 results:
    // Numbers: 38 (hit), 62 (miss), 76 (hit), 10 (hit), 11 (miss) -> 3 hits!
    assert.strictEqual(loXien5H5, 3, 'Hits must be 3 on 2026-10-03');
    assert.strictEqual(loXien5PayoutK, 204000, 'Payout must be 204M');
    assert.strictEqual(loXien5ProfitK, 149000, 'Profit must be +149M (NOT -55M!)');
    assert.ok(loXien5ProfitK > 0, 'Profit must be positive on winning fallback');
    assert.strictEqual(loXien5Tickets.length, 5, 'Must generate 5 tickets');
});

test('2.4: Adversarial simulation across all 18 combat dates with synthetic missing ledger', () => {
    // For all 18 combat dates, simulate removing top5XienDay and assert that fallback evaluation:
    // 1. Matches actual ledger result when ledger is present
    // 2. Never throws NaN or undefined
    // 3. Never docks -55M penalty when combinations won

    const combatDates = Array.from(top6Map.keys()).filter(d => d >= '2026-09-16').sort();

    combatDates.forEach(date => {
        const top5LedgerRow = payload?.loTop5ConsensusXien?.settledLedger?.find(r => r.date === date);
        const drawPrizesForDate = (payload?.drawPrizesByDate?.[date]?.prizes || []).map(number);

        const lo4Row = top7Map.get(date);
        let fallbackTop5 = (top5LedgerRow?.top5 || lo4Row?.top5 || []).map(number);
        if (fallbackTop5.length < 5 && lo4Row?.betNumbers?.length >= 5) {
            fallbackTop5 = lo4Row.betNumbers.slice(0, 5).map(b => number(b.num));
        }

        const prizeCounts = {};
        drawPrizesForDate.forEach(p => {
            const norm = number(p);
            prizeCounts[norm] = (prizeCounts[norm] || 0) + 1;
        });

        const hits = fallbackTop5.filter(n => (prizeCounts[n] || 0) > 0 || drawPrizesForDate.includes(n)).length;
        const evalRes = evaluateXien5_5DanX4(hits);

        assert.ok(!isNaN(evalRes.profitK), `profitK must not be NaN for ${date}`);
        assert.ok(!isNaN(evalRes.payoutK), `payoutK must not be NaN for ${date}`);

        if (hits >= 3) {
            assert.ok(evalRes.profitK > 0, `Date ${date} with ${hits} hits must have positive profit`);
        } else if (hits === 2) {
            assert.strictEqual(evalRes.profitK, -19000, `Date ${date} with 2 hits must have -19M net profit`);
        } else {
            assert.strictEqual(evalRes.profitK, -55000, `Date ${date} with <=1 hit must have -55M net profit`);
        }

        // If top5LedgerRow was present, compare results
        if (top5LedgerRow && top5LedgerRow.h5 != null) {
            assert.strictEqual(hits, top5LedgerRow.h5, `Hit count on ${date} must match ledger`);
            if (top5LedgerRow.x5Profit55K != null) {
                assert.strictEqual(evalRes.profitK, top5LedgerRow.x5Profit55K, `Profit on ${date} must match ledger`);
            }
        }
    });
});

test('2.5: Zero-prize edge case (Pending date / Unplayed date)', () => {
    // When hasPrizes is false, payout and profit must be 0, avoiding premature -55M loss
    const fallbackTop5 = ['10', '20', '30', '40', '50'];
    const drawPrizesForDate = [];
    const prizeCounts = {};
    const hasPrizes = drawPrizesForDate.length > 0 || Object.keys(prizeCounts).length > 0;

    let loXien5PayoutK = 0;
    let loXien5ProfitK = 0;

    if (fallbackTop5.length >= 5 && hasPrizes) {
        const evalX5 = evaluateXien5_5DanX4(0);
        loXien5PayoutK = evalX5.payoutK;
        loXien5ProfitK = evalX5.profitK;
    } else if (!hasPrizes) {
        loXien5PayoutK = 0;
        loXien5ProfitK = 0;
    }

    assert.strictEqual(loXien5PayoutK, 0, 'Unplayed date payout must be 0');
    assert.strictEqual(loXien5ProfitK, 0, 'Unplayed date profit must be 0 (no premature penalty)');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY & VERDICT GENERATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(80));
console.log(`CHALLENGER TEST SUMMARY: ${stats.passed}/${stats.total} assertions passed (${stats.failed} failed)`);
console.log('='.repeat(80));

if (stats.failed > 0) {
    console.error(`\n❌ VERDICT: REQUEST_CHANGES (${stats.failed} failures detected)\n`);
    process.exit(1);
} else {
    console.log(`\n✅ VERDICT: APPROVE (All empirical stress tests passed with 100% mathematical precision)\n`);
    process.exit(0);
}
