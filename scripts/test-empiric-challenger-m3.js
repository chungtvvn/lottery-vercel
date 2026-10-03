#!/usr/bin/env node
/**
 * scripts/test-empiric-challenger-m3.js
 *
 * Dedicated Empirical Challenger Test Harness for Milestone 3
 * Author: challenger_m3_orch5_2
 *
 * Exhaustively challenges:
 * 1. SHA-256 Byte Parity across both cache locations
 * 2. Complete, untruncated 18-draw coverage (16/09/2026 - 03/10/2026) in renderMethodPlaySlipHistory
 *    for both deMarkovGapHazard and crossHedging
 * 3. SnapshotLock invariant state machine:
 *    - Pre-12:00 unlocked
 *    - 12:00 to 18:40 immutable lock
 *    - Post-18:40 settlement suppresses lock banner
 * 4. SSOT autoBestSelection schema and PIT metrics integrity
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    failures: []
};

function test(description, fn) {
    stats.total++;
    try {
        fn();
        stats.passed++;
        console.log(`  ✓ [PASS] ${description}`);
    } catch (err) {
        stats.failed++;
        stats.failures.push({ description, error: err.message });
        console.error(`  ✗ [FAIL] ${description}`);
        console.error(`    ${err.message}`);
        if (err.stack) console.error(err.stack);
    }
}

const ROOT_DIR = path.resolve(__dirname, '..');
const CACHE_1 = path.join(ROOT_DIR, 'data', 'cached_daily_method_advisor.json');
const CACHE_2 = path.join(ROOT_DIR, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'daily-advisor.js');
const WORKER_PATH = path.join(ROOT_DIR, 'workers', 'daily-update-dispatcher', 'src', 'index.js');
const LOCK_GUARD_PATH = path.join(ROOT_DIR, 'lib', 'utils', 'predictionLockGuard.js');

console.log('='.repeat(80));
console.log('🧪 EMPIRICAL CHALLENGER: MILESTONE 3 INVARIANT & SYNC HARNESS');
console.log('='.repeat(80));

// =========================================================================
// SUITE 1: SHA-256 BYTE PARITY VERIFICATION
// =========================================================================
console.log('\n--- SUITE 1: SHA-256 Byte Parity of Cache Files ---');

let rawCache1, rawCache2, hash1, hash2;
test('Both cache files exist and are readable', () => {
    assert.ok(fs.existsSync(CACHE_1), 'data/cached_daily_method_advisor.json must exist');
    assert.ok(fs.existsSync(CACHE_2), 'lib/data/statistics/cached_daily_method_advisor.json must exist');
    rawCache1 = fs.readFileSync(CACHE_1);
    rawCache2 = fs.readFileSync(CACHE_2);
});

test('Byte length matches identically', () => {
    assert.strictEqual(rawCache1.length, rawCache2.length, `Byte lengths must match: ${rawCache1.length} vs ${rawCache2.length}`);
});

test('SHA-256 cryptographic hashes match identically', () => {
    hash1 = crypto.createHash('sha256').update(rawCache1).digest('hex');
    hash2 = crypto.createHash('sha256').update(rawCache2).digest('hex');
    console.log(`    Hash 1: ${hash1}`);
    console.log(`    Hash 2: ${hash2}`);
    assert.strictEqual(hash1, hash2, 'SHA-256 hashes must be identical');
});

// Parse cache object
const cache = JSON.parse(rawCache1.toString('utf8'));

// =========================================================================
// SUITE 2: MODAL SLIP HISTORY COVERAGE & NON-TRUNCATION
// =========================================================================
console.log('\n--- SUITE 2: Modal Slip History Coverage (16/09 to 03/10) ---');

const jsCode = fs.readFileSync(JS_PATH, 'utf8');

// Build isolated VM sandbox for daily-advisor functions
let kpiHtml = '';
let containerHtml = '';
const elements = {
    playSlipKpiStrip: { set innerHTML(val) { kpiHtml = val; }, get innerHTML() { return kpiHtml; } },
    playSlipHistoryContainer: { set innerHTML(val) { containerHtml = val; }, get innerHTML() { return containerHtml; } }
};

const sandbox = {
    console,
    payload: cache,
    byId: (id) => elements[id] || null,
    number: (n) => (n == null ? '' : String(n).trim().padStart(2, '0')),
    moneyM: (k, opts = {}) => {
        if (k == null || isNaN(k)) return '--';
        const num = Number(k);
        const signed = opts.signed ? (num > 0 ? '+' : '') : '';
        if (Math.abs(num) >= 1000000) return `${signed}${(num / 1000000).toFixed(2)} TỶ`;
        if (Math.abs(num) >= 1000) return `${signed}${(num / 1000).toFixed(1)}M`;
        return `${signed}${num.toLocaleString('vi-VN')}K`;
    },
    formatDateVi: (d) => {
        if (!d) return '--';
        const parts = d.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
    },
    escapeHtml: (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    currentLo4EngineMode: 'top7',
    currentActivePortfolio: 'maxProfit',
    currentActiveDeMethod: 'deMarkovGapHazard',
    currentActiveLoEngine: 'lo4Engine'
};
vm.createContext(sandbox);

// Load required functions from public/js/daily-advisor.js
vm.runInContext(jsCode.slice(jsCode.indexOf('function getOfficialMethodsForDate('), jsCode.indexOf('function resolveMethodPlaySlipData(')), sandbox);
vm.runInContext(jsCode.slice(jsCode.indexOf('function resolveUnifiedDeRowForDate('), jsCode.indexOf('function resolveUnifiedLoRowForDate(')), sandbox);
vm.runInContext(jsCode.slice(jsCode.indexOf('function resolveMethodPlaySlipData('), jsCode.indexOf('function initHistoricalMethodPlaySlipsSection(')), sandbox);
vm.runInContext(jsCode.slice(jsCode.indexOf('function renderMethodPlaySlipHistory('), jsCode.indexOf('// =========================================================================\n    // IN-PAGE HISTORICAL METHOD PLAY SLIPS CONTROLLER')), sandbox);

const expectedCombatDates = [
    '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
    '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
    '2026-10-01', '2026-10-02', '2026-10-03'
];
const expectedReversedDates = [...expectedCombatDates].reverse();

test('renderMethodPlaySlipHistory renders exactly 18 combat dates for deMarkovGapHazard with sep16 filter', () => {
    sandbox.renderMethodPlaySlipHistory('deMarkovGapHazard', 'sep16');
    const renderedDates = [...containerHtml.matchAll(/data-date="([^"]+)"/g)].map(m => m[1]);
    assert.strictEqual(renderedDates.length, 18, `Expected 18 dates, got ${renderedDates.length}`);
    assert.deepStrictEqual(renderedDates, expectedReversedDates, 'Dates must match exactly 16/09 to 03/10 in reverse order');
});

test('renderMethodPlaySlipHistory renders exactly 18 combat dates for crossHedging with sep16 filter', () => {
    sandbox.renderMethodPlaySlipHistory('crossHedging', 'sep16');
    const renderedDates = [...containerHtml.matchAll(/data-date="([^"]+)"/g)].map(m => m[1]);
    assert.strictEqual(renderedDates.length, 18, `Expected 18 dates, got ${renderedDates.length}`);
    assert.deepStrictEqual(renderedDates, expectedReversedDates, 'Dates must match exactly 16/09 to 03/10 in reverse order');
});

test('deMarkovGapHazard and crossHedging contain 0 empty-number slips across all 18 dates', () => {
    for (const d of expectedCombatDates) {
        const resDe = sandbox.resolveMethodPlaySlipData('deMarkovGapHazard', d, cache);
        assert.ok(resDe.numbers && resDe.numbers.length >= 30, `deMarkovGapHazard date ${d} must have >= 30 numbers, got ${resDe.numbers?.length}`);
        assert.ok(resDe.vipNumbers && resDe.vipNumbers.length >= 10, `deMarkovGapHazard date ${d} must have >= 10 VIP numbers, got ${resDe.vipNumbers?.length}`);

        const resCh = sandbox.resolveMethodPlaySlipData('crossHedging', d, cache);
        assert.ok(resCh.numbers && resCh.numbers.length >= 30, `crossHedging date ${d} must have >= 30 numbers, got ${resCh.numbers?.length}`);
        assert.ok(resCh.vipNumbers && resCh.vipNumbers.length >= 10, `crossHedging date ${d} must have >= 10 VIP numbers, got ${resCh.vipNumbers?.length}`);
    }
});

test('KPI metrics for deMarkovGapHazard under sep16 match 6/18 wins and -378.0M PnL', () => {
    sandbox.renderMethodPlaySlipHistory('deMarkovGapHazard', 'sep16');
    assert.ok(kpiHtml.includes('18 ngày'), 'Must show 18 ngày');
    assert.ok(kpiHtml.includes('6/18 (33.3%)'), 'Must show 6/18 (33.3%) win rate');
    assert.ok(kpiHtml.includes('-378.0M'), 'Must show -378.0M net PnL');
    assert.ok(kpiHtml.includes('-27.3%'), 'Must show -27.3% ROI');
});

test('KPI metrics for crossHedging under sep16 match 7/18 wins and +421.7M PnL', () => {
    sandbox.renderMethodPlaySlipHistory('crossHedging', 'sep16');
    assert.ok(kpiHtml.includes('18 ngày'), 'Must show 18 ngày');
    assert.ok(kpiHtml.includes('7/18 (38.9%)'), 'Must show 7/18 (38.9%) win rate');
    assert.ok(kpiHtml.includes('+421.7M'), 'Must show +421.7M net PnL');
    assert.ok(kpiHtml.includes('+14.7%'), 'Must show +14.7% ROI');
});

test('Default 30-day filter covers all 18 combat dates without truncation', () => {
    sandbox.renderMethodPlaySlipHistory('deMarkovGapHazard', '30');
    const renderedDates = [...containerHtml.matchAll(/data-date="([^"]+)"/g)].map(m => m[1]);
    assert.strictEqual(renderedDates.length, 30, '30-day view must render exactly 30 days');
    for (const d of expectedCombatDates) {
        assert.ok(renderedDates.includes(d), `Combat date ${d} must be included in 30-day view`);
    }
});

// =========================================================================
// SUITE 3: SNAPSHOT LOCK GUARANTEES & SETTLEMENT SUPPRESSION
// =========================================================================
console.log('\n--- SUITE 3: SnapshotLock Invariants & Suppression ---');

const lockGuard = require(LOCK_GUARD_PATH);

test('Pre-12:00: isPredictionLockActive returns unlocked and mutable', () => {
    // Simulate 10:30 AM VN time on a target date
    const morningTime = new Date('2026-10-04T03:30:00Z'); // 10:30 AM VN time
    const rawRows = [{ date: '2026-10-03', special: '61' }];
    const status = lockGuard.isPredictionLockActive('2026-10-04', rawRows, morningTime);

    assert.strictEqual(status.isLocked, false, 'Pre-12:00 must NOT be locked');
    assert.strictEqual(status.isSettled, false, 'Pre-12:00 must NOT be settled');
    assert.strictEqual(status.lockActive, false, 'Pre-12:00 lockActive must be false');
    assert.ok(status.minutesUntilLock > 0, 'Must have positive minutes until lock');
});

test('12:00 to 18:40: isPredictionLockActive triggers immutable lock', () => {
    // Simulate 14:00 PM VN time on target date
    const afternoonTime = new Date('2026-10-04T07:00:00Z'); // 14:00 PM VN time
    const rawRows = [{ date: '2026-10-03', special: '61' }];
    const status = lockGuard.isPredictionLockActive('2026-10-04', rawRows, afternoonTime);

    assert.strictEqual(status.isLocked, true, '14:00 must be locked');
    assert.strictEqual(status.isSettled, false, '14:00 must NOT be settled');
    assert.strictEqual(status.lockActive, true, '14:00 lockActive must be true');
    assert.ok(status.lockReason.includes('12:00 trưa'), 'Reason must mention 12:00 trưa');
});

test('preserveLockedRecommendation protects existing snapshot from overwrite during lock', () => {
    const lockStatus = { isLocked: true, lockActive: true, lockReason: 'Locked test' };
    const existingRec = {
        numbers: ['10', '20', '30'],
        standard30: ['10', '20', '30'],
        stakeK: 30000,
        snapshotLock: { lockedAt: '2026-10-04T12:00:00Z' }
    };
    const freshRec = {
        numbers: ['99', '88', '77'], // Malicious or recalculation overwrite attempt
        standard30: ['99', '88', '77'],
        stakeK: 60000
    };

    const preserved = lockGuard.preserveLockedRecommendation(existingRec, freshRec, lockStatus);
    assert.deepStrictEqual(preserved.numbers, ['10', '20', '30'], 'Locked numbers must NOT be overwritten');
    assert.strictEqual(preserved.snapshotLock.isLocked, true, 'snapshotLock.isLocked must remain true');
});

test('Post-18:40 Settlement: isPredictionLockActive recognizes settled status and unlocks', () => {
    // Target date 2026-10-03 has official special '61'
    const eveningTime = new Date('2026-10-03T12:00:00Z'); // 19:00 PM VN time
    const rawRows = [{ date: '2026-10-03', special: '61' }];
    const status = lockGuard.isPredictionLockActive('2026-10-03', rawRows, eveningTime);

    assert.strictEqual(status.isSettled, true, 'Target with special prize must be settled');
    assert.strictEqual(status.isLocked, false, 'Settled date must NOT be locked');
    assert.strictEqual(status.lockActive, false, 'Settled date lockActive must be false');
    assert.ok(status.lockReason.includes('kết toán'), 'Reason must mention kết toán');
});

test('Worker index.js lock banner condition: strictly suppressed when isSettled is true', () => {
    const workerContent = fs.readFileSync(WORKER_PATH, 'utf8');

    // Verify condition: if (isLocked && !isSettled)
    assert.ok(workerContent.includes('const isSettled = Boolean(snapshotLock?.isSettled);'), 'Worker must check snapshotLock.isSettled');
    assert.ok(workerContent.includes('if (isLocked && !isSettled)'), 'Banner must be conditioned on isLocked && !isSettled');

    // Verify time boundary checks: 720 (12:00) to 1120 (18:40)
    assert.ok(workerContent.includes('totalMinutes >= 720 && totalMinutes < 1120'), 'Worker must enforce 12:00 to 18:40 time window');
});

test('Web daily-advisor.js UI lock banner suppression check', () => {
    // In daily-advisor.js lines 378-386:
    // if (lockStatus?.isLocked) show banner, else hide banner
    // When settled, snapshotLock.isLocked is false, so banner is hidden (.hidden added)
    assert.ok(jsCode.includes("lockBannerEl.classList.add('hidden');"), 'daily-advisor.js must hide banner when not locked');
});

// =========================================================================
// SUITE 4: AUTO BEST-SELECTION SSOT SECTION INTEGRITY
// =========================================================================
console.log('\n--- SUITE 4: autoBestSelection SSOT Schema & PIT Integrity ---');

test('autoBestSelection section exists at root of cache', () => {
    assert.ok(cache.autoBestSelection, 'cache must have root autoBestSelection');
    assert.strictEqual(typeof cache.autoBestSelection, 'object', 'autoBestSelection must be an object');
});

test('autoBestSelection specifies selectedMethod, targetDate, and action', () => {
    const auto = cache.autoBestSelection;
    assert.ok(auto.selectedMethod, 'Must have selectedMethod');
    assert.ok(auto.targetDate, 'Must have targetDate');
    assert.ok(auto.action === 'BET' || auto.action === 'ABSTAIN', `Action must be BET or ABSTAIN, got ${auto.action}`);
    assert.ok(Array.isArray(auto.scores), 'Must include scores array');
    assert.ok(auto.scores.length === 12, `Must rank all 12 candidates (5 Elite + 7 Pool7), found ${auto.scores.length}`);
});

test('autoBestSelection candidate scores are mathematically bounded', () => {
    const auto = cache.autoBestSelection;
    for (const cand of auto.scores) {
        assert.ok(cand.methodId, 'Candidate must have methodId');
        assert.ok(typeof cand.compositeScore === 'number' && !isNaN(cand.compositeScore), `Composite score must be valid number for ${cand.methodId}`);
        assert.ok(cand.winRate30D >= 0 && cand.winRate30D <= 1, `winRate30D must be in [0, 1] for ${cand.methodId}`);
        assert.ok(typeof cand.expectedProfitK === 'number' && !isNaN(cand.expectedProfitK), `expectedProfitK must be valid number for ${cand.methodId}`);
    }
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log('\n' + '='.repeat(80));
console.log(`CHALLENGER VERIFICATION COMPLETE: ${stats.passed}/${stats.total} PASSED`);
if (stats.failed > 0) {
    console.error(`❌ FAILED: ${stats.failed} tests failed!`);
    stats.failures.forEach(f => console.error(`  - ${f.description}: ${f.error}`));
    process.exit(1);
} else {
    console.log('✅ ALL EMPIRICAL CHALLENGES PASSED WITH 100% SUCCESS!');
    process.exit(0);
}
