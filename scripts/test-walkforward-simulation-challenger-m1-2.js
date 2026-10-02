#!/usr/bin/env node
/**
 * scripts/test-walkforward-simulation-challenger-m1-2.js
 *
 * Empirical 268-Day Walk-Forward Simulation for Challenger M1-2:
 * Evaluates real-data router transitions, proactive rebound swaps,
 * anti-churning retention, and Schmitt-trigger hysteresis stability.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const service = require('../lib/services/dynamicDeSelectorService');

const cachePath = path.resolve(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
if (!fs.existsSync(cachePath)) {
    console.error('Cache not found at', cachePath);
    process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

// Extract dates from adaptiveDualMerge settledLedger
const dates = cache.adaptiveDualMerge.settledLedger.map(r => r.date || r.predictionDate).filter(Boolean);
dates.sort();

console.log(`\n================================================================================`);
console.log(`  268-DAY REAL-DATA WALK-FORWARD ROUTER & HYSTERESIS AUDIT (${dates[0]} to ${dates[dates.length - 1]})`);
console.log(`================================================================================\n`);

let currentMethod = null;
let governorState = { state: 'ACTIVE_BET', consecutiveAbstains: 0, cumulativePreservedK: 0 };

let totalDays = 0;
let betDays = 0;
let abstainDays = 0;
let totalSwitches = 0;
let proactiveSwaps = 0;
let antiChurnHolds = 0;
let momentumRuns = 0;
let reboundMomentums = 0;

let totalStakeK = 0;
let totalPayoutK = 0;
let totalProfitK = 0;
let totalHits = 0;
let totalVipHits = 0;

let prevAction = null;
let actionSwitches = 0; // Alternating BET <-> ABSTAIN
const methodUsage = {};
const switchTimeline = [];

// For PIT tracking, maintain historical settled records per method
const runningLedgers = {};
service.ALL_CANDIDATE_IDS.forEach(id => {
    runningLedgers[id] = [];
});

// Pre-fill cache ledgers for elite engines up to each date
const engineLedgers = {};
service.ELITE_ENGINE_IDS.forEach(id => {
    engineLedgers[id] = cache[id]?.settledLedger || [];
});

dates.forEach((targetDate, dayIdx) => {
    totalDays++;

    // Build methodsLedgersMap using strictly data before targetDate
    const methodsLedgersMap = {};
    service.ELITE_ENGINE_IDS.forEach(id => {
        methodsLedgersMap[id] = engineLedgers[id].filter(r => (r.date < targetDate || r.predictionDate < targetDate));
    });

    // Populate priorStatsMap
    const priorStatsMap = {};
    for (const [id, ledger] of Object.entries(methodsLedgersMap)) {
        if (ledger.length > 0) {
            const wins = ledger.filter(r => Boolean(r.isHit ?? r.hit ?? ((r.profitK || 0) > 0))).length;
            const vipWins = ledger.filter(r => Boolean(r.isVipHit ?? (r.hitType === 'VIP_X3'))).length;
            priorStatsMap[id] = {
                observations: ledger.length,
                wins,
                vipWins,
                totalCount: ledger.length,
                totalWins: wins
            };
        }
    }

    // Call selectOptimalDeStrategy
    const selection = service.selectOptimalDeStrategy({
        targetDate,
        advisorCache: cache,
        currentChosenMethod: currentMethod,
        priorGovernorState: governorState,
        methodsLedgersMap,
        priorStatsMap
    });

    // Track action switching (BET <-> ABSTAIN)
    if (prevAction && prevAction !== selection.action) {
        actionSwitches++;
    }
    prevAction = selection.action;

    // Update governorState
    governorState = {
        state: selection.abstainGate.governorState,
        consecutiveAbstains: selection.abstainGate.consecutiveAbstains,
        cumulativePreservedK: selection.abstainGate.cumulativeCapitalPreservedK
    };

    if (selection.action === 'ABSTAIN') {
        abstainDays++;
    } else {
        betDays++;
        methodUsage[selection.selectedMethodId] = (methodUsage[selection.selectedMethodId] || 0) + 1;

        if (currentMethod && currentMethod !== selection.selectedMethodId) {
            totalSwitches++;
            const rule = selection.routerTelemetry?.ruleTriggered || 'MANUAL_OR_GOVERNOR';
            switchTimeline.push({
                date: targetDate,
                from: currentMethod,
                to: selection.selectedMethodId,
                phase: selection.switchPhase,
                rule,
                reason: selection.switchReason
            });

            if (rule === 'PROACTIVE_REBOUND_SWAP') proactiveSwaps++;
        }

        if (selection.routerTelemetry?.ruleTriggered === 'ANTI_CHURN_HOLD') {
            antiChurnHolds++;
        } else if (selection.routerTelemetry?.ruleTriggered === 'MOMENTUM_RUN') {
            momentumRuns++;
        } else if (selection.routerTelemetry?.ruleTriggered === 'REBOUND_MOMENTUM') {
            reboundMomentums++;
        }

        currentMethod = selection.selectedMethodId;
    }

    // Settle with actual special for targetDate from targetRow
    const targetRow = cache.adaptiveDualMerge.settledLedger.find(r => (r.date === targetDate || r.predictionDate === targetDate));
    const actualSpecial = targetRow?.actualSpecial;

    const settled = service.settleDynamicDeSelection(selection, actualSpecial);
    totalStakeK += settled.stakeK;
    totalPayoutK += settled.payoutK;
    totalProfitK += settled.profitK;
    if (settled.hit) totalHits++;
    if (settled.isVipHit) totalVipHits++;
});

console.log(`[Summary Over ${totalDays} Trading Days]:`);
console.log(`- Bet Days: ${betDays} (${((betDays / totalDays) * 100).toFixed(1)}%)`);
console.log(`- Abstain Days: ${abstainDays} (${((abstainDays / totalDays) * 100).toFixed(1)}%)`);
console.log(`- Total Action Switches (BET <-> ABSTAIN): ${actionSwitches}`);
console.log(`- Total Method Switches: ${totalSwitches} (${((totalSwitches / betDays) * 100).toFixed(1)}% switch rate)`);
console.log(`- Proactive Rebound Swaps: ${proactiveSwaps}`);
console.log(`- Anti-Churn Holds: ${antiChurnHolds}`);
console.log(`- Method Usage Breakdown:`, methodUsage);
console.log(`- Total Stake: ${(totalStakeK / 1000).toLocaleString('en-US')}M VND`);
console.log(`- Total Payout: ${(totalPayoutK / 1000).toLocaleString('en-US')}M VND`);
console.log(`- Net Profit: ${(totalProfitK / 1000).toLocaleString('en-US')}M VND`);
console.log(`- ROI: ${totalStakeK > 0 ? ((totalProfitK / totalStakeK) * 100).toFixed(2) : 0}%`);
console.log(`- Bet-day Win Rate: ${betDays > 0 ? ((totalHits / betDays) * 100).toFixed(2) : 0}% (${totalHits}/${betDays})`);
console.log(`- VIP Hits: ${totalVipHits} (${betDays > 0 ? ((totalVipHits / betDays) * 100).toFixed(2) : 0}%)`);

if (switchTimeline.length > 0) {
    console.log(`\nSample Switches (first 10):`);
    switchTimeline.slice(0, 10).forEach(s => {
        console.log(`  [${s.date}] ${s.from} -> ${s.to} (${s.rule}, ${s.phase})`);
    });
}
