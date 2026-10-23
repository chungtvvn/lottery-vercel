'use strict';

/**
 * lib/services/pentaConsensusService.js
 * Phương pháp Siêu Gộp 5 Phương Pháp (Penta-Consensus Suite)
 * Dành cho /daily-advisor-shadow:
 * 1. Đề Siêu Gộp Phân Tầng X2/X1 (Trùng >= 3 hệ -> X2 400K, còn lại -> X1 200K)
 * 2. Lô Phân Tầng Đa Cấp Ngũ Trụ (Trùng >=4 hệ -> X5, 3 hệ -> X4, 2 hệ -> X3, 1 hệ -> X1)
 * 3. Lô Xiên 5 Siêu Gộp (5 Dàn Xiên 4 ghép từ Top 5 Lô Ngũ Trụ · Vốn 5.5M)
 * 
 * 100% Strict Point-In-Time (Strict PIT) & Single Source of Truth (SSOT).
 */

function numStr(val) {
    return String(Number(val)).padStart(2, '0');
}

function getXien5Combinations(top5) {
    if (!Array.isArray(top5) || top5.length < 5) return [];
    const n = top5.map(numStr);
    return [
        [n[0], n[1], n[2], n[3]], // Vé 1 (bỏ n[4])
        [n[0], n[1], n[2], n[4]], // Vé 2 (bỏ n[3])
        [n[0], n[1], n[3], n[4]], // Vé 3 (bỏ n[2])
        [n[0], n[2], n[3], n[4]], // Vé 4 (bỏ n[1])
        [n[1], n[2], n[3], n[4]]  // Vé 5 (bỏ n[0])
    ];
}

function computePentaConsensusForDate(targetDate, advisorCache) {
    if (!advisorCache) return null;
    const regEntry = advisorCache.dailyLockedBetsRegistry?.dates?.[targetDate];
    const lockedBet = regEntry?.bets?.pentaConsensus;
    const lockedSettlement = regEntry?.settlement?.pentaConsensus;

    const drawPrizesObj = advisorCache.drawPrizesByDate?.[targetDate] || null;
    const isPending = !drawPrizesObj || (drawPrizesObj.special === undefined && (!drawPrizesObj.prizes || drawPrizesObj.prizes.length === 0));

    // NGUYÊN TẮC BẤT BIẾN TUYỆT ĐỐI (ZERO RE-COMPUTATION SSOT):
    // 1. Nếu ngày này đã được kết toán trong Registry, trả về nguyên trạng bản ghi kết toán!
    if (lockedSettlement && regEntry?.isSettled && !isPending) {
        let safeCrossX2 = lockedSettlement.loCrossX2;
        if (!safeCrossX2 && lockedSettlement.lo) {
            const loNums = (lockedSettlement.lo.numbers || []).map(numStr);
            const x5Nums = (lockedSettlement.lo.x5Nums || []).map(numStr);
            const x4Nums = (lockedSettlement.lo.x4Nums || []).map(numStr);
            const x3Nums = (lockedSettlement.lo.x3Nums || []).map(numStr);
            const x1Nums = (lockedSettlement.lo.x1Nums || []).map(numStr);
            const lo4High = regEntry?.settlement?.lo4EngineFusion || regEntry?.bets?.lo4EngineFusion;
            const lo4HighSet = new Set([
                ...(lo4High?.tierX5 || []),
                ...(lo4High?.tierX4 || []),
                ...(lo4High?.tierX3 || [])
            ].map(numStr));
            const promotedToX2 = x1Nums.filter(n => lo4HighSet.has(n));
            const remainingX1 = x1Nums.filter(n => !lo4HighSet.has(n));
            const prizeCount = {};
            if (drawPrizesObj?.prizes) {
                drawPrizesObj.prizes.forEach(p => {
                    const s = numStr(p);
                    prizeCount[s] = (prizeCount[s] || 0) + 1;
                });
            }
            const pStakeK = (x5Nums.length * 5 + x4Nums.length * 4 + x3Nums.length * 3 + promotedToX2.length * 2 + remainingX1.length * 1) * 2200;
            let pPayoutK = 0;
            x5Nums.forEach(n => { pPayoutK += (prizeCount[n] || 0) * 5 * 8000; });
            x4Nums.forEach(n => { pPayoutK += (prizeCount[n] || 0) * 4 * 8000; });
            x3Nums.forEach(n => { pPayoutK += (prizeCount[n] || 0) * 3 * 8000; });
            promotedToX2.forEach(n => { pPayoutK += (prizeCount[n] || 0) * 2 * 8000; });
            remainingX1.forEach(n => { pPayoutK += (prizeCount[n] || 0) * 1 * 8000; });
            const pProfitK = pPayoutK - pStakeK;
            safeCrossX2 = {
                numbers: loNums,
                x5Nums,
                x4Nums,
                x3Nums,
                x2Nums: promotedToX2,
                x1Nums: remainingX1,
                hits: lockedSettlement.lo.hits || 0,
                hitNums: lockedSettlement.lo.hitNums || [],
                stakeK: pStakeK,
                payoutK: pPayoutK,
                profitK: pProfitK,
                isWin: pProfitK > 0
            };
        }
        return {
            date: targetDate,
            isPending: false,
            actualSpecial: lockedSettlement.actualSpecial,
            de: lockedSettlement.de,
            lo: lockedSettlement.lo,
            loCrossX2: safeCrossX2,
            xien5: lockedSettlement.xien5,
            combo: {
                stakeK: (lockedSettlement.de?.stakeK || 0) + (lockedSettlement.lo?.stakeK || 0) + (lockedSettlement.xien5?.stakeK || 0),
                payoutK: (lockedSettlement.de?.payoutK || 0) + (lockedSettlement.lo?.payoutK || 0) + (lockedSettlement.xien5?.payoutK || 0),
                profitK: (lockedSettlement.de?.profitK || 0) + (lockedSettlement.lo?.profitK || 0) + (lockedSettlement.xien5?.profitK || 0),
                isWin: ((lockedSettlement.de?.profitK || 0) + (lockedSettlement.lo?.profitK || 0) + (lockedSettlement.xien5?.profitK || 0)) > 0
            }
        };
    }

    // 2. Nếu đã có dàn cược niêm phong trong Registry, đọc 100% từ dàn cược đã khóa (KHÔNG BAO GIỜ TÍNH LẠI)!
    if (lockedBet && lockedBet.de && lockedBet.lo) {
        const actualSpecial = isPending ? null : (drawPrizesObj?.special !== undefined ? numStr(drawPrizesObj.special) : null);
        const prizeCount = {};
        if (!isPending && drawPrizesObj?.prizes) {
            drawPrizesObj.prizes.forEach(p => {
                const s = numStr(p);
                prizeCount[s] = (prizeCount[s] || 0) + 1;
            });
        }

        // Đề
        const deX2Nums = (lockedBet.de.x2Nums || []).map(numStr);
        const deX1Nums = (lockedBet.de.x1Nums || []).map(numStr);
        const allDeNums = lockedBet.de.numbers || [...deX2Nums, ...deX1Nums];
        const deStakeK = lockedBet.de.stakeK || (deX2Nums.length * 400 + deX1Nums.length * 200);
        const isHitX2 = isPending ? false : (actualSpecial ? deX2Nums.includes(actualSpecial) : false);
        const isHitX1 = isPending ? false : (actualSpecial ? deX1Nums.includes(actualSpecial) : false);
        const isDeHit = isHitX2 || isHitX1;
        const dePayoutK = isPending ? 0 : (isHitX2 ? 33600 : (isHitX1 ? 16800 : 0));
        const deProfitK = isPending ? 0 : (dePayoutK - deStakeK);

        // Lô Gốc
        const allLoNums = (lockedBet.lo.numbers || []).map(numStr);
        const numMultiplierMap = lockedBet.lo.multiplierMap || {};
        const x5Nums = (lockedBet.lo.x5Nums || []).map(numStr);
        const x4Nums = (lockedBet.lo.x4Nums || []).map(numStr);
        const x3Nums = (lockedBet.lo.x3Nums || []).map(numStr);
        const x1Nums = (lockedBet.lo.x1Nums || []).map(numStr);

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
        const isLoWin = isPending ? false : (loProfitK > 0);

        // Lô Cross X2
        let promotedToX2 = (lockedBet.loCrossX2?.x2Nums || []).map(numStr);
        let remainingX1 = (lockedBet.loCrossX2?.x1Nums || []).map(numStr);
        if (promotedToX2.length === 0 && x1Nums.length > 0) {
            const lo4High = regEntry?.settlement?.lo4EngineFusion || regEntry?.bets?.lo4EngineFusion || advisorCache?.lo4EngineFusion?.latestRecommendation;
            if (lo4High) {
                const lo4HighSet = new Set([
                    ...(lo4High.tierX5 || []),
                    ...(lo4High.tierX4 || []),
                    ...(lo4High.tierX3 || [])
                ].map(numStr));
                promotedToX2 = x1Nums.filter(n => lo4HighSet.has(n));
                remainingX1 = x1Nums.filter(n => !lo4HighSet.has(n));
            }
        }
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
        const isLoWinX2 = isPending ? false : (loProfitKX2 > 0);

        // Xiên 5
        const top5Nums = (lockedBet.xien5?.top5 || allLoNums.slice(0, 5)).map(numStr);
        const tickets = lockedBet.xien5?.tickets || getXien5Combinations(top5Nums);
        const xienStakeK = lockedBet.xien5?.stakeK || 5500;
        let xienPayoutK = 0, h5 = 0;
        if (!isPending) {
            h5 = top5Nums.filter(n => (prizeCount[n] || 0) > 0).length;
            if (h5 === 5) xienPayoutK = 5 * 38400;
            else if (h5 === 4) xienPayoutK = 1 * 38400 + 4 * 8400;
            else if (h5 === 3) xienPayoutK = 2 * 8400 + 3 * 1200;
            else if (h5 === 2) xienPayoutK = 3 * 1200;
            else xienPayoutK = 0;
        }
        const xienProfitK = isPending ? 0 : (xienPayoutK - xienStakeK);
        const isXienWin = isPending ? false : (xienProfitK > 0);

        const comboStakeK = deStakeK + loStakeK + xienStakeK;
        const comboPayoutK = dePayoutK + loPayoutK + xienPayoutK;
        const comboProfitK = isPending ? 0 : (comboPayoutK - comboStakeK);

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
                isWin: isLoWin
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
                isWin: isLoWinX2
            },
            xien5: {
                top5: top5Nums,
                tickets,
                h5,
                stakeK: xienStakeK,
                payoutK: xienPayoutK,
                profitK: xienProfitK,
                isWin: isXienWin
            },
            combo: {
                stakeK: comboStakeK,
                payoutK: comboPayoutK,
                profitK: comboProfitK,
                isWin: comboProfitK > 0
            }
        };
    }

    // 3. Nếu chưa có trong Registry (ví dụ tạo mới cho ngày T+1): Tính toán từ 5 phương pháp
    const deDropoff = advisorCache.deDropoffMerge;
    const triCore = advisorCache.triCoreDe;
    const loDropoff = advisorCache.loDropoff27;
    const loTriHarmonic = advisorCache.loTriHarmonic;
    const loQuadHybrid = advisorCache.loQuadHybrid;
    const semanticResonance = advisorCache.semanticResonanceSuite;
    const miro = advisorCache.mirofishSwarm;

    // 1. Dàn Đề từ 5 phương pháp
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
        if (!d1.length) d1 = (deDropoff?.latestRecommendation?.numbers || deDropoff?.latestRecommendation?.top40 || []).slice(0, 40).map(numStr);
        const rD2 = (triCore?.settledLedger || []).concat(triCore?.allDaysLedger || []).find(r => r.date === targetDate);
        d2 = (rD2?.numbers || []).map(numStr);
        if (!d2.length) d2 = (triCore?.latestRecommendation?.numbers || []).map(numStr);
        d3 = (rD1?.numbers36 || rD1?.top36 || d1.slice(0, 36)).map(numStr);
        const rD4 = (semanticResonance?.settledLedger || []).find(r => r.date === targetDate);
        d4 = (rD4?.de?.numbers36 || rD4?.de?.numbers || []).map(numStr);
        if (!d4.length) d4 = (semanticResonance?.latestRecommendation?.de?.numbers36 || []).map(numStr);
        const rD5 = (miro?.settledLedger || []).find(r => r.date === targetDate);
        d5 = (rD5?.de?.numbers || []).map(numStr);
        if (!d5.length) d5 = (miro?.latestRecommendation?.de?.numbers || miro?.latestRecommendation?.numbers || []).map(numStr);
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

    // 2. Dàn Lô từ 5 phương pháp
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
        if (!l1.length) l1 = (loDropoff?.latestRecommendation?.top7 || loDropoff?.latestRecommendation?.numbers || []).slice(0, 7).map(numStr);
        const rL2 = (loTriHarmonic?.settledLedger || []).find(r => r.date === targetDate);
        l2 = (rL2?.rankedNumbers || []).slice(0, 7).map(numStr);
        if (!l2.length) {
            const rL2Alt = (advisorCache.loTop5ConsensusXien?.settledLedger || []).find(r => r.date === targetDate);
            l2 = (rL2Alt?.top7Loto || []).slice(0, 7).map(numStr);
        }
        if (!l2.length) l2 = ((loTriHarmonic?.latestRecommendation?.rankedNumbers || []).slice(0, 7)).map(numStr);
        const rL3 = (loQuadHybrid?.settledLedger || []).find(r => r.date === targetDate);
        l3 = (rL3?.top7 || []).map(numStr);
        if (!l3.length) l3 = (loQuadHybrid?.latestRecommendation?.top7 || []).map(numStr);
        if (!l3.length) l3 = l1;
        const rL4 = (semanticResonance?.settledLedger || []).find(r => r.date === targetDate);
        l4 = (rL4?.lo?.top7 || []).map(numStr);
        if (!l4.length) l4 = (semanticResonance?.latestRecommendation?.lo?.top7 || []).map(numStr);
        const rL5 = (miro?.settledLedger || []).find(r => r.date === targetDate);
        l5 = (rL5?.lo?.numbers || []).slice(0, 7).map(numStr);
        if (!l5.length) l5 = (miro?.latestRecommendation?.lo?.numbers || []).slice(0, 7).map(numStr);
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
    const isLoWin = isPending ? false : (loProfitK > 0);

    // 2B. Tính toán Phương Án Lô Đột Phá X2 (Nâng hạng chéo từ Lô Ghép 4)
    // Lấy tập High Set (X5, X4, X3) của Lô Ghép 4 (Advisor)
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
    // Fallback kiểm tra trong dailyLockedBetsRegistry
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
    promotedToX2.forEach(n => {
        numMultiplierMapX2[n] = 2;
    });

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
    const isLoWinX2 = isPending ? false : (loProfitKX2 > 0);

    // 3. Dàn Xiên 5: Top 5 con ghép 5 dàn xiên 4 (100% Strict PIT SSOT)
    let top5Nums = allLoNums.slice(0, 5);
    const lockedPenta = regEntry?.settlement?.pentaConsensus || regEntry?.bets?.pentaConsensus;
    if (lockedPenta?.xien5?.top5 && lockedPenta.xien5.top5.length >= 5) {
        top5Nums = lockedPenta.xien5.top5.map(numStr);
    }
    const tickets = getXien5Combinations(top5Nums);
    const xienStakeK = 5500;
    let xienPayoutK = 0, h5 = 0;
    if (!isPending) {
        h5 = top5Nums.filter(n => (prizeCount[n] || 0) > 0).length;
        if (h5 === 5) xienPayoutK = 5 * 38400;
        else if (h5 === 4) xienPayoutK = 1 * 38400 + 4 * 8400;
        else if (h5 === 3) xienPayoutK = 2 * 8400 + 3 * 1200;
        else if (h5 === 2) xienPayoutK = 3 * 1200;
        else xienPayoutK = 0;
    }
    const xienProfitK = isPending ? 0 : (xienPayoutK - xienStakeK);
    const isXienWin = isPending ? false : (xienProfitK > 0);

    const comboStakeK = deStakeK + loStakeK + xienStakeK;
    const comboPayoutK = dePayoutK + loPayoutK + xienPayoutK;
    const comboProfitK = isPending ? 0 : (comboPayoutK - comboStakeK);
    const isComboWin = isPending ? false : (comboProfitK > 0);

    return {
        date: targetDate,
        isPending,
        actualSpecial,
        de: {
            numbers: allDeNums,
            x2Nums: deX2Nums,
            x1Nums: deX1Nums,
            freqMap: deFreq,
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
            freqMap: loFreq,
            hits: loHits,
            hitNums: loHitNums,
            stakeK: loStakeK,
            payoutK: loPayoutK,
            profitK: loProfitK,
            isWin: isLoWin
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
            isWin: isLoWinX2
        },
        xien5: {
            top5: top5Nums,
            tickets,
            h5,
            stakeK: xienStakeK,
            payoutK: xienPayoutK,
            profitK: xienProfitK,
            isWin: isXienWin
        },
        combo: {
            stakeK: comboStakeK,
            payoutK: comboPayoutK,
            profitK: comboProfitK,
            isWin: isComboWin
        }
    };
}

module.exports = {
    numStr,
    getXien5Combinations,
    computePentaConsensusForDate
};
