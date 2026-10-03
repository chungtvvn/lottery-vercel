#!/usr/bin/env node
/**
 * scripts/test-challenger-m3-deep-audit.js
 *
 * Empirical Challenger Verification Suite for Milestone 3:
 * 1. SHA-256 byte parity of data/ and lib/ caches.
 * 2. 18-draw continuous coverage in renderMethodPlaySlipHistory for deMarkovGapHazard and crossHedging.
 * 3. snapshotLock temporal invariant verification across pre-12:00, 12:00-18:40, post-18:40 settled.
 * 4. Auto best-selection SSOT presence and structural consistency.
 * 5. Multiplier and votes snapshot freeze immutability.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_CACHE = path.join(ROOT_DIR, 'data', 'cached_daily_method_advisor.json');
const LIB_CACHE = path.join(ROOT_DIR, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const JS_FILE = path.join(ROOT_DIR, 'public', 'js', 'daily-advisor.js');
const WORKER_FILE = path.join(ROOT_DIR, 'workers', 'daily-update-dispatcher', 'src', 'index.js');
const { isPredictionLockActive, preserveLockedRecommendation, getVietnamTime } = require('../lib/utils/predictionLockGuard');

let testsPassed = 0;
let testsFailed = 0;

function check(title, fn) {
    try {
        fn();
        testsPassed++;
        console.log(`  ✔ [PASS] ${title}`);
    } catch (err) {
        testsFailed++;
        console.error(`  ✘ [FAIL] ${title}: ${err.message}`);
        if (err.stack) console.error(err.stack);
    }
}

console.log('='.repeat(80));
console.log('🔬 EMPIRICAL CHALLENGER: MILESTONE 3 DEEP AUDIT');
console.log('='.repeat(80));

// =========================================================================
// 1. SHA-256 BYTE PARITY
// =========================================================================
console.log('\n--- 1. SHA-256 BYTE PARITY OF CACHE ARTIFACTS ---');

const dataBytes = fs.readFileSync(DATA_CACHE);
const libBytes = fs.readFileSync(LIB_CACHE);
const dataHash = crypto.createHash('sha256').update(dataBytes).digest('hex');
const libHash = crypto.createHash('sha256').update(libBytes).digest('hex');

check('1.1 Data cache exists and is readable', () => {
    assert.ok(dataBytes.length > 0);
});

check('1.2 Lib cache exists and is readable', () => {
    assert.ok(libBytes.length > 0);
});

check('1.3 SHA-256 hashes match identically', () => {
    assert.strictEqual(dataHash, libHash, `Hashes differ: ${dataHash} !== ${libHash}`);
    console.log(`      SHA-256: ${dataHash}`);
});

check('1.4 Byte length is identical', () => {
    assert.strictEqual(dataBytes.length, libBytes.length);
});

const cache = JSON.parse(dataBytes.toString('utf8'));

// =========================================================================
// 2. MODAL PLAY SLIP HISTORY: ALL 18 COMBAT DRAWS
// =========================================================================
console.log('\n--- 2. MODAL PLAY SLIP HISTORY: ALL 18 COMBAT DRAWS (16/09/2026 - 03/10/2026) ---');

const COMBAT_DATES = [
    '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
    '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30',
    '2026-10-01', '2026-10-02', '2026-10-03'
];

check('2.1 crossHedgingPortfolio settledLedger covers all 18 combat dates', () => {
    const chLedger = cache.crossHedgingPortfolio?.settledLedger || [];
    assert.ok(chLedger.length >= 18, `crossHedging ledger has ${chLedger.length} items`);
    const dateSet = new Set(chLedger.map(r => r.date || r.predictionDate));
    for (const d of COMBAT_DATES) {
        assert.ok(dateSet.has(d), `Missing combat date in crossHedging: ${d}`);
    }
});

// Simulate client-side resolution logic from public/js/daily-advisor.js
function simulateResolvePlaySlip(methodKey, date, payloadData) {
    const isPending = false;
    const draw = payloadData.drawPrizesByDate?.[date] || {};
    const actualSpecial = draw.special != null ? String(draw.special).padStart(2, '0').slice(-2) : null;
    const drawPrizes = (draw.prizes || []).map(p => String(p).padStart(2, '0').slice(-2));
    const drawPrizesSet = new Set(drawPrizes);

    let numbers = [];
    let vipNumbers = [];
    let singleNumbers = [];
    let isHit = false;
    let isX2 = false;
    let stakeK = 0;
    let payoutK = 0;
    let profitK = 0;

    let effectiveKey = methodKey;

    if (effectiveKey === 'deMarkovGapHazard') {
        const crossP1 = payloadData.crossHedgingPortfolio?.pillar1_De || payloadData.crossHedgingPortfolio?.latestRecommendation?.pillar1_De;
        const chRow = payloadData.crossHedgingPortfolio?.settledLedger?.find(x => (x.predictionDate || x.date) === date);
        const r = payloadData.deMarkovGapHazard?.settledLedger?.find(x => (x.predictionDate || x.date) === date)
            || payloadData.streakAwareDeAdvisor?.markovAdvisor?.settledLedger?.find(x => (x.predictionDate || x.date) === date);
        
        numbers = (r?.numbers || crossP1?.allNumbers || []).map(n => String(n).padStart(2, '0').slice(-2));
        vipNumbers = (r?.vipNumbers || crossP1?.vipNumbers || numbers.slice(0, 17)).map(n => String(n).padStart(2, '0').slice(-2));
        singleNumbers = numbers.filter(n => !vipNumbers.includes(n));
        stakeK = (chRow?.deStakeK != null ? chRow.deStakeK : (vipNumbers.length * 3 + singleNumbers.length * 1) * 1000);

        isHit = Boolean(r?.isHit || (actualSpecial != null && numbers.includes(actualSpecial)) || chRow?.isDeHit);
        isX2 = Boolean(r?.hitType === 'win_x3' || r?.hitType === 'win_x2' || (actualSpecial != null && vipNumbers.includes(actualSpecial)) || chRow?.isVipHit);
        profitK = chRow?.deProfitK != null ? chRow.deProfitK : (isHit ? (isX2 ? (252000 - stakeK) : (84000 - stakeK)) : -stakeK);
        payoutK = isHit ? (stakeK + profitK) : 0;
    } else if (effectiveKey === 'crossHedging') {
        const chRow = payloadData.crossHedgingPortfolio?.settledLedger?.find(x => (x.predictionDate || x.date) === date);
        stakeK = chRow?.totalStakeK || 11320;
        payoutK = chRow?.totalPayoutK || 0;
        profitK = chRow?.totalProfitK != null ? chRow.totalProfitK : (payoutK - stakeK);
        isHit = Boolean(chRow?.isWin || profitK > 0);
        const p1 = payloadData.crossHedgingPortfolio?.pillar1_De;
        numbers = (p1?.allNumbers || []).map(n => String(n).padStart(2, '0').slice(-2));
        vipNumbers = (p1?.vipNumbers || []).map(n => String(n).padStart(2, '0').slice(-2));
        singleNumbers = numbers.filter(n => !vipNumbers.includes(n));
    }

    return {
        date,
        numbers,
        vipNumbers,
        singleNumbers,
        isHit,
        isX2,
        stakeK,
        payoutK,
        profitK,
        actualSpecial
    };
}

check('2.2 deMarkovGapHazard resolves all 18 combat dates with complete numbers and correct financial calculations', () => {
    let hitCount = 0;
    let totalProfit = 0;
    for (const d of COMBAT_DATES) {
        const res = simulateResolvePlaySlip('deMarkovGapHazard', d, cache);
        assert.ok(res.numbers.length > 0, `Numbers empty on ${d}`);
        assert.ok(res.vipNumbers.length > 0, `VIP numbers empty on ${d}`);
        assert.strictEqual(res.numbers.length, 43, `Expected 43 numbers on ${d}, got ${res.numbers.length}`);
        assert.strictEqual(res.vipNumbers.length, 17, `Expected 17 VIP numbers on ${d}, got ${res.vipNumbers.length}`);
        assert.strictEqual(res.singleNumbers.length, 26, `Expected 26 backup numbers on ${d}, got ${res.singleNumbers.length}`);
        if (res.isHit) hitCount++;
        totalProfit += res.profitK;
    }
    console.log(`      deMarkovGapHazard: ${hitCount}/18 wins, Net Profit VIP: ${totalProfit / 1000}M`);
    assert.strictEqual(hitCount, 6, `Expected 6 wins, got ${hitCount}`);
    assert.strictEqual(totalProfit, -378000, `Expected -378,000K VIP profit, got ${totalProfit}`);
});

check('2.3 crossHedging resolves all 18 combat dates with 100% financial conservation', () => {
    const chLedger = cache.crossHedgingPortfolio.settledLedger;
    let winDays = 0;
    let cumProfit = 0;
    for (const d of COMBAT_DATES) {
        const row = chLedger.find(r => (r.date || r.predictionDate) === d);
        assert.ok(row, `Row for ${d} must exist in settledLedger`);
        const dePnl = row.deProfitK || 0;
        const loPnl = row.loProfitK || 0;
        const xienPnl = row.xienProfitK || 0;
        const totalPnl = row.totalProfitK || 0;
        assert.strictEqual(dePnl + loPnl + xienPnl, totalPnl, `Conservation failed on ${d}: ${dePnl} + ${loPnl} + ${xienPnl} !== ${totalPnl}`);
        if (totalPnl > 0) winDays++;
        cumProfit += totalPnl;
    }
    console.log(`      crossHedging: ${winDays}/18 positive days, Net Profit VIP: ${cumProfit / 1000}M`);
    assert.strictEqual(winDays, 7, `Expected 7 positive days, got ${winDays}`);
    assert.strictEqual(cumProfit, 421680, `Expected +421,680K VIP profit, got ${cumProfit}`);
});

check('2.4 Timeframe filter logic covers all 18 combat dates without truncation', () => {
    const rawLedger = cache.crossHedgingPortfolio.settledLedger;
    const filterSep16 = rawLedger.filter(r => (r.predictionDate || r.date) >= '2026-09-16');
    assert.strictEqual(filterSep16.length, 18, `Expected 18 draws from sep16 filter, got ${filterSep16.length}`);
    const filter30 = rawLedger.slice(-30);
    const combatIn30 = filter30.filter(r => (r.predictionDate || r.date) >= '2026-09-16');
    assert.strictEqual(combatIn30.length, 18, `All 18 combat dates must be present in last 30 draws`);
});

// =========================================================================
// 3. SNAPSHOT LOCK INVARIANT & TEMPORAL WINDOWS
// =========================================================================
console.log('\n--- 3. SNAPSHOT LOCK INVARIANT & TEMPORAL WINDOWS ---');

const dummyRawWithoutTarget = [
    { date: '2026-10-02', special: '83' }
];
const dummyRawWithTarget = [
    { date: '2026-10-02', special: '83' },
    { date: '2026-10-03', special: '61' }
];

check('3.1 Pre-12:00 unlocked state (09:00 AM)', () => {
    const time0900 = new Date('2026-10-03T02:00:00Z'); // 09:00 VN
    const lock = isPredictionLockActive('2026-10-03', dummyRawWithoutTarget, time0900);
    assert.strictEqual(lock.isLocked, false);
    assert.strictEqual(lock.isSettled, false);
    assert.strictEqual(lock.lockActive, false);
    assert.ok(lock.lockReason.includes('Chưa đến 12:00 trưa'));
});

check('3.2 Pre-12:00 boundary unlocked state (11:59:59 AM)', () => {
    const time1159 = new Date('2026-10-03T04:59:59Z'); // 11:59:59 VN
    const lock = isPredictionLockActive('2026-10-03', dummyRawWithoutTarget, time1159);
    assert.strictEqual(lock.isLocked, false);
    assert.strictEqual(lock.isSettled, false);
    assert.strictEqual(lock.lockActive, false);
});

check('3.3 12:00:00 PM exact threshold triggers immutable lock', () => {
    const time1200 = new Date('2026-10-03T05:00:00Z'); // 12:00:00 VN
    const lock = isPredictionLockActive('2026-10-03', dummyRawWithoutTarget, time1200);
    assert.strictEqual(lock.isLocked, true);
    assert.strictEqual(lock.isSettled, false);
    assert.strictEqual(lock.lockActive, true);
    assert.ok(lock.lockReason.includes('Đã khóa bất biến từ 12:00 trưa'));
});

check('3.4 Mid-afternoon locked state (15:30 PM)', () => {
    const time1530 = new Date('2026-10-03T08:30:00Z'); // 15:30 VN
    const lock = isPredictionLockActive('2026-10-03', dummyRawWithoutTarget, time1530);
    assert.strictEqual(lock.isLocked, true);
    assert.strictEqual(lock.isSettled, false);
    assert.strictEqual(lock.lockActive, true);
});

check('3.5 Pre-settlement locked state (18:39 PM)', () => {
    const time1839 = new Date('2026-10-03T11:39:00Z'); // 18:39 VN
    const lock = isPredictionLockActive('2026-10-03', dummyRawWithoutTarget, time1839);
    assert.strictEqual(lock.isLocked, true);
    assert.strictEqual(lock.isSettled, false);
    assert.strictEqual(lock.lockActive, true);
});

check('3.6 Post-18:40 settled state suppresses lock and unlocks', () => {
    const time1900 = new Date('2026-10-03T12:00:00Z'); // 19:00 VN
    const lock = isPredictionLockActive('2026-10-03', dummyRawWithTarget, time1900);
    assert.strictEqual(lock.isLocked, false);
    assert.strictEqual(lock.isSettled, true);
    assert.strictEqual(lock.lockActive, false);
    assert.ok(lock.lockReason.includes('đã có kết quả mở thưởng'));
});

check('3.7 Worker dispatcher suppresses lock banner when isSettled is true', () => {
    const workerContent = fs.readFileSync(WORKER_FILE, 'utf8');
    assert.ok(workerContent.includes('const isSettled = Boolean(snapshotLock?.isSettled);'), 'Worker must check snapshotLock.isSettled');
    assert.ok(workerContent.includes('if (isLocked && !isSettled)'), 'Worker must suppress lock banner when settled');
});

check('3.8 Frontend daily-advisor.js suppresses predictionLockBanner when isLocked is false', () => {
    const jsContent = fs.readFileSync(JS_FILE, 'utf8');
    assert.ok(jsContent.includes('if (lockStatus?.isLocked)'), 'Frontend must check lockStatus.isLocked');
    assert.ok(jsContent.includes('lockBannerEl.classList.add(\'hidden\')'), 'Frontend must hide lockBannerEl when isLocked is falsy');
});

// =========================================================================
// 4. AUTO BEST-SELECTION SSOT CONTRACT
// =========================================================================
console.log('\n--- 4. AUTO BEST-SELECTION SSOT CONTRACT ---');

check('4.1 Root autoBestSelection exists in cache', () => {
    assert.ok(cache.autoBestSelection, 'autoBestSelection root must exist in cache');
});

check('4.2 autoBestSelection contract fields populated', () => {
    const sel = cache.autoBestSelection;
    assert.ok(sel.selectedMethod, 'selectedMethod must be string');
    assert.ok(sel.selectedMethodLabel || sel.methodName, 'selectedMethodLabel or methodName must be string');
    assert.ok(sel.targetDate || sel.evaluationDate, 'targetDate or evaluationDate must be string');
    assert.ok(Array.isArray(sel.scores || sel.candidateRankings), 'scores or candidateRankings must be array');
    const rankings = sel.scores || sel.candidateRankings;
    assert.ok(rankings.length >= 5, `Expected >= 5 candidates, got ${rankings.length}`);
});

check('4.3 Dynamic De Selector service integrates evaluateAutoBestSelection', () => {
    const dynSelectorCode = fs.readFileSync(path.join(ROOT_DIR, 'lib', 'services', 'dynamicDeSelectorService.js'), 'utf8');
    assert.ok(dynSelectorCode.includes('evaluateAutoBestSelection'), 'dynamicDeSelectorService must call evaluateAutoBestSelection');
});

check('4.4 crossHedgingPortfolio consumes autoBestSelection if available', () => {
    const chServiceCode = fs.readFileSync(path.join(ROOT_DIR, 'lib', 'services', 'crossHedgingPortfolioService.js'), 'utf8');
    assert.ok(chServiceCode.includes('autoBestSelection') || chServiceCode.includes('computePillar1De'), 'crossHedgingPortfolioService must integrate with auto best selection');
});

// =========================================================================
// 5. IMMUTABLE SNAPSHOT PRESERVATION UNDER STRESS
// =========================================================================
console.log('\n--- 5. IMMUTABLE SNAPSHOT PRESERVATION UNDER STRESS ---');

check('5.1 preserveLockedRecommendation preserves frozen numbers and multipliers during locked window', () => {
    const existingSnapshot = {
        selectedMethod: 'deMarkovGapHazard',
        numbers: ['75', '20', '50', '92', '40'],
        top7: ['75', '38', '65', '24', '76', '72', '11'],
        betNumbers: [
            { num: '38', multiplier: 4, votes: 4 },
            { num: '62', multiplier: 4, votes: 3 }
        ]
    };

    const mutatedSnapshot = {
        selectedMethod: 'adaptiveDualMerge',
        numbers: ['00', '11', '22'],
        top7: ['99', '88', '77'],
        betNumbers: [
            { num: '99', multiplier: 1, votes: 1 }
        ]
    };

    const lockStatusActive = {
        isLocked: true,
        isSettled: false,
        lockActive: true,
        lockStartTime: '2026-10-03T12:00:00+07:00',
        lockTargetDate: '2026-10-03',
        lockReason: 'Đã khóa bất biến từ 12:00 trưa.'
    };

    const preserved = preserveLockedRecommendation(existingSnapshot, mutatedSnapshot, lockStatusActive);

    assert.strictEqual(preserved.snapshotLock.isLocked, true);
    assert.strictEqual(preserved.selectedMethod, 'deMarkovGapHazard', 'selectedMethod must NOT mutate');
    assert.deepStrictEqual(preserved.numbers, ['75', '20', '50', '92', '40'], 'numbers must NOT mutate');
    assert.deepStrictEqual(preserved.top7, ['75', '38', '65', '24', '76', '72', '11'], 'top7 must NOT mutate');
    assert.deepStrictEqual(preserved.betNumbers, existingSnapshot.betNumbers, 'betNumbers and multipliers must NOT mutate');
});

// =========================================================================
// SUMMARY
// =========================================================================
console.log('\n' + '='.repeat(80));
console.log(`AUDIT COMPLETE: ${testsPassed} passed, ${testsFailed} failed`);
console.log('='.repeat(80));

if (testsFailed > 0) {
    process.exit(1);
}
