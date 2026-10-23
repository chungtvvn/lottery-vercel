'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('='.repeat(80));
console.log('🚀 TESTING LOTO CROSS X2 SSOT IMMUTABILITY & PERSISTENCE');
console.log('='.repeat(80));

// 1. Kiểm tra daily_locked_bets_registry.json
const regStatsPath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'daily_locked_bets_registry.json');
const regDataPath = path.join(__dirname, '..', 'data', 'daily_locked_bets_registry.json');

assert(fs.existsSync(regStatsPath), 'Registry file in lib/data/statistics must exist');
assert(fs.existsSync(regDataPath), 'Registry file in data/ must exist');

const reg = JSON.parse(fs.readFileSync(regStatsPath, 'utf8'));

// Test 2026-10-21 (kỳ gần nhất đã đối soát)
const entry21 = reg.dates?.['2026-10-21'];
assert(entry21, 'Entry for 2026-10-21 must exist in registry');
assert(entry21.isSettled, '2026-10-21 must be marked as settled');

const b21 = entry21.bets?.lo4EngineFusion;
const s21 = entry21.settlement?.lo4EngineFusion;

assert(b21, 'bets.lo4EngineFusion must exist for 2026-10-21');
assert(s21, 'settlement.lo4EngineFusion must exist for 2026-10-21');

assert(b21.crossX2, 'bets.lo4EngineFusion.crossX2 must exist');
assert(Array.isArray(b21.crossX2.tierX2) && b21.crossX2.tierX2.length > 0, 'bets.crossX2.tierX2 must have promoted numbers');
console.log('✔ PASS 1.1: bets.lo4EngineFusion.crossX2.tierX2 =', b21.crossX2.tierX2);

assert(s21.crossX2, 'settlement.lo4EngineFusion.crossX2 must exist');
assert(Array.isArray(s21.crossX2.tierX2) && s21.crossX2.tierX2.length > 0, 'settlement.crossX2.tierX2 must have promoted numbers');
console.log('✔ PASS 1.2: settlement.lo4EngineFusion.crossX2.tierX2 =', s21.crossX2.tierX2);

// Bất biến: tierX2 ở bet và settlement phải giống nhau 100%
assert.deepStrictEqual(b21.crossX2.tierX2, s21.crossX2.tierX2, 'tierX2 in bets and settlement must match 100%');
console.log('✔ PASS 1.3: tierX2 bất biến 100% giữa bets và settlement:', s21.crossX2.tierX2);

// 2. Kiểm tra cached_daily_method_advisor.json
const advPath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const adv = JSON.parse(fs.readFileSync(advPath, 'utf8'));

const rowMain = adv.lo4EngineFusion?.settledLedger?.find(r => r.date === '2026-10-21');
assert(rowMain?.crossX2?.tierX2?.length > 0, 'lo4EngineFusion.settledLedger must have crossX2 with promoted tierX2');
console.log('✔ PASS 2.1: lo4EngineFusion.settledLedger row has tierX2:', rowMain.crossX2.tierX2);

const rowTop7 = adv.lo4EngineFusion?.modes?.top7?.settledLedger?.find(r => r.date === '2026-10-21');
assert(rowTop7?.crossX2?.tierX2?.length > 0, 'lo4EngineFusion.modes.top7 must have crossX2 with promoted tierX2');
console.log('✔ PASS 2.2: modes.top7.settledLedger row has tierX2:', rowTop7.crossX2.tierX2);

const rowTop6 = adv.lo4EngineFusion?.modes?.top6?.settledLedger?.find(r => r.date === '2026-10-21');
assert(rowTop6?.crossX2?.tierX2?.length > 0, 'lo4EngineFusion.modes.top6 must have crossX2 with promoted tierX2');
console.log('✔ PASS 2.3: modes.top6.settledLedger row has tierX2:', rowTop6.crossX2.tierX2);

// 3. Kiểm tra pentaConsensus cho 2026-10-21
const { computePentaConsensusForDate } = require('../lib/services/pentaConsensusService');
const p21 = computePentaConsensusForDate('2026-10-21', adv);
assert(p21?.lo?.numbers?.length > 0, 'computePentaConsensusForDate for 2026-10-21 must not return empty numbers');
assert(p21.lo.x5Nums?.length > 0 || p21.lo.x4Nums?.length > 0 || p21.lo.x3Nums?.length > 0, 'PentaConsensus must have high consensus numbers');
console.log('✔ PASS 3.1: computePentaConsensusForDate produces non-empty consensus for 2026-10-21:', {
    x5: p21.lo.x5Nums,
    x4: p21.lo.x4Nums,
    x3: p21.lo.x3Nums
});

// 4. Kiểm tra settleDateDirectly không làm mất tierX2
const { settleDateDirectly } = require('../lib/services/dailyLockedBetsRegistryService');
const rawList = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json'), 'utf8'));
const raw21 = rawList.find(r => r.date === '2026-10-21');
assert(raw21, 'Raw result for 2026-10-21 must exist');

const reSettle = settleDateDirectly('2026-10-21', raw21);
assert(reSettle?.settlement?.lo4EngineFusion?.crossX2?.tierX2?.length > 0, 'Re-settle must preserve crossX2.tierX2');
assert.deepStrictEqual(reSettle.settlement.lo4EngineFusion.crossX2.tierX2, ['44', '52', '68'], 'Re-settle must match exact promoted numbers [44, 52, 68]');
console.log('✔ PASS 4.1: Re-settle directly preserves exact tierX2 [44, 52, 68]:', reSettle.settlement.lo4EngineFusion.crossX2.tierX2);

console.log('='.repeat(80));
console.log('🎉 ALL LOTO CROSS X2 IMMUTABILITY & SSOT TESTS PASSED 100%!');
console.log('='.repeat(80));
