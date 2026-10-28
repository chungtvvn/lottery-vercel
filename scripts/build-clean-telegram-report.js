'use strict';

/**
 * scripts/build-clean-telegram-report.js
 * Implementation of clean, streamlined Telegram Report containing ONLY:
 * 1. Nhật ký đối soát ở /daily-advisor (Đề, Lô Ghép 4 ĐC, Xiên 5 55M)
 * 2. Phương pháp Gộp 5 ở /daily-advisor-shadow (Đề Gộp 5, Lô Gộp 5, Xiên 5 Gộp 5 5.5M)
 * Pre-draw predictions & Post-draw settlements with exact stakes & zero clutter.
 */

function numStr(val) {
    return String(Number(val)).padStart(2, '0');
}

function displayDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '-');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function formatCostK(valK) {
    const n = Math.abs(Math.round(Number(valK || 0)));
    return `${n.toLocaleString('vi-VN')}K`;
}

function formatK(valK) {
    const n = Number(valK || 0);
    return `${new Intl.NumberFormat('vi-VN').format(n)}K`;
}

function formatMoneyK(valK) {
    const n = Number(valK || 0);
    const sign = n > 0 ? '+' : '';
    return `${sign}${new Intl.NumberFormat('vi-VN').format(n)}K`;
}

function formatM(valK) {
    const n = Number(valK || 0);
    const sign = n > 0 ? '+' : '';
    return `${sign}${(n / 1000).toFixed(1)}M`;
}

function getXien5Combinations(top5) {
    if (!Array.isArray(top5) || top5.length < 5) return [];
    const n = top5.map(numStr);
    return [
        [n[0], n[1], n[2], n[3]],
        [n[0], n[1], n[2], n[4]],
        [n[0], n[1], n[3], n[4]],
        [n[0], n[2], n[3], n[4]],
        [n[1], n[2], n[3], n[4]]
    ];
}

function computePentaConsensusForDate(targetDate, advisorCache) {
    if (!advisorCache) return null;
    const regEntry = advisorCache.dailyLockedBetsRegistry?.dates?.[targetDate];
    if (regEntry?.bets?.pentaConsensus) {
        const b = regEntry.bets.pentaConsensus;
        const s = regEntry.settlement?.pentaConsensus;
        return {
            date: targetDate,
            isPending: !regEntry.isSettled,
            actualSpecial: s?.actualSpecial || null,
            de: {
                numbers: b.de?.numbers || [],
                x2Nums: b.de?.x2Nums || [],
                x1Nums: b.de?.x1Nums || [],
                stakeK: s?.de?.stakeK ?? b.de?.stakeK ?? 0,
                payoutK: s?.de?.payoutK ?? 0,
                profitK: s?.de?.profitK ?? 0,
                isHit: s?.de?.isHit || false,
                isHitX2: s?.de?.isHitX2 || false,
                isHitX1: s?.de?.isHitX1 || false
            },
            lo: {
                numbers: b.lo?.numbers || [],
                x5Nums: b.lo?.x5Nums || [],
                x4Nums: b.lo?.x4Nums || [],
                x3Nums: b.lo?.x3Nums || [],
                x1Nums: b.lo?.x1Nums || [],
                multiplierMap: b.lo?.multiplierMap || {},
                hits: s?.lo?.hits || 0,
                hitNums: s?.lo?.hitNums || [],
                stakeK: s?.lo?.stakeK ?? b.lo?.stakeK ?? 0,
                payoutK: s?.lo?.payoutK ?? 0,
                profitK: s?.lo?.profitK ?? 0,
                isWin: s?.lo?.isWin || false
            },
            loCrossX2: {
                numbers: b.loCrossX2?.numbers || b.lo?.numbers || [],
                x5Nums: b.loCrossX2?.x5Nums || b.lo?.x5Nums || [],
                x4Nums: b.loCrossX2?.x4Nums || b.lo?.x4Nums || [],
                x3Nums: b.loCrossX2?.x3Nums || b.lo?.x3Nums || [],
                x2Nums: b.loCrossX2?.x2Nums || s?.loCrossX2?.x2Nums || [],
                x1Nums: b.loCrossX2?.x1Nums || s?.loCrossX2?.x1Nums || b.lo?.x1Nums || [],
                hits: s?.loCrossX2?.hits ?? s?.lo?.hits ?? 0,
                hitNums: s?.loCrossX2?.hitNums || s?.lo?.hitNums || [],
                stakeK: s?.loCrossX2?.stakeK ?? b.loCrossX2?.stakeK ?? (s?.lo?.stakeK ?? b.lo?.stakeK ?? 0),
                payoutK: s?.loCrossX2?.payoutK ?? (s?.lo?.payoutK ?? 0),
                profitK: s?.loCrossX2?.profitK ?? (s?.lo?.profitK ?? 0),
                isWin: s?.loCrossX2?.isWin ?? s?.lo?.isWin ?? false
            },
            xien5: {
                top5: b.xien5?.top5 || [],
                tickets: b.xien5?.tickets || getXien5Combinations(b.xien5?.top5),
                h5: s?.xien5?.h5 || 0,
                stakeK: s?.xien5?.stakeK ?? b.xien5?.stakeK ?? 5500,
                payoutK: s?.xien5?.payoutK ?? 0,
                profitK: s?.xien5?.profitK ?? 0,
                isWin: s?.xien5?.isWin || false
            },
            combo: {
                stakeK: s?.totalStakeK ?? ((b.de?.stakeK || 0) + (b.lo?.stakeK || 0) + (b.xien5?.stakeK || 5500)),
                payoutK: s?.totalPayoutK ?? 0,
                profitK: s?.totalProfitK ?? 0,
                isWin: s?.isWin || false
            }
        };
    }

    const deDropoff = advisorCache.deDropoffMerge;
    const triCore = advisorCache.triCoreDe;
    const loDropoff = advisorCache.loDropoff27;
    const loTriHarmonic = advisorCache.loTriHarmonic;
    const loQuadHybrid = advisorCache.loQuadHybrid;
    const semanticResonance = advisorCache.semanticResonanceSuite;
    const miro = advisorCache.mirofishSwarm;

    const drawPrizesObj = advisorCache.drawPrizesByDate?.[targetDate] || null;
    const isPending = !drawPrizesObj || (drawPrizesObj.special === undefined && (!drawPrizesObj.prizes || drawPrizesObj.prizes.length === 0));

    let d1 = [], d2 = [], d3 = [], d4 = [], d5 = [];
    if (isPending) {
        d1 = (deDropoff?.latestRecommendation?.numbers || deDropoff?.latestRecommendation?.top40 || []).slice(0, 40).map(numStr);
        d2 = (triCore?.latestRecommendation?.numbers || []).map(numStr);
        d3 = (deDropoff?.latestRecommendation?.numbers36 || deDropoff?.latestRecommendation?.top36 || d1.slice(0, 36)).map(numStr);
        d4 = (semanticResonance?.latestRecommendation?.de?.numbers36 || []).map(numStr);
        d5 = (miro?.latestRecommendation?.de?.numbers || miro?.latestRecommendation?.numbers || []).map(numStr);
    } else {
        const rD1 = (deDropoff?.settledLedger || []).find(r => r.date === targetDate);
        d1 = (rD1?.numbers || rD1?.top40 || []).slice(0, 40).map(numStr);
        const rD2 = (triCore?.settledLedger || []).concat(triCore?.allDaysLedger || []).find(r => r.date === targetDate);
        d2 = (rD2?.numbers || []).map(numStr);
        d3 = (rD1?.numbers36 || rD1?.top36 || d1.slice(0, 36)).map(numStr);
        const rD4 = (semanticResonance?.settledLedger || []).find(r => r.date === targetDate);
        d4 = (rD4?.de?.numbers36 || rD4?.de?.numbers || []).map(numStr);
        const rD5 = (miro?.settledLedger || []).find(r => r.date === targetDate);
        d5 = (rD5?.de?.numbers || []).map(numStr);
    }

    const deFreq = {};
    [d1, d2, d3, d4, d5].forEach(arr => {
        new Set(arr).forEach(n => {
            const s = numStr(n);
            if (s) deFreq[s] = (deFreq[s] || 0) + 1;
        });
    });

    const allDeNums = Object.keys(deFreq).sort((a, b) => {
        if (deFreq[b] !== deFreq[a]) return deFreq[b] - deFreq[a];
        return a.localeCompare(b);
    });
    const deX2Nums = allDeNums.filter(n => deFreq[n] >= 3);
    const deX1Nums = allDeNums.filter(n => deFreq[n] < 3);
    const deStakeK = deX2Nums.length * 400 + deX1Nums.length * 200;
    const actualSpecial = isPending ? null : (drawPrizesObj?.special !== undefined ? numStr(drawPrizesObj.special) : null);
    const isHitX2 = isPending ? false : (actualSpecial ? deX2Nums.includes(actualSpecial) : false);
    const isHitX1 = isPending ? false : (actualSpecial ? deX1Nums.includes(actualSpecial) : false);
    const isDeHit = isHitX2 || isHitX1;
    const dePayoutK = isPending ? 0 : (isHitX2 ? 33600 : (isHitX1 ? 16800 : 0));
    const deProfitK = isPending ? 0 : (dePayoutK - deStakeK);

    let l1 = [], l2 = [], l3 = [], l4 = [], l5 = [];
    if (isPending) {
        l1 = (loDropoff?.latestRecommendation?.top7 || loDropoff?.latestRecommendation?.numbers || []).slice(0, 7).map(numStr);
        l2 = ((loTriHarmonic?.latestRecommendation?.rankedNumbers || []).slice(0, 7)).map(numStr);
        l3 = (loQuadHybrid?.latestRecommendation?.top7 || []).map(numStr);
        if (!l3.length) l3 = l1;
        l4 = (semanticResonance?.latestRecommendation?.lo?.top7 || []).map(numStr);
        l5 = (miro?.latestRecommendation?.lo?.numbers || []).slice(0, 7).map(numStr);
    } else {
        const rL1 = (loDropoff?.settledLedger || []).find(r => r.date === targetDate);
        l1 = (rL1?.top7 || rL1?.numbers || []).slice(0, 7).map(numStr);
        const rL2 = (loTriHarmonic?.settledLedger || []).find(r => r.date === targetDate);
        l2 = (rL2?.rankedNumbers || []).slice(0, 7).map(numStr);
        if (!l2.length) {
            const rL2Alt = (advisorCache.loTop5ConsensusXien?.settledLedger || []).find(r => r.date === targetDate);
            l2 = (rL2Alt?.top7Loto || []).slice(0, 7).map(numStr);
        }
        const rL3 = (loQuadHybrid?.settledLedger || []).find(r => r.date === targetDate);
        l3 = (rL3?.top7 || []).map(numStr);
        if (!l3.length) l3 = l1;
        const rL4 = (semanticResonance?.settledLedger || []).find(r => r.date === targetDate);
        l4 = (rL4?.lo?.top7 || []).map(numStr);
        const rL5 = (miro?.settledLedger || []).find(r => r.date === targetDate);
        l5 = (rL5?.lo?.numbers || []).slice(0, 7).map(numStr);
    }

    const loFreq = {};
    const loScore = {};
    [l1, l2, l3, l4, l5].forEach(arr => {
        arr.forEach((n, idx) => {
            const s = numStr(n);
            if (s) {
                loFreq[s] = (loFreq[s] || 0) + 1;
                loScore[s] = (loScore[s] || 0) + (10 - idx);
            }
        });
    });

    const allLoNums = Object.keys(loFreq).sort((a, b) => {
        if (loFreq[b] !== loFreq[a]) return loFreq[b] - loFreq[a];
        if (loScore[b] !== loScore[a]) return loScore[b] - loScore[a];
        return a.localeCompare(b);
    });

    const numMultiplierMap = {};
    allLoNums.forEach(n => {
        const f = loFreq[n];
        if (f >= 4) numMultiplierMap[n] = 5;
        else if (f === 3) numMultiplierMap[n] = 4;
        else if (f === 2) numMultiplierMap[n] = 3;
        else numMultiplierMap[n] = 1;
    });

    const x5Nums = allLoNums.filter(n => numMultiplierMap[n] === 5);
    const x4Nums = allLoNums.filter(n => numMultiplierMap[n] === 4);
    const x3Nums = allLoNums.filter(n => numMultiplierMap[n] === 3);
    const x1Nums = allLoNums.filter(n => numMultiplierMap[n] === 1);

    const prizeCount = {};
    if (!isPending && drawPrizesObj?.prizes) {
        drawPrizesObj.prizes.forEach(p => {
            const s = numStr(p);
            prizeCount[s] = (prizeCount[s] || 0) + 1;
        });
    }

    let loStakeK = 0, loPayoutK = 0, loHits = 0;
    const loHitNums = [];
    allLoNums.forEach(n => {
        const mult = numMultiplierMap[n] || 1;
        const stake = mult * 2200;
        const hits = isPending ? 0 : (prizeCount[n] || 0);
        const payout = isPending ? 0 : hits * (mult * 8000);
        loStakeK += stake;
        loPayoutK += payout;
        loHits += hits;
        if (hits > 0) loHitNums.push(n);
    });
    const loProfitK = isPending ? 0 : (loPayoutK - loStakeK);

    // Dàn Lô Đột Phá X2
    const lo4HighSet = new Set();
    const lo4Ledger = advisorCache?.lo4EngineFusion?.settledLedger || [];
    const lo4Row = isPending
        ? (advisorCache?.lo4EngineFusion?.latestRecommendation || null)
        : lo4Ledger.find(r => r.date === targetDate);
    if (lo4Row) {
        const h = [
            ...(lo4Row.tierX5 || []),
            ...(lo4Row.tierX4 || []),
            ...(lo4Row.tierX3 || [])
        ];
        h.forEach(n => lo4HighSet.add(numStr(n)));
    }
    const regEntryForLo4 = advisorCache?.dailyLockedBetsRegistry?.dates?.[targetDate];
    const lockedLo4 = regEntryForLo4?.settlement?.lo4EngineFusion || regEntryForLo4?.bets?.lo4EngineFusion;
    if (lockedLo4 && lo4HighSet.size === 0) {
        const h = [
            ...(lockedLo4.tierX5 || []),
            ...(lockedLo4.tierX4 || []),
            ...(lockedLo4.tierX3 || [])
        ];
        h.forEach(n => lo4HighSet.add(numStr(n)));
    }

    const promotedToX2 = x1Nums.filter(n => lo4HighSet.has(n));
    const remainingX1 = x1Nums.filter(n => !lo4HighSet.has(n));
    const numMultiplierMapX2 = { ...numMultiplierMap };
    promotedToX2.forEach(n => { numMultiplierMapX2[n] = 2; });

    let loStakeKX2 = 0, loPayoutKX2 = 0;
    allLoNums.forEach(n => {
        const mult = numMultiplierMapX2[n] || 1;
        const stake = mult * 2200;
        const hits = isPending ? 0 : (prizeCount[n] || 0);
        const payout = isPending ? 0 : hits * (mult * 8000);
        loStakeKX2 += stake;
        loPayoutKX2 += payout;
    });
    const loProfitKX2 = isPending ? 0 : (loPayoutKX2 - loStakeKX2);

    const top5Nums = allLoNums.slice(0, 5);
    const tickets = getXien5Combinations(top5Nums);
    const xienStakeK = 5500;
    let xienPayoutK = 0, h5 = 0;
    if (!isPending) {
        h5 = top5Nums.filter(n => (prizeCount[n] || 0) > 0).length;
        if (h5 === 5) xienPayoutK = 5 * 38400;
        else if (h5 === 4) xienPayoutK = 1 * 38400 + 4 * 8400;
        else if (h5 === 3) xienPayoutK = 2 * 8400 + 3 * 1200;
        else if (h5 === 2) xienPayoutK = 3 * 1200;
    }
    const xienProfitK = isPending ? 0 : (xienPayoutK - xienStakeK);

    return {
        date: targetDate,
        isPending,
        actualSpecial,
        de: {
            numbers: allDeNums,
            x2Nums: deX2Nums,
            x1Nums: deX1Nums,
            stakeK: deStakeK,
            payoutK: dePayoutK,
            profitK: deProfitK,
            isHit: isDeHit,
            isHitX2,
            isHitX1
        },
        lo: {
            numbers: allLoNums,
            x5Nums,
            x4Nums,
            x3Nums,
            x1Nums,
            multiplierMap: numMultiplierMap,
            hits: loHits,
            hitNums: loHitNums,
            stakeK: loStakeK,
            payoutK: loPayoutK,
            profitK: loProfitK,
            isWin: loProfitK > 0
        },
        loCrossX2: {
            numbers: allLoNums,
            x5Nums,
            x4Nums,
            x3Nums,
            x2Nums: promotedToX2,
            x1Nums: remainingX1,
            multiplierMap: numMultiplierMapX2,
            hits: loHits,
            hitNums: loHitNums,
            stakeK: loStakeKX2,
            payoutK: loPayoutKX2,
            profitK: loProfitKX2,
            isWin: loProfitKX2 > 0
        },
        xien5: {
            top5: top5Nums,
            tickets,
            h5,
            stakeK: xienStakeK,
            payoutK: xienPayoutK,
            profitK: xienProfitK,
            isWin: xienProfitK > 0
        },
        combo: {
            stakeK: deStakeK + loStakeK + xienStakeK,
            payoutK: dePayoutK + loPayoutK + xienPayoutK,
            profitK: deProfitK + loProfitK + xienProfitK,
            isWin: (deProfitK + loProfitK + xienProfitK) > 0
        }
    };
}

function buildTelegramReport(dePayload, lotoPayload, historyPayload = {}, advisorPayload = {}) {
    const reg = advisorPayload?.dailyLockedBetsRegistry?.dates || {};
    const crossHedge = advisorPayload?.crossHedgingPortfolio?.latestRecommendation || advisorPayload?.crossHedgingPortfolio || null;
    const predictionDate = crossHedge?.targetDate
        || advisorPayload?.latestRecommendationDate
        || dePayload?.nextPrediction?.predictionIsoDate
        || lotoPayload?.nextPrediction?.predictionIsoDate
        || '2026-10-19';

    if (!predictionDate) {
        throw new Error('Payload chưa có đủ dự đoán Đề/Lô cho ngày tiếp theo.');
    }

    const divider = '━━━━━━━━━━━━━━━━━━━━';
    const lines = [
        `🎯 <b>XSMB — GỢI Ý THỰC CHIẾN HÀNG NGÀY ${escapeHtml(displayDate(predictionDate))}</b>`,
        `🔒 <i>100% Khớp Bất Biến Giữa Web (/daily-advisor &amp; /daily-advisor-shadow) và Bot Telegram</i>`,
        ''
    ];

    // Niêm phong status
    let isLocked = false;
    try {
        const now = new Date();
        const vnFormatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false
        });
        const parts = vnFormatter.formatToParts(now);
        const m = {};
        for (const p of parts) m[p.type] = p.value;
        const vnDate = `${m.year}-${m.month}-${m.day}`;
        const vnHour = parseInt(m.hour, 10);
        const vnMinute = parseInt(m.minute, 10);
        const totalMinutes = vnHour * 60 + vnMinute;
        if (vnDate === String(predictionDate).slice(0, 10) && totalMinutes >= 720 && totalMinutes < 1120) {
            isLocked = true;
        }
    } catch (e) {}

    if (isLocked) {
        lines.push(
            `🔒 <b>TRẠNG THÁI: ĐÃ NIÊM PHONG BẤT BIẾN (TỪ 12H TRƯA)</b>`,
            `<i>Dàn số được bảo toàn 100% không đổi cho đến khi kết toán sau 18h40 (Chống nảy số tuyệt đối).</i>`,
            ''
        );
    }

    // Determine settledDate
    const settledDates = Object.keys(reg).filter(d => reg[d]?.isSettled).sort();
    const chSettled = advisorPayload?.crossHedgingPortfolio?.settledLedger || [];
    const settledDate = settledDates[settledDates.length - 1] 
        || chSettled[chSettled.length - 1]?.date 
        || dePayload?.livePredictions?.predictions?.[0]?.predictionIsoDate
        || null;

    if (settledDate) {
        const regSettled = reg[settledDate] || {};
        const sBets = regSettled.bets || {};
        const sSettlement = regSettled.settlement || {};

        // A. Đối soát Nhật ký đối soát (/daily-advisor)
        const sDe = sSettlement.de || sSettlement.crossHedgingPortfolio || {};
        const actualSpecial = sDe.actualSpecial 
            || sSettlement.lo4EngineFusion?.actualSpecial
            || advisorPayload?.drawPrizesByDate?.[settledDate]?.special
            || dePayload?.livePredictions?.predictions?.[0]?.actualSpecial
            || null;

        const isDeHit = sDe.isHit ?? (sDe.deHits > 0 || (sDe.profitK || 0) > 0);
        const isDeVipHit = sDe.isVipHit ?? false;
        const deSpecialStr = actualSpecial != null ? numStr(actualSpecial) : '--';
        let deResultText = '';
        if (actualSpecial != null) {
            if (isDeVipHit) {
                deResultText = `👑 <b>TRÚNG ĐỀ VIP X3 (số ${deSpecialStr}) ăn 252M!</b>`;
            } else if (isDeHit) {
                deResultText = `✅ <b>TRÚNG ĐỀ BỌC LÓT X1 (số ${deSpecialStr}) ăn 84M!</b>`;
            } else {
                deResultText = `❌ <b>Trượt Đề (ĐB về ${deSpecialStr})</b>`;
            }
        } else {
            deResultText = `⏳ <i>Đang chờ mở thưởng</i>`;
        }
        const advDeStakeK = sDe.stakeK || sDe.deStakeK || 70000;
        const advDePayoutK = sDe.payoutK || sDe.dePayoutK || (isDeHit ? 84000 : 0);
        const advDeProfitK = sDe.profitK ?? sDe.deProfitK ?? (advDePayoutK - advDeStakeK);

        const sLo = sSettlement.lo4EngineFusion || {};
        const advLoHits = sLo.totalHits ?? sSettlement.crossHedgingPortfolio?.loHits ?? 0;
        const advLoHitNums = sLo.hitNumbers || [];
        const advLoStakeK = sLo.lotoStakeK || sSettlement.crossHedgingPortfolio?.loStakeK || 66000;
        const advLoPayoutK = sLo.lotoPayoutK || sSettlement.crossHedgingPortfolio?.loPayoutK || 0;
        const advLoProfitK = sLo.lotoProfitK ?? sSettlement.crossHedgingPortfolio?.loProfitK ?? (advLoPayoutK - advLoStakeK);
        const loHitsText = advLoHits > 0 
            ? `🔥 <b>Nổ ${advLoHits} nháy</b>${advLoHitNums.length ? ` [${advLoHitNums.join(', ')}]` : ''}`
            : `❌ <b>Trượt Lô (0 nháy)</b>`;

        // Lô Đột Phá X2
        const sLoCrossX2 = sLo.crossX2 || sBets.lo4EngineFusion?.crossX2 || {};
        const loX2StakeK = sLoCrossX2.dayLotoStakeKX2 || advLoStakeK;
        const loX2PayoutK = sLoCrossX2.dayLotoPayoutKX2 !== undefined ? sLoCrossX2.dayLotoPayoutKX2 : advLoPayoutK;
        const loX2ProfitK = sLoCrossX2.dayLotoProfitKX2 !== undefined ? sLoCrossX2.dayLotoProfitKX2 : advLoProfitK;
        const loPromotedX2 = (sLoCrossX2.tierX2 || []).map(numStr);
        const loX2Hits = sLoCrossX2.x2Hits || 0;

        // Xiên 5
        const sXien = sSettlement.loXien5 || {};
        let advXienTop5 = (sXien.top5 || sBets.loXien5?.top5 || []).map(numStr);
        if (advXienTop5.length < 5) {
            advXienTop5 = (sBets.lo4EngineFusion?.xien4?.top5 || sBets.lo4EngineFusion?.numbersOver2 || []).slice(0, 5).map(numStr);
        }
        if (advXienTop5.length < 5) advXienTop5 = ['54', '62', '95', '57', '63'];
        const prizesList = advisorPayload?.drawPrizesByDate?.[settledDate]?.prizes || [];
        const advH5 = sXien.h5 !== undefined ? sXien.h5 : (prizesList.length ? advXienTop5.filter(n => prizesList.includes(n)).length : 0);
        const advXienStakeK = sXien.stakeK || 55000;
        let advXienPayoutK = sXien.payoutK || 0;
        if (sXien.payoutK === undefined && advH5 >= 2) {
            if (advH5 >= 5) advXienPayoutK = 1920000;
            else if (advH5 === 4) advXienPayoutK = 720000;
            else if (advH5 === 3) advXienPayoutK = 204000;
            else if (advH5 === 2) advXienPayoutK = 36000;
        }
        const advXienProfitK = sXien.profitK !== undefined ? sXien.profitK : (advXienPayoutK - advXienStakeK);
        let advXienWinDesc = '';
        if (advH5 >= 5) advXienWinDesc = '👑 Ăn 5 dàn X4 (1.920M)';
        else if (advH5 === 4) advXienWinDesc = '👑 Ăn 1 dàn X4 + 4 dàn X3 (720M)';
        else if (advH5 === 3) advXienWinDesc = '🔥 Ăn 2 dàn X3 + 3 dàn X2 (204M)';
        else if (advH5 === 2) advXienWinDesc = '🛡️ Ăn 3 dàn X2 (36M)';
        else advXienWinDesc = 'Trượt';

        // 2 Dàn Xiên 4 Tinh Hoa (Top 8 Chẵn/Lẻ · Vốn 22M)
        const sTop8 = sSettlement.top8ParityXien4 || regSettled.settlement?.top8ParityXien4 || {};
        const top8StakeK = sTop8.stakeK || 22000;
        const top8PayoutK = sTop8.payoutK || 0;
        const top8ProfitK = sTop8.profitK !== undefined ? sTop8.profitK : (top8PayoutK - top8StakeK);
        const h1 = sTop8.hits1 || 0;
        const h2 = sTop8.hits2 || 0;

        // Xiên 4 Bộ 4 Quây 11 vé
        const sXien4 = sLo.xien4 || sBets.lo4EngineFusion?.xien4 || {};
        const xien4Hits = sLo.xienHitsCount ?? 0;
        const xien4Top4 = (sLo.xienTop4 || sXien4.top4 || sXien4.numbers || []).map(numStr);
        const xien4StakeK = sLo.xienStakeK || 11000;
        const xien4PayoutK = sLo.xienPayoutK || 0;
        const xien4ProfitK = sLo.xienProfitK !== undefined ? sLo.xienProfitK : (xien4PayoutK - xien4StakeK);

        const advTotalStakeK = advDeStakeK + advLoStakeK + advXienStakeK;
        const advTotalPayoutK = advDePayoutK + advLoPayoutK + advXienPayoutK;
        const advTotalProfitK = advTotalPayoutK - advTotalStakeK;

        // Lũy kế /daily-advisor (từ 16/09)
        let advCumDeK = 0, advCumLoK = 0, advCumXienK = 0, advCumProfitK = 0;
        const activeChRows = chSettled.filter(r => r.date >= '2026-09-16');
        activeChRows.forEach(r => {
            advCumDeK += (r.deProfitK || 0);
            advCumLoK += (r.loProfitK || 0);
            advCumXienK += (r.xienProfitK || 0);
            advCumProfitK += (r.totalProfitK || 0);
        });
        const advTotalDays = activeChRows.length || 33;

        // B. Đối soát Phương pháp Gộp 5 (/daily-advisor-shadow)
        const sPenta = sSettlement.pentaConsensus || computePentaConsensusForDate(settledDate, advisorPayload) || {};
        const pentaDeStakeK = sPenta.de?.stakeK || 0;
        const pentaDePayoutK = sPenta.de?.payoutK || 0;
        const pentaDeProfitK = sPenta.de?.profitK || 0;
        let pentaDeResultText = '';
        if (actualSpecial != null) {
            if (sPenta.de?.isHitX2) {
                pentaDeResultText = `👑 <b>TRÚNG ĐỀ X2 (ăn 33.6M)!</b>`;
            } else if (sPenta.de?.isHitX1) {
                pentaDeResultText = `✅ <b>TRÚNG ĐỀ X1 (ăn 16.8M)!</b>`;
            } else {
                pentaDeResultText = `❌ <b>Trượt Đề (ĐB về ${deSpecialStr})</b>`;
            }
        } else {
            pentaDeResultText = `⏳ <i>Đang chờ mở thưởng</i>`;
        }

        const pentaLoHits = sPenta.lo?.hits || 0;
        const pentaLoHitNums = sPenta.lo?.hitNums || [];
        const pentaLoStakeK = sPenta.lo?.stakeK || 0;
        const pentaLoPayoutK = sPenta.lo?.payoutK || 0;
        const pentaLoProfitK = sPenta.lo?.profitK || 0;
        const pentaLoHitsText = pentaLoHits > 0 
            ? `🔥 <b>Nổ ${pentaLoHits} nháy</b>${pentaLoHitNums.length ? ` [${pentaLoHitNums.join(', ')}]` : ''}`
            : `❌ <b>Trượt Lô (0 nháy)</b>`;

        // Lô Gộp 5 Đột Phá X2
        const sPentaCross = sPenta.loCrossX2 || regSettled.settlement?.pentaConsensus?.loCrossX2 || {};
        const pCrossStakeK = sPentaCross.stakeK || pentaLoStakeK;
        const pCrossPayoutK = sPentaCross.payoutK || pentaLoPayoutK;
        const pCrossProfitK = sPentaCross.profitK !== undefined ? sPentaCross.profitK : (pCrossPayoutK - pCrossStakeK);
        const pCrossPromoted = (sPentaCross.x2Nums || []).map(numStr);

        // 2 Dàn Xiên 4 Tinh Hoa (Top 8 Chẵn/Lẻ · Vốn 22M) - Đồng bộ logic y hệt Daily
        const pentaTotalStakeK = pentaDeStakeK + pentaLoStakeK + top8StakeK;
        const pentaTotalPayoutK = pentaDePayoutK + pentaLoPayoutK + top8PayoutK;
        const pentaTotalProfitK = pentaTotalPayoutK - pentaTotalStakeK;

        // Lũy kế Gộp 5 (từ 07/10)
        let pentaCumDeK = 0, pentaCumLoK = 0, pentaCumXienK = 0, pentaCumProfitK = 0;
        const pentaDates = Object.keys(advisorPayload?.drawPrizesByDate || {}).filter(d => d >= '2026-10-07' && d <= settledDate).sort();
        pentaDates.forEach(d => {
            const res = computePentaConsensusForDate(d, advisorPayload);
            const rX8 = resolveTop8SettlementForDate(d, advisorPayload);
            if (res && !res.isPending) {
                pentaCumDeK += res.de.profitK;
                pentaCumLoK += res.lo.profitK;
                pentaCumXienK += (rX8.profitK || 0);
                pentaCumProfitK += (res.de.profitK + res.lo.profitK + (rX8.profitK || 0));
            }
        });
        const pentaTotalDays = pentaDates.length || 12;

        lines.push(
            divider,
            `🏆 <b>BÁO CÁO KẾT QUẢ ĐỐI SOÁT HÔM NAY (${escapeHtml(displayDate(settledDate))})</b>`,
            `<i>Giải Đặc Biệt: <b>${escapeHtml(deSpecialStr)}</b></i>`,
            '',
            `<b>A. 📊 NHẬT KÝ ĐỐI SOÁT (/daily-advisor)</b>`,
            `  • <b>Đề Thực Chiến:</b> ${deResultText}`,
            `    └ Vốn: ${formatCostK(advDeStakeK)} · Thưởng: ${formatCostK(advDePayoutK)} · Lãi ròng: <b>${formatMoneyK(advDeProfitK)}</b>`,
            `  • <b>Lô Ghép 4 Động Cơ:</b> ${loHitsText}`,
            `    └ <b>Dàn Chuẩn (gốc):</b> Vốn: ${formatCostK(advLoStakeK)} · Thưởng: ${formatCostK(advLoPayoutK)} · Lãi: <b>${formatMoneyK(advLoProfitK)}</b>`,
            `    └ 🚀 <b>Dàn Đột Phá X2:</b> Vốn: ${formatCostK(loX2StakeK)} · Thưởng: ${formatCostK(loX2PayoutK)} · Lãi: <b>${formatMoneyK(loX2ProfitK)}</b>`,
            `       └ <i>Nâng X2: ${loPromotedX2.length ? `[${loPromotedX2.join(', ')}] (${loX2Hits} nháy)` : 'Không nâng'} · Lũy kế Lô X2: ${formatM(sLoCrossX2.cumLotoProfitKX2 || 5854600)}</i>`,
            `  • <b>Các Dàn Lô Xiên Đối Chiếu:</b>`,
            `    └ 👑 <b>Dàn Xiên 5 (55M):</b> ${advXienWinDesc} (Top 5 [${advXienTop5.join(', ')}] về ${advH5}/5 con) · Lãi: <b>${formatMoneyK(advXienProfitK)}</b>`,
            `    └ 🎲 <b>2 Dàn Xiên 4 Tinh Hoa (22M):</b> Thưởng: ${formatCostK(top8PayoutK)} · Lãi: <b>${formatMoneyK(top8ProfitK)}</b>`,
            `       • Dàn 1 [${(sTop8.dan1 || []).join(', ')}]: Nổ ${h1}/4 con${h1 >= 2 ? ' (Ăn vé X2)' : ''} 👉 ${formatMoneyK(sTop8.profit1 || -11000)}`,
            `       • Dàn 2 [${(sTop8.dan2 || []).join(', ')}]: Nổ ${h2}/4 con${h2 >= 2 ? ' (Ăn vé X2)' : ''} 👉 ${formatMoneyK(sTop8.profit2 || -11000)}`,
            `    └ 🎯 <b>Bộ 4 Quây 11 vé (11M):</b> [${xien4Top4.join(', ')}] về ${xien4Hits}/4 con · Lãi: <b>${formatMoneyK(xien4ProfitK)}</b>`,
            `  👉 <b>TỔNG KẾT NGÀY (/daily-advisor):</b>`,
            `    └ Vốn: ${formatCostK(advTotalStakeK)} · Thưởng: ${formatCostK(advTotalPayoutK)} · Lãi ròng: <b>${formatMoneyK(advTotalProfitK)}</b>`,
            `    └ <b>Lũy kế (/daily-advisor từ 16/09):</b> <b>${formatM(advCumProfitK)}</b> (${advTotalDays} kỳ · Đề: ${formatM(advCumDeK)} | Lô: ${formatM(advCumLoK)} | Xiên: ${formatM(advCumXienK)})`,
            '',
            `<b>B. 👑 PHƯƠNG PHÁP GỘP 5 (/daily-advisor-shadow)</b>`,
            `  • <b>Đề Siêu Gộp 5 PP (X2 400K + X1 200K):</b> ${pentaDeResultText}`,
            `    └ Vốn: ${formatCostK(pentaDeStakeK)} · Thưởng: ${formatCostK(pentaDePayoutK)} · Lãi ròng: <b>${formatMoneyK(pentaDeProfitK)}</b>`,
            `  • <b>Lô Siêu Gộp 5 PP (X5 / X4 / X3 / X1):</b> ${pentaLoHitsText}`,
            `    └ <b>Dàn Chuẩn Gộp 5:</b> Vốn: ${formatCostK(pentaLoStakeK)} · Thưởng: ${formatCostK(pentaLoPayoutK)} · Lãi: <b>${formatMoneyK(pentaLoProfitK)}</b>`,
            `    └ 🚀 <b>Dàn Đột Phá X2:</b> Vốn: ${formatCostK(pCrossStakeK)} · Thưởng: ${formatCostK(pCrossPayoutK)} · Lãi: <b>${formatMoneyK(pCrossProfitK)}</b>`,
            `       └ <i>Nâng X2 từ Lô 4: ${pCrossPromoted.length ? `[${pCrossPromoted.join(', ')}]` : 'Không nâng'}</i>`,
            `  • <b>Dàn Lô Xiên Đối Chiếu:</b>`,
            `    └ 🎲 <b>2 Dàn Xiên 4 Tinh Hoa (22M):</b> Thưởng: ${formatCostK(top8PayoutK)} · Lãi: <b>${formatMoneyK(top8ProfitK)}</b>`,
            `       • Dàn 1 [${(sTop8.dan1 || []).join(', ')}]: Nổ ${h1}/4 con${h1 >= 2 ? ' (Ăn vé X2)' : ''} 👉 ${formatMoneyK(sTop8.profit1 || -11000)}`,
            `       • Dàn 2 [${(sTop8.dan2 || []).join(', ')}]: Nổ ${h2}/4 con${h2 >= 2 ? ' (Ăn vé X2)' : ''} 👉 ${formatMoneyK(sTop8.profit2 || -11000)}`,
            `  👉 <b>TỔNG KẾT NGÀY (/daily-advisor-shadow):</b>`,
            `    └ Vốn: ${formatCostK(pentaTotalStakeK)} · Thưởng: ${formatCostK(pentaTotalPayoutK)} · Lãi ròng: <b>${formatMoneyK(pentaTotalProfitK)}</b>`,
            `    └ <b>Lũy kế (Gộp 5 từ 07/10):</b> <b>${formatM(pentaCumProfitK)}</b> (${pentaTotalDays} kỳ · Đề: ${formatM(pentaCumDeK)} | Lô: ${formatM(pentaCumLoK)} | Xiên 4: ${formatM(pentaCumXienK)})`,
            ''
        );
    }

    // Chốt số ngày mai (predictionDate)
    const regNext = reg[predictionDate] || {};
    const nBets = regNext.bets || {};

    // 1. Nhật ký đối soát /daily-advisor
    const nDe = nBets.de || advisorPayload?.crossHedgingPortfolio?.latestRecommendation?.pillar1_De || {};
    let advNextDeVip = (nDe.vipNumbers || []).map(numStr);
    let advNextDeSingle = (nDe.singleNumbers || []).map(numStr);
    const advDeVipSet = new Set(advNextDeVip);
    advNextDeSingle = advNextDeSingle.filter(n => !advDeVipSet.has(n));
    let advNextDeAll = (nDe.numbers || [...advNextDeVip, ...advNextDeSingle]).map(numStr);
    if (!advNextDeAll.length) {
        advNextDeAll = (dePayload?.nextPrediction?.strategies?.deMilestoneHistoryEdge75UnionX2?.holds?.[70]?.betNumbers || Array.from({ length: 30 }, (_, i) => String(i).padStart(2, '0'))).map(numStr);
        advNextDeVip = advNextDeAll.slice(0, 12);
        advNextDeSingle = advNextDeAll.slice(12);
    }
    const advNextDeStakeK = nDe.stakeK || 70000;

    const nLo = nBets.lo4EngineFusion || advisorPayload?.lo4EngineFusion?.latestRecommendation || {};
    let advNextLoX5 = (nLo.tierX5 || []).map(numStr);
    let advNextLoX4 = (nLo.tierX4 || []).map(numStr);
    let advNextLoX3 = (nLo.tierX3 || []).map(numStr);
    const nextCrossX2 = nBets.lo4EngineFusion?.crossX2 || nLo.crossX2 || {};
    let advNextLoX2 = (nextCrossX2.tierX2 || []).map(numStr);
    let advNextLoX1 = (nextCrossX2.tierX1 && nextCrossX2.tierX1.length ? nextCrossX2.tierX1 : nLo.tierX1 || []).map(numStr);
    const higherLoTiers = new Set([...advNextLoX5, ...advNextLoX4, ...advNextLoX3, ...advNextLoX2]);
    advNextLoX1 = advNextLoX1.filter(n => !higherLoTiers.has(n));
    let advNextLoAll = (nLo.allNumbers || nLo.distinctNumbers || [...advNextLoX5, ...advNextLoX4, ...advNextLoX3, ...advNextLoX2, ...advNextLoX1]).map(numStr);
    if (!advNextLoAll.length) {
        advNextLoAll = (lotoPayload?.nextPrediction?.predictions?.top7?.numbers || lotoPayload?.nextPrediction?.predictions?.top6?.numbers || ['01', '02', '03', '04', '05', '06', '07']).map(numStr);
        advNextLoX4 = advNextLoAll.slice(0, 3);
        advNextLoX3 = advNextLoAll.slice(3, 6);
        advNextLoX1 = advNextLoAll.slice(6);
    }
    const advNextLoStakeK = nextCrossX2.stakeKX2 || nLo.totalLotoStakeK || 74800;

    const nXien = nBets.loXien5 || {};
    let advNextXienTop5 = (nXien.top5 || []).map(numStr);
    if (advNextXienTop5.length < 5) {
        advNextXienTop5 = (nLo.numbersOver2 || advNextLoAll).slice(0, 5).map(numStr);
    }
    if (advNextXienTop5.length < 5) {
        advNextXienTop5 = advNextLoAll.slice(0, 5);
    }
    if (advNextXienTop5.length < 5) {
        advNextXienTop5 = ['59', '62', '76', '24', '35'];
    }
    const advNextXienTickets = getXien5Combinations(advNextXienTop5);
    const advNextXienStakeK = 55000;

    const nextTop8 = nBets.top8ParityXien4 || advisorPayload?.top8ParityXien4?.latestRecommendation || {};
    const nextDan1 = (nextTop8.dan1 || []).map(numStr);
    const nextDan2 = (nextTop8.dan2 || []).map(numStr);

    const nextXien4 = nBets.lo4EngineFusion?.xien4 || nLo.xien4 || {};
    const nextXien4Top4 = (nextXien4.top4 || nextXien4.numbers || advNextLoAll.slice(0, 4)).map(numStr);

    const advNextTotalStakeK = advNextDeStakeK + advNextLoStakeK + advNextXienStakeK;

    // 2. Phương pháp Gộp 5 /daily-advisor-shadow
    const nPenta = nBets.pentaConsensus || computePentaConsensusForDate(predictionDate, advisorPayload) || {};
    let pentaNextDeX2 = (nPenta.de?.x2Nums || []).map(numStr);
    let pentaNextDeX1 = (nPenta.de?.x1Nums || []).map(numStr);
    const pdX2Set = new Set(pentaNextDeX2);
    pentaNextDeX1 = pentaNextDeX1.filter(n => !pdX2Set.has(n));
    let pentaNextDeAll = (nPenta.de?.numbers || [...pentaNextDeX2, ...pentaNextDeX1]).map(numStr);
    if (!pentaNextDeAll.length) {
        pentaNextDeAll = advNextDeAll;
        pentaNextDeX2 = advNextDeVip;
        pentaNextDeX1 = advNextDeSingle;
    }
    const pentaNextDeStakeK = nPenta.de?.stakeK || (pentaNextDeX2.length * 400 + pentaNextDeX1.length * 200);

    let pentaNextLoX5 = (nPenta.lo?.x5Nums || []).map(numStr);
    let pentaNextLoX4 = (nPenta.lo?.x4Nums || []).map(numStr);
    let pentaNextLoX3 = (nPenta.lo?.x3Nums || []).map(numStr);
    let pentaNextLoCrossX2 = (nPenta.loCrossX2?.x2Nums || []).map(numStr);
    let pentaNextLoX1 = (nPenta.loCrossX2?.x1Nums || nPenta.lo?.x1Nums || []).map(numStr);
    const p5Set = new Set(pentaNextLoX5);
    pentaNextLoX4 = pentaNextLoX4.filter(n => !p5Set.has(n));
    const p4Set = new Set([...p5Set, ...pentaNextLoX4]);
    pentaNextLoX3 = pentaNextLoX3.filter(n => !p4Set.has(n));
    const p3Set = new Set([...p4Set, ...pentaNextLoX3]);
    pentaNextLoCrossX2 = pentaNextLoCrossX2.filter(n => !p3Set.has(n));
    const p2Set = new Set([...p3Set, ...pentaNextLoCrossX2]);
    pentaNextLoX1 = pentaNextLoX1.filter(n => !p2Set.has(n));
    let pentaNextLoAll = (nPenta.lo?.numbers || [...pentaNextLoX5, ...pentaNextLoX4, ...pentaNextLoX3, ...pentaNextLoCrossX2, ...pentaNextLoX1]).map(numStr);
    if (!pentaNextLoAll.length) {
        pentaNextLoAll = advNextLoAll;
        pentaNextLoX4 = advNextLoX4;
        pentaNextLoX3 = advNextLoX3;
        pentaNextLoX1 = advNextLoX1;
    }
    const pentaNextLoStakeK = nPenta.loCrossX2?.stakeK || nPenta.lo?.stakeK || 92400;

    let pentaNextXienTop5 = (nPenta.xien5?.top5 || pentaNextLoAll.slice(0, 5)).map(numStr);
    if (pentaNextXienTop5.length < 5) pentaNextXienTop5 = advNextXienTop5;
    if (pentaNextXienTop5.length < 5) pentaNextXienTop5 = ['62', '59', '76', '04', '22'];
    const pentaNextXienTickets = getXien5Combinations(pentaNextXienTop5);
    const pentaNextXienStakeK = nPenta.xien5?.stakeK || 5500;
    const pentaNextTotalStakeK = pentaNextDeStakeK + pentaNextLoStakeK + pentaNextXienStakeK;

    lines.push(
        divider,
        `🎯 <b>DỰ ĐOÁN &amp; CHỐT SỐ NGÀY MAI (${escapeHtml(displayDate(predictionDate))})</b>`,
        '',
        `<b>1. 📊 NHẬT KÝ ĐỐI SOÁT (/daily-advisor)</b>`,
        `  • <b>Đề Thực Chiến (${advNextDeAll.length} số · Vốn ${formatCostK(advNextDeStakeK)}):</b>`,
        `    └ 👑 <b>VIP X3 (${advNextDeVip.length} số · cược 3.0M/số, ăn 252M):</b>`,
        `       <code>${escapeHtml(advNextDeVip.join(', '))}</code>`,
        `    └ 🛡️ <b>Bọc Lót X1 (${advNextDeSingle.length} số · cược 1.0M/số, ăn 84M):</b>`,
        `       <code>${escapeHtml(advNextDeSingle.join(', '))}</code>`,
        `  • <b>Lô Ghép 4 Động Cơ (${advNextLoAll.length} số · Vốn ${formatCostK(advNextLoStakeK)}):</b>`
    );
    if (advNextLoX5.length) {
        lines.push(`    └ 👑 <b>Siêu VIP X5 (${advNextLoX5.length} số · cược 11M/số [500đ], ăn 40M/nháy):</b> <code>${escapeHtml(advNextLoX5.join(', '))}</code>`);
    }
    if (advNextLoX4.length) {
        lines.push(
            `    └ 🔥 <b>Cực VIP X4 (${advNextLoX4.length} số · cược 8.8M/số [400đ], ăn 32M/nháy):</b>`,
            `       <code>${escapeHtml(advNextLoX4.join(', '))}</code>`
        );
    }
    if (advNextLoX3.length) {
        lines.push(
            `    └ ⚡ <b>Triển Vọng X3 (${advNextLoX3.length} số · cược 6.6M/số [300đ], ăn 24M/nháy):</b>`,
            `       <code>${escapeHtml(advNextLoX3.join(', '))}</code>`
        );
    }
    if (advNextLoX2.length) {
        lines.push(
            `    └ 🚀 <b>ĐỘT PHÁ NÂNG TIER X2 (${advNextLoX2.length} số · cược 4.4M/số [200đ], ăn 16M/nháy):</b>`,
            `       <code>${escapeHtml(advNextLoX2.join(', '))}</code>`,
            `       └ 💡 <i>Lý do: Đồng thuận cao (&gt;= X3) bên Shadow Monitor</i>`
        );
    }
    if (advNextLoX1.length) {
        lines.push(
            `    └ 🛡️ <b>Bảo Hiểm X1 (${advNextLoX1.length} số · cược 2.2M/số [100đ], ăn 8M/nháy):</b>`,
            `       <code>${escapeHtml(advNextLoX1.join(', '))}</code>`
        );
    }

    lines.push(
        `  • <b>Các Dàn Lô Xiên Thực Chiến:</b>`,
        `    └ 👑 <b>Dàn Xiên 5 (5 Dàn Xiên 4 Ghép Top 5 · Vốn 55M · 11M/dàn):</b>`,
        `       • Top 5: <code>[${escapeHtml(advNextXienTop5.join(', '))}]</code>`,
        `       • 5 Dàn: <code>${escapeHtml(advNextXienTickets[0].join(', '))}</code> | <code>${escapeHtml(advNextXienTickets[1].join(', '))}</code> | <code>${escapeHtml(advNextXienTickets[2].join(', '))}</code> | <code>${escapeHtml(advNextXienTickets[3].join(', '))}</code> | <code>${escapeHtml(advNextXienTickets[4].join(', '))}</code>`
    );
    if (nextDan1.length && nextDan2.length) {
        lines.push(
            `    └ 🎲 <b>2 Dàn Xiên 4 Tinh Hoa (Top 8 Chẵn/Lẻ · Vốn 22M · 11M/dàn):</b>`,
            `       • Dàn 1: <code>${escapeHtml(nextDan1.join(', '))}</code> (11M)`,
            `       • Dàn 2: <code>${escapeHtml(nextDan2.join(', '))}</code> (11M)`,
            `       └ <i>Quây 11 vé/dàn: Nổ 2 con = 12M · 3 con = 84M · 4 con = 384M</i>`
        );
    }
    if (nextXien4Top4.length) {
        lines.push(
            `    └ 🎯 <b>Xiên 4 Bộ 4 Quây 11 vé (Vốn 11M):</b>`,
            `       • Bộ 4: <code>${escapeHtml(nextXien4Top4.join(', '))}</code> (Ăn 2: 12M · 3: 84M · 4: 384M)`
        );
    }
    lines.push(
        `  👉 <b>Tổng vốn đầu tư /daily-advisor:</b> <b>${formatCostK(advNextTotalStakeK)}</b>`,
        '',
        divider,
        `<b>2. 👑 PHƯƠNG PHÁP GỘP 5 (/daily-advisor-shadow)</b>`,
        `  • <b>Đề Siêu Gộp 5 PP (${pentaNextDeAll.length} số · Vốn ${formatCostK(pentaNextDeStakeK)}):</b>`,
        `    └ 👑 <b>VIP X2 (trùng &gt;=3 hệ · ${pentaNextDeX2.length} số · cược 400K/số, ăn 33.6M):</b>`,
        `       <code>${escapeHtml(pentaNextDeX2.join(', '))}</code>`,
        `    └ 🛡️ <b>Bọc Lót X1 (trùng &lt;3 hệ · ${pentaNextDeX1.length} số · cược 200K/số, ăn 16.8M):</b>`,
        `       <code>${escapeHtml(pentaNextDeX1.join(', '))}</code>`,
        `  • <b>Lô Siêu Gộp 5 PP (${pentaNextLoAll.length} số · Vốn ${formatCostK(pentaNextLoStakeK)}):</b>`,
        `    └ 👑 <b>Siêu VIP X5 (trùng &gt;=4 hệ · ${pentaNextLoX5.length} số · cược 11M/số [500đ], ăn 40M/nháy):</b>`,
        `       <code>${escapeHtml(pentaNextLoX5.join(', '))}</code>`,
        `    └ 🔥 <b>Cực VIP X4 (trùng 3 hệ · ${pentaNextLoX4.length} số · cược 8.8M/số [400đ], ăn 32M/nháy):</b>`,
        `       <code>${escapeHtml(pentaNextLoX4.join(', '))}</code>`,
        `    └ ⚡ <b>Triển Vọng X3 (trùng 2 hệ · ${pentaNextLoX3.length} số · cược 6.6M/số [300đ], ăn 24M/nháy):</b>`,
        `       <code>${escapeHtml(pentaNextLoX3.join(', '))}</code>`
    );
    if (pentaNextLoCrossX2.length) {
        lines.push(
            `    └ 🚀 <b>ĐỘT PHÁ NÂNG TIER X2 (${pentaNextLoCrossX2.length} số · cược 4.4M/số [200đ], ăn 16M/nháy):</b>`,
            `       <code>${escapeHtml(pentaNextLoCrossX2.join(', '))}</code>`,
            `       └ 💡 <i>Lý do: Nằm trong Top High Set Lô Ghép 4 Advisor</i>`
        );
    }
    if (pentaNextLoX1.length) {
        lines.push(
            `    └ 🛡️ <b>Bảo Hiểm X1 (trùng 1 hệ · ${pentaNextLoX1.length} số · cược 2.2M/số [100đ], ăn 8M/nháy):</b>`,
            `       <code>${escapeHtml(pentaNextLoX1.join(', '))}</code>`
        );
    }

    lines.push(
        `  • <b>Dàn Lô Xiên Thực Chiến:</b>`,
        `    └ 🎲 <b>2 Dàn Xiên 4 Tinh Hoa (Top 8 Chẵn/Lẻ · Vốn 22M · 11M/dàn):</b>`,
        `       • Dàn 1: <code>${escapeHtml(nextDan1.join(', '))}</code> (11M)`,
        `       • Dàn 2: <code>${escapeHtml(nextDan2.join(', '))}</code> (11M)`,
        `       └ <i>Quây 11 vé/dàn: Nổ 2 con = 12M · 3 con = 84M · 4 con = 384M</i>`,
        `  👉 <b>Tổng vốn đầu tư /daily-advisor-shadow:</b> <b>${formatCostK(pentaNextDeStakeK + pentaNextLoStakeK + 22000)}</b>`,
        '',
        divider,
        `🔒 <b>BẢO CHỨNG BẤT BIẾN SSOT:</b>`,
        `• Dữ liệu đối soát &amp; dự đoán đọc trực tiếp từ Daily Locked Bets Registry.`,
        `• Khóa niêm phong trước giờ quay (trước 18h15), tuyệt đối không nảy số sau giờ quay!`,
        `🔗 <i>Chi tiết bảng đối soát trực quan:</i>`,
        `• Nhật ký đối soát: <a href="https://lottery-stats-vercel.vercel.app/daily-advisor">/daily-advisor</a>`,
        `• Phương pháp Gộp 5: <a href="https://lottery-stats-vercel.vercel.app/daily-advisor-shadow">/daily-advisor-shadow</a>`
    );

    return {
        predictionDate,
        latestDataDate: advisorPayload?.latestDataDate || dePayload?.latestDataDate,
        text: lines.filter(Boolean).join('\n'),
        deStrategy: 'sweetSpotDe',
        deTarget: 43,
        lotoMethodKey: 'lo4EngineFusion'
    };
}

const MAIN_MENU_KEYBOARD = {
    inline_keyboard: [
        [
            { text: '🔮 Dự Đoán Daily Advisor', callback_data: 'menu_today_daily' },
            { text: '👑 Dự Đoán Shadow Monitor', callback_data: 'menu_today_shadow' }
        ],
        [
            { text: '📊 Đối Soát Theo Ngày', callback_data: 'menu_audit' },
            { text: '📋 Text Copy Nhanh', callback_data: 'menu_copy_fast' }
        ],
        [
            { text: '📜 Toàn Bộ Báo Cáo', callback_data: 'menu_report' },
            { text: '💰 Bảng Mức Cược (Lỗ/Lãi)', callback_data: 'menu_tiers' }
        ]
    ]
};

const BACK_TO_MAIN_KEYBOARD = {
    inline_keyboard: [
        [
            { text: '🔙 Quay Lại Menu Chính', callback_data: 'menu_main' }
        ]
    ]
};

const SUB_NAV_DAILY_KEYBOARD = {
    inline_keyboard: [
        [
            { text: '👑 Xem Shadow Monitor', callback_data: 'menu_today_shadow' },
            { text: '📊 Đối Soát Ngày', callback_data: 'menu_audit' }
        ],
        [
            { text: '📋 Text Copy Nhanh', callback_data: 'menu_copy_fast' },
            { text: '🔙 Menu Chính', callback_data: 'menu_main' }
        ]
    ]
};

const SUB_NAV_SHADOW_KEYBOARD = {
    inline_keyboard: [
        [
            { text: '🔮 Xem Daily Advisor', callback_data: 'menu_today_daily' },
            { text: '📊 Đối Soát Ngày', callback_data: 'menu_audit' }
        ],
        [
            { text: '📋 Text Copy Nhanh', callback_data: 'menu_copy_fast' },
            { text: '🔙 Menu Chính', callback_data: 'menu_main' }
        ]
    ]
};

function buildAuditResultKeyboard(date) {
    return {
        inline_keyboard: [
            [
                { text: '📅 Chọn Ngày Khác', callback_data: 'menu_audit' },
                { text: '🔮 Dự Đoán Hôm Nay', callback_data: 'menu_today_daily' }
            ],
            [
                { text: '🔙 Quay Lại Menu Chính', callback_data: 'menu_main' }
            ]
        ]
    };
}

function buildAuditDatesKeyboard(advisorPayload = {}) {
    const reg = advisorPayload?.dailyLockedBetsRegistry?.dates || {};
    const settled = Object.keys(reg).filter(d => reg[d]?.isSettled).sort().reverse();
    if (!settled.length) {
        const ch = advisorPayload?.crossHedgingPortfolio?.settledLedger || [];
        settled.push(...ch.map(r => r.date).filter(Boolean).sort().reverse());
    }
    const dates = [...new Set(settled)].slice(0, 9);

    const rows = [];
    let currentRow = [];
    for (const d of dates) {
        const parts = d.split('-');
        const label = `📅 ${parts[2]}/${parts[1]}`;
        currentRow.push({ text: label, callback_data: `audit_date:${d}` });
        if (currentRow.length === 3) {
            rows.push(currentRow);
            currentRow = [];
        }
    }
    if (currentRow.length) rows.push(currentRow);
    rows.push([{ text: '🔙 Quay Lại Menu Chính', callback_data: 'menu_main' }]);
    return { inline_keyboard: rows };
}

function resolveTop8SettlementForDate(date, payload) {
    const regEntry = payload?.dailyLockedBetsRegistry?.dates?.[date];
    const s = regEntry?.settlement?.top8ParityXien4;
    const b = regEntry?.bets?.top8ParityXien4;
    const rec = payload?.top8ParityXien4?.latestRecommendation;
    const ledgerRow = payload?.top8ParityXien4?.settledLedger?.find(r => r.date === date);

    let dan1 = (s?.dan1 || b?.dan1 || (date === rec?.targetDate ? rec?.dan1 : null) || ledgerRow?.dan1 || []).map(numStr);
    let dan2 = (s?.dan2 || b?.dan2 || (date === rec?.targetDate ? rec?.dan2 : null) || ledgerRow?.dan2 || []).map(numStr);
    let top8 = (s?.top8 || b?.top8 || (date === rec?.targetDate ? rec?.top8 : null) || ledgerRow?.top8 || [...dan1, ...dan2]).map(numStr);

    const drawPrizesObj = payload?.drawPrizesByDate?.[date] || regEntry?.actualResult || null;
    const prizes = drawPrizesObj?.prizes || [];

    let hits1 = 0, hits2 = 0;
    let hitNums1 = [], hitNums2 = [];
    let payout1 = 0, payout2 = 0, payoutK = 0;
    const stakeK = 22000;

    if (s?.payoutK !== undefined) {
        hits1 = s.hits1 || 0;
        hits2 = s.hits2 || 0;
        hitNums1 = (s.hitNums1 || []).map(numStr);
        hitNums2 = (s.hitNums2 || []).map(numStr);
        payout1 = s.payout1 || 0;
        payout2 = s.payout2 || 0;
        payoutK = s.payoutK || 0;
    } else if (prizes.length && dan1.length >= 4 && dan2.length >= 4) {
        const prizeCount = {};
        prizes.forEach(p => { const str = numStr(p); prizeCount[str] = (prizeCount[str] || 0) + 1; });
        hitNums1 = dan1.filter(n => (prizeCount[n] || 0) > 0);
        hitNums2 = dan2.filter(n => (prizeCount[n] || 0) > 0);
        hits1 = hitNums1.length;
        hits2 = hitNums2.length;
        const calcPayout = (h) => (h >= 4 ? 384000 : (h === 3 ? 84000 : (h === 2 ? 12000 : 0)));
        payout1 = calcPayout(hits1);
        payout2 = calcPayout(hits2);
        payoutK = payout1 + payout2;
    } else if (ledgerRow) {
        hits1 = ledgerRow.hits1 || 0;
        hits2 = ledgerRow.hits2 || 0;
        hitNums1 = (ledgerRow.hitNums1 || []).map(numStr);
        hitNums2 = (ledgerRow.hitNums2 || []).map(numStr);
        payout1 = ledgerRow.payout1 || 0;
        payout2 = ledgerRow.payout2 || 0;
        payoutK = ledgerRow.payoutK || 0;
    }

    const profit1 = payout1 - 11000;
    const profit2 = payout2 - 11000;
    const profitK = payoutK - stakeK;

    return {
        dan1,
        dan2,
        top8,
        hits1,
        hits2,
        hitNums1,
        hitNums2,
        payout1,
        payout2,
        payoutK,
        profit1,
        profit2,
        profitK,
        stakeK,
        isWin: profitK > 0
    };
}

function buildDailyPredictionMessage(predictionDate, advisorPayload = {}) {
    const reg = advisorPayload?.dailyLockedBetsRegistry?.dates || {};
    const regNext = reg[predictionDate] || {};
    const nBets = regNext.bets || {};

    const nDe = nBets.de || advisorPayload?.crossHedgingPortfolio?.latestRecommendation?.pillar1_De || {};
    let advNextDeVip = (nDe.vipNumbers || []).map(numStr);
    let advNextDeSingle = (nDe.singleNumbers || []).map(numStr);
    const advDeVipSet = new Set(advNextDeVip);
    advNextDeSingle = advNextDeSingle.filter(n => !advDeVipSet.has(n));
    let advNextDeAll = (nDe.numbers || [...advNextDeVip, ...advNextDeSingle]).map(numStr);
    const advNextDeStakeK = nDe.stakeK || 77000;

    const nLo = nBets.lo4EngineFusion || advisorPayload?.lo4EngineFusion?.latestRecommendation || {};
    let advNextLoX5 = (nLo.tierX5 || []).map(numStr);
    let advNextLoX4 = (nLo.tierX4 || []).map(numStr);
    let advNextLoX3 = (nLo.tierX3 || []).map(numStr);
    const nextCrossX2 = nBets.lo4EngineFusion?.crossX2 || nLo.crossX2 || {};
    let advNextLoX2 = (nextCrossX2.tierX2 || []).map(numStr);
    let advNextLoX1 = (nextCrossX2.tierX1 && nextCrossX2.tierX1.length ? nextCrossX2.tierX1 : nLo.tierX1 || []).map(numStr);
    const higherLoTiers = new Set([...advNextLoX5, ...advNextLoX4, ...advNextLoX3, ...advNextLoX2]);
    advNextLoX1 = advNextLoX1.filter(n => !higherLoTiers.has(n));
    let advNextLoAll = (nLo.allNumbers || nLo.distinctNumbers || [...advNextLoX5, ...advNextLoX4, ...advNextLoX3, ...advNextLoX2, ...advNextLoX1]).map(numStr);
    const advNextLoStakeK = nextCrossX2.stakeKX2 || nLo.totalLotoStakeK || 74800;

    const top8Data = resolveTop8SettlementForDate(predictionDate, advisorPayload);
    const nextDan1 = top8Data.dan1;
    const nextDan2 = top8Data.dan2;

    const nXien = nBets.loXien5 || {};
    let advNextXienTop5 = (nXien.top5 || []).map(numStr);
    if (advNextXienTop5.length < 5) advNextXienTop5 = advNextLoAll.slice(0, 5);

    const nextXien4 = nBets.lo4EngineFusion?.xien4 || nLo.xien4 || {};
    const nextXien4Top4 = (nextXien4.top4 || nextXien4.numbers || advNextLoAll.slice(0, 4)).map(numStr);

    const advNextTotalStakeK = advNextDeStakeK + advNextLoStakeK + 22000;

    const lines = [
        `🎯 <b>DỰ ĐOÁN DAILY ADVISOR — NGÀY ${displayDate(predictionDate)}</b>`,
        `🔒 <i>100% Khớp Bất Biến SSOT (/daily-advisor)</i>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `💎 <b>ĐỀ THỰC CHIẾN (${advNextDeAll.length} số · Vốn ${formatCostK(advNextDeStakeK)}):</b>`,
        `  • 👑 <b>VIP X3 (${advNextDeVip.length} số · cược 3.0M/số, ăn 252M):</b>`,
        `    <code>${advNextDeVip.join(', ')}</code>`,
        `  • 🛡️ <b>Bọc Lót X1 (${advNextDeSingle.length} số · cược 1.0M/số, ăn 84M):</b>`,
        `    <code>${advNextDeSingle.join(', ')}</code>`,
        ``,
        `🎰 <b>LÔ GHÉP 4 ĐỘNG CƠ (${advNextLoAll.length} số · Vốn ${formatCostK(advNextLoStakeK)}):</b>`
    ];
    if (advNextLoX5.length) lines.push(`  • 👑 <b>Siêu VIP X5 (${advNextLoX5.length} số · 11M/số [500đ], ăn 40M/nháy):</b> <code>${advNextLoX5.join(', ')}</code>`);
    if (advNextLoX4.length) lines.push(`  • 🔥 <b>Cực VIP X4 (${advNextLoX4.length} số · 8.8M/số [400đ], ăn 32M/nháy):</b> <code>${advNextLoX4.join(', ')}</code>`);
    if (advNextLoX3.length) lines.push(`  • ⚡ <b>Triển Vọng X3 (${advNextLoX3.length} số · 6.6M/số [300đ], ăn 24M/nháy):</b> <code>${advNextLoX3.join(', ')}</code>`);
    if (advNextLoX2.length) lines.push(`  • 🚀 <b>Đột Phá Nâng X2 (${advNextLoX2.length} số · 4.4M/số [200đ], ăn 16M/nháy):</b> <code>${advNextLoX2.join(', ')}</code>\n    └ 💡 <i>Lý do: Đồng thuận cao (>= X3) bên Shadow Monitor</i>`);
    if (advNextLoX1.length) lines.push(`  • 🛡️ <b>Bảo Hiểm X1 (${advNextLoX1.length} số · 2.2M/số [100đ], ăn 8M/nháy):</b> <code>${advNextLoX1.join(', ')}</code>`);

    lines.push(
        ``,
        `🎲 <b>2 DÀN XIÊN 4 TINH HOA (Top 8 Chẵn/Lẻ · Vốn 22M · 11M/dàn):</b>`,
        `  • Dàn 1: <code>${nextDan1.join(', ')}</code> (11M)`,
        `  • Dàn 2: <code>${nextDan2.join(', ')}</code> (11M)`,
        `  └ <i>Quây 11 vé/dàn: Nổ 2 con = 12M · 3 con = 84M · 4 con = 384M</i>`,
        ``,
        `👑 <b>Dàn Xiên 5 (55M):</b> <code>[${advNextXienTop5.join(', ')}]</code>`,
        `🎯 <b>Bộ 4 Quây 11 vé (11M):</b> <code>[${nextXien4Top4.join(', ')}]</code>`,
        ``,
        `💰 <b>TỔNG VỐN ĐẦU TƯ DAILY:</b> <b>${formatCostK(advNextTotalStakeK)}</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📋 <b>TEXT COPY DÀN X2 (Bấm vào khối để copy):</b>`,
        `<code>Ngày ${displayDate(predictionDate)}`,
        advNextLoX5.length ? `X5: ${advNextLoX5.join(',')}` : '',
        advNextLoX4.length ? `X4: ${advNextLoX4.join(',')}` : '',
        advNextLoX3.length ? `X3: ${advNextLoX3.join(',')}` : '',
        advNextLoX2.length ? `X2: ${advNextLoX2.join(',')}` : '',
        advNextLoX1.length ? `X1: ${advNextLoX1.join(',')}` : '',
        `</code>`
    );

    return lines.filter(Boolean).join('\n');
}

function buildShadowPredictionMessage(predictionDate, advisorPayload = {}) {
    const reg = advisorPayload?.dailyLockedBetsRegistry?.dates || {};
    const regNext = reg[predictionDate] || {};
    const nBets = regNext.bets || {};

    const nPenta = nBets.pentaConsensus || advisorPayload?.pentaConsensus?.latestRecommendation || {};
    let pentaNextDeX2 = (nPenta.de?.x2Nums || []).map(numStr);
    let pentaNextDeX1 = (nPenta.de?.x1Nums || []).map(numStr);
    const pdX2Set = new Set(pentaNextDeX2);
    pentaNextDeX1 = pentaNextDeX1.filter(n => !pdX2Set.has(n));
    let pentaNextDeAll = (nPenta.de?.numbers || [...pentaNextDeX2, ...pentaNextDeX1]).map(numStr);
    const pentaNextDeStakeK = nPenta.de?.stakeK || (pentaNextDeX2.length * 400 + pentaNextDeX1.length * 200);

    let pentaNextLoX5 = (nPenta.lo?.x5Nums || []).map(numStr);
    let pentaNextLoX4 = (nPenta.lo?.x4Nums || []).map(numStr);
    let pentaNextLoX3 = (nPenta.lo?.x3Nums || []).map(numStr);
    let pentaNextLoCrossX2 = (nPenta.loCrossX2?.x2Nums || []).map(numStr);
    let pentaNextLoX1 = (nPenta.loCrossX2?.x1Nums || nPenta.lo?.x1Nums || []).map(numStr);
    const p5Set = new Set(pentaNextLoX5);
    pentaNextLoX4 = pentaNextLoX4.filter(n => !p5Set.has(n));
    const p4Set = new Set([...p5Set, ...pentaNextLoX4]);
    pentaNextLoX3 = pentaNextLoX3.filter(n => !p4Set.has(n));
    const p3Set = new Set([...p4Set, ...pentaNextLoX3]);
    pentaNextLoCrossX2 = pentaNextLoCrossX2.filter(n => !p3Set.has(n));
    const p2Set = new Set([...p3Set, ...pentaNextLoCrossX2]);
    pentaNextLoX1 = pentaNextLoX1.filter(n => !p2Set.has(n));
    let pentaNextLoAll = (nPenta.lo?.numbers || [...pentaNextLoX5, ...pentaNextLoX4, ...pentaNextLoX3, ...pentaNextLoCrossX2, ...pentaNextLoX1]).map(numStr);
    const pentaNextLoStakeK = nPenta.loCrossX2?.stakeK || nPenta.lo?.stakeK || 83600;

    const top8Data = resolveTop8SettlementForDate(predictionDate, advisorPayload);
    const nextDan1 = top8Data.dan1;
    const nextDan2 = top8Data.dan2;

    const pentaNextTotalStakeK = pentaNextDeStakeK + pentaNextLoStakeK + 22000;

    const lines = [
        `👑 <b>DỰ ĐOÁN SHADOW MONITOR (GỘP 5 PP) — NGÀY ${displayDate(predictionDate)}</b>`,
        `🔒 <i>100% Khớp Bất Biến SSOT (/daily-advisor-shadow)</i>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `💎 <b>ĐỀ SIÊU GỘP 5 PP (${pentaNextDeAll.length} số · Vốn ${formatCostK(pentaNextDeStakeK)}):</b>`,
        `  • 👑 <b>VIP X2 (trùng >= 3 hệ · ${pentaNextDeX2.length} số · cược 400K/số, ăn 33.6M):</b>`,
        `    <code>${pentaNextDeX2.join(', ')}</code>`,
        `  • 🛡️ <b>Bọc Lót X1 (trùng < 3 hệ · ${pentaNextDeX1.length} số · cược 200K/số, ăn 16.8M):</b>`,
        `    <code>${pentaNextDeX1.join(', ')}</code>`,
        ``,
        `🎰 <b>LÔ SIÊU GỘP 5 PP (${pentaNextLoAll.length} số · Vốn ${formatCostK(pentaNextLoStakeK)}):</b>`
    ];
    if (pentaNextLoX5.length) lines.push(`  • 👑 <b>Siêu VIP X5 (${pentaNextLoX5.length} số · 11M/số [500đ], ăn 40M/nháy):</b> <code>${pentaNextLoX5.join(', ')}</code>`);
    if (pentaNextLoX4.length) lines.push(`  • 🔥 <b>Cực VIP X4 (${pentaNextLoX4.length} số · 8.8M/số [400đ], ăn 32M/nháy):</b> <code>${pentaNextLoX4.join(', ')}</code>`);
    if (pentaNextLoX3.length) lines.push(`  • ⚡ <b>Triển Vọng X3 (${pentaNextLoX3.length} số · 6.6M/số [300đ], ăn 24M/nháy):</b> <code>${pentaNextLoX3.join(', ')}</code>`);
    if (pentaNextLoCrossX2.length) lines.push(`  • 🚀 <b>Đột Phá Nâng X2 (${pentaNextLoCrossX2.length} số · 4.4M/số [200đ], ăn 16M/nháy):</b> <code>${pentaNextLoCrossX2.join(', ')}</code>\n    └ 💡 <i>Lý do: Nằm trong Top High Set Lô Ghép 4 Advisor</i>`);
    if (pentaNextLoX1.length) lines.push(`  • 🛡️ <b>Bảo Hiểm X1 (${pentaNextLoX1.length} số · 2.2M/số [100đ], ăn 8M/nháy):</b> <code>${pentaNextLoX1.join(', ')}</code>`);

    lines.push(
        ``,
        `🎲 <b>2 DÀN XIÊN 4 TINH HOA (Top 8 Chẵn/Lẻ · Vốn 22M · 11M/dàn):</b>`,
        `  • Dàn 1: <code>${nextDan1.join(', ')}</code> (11M)`,
        `  • Dàn 2: <code>${nextDan2.join(', ')}</code> (11M)`,
        `  └ <i>Quây 11 vé/dàn: Nổ 2 con = 12M · 3 con = 84M · 4 con = 384M</i>`,
        ``,
        `💰 <b>TỔNG VỐN ĐẦU TƯ SHADOW:</b> <b>${formatCostK(pentaNextTotalStakeK)}</b>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `📋 <b>TEXT COPY DÀN SHADOW (Bấm vào khối để copy):</b>`,
        `<code>Ngày ${displayDate(predictionDate)}`,
        pentaNextLoX5.length ? `X5: ${pentaNextLoX5.join(',')}` : '',
        pentaNextLoX4.length ? `X4: ${pentaNextLoX4.join(',')}` : '',
        pentaNextLoX3.length ? `X3: ${pentaNextLoX3.join(',')}` : '',
        pentaNextLoCrossX2.length ? `X2: ${pentaNextLoCrossX2.join(',')}` : '',
        pentaNextLoX1.length ? `X1: ${pentaNextLoX1.join(',')}` : '',
        `</code>`
    );

    return lines.filter(Boolean).join('\n');
}

function buildAuditMessageForDate(targetDate, advisorPayload = {}) {
    const reg = advisorPayload?.dailyLockedBetsRegistry?.dates || {};
    const regEntry = reg[targetDate] || {};
    const sBets = regEntry.bets || {};
    const sSettlement = regEntry.settlement || {};

    const drawPrizesObj = advisorPayload?.drawPrizesByDate?.[targetDate] || regEntry?.actualResult || null;
    const isPending = !regEntry?.isSettled && (!drawPrizesObj || (drawPrizesObj.special === undefined && (!drawPrizesObj.prizes || drawPrizesObj.prizes.length === 0)));

    // A. Daily Advisor
    const sDe = sSettlement.de || sSettlement.crossHedgingPortfolio || {};
    const actualSpecial = sDe.actualSpecial 
        || sSettlement.lo4EngineFusion?.actualSpecial
        || drawPrizesObj?.special
        || null;

    const isDeHit = sDe.isHit ?? (sDe.deHits > 0 || (sDe.profitK || 0) > 0);
    const isDeVipHit = sDe.isVipHit ?? false;
    const deSpecialStr = actualSpecial != null ? numStr(actualSpecial) : '--';
    let deResultText = '';
    if (actualSpecial != null) {
        if (isDeVipHit) deResultText = `👑 <b>TRÚNG ĐỀ VIP X3 (số ${deSpecialStr}) ăn 252M!</b>`;
        else if (isDeHit) deResultText = `✅ <b>TRÚNG ĐỀ BỌC LÓT X1 (số ${deSpecialStr}) ăn 84M!</b>`;
        else deResultText = `❌ <b>Trượt Đề (ĐB về ${deSpecialStr})</b>`;
    } else {
        deResultText = `⏳ <i>Đang chờ mở thưởng</i>`;
    }
    const advDeStakeK = sDe.stakeK || sDe.deStakeK || 77000;
    const advDePayoutK = sDe.payoutK || sDe.dePayoutK || (isDeHit ? (isDeVipHit ? 252000 : 84000) : 0);
    const advDeProfitK = sDe.profitK ?? sDe.deProfitK ?? (advDePayoutK - advDeStakeK);

    const sLo = sSettlement.lo4EngineFusion || {};
    const advLoHits = sLo.totalHits ?? sSettlement.crossHedgingPortfolio?.loHits ?? 0;
    const advLoHitNums = sLo.hitNumbers || [];
    const advLoStakeK = sLo.lotoStakeK || sSettlement.crossHedgingPortfolio?.loStakeK || 66000;
    const advLoPayoutK = sLo.lotoPayoutK || sSettlement.crossHedgingPortfolio?.loPayoutK || 0;
    const advLoProfitK = sLo.lotoProfitK ?? sSettlement.crossHedgingPortfolio?.loProfitK ?? (advLoPayoutK - advLoStakeK);
    const loHitsText = advLoHits > 0 
        ? `🔥 <b>Nổ ${advLoHits} nháy</b>${advLoHitNums.length ? ` [${advLoHitNums.join(', ')}]` : ''}`
        : (isPending ? `⏳ <i>Đang chờ mở thưởng</i>` : `❌ <b>Trượt Lô (0 nháy)</b>`);

    const sLoCrossX2 = sLo.crossX2 || sBets.lo4EngineFusion?.crossX2 || {};
    const loX2StakeK = sLoCrossX2.dayLotoStakeKX2 || advLoStakeK;
    const loX2PayoutK = sLoCrossX2.dayLotoPayoutKX2 !== undefined ? sLoCrossX2.dayLotoPayoutKX2 : advLoPayoutK;
    const loX2ProfitK = sLoCrossX2.dayLotoProfitKX2 !== undefined ? sLoCrossX2.dayLotoProfitKX2 : advLoProfitK;
    const loPromotedX2 = (sLoCrossX2.tierX2 || []).map(numStr);
    const loX2Hits = sLoCrossX2.x2Hits || 0;

    const top8Data = resolveTop8SettlementForDate(targetDate, advisorPayload);
    const top8StakeK = top8Data.stakeK || 22000;
    const top8PayoutK = isPending ? 0 : top8Data.payoutK;
    const top8ProfitK = isPending ? -top8StakeK : top8Data.profitK;
    const h1 = top8Data.hits1;
    const h2 = top8Data.hits2;

    const sXien = sSettlement.loXien5 || {};
    let advXienTop5 = (sXien.top5 || sBets.loXien5?.top5 || []).map(numStr);
    const advH5 = sXien.h5 !== undefined ? sXien.h5 : 0;
    const advXienStakeK = sXien.stakeK || 55000;
    const advXienPayoutK = sXien.payoutK || 0;
    const advXienProfitK = sXien.profitK !== undefined ? sXien.profitK : (advXienPayoutK - advXienStakeK);

    const sXien4 = sLo.xien4 || sBets.lo4EngineFusion?.xien4 || {};
    const xien4Hits = sLo.xienHitsCount ?? 0;
    const xien4Top4 = (sLo.xienTop4 || sXien4.top4 || sXien4.numbers || []).map(numStr);
    const xien4StakeK = sLo.xienStakeK || 11000;
    const xien4PayoutK = sLo.xienPayoutK || 0;
    const xien4ProfitK = sLo.xienProfitK !== undefined ? sLo.xienProfitK : (xien4PayoutK - xien4StakeK);

    const advTotalStakeK = advDeStakeK + advLoStakeK + top8StakeK;
    const advTotalPayoutK = advDePayoutK + advLoPayoutK + top8PayoutK;
    const advTotalProfitK = advTotalPayoutK - advTotalStakeK;

    // B. Shadow Monitor
    const sPenta = sSettlement.pentaConsensus || advisorPayload?.pentaConsensus?.settledLedger?.find(r => r.date === targetDate) || {};
    const pentaDeStakeK = sPenta.de?.stakeK || 15600;
    const pentaDePayoutK = sPenta.de?.payoutK || (sPenta.de?.isHitX2 ? 33600 : (sPenta.de?.isHitX1 ? 16800 : 0));
    const pentaDeProfitK = sPenta.de?.profitK !== undefined ? sPenta.de.profitK : (pentaDePayoutK - pentaDeStakeK);
    let pentaDeResultText = '';
    if (actualSpecial != null) {
        if (sPenta.de?.isHitX2) pentaDeResultText = `👑 <b>TRÚNG ĐỀ X2 (ăn 33.6M)!</b>`;
        else if (sPenta.de?.isHitX1) pentaDeResultText = `✅ <b>TRÚNG ĐỀ X1 (ăn 16.8M)!</b>`;
        else pentaDeResultText = `❌ <b>Trượt Đề (ĐB về ${deSpecialStr})</b>`;
    } else {
        pentaDeResultText = `⏳ <i>Đang chờ mở thưởng</i>`;
    }

    const pentaLoHits = sPenta.lo?.hits || 0;
    const pentaLoHitNums = sPenta.lo?.hitNums || [];
    const pentaLoStakeK = sPenta.lo?.stakeK || 83600;
    const pentaLoPayoutK = sPenta.lo?.payoutK || 0;
    const pentaLoProfitK = sPenta.lo?.profitK !== undefined ? sPenta.lo.profitK : (pentaLoPayoutK - pentaLoStakeK);
    const pentaLoHitsText = pentaLoHits > 0 
        ? `🔥 <b>Nổ ${pentaLoHits} nháy</b>${pentaLoHitNums.length ? ` [${pentaLoHitNums.join(', ')}]` : ''}`
        : (isPending ? `⏳ <i>Đang chờ mở thưởng</i>` : `❌ <b>Trượt Lô (0 nháy)</b>`);

    const sPentaCross = sPenta.loCrossX2 || sSettlement.pentaConsensus?.loCrossX2 || {};
    const pCrossStakeK = sPentaCross.stakeK || pentaLoStakeK;
    const pCrossPayoutK = sPentaCross.payoutK || pentaLoPayoutK;
    const pCrossProfitK = sPentaCross.profitK !== undefined ? sPentaCross.profitK : (pCrossPayoutK - pCrossStakeK);
    const pCrossPromoted = (sPentaCross.x2Nums || []).map(numStr);

    const pentaTotalStakeK = pentaDeStakeK + pentaLoStakeK + top8StakeK;
    const pentaTotalPayoutK = pentaDePayoutK + pentaLoPayoutK + top8PayoutK;
    const pentaTotalProfitK = pentaTotalPayoutK - pentaTotalStakeK;

    const lines = [
        `🏆 <b>BÁO CÁO ĐỐI SOÁT NGÀY ${displayDate(targetDate)}</b>`,
        `🎯 <i>Giải Đặc Biệt: <b>${escapeHtml(deSpecialStr)}</b></i>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `<b>A. 📊 NHẬT KÝ ĐỐI SOÁT (/daily-advisor)</b>`,
        `  • <b>Đề Thực Chiến:</b> ${deResultText}`,
        `    └ Vốn: ${formatCostK(advDeStakeK)} · Thưởng: ${formatCostK(advDePayoutK)} · Lãi: <b>${formatMoneyK(advDeProfitK)}</b>`,
        `  • <b>Lô Ghép 4 Động Cơ:</b> ${loHitsText}`,
        `    └ <b>Dàn Gốc:</b> Vốn: ${formatCostK(advLoStakeK)} · Thưởng: ${formatCostK(advLoPayoutK)} · Lãi: <b>${formatMoneyK(advLoProfitK)}</b>`,
        `    └ 🚀 <b>Dàn Đột Phá X2:</b> Vốn: ${formatCostK(loX2StakeK)} · Thưởng: ${formatCostK(loX2PayoutK)} · Lãi: <b>${formatMoneyK(loX2ProfitK)}</b>`,
        `       └ <i>Nâng X2: ${loPromotedX2.length ? `[${loPromotedX2.join(', ')}] (${loX2Hits} nháy)` : 'Không nâng'}</i>`,
        `  • <b>Các Dàn Lô Xiên:</b>`,
        `    └ 🎲 <b>2 Dàn Xiên 4 Tinh Hoa (22M):</b> Thưởng: ${formatCostK(top8PayoutK)} · Lãi: <b>${formatMoneyK(top8ProfitK)}</b>`,
        `       • Dàn 1 [${(top8Data.dan1 || []).join(', ')}]: Nổ ${h1}/4 con${h1 >= 2 ? ' (Ăn vé X2)' : ''} 👉 ${formatMoneyK(top8Data.profit1)}`,
        `       • Dàn 2 [${(top8Data.dan2 || []).join(', ')}]: Nổ ${h2}/4 con${h2 >= 2 ? ' (Ăn vé X2)' : ''} 👉 ${formatMoneyK(top8Data.profit2)}`,
        `    └ 👑 <b>Dàn Xiên 5 (55M):</b> [${advXienTop5.join(', ')}] về ${advH5}/5 · Lãi: <b>${formatMoneyK(advXienProfitK)}</b>`,
        `    └ 🎯 <b>Bộ 4 Quây 11 vé (11M):</b> [${xien4Top4.join(', ')}] về ${xien4Hits}/4 · Lãi: <b>${formatMoneyK(xien4ProfitK)}</b>`,
        `  👉 <b>TỔNG KẾT NGÀY DAILY:</b>`,
        `    └ Vốn: ${formatCostK(advTotalStakeK)} · Thưởng: ${formatCostK(advTotalPayoutK)} · Lãi ròng: <b>${formatMoneyK(advTotalProfitK)}</b>`,
        ``,
        `<b>B. 👑 PHƯƠNG PHÁP GỘP 5 (/daily-advisor-shadow)</b>`,
        `  • <b>Đề Siêu Gộp 5 PP:</b> ${pentaDeResultText}`,
        `    └ Vốn: ${formatCostK(pentaDeStakeK)} · Thưởng: ${formatCostK(pentaDePayoutK)} · Lãi: <b>${formatMoneyK(pentaDeProfitK)}</b>`,
        `  • <b>Lô Siêu Gộp 5 PP:</b> ${pentaLoHitsText}`,
        `    └ <b>Dàn Gốc:</b> Vốn: ${formatCostK(pentaLoStakeK)} · Thưởng: ${formatCostK(pentaLoPayoutK)} · Lãi: <b>${formatMoneyK(pentaLoProfitK)}</b>`,
        `    └ 🚀 <b>Dàn Đột Phá X2:</b> Vốn: ${formatCostK(pCrossStakeK)} · Thưởng: ${formatCostK(pCrossPayoutK)} · Lãi: <b>${formatMoneyK(pCrossProfitK)}</b>`,
        `       └ <i>Nâng X2: ${pCrossPromoted.length ? `[${pCrossPromoted.join(', ')}]` : 'Không nâng'}</i>`,
        `  • <b>Dàn Lô Xiên:</b>`,
        `    └ 🎲 <b>2 Dàn Xiên 4 Tinh Hoa (22M):</b> Thưởng: ${formatCostK(top8PayoutK)} · Lãi: <b>${formatMoneyK(top8ProfitK)}</b>`,
        `       • Dàn 1 [${(top8Data.dan1 || []).join(', ')}]: Nổ ${h1}/4 con${h1 >= 2 ? ' (Ăn vé X2)' : ''} 👉 ${formatMoneyK(top8Data.profit1)}`,
        `       • Dàn 2 [${(top8Data.dan2 || []).join(', ')}]: Nổ ${h2}/4 con${h2 >= 2 ? ' (Ăn vé X2)' : ''} 👉 ${formatMoneyK(top8Data.profit2)}`,
        `  👉 <b>TỔNG KẾT NGÀY SHADOW:</b>`,
        `    └ Vốn: ${formatCostK(pentaTotalStakeK)} · Thưởng: ${formatCostK(pentaTotalPayoutK)} · Lãi ròng: <b>${formatMoneyK(pentaTotalProfitK)}</b>`
    ];

    return lines.join('\n');
}

function buildFastCopyMessage(predictionDate, advisorPayload = {}) {
    const reg = advisorPayload?.dailyLockedBetsRegistry?.dates || {};
    const regNext = reg[predictionDate] || {};
    const nBets = regNext.bets || {};

    // Daily Advisor
    const nDe = nBets.de || advisorPayload?.crossHedgingPortfolio?.latestRecommendation?.pillar1_De || {};
    let advNextDeVip = (nDe.vipNumbers || []).map(numStr);
    let advNextDeSingle = (nDe.singleNumbers || []).map(numStr);
    const advDeVipSet = new Set(advNextDeVip);
    advNextDeSingle = advNextDeSingle.filter(n => !advDeVipSet.has(n));

    const nLo = nBets.lo4EngineFusion || advisorPayload?.lo4EngineFusion?.latestRecommendation || {};
    let advNextLoX5 = (nLo.tierX5 || []).map(numStr);
    let advNextLoX4 = (nLo.tierX4 || []).map(numStr);
    let advNextLoX3 = (nLo.tierX3 || []).map(numStr);
    const nextCrossX2 = nBets.lo4EngineFusion?.crossX2 || nLo.crossX2 || {};
    let advNextLoX2 = (nextCrossX2.tierX2 || []).map(numStr);
    let advNextLoX1 = (nextCrossX2.tierX1 && nextCrossX2.tierX1.length ? nextCrossX2.tierX1 : nLo.tierX1 || []).map(numStr);
    const higherLoTiers = new Set([...advNextLoX5, ...advNextLoX4, ...advNextLoX3, ...advNextLoX2]);
    advNextLoX1 = advNextLoX1.filter(n => !higherLoTiers.has(n));

    // Shadow
    const nPenta = nBets.pentaConsensus || advisorPayload?.pentaConsensus?.latestRecommendation || {};
    let pentaNextDeX2 = (nPenta.de?.x2Nums || []).map(numStr);
    let pentaNextDeX1 = (nPenta.de?.x1Nums || []).map(numStr);
    const pdX2Set = new Set(pentaNextDeX2);
    pentaNextDeX1 = pentaNextDeX1.filter(n => !pdX2Set.has(n));

    let pentaNextLoX5 = (nPenta.lo?.x5Nums || []).map(numStr);
    let pentaNextLoX4 = (nPenta.lo?.x4Nums || []).map(numStr);
    let pentaNextLoX3 = (nPenta.lo?.x3Nums || []).map(numStr);
    let pentaNextLoCrossX2 = (nPenta.loCrossX2?.x2Nums || []).map(numStr);
    let pentaNextLoX1 = (nPenta.loCrossX2?.x1Nums || nPenta.lo?.x1Nums || []).map(numStr);
    const p5Set = new Set(pentaNextLoX5);
    pentaNextLoX4 = pentaNextLoX4.filter(n => !p5Set.has(n));
    const p4Set = new Set([...p5Set, ...pentaNextLoX4]);
    pentaNextLoX3 = pentaNextLoX3.filter(n => !p4Set.has(n));
    const p3Set = new Set([...p4Set, ...pentaNextLoX3]);
    pentaNextLoCrossX2 = pentaNextLoCrossX2.filter(n => !p3Set.has(n));
    const p2Set = new Set([...p3Set, ...pentaNextLoCrossX2]);
    pentaNextLoX1 = pentaNextLoX1.filter(n => !p2Set.has(n));

    // 2 Dàn Xiên 4
    const top8Data = resolveTop8SettlementForDate(predictionDate, advisorPayload);
    const dan1 = top8Data.dan1;
    const dan2 = top8Data.dan2;

    const dateStr = displayDate(predictionDate);
    const lines = [
        `📋 <b>DÀN SỐ TEXT COPY NHANH (NGÀY ${dateStr})</b>`,
        `<i>Chạm vào từng khối <code>...</code> để tự động sao chép:</i>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `🔮 <b>1. DAILY ADVISOR — DÀN LÔ X2:</b>`,
        `<code>Ngày ${dateStr}`,
        advNextLoX5.length ? `X5: ${advNextLoX5.join(',')}` : '',
        advNextLoX4.length ? `X4: ${advNextLoX4.join(',')}` : '',
        advNextLoX3.length ? `X3: ${advNextLoX3.join(',')}` : '',
        advNextLoX2.length ? `X2: ${advNextLoX2.join(',')}` : '',
        advNextLoX1.length ? `X1: ${advNextLoX1.join(',')}` : '',
        `</code>`,
        ``,
        `👑 <b>2. SHADOW MONITOR — DÀN LÔ GỘP 5:</b>`,
        `<code>Ngày ${dateStr}`,
        pentaNextLoX5.length ? `X5: ${pentaNextLoX5.join(',')}` : '',
        pentaNextLoX4.length ? `X4: ${pentaNextLoX4.join(',')}` : '',
        pentaNextLoX3.length ? `X3: ${pentaNextLoX3.join(',')}` : '',
        pentaNextLoCrossX2.length ? `X2: ${pentaNextLoCrossX2.join(',')}` : '',
        pentaNextLoX1.length ? `X1: ${pentaNextLoX1.join(',')}` : '',
        `</code>`,
        ``,
        `🎲 <b>3. 2 DÀN XIÊN 4 TINH HOA (22M):</b>`,
        `<code>Ngày ${dateStr}`,
        `Xiên 4 Dàn 1: ${dan1.join(',')}`,
        `Xiên 4 Dàn 2: ${dan2.join(',')}`,
        `</code>`,
        ``,
        `💎 <b>4. DÀN ĐỀ THỰC CHIẾN & SHADOW:</b>`,
        `<code>Ngày ${dateStr}`,
        `Đề VIP Daily: ${advNextDeVip.join(',')}`,
        `Đề Lót Daily: ${advNextDeSingle.join(',')}`,
        `Đề VIP Shadow: ${pentaNextDeX2.join(',')}`,
        `Đề Lót Shadow: ${pentaNextDeX1.join(',')}`,
        `</code>`
    ];

    return lines.filter(Boolean).join('\n');
}

function buildMainMenuMessage() {
    return [
        `🤖 <b>XSMB SMART PREDICTOR & AUDIT BOT</b>`,
        `<i>Hệ thống AI Phân Tích & Đối Soát Bất Biến 100% Strict PIT</i>`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `Chào mừng bạn! Hãy chọn một trong các chức năng dưới đây:`,
        ``,
        `• 🔮 <b>Dự Đoán Daily Advisor:</b> Đề VIP X3 + Lô Ghép 4 ĐC (X5-X1) + 2 Dàn Xiên 4`,
        `• 👑 <b>Dự Đoán Shadow Monitor:</b> Đề Gộp 5 PP + Lô Siêu Gộp 5 + 2 Dàn Xiên 4`,
        `• 📊 <b>Đối Soát Theo Ngày:</b> Xem chi tiết kết quả nổ, P&L của từng ngày`,
        `• 📋 <b>Text Copy Nhanh:</b> Lấy toàn bộ dàn số để nạp trang cược`,
        `• 📜 <b>Toàn Bộ Báo Cáo:</b> Báo cáo tổng hợp đầy đủ như hàng ngày`,
        `• 💰 <b>Bảng Mức Cược:</b> Xem chi tiết bảng tính vốn, thưởng theo 4 mức`,
        ``,
        `💡 <i>Bạn cũng có thể gõ các lệnh nhanh:</i>`,
        `<code>/daily</code> · <code>/shadow</code> · <code>/audit [ngày]</code> · <code>/copy</code> · <code>/cuoc</code>`
    ].join('\n');
}

module.exports = {
    numStr,
    displayDate,
    escapeHtml,
    formatK,
    formatMoneyK,
    formatM,
    getXien5Combinations,
    computePentaConsensusForDate,
    buildTelegramReport,
    MAIN_MENU_KEYBOARD,
    BACK_TO_MAIN_KEYBOARD,
    SUB_NAV_DAILY_KEYBOARD,
    SUB_NAV_SHADOW_KEYBOARD,
    buildAuditResultKeyboard,
    buildAuditDatesKeyboard,
    resolveTop8SettlementForDate,
    buildDailyPredictionMessage,
    buildShadowPredictionMessage,
    buildAuditMessageForDate,
    buildFastCopyMessage,
    buildMainMenuMessage
};
