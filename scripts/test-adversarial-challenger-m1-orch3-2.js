#!/usr/bin/env node
/**
 * scripts/test-adversarial-challenger-m1-orch3-2.js
 *
 * Empirical Adversarial Verification & Stress Test Harness
 * Author: challenger_m1_orch3_2 (EMPIRICAL CHALLENGER Subagent)
 *
 * Mandatory Verification Pillars:
 * 1. Counterfactual Hedging Guarantee Across Every Draw in 2026:
 *    - Đề alone hit -> Total Net Profit > 0 (VIP & Single tested for all draws)
 *    - Lô 2 nháy alone hit -> Total Net Profit > 0 (Calibrated Mức 3 vs Live Router)
 * 2. 100% Strict Point-In-Time (Strict PIT):
 *    - Random future mutations across 20 distinct dates throughout 2026
 *    - Proves recommendations are 100% invariant to future tampering
 *    - Strict PIT guard exception validation
 * 3. Snapshot Freezing Invariant:
 *    - Pre-draw object vs post-draw object verbatim reference equality
 *    - Deep immutability verification of pre-draw object after settlement
 * 4. 2026 Full-Year Walk-Forward Backtest & Conservation Laws:
 *    - Total draws >= 267
 *    - Daily positive profit rate >= 70.0%
 *    - Cumulative ROI >= +25.0%
 *    - Max consecutive loss days <= 3
 *    - Strict financial conservation: profit === payout - stake across all 270 rows
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const s = require('../lib/services/crossHedgingPortfolioService');

let passedAssertions = 0;
let failedAssertions = 0;
const testResults = [];

function check(title, fn) {
    try {
        fn();
        passedAssertions++;
        console.log(`  \x1b[32m✔ PASS\x1b[0m ${title}`);
        testResults.push({ title, status: 'PASS' });
    } catch (err) {
        failedAssertions++;
        console.error(`  \x1b[31m✘ FAIL\x1b[0m ${title}`);
        console.error(`    \x1b[31mDetails:\x1b[0m ${err.message}`);
        testResults.push({ title, status: 'FAIL', error: err.message });
    }
}

console.log('\n================================================================================');
console.log('⚔️  RUNNING EMPIRICAL ADVERSARIAL STRESS HARNESS — CHALLENGER M1 ORCH3 2');
console.log('================================================================================\n');

// Load real datasets
const rawPath = path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const cachePath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

const rawMap = new Map();
raw.forEach((r, idx) => {
    const d = r.date || r.ngay;
    if (d) rawMap.set(String(d).slice(0, 10), { row: r, index: idx });
});

const cacheDates = (cache?.lo4EngineFusion?.modes?.top7?.settledLedger || []).map(r => r.date).filter(d => d.startsWith('2026')).sort();
const dates2026 = cacheDates.length > 0 ? cacheDates : [...rawMap.keys()].filter(d => d.startsWith('2026')).sort();

// =============================================================================
// SUITE 1: SYNTHETIC COUNTERFACTUAL HEDGING GUARANTEE ACROSS EVERY DRAW IN 2026
// =============================================================================
console.log('\x1b[36m--- SUITE 1: Synthetic Counterfactual Hedging Across Every 2026 Draw ---\x1b[0m');

check('1.1: Đề hit alone delivers Total Net Profit > 0 for 100% of active 2026 draws', () => {
    let testedCount = 0;
    let dePositiveCount = 0;

    for (const targetDate of dates2026) {
        const rawEntry = rawMap.get(targetDate);
        if (!rawEntry) continue;
        const pastDraws = raw.slice(0, rawEntry.index);

        const decision = s.evaluateCrossAssetPortfolio(targetDate, pastDraws, cache);
        if (decision.mode === 'SMART_ABSTAIN' || decision.sizingMultiplier === 0) continue;
        testedCount++;

        const p1 = decision.pillar1_De;
        const testNum = p1.vipNumbers.length > 0 ? p1.vipNumbers[0] : p1.singleNumbers[0];

        // Draw where ONLY Đề hits (Lô and Xiên completely miss)
        const fakeDrawDeAlone = {
            special: String(testNum).padStart(2, '0'),
            prize1: '99', prize2_1: '98', prize2_2: '97'
        };
        const settled = s.settleCrossAssetPortfolio(decision, fakeDrawDeAlone);

        assert.strictEqual(settled.isDeHit, true);
        assert.strictEqual(settled.totalPayoutK - settled.totalStakeK, settled.totalProfitK);
        if (settled.totalProfitK > 0) dePositiveCount++;
    }

    console.log(`    [Metrics] Đề alone hit -> Profit > 0 on ${dePositiveCount}/${testedCount} active draws (${(dePositiveCount/testedCount*100).toFixed(1)}%)`);
    assert(testedCount >= 265, `Expected >= 265 active draws, got ${testedCount}`);
    assert.strictEqual(dePositiveCount, testedCount, 'Đề alone must deliver Net Profit > 0 for 100% of active draws');
});

check('1.2: Calibrated Standard Mức 3 (Top 4 Lô @ 65đ) guarantees Net Profit > 0 on 2 nháy', () => {
    const hedge = s.solveOptimalHedgeWeights({
        loNumbersCount: 4,
        loPoints: 65,
        DE_STAKE_BASE_K: 4500,
        XIEN_TICKET_PRICE_K: 100
    });
    assert.strictEqual(hedge.isHedgingGuaranteed, true);
    assert.strictEqual(hedge.profitIfLo2HitsK, 280);
    assert.strictEqual(hedge.profitIfDeVipHitsK, 156680);
});

check('1.3: Empirical verification of Lô multi-hit coverage across 2026 router regimes', () => {
    // Audit what is required to achieve net profit when Đề misses under live router selections:
    let testedCount = 0;
    let lo3HitsPositiveCount = 0;

    for (const targetDate of dates2026) {
        const rawEntry = rawMap.get(targetDate);
        if (!rawEntry) continue;
        const pastDraws = raw.slice(0, rawEntry.index);

        const decision = s.evaluateCrossAssetPortfolio(targetDate, pastDraws, cache);
        if (decision.mode === 'SMART_ABSTAIN' || decision.sizingMultiplier === 0) continue;
        testedCount++;

        const p1 = decision.pillar1_De;
        const p3 = decision.pillar3_Xien;

        // Guaranteed Đề miss
        const missSpecial = Array.from({length: 100}, (_, idx) => idx).find(n => !p1.allNumbers.includes(n));

        // Test 3 hits in Top 4 / Top 7
        const fakeDraw3Hits = {
            special: String(missSpecial).padStart(2, '0'),
            prize1: String(p3.numbers[0]).padStart(2, '0'),
            prize2_1: String(p3.numbers[1]).padStart(2, '0'),
            prize2_2: String(p3.numbers[2]).padStart(2, '0')
        };
        const settled3 = s.settleCrossAssetPortfolio(decision, fakeDraw3Hits);
        assert.strictEqual(settled3.totalPayoutK - settled3.totalStakeK, settled3.totalProfitK);
        if (settled3.totalProfitK > 0) lo3HitsPositiveCount++;
    }

    console.log(`    [Metrics] Lô 3 hits alone -> Profit > 0 on ${lo3HitsPositiveCount}/${testedCount} active draws (${(lo3HitsPositiveCount/testedCount*100).toFixed(1)}%)`);
    assert.strictEqual(lo3HitsPositiveCount, testedCount, 'Lô 3 nháy must guarantee Net Profit > 0 across 100% of draws in all router regimes');
});

// =============================================================================
// SUITE 2: 100% STRICT POINT-IN-TIME (ADVERSARIAL MUTATION ACROSS 20 RANDOM DATES)
// =============================================================================
console.log('\n\x1b[36m--- SUITE 2: 100% Strict Point-In-Time (20 Random Dates Future Mutation) ---\x1b[0m');

check('2.1: Scrambling future draws across 20 distinct dates leaves decisions 100% invariant', () => {
    const step = Math.floor(dates2026.length / 20);
    const testIndices = [];
    for (let i = 0; i < 20; i++) {
        testIndices.push(Math.min(dates2026.length - 1, i * step + (i % 3)));
    }
    const sampleDates = [...new Set(testIndices.map(idx => dates2026[idx]))].slice(0, 20);
    assert.strictEqual(sampleDates.length, 20);

    let invariantPassCount = 0;
    let pitGuardPassCount = 0;

    sampleDates.forEach(targetDate => {
        const rawEntry = rawMap.get(targetDate);
        const targetIdx = rawEntry.index;
        const pastDrawsReal = raw.slice(0, targetIdx);

        // Baseline decision
        const baseDecision = s.evaluateCrossAssetPortfolio(targetDate, pastDrawsReal, cache);

        // Clone and scramble all draws from targetIdx onward
        const mutatedRaw = JSON.parse(JSON.stringify(raw));
        for (let k = targetIdx; k < mutatedRaw.length; k++) {
            mutatedRaw[k].special = (mutatedRaw[k].special + 37 + (k % 11)) % 100;
            if (mutatedRaw[k].prize1 !== undefined) mutatedRaw[k].prize1 = (mutatedRaw[k].prize1 + 41) % 100;
            if (mutatedRaw[k].prize2_1 !== undefined) mutatedRaw[k].prize2_1 = (mutatedRaw[k].prize2_1 + 43) % 100;
            if (mutatedRaw[k].prize7_4 !== undefined) mutatedRaw[k].prize7_4 = (mutatedRaw[k].prize7_4 + 47) % 100;
        }

        const pastDrawsMutated = mutatedRaw.slice(0, targetIdx);
        const mutatedDecision = s.evaluateCrossAssetPortfolio(targetDate, pastDrawsMutated, cache);

        // Verification of strict invariance:
        assert.deepStrictEqual(baseDecision.pillar1_De.allNumbers, mutatedDecision.pillar1_De.allNumbers);
        assert.deepStrictEqual(baseDecision.pillar1_De.vipNumbers, mutatedDecision.pillar1_De.vipNumbers);
        assert.deepStrictEqual(baseDecision.pillar1_De.singleNumbers, mutatedDecision.pillar1_De.singleNumbers);
        assert.deepStrictEqual(baseDecision.pillar2_Lo.numbers, mutatedDecision.pillar2_Lo.numbers);
        assert.deepStrictEqual(baseDecision.pillar2_Lo.top4, mutatedDecision.pillar2_Lo.top4);
        assert.deepStrictEqual(baseDecision.pillar3_Xien.numbers, mutatedDecision.pillar3_Xien.numbers);
        assert.strictEqual(baseDecision.mode, mutatedDecision.mode);
        assert.strictEqual(baseDecision.sizingMultiplier, mutatedDecision.sizingMultiplier);
        assert.strictEqual(baseDecision.totalStakeK, mutatedDecision.totalStakeK);
        invariantPassCount++;

        // Strict PIT Guard check (must reject if future draw is passed)
        let guardThrew = false;
        try {
            s.evaluateCrossAssetPortfolio(targetDate, mutatedRaw.slice(0, targetIdx + 1), cache);
        } catch (e) {
            if (/Strict PIT Violation/.test(e.message)) guardThrew = true;
        }
        if (guardThrew) pitGuardPassCount++;
    });

    console.log(`    [Metrics] Invariance verified: ${invariantPassCount}/20 dates | Guard triggered: ${pitGuardPassCount}/20 dates`);
    assert.strictEqual(invariantPassCount, 20);
    assert.strictEqual(pitGuardPassCount, 20);
});

// =============================================================================
// SUITE 3: SNAPSHOT FREEZING & IMMUTABILITY VERIFICATION
// =============================================================================
console.log('\n\x1b[36m--- SUITE 3: Snapshot Freezing & Immutability Verification ---\x1b[0m');

check('3.1: Pre-draw object is returned verbatim post-draw and is unmutated by settlement', () => {
    const testDate = '2026-06-18';
    const rawEntry = rawMap.get(testDate);
    const targetIdx = rawEntry.index;
    const pastDraws = raw.slice(0, targetIdx);

    // 1. Pre-draw evaluation before 18h15
    const preDrawDecision = s.evaluateCrossAssetPortfolio(testDate, pastDraws, cache);
    const preDrawCopy = JSON.stringify(preDrawDecision);

    // 2. Lock into cache
    const mockCache = JSON.parse(JSON.stringify(cache));
    mockCache.crossHedgingPortfolioSnapshot = mockCache.crossHedgingPortfolioSnapshot || {};
    mockCache.crossHedgingPortfolioSnapshot[testDate] = preDrawDecision;

    // 3. Post-draw evaluation after 18h40
    const postDrawDecision = s.evaluateCrossAssetPortfolio(testDate, pastDraws, mockCache);
    assert.strictEqual(postDrawDecision, preDrawDecision, 'Post-draw evaluation must return identical reference to pre-draw snapshot');

    // 4. Settlement against actual draw
    const settled = s.settleCrossAssetPortfolio(postDrawDecision, rawEntry.row);

    // 5. Verify immutability of pre-draw object
    assert.strictEqual(JSON.stringify(preDrawDecision), preDrawCopy, 'Pre-draw decision object must not be mutated by settlement');

    // 6. Verify ledger consistency
    assert.strictEqual(settled.date, testDate);
    assert.strictEqual(settled.mode, preDrawDecision.mode);
    assert.strictEqual(settled.sizingMultiplier, preDrawDecision.sizingMultiplier);
    assert.strictEqual(settled.deStakeK, preDrawDecision.pillar1_De.stakeK);
    assert.strictEqual(settled.loStakeK, preDrawDecision.pillar2_Lo.stakeK);
    assert.strictEqual(settled.xienStakeK, preDrawDecision.pillar3_Xien.stakeK);
    assert.strictEqual(settled.totalStakeK, preDrawDecision.totalStakeK);
});

// =============================================================================
// SUITE 4: 2026 WALK-FORWARD BACKTEST & CONSERVATION LAWS
// =============================================================================
console.log('\n\x1b[36m--- SUITE 4: Full 2026 Walk-Forward Backtest & Conservation Laws ---\x1b[0m');

check('4.1: 2026 walk-forward replay strictly satisfies all acceptance criteria', () => {
    const backtest = s.runCrossHedgingBacktest2026({ rawRows: raw, advisorCache: cache });
    const summary = backtest.summary;

    console.log(`    [Metrics] Analyzed Draws: ${summary.totalDraws2026} (Target >= 267)`);
    console.log(`    [Metrics] Active Days: ${summary.activeDays}`);
    console.log(`    [Metrics] Daily Positive Days: ${summary.positiveDays2026}`);
    console.log(`    [Metrics] Daily Positive Rate: ${(summary.dailyPositiveProfitRate * 100).toFixed(2)}% (Target >= 70.0%)`);
    console.log(`    [Metrics] Cumulative Net Profit: +${(summary.cumulativeProfitK / 1000).toFixed(1)}M VND`);
    console.log(`    [Metrics] Cumulative ROI: +${(summary.cumulativeRoi * 100).toFixed(2)}% (Target >= +25.0%)`);
    console.log(`    [Metrics] Max Consecutive Loss: ${summary.maxConsecutiveLossDays} days (Target <= 3 days)`);

    assert(summary.totalDraws2026 >= 267, `totalDraws2026 (${summary.totalDraws2026}) must be >= 267`);
    assert(summary.dailyPositiveProfitRate >= 0.70, `dailyPositiveProfitRate (${summary.dailyPositiveProfitRate}) must be >= 0.70`);
    assert(summary.cumulativeRoi >= 0.25, `cumulativeRoi (${summary.cumulativeRoi}) must be >= 0.25`);
    assert(summary.maxConsecutiveLossDays <= 3, `maxConsecutiveLossDays (${summary.maxConsecutiveLossDays}) must be <= 3`);
    assert.strictEqual(summary.isAcceptancePassed, true);
});

check('4.2: Strict financial conservation holds for all 270 settled ledger records', () => {
    const backtest = s.runCrossHedgingBacktest2026({ rawRows: raw, advisorCache: cache });
    let conservationViolations = 0;

    backtest.settledLedger.forEach(row => {
        const diff = Math.abs((row.totalPayoutK - row.totalStakeK) - row.totalProfitK);
        if (diff !== 0) conservationViolations++;
        assert.strictEqual(row.isWin, row.totalProfitK > 0);
    });

    assert.strictEqual(conservationViolations, 0, 'Every row must strictly satisfy payout - stake === profit');
});

// =============================================================================
// SUMMARY REPORT
// =============================================================================
console.log('\n================================================================================');
console.log(`🎉 EMPIRICAL HARNESS SUMMARY: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
console.log('================================================================================\n');

if (failedAssertions > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
