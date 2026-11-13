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

// Test 2b: Consensus 2 Dàn Xiên 4 Tinh Hoa (Cân bằng chẵn lẻ)
assert(consensus.xien4, 'Consensus must have xien4 object');
assert(Array.isArray(consensus.xien4.dan1) && consensus.xien4.dan1.length === 4, 'Xiên 4 Dàn 1 must have 4 numbers');
assert(Array.isArray(consensus.xien4.dan2) && consensus.xien4.dan2.length === 4, 'Xiên 4 Dàn 2 must have 4 numbers');
assert(Array.isArray(consensus.xien4.top8) && consensus.xien4.top8.length === 8, 'Xiên 4 top8 must have 8 numbers');
console.log('  ✔ Consensus Xiên 4 Dàn 1 (4s):', consensus.xien4.dan1.join(' '));
console.log('  ✔ Consensus Xiên 4 Dàn 2 (4s):', consensus.xien4.dan2.join(' '));
console.log('  ✔ Consensus Xiên 4 Top 8 Lô:', consensus.xien4.top8.join(' '));

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

// Consensus Đề đa tầng (Phương pháp cốt lõi)
assert.strictEqual(settled.results.consensus.de.isHit, true, 'Consensus Đề đa tầng must hit 54');
assert.strictEqual(settled.results.consensus.de.profitK, 127000, 'Consensus Đề đa tầng profit must be +127.000K (+127M)');

// Consensus Đề phẳng (Tham chiếu)
assert.strictEqual(settled.results.consensus.flat.de.isHit, true, 'Consensus Đề phẳng must hit 54');
assert.strictEqual(settled.results.consensus.flat.de.profitK, 64000, 'Consensus Đề phẳng profit must be +64.000K (+64M)');

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

// Test 3b: Settlement economics cho 2 Dàn Xiên 4 Tinh Hoa
const x4Res = settled.results.consensus.xien4;
assert(x4Res, 'Consensus results must contain xien4');
assert.strictEqual(x4Res.stakeK, 22000, 'Consensus Xiên 4 stake must be 22.000K (11M/dàn x 2)');
assert.strictEqual(x4Res.dan1StakeK, 11000, 'Dan 1 stake must be 11.000K');
assert.strictEqual(x4Res.dan2StakeK, 11000, 'Dan 2 stake must be 11.000K');
assert(typeof x4Res.payoutK === 'number', 'payoutK must be number');
assert.strictEqual(x4Res.profitK, x4Res.payoutK - x4Res.stakeK, 'profitK must equal payoutK - stakeK');
console.log(`  ✔ Consensus Xiên 4 Settled: Dàn 1 (${x4Res.hits1}/4), Dàn 2 (${x4Res.hits2}/4), Vốn: ${x4Res.stakeK}K, Ăn: ${x4Res.payoutK}K, Lãi: ${x4Res.profitK}K`);

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
assert(testPayload.summary.consensus.xien4, 'Summary must contain xien4 stats');
assert.strictEqual(testPayload.summary.consensus.xien4.days, 1, 'Xiên 4 days must be 1');
assert.strictEqual(testPayload.summary.consensus.xien4.stakeK, 22000, 'Xiên 4 stakeK must be 22.000K');
assert(typeof testPayload.summary.consensus.xien4.profitK === 'number', 'Xiên 4 profitK must be number');
assert(testPayload.summary.consensus.combo, 'Summary must contain combo stats');
console.log('  ✔ Rates accumulation verified successfully (Đề riêng, Lô riêng, Xiên 4 riêng & Combo)');

// Test 5: Client payload structure
console.log('5. Testing client payload format:');
const clientPayload = service.buildClientPayload();
assert.strictEqual(clientPayload.success, true, 'Client payload success must be true');
assert(clientPayload.todayConsensus, 'Client payload must have todayConsensus');
assert(clientPayload.todayConsensus.deTiers, 'todayConsensus must have deTiers');
assert(clientPayload.todayConsensus.loTiers, 'todayConsensus must have loTiers');
if (clientPayload.todayConsensus.xien4) {
    assert(Array.isArray(clientPayload.todayConsensus.xien4.dan1) && clientPayload.todayConsensus.xien4.dan1.length === 4, 'todayConsensus.xien4.dan1 must have 4 numbers');
    assert(Array.isArray(clientPayload.todayConsensus.xien4.dan2) && clientPayload.todayConsensus.xien4.dan2.length === 4, 'todayConsensus.xien4.dan2 must have 4 numbers');
}
assert(Array.isArray(clientPayload.leaderboard) && clientPayload.leaderboard.length === 6, 'Leaderboard must contain 6 items');
clientPayload.leaderboard.forEach(item => {
    assert(item.de, `Leaderboard item ${item.id} must have de stats`);
    assert(item.lo, `Leaderboard item ${item.id} must have lo stats`);
    assert(item.xien4, `Leaderboard item ${item.id} must have xien4 stats`);
    assert(item.combo, `Leaderboard item ${item.id} must have combo stats`);
});

// Invariant: Ngày hôm nay chưa có kết quả -> Tuyệt đối không hiển thị ngày hôm sau trong nhật ký đối soát
const hasFutureDayInHistory = clientPayload.history.some(d => String(d.date) > String(clientPayload.latestDate));
assert.strictEqual(hasFutureDayInHistory, false, 'History must not contain future days when today is not settled');
console.log('  ✔ Client payload contains all required UI fields, tiered consensus, 6 leaderboard items, and excludes future days from ledger');

// Test 6: normalizeXien4 multi-format parsing & individual AI Xiên 4
console.log('6. Testing normalizeXien4 & individual model Xiên 4 support:');
const objFormat = { dan1: ['31', '38', '43', '92'], dan2: ['00', '36', '62', '81'] };
const arrArrFormat = [['31', '38', '43', '92'], ['00', '36', '62', '81']];
const flat8Format = ['31', '38', '43', '92', '00', '36', '62', '81'];

const normObj = service.normalizeXien4(objFormat);
assert(normObj && normObj.dan1.length === 4 && normObj.dan2.length === 4, 'Object format must parse to dan1 and dan2');

const normArrArr = service.normalizeXien4(arrArrFormat);
assert(normArrArr && normArrArr.dan1.length === 4 && normArrArr.dan2.length === 4, 'Array of arrays must parse to dan1 and dan2');
assert.deepStrictEqual(normArrArr.dan1, ['31', '38', '43', '92'], 'normArrArr dan1 must match');
assert.deepStrictEqual(normArrArr.dan2, ['00', '36', '62', '81'], 'normArrArr dan2 must match');

const normFlat = service.normalizeXien4(flat8Format);
assert(normFlat && normFlat.dan1.length === 4 && normFlat.dan2.length === 4, 'Flat 8 numbers must parse to dan1 and dan2');

assert.strictEqual(service.normalizeXien4(null), null, 'null must return null');
assert.strictEqual(service.normalizeXien4([]), null, 'empty array must return null');
assert.strictEqual(service.normalizeXien4({}), null, 'empty object must return null');

// Kiểm tra ngày hôm nay (2026-11-01) các AI model có Xiên 4 đã được chuẩn hóa trong clientPayload
const day20261101 = clientPayload.history.find(d => d.date === '2026-11-01');
assert(day20261101, 'Day 2026-11-01 must exist in history');
const chatgptSrc = day20261101.sources.chatgpt;
assert(chatgptSrc && chatgptSrc.xien4, 'ChatGPT in 2026-11-01 must have xien4');
assert(Array.isArray(chatgptSrc.xien4.dan1) && chatgptSrc.xien4.dan1.length === 4, 'ChatGPT xien4.dan1 must have 4 numbers');
assert(Array.isArray(chatgptSrc.xien4.dan2) && chatgptSrc.xien4.dan2.length === 4, 'ChatGPT xien4.dan2 must have 4 numbers');
console.log('  ✔ ChatGPT Xiên 4 chuẩn hóa:', chatgptSrc.xien4.dan1.join(' '), '|', chatgptSrc.xien4.dan2.join(' '));

const deepseekSrc = day20261101.sources.deepseek;
assert(deepseekSrc && deepseekSrc.xien4, 'DeepSeek in 2026-11-01 must have xien4');
assert(Array.isArray(deepseekSrc.xien4.dan1) && deepseekSrc.xien4.dan1.length === 4, 'DeepSeek xien4.dan1 must have 4 numbers');
console.log('  ✔ DeepSeek Xiên 4 chuẩn hóa:', deepseekSrc.xien4.dan1.join(' '), '|', deepseekSrc.xien4.dan2.join(' '));

const geminiSrc = day20261101.sources.gemini;
assert(geminiSrc && geminiSrc.xien4, 'Gemini in 2026-11-01 must have xien4');
console.log('  ✔ Gemini Xiên 4 chuẩn hóa:', geminiSrc.xien4.dan1.join(' '), '|', geminiSrc.xien4.dan2.join(' '));

const museSrc = day20261101.sources.muse;
assert(museSrc && museSrc.xien4, 'Muse in 2026-11-01 must have xien4');
console.log('  ✔ Muse Xiên 4 chuẩn hóa:', museSrc.xien4.dan1.join(' '), '|', museSrc.xien4.dan2.join(' '));

const day20261105 = clientPayload.history.find(d => d.date === '2026-11-05');
assert(day20261105, 'Day 2026-11-05 must exist in history');
const claudeSrc = day20261105.sources.claude;
assert(claudeSrc && claudeSrc.de && claudeSrc.de.length === 20, 'Claude in 2026-11-05 must have 20 De numbers');
assert(claudeSrc && claudeSrc.lo && claudeSrc.lo.length === 6, 'Claude in 2026-11-05 must have 6 Lo numbers');
const cons20261105 = day20261105.consensus;
assert(cons20261105, '2026-11-05 consensus must be computed');
const vote09 = cons20261105.deVotesMap['09'];
assert(vote09 && vote09.count === 5, 'Number 09 must have unanimous 5/5 votes');
assert(vote09.models.includes('claude'), 'Vote models must include claude');
console.log('  ✔ Claude (Anthropic) 2026-11-05 verified: 20 Đề, 6 Lô, 5 AI Consensus computed successfully');

console.log('  ✔ All normalizeXien4 formats & individual AI sources verified successfully');

// Test 7: Signal Rebound 360 & Dual Strategy Comparison
console.log('7. Testing Signal Rebound 360 & Dual Strategy Comparison:');
assert(clientPayload.todayNewStrategy, 'todayNewStrategy must exist in payload');
assert(['BET', 'RECOVERY_BET', 'SKIP'].includes(clientPayload.todayNewStrategy.decision), 'Decision must be BET, RECOVERY_BET, or SKIP');
assert(clientPayload.todayNewStrategy.scoreComposite >= 0 && clientPayload.todayNewStrategy.scoreComposite <= 100, 'Score composite must be 0-100');
assert(Array.isArray(clientPayload.todayNewStrategy.de.numbers), 'New strategy De numbers must be array');
assert(Array.isArray(clientPayload.todayNewStrategy.lo.numbers), 'New strategy Lo numbers must be array');
assert(clientPayload.comparisonSummary, 'comparisonSummary must exist in payload');
assert(clientPayload.comparisonSummary.oldStrategy, 'comparisonSummary.oldStrategy must exist');
assert(clientPayload.comparisonSummary.newStrategy, 'comparisonSummary.newStrategy must exist');
assert(clientPayload.comparisonSummary.diff, 'comparisonSummary.diff must exist');
console.log(`  ✔ Today Signal Rebound: Decision=${clientPayload.todayNewStrategy.decisionLabel}, Score=${clientPayload.todayNewStrategy.scoreComposite}/100, Đề X2=${clientPayload.todayNewStrategy.de.countX2}s, Lót X1=${clientPayload.todayNewStrategy.de.countX1}s, Lô=${clientPayload.todayNewStrategy.lo.count}s`);
console.log(`  ✔ Comparison Summary: Old Profit=${clientPayload.comparisonSummary.oldStrategy.profitM}M, New Profit=${clientPayload.comparisonSummary.newStrategy.profitM}M, Profit Diff=+${clientPayload.comparisonSummary.diff.profitDiffM}M`);

console.log('================================================================================');
console.log('🎉 ALL AI 5 STATS & TIERED CONSENSUS TESTS PASSED 100%!');
console.log('================================================================================');
