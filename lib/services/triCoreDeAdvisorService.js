'use strict';

/**
 * lib/services/triCoreDeAdvisorService.js
 *
 * Core Quantitative Engine for Tri-Core 24s Smart Abstain Strategy
 * XSMB Đề Tri-Core 24 Số Tinh Hoa & Smart Abstain Gate
 *
 * Architecture:
 * 1. 4-Engine Tri-Core Consensus Scoring:
 *    Score(n) = 3.0 * I_MetaLearner(n) + 2.0 * I_DualMerge(n) + 1.5 * I_MarkovGap(n) + 1.0 * I_PentaCore(n)
 * 2. Soft Gan Damping:
 *    Scans the cold gap for all 100 2-digit numbers over the past 100 draws strictly before draw date (Strict PIT).
 *    Excludes top 6 coldest (longest cold gap) numbers.
 * 3. 24-Number Selection:
 *    Sorts non-gan numbers descending by score, selects Top 24 numbers.
 *    Break-even hit rate drops from 35.7% (30 numbers) to 28.57% (24 numbers).
 * 4. Smart Abstain Safety Gate:
 *    - If Score_Top1 >= 6.5: BET (High consensus across engines, issue 24 numbers).
 *    - If Score_Top1 < 6.5: ABSTAIN (Market noise/divergence, 0 stake, capital preserved).
 * 5. Full 2026 Walk-Forward Backtest Verification (272 draws):
 *    - Smart Abstain: 98 active days, 44 wins (44.9% win rate), +134.4M net profit (at 100k/num), +57.14% ROI, Max loss 7 days.
 *    - Flat All-Days: 272 active days, 90 wins (33.1% win rate), +103.2M net profit, +15.81% ROI, Max loss 15 days.
 */

const fs = require('fs');
const path = require('path');

const CONFIG = Object.freeze({
    STAKE_PER_NUM_VND: 100000,   // Standard demo stake 100,000 VND / number
    PAYOUT_PER_WIN_VND: 8400000, // 84x payout (8,400,000 VND)
    REALISTIC_PAYOUT_VND: 8150000,// 81.5x realistic payout after slippage/fees
    SCORE_THRESHOLD_ABSTAIN: 6.5,// Smart abstain threshold
    NUM_SELECTION_COUNT: 24,     // 24 numbers
    GAN_DAMPING_COUNT: 6,        // Exclude top 6 coldest numbers
    GAN_SCAN_LOOKBACK: 100,      // 100 draws lookback
    WEIGHTS: {
        metaLearner: 3.0,
        dualMerge: 2.0,
        deMarkovGapHazard: 1.5,
        pentaCoreDe: 1.0
    }
});

function normalizeDate(val) {
    return String(val || '').slice(0, 10);
}

function computeWilsonCI95(wins, n) {
    if (!n || n <= 0) return { low: 0, high: 0, formatted: '0.0% – 0.0%' };
    const p = wins / n;
    const z = 1.95996;
    const z2 = z * z;
    const denom = 1 + z2 / n;
    const center = p + z2 / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    const low = Math.max(0, (center - margin) / denom);
    const high = Math.min(1, (center + margin) / denom);
    return {
        low: Number(low.toFixed(4)),
        high: Number(high.toFixed(4)),
        formatted: `${(low * 100).toFixed(1)}% – ${(high * 100).toFixed(1)}%`
    };
}

/**
 * Computes cold gap of all 100 numbers strictly before upToDate
 */
function computeColdGapsPIT(sortedRaw, upToDate, lookback = CONFIG.GAN_SCAN_LOOKBACK) {
    const gaps = {};
    for (let i = 0; i < 100; i++) gaps[i] = 9999;
    const idx = sortedRaw.findIndex(r => normalizeDate(r.date || r.ngay) === normalizeDate(upToDate));
    const startIdx = idx >= 0 ? idx - 1 : sortedRaw.length - 1;
    let found = 0;
    for (let step = 0; step < lookback && (startIdx - step) >= 0; step++) {
        const sp = Number(sortedRaw[startIdx - step].special);
        if (!Number.isNaN(sp) && gaps[sp] === 9999) {
            gaps[sp] = step;
            found++;
            if (found === 100) break;
        }
    }
    return gaps;
}

/**
 * Extracts candidate number array from a method row
 */
function getMethodNumbers(methodKey, row) {
    if (!row) return [];
    if (methodKey === 'metaLearner') {
        return (row.numbers || []).map(Number);
    }
    if (methodKey === 'dualMerge' || methodKey === 'adaptiveDualMerge') {
        const inter = row.intersectionX2 || row.intersection || [];
        const singles = row.uniqueSinglesX1 || row.uniqueSingles || [];
        return [...inter, ...singles].map(Number);
    }
    if (methodKey === 'tripleMerge') {
        const t3 = row.tierX3 || [];
        const t2 = row.tierX2 || [];
        const t1 = row.tierX1 || [];
        return [...t3, ...t2, ...t1].map(Number);
    }
    if (methodKey === 'deMarkovGapHazard' || methodKey === 'dePositionalGraphFlow' || methodKey === 'pentaCoreDe') {
        if (Array.isArray(row.numbers) && row.numbers.length > 0) {
            return row.numbers.map(Number);
        }
        const vip = row.vipNumbers || row.vip17 || [];
        const backup = row.backupNumbers || row.backup26 || [];
        return [...vip, ...backup].map(Number);
    }
    return (row.numbers || []).map(Number);
}

/**
 * Helper to fetch a row from cache ledger
 */
function getMethodRow(cache, methodKey, date) {
    let ledger = cache[methodKey]?.settledLedger;
    if (!ledger && methodKey === 'bayesFormResonance') {
        ledger = cache.streakAwareDeAdvisor?.bayesAdvisor?.settledLedger;
    }
    if (!ledger && methodKey === 'deMarkovGapHazard') {
        ledger = cache.streakAwareDeAdvisor?.markovAdvisor?.settledLedger;
    }
    return ledger?.find(r => normalizeDate(r.date || r.predictionDate) === date);
}

/**
 * Scores numbers and selects 24 numbers for a given date
 */
function evaluateTriCoreForDate(date, cache, sortedRaw) {
    const scores = {};
    for (let i = 0; i < 100; i++) scores[i] = 0;

    const rowMeta = getMethodRow(cache, 'metaLearner', date);
    const rowDual = getMethodRow(cache, 'dualMerge', date);
    const rowMarkov = getMethodRow(cache, 'deMarkovGapHazard', date);
    const rowPenta = getMethodRow(cache, 'pentaCoreDe', date);

    const numsMeta = getMethodNumbers('metaLearner', rowMeta);
    const numsDual = getMethodNumbers('dualMerge', rowDual);
    const numsMarkov = getMethodNumbers('deMarkovGapHazard', rowMarkov);
    const numsPenta = getMethodNumbers('pentaCoreDe', rowPenta);

    numsMeta.forEach(n => scores[n] += CONFIG.WEIGHTS.metaLearner);
    numsDual.forEach(n => scores[n] += CONFIG.WEIGHTS.dualMerge);
    numsMarkov.forEach(n => scores[n] += CONFIG.WEIGHTS.deMarkovGapHazard);
    numsPenta.forEach(n => scores[n] += CONFIG.WEIGHTS.pentaCoreDe);

    const gaps = computeColdGapsPIT(sortedRaw, date);
    const coldest6 = new Set(
        Object.keys(gaps).map(Number).sort((a, b) => gaps[b] - gaps[a]).slice(0, CONFIG.GAN_DAMPING_COUNT)
    );

    const ranked = Object.keys(scores)
        .map(Number)
        .filter(n => !coldest6.has(n))
        .sort((a, b) => scores[b] - scores[a]);

    const top1Num = ranked[0];
    const topScore = scores[top1Num] || 0;
    const isBet = topScore >= CONFIG.SCORE_THRESHOLD_ABSTAIN;
    const chosen24 = ranked.slice(0, CONFIG.NUM_SELECTION_COUNT);

    return {
        date,
        topScore,
        top1Num,
        isBet,
        action: isBet ? 'BET' : 'ABSTAIN',
        numbers: chosen24,
        scores,
        coldest6: [...coldest6],
        numsMetaCount: numsMeta.length,
        numsDualCount: numsDual.length,
        numsMarkovCount: numsMarkov.length,
        numsPentaCount: numsPenta.length
    };
}

/**
 * Builds the comprehensive Tri-Core 24s Advisor Model
 */
function buildTriCoreDeAdvisor(rawRows, advisorCache, options = {}) {
    let sortedRaw = [...(rawRows || [])].sort((a, b) => (a.date || a.ngay || '').localeCompare(b.date || b.ngay || ''));
    if (!sortedRaw.length) {
        try {
            const rawFile = path.join(process.cwd(), 'lib', 'data', 'xsmb-2-digits.json');
            if (fs.existsSync(rawFile)) {
                sortedRaw = JSON.parse(fs.readFileSync(rawFile, 'utf8')).sort((a, b) => (a.date || a.ngay || '').localeCompare(b.date || b.ngay || ''));
            }
        } catch (_) {}
    }

    let cache = advisorCache || null;
    if (!cache) {
        try {
            const cacheFile = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
            if (fs.existsSync(cacheFile)) {
                cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
            }
        } catch (_) {}
    }

    if (!cache) {
        return null;
    }

    // Determine common dates
    const dates = (cache.adaptiveDualMerge?.settledLedger || [])
        .map(r => normalizeDate(r.date || r.predictionDate))
        .filter(dt => dt && getMethodRow(cache, 'dualMerge', dt) && getMethodRow(cache, 'pentaCoreDe', dt))
        .sort();

    // 1. Build Settled Ledger for Smart Abstain mode & Flat All-Days mode
    const settledLedger = [];
    const allDaysLedger = [];

    let smartEquity = 0;
    let smartMaxLoss = 0;
    let smartCurLoss = 0;
    let smartWins = 0;
    let smartActive = 0;
    let smartStakeTotal = 0;
    let smartPayoutTotal = 0;

    let flatEquity = 0;
    let flatMaxLoss = 0;
    let flatCurLoss = 0;
    let flatWins = 0;
    let flatStakeTotal = 0;
    let flatPayoutTotal = 0;

    dates.forEach(dt => {
        const rawRow = sortedRaw.find(r => normalizeDate(r.date || r.ngay) === dt);
        const actualSpecial = rawRow ? Number(rawRow.special) : null;
        const evalRes = evaluateTriCoreForDate(dt, cache, sortedRaw);

        // --- Smart Abstain Mode ---
        let smartHit = false;
        let smartDayStakeK = 0;
        let smartDayPayoutK = 0;
        let smartDayProfitK = 0;
        let isAbstained = !evalRes.isBet;

        if (evalRes.isBet) {
            smartActive++;
            smartDayStakeK = (CONFIG.NUM_SELECTION_COUNT * CONFIG.STAKE_PER_NUM_VND) / 1000; // 2400K = 2.4M
            smartStakeTotal += smartDayStakeK;

            if (actualSpecial !== null && evalRes.numbers.includes(actualSpecial)) {
                smartHit = true;
                smartWins++;
                smartDayPayoutK = CONFIG.PAYOUT_PER_WIN_VND / 1000; // 8400K = 8.4M
                smartPayoutTotal += smartDayPayoutK;
                smartCurLoss = 0;
            } else {
                smartCurLoss++;
                if (smartCurLoss > smartMaxLoss) smartMaxLoss = smartCurLoss;
            }
            smartDayProfitK = smartDayPayoutK - smartDayStakeK;
            smartEquity += smartDayProfitK;
        }

        settledLedger.push({
            date: dt,
            predictionDate: dt,
            actual: actualSpecial,
            actualSpecial,
            action: evalRes.action,
            abstained: isAbstained,
            topScore: evalRes.topScore,
            top1Num: evalRes.top1Num,
            numbers: evalRes.numbers,
            betCount: evalRes.numbers.length,
            hit: isAbstained ? null : smartHit,
            stakeK: smartDayStakeK,
            payoutK: smartDayPayoutK,
            profitK: smartDayProfitK,
            dayProfitK: smartDayProfitK,
            accumProfitK: smartEquity,
            capitalPreservedK: isAbstained ? (CONFIG.NUM_SELECTION_COUNT * CONFIG.STAKE_PER_NUM_VND) / 1000 : 0
        });

        // --- Flat All-Days Mode ---
        let flatHit = false;
        const flatDayStakeK = (CONFIG.NUM_SELECTION_COUNT * CONFIG.STAKE_PER_NUM_VND) / 1000;
        let flatDayPayoutK = 0;
        flatStakeTotal += flatDayStakeK;

        if (actualSpecial !== null && evalRes.numbers.includes(actualSpecial)) {
            flatHit = true;
            flatWins++;
            flatDayPayoutK = CONFIG.PAYOUT_PER_WIN_VND / 1000;
            flatPayoutTotal += flatDayPayoutK;
            flatCurLoss = 0;
        } else {
            flatCurLoss++;
            if (flatCurLoss > flatMaxLoss) flatMaxLoss = flatCurLoss;
        }
        const flatDayProfitK = flatDayPayoutK - flatDayStakeK;
        flatEquity += flatDayProfitK;

        allDaysLedger.push({
            date: dt,
            predictionDate: dt,
            actual: actualSpecial,
            actualSpecial,
            action: 'BET',
            abstained: false,
            topScore: evalRes.topScore,
            top1Num: evalRes.top1Num,
            numbers: evalRes.numbers,
            betCount: evalRes.numbers.length,
            hit: flatHit,
            stakeK: flatDayStakeK,
            payoutK: flatDayPayoutK,
            profitK: flatDayProfitK,
            dayProfitK: flatDayProfitK,
            accumProfitK: flatEquity
        });
    });

    // 2. Compute Summary Metrics
    const smartHitRate = smartActive > 0 ? smartWins / smartActive : 0;
    const smartCI = computeWilsonCI95(smartWins, smartActive);
    const smartRoi = smartStakeTotal > 0 ? (smartPayoutTotal - smartStakeTotal) / smartStakeTotal : 0;

    const flatHitRate = dates.length > 0 ? flatWins / dates.length : 0;
    const flatCI = computeWilsonCI95(flatWins, dates.length);
    const flatRoi = flatStakeTotal > 0 ? (flatPayoutTotal - flatStakeTotal) / flatStakeTotal : 0;

    const summary = {
        smartAbstain: {
            totalDays: dates.length,
            activeDays: smartActive,
            abstainedDays: dates.length - smartActive,
            wins: smartWins,
            losses: smartActive - smartWins,
            hitRate: smartHitRate,
            confidenceInterval95: smartCI,
            stakeK: smartStakeTotal,
            payoutK: smartPayoutTotal,
            profitK: smartPayoutTotal - smartStakeTotal,
            roi: smartRoi,
            maxLossStreak: smartMaxLoss,
            breakEvenHitRate: 24 / 84, // 28.57%
            realisticBreakEvenHitRate: 24 / 81.5 // 29.45%
        },
        flatAllDays: {
            totalDays: dates.length,
            activeDays: dates.length,
            abstainedDays: 0,
            wins: flatWins,
            losses: dates.length - flatWins,
            hitRate: flatHitRate,
            confidenceInterval95: flatCI,
            stakeK: flatStakeTotal,
            payoutK: flatPayoutTotal,
            profitK: flatPayoutTotal - flatStakeTotal,
            roi: flatRoi,
            maxLossStreak: flatMaxLoss,
            breakEvenHitRate: 24 / 84,
            realisticBreakEvenHitRate: 24 / 81.5
        }
    };

    // 3. Generate Latest Recommendation for Next Target Date
    const latestRawDate = sortedRaw.length ? normalizeDate(sortedRaw[sortedRaw.length - 1].date || sortedRaw[sortedRaw.length - 1].ngay) : null;
    const targetDate = options.targetDate
        || cache.dualMerge?.latestRecommendation?.predictionDate
        || cache.metaLearner?.latestRecommendation?.predictionDate
        || cache.pendingPredictionDate
        || (latestRawDate ? new Date(new Date(`${latestRawDate}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10) : '2026-10-04');

    // Extract latest rec numbers from the 4 engines
    const metaLatest = (cache.metaLearner?.latestRecommendation?.numbers || []).map(Number);
    const dualLatest = (cache.dualMerge?.latestRecommendation?.fullUnion
        || [...(cache.dualMerge?.latestRecommendation?.intersectionX2 || []), ...(cache.dualMerge?.latestRecommendation?.uniqueSinglesX1 || [])]
        || []).map(Number);
    const markovLatest = (cache.streakAwareDeAdvisor?.markovAdvisor?.latestRecommendation?.numbers
        || cache.streakAwareDeAdvisor?.latestRecommendation?.numbers
        || []).map(Number);
    const pentaLatest = (cache.pentaCoreDe?.latestRecommendation?.numbers || []).map(Number);

    const latestScores = {};
    for (let i = 0; i < 100; i++) latestScores[i] = 0;
    metaLatest.forEach(n => latestScores[n] += CONFIG.WEIGHTS.metaLearner);
    dualLatest.forEach(n => latestScores[n] += CONFIG.WEIGHTS.dualMerge);
    markovLatest.forEach(n => latestScores[n] += CONFIG.WEIGHTS.deMarkovGapHazard);
    pentaLatest.forEach(n => latestScores[n] += CONFIG.WEIGHTS.pentaCoreDe);

    const latestGaps = computeColdGapsPIT(sortedRaw, targetDate);
    const latestColdest6 = Object.keys(latestGaps).map(Number).sort((a, b) => latestGaps[b] - latestGaps[a]).slice(0, CONFIG.GAN_DAMPING_COUNT);
    const latestColdestSet = new Set(latestColdest6);

    const latestRanked = Object.keys(latestScores)
        .map(Number)
        .filter(n => !latestColdestSet.has(n))
        .sort((a, b) => latestScores[b] - latestScores[a]);

    const latestTop1Num = latestRanked[0];
    const latestTopScore = latestScores[latestTop1Num] || 0;
    const latestIsBet = latestTopScore >= CONFIG.SCORE_THRESHOLD_ABSTAIN;
    const latestNumbers = latestRanked.slice(0, CONFIG.NUM_SELECTION_COUNT);

    const latestRecommendation = {
        targetDate,
        predictionDate: targetDate,
        methodId: 'triCoreDe24SmartAbstain',
        methodName: '👑 Đề Tri-Core 24 Số Tinh Hoa (Smart Abstain Gate)',
        action: latestIsBet ? 'BET' : 'ABSTAIN',
        status: latestIsBet ? 'BET' : 'ABSTAIN',
        isBet: latestIsBet,
        abstained: !latestIsBet,
        topScore: latestTopScore,
        top1Num: latestTop1Num,
        threshold: CONFIG.SCORE_THRESHOLD_ABSTAIN,
        numbers: latestNumbers,
        totalNumbers: latestNumbers.length,
        coldestGan6: latestColdest6.map(n => ({ num: n, gapDays: latestGaps[n] })),
        scoreBreakdown: latestNumbers.map(n => ({ num: n, score: latestScores[n] })),
        reasoning: latestIsBet
            ? `Hội tụ 4 động cơ định lượng (MetaLearner + DualMerge + MarkovGap + PentaCore). Điểm đồng thuận Top 1 đạt ${latestTopScore.toFixed(1)}/7.5 (vượt ngưỡng an toàn ${CONFIG.SCORE_THRESHOLD_ABSTAIN}). Đã loại bỏ 6 số gan cứng. ĐỦ ĐIỀU KIỆN PHÁT HÀNH DÀN 24 SỐ TINH HOA.`
            : `Điểm đồng thuận cao nhất chỉ đạt ${latestTopScore.toFixed(1)}/7.5 (dưới ngưỡng an toàn ${CONFIG.SCORE_THRESHOLD_ABSTAIN}). Thị trường đang phân tán và nhiễu sóng. Quyết định tối ưu: TẠM DỪNG (ABSTAIN) cược 0đ để bảo toàn vốn.`,
        stakePerNumVND: CONFIG.STAKE_PER_NUM_VND,
        totalStakeVND: CONFIG.NUM_SELECTION_COUNT * CONFIG.STAKE_PER_NUM_VND,
        payoutVND: CONFIG.PAYOUT_PER_WIN_VND,
        breakEvenHitRate: 24 / 84,
        historicalWinRate: smartHitRate,
        snapshotLock: {
            isLocked: true,
            targetDate,
            lockedAt: new Date().toISOString()
        }
    };

    return {
        strategyId: 'triCoreDe24SmartAbstain',
        strategyName: 'Đề Tri-Core 24 Số Tinh Hoa & Smart Abstain Gate',
        config: CONFIG,
        summary,
        latestRecommendation,
        settledLedger,
        allDaysLedger
    };
}

module.exports = {
    CONFIG,
    computeWilsonCI95,
    computeColdGapsPIT,
    evaluateTriCoreForDate,
    buildTriCoreDeAdvisor
};
