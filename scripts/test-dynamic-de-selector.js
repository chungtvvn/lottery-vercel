#!/usr/bin/env node
/**
 * scripts/test-dynamic-de-selector.js
 *
 * Comprehensive Unit Test Suite for:
 * lib/services/dynamicDeSelectorService.js
 *
 * Verifies all 5 Core Pillars:
 * 1. Candidate Universe: 12 candidate methods with disjoint VIP and Backup partitioning.
 * 2. Multi-Tier X3/X1 Financial Model & Conservation Law: payoutK - stakeK === profitK.
 * 3. Objective Function & Quant Selector: EV Formulation, Wilson 95% Lower Bound, Dynamic Break-Even.
 * 4. Anticipatory Transition Router: Streak States, Laplace Shrinkage, Rebound Bonuses, Fatigue Penalties,
 *    Inertia Damping, Anti-Churn Significance, and Proactive Rebound Swap.
 * 5. Smart Abstain Governor: 3-Trigger Safety System, Schmitt-Trigger Hysteresis State Machine,
 *    and Capital Preservation Telemetry.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const service = require('../lib/services/dynamicDeSelectorService');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✓ [PASS] ${name}`);
    } catch (err) {
        failedTests++;
        console.error(`  ✗ [FAIL] ${name}`);
        console.error(`    Error: ${err.message}`);
        if (process.env.VERBOSE && err.stack) {
            console.error(err.stack);
        }
    }
}

console.log('\n================================================================================');
console.log('  DYNAMIC ĐỀ ENGINE SELECTOR — COMPREHENSIVE UNIT TEST SUITE');
console.log('================================================================================\n');

// ============================================================================
// SUITE 1: CANDIDATE UNIVERSE & DISJOINT PARTITIONING
// ============================================================================
console.log('--- SUITE 1: Candidate Universe & Set Partitioning ---');

runTest('1.1: 12 Candidate Universe Definition', () => {
    assert.equal(service.ALL_CANDIDATE_IDS.length, 12, 'Must contain exactly 12 candidate methods');
    assert.equal(service.ELITE_ENGINE_IDS.length, 5, 'Must contain 5 elite engines');
    assert.equal(service.POOL_7_METHOD_IDS.length, 7, 'Must contain 7 Pool 7 methods');

    service.ALL_CANDIDATE_IDS.forEach(id => {
        const meta = service.METHOD_METADATA_REGISTRY[id];
        assert(meta, `Metadata registry must contain ${id}`);
        assert.equal(typeof meta.methodLabel, 'string');
        assert(['elite', 'pool7'].includes(meta.category));
    });
});

runTest('1.2: Number Set Normalization (Range, Integers, Uniqueness)', () => {
    const rawInputs = [-5, 0, '07', 12, 12, 88.5, 99, 100, 'abc', 45];
    const normalized = service.normalizeNumbers(rawInputs);
    assert.deepStrictEqual(normalized, [0, 7, 12, 45, 99]);
    normalized.forEach(n => {
        assert(Number.isInteger(n) && n >= 0 && n <= 99);
    });
});

runTest('1.3: Disjoint VIP and Backup Partitioning with Overlap Sanitization', () => {
    // Intentionally pass overlapping numbers between VIP and Backup
    const rawVip = [10, 20, 30, 40];
    const rawBackup = [30, 40, 50, 60, 70]; // 30 and 40 overlap!

    const sanitized = service.sanitizeCandidateSets(rawVip, rawBackup);
    assert.deepStrictEqual(sanitized.vipNumbers, [10, 20, 30, 40]);
    assert.deepStrictEqual(sanitized.backupNumbers, [50, 60, 70], 'Overlapping numbers must be removed from Backup');
    assert.deepStrictEqual(sanitized.numbers, [10, 20, 30, 40, 50, 60, 70]);
    assert.equal(sanitized.totalCount, sanitized.vipCount + sanitized.backupCount);
    assert.equal(sanitized.stakeK, (4 * 3 + 3 * 1) * 1000);
});

runTest('1.4: Deterministic Fallback Generation Reproducibility', () => {
    const set1 = service.getDeterministic30('2026-05-15', 3);
    const set2 = service.getDeterministic30('2026-05-15', 3);
    const setDiff = service.getDeterministic30('2026-05-15', 4);

    assert.equal(set1.length, 30);
    assert.deepStrictEqual(set1, set2, 'Deterministic generator must be reproducible for same inputs');
    assert.notDeepStrictEqual(set1, setDiff, 'Different offsets must generate different sets');
});

runTest('1.5: Candidate Loading Pipeline Produces 12 Valid Disjoint Profiles', () => {
    const loaded = service.loadAllDynamicCandidates('2026-09-30');
    assert.equal(loaded.length, 12);

    loaded.forEach(c => {
        assert(service.ALL_CANDIDATE_IDS.includes(c.methodId));
        assert(c.numbers.length >= 30 && c.numbers.length <= 48);
        assert.equal(c.numbers.length, c.vipNumbers.length + c.backupNumbers.length);
        const vipSet = new Set(c.vipNumbers);
        c.backupNumbers.forEach(b => {
            assert(!vipSet.has(b), `Backup number ${b} must not be in VIP for ${c.methodId}`);
        });
        const expectedStake = (c.vipNumbers.length * 3 + c.backupNumbers.length * 1) * 1000;
        assert.equal(c.stakeK, expectedStake);
    });
});

// ============================================================================
// SUITE 2: MULTI-TIER X3/X1 FINANCIAL MODEL & CONSERVATION LAW
// ============================================================================
console.log('\n--- SUITE 2: Multi-Tier X3/X1 Financial Model & Conservation Law ---');

runTest('2.1: Stake Calculation Formula across diverse configurations', () => {
    assert.equal(service.calculateTieredStakeK(16, 27), 75000, 'Penta-Core: 16*3 + 27*1 = 75M');
    assert.equal(service.calculateTieredStakeK(17, 26), 77000, 'Markov/Graph: 17*3 + 26*1 = 77M');
    assert.equal(service.calculateTieredStakeK(24, 18), 90000, 'DualMerge Elite: 24*3 + 18*1 = 90M');
    assert.equal(service.calculateTieredStakeK(0, 30), 30000, 'Pool 7 Baseline: 0*3 + 30*1 = 30M');
    assert.equal(service.calculateTieredStakeK(25, 12), 87000, 'Max Elite Tier: 25*3 + 12*1 = 87M');
});

runTest('2.2: VIP Overlap Hit Awards 252M and Strictly Conserves PnL', () => {
    const stakeK = 77000;
    const res = service.calculatePayoutAndProfitK({
        action: 'BET',
        actualSpecial: 42,
        vipNumbers: [10, 20, 42],
        backupNumbers: [50, 60, 70],
        stakeK
    });

    assert.equal(res.payoutK, 252000, 'VIP hit must award exactly 252,000K');
    assert.equal(res.profitK, 252000 - 77000, 'Profit must equal payout - stake');
    assert.equal(res.payoutK - res.stakeK, res.profitK, 'Conservation: payoutK - stakeK === profitK');
    assert.equal(res.hit, true);
    assert.equal(res.isVipHit, true);
    assert.equal(res.hitType, 'VIP_X3');
});

runTest('2.3: Backup Single Hit Awards 84M and Strictly Conserves PnL', () => {
    const stakeK = 85000;
    const res = service.calculatePayoutAndProfitK({
        action: 'BET',
        actualSpecial: 60,
        vipNumbers: [10, 20, 42],
        backupNumbers: [50, 60, 70],
        stakeK
    });

    assert.equal(res.payoutK, 84000, 'Backup hit must award exactly 84,000K');
    assert.equal(res.profitK, 84000 - 85000, '-1000K profit');
    assert.equal(res.payoutK - res.stakeK, res.profitK, 'Conservation: payoutK - stakeK === profitK');
    assert.equal(res.hit, true);
    assert.equal(res.isVipHit, false);
    assert.equal(res.hitType, 'BACKUP_X1');
});

runTest('2.4: Miss / Zero Hit Results in -Stake and Conserves PnL', () => {
    const stakeK = 75000;
    const res = service.calculatePayoutAndProfitK({
        action: 'BET',
        actualSpecial: 99,
        vipNumbers: [10, 20, 30],
        backupNumbers: [40, 50, 60],
        stakeK
    });

    assert.equal(res.payoutK, 0);
    assert.equal(res.profitK, -75000);
    assert.equal(res.payoutK - res.stakeK, res.profitK);
    assert.equal(res.hit, false);
    assert.equal(res.hitType, 'NONE');
});

runTest('2.5: Abstain Enforces Zero Cost (Stake=0, Payout=0, Profit=0)', () => {
    const res = service.calculatePayoutAndProfitK({
        action: 'ABSTAIN',
        actualSpecial: 10,
        vipNumbers: [10],
        backupNumbers: [20],
        stakeK: 77000
    });

    assert.strictEqual(res.stakeK, 0);
    assert.strictEqual(res.payoutK, 0);
    assert.strictEqual(res.profitK, 0);
    assert.strictEqual(res.payoutK - res.stakeK, res.profitK);
    assert.strictEqual(res.hit, false);
});

// ============================================================================
// SUITE 3: OBJECTIVE FUNCTION & QUANT SELECTOR
// ============================================================================
console.log('\n--- SUITE 3: Objective Function & Quant Selector ---');

runTest('3.1: Expected Value E[Profit] Formulation', () => {
    // E[Profit] = p_VIP * 252K + p_Backup * 84K - Stake
    const pVIP = 0.25;
    const pBackup = 0.20;
    const stakeK = 75000;
    const expected = 0.25 * 252000 + 0.20 * 84000 - 75000; // 63000 + 16800 - 75000 = 4800K
    const computed = service.computeExpectedProfitK(pVIP, pBackup, stakeK);
    assert.equal(computed, 4800);
});

runTest('3.2: Dynamic Break-Even Hit Rate Formula', () => {
    // Pool 7 baseline: stake = 30M, rhoVIP = 0 => theta_BE = 30 / 84 = 35.7143%
    const bePool7 = service.computeDynamicBreakEven(30000, 0);
    assert.equal(bePool7, 0.357143);

    // Elite X3/X1: stake = 75M, rhoVIP = 0.40 => denom = 84 + 168 * 0.4 = 151.2K => theta_BE = 75 / 151.2 = 49.6032%
    const beElite = service.computeDynamicBreakEven(75000, 0.40);
    assert.equal(beElite, 0.496032);
});

runTest('3.3: Wilson 95% Lower Bound Mathematical Precision', () => {
    // 0 wins out of 100 trials must be 0
    assert.equal(service.computeWilsonScore95(0, 100), 0);

    // 45 wins out of 90 trials (p = 0.50):
    // Center = (0.5 + 1.95996^2 / 180) / (1 + 1.95996^2 / 90) = (0.5 + 0.02134) / 1.04268 = 0.5000
    // Margin = 1.95996 * sqrt((0.25 / 90) + (1.95996^2 / 32400)) / 1.04268 = 1.95996 * sqrt(0.002778 + 0.0001186) / 1.04268 = 0.10118
    // Lower = 0.3988
    const w90 = service.computeWilsonScore95(45, 90);
    assert(w90 >= 0.3980 && w90 <= 0.3995, `w90=${w90} should be ~0.3988`);

    // 100 wins out of 100 trials must be > 0.95 and <= 1.0
    const w100 = service.computeWilsonScore95(100, 100);
    assert(w100 > 0.95 && w100 <= 1.0);
});

runTest('3.4: Candidate Quant Metrics Evaluation Enrichment', () => {
    const candidate = {
        methodId: 'testMethod',
        numbers: Array.from({ length: 42 }, (_, i) => i),
        vipNumbers: Array.from({ length: 24 }, (_, i) => i),
        backupNumbers: Array.from({ length: 18 }, (_, i) => i + 24),
        stakeK: 90000
    };
    const priorStats = { observations: 60, wins: 30, vipWins: 15 };
    const evaluated = service.evaluateCandidateQuantMetrics(candidate, priorStats);

    assert.equal(evaluated.stakeK, 90000);
    assert(evaluated.wilsonLower95 > 0.35);
    assert(typeof evaluated.expectedProfitK === 'number');
    assert(typeof evaluated.breakEvenHitRate === 'number');
});

runTest('3.5: Pairwise Jaccard Ensemble Divergence Metric', () => {
    // Disjoint sets: D_ensemble must equal 1.0
    const disjoint = [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [8, 9, 10, 11]
    ];
    const divDisjoint = service.computeEnsembleDivergence(disjoint);
    assert.equal(divDisjoint.D_ensemble, 1.0);

    // Identical sets: D_ensemble must equal 0.0
    const identical = [
        [1, 2, 3, 4],
        [1, 2, 3, 4],
        [1, 2, 3, 4]
    ];
    const divIdentical = service.computeEnsembleDivergence(identical);
    assert.equal(divIdentical.D_ensemble, 0.0);
});

// ============================================================================
// SUITE 4: ANTICIPATORY TRANSITION ROUTER & PROACTIVE REBOUND SWAP
// ============================================================================
console.log('\n--- SUITE 4: Anticipatory Transition Router & Proactive Rebound Swap ---');

runTest('4.1: Discrete Streak State Tagging & Semantic Mapping', () => {
    assert.equal(service.getStreakStateTag(-5), 'L4+');
    assert.equal(service.getStreakStateTag(-4), 'L4+');
    assert.equal(service.getStreakStateTag(-3), 'L3');
    assert.equal(service.getStreakStateTag(-2), 'L2');
    assert.equal(service.getStreakStateTag(-1), 'L1');
    assert.equal(service.getStreakStateTag(0), 'INIT');
    assert.equal(service.getStreakStateTag(1), 'W1');
    assert.equal(service.getStreakStateTag(2), 'W2');
    assert.equal(service.getStreakStateTag(3), 'W3+');
    assert.equal(service.getStreakStateTag(5), 'W3+');

    assert(service.getStreakStateSemanticLabel(-2).includes('Trượt 2 kỳ'));
    assert(service.getStreakStateSemanticLabel(2).includes('Thắng thông 2 kỳ'));
});

runTest('4.2: Strict PIT Laplace-Smoothed Transition Probability with Prior K=3', () => {
    // Ledger of alternating hits
    const ledger = [
        { isHit: true },  // W1
        { isHit: false }, // L1
        { isHit: true },  // W1
        { isHit: false }, // L1
        { isHit: true }   // W1
    ];
    const metrics = service.computePITTransitionMetricsForLedger(ledger, 5, { priorK: 3 });
    assert.equal(metrics.totalCount, 5);
    assert.equal(metrics.totalWins, 3);
    assert.equal(metrics.baseWinRate, 0.60);
    assert(metrics.condProb > 0 && metrics.condProb <= 1);
});

runTest('4.3: Graded Rebound Bonus and Fatigue Penalty Constants', () => {
    assert.equal(service.REBOUND_BONUSES['L1'], 0.04);
    assert.equal(service.REBOUND_BONUSES['L2'], 0.06);
    assert.equal(service.REBOUND_BONUSES['L3'], 0.08);
    assert.equal(service.REBOUND_BONUSES['L4+'], 0.05);

    assert.equal(service.FATIGUE_PENALTIES['W2'], 0.12);
    assert.equal(service.FATIGUE_PENALTIES['W3+'], 0.18);
});

runTest('4.4: Anti-Churning Significance Test Holds Incumbent', () => {
    // Challenger marginal edge: 31/60 vs 30/60
    const decision = service.selectAnticipatoryRouterMethod({
        currentMethod: 'mIncumbent',
        candidateMatrix: [
            { methodId: 'mChallenger', curTag: 'W1', condProb: 0.51, anticipatoryScore: 0.51, totalWins: 31, totalCount: 60, curStreak: 1 },
            { methodId: 'mIncumbent', curTag: 'W1', condProb: 0.50, anticipatoryScore: 0.50 + 0.03, totalWins: 30, totalCount: 60, curStreak: 1 }
        ]
    });

    // Should retain incumbent due to insignificance
    assert.equal(decision.selectedMethodId, 'mIncumbent');
    assert(decision.switchReason.includes('chưa đạt ngưỡng ý nghĩa thống kê'));
});

runTest('4.5: Proactive Rebound Swap Activates at W2/W3+ Exhaustion', () => {
    // Incumbent is at W2 (fatigued). Elite challenger is at L2 with high rebound probability (0.52).
    const decision = service.selectAnticipatoryRouterMethod({
        currentMethod: 'mFatiguedIncumbent',
        candidateMatrix: [
            { methodId: 'mReboundChallenger', curTag: 'L2', condProb: 0.52, anticipatoryScore: 0.58, curStreak: -2 },
            { methodId: 'mFatiguedIncumbent', curTag: 'W2', condProb: 0.35, anticipatoryScore: 0.30, curStreak: 2 }
        ],
        config: { enableProactiveSwap: true, dominanceMargin: 0.05, proactiveSwapThreshold: 0.40 }
    });

    assert.equal(decision.selectedMethodId, 'mReboundChallenger', 'Must proactively swap to rebound candidate');
    assert.equal(decision.switchPhase, 'REBOUND');
    assert.equal(decision.routerTelemetry?.ruleTriggered, 'PROACTIVE_REBOUND_SWAP');
    assert(decision.switchReason.includes('Chủ động đảo pha đón đầu'));
});

// ============================================================================
// SUITE 5: SMART ABSTAIN GOVERNOR & HYSTERESIS STATE MACHINE
// ============================================================================
console.log('\n--- SUITE 5: Smart Abstain Governor & Risk Preservation ---');

runTest('5.1: Trigger 1 — All Candidates Negative EV forces ABSTAIN', () => {
    // Create candidates where expected profit is negative
    const candidates = [
        { methodId: 'm1', numbers: Array.from({ length: 43 }, (_, i) => i), vipNumbers: [1, 2, 3], backupNumbers: [4, 5], stakeK: 77000 }
    ];
    const priorStatsMap = {
        m1: { observations: 50, wins: 5, vipWins: 1 } // Low hit rate => EV < 0
    };

    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates,
        priorStatsMap
    });

    assert.equal(res.action, 'ABSTAIN');
    assert.equal(res.stakeK, 0);
    assert.deepStrictEqual(res.numbers, []);
    assert.equal(res.abstainGate.isAbstained, true);
    assert(res.abstainGate.triggeredConditions.includes('COND_1_NEGATIVE_EV'));
    assert(res.abstainGate.capitalPreservedK > 0);
});

runTest('5.2: Trigger 2 — Wilson 95% Below Break-Even forces ABSTAIN', () => {
    // Win rate looks ok superficially in tiny sample, but Wilson lower bound < breakEven
    const candidates = [
        { methodId: 'm2', numbers: Array.from({ length: 30 }, (_, i) => i), vipNumbers: [], backupNumbers: Array.from({ length: 30 }, (_, i) => i), stakeK: 30000 }
    ];
    // n=10, wins=4 (40% > 35.7% breakEven, but Wilson95 lower is ~0.168 < 0.357)
    const priorStatsMap = {
        m2: { observations: 10, wins: 4, vipWins: 0 }
    };

    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates,
        priorStatsMap
    });

    assert.equal(res.action, 'ABSTAIN');
    assert.equal(res.abstainGate.isAbstained, true);
    assert(res.abstainGate.triggeredConditions.includes('COND_2_WILSON_BELOW_BREAK_EVEN'));
});

runTest('5.3: Trigger 3 — Extreme Ensemble Divergence (>0.85) forces ABSTAIN', () => {
    // Completely disjoint candidates across 3 elite engines
    const candidates = [
        { methodId: 'e1', category: 'elite', numbers: Array.from({ length: 20 }, (_, i) => i), vipNumbers: [0, 1], backupNumbers: [2, 3], stakeK: 77000 },
        { methodId: 'e2', category: 'elite', numbers: Array.from({ length: 20 }, (_, i) => i + 20), vipNumbers: [20, 21], backupNumbers: [22, 23], stakeK: 77000 },
        { methodId: 'e3', category: 'elite', numbers: Array.from({ length: 20 }, (_, i) => i + 40), vipNumbers: [40, 41], backupNumbers: [42, 43], stakeK: 77000 }
    ];
    // High historical wins
    const priorStatsMap = {
        e1: { observations: 90, wins: 55, vipWins: 30 },
        e2: { observations: 90, wins: 55, vipWins: 30 },
        e3: { observations: 90, wins: 55, vipWins: 30 }
    };

    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates,
        priorStatsMap
    });

    assert.equal(res.action, 'ABSTAIN');
    assert.equal(res.abstainGate.isAbstained, true);
    assert(res.abstainGate.triggeredConditions.includes('COND_3_EXTREME_ENSEMBLE_DIVERGENCE'));
    assert(res.abstainGate.divergenceReport.D_ensemble > 0.85);
});

runTest('5.4: Healthy Market Execution Passes all Triggers (Action = BET)', () => {
    // High agreement, high win rate
    const common = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const candidates = [
        { methodId: 'e1', category: 'elite', numbers: [...common, 11, 12, 13], vipNumbers: common.slice(0, 5), backupNumbers: common.slice(5), stakeK: 77000 },
        { methodId: 'e2', category: 'elite', numbers: [...common, 14, 15, 16], vipNumbers: common.slice(0, 5), backupNumbers: common.slice(5), stakeK: 77000 }
    ];
    const priorStatsMap = {
        e1: { observations: 90, wins: 55, vipWins: 32 },
        e2: { observations: 90, wins: 53, vipWins: 30 }
    };

    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates,
        priorStatsMap
    });

    assert.equal(res.action, 'BET');
    assert.equal(res.abstainGate.isAbstained, false);
    assert.equal(res.stakeK, 77000);
    assert(res.numbers.length > 0);
    assert.equal(res.abstainGate.capitalPreservedK, 0);
});

runTest('5.5: Schmitt-Trigger Hysteresis Recovery Anti-Chattering', () => {
    // Currently in ABSTAIN_GUARD state
    const priorState = { state: 'ABSTAIN_GUARD', consecutiveAbstains: 2, cumulativePreservedK: 154000 };

    // Candidate barely positive (EV = +1000K < buffer +5000K)
    const candidates = [
        { methodId: 'e1', category: 'elite', numbers: [1, 2, 3, 4], vipNumbers: [1, 2], backupNumbers: [3, 4], stakeK: 77000 }
    ];
    // marginal stats
    const priorStatsMap = {
        e1: { observations: 60, wins: 30, vipWins: 15, posteriorProb: 0.48 }
    };

    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates,
        priorStatsMap,
        priorGovernorState: priorState
    });

    // Must remain in ABSTAIN_GUARD due to hysteresis buffer
    assert.equal(res.action, 'ABSTAIN');
    assert.equal(res.abstainGate.governorState, 'ABSTAIN_GUARD');
    assert.equal(res.abstainGate.consecutiveAbstains, 3);
    assert.equal(res.abstainGate.cumulativeCapitalPreservedK, 154000 + 77000);
    assert(res.abstainGate.reason.includes('Hysteresis Buffer'));
});

// ============================================================================
// SUITE 6: MASTER SELECTOR & SETTLEMENT E2E INTEGRATION
// ============================================================================
console.log('\n--- SUITE 6: Master Selector & Settlement E2E Integration ---');

runTest('6.1: selectOptimalDeStrategy Full Pipeline Execution with Cache', () => {
    const selection = service.selectOptimalDeStrategy('2026-09-30');
    assert(selection, 'Selection result must exist');
    assert(typeof selection.targetDate === 'string');
    assert(['BET', 'ABSTAIN'].includes(selection.action));
    assert(typeof selection.selectedMethodId === 'string');
    assert(typeof selection.selectedMethodLabel === 'string');
    assert(typeof selection.confidenceBadge === 'string');
    assert(typeof selection.stakeK === 'number');
    assert(Array.isArray(selection.numbers));
    assert(Array.isArray(selection.vipNumbers));
    assert(Array.isArray(selection.backupNumbers));

    // evMetrics structure
    assert(selection.evMetrics);
    assert.equal(selection.evMetrics.payoutVIPK, 252000);
    assert.equal(selection.evMetrics.payoutBackupK, 84000);

    // abstainGate structure
    assert(selection.abstainGate);
    assert.equal(typeof selection.abstainGate.isAbstained, 'boolean');
});

runTest('6.2: settleDynamicDeSelection on Active BET (VIP Hit)', () => {
    const mockSelection = {
        targetDate: '2026-09-30',
        action: 'BET',
        selectedMethodId: 'adaptiveDualMerge',
        stakeK: 77000,
        numbers: [10, 20, 30, 40],
        vipNumbers: [10, 20],
        backupNumbers: [30, 40],
        payoutVIPK: 252000,
        payoutBackupK: 84000,
        abstainGate: { isAbstained: false }
    };

    const settled = service.settleDynamicDeSelection(mockSelection, 10);
    assert.equal(settled.settled, true);
    assert.equal(settled.actualSpecial, 10);
    assert.equal(settled.hit, true);
    assert.equal(settled.isVipHit, true);
    assert.equal(settled.payoutK, 252000);
    assert.equal(settled.profitK, 252000 - 77000);
    assert.equal(settled.payoutK - settled.stakeK, settled.profitK);
});

runTest('6.3: settleDynamicDeSelection on Active BET (Backup Hit)', () => {
    const mockSelection = {
        targetDate: '2026-09-30',
        action: 'BET',
        selectedMethodId: 'adaptiveDualMerge',
        stakeK: 77000,
        numbers: [10, 20, 30, 40],
        vipNumbers: [10, 20],
        backupNumbers: [30, 40],
        payoutVIPK: 252000,
        payoutBackupK: 84000,
        abstainGate: { isAbstained: false }
    };

    const settled = service.settleDynamicDeSelection(mockSelection, 30);
    assert.equal(settled.settled, true);
    assert.equal(settled.actualSpecial, 30);
    assert.equal(settled.hit, true);
    assert.equal(settled.isVipHit, false);
    assert.equal(settled.payoutK, 84000);
    assert.equal(settled.profitK, 84000 - 77000);
    assert.equal(settled.payoutK - settled.stakeK, settled.profitK);
});

runTest('6.4: settleDynamicDeSelection on Active BET (Miss)', () => {
    const mockSelection = {
        targetDate: '2026-09-30',
        action: 'BET',
        selectedMethodId: 'adaptiveDualMerge',
        stakeK: 77000,
        numbers: [10, 20, 30, 40],
        vipNumbers: [10, 20],
        backupNumbers: [30, 40],
        payoutVIPK: 252000,
        payoutBackupK: 84000,
        abstainGate: { isAbstained: false }
    };

    const settled = service.settleDynamicDeSelection(mockSelection, 99);
    assert.equal(settled.settled, true);
    assert.equal(settled.hit, false);
    assert.equal(settled.payoutK, 0);
    assert.equal(settled.profitK, -77000);
    assert.equal(settled.payoutK - settled.stakeK, settled.profitK);
});

runTest('6.5: settleDynamicDeSelection on ABSTAIN', () => {
    const mockSelection = {
        targetDate: '2026-09-30',
        action: 'ABSTAIN',
        selectedMethodId: 'adaptiveDualMerge',
        stakeK: 0,
        numbers: [],
        vipNumbers: [],
        backupNumbers: [],
        payoutVIPK: 252000,
        payoutBackupK: 84000,
        abstainGate: { isAbstained: true, capitalPreservedK: 77000 }
    };

    const settled = service.settleDynamicDeSelection(mockSelection, 10);
    assert.equal(settled.settled, true);
    assert.equal(settled.stakeK, 0);
    assert.equal(settled.payoutK, 0);
    assert.equal(settled.profitK, 0);
    assert.equal(settled.payoutK - settled.stakeK, settled.profitK);
    assert.equal(settled.hit, false);

    const audit = service.auditAbstainSettlement(settled, 10);
    assert.equal(audit.wasAbstained, true);
    assert.equal(audit.stakePreservedK, 77000);
});

// ============================================================================
// SUITE 7: BUG 1, 2 & 3 ALGORITHMIC & QUANTITATIVE REGRESSIONS
// ============================================================================
console.log('\n--- SUITE 7: Bug 1, 2 & 3 Algorithmic & Quantitative Regressions ---');

runTest('7.1: Bug 1 Prior Formulation: Pool 7 (30 numbers) receives p_base = 0.30 and E[Profit] = -4.8M', () => {
    const candidate = {
        methodId: 'dedupEdge75Hold70',
        category: 'pool7',
        numbers: Array.from({ length: 30 }, (_, i) => i),
        vipNumbers: [],
        backupNumbers: Array.from({ length: 30 }, (_, i) => i),
        stakeK: 30000
    };
    const quant = service.evaluateCandidateQuantMetrics(candidate, { observations: 0, wins: 0, vipWins: 0 });
    assert.equal(quant.probUnion, 0.30, 'Prior on 30 numbers must be 30 / 100 = 0.30');
    // EV = 0.30 * 84,000 - 30,000 = 25,200 - 30,000 = -4,800K (-4.8M)
    assert.equal(quant.expectedProfitK, -4800, 'Prior EV on 30 numbers must be -4,800K VND');
    assert.equal(quant.isEligibleForTop, false, '0-observation candidate must not be eligible for top');
});

runTest('7.2: Bug 1 Observation Eligibility: Zero-observation candidate barred from #1 rank', () => {
    const elite = {
        methodId: 'adaptiveDualMerge',
        category: 'elite',
        numbers: Array.from({ length: 33 }, (_, i) => i),
        vipNumbers: Array.from({ length: 20 }, (_, i) => i),
        backupNumbers: Array.from({ length: 13 }, (_, i) => i + 20),
        stakeK: 73000
    };
    const zeroObsPool7 = {
        methodId: 'dedupEdge75Hold70',
        category: 'pool7',
        numbers: Array.from({ length: 30 }, (_, i) => i),
        vipNumbers: [],
        backupNumbers: Array.from({ length: 30 }, (_, i) => i),
        stakeK: 30000
    };
    const priorStatsMap = {
        adaptiveDualMerge: { observations: 100, wins: 52, vipWins: 26 }
    };
    const gate = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates: [zeroObsPool7, elite],
        priorStatsMap
    });
    assert.equal(gate.selectedMethodId, 'adaptiveDualMerge', 'Elite with 100 obs must be selected over 0-obs candidate');
    assert.equal(gate.action, 'BET', 'Action must be BET');
});

runTest('7.3: Bug 2 Disaster Floor Gate: Wilson 90% below 75% break-even triggers disaster halt on trials >= 20', () => {
    const collapsingElite = {
        methodId: 'collapsingMethod',
        category: 'elite',
        numbers: Array.from({ length: 43 }, (_, i) => i),
        vipNumbers: Array.from({ length: 17 }, (_, i) => i),
        backupNumbers: Array.from({ length: 26 }, (_, i) => i + 17),
        stakeK: 77000
    };
    // Severe draw down: 5 wins out of 30 trials (16.7% win rate, far below break even 46%)
    const priorStatsMap = {
        collapsingMethod: { observations: 30, wins: 5, vipWins: 1 }
    };
    const gate = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates: [collapsingElite],
        priorStatsMap
    });
    assert.equal(gate.action, 'ABSTAIN', 'Collapsing method must trigger Disaster Floor Gate');
    assert.ok(gate.abstainGate.triggeredConditions.includes('COND_2_WILSON_BELOW_BREAK_EVEN'));
});

runTest('7.4: Bug 2 Wilson 90% One-Sided z=1.28155 calibration aligns with dailyMethodAdvisorService', () => {
    assert.ok(Math.abs(service.DEFAULT_CONFIG.Z_SCORE - 1.2815515655446004) < 1e-6);
    assert.ok(Math.abs(service.DEFAULT_CONFIG.Z_90 - 1.2815515655446004) < 1e-6);
    const w90 = service.computeWilsonScore95(50, 100, service.DEFAULT_CONFIG.Z_SCORE);
    // At p=0.50, n=100, z=1.28155, Wilson lower bound is ~43.7%
    assert.ok(w90 > 0.43 && w90 < 0.45);
});

runTest('7.5: Bug 3 Universal Multi-Schema Ledger Row Extractor: Mathematical Partition Conservation', () => {
    const rawVipRow = { actual: 12, vipNumbers: [12, 34], backupNumbers: [56, 78], stakeK: 77000, payoutK: 252000 };
    const rawBackupRow = { actual: 56, vipNumbers: [12, 34], backupNumbers: [56, 78], stakeK: 77000, payoutK: 84000 };
    const rawMissRow = { actual: 99, vipNumbers: [12, 34], backupNumbers: [56, 78], stakeK: 77000, payoutK: 0 };

    const infoVip = service.extractLedgerRowInfo(rawVipRow);
    const infoBackup = service.extractLedgerRowInfo(rawBackupRow);
    const infoMiss = service.extractLedgerRowInfo(rawMissRow);

    assert.equal(infoVip.isVipHit, true);
    assert.equal(infoVip.isBackupHit, false);
    assert.equal(infoVip.isHit, true);

    assert.equal(infoBackup.isVipHit, false);
    assert.equal(infoBackup.isBackupHit, true);
    assert.equal(infoBackup.isHit, true);

    assert.equal(infoMiss.isVipHit, false);
    assert.equal(infoMiss.isBackupHit, false);
    assert.equal(infoMiss.isHit, false);
});

runTest('7.6: Bug 3 pentaCoreDe VIP hits recovery: detects 60 VIP hits from vipNumbers and actual special', () => {
    const cachePath = path.resolve(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
    if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        const pentaLedger = cache.pentaCoreDe?.settledLedger || [];
        const serviceRows = pentaLedger.map(r => service.extractLedgerRowInfo(r));
        const vipHits = serviceRows.filter(r => r && r.isVipHit).length;
        assert.ok(vipHits >= 57, `Expected at least 57 VIP hits, found ${vipHits}`);
    }
});

// ============================================================================
// FINAL SUMMARY
// ============================================================================
console.log('\n================================================================================');
console.log(`  TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
console.log('================================================================================');

if (failedTests > 0) {
    console.error(`\n❌ TEST SUITE FAILED WITH ${failedTests} FAILURES.\n`);
    process.exit(1);
} else {
    console.log('\n✅ ALL DYNAMIC ĐỀ ENGINE SELECTOR UNIT TESTS PASSED WITH 100% SUCCESS.\n');
    process.exit(0);
}
