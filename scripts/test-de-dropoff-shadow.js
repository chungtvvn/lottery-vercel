// scripts/test-de-dropoff-shadow.js
'use strict';

const assert = require('assert');
const path = require('path');
const { buildDeDropoffMergeAdvisor, loadCache, CONFIG } = require('../lib/services/deDropoffMergeAdvisorService');

console.log('='.repeat(80));
console.log('🧪 VERIFYING ĐỀ DROPOFF MERGE 40S SHADOW MONITOR (LIVE COMBAT WINDOW FROM 17/09/2026)');
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

// 2. Verify Strict Cutoff >= 2026-09-17 (No Backtest Illusion)
console.log('\n📅 Strict Cutoff Audit:');
const invalidDates = cache.settledLedger.filter(r => r.date < '2026-09-17');
assert.strictEqual(invalidDates.length, 0, 'Must have ZERO records prior to 2026-09-17');
assert.strictEqual(cache.settledLedger.length, 18, 'Must have exactly 18 settled records (17/09/2026 to 04/10/2026)');
assert.strictEqual(cache.settledLedger[0].date, '2026-09-17', 'First settled date must be 2026-09-17');
assert.strictEqual(cache.settledLedger[cache.settledLedger.length - 1].date, '2026-10-04', 'Last settled date must be 2026-10-04');
console.log(`✅ Cutoff strictly enforced: 18 draws from ${cache.settledLedger[0].date} to ${cache.settledLedger[cache.settledLedger.length - 1].date}`);

// 3. Verify Live Combat Performance Metrics
const summary = cache.summary;
assert(summary, 'Summary object must exist');
const live = summary.liveCombat;
assert(live, 'Live combat summary must exist');
console.log('\n📊 Live Combat Metrics (17/09/2026 - 04/10/2026):');
console.log(`- Draws: ${live.totalDays} draws`);
console.log(`- Wins: ${live.wins}/${live.totalDays} (${(live.hitRate * 100).toFixed(1)}%)`);
console.log(`- Win Tiers: ${live.x3Wins} VIP X3, ${live.x2Wins} Center X2, ${live.x1Wins} Backup X1, ${live.losses} Misses`);
console.log(`- Financials: Stake=${(live.stakeK / 1000).toLocaleString('vi-VN')}M | Payout=${(live.payoutK / 1000).toLocaleString('vi-VN')}M | PnL=${(live.profitK / 1000).toLocaleString('vi-VN')}M`);

assert.strictEqual(live.totalDays, 18);
assert.strictEqual(live.wins, 8);
assert.strictEqual(live.losses, 10);
assert.strictEqual(live.x3Wins, 1);
assert.strictEqual(live.x2Wins, 2);
assert.strictEqual(live.x1Wins, 5);
assert.strictEqual(live.stakeK, 1296000);
assert.strictEqual(live.payoutK, 1008000);
assert.strictEqual(live.profitK, -288000);

// 4. Verify Payout Trap Guarantee (Stake 72M < 84M min payout)
console.log('\n🛡️ Payout Trap Audit:');
const lossOnWinDays = cache.settledLedger.filter(r => r.hit && r.profitK < 0);
assert.strictEqual(lossOnWinDays.length, 0, 'Must have ZERO days where a win results in negative profit!');
console.log(`✅ 100% Guaranteed Zero Payout-Trap: 0/${live.wins} win days resulted in negative profit.`);

// 5. Verify Latest Locked Recommendation for 2026-10-05
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

// 6. Test service builder
const model = buildDeDropoffMergeAdvisor([], {});
assert(model !== null);
assert.strictEqual(model.settledLedger.length, 18);
console.log('\n✅ Service builder buildDeDropoffMergeAdvisor() validated successfully.');
console.log('='.repeat(80));
console.log('🎉 ALL ĐỀ DROPOFF SHADOW AUDIT CHECKS PASSED 100%!');
console.log('='.repeat(80));
