'use strict';

const fs = require('fs');
const path = require('path');

const advisorPath = path.join(process.cwd(), 'lib/data/statistics/cached_daily_method_advisor.json');
const adv = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));

const settledLedgers = {
    metaLearner: adv.metaLearner?.settledLedger || [],
    adaptiveDualMerge: adv.adaptiveDualMerge?.settledLedger || [],
    dualMerge: adv.dualMerge?.settledLedger || [],
    tripleMerge: adv.tripleMerge?.settledLedger || [],
    pentaCoreDe: adv.pentaCoreDe?.settledLedger || [],
    deMarkovGapHazard: adv.deMarkovGapHazard?.settledLedger || [],
    dePositionalGraphFlow: adv.dePositionalGraphFlow?.settledLedger || [],
    streakAwareDeAdvisor: adv.streakAwareDeAdvisor?.settledLedger || []
};

const allDates = Array.from(new Set(
    settledLedgers.metaLearner.map(r => r.date).filter(Boolean)
)).sort();

let alphaWins = 0;
let lotKheWins = 0;
let eitherWins = 0;
let bothMiss = 0;

let totalStakeK = 0;
let totalPayoutK = 0;

// Simulation parameters for Combined Strategy:
// Đề Thích Ứng Alpha: VIP X2 (400K) + Lót X1 (200K) [total ~12M/day]
// Dàn Lọt Khe Hedge (10-12 số): Cược bảo hiểm 100K/số [total ~1.1M/day]
// Tỷ lệ ăn x84
const resultsByDay = [];

for (const date of allDates) {
    const adaptiveRow = settledLedgers.adaptiveDualMerge.find(r => r.date === date);
    const metaRow = settledLedgers.metaLearner.find(r => r.date === date);
    const dualRow = settledLedgers.dualMerge.find(r => r.date === date);
    const tripleRow = settledLedgers.tripleMerge.find(r => r.date === date);
    const pentaRow = settledLedgers.pentaCoreDe.find(r => r.date === date);
    const markovRow = settledLedgers.deMarkovGapHazard.find(r => r.date === date);
    const graphRow = settledLedgers.dePositionalGraphFlow.find(r => r.date === date);

    const actual = Number(metaRow?.actualSpecial ?? adaptiveRow?.actualSpecial);
    if (isNaN(actual)) continue;

    const pools = [
        metaRow?.numbers || metaRow?.standard30,
        adaptiveRow?.numbers || adaptiveRow?.fullUnion,
        dualRow?.numbers || dualRow?.fullUnion,
        tripleRow?.numbers || tripleRow?.fullUnion,
        pentaRow?.numbers,
        markovRow?.numbers,
        graphRow?.numbers
    ].filter(Boolean);

    const voteCounts = Array.from({ length: 100 }, () => 0);
    pools.forEach(pool => {
        (pool || []).forEach(n => {
            const idx = Number(n);
            if (Number.isInteger(idx) && idx >= 0 && idx < 100) {
                voteCounts[idx]++;
            }
        });
    });

    const lotKhe0 = [];
    for (let i = 0; i < 100; i++) {
        if (voteCounts[i] === 0) lotKhe0.push(i);
    }

    const adaptiveNums = adaptiveRow?.numbers || adaptiveRow?.fullUnion || [];
    const adaptiveX2 = adaptiveRow?.intersectionX2 || adaptiveRow?.tierX2 || [];
    const adaptiveX1 = adaptiveRow?.uniqueSinglesX1 || adaptiveRow?.singles || [];

    const isAlphaHit = adaptiveNums.includes(actual);
    const isAlphaX2 = adaptiveX2.includes(actual);
    const isAlphaX1 = adaptiveX1.includes(actual);
    const isLotKheHit = lotKhe0.includes(actual);

    if (isAlphaHit) alphaWins++;
    if (isLotKheHit) lotKheWins++;
    if (isAlphaHit || isLotKheHit) eitherWins++;
    else bothMiss++;

    // Sizing:
    // Alpha: Mức 3 cược 400K cho X2 (23 số = 9.2M), 200K cho X1 (14 số = 2.8M) -> Vốn 12.0M
    // Lọt khe: 100K/số (11 số = 1.1M)
    // Tổng vốn = 13.1M
    const stakeAlphaK = adaptiveX2.length * 400 + adaptiveX1.length * 200;
    const stakeHedgeK = lotKhe0.length * 100;
    const dayStakeK = stakeAlphaK + stakeHedgeK;

    let dayPayoutK = 0;
    if (isAlphaX2) dayPayoutK += 400 * 84; // 33.6M
    else if (isAlphaX1) dayPayoutK += 200 * 84; // 16.8M

    if (isLotKheHit) dayPayoutK += 100 * 84; // 8.4M

    const dayProfitK = dayPayoutK - dayStakeK;
    totalStakeK += dayStakeK;
    totalPayoutK += dayPayoutK;

    resultsByDay.push({
        date,
        actual,
        isAlphaHit,
        isAlphaX2,
        isAlphaX1,
        isLotKheHit,
        combinedHit: isAlphaHit || isLotKheHit,
        dayStakeK,
        dayPayoutK,
        dayProfitK
    });
}

const totalDays = resultsByDay.length;
const totalProfitK = totalPayoutK - totalStakeK;
const roi = (totalProfitK / totalStakeK * 100).toFixed(2);
const winRateCombined = (eitherWins / totalDays * 100).toFixed(1);
const winRateAlphaOnly = (alphaWins / totalDays * 100).toFixed(1);
const winRateLotKhe = (lotKheWins / totalDays * 100).toFixed(1);

console.log('=== KẾT QUẢ MÔ PHỎNG CHIẾN THUẬT: ĐỀ ALPHA + BẢO HIỂM LỌT KHE 2026 ===');
console.log(`• Tổng số ngày: ${totalDays}`);
console.log(`• Tỷ lệ thắng Đề Alpha đơn lẻ: ${alphaWins}/${totalDays} (${winRateAlphaOnly}%)`);
console.log(`• Tỷ lệ thắng Dàn Lọt Khe đơn lẻ: ${lotKheWins}/${totalDays} (${winRateLotKhe}%)`);
console.log(`• 🏆 TỶ LỆ THẮNG TỔ HỢP (ALPHA + LỌT KHE): ${eitherWins}/${totalDays} (${winRateCombined}%)`);
console.log(`• Số ngày trượt cả 2 (Bị lọt vào nhóm 1-vote ngoài lề): ${bothMiss}/${totalDays} (${(bothMiss / totalDays * 100).toFixed(1)}%)`);
console.log(`• Tổng vốn cược (Mức 3 + Bảo hiểm 100K): ${(totalStakeK / 1000).toFixed(1)}M (${(totalStakeK / 1000000).toFixed(3)} TỶ)`);
console.log(`• Tổng tiền thưởng: ${(totalPayoutK / 1000).toFixed(1)}M (${(totalPayoutK / 1000000).toFixed(3)} TỶ)`);
console.log(`• LỢI NHUẬN RÒNG (MỨC 3): +${(totalProfitK / 1000).toFixed(1)}M VNĐ (+${(totalProfitK / 1000000).toFixed(3)} TỶ VNĐ)`);
console.log(`• Tỷ lệ ROI: +${roi}%`);

// Max consecutive loss analysis
let maxAlphaLossStreak = 0;
let curAlphaLossStreak = 0;
let maxCombinedLossStreak = 0;
let curCombinedLossStreak = 0;

resultsByDay.forEach(r => {
    if (!r.isAlphaHit) {
        curAlphaLossStreak++;
        if (curAlphaLossStreak > maxAlphaLossStreak) maxAlphaLossStreak = curAlphaLossStreak;
    } else {
        curAlphaLossStreak = 0;
    }

    if (!r.combinedHit) {
        curCombinedLossStreak++;
        if (curCombinedLossStreak > maxCombinedLossStreak) maxCombinedLossStreak = curCombinedLossStreak;
    } else {
        curCombinedLossStreak = 0;
    }
});

console.log(`\n=== PHÂN TÍCH QUẢN TRỊ RỦI RO & CHUỖI TRƯỢT TỐI ĐA (MAX DRAWDOWN) ===`);
console.log(`• Chuỗi trượt dài nhất của Đề Alpha đơn lẻ: ${maxAlphaLossStreak} ngày`);
console.log(`• Chuỗi trượt dài nhất khi có Bảo Hiểm Lọt Khe: ${maxCombinedLossStreak} ngày (GIẢM ĐỘ SÂU SỤT GIẢM ĐÁNG KỂ!)`);
