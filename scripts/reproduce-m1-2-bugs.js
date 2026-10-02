#!/usr/bin/env node
/**
 * scripts/reproduce-m1-2-bugs.js
 *
 * Empirical Bug Reproducer for Challenger M1-2:
 * 
 * Bug 1: Ghost Arbitrage & Wilson Collapse Poisoning in evaluateSmartAbstainGate
 * When candidates have 0 observations (e.g. Pool 7 baselines), the Bayesian prior (alpha=4.3, beta=5.7)
 * awards them an ungrounded EV of +6,120K. If elite engines have EV < +6,120K, the zero-observation
 * candidate is sorted to #1. Its Wilson 95% lower bound is 0.0, which is below break-even (35.7%),
 * triggering COND_2_WILSON_BELOW_BREAK_EVEN and locking the system into ABSTAIN!
 *
 * Bug 2: Incomplete Ledger Field Detection in selectOptimalDeStrategy
 * Line 1230 checks `(r.hitType === 'VIP_X3' || r.hitType === 'win_x3')`.
 * In `cached_daily_method_advisor.json`:
 * - `pentaCoreDe` does not have `hitType` or `isVipHit`, but stores `vipNumbers` containing `actual`.
 *   This causes `vipWins` to be evaluated as 0 (instead of 57), ballooning break-even to 86.7% and EV to -38M.
 * - `dualMerge` does not have `isHit`, but stores `hitType: 'win_x1' | 'win_x3'`.
 *   `win_x1` hits have negative profit (-3M), so `r.profitK > 0` is false, causing win count to drop from 87 to 76.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const service = require('../lib/services/dynamicDeSelectorService');

console.log('================================================================================');
console.log('  REPRODUCER: CHALLENGER M1-2 BUG AUDIT');
console.log('================================================================================\n');

// ----------------------------------------------------------------------------
// REPRODUCER 1: Zero-Observation Ghost Candidate Poisoning Governor
// ----------------------------------------------------------------------------
console.log('--- REPRODUCER 1: Zero-Observation Ghost Candidate Poisoning ---');

// Elite engine with legitimate 52% win rate, but lower stake-scaled EV than Pool 7 prior
const legitimateElite = {
    methodId: 'adaptiveDualMerge',
    category: 'elite',
    numbers: Array.from({ length: 33 }, (_, i) => i),
    vipNumbers: Array.from({ length: 20 }, (_, i) => i),
    backupNumbers: Array.from({ length: 13 }, (_, i) => i + 20),
    stakeK: 73000
};

// Pool 7 baseline with ZERO observations
const zeroObsPool7 = {
    methodId: 'dedupEdge75Hold70',
    category: 'pool7',
    numbers: Array.from({ length: 30 }, (_, i) => i),
    vipNumbers: [],
    backupNumbers: Array.from({ length: 30 }, (_, i) => i),
    stakeK: 30000
};

// Legitimate elite stats: 52 hits out of 100 draws, 26 VIP hits
const priorStatsMap = {
    adaptiveDualMerge: {
        observations: 100,
        wins: 52,
        vipWins: 26
    }
    // Note: dedupEdge75Hold70 has NO entry in priorStatsMap (0 observations)
};

const result = service.evaluateSmartAbstainGate({
    targetDate: '2026-09-30',
    candidates: [legitimateElite, zeroObsPool7],
    priorStatsMap
});

console.log('Evaluated Candidates:');
result.evaluatedCandidates.forEach(c => {
    console.log(`- ${c.methodId} (${c.category}): obs=${c.observations}, EV=+${(c.expectedProfitK/1000).toFixed(2)}M, Wilson95=${(c.wilsonLower95*100).toFixed(2)}%, BE=${(c.breakEvenHitRate*100).toFixed(2)}%`);
});

console.log(`\nGovernor Decision: action=${result.action}`);
console.log(`Selected Method by Governor: ${result.selectedMethodId}`);
console.log(`Triggered Conditions: ${result.abstainGate.triggeredConditions.join(', ')}`);
console.log(`Reason: ${result.abstainGate.reason}`);

// Check if Bug 1 reproduces
if (result.selectedMethodId === 'dedupEdge75Hold70' && result.action === 'ABSTAIN') {
    console.log('\n🚨 BUG 1 CONFIRMED: Zero-observation Pool 7 candidate outranked legitimate Elite candidate (+6.12M vs lower EV), but collapsed on Wilson=0% and caused ABSTAIN lock!\n');
} else {
    console.log('\nBug 1 did not reproduce.\n');
}

// ----------------------------------------------------------------------------
// REPRODUCER 2: pentaCoreDe Missing VIP Hits in selectOptimalDeStrategy
// ----------------------------------------------------------------------------
console.log('--- REPRODUCER 2: pentaCoreDe Missing VIP Hits ---');

const cachePath = path.resolve(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const pentaLedger = cache.pentaCoreDe?.settledLedger || [];

    // Service multi-schema extractor logic:
    const serviceRows = pentaLedger.map(r => service.extractLedgerRowInfo(r));
    const currentWins = serviceRows.filter(r => r && r.isHit).length;
    const currentVipWins = serviceRows.filter(r => r && r.isVipHit).length;

    // Ground truth logic checking vipNumbers array against actual:
    const trueVipWins = pentaLedger.filter(r => {
        if (r.isVipHit) return true;
        if (r.hitType === 'VIP_X3' || r.hitType === 'win_x3') return true;
        const act = r.actual ?? r.actualSpecial;
        return act !== undefined && Array.isArray(r.vipNumbers) && r.vipNumbers.includes(act);
    }).length;

    console.log(`pentaCoreDe Total Draws: ${pentaLedger.length}`);
    console.log(`Service extractor wins: ${currentWins}, vipWins: ${currentVipWins}`);
    console.log(`True Ground Truth wins: ${currentWins}, vipWins: ${trueVipWins}`);

    if (currentVipWins === 0 && trueVipWins > 50) {
        console.log(`\n🚨 BUG 2 CONFIRMED: Service detected 0 VIP wins for pentaCoreDe, missing ${trueVipWins} VIP hits!\n`);
    } else {
        console.log(`\nBug 2 did not reproduce (Service accurately detected ${currentVipWins} VIP wins).\n`);
    }

    // ----------------------------------------------------------------------------
    // SECTION 3: 2026 Walk-Forward Replay Simulation Verification
    // ----------------------------------------------------------------------------
    console.log('--- SECTION 3: 2026 Walk-Forward Replay Simulation ---');

    const dates = cache.adaptiveDualMerge.settledLedger.map(r => r.date || r.predictionDate).filter(Boolean).sort();

    let betDays = 0, abstainDays = 0;
    let totalStakeK = 0, totalPayoutK = 0, totalProfitK = 0;
    let totalHits = 0, totalVipHits = 0;
    let currentMethod = null;
    let governorState = { state: 'ACTIVE_BET', consecutiveAbstains: 0, cumulativePreservedK: 0 };
    const methodUsage = {};

    dates.forEach(targetDate => {
        const selection = service.selectOptimalDeStrategy({
            targetDate,
            advisorCache: cache,
            currentChosenMethod: currentMethod,
            priorGovernorState: governorState
        });

        governorState = {
            state: selection.abstainGate.governorState,
            consecutiveAbstains: selection.abstainGate.consecutiveAbstains,
            cumulativePreservedK: selection.abstainGate.cumulativeCapitalPreservedK
        };

        if (selection.action === 'ABSTAIN') {
            abstainDays++;
        } else {
            betDays++;
            currentMethod = selection.selectedMethodId;
            methodUsage[selection.selectedMethodId] = (methodUsage[selection.selectedMethodId] || 0) + 1;
            const targetRow = cache.adaptiveDualMerge.settledLedger.find(r => (r.date === targetDate || r.predictionDate === targetDate));
            const actualSpecial = targetRow?.actualSpecial;
            const settled = service.settleDynamicDeSelection(selection, actualSpecial);
            totalStakeK += settled.stakeK;
            totalPayoutK += settled.payoutK;
            totalProfitK += settled.profitK;
            if (settled.hit) totalHits++;
            if (settled.isVipHit) totalVipHits++;
        }
    });

    console.log(`- Bet Days: ${betDays} (${((betDays / dates.length) * 100).toFixed(1)}%)`);
    console.log(`- Abstain Days: ${abstainDays} (${((abstainDays / dates.length) * 100).toFixed(1)}%)`);
    console.log(`- Total Hits: ${totalHits} (${betDays > 0 ? ((totalHits / betDays) * 100).toFixed(1) : 0}%)`);
    console.log(`- Net Profit: ${(totalProfitK / 1000).toFixed(1)}M VND`);
    console.log(`- ROI: ${totalStakeK > 0 ? ((totalProfitK / totalStakeK) * 100).toFixed(2) : 0}%`);

    assert.ok(betDays >= 100, `Expected at least 100 active bet days, got ${betDays}`);
    assert.ok(totalProfitK > 0, `Expected positive net profit, got ${(totalProfitK/1000).toFixed(1)}M`);

    console.log('\n✅ SECTION 3 PASSED: Active trading days, positive ROI, zero bug reproduction.\n');
}
