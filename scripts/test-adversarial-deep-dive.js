/**
 * scripts/test-adversarial-deep-dive.js
 *
 * Deep Dive Stress Testing for Challenger M1-1
 */

'use strict';

const assert = require('assert');
const dynamicDeSelector = require('../lib/services/dynamicDeSelectorService');

const {
    selectOptimalDeStrategy,
    evaluateSmartAbstainGate,
    evaluateCandidateQuantMetrics,
    computePITTransitionMetricsForLedger,
    computeWilsonScore95,
    computeDynamicBreakEven,
    computeExpectedProfitK,
    calculatePayoutAndProfitK,
    settleDynamicDeSelection
} = dynamicDeSelector;

console.log('--- DEEP DIVE TEST A: Anticipatory Router picks a candidate with Negative EV? ---');
const candPositive = {
    methodId: 'adaptiveDualMerge',
    category: 'elite',
    numbers: [1, 2, 3, 4, 5],
    vipNumbers: [1, 2],
    backupNumbers: [3, 4, 5],
    stakeK: 9000
};
const candNegative = {
    methodId: 'pentaCoreDe',
    category: 'elite',
    numbers: [10, 11, 12, 13, 14],
    vipNumbers: [10, 11],
    backupNumbers: [12, 13, 14],
    stakeK: 9000
};

// candPositive has strong historical positive EV
const priorStatsMap = {
    adaptiveDualMerge: { observations: 100, wins: 70, vipWins: 35 }, // EV positive
    pentaCoreDe: { observations: 100, wins: 1, vipWins: 0 }          // EV strongly negative
};

// But candPositive is on W3+ streak (fatigued), while candNegative is on L2 (rebound)
// In methodsLedgersMap, 50 wins for candNegative to make condProb >= 0.40?
// Wait, if candNegative has ledger with 50 wins in 100 trials, but priorStatsMap says wins=1:
// Let's see what happens if both ledger and priorStatsMap show candNegative having low wins (wins=1):
const methodsLedgersMap = {
    adaptiveDualMerge: [
        { isHit: true }, { isHit: true }, { isHit: true }, { isHit: true } // W4+
    ],
    pentaCoreDe: [
        { isHit: false }, { isHit: false } // L2
    ]
};

const resA = selectOptimalDeStrategy({
    targetDate: '2026-06-20',
    candidates: [candPositive, candNegative],
    priorStatsMap,
    methodsLedgersMap,
    currentChosenMethod: 'adaptiveDualMerge'
});

console.log('Result A action:', resA.action);
console.log('Result A selectedMethodId:', resA.selectedMethodId);
console.log('Result A expectedProfitK:', resA.evMetrics.expectedProfitK);
console.log('Result A wilsonLower95:', resA.evMetrics.wilsonLower95);
console.log('Result A breakEven:', resA.evMetrics.breakEvenHitRate);

console.log('\n--- DEEP DIVE TEST B: Null candidate in candidates array ---');
try {
    const resB = selectOptimalDeStrategy({
        targetDate: '2026-06-20',
        candidates: [null, candPositive]
    });
    console.log('Result B without throw:', resB.action);
} catch (e) {
    console.log('Result B caught error:', e.message);
}

console.log('\n--- DEEP DIVE TEST C: What if all candidates have Wilson < BreakEven? ---');
const candBorderline = {
    methodId: 'dualMerge',
    category: 'elite',
    numbers: [1, 2, 3],
    vipNumbers: [1],
    backupNumbers: [2, 3],
    stakeK: 50000
};
// stake 50000, payout 84000 -> breakEven = 50000 / 84000 = 0.5952
// observations = 10, wins = 5 (win rate 50%, EV might look okay with priors, but Wilson 95% is ~0.237 < 0.5952)
const resC = evaluateSmartAbstainGate({
    targetDate: '2026-06-20',
    candidates: [candBorderline],
    priorStatsMap: {
        dualMerge: { observations: 10, wins: 5, vipWins: 2 }
    }
});
console.log('Result C action:', resC.action);
console.log('Result C triggeredConditions:', resC.abstainGate.triggeredConditions);

console.log('\n--- DEEP DIVE TEST D: Large-scale Walk-Forward Simulation Check ---');
const fs = require('fs');
const path = require('path');
const rawDataPath = path.resolve(__dirname, '../lib/data/xsmb-2-digits.json');
if (fs.existsSync(rawDataPath)) {
    const rawData = JSON.parse(fs.readFileSync(rawDataPath, 'utf8'));
    console.log('XSMB total draws in dataset:', rawData.length);
    const d2026 = rawData.filter(d => d.date && d.date.startsWith('2026'));
    console.log('2026 draws count:', d2026.length);
} else {
    console.log('Raw data file not found at:', rawDataPath);
}
