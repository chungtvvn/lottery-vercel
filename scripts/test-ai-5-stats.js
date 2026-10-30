#!/usr/bin/env node
'use strict';

/**
 * scripts/test-ai-5-stats.js
 * 
 * Test suite for AI 5 Stats & Consensus Engine
 */

const assert = require('assert');
const service = require('../lib/services/ai5StatsService');

console.log('================================================================================');
console.log('🧪 TESTING AI 5 STATS & CONSENSUS ENSEMBLE ENGINE');
console.log('================================================================================');

// Test 1: Load data
console.log('1. Testing data loading:');
const data = service.loadAi5StatsData();
assert(data && Array.isArray(data.days), 'Data must contain days array');
assert(data.days.length >= 1, 'Days array must contain at least 1 entry');
console.log('  ✔ Loaded data successfully with', data.days.length, 'day(s)');

// Test 2: Consensus algorithm
console.log('2. Testing consensus calculation:');
const day0 = data.days[0];
assert(day0.sources, 'Day must have sources');
const consensus = service.calculateConsensus(day0.sources);
assert(Array.isArray(consensus.deTop20) && consensus.deTop20.length === 20, 'Consensus Đề must have 20 numbers');
assert(Array.isArray(consensus.loTop6) && consensus.loTop6.length === 6, 'Consensus Lô must have 6 numbers');
assert(Array.isArray(consensus.deVip), 'Consensus must have deVip');
assert(consensus.deTiers && Array.isArray(consensus.deTiers.tier5), 'Consensus must have deTiers');
console.log('  ✔ Consensus Top 20 Đề:', consensus.deTop20.join(' '));
console.log('  ✔ Consensus Top 6 Lô:', consensus.loTop6.join(' '));
console.log('  ✔ Consensus Tier 5 (5/5 AI agree):', consensus.deTiers.tier5.join(' '));
console.log('  ✔ Consensus Tier 4 (4/5 AI agree):', consensus.deTiers.tier4.join(' '));

// Test 3: Settlement economics
console.log('3. Testing settlement economics:');
const dummyDraw = {
    special: '54',
    prizes27: ['54', '52', '62', '38', '75', '33', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30']
};

const dummyDay = JSON.parse(JSON.stringify(day0));
const settled = service.settleDay(dummyDay, dummyDraw);
assert.strictEqual(settled.special, '54', 'Special must be 54');
assert.strictEqual(settled.prizes27.length, 27, 'prizes27 length must be 27');
assert(settled.results && settled.results.consensus, 'Must have consensus results');

// Consensus Đề includes 54 -> should hit
assert.strictEqual(settled.results.consensus.de.isHit, true, 'Consensus Đề must hit 54');
assert.strictEqual(settled.results.consensus.de.profitK, 64, 'Consensus Đề profit must be +64K (84K - 20K)');

// Consensus Lô hits: 52, 62, 38, 75, 33 (5 hits)
assert.strictEqual(settled.results.consensus.lo.hits, 5, 'Consensus Lô must hit 5 numbers');
assert.strictEqual(settled.results.consensus.lo.stakeK, 132, 'Consensus Lô stake must be 132K (6 * 22K)');
assert.strictEqual(settled.results.consensus.lo.payoutK, 400, 'Consensus Lô payout must be 400K (5 * 80K)');
assert.strictEqual(settled.results.consensus.lo.profitK, 268, 'Consensus Lô profit must be 268K');

console.log('  ✔ Settlement economics verified: Đề profit = +64K, Lô profit = +268K, Total = +332K');

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
console.log('  ✔ Rates accumulation verified successfully');

// Test 5: Client payload structure
console.log('5. Testing client payload format:');
const clientPayload = service.buildClientPayload();
assert.strictEqual(clientPayload.success, true, 'Client payload success must be true');
assert(clientPayload.todayConsensus, 'Client payload must have todayConsensus');
assert(Array.isArray(clientPayload.leaderboard) && clientPayload.leaderboard.length === 6, 'Leaderboard must contain 6 items');
console.log('  ✔ Client payload contains all required UI fields and 6 leaderboard items');

console.log('================================================================================');
console.log('🎉 ALL AI 5 STATS & CONSENSUS TESTS PASSED 100%!');
console.log('================================================================================');
