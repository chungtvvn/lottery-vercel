#!/usr/bin/env node
/**
 * scripts/test-adversarial-challenger-m1-2.js
 *
 * Empirical Adversarial Test Harness for Challenger M1-2:
 * Edge Case, Anti-Churning, Streak Transitions, and Hysteresis Verification
 *
 * Modules under test:
 * - Anticipatory Router (Streak transitions L4+..W3+, Fatigue penalties, Rebound bonuses)
 * - Proactive Rebound Swap (activation conditions, dominance margin, threshold gating)
 * - Anti-Churning Significance Guard (Z-score test, delta Wilson, inertia damping)
 * - Schmitt-Trigger Hysteresis (BET/ABSTAIN whipsaw prevention across EV, Wilson, and Divergence)
 * - PnL Conservation & Edge Cases
 */

'use strict';

const assert = require('assert');
const path = require('path');
const service = require('../lib/services/dynamicDeSelectorService');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failures = [];

function check(title, fn) {
    totalChecks++;
    try {
        fn();
        passedChecks++;
        console.log(`  ✓ [PASS] ${title}`);
    } catch (err) {
        failedChecks++;
        failures.push({ title, error: err.message, stack: err.stack });
        console.error(`  ✗ [FAIL] ${title}: ${err.message}`);
    }
}

console.log('\n================================================================================');
console.log('  CHALLENGER M1-2: EMPIRICAL ADVERSARIAL STRESS TEST HARNESS');
console.log('================================================================================\n');

// ============================================================================
// PART 1: STREAK TRANSITIONS & FATIGUE PENALTIES
// ============================================================================
console.log('--- PART 1: Streak Transitions & Fatigue Penalties ---');

check('1.1: Comprehensive Streak State Mapping Coverage (L10 to W10)', () => {
    // Negative streaks (losses)
    assert.strictEqual(service.getStreakStateTag(-10), 'L4+');
    assert.strictEqual(service.getStreakStateTag(-5), 'L4+');
    assert.strictEqual(service.getStreakStateTag(-4), 'L4+');
    assert.strictEqual(service.getStreakStateTag(-3), 'L3');
    assert.strictEqual(service.getStreakStateTag(-2), 'L2');
    assert.strictEqual(service.getStreakStateTag(-1), 'L1');
    assert.strictEqual(service.getStreakStateTag(0), 'INIT');
    // Positive streaks (wins)
    assert.strictEqual(service.getStreakStateTag(1), 'W1');
    assert.strictEqual(service.getStreakStateTag(2), 'W2');
    assert.strictEqual(service.getStreakStateTag(3), 'W3+');
    assert.strictEqual(service.getStreakStateTag(5), 'W3+');
    assert.strictEqual(service.getStreakStateTag(10), 'W3+');
});

check('1.2: PIT Transition Metrics Calculation Across 7 Discrete States', () => {
    // Construct a synthetic ledger that visits all 7 states
    const ledger = [];
    const outcomes = [
        true, true, true,           // enters: INIT->W1, W1->W2, W2->W3+
        false, false, false, false, // W3+->L1, L1->L2, L2->L3, L3->L4+
        true,                       // L4+->W1
        false,                      // W1->L1
        true,                       // L1->W1
        true,                       // W1->W2
        false,                      // W2->L1
        false,                      // L1->L2
        true,                       // L2->W1
        false,                      // W1->L1
        false,                      // L1->L2
        false,                      // L2->L3
        true                        // L3->W1
    ];

    outcomes.forEach(isHit => ledger.push({ isHit }));

    const metrics = service.computePITTransitionMetricsForLedger(ledger, ledger.length, { priorK: 3 });

    // Validate that stateStats captured transitions for all visited states
    assert(metrics.stateStats['W1'].total > 0, 'W1 state must be observed');
    assert(metrics.stateStats['W2'].total > 0, 'W2 state must be observed');
    assert(metrics.stateStats['L1'].total > 0, 'L1 state must be observed');
    assert(metrics.stateStats['L2'].total > 0, 'L2 state must be observed');
    assert(metrics.stateStats['L3'].total > 0, 'L3 state must be observed');
    assert(metrics.stateStats['L4+'].total > 0, 'L4+ state must be observed');

    // Verify Laplace smoothing: condProb = (wins + 3 * baseWinRate) / (total + 3)
    const curTag = metrics.curTag;
    const stat = metrics.stateStats[curTag];
    const expectedCondProb = Number(((stat.wins + 3 * metrics.baseWinRate) / (stat.total + 3)).toFixed(4));
    assert.strictEqual(metrics.condProb, expectedCondProb);
});

check('1.3: Fatigue Penalty Monotonicity & Winner Exhaustion Damping', () => {
    // Verify fatigue penalty increases from W2 to W3+
    const gammaW2 = service.FATIGUE_PENALTIES['W2'];
    const gammaW3 = service.FATIGUE_PENALTIES['W3+'];
    assert(gammaW2 > 0, 'W2 must have a positive fatigue penalty');
    assert(gammaW3 > gammaW2, `W3+ fatigue penalty (${gammaW3}) must be strictly greater than W2 (${gammaW2})`);

    // Verify candidate matrix applies fatigue penalty to depress score for hot winners
    const methodsLedgersMap = {
        incumbentHot: [
            { isHit: true }, { isHit: true }, { isHit: true }, { isHit: true } // streak = +4 (W3+)
        ],
        challengerCold: [
            { isHit: true }, { isHit: false }, { isHit: false } // streak = -2 (L2)
        ]
    };

    const matrix = service.computeAnticipatoryDeCandidateMatrix(methodsLedgersMap, 4, 'incumbentHot');
    const hotEntry = matrix.find(m => m.methodId === 'incumbentHot');
    const coldEntry = matrix.find(m => m.methodId === 'challengerCold');

    assert.strictEqual(hotEntry.curTag, 'W3+');
    assert.strictEqual(coldEntry.curTag, 'L2');

    // Incumbent at W3+ receives fatigue penalty (gamma = 0.18 * 0.67 = 0.1206)
    assert(hotEntry.gamma > 0.10, `Hot winner must have gamma > 0.10, got ${hotEntry.gamma}`);
    // Cold candidate at L2 receives rebound bonus delta = 0.06
    assert.strictEqual(coldEntry.delta, 0.06);

    // Verify net score impact: hotEntry score is depressed by gamma
    const rawCond = hotEntry.condProb;
    assert(hotEntry.anticipatoryScore < rawCond, 'Hot winner score must be depressed below condProb due to fatigue penalty');
});

check('1.4: Zero Lookahead / Strict PIT Invariant in Ledger Processing', () => {
    // Ledger of 10 draws. Day index = 5.
    // Draws 0..4 have 1 win (20% win rate).
    // Draws 5..9 have 5 wins (100% win rate).
    const leakTestLedger = [
        { isHit: false }, { isHit: false }, { isHit: true }, { isHit: false }, { isHit: false }, // 0..4: 1 win
        { isHit: true }, { isHit: true }, { isHit: true }, { isHit: true }, { isHit: true }      // 5..9: 5 wins
    ];

    const metricsAt5 = service.computePITTransitionMetricsForLedger(leakTestLedger, 5, { priorK: 0 });
    assert.strictEqual(metricsAt5.totalCount, 5, 'Must evaluate strictly 5 records');
    assert.strictEqual(metricsAt5.totalWins, 1, 'Must strictly see only 1 win from indices < 5');
    assert.strictEqual(metricsAt5.baseWinRate, 0.20, 'Base win rate must be 0.20, NOT contaminated by future wins');
});

// ============================================================================
// PART 2: PROACTIVE REBOUND SWAP & ANTI-CHURNING
// ============================================================================
console.log('\n--- PART 2: Proactive Rebound Swap & Anti-Churning ---');

check('2.1: Proactive Rebound Swap Triggers Under Correct Conditions', () => {
    // Condition: Incumbent at W3+ (fatigued), challenger at L2 with high rebound prob (0.50), score delta >= 0.05
    const candidateMatrix = [
        {
            methodId: 'challengerL2',
            curTag: 'L2',
            condProb: 0.50,
            anticipatoryScore: 0.56, // condProb(0.50) + delta(0.06)
            curStreak: -2
        },
        {
            methodId: 'incumbentW3',
            curTag: 'W3+',
            condProb: 0.45,
            anticipatoryScore: 0.36, // condProb(0.45) - gamma(0.12) + eta(0.03) = 0.36
            curStreak: 3
        }
    ];

    const decision = service.selectAnticipatoryRouterMethod({
        currentMethod: 'incumbentW3',
        candidateMatrix,
        config: { enableProactiveSwap: true, dominanceMargin: 0.05, proactiveSwapThreshold: 0.40 }
    });

    assert.strictEqual(decision.selectedMethodId, 'challengerL2');
    assert.strictEqual(decision.switchPhase, 'REBOUND');
    assert.strictEqual(decision.routerTelemetry.ruleTriggered, 'PROACTIVE_REBOUND_SWAP');
    assert.strictEqual(decision.routerTelemetry.incumbentTag, 'W3+');
    assert.strictEqual(decision.routerTelemetry.challengerTag, 'L2');
});

check('2.2: Proactive Rebound Swap BLOCKED When Dominance Margin is Unmet', () => {
    // Score delta = 0.38 - 0.36 = 0.02 < dominanceMargin (0.05)
    const candidateMatrix = [
        {
            methodId: 'challengerL1',
            curTag: 'L1',
            condProb: 0.42,
            anticipatoryScore: 0.38,
            curStreak: -1
        },
        {
            methodId: 'incumbentW2',
            curTag: 'W2',
            condProb: 0.41,
            anticipatoryScore: 0.36,
            curStreak: 2
        }
    ];

    const decision = service.selectAnticipatoryRouterMethod({
        currentMethod: 'incumbentW2',
        candidateMatrix,
        config: { enableProactiveSwap: true, dominanceMargin: 0.05, proactiveSwapThreshold: 0.40 }
    });

    // Proactive swap rule must NOT trigger because delta (0.02) < 0.05
    assert.notStrictEqual(decision.routerTelemetry.ruleTriggered, 'PROACTIVE_REBOUND_SWAP');
});

check('2.3: Proactive Rebound Swap BLOCKED When Challenger CondProb < Threshold', () => {
    // Challenger is at L2, but condProb = 0.35 < proactiveSwapThreshold (0.40)
    const candidateMatrix = [
        {
            methodId: 'weakChallengerL2',
            curTag: 'L2',
            condProb: 0.35,
            anticipatoryScore: 0.41,
            curStreak: -2
        },
        {
            methodId: 'incumbentW2',
            curTag: 'W2',
            condProb: 0.38,
            anticipatoryScore: 0.33,
            curStreak: 2
        }
    ];

    const decision = service.selectAnticipatoryRouterMethod({
        currentMethod: 'incumbentW2',
        candidateMatrix,
        config: { enableProactiveSwap: true, dominanceMargin: 0.05, proactiveSwapThreshold: 0.40 }
    });

    assert.notStrictEqual(decision.routerTelemetry.ruleTriggered, 'PROACTIVE_REBOUND_SWAP');
});

check('2.4: Anti-Churning Significance Guard Retains Incumbent for Noisy Fluctuations', () => {
    // Incumbent at W1 (not fatigued). Challenger at W1 with trivial 1-win difference in 50 trials.
    // Incumbent: 25/50 (50%). Challenger: 26/50 (52%).
    // Z-score between 26/50 and 25/50 is ~0.20 << 1.645.
    const candidateMatrix = [
        {
            methodId: 'challengerNoise',
            curTag: 'W1',
            condProb: 0.52,
            anticipatoryScore: 0.54,
            totalWins: 26,
            totalCount: 50,
            curStreak: 1
        },
        {
            methodId: 'incumbentStable',
            curTag: 'W1',
            condProb: 0.50,
            anticipatoryScore: 0.53, // includes +0.03 inertia bonus
            totalWins: 25,
            totalCount: 50,
            curStreak: 1
        }
    ];

    const decision = service.selectAnticipatoryRouterMethod({
        currentMethod: 'incumbentStable',
        candidateMatrix,
        config: { enableProactiveSwap: true }
    });

    assert.strictEqual(decision.selectedMethodId, 'incumbentStable', 'Must hold incumbent due to insignificance');
    assert.strictEqual(decision.routerTelemetry.ruleTriggered, 'ANTI_CHURN_HOLD');
});

check('2.5: Anti-Churning Permits Handoff When Difference is Statistically Significant', () => {
    // Challenger: 45/60 (75%). Incumbent: 24/60 (40%).
    // Z-score is >> 1.645 and delta Wilson is >> 0.025.
    const candidateMatrix = [
        {
            methodId: 'challengerDominant',
            curTag: 'W1',
            condProb: 0.75,
            anticipatoryScore: 0.75,
            totalWins: 45,
            totalCount: 60,
            curStreak: 1
        },
        {
            methodId: 'incumbentWeak',
            curTag: 'W1',
            condProb: 0.40,
            anticipatoryScore: 0.43,
            totalWins: 24,
            totalCount: 60,
            curStreak: 1
        }
    ];

    const decision = service.selectAnticipatoryRouterMethod({
        currentMethod: 'incumbentWeak',
        candidateMatrix,
        config: { enableProactiveSwap: true }
    });

    // Significant challenger MUST successfully overturn incumbent
    assert.strictEqual(decision.selectedMethodId, 'challengerDominant');
    assert.notStrictEqual(decision.routerTelemetry.ruleTriggered, 'ANTI_CHURN_HOLD');
});

check('2.6: Multi-Day Anti-Churning Simulation: Stable Winner vs Noise', () => {
    // Simulate 30 consecutive days where Method A has true p=0.55 and Method B has true p=0.54.
    let currentMethod = 'methodA';
    let switchCount = 0;

    for (let day = 1; day <= 30; day++) {
        // Slight noisy perturbation in estimated scores
        const noiseA = (Math.sin(day * 1.5) * 0.015);
        const noiseB = (Math.cos(day * 1.5) * 0.015);

        const scoreA = 0.55 + noiseA;
        const scoreB = 0.54 + noiseB;

        const candidateMatrix = [
            {
                methodId: 'methodA',
                curTag: 'W1',
                condProb: scoreA,
                anticipatoryScore: scoreA + (currentMethod === 'methodA' ? 0.03 : 0),
                totalWins: 55,
                totalCount: 100,
                curStreak: 1
            },
            {
                methodId: 'methodB',
                curTag: 'W1',
                condProb: scoreB,
                anticipatoryScore: scoreB + (currentMethod === 'methodB' ? 0.03 : 0),
                totalWins: 54,
                totalCount: 100,
                curStreak: 1
            }
        ];
        candidateMatrix.sort((a, b) => b.anticipatoryScore - a.anticipatoryScore);

        const decision = service.selectAnticipatoryRouterMethod({
            currentMethod,
            candidateMatrix,
            config: { enableProactiveSwap: true }
        });

        if (decision.selectedMethodId !== currentMethod) {
            switchCount++;
            currentMethod = decision.selectedMethodId;
        }
    }

    console.log(`    [Telemetry] 30-day noise churn count: ${switchCount} switches`);
    assert(switchCount <= 2, `Churn count (${switchCount}) must be <= 2 in 30 days of noisy close candidates`);
});

// ============================================================================
// PART 3: SCHMITT-TRIGGER HYSTERESIS & BET/ABSTAIN WHIPSAW PREVENTION
// ============================================================================
console.log('\n--- PART 3: Schmitt-Trigger Hysteresis & Whipsaw Prevention ---');

check('3.1: Hysteresis Threshold Asymmetry (Divergence Enter 0.85 vs Exit 0.75)', () => {
    assert.strictEqual(service.DEFAULT_CONFIG.DIVERGENCE_ENTER_THRESHOLD, 0.85);
    assert.strictEqual(service.DEFAULT_CONFIG.DIVERGENCE_EXIT_THRESHOLD, 0.75);
    assert(service.DEFAULT_CONFIG.DIVERGENCE_ENTER_THRESHOLD > service.DEFAULT_CONFIG.DIVERGENCE_EXIT_THRESHOLD,
        'Enter threshold must be strictly higher than exit threshold to create hysteresis band');
});

check('3.2: Governor State Machine: Enters ABSTAIN_GUARD at D_ensemble > 0.85', () => {
    // Create candidates with divergence > 0.85 (e.g. c = 2 overlapping numbers out of 10)
    // Jaccard = 2 / 18 = 0.1111 => D_ensemble = 0.8889 > 0.85
    const setA = Array.from({ length: 10 }, (_, i) => i);
    const setB = Array.from({ length: 10 }, (_, i) => i + 8);
    const candA = { methodId: 'e1', category: 'elite', numbers: setA, vipNumbers: setA.slice(0, 3), backupNumbers: setA.slice(3), stakeK: 16000 };
    const candB = { methodId: 'e2', category: 'elite', numbers: setB, vipNumbers: setB.slice(0, 3), backupNumbers: setB.slice(3), stakeK: 16000 };

    const priorStatsMap = {
        e1: { observations: 100, wins: 65, vipWins: 35 },
        e2: { observations: 100, wins: 65, vipWins: 35 }
    };

    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates: [candA, candB],
        priorStatsMap,
        priorGovernorState: { state: 'ACTIVE_BET', consecutiveAbstains: 0 }
    });

    assert.strictEqual(res.action, 'ABSTAIN');
    assert.strictEqual(res.abstainGate.governorState, 'ABSTAIN_GUARD');
    assert.strictEqual(res.abstainGate.consecutiveAbstains, 1);
    assert(res.abstainGate.triggeredConditions.includes('COND_3_EXTREME_ENSEMBLE_DIVERGENCE'));
});

check('3.3: Hysteresis Trap: Does NOT exit ABSTAIN_GUARD when Divergence is in Deadband (0.75 < D <= 0.85)', () => {
    // Overlapping c = 3 numbers: Jaccard = 3 / 17 = 0.1765 => D_ensemble = 0.8235
    // 0.8235 is in the deadband: below 0.85, but ABOVE 0.75 exit threshold.
    // The Schmitt-trigger MUST hold ABSTAIN_GUARD!
    const setA = Array.from({ length: 10 }, (_, i) => i);
    const setB = Array.from({ length: 10 }, (_, i) => i + 7);

    const candA = { methodId: 'e1', category: 'elite', numbers: setA, vipNumbers: setA.slice(0, 3), backupNumbers: setA.slice(3), stakeK: 16000 };
    const candB = { methodId: 'e2', category: 'elite', numbers: setB, vipNumbers: setB.slice(0, 3), backupNumbers: setB.slice(3), stakeK: 16000 };

    const priorStatsMap = {
        e1: { observations: 100, wins: 65, vipWins: 35 },
        e2: { observations: 100, wins: 65, vipWins: 35 }
    };

    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates: [candA, candB],
        priorStatsMap,
        priorGovernorState: { state: 'ABSTAIN_GUARD', consecutiveAbstains: 2, cumulativePreservedK: 32000 }
    });

    const div = res.abstainGate.divergenceReport.D_ensemble;
    assert(div > 0.75 && div <= 0.85, `D_ensemble (${div}) must be in the hysteresis deadband [0.75, 0.85]`);
    // Crucial Schmitt-trigger assertion:
    assert.strictEqual(res.action, 'ABSTAIN', 'Must remain ABSTAIN inside deadband');
    assert.strictEqual(res.abstainGate.governorState, 'ABSTAIN_GUARD');
    assert.strictEqual(res.abstainGate.consecutiveAbstains, 3);
    assert(res.abstainGate.reason.includes('Hysteresis Buffer'));
});

check('3.4: Hysteresis Release: Exits ABSTAIN_GUARD only when ALL Recovery Buffers are Satisfied', () => {
    // Overlap: 5 numbers in common out of 10.
    // Jaccard = 5 / 15 = 0.3333 => D_ensemble = 0.6667 (<= 0.75 exit threshold!)
    const setA = Array.from({ length: 10 }, (_, i) => i);
    const setB = Array.from({ length: 10 }, (_, i) => i + 5);

    const candA = { methodId: 'e1', category: 'elite', numbers: setA, vipNumbers: setA.slice(0, 3), backupNumbers: setA.slice(3), stakeK: 16000 };
    const candB = { methodId: 'e2', category: 'elite', numbers: setB, vipNumbers: setB.slice(0, 3), backupNumbers: setB.slice(3), stakeK: 16000 };

    const priorStatsMap = {
        e1: { observations: 100, wins: 65, vipWins: 35 }, // EV high, Wilson high
        e2: { observations: 100, wins: 65, vipWins: 35 }
    };

    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates: [candA, candB],
        priorStatsMap,
        priorGovernorState: { state: 'ABSTAIN_GUARD', consecutiveAbstains: 3, cumulativePreservedK: 48000 }
    });

    assert.strictEqual(res.action, 'BET', 'Must successfully clear to BET once divergence <= 0.75 and EV buffer met');
    assert.strictEqual(res.abstainGate.governorState, 'ACTIVE_BET');
    assert.strictEqual(res.abstainGate.consecutiveAbstains, 0);
    assert.strictEqual(res.abstainGate.isAbstained, false);
});

check('3.5: Oscillating Market Stress Test (Zero Whipsawing under Boundary Jitter)', () => {
    // Overlap count c sequence:
    // c=5 -> D=0.6667 (BET)
    // c=2 -> D=0.8889 (ABSTAIN)
    // c=3 -> D=0.8235 (deadband: STAY ABSTAIN)
    // c=5 -> D=0.6667 (exit to BET)
    // c=4 -> D=0.7500 (stays BET)
    // c=2 -> D=0.8889 (ABSTAIN)
    // c=3 -> D=0.8235 (deadband: STAY ABSTAIN)
    // c=5 -> D=0.6667 (exit to BET)
    const cSequence = [5, 2, 3, 2, 3, 2, 3, 3, 2, 3, 5, 5, 4, 2, 3, 3, 3, 2, 5, 5];
    let governorState = { state: 'ACTIVE_BET', consecutiveAbstains: 0, cumulativePreservedK: 0 };
    let actionFlips = 0;
    let prevAction = 'BET';
    const actions = [];

    cSequence.forEach((c, day) => {
        const set1 = Array.from({ length: 10 }, (_, i) => i);
        const set2 = Array.from({ length: 10 }, (_, i) => i + (10 - c));

        const cand1 = { methodId: 'e1', category: 'elite', numbers: set1, vipNumbers: set1.slice(0, 3), backupNumbers: set1.slice(3), stakeK: 16000 };
        const cand2 = { methodId: 'e2', category: 'elite', numbers: set2, vipNumbers: set2.slice(0, 3), backupNumbers: set2.slice(3), stakeK: 16000 };

        const priorStatsMap = {
            e1: { observations: 100, wins: 65, vipWins: 35 },
            e2: { observations: 100, wins: 65, vipWins: 35 }
        };

        const res = service.evaluateSmartAbstainGate({
            targetDate: `2026-09-${String(day + 1).padStart(2, '0')}`,
            candidates: [cand1, cand2],
            priorStatsMap,
            priorGovernorState: governorState
        });

        if (res.action !== prevAction) {
            actionFlips++;
            prevAction = res.action;
        }

        actions.push(res.action);
        governorState = {
            state: res.abstainGate.governorState,
            consecutiveAbstains: res.abstainGate.consecutiveAbstains,
            cumulativePreservedK: res.abstainGate.cumulativeCapitalPreservedK
        };
    });

    console.log(`    [Telemetry] 20-day jitter actions: ${actions.join(' -> ')}`);
    console.log(`    [Telemetry] Total action state flips: ${actionFlips}`);

    // With 2 genuine drops below 0.75 and 2 entries above 0.85, there should be exactly 4 state flips
    // (BET -> ABSTAIN -> BET -> ABSTAIN -> BET)
    assert.strictEqual(actionFlips, 4, `Action flips must be exactly 4 (no deadband chattering), got ${actionFlips}`);
});

check('3.6: EV Buffer Hysteresis: Prevents Re-entry on Marginal EV (+2,000K < Buffer +5,000K)', () => {
    // Once in ABSTAIN_GUARD due to negative EV:
    // Candidate recovers to EV = +2,000K (positive EV, but below EV_EXIT_BUFFER_K = 5,000K).
    // Schmitt-trigger must require reaching +5,000K to avoid whipsawing back into a marginal market.
    const cand = { methodId: 'e1', category: 'elite', numbers: [1, 2, 3], vipNumbers: [1], backupNumbers: [2, 3], stakeK: 10000 };
    // Let's set stats to produce EV = +2,000K
    // E[Profit] = pVIP * 252K + pBackup * 84K - 10K
    // If observations=100, wins=40, vipWins=15
    // pUnion ~ 0.40, vipRatio = (15 + 5 * 0.33) / (40 + 5) = 16.65 / 45 = 0.37
    // probVIP = 0.40 * 0.37 = 0.148 => 0.148 * 252K = 37.296K
    // probBackup = 0.40 - 0.148 = 0.252 => 0.252 * 84K = 21.168K
    // EV = 37.296 + 21.168 - 10 = 48.464K (very high)
    // To get low EV, let's control priorStats directly via evaluateCandidateQuantMetrics
    // Or pass custom config with EV_EXIT_BUFFER_K = 5000:
    const candLow = {
        methodId: 'mLow',
        numbers: Array.from({ length: 30 }, (_, i) => i),
        vipNumbers: [],
        backupNumbers: Array.from({ length: 30 }, (_, i) => i),
        stakeK: 30000
    };
    // Stake = 30K. Payout = 84K.
    // E[Profit] = p * 84K - 30K.
    // If p = 0.38: EV = 0.38 * 84 - 30 = 31.92 - 30 = +1.92K (+1,920 VND)
    // +1,920 VND is > 0, but < EV_EXIT_BUFFER_K (5,000 VND).
    const priorStatsMap = {
        mLow: {
            observations: 100,
            wins: 38,
            vipWins: 0,
            posteriorProb: 0.38
        }
    };

    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates: [candLow],
        priorStatsMap,
        priorGovernorState: { state: 'ABSTAIN_GUARD', consecutiveAbstains: 2, cumulativePreservedK: 60000 },
        customConfig: { EV_EXIT_BUFFER_K: 5000 }
    });

    assert.strictEqual(res.action, 'ABSTAIN', 'Must stay in ABSTAIN because EV < +5,000K exit buffer');
    assert.strictEqual(res.abstainGate.governorState, 'ABSTAIN_GUARD');
    assert(res.abstainGate.reason.includes('chưa đạt vùng an toàn'));
});

check('3.7: Wilson Buffer Hysteresis: Requires Wilson95 >= BreakEven + 2.0% Buffer to Exit', () => {
    // Dynamic break even = 35.7143%.
    // Wilson lower bound = 36.50% (> breakEven, but < breakEven + 2% = 37.7143%).
    // System must remain in ABSTAIN_GUARD.
    const cand = {
        methodId: 'mWilson',
        numbers: Array.from({ length: 30 }, (_, i) => i),
        vipNumbers: [],
        backupNumbers: Array.from({ length: 30 }, (_, i) => i),
        stakeK: 30000
    };
    // observations=100, wins=46 (p=46%). Wilson95 lower bound for (46, 100) is ~0.366 (36.6%).
    // breakEven = 35.7143%. Wilson is above breakEven, but below 37.7143%.
    // And EV = 0.46 * 84K - 30K = +8,640K (clears EV buffer > 5,000K).
    // Divergence = 0 (single candidate).
    const priorStatsMap = {
        mWilson: { observations: 100, wins: 46, vipWins: 0 }
    };

    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates: [cand],
        priorStatsMap,
        priorGovernorState: { state: 'ABSTAIN_GUARD', consecutiveAbstains: 1, cumulativePreservedK: 30000 },
        customConfig: { WILSON_EXIT_BUFFER: 0.02 }
    });

    const w95 = res.evMetrics.wilsonLower95;
    const be = res.evMetrics.breakEvenHitRate;
    assert(w95 >= be, `Wilson (${w95}) is above breakEven (${be})`);
    assert(w95 < (be + 0.02), `Wilson (${w95}) is below breakEven + 0.02 (${be + 0.02})`);
    assert.strictEqual(res.action, 'ABSTAIN', 'Must remain ABSTAIN until Wilson clears the +2.0% buffer');
    assert.strictEqual(res.abstainGate.governorState, 'ABSTAIN_GUARD');
});

// ============================================================================
// PART 4: EDGE CASES, BOUNDARY CONDITIONS & PnL CONSERVATION
// ============================================================================
console.log('\n--- PART 4: Edge Cases, Boundary Conditions & PnL Conservation ---');

check('4.1: Financial Conservation Law Holds Under 1,000 Random Trials', () => {
    // Monte Carlo verification of: profitK === payoutK - stakeK
    for (let trial = 0; trial < 1000; trial++) {
        const action = Math.random() < 0.2 ? 'ABSTAIN' : 'BET';
        const actualSpecial = Math.floor(Math.random() * 100);
        const vipCount = Math.floor(Math.random() * 25);
        const backupCount = Math.floor(Math.random() * 30);
        const allNums = Array.from({ length: 100 }, (_, i) => i);
        // Shuffle
        allNums.sort(() => Math.random() - 0.5);
        const vipNumbers = allNums.slice(0, vipCount);
        const backupNumbers = allNums.slice(vipCount, vipCount + backupCount);
        const stakeK = (vipCount * 3 + backupCount * 1) * 1000;

        const res = service.calculatePayoutAndProfitK({
            action,
            actualSpecial,
            vipNumbers,
            backupNumbers,
            stakeK,
            isAbstained: action === 'ABSTAIN'
        });

        assert.strictEqual(res.payoutK - res.stakeK, res.profitK,
            `Trial ${trial}: Conservation violated! payout=${res.payoutK}, stake=${res.stakeK}, profit=${res.profitK}`);

        if (action === 'ABSTAIN') {
            assert.strictEqual(res.stakeK, 0);
            assert.strictEqual(res.payoutK, 0);
            assert.strictEqual(res.profitK, 0);
        } else if (vipNumbers.includes(actualSpecial)) {
            assert.strictEqual(res.payoutK, service.DEFAULT_CONFIG.PAYOUT_VIP_K);
            assert.strictEqual(res.hitType, 'VIP_X3');
            assert.strictEqual(res.isVipHit, true);
        } else if (backupNumbers.includes(actualSpecial)) {
            assert.strictEqual(res.payoutK, service.DEFAULT_CONFIG.PAYOUT_BACKUP_K);
            assert.strictEqual(res.hitType, 'BACKUP_X1');
            assert.strictEqual(res.isVipHit, false);
        } else {
            assert.strictEqual(res.payoutK, 0);
            assert.strictEqual(res.hitType, 'NONE');
            assert.strictEqual(res.isHit, false);
        }
    }
});

check('4.2: Edge Case: Empty Candidates Array Handled Gracefully', () => {
    const res = service.evaluateSmartAbstainGate({
        targetDate: '2026-09-30',
        candidates: [],
        priorStatsMap: {}
    });

    assert.strictEqual(res.action, 'ABSTAIN');
    assert.strictEqual(res.abstainGate.isAbstained, true);
    assert(res.abstainGate.triggeredConditions.includes('NO_CANDIDATES'));
    assert.strictEqual(res.stakeK, 0);
    assert.deepStrictEqual(res.numbers, []);
});

check('4.3: Edge Case: Single Candidate With 0 Observations / 0 Wins', () => {
    const candidate = {
        methodId: 'zeroObs',
        numbers: [1, 2, 3],
        vipNumbers: [1],
        backupNumbers: [2, 3],
        stakeK: 5000
    };
    const evaluated = service.evaluateCandidateQuantMetrics(candidate, { observations: 0, wins: 0, vipWins: 0 });
    assert.strictEqual(evaluated.observations, 0);
    assert.strictEqual(evaluated.wins, 0);
    assert.strictEqual(evaluated.wilsonLower95, 0);
    assert(evaluated.expectedProfitK !== undefined);
    assert(!isNaN(evaluated.expectedProfitK));
});

check('4.4: Edge Case: Perfect 100% Win Rate Bound Handling', () => {
    const candidate = {
        methodId: 'perfect',
        numbers: [1, 2, 3],
        vipNumbers: [1],
        backupNumbers: [2, 3],
        stakeK: 5000
    };
    const evaluated = service.evaluateCandidateQuantMetrics(candidate, { observations: 100, wins: 100, vipWins: 100 });
    assert.strictEqual(evaluated.observations, 100);
    assert.strictEqual(evaluated.wins, 100);
    assert(evaluated.wilsonLower95 > 0.95 && evaluated.wilsonLower95 <= 1.0);
    assert(evaluated.expectedProfitK > 0);
});

check('4.5: Master Selector Integrates Routing and Respects Abstain Gate', () => {
    // When market divergence is extreme, master selector MUST return ABSTAIN
    // regardless of candidate scores
    const extremeDivergenceCandidates = [
        { methodId: 'adaptiveDualMerge', category: 'elite', numbers: [1, 2, 3], vipNumbers: [1], backupNumbers: [2, 3], stakeK: 5000 },
        { methodId: 'pentaCoreDe', category: 'elite', numbers: [10, 11, 12], vipNumbers: [10], backupNumbers: [11, 12], stakeK: 5000 }
    ];

    const result = service.selectOptimalDeStrategy({
        targetDate: '2026-09-30',
        candidates: extremeDivergenceCandidates,
        priorStatsMap: {
            adaptiveDualMerge: { observations: 100, wins: 60, vipWins: 30 },
            pentaCoreDe: { observations: 100, wins: 60, vipWins: 30 }
        }
    });

    assert.strictEqual(result.action, 'ABSTAIN', 'Master selector must respect Governor ABSTAIN on extreme divergence');
    assert.strictEqual(result.stakeK, 0);
    assert.deepStrictEqual(result.numbers, []);
    assert.strictEqual(result.abstainGate.isAbstained, true);
});

// ============================================================================
// FINAL SUMMARY
// ============================================================================
console.log('\n================================================================================');
console.log(`  TOTAL ADVERSARIAL CHECKS: ${totalChecks} | PASSED: ${passedChecks} | FAILED: ${failedChecks}`);
console.log('================================================================================\n');

if (failedChecks > 0) {
    console.error(`❌ HARNESS COMPLETED WITH ${failedChecks} FAILURES.\n`);
    failures.forEach(f => {
        console.error(`- ${f.title}: ${f.error}`);
    });
    process.exit(1);
} else {
    console.log('✅ ALL ADVERSARIAL CHECKS PASSED EMPIRICALLY WITH 100% SUCCESS.\n');
    process.exit(0);
}
