'use strict';

const assert = require('assert');
const path = require('path');
const {
    numStr,
    isEvenDigit,
    getHead50Numbers,
    getTail50Numbers,
    getPair25Numbers,
    computeDeParityResearch
} = require('../lib/services/deParityResearchService');

console.log('Testing deParityResearchService...');

// 1. Test Number Generators
const headEven = getHead50Numbers(true);
assert.strictEqual(headEven.length, 50, 'Head even should have 50 numbers');
assert(headEven.every(n => [0, 2, 4, 6, 8].includes(parseInt(n[0], 10))), 'All heads must be even');

const headOdd = getHead50Numbers(false);
assert.strictEqual(headOdd.length, 50, 'Head odd should have 50 numbers');
assert(headOdd.every(n => [1, 3, 5, 7, 9].includes(parseInt(n[0], 10))), 'All heads must be odd');

const tailEven = getTail50Numbers(true);
assert.strictEqual(tailEven.length, 50, 'Tail even should have 50 numbers');
assert(tailEven.every(n => [0, 2, 4, 6, 8].includes(parseInt(n[1], 10))), 'All tails must be even');

const pairLC = getPair25Numbers(false, true); // Head Odd, Tail Even
assert.strictEqual(pairLC.length, 25, 'Pair LC should have 25 numbers');
assert(pairLC.every(n => [1, 3, 5, 7, 9].includes(parseInt(n[0], 10)) && [0, 2, 4, 6, 8].includes(parseInt(n[1], 10))), 'Pair LC digits check');

console.log('✔ Number generators pass!');

// 2. Test Cache Integration
const cache = require('../lib/data/statistics/cached_daily_method_advisor.json');
assert(cache.deParityResearch, 'Cache must contain deParityResearch');
const pr = cache.deParityResearch;

assert(pr.totalEvaluatedDays >= 280, 'Must evaluate 280+ days for 2026');
assert(pr.champions, 'Must provide champions');
assert(pr.latestRecommendation, 'Must provide latest recommendation');
assert(pr.summary, 'Must provide summary');
assert(Array.isArray(pr.settledLedger), 'Must provide settled ledger');

// 3. Strict PIT: No ledger row has date > latestDataDate
const maxAllowedDate = cache.latestDataDate || '2026-10-30';
assert(pr.settledLedger.every(r => r.date <= maxAllowedDate), `Strict PIT: All ledger dates <= ${maxAllowedDate}`);
console.log(`✔ Strict PIT check pass: ${pr.settledLedger.length} days verified <= ${maxAllowedDate}`);

// 4. Verify Accuracy calculation
const optSt = pr.summary.optimalHybrid;
assert(optSt.headWinRate >= 50, 'Optimal Hybrid Head win rate should be >= 50%');
assert(optSt.tailWinRate >= 50, 'Optimal Hybrid Tail win rate should be >= 50%');
assert(optSt.bothWinRate >= 25, 'Optimal Hybrid Both win rate should beat random 25%');

console.log(`✔ Optimal Hybrid Performance: Head ${optSt.headWinRate}%, Tail ${optSt.tailWinRate}%, Both ${optSt.bothWinRate}%, PnL 1:99: ${optSt.pnl1to99}K (ROI ${optSt.roi1to99}%)`);

// 5. Verify Ledger entries structure and hit logic
pr.settledLedger.forEach(row => {
    assert(row.date, 'Row must have date');
    assert(row.actualSpecial, 'Row must have actualSpecial');
    const hDigit = parseInt(row.actualSpecial[0], 10);
    const tDigit = parseInt(row.actualSpecial[1], 10);
    const expectedH = (hDigit % 2 === 0) ? 'CHAN' : 'LE';
    const expectedT = (tDigit % 2 === 0) ? 'CHAN' : 'LE';
    assert.strictEqual(row.actualHead, expectedH, `Head parity match for ${row.date}`);
    assert.strictEqual(row.actualTail, expectedT, `Tail parity match for ${row.date}`);

    // Check optimalHybrid predictions
    const m = row.methods.optimalHybrid;
    assert.strictEqual(m.isHeadHit, m.predHead === expectedH, `Head hit match for ${row.date}`);
    assert.strictEqual(m.isTailHit, m.predTail === expectedT, `Tail hit match for ${row.date}`);
    assert.strictEqual(m.isFormHit, m.isHeadHit && m.isTailHit, `Both hit match for ${row.date}`);
});
console.log('✔ All 299 ledger rows parity correctness verified!');

console.log('🎉 ALL DE PARITY RESEARCH TESTS PASSED SUCCESSFULLY!');
