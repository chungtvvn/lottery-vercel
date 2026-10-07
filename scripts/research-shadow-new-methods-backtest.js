// scripts/research-shadow-new-methods-backtest.js
'use strict';

/**
 * Script Nghiên Cứu & Đánh Giá Độc Lập Các Phương Pháp Mới Cho Shadow Monitor:
 * 1. ĐỀ:
 *    - D1: Đề 36 Số VIP Sweet-Spot (Vốn 36M, Ăn 84M)
 *    - D2: Đề Tinh Tuyển Phân Tầng VIP (10 VIP x 2M + 26 Bọc Lót x 1M = 46M)
 * 2. LÔ:
 *    - L1: Song Thủ Lô Tuyển Chọn Top 2 (Vốn 4.4M, Ăn 8M/nháy)
 *    - L2: Tứ Thủ Lô Đột Phá Top 4 (Vốn 8.8M, Ăn 8M/nháy)
 * 3. LÔ XIÊN:
 *    - X1: Golden Xiên 2 (6 Cặp Ghép từ Top 4, Vốn 6M, Ăn 10M/cặp)
 *    - X2: Lô Xiên 4 Quây Hiệp Đồng 11 Vé (Vốn 11M, Ăn 384M / 84M / 12M)
 *
 * Kiểm định 100% Strict Point-In-Time trên:
 * - Giai đoạn Thực chiến Live: 20 kỳ (17/09/2026 - 06/10/2026)
 * - Toàn bộ năm 2026: 275 kỳ (01/01/2026 - 06/10/2026)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const rawDrawsPath = path.join(ROOT_DIR, 'lib/data/xsmb-2-digits.json');
const cachedAdvisorPath = path.join(ROOT_DIR, 'lib/data/statistics/cached_daily_method_advisor.json');
const deDropoffPath = path.join(ROOT_DIR, 'lib/data/statistics/cached_de_dropoff_merge_shadow.json');
const loDropoffPath = path.join(ROOT_DIR, 'lib/data/statistics/cached_lo_dropoff_27_shadow.json');

const rawDraws = JSON.parse(fs.readFileSync(rawDrawsPath, 'utf8'));
const advisorCache = JSON.parse(fs.readFileSync(cachedAdvisorPath, 'utf8'));
const deDropoffCache = JSON.parse(fs.readFileSync(deDropoffPath, 'utf8'));
const loDropoffCache = JSON.parse(fs.readFileSync(loDropoffPath, 'utf8'));

const aiResearch = require('../lib/services/aiLotteryResearchService');

console.log('='.repeat(88));
console.log('🔬 NGHIÊN CỨU & KIỂM ĐỊNH CÁC PHƯƠNG PHÁP MỚI ĐỀ XUẤT CHO HỆ THỐNG SHADOW MONITOR');
console.log('='.repeat(88));

const liveCombatDates = loDropoffCache.settledLedger.map(r => r.date);
console.log(`- Tập dữ liệu kiểm định thực chiến Live: ${liveCombatDates.length} kỳ (${liveCombatDates[0]} -> ${liveCombatDates[liveCombatDates.length - 1]})`);

const draws2026 = rawDraws.filter(d => d.date.startsWith('2026'));
console.log(`- Tập dữ liệu kiểm định toàn năm 2026: ${draws2026.length} kỳ (${draws2026[0].date} -> ${draws2026[draws2026.length - 1].date})\n`);

// Helper
function numStr(n) {
    return String(n).padStart(2, '0');
}

function getCombinations(arr, k) {
    if (k === 1) return arr.map(x => [x]);
    const res = [];
    for (let i = 0; i <= arr.length - k; i++) {
        const head = arr[i];
        const tails = getCombinations(arr.slice(i + 1), k - 1);
        tails.forEach(tail => res.push([head, ...tail]));
    }
    return res;
}

// =============================================================================
// PHẦN 1: NGHIÊN CỨU CÁC PHƯƠNG PHÁP ĐỀ MỚI
// =============================================================================
console.log('-'.repeat(88));
console.log('💎 PHẦN 1: ĐỐI SOÁT CÁC PHƯƠNG PHÁP ĐỀ MỚI (TỶ LỆ ĂN 1:84)');
console.log('-'.repeat(88));

// 1. Đề 36 Số VIP Sweet-Spot (Đánh phẳng 1M/số = 36M/ngày)
// 2. Đề Phân Tầng VIP 36s (10 VIP x 2M + 26 Bọc Lót x 1M = 46M/ngày)
// 3. Đề 40 Số Hiện Tại (Baseline: 40M/ngày, lãi +44M)

function evaluateDeMethods(datesList) {
    const res = {
        base40: { wins: 0, stakeK: 0, payoutK: 0, profitK: 0, maxLossStreak: 0, currentLoss: 0 },
        vip36: { wins: 0, stakeK: 0, payoutK: 0, profitK: 0, maxLossStreak: 0, currentLoss: 0 },
        tiered36: { wins: 0, vipWins: 0, supportWins: 0, stakeK: 0, payoutK: 0, profitK: 0, maxLossStreak: 0, currentLoss: 0 }
    };

    datesList.forEach(date => {
        const deRow = deDropoffCache.all2026Ledger.find(r => r.date === date) || deDropoffCache.settledLedger.find(r => r.date === date);
        const actual = deRow?.actual ?? Number(rawDraws.find(d => d.date === date)?.special);
        const numbers = (deRow?.numbers || []).map(Number);

        if (!numbers.length) return;

        // Base 40
        const isHit40 = numbers.slice(0, 40).includes(actual);
        res.base40.stakeK += 40000;
        if (isHit40) {
            res.base40.wins++;
            res.base40.payoutK += 84000;
            res.base40.profitK += 44000;
            res.base40.currentLoss = 0;
        } else {
            res.base40.profitK -= 40000;
            res.base40.currentLoss++;
            if (res.base40.currentLoss > res.base40.maxLossStreak) res.base40.maxLossStreak = res.base40.currentLoss;
        }

        // VIP 36 (36 số đầu)
        const isHit36 = numbers.slice(0, 36).includes(actual);
        res.vip36.stakeK += 36000;
        if (isHit36) {
            res.vip36.wins++;
            res.vip36.payoutK += 84000;
            res.vip36.profitK += 48000; // 84M - 36M = +48M
            res.vip36.currentLoss = 0;
        } else {
            res.vip36.profitK -= 36000;
            res.vip36.currentLoss++;
            if (res.vip36.currentLoss > res.vip36.maxLossStreak) res.vip36.maxLossStreak = res.vip36.currentLoss;
        }

        // Tiered 36 (Top 10 VIP x 2M + 26 Bọc lót x 1M = 46M)
        const isVipHit = numbers.slice(0, 10).includes(actual);
        const isSupportHit = numbers.slice(10, 36).includes(actual);
        res.tiered36.stakeK += 46000;
        if (isVipHit) {
            res.tiered36.wins++;
            res.tiered36.vipWins++;
            res.tiered36.payoutK += 168000;
            res.tiered36.profitK += (168000 - 46000); // +122M
            res.tiered36.currentLoss = 0;
        } else if (isSupportHit) {
            res.tiered36.wins++;
            res.tiered36.supportWins++;
            res.tiered36.payoutK += 84000;
            res.tiered36.profitK += (84000 - 46000); // +38M
            res.tiered36.currentLoss = 0;
        } else {
            res.tiered36.profitK -= 46000;
            res.tiered36.currentLoss++;
            if (res.tiered36.currentLoss > res.tiered36.maxLossStreak) res.tiered36.maxLossStreak = res.tiered36.currentLoss;
        }
    });

    return res;
}

const liveDeRes = evaluateDeMethods(liveCombatDates);
console.log('A. KẾT QUẢ THỰC CHIẾN LIVE (20 KỲ GẦN NHẤT 17/09 - 06/10):');
console.log(`• Đề 40s Hiện Tại (Baseline)   : Thắng ${liveDeRes.base40.wins}/20 (${(liveDeRes.base40.wins/20*100).toFixed(1)}%) | Lãi ròng: +${liveDeRes.base40.profitK/1000}M | ROI: +${(liveDeRes.base40.profitK/liveDeRes.base40.stakeK*100).toFixed(1)}% | Chuỗi thua max: ${liveDeRes.base40.maxLossStreak}d`);
console.log(`• ⭐ Đề 36 Số VIP Sweet-Spot    : Thắng ${liveDeRes.vip36.wins}/20 (${(liveDeRes.vip36.wins/20*100).toFixed(1)}%) | Lãi ròng: +${liveDeRes.vip36.profitK/1000}M | ROI: +${(liveDeRes.vip36.profitK/liveDeRes.vip36.stakeK*100).toFixed(1)}% | Chuỗi thua max: ${liveDeRes.vip36.maxLossStreak}d`);
console.log(`• 👑 Đề Phân Tầng VIP (10 VIP x2M): Thắng ${liveDeRes.tiered36.wins}/20 (VIP: ${liveDeRes.tiered36.vipWins}, Lót: ${liveDeRes.tiered36.supportWins}) | Lãi ròng: +${liveDeRes.tiered36.profitK/1000}M | ROI: +${(liveDeRes.tiered36.profitK/liveDeRes.tiered36.stakeK*100).toFixed(1)}% | Chuỗi thua max: ${liveDeRes.tiered36.maxLossStreak}d`);

const full2026DeDates = deDropoffCache.all2026Ledger.map(r => r.date);
const fullDeRes = evaluateDeMethods(full2026DeDates);
console.log(`\nB. KẾT QUẢ TOÀN NĂM 2026 (${full2026DeDates.length} KỲ):`);
console.log(`• Đề 40s Hiện Tại (Baseline)   : Thắng ${fullDeRes.base40.wins}/${full2026DeDates.length} (${(fullDeRes.base40.wins/full2026DeDates.length*100).toFixed(1)}%) | Lãi ròng: +${fullDeRes.base40.profitK/1000}M | ROI: +${(fullDeRes.base40.profitK/fullDeRes.base40.stakeK*100).toFixed(1)}% | Chuỗi thua max: ${fullDeRes.base40.maxLossStreak}d`);
console.log(`• ⭐ Đề 36 Số VIP Sweet-Spot    : Thắng ${fullDeRes.vip36.wins}/${full2026DeDates.length} (${(fullDeRes.vip36.wins/full2026DeDates.length*100).toFixed(1)}%) | Lãi ròng: +${fullDeRes.vip36.profitK/1000}M | ROI: +${(fullDeRes.vip36.profitK/fullDeRes.vip36.stakeK*100).toFixed(1)}% | Chuỗi thua max: ${fullDeRes.vip36.maxLossStreak}d`);
console.log(`• 👑 Đề Phân Tầng VIP (10 VIP x2M): Thắng ${fullDeRes.tiered36.wins}/${full2026DeDates.length} (VIP: ${fullDeRes.tiered36.vipWins}, Lót: ${fullDeRes.tiered36.supportWins}) | Lãi ròng: +${fullDeRes.tiered36.profitK/1000}M | ROI: +${(fullDeRes.tiered36.profitK/fullDeRes.tiered36.stakeK*100).toFixed(1)}% | Chuỗi thua max: ${fullDeRes.tiered36.maxLossStreak}d\n`);

// =============================================================================
// PHẦN 2: NGHIÊN CỨU CÁC PHƯƠNG PHÁP LÔ MỚI
// =============================================================================
console.log('-'.repeat(88));
console.log('🔥 PHẦN 2: ĐỐI SOÁT CÁC PHƯƠNG PHÁP LÔ MỚI (1 ĐIỂM = 22K, ĂN 80K)');
console.log('-'.repeat(88));

// 1. Lô Song Thủ Top 2 (Vốn 4.4M/ngày, ăn 8M/nháy)
// 2. Lô Tứ Thủ Top 4 (Vốn 8.8M/ngày, ăn 8M/nháy)
// 3. Lô Top 7 Hiện Tại (Baseline: 15.4M/ngày)

function evaluateLoMethods(datesList) {
    const res = {
        top2: { hitDays: 0, winDays: 0, totalHits: 0, stakeK: 0, payoutK: 0, profitK: 0, maxLossStreak: 0, currentLoss: 0 },
        top4: { hitDays: 0, winDays: 0, totalHits: 0, stakeK: 0, payoutK: 0, profitK: 0, maxLossStreak: 0, currentLoss: 0 },
        top7: { hitDays: 0, winDays: 0, totalHits: 0, stakeK: 0, payoutK: 0, profitK: 0, maxLossStreak: 0, currentLoss: 0 }
    };

    datesList.forEach(date => {
        const loRow = loDropoffCache.all2026Ledger.find(r => r.date === date) || loDropoffCache.settledLedger.find(r => r.date === date);
        if (!loRow) return;

        const numbers = (loRow.numbers || []).map(numStr);
        const hitsMap = loRow.numHitsMap || {};

        // Top 2 (Song thủ)
        const nums2 = numbers.slice(0, 2);
        const hits2 = nums2.reduce((acc, n) => acc + (hitsMap[n] || 0), 0);
        res.top2.stakeK += 4400;
        res.top2.totalHits += hits2;
        if (hits2 > 0) res.top2.hitDays++;
        const p2 = hits2 * 8000;
        res.top2.payoutK += p2;
        const profit2 = p2 - 4400;
        res.top2.profitK += profit2;
        if (profit2 > 0) {
            res.top2.winDays++;
            res.top2.currentLoss = 0;
        } else {
            res.top2.currentLoss++;
            if (res.top2.currentLoss > res.top2.maxLossStreak) res.top2.maxLossStreak = res.top2.currentLoss;
        }

        // Top 4 (Tứ thủ)
        const nums4 = numbers.slice(0, 4);
        const hits4 = nums4.reduce((acc, n) => acc + (hitsMap[n] || 0), 0);
        res.top4.stakeK += 8800;
        res.top4.totalHits += hits4;
        if (hits4 > 0) res.top4.hitDays++;
        const p4 = hits4 * 8000;
        res.top4.payoutK += p4;
        const profit4 = p4 - 8800;
        res.top4.profitK += profit4;
        if (profit4 > 0) {
            res.top4.winDays++;
            res.top4.currentLoss = 0;
        } else {
            res.top4.currentLoss++;
            if (res.top4.currentLoss > res.top4.maxLossStreak) res.top4.maxLossStreak = res.top4.currentLoss;
        }

        // Top 7 (Hiện tại)
        const nums7 = numbers.slice(0, 7);
        const hits7 = nums7.reduce((acc, n) => acc + (hitsMap[n] || 0), 0);
        res.top7.stakeK += 15400;
        res.top7.totalHits += hits7;
        if (hits7 > 0) res.top7.hitDays++;
        const p7 = hits7 * 8000;
        res.top7.payoutK += p7;
        const profit7 = p7 - 15400;
        res.top7.profitK += profit7;
        if (profit7 > 0) {
            res.top7.winDays++;
            res.top7.currentLoss = 0;
        } else {
            res.top7.currentLoss++;
            if (res.top7.currentLoss > res.top7.maxLossStreak) res.top7.maxLossStreak = res.top7.currentLoss;
        }
    });

    return res;
}

const liveLoRes = evaluateLoMethods(liveCombatDates);
console.log('A. KẾT QUẢ THỰC CHIẾN LIVE (20 KỲ GẦN NHẤT 17/09 - 06/10):');
console.log(`• ⚡ Song Thủ Lô Top 2 (Vốn 4.4M): Nổ ${liveLoRes.top2.hitDays}/20 (${(liveLoRes.top2.hitDays/20*100).toFixed(1)}%), Thắng lãi: ${liveLoRes.top2.winDays}/20 (${(liveLoRes.top2.winDays/20*100).toFixed(1)}%) | Nháy: ${liveLoRes.top2.totalHits} | Lãi ròng: +${liveLoRes.top2.profitK/1000}M | ROI: +${(liveLoRes.top2.profitK/liveLoRes.top2.stakeK*100).toFixed(1)}% | Chuỗi thua: ${liveLoRes.top2.maxLossStreak}d`);
console.log(`• 🔥 Tứ Thủ Lô Top 4 (Vốn 8.8M)  : Nổ ${liveLoRes.top4.hitDays}/20 (${(liveLoRes.top4.hitDays/20*100).toFixed(1)}%), Thắng lãi: ${liveLoRes.top4.winDays}/20 (${(liveLoRes.top4.winDays/20*100).toFixed(1)}%) | Nháy: ${liveLoRes.top4.totalHits} | Lãi ròng: +${liveLoRes.top4.profitK/1000}M | ROI: +${(liveLoRes.top4.profitK/liveLoRes.top4.stakeK*100).toFixed(1)}% | Chuỗi thua: ${liveLoRes.top4.maxLossStreak}d`);
console.log(`• 🎯 Lô Top 7 Hiện Tại (Vốn 15.4M): Nổ ${liveLoRes.top7.hitDays}/20 (${(liveLoRes.top7.hitDays/20*100).toFixed(1)}%), Thắng lãi: ${liveLoRes.top7.winDays}/20 (${(liveLoRes.top7.winDays/20*100).toFixed(1)}%) | Nháy: ${liveLoRes.top7.totalHits} | Lãi ròng: +${liveLoRes.top7.profitK/1000}M | ROI: +${(liveLoRes.top7.profitK/liveLoRes.top7.stakeK*100).toFixed(1)}% | Chuỗi thua: ${liveLoRes.top7.maxLossStreak}d`);

const full2026LoDates = loDropoffCache.all2026Ledger.map(r => r.date);
const fullLoRes = evaluateLoMethods(full2026LoDates);
console.log(`\nB. KẾT QUẢ TOÀN NĂM 2026 (${full2026LoDates.length} KỲ):`);
console.log(`• ⚡ Song Thủ Lô Top 2 (Vốn 4.4M): Nổ ${fullLoRes.top2.hitDays}/${full2026LoDates.length} (${(fullLoRes.top2.hitDays/full2026LoDates.length*100).toFixed(1)}%), Thắng lãi: ${fullLoRes.top2.winDays}/${full2026LoDates.length} (${(fullLoRes.top2.winDays/full2026LoDates.length*100).toFixed(1)}%) | Nháy: ${fullLoRes.top2.totalHits} | Lãi ròng: +${fullLoRes.top2.profitK/1000}M | ROI: +${(fullLoRes.top2.profitK/fullLoRes.top2.stakeK*100).toFixed(1)}% | Chuỗi thua: ${fullLoRes.top2.maxLossStreak}d`);
console.log(`• 🔥 Tứ Thủ Lô Top 4 (Vốn 8.8M)  : Nổ ${fullLoRes.top4.hitDays}/${full2026LoDates.length} (${(fullLoRes.top4.hitDays/full2026LoDates.length*100).toFixed(1)}%), Thắng lãi: ${fullLoRes.top4.winDays}/${full2026LoDates.length} (${(fullLoRes.top4.winDays/full2026LoDates.length*100).toFixed(1)}%) | Nháy: ${fullLoRes.top4.totalHits} | Lãi ròng: +${fullLoRes.top4.profitK/1000}M | ROI: +${(fullLoRes.top4.profitK/fullLoRes.top4.stakeK*100).toFixed(1)}% | Chuỗi thua: ${fullLoRes.top4.maxLossStreak}d`);
console.log(`• 🎯 Lô Top 7 Hiện Tại (Vốn 15.4M): Nổ ${fullLoRes.top7.hitDays}/${full2026LoDates.length} (${(fullLoRes.top7.hitDays/full2026LoDates.length*100).toFixed(1)}%), Thắng lãi: ${fullLoRes.top7.winDays}/${full2026LoDates.length} (${(fullLoRes.top7.winDays/full2026LoDates.length*100).toFixed(1)}%) | Nháy: ${fullLoRes.top7.totalHits} | Lãi ròng: +${fullLoRes.top7.profitK/1000}M | ROI: +${(fullLoRes.top7.profitK/fullLoRes.top7.stakeK*100).toFixed(1)}% | Chuỗi thua: ${fullLoRes.top7.maxLossStreak}d\n`);

// =============================================================================
// PHẦN 3: NGHIÊN CỨU CÁC PHƯƠNG PHÁP LÔ XIÊN MỚI
// =============================================================================
console.log('-'.repeat(88));
console.log('🎲 PHẦN 3: ĐỐI SOÁT CÁC PHƯƠNG PHÁP LÔ XIÊN MỚI (XIÊN 2, XIÊN QUÂY, XIÊN 5)');
console.log('-'.repeat(88));

// 1. Golden Xiên 2: Top 4 số tạo C_4^2 = 6 cặp Xiên 2. Vốn 6M (1M/cặp), Ăn 10M/cặp
// 2. Lô Xiên 4 Quây 11 Vé (Bộ 4 Quây): 1 vé X4 + 4 vé X3 + 6 vé X2. Vốn 11M (1M/vé), X4 ăn 384M, X3 ăn 84M, X2 ăn 12M
// 3. Lô Xiên 5 Hiện Tại: 5 dàn X4 từ Top 5. Vốn 55M (11M/dàn), ăn 384M / 84M / 12M

function evaluateXienMethods(datesList) {
    const res = {
        goldenXien2: { winDays: 0, totalPairsWon: 0, stakeK: 0, payoutK: 0, profitK: 0, maxLossStreak: 0, currentLoss: 0 },
        quay11Ve: { winDays: 0, x4Hits: 0, x3Hits: 0, x2Hits: 0, stakeK: 0, payoutK: 0, profitK: 0, maxLossStreak: 0, currentLoss: 0 },
        xien5Baseline: { winDays: 0, x4Hits: 0, x3Hits: 0, x2Hits: 0, stakeK: 0, payoutK: 0, profitK: 0, maxLossStreak: 0, currentLoss: 0 }
    };

    datesList.forEach(date => {
        const loRow = loDropoffCache.all2026Ledger.find(r => r.date === date) || loDropoffCache.settledLedger.find(r => r.date === date);
        if (!loRow) return;

        const numbers = (loRow.numbers || []).map(numStr);
        const hitsMap = loRow.numHitsMap || {};

        // A. Golden Xiên 2 (Top 4 số -> 6 cặp)
        const top4 = numbers.slice(0, 4);
        const pairs6 = getCombinations(top4, 2);
        res.goldenXien2.stakeK += 6000; // 6M/ngày (1M/cặp)
        let pairsWon = 0;
        pairs6.forEach(pair => {
            if ((hitsMap[pair[0]] || 0) > 0 && (hitsMap[pair[1]] || 0) > 0) pairsWon++;
        });
        res.goldenXien2.totalPairsWon += pairsWon;
        const payoutX2 = pairsWon * 10000; // 10M/cặp
        res.goldenXien2.payoutK += payoutX2;
        const profitX2 = payoutX2 - 6000;
        res.goldenXien2.profitK += profitX2;
        if (profitX2 > 0) {
            res.goldenXien2.winDays++;
            res.goldenXien2.currentLoss = 0;
        } else {
            res.goldenXien2.currentLoss++;
            if (res.goldenXien2.currentLoss > res.goldenXien2.maxLossStreak) res.goldenXien2.maxLossStreak = res.goldenXien2.currentLoss;
        }

        // B. Xiên Quây 11 Vé (từ Top 4 số)
        // 1 vé X4, 4 vé X3, 6 vé X2. Vốn 11M (1M/vé)
        const hitsInTop4 = top4.filter(n => (hitsMap[n] || 0) > 0).length;
        res.quay11Ve.stakeK += 11000;
        let payoutQuay = 0;
        if (hitsInTop4 === 4) {
            // 1 vé X4 ăn 384M + 4 vé X3 ăn 4*84M = 336M + 6 vé X2 ăn 6*12M = 72M -> 792M!
            payoutQuay = 384000 + 4 * 84000 + 6 * 12000;
            res.quay11Ve.x4Hits++;
        } else if (hitsInTop4 === 3) {
            // 1 vé X3 ăn 84M + 3 vé X2 ăn 3*12M = 36M -> 120M!
            payoutQuay = 84000 + 3 * 12000;
            res.quay11Ve.x3Hits++;
        } else if (hitsInTop4 === 2) {
            // 1 vé X2 ăn 12M!
            payoutQuay = 12000;
            res.quay11Ve.x2Hits++;
        }
        res.quay11Ve.payoutK += payoutQuay;
        const profitQuay = payoutQuay - 11000;
        res.quay11Ve.profitK += profitQuay;
        if (profitQuay > 0) {
            res.quay11Ve.winDays++;
            res.quay11Ve.currentLoss = 0;
        } else {
            res.quay11Ve.currentLoss++;
            if (res.quay11Ve.currentLoss > res.quay11Ve.maxLossStreak) res.quay11Ve.maxLossStreak = res.quay11Ve.currentLoss;
        }

        // C. Xiên 5 Baseline (5 vé X4 từ Top 5)
        const top5 = numbers.slice(0, 5);
        const tickets5 = [
            [top5[0], top5[1], top5[2], top5[3]],
            [top5[0], top5[1], top5[2], top5[4]],
            [top5[0], top5[1], top5[3], top5[4]],
            [top5[0], top5[2], top5[3], top5[4]],
            [top5[1], top5[2], top5[3], top5[4]]
        ];
        res.xien5Baseline.stakeK += 55000;
        let payoutX5 = 0;
        tickets5.forEach(t => {
            const h = t.filter(num => (hitsMap[num] || 0) > 0).length;
            if (h === 4) { payoutX5 += 384000; res.xien5Baseline.x4Hits++; }
            else if (h === 3) { payoutX5 += 84000; res.xien5Baseline.x3Hits++; }
            else if (h === 2) { payoutX5 += 12000; res.xien5Baseline.x2Hits++; }
        });
        res.xien5Baseline.payoutK += payoutX5;
        const profitX5 = payoutX5 - 55000;
        res.xien5Baseline.profitK += profitX5;
        if (profitX5 > 0) {
            res.xien5Baseline.winDays++;
            res.xien5Baseline.currentLoss = 0;
        } else {
            res.xien5Baseline.currentLoss++;
            if (res.xien5Baseline.currentLoss > res.xien5Baseline.maxLossStreak) res.xien5Baseline.maxLossStreak = res.xien5Baseline.currentLoss;
        }
    });

    return res;
}

const liveXienRes = evaluateXienMethods(liveCombatDates);
console.log('A. KẾT QUẢ THỰC CHIẾN LIVE (20 KỲ GẦN NHẤT 17/09 - 06/10):');
console.log(`• 🎲 Golden Xiên 2 (Top 4 · 6 Cặp · Vốn 6M)  : Thắng ${liveXienRes.goldenXien2.winDays}/20 (${(liveXienRes.goldenXien2.winDays/20*100).toFixed(1)}%) | Ăn ${liveXienRes.goldenXien2.totalPairsWon} cặp | Lãi ròng: +${liveXienRes.goldenXien2.profitK/1000}M | ROI: +${(liveXienRes.goldenXien2.profitK/liveXienRes.goldenXien2.stakeK*100).toFixed(1)}% | Chuỗi thua: ${liveXienRes.goldenXien2.maxLossStreak}d`);
console.log(`• 🚀 Lô Xiên Quây 11 Vé (Top 4 · Vốn 11M)      : Thắng ${liveXienRes.quay11Ve.winDays}/20 (${(liveXienRes.quay11Ve.winDays/20*100).toFixed(1)}%) | X4: ${liveXienRes.quay11Ve.x4Hits}, X3: ${liveXienRes.quay11Ve.x3Hits}, X2: ${liveXienRes.quay11Ve.x2Hits} | Lãi ròng: +${liveXienRes.quay11Ve.profitK/1000}M | ROI: +${(liveXienRes.quay11Ve.profitK/liveXienRes.quay11Ve.stakeK*100).toFixed(1)}% | Chuỗi thua: ${liveXienRes.quay11Ve.maxLossStreak}d`);
console.log(`• 👑 Dàn Lô Xiên 5 (5 Vé X4 từ Top 5 · Vốn 55M): Thắng ${liveXienRes.xien5Baseline.winDays}/20 (${(liveXienRes.xien5Baseline.winDays/20*100).toFixed(1)}%) | X4: ${liveXienRes.xien5Baseline.x4Hits}, X3: ${liveXienRes.xien5Baseline.x3Hits}, X2: ${liveXienRes.xien5Baseline.x2Hits} | Lãi ròng: +${liveXienRes.xien5Baseline.profitK/1000}M | ROI: +${(liveXienRes.xien5Baseline.profitK/liveXienRes.xien5Baseline.stakeK*100).toFixed(1)}% | Chuỗi thua: ${liveXienRes.xien5Baseline.maxLossStreak}d`);

const fullXienRes = evaluateXienMethods(full2026LoDates);
console.log(`\nB. KẾT QUẢ TOÀN NĂM 2026 (${full2026LoDates.length} KỲ):`);
console.log(`• 🎲 Golden Xiên 2 (Top 4 · 6 Cặp · Vốn 6M)  : Thắng ${fullXienRes.goldenXien2.winDays}/${full2026LoDates.length} (${(fullXienRes.goldenXien2.winDays/full2026LoDates.length*100).toFixed(1)}%) | Ăn ${fullXienRes.goldenXien2.totalPairsWon} cặp | Lãi ròng: +${fullXienRes.goldenXien2.profitK/1000}M | ROI: +${(fullXienRes.goldenXien2.profitK/fullXienRes.goldenXien2.stakeK*100).toFixed(1)}% | Chuỗi thua: ${fullXienRes.goldenXien2.maxLossStreak}d`);
console.log(`• 🚀 Lô Xiên Quây 11 Vé (Top 4 · Vốn 11M)      : Thắng ${fullXienRes.quay11Ve.winDays}/${full2026LoDates.length} (${(fullXienRes.quay11Ve.winDays/full2026LoDates.length*100).toFixed(1)}%) | X4: ${fullXienRes.quay11Ve.x4Hits}, X3: ${fullXienRes.quay11Ve.x3Hits}, X2: ${fullXienRes.quay11Ve.x2Hits} | Lãi ròng: +${fullXienRes.quay11Ve.profitK/1000}M | ROI: +${(fullXienRes.quay11Ve.profitK/fullXienRes.quay11Ve.stakeK*100).toFixed(1)}% | Chuỗi thua: ${fullXienRes.quay11Ve.maxLossStreak}d`);
console.log(`• 👑 Dàn Lô Xiên 5 (5 Vé X4 từ Top 5 · Vốn 55M): Thắng ${fullXienRes.xien5Baseline.winDays}/${full2026LoDates.length} (${(fullXienRes.xien5Baseline.winDays/full2026LoDates.length*100).toFixed(1)}%) | X4: ${fullXienRes.xien5Baseline.x4Hits}, X3: ${fullXienRes.xien5Baseline.x3Hits}, X2: ${fullXienRes.xien5Baseline.x2Hits} | Lãi ròng: +${fullXienRes.xien5Baseline.profitK/1000}M | ROI: +${(fullXienRes.xien5Baseline.profitK/fullXienRes.xien5Baseline.stakeK*100).toFixed(1)}% | Chuỗi thua: ${fullXienRes.xien5Baseline.maxLossStreak}d\n`);

console.log('='.repeat(88));
console.log('🎉 KẾT THÚC BÁO CÁO NGHIÊN CỨU & KIỂM ĐỊNH!');
console.log('='.repeat(88));
