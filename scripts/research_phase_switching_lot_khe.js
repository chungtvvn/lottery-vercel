'use strict';

const fs = require('fs');
const path = require('path');

const advisorPath = path.join(process.cwd(), 'lib/data/statistics/cached_daily_method_advisor.json');
const adv = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));

console.log('Loaded cached_daily_method_advisor.json successfully.');

// Collect all settled dates in 2026
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

console.log(`Total settled dates analyzed in 2026: ${allDates.length} (from ${allDates[0]} to ${allDates[allDates.length - 1]})`);

// Track day-by-day vote distributions and actual prize outcomes
const dailyOutcomes = [];

for (const date of allDates) {
    const metaRow = settledLedgers.metaLearner.find(r => r.date === date);
    const adaptiveRow = settledLedgers.adaptiveDualMerge.find(r => r.date === date);
    const dualRow = settledLedgers.dualMerge.find(r => r.date === date);
    const tripleRow = settledLedgers.tripleMerge.find(r => r.date === date);
    const pentaRow = settledLedgers.pentaCoreDe.find(r => r.date === date);
    const markovRow = settledLedgers.deMarkovGapHazard.find(r => r.date === date);
    const graphRow = settledLedgers.dePositionalGraphFlow.find(r => r.date === date);
    const streakRow = settledLedgers.streakAwareDeAdvisor.find(r => r.date === date);

    const actualSpecial = metaRow?.actualSpecial ?? adaptiveRow?.actualSpecial ?? dualRow?.actualSpecial;
    if (actualSpecial === undefined || actualSpecial === null) continue;

    const actualNum = Number(actualSpecial);

    // Collect number sets
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
    const pool1 = [];
    const consensus2Plus = [];
    const vip4Plus = [];

    for (let i = 0; i < 100; i++) {
        const v = voteCounts[i];
        if (v === 0) lotKhe0.push(i);
        else if (v === 1) pool1.push(i);
        if (v >= 2) consensus2Plus.push(i);
        if (v >= 4) vip4Plus.push(i);
    }

    const actualVotes = voteCounts[actualNum];
    const isLotKhe = (actualVotes === 0);
    const isPool1 = (actualVotes === 1);
    const isConsensus = (actualVotes >= 2);
    const isVip = (actualVotes >= 4);

    const adaptiveHit = Boolean(adaptiveRow?.isHit);
    const dualHit = Boolean(dualRow?.isHit);
    const metaHit = Boolean(metaRow?.isHit);
    const tripleHit = Boolean(tripleRow?.isHit);
    const streakHit = Boolean(streakRow?.isHit);

    dailyOutcomes.push({
        date,
        actualSpecial: actualNum,
        actualVotes,
        lotKheSize: lotKhe0.length,
        isLotKhe,
        isPool1,
        isConsensus,
        isVip,
        adaptiveHit,
        dualHit,
        metaHit,
        tripleHit,
        streakHit,
        adaptiveTierX2Hit: adaptiveRow?.hitType === 'win_x2',
        adaptiveTierX1Hit: adaptiveRow?.hitType === 'win_x1',
        lotKheNumbers: lotKhe0
    });
}

console.log(`Processed ${dailyOutcomes.length} days with full ground-truth data.\n`);

// 1. STATISTICAL BREAKDOWN OF OUTCOMES
let totalLotKheHits = 0;
let totalPool1Hits = 0;
let totalConsensusHits = 0;
let totalVipHits = 0;

dailyOutcomes.forEach(d => {
    if (d.isLotKhe) totalLotKheHits++;
    if (d.isPool1) totalPool1Hits++;
    if (d.isConsensus) totalConsensusHits++;
    if (d.isVip) totalVipHits++;
});

console.log('=== 1. TỔNG QUAN PHÂN PHỐI ĐIỂM RƠI ĐẶC BIỆT NĂM 2026 ===');
console.log(`• Tổng số kỳ: ${dailyOutcomes.length}`);
console.log(`• Đồng thuận cao (>=2 votes, TB ~45 số): ${totalConsensusHits}/${dailyOutcomes.length} (${(totalConsensusHits / dailyOutcomes.length * 100).toFixed(1)}%)`);
console.log(`• Siêu VIP (>=4 votes, TB ~16 số): ${totalVipHits}/${dailyOutcomes.length} (${(totalVipHits / dailyOutcomes.length * 100).toFixed(1)}%)`);
console.log(`• Ngoại vi 1-Vote (TB ~28 số): ${totalPool1Hits}/${dailyOutcomes.length} (${(totalPool1Hits / dailyOutcomes.length * 100).toFixed(1)}%)`);
console.log(`• Lọt Khe Tuyệt Đối (0-Vote, TB ~11 số): ${totalLotKheHits}/${dailyOutcomes.length} (${(totalLotKheHits / dailyOutcomes.length * 100).toFixed(1)}%)`);

// 2. MARKOV TRANSITION TENSOR: WHAT HAPPENS AFTER A LỌT KHE DAY?
let afterLotKheTotal = 0;
let afterLotKheConsensusHits = 0;
let afterLotKheAdaptiveHits = 0;
let afterLotKheVipHits = 0;
let afterLotKheLotKheHits = 0;

for (let i = 1; i < dailyOutcomes.length; i++) {
    const prev = dailyOutcomes[i - 1];
    const curr = dailyOutcomes[i];

    if (prev.isLotKhe) {
        afterLotKheTotal++;
        if (curr.isConsensus) afterLotKheConsensusHits++;
        if (curr.adaptiveHit) afterLotKheAdaptiveHits++;
        if (curr.isVip) afterLotKheVipHits++;
        if (curr.isLotKhe) afterLotKheLotKheHits++;
    }
}

console.log('\n=== 2. QUY LUẬT CHUYỂN TIẾP SAU KHI XẢY RA LỌT KHE (POST-LỌT-KHE REBOUND) ===');
console.log(`• Số lần xảy ra Lọt Khe ngày D-1: ${afterLotKheTotal}`);
console.log(`• Xác suất Ngày D nổ lại vào Đồng Thuận AI (Consensus >= 2): ${afterLotKheConsensusHits}/${afterLotKheTotal} (${(afterLotKheConsensusHits / afterLotKheTotal * 100).toFixed(1)}%)`);
console.log(`• Xác suất Ngày D nổ Đề Thích Ứng Alpha: ${afterLotKheAdaptiveHits}/${afterLotKheTotal} (${(afterLotKheAdaptiveHits / afterLotKheTotal * 100).toFixed(1)}%)`);
console.log(`• Xác suất Ngày D nổ Siêu VIP (>=4 votes): ${afterLotKheVipHits}/${afterLotKheTotal} (${(afterLotKheVipHits / afterLotKheTotal * 100).toFixed(1)}%)`);
console.log(`• Xác suất Ngày D tiếp tục Lọt Khe liên tiếp: ${afterLotKheLotKheHits}/${afterLotKheTotal} (${(afterLotKheLotKheHits / afterLotKheTotal * 100).toFixed(1)}%)`);

// 3. OVER-CONSENSUS TRAP: WHAT HAPPENS WHEN AI IS ON A WIN STREAK?
console.log('\n=== 3. BẪY ĐỒNG THUẬN: TỶ LỆ LỌT KHE THEO ĐỘ DÀI CHUỖI THẮNG AI ===');
for (let streakLen = 1; streakLen <= 5; streakLen++) {
    let countTotal = 0;
    let countLotKheNext = 0;
    let countAdaptiveNext = 0;

    for (let i = streakLen; i < dailyOutcomes.length; i++) {
        let allWin = true;
        for (let j = 1; j <= streakLen; j++) {
            if (!dailyOutcomes[i - j].adaptiveHit && !dailyOutcomes[i - j].isConsensus) {
                allWin = false;
                break;
            }
        }
        if (allWin) {
            countTotal++;
            if (dailyOutcomes[i].isLotKhe) countLotKheNext++;
            if (dailyOutcomes[i].adaptiveHit) countAdaptiveNext++;
        }
    }
    console.log(`• Chuỗi thắng AI liên tiếp >= ${streakLen} ngày (${countTotal} trường hợp):`);
    console.log(`   └ Xác suất hôm sau rơi vào Lọt Khe (0-Vote): ${countLotKheNext}/${countTotal} (${(countLotKheNext / countTotal * 100).toFixed(1)}%)`);
    console.log(`   └ Xác suất hôm sau tiếp tục ăn Adaptive Alpha: ${countAdaptiveNext}/${countTotal} (${(countAdaptiveNext / countTotal * 100).toFixed(1)}%)`);
}

// 4. CORRELATION WITH LÔ (HOW MANY LÔ HITS LAND ON ĐỀ 0-VOTE POOL?)
const dmRows = adv.loDualMerge?.settledLedger || [];
let totalLoDraws = 0;
let totalLoHitsInLotKhe = 0;

dailyOutcomes.forEach(d => {
    const loRow = dmRows.find(r => r.date === d.date);
    if (loRow && Array.isArray(loRow.actual27)) {
        totalLoDraws++;
        const lotKheSet = new Set(d.lotKheNumbers);
        let hits = 0;
        loRow.actual27.forEach(n => {
            if (lotKheSet.has(Number(n))) hits++;
        });
        totalLoHitsInLotKhe += hits;
    }
});

console.log('\n=== 4. QUAN HỆ ĐỐI ỨNG LÔ VÀ DÀN ĐỀ LỌT KHE ===');
console.log(`• Số kỳ Lô có dữ liệu: ${totalLoDraws}`);
console.log(`• Trung bình số nháy Lô nổ vào dàn Đề Lọt Khe: ${(totalLoHitsInLotKhe / totalLoDraws).toFixed(2)} nháy / ngày (trên TB ${11} số)`);
console.log(`• Tỷ lệ xuất hiện Lô trong dàn Lọt Khe: ${(totalLoHitsInLotKhe / (totalLoDraws * 27) * 100).toFixed(1)}% trên toàn bảng lô`);
