// scripts/test-de-dropoff-shadow.js
'use strict';

const assert = require('assert');
const path = require('path');
const { buildDeDropoffMergeAdvisor, loadCache, CONFIG } = require('../lib/services/deDropoffMergeAdvisorService');

console.log('='.repeat(80));
console.log('🧪 VERIFYING ĐỀ ĐA ĐỘNG CƠ 40S ĐÁNH PHẲNG SHADOW MONITOR (LIVE & 2026 AUDIT)');
console.log('='.repeat(80));

// 1. Verify Cache and Config
const cache = loadCache();
assert(cache !== null, 'Cache file must exist and be loadable');
assert.strictEqual(CONFIG.stakeK, 40000, 'Stake per day must be 40,000K (40M VND)');
assert.strictEqual(CONFIG.totalNumbers, 40, 'Total numbers must be 40');
assert.strictEqual(CONFIG.payoutK, 84000, 'Payout per hit must be 84,000K (84M VND)');
assert.strictEqual(CONFIG.profitOnHitK, 44000, 'Net profit per hit must be +44M VND');
console.log('✅ Configuration validated: 40 numbers (Flat 1M/số = 40M/ngày · Ăn 84M · Lãi ròng +44M/kỳ trúng)');

// 2. Verify Strict Cutoff >= 2026-09-17 (Live Combat Window)
console.log('\n📅 Strict Cutoff Audit:');
const invalidDates = cache.settledLedger.filter(r => r.date < '2026-09-17');
assert.strictEqual(invalidDates.length, 0, 'Must have ZERO records prior to 2026-09-17 in settledLedger');
assert.strictEqual(cache.settledLedger.length, 18, 'Must have exactly 18 settled records (17/09/2026 to 04/10/2026)');
assert.strictEqual(cache.settledLedger[0].date, '2026-09-17', 'First settled date must be 2026-09-17');
assert.strictEqual(cache.settledLedger[cache.settledLedger.length - 1].date, '2026-10-04', 'Last settled date must be 2026-10-04');
console.log(`✅ Cutoff strictly enforced: 18 draws from ${cache.settledLedger[0].date} to ${cache.settledLedger[cache.settledLedger.length - 1].date}`);

// 3. Verify Live Combat Performance Metrics (18 Kỳ Thực Chiến Từ 17/09/2026)
const summary = cache.summary;
assert(summary, 'Summary object must exist');
const live = summary.liveCombat;
assert(live, 'Live combat summary must exist');
console.log('\n📊 Live Combat Metrics (17/09/2026 - 04/10/2026):');
console.log(`- Draws: ${live.totalDays} draws`);
console.log(`- Wins: ${live.wins}/${live.totalDays} (${(live.hitRate * 100).toFixed(1)}%)`);
console.log(`- Financials: Stake=${(live.stakeK / 1000).toLocaleString('vi-VN')}M | Payout=${(live.payoutK / 1000).toLocaleString('vi-VN')}M | PnL=+${(live.profitK / 1000).toLocaleString('vi-VN')}M (ROI +${(live.roi * 100).toFixed(1)}%)`);

assert.strictEqual(live.totalDays, 18);
assert.strictEqual(live.wins, 9, 'Live combat wins must be 9/18 (50.0%)');
assert.strictEqual(live.losses, 9);
assert.strictEqual(live.stakeK, 720000, 'Stake must be 720M');
assert.strictEqual(live.payoutK, 756000, 'Payout must be 756M');
assert.strictEqual(live.profitK, 36000, 'Live profit must be +36M');

// 4. Verify 2026 Full-Year Metrics (273 Kỳ Mở Thưởng)
const all = summary.all2026;
assert(all, 'All 2026 summary must exist');
console.log('\n💎 Toàn Bộ Năm 2026 (273 Kỳ Mở Thưởng):');
console.log(`- Draws: ${all.totalDays} kỳ`);
console.log(`- Wins: ${all.wins}/${all.totalDays} (${(all.hitRate * 100).toFixed(1)}% vs Ngưỡng hòa vốn 47.6%)`);
console.log(`- Financials: Stake=${(all.stakeK / 1000).toLocaleString('vi-VN')}M | Payout=${(all.payoutK / 1000).toLocaleString('vi-VN')}M | PnL=+${(all.profitK / 1000).toLocaleString('vi-VN')}M (ROI +${(all.roi * 100).toFixed(1)}%)`);

assert.strictEqual(all.totalDays, 273);
assert.strictEqual(all.wins, 141, 'Must win 141/273 draws (51.6% win rate)');
assert.strictEqual(all.profitK, 924000, 'Full year profit must be +924M');

// 5. Verify Payout Trap Guarantee (Stake 40M < 84M payout)
console.log('\n🛡️ Payout Trap Audit:');
const lossOnWinDays = cache.settledLedger.filter(r => r.hit && r.profitK < 0);
assert.strictEqual(lossOnWinDays.length, 0, 'Must have ZERO days where a win results in negative profit!');
console.log(`✅ 100% Guaranteed Zero Payout-Trap: 0/${live.wins} win days resulted in negative profit.`);

// 6. Verify Latest Locked Recommendation for 2026-10-05
const latestRec = cache.latestRecommendation;
assert(latestRec, 'Latest recommendation must exist');
assert.strictEqual(latestRec.targetDate, '2026-10-05');
assert.strictEqual(latestRec.numbers.length, 40);
assert.strictEqual(latestRec.stakeK, 40000);
assert.strictEqual(latestRec.payoutK, 84000);
assert.strictEqual(latestRec.snapshotLock.isLocked, true);
console.log('\n🔒 Target Date 2026-10-05 Lock Audit:');
console.log(`- Target date: ${latestRec.targetDate}`);
console.log(`- Dàn 40 số: [${latestRec.numbers.join(', ')}]`);
console.log(`- Vốn cược: ${(latestRec.stakeK / 1000).toFixed(1)}M (1M/số) · Ăn ${(latestRec.payoutK / 1000).toFixed(1)}M · Lãi ròng +${(latestRec.profitOnHitK / 1000).toFixed(1)}M/kỳ`);
console.log(`- Snapshot locked: ${latestRec.snapshotLock.isLocked} at ${latestRec.snapshotLock.lockedAt}`);

// 7. Test service builder
const model = buildDeDropoffMergeAdvisor([], {});
assert(model !== null);
assert.strictEqual(model.settledLedger.length, 18);
console.log('\n✅ Service builder buildDeDropoffMergeAdvisor() validated successfully.');
console.log('='.repeat(80));
console.log('🎉 ALL ĐỀ ĐA ĐỘNG CƠ SHADOW AUDIT CHECKS PASSED 100%!');
console.log('='.repeat(80));
