// scripts/test-lo-dropoff-shadow.js
'use strict';

const assert = require('assert');
const path = require('path');
const { buildLoDropoff27Advisor, loadCache, CONFIG } = require('../lib/services/loDropoff27AdvisorService');

console.log('='.repeat(80));
console.log('🧪 VERIFYING LÔ DROPOFF 27 VỊ TRÍ SHADOW MONITOR (LIVE COMBAT WINDOW FROM 17/09/2026)');
console.log('='.repeat(80));

// 1. Verify Cache and Config
const cache = loadCache();
assert(cache !== null, 'Cache file must exist and be loadable');
assert.strictEqual(CONFIG.strategyId, 'loDropoff27');
assert.strictEqual(CONFIG.pointCostK, 22, 'Cost per point must be 22K VND');
assert.strictEqual(CONFIG.pointPayoutK, 80, 'Payout per point must be 80K VND');
assert.strictEqual(CONFIG.pointsPerNum, 10, 'Default points per number must be 10');
assert.strictEqual(CONFIG.costPerNumK, 220, 'Cost per number must be 220K VND');
assert.strictEqual(CONFIG.payoutPerHitK, 800, 'Payout per hit must be 800K VND');
console.log('✅ Configuration validated: 27 positions dropoff across Top 6/7/8/10, 10đ/con (230K/con, ăn 800K/nháy)');

// 2. Verify Strict Cutoff >= 2026-09-17
console.log('\n📅 Strict Cutoff Audit:');
const invalidDates = cache.settledLedger.filter(r => r.date < '2026-09-17');
assert.strictEqual(invalidDates.length, 0, 'Must have ZERO records prior to 2026-09-17');
assert.strictEqual(cache.settledLedger.length, 18, 'Must have exactly 18 settled records (17/09/2026 to 04/10/2026)');
assert.strictEqual(cache.settledLedger[0].date, '2026-09-17', 'First settled date must be 2026-09-17');
assert.strictEqual(cache.settledLedger[cache.settledLedger.length - 1].date, '2026-10-04', 'Last settled date must be 2026-10-04');
console.log(`✅ Cutoff strictly enforced: 18 draws from ${cache.settledLedger[0].date} to ${cache.settledLedger[cache.settledLedger.length - 1].date}`);

// 3. Verify Live Combat Performance Metrics (Top 7 Default)
const live = cache.summary?.liveCombat;
assert(live, 'Live combat summary must exist');
console.log('\n📊 Live Combat Metrics (Top 7 @ 10đ/con):');
console.log(`- Draws: ${live.totalDays} draws`);
console.log(`- Wins (>= 2 nháy): ${live.wins}/${live.totalDays} (${(live.hitRate * 100).toFixed(1)}%)`);
console.log(`- Total Nháy: ${live.totalHits} nháy (Avg ${(live.avgHitsPerDay).toFixed(2)} nháy/ngày)`);
console.log(`- Financials (10đ): Stake=${(live.stakeK / 1000).toLocaleString('vi-VN')}M | Payout=${(live.payoutK / 1000).toLocaleString('vi-VN')}M | PnL=+${(live.profitK / 1000).toLocaleString('vi-VN')}M (ROI: +${(live.roi * 100).toFixed(1)}%)`);
console.log(`- Financials (M3 - 20đ): Stake=${(live.stakeK * 2 / 1000).toLocaleString('vi-VN')}M | Payout=${(live.payoutK * 2 / 1000).toLocaleString('vi-VN')}M | PnL=+${(live.profitK * 2 / 1000).toLocaleString('vi-VN')}M`);

assert.strictEqual(live.totalDays, 18);
assert.strictEqual(live.wins, 11);
assert.strictEqual(live.losses, 7);
assert.strictEqual(live.totalHits, 37);
assert.strictEqual(live.stakeK, 27720);
assert.strictEqual(live.payoutK, 29600);
assert.strictEqual(live.profitK, 1880);

// 4. Verify Latest Locked Recommendation for 2026-10-05
const latestRec = cache.latestRecommendation;
assert(latestRec, 'Latest recommendation must exist');
assert.strictEqual(latestRec.targetDate, '2026-10-05');
assert(Array.isArray(latestRec.top6) && latestRec.top6.length === 6, 'Top 6 must have 6 numbers');
assert(Array.isArray(latestRec.top7) && latestRec.top7.length === 7, 'Top 7 must have 7 numbers');
assert(Array.isArray(latestRec.top8) && latestRec.top8.length === 8, 'Top 8 must have 8 numbers');
assert(Array.isArray(latestRec.top10) && latestRec.top10.length === 10, 'Top 10 must have 10 numbers');
assert.strictEqual(latestRec.snapshotLock.isLocked, true);

console.log('\n🔒 Target Date 2026-10-05 Recommendation Audit:');
console.log(`- Target date: ${latestRec.targetDate}`);
console.log(`- Top 6: [${latestRec.top6.join(', ')}]`);
console.log(`- Top 7: [${latestRec.top7.join(', ')}]`);
console.log(`- Top 8: [${latestRec.top8.join(', ')}]`);
console.log(`- Top 10: [${latestRec.top10.join(', ')}]`);
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
