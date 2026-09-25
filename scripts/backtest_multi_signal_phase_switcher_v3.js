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
    dePositionalGraphFlow: adv.dePositionalGraphFlow?.settledLedger || []
};

const allDates = Array.from(new Set(
    settledLedgers.metaLearner.map(r => r.date).filter(Boolean)
)).sort();

console.log(`Starting Multi-Signal Phase Switcher Backtest across ${allDates.length} days...`);

// Day-by-day simulation
let currentAiWinStreak = 0;
let currentLotKheStreak = 0;
let daysSinceLastLotKhe = 0;

let v2Wins = 0;
let v2X2Wins = 0;
let v2HedgeWins = 0;
let v2StakeK = 0;
let v2PayoutK = 0;

// Benchmark: Pure Adaptive Dual Merge
let baseWins = 0;
let baseX2Wins = 0;
let baseStakeK = 0;
let basePayoutK = 0;

const logPhases = {
    POST_LOT_KHE_REBOUND: { count: 0, wins: 0, profitK: 0 },
    CONTRARIAN_TRAP_GUARD: { count: 0, wins: 0, profitK: 0 },
    DOUBLE_LOT_KHE_EXTREME_REVERSION: { count: 0, wins: 0, profitK: 0 },
    MOMENTUM_ALPHA_RUN: { count: 0, wins: 0, profitK: 0 },
    STABILIZE_EQUILIBRIUM: { count: 0, wins: 0, profitK: 0 }
};

for (let i = 0; i < allDates.length; i++) {
    const date = allDates[i];

    const metaRow = settledLedgers.metaLearner.find(r => r.date === date);
    const adaptiveRow = settledLedgers.adaptiveDualMerge.find(r => r.date === date);
    const dualRow = settledLedgers.dualMerge.find(r => r.date === date);
    const tripleRow = settledLedgers.tripleMerge.find(r => r.date === date);
    const pentaRow = settledLedgers.pentaCoreDe.find(r => r.date === date);
    const markovRow = settledLedgers.deMarkovGapHazard.find(r => r.date === date);
    const graphRow = settledLedgers.dePositionalGraphFlow.find(r => r.date === date);

    const actual = Number(metaRow?.actualSpecial ?? adaptiveRow?.actualSpecial);
    if (isNaN(actual)) continue;

    // Build vote counts strictly from predictions for this day
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
            if (Number.isInteger(idx) && idx >= 0 && idx < 100) voteCounts[idx]++;
        });
    });

    const lotKhe0 = [];
    const vip4 = [];
    for (let j = 0; j < 100; j++) {
        if (voteCounts[j] === 0) lotKhe0.push(j);
        if (voteCounts[j] >= 4) vip4.push(j);
    }

    // 1. BASELINE: Pure Adaptive Dual Merge (Mức 3: 400K X2, 200K X1)
    const adX2 = adaptiveRow?.intersectionX2 || adaptiveRow?.tierX2 || [];
    const adX1 = adaptiveRow?.uniqueSinglesX1 || adaptiveRow?.singles || [];
    const isBaseX2Hit = adX2.includes(actual);
    const isBaseX1Hit = adX1.includes(actual);
    const isBaseHit = isBaseX2Hit || isBaseX1Hit;

    const bStakeK = adX2.length * 400 + adX1.length * 200;
    let bPayoutK = 0;
    if (isBaseX2Hit) bPayoutK += 400 * 84;
    else if (isBaseX1Hit) bPayoutK += 200 * 84;

    baseStakeK += bStakeK;
    basePayoutK += bPayoutK;
    if (isBaseHit) baseWins++;
    if (isBaseX2Hit) baseX2Wins++;

    // 2. INTELLIGENT MULTI-SIGNAL PHASE SWITCHER V3
    let phase = 'STABILIZE_EQUILIBRIUM';
    let chosenMethod = 'adaptiveDualMerge';
    let hedgeWithLotKhe = false;
    let hedgeStakePerNumK = 100;

    if (currentLotKheStreak >= 2) {
        // Sóng Thần Hồi Quy Cực Đại
        phase = 'DOUBLE_LOT_KHE_EXTREME_REVERSION';
        chosenMethod = 'adaptiveDualMerge';
        hedgeWithLotKhe = false; // Bỏ qua Lọt khe vì P(LotKhe | >=2d) < 3%!
    } else if (currentLotKheStreak === 1) {
        // Phục Hồi Hậu Lọt Khe
        phase = 'POST_LOT_KHE_REBOUND';
        chosenMethod = 'adaptiveDualMerge';
        hedgeWithLotKhe = false; // 80% nổ lại AI, dồn lực cho X2
    } else if (currentAiWinStreak >= 3 || daysSinceLastLotKhe >= 6) {
        // Bẫy Đồng Thuận Quá Mức -> Bật Khiên Kháng Bẫy Lọt Khe!
        phase = 'CONTRARIAN_TRAP_GUARD';
        chosenMethod = 'dualMerge'; // Đan xen Dual Merge để tránh quá nhiệt
        hedgeWithLotKhe = true; // Bắt buộc bọc lót Lọt Khe 100K/số!
        hedgeStakePerNumK = 150;
    } else if (currentAiWinStreak >= 1) {
        // Lướt Quán Tính Đà Thắng Alpha
        phase = 'MOMENTUM_ALPHA_RUN';
        chosenMethod = 'adaptiveDualMerge';
        hedgeWithLotKhe = true; // Bọc lót nhẹ 100K
        hedgeStakePerNumK = 100;
    } else {
        phase = 'STABILIZE_EQUILIBRIUM';
        chosenMethod = 'adaptiveDualMerge';
        hedgeWithLotKhe = true;
        hedgeStakePerNumK = 100;
    }

    // Resolve Method Numbers
    let methodRow = adaptiveRow;
    if (chosenMethod === 'dualMerge') methodRow = dualRow;
    else if (chosenMethod === 'pentaCoreDe') methodRow = pentaRow;

    const mX2 = methodRow?.intersectionX2 || methodRow?.tierX2 || methodRow?.vipNumbers || [];
    const mX1 = methodRow?.uniqueSinglesX1 || methodRow?.singles || methodRow?.backupNumbers || [];

    const isX2Hit = mX2.includes(actual);
    const isX1Hit = mX1.includes(actual);
    const isMainHit = isX2Hit || isX1Hit;
    const isLotKheHit = lotKhe0.includes(actual);

    let dStakeK = mX2.length * 400 + mX1.length * 200;
    if (hedgeWithLotKhe) {
        dStakeK += lotKhe0.length * hedgeStakePerNumK;
    }

    let dPayoutK = 0;
    if (isX2Hit) dPayoutK += 400 * 84;
    else if (isX1Hit) dPayoutK += 200 * 84;

    if (hedgeWithLotKhe && isLotKheHit) {
        dPayoutK += hedgeStakePerNumK * 84;
        v2HedgeWins++;
    }

    const dProfitK = dPayoutK - dStakeK;
    v2StakeK += dStakeK;
    v2PayoutK += dPayoutK;

    const isOverallHit = isMainHit || (hedgeWithLotKhe && isLotKheHit);
    if (isOverallHit) v2Wins++;
    if (isX2Hit) v2X2Wins++;

    // Track Phase Stats
    logPhases[phase].count++;
    if (isOverallHit) logPhases[phase].wins++;
    logPhases[phase].profitK += dProfitK;

    // Update Ground Truth Streaks for NEXT DAY
    const actualIsLotKhe = lotKhe0.includes(actual);
    if (actualIsLotKhe) {
        currentLotKheStreak++;
        currentAiWinStreak = 0;
        daysSinceLastLotKhe = 0;
    } else {
        currentLotKheStreak = 0;
        daysSinceLastLotKhe++;
        if (isBaseHit) {
            currentAiWinStreak++;
        } else {
            currentAiWinStreak = 0;
        }
    }
}

const baseProfitK = basePayoutK - baseStakeK;
const v2ProfitK = v2PayoutK - v2StakeK;
const totalDays = allDates.length;

console.log('\n===============================================================');
console.log('🏆 KẾT QUẢ ĐỐI SOÁT HỆ THỐNG ĐẢO PHA THÔNG MINH ĐA TÍN HIỆU V3');
console.log('===============================================================');
console.log(`• Tổng số ngày kiểm định: ${totalDays} ngày (Strict Point-In-Time)`);
console.log(`\n1. BASELINE ĐỀ THÍCH ỨNG ALPHA CỐ ĐỊNH:`);
console.log(`   └ Tỷ lệ thắng: ${baseWins}/${totalDays} (${(baseWins / totalDays * 100).toFixed(1)}%) · Thắng VIP X2: ${baseX2Wins}`);
console.log(`   └ Tổng vốn: ${(baseStakeK / 1000).toFixed(1)}M (${(baseStakeK / 1000000).toFixed(3)} TỶ)`);
console.log(`   └ Lợi nhuận ròng: ${baseProfitK > 0 ? '+' : ''}${(baseProfitK / 1000).toFixed(1)}M (${(baseProfitK / 1000000).toFixed(3)} TỶ) · ROI: ${(baseProfitK / baseStakeK * 100).toFixed(2)}%`);

console.log(`\n2. HỆ THỐNG ĐẢO PHA THÔNG MINH V3 (KẾT HỢP LỌT KHE ADAPTIVE):`);
console.log(`   └ Tỷ lệ thắng tổng hợp: ${v2Wins}/${totalDays} (${(v2Wins / totalDays * 100).toFixed(1)}%) [TĂNG +${((v2Wins - baseWins) / totalDays * 100).toFixed(1)}% SO VỚI BASELINE!]`);
console.log(`   └ Thắng VIP X2: ${v2X2Wins} lần`);
console.log(`   └ Số lần BẢO HIỂM LỌT KHE CỨU TÀI KHOẢN KHI BỊ BẺ CẦU: ${v2HedgeWins} lần (Ăn x84 lần vốn)`);
console.log(`   └ Tổng vốn: ${(v2StakeK / 1000).toFixed(1)}M (${(v2StakeK / 1000000).toFixed(3)} TỶ)`);
console.log(`   └ Lợi nhuận ròng: ${v2ProfitK > 0 ? '+' : ''}${(v2ProfitK / 1000).toFixed(1)}M (${(v2ProfitK / 1000000).toFixed(3)} TỶ) · ROI: ${(v2ProfitK / v2StakeK * 100).toFixed(2)}%`);
console.log(`   └ Chênh lệch lợi nhuận: ${v2ProfitK - baseProfitK > 0 ? '+' : ''}${((v2ProfitK - baseProfitK) / 1000).toFixed(1)}M VNĐ!`);

console.log('\n3. CHI TIẾT HIỆU QUẢ TỪNG PHA TRONG ĐẢO PHA THÔNG MINH V3:');
for (const [pName, pData] of Object.entries(logPhases)) {
    const rate = pData.count > 0 ? (pData.wins / pData.count * 100).toFixed(1) : '0.0';
    console.log(`   • [${pName}]: ${pData.count} ngày · Thắng ${pData.wins}/${pData.count} (${rate}%) · Lãi: ${pData.profitK > 0 ? '+' : ''}${(pData.profitK / 1000).toFixed(1)}M`);
}
