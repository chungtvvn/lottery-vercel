'use strict';

/**
 * scripts/test-adversarial-cross-hedging.js
 *
 * Independent Adversarial Stress & Empirical Verification Harness
 * Executed by: challenger_m1_orch3_1 (critic, specialist)
 *
 * Scenarios Tested:
 * 1. Prolonged dry spells in Lô (5+ consecutive days without hits) -> Defend/Abstain capital protection
 * 2. Extreme ensemble divergence (>0.90) -> Smart Abstain activation reliability & hysteresis
 * 3. Boundary conditions (targetDate at draw 1 of year, Tet holiday hiatus, empty history, leap days)
 * 4. Financial conservation across 10,000 randomized synthetic draw evaluations (payout - stake === profit)
 * 5. Full 2026 Walk-Forward backtest acceptance criteria audit
 * 6. Edge cases in cross-hedging guarantees & partial hits
 * 7. Adversarial Investigation of Pillar 1 VIP Cold Gan Collapse
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const service = require('../lib/services/crossHedgingPortfolioService');

let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function runAssert(testName, fn) {
    try {
        fn();
        passedTests++;
        console.log(`  \x1b[32m✔ PASS\x1b[0m ${testName}`);
    } catch (err) {
        failedTests++;
        console.error(`  \x1b[31m✘ FAIL\x1b[0m ${testName}`);
        console.error(`    \x1b[31mDetails:\x1b[0m ${err.message}`);
        failureDetails.push({ testName, error: err.message });
    }
}

console.log('================================================================================');
console.log('🛡️  ADVERSARIAL STRESS TEST: CROSS-HEDGING PORTFOLIO & RISK SIZING ENGINE');
console.log('================================================================================\n');

// =============================================================================
// SCENARIO 1: PROLONGED DRY SPELLS IN LÔ & TOTAL MARKET DROUGHT
// =============================================================================
console.log('\x1b[35m[SCENARIO 1] Prolonged Dry Spells & Drawdown Truncation\x1b[0m');

runAssert('1.1: Max consecutive loss streak is strictly <= 3 days under 10-day market drought', () => {
    const dummyDrawZeroHits = { special: '99', prize1: '00', prize2_1: '01' };
    const candidateSets = [[10, 20, 30], [10, 20, 31], [10, 20, 32]];

    let ledger = [];
    let priorState = null;
    let maxConsecutiveLoss = 0;
    let currentLossStreak = 0;
    const stakesPaid = [];

    for (let day = 1; day <= 10; day++) {
        const targetDate = `2026-06-${String(day).padStart(2, '0')}`;
        const regime = service.detectRegimeAndSizing({
            ledgerHistory: ledger,
            candidateSets,
            priorState
        });

        const decision = {
            targetDate,
            mode: regime.mode,
            sizingMultiplier: regime.sizingMultiplier,
            regimeDetails: regime,
            pillar1_De: {
                stakeK: Math.round(4500 * regime.sizingMultiplier),
                targetPayoutVipK: Math.round(168000 * regime.sizingMultiplier),
                targetPayoutSingleK: Math.round(84000 * regime.sizingMultiplier),
                vipNumbers: [77],
                singleNumbers: [78]
            },
            pillar2_Lo: {
                numbers: ['88', '89', '90', '91'],
                pointsPerNum: Math.round(65 * regime.sizingMultiplier),
                stakeK: Math.round(4 * 65 * regime.sizingMultiplier * 22),
                payoutPerHitK: Math.round(65 * regime.sizingMultiplier * 80)
            },
            pillar3_Xien: {
                type: 'XIEN_4_QUAY_11_VE',
                numbers: ['88', '89', '90', '91'],
                stakeK: Math.round(11 * 100 * regime.sizingMultiplier),
                payoutHit2K: Math.round(1200 * regime.sizingMultiplier),
                payoutHit3K: Math.round(8400 * regime.sizingMultiplier),
                payoutHit4K: Math.round(38400 * regime.sizingMultiplier)
            }
        };

        const settled = service.settleCrossAssetPortfolio(decision, dummyDrawZeroHits);
        ledger.push(settled);
        stakesPaid.push(settled.totalStakeK);

        if (settled.isWin) {
            currentLossStreak = 0;
        } else if (settled.isAbstain) {
            currentLossStreak = 0;
        } else {
            currentLossStreak++;
            if (currentLossStreak > maxConsecutiveLoss) maxConsecutiveLoss = currentLossStreak;
        }

        priorState = {
            mode: decision.mode,
            abstainConsecutive: regime.abstainConsecutive
        };
    }

    // In an unhedged strategy, 10 consecutive loss days would cause a 10-day losing streak
    // With cross-hedging, max consecutive loss streak must NEVER exceed 3 days!
    assert(maxConsecutiveLoss <= 3, `Max consecutive loss streak (${maxConsecutiveLoss}) must NOT exceed 3`);
});

runAssert('1.2: Capital recovery upon winning after Smart Abstain', () => {
    const priorState = { mode: 'SMART_ABSTAIN', abstainConsecutive: 2 };
    const lowDivSets = [[1, 2], [1, 2]]; // D_ensemble = 0.0 <= 0.75

    const regime = service.detectRegimeAndSizing({
        ledgerHistory: [{ isAbstain: true }, { isAbstain: true }],
        candidateSets: lowDivSets,
        priorState
    });

    assert.strictEqual(regime.mode, 'DEFEND_MINIMAL', 'Must transition from SMART_ABSTAIN to DEFEND_MINIMAL');
    assert.strictEqual(regime.sizingMultiplier, 0.35, 'Sizing multiplier must be 0.35 in DEFEND_MINIMAL');
});

runAssert('1.3: [ADVERSARIAL CHALLENGE] Detect premature risk escalation immediately after exiting Abstain', () => {
    // Challenge: If the system exits SMART_ABSTAIN into DEFEND_MINIMAL (0.35), and that trade loses,
    // the system should NOT immediately ramp risk up to ACTIVE_HEDGE (0.56+).
    // Let's test whether the implementation prematurely escalates risk:
    const candidateSets = [[10, 20, 30], [10, 20, 31], [10, 20, 32]];
    const ledger = [
        { isAbstain: true, totalProfitK: 0 },
        { isAbstain: true, totalProfitK: 0 },
        { isAbstain: false, totalProfitK: -3962, isWin: false } // Day in DEFEND_MINIMAL that loses
    ];

    const regime = service.detectRegimeAndSizing({
        ledgerHistory: ledger,
        candidateSets,
        priorState: { mode: 'DEFEND_MINIMAL', abstainConsecutive: 0 }
    });

    // Check if mode prematurely escalated to ACTIVE_HEDGE with sizing > 0.50
    if (regime.mode === 'ACTIVE_HEDGE' && regime.sizingMultiplier > 0.35) {
        throw new Error(
            `Vulnerability Detected: After losing the first trade exiting Abstain, mode prematurely escalated to ${regime.mode} (sizingMultiplier: ${regime.sizingMultiplier} > 0.35). Sizing should remain defensive.`
        );
    }
});

// =============================================================================
// SCENARIO 2: EXTREME ENSEMBLE DIVERGENCE (>0.90) & HYSTERESIS
// =============================================================================
console.log('\n\x1b[35m[SCENARIO 2] Extreme Ensemble Divergence (>0.90) & Schmitt Hysteresis\x1b[0m');

runAssert('2.1: calculateJaccardDivergence returns 1.0 for completely disjoint candidate sets', () => {
    const disjointSets = [
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12]
    ];
    const div = service.calculateJaccardDivergence(disjointSets);
    assert.strictEqual(div, 1.0, 'Disjoint sets must have Jaccard Divergence = 1.0');
});

runAssert('2.2: Extreme divergence (>0.90) immediately triggers SMART_ABSTAIN without prior losses', () => {
    const disjointSets = [
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    ];
    const regime = service.detectRegimeAndSizing({
        ledgerHistory: [{ totalProfitK: 10000, isWin: true }],
        candidateSets: disjointSets,
        priorState: null
    });

    assert.strictEqual(regime.jaccardDivergence, 1.0);
    assert.strictEqual(regime.mode, 'SMART_ABSTAIN', 'Must immediately trigger SMART_ABSTAIN when D > 0.90');
    assert.strictEqual(regime.sizingMultiplier, 0.0, 'Multiplier must be 0.0');
});

runAssert('2.3: Schmitt Trigger hysteresis prevents immediate premature exit from SMART_ABSTAIN', () => {
    const priorState = { mode: 'SMART_ABSTAIN', abstainConsecutive: 1 };
    const calmSets = [[1, 2, 3], [1, 2, 3]]; // D = 0.0

    const regime = service.detectRegimeAndSizing({
        ledgerHistory: [{ isAbstain: true }],
        candidateSets: calmSets,
        priorState
    });

    assert.strictEqual(regime.mode, 'SMART_ABSTAIN', 'Must stay in SMART_ABSTAIN because abstainConsecutive is only 1 (< 2)');
    assert.strictEqual(regime.sizingMultiplier, 0.0);
});

// =============================================================================
// SCENARIO 3: BOUNDARY CONDITIONS & CALENDAR EDGE CASES
// =============================================================================
console.log('\n\x1b[35m[SCENARIO 3] Boundary Conditions & Calendar Edge Cases\x1b[0m');

runAssert('3.1: Empty historical data (marketHistory = []) evaluates safely without crash or NaN', () => {
    const decision = service.evaluateCrossAssetPortfolio('2026-01-01', []);
    assert(decision !== null && typeof decision === 'object', 'Decision object must be returned');
    assert(!isNaN(decision.totalStakeK), 'totalStakeK must not be NaN');
    assert(decision.totalStakeK > 0, 'totalStakeK should be positive');
    assert(Array.isArray(decision.pillar1_De.allNumbers), 'allNumbers should be array');
    assert(Array.isArray(decision.pillar2_Lo.numbers), 'Lo numbers should be array');
    assert(Array.isArray(decision.pillar3_Xien.numbers), 'Xien numbers should be array');
});

runAssert('3.2: Single draw history evaluates safely', () => {
    const singleDrawHistory = [
        { date: '2025-12-31', special: '88', prize1: '12', prize2_1: '34' }
    ];
    const decision = service.evaluateCrossAssetPortfolio('2026-01-01', singleDrawHistory);
    assert(decision !== null);
    assert(!isNaN(decision.totalStakeK));
});

runAssert('3.3: First draw of the year (2026-01-01) with full 2025 past draws', () => {
    const rawPath = path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');
    const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const draws2025 = raw.filter(r => (r.date || r.ngay || '').startsWith('2025'));

    const decision = service.evaluateCrossAssetPortfolio('2026-01-01', draws2025);
    assert.strictEqual(decision.targetDate, '2026-01-01');
    assert(decision.totalStakeK > 0);
    assert(decision.pillar1_De.allNumbers.length > 0);
    assert(decision.pillar2_Lo.numbers.length >= 4);
});

runAssert('3.4: Leap day handling (2024-02-29)', () => {
    const rawPath = path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');
    const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const drawsBeforeLeap = raw.filter(r => (r.date || r.ngay || '') < '2024-02-29');

    const decision = service.evaluateCrossAssetPortfolio('2024-02-29', drawsBeforeLeap);
    assert.strictEqual(decision.targetDate, '2024-02-29');
    assert(decision.totalStakeK > 0);
});

runAssert('3.5: Tet holiday hiatus (gap in draw dates) does not cause desync', () => {
    const historyWithGap = [
        { date: '2026-02-14', special: '10' },
        { date: '2026-02-20', special: '20' }
    ];
    const decision = service.evaluateCrossAssetPortfolio('2026-02-21', historyWithGap);
    assert.strictEqual(decision.targetDate, '2026-02-21');
    assert(decision.totalStakeK > 0);
});

runAssert('3.6: Strict PIT guard throws on present or future date leakage', () => {
    const corruptedHistory = [
        { date: '2026-04-01', special: '11' },
        { date: '2026-04-02', special: '22' }
    ];
    assert.throws(() => {
        service.evaluateCrossAssetPortfolio('2026-04-02', corruptedHistory);
    }, /Strict PIT Violation/);

    assert.throws(() => {
        service.evaluateCrossAssetPortfolio('2026-04-01', corruptedHistory);
    }, /Strict PIT Violation/);
});

// =============================================================================
// SCENARIO 4: FINANCIAL CONSERVATION LAW (10,000 SYNTHETIC TRIALS)
// =============================================================================
console.log('\n\x1b[35m[SCENARIO 4] Financial Conservation Law Across 10,000 Synthetic Trials\x1b[0m');

runAssert('4.1: 10,000 randomized synthetic draw evaluations strictly satisfy payout - stake === profit', () => {
    const NUM_TRIALS = 10000;
    let conservationViolations = 0;
    let componentViolations = 0;
    let nanViolations = 0;
    let winClassificationViolations = 0;

    const PRIZE_KEYS_LIST = [
        'special', 'prize1',
        'prize2_1', 'prize2_2',
        'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
        'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
        'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
        'prize6_1', 'prize6_2', 'prize6_3',
        'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
    ];

    const modesList = service.PORTFOLIO_MODES;

    for (let t = 0; t < NUM_TRIALS; t++) {
        const mode = modesList[t % modesList.length];
        const isAbstain = mode === 'SMART_ABSTAIN';
        const kappa = isAbstain ? 0.0 : Number((0.25 + Math.random() * 1.10).toFixed(2));

        const numVip = Math.floor(Math.random() * 15) + 1;
        const numSingle = Math.floor(Math.random() * 25) + 5;
        const vipNumbers = Array.from({ length: numVip }, () => Math.floor(Math.random() * 100));
        const singleNumbers = Array.from({ length: numSingle }, () => Math.floor(Math.random() * 100));

        const loNumbers = ['12', '34', '56', '78', '90', '45', '67'].slice(0, 4 + (t % 4));

        const deStakeK = Math.round(4500 * kappa);
        const dePayoutVipK = Math.round(168000 * kappa);
        const dePayoutSingleK = Math.round(84000 * kappa);

        const loPoints = Math.round(65 * kappa);
        const loStakeK = Math.round(loNumbers.length * loPoints * 22);
        const loPayoutPerHitK = Math.round(loPoints * 80);

        const xienTicketK = Math.round(100 * kappa);
        const xienStakeK = Math.round(11 * xienTicketK);
        const xienPayoutHit2K = 12 * xienTicketK;
        const xienPayoutHit3K = 84 * xienTicketK;
        const xienPayoutHit4K = 384 * xienTicketK;

        const decision = {
            targetDate: `2026-05-${String((t % 28) + 1).padStart(2, '0')}`,
            mode,
            sizingMultiplier: kappa,
            pillar1_De: {
                methodId: 'syntheticDe',
                vipNumbers,
                singleNumbers,
                stakeK: deStakeK,
                targetPayoutVipK: dePayoutVipK,
                targetPayoutSingleK: dePayoutSingleK
            },
            pillar2_Lo: {
                engine: 'syntheticLo',
                engineType: '4ENGINE_CONSENSUS',
                numbers: loNumbers,
                pointsPerNum: loPoints,
                stakeK: loStakeK,
                payoutPerHitK: loPayoutPerHitK
            },
            pillar3_Xien: {
                type: 'XIEN_4_QUAY_11_VE',
                numbers: loNumbers.slice(0, 4),
                ticketsCount: 11,
                ticketPriceK: xienTicketK,
                stakeK: xienStakeK,
                payoutHit2K: xienPayoutHit2K,
                payoutHit3K: xienPayoutHit3K,
                payoutHit4K: xienPayoutHit4K
            }
        };

        const syntheticDraw = {};
        PRIZE_KEYS_LIST.forEach(k => {
            syntheticDraw[k] = String(Math.floor(Math.random() * 100)).padStart(2, '0');
        });

        const settled = service.settleCrossAssetPortfolio(decision, syntheticDraw);

        if (settled.totalPayoutK - settled.totalStakeK !== settled.totalProfitK) {
            conservationViolations++;
        }
        if (settled.dePayoutK - settled.deStakeK !== settled.deProfitK) {
            componentViolations++;
        }
        if (settled.loPayoutK - settled.loStakeK !== settled.loProfitK) {
            componentViolations++;
        }
        if (settled.xienPayoutK - settled.xienStakeK !== settled.xienProfitK) {
            componentViolations++;
        }
        if (settled.deProfitK + settled.loProfitK + settled.xienProfitK !== settled.totalProfitK) {
            componentViolations++;
        }

        const expectedIsWin = isAbstain ? false : (settled.totalProfitK > 0);
        if (settled.isWin !== expectedIsWin) {
            winClassificationViolations++;
        }

        if (isNaN(settled.totalProfitK) || isNaN(settled.totalStakeK) || isNaN(settled.totalPayoutK)) {
            nanViolations++;
        }
    }

    console.log(`    - Trials Executed:           \x1b[1m${NUM_TRIALS.toLocaleString()}\x1b[0m`);
    console.log(`    - Conservation Violations:   \x1b[1m${conservationViolations}\x1b[0m`);
    console.log(`    - Component Violations:      \x1b[1m${componentViolations}\x1b[0m`);
    console.log(`    - NaN/Infinity Violations:   \x1b[1m${nanViolations}\x1b[0m`);
    console.log(`    - Win Invariant Violations:  \x1b[1m${winClassificationViolations}\x1b[0m`);

    assert.strictEqual(conservationViolations, 0, 'Zero conservation violations allowed across 10,000 trials');
    assert.strictEqual(componentViolations, 0, 'Zero component violations allowed across 10,000 trials');
    assert.strictEqual(nanViolations, 0, 'Zero NaN values allowed across 10,000 trials');
    assert.strictEqual(winClassificationViolations, 0, 'Zero win classification violations allowed');
});

// =============================================================================
// SCENARIO 5: 2026 WALK-FORWARD REPLAY AUDIT & ACCEPTANCE CRITERIA
// =============================================================================
console.log('\n\x1b[35m[SCENARIO 5] Full 2026 Walk-Forward Acceptance Criteria Verification\x1b[0m');

runAssert('5.1: 2026 Walk-Forward Replay satisfies all quantitative thresholds', () => {
    const res = service.runCrossHedgingBacktest2026({});
    const summary = res.summary;
    const ledger = res.settledLedger;

    assert(ledger.length >= 267, `Ledger length ${ledger.length} must be >= 267 draws`);

    let runningStreak = 0;
    let auditedMaxLoss = 0;
    let auditedWins = 0;
    let auditedTotalStake = 0;
    let auditedTotalProfit = 0;

    for (let i = 0; i < ledger.length; i++) {
        const row = ledger[i];
        assert.strictEqual(row.totalPayoutK - row.totalStakeK, row.totalProfitK, `Day ${row.date} violates conservation`);

        if (row.isWin) {
            auditedWins++;
            runningStreak = 0;
        } else if (row.isAbstain) {
            runningStreak = 0;
        } else {
            runningStreak++;
            if (runningStreak > auditedMaxLoss) auditedMaxLoss = runningStreak;
        }

        auditedTotalStake += row.totalStakeK;
        auditedTotalProfit += row.totalProfitK;
    }

    const auditedWinRate = Number((auditedWins / ledger.length).toFixed(4));
    const auditedRoi = Number((auditedTotalProfit / auditedTotalStake).toFixed(4));

    console.log(`    - Audited Total Draws:       \x1b[1m${ledger.length}\x1b[0m`);
    console.log(`    - Audited Daily Win Rate:    \x1b[1m${(auditedWinRate * 100).toFixed(2)}%\x1b[0m (Required: >= 70.0%)`);
    console.log(`    - Audited Cumulative ROI:    \x1b[1m+${(auditedRoi * 100).toFixed(2)}%\x1b[0m (Required: >= +25.0%)`);
    console.log(`    - Audited Max Loss Streak:   \x1b[1m${auditedMaxLoss} days\x1b[0m (Required: <= 3 days)`);
    console.log(`    - Total Cumulative Profit:   \x1b[1m+${(auditedTotalProfit / 1000).toFixed(1)}M VND\x1b[0m`);

    assert(auditedWinRate >= 0.70, `Win rate (${auditedWinRate}) must be >= 70.0%`);
    assert(auditedRoi >= 0.25, `ROI (${auditedRoi}) must be >= +25.0%`);
    assert(auditedMaxLoss <= 3, `Max consecutive loss streak (${auditedMaxLoss}) must be <= 3 days`);
    assert.strictEqual(summary.isAcceptancePassed, true);
});

// =============================================================================
// SCENARIO 6: CAPITAL HEDGING SYNERGIES & PARTIAL HIT EDGE CASES
// =============================================================================
console.log('\n\x1b[35m[SCENARIO 6] Capital Hedging Edge Cases & Asymmetric Payoffs\x1b[0m');

runAssert('6.1: Đề Single Hit (84M payout) alone produces positive profit', () => {
    const hedge = service.solveOptimalHedgeWeights({ loNumbersCount: 4, loPoints: 65 });
    const profitIfDeSingle = hedge.payoutIfDeSingleHitsK - hedge.totalStakeK;
    assert(profitIfDeSingle > 0, `Profit for Single De hit (+${profitIfDeSingle}K) must be positive`);
    assert.strictEqual(profitIfDeSingle, 84000 - 11320); // +72,680K VND
});

runAssert('6.2: 1 Lo hit alone does not yield net profit, correctly functioning as partial risk hedge', () => {
    const decision = {
        targetDate: '2026-05-20',
        mode: 'ACTIVE_HEDGE',
        sizingMultiplier: 1.0,
        pillar1_De: { stakeK: 4500, targetPayoutVipK: 168000, targetPayoutSingleK: 84000, vipNumbers: [1], singleNumbers: [2] },
        pillar2_Lo: { numbers: ['10', '20', '30', '40'], pointsPerNum: 65, stakeK: 5720, payoutPerHitK: 5200 },
        pillar3_Xien: { numbers: ['10', '20', '30', '40'], stakeK: 1100, payoutHit2K: 1200, payoutHit3K: 8400, payoutHit4K: 38400 }
    };
    const draw1Hit = { special: '99', prize1: '10', prize2_1: '00' };
    const settled = service.settleCrossAssetPortfolio(decision, draw1Hit);

    assert.strictEqual(settled.loHits, 1);
    assert.strictEqual(settled.uniqueTop4Hits, 1);
    assert.strictEqual(settled.xienPayoutK, 0);
    assert.strictEqual(settled.totalPayoutK, 5200);
    assert.strictEqual(settled.totalProfitK, 5200 - 11320);
    assert.strictEqual(settled.isWin, false);
});

// =============================================================================
// SCENARIO 7: ADVERSARIAL AUDIT OF PILLAR 1 VIP TIER SURVIVAL
// =============================================================================
console.log('\n\x1b[35m[SCENARIO 7] Adversarial Audit: Pillar 1 VIP Tier Survival vs Cold Gan Demotion\x1b[0m');

runAssert('7.1: [CRITICAL ADVERSARIAL DEFECT] Audit VIP numbers availability across 2026 decisions', () => {
    // Audit how many days in 2026 have decision.pillar1_De.vipNumbers.length === 0
    const rawPath = path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');
    const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const cachePath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

    const rawMap = new Map();
    raw.forEach((r, idx) => {
        const d = r.date || r.ngay;
        if (d) rawMap.set(String(d).slice(0, 10), { row: r, index: idx });
    });

    const dates2026 = [...rawMap.keys()].filter(d => d.startsWith('2026')).sort();
    let zeroVipDaysCount = 0;
    const zeroVipSampleDates = [];

    dates2026.forEach(d => {
        const entry = rawMap.get(d);
        const past = raw.slice(0, entry.index);
        const dec = service.evaluateCrossAssetPortfolio(d, past, cache);
        if (dec.pillar1_De.vipNumbers.length === 0) {
            zeroVipDaysCount++;
            if (zeroVipSampleDates.length < 5) zeroVipSampleDates.push(d);
        }
    });

    const zeroVipPct = Number(((zeroVipDaysCount / dates2026.length) * 100).toFixed(1));
    console.log(`    - Total Evaluated Draws:     \x1b[1m${dates2026.length}\x1b[0m`);
    console.log(`    - Draws with ZERO VIP:       \x1b[1m${zeroVipDaysCount} (${zeroVipPct}%)\x1b[0m`);
    console.log(`    - Sample Dates with 0 VIP:   ${zeroVipSampleDates.join(', ')}...`);

    // In a functioning 3-Pillar Cross-Hedging system, VIP numbers MUST exist to fulfill
    // R1: "Tận dụng tỷ lệ ăn lớn (1:84 đến 1:252) để tạo xung lực bứt phá lợi nhuận khi nổ VIP".
    // If > 50% of the year has zero VIP numbers, Pillar 1 VIP tier has suffered complete demotion collapse!
    if (zeroVipDaysCount > 10) {
        throw new Error(
            `VIP Demotion Collapse Detected: ${zeroVipDaysCount}/${dates2026.length} (${zeroVipPct}%) draws in 2026 have ZERO VIP numbers (vipNumbers: []) because COLD_GAN_DEEP_THRESHOLD=20 on Special Prize gan demotes all candidate numbers to Singles!`
        );
    }
});

// =============================================================================
// SUMMARY & VERDICT
// =============================================================================
console.log('\n================================================================================');
console.log(`📊 ADVERSARIAL STRESS TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('================================================================================\n');

if (failedTests > 0) {
    console.error(`\x1b[31mVERDICT: REJECT (${failedTests} critical/high defects detected)\x1b[0m`);
    failureDetails.forEach((f, idx) => {
        console.error(`  ${idx + 1}. [${f.testName}]: ${f.error}`);
    });
    console.log('');
    process.exit(1);
} else {
    console.log('\x1b[32mVERDICT: APPROVE (All adversarial challenges passed with zero defects)\x1b[0m\n');
    process.exit(0);
}
