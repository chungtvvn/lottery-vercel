// scripts/test-lo-dropoff-shadow.js
'use strict';

const assert = require('assert');
const path = require('path');
const { buildLoDropoff27Advisor, loadCache, CONFIG } = require('../lib/services/loDropoff27AdvisorService');

console.log('='.repeat(80));
console.log('🧪 VERIFYING LÔ DROPOFF 27 VỊ TRÍ SHADOW MONITOR (LIVE COMBAT WINDOW FROM 17/09/2026)');
console.log('   UNIT SIZING: 2.2M ĂN 8M (x2 LÀ 4.4M ĂN 16M, x3 LÀ 6.6M ĂN 24M)');
console.log('='.repeat(80));

// 1. Verify Cache and Config
const cache = loadCache();
assert(cache !== null, 'Cache file must exist and be loadable');
assert.strictEqual(CONFIG.strategyId, 'loDropoff27');
assert.strictEqual(CONFIG.unitCostK, 2200, 'Cost per unit must be 2,200K (2.2M VND)');
assert.strictEqual(CONFIG.unitPayoutK, 8000, 'Payout per hit must be 8,000K (8.0M VND)');
assert.strictEqual(CONFIG.x1CostK, 2200, 'Tier X1 cost must be 2.2M VND');
assert.strictEqual(CONFIG.x1PayoutK, 8000, 'Tier X1 payout must be 8.0M VND');
assert.strictEqual(CONFIG.x2CostK, 4400, 'Tier X2 cost must be 4.4M VND');
assert.strictEqual(CONFIG.x2PayoutK, 16000, 'Tier X2 payout must be 16.0M VND');
assert.strictEqual(CONFIG.x3CostK, 6600, 'Tier X3 cost must be 6.6M VND');
assert.strictEqual(CONFIG.x3PayoutK, 24000, 'Tier X3 payout must be 24.0M VND');
console.log('✅ Configuration validated: 2.2M ăn 8M (x2 là 4.4M ăn 16M, x3 là 6.6M ăn 24M)');

// 2. Verify Strict Cutoff >= 2026-09-17
console.log('\n📅 Strict Cutoff Audit:');
const invalidDates = cache.settledLedger.filter(r => r.date < '2026-09-17');
assert.strictEqual(invalidDates.length, 0, 'Must have ZERO records prior to 2026-09-17');
assert.strictEqual(cache.settledLedger.length, 18, 'Must have exactly 18 settled records (17/09/2026 to 04/10/2026)');
assert.strictEqual(cache.settledLedger[0].date, '2026-09-17', 'First settled date must be 2026-09-17');
assert.strictEqual(cache.settledLedger[cache.settledLedger.length - 1].date, '2026-10-04', 'Last settled date must be 2026-10-04');
console.log(`✅ Cutoff strictly enforced: 18 draws from ${cache.settledLedger[0].date} to ${cache.settledLedger[cache.settledLedger.length - 1].date}`);

// 3. Verify Live Combat Performance Metrics (Flat 2.2M ăn 8M & Tier X3/X2/X1)
const live = cache.summary?.liveCombat;
assert(live, 'Live combat summary must exist');
console.log('\n📊 Live Combat Metrics (Top 7 @ 18 Kỳ Thực Chiến):');
console.log(`- Draws: ${live.totalDays} draws`);
console.log(`- Total Nháy: ${live.totalHits} nháy (Avg ${(live.avgHitsPerDay).toFixed(2)} nháy/ngày)`);

console.log('\n--- 1. Chế độ Đánh Đều 1 Đơn Vị (2.2M/số · Ăn 8M/nháy) ---');
console.log(`- Wins (>= 2 nháy): ${live.wins}/${live.totalDays} (${(live.hitRate * 100).toFixed(1)}%)`);
console.log(`- Vốn 1 ngày: 15.4M | Tổng Vốn 18 kỳ: ${(live.stakeK / 1000).toLocaleString('vi-VN')}M`);
console.log(`- Tổng Thu: ${(live.payoutK / 1000).toLocaleString('vi-VN')}M | Lãi Ròng: +${(live.profitK / 1000).toLocaleString('vi-VN')}M (ROI: +${(live.roi * 100).toFixed(1)}%)`);
assert.strictEqual(live.totalDays, 18);
assert.strictEqual(live.wins, 11);
assert.strictEqual(live.losses, 7);
assert.strictEqual(live.totalHits, 37);
assert.strictEqual(live.stakeK, 277200);
assert.strictEqual(live.payoutK, 296000);
assert.strictEqual(live.profitK, 18800);

console.log('\n--- 2. Chế độ Phân Tầng Hệ Số (X3: 6.6M, X2: 4.4M, X1: 2.2M) ---');
console.log(`- Wins: ${live.tierWins}/${live.totalDays} (${(live.tierHitRate * 100).toFixed(1)}%)`);
console.log(`- Vốn 1 ngày: 28.6M | Tổng Vốn 18 kỳ: ${(live.tierStakeK / 1000).toLocaleString('vi-VN')}M`);
console.log(`- Tổng Thu: ${(live.tierPayoutK / 1000).toLocaleString('vi-VN')}M | Lãi Ròng: +${(live.tierProfitK / 1000).toLocaleString('vi-VN')}M (ROI: +${(live.tierRoi * 100).toFixed(1)}%)`);
assert.strictEqual(live.tierWins, 10);
assert.strictEqual(live.tierStakeK, 514800);
assert.strictEqual(live.tierPayoutK, 544000);
assert.strictEqual(live.tierProfitK, 29200);

// 4. Verify Latest Locked Recommendation for 2026-10-05
const latestRec = cache.latestRecommendation;
assert(latestRec, 'Latest recommendation must exist');
assert.strictEqual(latestRec.targetDate, '2026-10-05');
assert(Array.isArray(latestRec.top6) && latestRec.top6.length === 6, 'Top 6 must have 6 numbers');
assert(Array.isArray(latestRec.top7) && latestRec.top7.length === 7, 'Top 7 must have 7 numbers');
assert(Array.isArray(latestRec.top8) && latestRec.top8.length === 8, 'Top 8 must have 8 numbers');
assert(Array.isArray(latestRec.top10) && latestRec.top10.length === 10, 'Top 10 must have 10 numbers');
assert.strictEqual(latestRec.unitCostK, 2200);
assert.strictEqual(latestRec.unitPayoutK, 8000);
assert.strictEqual(latestRec.stakeFlatK, 15400);
assert.strictEqual(latestRec.stakeTierK, 28600);
assert.strictEqual(latestRec.snapshotLock.isLocked, true);

console.log('\n🔒 Target Date 2026-10-05 Recommendation Audit:');
console.log(`- Target date: ${latestRec.targetDate}`);
console.log(`- Top 6: [${latestRec.top6.join(', ')}]`);
console.log(`- Top 7: [${latestRec.top7.join(', ')}]`);
console.log(`- Top 8: [${latestRec.top8.join(', ')}]`);
console.log(`- Top 10: [${latestRec.top10.join(', ')}]`);
console.log(`- Vốn Đều: ${(latestRec.stakeFlatK / 1000).toFixed(1)}M | Vốn Phân Tầng: ${(latestRec.stakeTierK / 1000).toFixed(1)}M`);
console.log(`- Snapshot locked: ${latestRec.snapshotLock.isLocked} at ${latestRec.snapshotLock.lockedAt}`);

// 5. Test service builder
const model = buildLoDropoff27Advisor([], {});
assert(model !== null, 'buildLoDropoff27Advisor must return valid model');
assert.strictEqual(model.settledLedger.length, 18);
assert.strictEqual(model.latestRecommendation.targetDate, '2026-10-05');
console.log('\n✅ Service builder buildLoDropoff27Advisor() validated successfully.');
console.log('='.repeat(80));
console.log('🎉 ALL LÔ DROPOFF SHADOW AUDIT CHECKS PASSED 100%!');
console.log('='.repeat(80));
