'use strict';

const fs = require('fs');
const path = require('path');
const lotteryService = require('../lib/services/lotteryService');
const { computePentaConsensusForDate } = require('../lib/services/pentaConsensusService');

function numStr(val) {
    return String(Number(val)).padStart(2, '0');
}

async function runResearch() {
    console.log('========================================================================');
    console.log(' NGHIÊN CỨU 2: NÂNG HẠNG CHÉO TIER X2 GIỮA LÔ GHÉP 4 & LÔ GỘP 5 SHADOW');
    console.log(' 100% Strict Point-In-Time (Strict PIT) - 289 kỳ mở thưởng năm 2026');
    console.log('========================================================================\n');

    await lotteryService.loadRawData();
    const rawData = lotteryService.getRawData().slice().sort((a, b) => new Date(a.date) - new Date(b.date));

    const advisorPath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
    if (!fs.existsSync(advisorPath)) {
        console.error('Không tìm thấy cached_daily_method_advisor.json');
        return;
    }
    const adv = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));

    // Lô Ghép 4 ledger
    const lo4Ledger = adv.lo4EngineFusion?.settledLedger || [];
    console.log(`Số ngày Lô Ghép 4 trong cache: ${lo4Ledger.length} ngày`);

    const POINT_COST = 22; // 22K/điểm (hoặc 2200K cho 100 điểm)
    const POINT_PAYOUT = 80; // 80K/điểm (hoặc 8000K cho 100 điểm)
    // Stake per unit:
    // X5 = 5 * 2200 = 11,000K, payout = hits * 5 * 8000 = hits * 40,000K
    // X4 = 4 * 2200 = 8,800K,  payout = hits * 4 * 8000 = hits * 32,000K
    // X3 = 3 * 2200 = 6,600K,  payout = hits * 3 * 8000 = hits * 24,000K
    // X2 = 2 * 2200 = 4,400K,  payout = hits * 2 * 8000 = hits * 16,000K
    // X1 = 1 * 2200 = 2,200K,  payout = hits * 1 * 8000 = hits * 8,000K

    // Trackers for System A (Lô Ghép 4)
    let aTotalDays = 0;
    let aOrigStakeK = 0, aOrigPayoutK = 0, aOrigWinDays = 0;
    let aNewStakeK = 0, aNewPayoutK = 0, aNewWinDays = 0;
    let aPromotedCountTotal = 0, aPromotedHitsTotal = 0, aPromotedTotalSlots = 0;
    let aNonPromotedX1CountTotal = 0, aNonPromotedX1HitsTotal = 0;
    let aOrigProfits = [], aNewProfits = [];

    // Trackers for System B (Lô Gộp 5 Shadow)
    let bTotalDays = 0;
    let bOrigStakeK = 0, bOrigPayoutK = 0, bOrigWinDays = 0;
    let bNewStakeK = 0, bNewPayoutK = 0, bNewWinDays = 0;
    let bPromotedCountTotal = 0, bPromotedHitsTotal = 0, bPromotedTotalSlots = 0;
    let bNonPromotedX1CountTotal = 0, bNonPromotedX1HitsTotal = 0;
    let bOrigProfits = [], bNewProfits = [];

    for (const aRow of lo4Ledger) {
        const date = aRow.date;
        const prizesObj = adv.drawPrizesByDate?.[date];
        if (!prizesObj || !prizesObj.prizes || prizesObj.prizes.length === 0) continue;

        const hitsMap = {};
        prizesObj.prizes.forEach(p => {
            const s = numStr(p);
            hitsMap[s] = (hitsMap[s] || 0) + 1;
        });

        // 1. Dàn A (Ghép 4)
        const aX5 = (aRow.tierX5 || []).map(numStr);
        const aX4 = (aRow.tierX4 || []).map(numStr);
        const aX3 = (aRow.tierX3 || []).map(numStr);
        const aX1 = (aRow.tierX1 || []).map(numStr);
        const aHighSet = new Set([...aX5, ...aX4, ...aX3]);

        // 2. Dàn B (Gộp 5 Shadow)
        const bResult = computePentaConsensusForDate(date, adv);
        if (!bResult || !bResult.lo) continue;
        const bX5 = (bResult.lo.x5Nums || []).map(numStr);
        const bX4 = (bResult.lo.x4Nums || []).map(numStr);
        const bX3 = (bResult.lo.x3Nums || []).map(numStr);
        const bX1 = (bResult.lo.x1Nums || []).map(numStr);
        const bHighSet = new Set([...bX5, ...bX4, ...bX3]);

        // === SIMULATE SYSTEM A (Lô Ghép 4) ===
        aTotalDays++;
        // Original System A (no X2)
        let aDayOrigStake = (aX5.length * 5 + aX4.length * 4 + aX3.length * 3 + aX1.length * 1) * 2200;
        let aDayOrigPayout = 0;
        aX5.forEach(n => { aDayOrigPayout += (hitsMap[n] || 0) * 5 * 8000; });
        aX4.forEach(n => { aDayOrigPayout += (hitsMap[n] || 0) * 4 * 8000; });
        aX3.forEach(n => { aDayOrigPayout += (hitsMap[n] || 0) * 3 * 8000; });
        aX1.forEach(n => { aDayOrigPayout += (hitsMap[n] || 0) * 1 * 8000; });
        const aDayOrigProfit = aDayOrigPayout - aDayOrigStake;
        aOrigStakeK += aDayOrigStake;
        aOrigPayoutK += aDayOrigPayout;
        if (aDayOrigProfit > 0) aOrigWinDays++;
        aOrigProfits.push(aDayOrigProfit);

        // Enhanced System A (Promote X1 if in bHighSet -> X2)
        const aPromotedToX2 = aX1.filter(n => bHighSet.has(n));
        const aRemainingX1 = aX1.filter(n => !bHighSet.has(n));

        aPromotedCountTotal += aPromotedToX2.length;
        aPromotedTotalSlots += aPromotedToX2.length;
        aPromotedToX2.forEach(n => { aPromotedHitsTotal += (hitsMap[n] || 0); });
        aRemainingX1.forEach(n => { aNonPromotedX1HitsTotal += (hitsMap[n] || 0); });
        aNonPromotedX1CountTotal += aRemainingX1.length;

        let aDayNewStake = (aX5.length * 5 + aX4.length * 4 + aX3.length * 3 + aPromotedToX2.length * 2 + aRemainingX1.length * 1) * 2200;
        let aDayNewPayout = 0;
        aX5.forEach(n => { aDayNewPayout += (hitsMap[n] || 0) * 5 * 8000; });
        aX4.forEach(n => { aDayNewPayout += (hitsMap[n] || 0) * 4 * 8000; });
        aX3.forEach(n => { aDayNewPayout += (hitsMap[n] || 0) * 3 * 8000; });
        aPromotedToX2.forEach(n => { aDayNewPayout += (hitsMap[n] || 0) * 2 * 8000; });
        aRemainingX1.forEach(n => { aDayNewPayout += (hitsMap[n] || 0) * 1 * 8000; });
        const aDayNewProfit = aDayNewPayout - aDayNewStake;
        aNewStakeK += aDayNewStake;
        aNewPayoutK += aDayNewPayout;
        if (aDayNewProfit > 0) aNewWinDays++;
        aNewProfits.push(aDayNewProfit);

        // === SIMULATE SYSTEM B (Lô Gộp 5 Shadow) ===
        bTotalDays++;
        // Original System B (no X2)
        let bDayOrigStake = (bX5.length * 5 + bX4.length * 4 + bX3.length * 3 + bX1.length * 1) * 2200;
        let bDayOrigPayout = 0;
        bX5.forEach(n => { bDayOrigPayout += (hitsMap[n] || 0) * 5 * 8000; });
        bX4.forEach(n => { bDayOrigPayout += (hitsMap[n] || 0) * 4 * 8000; });
        bX3.forEach(n => { bDayOrigPayout += (hitsMap[n] || 0) * 3 * 8000; });
        bX1.forEach(n => { bDayOrigPayout += (hitsMap[n] || 0) * 1 * 8000; });
        const bDayOrigProfit = bDayOrigPayout - bDayOrigStake;
        bOrigStakeK += bDayOrigStake;
        bOrigPayoutK += bDayOrigPayout;
        if (bDayOrigProfit > 0) bOrigWinDays++;
        bOrigProfits.push(bDayOrigProfit);

        // Enhanced System B (Promote X1 if in aHighSet -> X2)
        const bPromotedToX2 = bX1.filter(n => aHighSet.has(n));
        const bRemainingX1 = bX1.filter(n => !aHighSet.has(n));

        bPromotedCountTotal += bPromotedToX2.length;
        bPromotedTotalSlots += bPromotedToX2.length;
        bPromotedToX2.forEach(n => { bPromotedHitsTotal += (hitsMap[n] || 0); });
        bRemainingX1.forEach(n => { bNonPromotedX1HitsTotal += (hitsMap[n] || 0); });
        bNonPromotedX1CountTotal += bRemainingX1.length;

        let bDayNewStake = (bX5.length * 5 + bX4.length * 4 + bX3.length * 3 + bPromotedToX2.length * 2 + bRemainingX1.length * 1) * 2200;
        let bDayNewPayout = 0;
        bX5.forEach(n => { bDayNewPayout += (hitsMap[n] || 0) * 5 * 8000; });
        bX4.forEach(n => { bDayNewPayout += (hitsMap[n] || 0) * 4 * 8000; });
        bX3.forEach(n => { bDayNewPayout += (hitsMap[n] || 0) * 3 * 8000; });
        bPromotedToX2.forEach(n => { bDayNewPayout += (hitsMap[n] || 0) * 2 * 8000; });
        bRemainingX1.forEach(n => { bDayNewPayout += (hitsMap[n] || 0) * 1 * 8000; });
        const bDayNewProfit = bDayNewPayout - bDayNewStake;
        bNewStakeK += bDayNewStake;
        bNewPayoutK += bDayNewPayout;
        if (bDayNewProfit > 0) bNewWinDays++;
        bNewProfits.push(bDayNewProfit);
    }

    // Helper for drawdown & max consecutive loss
    function calcMetrics(profitSeries) {
        let maxConsLoss = 0, currConsLoss = 0;
        let cum = 0, peak = 0, maxDd = 0;
        for (const p of profitSeries) {
            if (p <= 0) {
                currConsLoss++;
                if (currConsLoss > maxConsLoss) maxConsLoss = currConsLoss;
            } else {
                currConsLoss = 0;
            }
            cum += p;
            if (cum > peak) peak = cum;
            const dd = peak - cum;
            if (dd > maxDd) maxDd = dd;
        }
        return { maxConsLoss, maxDd };
    }

    const aOrigMetrics = calcMetrics(aOrigProfits);
    const aNewMetrics = calcMetrics(aNewProfits);
    const bOrigMetrics = calcMetrics(bOrigProfits);
    const bNewMetrics = calcMetrics(bNewProfits);

    console.log('--- KẾT QUẢ SO SÁNH HỆ THỐNG A: LÔ GHÉP 4 ĐỘNG CƠ (ADVISOR) ---');
    console.log(`Số ngày kiểm thử: ${aTotalDays} kỳ`);
    console.log(`Số lượng số được nâng lên X2 trung bình: ${(aPromotedCountTotal / aTotalDays).toFixed(2)} số/ngày (tổng ${aPromotedCountTotal} lượt)`);
    console.log(`Xác suất nổ của nhóm được thăng hạng X2: ${aPromotedHitsTotal}/${aPromotedTotalSlots} = ${(aPromotedHitsTotal / aPromotedTotalSlots * 100).toFixed(1)}% nháy/số`);
    console.log(`Xác suất nổ của nhóm X1 giữ nguyên: ${aNonPromotedX1HitsTotal}/${aNonPromotedX1CountTotal} = ${(aNonPromotedX1HitsTotal / aNonPromotedX1CountTotal * 100).toFixed(1)}% nháy/số`);
    console.log(`-> Hiệu ứng chọn lọc: Nhóm thăng hạng X2 nổ cao hơn nhóm X1 giữ nguyên ${( (aPromotedHitsTotal / aPromotedTotalSlots) - (aNonPromotedX1HitsTotal / aNonPromotedX1CountTotal) ) * 100 > 0 ? '+' : ''}${( ((aPromotedHitsTotal / aPromotedTotalSlots) - (aNonPromotedX1HitsTotal / aNonPromotedX1CountTotal)) * 100 ).toFixed(1)}% điểm phần trăm!\n`);

    console.table([
        {
            'Chỉ số': 'Tổng Vốn Cược (Stake)',
            'Phiên bản GỐC (Chưa có X2)': `${(aOrigStakeK / 1000).toFixed(1)}M`,
            'Phiên bản MỚI (Nâng hạng X2)': `${(aNewStakeK / 1000).toFixed(1)}M`,
            'Chênh lệch': `+${((aNewStakeK - aOrigStakeK) / 1000).toFixed(1)}M (+${((aNewStakeK / aOrigStakeK - 1) * 100).toFixed(1)}%)`
        },
        {
            'Chỉ số': 'Tổng Tiền Thắng (Payout)',
            'Phiên bản GỐC (Chưa có X2)': `${(aOrigPayoutK / 1000).toFixed(1)}M`,
            'Phiên bản MỚI (Nâng hạng X2)': `${(aNewPayoutK / 1000).toFixed(1)}M`,
            'Chênh lệch': `+${((aNewPayoutK - aOrigPayoutK) / 1000).toFixed(1)}M`
        },
        {
            'Chỉ số': 'Lợi Nhuận Ròng (Net Profit)',
            'Phiên bản GỐC (Chưa có X2)': `${((aOrigPayoutK - aOrigStakeK) / 1000).toFixed(1)}M`,
            'Phiên bản MỚI (Nâng hạng X2)': `${((aNewPayoutK - aNewStakeK) / 1000).toFixed(1)}M`,
            'Chênh lệch': `${((aNewPayoutK - aNewStakeK) - (aOrigPayoutK - aOrigStakeK)) >= 0 ? '+' : ''}${(((aNewPayoutK - aNewStakeK) - (aOrigPayoutK - aOrigStakeK)) / 1000).toFixed(1)}M`
        },
        {
            'Chỉ số': 'Tỷ suất Sinh lời (ROI)',
            'Phiên bản GỐC (Chưa có X2)': `${(((aOrigPayoutK - aOrigStakeK) / aOrigStakeK) * 100).toFixed(2)}%`,
            'Phiên bản MỚI (Nâng hạng X2)': `${(((aNewPayoutK - aNewStakeK) / aNewStakeK) * 100).toFixed(2)}%`,
            'Chênh lệch': `${(((aNewPayoutK - aNewStakeK) / aNewStakeK) - ((aOrigPayoutK - aOrigStakeK) / aOrigStakeK)) * 100 >= 0 ? '+' : ''}${((((aNewPayoutK - aNewStakeK) / aNewStakeK) - ((aOrigPayoutK - aOrigStakeK) / aOrigStakeK)) * 100).toFixed(2)}%`
        },
        {
            'Chỉ số': 'Số Ngày Thắng Lãi (>0)',
            'Phiên bản GỐC (Chưa có X2)': `${aOrigWinDays}/${aTotalDays} (${(aOrigWinDays / aTotalDays * 100).toFixed(1)}%)`,
            'Phiên bản MỚI (Nâng hạng X2)': `${aNewWinDays}/${aTotalDays} (${(aNewWinDays / aTotalDays * 100).toFixed(1)}%)`,
            'Chênh lệch': `${aNewWinDays - aOrigWinDays >= 0 ? '+' : ''}${aNewWinDays - aOrigWinDays} ngày`
        },
        {
            'Chỉ số': 'Chuỗi Lỗ Liên Tiếp Tối Đa',
            'Phiên bản GỐC (Chưa có X2)': `${aOrigMetrics.maxConsLoss} ngày`,
            'Phiên bản MỚI (Nâng hạng X2)': `${aNewMetrics.maxConsLoss} ngày`,
            'Chênh lệch': `${aNewMetrics.maxConsLoss - aOrigMetrics.maxConsLoss} ngày`
        },
        {
            'Chỉ số': 'Max Drawdown (Sụt giảm đỉnh)',
            'Phiên bản GỐC (Chưa có X2)': `${(aOrigMetrics.maxDd / 1000).toFixed(1)}M`,
            'Phiên bản MỚI (Nâng hạng X2)': `${(aNewMetrics.maxDd / 1000).toFixed(1)}M`,
            'Chênh lệch': `${((aNewMetrics.maxDd - aOrigMetrics.maxDd) / 1000).toFixed(1)}M`
        }
    ]);

    console.log('\n--- KẾT QUẢ SO SÁNH HỆ THỐNG B: LÔ GỘP 5 PHƯƠNG PHÁP (SHADOW) ---');
    console.log(`Số ngày kiểm thử: ${bTotalDays} kỳ`);
    console.log(`Số lượng số được nâng lên X2 trung bình: ${(bPromotedCountTotal / bTotalDays).toFixed(2)} số/ngày (tổng ${bPromotedCountTotal} lượt)`);
    console.log(`Xác suất nổ của nhóm được thăng hạng X2: ${bPromotedHitsTotal}/${bPromotedTotalSlots} = ${(bPromotedHitsTotal / bPromotedTotalSlots * 100).toFixed(1)}% nháy/số`);
    console.log(`Xác suất nổ của nhóm X1 giữ nguyên: ${bNonPromotedX1HitsTotal}/${bNonPromotedX1CountTotal} = ${(bNonPromotedX1HitsTotal / bNonPromotedX1CountTotal * 100).toFixed(1)}% nháy/số`);
    console.log(`-> Hiệu ứng chọn lọc: Nhóm thăng hạng X2 nổ cao hơn nhóm X1 giữ nguyên ${( (bPromotedHitsTotal / bPromotedTotalSlots) - (bNonPromotedX1HitsTotal / bNonPromotedX1CountTotal) ) * 100 > 0 ? '+' : ''}${( ((bPromotedHitsTotal / bPromotedTotalSlots) - (bNonPromotedX1HitsTotal / bNonPromotedX1CountTotal)) * 100 ).toFixed(1)}% điểm phần trăm!\n`);

    console.table([
        {
            'Chỉ số': 'Tổng Vốn Cược (Stake)',
            'Phiên bản GỐC (Chưa có X2)': `${(bOrigStakeK / 1000).toFixed(1)}M`,
            'Phiên bản MỚI (Nâng hạng X2)': `${(bNewStakeK / 1000).toFixed(1)}M`,
            'Chênh lệch': `+${((bNewStakeK - bOrigStakeK) / 1000).toFixed(1)}M (+${((bNewStakeK / bOrigStakeK - 1) * 100).toFixed(1)}%)`
        },
        {
            'Chỉ số': 'Tổng Tiền Thắng (Payout)',
            'Phiên bản GỐC (Chưa có X2)': `${(bOrigPayoutK / 1000).toFixed(1)}M`,
            'Phiên bản MỚI (Nâng hạng X2)': `${(bNewPayoutK / 1000).toFixed(1)}M`,
            'Chênh lệch': `+${((bNewPayoutK - bOrigPayoutK) / 1000).toFixed(1)}M`
        },
        {
            'Chỉ số': 'Lợi Nhuận Ròng (Net Profit)',
            'Phiên bản GỐC (Chưa có X2)': `${((bOrigPayoutK - bOrigStakeK) / 1000).toFixed(1)}M`,
            'Phiên bản MỚI (Nâng hạng X2)': `${((bNewPayoutK - bNewStakeK) / 1000).toFixed(1)}M`,
            'Chênh lệch': `${((bNewPayoutK - bNewStakeK) - (bOrigPayoutK - bOrigStakeK)) >= 0 ? '+' : ''}${(((bNewPayoutK - bNewStakeK) - (bOrigPayoutK - bOrigStakeK)) / 1000).toFixed(1)}M`
        },
        {
            'Chỉ số': 'Tỷ suất Sinh lời (ROI)',
            'Phiên bản GỐC (Chưa có X2)': `${(((bOrigPayoutK - bOrigStakeK) / bOrigStakeK) * 100).toFixed(2)}%`,
            'Phiên bản MỚI (Nâng hạng X2)': `${(((bNewPayoutK - bNewStakeK) / bNewStakeK) * 100).toFixed(2)}%`,
            'Chênh lệch': `${(((bNewPayoutK - bNewStakeK) / bNewStakeK) - ((bOrigPayoutK - bOrigStakeK) / bOrigStakeK)) * 100 >= 0 ? '+' : ''}${((((bNewPayoutK - bNewStakeK) / bNewStakeK) - ((bOrigPayoutK - bOrigStakeK) / bOrigStakeK)) * 100).toFixed(2)}%`
        },
        {
            'Chỉ số': 'Số Ngày Thắng Lãi (>0)',
            'Phiên bản GỐC (Chưa có X2)': `${bOrigWinDays}/${bTotalDays} (${(bOrigWinDays / bTotalDays * 100).toFixed(1)}%)`,
            'Phiên bản MỚI (Nâng hạng X2)': `${bNewWinDays}/${bTotalDays} (${(bNewWinDays / bTotalDays * 100).toFixed(1)}%)`,
            'Chênh lệch': `${bNewWinDays - bOrigWinDays >= 0 ? '+' : ''}${bNewWinDays - bOrigWinDays} ngày`
        },
        {
            'Chỉ số': 'Chuỗi Lỗ Liên Tiếp Tối Đa',
            'Phiên bản GỐC (Chưa có X2)': `${bOrigMetrics.maxConsLoss} ngày`,
            'Phiên bản MỚI (Nâng hạng X2)': `${bNewMetrics.maxConsLoss} ngày`,
            'Chênh lệch': `${bNewMetrics.maxConsLoss - bOrigMetrics.maxConsLoss} ngày`
        },
        {
            'Chỉ số': 'Max Drawdown (Sụt giảm đỉnh)',
            'Phiên bản GỐC (Chưa có X2)': `${(bOrigMetrics.maxDd / 1000).toFixed(1)}M`,
            'Phiên bản MỚI (Nâng hạng X2)': `${(bNewMetrics.maxDd / 1000).toFixed(1)}M`,
            'Chênh lệch': `${((bNewMetrics.maxDd - bOrigMetrics.maxDd) / 1000).toFixed(1)}M`
        }
    ]);
}

runResearch().catch(console.error);
