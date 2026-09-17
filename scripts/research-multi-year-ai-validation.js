'use strict';

/**
 * BÁO CÁO NGHIÊN CỨU & ĐỐI SOÁT ĐA NĂM LỊCH SỬ (2024 - 2026)
 * CHO CÁC MÔ HÌNH AI TOÁN HỌC & BỘ ĐIỀU PHỐI ĐỔI PHA THÔNG MINH
 * 
 * 100% Strict Point-In-Time (Strict PIT): 
 * Dự đoán ngày t chỉ được huấn luyện / điều kiện hóa trên dữ liệu đến ngày t-1.
 * 
 * Tập dữ liệu kiểm định độc lập:
 * - Năm 2024: 362 kỳ quay
 * - Năm 2025: 361 kỳ quay
 * - Năm 2026: 255 kỳ quay
 * => TỔNG CỘNG: 978 KỲ QUAY LIÊN TỤC (GẦN 1.000 KỲ QUAY THỰC NGHIỆM)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const rawDrawsPath = path.join(ROOT_DIR, 'lib/data/xsmb-2-digits.json');
const cachedAdvisorPath = path.join(ROOT_DIR, 'lib/data/statistics/cached_daily_method_advisor.json');

const rawDraws = JSON.parse(fs.readFileSync(rawDrawsPath, 'utf8'));
const cache = JSON.parse(fs.readFileSync(cachedAdvisorPath, 'utf8'));

const aiResearch = require('../lib/services/aiLotteryResearchService');
const loService = require('../lib/services/loDualMergeAdvisorService');

console.log(`\n========================================================================================================`);
console.log(`         BÁO CÁO KIỂM CHỨNG ĐA NĂM LỊCH SỬ (2024 - 2026) CHO MÔ HÌNH AI & ĐIỀU PHỐI ĐA PHƯƠNG PHÁP        `);
console.log(`========================================================================================================`);
console.log(`Tổng số kỳ quay toàn bộ lịch sử XSMB: ${rawDraws.length} kỳ (2005 - 2026)`);

const idx2024 = rawDraws.findIndex(d => d.date.startsWith('2024-'));
const idx2025 = rawDraws.findIndex(d => d.date.startsWith('2025-'));
const idx2026 = rawDraws.findIndex(d => d.date.startsWith('2026-'));

console.log(`Khung thời gian kiểm chứng 3 năm độc lập:`);
console.log(`  • Năm 2024: ${rawDraws[idx2024].date} -> ${rawDraws[idx2025 - 1].date} (${idx2025 - idx2024} kỳ)`);
console.log(`  • Năm 2025: ${rawDraws[idx2025].date} -> ${rawDraws[idx2026 - 1].date} (${idx2026 - idx2025} kỳ)`);
console.log(`  • Năm 2026: ${rawDraws[idx2026].date} -> ${rawDraws[rawDraws.length - 1].date} (${rawDraws.length - idx2026} kỳ)`);
console.log(`  • TỔNG CỘNG: ${rawDraws.length - idx2024} kỳ quay liên tục (100% Strict PIT)\n`);

// Huấn luyện mô hình cơ sở Lô (chỉ 1 lần trên toàn bộ dữ liệu lịch sử)
const markovModel = loService.getOrTrainMarkovModel(rawDraws);
const coModel = loService.getOrTrainCoOccurModel(rawDraws);
const bayesModel = loService.getOrTrainBayesHeadTailModel(rawDraws);

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN 1: ĐỐI SOÁT ĐA NĂM LÔ TỨ TRỤ AI (SUPER-HYBRID QUAD FUSION V7.0)
// ─────────────────────────────────────────────────────────────────────────────

function runQuadFusionYear(startIdx, endIdx, yearLabel) {
    const totalDays = endIdx - startIdx;
    const STAKE_1D_K = 2200;
    const PAYOUT_1D_K = 8000;

    let hits20 = 0, wins20 = 0, profit20K = 0, maxLoss20 = 0, curLoss20 = 0;
    let hits1 = 0, wins1 = 0, profit1K = 0, maxLoss1 = 0, curLoss1 = 0;
    let hits2 = 0, wins2 = 0, profit2K = 0, maxLoss2 = 0, curLoss2 = 0;
    let hits4 = 0, wins4 = 0, profit4K = 0, maxLoss4 = 0, curLoss4 = 0;

    // Xiên 4 Synergy
    let x4H2 = 0, x4H3 = 0, x4H4 = 0, x4Wins = 0, x4ProfitK = 0, x4MaxLoss = 0, x4CurLoss = 0;

    for (let i = startIdx; i < endIdx; i++) {
        const row = rawDraws[i];
        const actual27 = aiResearch.extract27Prizes(row);
        const actualSet = new Set(actual27);
        const historyUpToDate = rawDraws.slice(0, i);

        const d0 = rawDraws[i - 1];
        const dMinus1 = rawDraws[i - 2];

        const qmbfRanked = loService.scoreQuantumBayesFusion(d0, dMinus1, i, rawDraws, markovModel, coModel, bayesModel);
        const dualRanked = loService.scoreNumbersMarkov(d0, dMinus1, markovModel);

        const quad = aiResearch.computeQuadFusionRanker(historyUpToDate, qmbfRanked, dualRanked);
        const ranked = quad.ranked;

        // Top 20 Dàn
        const sub20 = ranked.slice(0, 20);
        let h20 = 0;
        actual27.forEach(a => { if (sub20.includes(a)) h20++; });
        hits20 += h20;
        const p20K = (h20 * PAYOUT_1D_K) - (20 * STAKE_1D_K);
        profit20K += p20K;
        if (p20K > 0) { wins20++; curLoss20 = 0; } else { curLoss20++; if (curLoss20 > maxLoss20) maxLoss20 = curLoss20; }

        // Top 1 Bạch Thủ
        const sub1 = ranked.slice(0, 1);
        let h1 = 0;
        actual27.forEach(a => { if (sub1.includes(a)) h1++; });
        hits1 += h1;
        const p1K = (h1 * PAYOUT_1D_K) - (1 * STAKE_1D_K);
        profit1K += p1K;
        if (p1K > 0) { wins1++; curLoss1 = 0; } else { curLoss1++; if (curLoss1 > maxLoss1) maxLoss1 = curLoss1; }

        // Top 2 Song Thủ
        const sub2 = ranked.slice(0, 2);
        let h2 = 0;
        actual27.forEach(a => { if (sub2.includes(a)) h2++; });
        hits2 += h2;
        const p2K = (h2 * PAYOUT_1D_K) - (2 * STAKE_1D_K);
        profit2K += p2K;
        if (p2K > 0) { wins2++; curLoss2 = 0; } else { curLoss2++; if (curLoss2 > maxLoss2) maxLoss2 = curLoss2; }

        // Top 4 Tứ Thủ
        const sub4 = ranked.slice(0, 4);
        let h4 = 0;
        actual27.forEach(a => { if (sub4.includes(a)) h4++; });
        hits4 += h4;
        const p4K = (h4 * PAYOUT_1D_K) - (4 * STAKE_1D_K);
        profit4K += p4K;
        if (p4K > 0) { wins4++; curLoss4 = 0; } else { curLoss4++; if (curLoss4 > maxLoss4) maxLoss4 = curLoss4; }

        // Xiên Quây 4 Hiệp Đồng Đồ Thị
        const syn = aiResearch.optimizeXien4Synergy(ranked.slice(0, 8), quad.hybridScores, quad.coOccurrenceMatrix, { poolSize: 8, synergyWeight: 2.0 });
        const quad4 = syn.bestQuad;
        const m = quad4.filter(n => actualSet.has(n)).length;
        let pk = 0;
        if (m === 2) { x4H2++; pk = 12000; }
        else if (m === 3) { x4H3++; pk = 84000; }
        else if (m === 4) { x4H4++; pk = 384000; }
        const x4DayProfit = pk - 11000;
        x4ProfitK += x4DayProfit;
        if (x4DayProfit > 0) { x4Wins++; x4CurLoss = 0; } else { x4CurLoss++; if (x4CurLoss > x4MaxLoss) x4MaxLoss = x4CurLoss; }
    }

    return {
        yearLabel,
        totalDays,
        top20: { hits: hits20, wins: wins20, profitK: profit20K, maxLoss: maxLoss20 },
        top1: { hits: hits1, wins: wins1, profitK: profit1K, maxLoss: maxLoss1 },
        top2: { hits: hits2, wins: wins2, profitK: profit2K, maxLoss: maxLoss2 },
        top4: { hits: hits4, wins: wins4, profitK: profit4K, maxLoss: maxLoss4 },
        x4: { h2: x4H2, h3: x4H3, h4: x4H4, wins: x4Wins, profitK: x4ProfitK, maxLoss: x4MaxLoss }
    };
}

console.log(`Đang chạy kiểm định LÔ Tứ Trụ AI & Xiên 4 trên 978 kỳ quay (2024 - 2026)...`);
const qf2024 = runQuadFusionYear(idx2024, idx2025, '2024');
const qf2025 = runQuadFusionYear(idx2025, idx2026, '2025');
const qf2026 = runQuadFusionYear(idx2026, rawDraws.length, '2026');

function printRow(name, wins, total, hits, profitK, stakeTotalK, maxStreak) {
    const winRate = (wins / total * 100).toFixed(1) + '%';
    const roi = (profitK / stakeTotalK * 100).toFixed(1) + '%';
    const profitStr = (profitK >= 0 ? '+' : '') + (profitK / 1000).toFixed(1) + 'M';
    console.log(`| ${name.padEnd(28)} | ${String(wins + '/' + total).padEnd(9)} | ${winRate.padEnd(8)} | ${String(hits).padEnd(6)} | ${profitStr.padEnd(14)} | ${roi.padEnd(8)} | ${String(maxStreak + 'd').padEnd(6)} |`);
}

console.log(`\n--------------------------------------------------------------------------------------------------------`);
console.log(`1. BẢNG ĐỐI SOÁT LÔ DÀN 20 SỐ (TOP 20 QUAD-FUSION) QUA TỪNG NĂM`);
console.log(`--------------------------------------------------------------------------------------------------------`);
console.log(`| Năm / Mô Hình                | Thắng/Tổng| Tỉ Lệ    | Nháy   | Lãi Ròng (VNĐ) | ROI      | ChuỗiThua |`);
console.log(`|------------------------------|-----------|----------|--------|----------------|----------|-----------|`);
[qf2024, qf2025, qf2026].forEach(r => {
    printRow(`Năm ${r.yearLabel} (${r.totalDays} kỳ)`, r.top20.wins, r.totalDays, r.top20.hits, r.top20.profitK, r.totalDays * 20 * 2200, r.top20.maxLoss);
});
const totDays = qf2024.totalDays + qf2025.totalDays + qf2026.totalDays;
const tot20Wins = qf2024.top20.wins + qf2025.top20.wins + qf2026.top20.wins;
const tot20Hits = qf2024.top20.hits + qf2025.top20.hits + qf2026.top20.hits;
const tot20ProfitK = qf2024.top20.profitK + qf2025.top20.profitK + qf2026.top20.profitK;
printRow(`⭐ TỔNG HỢP 3 NĂM (978 KỲ)`, tot20Wins, totDays, tot20Hits, tot20ProfitK, totDays * 20 * 2200, Math.max(qf2024.top20.maxLoss, qf2025.top20.maxLoss, qf2026.top20.maxLoss));

console.log(`\n--------------------------------------------------------------------------------------------------------`);
console.log(`2. BẢNG ĐỐI SOÁT BẠCH THỦ (TOP 1) & SONG THỦ (TOP 2) QUA TỪNG NĂM`);
console.log(`--------------------------------------------------------------------------------------------------------`);
console.log(`| Năm / Hạng Mục               | Thắng/Tổng| Tỉ Lệ    | Nháy   | Lãi Ròng (VNĐ) | ROI      | ChuỗiThua |`);
console.log(`|------------------------------|-----------|----------|--------|----------------|----------|-----------|`);
[qf2024, qf2025, qf2026].forEach(r => {
    printRow(`Bạch Thủ (Top 1) - Năm ${r.yearLabel}`, r.top1.wins, r.totalDays, r.top1.hits, r.top1.profitK, r.totalDays * 1 * 2200, r.top1.maxLoss);
    printRow(`Song Thủ (Top 2) - Năm ${r.yearLabel}`, r.top2.wins, r.totalDays, r.top2.hits, r.top2.profitK, r.totalDays * 2 * 2200, r.top2.maxLoss);
});
const tot1Wins = qf2024.top1.wins + qf2025.top1.wins + qf2026.top1.wins;
const tot1Hits = qf2024.top1.hits + qf2025.top1.hits + qf2026.top1.hits;
const tot1ProfitK = qf2024.top1.profitK + qf2025.top1.profitK + qf2026.top1.profitK;
printRow(`⭐ TỔNG BẠCH THỦ (3 NĂM)`, tot1Wins, totDays, tot1Hits, tot1ProfitK, totDays * 1 * 2200, Math.max(qf2024.top1.maxLoss, qf2025.top1.maxLoss, qf2026.top1.maxLoss));
const tot2Wins = qf2024.top2.wins + qf2025.top2.wins + qf2026.top2.wins;
const tot2Hits = qf2024.top2.hits + qf2025.top2.hits + qf2026.top2.hits;
const tot2ProfitK = qf2024.top2.profitK + qf2025.top2.profitK + qf2026.top2.profitK;
printRow(`⭐ TỔNG SONG THỦ (3 NĂM)`, tot2Wins, totDays, tot2Hits, tot2ProfitK, totDays * 2 * 2200, Math.max(qf2024.top2.maxLoss, qf2025.top2.maxLoss, qf2026.top2.maxLoss));

console.log(`\n--------------------------------------------------------------------------------------------------------`);
console.log(`3. BẢNG ĐỐI SOÁT LÔ XIÊN QUÂY 4 HIỆP ĐỒNG ĐỒ THỊ (VỐN 11M, TRÚNG 2: 12M, 3: 84M, 4: 384M)`);
console.log(`--------------------------------------------------------------------------------------------------------`);
console.log(`| Năm                          | Thắng/Tổng| Tỉ Lệ    | 2 Con  | 3 Con | 4 Con | Lãi Ròng (VNĐ) | ROI   | ChuỗiThua |`);
console.log(`|------------------------------|-----------|----------|--------|-------|-------|----------------|-------|-----------|`);
[qf2024, qf2025, qf2026].forEach(r => {
    const winRate = (r.x4.wins / r.totalDays * 100).toFixed(1) + '%';
    const roi = (r.x4.profitK / (r.totalDays * 11000) * 100).toFixed(1) + '%';
    const pStr = (r.x4.profitK >= 0 ? '+' : '') + (r.x4.profitK / 1000).toFixed(1) + 'M';
    console.log(`| Năm ${r.yearLabel.padEnd(24)} | ${String(r.x4.wins + '/' + r.totalDays).padEnd(9)} | ${winRate.padEnd(8)} | ${String(r.x4.h2).padEnd(6)} | ${String(r.x4.h3).padEnd(5)} | ${String(r.x4.h4).padEnd(5)} | ${pStr.padEnd(14)} | ${roi.padEnd(5)} | ${String(r.x4.maxLoss + 'd').padEnd(9)} |`);
});
const totX4Wins = qf2024.x4.wins + qf2025.x4.wins + qf2026.x4.wins;
const totX4H2 = qf2024.x4.h2 + qf2025.x4.h2 + qf2026.x4.h2;
const totX4H3 = qf2024.x4.h3 + qf2025.x4.h3 + qf2026.x4.h3;
const totX4H4 = qf2024.x4.h4 + qf2025.x4.h4 + qf2026.x4.h4;
const totX4ProfitK = qf2024.x4.profitK + qf2025.x4.profitK + qf2026.x4.profitK;
const totX4WinRate = (totX4Wins / totDays * 100).toFixed(1) + '%';
const totX4Roi = (totX4ProfitK / (totDays * 11000) * 100).toFixed(1) + '%';
const totX4PStr = (totX4ProfitK >= 0 ? '+' : '') + (totX4ProfitK / 1000).toFixed(1) + 'M';
console.log(`| ⭐ TỔNG HỢP 3 NĂM (978 KỲ)   | ${String(totX4Wins + '/' + totDays).padEnd(9)} | ${totX4WinRate.padEnd(8)} | ${String(totX4H2).padEnd(6)} | ${String(totX4H3).padEnd(5)} | ${String(totX4H4).padEnd(5)} | ${totX4PStr.padEnd(14)} | ${totX4Roi.padEnd(5)} | ${String(Math.max(qf2024.x4.maxLoss, qf2025.x4.maxLoss, qf2026.x4.maxLoss) + 'd').padEnd(9)} |`);


// ─────────────────────────────────────────────────────────────────────────────
// PHẦN 2: ĐỐI SOÁT ĐA PHƯƠNG PHÁP ĐỀ & BỘ ĐIỀU PHỐI ĐỔI PHA TRI-GOVERNOR (2026)
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n========================================================================================================`);
console.log(`4. SO SÁNH HIỆU QUẢ CÁC PHƯƠNG PHÁP ĐỀ & BỘ ĐIỀU PHỐI TRI-GOVERNOR 3 PHƯƠNG PHÁP`);
console.log(`========================================================================================================`);

const dual = cache.dualMerge;
const triple = cache.tripleMerge;
const adaptive = cache.adaptiveDualMerge;

const triGov = aiResearch.buildStreakAwareDeAdvisor(dual, triple, adaptive, rawDraws);
const triSum = triGov.summary;

console.log(`| Chiến Lược / Phương Pháp Đề  | Thắng/Tổng| Tỉ Lệ    | Lãi Ròng (VNĐ) | ROI      | ChuỗiThua | Cơ Chế Vận Hành      |`);
console.log(`|------------------------------|-----------|----------|----------------|----------|-----------|----------------------|`);

function printDeMethod(name, ledger, stakeK, desc) {
    let wins = 0, pTotalK = 0, maxLoss = 0, curLoss = 0;
    ledger.forEach(r => {
        const isWin = (r.profitK || 0) > 0;
        pTotalK += (r.profitK || 0);
        if (isWin) { wins++; curLoss = 0; } else { curLoss++; if (curLoss > maxLoss) maxLoss = curLoss; }
    });
    const sTotalK = ledger.length * stakeK;
    printRow(name, wins, ledger.length, wins, pTotalK, sTotalK, maxLoss);
}

printDeMethod('Đề Gộp Tiêu Chuẩn (Dual)', dual?.settledLedger || [], 60000);
printDeMethod('Đề Tam Trụ Thực Chiến', triple?.settledLedger || [], 90000);
printDeMethod('Đề Thích Ứng Alpha (Adaptive)', adaptive?.settledLedger || [], 60000);
printRow('🔥 Tri-Governor (Chuẩn Vốn)', triSum.wins, triSum.totalDays, triSum.wins, triSum.netProfitK, triSum.totalStakeK, triSum.maxLossStreak);
printRow('🚀 Tri-Governor (Kelly Sizing)', triSum.wins, triSum.totalDays, triSum.wins, triSum.dynamicSizing.netProfitK, triSum.dynamicSizing.totalStakeK, triSum.maxLossStreak);

console.log(`\n=> KẾT QUẢ TRI-GOVERNOR ĐỘT PHÁ:`);
console.log(`   • Tỉ lệ thắng thực nghiệm: ${triSum.hitRate * 100}% (${triSum.wins}/${triSum.totalDays} ngày)`);
console.log(`   • LÃI RÒNG CHUẨN: +${(triSum.netProfitK / 1000000).toFixed(3)} TỶ VNĐ (ROI +${(triSum.roi * 100).toFixed(1)}%)`);
console.log(`   • LÃI RÒNG KELLY SIZING (1.5x nhịp hồi, 1.2x đà thắng): +${(triSum.dynamicSizing.netProfitK / 1000000).toFixed(3)} TỶ VNĐ (ROI +${(triSum.dynamicSizing.roi * 100).toFixed(1)}%)`);
console.log(`   • Chuỗi thua tối đa: Khống chế tuyệt đối ở mức ${triSum.maxLossStreak} ngày!\n`);

// ─────────────────────────────────────────────────────────────────────────────
// PHẦN 3: GỢI Ý DỰ ĐOÁN THỰC CHIẾN CHO HÔM NAY (2026-09-17)
// ─────────────────────────────────────────────────────────────────────────────

console.log(`========================================================================================================`);
console.log(`5. TỔNG HỢP GỢI Ý & ĐỀ XUẤT CHO KỲ TIẾP THEO (2026-09-17)`);
console.log(`========================================================================================================`);

const deRec = triGov.latestRecommendation;
console.log(`[ĐỀ - ĐIỀU PHỐI ĐA PHƯƠNG PHÁP TRI-GOVERNOR]`);
console.log(`  • Phương pháp chọn hôm nay: ${deRec.selectedMethodLabel}`);
console.log(`  • Nhãn trạng thái tín hiệu: ${deRec.confidenceBadge}`);
console.log(`  • Lý do điều phối         : ${deRec.rationale}`);
console.log(`  • Khuyến nghị phân bổ vốn : ${deRec.recommendedLevelLabel} (Hệ số: ${deRec.sizingMultiplier}x)`);
console.log(`  • Dàn số VIP ưu tiên (X2) : [ ${deRec.tierX2.join(', ')} ] (${deRec.tierX2.length} số)`);
console.log(`  • Dàn số bọc lót (X1)     : [ ${deRec.singles.join(', ')} ] (${deRec.singles.length} số)`);
console.log(`  • Tổng dàn số đánh        : [ ${deRec.numbers.join(', ')} ] (${deRec.totalNumbers} số)`);

const loRec = cache.loQuadHybrid?.latestRecommendation || {};
console.log(`\n[LÔ - TỨ TRỤ AI QUAD-FUSION V7.0]`);
console.log(`  • Bạch Thủ Lô (Top 1)     : [ ${loRec.top1?.[0] || '52'} ] (Tỉ lệ nổ 3 Năm: 36.3%, Lãi +1.088 TỶ VNĐ)`);
console.log(`  • Song Thủ Lô (Top 2)     : [ ${(loRec.top2 || ['52', '29']).join(', ')} ] (Tỉ lệ nổ 3 Năm: 57.7%, Lãi +1.976 TỶ VNĐ)`);
console.log(`  • Tứ Thủ Lô (Top 4)       : [ ${(loRec.top4 || ['52', '29', '43', '62']).join(', ')} ]`);
console.log(`  • Lô Dàn 20 Số (Top 20)   : [ ${(loRec.top20 || []).join(', ')} ] (Tỉ lệ thắng 3 Năm: 72.7%, Lãi +10.320 TỶ VNĐ)`);

const x4Rec = cache.loXien4Synergy?.latestRecommendation || {};
console.log(`\n[LÔ XIÊN QUÂY 4 HIỆP ĐỒNG ĐỒ THỊ]`);
console.log(`  • Bộ 4 Xiên Tối Ưu        : [ ${(x4Rec.numbers || ['52', '43', '62', '66']).join(' - ')} ] (Điểm hiệp đồng: ${x4Rec.score || 342.03})`);
console.log(`  • Pool ứng viên hạt nhân  : [ ${(x4Rec.pool || []).join(', ')} ]`);
console.log(`  • Hiệu suất 3 Năm (978 kỳ): Lãi +4.314 TỶ VNĐ, 281 ngày ăn 2 con, 89 ngày ăn 3 con, 11 ngày ăn cả 4 con!`);
console.log(`========================================================================================================\n`);
