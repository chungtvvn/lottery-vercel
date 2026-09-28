const fs = require('fs');
const path = require('path');

// Load full daily advisor cache
const advPath = path.join(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
const adv = JSON.parse(fs.readFileSync(advPath, 'utf8'));

console.log('=== BENCHMARK & PHÂN TÍCH SO SÁNH LÔ 2026 ===');
console.log('Tổng số kỳ quay đã đối soát:', adv.loQuantumBayesFusion?.settledLedger?.length);

const qmbfLedger = adv.loQuantumBayesFusion?.settledLedger || [];
const lo4LedgerTop6 = adv.lo4EngineFusion?.modes?.top6?.settledLedger || [];
const lo4LedgerTop7 = adv.lo4EngineFusion?.modes?.top7?.settledLedger || [];
const quadSummary = adv.loQuadHybrid?.summary || {};

// Helpers
const BASE_UNIT_STAKE = 2200; // 100đ = 2.2M (K)
const BASE_UNIT_PAYOUT = 8000; // 100đ ăn 8.0M (K)
const M3_RATIO = 25 / 100; // Mức 3 (25đ) = 0.25 Mức VIP

function analyzePlatformTiers(qmbfLedger) {
    const tiers = ['top6', 'top7', 'top8', 'top10', 'top20'];
    const results = {};

    tiers.forEach(tier => {
        const betCount = parseInt(tier.replace('top', ''), 10);
        let days = 0;
        let hitDays = 0;
        let winDays = 0;
        let lossDays = 0;
        let breakEvenDays = 0;
        let totalHits = 0;
        let totalStakeK = 0;
        let totalPayoutK = 0;
        let curLossStreak = 0;
        let maxLossStreak = 0;
        let curWinStreak = 0;
        let maxWinStreak = 0;

        qmbfLedger.forEach(row => {
            const m = row.methods?.[tier];
            if (!m) return;
            days++;
            const hits = m.hits || 0;
            totalHits += hits;
            if (hits > 0) hitDays++;

            const stakeK = betCount * BASE_UNIT_STAKE;
            const payoutK = hits * BASE_UNIT_PAYOUT;
            const profitK = payoutK - stakeK;

            totalStakeK += stakeK;
            totalPayoutK += payoutK;

            if (profitK > 0) {
                winDays++;
                curWinStreak++;
                curLossStreak = 0;
                if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
            } else if (profitK === 0) {
                breakEvenDays++;
                curWinStreak = 0;
                curLossStreak = 0;
            } else {
                lossDays++;
                curLossStreak++;
                curWinStreak = 0;
                if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
            }
        });

        const profitK = totalPayoutK - totalStakeK;
        const roi = totalStakeK > 0 ? (profitK / totalStakeK) : 0;
        const winRate = days > 0 ? (winDays / days) : 0;
        const hitDayRate = days > 0 ? (hitDays / days) : 0;
        const avgHits = days > 0 ? (totalHits / days) : 0;
        const dailyStakeK = betCount * BASE_UNIT_STAKE;
        const hitsToProfit = Math.ceil(stakeDaily(betCount) / BASE_UNIT_PAYOUT);

        results[tier] = {
            betCount,
            days,
            hitDays,
            hitDayRate,
            winDays,
            winRate,
            lossDays,
            breakEvenDays,
            totalHits,
            avgHits: avgHits.toFixed(2),
            dailyStakeVIP_M: (dailyStakeK / 1000).toFixed(1),
            dailyStakeM3_M: (dailyStakeK * M3_RATIO / 1000).toFixed(2),
            totalStakeVIP_M: (totalStakeK / 1000).toFixed(1),
            totalPayoutVIP_M: (totalPayoutK / 1000).toFixed(1),
            profitVIP_M: (profitK / 1000).toFixed(1),
            profitM3_M: (profitK * M3_RATIO / 1000).toFixed(2),
            roi: (roi * 100).toFixed(1) + '%',
            maxLossStreak,
            maxWinStreak
        };
    });

    return results;
}

function stakeDaily(count) {
    return count * BASE_UNIT_STAKE;
}

function analyze4EngineFusion(ledger) {
    // 1. Phân tích hiện tại (Full tiers: X5, X4, X3, X1)
    let days = 0;
    let hitDays = 0;
    let winDays = 0;
    let lossDays = 0;
    let totalHits = 0;
    let totalStakeK = 0;
    let totalPayoutK = 0;
    let curLossStreak = 0;
    let maxLossStreak = 0;
    let curWinStreak = 0;
    let maxWinStreak = 0;

    // 2. Biến thể Chỉ đánh Đồng Thuận (Chỉ đánh Tier >= 2 votes: X3, X4, X5 - bỏ X1)
    let cHitDays = 0;
    let cWinDays = 0;
    let cLossDays = 0;
    let cTotalHits = 0;
    let cTotalStakeK = 0;
    let cTotalPayoutK = 0;
    let cCurLossStreak = 0;
    let cMaxLossStreak = 0;
    let cTotalNums = 0;

    // 3. Biến thể Đánh phẳng Đồng Thuận (Tier >= 2 votes, cược phẳng 1x đều nhau)
    let fHitDays = 0;
    let fWinDays = 0;
    let fLossDays = 0;
    let fTotalHits = 0;
    let fTotalStakeK = 0;
    let fTotalPayoutK = 0;
    let fCurLossStreak = 0;
    let fMaxLossStreak = 0;

    ledger.forEach(row => {
        days++;
        const sK = row.dayLotoStakeK;
        const pK = row.dayLotoPayoutK;
        const prK = pK - sK;
        const h = row.dayLotoHits;

        totalStakeK += sK;
        totalPayoutK += pK;
        totalHits += h;
        if (h > 0) hitDays++;

        if (prK > 0) {
            winDays++;
            curWinStreak++;
            curLossStreak = 0;
            if (curWinStreak > maxWinStreak) maxWinStreak = curWinStreak;
        } else {
            lossDays++;
            curLossStreak++;
            curWinStreak = 0;
            if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
        }

        // Đánh Đồng Thuận >= 2 votes (với multiplier gốc)
        let dayCStakeK = 0;
        let dayCPayoutK = 0;
        let dayCHits = 0;
        let dayCNums = 0;

        // Đánh Đồng Thuận cược phẳng 1x
        let dayFStakeK = 0;
        let dayFPayoutK = 0;
        let dayFHits = 0;

        (row.betNumbers || []).forEach(bn => {
            if (bn.votes >= 2) {
                dayCNums++;
                const stake = bn.multiplier * BASE_UNIT_STAKE;
                const payout = bn.hits * bn.multiplier * BASE_UNIT_PAYOUT;
                dayCStakeK += stake;
                dayCPayoutK += payout;
                dayCHits += bn.hits;

                // Flat
                dayFStakeK += 1 * BASE_UNIT_STAKE;
                dayFPayoutK += bn.hits * 1 * BASE_UNIT_PAYOUT;
                dayFHits += bn.hits;
            }
        });

        cTotalNums += dayCNums;
        cTotalStakeK += dayCStakeK;
        cTotalPayoutK += dayCPayoutK;
        cTotalHits += dayCHits;
        if (dayCHits > 0) cHitDays++;
        if (dayCPayoutK > dayCStakeK) {
            cWinDays++;
            cCurLossStreak = 0;
        } else {
            cLossDays++;
            cCurLossStreak++;
            if (cCurLossStreak > cMaxLossStreak) cMaxLossStreak = cCurLossStreak;
        }

        fTotalStakeK += dayFStakeK;
        fTotalPayoutK += dayFPayoutK;
        fTotalHits += dayFHits;
        if (dayFHits > 0) fHitDays++;
        if (dayFPayoutK > dayFStakeK) {
            fWinDays++;
            fCurLossStreak = 0;
        } else {
            fLossDays++;
            fCurLossStreak++;
            if (fCurLossStreak > fMaxLossStreak) fMaxLossStreak = fCurLossStreak;
        }
    });

    const profitK = totalPayoutK - totalStakeK;
    const cProfitK = cTotalPayoutK - cTotalStakeK;
    const fProfitK = fTotalPayoutK - fTotalStakeK;

    return {
        full: {
            days,
            avgNums: (ledger.reduce((acc, r) => acc + (r.allNumbers?.length || 0), 0) / days).toFixed(1),
            dailyStakeVIP_M: (totalStakeK / days / 1000).toFixed(1),
            dailyStakeM3_M: (totalStakeK * M3_RATIO / days / 1000).toFixed(2),
            winRate: ((winDays / days) * 100).toFixed(1) + '%',
            hitDayRate: ((hitDays / days) * 100).toFixed(1) + '%',
            avgHits: (totalHits / days).toFixed(2),
            totalStakeVIP_M: (totalStakeK / 1000).toFixed(1),
            totalPayoutVIP_M: (totalPayoutK / 1000).toFixed(1),
            profitVIP_M: (profitK / 1000).toFixed(1),
            profitM3_M: (profitK * M3_RATIO / 1000).toFixed(2),
            roi: ((profitK / totalStakeK) * 100).toFixed(1) + '%',
            maxLossStreak,
            maxWinStreak
        },
        consensusOnly: {
            days,
            avgNums: (cTotalNums / days).toFixed(1),
            dailyStakeVIP_M: (cTotalStakeK / days / 1000).toFixed(1),
            dailyStakeM3_M: (cTotalStakeK * M3_RATIO / days / 1000).toFixed(2),
            winRate: ((cWinDays / days) * 100).toFixed(1) + '%',
            hitDayRate: ((cHitDays / days) * 100).toFixed(1) + '%',
            avgHits: (cTotalHits / days).toFixed(2),
            totalStakeVIP_M: (cTotalStakeK / 1000).toFixed(1),
            totalPayoutVIP_M: (cTotalPayoutK / 1000).toFixed(1),
            profitVIP_M: (cProfitK / 1000).toFixed(1),
            profitM3_M: (cProfitK * M3_RATIO / 1000).toFixed(2),
            roi: ((cProfitK / cTotalStakeK) * 100).toFixed(1) + '%',
            maxLossStreak: cMaxLossStreak
        },
        flatConsensus: {
            days,
            avgNums: (cTotalNums / days).toFixed(1),
            dailyStakeVIP_M: (fTotalStakeK / days / 1000).toFixed(1),
            dailyStakeM3_M: (fTotalStakeK * M3_RATIO / days / 1000).toFixed(2),
            winRate: ((fWinDays / days) * 100).toFixed(1) + '%',
            hitDayRate: ((fHitDays / days) * 100).toFixed(1) + '%',
            avgHits: (fTotalHits / days).toFixed(2),
            totalStakeVIP_M: (fTotalStakeK / 1000).toFixed(1),
            totalPayoutVIP_M: (fTotalPayoutK / 1000).toFixed(1),
            profitVIP_M: (fProfitK / 1000).toFixed(1),
            profitM3_M: (fProfitK * M3_RATIO / 1000).toFixed(2),
            roi: ((fProfitK / fTotalStakeK) * 100).toFixed(1) + '%',
            maxLossStreak: fMaxLossStreak
        }
    };
}

const platformTiers = analyzePlatformTiers(qmbfLedger);
const lo4Top6 = analyze4EngineFusion(lo4LedgerTop6);
const lo4Top7 = analyze4EngineFusion(lo4LedgerTop7);

console.log('\n--- 1. BẢNG HIỆU SUẤT CÁC MỨC LÔ NỀN TẢNG (QMBF / NỀN TẢNG) ---');
console.table(platformTiers);

console.log('\n--- 2. BẢNG HIỆU SUẤT LÔ TỔNG HỢP 4 ĐỘNG CƠ (TOP 6 LIVE) ---');
console.log('A. Full Đa Tầng (Hiện Tại):', lo4Top6.full);
console.log('B. Chỉ Đánh Đồng Thuận >= 2 Động Cơ (Multiplier):', lo4Top6.consensusOnly);
console.log('C. Đánh Phẳng Đồng Thuận >= 2 Động Cơ (1x):', lo4Top6.flatConsensus);

console.log('\n--- 3. BẢNG HIỆU SUẤT LÔ TỔNG HỢP 4 ĐỘNG CƠ (TOP 7 LIVE) ---');
console.log('A. Full Đa Tầng (Hiện Tại):', lo4Top7.full);
console.log('B. Chỉ Đánh Đồng Thuận >= 2 Động Cơ (Multiplier):', lo4Top7.consensusOnly);
console.log('C. Đánh Phẳng Đồng Thuận >= 2 Động Cơ (1x):', lo4Top7.flatConsensus);

