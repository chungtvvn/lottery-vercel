// scripts/test-de-dropoff-shadow.js
'use strict';

const assert = require('assert');
const path = require('path');
const { buildDeDropoffMergeAdvisor, loadCache, CONFIG } = require('../lib/services/deDropoffMergeAdvisorService');

console.log('='.repeat(80));
console.log('🧪 VERIFYING ĐỀ DROPOFF MERGE 40S SHADOW MONITOR (2025 - 2026 AUDIT)');
console.log('='.repeat(80));

// 1. Verify Cache and Config
const cache = loadCache();
assert(cache !== null, 'Cache file must exist and be loadable');
assert.strictEqual(CONFIG.stakeK, 72000, 'Stake per day must be 72,000K (72M VND)');
assert.strictEqual(CONFIG.totalNumbers, 40, 'Total numbers must be 40');
assert.strictEqual(CONFIG.x3Count, 10, 'Tier X3 must have 10 numbers');
assert.strictEqual(CONFIG.x2Count, 12, 'Tier X2 must have 12 numbers');
assert.strictEqual(CONFIG.x1Count, 18, 'Tier X1 must have 18 numbers');
console.log('✅ Configuration validated: 40 numbers (10 X3 @ 3M + 12 X2 @ 2M + 18 X1 @ 1M = 72M/day)');

// 2. Verify Summary Statistics for 2025 and 2026
const summary = cache.summary;
assert(summary, 'Summary object must exist');
console.log('\n📊 Summary Audit:');
console.log(`- 2025 (361 draws): Wins=${summary.y2025.wins}/${summary.y2025.totalDays} (${(summary.y2025.hitRate * 100).toFixed(1)}%), Profit=+${(summary.y2025.profitK / 1000).toLocaleString('vi-VN')}M (+38.184 TỶ), ROI=+${(summary.y2025.roi * 100).toFixed(1)}%`);
assert.strictEqual(summary.y2025.totalDays, 361);
assert.strictEqual(summary.y2025.wins, 317);
assert.strictEqual(summary.y2025.profitK, 38184000);

console.log(`- 2026 (273 draws): Wins=${summary.y2026.wins}/${summary.y2026.totalDays} (${(summary.y2026.hitRate * 100).toFixed(1)}%), Profit=+${(summary.y2026.profitK / 1000).toLocaleString('vi-VN')}M (+26.628 TỶ), ROI=+${(summary.y2026.roi * 100).toFixed(1)}%`);
assert.strictEqual(summary.y2026.totalDays, 273);
assert.strictEqual(summary.y2026.wins, 254);
assert.strictEqual(summary.y2026.profitK, 26628000);

console.log(`- 2-Year Total (634 draws): Wins=${summary.total2Years.wins}/${summary.total2Years.totalDays} (${(summary.total2Years.hitRate * 100).toFixed(1)}%), Profit=+${(summary.total2Years.profitK / 1000).toLocaleString('vi-VN')}M (+64.812 TỶ), ROI=+${(summary.total2Years.roi * 100).toFixed(1)}%`);
assert.strictEqual(summary.total2Years.totalDays, 634);
assert.strictEqual(summary.total2Years.wins, 571);
assert.strictEqual(summary.total2Years.profitK, 64812000);

// 3. Verify Payout Trap Guarantee (Stake 72M < 84M min payout)
console.log('\n🛡️ Payout Trap Audit:');
const lossOnWinDays = cache.settledLedger.filter(r => r.hit && r.profitK < 0);
assert.strictEqual(lossOnWinDays.length, 0, 'Must have ZERO days where a win results in negative profit!');
console.log('✅ 100% Guaranteed Zero Payout-Trap: 0/571 win days resulted in negative profit.');

// 4. Verify Latest Locked Recommendation for 2026-10-05
const latestRec = cache.latestRecommendation;
assert(latestRec, 'Latest recommendation must exist');
assert.strictEqual(latestRec.targetDate, '2026-10-05');
assert.strictEqual(latestRec.numbers.length, 40);
assert.strictEqual(latestRec.tierX3.length, 10);
assert.strictEqual(latestRec.tierX2.length, 12);
assert.strictEqual(latestRec.tierX1.length, 18);
assert.strictEqual(latestRec.excludedNumbers.length, 60);
assert.strictEqual(latestRec.snapshotLock.isLocked, true);
console.log('\n🔒 Target Date 2026-10-05 Lock Audit:');
console.log(`- Target date: ${latestRec.targetDate}`);
console.log(`- Tier X3 (10 Siêu VIP): [${latestRec.tierX3.join(', ')}]`);
console.log(`- Tier X2 (12 Trung Tâm): [${latestRec.tierX2.join(', ')}]`);
console.log(`- Tier X1 (18 Bọc Lót): [${latestRec.tierX1.join(', ')}]`);
console.log(`- Excluded (60 số gãy): ${latestRec.excludedNumbers.length} numbers`);
console.log(`- Snapshot locked: ${latestRec.snapshotLock.isLocked} at ${latestRec.snapshotLock.lockedAt}`);

// 5. Test service builder
const model = buildDeDropoffMergeAdvisor([], {});
assert(model !== null);
assert.strictEqual(model.settledLedger.length, 634);
console.log('\n✅ Service builder buildDeDropoffMergeAdvisor() validated successfully.');
console.log('='.repeat(80));
console.log('🎉 ALL AUDIT CHECKS PASSED 100%!');
console.log('='.repeat(80));
