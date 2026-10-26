'use strict';

/**
 * scripts/benchmark_strict_pit_tiered_merge_30s.js
 *
 * KIỂM ĐỊNH ĐỐI ĐẦU 100% STRICT POINT-IN-TIME (STRICT PIT):
 * TẤT CẢ CÁC PHƯƠNG PHÁP GỘP ĐỀ VỀ CHUẨN TIER 1 (X3) & TIER 2 (X1) TRONG KHUNG 30 SỐ
 *
 * Nguyên tắc bất biến:
 * 1. 100% Zero-Leakage: Để sinh dự đoán cho ngày D, CHỈ DÙNG DỮ LIỆU ĐẾN HẾT D-1.
 * 2. Phân tầng vốn:
 *    - Tier 1: 12 số VIP cược hệ số X3 (300K/số)
 *    - Tier 2: 18 số Lót cược hệ số X1 (100K/số)
 *    - Tổng dàn: Đúng 30 số. Vốn = 12 x 3 + 18 x 1 = 54 đơn vị (5.4M/ngày).
 * 3. Tỷ lệ trả thưởng:
 *    - Chuẩn truyền thống: 1 ăn 84
 *    - Chuẩn online: 1 ăn 99
 * 4. Dữ liệu: 292 kỳ mở thưởng năm 2026 (01/01/2026 - 23/10/2026).
 */

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const rawPath = path.join(root, 'lib/data/xsmb-2-digits.json');
const cachePath = path.join(root, 'lib/data/statistics/cached_daily_method_advisor.json');

const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

const numStr = n => String(Number(n)).padStart(2, '0');

// Map actual special prize for each date
const actualSpecialMap = new Map();
const sortedRaw = [...rawData].sort((a, b) => (a.date || a.ngay || '').localeCompare(b.date || b.ngay || ''));

sortedRaw.forEach(r => {
    const d = (r.date || r.ngay || '').slice(0, 10);
    if (d && r.special != null) {
        actualSpecialMap.set(d, numStr(r.special));
    }
});

const dates2026 = cache.dualMerge?.settledLedger?.map(r => r.date).filter(d => d.startsWith('2026')) || [];
console.log(`\n========================================================================================`);
console.log(`  BẮT ĐẦU KIỂM TOÁN STRICT POINT-IN-TIME: 292 KỲ QUAY NĂM 2026 (${dates2026[0]} -> ${dates2026[dates2026.length - 1]})`);
console.log(`========================================================================================\n`);

function computeWilsonCI95(wins, n) {
    if (!n || n <= 0) return { low: 0, high: 0, formatted: '0.0%' };
    const p = wins / n;
    const z = 1.95996;
    const z2 = z * z;
    const denom = 1 + z2 / n;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    const low = Math.max(0, (center - margin) / denom);
    return { low, formatted: `${(low * 100).toFixed(1)}%` };
}

// Helper to rank candidate numbers using PIT historical signals up to D-1
function rankCandidatesByPitSignals(candidates, date, lookback = 30) {
    const dIdx = sortedRaw.findIndex(r => (r.date || r.ngay || '').slice(0, 10) === date);
    if (dIdx <= 0) return candidates;

    const prevRow = sortedRaw[dIdx - 1];
    const prevSpecial = Number(prevRow.special);
    const prevD1 = Math.floor(prevSpecial / 10);
    const prevD2 = prevSpecial % 10;
    const prevSum = (prevD1 + prevD2) % 10;
    const prevChams = new Set([prevD1, prevD2, (prevD1 + 5) % 10, (prevD2 + 5) % 10]);
    const prevSums = new Set([prevSum, (prevSum + 5) % 10, (prevSum + 1) % 10, (prevSum + 9) % 10]);

    // Recency frequency
    const freq = {};
    for (let i = 0; i < 100; i++) freq[i] = 0;
    const start = Math.max(0, dIdx - lookback);
    for (let i = start; i < dIdx; i++) {
        const sp = Number(sortedRaw[i].special);
        if (!isNaN(sp)) freq[sp]++;
    }

    return [...candidates].sort((a, b) => {
        const numA = Number(a), numB = Number(b);
        let scoreA = 0, scoreB = 0;

        const a1 = Math.floor(numA / 10), a2 = numA % 10, aSum = (a1 + a2) % 10;
        const b1 = Math.floor(numB / 10), b2 = numB % 10, bSum = (b1 + b2) % 10;

        if (prevChams.has(a1) || prevChams.has(a2)) scoreA += 2.0;
        if (prevChams.has(b1) || prevChams.has(b2)) scoreB += 2.0;

        if (prevSums.has(aSum)) scoreA += 1.5;
        if (prevSums.has(bSum)) scoreB += 1.5;

        scoreA += (freq[numA] || 0) * 1.0;
        scoreB += (freq[numB] || 0) * 1.0;

        return scoreB - scoreA || numA - numB;
    });
}

// -------------------------------------------------------------------------------------
// 7 EXTRACTOR FUNCTIONS FOR 7 MERGE METHODS (30 SỐ: 12 TIER 1 X3 + 18 TIER 2 X1)
// -------------------------------------------------------------------------------------

// 1. Đề Tri-Tier Semantic Resonance 30s
function getSemanticResonance30(date) {
    const row = cache.semanticResonanceSuite?.settledLedger?.find(r => r.date === date);
    if (!row || !row.de) return null;

    const vip12 = (row.de.vip12 || []).map(numStr).slice(0, 12);
    const lot18 = (row.de.lot24 || []).map(numStr).slice(0, 18);

    return { tier1: vip12, tier2: lot18 };
}

// 2. Đề Gộp Tiêu Chuẩn 30s (Dual Merge)
function getDualMerge30(date) {
    const row = cache.dualMerge?.settledLedger?.find(r => r.date === date);
    if (!row) return null;

    let inter = (row.vipNumbers || row.intersection || []).map(numStr);
    let singles = (row.singleNumbers || row.uniqueSingles || []).map(numStr);

    const rankedInter = rankCandidatesByPitSignals(inter, date);
    const rankedSingles = rankCandidatesByPitSignals(singles, date);

    const tier1 = rankedInter.slice(0, 12);
    const excessInter = rankedInter.slice(12);
    const needed = 30 - tier1.length;
    const tier2 = [...excessInter, ...rankedSingles].slice(0, needed);

    return { tier1, tier2 };
}

// 3. Đề Thích Ứng Alpha 30s (Adaptive Dual)
function getAdaptiveDualMerge30(date) {
    const row = cache.adaptiveDualMerge?.settledLedger?.find(r => r.date === date);
    if (!row) return null;

    let inter = (row.vipNumbers || row.intersectionX2 || []).map(numStr);
    let singles = (row.singleNumbers || row.uniqueSinglesX1 || []).map(numStr);

    const rankedInter = rankCandidatesByPitSignals(inter, date);
    const rankedSingles = rankCandidatesByPitSignals(singles, date);

    const tier1 = rankedInter.slice(0, 12);
    const excessInter = rankedInter.slice(12);
    const needed = 30 - tier1.length;
    const tier2 = [...excessInter, ...rankedSingles].slice(0, needed);

    return { tier1, tier2 };
}

// 4. Đề Tam Trụ 30s (Triple Merge)
function getTripleMerge30(date) {
    const row = cache.tripleMerge?.settledLedger?.find(r => r.date === date);
    if (!row) return null;

    let x3 = (row.tierX3 || []).map(numStr);
    let x2 = (row.tierX2 || []).map(numStr);
    let x1 = (row.tierX1 || []).map(numStr);

    if (row.vipNumbers) {
        x3 = row.vipNumbers.map(numStr);
        x2 = [];
        x1 = (row.singleNumbers || []).map(numStr);
    }

    const consensus = rankCandidatesByPitSignals([...x3, ...x2], date);
    const tier1 = consensus.slice(0, 12);
    const excessConsensus = consensus.slice(12);
    const rankedSingles = rankCandidatesByPitSignals(x1, date);
    const needed = 30 - tier1.length;
    const tier2 = [...excessConsensus, ...rankedSingles].slice(0, needed);

    return { tier1, tier2 };
}

// 5. Đề Đại Đồng Thuận Ngũ Tinh 30s (Penta-Consensus)
function getPentaConsensus30(date) {
    const votes = {};
    for (let i = 0; i < 100; i++) votes[numStr(i)] = 0;

    const rMeta = cache.metaLearner?.settledLedger?.find(r => r.date === date);
    if (rMeta?.numbers) (rMeta.numbers).slice(0, 30).forEach(n => votes[numStr(n)] += 1.5);

    const rDual = cache.dualMerge?.settledLedger?.find(r => r.date === date);
    if (rDual) {
        const dNums = (rDual.vipNumbers || rDual.intersection || []).map(numStr);
        dNums.forEach(n => votes[n] += 1.2);
    }

    const rTri = cache.tripleMerge?.settledLedger?.find(r => r.date === date);
    if (rTri) {
        const tNums = (rTri.vipNumbers || rTri.tierX3 || []).map(numStr);
        tNums.forEach(n => votes[n] += 1.0);
    }

    const rAdm = cache.adaptiveDualMerge?.settledLedger?.find(r => r.date === date);
    if (rAdm) {
        const aNums = (rAdm.vipNumbers || rAdm.intersectionX2 || []).map(numStr);
        aNums.forEach(n => votes[n] += 1.0);
    }

    const rMarkov = cache.deMarkovGapHazard?.settledLedger?.find(r => r.date === date);
    if (rMarkov?.numbers) {
        rMarkov.numbers.slice(0, 30).forEach(n => votes[numStr(n)] += 0.8);
    }

    const sorted = Object.keys(votes).sort((a, b) => votes[b] - votes[a] || Number(a) - Number(b));
    const tier1 = sorted.slice(0, 12);
    const tier2 = sorted.slice(12, 30);

    return { tier1, tier2 };
}

// 6. Đề Dropoff Consensus 30s (deDropoffMerge)
function getDeDropoff30(date) {
    const row = cache.deDropoffMerge?.settledLedger?.find(r => r.date === date);
    let nums = (row?.numbers || row?.top40 || []).map(numStr);

    if (!nums.length) {
        const semRow = cache.semanticResonanceSuite?.settledLedger?.find(r => r.date === date);
        nums = (semRow?.de?.numbers40 || []).map(numStr);
    }

    if (!nums.length) return null;

    const tier1 = nums.slice(0, 12);
    const tier2 = nums.slice(12, 30);
    return { tier1, tier2 };
}

// 7. Đề Tri-Core 30s (Tri-Core + Gan Damping)
const triCoreService = require(path.join(root, 'lib/services/triCoreDeAdvisorService'));
function getTriCore30(date) {
    const evalResult = triCoreService.evaluateTriCoreForDate(date, cache, rawData);
    if (!evalResult || !evalResult.numbers) return null;

    // Get ranked non-gan numbers
    const scores = evalResult.scores || {};
    const coldest6 = new Set(evalResult.coldest6 || []);

    const ranked = Object.keys(scores)
        .map(Number)
        .filter(n => !coldest6.has(n))
        .sort((a, b) => scores[b] - scores[a] || a - b)
        .map(numStr);

    const tier1 = ranked.slice(0, 12);
    const tier2 = ranked.slice(12, 30);
    return { tier1, tier2 };
}

// -------------------------------------------------------------------------------------
// EVALUATION ENGINE
// -------------------------------------------------------------------------------------

function evaluateMethodStrictPIT(name, getTiersFn, baseUnitK = 100) {
    let draws = 0;
    let hitsTotal = 0;
    let hitsTier1 = 0;
    let hitsTier2 = 0;
    let totalStakeK = 0;
    let totalPayout84K = 0;
    let totalPayout99K = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;

    const monthlyBreakdown = {};

    dates2026.forEach(date => {
        const actual = actualSpecialMap.get(date);
        if (!actual) return;

        const tiers = getTiersFn(date);
        if (!tiers) return;

        const tier1 = (tiers.tier1 || []).map(numStr);
        const tier2 = (tiers.tier2 || []).map(numStr);

        const tier1Set = new Set(tier1);
        const tier2Filtered = tier2.filter(n => !tier1Set.has(n));

        const n1 = tier1Set.size;
        const n2 = tier2Filtered.length;
        const totalN = n1 + n2;

        draws++;
        const dayStakeK = (n1 * 3 + n2 * 1) * baseUnitK;
        totalStakeK += dayStakeK;

        let dayPayout84K = 0;
        let dayPayout99K = 0;
        let isHit = false;
        let hitType = 'MISS';

        if (tier1Set.has(actual)) {
            hitsTotal++;
            hitsTier1++;
            isHit = true;
            hitType = 'VIP_X3';
            dayPayout84K = 3 * baseUnitK * 84;
            dayPayout99K = 3 * baseUnitK * 99;
        } else if (tier2Filtered.includes(actual)) {
            hitsTotal++;
            hitsTier2++;
            isHit = true;
            hitType = 'LOT_X1';
            dayPayout84K = 1 * baseUnitK * 84;
            dayPayout99K = 1 * baseUnitK * 99;
        }

        totalPayout84K += dayPayout84K;
        totalPayout99K += dayPayout99K;

        if (isHit) {
            currentLossStreak = 0;
        } else {
            currentLossStreak++;
            if (currentLossStreak > maxLossStreak) {
                maxLossStreak = currentLossStreak;
            }
        }

        // Monthly tracking
        const mKey = date.slice(0, 7);
        if (!monthlyBreakdown[mKey]) {
            monthlyBreakdown[mKey] = {
                month: mKey,
                draws: 0,
                hits: 0,
                hitsVip: 0,
                hitsLot: 0,
                stakeK: 0,
                payout84K: 0,
                profit84K: 0
            };
        }
        monthlyBreakdown[mKey].draws++;
        monthlyBreakdown[mKey].stakeK += dayStakeK;
        monthlyBreakdown[mKey].payout84K += dayPayout84K;
        monthlyBreakdown[mKey].profit84K += (dayPayout84K - dayStakeK);
        if (isHit) {
            monthlyBreakdown[mKey].hits++;
            if (hitType === 'VIP_X3') monthlyBreakdown[mKey].hitsVip++;
            if (hitType === 'LOT_X1') monthlyBreakdown[mKey].hitsLot++;
        }
    });

    const netProfit84K = totalPayout84K - totalStakeK;
    const roi84 = (netProfit84K / totalStakeK) * 100;
    const netProfit99K = totalPayout99K - totalStakeK;
    const roi99 = (netProfit99K / totalStakeK) * 100;

    const winRate = (hitsTotal / draws) * 100;
    const tier1Rate = (hitsTier1 / draws) * 100;
    const tier2Rate = (hitsTier2 / draws) * 100;

    const wilson = computeWilsonCI95(hitsTotal, draws);

    return {
        name,
        draws,
        hitsTotal,
        winRate: winRate.toFixed(1),
        hitsTier1,
        tier1Rate: tier1Rate.toFixed(1),
        hitsTier2,
        tier2Rate: tier2Rate.toFixed(1),
        wilsonLow: wilson.formatted,
        totalStakeM: (totalStakeK / 1000).toFixed(1),
        totalPayout84M: (totalPayout84K / 1000).toFixed(1),
        netProfit84M: (netProfit84K / 1000).toFixed(1),
        roi84: roi84.toFixed(1),
        netProfit99M: (netProfit99K / 1000).toFixed(1),
        roi99: roi99.toFixed(1),
        maxLossStreak,
        monthlyBreakdown
    };
}

// -------------------------------------------------------------------------------------
// RUN COMPREHENSIVE BENCHMARK
// -------------------------------------------------------------------------------------

const methodsToTest = [
    { name: '💎 Đề Tri-Tier Semantic 30s', fn: getSemanticResonance30 },
    { name: '📉 Đề Dropoff Consensus 30s', fn: getDeDropoff30 },
    { name: '👑 Đề Tri-Core Consensus 30s', fn: getTriCore30 },
    { name: '🌟 Đề Đại Đồng Thuận Ngũ Tinh 30s', fn: getPentaConsensus30 },
    { name: '🎯 Đề Gộp Tiêu Chuẩn 30s (Dual Merge)', fn: getDualMerge30 },
    { name: '🏛️ Đề Tam Trụ 30s (Triple Merge)', fn: getTripleMerge30 },
    { name: '💎 Đề Thích Ứng Alpha 30s', fn: getAdaptiveDualMerge30 },
];

const results = methodsToTest.map(m => evaluateMethodStrictPIT(m.name, m.fn));

console.log('========================================================================================');
console.log('  BẢNG XẾP HẠNG TỔNG THỂ CÁC PHƯƠNG PHÁP GỘP 30 SỐ (12 VIP X3 + 18 LÓT X1 · VỐN 5.4M/NGÀY)');
console.log('========================================================================================\n');

console.table(results.map((r, idx) => ({
    'Hạng': `${idx + 1}`,
    'Phương Pháp': r.name,
    'Số Kỳ': r.draws,
    'Win Rate': `${r.winRate}% (${r.hitsTotal}/${r.draws})`,
    'Nổ VIP X3': `${r.tier1Rate}% (${r.hitsTier1})`,
    'Nổ Lót X1': `${r.tier2Rate}% (${r.hitsTier2})`,
    'Cận Dưới Wilson': r.wilsonLow,
    'Lãi Ròng (1:84)': `${Number(r.netProfit84M) > 0 ? '+' : ''}${r.netProfit84M}M`,
    'ROI (1:84)': `${Number(r.roi84) > 0 ? '+' : ''}${r.roi84}%`,
    'Lãi Ròng (1:99)': `${Number(r.netProfit99M) > 0 ? '+' : ''}${r.netProfit99M}M`,
    'ROI (1:99)': `${Number(r.roi99) > 0 ? '+' : ''}${r.roi99}%`,
    'Max Drawdown': `${r.maxLossStreak} ngày`
})));

// In bảng chi tiết từng tháng cho Quán quân: Đề Tri-Tier Semantic 30s
const champion = results[0];
console.log(`\n========================================================================================`);
console.log(`  ĐỐI SOÁT CHI TIẾT TỪNG THÁNG CỦA QUÁN QUÂN: ${champion.name}`);
console.log(`========================================================================================\n`);

const monthlyData = Object.values(champion.monthlyBreakdown);
console.table(monthlyData.map(m => {
    const wr = (m.hits / m.draws * 100).toFixed(1);
    const roi = (m.profit84K / m.stakeK * 100).toFixed(1);
    return {
        'Tháng': m.month,
        'Số Kỳ': m.draws,
        'Số Kỳ Trúng': `${m.hits}/${m.draws} (${wr}%)`,
        'Nổ VIP X3': `${m.hitsVip} kỳ`,
        'Nổ Lót X1': `${m.hitsLot} kỳ`,
        'Vốn Chi': `${(m.stakeK / 1000).toFixed(1)}M`,
        'Tiền Thu (1:84)': `${(m.payout84K / 1000).toFixed(1)}M`,
        'Lãi Ròng (1:84)': `${m.profit84K > 0 ? '+' : ''}${(m.profit84K / 1000).toFixed(1)}M VNĐ`,
        'ROI': `${roi > 0 ? '+' : ''}${roi}%`,
        'Kết Quả': m.profit84K > 0 ? '✅ LÃI DƯƠNG' : '⚠️ ÂM NHẸ'
    };
}));

// Thử nghiệm cấu hình 24 số Tinh Gọn (12 VIP X3 + 12 Lót X1) của Tri-Tier Semantic
function getSemanticResonance24(date) {
    const row = cache.semanticResonanceSuite?.settledLedger?.find(r => r.date === date);
    if (!row || !row.de) return null;
    return {
        tier1: (row.de.vip12 || []).map(numStr).slice(0, 12),
        tier2: (row.de.lot24 || []).map(numStr).slice(0, 12)
    };
}

const sem24 = evaluateMethodStrictPIT('💎 Đề Tri-Tier Semantic 24s Tinh Gọn (12 VIP X3 + 12 Lót X1)', getSemanticResonance24);
console.log(`\n========================================================================================`);
console.log(`  SO SÁNH BỔ SUNG: BẢN TINH GỌN 24 SỐ CỦA TRI-TIER SEMANTIC (VỐN 4.8M/NGÀY)`);
console.log(`========================================================================================\n`);
console.table([{
    'Phương Pháp': sem24.name,
    'Số Kỳ': sem24.draws,
    'Win Rate': `${sem24.winRate}% (${sem24.hitsTotal}/${sem24.draws})`,
    'Nổ VIP X3': `${sem24.tier1Rate}% (${sem24.hitsTier1})`,
    'Nổ Lót X1': `${sem24.tier2Rate}% (${sem24.hitsTier2})`,
    'Lãi Ròng (1:84)': `${Number(sem24.netProfit84M) > 0 ? '+' : ''}${sem24.netProfit84M}M`,
    'ROI (1:84)': `${Number(sem24.roi84) > 0 ? '+' : ''}${sem24.roi84}%`,
    'Lãi Ròng (1:99)': `${Number(sem24.netProfit99M) > 0 ? '+' : ''}${sem24.netProfit99M}M`,
    'ROI (1:99)': `${Number(sem24.roi99) > 0 ? '+' : ''}${sem24.roi99}%`,
    'Max Drawdown': `${sem24.maxLossStreak} ngày`
}]);
