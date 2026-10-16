'use strict';

/**
 * scripts/research-de-advisor-vs-shadow-split.js
 *
 * Nghiên cứu định lượng thực nghiệm:
 * 1. Lấy Top 20 số Đề các phương pháp ở daily-advisor và gộp lại (Set Union).
 * 2. Lấy 1/2 số đầu tiên các phương pháp ở shadow và gộp lại (Set Union).
 * 3. Giao thoa vàng (Intersection) và Hợp nhất toàn diện (Union).
 * 4. Thống kê chi tiết: Tỷ lệ trúng, Trung bình số con, Ngưỡng hòa vốn, P&L, Max Drawdown, Wilson 95% CI.
 * 100% Strict Point-In-Time (Strict PIT) trên dữ liệu thực tế 2026.
 */

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));

// Helper format số
const numStr = n => String(Number(n)).padStart(2, '0');

// Wilson 95% Score Interval
function wilsonScore(k, n, z = 1.96) {
    if (n === 0) return { lower: 0, upper: 0, center: 0 };
    const p = k / n;
    const denom = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denom;
    const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
    return {
        lower: Math.max(0, center - margin),
        upper: Math.min(1, center + margin),
        center: p
    };
}

// Lấy danh sách ngày năm 2026
const allDates = cache.semanticResonanceSuite?.settledLedger?.map(r => String(r.date).slice(0, 10)) || [];
console.log(`Loaded ${allDates.length} dates in 2026 (from ${allDates[0]} to ${allDates[allDates.length - 1]}).`);

// Cấu trúc trích xuất phương pháp Daily-Advisor
function getDailyAdvisorTop20(date, mode = '4core') {
    const sets = [];
    
    // 1. MetaLearner (30 số -> Top 20)
    const metaRow = cache.metaLearner?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    if (metaRow?.numbers) {
        sets.push({ name: 'metaLearner', nums: metaRow.numbers.slice(0, 20).map(numStr) });
    }

    // 2. DualMerge (30 số / union -> Top 20)
    const dualRow = cache.dualMerge?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    if (dualRow) {
        const dNums = (dualRow.union && dualRow.union.length) 
            ? dualRow.union 
            : [...(dualRow.intersection || []), ...(dualRow.uniqueSingles || [])];
        if (dNums.length) {
            sets.push({ name: 'dualMerge', nums: dNums.slice(0, 20).map(numStr) });
        }
    }

    // 3. TripleMerge (30 số / fullUnion -> Top 20)
    const tripleRow = cache.tripleMerge?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    if (tripleRow) {
        const tNums = (tripleRow.fullUnion && tripleRow.fullUnion.length)
            ? tripleRow.fullUnion
            : [...(tripleRow.tierX3 || []), ...(tripleRow.tierX2 || []), ...(tripleRow.tierX1 || [])];
        if (tNums.length) {
            sets.push({ name: 'tripleMerge', nums: tNums.slice(0, 20).map(numStr) });
        }
    }

    // 4. StreakAwareDeAdvisor (Đề Thích Ứng Động -> Top 20)
    const streakRow = cache.streakAwareDeAdvisor?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    if (streakRow?.numbers) {
        sets.push({ name: 'streakAware', nums: streakRow.numbers.slice(0, 20).map(numStr) });
    }

    if (mode === 'all8') {
        // 5. PentaCoreDe
        const pentaRow = cache.pentaCoreDe?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
        if (pentaRow?.numbers) sets.push({ name: 'pentaCore', nums: pentaRow.numbers.slice(0, 20).map(numStr) });

        // 6. deMarkovGapHazard
        const markovRow = cache.deMarkovGapHazard?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
        if (markovRow?.numbers) sets.push({ name: 'markovGap', nums: markovRow.numbers.slice(0, 20).map(numStr) });

        // 7. dePositionalGraphFlow
        const posRow = cache.dePositionalGraphFlow?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
        if (posRow?.numbers) sets.push({ name: 'positionalGraph', nums: posRow.numbers.slice(0, 20).map(numStr) });

        // 8. adaptiveDualMerge
        const adaptRow = cache.adaptiveDualMerge?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
        if (adaptRow?.fullUnion) sets.push({ name: 'adaptiveDual', nums: adaptRow.fullUnion.slice(0, 20).map(numStr) });
    }

    // Merge (Union)
    const merged = new Set();
    sets.forEach(s => s.nums.forEach(n => merged.add(n)));

    return {
        methodsCount: sets.length,
        sets,
        mergedNumbers: Array.from(merged).sort((a, b) => Number(a) - Number(b))
    };
}

// Cấu trúc trích xuất phương pháp Shadow
function getShadowTopHalf(date) {
    const sets = [];

    // Lấy thông tin từ semanticResonanceSuite settledLedger (chứa cả de.numbers40, numbers36, vip12)
    const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    // Lấy thông tin từ deDropoffMerge settledLedger (nếu có riêng)
    const dropoffRow = cache.deDropoffMerge?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    // Lấy thông tin từ triCoreDe settledLedger
    const triRow = cache.triCoreDe?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);

    // Hệ 1: Đa Động Cơ 40s (Dropoff/Consensus 40s) -> 1/2 đầu = 20 số
    const nums40 = (dropoffRow?.numbers && dropoffRow.numbers.length)
        ? dropoffRow.numbers
        : (resRow?.de?.numbers40 || []);
    if (nums40.length) {
        sets.push({ name: 'Hệ 1 (Đa Động Cơ 40s -> 20s)', nums: nums40.slice(0, 20).map(numStr) });
    }

    // Hệ 2: Tri-Core 24s -> 1/2 đầu = 12 số
    const nums24 = triRow?.numbers || [];
    if (nums24.length) {
        sets.push({ name: 'Hệ 2 (Tri-Core 24s -> 12s)', nums: nums24.slice(0, 12).map(numStr) });
    }

    // Hệ 3: VIP Sweet-Spot 36s -> 1/2 đầu = 18 số
    const nums36Dropoff = (dropoffRow?.numbers36 && dropoffRow.numbers36.length)
        ? dropoffRow.numbers36
        : (nums40.length ? nums40.slice(0, 36) : []);
    if (nums36Dropoff.length) {
        sets.push({ name: 'Hệ 3 (VIP Sweet-Spot 36s -> 18s)', nums: nums36Dropoff.slice(0, 18).map(numStr) });
    }

    // Hệ 4: Tri-Tier Semantic Resonance 36s -> 1/2 đầu = 18 số (hoặc VIP 12)
    const numsRes36 = resRow?.de?.numbers36 || [];
    if (numsRes36.length) {
        sets.push({ name: 'Hệ 4 (Semantic Resonance 36s -> 18s)', nums: numsRes36.slice(0, 18).map(numStr) });
    }

    // Merge (Union)
    const merged = new Set();
    sets.forEach(s => s.nums.forEach(n => merged.add(n)));

    return {
        methodsCount: sets.length,
        sets,
        mergedNumbers: Array.from(merged).sort((a, b) => Number(a) - Number(b))
    };
}

// Đánh giá hiệu năng của một chiến lược trên danh sách ngày
function evaluateStrategy(name, dates, getNumbersFn) {
    let hits = 0;
    let totalDraws = 0;
    let totalNumbersCount = 0;
    
    // Streaks
    let currentWinStreak = 0;
    let maxWinStreak = 0;
    let currentLossStreak = 0;
    let maxLossStreak = 0;
    let curStreak = 0; // >0 win streak, <0 loss streak

    // P&L Tracking (100K/số, payout 84x và payout 99x)
    let profit100K_84 = 0;
    let stake100K = 0;
    let payout100K_84 = 0;
    let profit100K_99 = 0;
    let payout100K_99 = 0;

    let profit200K_84 = 0;
    let stake200K = 0;
    let payout200K_84 = 0;

    const dailyLedger = [];

    dates.forEach((d, idx) => {
        const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        const actualSpecial = resRow?.actualSpecial || resRow?.de?.actual || null;
        if (!actualSpecial) return;

        const actualStr = numStr(actualSpecial);
        const numbers = getNumbersFn(d);
        if (!numbers || !numbers.length) return;

        totalDraws++;
        const numCount = numbers.length;
        totalNumbersCount += numCount;

        const isHit = numbers.includes(actualStr);
        if (isHit) {
            hits++;
            currentWinStreak++;
            currentLossStreak = 0;
            if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak;
            curStreak = curStreak > 0 ? curStreak + 1 : 1;
        } else {
            currentLossStreak++;
            currentWinStreak = 0;
            if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
            curStreak = curStreak < 0 ? curStreak - 1 : -1;
        }

        // P&L 100K
        const dayStake100K = numCount * 100; // in K
        const dayPayout100K_84 = isHit ? 8400 : 0;
        const dayProfit100K_84 = dayPayout100K_84 - dayStake100K;
        const dayPayout100K_99 = isHit ? 9900 : 0;
        const dayProfit100K_99 = dayPayout100K_99 - dayStake100K;

        stake100K += dayStake100K;
        payout100K_84 += dayPayout100K_84;
        profit100K_84 += dayProfit100K_84;
        payout100K_99 += dayPayout100K_99;
        profit100K_99 += dayProfit100K_99;

        // P&L 200K
        const dayStake200K = numCount * 200;
        const dayPayout200K_84 = isHit ? 16800 : 0;
        const dayProfit200K_84 = dayPayout200K_84 - dayStake200K;

        stake200K += dayStake200K;
        payout200K_84 += dayPayout200K_84;
        profit200K_84 += dayProfit200K_84;

        dailyLedger.push({
            date: d,
            actual: actualStr,
            count: numCount,
            isHit,
            profit100K_84: dayProfit100K_84,
            cumProfit100K_84: profit100K_84
        });
    });

    const winRate = totalDraws > 0 ? (hits / totalDraws) : 0;
    const avgNumbers = totalDraws > 0 ? (totalNumbersCount / totalDraws) : 0;
    const breakEvenRate84 = avgNumbers / 84;
    const breakEvenRate99 = avgNumbers / 99;
    const wilson = wilsonScore(hits, totalDraws);

    const roi84_100K = stake100K > 0 ? (profit100K_84 / stake100K) * 100 : 0;
    const roi99_100K = stake100K > 0 ? (profit100K_99 / stake100K) * 100 : 0;
    const roi84_200K = stake200K > 0 ? (profit200K_84 / stake200K) * 100 : 0;

    return {
        name,
        totalDraws,
        hits,
        winRate,
        avgNumbers,
        breakEvenRate84,
        breakEvenRate99,
        edge84: winRate - breakEvenRate84,
        edge99: winRate - breakEvenRate99,
        wilsonLower: wilson.lower,
        wilsonUpper: wilson.upper,
        maxWinStreak,
        maxLossStreak,
        curStreak,
        stake100K_M: stake100K / 1000,
        profit100K_84_M: profit100K_84 / 1000,
        roi84_100K,
        profit100K_99_M: profit100K_99 / 1000,
        roi99_100K,
        stake200K_M: stake200K / 1000,
        profit200K_84_M: profit200K_84 / 1000,
        roi84_200K,
        dailyLedger
    };
}

// Chạy phân tích trên 2 cửa sổ: Cả năm 2026 (283 kỳ) và Live Combat (từ 17/09/2026 đến 14/10/2026 - 28 kỳ)
const liveDates = allDates.filter(d => d >= '2026-09-17');

console.log(`\n======================================================`);
console.log(`=== RUNNING QUANTITATIVE BENCHMARK EXPERIMENT ===`);
console.log(`======================================================\n`);

function runBenchmark(windowName, dates) {
    console.log(`\n--------------------------------------------------------------`);
    console.log(`--- WINDOW: ${windowName} (${dates.length} draws: ${dates[0]} to ${dates[dates.length - 1]}) ---`);
    console.log(`--------------------------------------------------------------`);

    // 1. Daily Advisor - 4 Core UI Methods Top 20 Merged
    const rDA4 = evaluateStrategy('Phần 1A: Daily-Advisor 4 Core Top 20 Gộp', dates, d => {
        return getDailyAdvisorTop20(d, '4core').mergedNumbers;
    });

    // 2. Daily Advisor - All 8 Methods Top 20 Merged
    const rDA8 = evaluateStrategy('Phần 1B: Daily-Advisor All 8 Top 20 Gộp', dates, d => {
        return getDailyAdvisorTop20(d, 'all8').mergedNumbers;
    });

    // 3. Shadow - Top Half (50%) of 4 Master Suites Merged
    const rShadow = evaluateStrategy('Phần 2: Shadow 4 Suites 1/2 Đầu Gộp', dates, d => {
        return getShadowTopHalf(d).mergedNumbers;
    });

    // 4. Golden Intersection: DA (4 Core) ∩ Shadow
    const rIntersect4 = evaluateStrategy('Phần 3A: Giao Thoa Vàng (DA 4 Core ∩ Shadow)', dates, d => {
        const da = new Set(getDailyAdvisorTop20(d, '4core').mergedNumbers);
        const sh = new Set(getShadowTopHalf(d).mergedNumbers);
        return [...da].filter(n => sh.has(n));
    });

    // 5. Golden Intersection: DA (All 8) ∩ Shadow
    const rIntersect8 = evaluateStrategy('Phần 3B: Giao Thoa Vàng (DA All 8 ∩ Shadow)', dates, d => {
        const da = new Set(getDailyAdvisorTop20(d, 'all8').mergedNumbers);
        const sh = new Set(getShadowTopHalf(d).mergedNumbers);
        return [...da].filter(n => sh.has(n));
    });

    // 6. Comprehensive Union: DA (4 Core) ∪ Shadow
    const rUnion4 = evaluateStrategy('Phần 4A: Hợp Nhất Đa Tầng (DA 4 Core ∪ Shadow)', dates, d => {
        const da = getDailyAdvisorTop20(d, '4core').mergedNumbers;
        const sh = getShadowTopHalf(d).mergedNumbers;
        const u = new Set([...da, ...sh]);
        return Array.from(u).sort((a, b) => Number(a) - Number(b));
    });

    // 7. Comprehensive Union: DA (All 8) ∪ Shadow
    const rUnion8 = evaluateStrategy('Phần 4B: Hợp Nhất Đa Tầng (DA All 8 ∪ Shadow)', dates, d => {
        const da = getDailyAdvisorTop20(d, 'all8').mergedNumbers;
        const sh = getShadowTopHalf(d).mergedNumbers;
        const u = new Set([...da, ...sh]);
        return Array.from(u).sort((a, b) => Number(a) - Number(b));
    });

    const results = [rDA4, rDA8, rShadow, rIntersect4, rIntersect8, rUnion4, rUnion8];

    console.table(results.map(r => ({
        'Chiến Lược': r.name,
        'Số kỳ': r.totalDraws,
        'Trúng': `${r.hits}/${r.totalDraws}`,
        'Win Rate': `${(r.winRate * 100).toFixed(1)}%`,
        'TB Số Con': r.avgNumbers.toFixed(1),
        'Hòa Vốn (1:84)': `${(r.breakEvenRate84 * 100).toFixed(1)}%`,
        'Lợi Thế (Edge)': `${(r.edge84 * 100 > 0 ? '+' : '')}${(r.edge84 * 100).toFixed(1)}%`,
        'Wilson 95% CI': `[${(r.wilsonLower * 100).toFixed(1)}% - ${(r.wilsonUpper * 100).toFixed(1)}%]`,
        'Max Trượt': `${r.maxLossStreak} kỳ`,
        'P&L (100K 1:84)': `${r.profit100K_84_M > 0 ? '+' : ''}${r.profit100K_84_M.toFixed(1)}M`,
        'ROI (1:84)': `${r.roi84_100K > 0 ? '+' : ''}${r.roi84_100K.toFixed(1)}%`,
        'ROI (1:99)': `${r.roi99_100K > 0 ? '+' : ''}${r.roi99_100K.toFixed(1)}%`
    })));

    return results;
}

const res2026 = runBenchmark('TOÀN BỘ NĂM 2026 (FULL YEAR 283 DRAWS)', allDates);
const resLive = runBenchmark('GIAI ĐOẠN THỰC CHIẾN LIVE (28 DRAWS TỪ 17/09/2026)', liveDates);

// Ghi kết quả ra tệp JSON để lưu trữ phục vụ báo cáo
fs.writeFileSync(
    path.join(__dirname, '../data/research_advisor_vs_shadow_split_results.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), res2026, resLive }, null, 2)
);
console.log('\nSaved full experiment results to data/research_advisor_vs_shadow_split_results.json');
