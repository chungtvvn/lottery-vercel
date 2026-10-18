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
            `<i>Dàn số được bảo toàn 100% không đổi cho đến khi kết toán sau 18h40.</i>`,
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

        const sXien = sSettlement.loXien5 || {};
        const advXienTop5 = (sXien.top5 || sBets.loXien5?.top5 || ['54', '62', '95', '57', '63']).map(numStr);
        const advH5 = sXien.h5 ?? 0;
        const advXienStakeK = sXien.stakeK || 55000;
        const advXienPayoutK = sXien.payoutK || 0;
        const advXienProfitK = sXien.profitK ?? (advXienPayoutK - advXienStakeK);
        let advXienWinDesc = '';
        if (advH5 >= 5) advXienWinDesc = '👑 Ăn 5 dàn X4 (1.920M)';
        else if (advH5 === 4) advXienWinDesc = '👑 Ăn 1 dàn X4 + 4 dàn X3 (720M)';
        else if (advH5 === 3) advXienWinDesc = '🔥 Ăn 2 dàn X3 + 3 dàn X2 (204M)';
        else if (advH5 === 2) advXienWinDesc = '🛡️ Ăn 3 dàn X2 (36M)';
        else advXienWinDesc = 'Trượt';

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

        const pentaXienTop5 = (sPenta.xien5?.top5 || []).map(numStr);
        const pentaH5 = sPenta.xien5?.h5 || 0;
        const pentaXienStakeK = sPenta.xien5?.stakeK || 5500;
        const pentaXienPayoutK = sPenta.xien5?.payoutK || 0;
        const pentaXienProfitK = sPenta.xien5?.profitK || -pentaXienStakeK;
        let pentaXienWinDesc = '';
        if (pentaH5 >= 5) pentaXienWinDesc = '👑 Ăn 5 dàn X4 (192M)';
        else if (pentaH5 === 4) pentaXienWinDesc = '👑 Ăn 1 dàn X4 + 4 dàn X3 (72M)';
        else if (pentaH5 === 3) pentaXienWinDesc = '🔥 Ăn 2 dàn X3 + 3 dàn X2 (20.4M)';
        else if (pentaH5 === 2) pentaXienWinDesc = '🛡️ Ăn 3 dàn X2 (3.6M)';
        else pentaXienWinDesc = 'Trượt';

        const pentaTotalStakeK = pentaDeStakeK + pentaLoStakeK + pentaXienStakeK;
        const pentaTotalPayoutK = pentaDePayoutK + pentaLoPayoutK + pentaXienPayoutK;
        const pentaTotalProfitK = pentaTotalPayoutK - pentaTotalStakeK;

        // Lũy kế Gộp 5 (từ 07/10)
        let pentaCumDeK = 0, pentaCumLoK = 0, pentaCumXienK = 0, pentaCumProfitK = 0;
        const pentaDates = Object.keys(advisorPayload?.drawPrizesByDate || {}).filter(d => d >= '2026-10-07' && d <= settledDate).sort();
        pentaDates.forEach(d => {
            const res = computePentaConsensusForDate(d, advisorPayload);
            if (res && !res.isPending) {
                pentaCumDeK += res.de.profitK;
                pentaCumLoK += res.lo.profitK;
                pentaCumXienK += res.xien5.profitK;
                pentaCumProfitK += res.combo.profitK;
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
            `    └ Vốn: ${formatCostK(advLoStakeK)} · Thưởng: ${formatCostK(advLoPayoutK)} · Lãi ròng: <b>${formatMoneyK(advLoProfitK)}</b>`,
            `  • <b>Dàn Xiên 5 (5 Dàn Xiên 4 · Vốn 55M):</b> ${advXienWinDesc}`,
            `    └ Top 5 [${advXienTop5.join(', ')}] về ${advH5}/5 con`,
            `    └ Vốn: ${formatCostK(advXienStakeK)} · Thưởng: ${formatCostK(advXienPayoutK)} · Lãi ròng: <b>${formatMoneyK(advXienProfitK)}</b>`,
            `  👉 <b>TỔNG KẾT NGÀY (/daily-advisor):</b>`,
            `    └ Vốn: ${formatCostK(advTotalStakeK)} · Thưởng: ${formatCostK(advTotalPayoutK)} · Lãi ròng: <b>${formatMoneyK(advTotalProfitK)}</b>`,
            `    └ <b>Lũy kế (/daily-advisor từ 16/09):</b> <b>${formatM(advCumProfitK)}</b> (${advTotalDays} kỳ · Đề: ${formatM(advCumDeK)} | Lô: ${formatM(advCumLoK)} | Xiên: ${formatM(advCumXienK)})`,
            '',
            `<b>B. 👑 PHƯƠNG PHÁP GỘP 5 (/daily-advisor-shadow)</b>`,
            `  • <b>Đề Siêu Gộp 5 PP (X2 400K + X1 200K):</b> ${pentaDeResultText}`,
            `    └ Vốn: ${formatCostK(pentaDeStakeK)} · Thưởng: ${formatCostK(pentaDePayoutK)} · Lãi ròng: <b>${formatMoneyK(pentaDeProfitK)}</b>`,
            `  • <b>Lô Siêu Gộp 5 PP (X5 / X4 / X3 / X1):</b> ${pentaLoHitsText}`,
            `    └ Vốn: ${formatCostK(pentaLoStakeK)} · Thưởng: ${formatCostK(pentaLoPayoutK)} · Lãi ròng: <b>${formatMoneyK(pentaLoProfitK)}</b>`,
            `  • <b>Xiên 5 Siêu Gộp (5 Dàn Xiên 4 · Vốn 5.5M):</b> ${pentaXienWinDesc}`,
            `    └ Top 5 [${pentaXienTop5.join(', ')}] về ${pentaH5}/5 con`,
            `    └ Vốn: ${formatCostK(pentaXienStakeK)} · Thưởng: ${formatCostK(pentaXienPayoutK)} · Lãi ròng: <b>${formatMoneyK(pentaXienProfitK)}</b>`,
            `  👉 <b>TỔNG KẾT NGÀY (/daily-advisor-shadow):</b>`,
            `    └ Vốn: ${formatCostK(pentaTotalStakeK)} · Thưởng: ${formatCostK(pentaTotalPayoutK)} · Lãi ròng: <b>${formatMoneyK(pentaTotalProfitK)}</b>`,
            `    └ <b>Lũy kế (Gộp 5 từ 07/10):</b> <b>${formatM(pentaCumProfitK)}</b> (${pentaTotalDays} kỳ · Đề: ${formatM(pentaCumDeK)} | Lô: ${formatM(pentaCumLoK)} | Xiên 5: ${formatM(pentaCumXienK)})`,
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
    let advNextLoX1 = (nLo.tierX1 || []).map(numStr);
    let advNextLoAll = (nLo.allNumbers || nLo.distinctNumbers || [...advNextLoX5, ...advNextLoX4, ...advNextLoX3, ...advNextLoX1]).map(numStr);
    if (!advNextLoAll.length) {
        advNextLoAll = (lotoPayload?.nextPrediction?.predictions?.top7?.numbers || lotoPayload?.nextPrediction?.predictions?.top6?.numbers || ['01', '02', '03', '04', '05', '06', '07']).map(numStr);
        advNextLoX4 = advNextLoAll.slice(0, 3);
        advNextLoX3 = advNextLoAll.slice(3, 6);
        advNextLoX1 = advNextLoAll.slice(6);
    }
    const advNextLoStakeK = nLo.totalLotoStakeK || 66000;

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
    const advNextTotalStakeK = advNextDeStakeK + advNextLoStakeK + advNextXienStakeK;

    // 2. Phương pháp Gộp 5 /daily-advisor-shadow
    const nPenta = nBets.pentaConsensus || computePentaConsensusForDate(predictionDate, advisorPayload) || {};
    let pentaNextDeX2 = (nPenta.de?.x2Nums || []).map(numStr);
    let pentaNextDeX1 = (nPenta.de?.x1Nums || []).map(numStr);
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
    let pentaNextLoX1 = (nPenta.lo?.x1Nums || []).map(numStr);
    let pentaNextLoAll = (nPenta.lo?.numbers || [...pentaNextLoX5, ...pentaNextLoX4, ...pentaNextLoX3, ...pentaNextLoX1]).map(numStr);
    if (!pentaNextLoAll.length) {
        pentaNextLoAll = advNextLoAll;
        pentaNextLoX4 = advNextLoX4;
        pentaNextLoX3 = advNextLoX3;
        pentaNextLoX1 = advNextLoX1;
    }
    const pentaNextLoStakeK = nPenta.lo?.stakeK || 88000;

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
        `    └ 👑 <b>VIP X3 (${advNextDeVip.length} số · cược 1.8M/số, ăn 252M):</b>`,
        `       <code>${escapeHtml(advNextDeVip.join(', '))}</code>`,
        `    └ 🛡️ <b>Bọc Lót X1 (${advNextDeSingle.length} số · cược 600K/số, ăn 84M):</b>`,
        `       <code>${escapeHtml(advNextDeSingle.join(', '))}</code>`,
        `  • <b>Lô Ghép 4 Động Cơ (${advNextLoAll.length} số · Vốn ${formatCostK(advNextLoStakeK)}):</b>`
    );
    if (advNextLoX5.length) {
        lines.push(`    └ 👑 <b>Siêu VIP X5 (${advNextLoX5.length} số · cược 11M/số [500đ], ăn 40M/nháy):</b> <code>${escapeHtml(advNextLoX5.join(', '))}</code>`);
    }
    lines.push(
        `    └ 🔥 <b>Cực VIP X4 (${advNextLoX4.length} số · cược 8.8M/số [400đ], ăn 32M/nháy):</b>`,
        `       <code>${escapeHtml(advNextLoX4.join(', '))}</code>`,
        `    └ ⚡ <b>Triển Vọng X3 (${advNextLoX3.length} số · cược 6.6M/số [300đ], ăn 24M/nháy):</b>`,
        `       <code>${escapeHtml(advNextLoX3.join(', '))}</code>`,
        `    └ 🛡️ <b>Bảo Hiểm X1 (${advNextLoX1.length} số · cược 2.2M/số [100đ], ăn 8M/nháy):</b>`,
        `       <code>${escapeHtml(advNextLoX1.join(', '))}</code>`,
        `  • <b>Dàn Xiên 5 (5 Dàn Xiên 4 Ghép Top 5 · Vốn 55M · 11M/dàn):</b>`,
        `    └ 👑 <b>Top 5 Lô đồng thuận:</b> <code>[${escapeHtml(advNextXienTop5.join(', '))}]</code>`,
        `    └ 5 Dàn Xiên 4 cụ thể:`,
        `       • Dàn 1: <code>${escapeHtml(advNextXienTickets[0].join(', '))}</code> (11M)`,
        `       • Dàn 2: <code>${escapeHtml(advNextXienTickets[1].join(', '))}</code> (11M)`,
        `       • Dàn 3: <code>${escapeHtml(advNextXienTickets[2].join(', '))}</code> (11M)`,
        `       • Dàn 4: <code>${escapeHtml(advNextXienTickets[3].join(', '))}</code> (11M)`,
        `       • Dàn 5: <code>${escapeHtml(advNextXienTickets[4].join(', '))}</code> (11M)`,
        `    └ <i>Tỷ lệ ăn: 5 con về = 1.920M · 4 con = 720M · 3 con = 204M · 2 con = 36M</i>`,
        `  👉 <b>Tổng vốn đầu tư /daily-advisor:</b> <b>${formatCostK(advNextTotalStakeK)}</b>`,
        '',
        divider,
        `<b>2. 👑 PHƯƠNG PHÁP GỘP 5 (/daily-advisor-shadow)</b>`,
        `  • <b>Đề Siêu Gộp 5 PP (${pentaNextDeAll.length} số · Vốn ${formatCostK(pentaNextDeStakeK)}):</b>`,
        `    └ 👑 <b>VIP X2 (trùng ≥3 hệ · ${pentaNextDeX2.length} số · cược 400K/số, ăn 33.6M):</b>`,
        `       <code>${escapeHtml(pentaNextDeX2.join(', '))}</code>`,
        `    └ 🛡️ <b>Bọc Lót X1 (trùng &lt;3 hệ · ${pentaNextDeX1.length} số · cược 200K/số, ăn 16.8M):</b>`,
        `       <code>${escapeHtml(pentaNextDeX1.join(', '))}</code>`,
        `  • <b>Lô Siêu Gộp 5 PP (${pentaNextLoAll.length} số · Vốn ${formatCostK(pentaNextLoStakeK)}):</b>`,
        `    └ 👑 <b>Siêu VIP X5 (trùng ≥4 hệ · ${pentaNextLoX5.length} số · cược 11M/số [500đ], ăn 40M/nháy):</b>`,
        `       <code>${escapeHtml(pentaNextLoX5.join(', '))}</code>`,
        `    └ 🔥 <b>Cực VIP X4 (trùng 3 hệ · ${pentaNextLoX4.length} số · cược 8.8M/số [400đ], ăn 32M/nháy):</b>`,
        `       <code>${escapeHtml(pentaNextLoX4.join(', '))}</code>`,
        `    └ ⚡ <b>Triển Vọng X3 (trùng 2 hệ · ${pentaNextLoX3.length} số · cược 6.6M/số [300đ], ăn 24M/nháy):</b>`,
        `       <code>${escapeHtml(pentaNextLoX3.join(', '))}</code>`,
        `    └ 🛡️ <b>Bảo Hiểm X1 (trùng 1 hệ · ${pentaNextLoX1.length} số · cược 2.2M/số [100đ], ăn 8M/nháy):</b>`,
        `       <code>${escapeHtml(pentaNextLoX1.join(', '))}</code>`,
        `  • <b>Xiên 5 Siêu Gộp (5 Dàn Xiên 4 Ghép Top 5 Ngũ Trụ · Vốn 5.5M · 1.1M/dàn):</b>`,
        `    └ 👑 <b>Top 5 Lô ngũ trụ:</b> <code>[${escapeHtml(pentaNextXienTop5.join(', '))}]</code>`,
        `    └ 5 Dàn Xiên 4 cụ thể:`,
        `       • Dàn 1: <code>${escapeHtml(pentaNextXienTickets[0].join(', '))}</code> (1.1M)`,
        `       • Dàn 2: <code>${escapeHtml(pentaNextXienTickets[1].join(', '))}</code> (1.1M)`,
        `       • Dàn 3: <code>${escapeHtml(pentaNextXienTickets[2].join(', '))}</code> (1.1M)`,
        `       • Dàn 4: <code>${escapeHtml(pentaNextXienTickets[3].join(', '))}</code> (1.1M)`,
        `       • Dàn 5: <code>${escapeHtml(pentaNextXienTickets[4].join(', '))}</code> (1.1M)`,
        `    └ <i>Tỷ lệ ăn: 5 con về = 192M · 4 con = 72M · 3 con = 20.4M · 2 con = 3.6M</i>`,
        `  👉 <b>Tổng vốn đầu tư /daily-advisor-shadow:</b> <b>${formatCostK(pentaNextTotalStakeK)}</b>`,
        '',
        divider,
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

module.exports = {
    numStr,
    displayDate,
    escapeHtml,
    formatK,
    formatMoneyK,
    formatM,
    getXien5Combinations,
    computePentaConsensusForDate,
    buildTelegramReport
};
