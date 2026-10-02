#!/usr/bin/env node
/**
 * scripts/test-m2-sync.js
 *
 * Milestone 2 Verification Suite:
 * Service, Cache, API & Telegram Bot Synchronization (Requirement R4 backend)
 *
 * Verifies:
 * 1. Cache Generation & Schema Contract (crossHedgingPortfolio, 3 pillars, 2026 metrics)
 * 2. Snapshot Freezing Invariance (12:00-18:40 lock protection)
 * 3. Production API Route Dynamic Settlement Contract
 * 4. Telegram Bot Delivery & Command Synchronization (/chot, /slip, /cuoc)
 *
 * Zero External Dependencies (Native Node.js assert).
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const stats = {
    total: 0,
    passed: 0,
    failed: 0
};

function test(description, fn) {
    stats.total++;
    try {
        fn();
        stats.passed++;
        console.log(`  ✓ [PASS] ${description}`);
    } catch (err) {
        stats.failed++;
        console.error(`  ✗ [FAIL] ${description}`);
        console.error(`    ${err.message}`);
        if (err.stack) console.error(err.stack);
    }
}

async function runAsyncTest(description, fn) {
    stats.total++;
    try {
        await fn();
        stats.passed++;
        console.log(`  ✓ [PASS] ${description}`);
    } catch (err) {
        stats.failed++;
        console.error(`  ✗ [FAIL] ${description}`);
        console.error(`    ${err.message}`);
        if (err.stack) console.error(err.stack);
    }
}

async function main() {
    console.log('='.repeat(80));
    console.log('  MILESTONE 2: SERVICE, CACHE, API & TELEGRAM BOT SYNCHRONIZATION');
    console.log('='.repeat(80));

    const dailyService = require('../lib/services/dailyMethodAdvisorService');
    const crossHedgingService = require('../lib/services/crossHedgingPortfolioService');
    const { getRawData } = require('../lib/data-access');
    const raw = await getRawData();

    // ────────────────────────────────────────────────────────────────────────
    // SUITE 1: Cache Generation & Schema Contract
    // ────────────────────────────────────────────────────────────────────────
    console.log('\n[Suite 1: Cache Generation & Schema Contract]');

    let generatedCache = null;
    test('1.1: generateAdvisorCache executes cleanly and exports crossHedgingPortfolio', () => {
        generatedCache = dailyService.generateAdvisorCache({ raw, history: [] });
        assert.ok(generatedCache, 'Cache should be non-null');
        assert.ok(generatedCache.crossHedgingPortfolio, 'crossHedgingPortfolio must exist in cache');
    });

    test('1.2: crossHedgingPortfolio has valid ISO targetDate', () => {
        const p = generatedCache.crossHedgingPortfolio;
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.targetDate), `Invalid targetDate format: ${p.targetDate}`);
    });

    test('1.3: crossHedgingPortfolio mode is a valid enumerated portfolio mode', () => {
        const p = generatedCache.crossHedgingPortfolio;
        assert.ok(crossHedgingService.PORTFOLIO_MODES.includes(p.mode), `Invalid mode: ${p.mode}`);
    });

    test('1.4: crossHedgingPortfolio sizingMultiplier is bounded within [0.25, 1.35]', () => {
        const p = generatedCache.crossHedgingPortfolio;
        assert.ok(typeof p.sizingMultiplier === 'number', 'sizingMultiplier must be number');
        assert.ok(p.sizingMultiplier >= 0.25 && p.sizingMultiplier <= 1.35, `sizingMultiplier out of bounds: ${p.sizingMultiplier}`);
    });

    test('1.5: crossHedgingPortfolio totalStakeK is positive integer', () => {
        const p = generatedCache.crossHedgingPortfolio;
        assert.ok(Number.isInteger(p.totalStakeK) && p.totalStakeK > 0, `totalStakeK must be positive integer: ${p.totalStakeK}`);
    });

    test('1.6: Pillar 1 (Đề VIP) contains valid VIP and Single numbers with positive stake', () => {
        const p1 = generatedCache.crossHedgingPortfolio.pillar1_De;
        assert.ok(p1, 'pillar1_De must exist');
        assert.ok(Array.isArray(p1.vipNumbers) && p1.vipNumbers.length >= 10, 'Pillar 1 must have at least 10 VIP numbers');
        assert.ok(Array.isArray(p1.singleNumbers) && p1.singleNumbers.length > 0, 'Pillar 1 must have backup Singles');
        assert.ok(p1.stakeK > 0, 'Pillar 1 stakeK must be > 0');
        assert.ok(p1.targetPayoutVipK > p1.stakeK, 'Pillar 1 targetPayoutVipK must exceed stake');
    });

    test('1.7: Pillar 2 (Lô Ghép 4 Động Cơ) contains tiered betNumbers and expectedHits >= 1.0', () => {
        const p2 = generatedCache.crossHedgingPortfolio.pillar2_Lo;
        assert.ok(p2, 'pillar2_Lo must exist');
        assert.ok(Array.isArray(p2.betNumbers) && p2.betNumbers.length >= 4, 'Pillar 2 must have at least 4 bet numbers');
        assert.ok(p2.betNumbers.every(b => b.multiplier >= 1 && b.votes >= 1), 'Every betNumber must have valid multiplier & votes');
        assert.ok(p2.stakeK > 0, 'Pillar 2 stakeK must be > 0');
        assert.ok(p2.expectedHits >= 1.0, `Pillar 2 expectedHits must be >= 1.0: actual ${p2.expectedHits}`);
    });

    test('1.8: Pillar 3 (Dàn Xiên Quây Hiệp Đồng) contains 11-ticket quây structure', () => {
        const p3 = generatedCache.crossHedgingPortfolio.pillar3_Xien;
        assert.ok(p3, 'pillar3_Xien must exist');
        assert.strictEqual(p3.type, 'XIEN_4_QUAY_11_VE');
        assert.strictEqual(p3.ticketsCount, 11);
        assert.ok(p3.numbers.length === 4, 'Xiên 4 quây must have exactly 4 numbers');
        assert.ok(p3.stakeK > 0, 'Pillar 3 stakeK must be > 0');
        assert.ok(p3.payoutHit2K > 0, 'Pillar 3 payoutHit2K must be > 0');
    });

    test('1.9: hedgingSummary enforces positive profit when Đề VIP hits or Lô hits >= 2/3', () => {
        const hs = generatedCache.crossHedgingPortfolio.hedgingSummary;
        assert.ok(hs, 'hedgingSummary must exist');
        assert.ok(hs.profitIfDeHitsK > 0, `profitIfDeHitsK must be positive: ${hs.profitIfDeHitsK}`);
        assert.ok(hs.profitIfLo3HitsK > 0, `profitIfLo3HitsK must be positive: ${hs.profitIfLo3HitsK}`);
        assert.ok(typeof hs.hedgingGuarantee === 'string' && hs.hedgingGuarantee.length > 0, 'hedgingGuarantee must be non-empty string');
    });

    test('1.10: settledLedger contains 2026 historical backtest with >= 260 draws', () => {
        const ledger = generatedCache.crossHedgingPortfolio.settledLedger;
        assert.ok(Array.isArray(ledger), 'settledLedger must be array');
        assert.ok(ledger.length >= 260, `settledLedger should cover 2026 (length: ${ledger.length})`);
        assert.ok(ledger[0].date.startsWith('2026-'), 'First row must be in 2026');
    });

    test('1.11: 2026 Metrics meet all acceptance criteria (Win rate >= 70%, ROI >= 25%, Max loss <= 3)', () => {
        const m = generatedCache.crossHedgingPortfolio.metrics;
        assert.ok(m, 'metrics must exist');
        assert.ok(m.dailyPositiveProfitRate >= 0.70, `Win rate must be >= 70%: actual ${m.dailyPositiveProfitRate}`);
        assert.ok(m.cumulativeRoi >= 0.25, `ROI must be >= 25%: actual ${m.cumulativeRoi}`);
        assert.ok(m.maxConsecutiveLossDays <= 3, `Max consecutive loss must be <= 3: actual ${m.maxConsecutiveLossDays}`);
        assert.ok(m.cumulativeProfitK > 0, 'Cumulative profit must be positive');
    });

    test('1.12: cached_daily_method_advisor.json files exist in lib/data/statistics and data/', () => {
        const p1 = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
        const p2 = path.join(process.cwd(), 'data', 'cached_daily_method_advisor.json');
        assert.ok(fs.existsSync(p1), 'lib/data/statistics/cached_daily_method_advisor.json must exist');
        assert.ok(fs.existsSync(p2), 'data/cached_daily_method_advisor.json must exist');
        const c1 = JSON.parse(fs.readFileSync(p1, 'utf8'));
        const c2 = JSON.parse(fs.readFileSync(p2, 'utf8'));
        assert.ok(c1.crossHedgingPortfolio, 'c1 must have crossHedgingPortfolio');
        assert.ok(c2.crossHedgingPortfolio, 'c2 must have crossHedgingPortfolio');
    });

    // ────────────────────────────────────────────────────────────────────────
    // SUITE 2: Snapshot Lock & Immutability Invariance
    // ────────────────────────────────────────────────────────────────────────
    console.log('\n[Suite 2: Snapshot Lock & Immutability Invariance]');

    const { preserveLockedRecommendation } = require('../lib/utils/predictionLockGuard');

    test('2.1: preserveLockedRecommendation preserves crossHedgingPortfolio when locked', () => {
        const mockExisting = {
            targetDate: '2026-10-02',
            selectedEngine: 'cross-hedging-portfolio',
            selectedMethod: 'cross-hedging-portfolio',
            numbers: ['38', '52', '10', '11'],
            mode: 'ACTIVE_HEDGE',
            sizingMultiplier: 1.15,
            totalStakeK: 25000,
            pillar1_De: { vipNumbers: [10, 20, 30], singleNumbers: [1, 2, 3], stakeK: 5000 },
            pillar2_Lo: { betNumbers: [{ num: '38', votes: 4, multiplier: 5 }], stakeK: 15000 },
            pillar3_Xien: { numbers: ['38', '52', '10', '11'], stakeK: 2200 },
            snapshotLock: { isLocked: true, lockedAt: '2026-10-02T12:00:00+07:00' }
        };
        const mockFresh = {
            targetDate: '2026-10-02',
            selectedEngine: 'cross-hedging-portfolio',
            selectedMethod: 'cross-hedging-portfolio',
            numbers: ['99', '88', '77', '66'],
            mode: 'MOMENTUM_BOOST',
            sizingMultiplier: 1.35,
            totalStakeK: 35000,
            pillar1_De: { vipNumbers: [99, 88, 77], singleNumbers: [9, 8, 7], stakeK: 7000 },
            pillar2_Lo: { betNumbers: [{ num: '99', votes: 2, multiplier: 2 }], stakeK: 22000 },
            pillar3_Xien: { numbers: ['99', '88', '77', '66'], stakeK: 2200 }
        };
        const lockStatus = { isLocked: true, lockReason: 'Locked between 12:00 and 18:40', lockStartTime: '2026-10-02T12:00:00+07:00' };

        const locked = preserveLockedRecommendation(mockExisting, mockFresh, lockStatus);
        assert.strictEqual(locked.snapshotLock.isLocked, true);
        assert.deepStrictEqual(locked.pillar1_De.vipNumbers, [10, 20, 30], 'VIP numbers must remain frozen from existing snapshot');
        assert.strictEqual(locked.sizingMultiplier, 1.15, 'Sizing multiplier must remain frozen');
        assert.strictEqual(locked.pillar2_Lo.betNumbers[0].num, '38', 'Lô betNumbers must remain frozen');
    });

    test('2.2: Unlocked state preserves fresh recommendation and marks isLocked false', () => {
        const mockExisting = { targetDate: '2026-10-02', sizingMultiplier: 1.0 };
        const mockFresh = { targetDate: '2026-10-02', sizingMultiplier: 1.25 };
        const lockStatus = { isLocked: false, lockReason: 'Before 12:00' };

        const unlocked = preserveLockedRecommendation(mockExisting, mockFresh, lockStatus);
        assert.strictEqual(unlocked.snapshotLock.isLocked, false);
        assert.strictEqual(unlocked.sizingMultiplier, 1.25, 'Fresh multiplier must be used when unlocked');
    });

    // ────────────────────────────────────────────────────────────────────────
    // SUITE 3: Production API Route Dynamic Settlement Contract
    // ────────────────────────────────────────────────────────────────────────
    console.log('\n[Suite 3: Production API Route Dynamic Settlement Contract]');

    test('3.1: API route source contains settleFromRaw supporting crossHedgingPortfolio', () => {
        const routeSource = fs.readFileSync(path.join(process.cwd(), 'app', 'api', 'daily-advisor', 'route.js'), 'utf8');
        assert.ok(routeSource.includes('crossHedgingPortfolio'), 'route.js must contain crossHedgingPortfolio');
        assert.ok(routeSource.includes('crossHedgingService'), 'route.js must reference crossHedgingService');
        assert.ok(routeSource.includes('settleCrossAssetPortfolio'), 'route.js must invoke settleCrossAssetPortfolio');
    });

    test('3.2: Dynamic settlement computes conservation law payoutK - stakeK === profitK on targetDate draw', () => {
        const decision = crossHedgingService.evaluateCrossAssetPortfolio('2026-09-28', raw.slice(0, -1), null);
        const actualDraw = raw[raw.length - 1]; // 2026-09-28 draw
        const settled = crossHedgingService.settleCrossAssetPortfolio(decision, actualDraw);
        assert.ok(settled, 'Settlement result must exist');
        assert.strictEqual(settled.totalProfitK, settled.totalPayoutK - settled.totalStakeK, 'Financial conservation must hold');
        assert.strictEqual(settled.deProfitK, settled.dePayoutK - settled.deStakeK, 'Pillar 1 conservation must hold');
        assert.strictEqual(settled.loProfitK, settled.loPayoutK - settled.loStakeK, 'Pillar 2 conservation must hold');
        assert.strictEqual(settled.xienProfitK, settled.xienPayoutK - settled.xienStakeK, 'Pillar 3 conservation must hold');
    });

    // ────────────────────────────────────────────────────────────────────────
    // SUITE 4: Telegram Bot Delivery & Dispatcher Synchronization Contract
    // ────────────────────────────────────────────────────────────────────────
    console.log('\n[Suite 4: Telegram Bot Delivery & Dispatcher Synchronization Contract]');

    await runAsyncTest('4.1: buildTelegramReport includes dedicated Cross-Hedging Portfolio section with 3 pillars', async () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'workers', 'daily-update-dispatcher', 'src', 'index.js'), 'utf8');
        const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

        const cachePath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

        const report = mod.buildTelegramReport({}, {}, {}, cache);
        assert.ok(report && typeof report.text === 'string', 'Report text must be non-empty string');
        assert.ok(report.text.includes('COMBO DANH MỤC BÙ TRỪ DÒNG TIỀN CHÉO (CROSS-HEDGING PORTFOLIO)'), 'Must contain cross-hedging header');
        assert.ok(report.text.includes('Trụ Cột 1: Đề Tinh Tuyển VIP'), 'Must contain Pillar 1');
        assert.ok(report.text.includes('Trụ Cột 2: Lô Ghép 4 Động Cơ'), 'Must contain Pillar 2');
        assert.ok(report.text.includes('Trụ Cột 3: Dàn Xiên Quây Hiệp Đồng'), 'Must contain Pillar 3');
        assert.ok(report.text.includes('CƠ CHẾ BÙ TRỪ AN TOÀN:'), 'Must contain hedging safety mechanism');
        assert.ok(report.text.includes('77.8%') || report.text.includes('Tỷ lệ ngày có lãi ròng:'), 'Must contain win rate telemetry');
        assert.ok(!report.text.includes('undefined') && !report.text.includes('NaN'), 'Report must not contain undefined or NaN');
    });

    await runAsyncTest('4.2: buildOptimalBetSlipMessage (/chot, /slip) synchronizes with 3 pillars and hedging guarantee', async () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'workers', 'daily-update-dispatcher', 'src', 'index.js'), 'utf8');
        const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

        const cachePath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

        const slip = mod.buildOptimalBetSlipMessage('2026-10-02', cache);
        assert.ok(typeof slip === 'string' && slip.length > 0, 'Bet slip must be non-empty string');
        assert.ok(slip.includes('CƠ CHẾ BÙ TRỪ DANH MỤC 3 TRỤ CỘT') || slip.includes('Cơ chế bù trừ an toàn'), 'Slip must include cross-hedging mechanism');
        assert.ok(slip.includes('Vốn chuẩn danh mục:'), 'Slip must include portfolio stake');
        assert.ok(!slip.includes('undefined') && !slip.includes('NaN'), 'Slip must not contain undefined or NaN');
    });

    await runAsyncTest('4.3: buildBetCalculationSheet (/cuoc) synchronizes with 3 pillars and hedging guarantee', async () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'workers', 'daily-update-dispatcher', 'src', 'index.js'), 'utf8');
        const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

        const cachePath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

        const tier = { id: 3, name: 'Mức 3', deK: 200, loDiem: 25, loX2Diem: 50, xien4K: 200 };
        const calc = mod.buildBetCalculationSheet(tier, '2026-10-02', cache);
        assert.ok(typeof calc === 'string' && calc.length > 0, 'Calculation sheet must be non-empty string');
        assert.ok(calc.includes('CƠ CHẾ BÙ TRỪ DANH MỤC 3 TRỤ CỘT'), 'Calc must include 3-pillar hedging mechanism');
        assert.ok(calc.includes('Nếu nổ Đề VIP'), 'Calc must show De VIP hit calculation');
        assert.ok(calc.includes('Nếu nổ Lô'), 'Calc must show Lo hit calculation');
        assert.ok(!calc.includes('undefined') && !calc.includes('NaN'), 'Calc must not contain undefined or NaN');
    });

    // ────────────────────────────────────────────────────────────────────────
    // FINAL SUMMARY
    // ────────────────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(80));
    console.log(`  M2 SYNC TEST SUMMARY: ${stats.passed}/${stats.total} assertions passed (${stats.failed} failed)`);
    console.log('='.repeat(80));

    if (stats.failed > 0) {
        console.error(`\n❌ TEST SUITE FAILED WITH ${stats.failed} FAILURES.\n`);
        process.exit(1);
    } else {
        console.log('\n✅ ALL MILESTONE 2 SYNCHRONIZATION TESTS PASSED PERFECTLY.\n');
        process.exit(0);
    }
}

main().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
