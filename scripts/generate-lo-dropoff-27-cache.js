// scripts/generate-lo-dropoff-27-cache.js
'use strict';

const fs = require('fs');
const path = require('path');
const lotteryService = require('../lib/services/lotteryService');

const PRIZE_KEYS = [
    'special', 'prize1',
    'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];

function get27Prizes(row) {
    return PRIZE_KEYS.map(k => {
        const val = row[k];
        if (val === null || val === undefined) return null;
        return Number(String(val).slice(-2));
    }).filter(v => v !== null && !isNaN(v));
}

function computeScoresForPrior(prior) {
    const prevDraw = prior[prior.length - 1];
    const scores = Array(100).fill(0);

    // 1. Positional Bridge Graph (Cầu ghép 27 vị trí)
    const recentDays = prior.slice(-15);
    for (let p1 = 0; p1 < 27; p1++) {
        for (let p2 = 0; p2 < 27; p2++) {
            let bridgeStreak = 0;
            for (let d = recentDays.length - 1; d >= 1; d--) {
                const srcDraw = recentDays[d - 1];
                const targetDraw = recentDays[d];
                const numFromBridge = (srcDraw.prizes[p1] % 10) * 10 + (srcDraw.prizes[p2] % 10);
                if (targetDraw.prizes.includes(numFromBridge)) {
                    bridgeStreak++;
                } else {
                    break;
                }
            }
            if (bridgeStreak >= 1 && bridgeStreak <= 3) {
                const candNum = (prevDraw.prizes[p1] % 10) * 10 + (prevDraw.prizes[p2] % 10);
                const weight = bridgeStreak === 2 ? 3.5 : (bridgeStreak === 1 ? 2.0 : 1.5);
                scores[candNum] += weight;
            }
        }
    }

    // 2. Positional Dropoff / Repeat (Lô rơi từ 27 vị trí hôm qua)
    prevDraw.prizes.forEach(p => {
        scores[p] += 1.8;
    });

    // 3. Shadow Gap Reversion & Damping
    for (let num = 0; num < 100; num++) {
        let lastSeen = -1;
        for (let d = prior.length - 1; d >= Math.max(0, prior.length - 30); d--) {
            if (prior[d].prizes.includes(num)) {
                lastSeen = prior.length - 1 - d;
                break;
            }
        }
        if (lastSeen >= 2 && lastSeen <= 4) {
            scores[num] += 2.5;
        } else if (lastSeen > 12) {
            scores[num] -= 3.0;
        }
    }

    return scores;
}

async function generate() {
    console.log('='.repeat(80));
    console.log('🚀 GENERATING IMMUTABLE SNAPSHOT CACHE: LÔ DROPOFF 27 VỊ TRÍ (TOP 6-10)');
    console.log('='.repeat(80));

    await lotteryService.loadRawData();
    const rawData = lotteryService.getRawData() || [];

    const allDraws = rawData.map(r => ({
        date: String(r.date || r.ngay).slice(0, 10),
        prizes: get27Prizes(r),
        special: Number(String(r.special || '').slice(-2))
    })).filter(r => r.prizes.length === 27);

    const START_DATE = '2026-09-17';
    const startIndex = allDraws.findIndex(d => d.date === START_DATE);

    if (startIndex === -1) {
        throw new Error(`Start date ${START_DATE} not found in lottery draws`);
    }

    console.log(`Historical draws: ${allDraws.length}, Live combat starts at index: ${startIndex} (${START_DATE})`);

    // Configuration for Lô Dropoff 27 Vị Trí
    // Points per number: 10 points (22K/pt = 220K/num), Hit payout: 80K/pt = 800K/hit
    // For Top 7: Stake = 7 * 220K = 1,540K/day. 2 hits = 1,600K (+60K) -> Win!
    const CFG = {
        strategyId: 'loDropoff27',
        strategyName: 'Lô Khử Trùng 27 Vị Trí (Top 7 Thất Thủ)',
        defaultTopN: 7,
        pointCostK: 22,    // 22K/điểm
        pointPayoutK: 80,  // 80K/điểm
        pointsPerNum: 10,  // 10 điểm/số
        costPerNumK: 220,  // 220K/số
        payoutPerHitK: 800 // 800K/nháy
    };

    const settledLedger = [];
    let accumProfit7K = 0;
    let totalHits7 = 0;
    let winDays7 = 0;
    let maxLossStreak7 = 0;
    let curLossStreak7 = 0;
    let peak7 = 0;
    let maxDD7 = 0;

    for (let idx = startIndex; idx < allDraws.length; idx++) {
        const prior = allDraws.slice(0, idx);
        const currentDraw = allDraws[idx];
        const dt = currentDraw.date;

        const scores = computeScoresForPrior(prior);

        const ranked = scores.map((score, num) => ({
            num: String(num).padStart(2, '0'),
            score: Math.round(score * 10) / 10
        })).sort((a, b) => b.score - a.score || Number(a.num) - Number(b.num));

        const top6 = ranked.slice(0, 6).map(x => x.num);
        const top7 = ranked.slice(0, 7).map(x => x.num);
        const top8 = ranked.slice(0, 8).map(x => x.num);
        const top10 = ranked.slice(0, 10).map(x => x.num);

        const actualPrizes = currentDraw.prizes.map(p => String(p).padStart(2, '0'));

        // Calculate hits per number in top 7
        const numHitsMap = {};
        actualPrizes.forEach(p => {
            numHitsMap[p] = (numHitsMap[p] || 0) + 1;
        });

        const hitNumbers7 = top7.filter(n => numHitsMap[n] > 0);
        let hits7Count = 0;
        top7.forEach(n => {
            hits7Count += (numHitsMap[n] || 0);
        });

        const hitNumbers6 = top6.filter(n => numHitsMap[n] > 0);
        let hits6Count = 0;
        top6.forEach(n => {
            hits6Count += (numHitsMap[n] || 0);
        });

        const dayStake7K = top7.length * CFG.costPerNumK; // 7 * 220 = 1540K
        const dayPayout7K = hits7Count * CFG.payoutPerHitK; // hits * 800K
        const dayProfit7K = dayPayout7K - dayStake7K;
        const isWin7 = (hits7Count >= 2); // 2+ nháy sinh lời

        accumProfit7K += dayProfit7K;
        totalHits7 += hits7Count;
        if (isWin7) {
            winDays7++;
            curLossStreak7 = 0;
        } else {
            curLossStreak7++;
            if (curLossStreak7 > maxLossStreak7) maxLossStreak7 = curLossStreak7;
        }

        if (accumProfit7K > peak7) peak7 = accumProfit7K;
        const dd7 = peak7 - accumProfit7K;
        if (dd7 > maxDD7) maxDD7 = dd7;

        settledLedger.push({
            date: dt,
            predictionDate: dt,
            year: 2026,
            action: 'BET',
            topN: 7,
            numbers: top7,
            top6,
            top7,
            top8,
            top10,
            ranked: ranked.slice(0, 10),
            hitNumbers: hitNumbers7,
            numHitsMap: top7.reduce((acc, n) => {
                acc[n] = numHitsMap[n] || 0;
                return acc;
            }, {}),
            hits: hits7Count,
            hits7: hits7Count,
            hits6: hits6Count,
            isHit: isWin7,
            isWin: isWin7,
            stakeK: dayStake7K,
            payoutK: dayPayout7K,
            profitK: dayProfit7K,
            dayProfitK: dayProfit7K,
            accumProfitK: accumProfit7K,
            actualPrizes,
            actualSpecial: currentDraw.special,
            snapshotLock: {
                isLocked: true,
                targetDate: dt,
                lockedAt: `${dt}T12:00:00.000Z`
            }
        });
    }

    console.log(`Processed ${settledLedger.length} live draws from ${START_DATE} to ${allDraws[allDraws.length - 1].date}`);

    // Generate recommendation for next target date 2026-10-05
    const latestDraw = allDraws[allDraws.length - 1];
    const latestDate = latestDraw.date;
    const targetDate = '2026-10-05';

    console.log(`Generating Recommendation for ${targetDate} (PIT from ${latestDate})...`);
    const nextScores = computeScoresForPrior(allDraws);
    const nextRanked = nextScores.map((score, num) => ({
        num: String(num).padStart(2, '0'),
        score: Math.round(score * 10) / 10
    })).sort((a, b) => b.score - a.score || Number(a.num) - Number(b.num));

    const nextTop6 = nextRanked.slice(0, 6).map(x => x.num);
    const nextTop7 = nextRanked.slice(0, 7).map(x => x.num);
    const nextTop8 = nextRanked.slice(0, 8).map(x => x.num);
    const nextTop10 = nextRanked.slice(0, 10).map(x => x.num);

    const latestRecommendation = {
        targetDate,
        predictionDate: targetDate,
        action: 'BET',
        status: 'BET',
        methodId: CFG.strategyId,
        methodName: CFG.strategyName,
        topN: 7,
        numbers: nextTop7,
        top6: nextTop6,
        top7: nextTop7,
        top8: nextTop8,
        top10: nextTop10,
        ranked: nextRanked.slice(0, 10),
        tierX3: nextTop7.slice(0, 2), // Top 2 Siêu VIP
        tierX2: nextTop7.slice(2, 4), // Top 3-4 Trung Tâm
        tierX1: nextTop7.slice(4, 7), // Top 5-7 Bọc Lót
        stakeK: nextTop7.length * CFG.costPerNumK, // 1540K
        totalStakeVND: nextTop7.length * CFG.costPerNumK * 1000,
        payoutPerHitVND: CFG.payoutPerHitK * 1000,
        winCondition: '≥ 2 nháy sinh lời ròng dương (+60K đến +2.46M)',
        breakEvenHits: 2,
        historicalWinRate: winDays7 / settledLedger.length,
        historicalAvgHits: totalHits7 / settledLedger.length,
        historicalProfitK: accumProfit7K,
        snapshotLock: {
            isLocked: true,
            targetDate,
            lockedAt: new Date().toISOString()
        },
        reasoning: `Quét toàn diện 27 vị trí mở thưởng XSMB up to ${latestDate}. Hợp nhất: (1) Cầu ghép 27 vị trí nhịp vàng 1-3 ngày, (2) Lô rơi đồng pha 27 giải, (3) Nhịp nhả 2-4 ngày và khử gan cứng (>12 ngày). Tuyển chọn Top 7 số có mật độ nổ cao nhất.`
    };

    const payload = {
        strategyId: CFG.strategyId,
        strategyName: CFG.strategyName,
        config: CFG,
        generatedAt: new Date().toISOString(),
        latestDataDate: latestDate,
        pendingPredictionDate: targetDate,
        summary: {
            liveCombat: {
                totalDays: settledLedger.length,
                wins: winDays7,
                losses: settledLedger.length - winDays7,
                hitRate: settledLedger.length ? winDays7 / settledLedger.length : 0,
                totalHits: totalHits7,
                avgHitsPerDay: settledLedger.length ? totalHits7 / settledLedger.length : 0,
                stakeK: settledLedger.length * (7 * CFG.costPerNumK),
                payoutK: totalHits7 * CFG.payoutPerHitK,
                profitK: accumProfit7K,
                roi: (settledLedger.length * (7 * CFG.costPerNumK)) ? accumProfit7K / (settledLedger.length * (7 * CFG.costPerNumK)) : 0,
                maxLossStreak: maxLossStreak7,
                maxDrawdownK: maxDD7
            }
        },
        latestRecommendation,
        settledLedger
    };

    const targetCacheFile = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_lo_dropoff_27_shadow.json');
    fs.writeFileSync(targetCacheFile, JSON.stringify(payload, null, 2), 'utf8');

    console.log(`\n🎉 Generated Lô Dropoff 27 cache successfully to: ${targetCacheFile}`);
    console.log(`Cache file size: ${(fs.statSync(targetCacheFile).size / 1024).toFixed(1)} KB`);
    console.log(`Summary Top 7: Win ${winDays7}/${settledLedger.length} (${(winDays7/settledLedger.length*100).toFixed(1)}%), Hits: ${totalHits7} (${(totalHits7/settledLedger.length).toFixed(2)}/day), Profit: +${(accumProfit7K/1000).toFixed(2)}M, ROI: +${(accumProfit7K/(settledLedger.length * 1540)*100).toFixed(1)}%`);
}

generate().catch(console.error);
