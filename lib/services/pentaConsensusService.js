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
    const deDropoff = advisorCache.deDropoffMerge;
    const triCore = advisorCache.triCoreDe;
    const loDropoff = advisorCache.loDropoff27;
    const loTriHarmonic = advisorCache.loTriHarmonic;
    const loQuadHybrid = advisorCache.loQuadHybrid;
    const semanticResonance = advisorCache.semanticResonanceSuite;
    const miro = advisorCache.mirofishSwarm;

    const drawPrizesObj = advisorCache.drawPrizesByDate?.[targetDate] || null;
    const isPending = !drawPrizesObj || (drawPrizesObj.special === undefined && (!drawPrizesObj.prizes || drawPrizesObj.prizes.length === 0));

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
    const isLoWin = isPending ? false : (loProfitK > 0);

    // 3. Dàn Xiên 5: Top 5 con ghép 5 dàn xiên 4 (100% Strict PIT SSOT)
    let top5Nums = allLoNums.slice(0, 5);
    const regEntry = advisorCache?.dailyLockedBetsRegistry?.dates?.[targetDate];
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
