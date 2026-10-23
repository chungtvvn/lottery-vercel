'use strict';

const fs = require('fs');
const path = require('path');

const cachePath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
if (!fs.existsSync(cachePath)) {
    console.error('Cache file not found:', cachePath);
    process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const { buildMetaCrossMethodStrategy } = require('../lib/services/loDualMergeAdvisorService');
const meta = buildMetaCrossMethodStrategy(cache);

const settledLedger = meta.settledLedger || [];
console.log(`Loaded ${settledLedger.length} settled draws for 2026 Strict PIT.`);

// Economic Constants for 1 Xiên 4 cluster (Quây 11 vé)
const STAKE_PER_CLUSTER_K = 11000; // 11M VNĐ
const PAYOUT_MAP = {
    4: 384000, // Ăn cả 1 vé X4 + 4 vé X3 + 6 vé X2 = 384M
    3: 84000,  // Ăn 1 vé X3 + 3 vé X2 = 84M
    2: 12000,  // Ăn 1 vé X2 = 12M
    1: 0,
    0: 0
};

// Pure Single Ticket Xiên 4 (1 vé 1M, ăn 320M)
const PURE_X4_STAKE_K = 1000;
const PURE_X4_PAYOUT_K = 320000;

function isHeadEven(numStr) {
    const s = String(numStr).padStart(2, '0');
    const head = parseInt(s[0], 10);
    return head % 2 === 0;
}

function isHeadOdd(numStr) {
    return !isHeadEven(numStr);
}

/**
 * Pairing algorithm for Top 8 into 2 Xiên 4 sets:
 * Requirement:
 * - Trong 4 số đầu phải có đầu chẵn và đầu lẻ.
 * - Nếu 3 số đầu là chẵn mà số thứ 4 vẫn là chẵn: lấy lần lượt số thứ 5,6,7,8 là lẻ thì thôi ghép vào dàn 1.
 * - Ngược lại nếu 3 số đầu là lẻ mà số thứ 4 vẫn là lẻ: tìm số chẵn tiếp theo trong 5,6,7,8 để ghép vào dàn 1.
 * - Các số còn lại thành dàn xiên 4 thứ 2.
 */
function pairTop8WithParity(top8) {
    if (!Array.isArray(top8) || top8.length < 8) {
        throw new Error(`Invalid top8 array: ${JSON.stringify(top8)}`);
    }

    const n = top8.slice(0, 8);
    const p = n.map(isHeadEven); // true = Even, false = Odd

    // Check first 3 numbers
    const first3AllEven = p[0] && p[1] && p[2];
    const first3AllOdd = !p[0] && !p[1] && !p[2];

    let xien1 = [];
    let xien2 = [];
    let swapped = false;
    let swapDetails = null;

    if (first3AllEven && p[3]) {
        // 4 numbers are all Even! Find first Odd in 5,6,7,8 (indices 4,5,6,7)
        let swapIdx = -1;
        for (let i = 4; i < 8; i++) {
            if (!p[i]) { // Found Odd
                swapIdx = i;
                break;
            }
        }

        if (swapIdx !== -1) {
            swapped = true;
            swapDetails = {
                type: 'ALL_EVEN_SWAP',
                originalN4: n[3],
                promotedNum: n[swapIdx],
                fromRank: swapIdx + 1
            };
            xien1 = [n[0], n[1], n[2], n[swapIdx]];
            const remaining = [n[3]];
            for (let i = 4; i < 8; i++) {
                if (i !== swapIdx) remaining.push(n[i]);
            }
            xien2 = remaining;
        } else {
            // All 8 are even (extremely rare)
            xien1 = n.slice(0, 4);
            xien2 = n.slice(4, 8);
        }
    } else if (first3AllOdd && !p[3]) {
        // 4 numbers are all Odd! Find first Even in 5,6,7,8 (indices 4,5,6,7)
        let swapIdx = -1;
        for (let i = 4; i < 8; i++) {
            if (p[i]) { // Found Even
                swapIdx = i;
                break;
            }
        }

        if (swapIdx !== -1) {
            swapped = true;
            swapDetails = {
                type: 'ALL_ODD_SWAP',
                originalN4: n[3],
                promotedNum: n[swapIdx],
                fromRank: swapIdx + 1
            };
            xien1 = [n[0], n[1], n[2], n[swapIdx]];
            const remaining = [n[3]];
            for (let i = 4; i < 8; i++) {
                if (i !== swapIdx) remaining.push(n[i]);
            }
            xien2 = remaining;
        } else {
            // All 8 are odd
            xien1 = n.slice(0, 4);
            xien2 = n.slice(4, 8);
        }
    } else {
        // Already contains both even and odd heads!
        xien1 = n.slice(0, 4);
        xien2 = n.slice(4, 8);
    }

    return { xien1, xien2, swapped, swapDetails };
}

/**
 * Baseline: Raw Top 1-4 and Top 5-8 without parity swap
 */
function pairTop8Baseline(top8) {
    return {
        xien1: top8.slice(0, 4),
        xien2: top8.slice(4, 8)
    };
}

function evaluateCluster(cluster, actSet) {
    const hits = cluster.filter(num => actSet.has(String(num).padStart(2, '0'))).length;
    const payoutK = PAYOUT_MAP[hits] || 0;
    const profitK = payoutK - STAKE_PER_CLUSTER_K;
    const isWin = profitK > 0;
    return {
        numbers: cluster,
        hits,
        payoutK,
        profitK,
        isWin,
        isH4: hits === 4,
        isH3: hits === 3,
        isH2: hits === 2
    };
}

// Run simulation
const dailyResults = [];
let totalSwappedDays = 0;

settledLedger.forEach(row => {
    const date = row.date;
    const top8 = row.methods?.top8?.betNumbers || [];
    const actual27 = row.actual27 || [];
    const actSet = new Set(actual27.map(n => String(n).padStart(2, '0')));

    const paired = pairTop8WithParity(top8);
    const baseline = pairTop8Baseline(top8);

    if (paired.swapped) totalSwappedDays++;

    // Evaluate Proposed Parity Pair
    const res1 = evaluateCluster(paired.xien1, actSet);
    const res2 = evaluateCluster(paired.xien2, actSet);

    const dayStakeK = STAKE_PER_CLUSTER_K * 2;
    const dayPayoutK = res1.payoutK + res2.payoutK;
    const dayProfitK = dayPayoutK - dayStakeK;
    const dayIsWin = dayProfitK > 0;

    // Evaluate Baseline Pair
    const baseRes1 = evaluateCluster(baseline.xien1, actSet);
    const baseRes2 = evaluateCluster(baseline.xien2, actSet);
    const baseStakeK = STAKE_PER_CLUSTER_K * 2;
    const basePayoutK = baseRes1.payoutK + baseRes2.payoutK;
    const baseProfitK = basePayoutK - baseStakeK;
    const baseIsWin = baseProfitK > 0;

    dailyResults.push({
        date,
        top8,
        swapped: paired.swapped,
        swapDetails: paired.swapDetails,
        proposed: {
            x1: res1,
            x2: res2,
            dayStakeK,
            dayPayoutK,
            dayProfitK,
            dayIsWin,
            h4Total: (res1.isH4 ? 1 : 0) + (res2.isH4 ? 1 : 0),
            h3Total: (res1.isH3 ? 1 : 0) + (res2.isH3 ? 1 : 0),
            h2Total: (res1.isH2 ? 1 : 0) + (res2.isH2 ? 1 : 0)
        },
        baseline: {
            x1: baseRes1,
            x2: baseRes2,
            dayStakeK: baseStakeK,
            dayPayoutK: basePayoutK,
            dayProfitK: baseProfitK,
            dayIsWin: baseIsWin,
            h4Total: (baseRes1.isH4 ? 1 : 0) + (baseRes2.isH4 ? 1 : 0),
            h3Total: (baseRes1.isH3 ? 1 : 0) + (baseRes2.isH3 ? 1 : 0),
            h2Total: (baseRes1.isH2 ? 1 : 0) + (baseRes2.isH2 ? 1 : 0)
        }
    });
});

console.log(`\n================================================================================`);
console.log(`📊 XSMB 2026 WALK-FORWARD BACKTEST: 2 DÀN XIÊN 4 TỪ TOP 8 ĐỀ XUẤT TINH HOA`);
console.log(`================================================================================`);
console.log(`Tổng số kỳ quay phân tích: ${dailyResults.length} ngày (01/01/2026 - 22/10/2026)`);
console.log(`Số ngày kích hoạt điều kiện hoán đổi chẵn lẻ: ${totalSwappedDays} ngày (${((totalSwappedDays / dailyResults.length) * 100).toFixed(1)}%)`);
console.log(`Quy tắc kinh tế: Vốn 11.000K/dàn (22.000K/ngày). Ăn 4/4 = 384M, Ăn 3/4 = 84M, Ăn 2/4 = 12M.`);

// Group by month
const monthlyMap = new Map();
dailyResults.forEach(r => {
    const m = r.date.slice(0, 7);
    if (!monthlyMap.has(m)) {
        monthlyMap.set(m, []);
    }
    monthlyMap.get(m).push(r);
});

console.log(`\n--------------------------------------------------------------------------------`);
console.log(`📅 BẢNG TỔNG HỢP THEO TỪNG THÁNG NĂM 2026 (PHƯƠNG ÁN ĐỀ XUẤT CỦA BẠN)`);
console.log(`--------------------------------------------------------------------------------`);

function calcStats(list, key = 'proposed') {
    let draws = list.length;
    let stake = 0, payout = 0, profit = 0;
    let winDays = 0;
    let h4Count = 0, h3Count = 0, h2Count = 0;
    let x1H4 = 0, x1H3 = 0, x1H2 = 0;
    let x2H4 = 0, x2H3 = 0, x2H2 = 0;

    let maxLossStreak = 0;
    let currentLossStreak = 0;

    list.forEach(item => {
        const d = item[key];
        stake += d.dayStakeK;
        payout += d.dayPayoutK;
        profit += d.dayProfitK;

        if (d.dayIsWin) {
            winDays++;
            currentLossStreak = 0;
        } else {
            currentLossStreak++;
            if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
        }

        h4Count += d.h4Total;
        h3Count += d.h3Total;
        h2Count += d.h2Total;

        if (d.x1.isH4) x1H4++;
        if (d.x1.isH3) x1H3++;
        if (d.x1.isH2) x1H2++;

        if (d.x2.isH4) x2H4++;
        if (d.x2.isH3) x2H3++;
        if (d.x2.isH2) x2H2++;
    });

    const winRate = draws ? (winDays / draws) * 100 : 0;
    const roi = stake ? (profit / stake) * 100 : 0;

    return {
        draws,
        stake,
        payout,
        profit,
        winDays,
        winRate,
        roi,
        h4Count,
        h3Count,
        h2Count,
        x1H4,
        x1H3,
        x1H2,
        x2H4,
        x2H3,
        x2H2,
        maxLossStreak
    };
}

console.log(`Tháng     | Số kỳ | Nổ X4 | Nổ X3 | Nổ X2 | Ngày Lãi | Tỷ lệ Lãi | Vốn Cược (K) | Tiền Ăn (K)  | Lãi Ròng (K)  | ROI (%)`);
console.log(`----------+-------+-------+-------+-------+----------+-----------+--------------+--------------+---------------+--------`);

const monthlySummaries = [];
for (const [month, list] of monthlyMap.entries()) {
    const s = calcStats(list, 'proposed');
    monthlySummaries.push({ month, ...s });
    const profitSign = s.profit >= 0 ? '+' : '';
    const roiSign = s.roi >= 0 ? '+' : '';
    console.log(
        `${month}   |  ${String(s.draws).padStart(2)}   |   ${String(s.h4Count).padStart(2)}  |   ${String(s.h3Count).padStart(2)}  |   ${String(s.h2Count).padStart(2)}  |    ${String(s.winDays).padStart(2)}    |   ${s.winRate.toFixed(1).padStart(4)}%   | ${String(s.stake).padStart(12)} | ${String(s.payout).padStart(12)} | ${profitSign + String(s.profit).padStart(12)} | ${roiSign + s.roi.toFixed(1).padStart(5)}%`
    );
}

const overallProposed = calcStats(dailyResults, 'proposed');
const overallBaseline = calcStats(dailyResults, 'baseline');

console.log(`----------+-------+-------+-------+-------+----------+-----------+--------------+--------------+---------------+--------`);
console.log(
    `TỔNG 2026 |  ${String(overallProposed.draws).padStart(2)}  |   ${String(overallProposed.h4Count).padStart(2)}  |   ${String(overallProposed.h3Count).padStart(2)}  |   ${String(overallProposed.h2Count).padStart(2)}  |   ${String(overallProposed.winDays).padStart(3)}    |   ${overallProposed.winRate.toFixed(1).padStart(4)}%   | ${String(overallProposed.stake).padStart(12)} | ${String(overallProposed.payout).padStart(12)} | +${String(overallProposed.profit).padStart(12)} | +${overallProposed.roi.toFixed(1).padStart(5)}%`
);

console.log(`\n================================================================================`);
console.log(`🔍 SO SÁNH ĐỐI CHỨNG: THUẬT TOÁN ĐẦU CHẴN/LẺ VS CỤM CỐ ĐỊNH GỐC (BASELINE)`);
console.log(`================================================================================`);
console.log(`Chỉ số                         | Phương Án Đề Xuất (Parity Swap) | Phương Án Gốc (Baseline) | Chênh Lệch (Delta)`);
console.log(`-------------------------------+---------------------------------+--------------------------+-------------------`);
console.log(`Số ngày cược                   | ${overallProposed.draws} ngày                         | ${overallBaseline.draws} ngày                  | 0`);
console.log(`Số vé trúng Xiên 4 (4/4 con)   | ${overallProposed.h4Count} vé                          | ${overallBaseline.h4Count} vé                   | ${overallProposed.h4Count - overallBaseline.h4Count >= 0 ? '+' : ''}${overallProposed.h4Count - overallBaseline.h4Count} vé`);
console.log(`Số vé trúng Xiên 3 (3/4 con)   | ${overallProposed.h3Count} vé                         | ${overallBaseline.h3Count} vé                  | ${overallProposed.h3Count - overallBaseline.h3Count >= 0 ? '+' : ''}${overallProposed.h3Count - overallBaseline.h3Count} vé`);
console.log(`Số vé trúng Xiên 2 (2/4 con)   | ${overallProposed.h2Count} vé                        | ${overallBaseline.h2Count} vé                 | ${overallProposed.h2Count - overallBaseline.h2Count >= 0 ? '+' : ''}${overallProposed.h2Count - overallBaseline.h2Count} vé`);
console.log(`Số ngày có lãi ròng (>0)       | ${overallProposed.winDays} ngày (${overallProposed.winRate.toFixed(1)}%)             | ${overallBaseline.winDays} ngày (${overallBaseline.winRate.toFixed(1)}%)      | ${overallProposed.winDays - overallBaseline.winDays >= 0 ? '+' : ''}${overallProposed.winDays - overallBaseline.winDays} ngày`);
console.log(`Tổng vốn đầu tư                | ${(overallProposed.stake / 1000).toFixed(1)}M VNĐ                   | ${(overallBaseline.stake / 1000).toFixed(1)}M VNĐ            | 0M`);
console.log(`Tổng tiền trúng thưởng         | ${(overallProposed.payout / 1000).toFixed(1)}M VNĐ                  | ${(overallBaseline.payout / 1000).toFixed(1)}M VNĐ           | ${((overallProposed.payout - overallBaseline.payout) / 1000).toFixed(1)}M VNĐ`);
console.log(`Lợi nhuận ròng (Net Profit)    | +${(overallProposed.profit / 1000).toFixed(1)}M VNĐ                 | +${(overallBaseline.profit / 1000).toFixed(1)}M VNĐ          | ${((overallProposed.profit - overallBaseline.profit) / 1000 >= 0 ? '+' : '')}${((overallProposed.profit - overallBaseline.profit) / 1000).toFixed(1)}M VNĐ`);
console.log(`Tỷ suất sinh lời (ROI)         | +${overallProposed.roi.toFixed(2)}%                         | +${overallBaseline.roi.toFixed(2)}%                  | ${(overallProposed.roi - overallBaseline.roi >= 0 ? '+' : '')}${(overallProposed.roi - overallBaseline.roi).toFixed(2)}%`);
console.log(`Chuỗi ngày lỗ dài nhất         | ${overallProposed.maxLossStreak} ngày                         | ${overallBaseline.maxLossStreak} ngày                  | ${overallProposed.maxLossStreak - overallBaseline.maxLossStreak} ngày`);

console.log(`\n--------------------------------------------------------------------------------`);
console.log(`📌 PHÂN RÃ CHI TIẾT HIỆU QUẢ THEO TỪNG DÀN (DÀN 1 VS DÀN 2)`);
console.log(`--------------------------------------------------------------------------------`);
console.log(`Dàn 1 (Ưu tiên Top 1-4 + Cân Bằng Chẵn Lẻ):`);
console.log(`  • Xiên 4: ${overallProposed.x1H4} lần | Xiên 3: ${overallProposed.x1H3} lần | Xiên 2: ${overallProposed.x1H2} lần`);
console.log(`Dàn 2 (Các số còn lại trong Top 8):`);
console.log(`  • Xiên 4: ${overallProposed.x2H4} lần | Xiên 3: ${overallProposed.x2H3} lần | Xiên 2: ${overallProposed.x2H2} lần`);
console.log(`================================================================================\n`);
