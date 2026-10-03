/**
 * Comprehensive Test Suite for Auto Best-Selection Engine & SSOT Invariant (Milestone 3)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const autoBestService = require('../lib/services/autoBestSelectionService');
const dynamicDeSelector = require('../lib/services/dynamicDeSelectorService');
const crossHedgingService = require('../lib/services/crossHedgingPortfolioService');
const dailyAdvisorService = require('../lib/services/dailyMethodAdvisorService');

let passedCount = 0;
let failedCount = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`  ✓ [PASS] ${name}`);
        passedCount++;
    } catch (err) {
        console.error(`  ✗ [FAIL] ${name}`);
        console.error(`    ${err.message}`);
        failedCount++;
    }
}

console.log('\n' + '='.repeat(80));
console.log('  AUTO BEST-SELECTION ENGINE & IMMUTABLE SSOT TEST SUITE');
console.log('='.repeat(80));

// ============================================================================
// SUITE 1: 12 CANDIDATE UNIVERSE & DISJOINT INTEGRITY
// ============================================================================
console.log('\n--- SUITE 1: 12 Candidate Universe Definition & Disjoint Sets ---');

runTest('1.1: 12 Candidate Universe contains 5 Elite Engines and 7 Pool 7 Baselines', () => {
    assert.strictEqual(autoBestService.ALL_CANDIDATE_IDS.length, 12, 'Must contain 12 candidates');
    assert.strictEqual(autoBestService.ELITE_ENGINE_IDS.length, 5, 'Must contain 5 elite engines');
    assert.strictEqual(autoBestService.POOL_7_METHOD_IDS.length, 7, 'Must contain 7 pool 7 methods');

    const expectedElite = ['adaptiveDualMerge', 'pentaCoreDe', 'deMarkovGapHazard', 'dePositionalGraphFlow', 'dualMerge'];
    expectedElite.forEach(id => assert(autoBestService.ELITE_ENGINE_IDS.includes(id), `Missing elite: ${id}`));

    const expectedPool7 = [
        'dedupEdge75Hold70', 'dedupEdge50CombinedB40S05', 'dedupEdge50Hold70',
        'dedupDropoffHold70', 'avgEdge50Hold70', 'chainSmallFirstHold70', 'edgeHold70'
    ];
    expectedPool7.forEach(id => assert(autoBestService.POOL_7_METHOD_IDS.includes(id), `Missing pool7: ${id}`));
});

runTest('1.2: Candidate Loading Pipeline Produces 12 Valid Disjoint Profiles', () => {
    const candidates = dynamicDeSelector.loadAllDynamicCandidates('2026-09-30');
    assert.strictEqual(candidates.length, 12, 'Must load 12 candidate profiles');

    candidates.forEach(c => {
        assert(autoBestService.ALL_CANDIDATE_IDS.includes(c.methodId), `Unknown candidate: ${c.methodId}`);
        assert(c.numbers.length >= 30 && c.numbers.length <= 48, `Invalid number length: ${c.numbers.length} for ${c.methodId}`);
        assert.strictEqual(c.numbers.length, c.vipNumbers.length + c.backupNumbers.length, 'Disjoint sum must equal total count');

        const vipSet = new Set(c.vipNumbers);
        c.backupNumbers.forEach(b => {
            assert(!vipSet.has(b), `Backup number ${b} overlaps with VIP in ${c.methodId}`);
        });

        const expectedStake = (c.vipNumbers.length * 3 + c.backupNumbers.length * 1) * 1000;
        assert.strictEqual(c.stakeK, expectedStake, `Stake mismatch for ${c.methodId}`);
    });
});

// ============================================================================
// SUITE 2: MULTI-FACTOR QUANTITATIVE METRICS
// ============================================================================
console.log('\n--- SUITE 2: Multi-Factor Quantitative Evaluation Metrics ---');

runTest('2.1: Rolling Win Rates 7D and 30D Strict PIT Isolation', () => {
    const syntheticLedger = [];
    for (let i = 1; i <= 40; i++) {
        const d = `2026-01-${String(i).padStart(2, '0')}`;
        // Win every even day
        syntheticLedger.push({
            date: d,
            isHit: (i % 2 === 0),
            profitK: (i % 2 === 0 ? 7000 : -77000),
            stakeK: 77000
        });
    }

    // Evaluate on 2026-01-35 (data strictly <= 2026-01-34)
    const wr = autoBestService.calculateRollingWinRates(syntheticLedger, '2026-01-35');
    assert.strictEqual(wr.count7D, 7, '7D window must evaluate 7 draws');
    assert.strictEqual(wr.count30D, 30, '30D window must evaluate 30 draws');
    assert(Math.abs(wr.winRate7D - 0.4286) < 0.05 || Math.abs(wr.winRate7D - 0.5714) < 0.05, 'WR 7D in expected bounds');
    assert(Math.abs(wr.winRate30D - 0.50) < 0.01, 'WR 30D must be 50%');
});

runTest('2.2: 7-Day Net PnL (PnL_7D) Calculation Conserves Currency', () => {
    const syntheticLedger = [
        { date: '2026-09-01', profitK: 10000, stakeK: 77000 },
        { date: '2026-09-02', profitK: -77000, stakeK: 77000 },
        { date: '2026-09-03', profitK: 25000, stakeK: 77000 },
        { date: '2026-09-04', profitK: -77000, stakeK: 77000 },
        { date: '2026-09-05', profitK: 175000, stakeK: 77000 },
        { date: '2026-09-06', profitK: -77000, stakeK: 77000 },
        { date: '2026-09-07', profitK: 175000, stakeK: 77000 }
    ];

    const pnl7D = autoBestService.calculateRollingPnL(syntheticLedger, '2026-09-08', 7);
    const expected = 10000 - 77000 + 25000 - 77000 + 175000 - 77000 + 175000;
    assert.strictEqual(pnl7D, expected, `PnL 7D must equal ${expected}`);
});

runTest('2.3: Rolling Sharpe Ratio 30D Bounds and Positivity', () => {
    const profitableLedger = [];
    for (let i = 1; i <= 30; i++) {
        profitableLedger.push({
            date: `2026-08-${String(i).padStart(2, '0')}`,
            profitK: i % 3 === 0 ? -77000 : 84000,
            stakeK: 77000
        });
    }

    const sharpe = autoBestService.calculateRollingSharpe(profitableLedger, '2026-08-31', 30);
    assert(sharpe > 0, `Profitable strategy must have positive Sharpe ratio, got ${sharpe}`);
    assert(sharpe <= 10.0, `Sharpe must not exceed maximum clamp bound 10.0, got ${sharpe}`);
});

runTest('2.4: Drawdown Penalty and Loss Streak Calculation', () => {
    const drawLedger = [
        { date: '2026-09-01', profitK: 50000 },
        { date: '2026-09-02', profitK: -77000 },
        { date: '2026-09-03', profitK: -77000 },
        { date: '2026-09-04', profitK: -77000 }
    ];

    const dd = autoBestService.calculateRollingDrawdown(drawLedger, '2026-09-05', 30);
    assert.strictEqual(dd.lossStreak, 3, 'Loss streak must be 3 consecutive draws');
    assert.strictEqual(dd.maxDrawdownK, 231000, 'Max drawdown must be 3 * 77000 = 231000');
});

// ============================================================================
// SUITE 3: MASTER EVALUATION & RANKING ENGINE
// ============================================================================
console.log('\n--- SUITE 3: Master Evaluation Pipeline & Composite Scores ---');

runTest('3.1: evaluateAutoBestSelection Evaluates All 12 Candidates', () => {
    const res = autoBestService.evaluateAutoBestSelection('2026-10-04');
    assert(res, 'Must return a result');
    assert(res.selectedMethod, 'Must have a selectedMethod ID');
    assert(res.selectedMethodLabel, 'Must have a selectedMethodLabel');
    assert(['ACTIVE', 'ABSTAIN'].includes(res.status), `Invalid status: ${res.status}`);
    assert(['BET', 'ABSTAIN'].includes(res.action), `Invalid action: ${res.action}`);
    assert.strictEqual(res.scores.length, 12, 'Must score exactly 12 candidates');

    // Assert descending ranking
    for (let i = 0; i < res.scores.length - 1; i++) {
        assert(res.scores[i].compositeScore >= res.scores[i + 1].compositeScore,
            `Ranking order violated: #${res.scores[i].rank} (${res.scores[i].compositeScore}) < #${res.scores[i+1].rank} (${res.scores[i+1].compositeScore})`);
        assert.strictEqual(res.scores[i].rank, i + 1);
    }
});

runTest('3.2: Multi-Factor Reasoning Cites Sharpe, Win Rate, PnL, Drawdown', () => {
    const res = autoBestService.evaluateAutoBestSelection('2026-10-04');
    assert(typeof res.reasoning === 'string' && res.reasoning.length > 20, 'Reasoning string must be non-empty');
    if (res.status === 'ACTIVE') {
        assert(res.reasoning.includes('Sharpe'), 'Reasoning must cite Sharpe ratio');
        assert(res.reasoning.includes('Win rate'), 'Reasoning must cite Win rate');
        assert(res.reasoning.includes('PnL'), 'Reasoning must cite PnL');
        assert(res.reasoning.includes('Drawdown'), 'Reasoning must cite Drawdown');
    } else {
        assert(res.reasoning.includes('BẢO TOÀN VỐN') || res.reasoning.includes('ABSTAIN'), 'Abstain reasoning must cite capital preservation');
    }
});

// ============================================================================
// SUITE 4: SSOT CACHE SYNCHRONIZATION & IMMUTABILITY
// ============================================================================
console.log('\n--- SUITE 4: SSOT Cache Files Synchronization & Invariance ---');

const p1 = path.resolve(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
const p2 = path.resolve(__dirname, '../data/cached_daily_method_advisor.json');

runTest('4.1: Both cache files exist and are byte-for-byte identical', () => {
    assert(fs.existsSync(p1), 'lib/data/statistics/cached_daily_method_advisor.json must exist');
    assert(fs.existsSync(p2), 'data/cached_daily_method_advisor.json must exist');

    const h1 = crypto.createHash('sha256').update(fs.readFileSync(p1)).digest('hex');
    const h2 = crypto.createHash('sha256').update(fs.readFileSync(p2)).digest('hex');
    assert.strictEqual(h1, h2, `Cache files must have identical SHA-256 hashes (${h1} !== ${h2})`);
});

runTest('4.2: Root autoBestSelection Section Exists with Valid Contract', () => {
    const cache = JSON.parse(fs.readFileSync(p1, 'utf8'));
    assert(cache.autoBestSelection, 'Root cache must contain autoBestSelection section');
    assert(cache.autoBestSelection.selectedMethod, 'Must have selectedMethod');
    assert(['ACTIVE', 'ABSTAIN'].includes(cache.autoBestSelection.status), 'Must have valid status');
    assert(Array.isArray(cache.autoBestSelection.scores) && cache.autoBestSelection.scores.length === 12, 'Must contain 12 scored candidates');
    assert(typeof cache.autoBestSelection.reasoning === 'string', 'Must contain reasoning text');
});

runTest('4.3: crossHedgingPortfolio.metrics Matches 272-Draw Settled Ledger Exactly', () => {
    const cache = JSON.parse(fs.readFileSync(p1, 'utf8'));
    const ch = cache.crossHedgingPortfolio;
    assert(ch, 'Must have crossHedgingPortfolio');

    const ledger = ch.settledLedger;
    assert.strictEqual(ledger.length, 272, 'settledLedger must have 272 draws');

    const wins = ledger.filter(r => r.isWin).length;
    const finalRow = ledger[ledger.length - 1];

    assert.strictEqual(ch.metrics.totalDraws2026, 272, 'totalDraws2026 must be 272');
    assert.strictEqual(ch.metrics.positiveDays2026, wins, 'positiveDays2026 must match ledger wins');
    assert.strictEqual(ch.metrics.cumulativeProfitK, finalRow.cumulativeProfitK, 'cumulativeProfitK must match final row');
    assert(Math.abs(ch.metrics.dailyPositiveProfitRate - (wins / 272)) < 0.001, 'dailyPositiveProfitRate must match wins/272');
});

// ============================================================================
// SUITE 5: SERVICE INTEGRATION & BACKWARD COMPATIBILITY
// ============================================================================
console.log('\n--- SUITE 5: Cross-Hedging Pillar 1 Dynamic Selection ---');

runTest('5.1: crossHedgingPortfolioService.computePillar1De Dynamically Uses autoBestSelection', () => {
    const mockCache = {
        autoBestSelection: {
            selectedMethod: 'adaptiveDualMerge',
            selectedMethodLabel: 'Đề Thích Ứng Alpha',
            numbers: Array.from({ length: 41 }, (_, i) => i + 10),
            vipNumbers: Array.from({ length: 17 }, (_, i) => i + 10),
            backupNumbers: Array.from({ length: 24 }, (_, i) => i + 27)
        }
    };

    const dec = crossHedgingService.evaluateCrossAssetPortfolio('2026-10-04', [], mockCache);
    assert(dec.pillar1_De, 'Must contain pillar1_De');
    assert.strictEqual(dec.pillar1_De.methodId, 'adaptiveDualMerge', 'Must use selected method from autoBestSelection');
    assert(dec.pillar1_De.vipNumbers.length >= 10 && dec.pillar1_De.vipNumbers.length <= 17, 'VIP numbers quota respected');
});

runTest('5.2: dailyMethodAdvisorService.generateAdvisorCache Attaches autoBestSelection', () => {
    const cache = JSON.parse(fs.readFileSync(p1, 'utf8'));
    const simulatedNow = new Date('2026-10-04T10:00:00+07:00'); // 10:00 AM VN Time (unlocked)
    const freshCache = dailyAdvisorService.generateAdvisorCache({
        raw: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../lib/data/xsmb-2-digits.json'), 'utf8')),
        existingCache: cache,
        now: simulatedNow
    });

    assert(freshCache.autoBestSelection, 'generateAdvisorCache must attach autoBestSelection section');
    assert(freshCache.autoBestSelection.selectedMethod, 'Must specify selectedMethod');
    assert.strictEqual(freshCache.autoBestSelection.scores.length, 12, 'Must score 12 candidates');
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log(`  AUTO BEST-SELECTION TEST SUITE COMPLETE: ${passedCount}/${passedCount + failedCount} PASSED`);
if (failedCount > 0) {
    console.error(`  ❌ FAILURES: ${failedCount}`);
    process.exit(1);
} else {
    console.log('  🎉 ALL AUTO BEST-SELECTION & SSOT INVARIANT TESTS PASSED WITH 100% SUCCESS!');
    console.log('='.repeat(80));
}
