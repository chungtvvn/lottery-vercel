'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(80));
console.log('🧪 VERIFICATION TEST: 👑 DÀN XIÊN 5 (5 DÀN X4 · 11M/DÀN) P&L & CUMULATIVE INTEGRITY');
console.log('='.repeat(80));

const cachePath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const regPath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'daily_locked_bets_registry.json');

const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
const drawPrizes = cache.drawPrizesByDate || {};

function evaluateXien5_5DanX4(h5) {
    const hits = Number(h5) || 0;
    const stakeK = 55000;
    let payoutK = 0;
    if (hits >= 5) payoutK = 5 * 384000;
    else if (hits === 4) payoutK = 384000 + 4 * 84000;
    else if (hits === 3) payoutK = 2 * 84000 + 3 * 12000;
    else if (hits === 2) payoutK = 3 * 12000;
    else payoutK = 0;
    const profitK = payoutK - stakeK;
    return { hits, payoutK, profitK, isWin: profitK > 0 };
}

const numStr = n => String(Number(n)).padStart(2, '0');

const combatDates = Object.keys(reg.dates).filter(d => d >= '2026-09-16' && d <= '2026-10-13').sort();
console.log(`Checking ${combatDates.length} settled combat dates from 2026-09-16 to 2026-10-13...`);

let cumProfitK = 0;
let winCount = 0;

combatDates.forEach((date, idx) => {
    const entry = reg.dates[date];
    assert(entry, `Entry for date ${date} must exist in registry`);
    assert(entry.isSettled, `Date ${date} must be settled`);

    const b = entry.bets || {};
    const s = entry.settlement || {};
    const x5Bet = b.loXien5;
    const x5Settlement = s.loXien5;

    assert(x5Bet, `Bets for loXien5 must exist on ${date}`);
    assert(x5Settlement, `Settlement for loXien5 must exist on ${date}`);

    // 1. Length must be exactly 5
    assert.strictEqual(x5Bet.top5.length, 5, `Date ${date} top5 must have exactly 5 numbers, got ${x5Bet.top5.length}`);
    assert.strictEqual(x5Settlement.top5.length, 5, `Date ${date} settlement top5 must have exactly 5 numbers, got ${x5Settlement.top5.length}`);

    // 2. Hits must match draw prizes
    const prizes = (entry.actualResult?.prizes || drawPrizes[date]?.prizes || []).map(numStr);
    assert(prizes.length >= 27, `Date ${date} must have 27 draw prizes, got ${prizes.length}`);
    const prizesSet = new Set(prizes);

    const actualHits = x5Bet.top5.filter(n => prizesSet.has(n));
    assert.strictEqual(x5Settlement.h5, actualHits.length, `Date ${date} hits recorded (${x5Settlement.h5}) must match actual hits (${actualHits.length})`);

    // 3. P&L must strictly match formula
    const expected = evaluateXien5_5DanX4(actualHits.length);
    assert.strictEqual(x5Settlement.payoutK, expected.payoutK, `Date ${date} payout mismatch: recorded ${x5Settlement.payoutK} vs expected ${expected.payoutK}`);
    assert.strictEqual(x5Settlement.profitK, expected.profitK, `Date ${date} profit mismatch: recorded ${x5Settlement.profitK} vs expected ${expected.profitK}`);
    assert.strictEqual(x5Settlement.isWin, expected.isWin, `Date ${date} isWin mismatch`);

    cumProfitK += expected.profitK;
    if (expected.isWin) winCount++;

    console.log(`  ✔ [PASS] ${date} | Top5: [${x5Bet.top5.join('-')}] | Hits: ${actualHits.length}/5 [${actualHits.join(',')}] | P&L: ${(expected.profitK/1000 >= 0 ? '+' : '')}${expected.profitK/1000}M | Cum: ${(cumProfitK/1000 >= 0 ? '+' : '')}${cumProfitK/1000}M`);
});

console.log(`\nAll ${combatDates.length} combat dates passed verification!`);
console.log(`Total Win Days: ${winCount}/${combatDates.length} (${(winCount/combatDates.length*100).toFixed(1)}%)`);
console.log(`Total Cumulative Profit: +${cumProfitK/1000}M (+${cumProfitK}K)\n`);

// Verify pending date
const pendingEntry = reg.dates['2026-10-14'];
if (pendingEntry) {
    assert.strictEqual(pendingEntry.isSettled, false, 'Pending date 2026-10-14 must NOT be settled');
    assert.strictEqual(pendingEntry.bets?.loXien5?.top5?.length, 5, 'Pending date top5 must have 5 numbers');
    console.log(`  ✔ [PASS] Pending date 2026-10-14 has 5 locked numbers: [${pendingEntry.bets.loXien5.top5.join('-')}]`);
}

console.log('='.repeat(80));
console.log('🎉 100% PASS: 👑 DÀN XIÊN 5 FINANCIAL INTEGRITY IS FULLY CONSERVED AND VERIFIED!');
console.log('='.repeat(80));
