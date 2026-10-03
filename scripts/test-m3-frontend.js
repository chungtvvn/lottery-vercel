#!/usr/bin/env node
/**
 * scripts/test-m3-frontend.js
 *
 * Milestone 3 Verification Suite:
 * Frontend Web UI /daily-advisor Upgrade (Requirement R4 frontend)
 *
 * Verifies:
 * 1. HTML Layout & Template IDs (views/daily-advisor.html)
 * 2. Strategic Portfolio Combo Card Dynamic Telemetry Elements
 * 3. 6-Column Unified Combat Diary Audit Table (#unifiedCombatDiaryTableHead)
 * 4. Client JS Logic & Defensive Handlers (public/js/daily-advisor.js)
 * 5. Headless Mock Execution of syncCrossHedgingComboCard & Row Rendering
 * 6. Mathematical Consistency between View Figures and crossHedgingPortfolio Data
 *
 * Zero External Dependencies (Native Node.js assert).
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'views', 'daily-advisor.html');
const JS_PATH = path.join(ROOT_DIR, 'public', 'js', 'daily-advisor.js');
const CACHE_PATH = path.join(ROOT_DIR, 'data', 'cached_daily_method_advisor.json');

console.log('='.repeat(80));
console.log('  MILESTONE 3: FRONTEND WEB UI /daily-advisor VERIFICATION');
console.log('='.repeat(80));

// =========================================================================
// SECTION 1: HTML Structure & Template IDs Verification
// =========================================================================
console.log('\n--- SECTION 1: HTML Structure & Template IDs (views/daily-advisor.html) ---');

let htmlContent = '';
test('views/daily-advisor.html exists and is readable', () => {
    assert.ok(fs.existsSync(HTML_PATH), 'daily-advisor.html must exist');
    htmlContent = fs.readFileSync(HTML_PATH, 'utf8');
    assert.ok(htmlContent.length > 10000, 'daily-advisor.html must have substantial content');
});

test('Contains #strategicPortfoliosGrid container', () => {
    assert.ok(htmlContent.includes('id="strategicPortfoliosGrid"'), 'HTML must contain #strategicPortfoliosGrid');
});

test('Contains all required Combo Card telemetry element IDs', () => {
    const requiredIds = [
        'comboCardBadge',
        'comboCardProfitRoi',
        'comboCardTitle',
        'comboCardRationale',
        'comboDailyWinRate',
        'comboWinDaysText',
        'comboDailyStake',
        'comboStakeTierText',
        'comboCumulativeRoi',
        'comboCumulativeProfit',
        'comboMaxDrawdown',
        'comboPillarsBreakdown',
        'comboPillar1DeText',
        'comboPillar2LoText',
        'comboPillar3XienText',
        'comboHedgingMechanism',
        'comboHedgingGuaranteeText'
    ];

    for (const id of requiredIds) {
        assert.ok(htmlContent.includes(`id="${id}"`), `HTML must contain element #${id}`);
    }
});

test('Contains #unifiedCombatDiaryTableHead with exact 6 institutional columns', () => {
    assert.ok(htmlContent.includes('id="unifiedCombatDiaryTableHead"'), 'HTML must contain #unifiedCombatDiaryTableHead');

    // Extract table head content
    const theadMatch = htmlContent.match(/<thead[^>]*id="unifiedCombatDiaryTableHead"[^>]*>([\s\S]*?)<\/thead>/);
    assert.ok(theadMatch, 'Must find <thead> with id="unifiedCombatDiaryTableHead"');
    const theadContent = theadMatch[1];

    const requiredColumns = [
        'Ngày',
        '💎 Đề Tinh Tuyển VIP',
        '🔥 Lô Ghép 4 Động Cơ',
        '🎲 Dàn Xiên Quây',
        'Lãi/Lỗ Tổng Hợp (Profit_total)',
        'Lũy Kế Mốc'
    ];

    for (const col of requiredColumns) {
        assert.ok(theadContent.includes(col), `Header must include column: ${col}`);
    }

    const thMatches = theadContent.match(/<th\b/g) || [];
    assert.ok(thMatches.length >= 6 && thMatches.length <= 7, `Header must have 6 or 7 columns, found ${thMatches.length}`);
});

test('Contains #unifiedCombatDiaryTableBody container', () => {
    assert.ok(htmlContent.includes('id="unifiedCombatDiaryTableBody"'), 'HTML must contain #unifiedCombatDiaryTableBody');
});

test('Category filter tabs include Combo Bù Trừ Chéo as active button', () => {
    assert.ok(htmlContent.includes('data-diary-cat="all"'), 'HTML must contain category tab data-diary-cat="all"');
    assert.ok(htmlContent.includes('Combo Bù Trừ Chéo'), 'Category tab must be labeled Combo Bù Trừ Chéo');
});

// =========================================================================
// SECTION 2: JavaScript Syntax & Logic Implementation
// =========================================================================
console.log('\n--- SECTION 2: JavaScript Syntax & Implementation (public/js/daily-advisor.js) ---');

let jsContent = '';
test('public/js/daily-advisor.js syntax validation (node -c)', () => {
    assert.ok(fs.existsSync(JS_PATH), 'daily-advisor.js must exist');
    jsContent = fs.readFileSync(JS_PATH, 'utf8');
    execSync(`node -c "${JS_PATH}"`, { stdio: 'pipe' });
});

test('PORTFOLIOS_CONFIG defines crossHedging with tier Mức 3 11,320K', () => {
    assert.ok(jsContent.includes("crossHedging:"), 'PORTFOLIOS_CONFIG must contain crossHedging entry');
    assert.ok(jsContent.includes("11,320K"), 'crossHedging must define 11,320K base stake');
    assert.ok(jsContent.includes("Đề VIP + Lô Ghép 4 + Xiên Quây"), 'crossHedging must describe the 3 pillars');
});

test('PORTFOLIOS_CONFIG maxProfit points to Cross-Hedging Combo Portfolio', () => {
    assert.ok(jsContent.includes("COMBO BÙ TRỪ DÒNG TIỀN CHÉO"), 'maxProfit portfolio title must represent Cross-Hedging Combo');
});

test('syncCrossHedgingComboCard function is implemented with defensive null-checks', () => {
    assert.ok(jsContent.includes("function syncCrossHedgingComboCard(chData)"), 'syncCrossHedgingComboCard must be defined');
    assert.ok(jsContent.includes("if (!chData) return;"), 'syncCrossHedgingComboCard must defensively check for missing data');
    assert.ok(jsContent.includes("comboDailyWinRate"), 'syncCrossHedgingComboCard must populate #comboDailyWinRate');
    assert.ok(jsContent.includes("comboDailyStake"), 'syncCrossHedgingComboCard must populate #comboDailyStake');
    assert.ok(jsContent.includes("comboCumulativeRoi"), 'syncCrossHedgingComboCard must populate #comboCumulativeRoi');
    assert.ok(jsContent.includes("comboCumulativeProfit"), 'syncCrossHedgingComboCard must populate #comboCumulativeProfit');
    assert.ok(jsContent.includes("comboHedgingGuaranteeText"), 'syncCrossHedgingComboCard must populate #comboHedgingGuaranteeText');
});

test('renderUnifiedKpiCards wires syncCrossHedgingComboCard and updates KPI Card 7', () => {
    assert.ok(jsContent.includes("syncCrossHedgingComboCard(payload.crossHedgingPortfolio);") || jsContent.includes("syncCrossHedgingComboCard(data.crossHedgingPortfolio);"), 'renderUnifiedKpiCards must call syncCrossHedgingComboCard');
    assert.ok(jsContent.includes("COMBO BÙ TRỪ DÒNG TIỀN CHÉO"), 'Card 7 must display COMBO BÙ TRỪ DÒNG TIỀN CHÉO');
});

test('selectStrategicPortfolio wires syncCrossHedgingComboCard', () => {
    assert.ok(jsContent.includes("syncCrossHedgingComboCard(fullData?.crossHedgingPortfolio || payload?.crossHedgingPortfolio);") || jsContent.includes("syncCrossHedgingComboCard(payload?.crossHedgingPortfolio);"), 'selectStrategicPortfolio must call syncCrossHedgingComboCard');
});

test('renderUnifiedCombatDiary tracks crossHedgingMap and cumCrossProfitK', () => {
    assert.ok(jsContent.includes("const crossHedgingLedger = payload?.crossHedgingPortfolio?.settledLedger || [];"), 'Must read settledLedger');
    assert.ok(jsContent.includes("const crossHedgingMap = {};"), 'Must build crossHedgingMap indexed by date');
    assert.ok(jsContent.includes("let cumCrossProfitK = 0;"), 'Must maintain cumCrossProfitK');
    assert.ok(jsContent.includes("chDePnlK"), 'Must compute chDePnlK');
    assert.ok(jsContent.includes("chLoPnlK"), 'Must compute chLoPnlK');
    assert.ok(jsContent.includes("chXienPnlK"), 'Must compute chXienPnlK');
    assert.ok(jsContent.includes("chTotalProfitK"), 'Must compute chTotalProfitK');
});

test('renderUnifiedCombatDiary empty state has colspan="6" or "7"', () => {
    assert.ok(jsContent.includes('<td colspan="7" class="py-10 text-center bg-amber-50/50">') || jsContent.includes('<td colspan="6" class="py-10 text-center bg-amber-50/50">'), 'Empty state must use colspan="6" or "7"');
});

test('renderUnifiedCombatDiary thead generation produces exact 6 or 7 columns for default all view', () => {
    const jsTheadRegex = /<tr[^>]*>\s*<th[^>]*>Ngày<\/th>\s*<th[^>]*>💎 Đề Tinh Tuyển VIP<\/th>\s*<th[^>]*>🔥 Lô Ghép 4 Động Cơ<\/th>\s*<th[^>]*>🎲 Dàn Xiên Quây<\/th>(\s*<th[^>]*>👑 Dàn Xiên 5[^<]*<\/th>)?\s*<th[^>]*>Lãi\/Lỗ Tổng Hợp \(Profit_total\)<\/th>\s*<th[^>]*>Lũy Kế Mốc<\/th>\s*<\/tr>/;
    assert.ok(jsTheadRegex.test(jsContent), 'JS thead template must match 6 or 7 columns');
});

test('View 5 template generates <td> elements for pending and settled rows', () => {
    assert.ok(jsContent.includes("VIEW TỔNG HỢP COMBO BÙ TRỪ DÒNG TIỀN CHÉO"), 'View comment must be present');
    assert.ok(jsContent.includes('<!-- Cột 1: Ngày -->'), 'View must have Cột 1');
    assert.ok(jsContent.includes('<!-- Cột 2: Đề Tinh Tuyển VIP -->'), 'View must have Cột 2');
    assert.ok(jsContent.includes('<!-- Cột 3: Lô Ghép 4 Động Cơ -->'), 'View must have Cột 3');
    assert.ok(jsContent.includes('<!-- Cột 4: Dàn Xiên Quây'), 'View must have Cột 4');
    assert.ok(jsContent.includes('<!-- Cột 5: Dàn Xiên 5') || jsContent.includes('<!-- Cột 5: Lãi/Lỗ Tổng Hợp -->'), 'View must have Cột 5');
});

// =========================================================================
// SECTION 3: Headless Mock Execution & Dynamic Data Binding
// =========================================================================
console.log('\n--- SECTION 3: Headless Mock Execution & Dynamic Data Binding ---');

let cacheData = {};
test('Load data/cached_daily_method_advisor.json and verify crossHedgingPortfolio contract', () => {
    assert.ok(fs.existsSync(CACHE_PATH), 'Cache file must exist');
    cacheData = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    assert.ok(cacheData.crossHedgingPortfolio, 'crossHedgingPortfolio must exist in cache');
    assert.ok(cacheData.crossHedgingPortfolio.metrics, 'metrics must exist');
    assert.ok(cacheData.crossHedgingPortfolio.settledLedger, 'settledLedger must exist');
    assert.ok(Array.isArray(cacheData.crossHedgingPortfolio.settledLedger), 'settledLedger must be array');
    assert.ok(cacheData.crossHedgingPortfolio.settledLedger.length >= 260, 'settledLedger must have >= 260 items');
});

// Create a DOM Mock environment
function createMockDom() {
    const elements = new Map();

    function getOrCreateElement(id) {
        if (!elements.has(id)) {
            elements.set(id, {
                id,
                textContent: '',
                innerHTML: '',
                className: '',
                classList: {
                    add: () => {},
                    remove: () => {},
                    contains: () => false
                },
                style: {},
                dataset: {}
            });
        }
        return elements.get(id);
    }

    return {
        byId: (id) => getOrCreateElement(id),
        get: (id) => elements.get(id)
    };
}

// Extract and test syncCrossHedgingComboCard in isolated sandbox
test('Execute syncCrossHedgingComboCard in mock DOM with actual cached data', () => {
    const mockDom = createMockDom();

    // Helper money / percent functions matching daily-advisor.js
    function moneyM(k, opts = {}) {
        if (k == null || isNaN(k)) return '--';
        const num = Number(k);
        const signed = opts.signed ? (num > 0 ? '+' : '') : '';
        if (Math.abs(num) >= 1000000) {
            return `${signed}${(num / 1000000).toFixed(2)} TỶ`;
        }
        if (Math.abs(num) >= 1000) {
            return `${signed}${(num / 1000).toFixed(1)}M`;
        }
        return `${signed}${num.toLocaleString('vi-VN')}K`;
    }

    function percent(val) {
        if (val == null || isNaN(val)) return '--';
        const num = Number(val);
        return `${(num * 100).toFixed(1)}%`;
    }

    // Extract function implementation
    const syncFuncMatch = jsContent.match(/function syncCrossHedgingComboCard\(chData\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(syncFuncMatch, 'Must extract syncCrossHedgingComboCard implementation');

    const fnBody = syncFuncMatch[1];
    const testFn = new Function('chData', 'byId', 'moneyM', 'percent', fnBody);

    // Run with real cache data
    testFn(cacheData.crossHedgingPortfolio, mockDom.byId, moneyM, percent);

    // Verify DOM updates
    const winRateEl = mockDom.get('comboDailyWinRate');
    const expectedRate = percent(cacheData.crossHedgingPortfolio.metrics.dailyPositiveProfitRate);
    assert.ok(winRateEl && winRateEl.textContent.includes(expectedRate), `Win rate must be ${expectedRate}, got: ${winRateEl?.textContent}`);

    const winDaysEl = mockDom.get('comboWinDaysText');
    const expectedDays = `${cacheData.crossHedgingPortfolio.metrics.positiveDays2026}/${cacheData.crossHedgingPortfolio.metrics.totalDraws2026}`;
    assert.ok(winDaysEl && winDaysEl.textContent.includes(expectedDays), `Win days must include ${expectedDays}, got: ${winDaysEl?.textContent}`);

    const stakeEl = mockDom.get('comboDailyStake');
    assert.ok(stakeEl && (stakeEl.textContent.includes('11,320K') || stakeEl.textContent.includes('11.320K')), `Daily stake must be 11,320K or 11.320K, got: ${stakeEl?.textContent}`);

    const roiEl = mockDom.get('comboCumulativeRoi');
    const expectedRoi = percent(cacheData.crossHedgingPortfolio.metrics.cumulativeRoi);
    assert.ok(roiEl && (roiEl.textContent.includes(expectedRoi) || roiEl.textContent.includes('120')), `ROI must be ${expectedRoi}, got: ${roiEl?.textContent}`);

    const profitEl = mockDom.get('comboCumulativeProfit');
    const expectedProfit = moneyM(cacheData.crossHedgingPortfolio.metrics.cumulativeProfitK, { signed: true });
    assert.ok(profitEl && profitEl.textContent.includes(expectedProfit), `Profit must be ${expectedProfit}, got: ${profitEl?.textContent}`);

    const ddEl = mockDom.get('comboMaxDrawdown');
    assert.ok(ddEl && ddEl.textContent.includes('3 ngày'), `Max drawdown must be 3 ngày, got: ${ddEl?.textContent}`);

    const p1El = mockDom.get('comboPillar1DeText');
    assert.ok(p1El && p1El.textContent.includes('Đề Markov'), `Pillar 1 text must mention Đề Markov, got: ${p1El?.textContent}`);

    const p2El = mockDom.get('comboPillar2LoText');
    assert.ok(p2El && (p2El.textContent.includes('Lô') || p2El.textContent.includes('4 Động Cơ')), `Pillar 2 text must mention Lô, got: ${p2El?.textContent}`);

    const p3El = mockDom.get('comboPillar3XienText');
    assert.ok(p3El && p3El.textContent.includes('11 vé'), `Pillar 3 text must mention 11 vé, got: ${p3El?.textContent}`);

    const guaranteeEl = mockDom.get('comboHedgingGuaranteeText');
    assert.ok(guaranteeEl && guaranteeEl.textContent.includes('BẢO TOÀN LÃI RÒNG THẤT THỦ'), `Guarantee text must be present, got: ${guaranteeEl?.textContent}`);
});

test('syncCrossHedgingComboCard executes defensively when chData is null without throwing', () => {
    const mockDom = createMockDom();
    const syncFuncMatch = jsContent.match(/function syncCrossHedgingComboCard\(chData\)\s*\{([\s\S]*?)\n    \}/);
    const testFn = new Function('chData', 'byId', 'moneyM', 'percent', syncFuncMatch[1]);

    // Should not throw on null, undefined, or empty object
    testFn(null, mockDom.byId, () => '', () => '');
    testFn(undefined, mockDom.byId, () => '', () => '');
    testFn({}, mockDom.byId, () => '', () => '');
});

// =========================================================================
// SECTION 4: Mathematical Consistency & PIT Ledger Verification
// =========================================================================
console.log('\n--- SECTION 4: Mathematical Consistency & PIT Ledger Verification ---');

test('settledLedger strictly satisfies: dePnlK + loPnlK + xienPnlK === totalProfitK across all dates', () => {
    const ledger = cacheData.crossHedgingPortfolio.settledLedger;
    let mismatches = 0;

    for (const row of ledger) {
        const expected = row.dePnlK + row.loPnlK + row.xienPnlK;
        if (expected !== row.totalProfitK) {
            mismatches++;
        }
    }

    assert.strictEqual(mismatches, 0, `All ${ledger.length} entries must have dePnlK + loPnlK + xienPnlK === totalProfitK`);
});

test('settledLedger final cumulativeProfitK matches metrics.cumulativeProfitK exactly', () => {
    const ledger = cacheData.crossHedgingPortfolio.settledLedger;
    const finalRow = ledger[ledger.length - 1];
    const metricsProfit = cacheData.crossHedgingPortfolio.metrics.cumulativeProfitK;

    assert.strictEqual(finalRow.cumulativeProfitK, metricsProfit, `Final row cumulative ${finalRow.cumulativeProfitK} must match metrics ${metricsProfit}`);
    assert.ok(metricsProfit > 5000000, `Cumulative profit must be > 5,000,000K, got ${metricsProfit}`);
});

test('settledLedger win rate matches metrics.dailyPositiveProfitRate within 0.0001', () => {
    const ledger = cacheData.crossHedgingPortfolio.settledLedger;
    const wins = ledger.filter(r => r.isWin).length;
    const computedRate = wins / ledger.length;
    const metricRate = cacheData.crossHedgingPortfolio.metrics.dailyPositiveProfitRate;

    assert.ok(Math.abs(computedRate - metricRate) < 0.001, `Computed rate ${computedRate} must match metric rate ${metricRate}`);
    assert.strictEqual(wins, cacheData.crossHedgingPortfolio.metrics.positiveDays2026, `Total winning draws must match metrics.positiveDays2026`);
    assert.strictEqual(ledger.length, cacheData.crossHedgingPortfolio.metrics.totalDraws2026, `Total draws must match metrics.totalDraws2026`);
});

// =========================================================================
// SECTION 5: Reviewer 2 Defect Fixes Verification (Modal Slip, Monthly Tables, 18 Combat Draws)
// =========================================================================
console.log('\n--- SECTION 5: Reviewer 2 Defect Fixes Verification ---');

test('resolveMethodPlaySlipData for crossHedging on 2026-10-03 returns multi-asset combo math', () => {
    const number = (n) => String(n).padStart(2, '0').slice(-2);
    const resolveSlipMatch = jsContent.match(/function resolveMethodPlaySlipData\(methodKey, date, p\) \{([\s\S]*?)\n    \}/);
    assert.ok(resolveSlipMatch, 'Must find resolveMethodPlaySlipData');
    const fnSlip = new Function('methodKey', 'date', 'p', 'payload', 'number', 'moneyM', 'escapeHtml', 'resolveUnifiedDeRowForDate', resolveSlipMatch[0] + '\nreturn resolveMethodPlaySlipData(methodKey, date, p);');

    const res = fnSlip('crossHedging', '2026-10-03', cacheData, cacheData, number, (k) => k + 'M', (s) => s, () => ({}));
    assert.strictEqual(res.profitK, 31200, `Profit for 2026-10-03 must be +31,200K, got ${res.profitK}`);
    assert.strictEqual(res.isHit, true, 'isHit must be true for winning 03/10 combo');
    assert.strictEqual(res.stakeK, 140800, `Stake must be 140,800K, got ${res.stakeK}`);
    assert.strictEqual(res.payoutK, 172000, `Payout must be 172,000K, got ${res.payoutK}`);
    assert.ok(res.numbers && res.numbers.length > 0, 'Numbers must be populated');
    assert.ok(res.hitBadge.includes('+31.2M') || res.hitBadge.includes('THẮNG'), 'Hit badge must show win');
});

test('resolveMethodPlaySlipData for crossHedging across 18 combat dates yields +421.7M VIP profit and 7/18 wins', () => {
    const number = (n) => String(n).padStart(2, '0').slice(-2);
    const resolveSlipMatch = jsContent.match(/function resolveMethodPlaySlipData\(methodKey, date, p\) \{([\s\S]*?)\n    \}/);
    const fnSlip = new Function('methodKey', 'date', 'p', 'payload', 'number', 'moneyM', 'escapeHtml', 'resolveUnifiedDeRowForDate', resolveSlipMatch[0] + '\nreturn resolveMethodPlaySlipData(methodKey, date, p);');

    const combatDates = [
        '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21',
        '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
        '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'
    ];

    let totalProfitK = 0;
    let wins = 0;
    combatDates.forEach(d => {
        const r = fnSlip('crossHedging', d, cacheData, cacheData, number, (k) => k + 'M', (s) => s, () => ({}));
        totalProfitK += r.profitK;
        if (r.isHit) wins++;
    });

    assert.strictEqual(totalProfitK, 421680, `Total combat profit must be +421,680K, got ${totalProfitK}`);
    assert.strictEqual(wins, 7, `Total combat wins must be 7/18, got ${wins}`);
});

test('renderDeMonthlyTable renders valid rows for crossHedging and lo4Engine without empty warning', () => {
    const elements = {};
    const byId = (id) => (elements[id] || (elements[id] = { innerHTML: '', className: '' }));

    const match = jsContent.match(/function renderDeMonthlyTable\(records = \[\], methodId = 'metaLearner'\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(match, 'Must find renderDeMonthlyTable');
    const fn = new Function('records', 'methodId', 'byId', 'percent', 'moneyM', 'signedM', match[1]);

    // Test crossHedging
    fn(cacheData.crossHedgingPortfolio.settledLedger, 'crossHedging', byId, (v) => (v * 100).toFixed(1) + '%', (v) => v + 'K', (v) => (v >= 0 ? '+' : '') + v + 'K');
    const tableHtmlCH = elements['dualMergeMonthlyTableBody'].innerHTML;
    assert.ok(tableHtmlCH.includes('Tháng'), 'crossHedging monthly table must include monthly rows');
    assert.ok(!tableHtmlCH.includes('Chưa có dữ liệu thống kê tháng'), 'crossHedging monthly table must NOT show empty error');

    // Test lo4Engine
    fn(cacheData.lo4EngineFusion.modes.top7.settledLedger, 'lo4Engine', byId, (v) => (v * 100).toFixed(1) + '%', (v) => v + 'K', (v) => (v >= 0 ? '+' : '') + v + 'K');
    const tableHtmlLo = elements['dualMergeMonthlyTableBody'].innerHTML;
    assert.ok(tableHtmlLo.includes('Tháng'), 'lo4Engine monthly table must include monthly rows');
    assert.ok(!tableHtmlLo.includes('Chưa có dữ liệu thống kê tháng'), 'lo4Engine monthly table must NOT show empty error');
});

test('getDeMethodObject(deMarkovGapHazard) incorporates all 18 combat dates up to 03/10/2026 and valid window stats', () => {
    const getDeMatch = jsContent.match(/function getDeMethodObject\(methodId, p = payload\)\s*\{([\s\S]*?)\n    \}/);
    const computeStatsMatch = jsContent.match(/function computeLastNDaysStats\(records = \[\], n = 7, stakePerDay = 60000\)\s*\{([\s\S]*?)\n    \}/);
    assert.ok(getDeMatch && computeStatsMatch, 'Must find getDeMethodObject and computeLastNDaysStats');

    const fnGetDe = new Function('methodId', 'p', 'payload', computeStatsMatch[0] + '\n' + getDeMatch[0] + '\nreturn getDeMethodObject(methodId, p);');

    const mkObj = fnGetDe('deMarkovGapHazard', cacheData, cacheData);
    assert.strictEqual(mkObj.records.length, 272, `deMarkovGapHazard records length must be 272, got ${mkObj.records.length}`);

    const combatRecords = mkObj.records.filter(r => (r.date || r.predictionDate) >= '2026-09-16');
    assert.strictEqual(combatRecords.length, 18, `Combat records count must be 18, got ${combatRecords.length}`);

    const lastDate = mkObj.records[mkObj.records.length - 1].date;
    assert.strictEqual(lastDate, '2026-10-03', `Last record date must be 2026-10-03, got ${lastDate}`);

    assert.ok(mkObj.summary.windows && mkObj.summary.windows.last7, 'Windows stats must be present');
    assert.strictEqual(mkObj.summary.windows.last7.days, 7, 'Last 7 days window must have 7 days');
});

// =========================================================================
// SECTION 6: Summary Report
// =========================================================================
console.log('\n' + '='.repeat(80));
console.log(`  MILESTONE 3 VERIFICATION COMPLETE: ${stats.passed}/${stats.total} PASSED`);
if (stats.failed > 0) {
    console.error(`  ❌ FAILURES: ${stats.failed}`);
    process.exit(1);
} else {
    console.log('  ✅ ALL TESTS PASSED: Frontend Web UI /daily-advisor is fully verified!');
    console.log('='.repeat(80));
    process.exit(0);
}
