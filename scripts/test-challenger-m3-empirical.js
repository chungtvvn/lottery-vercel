#!/usr/bin/env node
/**
 * scripts/test-challenger-m3-empirical.js
 *
 * EMPIRICAL ADVERSARIAL CHALLENGE SUITE: Auto Best-Selection Engine (Milestone 3)
 * Author: challenger_m3_orch5_1 (critic, specialist)
 *
 * Scope of empirical verification:
 * 1. 100% Strict Point-In-Time (Strict PIT) Isolation & Anti-Leakage
 * 2. Multi-Factor Quantitative Evaluation Across All 12 Candidates (EV, Sharpe, 7D PnL, 30D WR, Drawdown)
 * 3. Smart Abstain Filter Triggers (Negative EV, Disaster Floor, Extreme Divergence, Capital Preservation)
 * 4. Dynamic Pillar 1 Adoption in crossHedgingPortfolioService & Financial Conservation Laws
 * 5. SSOT Cache Files Parity & Prediction Snapshot Freezing
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

function challenge(suite, name, testFn) {
    totalTests++;
    try {
        testFn();
        passedTests++;
        console.log(`  ✓ [PASS] [${suite}] ${name}`);
    } catch (err) {
        failedTests++;
        console.error(`  ✗ [FAIL] [${suite}] ${name}`);
        console.error(`    ${err.message}`);
        failureDetails.push({ suite, name, error: err.message, stack: err.stack });
    }
}

console.log('='.repeat(85));
console.log('🔬 EMPIRICAL ADVERSARIAL CHALLENGER SUITE: AUTO BEST-SELECTION ENGINE (M3)');
console.log('='.repeat(85));

// Load authoritative data
const cachePath = path.resolve(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
const canonicalCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const rawPrizes = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../lib/data/xsmb-2-digits.json'), 'utf8'));

// ============================================================================
// 1. STRICT POINT-IN-TIME (STRICT PIT) EMPIRICAL AUDIT
// ============================================================================
console.log('\n--- 1. STRICT POINT-IN-TIME (STRICT PIT) ISOLATION HARNESS ---');

challenge('Strict PIT', '1.1: Historical Isolation - draw result on T is strictly excluded', () => {
    const rawLedger = [
        { date: '2026-09-28', isHit: true, profitK: 84000, stakeK: 77000 },
        { date: '2026-09-29', isHit: false, profitK: -77000, stakeK: 77000 },
        { date: '2026-09-30', isHit: true, profitK: 84000, stakeK: 77000 },
        { date: '2026-10-01', isHit: false, profitK: -77000, stakeK: 77000 },
        { date: '2026-10-02', isHit: true, profitK: 84000, stakeK: 77000 },
        { date: '2026-10-03', isHit: false, profitK: -77000, stakeK: 77000 }
    ];

    // Evaluating for 2026-10-01 MUST only see draws <= 2026-09-30
    const wr = autoBestService.calculateRollingWinRates(rawLedger, '2026-10-01');
    assert.strictEqual(wr.count7D, 3, 'Must only include 3 draws prior to 2026-10-01');
    assert.strictEqual(wr.totalWins7D, 2, 'Must count 2 wins before 2026-10-01');

    const pnl = autoBestService.calculateRollingPnL(rawLedger, '2026-10-01', 7);
    assert.strictEqual(pnl, 84000 - 77000 + 84000, 'PnL must sum only draws before 2026-10-01');

    const dd = autoBestService.calculateRollingDrawdown(rawLedger, '2026-10-01', 30);
    assert.strictEqual(dd.lossStreak, 0, 'Last draw before 10-01 was a win on 2026-09-30');
});

challenge('Strict PIT', '1.2: Adversarial Mutation Poisoning at TargetDate T', () => {
    // Select an arbitrary historical date T
    const targetT = '2026-09-22';
    const baseline = autoBestService.evaluateAutoBestSelection(targetT, { advisorCache: canonicalCache });

    // Mutate draw result on targetT with extreme numbers
    const poisonedCache = JSON.parse(JSON.stringify(canonicalCache));
    Object.keys(poisonedCache).forEach(k => {
        if (poisonedCache[k]?.settledLedger) {
            poisonedCache[k].settledLedger.forEach(row => {
                if (row.date === targetT) {
                    row.isHit = !row.isHit;
                    row.isVipHit = true;
                    row.profitK = 99999999;
                    row.special = '99';
                }
            });
        }
    });

    const poisonedResult = autoBestService.evaluateAutoBestSelection(targetT, { advisorCache: poisonedCache });
    assert.strictEqual(baseline.selectedMethod, poisonedResult.selectedMethod, 'Selected method cannot change');
    assert.strictEqual(baseline.status, poisonedResult.status, 'Status cannot change');
    assert.strictEqual(baseline.scores[0].compositeScore, poisonedResult.scores[0].compositeScore, 'Composite score invariant');
    assert.strictEqual(baseline.scores[0].winRate7D, poisonedResult.scores[0].winRate7D, 'Win rate invariant');
    assert.strictEqual(baseline.scores[0].sharpe30D, poisonedResult.scores[0].sharpe30D, 'Sharpe invariant');
    assert.strictEqual(baseline.scores[0].pnl7DK, poisonedResult.scores[0].pnl7DK, 'PnL invariant');
});

challenge('Strict PIT', '1.3: Future Injection Invariance (Synthetic Draws at T+1, T+2)', () => {
    const targetT = '2026-09-18';
    const baseline = autoBestService.evaluateAutoBestSelection(targetT, { advisorCache: canonicalCache });

    const futurePoisonedCache = JSON.parse(JSON.stringify(canonicalCache));
    const futureDates = ['2026-09-19', '2026-09-20', '2026-09-21', '2026-10-30'];
    Object.keys(futurePoisonedCache).forEach(k => {
        if (futurePoisonedCache[k]?.settledLedger) {
            futureDates.forEach(fd => {
                futurePoisonedCache[k].settledLedger.push({
                    date: fd,
                    isHit: true,
                    isVipHit: true,
                    profitK: 100000000,
                    special: '77'
                });
            });
        }
    });

    const evaluated = autoBestService.evaluateAutoBestSelection(targetT, { advisorCache: futurePoisonedCache });
    assert.strictEqual(baseline.selectedMethod, evaluated.selectedMethod);
    assert.strictEqual(baseline.scores[0].compositeScore, evaluated.scores[0].compositeScore);
    assert.strictEqual(baseline.scores[0].expectedProfitK, evaluated.scores[0].expectedProfitK);
});

challenge('Strict PIT', '1.4: Walk-Forward Multi-Day Monotonic Ledger Growth (16/09 to 03/10)', () => {
    const combatDates = [
        '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
        '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
        '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
        '2026-10-01', '2026-10-02', '2026-10-03'
    ];

    combatDates.forEach(d => {
        const res = autoBestService.evaluateAutoBestSelection(d, { advisorCache: canonicalCache });
        assert(res.selectedMethod, `Must select method on ${d}`);
        assert.strictEqual(res.scores.length, 12, `Must score all 12 on ${d}`);
        assert(res.scores.every(s => s.winRate7D >= 0 && s.winRate7D <= 1), `Valid WR 7D bounds on ${d}`);
        assert(res.scores.every(s => s.winRate30D >= 0 && s.winRate30D <= 1), `Valid WR 30D bounds on ${d}`);
    });
});

challenge('Strict PIT', '1.5: Cross-Asset Portfolio PIT Guard Rejects Lookahead in MarketHistory', () => {
    const invalidHistoryWithFuture = [
        { date: '2026-10-01', special: 8, prizes: [8] },
        { date: '2026-10-02', special: 83, prizes: [83] },
        { date: '2026-10-04', special: 99, prizes: [99] } // On or after targetDate 2026-10-04!
    ];

    assert.throws(() => {
        crossHedgingService.evaluateCrossAssetPortfolio('2026-10-04', invalidHistoryWithFuture, canonicalCache);
    }, /Strict PIT Violation/, 'Must throw Strict PIT Violation error');
});

// ============================================================================
// 2. MULTI-FACTOR EVALUATION LOGIC ACROSS ALL 12 CANDIDATES
// ============================================================================
console.log('\n--- 2. MULTI-FACTOR QUANTITATIVE EVALUATION ACROSS 12 CANDIDATES ---');

challenge('Multi-Factor', '2.1: Universe Completeness: Exactly 5 Elite + 7 Pool 7 Candidates', () => {
    assert.strictEqual(autoBestService.ALL_CANDIDATE_IDS.length, 12);
    assert.strictEqual(autoBestService.ELITE_ENGINE_IDS.length, 5);
    assert.strictEqual(autoBestService.POOL_7_METHOD_IDS.length, 7);

    const res = autoBestService.evaluateAutoBestSelection('2026-10-04', { advisorCache: canonicalCache });
    assert.strictEqual(res.scores.length, 12, 'Must evaluate exactly 12 candidates');

    const elites = res.scores.filter(c => c.category === 'elite');
    const pool7s = res.scores.filter(c => c.category === 'pool7');
    assert.strictEqual(elites.length, 5, 'Must contain 5 elite scores');
    assert.strictEqual(pool7s.length, 7, 'Must contain 7 pool 7 scores');
});

challenge('Multi-Factor', '2.2: Set Partition Disjointness: VIP and Backup Are Mutually Exclusive', () => {
    const candidates = dynamicDeSelector.loadAllDynamicCandidates('2026-10-04', { advisorCache: canonicalCache });
    assert.strictEqual(candidates.length, 12);

    candidates.forEach(c => {
        const vipSet = new Set(c.vipNumbers);
        const backupSet = new Set(c.backupNumbers);

        vipSet.forEach(n => {
            assert(!backupSet.has(n), `Candidate ${c.methodId} has overlap between VIP and Backup: ${n}`);
        });

        assert.strictEqual(c.numbers.length, c.vipNumbers.length + c.backupNumbers.length);
        c.numbers.forEach(n => {
            assert(Number.isInteger(Number(n)) && Number(n) >= 0 && Number(n) <= 99);
        });
    });
});

challenge('Multi-Factor', '2.3: Expected Value E[Profit] & Currency Conservation Formula', () => {
    const defaultCfg = dynamicDeSelector.DEFAULT_CONFIG;
    // pVIP = 0.20, pBackup = 0.25, stake = 77000K, payoutVIP = 252000K, payoutBackup = 84000K
    // EV = 0.20 * 252000 + 0.25 * 84000 - 77000 = 50400 + 21000 - 77000 = -5600K
    const calcEV = dynamicDeSelector.computeExpectedProfitK(0.20, 0.25, 77000, defaultCfg.PAYOUT_VIP_K, defaultCfg.PAYOUT_BACKUP_K);
    assert.strictEqual(calcEV, -5600);
});

challenge('Multi-Factor', '2.4: Rolling Sharpe Ratio 30D Oracle Mathematical Verification', () => {
    // Construct controlled 10-day returns
    const controlledLedger = [
        { date: '2026-09-01', profitK: 10000, stakeK: 100000 }, // r = 0.1
        { date: '2026-09-02', profitK: 20000, stakeK: 100000 }, // r = 0.2
        { date: '2026-09-03', profitK: 30000, stakeK: 100000 }, // r = 0.3
        { date: '2026-09-04', profitK: 20000, stakeK: 100000 }  // r = 0.2
    ];
    // mean(r) = 0.2, variance = ((0.1-0.2)^2 + (0.2-0.2)^2 + (0.3-0.2)^2 + (0.2-0.2)^2) / 3 = 0.02 / 3 = 0.006667
    // std = sqrt(0.006667) = 0.0816497
    // Sharpe = (0.2 / 0.0816497) * sqrt(365) = 2.44949 * 19.10497 = 46.79 -> Clamped to 10.0
    const sh = autoBestService.calculateRollingSharpe(controlledLedger, '2026-09-05', 10, 100000);
    assert.strictEqual(sh, 10.0, 'Must clamp to 10.0 maximum bound');

    // Empty ledger produces Sharpe 0
    assert.strictEqual(autoBestService.calculateRollingSharpe([], '2026-09-05'), 0);
    // Single draw produces Sharpe 0 (sample variance undefined)
    assert.strictEqual(autoBestService.calculateRollingSharpe([{ date: '2026-09-01', profitK: 10000, stakeK: 50000 }], '2026-09-05'), 0);
});

challenge('Multi-Factor', '2.5: Rolling Drawdown & Loss Streak Exact Calculation', () => {
    const testLedger = [
        { date: '2026-09-01', profitK: 200000 },  // peak: 200K
        { date: '2026-09-02', profitK: -77000 },  // cum: 123K, DD: 77K, lossStreak: 1
        { date: '2026-09-03', profitK: -77000 },  // cum: 46K, DD: 154K, lossStreak: 2
        { date: '2026-09-04', profitK: -77000 },  // cum: -31K, DD: 231K, lossStreak: 3
        { date: '2026-09-05', profitK: 175000 },  // cum: 144K, DD: 56K, lossStreak: 0
        { date: '2026-09-06', profitK: -77000 }   // cum: 67K, DD: 133K, lossStreak: 1
    ];

    const dd = autoBestService.calculateRollingDrawdown(testLedger, '2026-09-07', 30);
    assert.strictEqual(dd.maxDrawdownK, 231000, 'Max Drawdown is exactly 231,000K');
    assert.strictEqual(dd.currentDrawdownK, 133000, 'Current DD is exactly 133,000K');
    assert.strictEqual(dd.lossStreak, 1, 'Current loss streak is 1');
});

challenge('Multi-Factor', '2.6: Ranking Consistency & Strict Monotonicity', () => {
    const res = autoBestService.evaluateAutoBestSelection('2026-10-04', { advisorCache: canonicalCache });
    assert.strictEqual(res.selectedMethod, res.scores[0].methodId, 'Selected method must be rank 1');
    assert.strictEqual(res.scores[0].rank, 1);

    for (let i = 0; i < res.scores.length - 1; i++) {
        assert(res.scores[i].compositeScore >= res.scores[i + 1].compositeScore,
            `Ranking order violated: #${res.scores[i].rank} (${res.scores[i].compositeScore}) < #${res.scores[i+1].rank} (${res.scores[i+1].compositeScore})`);
        assert.strictEqual(res.scores[i].rank, i + 1);
    }
});

challenge('Multi-Factor', '2.7: Multi-Factor Weights Formulation & Verification', () => {
    const weights = autoBestService.DEFAULT_FACTOR_WEIGHTS;
    assert.strictEqual(weights.WEIGHT_EV, 0.25);
    assert.strictEqual(weights.WEIGHT_SHARPE, 0.25);
    assert.strictEqual(weights.WEIGHT_PNL_7D, 0.20);
    assert.strictEqual(weights.WEIGHT_WR_30D, 0.20);
    assert.strictEqual(weights.WEIGHT_DRAWDOWN_PENALTY, 0.10);
    const sumWeights = weights.WEIGHT_EV + weights.WEIGHT_SHARPE + weights.WEIGHT_PNL_7D + weights.WEIGHT_WR_30D + weights.WEIGHT_DRAWDOWN_PENALTY;
    assert(Math.abs(sumWeights - 1.0) < 1e-9, `Sum of weights must equal 1.0, got ${sumWeights}`);
});

// ============================================================================
// 3. SMART ABSTAIN CAPITAL PRESERVATION SHIELD
// ============================================================================
console.log('\n--- 3. SMART ABSTAIN CAPITAL PRESERVATION SHIELD HARNESS ---');

challenge('Smart Abstain', '3.1: Trigger 1 — All Candidates Negative EV forces ABSTAIN with Zero Capital Risk', () => {
    const abysmalLedger = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-08-${String(i+1).padStart(2, '0')}`,
        isHit: false,
        profitK: -77000,
        stakeK: 77000
    }));

    const mockLedgers = {};
    autoBestService.ELITE_ENGINE_IDS.forEach(id => { mockLedgers[id] = [...abysmalLedger]; });

    const negativeEVCandidates = autoBestService.ELITE_ENGINE_IDS.map(id => ({
        methodId: id,
        category: 'elite',
        numbers: Array.from({ length: 43 }, (_, i) => i),
        vipNumbers: Array.from({ length: 17 }, (_, i) => i),
        backupNumbers: Array.from({ length: 26 }, (_, i) => i + 17)
    }));

    const res = autoBestService.evaluateAutoBestSelection('2026-09-01', {
        advisorCache: {},
        methodsLedgersMap: mockLedgers,
        candidates: negativeEVCandidates
    });

    assert.strictEqual(res.status, 'ABSTAIN', 'Must trigger ABSTAIN status');
    assert.strictEqual(res.action, 'ABSTAIN', 'Action must be ABSTAIN');
    assert.strictEqual(res.stakeK, 0, 'Stake must be strictly 0');
    assert(res.reasoning.includes('SMART ABSTAIN') || res.reasoning.includes('BẢO TOÀN VỐN'), 'Reasoning must cite capital preservation');
});

challenge('Smart Abstain', '3.2: Trigger 2 — Wilson Lower Bound Disaster Floor Violation forces ABSTAIN', () => {
    // 25 trials and only 5 wins = 20% win rate. Wilson Lower 90% is ~10-12%, breach of 0.75 * 43% = 32%
    const disasterLedger = Array.from({ length: 25 }, (_, i) => ({
        date: `2026-08-${String(i+1).padStart(2, '0')}`,
        isHit: (i < 5),
        profitK: (i < 5 ? 84000 : -77000),
        stakeK: 77000
    }));

    const mockLedgers = {};
    autoBestService.ELITE_ENGINE_IDS.forEach(id => { mockLedgers[id] = [...disasterLedger]; });

    const disasterCandidates = autoBestService.ELITE_ENGINE_IDS.map(id => ({
        methodId: id,
        category: 'elite',
        numbers: Array.from({ length: 43 }, (_, i) => i),
        vipNumbers: Array.from({ length: 17 }, (_, i) => i),
        backupNumbers: Array.from({ length: 26 }, (_, i) => i + 17)
    }));

    const res = autoBestService.evaluateAutoBestSelection('2026-09-01', {
        advisorCache: {},
        methodsLedgersMap: mockLedgers,
        candidates: disasterCandidates
    });

    assert.strictEqual(res.status, 'ABSTAIN', 'Disaster floor breach must trigger ABSTAIN');
    assert.strictEqual(res.stakeK, 0, 'Stake must be 0');
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
    assert(divergence.D_ensemble > 0.85, `Extreme divergence must be > 0.85, got ${divergence.D_ensemble}`);

    const res = autoBestService.evaluateAutoBestSelection('2026-10-04', { candidates: disjointCandidates });
    assert.strictEqual(res.status, 'ABSTAIN', 'High ensemble divergence must trigger ABSTAIN');
    assert.strictEqual(res.action, 'ABSTAIN');
    assert.strictEqual(res.stakeK, 0);
    assert(res.reasoning.includes('phân kỳ') || res.reasoning.includes('ABSTAIN'));
});

challenge('Smart Abstain', '3.4: Healthy Market State Execution (Action = BET, Stake > 0)', () => {
    const res = autoBestService.evaluateAutoBestSelection('2026-10-04', { advisorCache: canonicalCache });
    assert.strictEqual(res.status, 'ACTIVE');
    assert.strictEqual(res.action, 'BET');
    assert(res.stakeK > 0, `Stake must be positive, got ${res.stakeK}`);
    assert(res.numbers.length >= 30, 'Numbers must be >= 30');
});

// ============================================================================
// 4. DYNAMIC PILLAR 1 ADOPTION IN crossHedgingPortfolioService
// ============================================================================
console.log('\n--- 4. DYNAMIC PILLAR 1 ADOPTION & HEDGING CONSERVATION LAWS ---');

challenge('Dynamic Pillar 1', '4.1: Pillar 1 Dynamically Adopts pentaCoreDe When Selected', () => {
    const mockCache = JSON.parse(JSON.stringify(canonicalCache));
    mockCache.autoBestSelection = {
        selectedMethod: 'pentaCoreDe',
        selectedMethodLabel: 'Đề Ngũ Tinh Consensus AI',
        status: 'ACTIVE',
        action: 'BET',
        numbers: Array.from({ length: 43 }, (_, i) => i + 5),
        vipNumbers: Array.from({ length: 17 }, (_, i) => i + 5),
        backupNumbers: Array.from({ length: 26 }, (_, i) => i + 22)
    };

    const dec = crossHedgingService.evaluateCrossAssetPortfolio('2026-10-04', [], mockCache);
    assert(dec.pillar1_De, 'Must contain pillar1_De');
    assert.strictEqual(dec.pillar1_De.methodId, 'pentaCoreDe');
    assert.strictEqual(dec.pillar1_De.vipNumbers.length, 17, 'Must preserve 17 VIP numbers');
});

challenge('Dynamic Pillar 1', '4.2: Pillar 1 Dynamically Adopts dePositionalGraphFlow When Selected', () => {
    const mockCache = JSON.parse(JSON.stringify(canonicalCache));
    mockCache.autoBestSelection = {
        selectedMethod: 'dePositionalGraphFlow',
        selectedMethodLabel: 'Cầu Đồ Thị Vị Trí GĐB',
        status: 'ACTIVE',
        action: 'BET',
        numbers: Array.from({ length: 43 }, (_, i) => (i * 2) % 100),
        vipNumbers: Array.from({ length: 17 }, (_, i) => (i * 2) % 100),
        backupNumbers: Array.from({ length: 26 }, (_, i) => ((i + 17) * 2) % 100)
    };

    const dec = crossHedgingService.evaluateCrossAssetPortfolio('2026-10-04', [], mockCache);
    assert(dec.pillar1_De, 'Must contain pillar1_De');
    assert.strictEqual(dec.pillar1_De.methodId, 'dePositionalGraphFlow');
});

challenge('Dynamic Pillar 1', '4.3: Pillar 1 Adopts Pool 7 Method with Quota Guard (17 VIP Promoted)', () => {
    const mockCache = JSON.parse(JSON.stringify(canonicalCache));
    mockCache.autoBestSelection = {
        selectedMethod: 'dedupEdge75Hold70',
        selectedMethodLabel: 'Đề Biên 75 Hold 70',
        status: 'ACTIVE',
        action: 'BET',
        numbers: Array.from({ length: 30 }, (_, i) => i * 3 % 100),
        vipNumbers: [],
        backupNumbers: Array.from({ length: 30 }, (_, i) => i * 3 % 100)
    };

    const dec = crossHedgingService.evaluateCrossAssetPortfolio('2026-10-04', [], mockCache);
    assert.strictEqual(dec.pillar1_De.methodId, 'dedupEdge75Hold70');
    assert.strictEqual(dec.pillar1_De.vipNumbers.length, 17, 'Quota guard must promote 17 numbers into VIP');
    assert.strictEqual(dec.pillar1_De.allNumbers.length, 30, 'Total numbers preserved');
    assert.strictEqual(dec.pillar1_De.stakeK, 64000, 'Stake must equal (17*3 + 13*1)*1000 = 64,000K');
});

challenge('Dynamic Pillar 1', '4.4: Financial Conservation Law on Draw 03/10/2026 Settlement', () => {
    const ch = canonicalCache.crossHedgingPortfolio;
    assert(ch?.settledLedger, 'Must have settledLedger');
    const oct3 = ch.settledLedger.find(r => r.date === '2026-10-03');
    assert(oct3, 'Must contain 2026-10-03 settled row');

    // Contract specifications:
    // special: 61
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
    assert.strictEqual(oct3.deProfitK + oct3.loProfitK + oct3.xienProfitK, oct3.totalProfitK,
        'Sum of pillar profits must strictly conserve and equal totalProfitK');
});

challenge('Dynamic Pillar 1', '4.5: Full 2026 Ledger Continuity: 272 Settled Draws', () => {
    const ch = canonicalCache.crossHedgingPortfolio;
    const ledger = ch.settledLedger;
    assert.strictEqual(ledger.length, 272, `settledLedger length must be 272, got ${ledger.length}`);

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
// 5. SNAPSHOT FREEZING & SSOT CACHE PARITY
// ============================================================================
console.log('\n--- 5. SNAPSHOT FREEZING & SSOT CACHE PARITY ---');

challenge('Snapshot Freezing', '5.1: SHA-256 Byte-for-Byte Cache Identity', () => {
    const p1 = path.resolve(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
    const p2 = path.resolve(__dirname, '../data/cached_daily_method_advisor.json');

    const h1 = crypto.createHash('sha256').update(fs.readFileSync(p1)).digest('hex');
    const h2 = crypto.createHash('sha256').update(fs.readFileSync(p2)).digest('hex');
    assert.strictEqual(h1, h2, `Files must have matching SHA-256: ${h1} !== ${h2}`);
});

challenge('Snapshot Freezing', '5.2: Locked Recommendation Invariant (Pre-18h15 === Post-18h40)', () => {
    const rawData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../lib/data/xsmb-2-digits.json'), 'utf8'));
    const lockedTime = new Date('2026-10-04T13:00:00+07:00'); // Locked after 12:00 PM
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
// SUMMARY & VERDICT
// ============================================================================
console.log('\n' + '='.repeat(85));
console.log(`  EMPIRICAL CHALLENGER REPORT: ${passedTests}/${totalTests} TESTS PASSED`);
if (failedTests > 0) {
    console.error(`  ❌ FAILED CHALLENGES: ${failedTests}`);
    failureDetails.forEach(f => {
        console.error(`    - [${f.suite}] ${f.name}: ${f.error}`);
    });
    console.log('  ⚠️ VERDICT: REQUEST_CHANGES');
    process.exit(1);
} else {
    console.log('  🎉 ALL 20 ADVERSARIAL CHALLENGES PASSED EMPIRICALLY WITH ZERO DEFECTS!');
    console.log('  VERDICT: APPROVE');
    console.log('='.repeat(85));
    process.exit(0);
}
