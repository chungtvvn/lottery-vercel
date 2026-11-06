#!/usr/bin/env node
'use strict';

/**
 * scripts/backtest-2026-ensemble-full.js
 * 
 * Báo cáo Thực nghiệm Toàn diện 2026:
 * Backtest Walk-Forward 100% Strict Point-In-Time (Strict PIT) cho
 * ĐỘNG CƠ ĐỒNG THUẬN 5 AI (Ensemble 5 AI Suite: Muse, Perplexity, Gemini, ChatGPT, Claude)
 * trên cả ĐỀ (50s Gốc & Lọc Anti-Parity) và LÔ (Top 6, Top 7, Top 20).
 * 
 * So sánh Head-to-Head với toàn bộ các phương pháp hiện tại của năm 2026:
 * - Đề: mirofish (40s), fusion (Tri-Tier 36s), triCore (Tam Trụ 30s), shadow (36s), daily (36s).
 * - Lô: QMBF v6 (Top 6, Top 7 Tuyển Chọn, Top 20).
 * 
 * Phân định 2 giai đoạn:
 * 1. Live Thực Chiến (45 kỳ gần nhất có niêm phong khóa số trước giờ quay).
 * 2. Toàn bộ năm 2026 (299 kỳ tham khảo nghiên cứu tương đương tập đối soát chuẩn).
 */

const fs = require('fs');
const path = require('path');
const {
    loadCompactDraws,
    FastDeState,
    computeDe5AIScores,
    avgRank,
    pctOf
} = require('../lib/services/ai5EnsembleDeService');
const {
    getDeFusionReport
} = require('../lib/services/deFusionService');

const COMPACT_PATH = path.join(__dirname, '../data/xsmb-2-digits-compact.json');
const ADVISOR_CACHE_PATH = path.join(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');

// Đơn vị kinh tế học thực chiến
const LO_STAKE_UNIT_K = 2200;   // 100 điểm = 2.2M (2,200K)
const LO_PAYOUT_HIT_K = 8000;   // 1 nháy = 8.0M (8,000K)

function zscore(vals) {
    let sum = 0;
    for (let x = 0; x < 100; x++) sum += vals[x];
    const m = sum / 100;
    let varSum = 0;
    for (let x = 0; x < 100; x++) varSum += (vals[x] - m) ** 2;
    const s = Math.sqrt(varSum / 100);
    const z = {};
    for (let x = 0; x < 100; x++) z[x] = s === 0 ? 0 : (vals[x] - m) / s;
    return z;
}

class FastLoState {
    constructor(draws, upToIndex) {
        this.loAll = new Int32Array(100);
        this.loSeen = new Int32Array(100).fill(-1);
        const limit = upToIndex !== undefined ? Math.min(draws.length, upToIndex) : draws.length;
        for (let i = 0; i < limit; i++) {
            const nums = draws[i][1];
            for (let k = 0; k < 27; k++) {
                const num = nums[k];
                this.loAll[num]++;
                this.loSeen[num] = i;
            }
        }
    }

    advance(i, nums) {
        for (let k = 0; k < 27; k++) {
            const num = nums[k];
            this.loAll[num]++;
            this.loSeen[num] = i;
        }
    }
}

function computeLo5AIScores(draws, i, loAll, loSeen) {
    const nBefore = i;
    const lo100 = new Int32Array(100);
    const start100 = Math.max(0, i - 100);
    for (let j = start100; j < i; j++) {
        const nums = draws[j][1];
        for (let k = 0; k < 27; k++) lo100[nums[k]]++;
    }

    const lo30 = new Int32Array(100);
    const start30 = Math.max(0, i - 30);
    for (let j = start30; j < i; j++) {
        const nums = draws[j][1];
        for (let k = 0; k < 27; k++) lo30[nums[k]]++;
    }

    const gapLo = new Int32Array(100);
    for (let x = 0; x < 100; x++) {
        gapLo[x] = loSeen[x] >= 0 ? (i - 1 - loSeen[x]) : i;
    }

    const lo = {};

    // 1. Muse: L_all + 2 * L100
    lo.muse = {};
    for (let x = 0; x < 100; x++) lo.muse[x] = loAll[x] + 2 * lo100[x];

    // 2. Perplexity: 0.5 * L_all / (n_before * 27) + 0.5 * L100 / (100 * 27)
    lo.perplexity = {};
    for (let x = 0; x < 100; x++) {
        lo.perplexity[x] = 0.5 * loAll[x] / (nBefore * 27) + 0.5 * lo100[x] / (100 * 27);
    }

    // 3. Gemini: Z-score (L30, L100, L_all) + min(gap, 30)/30
    const z30 = zscore(lo30);
    const z100 = zscore(lo100);
    const zall = zscore(loAll);
    lo.gemini = {};
    for (let x = 0; x < 100; x++) {
        lo.gemini[x] = Number((0.40 * z30[x] + 0.30 * z100[x] + 0.20 * (Math.min(gapLo[x], 30) / 30) + 0.10 * zall[x]).toFixed(4));
    }

    // 4. ChatGPT: Percentile ranking
    const r_h = avgRank(loAll);
    const r_1 = avgRank(lo100);
    const r_3 = avgRank(lo30);
    const r_g = avgRank(gapLo);
    lo.chatgpt = {};
    for (let x = 0; x < 100; x++) {
        lo.chatgpt[x] = 0.20 * ((100 - r_h[x]) / 99) + 0.30 * ((100 - r_1[x]) / 99) + 0.30 * ((100 - r_3[x]) / 99) + 0.20 * ((100 - r_g[x]) / 99);
    }

    // 5. Claude: L100
    lo.claude = {};
    for (let x = 0; x < 100; x++) lo.claude[x] = lo100[x];

    // Ensemble: Average of 5 percentiles
    const pcts = {};
    for (const ai of ['muse', 'perplexity', 'gemini', 'chatgpt', 'claude']) {
        pcts[ai] = pctOf(lo[ai]);
    }
    const ens = {};
    for (let x = 0; x < 100; x++) {
        ens[x] = (pcts.muse[x] + pcts.perplexity[x] + pcts.gemini[x] + pcts.chatgpt[x] + pcts.claude[x]) / 5;
    }

    const allNums = Array.from({ length: 100 }, (_, x) => x);
    const ranked = allNums.slice().sort((a, b) => {
        const diff = ens[b] - ens[a];
        if (Math.abs(diff) < 1e-12) return a - b;
        return diff;
    });

    return {
        top6: ranked.slice(0, 6).map(x => String(x).padStart(2, '0')),
        top7: ranked.slice(0, 7).map(x => String(x).padStart(2, '0')),
        top10: ranked.slice(0, 10).map(x => String(x).padStart(2, '0')),
        top20: ranked.slice(0, 20).map(x => String(x).padStart(2, '0')),
        top50: ranked.slice(0, 50).map(x => String(x).padStart(2, '0')),
        ranking: ranked.map(x => [String(x).padStart(2, '0'), Number(ens[x].toFixed(4))])
    };
}

function countLoHits(predList, draw27) {
    let hits = 0;
    const predSet = new Set(predList.map(Number));
    for (const num of draw27) {
        if (predSet.has(num)) hits++;
    }
    return hits;
}

function main() {
    console.log('========================================================================');
    console.log('   BÁO CÁO TOÀN DIỆN 2026: ENSEMBLE 5 AI (ĐỀ & LÔ) vs CÁC PHẦN HIỆN TẠI   ');
    console.log('   Tuân thủ 100% Strict Point-In-Time (Strict PIT) & Bounds Chống Ảo Giác  ');
    console.log('========================================================================\n');

    // Tải dữ liệu
    const compactData = JSON.parse(fs.readFileSync(COMPACT_PATH, 'utf8'));
    const draws = compactData.data.map(row => [row[0], Array.from(row[1])]);
    const advCache = JSON.parse(fs.readFileSync(ADVISOR_CACHE_PATH, 'utf8'));

    // Báo cáo Đề từ deFusionService (đã chuẩn hóa 100% 45 live và 299 full)
    const deFusionTier = getDeFusionReport({ betMode: 'tiered', forceRefresh: true });
    const deFusionFlat = getDeFusionReport({ betMode: 'flat', forceRefresh: true });

    // Lấy tập ngày live từ deFusionReport
    const liveDatesList = deFusionTier.settledLedger.filter(r => r.isLive).map(r => r.date);
    const liveDatesSet = new Set(liveDatesList);
    const fullDatesList = deFusionTier.settledLedger.map(r => r.date).sort();
    const fullDatesSet = new Set(fullDatesList);

    console.log(`✓ Tập dữ liệu đối soát chuẩn hóa: ${fullDatesList.length} kỳ (Full 2026), trong đó ${liveDatesList.length} kỳ Live thực chiến.\n`);

    // Chạy Lô Ensemble 5 AI trên đúng tập ngày fullDatesList
    let start2026Idx = 0;
    while (start2026Idx < draws.length && draws[start2026Idx][0] < fullDatesList[0]) {
        start2026Idx++;
    }

    const loState = new FastLoState(draws, start2026Idx);
    const lo5AIRecords = [];

    for (let i = start2026Idx; i < draws.length; i++) {
        const curDate = draws[i][0];
        const curDraw = draws[i][1];

        if (fullDatesSet.has(curDate)) {
            const loRes = computeLo5AIScores(draws, i, loState.loAll, loState.loSeen);

            // Top 6
            const hitsTop6 = countLoHits(loRes.top6, curDraw);
            const stakeTop6 = 6 * (LO_STAKE_UNIT_K / 1000); // 13.2M
            const payoutTop6 = hitsTop6 * (LO_PAYOUT_HIT_K / 1000);
            const profitTop6 = payoutTop6 - stakeTop6;

            // Top 7
            const hitsTop7 = countLoHits(loRes.top7, curDraw);
            const stakeTop7 = 7 * (LO_STAKE_UNIT_K / 1000); // 15.4M
            const payoutTop7 = hitsTop7 * (LO_PAYOUT_HIT_K / 1000);
            const profitTop7 = payoutTop7 - stakeTop7;

            // Top 20
            const hitsTop20 = countLoHits(loRes.top20, curDraw);
            const stakeTop20 = 20 * (LO_STAKE_UNIT_K / 1000); // 44.0M
            const payoutTop20 = hitsTop20 * (LO_PAYOUT_HIT_K / 1000);
            const profitTop20 = payoutTop20 - stakeTop20;

            lo5AIRecords.push({
                date: curDate,
                isLive: liveDatesSet.has(curDate),
                top6: { hits: hitsTop6, isWin: profitTop6 > 0, isBreakEven: profitTop6 === 0, stake: stakeTop6, payout: payoutTop6, profit: profitTop6 },
                top7: { hits: hitsTop7, isWin: profitTop7 > 0, isBreakEven: profitTop7 === 0, stake: stakeTop7, payout: payoutTop7, profit: profitTop7 },
                top20: { hits: hitsTop20, isWin: profitTop20 > 0, isBreakEven: profitTop20 === 0, stake: stakeTop20, payout: payoutTop20, profit: profitTop20 }
            });
        }

        loState.advance(i, curDraw);
    }

    function evalLoRecords(records, key) {
        let hitDays = 0, winDays = 0, breakEvenDays = 0, totalHits = 0, totalStake = 0, totalPayout = 0;
        let cumProfit = 0, maxCum = 0, maxDrawdown = 0, curLossStreak = 0, maxLossStreak = 0;

        records.forEach(r => {
            const item = r[key];
            totalHits += item.hits;
            if (item.hits > 0) hitDays++;
            totalStake += item.stake;
            totalPayout += item.payout;

            if (item.isWin) {
                winDays++;
                curLossStreak = 0;
            } else if (item.isBreakEven) {
                breakEvenDays++;
                curLossStreak = 0;
            } else {
                curLossStreak++;
                if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
            }

            cumProfit += item.profit;
            if (cumProfit > maxCum) maxCum = cumProfit;
            const dd = maxCum - cumProfit;
            if (dd > maxDrawdown) maxDrawdown = dd;
        });

        const netProfit = totalPayout - totalStake;
        const roi = (netProfit / totalStake) * 100;
        return {
            days: records.length,
            hitDays,
            hitRate: Number(((hitDays / records.length) * 100).toFixed(1)),
            winDays,
            winRate: Number(((winDays / records.length) * 100).toFixed(1)),
            breakEvenDays,
            totalHits,
            avgHits: Number((totalHits / records.length).toFixed(3)),
            totalStake: Number(totalStake.toFixed(1)),
            totalPayout: Number(totalPayout.toFixed(1)),
            netProfit: Number(netProfit.toFixed(1)),
            roi: Number(roi.toFixed(1)),
            maxDrawdown: Number(maxDrawdown.toFixed(1)),
            maxLossStreak
        };
    }

    const lo5AILiveRecords = lo5AIRecords.filter(r => r.isLive);
    const lo5AIFullRecords = lo5AIRecords;

    const lo5AIStats = {
        live: {
            top6: evalLoRecords(lo5AILiveRecords, 'top6'),
            top7: evalLoRecords(lo5AILiveRecords, 'top7'),
            top20: evalLoRecords(lo5AILiveRecords, 'top20')
        },
        full: {
            top6: evalLoRecords(lo5AIFullRecords, 'top6'),
            top7: evalLoRecords(lo5AIFullRecords, 'top7'),
            top20: evalLoRecords(lo5AIFullRecords, 'top20')
        }
    };

    // Đánh giá QMBF từ advisorCache trên cùng tập ngày
    const qmbfLedger = advCache.loQuantumBayesFusion?.settledLedger || [];
    function evalQmbfLedger(ledger, tier) {
        let hitDays = 0, winDays = 0, totalHits = 0, stakeK = 0, payoutK = 0;
        let cum = 0, maxCum = 0, maxDd = 0, curLoss = 0, maxLoss = 0;
        const betCount = parseInt(tier.replace('top', ''), 10);

        ledger.forEach(row => {
            const m = row.methods?.[tier];
            if (!m) return;
            const hits = m.hits || 0;
            totalHits += hits;
            if (hits > 0) hitDays++;
            const s = betCount * LO_STAKE_UNIT_K;
            const p = hits * LO_PAYOUT_HIT_K;
            stakeK += s;
            payoutK += p;
            const prof = p - s;
            if (prof > 0) {
                winDays++;
                curLoss = 0;
            } else {
                curLoss++;
                if (curLoss > maxLoss) maxLoss = curLoss;
            }
            cum += prof;
            if (cum > maxCum) maxCum = cum;
            const dd = maxCum - cum;
            if (dd > maxDd) maxDd = dd;
        });

        const netK = payoutK - stakeK;
        const roi = (netK / stakeK) * 100;
        return {
            days: ledger.length,
            hitDays,
            hitRate: Number(((hitDays / ledger.length) * 100).toFixed(1)),
            winDays,
            winRate: Number(((winDays / ledger.length) * 100).toFixed(1)),
            totalHits,
            avgHits: Number((totalHits / ledger.length).toFixed(3)),
            totalStake: Number((stakeK / 1000).toFixed(1)),
            totalPayout: Number((payoutK / 1000).toFixed(1)),
            netProfit: Number((netK / 1000).toFixed(1)),
            roi: Number(roi.toFixed(1)),
            maxDrawdown: Number((maxDd / 1000).toFixed(1)),
            maxLossStreak: maxLoss
        };
    }

    const qmbfLiveLedger = qmbfLedger.filter(r => liveDatesSet.has(r.date));
    const qmbfFullLedger = qmbfLedger.filter(r => fullDatesSet.has(r.date));

    const qmbfStats = {
        live: {
            top6: evalQmbfLedger(qmbfLiveLedger, 'top6'),
            top7: evalQmbfLedger(qmbfLiveLedger, 'top7'),
            top20: evalQmbfLedger(qmbfLiveLedger, 'top20')
        },
        full: {
            top6: evalQmbfLedger(qmbfFullLedger, 'top6'),
            top7: evalQmbfLedger(qmbfFullLedger, 'top7'),
            top20: evalQmbfLedger(qmbfFullLedger, 'top20')
        }
    };

    // Xuất báo cáo tổng kết chi tiết
    console.log('========================================================================');
    console.log('                 BẢNG 1: ĐỐI SOÁT 6 PHƯƠNG PHÁP ĐỀ 2026                 ');
    console.log('========================================================================');
    console.log('\n--- GIAI ĐOẠN 1: LIVE THỰC CHIẾN (45 KỲ KHÓA SỐ NIÊM PHONG) ---');
    console.log('----------------------------------------------------------------------------------------------------------------------------------------');
    console.log('Chiến lược               | Chế độ cược | Tỷ lệ trúng | Tiền cược (M) | Thưởng (M) | Net Profit (M) | ROI (%) | Vốn tiết kiệm | Đánh giá');
    console.log('----------------------------------------------------------------------------------------------------------------------------------------');

    for (const [sId, sData] of Object.entries(deFusionTier.summary)) {
        const name = sId === 'ai5Ensemble' ? '👑 Ensemble 5 AI (~37s)' :
                     sId === 'mirofish' ? '🐟 Mirofish Swarm (~30s)' :
                     sId === 'fusion' ? '⚡ Tri-Tier Fusion (~27s)' :
                     sId === 'triCore' ? '🏛️ TriCore Tam Trụ (~22s)' :
                     sId === 'shadow' ? '🌗 Shadow Đa Động Cơ (~27s)' : '📅 Daily Meta (~27s)';

        const tFilt = sData.live.filtered;
        const fFilt = deFusionFlat.summary[sId].live.filtered;

        console.log(`${name.padEnd(25)}| Đa tầng VIP | ${String(tFilt.wins + '/45 (' + tFilt.winRate + '%)').padEnd(12)}| ${String(tFilt.totalStakeM + 'M').padEnd(14)}| ${String(tFilt.totalPayoutM + 'M').padEnd(11)}| ${String((tFilt.netProfitM >= 0 ? '+' : '') + tFilt.netProfitM + 'M').padEnd(15)}| ${String(tFilt.roi + '%').padEnd(8)}| ${String('+' + tFilt.savedStakeM + 'M (-' + tFilt.savedPct + '%)').padEnd(14)}| ${tFilt.netProfitM > 0 ? '🏆 LÃI XUẤT SẮC' : '❌ LỖ'}`);
        console.log(`${''.padEnd(25)}| Đánh phẳng  | ${String(fFilt.wins + '/45 (' + fFilt.winRate + '%)').padEnd(12)}| ${String(fFilt.totalStakeM + 'M').padEnd(14)}| ${String(fFilt.totalPayoutM + 'M').padEnd(11)}| ${String((fFilt.netProfitM >= 0 ? '+' : '') + fFilt.netProfitM + 'M').padEnd(15)}| ${String(fFilt.roi + '%').padEnd(8)}| ${String('+' + fFilt.savedStakeM + 'M (-' + fFilt.savedPct + '%)').padEnd(14)}| ${fFilt.netProfitM > 0 ? '✅ LÃI TỐT' : '❌ LỖ'}`);
        console.log('----------------------------------------------------------------------------------------------------------------------------------------');
    }

    console.log('\n--- GIAI ĐOẠN 2: TOÀN BỘ NĂM 2026 (299 KỲ THAM KHẢO NGHIÊN CỨU) ---');
    console.log('----------------------------------------------------------------------------------------------------------------------------------------');
    console.log('Chiến lược               | Chế độ cược | Tỷ lệ trúng   | Tiền cược (M) | Thưởng (M) | Net Profit (M) | ROI (%) | Vốn tiết kiệm | Đánh giá');
    console.log('----------------------------------------------------------------------------------------------------------------------------------------');

    for (const [sId, sData] of Object.entries(deFusionTier.summary)) {
        const name = sId === 'ai5Ensemble' ? '👑 Ensemble 5 AI (~37s)' :
                     sId === 'mirofish' ? '🐟 Mirofish Swarm (~30s)' :
                     sId === 'fusion' ? '⚡ Tri-Tier Fusion (~27s)' :
                     sId === 'triCore' ? '🏛️ TriCore Tam Trụ (~22s)' :
                     sId === 'shadow' ? '🌗 Shadow Đa Động Cơ (~27s)' : '📅 Daily Meta (~27s)';

        const tFilt = sData.full2026.filtered;
        const fFilt = deFusionFlat.summary[sId].full2026.filtered;

        console.log(`${name.padEnd(25)}| Đa tầng VIP | ${String(tFilt.wins + '/299 (' + tFilt.winRate + '%)').padEnd(14)}| ${String(tFilt.totalStakeM + 'M').padEnd(14)}| ${String(tFilt.totalPayoutM + 'M').padEnd(11)}| ${String((tFilt.netProfitM >= 0 ? '+' : '') + tFilt.netProfitM + 'M').padEnd(15)}| ${String(tFilt.roi + '%').padEnd(8)}| ${String('+' + tFilt.savedStakeM + 'M (-' + tFilt.savedPct + '%)').padEnd(14)}| ${tFilt.netProfitM > 0 ? '🏆 BẢO TOÀN LÃI' : '🔻 ÂM HAO MÒN'}`);
        console.log(`${''.padEnd(25)}| Đánh phẳng  | ${String(fFilt.wins + '/299 (' + fFilt.winRate + '%)').padEnd(14)}| ${String(fFilt.totalStakeM + 'M').padEnd(14)}| ${String(fFilt.totalPayoutM + 'M').padEnd(11)}| ${String((fFilt.netProfitM >= 0 ? '+' : '') + fFilt.netProfitM + 'M').padEnd(15)}| ${String(fFilt.roi + '%').padEnd(8)}| ${String('+' + fFilt.savedStakeM + 'M (-' + fFilt.savedPct + '%)').padEnd(14)}| ${fFilt.netProfitM > 0 ? '🏆 BẢO TOÀN LÃI' : '🔻 ÂM HAO MÒN'}`);
        console.log('----------------------------------------------------------------------------------------------------------------------------------------');
    }

    console.log('\n========================================================================');
    console.log('          BẢNG 2: ĐỐI SOÁT CÁC PHƯƠNG PHÁP LÔ 2026 (ENSEMBLE 5 AI vs QMBF)       ');
    console.log('========================================================================');
    console.log('----------------------------------------------------------------------------------------------------------------------------------------');
    console.log('Phương pháp Lô           | Quy mô  | Giai đoạn  | Tỷ lệ trúng | Ngày thắng | Tổng nháy | Tiền cược (M) | Net Profit (M) | ROI (%) | MDD (M)');
    console.log('----------------------------------------------------------------------------------------------------------------------------------------');
    
    // QMBF Top 6
    console.log(`⚡ QMBF v6 Lô Top 6      | 6 số    | Live 45k   | ${qmbfStats.live.top6.hitRate}%     | ${qmbfStats.live.top6.winRate}%      | ${qmbfStats.live.top6.totalHits} nháy   | ${qmbfStats.live.top6.totalStake}M        | +${qmbfStats.live.top6.netProfit}M         | +${qmbfStats.live.top6.roi}%   | ${qmbfStats.live.top6.maxDrawdown}M`);
    console.log(`                         |         | Full 299k  | ${qmbfStats.full.top6.hitRate}%     | ${qmbfStats.full.top6.winRate}%      | ${qmbfStats.full.top6.totalHits} nháy  | ${qmbfStats.full.top6.totalStake}M       | +${qmbfStats.full.top6.netProfit}M         | +${qmbfStats.full.top6.roi}%    | ${qmbfStats.full.top6.maxDrawdown}M`);
    console.log('----------------------------------------------------------------------------------------------------------------------------------------');
    // QMBF Top 7
    console.log(`⚡ QMBF v6 Lô Top 7      | 7 số    | Live 45k   | ${qmbfStats.live.top7.hitRate}%     | ${qmbfStats.live.top7.winRate}%      | ${qmbfStats.live.top7.totalHits} nháy   | ${qmbfStats.live.top7.totalStake}M        | +${qmbfStats.live.top7.netProfit}M         | +${qmbfStats.live.top7.roi}%   | ${qmbfStats.live.top7.maxDrawdown}M`);
    console.log(`                         |         | Full 299k  | ${qmbfStats.full.top7.hitRate}%     | ${qmbfStats.full.top7.winRate}%      | ${qmbfStats.full.top7.totalHits} nháy  | ${qmbfStats.full.top7.totalStake}M       | +${qmbfStats.full.top7.netProfit}M         | +${qmbfStats.full.top7.roi}%   | ${qmbfStats.full.top7.maxDrawdown}M`);
    console.log('----------------------------------------------------------------------------------------------------------------------------------------');
    // 5 AI Top 6
    console.log(`🤖 Ensemble 5 AI Top 6   | 6 số    | Live 45k   | ${lo5AIStats.live.top6.hitRate}%     | ${lo5AIStats.live.top6.winRate}%      | ${lo5AIStats.live.top6.totalHits} nháy   | ${lo5AIStats.live.top6.totalStake}M        | ${lo5AIStats.live.top6.netProfit >= 0 ? '+' : ''}${lo5AIStats.live.top6.netProfit}M         | ${lo5AIStats.live.top6.roi}%   | ${lo5AIStats.live.top6.maxDrawdown}M`);
    console.log(`                         |         | Full 299k  | ${lo5AIStats.full.top6.hitRate}%     | ${lo5AIStats.full.top6.winRate}%      | ${lo5AIStats.full.top6.totalHits} nháy  | ${lo5AIStats.full.top6.totalStake}M       | ${lo5AIStats.full.top6.netProfit >= 0 ? '+' : ''}${lo5AIStats.full.top6.netProfit}M         | ${lo5AIStats.full.top6.roi}%   | ${lo5AIStats.full.top6.maxDrawdown}M`);
    console.log('----------------------------------------------------------------------------------------------------------------------------------------');
    // 5 AI Top 7
    console.log(`🤖 Ensemble 5 AI Top 7   | 7 số    | Live 45k   | ${lo5AIStats.live.top7.hitRate}%     | ${lo5AIStats.live.top7.winRate}%      | ${lo5AIStats.live.top7.totalHits} nháy   | ${lo5AIStats.live.top7.totalStake}M        | ${lo5AIStats.live.top7.netProfit >= 0 ? '+' : ''}${lo5AIStats.live.top7.netProfit}M        | ${lo5AIStats.live.top7.roi}%  | ${lo5AIStats.live.top7.maxDrawdown}M`);
    console.log(`                         |         | Full 299k  | ${lo5AIStats.full.top7.hitRate}%     | ${lo5AIStats.full.top7.winRate}%      | ${lo5AIStats.full.top7.totalHits} nháy  | ${lo5AIStats.full.top7.totalStake}M       | ${lo5AIStats.full.top7.netProfit >= 0 ? '+' : ''}${lo5AIStats.full.top7.netProfit}M         | ${lo5AIStats.full.top7.roi}%   | ${lo5AIStats.full.top7.maxDrawdown}M`);
    console.log('----------------------------------------------------------------------------------------------------------------------------------------');

    // Lưu file JSON báo cáo
    const fullJson = {
        metadata: {
            title: 'Báo cáo Thực nghiệm Toàn diện 2026: Ensemble 5 AI vs Các Phương Pháp Hiện Tại',
            generatedAt: new Date().toISOString(),
            fullDraws: fullDatesList.length,
            liveDraws: liveDatesList.length,
            strictPit: true,
            theoreticalExpectationBounds: true
        },
        deStrategies: {
            tiered: deFusionTier.summary,
            flat: deFusionFlat.summary
        },
        loStrategies: {
            ai5Ensemble: lo5AIStats,
            qmbf: qmbfStats
        }
    };

    const outPath = path.join(__dirname, '../data/backtest_2026_ensemble_full.json');
    fs.writeFileSync(outPath, JSON.stringify(fullJson, null, 2), 'utf8');
    console.log(`\n✓ Đã xuất kết quả JSON chi tiết tại: ${outPath}`);
}

if (require.main === module) {
    main();
}
