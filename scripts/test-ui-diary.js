#!/usr/bin/env node
'use strict';
/**
 * test-ui-diary.js — UI guard checks for the daily-advisor history table
 * ("Nhật Ký Đối Soát"), UI-1..UI-7 (2026-10-27 UI fix).
 * Plain node:fs + node:assert only, no new dependency, no file writes, no network.
 * It checks static source properties only (it does not render the page):
 *  - UI-1: no broken `<th scope="col"ead>` tag remains; the diary thead is real.
 *  - UI-2: the diary table carries a min-width class and a scroll hint.
 *  - UI-3/UI-4/UI-5: the unified labels/notes/badge exist in the HTML/JS.
 *  - UI-6: the pending row derives Đề capital first and badges a stored-vs-derived mismatch.
 *  - UI-7: the pending-banner transform exists and is wired into the diary row map.
 */
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'views', 'daily-advisor.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public', 'js', 'daily-advisor.js'), 'utf8');

let passed = 0;
function check(name, fn) { fn(); passed += 1; console.log(`ok - ${name}`); }

// UI-1
check('UI-1: zero broken scope="col"ead tags in daily-advisor.html', () => {
    assert.strictEqual((html.match(/scope="col"ead/g) || []).length, 0);
});
check('UI-1: diary thead is a real <thead id="unifiedCombatDiaryTableHead">', () => {
    assert.ok(html.includes('<thead id="unifiedCombatDiaryTableHead">'));
});

// UI-2
check('UI-2: diary table has min-w-[1120px] and a horizontal-scroll hint', () => {
    assert.ok(html.includes('min-w-[1120px]'));
    assert.ok(html.includes('Kéo ngang để xem đủ 8 cột'));
});

// UI-3 / UI-4 / UI-5 (labels and notes)
check('UI-3: row-count text states settled + pending counts', () => {
    assert.ok(js.includes('đã kết toán + ') && js.includes('chờ KQ)`'));
    assert.ok(html.includes('Tỷ lệ thắng tính trên dòng đã kết toán'));
});
check('UI-4: one combo label everywhere, M3 footnote present', () => {
    assert.ok(html.includes('Lũy kế combo (Đề + Lô + 2 Xiên 4)'));
    assert.ok(js.includes("all: 'Lũy kế combo (Đề + Lô + 2 Xiên 4):'"));
    assert.ok(html.includes('unifiedDiaryM3FootnoteValue'));
    assert.ok(!html.includes('Lỗ Lãi Lũy Kế Mốc:'));
});
check('UI-5: Xiên 5 card carries the independent badge', () => {
    assert.ok(html.includes('Theo dõi độc lập — không cộng vào combo'));
});

// UI-6 (display only)
check('UI-6: pending row derives Đề capital first and badges a mismatch', () => {
    assert.ok(js.includes('const deDerivedStakeVal'));
    assert.ok(js.includes('const deStakeVal = deDerivedStakeVal;'));
    assert.ok(js.includes('Vốn lưu lệch vốn suy ra'));
});

// UI-7
check('UI-7: pending-banner transform exists and is wired into the diary row map', () => {
    assert.ok(js.includes('function applyDiaryPendingBanner'));
    assert.ok(js.includes('diary-pending-banner'));
    assert.ok(js.includes('.map(rowHtml => applyDiaryPendingBanner(rowHtml)).join'));
});

console.log(`\nAll ${passed} UI diary checks passed.`);
