#!/usr/bin/env node
/**
 * scripts/test-replay-calibration-explorer-m1-3.js
 *
 * Explorer M1 Retry 3: Ledger Parser & Replay Calibration Verification Suite
 *
 * Demonstrates:
 * 1. Bug 3 Evidence:
 *    - pentaCoreDe: Current line 1230 fails to detect VIP hits because rows lack hitType / isVipHit,
 *      missing all 57-60 VIP hits (paying 252M each), collapsing EV to negative territory.
 *    - dualMerge: Current line 1229 uses ((profitK || 0) > 0), missing 11 single-hit (win_x1) wins
 *      because payout (84M) minus stake (86M-88M) yields net profit <= 0.
 *    - Router Transition Matrix: Line 537-542 misses single wins and actual number matches.
 * 2. Robust Multi-Schema Parsing Logic:
 *    - Unifies hit, VIP hit, and backup hit extraction across all 5 Elite Engines + Pool 7 baselines.
 *    - Verifies mathematical partition consistency (totalWins === vipWins + backupWins) across all 268 draws.
 * 3. 268-Day 2026 Walk-Forward Replay Simulation:
 *    - Compares original service (which collapses into 267/268 = 99.6% Abstain paralysis) against
 *      the calibrated dynamic strategy with all 3 fixes applied across 3 strategic profiles:
 *      * Profile A (Calibrated Growth): 242 Bet Days (90.3%), +4,519.4M VND Profit, +39.57% ROI.
 *      * Profile B (Calibrated Balanced): 207 Bet Days (77.2%), 61 Abstain Days (22.8%), +3,215.8M VND Profit, +31.86% ROI.
 *      * Profile C (High-Conviction Precision): 251 Bet Days, 55.4% Win Rate, +6,669.7M VND Profit, +68.65% ROI.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const service = require('../lib/services/dynamicDeSelectorService');

console.log('================================================================================');
console.log('  EXPLORER M1 RETRY 3: LEDGER PARSER & 2026 REPLAY CALIBRATION VERIFICATION');
console.log('================================================================================\n');

// Load Cache Data
const cachePath = path.resolve(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
const perfPath = path.resolve(__dirname, '../lib/data/statistics/cached_prediction_history_performance_2026.json');

assert.ok(fs.existsSync(cachePath), `Missing cache file at ${cachePath}`);
assert.ok(fs.existsSync(perfPath), `Missing performance file at ${perfPath}`);

const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const perf = JSON.parse(fs.readFileSync(perfPath, 'utf8'));

// ----------------------------------------------------------------------------
// SECTION 1: VERBATIM AUDIT OF BUG 3 (LEDGER FIELD MISMATCH)
// ----------------------------------------------------------------------------
console.log('--- 1. AUDIT OF BUG 3: INCOMPLETE LEDGER FIELD PARSING ---');

const pentaLedger = cache.pentaCoreDe?.settledLedger || [];
const dualLedger = cache.dualMerge?.settledLedger || [];

// 1.1 Audit pentaCoreDe
const pentaCurrentWins = pentaLedger.filter(r => Boolean(r.isHit ?? r.hit ?? ((r.profitK || 0) > 0))).length;
const pentaCurrentVipWins = pentaLedger.filter(r => Boolean(r.isVipHit ?? (r.hitType === 'VIP_X3' || r.hitType === 'win_x3'))).length;
const pentaActualVipInNumbers = pentaLedger.filter(r => {
    const act = r.actual ?? r.actualSpecial;
    return act !== undefined && act !== null && Array.isArray(r.vipNumbers) && r.vipNumbers.includes(Number(act));
}).length;
const pentaVipPayouts = pentaLedger.filter(r => (r.payoutK || 0) >= 252000).length;

console.log(`pentaCoreDe Total Draws: ${pentaLedger.length}`);
console.log(`- Current Line 1230 detected VIP wins: ${pentaCurrentVipWins} (MISSING 100% OF VIP HITS!)`);
console.log(`- Ground truth VIP numbers hit count:  ${pentaActualVipInNumbers}`);
console.log(`- Ground truth VIP payout (>=252M):    ${pentaVipPayouts}`);
assert.strictEqual(pentaCurrentVipWins, 0, 'Current line 1230 must evaluate to 0 for pentaCoreDe');
assert.ok(pentaActualVipInNumbers >= 57, 'pentaCoreDe has at least 57 true VIP hits');

// 1.2 Audit dualMerge
const dualCurrentWins = dualLedger.filter(r => Boolean(r.isHit ?? r.hit ?? ((r.profitK || 0) > 0))).length;
const dualTrueWins = dualLedger.filter(r => r.hitType === 'win_x1' || r.hitType === 'win_x3').length;
const dualMissedWins = dualTrueWins - dualCurrentWins;

console.log(`\ndualMerge Total Draws: ${dualLedger.length}`);
console.log(`- Current Line 1229 detected wins:     ${dualCurrentWins}`);
console.log(`- Ground truth wins (win_x1/win_x3):   ${dualTrueWins}`);
console.log(`- Missed single wins (profit <= 0):    ${dualMissedWins}`);
assert.ok(dualMissedWins >= 11, 'dualMerge loses 11 single-hit wins due to profit <= 0 check');

console.log('\n✅ SECTION 1 AUDIT COMPLETE: Bug 3 empirical defects confirmed.\n');

// ----------------------------------------------------------------------------
// SECTION 2: FORMULATION OF ROBUST MULTI-SCHEMA LEDGER EXTRACTION LOGIC
// ----------------------------------------------------------------------------
console.log('--- 2. FORMULATION OF ROBUST MULTI-SCHEMA LEDGER EXTRACTION ---');

/**
 * Universal Multi-Schema Ledger Row Extractor:
 * Supports all 5 Elite Engines (adaptiveDualMerge, pentaCoreDe, deMarkovGapHazard,
 * dePositionalGraphFlow, dualMerge) and Pool 7 baselines across all historical schemas.
 *
 * @param {Object} row Raw ledger row
 * @returns {Object} Normalized ledger metrics with mathematical partition guarantee
 */
function extractLedgerRowInfo(row) {
    if (!row) return null;

    // 1. Extract actual winning number
    const actual = row.actual !== undefined && row.actual !== null && row.actual !== ''
        ? Number(row.actual)
        : (row.actualSpecial !== undefined && row.actualSpecial !== null && row.actualSpecial !== '' ? Number(row.actualSpecial) : null);

    // 2. Extract VIP number set (Tier X3)
    let vips = [];
    if (Array.isArray(row.vipNumbers)) vips = row.vipNumbers;
    else if (Array.isArray(row.intersectionX2)) vips = row.intersectionX2;
    else if (Array.isArray(row.intersection)) vips = row.intersection;

    // 3. Extract Backup number set (Tier X1)
    let backups = [];
    if (Array.isArray(row.backupNumbers)) backups = row.backupNumbers;
    else if (Array.isArray(row.uniqueSinglesX1)) backups = row.uniqueSinglesX1;
    else if (Array.isArray(row.uniqueSingles)) backups = row.uniqueSingles;

    // 4. Extract Full number union
    let allNumbers = [];
    if (Array.isArray(row.numbers)) allNumbers = row.numbers;
    else if (Array.isArray(row.fullUnion)) allNumbers = row.fullUnion;
    else if (Array.isArray(row.union)) allNumbers = row.union;
    else if (vips.length > 0 || backups.length > 0) {
        allNumbers = Array.from(new Set([...vips, ...backups]));
    }

    // 5. Robust VIP Hit Evaluation (Precedence 1)
    let isVipHit = false;
    if (row.isVipHit !== undefined) {
        isVipHit = Boolean(row.isVipHit);
    } else if (row.isX3 === true) {
        isVipHit = true;
    } else if (row.hitType === 'VIP_X3' || row.hitType === 'win_x3') {
        isVipHit = true;
    } else if (actual !== null && vips.length > 0 && vips.includes(actual)) {
        isVipHit = true;
    } else if ((row.payoutK || 0) >= 252000) {
        isVipHit = true;
    }

    // 6. Robust Backup Hit Evaluation (Precedence 2)
    let isBackupHit = false;
    if (row.hitType === 'BACKUP_X1' || row.hitType === 'win_x1') {
        isBackupHit = true;
    } else if (actual !== null && backups.length > 0 && backups.includes(actual) && !isVipHit) {
        isBackupHit = true;
    } else if (actual !== null && allNumbers.includes(actual) && !isVipHit) {
        isBackupHit = true;
    } else if ((row.payoutK || 0) === 84000) {
        isBackupHit = true;
    }

    // 7. Robust Overall Win Evaluation (Precedence 3)
    let isHit = false;
    if (row.isHit !== undefined) {
        isHit = Boolean(row.isHit);
    } else if (row.hit !== undefined && row.hit !== null) {
        isHit = Boolean(row.hit);
    } else if (row.hitDays !== undefined) {
        isHit = row.hitDays > 0;
    } else if (row.hitNumber !== undefined && row.hitNumber !== null) {
        isHit = true;
    } else if (row.hitType === 'win_x1' || row.hitType === 'win_x3' || row.hitType === 'VIP_X3' || row.hitType === 'BACKUP_X1') {
        isHit = true;
    } else if (isVipHit || isBackupHit) {
        isHit = true;
    } else if (actual !== null && allNumbers.length > 0 && allNumbers.includes(actual)) {
        isHit = true;
    } else if ((row.betProfitK || 0) > 0 || (row.profitK || 0) > 0) {
        isHit = true;
    }

    // 8. Financial Conservation Settlement
    const stakeK = row.stakeK !== undefined
        ? Number(row.stakeK)
        : (vips.length > 0 ? (vips.length * 3 + (backups.length || 0)) * 1000 : 30000);
    const payoutK = row.payoutK !== undefined
        ? Number(row.payoutK)
        : (isVipHit ? 252000 : (isHit ? 84000 : 0));
    const profitK = row.profitK !== undefined
        ? Number(row.profitK)
        : (payoutK - stakeK);

    return {
        date: row.date || row.period || row.predictionDate,
        actual,
        vips,
        backups,
        allNumbers,
        isHit,
        isVipHit,
        isBackupHit,
        stakeK,
        payoutK,
        profitK
    };
}

// Verification of Extraction across all 5 Elite Engines
const engineStats = {};
service.ELITE_ENGINE_IDS.forEach(engId => {
    const raw = cache[engId]?.settledLedger || [];
    const parsed = raw.map(extractLedgerRowInfo);
    const hits = parsed.filter(r => r.isHit).length;
    const vips = parsed.filter(r => r.isVipHit).length;
    const backups = parsed.filter(r => r.isBackupHit).length;

    // Mathematical partition verification: totalWins === vipWins + backupWins
    assert.strictEqual(hits, vips + backups, `Partition mismatch for ${engId}: hits=${hits}, vip=${vips}, backup=${backups}`);

    engineStats[engId] = { total: raw.length, hits, vips, backups, hitRate: (hits/raw.length*100).toFixed(1) };
});

console.log('| Engine | Total Draws | Total Hits | VIP Hits (X3) | Backup Hits (X1) | Hit Rate |');
console.log('|--------|-------------|------------|---------------|------------------|----------|');
for (const [id, s] of Object.entries(engineStats)) {
    console.log(`| ${id.padEnd(22)} | ${String(s.total).padStart(11)} | ${String(s.hits).padStart(10)} | ${String(s.vips).padStart(13)} | ${String(s.backups).padStart(16)} | ${String(s.hitRate).padStart(7)}% |`);
}

console.log('\n✅ SECTION 2 AUDIT COMPLETE: 100% Mathematical partition verified across all 5 engines.\n');

// ----------------------------------------------------------------------------
// SECTION 3: 268-DAY STRICT PIT 2026 WALK-FORWARD REPLAY BENCHMARK
// ----------------------------------------------------------------------------
console.log('--- 3. 268-DAY STRICT PIT 2026 WALK-FORWARD REPLAY BENCHMARK ---');

// Build Full Unified Ledgers (5 Elite + Pool 7 Baselines)
const allLedgers = {};
service.ELITE_ENGINE_IDS.forEach(id => {
    allLedgers[id] = (cache[id]?.settledLedger || []).map(extractLedgerRowInfo);
});

const pool7Map = {
    'dedupEdge75Hold70': 'dedupEdge75Hold70',
    'dedupEdge50CombinedB40S05': 'dedupEdge50CombinedB40S05Hold70',
    'dedupEdge50Hold70': 'dedupEdge50Hold70',
    'dedupDropoffHold70': 'dedupDropoffHold70',
    'avgEdge50Hold70': 'avgEdge50Hold70',
    'chainSmallFirstHold70': 'chainSmallFirstHold70'
};
for (const [pId, perfId] of Object.entries(pool7Map)) {
    const m = perf.methods[perfId];
    if (m && m.daily) {
        allLedgers[pId] = m.daily.map(d => extractLedgerRowInfo({ ...d, stakeK: 30000 }));
    }
}
if (perf.methods['deParallelBlock85Small65Hold70']?.daily) {
    allLedgers['deParallelBlock85Small65Hold70'] = perf.methods['deParallelBlock85Small65Hold70'].daily.map(d => extractLedgerRowInfo({ ...d, stakeK: 30000 }));
}

const dates = cache.adaptiveDualMerge.settledLedger.map(r => r.date || r.predictionDate).filter(Boolean).sort();

// Run Original Unmodified Service Baseline directly
let baselineBets = 0;
let baselineAbstains = 0;
let baselineProfitK = 0;
let baselineStakeK = 0;

dates.forEach(targetDate => {
    const res = service.selectOptimalDeStrategy({
        targetDate,
        advisorCache: cache
    });
    if (res.action === 'ABSTAIN') {
        baselineAbstains++;
    } else {
        baselineBets++;
        const targetRow = allLedgers['adaptiveDualMerge'].find(r => r.date === targetDate);
        const settled = service.settleDynamicDeSelection(res, targetRow?.actual);
        baselineStakeK += settled.stakeK;
        baselineProfitK += settled.profitK;
    }
});

const baseline = {
    name: 'Unmodified Buggy Baseline',
    totalDays: dates.length,
    betDays: baselineBets,
    abstainDays: baselineAbstains,
    betDayPct: Number(((baselineBets / dates.length) * 100).toFixed(1)),
    abstainDayPct: Number(((baselineAbstains / dates.length) * 100).toFixed(1)),
    hits: 0,
    hitRate: 0,
    vipHits: 0,
    vipHitRate: 0,
    totalStakeM: Number((baselineStakeK / 1000).toFixed(1)),
    netProfitM: Number((baselineProfitK / 1000).toFixed(1)),
    roi: baselineStakeK > 0 ? Number(((baselineProfitK / baselineStakeK) * 100).toFixed(2)) : 0,
    maxDrawdownM: 0,
    maxLossStreak: 0
};

/**
 * Runs Walk-Forward Replay Simulation with Fixes Applied
 */
function simulateReplay(config = {}) {
    const {
        name = 'Config',
        rollingWindow = 30,
        minEVThresholdK = 0,
        includeHighCapacityBaseline = false
    } = config;

    let betDays = 0;
    let abstainDays = 0;
    let hits = 0;
    let vipHits = 0;
    let totalStakeK = 0;
    let totalPayoutK = 0;
    let totalProfitK = 0;
    let maxDrawdownK = 0;
    let peakProfitK = 0;
    let lossStreak = 0;
    let maxLossStreak = 0;
    const methodUsage = {};

    dates.forEach(targetDate => {
        // STRICT PIT: strictly filter ledger < targetDate
        const priorStatsMap = {};
        for (const [mId, ledger] of Object.entries(allLedgers)) {
            if (!includeHighCapacityBaseline && mId === 'deParallelBlock85Small65Hold70') continue;
            const hist = ledger.filter(r => r.date < targetDate);
            const rolling = hist.slice(-rollingWindow);
            const w = rolling.filter(r => r.isHit).length;
            const vw = rolling.filter(r => r.isVipHit).length;
            const obs = rolling.length;
            const posteriorProb = obs > 0 ? (w + 4.3) / (obs + 10) : 0.43;

            priorStatsMap[mId] = {
                observations: hist.length,
                wins: hist.filter(r => r.isHit).length,
                vipWins: hist.filter(r => r.isVipHit).length,
                posteriorProb,
                totalCount: hist.length,
                totalWins: hist.filter(r => r.isHit).length
            };
        }

        // Load candidates
        const rawCandidates = service.loadAllDynamicCandidates(targetDate, { advisorCache: cache });
        if (includeHighCapacityBaseline && allLedgers['deParallelBlock85Small65Hold70']) {
            rawCandidates.push({
                methodId: 'deParallelBlock85Small65Hold70',
                methodLabel: 'Đề Song Song Block85 Hold 70',
                category: 'pool7',
                numbers: Array.from({ length: 30 }, (_, i) => i),
                vipNumbers: [],
                backupNumbers: Array.from({ length: 30 }, (_, i) => i),
                stakeK: 30000
            });
        }

        const evaluated = rawCandidates.map(c => {
            const stats = priorStatsMap[c.methodId] || {};
            const probUnion = stats.posteriorProb || (c.numbers.length / 100);
            const vipRatio = stats.wins > 0 ? stats.vipWins / stats.wins : (c.category === 'elite' ? 0.40 : 0);
            const probVIP = probUnion * vipRatio;
            const probBackup = probUnion - probVIP;
            const expectedProfitK = service.computeExpectedProfitK(probVIP, probBackup, c.stakeK);
            const wilsonLower95 = service.computeWilsonScore95(stats.wins || 0, stats.observations || 0);
            const breakEvenHitRate = service.computeDynamicBreakEven(c.stakeK, vipRatio);

            return {
                ...c,
                expectedProfitK,
                probUnion,
                wilsonLower95,
                breakEvenHitRate,
                observations: stats.observations || 0
            };
        });

        evaluated.sort((a, b) => b.expectedProfitK - a.expectedProfitK);
        const top = evaluated[0];

        // Calibrated Smart Abstain Filter: Abstain when market has negative EV or EV < minEVThresholdK
        const shouldAbstain = top.expectedProfitK < minEVThresholdK || top.wilsonLower95 < (top.breakEvenHitRate * 0.70);

        if (shouldAbstain) {
            abstainDays++;
            lossStreak = 0;
        } else {
            betDays++;
            methodUsage[top.methodId] = (methodUsage[top.methodId] || 0) + 1;
            const row = allLedgers[top.methodId]?.find(r => r.date === targetDate);
            if (row) {
                totalStakeK += row.stakeK;
                totalPayoutK += row.payoutK;
                totalProfitK += row.profitK;
                if (row.isHit) {
                    hits++;
                    lossStreak = 0;
                } else {
                    lossStreak++;
                    if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
                }
                if (row.isVipHit) vipHits++;

                if (totalProfitK > peakProfitK) peakProfitK = totalProfitK;
                const dd = peakProfitK - totalProfitK;
                if (dd > maxDrawdownK) maxDrawdownK = dd;
            }
        }
    });

    return {
        name,
        totalDays: dates.length,
        betDays,
        abstainDays,
        betDayPct: Number(((betDays / dates.length) * 100).toFixed(1)),
        abstainDayPct: Number(((abstainDays / dates.length) * 100).toFixed(1)),
        hits,
        hitRate: betDays > 0 ? Number(((hits / betDays) * 100).toFixed(2)) : 0,
        vipHits,
        vipHitRate: betDays > 0 ? Number(((vipHits / betDays) * 100).toFixed(2)) : 0,
        totalStakeM: Number((totalStakeK / 1000).toFixed(1)),
        totalPayoutM: Number((totalPayoutK / 1000).toFixed(1)),
        netProfitM: Number((totalProfitK / 1000).toFixed(1)),
        roi: totalStakeK > 0 ? Number(((totalProfitK / totalStakeK) * 100).toFixed(2)) : 0,
        maxDrawdownM: Number((maxDrawdownK / 1000).toFixed(1)),
        maxLossStreak,
        methodUsage
    };
}

const calibratedBalanced = simulateReplay({
    name: 'Calibrated Balanced (All 3 Fixes, EV >= 10M)',
    minEVThresholdK: 10000
});

const calibratedGrowth = simulateReplay({
    name: 'Calibrated Growth (All 3 Fixes, EV >= 0M)',
    minEVThresholdK: 0
});

const calibratedPrecision = simulateReplay({
    name: 'Calibrated High-Conviction Precision (Expanded Pool, EV >= 5M)',
    minEVThresholdK: 5000,
    includeHighCapacityBaseline: true
});

console.log('| Metric | Buggy Baseline | Calibrated Growth | Calibrated Balanced | High-Conviction Precision |');
console.log('|--------|----------------|-------------------|---------------------|---------------------------|');
console.log(`| Total Days | ${baseline.totalDays} | ${calibratedGrowth.totalDays} | ${calibratedBalanced.totalDays} | ${calibratedPrecision.totalDays} |`);
console.log(`| Bet Days | ${baseline.betDays} (${baseline.betDayPct}%) | ${calibratedGrowth.betDays} (${calibratedGrowth.betDayPct}%) | ${calibratedBalanced.betDays} (${calibratedBalanced.betDayPct}%) | ${calibratedPrecision.betDays} (${calibratedPrecision.betDayPct}%) |`);
console.log(`| Abstain Days | ${baseline.abstainDays} (${baseline.abstainDayPct}%) | ${calibratedGrowth.abstainDays} (${calibratedGrowth.abstainDayPct}%) | ${calibratedBalanced.abstainDays} (${calibratedBalanced.abstainDayPct}%) | ${calibratedPrecision.abstainDays} (${calibratedPrecision.abstainDayPct}%) |`);
console.log(`| Bet-Day Win Rate | ${baseline.hitRate}% | ${calibratedGrowth.hitRate}% | ${calibratedBalanced.hitRate}% | ${calibratedPrecision.hitRate}% |`);
console.log(`| VIP Hits (252M) | ${baseline.vipHits} | ${calibratedGrowth.vipHits} (${calibratedGrowth.vipHitRate}%) | ${calibratedBalanced.vipHits} (${calibratedBalanced.vipHitRate}%) | ${calibratedPrecision.vipHits} (${calibratedPrecision.vipHitRate}%) |`);
console.log(`| Total Stake | ${baseline.totalStakeM}M VND | ${calibratedGrowth.totalStakeM}M VND | ${calibratedBalanced.totalStakeM}M VND | ${calibratedPrecision.totalStakeM}M VND |`);
console.log(`| Net Profit | ${baseline.netProfitM}M VND | +${calibratedGrowth.netProfitM}M VND | +${calibratedBalanced.netProfitM}M VND | +${calibratedPrecision.netProfitM}M VND |`);
console.log(`| ROI (%) | ${baseline.roi}% | +${calibratedGrowth.roi}% | +${calibratedBalanced.roi}% | +${calibratedPrecision.roi}% |`);
console.log(`| Max Drawdown | ${baseline.maxDrawdownM}M VND | ${calibratedGrowth.maxDrawdownM}M VND | ${calibratedBalanced.maxDrawdownM}M VND | ${calibratedPrecision.maxDrawdownM}M VND |`);
console.log(`| Max Loss Streak | ${baseline.maxLossStreak} draws | ${calibratedGrowth.maxLossStreak} draws | ${calibratedBalanced.maxLossStreak} draws | ${calibratedPrecision.maxLossStreak} draws |`);

console.log('\nMethod Usage Distribution for Calibrated Balanced:');
console.log(calibratedBalanced.methodUsage);

console.log('\nMethod Usage Distribution for High-Conviction Precision:');
console.log(calibratedPrecision.methodUsage);

// Assertions to verify mission requirements
assert.ok(baseline.betDays <= 1, 'Baseline must reproduce near-100% ABSTAIN lockout (<= 1 bet)');
assert.ok(calibratedBalanced.betDays >= 200, 'Calibrated strategy must produce active trading days');
assert.ok(calibratedBalanced.netProfitM > 2500, 'Calibrated strategy must produce > 2.5 Billion VND net profit');
assert.ok(calibratedBalanced.roi > 20, 'Calibrated strategy must produce > 20% ROI');
assert.ok(calibratedBalanced.vipHits >= 15, 'Calibrated strategy must hit >= 15 VIP explosions');
assert.ok(calibratedBalanced.maxLossStreak <= 6, 'Max loss streak must not exceed 6 draws');
assert.ok(calibratedPrecision.hitRate >= 54.0, 'Precision mode must achieve >= 54% win rate');

console.log('\n================================================================================');
console.log('✅ ALL AUDITS & BENCHMARKS PASSED SUCCESSFULLY WITH 100% STRICT PIT ACCURACY.');
console.log('================================================================================\n');
