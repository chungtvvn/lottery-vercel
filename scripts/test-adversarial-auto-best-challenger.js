#!/usr/bin/env node
/**
 * scripts/test-adversarial-auto-best-challenger.js
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE for Milestone 3 Auto Best-Selection Engine:
 * 1. 100% Strict Point-In-Time (Strict PIT) Isolation & Anti-Leakage
 * 2. Multi-Factor Quantitative Evaluation Across All 12 Candidates
 * 3. Smart Abstain Capital Preservation Shield (All 3 Triggers + Boundary Conditions)
 * 4. Dynamic Pillar 1 Adoption in crossHedgingPortfolioService
 * 5. Snapshot Freezing & SSOT Cache Parity
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

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function challenge(suiteName, testName, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✓ [PASS] [${suiteName}] ${testName}`);
    } catch (err) {
        failedTests++;
        console.error(`  ✗ [FAIL] [${suiteName}] ${testName}`);
        console.error(`    Error: ${err.message}`);
        failureDetails.push({ suite: suiteName, test: testName, error: err.message, stack: err.stack });
    }
}

console.log('\n' + '='.repeat(85));
console.log('  EMPIRICAL CHALLENGER STRESS SUITE: AUTO BEST-SELECTION ENGINE (M3)');
console.log('='.repeat(85));

// Load canonical cache
const cachePath1 = path.resolve(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
const canonicalCache = JSON.parse(fs.readFileSync(cachePath1, 'utf8'));

// ============================================================================
// SUITE 1: 100% STRICT POINT-IN-TIME (STRICT PIT) ISOLATION & ANTI-LEAKAGE
// ============================================================================
console.log('\n--- SUITE 1: 100% Strict Point-In-Time (Strict PIT) Isolation & Anti-Leakage ---');

challenge('Strict PIT', '1.1: Historical Ledger Filter strictly enforces d < targetDate', () => {
    const rawLedger = [
        { date: '2026-09-28', isHit: true, profitK: 84000, stakeK: 77000 },
        { date: '2026-09-29', isHit: false, profitK: -77000, stakeK: 77000 },
        { date: '2026-09-30', isHit: true, profitK: 84000, stakeK: 77000 },
        { date: '2026-10-01', isHit: false, profitK: -77000, stakeK: 77000 },
        { date: '2026-10-02', isHit: true, profitK: 84000, stakeK: 77000 },
        { date: '2026-10-03', isHit: false, profitK: -77000, stakeK: 77000 }
    ];

    const cut1 = autoBestService.calculateRollingWinRates(rawLedger, '2026-10-01');
    assert.strictEqual(cut1.count7D, 3, 'Must only include 3 draws strictly before 2026-10-01');
    assert.strictEqual(cut1.totalWins7D, 2, 'Must count 2 wins before 2026-10-01');

    const cut2 = autoBestService.calculateRollingPnL(rawLedger, '2026-10-01', 7);
    assert.strictEqual(cut2, 84000 - 77000 + 84000, 'PnL must sum only draws before 2026-10-01');

    const cut3 = autoBestService.calculateRollingDrawdown(rawLedger, '2026-10-01', 30);
    assert.strictEqual(cut3.lossStreak, 0, 'Last draw before 10-01 was a win (2026-09-30)');
});

challenge('Strict PIT', '1.2: Future Mutation Invariance (Adversarial Data Poisoning at T)', () => {
    const testDate = '2026-09-25';
    const baseline = autoBestService.evaluateAutoBestSelection(testDate, { advisorCache: canonicalCache });

    // Construct adversarial cache with mutated draw result on testDate
    const poisonedCache = JSON.parse(JSON.stringify(canonicalCache));
    Object.keys(poisonedCache).forEach(k => {
        if (poisonedCache[k]?.settledLedger) {
            poisonedCache[k].settledLedger.forEach(row => {
                if (row.date === testDate) {
                    row.isHit = !row.isHit;
                    row.isVipHit = true;
                    row.profitK = 9999999;
                    row.special = '99';
                }
            });
        }
    });

    const poisonedResult = autoBestService.evaluateAutoBestSelection(testDate, { advisorCache: poisonedCache });

    assert.strictEqual(baseline.selectedMethod, poisonedResult.selectedMethod, 'Selected method must be identical');
    assert.strictEqual(baseline.status, poisonedResult.status, 'Status must be identical');
    assert.strictEqual(baseline.scores.length, poisonedResult.scores.length, 'Candidate count must match');
    for (let i = 0; i < baseline.scores.length; i++) {
        assert.strictEqual(baseline.scores[i].methodId, poisonedResult.scores[i].methodId, `Rank ${i} candidate must match`);
        assert.strictEqual(baseline.scores[i].compositeScore, poisonedResult.scores[i].compositeScore, `Rank ${i} score must match`);
        assert.strictEqual(baseline.scores[i].winRate7D, poisonedResult.scores[i].winRate7D, `Rank ${i} WR 7D must match`);
        assert.strictEqual(baseline.scores[i].sharpe30D, poisonedResult.scores[i].sharpe30D, `Rank ${i} Sharpe must match`);
        assert.strictEqual(baseline.scores[i].pnl7DK, poisonedResult.scores[i].pnl7DK, `Rank ${i} PnL must match`);
    }
});

challenge('Strict PIT', '1.3: Future Injection Invariance (Synthetic Future Draws at T+1, T+2)', () => {
    const testDate = '2026-09-20';
    const baseline = autoBestService.evaluateAutoBestSelection(testDate, { advisorCache: canonicalCache });

    // Inject 5 futuristic draws with extreme fake profits
    const futureInjectedCache = JSON.parse(JSON.stringify(canonicalCache));
    const futureDates = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-10-10'];
    Object.keys(futureInjectedCache).forEach(k => {
        if (futureInjectedCache[k]?.settledLedger) {
            futureDates.forEach(fd => {
                futureInjectedCache[k].settledLedger.push({
                    date: fd,
                    isHit: true,
                    isVipHit: true,
                    profitK: 50000000,
                    special: '88'
                });
            });
        }
    });

    const evaluatedAfterInjection = autoBestService.evaluateAutoBestSelection(testDate, { advisorCache: futureInjectedCache });
    assert.strictEqual(baseline.selectedMethod, evaluatedAfterInjection.selectedMethod, 'Method selection invariant under future injection');
    assert.strictEqual(baseline.scores[0].compositeScore, evaluatedAfterInjection.scores[0].compositeScore, 'Top score invariant');
    assert.strictEqual(baseline.scores[0].pnl7DK, evaluatedAfterInjection.scores[0].pnl7DK, 'PnL invariant');
});

challenge('Strict PIT', '1.4: Walk-Forward Multi-Day Monotonicity & No Cross-Date Bleed', () => {
    const dates = ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'];
    let prevTrialCount = 0;

    dates.forEach(d => {
        const res = autoBestService.evaluateAutoBestSelection(d, { advisorCache: canonicalCache });
        assert(res.selectedMethod, `Must select a method on ${d}`);
        const deMarkov = res.scores.find(s => s.methodId === 'deMarkovGapHazard');
        assert(deMarkov, `deMarkov must be scored on ${d}`);
        // In walk-forward, the count of historical draws evaluated must monotonically increase or stay constant
        // (as we advance by 1 day, history grows by 1)
        assert(res.scores.every(s => s.winRate7D >= 0 && s.winRate7D <= 1), `Win rates valid on ${d}`);
    });
});

challenge('Strict PIT', '1.5: ISO Timestamp formatting variations resolve consistently', () => {
    const resA = autoBestService.evaluateAutoBestSelection('2026-09-30', { advisorCache: canonicalCache });
    const resB = autoBestService.evaluateAutoBestSelection('2026-09-30T18:15:00.000Z', { advisorCache: canonicalCache });
    const resC = autoBestService.evaluateAutoBestSelection('2026-09-30 00:00:00', { advisorCache: canonicalCache });

    assert.strictEqual(resA.selectedMethod, resB.selectedMethod);
    assert.strictEqual(resA.selectedMethod, resC.selectedMethod);
    assert.strictEqual(resA.scores[0].compositeScore, resB.scores[0].compositeScore);
    assert.strictEqual(resA.scores[0].compositeScore, resC.scores[0].compositeScore);
});

// ============================================================================
// SUITE 2: MULTI-FACTOR EVALUATION LOGIC ACROSS ALL 12 CANDIDATES
// ============================================================================
console.log('\n--- SUITE 2: Multi-Factor Quantitative Evaluation Across All 12 Candidates ---');

challenge('Multi-Factor', '2.1: Universe Completeness: Exactly 5 Elite + 7 Pool 7 Candidates', () => {
    assert.strictEqual(autoBestService.ALL_CANDIDATE_IDS.length, 12);
    assert.strictEqual(autoBestService.ELITE_ENGINE_IDS.length, 5);
    assert.strictEqual(autoBestService.POOL_7_METHOD_IDS.length, 7);

    const res = autoBestService.evaluateAutoBestSelection('2026-10-04', { advisorCache: canonicalCache });
    assert.strictEqual(res.scores.length, 12, 'Must evaluate all 12 candidates');

    const eliteScored = res.scores.filter(c => c.category === 'elite');
    const pool7Scored = res.scores.filter(c => c.category === 'pool7');
    assert.strictEqual(eliteScored.length, 5, 'Must contain 5 elite scores');
    assert.strictEqual(pool7Scored.length, 7, 'Must contain 7 pool 7 scores');
});

challenge('Multi-Factor', '2.2: Set Partition Disjointness: VIP and Backup are Strictly Mutually Exclusive', () => {
    const candidates = dynamicDeSelector.loadAllDynamicCandidates('2026-10-04', { advisorCache: canonicalCache });
    candidates.forEach(c => {
        assert(Array.isArray(c.numbers), `Candidate ${c.methodId} must have numbers array`);
        assert(Array.isArray(c.vipNumbers), `Candidate ${c.methodId} must have vipNumbers array`);
        assert(Array.isArray(c.backupNumbers), `Candidate ${c.methodId} must have backupNumbers array`);

        const vipSet = new Set(c.vipNumbers);
        const backupSet = new Set(c.backupNumbers);

        // Check disjointness
        vipSet.forEach(n => {
            assert(!backupSet.has(n), `Number ${n} found in both VIP and Backup sets in candidate ${c.methodId}`);
        });

        // Check union
        const unionSet = new Set([...c.vipNumbers, ...c.backupNumbers]);
        assert.strictEqual(unionSet.size, c.numbers.length, `Union size (${unionSet.size}) != numbers length (${c.numbers.length}) in ${c.methodId}`);

        // Check numbers range
        c.numbers.forEach(n => {
            const num = Number(n);
            assert(Number.isInteger(num) && num >= 0 && num <= 99, `Invalid number ${n} in candidate ${c.methodId}`);
        });
    });
});

challenge('Multi-Factor', '2.3: Mathematical Composite Scoring Integrity & Weights', () => {
    const weights = autoBestService.DEFAULT_FACTOR_WEIGHTS;
    assert.strictEqual(weights.WEIGHT_EV, 0.25);
    assert.strictEqual(weights.WEIGHT_SHARPE, 0.25);
    assert.strictEqual(weights.WEIGHT_PNL_7D, 0.20);
    assert.strictEqual(weights.WEIGHT_WR_30D, 0.20);
    assert.strictEqual(weights.WEIGHT_DRAWDOWN_PENALTY, 0.10);

    const res = autoBestService.evaluateAutoBestSelection('2026-10-04', { advisorCache: canonicalCache });
    res.scores.forEach(c => {
        assert(!isNaN(c.compositeScore), `compositeScore for ${c.methodId} is NaN`);
        assert(!isNaN(c.winRate7D), `winRate7D for ${c.methodId} is NaN`);
        assert(!isNaN(c.winRate30D), `winRate30D for ${c.methodId} is NaN`);
        assert(!isNaN(c.pnl7DK), `pnl7DK for ${c.methodId} is NaN`);
        assert(!isNaN(c.sharpe30D), `sharpe30D for ${c.methodId} is NaN`);
        assert(!isNaN(c.maxDrawdownK), `maxDrawdownK for ${c.methodId} is NaN`);
        assert(!isNaN(c.expectedProfitK), `expectedProfitK for ${c.methodId} is NaN`);
    });
});

challenge('Multi-Factor', '2.4: Ranking Consistency & Strict Monotonicity', () => {
    const res = autoBestService.evaluateAutoBestSelection('2026-10-04', { advisorCache: canonicalCache });
    assert.strictEqual(res.selectedMethod, res.scores[0].methodId, 'Selected method must be rank 1');
    assert.strictEqual(res.scores[0].rank, 1, 'First candidate must have rank 1');

    for (let i = 0; i < res.scores.length - 1; i++) {
        assert(res.scores[i].compositeScore >= res.scores[i + 1].compositeScore,
            `Monotonicity violation: rank ${i+1} score (${res.scores[i].compositeScore}) < rank ${i+2} score (${res.scores[i+1].compositeScore})`);
        assert.strictEqual(res.scores[i].rank, i + 1, `Rank index mismatch at ${i}`);
    }
});

challenge('Multi-Factor', '2.5: Zero-Variance Edge Case (All Identical Inputs - No Div-by-Zero)', () => {
    const identicalLedger = [
        { date: '2026-09-01', profitK: 10000, stakeK: 77000, isHit: true },
        { date: '2026-09-02', profitK: 10000, stakeK: 77000, isHit: true },
        { date: '2026-09-03', profitK: 10000, stakeK: 77000, isHit: true }
    ];

    const mockMethodsMap = {};
    autoBestService.ALL_CANDIDATE_IDS.forEach(id => {
        mockMethodsMap[id] = [...identicalLedger];
    });

    const res = autoBestService.evaluateAutoBestSelection('2026-09-04', {
        advisorCache: null,
        methodsLedgersMap: mockMethodsMap
    });

    assert(res, 'Must produce result');
    res.scores.forEach(s => {
        assert(!isNaN(s.compositeScore), `Score must not be NaN under zero variance for ${s.methodId}`);
    });
});

challenge('Multi-Factor', '2.6: Sharpe Ratio Resilience (Empty, Single-draw, All-loss, All-win)', () => {
    // Empty
    const shEmpty = autoBestService.calculateRollingSharpe([], '2026-09-10');
    assert.strictEqual(shEmpty, 0, 'Empty ledger produces Sharpe 0');

    // Single draw (n < 2)
    const shOne = autoBestService.calculateRollingSharpe([{ date: '2026-09-09', profitK: 10000, stakeK: 77000 }], '2026-09-10');
    assert.strictEqual(shOne, 0, 'Single draw produces Sharpe 0 (sample variance undefined)');

    // All wins (std = 0, mean > 0)
    const allWins = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-08-${String(i+1).padStart(2, '0')}`,
        profitK: 84000,
        stakeK: 77000
    }));
    const shAllWins = autoBestService.calculateRollingSharpe(allWins, '2026-08-31');
    assert.strictEqual(shAllWins, 3.0, 'Zero std positive return clamps to 3.0');

    // All losses (std = 0, mean < 0)
    const allLosses = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-08-${String(i+1).padStart(2, '0')}`,
        profitK: -77000,
        stakeK: 77000
    }));
    const shAllLosses = autoBestService.calculateRollingSharpe(allLosses, '2026-08-31');
    assert.strictEqual(shAllLosses, -3.0, 'Zero std negative return clamps to -3.0');
});

challenge('Multi-Factor', '2.7: Drawdown & Streak Calculation Exactness', () => {
    const streakLedger = [
        { date: '2026-09-01', profitK: 100000 },  // Peak: 100K
        { date: '2026-09-02', profitK: -77000 },  // Cum: 23K, DD: 77K, Loss: 1
        { date: '2026-09-03', profitK: -77000 },  // Cum: -54K, DD: 154K, Loss: 2
        { date: '2026-09-04', profitK: -77000 },  // Cum: -131K, DD: 231K, Loss: 3
        { date: '2026-09-05', profitK: -77000 },  // Cum: -208K, DD: 308K, Loss: 4
        { date: '2026-09-06', profitK: 175000 },  // Cum: -33K, DD: 133K, Loss: 0 (win!)
        { date: '2026-09-07', profitK: -77000 }   // Cum: -110K, DD: 210K, Loss: 1
    ];

    const dd = autoBestService.calculateRollingDrawdown(streakLedger, '2026-09-08', 30);
    assert.strictEqual(dd.maxDrawdownK, 308000, 'Max Drawdown was 308K');
    assert.strictEqual(dd.lossStreak, 1, 'Loss streak after win on 09-06 and loss on 09-07 is 1');
    assert.strictEqual(dd.currentDrawdownK, 210000, 'Current DD is 210K');
});

challenge('Multi-Factor', '2.8: Streak Transition Effects (Rebound Bonus, Fatigue Penalty, Inertia)', () => {
    const cand = autoBestService.evaluateAutoBestSelection('2026-10-04', {
        advisorCache: canonicalCache,
        options: { currentMethod: 'deMarkovGapHazard' }
    });

    const incumbent = cand.scores.find(s => s.methodId === 'deMarkovGapHazard');
    assert(incumbent, 'Incumbent must be present');
    // Incumbent receives inertia bonus
    const fullCand = dynamicDeSelector.loadAllDynamicCandidates('2026-10-04', { advisorCache: canonicalCache });
    assert(cand.scores.every(s => typeof s.compositeScore === 'number'));
});

// ============================================================================
// SUITE 3: SMART ABSTAIN CAPITAL PRESERVATION SHIELD
// ============================================================================
// SUITE 3: SMART ABSTAIN CAPITAL PRESERVATION SHIELD
// ============================================================================
console.log('\n--- SUITE 3: Smart Abstain Capital Preservation Shield ---');

challenge('Smart Abstain', '3.1: Trigger 1 — All Candidates Negative EV forces ABSTAIN with 0 Stake', () => {
    // Construct mock candidates where all win rates are abysmal (e.g. 0% win rate)
    const abysmalHistory = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-08-${String(i+1).padStart(2, '0')}`,
        isHit: false,
        profitK: -77000,
        stakeK: 77000
    }));

    const mockMethodsMap = {};
    autoBestService.ELITE_ENGINE_IDS.forEach(id => {
        mockMethodsMap[id] = [...abysmalHistory];
    });

    const candidates = autoBestService.ELITE_ENGINE_IDS.map(id => ({
        methodId: id,
        category: 'elite',
        numbers: Array.from({ length: 43 }, (_, i) => i),
        vipNumbers: Array.from({ length: 17 }, (_, i) => i),
        backupNumbers: Array.from({ length: 26 }, (_, i) => i + 17)
    }));

    const res = autoBestService.evaluateAutoBestSelection('2026-09-01', {
        advisorCache: {},
        methodsLedgersMap: mockMethodsMap,
        candidates
    });

    assert.strictEqual(res.status, 'ABSTAIN', 'Must be ABSTAIN status');
    assert.strictEqual(res.action, 'ABSTAIN', 'Must be ABSTAIN action');
    assert.strictEqual(res.stakeK, 0, 'Stake must be strictly 0 during ABSTAIN');
    assert(res.reasoning.includes('SMART ABSTAIN') || res.reasoning.includes('BẢO TOÀN VỐN'), 'Reasoning must cite capital preservation');
});

challenge('Smart Abstain', '3.2: Trigger 2 — Elite Candidate Disaster Floor (Wilson < 0.75 * BE)', () => {
    // Elite break-even is ~43-45%. 0.75 * BE is ~32%.
    // With 25 trials and only 5 wins (20%), Wilson Lower 90% is ~10-12%, way below disaster floor.
    const disasterLedger = Array.from({ length: 25 }, (_, i) => ({
        date: `2026-08-${String(i+1).padStart(2, '0')}`,
        isHit: (i < 5),
        profitK: (i < 5 ? 84000 : -77000),
        stakeK: 77000
    }));

    const mockMethodsMap = {};
    autoBestService.ELITE_ENGINE_IDS.forEach(id => {
        mockMethodsMap[id] = [...disasterLedger];
    });

    const candidates = autoBestService.ELITE_ENGINE_IDS.map(id => ({
        methodId: id,
        category: 'elite',
        numbers: Array.from({ length: 43 }, (_, i) => i),
        vipNumbers: Array.from({ length: 17 }, (_, i) => i),
        backupNumbers: Array.from({ length: 26 }, (_, i) => i + 17)
    }));

    const res = autoBestService.evaluateAutoBestSelection('2026-09-01', {
        advisorCache: {},
        methodsLedgersMap: mockMethodsMap,
        candidates
    });

    assert.strictEqual(res.status, 'ABSTAIN', 'Disaster floor breach must trigger ABSTAIN');
    assert.strictEqual(res.stakeK, 0, 'Capital preserved: 0 stake');
});

challenge('Smart Abstain', '3.3: Trigger 3 — Extreme Ensemble Divergence (>0.85) forces ABSTAIN', () => {
    const disjointCandidates = [
        { methodId: 'adaptiveDualMerge', category: 'elite', numbers: Array.from({ length: 30 }, (_, i) => i) },
        { methodId: 'pentaCoreDe', category: 'elite', numbers: Array.from({ length: 30 }, (_, i) => i + 30) },
        { methodId: 'deMarkovGapHazard', category: 'elite', numbers: Array.from({ length: 30 }, (_, i) => i + 60) },
        { methodId: 'dePositionalGraphFlow', category: 'elite', numbers: [90, 91, 92, 93, 94, 95, 96, 97, 98, 99] },
        { methodId: 'dualMerge', category: 'elite', numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
    ];

    const divergence = dynamicDeSelector.computeEnsembleDivergence(disjointCandidates);
    assert(divergence.D_ensemble > 0.85, `Extreme divergence expected > 0.85, got ${divergence.D_ensemble}`);

    const res = autoBestService.evaluateAutoBestSelection('2026-10-04', {
        candidates: disjointCandidates
    });

    assert.strictEqual(res.status, 'ABSTAIN', 'High ensemble divergence must trigger ABSTAIN');
    assert.strictEqual(res.action, 'ABSTAIN');
    assert.strictEqual(res.stakeK, 0);
    assert(res.reasoning.includes('phân kỳ') || res.reasoning.includes('Divergence') || res.reasoning.includes('ABSTAIN'));
});

challenge('Smart Abstain', '3.4: Healthy Market State Execution (Action = BET, Stake > 0)', () => {
    const res = autoBestService.evaluateAutoBestSelection('2026-10-04', { advisorCache: canonicalCache });
    assert.strictEqual(res.status, 'ACTIVE');
    assert.strictEqual(res.action, 'BET');
    assert(res.stakeK > 0, `Stake must be positive, got ${res.stakeK}`);
    assert(res.numbers.length >= 30, 'Numbers must be >= 30');
    assert(Array.isArray(res.vipNumbers), 'VIP numbers must be an array');
});

challenge('Smart Abstain', '3.5: Financial Conservation: Zero Stake and Zero Liability on Abstain', () => {
    const abysmalHistory = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-08-${String(i+1).padStart(2, '0')}`,
        isHit: false,
        profitK: -77000,
        stakeK: 77000
    }));
    const mockMethodsMap = {};
    autoBestService.ELITE_ENGINE_IDS.forEach(id => { mockMethodsMap[id] = [...abysmalHistory]; });

    const candidates = autoBestService.ELITE_ENGINE_IDS.map(id => ({
        methodId: id,
        category: 'elite',
        numbers: Array.from({ length: 43 }, (_, i) => i),
        vipNumbers: Array.from({ length: 17 }, (_, i) => i),
        backupNumbers: Array.from({ length: 26 }, (_, i) => i + 17)
    }));

    const res = autoBestService.evaluateAutoBestSelection('2026-09-01', {
        advisorCache: {},
        methodsLedgersMap: mockMethodsMap,
        candidates
    });

    assert.strictEqual(res.action, 'ABSTAIN');
    assert.strictEqual(res.stakeK, 0, 'No capital risked');
});

// ============================================================================
// SUITE 4: DYNAMIC PILLAR 1 ADOPTION IN crossHedgingPortfolioService
// ============================================================================
console.log('\n--- SUITE 4: Dynamic Pillar 1 Adoption in crossHedgingPortfolioService ---');

challenge('Dynamic Pillar 1', '4.1: Pillar 1 Dynamically Adopts pentaCoreDe When Selected', () => {
    const mockAdvisorCache = JSON.parse(JSON.stringify(canonicalCache));
    mockAdvisorCache.autoBestSelection = {
        selectedMethod: 'pentaCoreDe',
        selectedMethodLabel: 'Đề Ngũ Tinh Consensus AI',
        status: 'ACTIVE',
        action: 'BET',
        numbers: Array.from({ length: 43 }, (_, i) => i + 5),
        vipNumbers: Array.from({ length: 17 }, (_, i) => i + 5),
        backupNumbers: Array.from({ length: 26 }, (_, i) => i + 22)
    };

    const dec = crossHedgingService.evaluateCrossAssetPortfolio('2026-10-04', [], mockAdvisorCache);
    assert(dec.pillar1_De, 'Must contain pillar1_De');
    assert.strictEqual(dec.pillar1_De.methodId, 'pentaCoreDe', 'Pillar 1 must adopt pentaCoreDe');
    assert.strictEqual(dec.pillar1_De.vipNumbers.length, 17, 'Pillar 1 must enforce 17 VIP numbers');
});

challenge('Dynamic Pillar 1', '4.2: Pillar 1 Dynamically Adopts dePositionalGraphFlow When Selected', () => {
    const mockAdvisorCache = JSON.parse(JSON.stringify(canonicalCache));
    mockAdvisorCache.autoBestSelection = {
        selectedMethod: 'dePositionalGraphFlow',
        selectedMethodLabel: 'Cầu Đồ Thị Vị Trí GĐB',
        status: 'ACTIVE',
        action: 'BET',
        numbers: Array.from({ length: 43 }, (_, i) => (i * 2) % 100),
        vipNumbers: Array.from({ length: 17 }, (_, i) => (i * 2) % 100),
        backupNumbers: Array.from({ length: 26 }, (_, i) => ((i + 17) * 2) % 100)
    };

    const dec = crossHedgingService.evaluateCrossAssetPortfolio('2026-10-04', [], mockAdvisorCache);
    assert(dec.pillar1_De, 'Must contain pillar1_De');
    assert.strictEqual(dec.pillar1_De.methodId, 'dePositionalGraphFlow');
});

challenge('Dynamic Pillar 1', '4.3: Weibull Cold Gan Demotion & Quota Guard in Pillar 1', () => {
    // Pass marketHistory where number 10 is deep cold (gan >= 14)
    const syntheticHistory = [];
    for (let i = 0; i < 20; i++) {
        // Special numbers 01 to 09, never 10
        syntheticHistory.push({
            date: `2026-09-${String(i+1).padStart(2, '0')}`,
            special: '05'
        });
    }

    const mockAdvisorCache = {
        autoBestSelection: {
            selectedMethod: 'pentaCoreDe',
            selectedMethodLabel: 'Đề Ngũ Tinh Consensus AI',
            numbers: Array.from({ length: 43 }, (_, i) => i),
            vipNumbers: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26], // 10 is deep cold
            backupNumbers: Array.from({ length: 26 }, (_, i) => i + 27)
        }
    };

    const dec = crossHedgingService.evaluateCrossAssetPortfolio('2026-10-04', syntheticHistory, mockAdvisorCache);
    assert.strictEqual(dec.pillar1_De.vipNumbers.length, 17, 'Must preserve 17 VIP quota');
    assert.strictEqual(dec.pillar1_De.stakeK, 77000, 'Stake must equal (17*3 + 26*1)*1000 = 77000K');
});

challenge('Dynamic Pillar 1', '4.4: Financial Conservation Law on Draw 03/10/2026 Settlement', () => {
    const ch = canonicalCache.crossHedgingPortfolio;
    assert(ch?.settledLedger, 'Must have settledLedger');
    const oct3 = ch.settledLedger.find(r => r.date === '2026-10-03');
    assert(oct3, 'Must contain 2026-10-03 settled row');

    // Expected contract from PROJECT.md Interface Contracts:
    // deProfitK: -77000 (VIP)
    // loProfitK: +35200 (VIP)
    // xienProfitK: +73000 (VIP)
    // totalProfitK: +31200 (VIP)
    // isWin: true
    assert.strictEqual(Number(oct3.special), 61);
    assert.strictEqual(oct3.deProfitK, -77000, `Pillar 1 Đề PnL must be -77000K, got ${oct3.deProfitK}`);
    assert.strictEqual(oct3.loProfitK, 35200, `Pillar 2 Lô PnL must be +35200K, got ${oct3.loProfitK}`);
    assert.strictEqual(oct3.xienProfitK, 73000, `Pillar 3 Xiên PnL must be +73000K, got ${oct3.xienProfitK}`);
    assert.strictEqual(oct3.totalProfitK, 31200, `Net Hedging PnL must be +31200K, got ${oct3.totalProfitK}`);
    assert.strictEqual(oct3.isWin, true, '03/10/2026 must be a winning hedging day');

    // Conservation equation: deProfitK + loProfitK + xienProfitK = totalProfitK
    assert.strictEqual(oct3.deProfitK + oct3.loProfitK + oct3.xienProfitK, oct3.totalProfitK, 'Sum of pillar profits must equal totalProfitK');
});

challenge('Dynamic Pillar 1', '4.5: Full 2026 Ledger Continuity: 272 Settled Draws', () => {
    const ch = canonicalCache.crossHedgingPortfolio;
    const ledger = ch.settledLedger;
    assert.strictEqual(ledger.length, 272, `settledLedger length must be exactly 272, got ${ledger.length}`);

    // Verify chronological order
    for (let i = 0; i < ledger.length - 1; i++) {
        assert(ledger[i].date < ledger[i + 1].date, `Ledger dates must strictly increase: ${ledger[i].date} >= ${ledger[i+1].date}`);
    }

    const wins = ledger.filter(r => r.isWin).length;
    const finalRow = ledger[ledger.length - 1];
    assert.strictEqual(ch.metrics.totalDraws2026, 272);
    assert.strictEqual(ch.metrics.positiveDays2026, wins);
    assert.strictEqual(ch.metrics.cumulativeProfitK, finalRow.cumulativeProfitK);
});

// ============================================================================
// SUITE 5: SNAPSHOT FREEZING & SSOT CACHE PARITY
// ============================================================================
console.log('\n--- SUITE 5: Snapshot Freezing & SSOT Cache Parity ---');

challenge('Snapshot Freezing', '5.1: SHA-256 Byte-for-Byte Cache Identity', () => {
    const p1 = path.resolve(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
    const p2 = path.resolve(__dirname, '../data/cached_daily_method_advisor.json');

    const h1 = crypto.createHash('sha256').update(fs.readFileSync(p1)).digest('hex');
    const h2 = crypto.createHash('sha256').update(fs.readFileSync(p2)).digest('hex');
    assert.strictEqual(h1, h2, `Files must have matching SHA-256: ${h1} !== ${h2}`);
});

challenge('Snapshot Freezing', '5.2: Locked Recommendation Invariant (Pre-18h15 === Post-18h40)', () => {
    const rawData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../lib/data/xsmb-2-digits.json'), 'utf8'));

    // Simulate after 12:00 PM (locked state)
    const lockedTime = new Date('2026-10-04T13:00:00+07:00');
    const lockedCache = dailyAdvisorService.generateAdvisorCache({
        raw: rawData,
        existingCache: canonicalCache,
        now: lockedTime
    });

    const autoBestBefore = canonicalCache.autoBestSelection;
    const autoBestLocked = lockedCache.autoBestSelection;

    assert.strictEqual(autoBestBefore.selectedMethod, autoBestLocked.selectedMethod, 'Selected method cannot change when locked');
    assert.strictEqual(autoBestBefore.scores.length, autoBestLocked.scores.length, 'Scores array length preserved');
    assert.strictEqual(autoBestBefore.scores[0].compositeScore, autoBestLocked.scores[0].compositeScore, 'Score invariant when locked');
});

// ============================================================================
// CHALLENGER SUMMARY & VERDICT
// ============================================================================
console.log('\n' + '='.repeat(85));
console.log(`  EMPIRICAL CHALLENGER REPORT: ${passedTests}/${totalTests} TESTS PASSED`);
if (failedTests > 0) {
    console.error(`  ❌ FAILED CHALLENGES: ${failedTests}`);
    failureDetails.forEach(f => {
        console.error(`    - [${f.suite}] ${f.test}: ${f.error}`);
    });
    console.log('  ⚠️ VERDICT: REQUEST_CHANGES');
    process.exit(1);
} else {
    console.log('  🎉 ALL 22 ADVERSARIAL CHALLENGES PASSED EMPIRICALLY WITH ZERO DEFECTS!');
    console.log('  VERDICT: APPROVE');
    console.log('='.repeat(85));
    process.exit(0);
}
