#!/usr/bin/env node
'use strict';

/**
 * scripts/test-ai-5-stats.js
 * 
 * Test suite for AI 5 Stats & Tiered Consensus Engine (Đề X2/X1, Lô X5..X1)
 */

const assert = require('assert');
const service = require('../lib/services/ai5StatsService');

console.log('================================================================================');
console.log('🧪 TESTING AI 5 STATS & TIERED CONSENSUS ENSEMBLE ENGINE');
console.log('================================================================================');

// Test 1: Load data
console.log('1. Testing data loading:');
const data = service.loadAi5StatsData();
assert(data && Array.isArray(data.days), 'Data must contain days array');
assert(data.days.length >= 1, 'Days array must contain at least 1 entry');
console.log('  ✔ Loaded data successfully with', data.days.length, 'day(s)');

// Test 2: Consensus algorithm & Tiered structures
console.log('2. Testing consensus calculation & Tiering:');
const day0 = data.days[0];
assert(day0.sources, 'Day must have sources');
const consensus = service.calculateConsensus(day0.sources);
assert(Array.isArray(consensus.deTop20) && consensus.deTop20.length === 20, 'Consensus Đề must have 20 numbers');
assert(Array.isArray(consensus.loTop6) && consensus.loTop6.length === 6, 'Consensus Lô must have 6 numbers');
assert(consensus.deTiers, 'Consensus must have deTiers');
assert(Array.isArray(consensus.deTiers.x2Nums), 'Consensus must have deTiers.x2Nums');
assert(Array.isArray(consensus.deTiers.x1Nums), 'Consensus must have deTiers.x1Nums');
assert(consensus.loTiers, 'Consensus must have loTiers');
assert(Array.isArray(consensus.loTiers.x5Nums), 'Consensus must have loTiers.x5Nums');
assert(Array.isArray(consensus.loTiers.x4Nums), 'Consensus must have loTiers.x4Nums');
assert(Array.isArray(consensus.loTiers.x3Nums), 'Consensus must have loTiers.x3Nums');
assert(Array.isArray(consensus.loTiers.x2Nums), 'Consensus must have loTiers.x2Nums');
assert(Array.isArray(consensus.loTiers.x1Nums), 'Consensus must have loTiers.x1Nums');

console.log('  ✔ Consensus Top 20 Đề:', consensus.deTop20.join(' '));
console.log('  ✔ Consensus Đề X2 (VIP):', consensus.deTiers.x2Nums.join(' '));
console.log('  ✔ Consensus Đề X1 (Lót):', consensus.deTiers.x1Nums.join(' '));
console.log('  ✔ Consensus Top 6 Lô:', consensus.loTop6.join(' '));
console.log('  ✔ Consensus Lô X5 (5 vote):', consensus.loTiers.x5Nums.join(' ') || '(none)');
console.log('  ✔ Consensus Lô X4 (4 vote):', consensus.loTiers.x4Nums.join(' ') || '(none)');
console.log('  ✔ Consensus Lô X3 (3 vote):', consensus.loTiers.x3Nums.join(' ') || '(none)');
console.log('  ✔ Consensus Lô X2 (2 vote):', consensus.loTiers.x2Nums.join(' ') || '(none)');

// Test 3: Settlement economics (cả Phẳng và Đa Tầng)
console.log('3. Testing settlement economics:');
const dummyDraw = {
    special: '54',
    prizes27: ['54', '52', '62', '38', '75', '33', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30']
};

const dummyDay = JSON.parse(JSON.stringify(day0));
const settled = service.settleDay(dummyDay, dummyDraw);
assert.strictEqual(settled.special, '54', 'Special must be 54');
assert.strictEqual(settled.prizes27.length, 27, 'prizes27 length must be 27');
assert(settled.results && settled.results.consensus, 'Must have flat consensus results');
assert(settled.resultsTiered && settled.resultsTiered.consensus, 'Must have tiered consensus results');

// Consensus Đề phẳng (Top 20 Đề)
assert.strictEqual(settled.results.consensus.de.isHit, true, 'Consensus Đề phẳng must hit 54');
assert.strictEqual(settled.results.consensus.de.profitK, 64000, 'Consensus Đề phẳng profit must be +64.000K (+64M)');

// Consensus Đề đa tầng (X2 / X1)
const deTiered = settled.resultsTiered.consensus.de;
assert.strictEqual(deTiered.isHit, true, 'Consensus Đề đa tầng must hit 54');
assert(deTiered.payoutK > 0, 'Consensus Đề đa tầng payout must be positive');
assert(deTiered.stakeK > 0, 'Consensus Đề đa tầng stake must be positive');
console.log(`  ✔ Consensus Đề Tiered: Trúng tầng [${deTiered.hitTier}], Vốn: ${deTiered.stakeK}K, Ăn: ${deTiered.payoutK}K, Lãi: ${deTiered.profitK}K`);

// Consensus Lô đa tầng (X5..X1)
const loTiered = settled.resultsTiered.consensus.lo;
assert(loTiered.hits > 0, 'Consensus Lô đa tầng must have hits');
assert(loTiered.stakeK > 0, 'Consensus Lô đa tầng must have stake');
assert(loTiered.payoutK > 0, 'Consensus Lô đa tầng must have payout');
console.log(`  ✔ Consensus Lô Tiered: Nổ ${loTiered.hits} nháy, Vốn: ${loTiered.stakeK}K, Ăn: ${loTiered.payoutK}K, Lãi: ${loTiered.profitK}K`);

// Test 4: Rates accumulation
console.log('4. Testing rates computation:');
const testPayload = {
    meta: data.meta,
    days: [settled]
};
service.recomputeAllRates(testPayload);
assert(testPayload.summary && testPayload.summary.consensus, 'Summary must have consensus stats');
assert.strictEqual(testPayload.summary.consensus.days, 1, 'Days must be 1');
assert.strictEqual(testPayload.summary.consensus.de.wins, 1, 'Đề wins must be 1');
assert.strictEqual(testPayload.summary.consensus.de.winRate, 1.0, 'Đề winRate must be 1.0');
assert(testPayload.summary.consensus.deTiered, 'Summary must contain deTiered stats');
assert(testPayload.summary.consensus.loTiered, 'Summary must contain loTiered stats');
console.log('  ✔ Rates accumulation verified successfully');

// Test 5: Client payload structure
console.log('5. Testing client payload format:');
const clientPayload = service.buildClientPayload();
assert.strictEqual(clientPayload.success, true, 'Client payload success must be true');
assert(clientPayload.todayConsensus, 'Client payload must have todayConsensus');
assert(clientPayload.todayConsensus.deTiers, 'todayConsensus must have deTiers');
assert(clientPayload.todayConsensus.loTiers, 'todayConsensus must have loTiers');
assert(Array.isArray(clientPayload.leaderboard) && clientPayload.leaderboard.length === 6, 'Leaderboard must contain 6 items');
console.log('  ✔ Client payload contains all required UI fields, tiered consensus, and 6 leaderboard items');

console.log('================================================================================');
console.log('🎉 ALL AI 5 STATS & TIERED CONSENSUS TESTS PASSED 100%!');
console.log('================================================================================');
