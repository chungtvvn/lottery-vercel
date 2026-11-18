'use strict';

/**
 * scripts/research-increase-hit-rate-de-lo.js
 * 
 * Nghiên cứu chuyên sâu toán học & thực nghiệm khoa học 100% Strict PIT
 * nhằm nâng cao hiệu suất trúng (Hit Rate) và tỷ suất sinh lời (ROI) cho ĐỀ và LÔ.
 */

const fs = require('fs');
const path = require('path');
const deFusionService = require('../lib/services/deFusionService');
const deTinhGonService = require('../lib/services/deTinhGonService');

const { numStr, getParityForm } = deFusionService;

console.log('='.repeat(95));
console.log('🔬 BẮT ĐẦU NGHIÊN CỨU TĂNG HIỆU SUẤT TRÚNG CHO ĐỀ & LÔ (STRICT PIT 2026)');
console.log('='.repeat(95));

const fusionReport = deFusionService.getDeFusionReport();
const deTinhGonReport = deTinhGonService.getDeTinhGonReport();

const ledger = fusionReport.settledLedger || [];
console.log(`📊 Tổng số kỳ đối soát: ${ledger.length} kỳ (Năm 2026)\n`);

// ============================================================================
// PHẦN 1: NGHIÊN CỨU ĐỀ — GIAO THOA VÀNG & PHÂN TẦNG ĐỒNG THUẬN (CONSENSUS)
// ============================================================================
console.log('🏛️  [PHẦN 1] NGHIÊN CỨU ĐỀ: TỐI ƯU HÓA HIỆU SUẤT TRÚNG (HIT RATE & ROI)');
console.log('-'.repeat(95));

let totalDays = 0;
let deResults = {
    // 1. TriCore 24s Gốc
    triCoreOrig: { wins: 0, x2: 0, x1: 0, stakeK: 0, payoutK: 0, totalNums: 0 },
    // 2. TriCore 24s Sau Lọc Anti-Parity (tri_base)
    triCoreBase: { wins: 0, x2: 0, x1: 0, stakeK: 0, payoutK: 0, totalNums: 0 },
    // 3. TriCore PA B (Cùng Đầu X2, Cùng Đít X1)
    triCorePaB: { wins: 0, x2: 0, x1: 0, stakeK: 0, payoutK: 0, totalNums: 0 },
    // 4. TriCore PA D2 (Chỉ đánh Cùng Đầu X2)
    triCorePaD2: { wins: 0, x2: 0, x1: 0, stakeK: 0, payoutK: 0, totalNums: 0 },
    // 5. Sweet-Spot 17s Gốc
    ss17Base: { wins: 0, x2: 0, x1: 0, stakeK: 0, payoutK: 0, totalNums: 0 },
    // 6. Sweet-Spot 15s (Cắt 2 số cuối)
    ss15Base: { wins: 0, x2: 0, x1: 0, stakeK: 0, payoutK: 0, totalNums: 0 },
    // 7. [MỚI] TẬP GIAO THOA HẠT NHÂN (TriCore ∩ SweetSpot 17)
    consensusCoreIntersect: { wins: 0, stakeK: 0, payoutK: 0, totalNums: 0 },
    // 8. [MỚI] DÀN ĐỒNG THUẬN NHỊ TRỤ TỐI ƯU (Consensus Hierarchical):
    // Giao thoa cược X2, Phần còn lại cược X1
    consensusDualTiered: { wins: 0, x2: 0, x1: 0, stakeK: 0, payoutK: 0, totalNums: 0 },
    // 9. [MỚI] DÀN ĐỒNG THUẬN NHỊ TRỤ CÙNG ĐẦU (Chỉ giữ các số Cùng Đầu của Hợp nhất):
    consensusSameHeadTiered: { wins: 0, x2: 0, x1: 0, stakeK: 0, payoutK: 0, totalNums: 0 }
};

ledger.forEach(row => {
    const actualStr = numStr(row.actualSpecial);
    const pPred = row.parityPrediction || {};
    const predForm = pPred.predForm || 'LL';
    const predHead = predForm[0];

    const triS = row.strategies?.triCore;
    const ai5S = row.strategies?.ai5Ensemble;
    if (!triS || !ai5S || !triS.filteredNumbers) return;

    totalDays++;

    // TriCore Pools
    const triOrigPool = triS.origNumbers || [];
    const triFilteredPool = triS.filteredNumbers || [];
    const triHeadSplit = deTinhGonService.splitByHeadTail(triFilteredPool, predForm);

    // Sweet-Spot Pools
    const ssExtract = deTinhGonService.extractSweetSpotFromFiltered(ai5S.filteredTop, ai5S.filteredBot);
    const ss17Pool = ssExtract.pool17;
    const ss15Pool = ssExtract.pool15;

    // Giao thoa giữa TriCore Filtered và Sweet-Spot 17
    const triSet = new Set(triFilteredPool);
    const ss17Set = new Set(ss17Pool);
    const intersect = ss17Pool.filter(n => triSet.has(n));
    const union = Array.from(new Set([...triFilteredPool, ...ss17Pool]));
    const nonIntersect = union.filter(n => !intersect.includes(n));

    // Dàn Đồng Thuận Cùng Đầu
    const unionSameHead = union.filter(n => getParityForm(n)[0] === predHead);
    const intersectSameHead = intersect.filter(n => getParityForm(n)[0] === predHead);
    const nonIntersectSameHead = unionSameHead.filter(n => !intersectSameHead.includes(n));

    // 1. TriCore Orig (12 X2 + 12 X1)
    const triOrigTop = triS.origTop || [];
    const triOrigBot = triS.origBot || [];
    const hitTriOrigX2 = triOrigTop.includes(actualStr);
    const hitTriOrigX1 = !hitTriOrigX2 && triOrigBot.includes(actualStr);
    const stakeTriOrig = triOrigTop.length * 2000 + triOrigBot.length * 1000;
    const payTriOrig = hitTriOrigX2 ? 168000 : (hitTriOrigX1 ? 84000 : 0);
    deResults.triCoreOrig.totalNums += triOrigPool.length;
    deResults.triCoreOrig.stakeK += stakeTriOrig;
    deResults.triCoreOrig.payoutK += payTriOrig;
    if (hitTriOrigX2) { deResults.triCoreOrig.wins++; deResults.triCoreOrig.x2++; }
    else if (hitTriOrigX1) { deResults.triCoreOrig.wins++; deResults.triCoreOrig.x1++; }

    // 2. TriCore Base (Filtered Top X2 + Filtered Bot X1)
    const hitTriBaseX2 = (triS.filteredTop || []).includes(actualStr);
    const hitTriBaseX1 = !hitTriBaseX2 && (triS.filteredBot || []).includes(actualStr);
    const stakeTriBase = (triS.filteredTop || []).length * 2000 + (triS.filteredBot || []).length * 1000;
    const payTriBase = hitTriBaseX2 ? 168000 : (hitTriBaseX1 ? 84000 : 0);
    deResults.triCoreBase.totalNums += triFilteredPool.length;
    deResults.triCoreBase.stakeK += stakeTriBase;
    deResults.triCoreBase.payoutK += payTriBase;
    if (hitTriBaseX2) { deResults.triCoreBase.wins++; deResults.triCoreBase.x2++; }
    else if (hitTriBaseX1) { deResults.triCoreBase.wins++; deResults.triCoreBase.x1++; }

    // 3. TriCore PA B (Cùng Đầu X2 + Cùng Đít X1)
    const hitTriPaBX2 = triHeadSplit.sameHead.includes(actualStr);
    const hitTriPaBX1 = !hitTriPaBX2 && triHeadSplit.sameTail.includes(actualStr);
    const stakeTriPaB = triHeadSplit.sameHead.length * 2000 + triHeadSplit.sameTail.length * 1000;
    const payTriPaB = hitTriPaBX2 ? 168000 : (hitTriPaBX1 ? 84000 : 0);
    deResults.triCorePaB.totalNums += triFilteredPool.length;
    deResults.triCorePaB.stakeK += stakeTriPaB;
    deResults.triCorePaB.payoutK += payTriPaB;
    if (hitTriPaBX2) { deResults.triCorePaB.wins++; deResults.triCorePaB.x2++; }
    else if (hitTriPaBX1) { deResults.triCorePaB.wins++; deResults.triCorePaB.x1++; }

    // 4. TriCore PA D2 (Chỉ đánh Cùng Đầu X2)
    const hitTriPaD2 = triHeadSplit.sameHead.includes(actualStr);
    const stakeTriPaD2 = triHeadSplit.sameHead.length * 2000;
    const payTriPaD2 = hitTriPaD2 ? 168000 : 0;
    deResults.triCorePaD2.totalNums += triHeadSplit.sameHead.length;
    deResults.triCorePaD2.stakeK += stakeTriPaD2;
    deResults.triCorePaD2.payoutK += payTriPaD2;
    if (hitTriPaD2) { deResults.triCorePaD2.wins++; deResults.triCorePaD2.x2++; }

    // 5. Sweet-Spot 17s Gốc (12 X2 + 5 X1)
    const hitSS17X2 = ssExtract.x2_12.includes(actualStr);
    const hitSS17X1 = !hitSS17X2 && ssExtract.x1_5.includes(actualStr);
    const stakeSS17 = ssExtract.x2_12.length * 2000 + ssExtract.x1_5.length * 1000;
    const paySS17 = hitSS17X2 ? 168000 : (hitSS17X1 ? 84000 : 0);
    deResults.ss17Base.totalNums += ss17Pool.length;
    deResults.ss17Base.stakeK += stakeSS17;
    deResults.ss17Base.payoutK += paySS17;
    if (hitSS17X2) { deResults.ss17Base.wins++; deResults.ss17Base.x2++; }
    else if (hitSS17X1) { deResults.ss17Base.wins++; deResults.ss17Base.x1++; }

    // 6. Sweet-Spot 15s (12 X2 + 3 X1)
    const hitSS15X2 = ssExtract.x2_12.includes(actualStr);
    const hitSS15X1 = !hitSS15X2 && ssExtract.x1_3.includes(actualStr);
    const stakeSS15 = ssExtract.x2_12.length * 2000 + ssExtract.x1_3.length * 1000;
    const paySS15 = hitSS15X2 ? 168000 : (hitSS15X1 ? 84000 : 0);
    deResults.ss15Base.totalNums += ss15Pool.length;
    deResults.ss15Base.stakeK += stakeSS15;
    deResults.ss15Base.payoutK += paySS15;
    if (hitSS15X2) { deResults.ss15Base.wins++; deResults.ss15Base.x2++; }
    else if (hitSS15X1) { deResults.ss15Base.wins++; deResults.ss15Base.x1++; }

    // 7. Giao Thoa Hạt Nhân (Chỉ đánh tập giao thoa cược phẳng 1,000K)
    const hitIntersect = intersect.includes(actualStr);
    const stakeIntersect = intersect.length * 1000;
    const payIntersect = hitIntersect ? 84000 : 0;
    deResults.consensusCoreIntersect.totalNums += intersect.length;
    deResults.consensusCoreIntersect.stakeK += stakeIntersect;
    deResults.consensusCoreIntersect.payoutK += payIntersect;
    if (hitIntersect) deResults.consensusCoreIntersect.wins++;

    // 8. Dàn Đồng Thuận Nhị Trụ (Intersect X2 + NonIntersect X1)
    const hitConsX2 = intersect.includes(actualStr);
    const hitConsX1 = !hitConsX2 && nonIntersect.includes(actualStr);
    const stakeCons = intersect.length * 2000 + nonIntersect.length * 1000;
    const payCons = hitConsX2 ? 168000 : (hitConsX1 ? 84000 : 0);
    deResults.consensusDualTiered.totalNums += union.length;
    deResults.consensusDualTiered.stakeK += stakeCons;
    deResults.consensusDualTiered.payoutK += payCons;
    if (hitConsX2) { deResults.consensusDualTiered.wins++; deResults.consensusDualTiered.x2++; }
    else if (hitConsX1) { deResults.consensusDualTiered.wins++; deResults.consensusDualTiered.x1++; }

    // 9. Dàn Đồng Thuận Cùng Đầu (Intersect SameHead X2 + NonIntersect SameHead X1)
    const hitConsSH_X2 = intersectSameHead.includes(actualStr);
    const hitConsSH_X1 = !hitConsSH_X2 && nonIntersectSameHead.includes(actualStr);
    const stakeConsSH = intersectSameHead.length * 2000 + nonIntersectSameHead.length * 1000;
    const payConsSH = hitConsSH_X2 ? 168000 : (hitConsSH_X1 ? 84000 : 0);
    deResults.consensusSameHeadTiered.totalNums += unionSameHead.length;
    deResults.consensusSameHeadTiered.stakeK += stakeConsSH;
    deResults.consensusSameHeadTiered.payoutK += payConsSH;
    if (hitConsSH_X2) { deResults.consensusSameHeadTiered.wins++; deResults.consensusSameHeadTiered.x2++; }
    else if (hitConsSH_X1) { deResults.consensusSameHeadTiered.wins++; deResults.consensusSameHeadTiered.x1++; }
});

console.log(
    'Phương Pháp Đề'.padEnd(36) +
    'Quy Mô'.padStart(10) +
    'Số Kỳ Trúng'.padStart(13) +
    'Win Rate'.padStart(10) +
    'Tiền Cược'.padStart(12) +
    'Lãi Ròng'.padStart(14) +
    'ROI'.padStart(9)
);
console.log('-'.repeat(104));

const deModels = [
    { key: 'triCoreOrig', name: '1. TriCore 24s Gốc' },
    { key: 'triCoreBase', name: '2. TriCore 24s Sau Lọc' },
    { key: 'triCorePaB', name: '3. TriCore PA B (Tối Ưu Cùng Đầu)' },
    { key: 'triCorePaD2', name: '4. TriCore PA D2 (Dồn Cùng Đầu X2)' },
    { key: 'ss17Base', name: '5. Sweet-Spot 17s Gốc' },
    { key: 'ss15Base', name: '6. Sweet-Spot 15s (Cắt 2 số)' },
    { key: 'consensusCoreIntersect', name: '7. ⭐ Giao Thoa Hạt Nhân (Core Intersect)' },
    { key: 'consensusDualTiered', name: '8. 👑 Đồng Thuận Nhị Trụ (Union Tiered)' },
    { key: 'consensusSameHeadTiered', name: '9. 🚀 Đồng Thuận Nhị Trụ CÙNG ĐẦU' }
];

deModels.forEach(m => {
    const res = deResults[m.key];
    const avgNums = (res.totalNums / totalDays).toFixed(1);
    const winRate = ((res.wins / totalDays) * 100).toFixed(1) + '%';
    const profitK = res.payoutK - res.stakeK;
    const profitStr = (profitK >= 0 ? '+' : '') + Math.round(profitK / 1000) + 'M';
    const roiStr = ((profitK / res.stakeK) * 100).toFixed(1) + '%';
    const stakeStr = Math.round(res.stakeK / 1000) + 'M';

    console.log(
        m.name.padEnd(36) +
        `${avgNums} số`.padStart(10) +
        `${res.wins}/${totalDays}`.padStart(13) +
        winRate.padStart(10) +
        stakeStr.padStart(12) +
        profitStr.padStart(14) +
        roiStr.padStart(9)
    );
});
console.log('-'.repeat(104));

// ============================================================================
// PHẦN 2: NGHIÊN CỨU LÔ — BẠCH THỦ, PHÂN TẦNG VÀ KHỬ LÔ GAN
// ============================================================================
console.log('\n⚡  [PHẦN 2] NGHIÊN CỨU LÔ: TỐI ƯU HÓA HIỆU SUẤT TRÚNG (HIT RATE & ROI)');
console.log('-'.repeat(104));

const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json'), 'utf8'));
const triLo = cache.loTriHarmonic?.settledLedger || [];
const pentaLo = cache.loPentaMatrix?.settledLedger || [];
const pentaMap = new Map(pentaLo.map(r => [r.date, r]));

const LOTO_UNIT_STAKE_K = 2200;
const LOTO_UNIT_PAYOUT_K = 8000;

function evalLoto(nums, actual27) {
    let hits = 0;
    const actMap = {};
    actual27.forEach(a => { actMap[a] = (actMap[a] || 0) + 1; });
    nums.forEach(n => { hits += (actMap[n] || 0); });
    const stakeK = nums.length * LOTO_UNIT_STAKE_K;
    const payoutK = hits * LOTO_UNIT_PAYOUT_K;
    const profitK = payoutK - stakeK;
    return { hits, isHit: hits > 0, isWin: profitK > 0, stakeK, payoutK, profitK };
}

let loResults = {
    triTop1: { days: 0, wins: 0, hits: 0, stakeK: 0, payoutK: 0, maxLoss: 0, curLoss: 0 },
    pentaTop1: { days: 0, wins: 0, hits: 0, stakeK: 0, payoutK: 0, maxLoss: 0, curLoss: 0 },
    consensusTop1: { days: 0, wins: 0, hits: 0, stakeK: 0, payoutK: 0, maxLoss: 0, curLoss: 0 },
    rrfTop2: { days: 0, wins: 0, hits: 0, stakeK: 0, payoutK: 0, maxLoss: 0, curLoss: 0 },
    pentaTieredTop4: { days: 0, wins: 0, hits: 0, stakeK: 0, payoutK: 0, maxLoss: 0, curLoss: 0 },
    pentaTop4Flat: { days: 0, wins: 0, hits: 0, stakeK: 0, payoutK: 0, maxLoss: 0, curLoss: 0 },
    pentaParityTop6: { days: 0, wins: 0, hits: 0, stakeK: 0, payoutK: 0, maxLoss: 0, curLoss: 0 },
    pentaTop6Flat: { days: 0, wins: 0, hits: 0, stakeK: 0, payoutK: 0, maxLoss: 0, curLoss: 0 },
    pentaTop7Flat: { days: 0, wins: 0, hits: 0, stakeK: 0, payoutK: 0, maxLoss: 0, curLoss: 0 }
};

triLo.forEach(r => {
    const p = pentaMap.get(r.date);
    if (!p) return;
    const actual27 = (r.actual27 || []).map(n => String(n).padStart(2, '0'));
    const triRanked = (r.rankedNumbers || []).map(n => String(n).padStart(2, '0'));
    const pentaRanked = (p.rankedNumbers || p.top20 || []).map(n => String(n).padStart(2, '0'));

    const updateStats = (key, ev) => {
        const s = loResults[key];
        s.days++;
        s.hits += ev.hits;
        s.stakeK += ev.stakeK;
        s.payoutK += ev.payoutK;
        if (ev.isWin) {
            s.wins++;
            s.curLoss = 0;
        } else {
            s.curLoss++;
            if (s.curLoss > s.maxLoss) s.maxLoss = s.curLoss;
        }
    };

    // 1. TriCore Top 1
    updateStats('triTop1', evalLoto(triRanked.slice(0, 1), actual27));

    // 2. 5 AI Top 1
    updateStats('pentaTop1', evalLoto(pentaRanked.slice(0, 1), actual27));

    // 3. Consensus Top 1 (Only bet when TriCore #1 == 5 AI #1)
    if (triRanked[0] === pentaRanked[0]) {
        updateStats('consensusTop1', evalLoto([triRanked[0]], actual27));
    }

    // 4. RRF Top 2
    const scores = {};
    triRanked.slice(0, 25).forEach((num, rank) => { scores[num] = (scores[num] || 0) + 1 / (30 + rank); });
    pentaRanked.slice(0, 25).forEach((num, rank) => { scores[num] = (scores[num] || 0) + 1 / (30 + rank); });
    const rrfRanked = Object.keys(scores).sort((a,b) => scores[b] - scores[a]);
    updateStats('rrfTop2', evalLoto(rrfRanked.slice(0, 2), actual27));

    // 5. 5 AI Tiered Top 4 (2 X2 + 2 X1)
    const pTop4 = (p.top4 || pentaRanked.slice(0, 4)).map(n => String(n).padStart(2, '0'));
    const evT4 = deTinhGonService.evaluateLotoBet(pTop4.slice(0, 2), pTop4.slice(2, 4), actual27);
    updateStats('pentaTieredTop4', { hits: evT4.totalHits, isWin: evT4.profitK > 0, stakeK: evT4.stakeK, payoutK: evT4.payoutK });

    // 6. 5 AI Top 4 Flat
    updateStats('pentaTop4Flat', evalLoto(pTop4, actual27));

    // 7. 5 AI Top 6 Parity Tiering
    const pTop6 = (p.top6 || pentaRanked.slice(0, 6)).map(n => String(n).padStart(2, '0'));
    const pHead = (p.predHead || 'L');
    const evP6 = deTinhGonService.evaluateLotoBet(
        pTop6.filter(n => getParityForm(n)[0] === pHead),
        pTop6.filter(n => getParityForm(n)[0] !== pHead),
        actual27
    );
    updateStats('pentaParityTop6', { hits: evP6.totalHits, isWin: evP6.profitK > 0, stakeK: evP6.stakeK, payoutK: evP6.payoutK });

    // 8. 5 AI Top 6 Flat
    updateStats('pentaTop6Flat', evalLoto(pTop6, actual27));

    // 9. 5 AI Top 7 Flat
    const pTop7 = (p.top7 || pentaRanked.slice(0, 7)).map(n => String(n).padStart(2, '0'));
    updateStats('pentaTop7Flat', evalLoto(pTop7, actual27));
});

console.log(
    'Cấu Hình Lô'.padEnd(36) +
    'Số Kỳ'.padStart(8) +
    'Ngày Có Lãi'.padStart(14) +
    'Win Rate'.padStart(10) +
    'Tổng Nháy'.padStart(11) +
    'Lãi Ròng'.padStart(14) +
    'ROI'.padStart(9) +
    'Max Loss'.padStart(10)
);
console.log('-'.repeat(112));

const loModels = [
    { key: 'triTop1', name: '1. 🌟 TriCore Top 1 Bạch Thủ Flat' },
    { key: 'consensusTop1', name: '2. ⭐ Bạch Thủ Đồng Thuận Kép (Tri==5AI)' },
    { key: 'pentaTop1', name: '3. 🤖 5 AI Top 1 Bạch Thủ Flat' },
    { key: 'rrfTop2', name: '4. ⚡ Song Thủ Dung Hợp RRF Top 2' },
    { key: 'pentaTieredTop4', name: '5. 🛡️ 5 AI Top 4 Phân Tầng (2X2+2X1)' },
    { key: 'pentaTop4Flat', name: '6. 🤖 5 AI Top 4 Tứ Thủ Flat' },
    { key: 'pentaParityTop6', name: '7. 👑 5 AI Top 6 Phân Tầng Chẵn Lẻ' },
    { key: 'pentaTop6Flat', name: '8. 🤖 5 AI Top 6 Lục Thủ Flat' },
    { key: 'pentaTop7Flat', name: '9. 💎 5 AI Top 7 Thất Thủ Flat' }
];

loModels.forEach(m => {
    const res = loResults[m.key];
    const winRate = ((res.wins / res.days) * 100).toFixed(1) + '%';
    const profitK = res.payoutK - res.stakeK;
    const profitStr = (profitK >= 0 ? '+' : '') + Math.round(profitK / 1000) + 'M';
    const roiStr = ((profitK / res.stakeK) * 100).toFixed(1) + '%';

    console.log(
        m.name.padEnd(36) +
        String(res.days).padStart(8) +
        `${res.wins}/${res.days}`.padStart(14) +
        winRate.padStart(10) +
        String(res.hits).padStart(11) +
        profitStr.padStart(14) +
        roiStr.padStart(9) +
        `${res.maxLoss} ngày`.padStart(10)
    );
});
console.log('-'.repeat(112));
console.log('🎉 TOÀN BỘ NGHIÊN CỨU ĐÃ ĐỐI SOÁT XONG VỚI 100% STRICT PIT!\n');

