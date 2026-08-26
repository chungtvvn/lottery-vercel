'use strict';

const fs = require('fs');
const path = require('path');

const BET_COUNT_PER_METHOD = 30;
const UNIT_STAKE_K = 1000;
const WIN_MULTIPLIER = 84;
const TOTAL_STAKE_K = (BET_COUNT_PER_METHOD + BET_COUNT_PER_METHOD) * UNIT_STAKE_K; // 60.000K

const POOL_7_METHODS = [
    'dedupEdge75Hold70',
    'dedupEdge50CombinedB40S05Hold70',
    'dedupEdge50Hold70',
    'dedupDropoffHold70',
    'avgEdge50Hold70',
    'chainSmallFirstHold70',
    'edgeHold70'
];

const METHOD_LABELS = {
    dedupEdge75Hold70: 'Edge75 PIT có kiểm chứng (Hold 70)',
    dedupEdge50CombinedB40S05Hold70: 'Đề Boost B40S05 (Hold 70)',
    dedupEdge50Hold70: 'Dự đoán Edge (Hold 70)',
    dedupDropoffHold70: 'Dropoff TB khử trùng tập số (Hold 70)',
    avgEdge50Hold70: 'Dropoff TB hiệu chỉnh 50% nền (Hold 70)',
    chainSmallFirstHold70: 'Đề Chuỗi nhỏ trước (Hold 70)',
    edgeHold70: 'Edge từng số (Hold 70)',
    deParallelBlock85Small65Hold70: 'Đề Song Song (Block 85 · Small 65) Hold 70'
};

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 100))]
        .sort((left, right) => left - right);
}

function methodLabel(methodId) {
    return METHOD_LABELS[methodId] || methodId;
}

function wilsonLowerBound(wins, total, z = 1.645) {
    if (total <= 0) return 0;
    const p = wins / total;
    const z2 = z * z;
    const denom = 1 + z2 / total;
    const center = p + z2 / (2 * total);
    const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    return Math.max(0, (center - spread) / denom);
}

/**
 * Computes window statistics for a candidate method over prior settled runs.
 */
function computeWindowStats(priorSettledRuns, methodId, windowDays) {
    const slice = windowDays ? priorSettledRuns.slice(-windowDays) : priorSettledRuns;
    let wins = 0;
    let total = 0;
    let streakLoss = 0;
    let longestLoss = 0;
    let currentLoss = 0;

    slice.forEach(run => {
        const actual = Number(run.summary?.actualSpecial);
        if (!Number.isInteger(actual)) return;
        const methodObj = run.summary?.methods?.[methodId];
        const nums = normalizeNumbers(methodObj?.numbersToBet || methodObj?.numbers);
        if (nums.length !== BET_COUNT_PER_METHOD) return;

        total += 1;
        if (nums.includes(actual)) {
            wins += 1;
            currentLoss = 0;
        } else {
            currentLoss += 1;
            longestLoss = Math.max(longestLoss, currentLoss);
        }
    });

    streakLoss = currentLoss;
    const hitRate = total > 0 ? wins / total : 0;
    const stakeK = total * BET_COUNT_PER_METHOD * UNIT_STAKE_K;
    const payoutK = wins * WIN_MULTIPLIER * UNIT_STAKE_K;
    const profitK = payoutK - stakeK;

    return {
        days: total,
        wins,
        losses: total - wins,
        hitRate,
        streakLoss,
        longestLoss,
        stakeK,
        profitK,
        roi: stakeK > 0 ? profitK / stakeK : 0,
        wilson90: wilsonLowerBound(wins, total)
    };
}

/**
 * Scores an individual candidate method using multi-horizon signals (7, 15, 30, 60, 90 days).
 */
function scoreIndividualMethod(priorSettledRuns, methodId) {
    const s7 = computeWindowStats(priorSettledRuns, methodId, 7);
    const s15 = computeWindowStats(priorSettledRuns, methodId, 15);
    const s30 = computeWindowStats(priorSettledRuns, methodId, 30);
    const s60 = computeWindowStats(priorSettledRuns, methodId, 60);
    const s90 = computeWindowStats(priorSettledRuns, methodId, 90);
    const sAll = computeWindowStats(priorSettledRuns, methodId, null);

    const minDaysRequired = Math.min(10, priorSettledRuns.length);
    if (s30.days < minDaysRequired && sAll.days < minDaysRequired) {
        return {
            methodId,
            label: methodLabel(methodId),
            score: 0,
            s7, s15, s30, s60, s90, sAll,
            wilson90: s30.wilson90
        };
    }

    // Multi-horizon composite scoring:
    // 35% Wilson 90% (30-day), 30% 30-day hit rate, 20% 15-day momentum, 15% 7-day surge, -4% loss streak penalty
    const w90 = s30.days >= 10 ? s30.wilson90 : sAll.wilson90;
    const r30 = s30.days >= 10 ? s30.hitRate : sAll.hitRate;
    const r15 = s15.days >= 5 ? s15.hitRate : r30;
    const r7 = s7.days >= 3 ? s7.hitRate : r15;
    const lossStreak = Math.min(s30.streakLoss, 5);

    const baseScore = (0.35 * w90) + (0.30 * r30) + (0.20 * r15) + (0.15 * r7) - (0.04 * lossStreak);
    const finalScore = Math.max(0, baseScore);

    return {
        methodId,
        label: methodLabel(methodId),
        score: Number(finalScore.toFixed(6)),
        s7, s15, s30, s60, s90, sAll,
        wilson90: Number(w90.toFixed(4))
    };
}

/**
 * Selects the optimal pair of methods (M1, M2) for a given prediction date using Strict PIT.
 */
function selectBestMethodPair(priorSettledRuns, candidateMethodsMap, predictionDate) {
    const availableMethodIds = POOL_7_METHODS.filter(id => {
        const m = candidateMethodsMap[id];
        const nums = normalizeNumbers(m?.numbersToBet || m?.numbers);
        return nums.length === BET_COUNT_PER_METHOD;
    });

    if (availableMethodIds.length < 2) {
        // Fallback: search any methods with 30 numbers
        Object.keys(candidateMethodsMap).forEach(id => {
            if (!availableMethodIds.includes(id)) {
                const nums = normalizeNumbers(candidateMethodsMap[id]?.numbersToBet || candidateMethodsMap[id]?.numbers);
                if (nums.length === BET_COUNT_PER_METHOD) availableMethodIds.push(id);
            }
        });
    }

    if (availableMethodIds.length < 2) {
        return null;
    }

    // Score individual methods
    const scoredMethods = availableMethodIds.map(id => scoreIndividualMethod(priorSettledRuns, id))
        .sort((a, b) => b.score - a.score);

    // Evaluate all pairs
    const pairs = [];
    for (let i = 0; i < scoredMethods.length; i++) {
        for (let j = i + 1; j < scoredMethods.length; j++) {
            const m1 = scoredMethods[i];
            const m2 = scoredMethods[j];
            const nums1 = normalizeNumbers(candidateMethodsMap[m1.methodId]?.numbersToBet || candidateMethodsMap[m1.methodId]?.numbers);
            const nums2 = normalizeNumbers(candidateMethodsMap[m2.methodId]?.numbersToBet || candidateMethodsMap[m2.methodId]?.numbers);

            const set2 = new Set(nums2);
            const intersection = nums1.filter(n => set2.has(n)).sort((a, b) => a - b);
            const union = [...new Set([...nums1, ...nums2])].sort((a, b) => a - b);
            const single1 = nums1.filter(n => !set2.has(n));
            const set1 = new Set(nums1);
            const single2 = nums2.filter(n => !set1.has(n));
            const uniqueSingles = [...new Set([...single1, ...single2])].sort((a, b) => a - b);

            const overlapCount = intersection.length;
            const jaccard = union.length > 0 ? overlapCount / union.length : 0;

            // Pair similarity multiplier:
            // High overlap (16-24 numbers) concentrates capital into high-confidence x2 bets
            let overlapMultiplier = 1.0;
            if (overlapCount >= 20) overlapMultiplier = 1.30;
            else if (overlapCount >= 16) overlapMultiplier = 1.20;
            else if (overlapCount >= 12) overlapMultiplier = 1.05;
            else if (overlapCount >= 8) overlapMultiplier = 0.90;
            else overlapMultiplier = 0.70;

            const avgScore = (m1.score + m2.score) / 2;
            const pairScore = Number((avgScore * overlapMultiplier).toFixed(6));

            pairs.push({
                m1: m1.methodId,
                m1Label: m1.label,
                m1Score: m1.score,
                m1Stats30: m1.s30,
                m2: m2.methodId,
                m2Label: m2.label,
                m2Score: m2.score,
                m2Stats30: m2.s30,
                nums1,
                nums2,
                intersection,
                single1,
                single2,
                uniqueSingles,
                union,
                overlapCount,
                jaccard: Number(jaccard.toFixed(4)),
                pairScore,
                avgScore: Number(avgScore.toFixed(6))
            });
        }
    }

    pairs.sort((a, b) => b.pairScore - a.pairScore || b.overlapCount - a.overlapCount || b.avgScore - a.avgScore);
    const champion = pairs[0];

    // Build natural Vietnamese explanations
    const plainReasons = [
        `Gộp 2 phương pháp xuất sắc nhất: [${champion.m1Label}] và [${champion.m2Label}].`,
        `Độ tương đồng giao thoa cao: Trùng khớp ${champion.overlapCount}/30 số (Hệ số Jaccard ${(champion.jaccard * 100).toFixed(1)}%).`,
        `Tập trung vốn cược x2 vào ${champion.overlapCount} số trùng (Lãi +108K khi trúng) và cược x1 vào ${champion.uniqueSingles.length} số riêng bọc lót (Lãi +24K khi trúng).`,
        `Phong độ 30 kỳ: M1 đạt ${(champion.m1Stats30.hitRate * 100).toFixed(1)}% trúng · M2 đạt ${(champion.m2Stats30.hitRate * 100).toFixed(1)}% trúng.`
    ];

    // Confidence rating (1 - 5 stars)
    const confidenceStars = Math.min(5.0, Math.max(3.5, 3.5 + (champion.pairScore * 3.5) + (champion.overlapCount >= 16 ? 0.4 : 0)));

    return {
        champion,
        rankedPairs: pairs.slice(0, 10),
        scoredMethods,
        confidence: Number(confidenceStars.toFixed(1)),
        plainReasons
    };
}

/**
 * Builds the comprehensive settled ledger from all historical records (Strict Point-In-Time).
 */
function buildSettledDualMergeLedger(orderedRuns, rawRows) {
    const rawMap = new Map((rawRows || []).map(r => [isoDate(r.date), Number(r.special)]));

    const settledLedger = [];
    let cumulativeWins = 0;
    let cumulativeWinsX2 = 0;
    let cumulativeWinsX1 = 0;
    let cumulativeLosses = 0;
    let cumulativeStakeK = 0;
    let cumulativePayoutK = 0;

    orderedRuns.forEach((run, idx) => {
        const predictionDate = isoDate(run.predictionDate);
        if (!predictionDate) return;

        const actualSpecial = Number.isInteger(Number(run.summary?.actualSpecial))
            ? Number(run.summary.actualSpecial)
            : rawMap.get(predictionDate);
        const isSettled = Number.isInteger(actualSpecial);

        // Strict PIT: Prior settled runs ONLY up to idx - 1
        const priorSettledRuns = orderedRuns.slice(0, idx).filter(r => {
            const d = isoDate(r.predictionDate);
            const act = Number.isInteger(Number(r.summary?.actualSpecial)) ? Number(r.summary.actualSpecial) : rawMap.get(d);
            return Number.isInteger(act);
        });

        const methodsMap = run.summary?.methods || {};
        const pairSelection = selectBestMethodPair(priorSettledRuns, methodsMap, predictionDate);

        if (!pairSelection || !pairSelection.champion) {
            if (isSettled) {
                settledLedger.push({
                    date: predictionDate,
                    actual: actualSpecial,
                    abstained: true,
                    isLocked: false,
                    statusText: 'Chưa đủ dữ liệu (Bỏ ngày)',
                    hitType: 'abstained',
                    profitK: 0,
                    cumulativeProfitK: cumulativePayoutK - cumulativeStakeK,
                    m1: null,
                    m2: null,
                    intersection: [],
                    uniqueSingles: [],
                    union: []
                });
            }
            return;
        }

        const champ = pairSelection.champion;
        const numsX2 = champ.intersection;
        const numsX1 = champ.uniqueSingles;
        const allUnion = champ.union;

        let hitType = 'pending';
        let hitNumber = null;
        let payoutK = 0;
        let dayProfitK = 0;

        if (isSettled) {
            if (numsX2.includes(actualSpecial)) {
                hitType = 'win_x2';
                hitNumber = actualSpecial;
                payoutK = 2 * WIN_MULTIPLIER * UNIT_STAKE_K; // 168.000K
                cumulativeWinsX2 += 1;
                cumulativeWins += 1;
            } else if (numsX1.includes(actualSpecial)) {
                hitType = 'win_x1';
                hitNumber = actualSpecial;
                payoutK = 1 * WIN_MULTIPLIER * UNIT_STAKE_K; // 84.000K
                cumulativeWinsX1 += 1;
                cumulativeWins += 1;
            } else {
                hitType = 'loss';
                payoutK = 0;
                cumulativeLosses += 1;
            }

            cumulativeStakeK += TOTAL_STAKE_K;
            cumulativePayoutK += payoutK;
            dayProfitK = payoutK - TOTAL_STAKE_K;
        }

        const settledCount = cumulativeWins + cumulativeLosses;
        const cumulativeHitRate = settledCount > 0 ? cumulativeWins / settledCount : 0;
        const cumulativeProfitK = cumulativePayoutK - cumulativeStakeK;

        settledLedger.push({
            date: predictionDate,
            actual: isSettled ? actualSpecial : null,
            settled: isSettled,
            isLocked: true,
            abstained: false,
            m1: champ.m1,
            m1Label: champ.m1Label,
            m2: champ.m2,
            m2Label: champ.m2Label,
            intersection: numsX2,
            uniqueSingles: numsX1,
            union: allUnion,
            overlapCount: champ.overlapCount,
            totalNumbers: allUnion.length,
            jaccard: champ.jaccard,
            pairScore: champ.pairScore,
            hitType,
            hitNumber,
            stakeK: TOTAL_STAKE_K,
            payoutK: isSettled ? payoutK : null,
            profitK: isSettled ? dayProfitK : null,
            cumulativeHitRate: isSettled ? Number(cumulativeHitRate.toFixed(4)) : null,
            cumulativeProfitK: isSettled ? cumulativeProfitK : null,
            settledIndex: isSettled ? settledCount : null
        });
    });

    const activeSettledRecords = settledLedger.filter(r => r.settled && r.isLocked);
    const totalDays = activeSettledRecords.length;
    const winsX2 = activeSettledRecords.filter(r => r.hitType === 'win_x2').length;
    const winsX1 = activeSettledRecords.filter(r => r.hitType === 'win_x1').length;
    const totalWins = winsX2 + winsX1;
    const totalLosses = totalDays - totalWins;

    const totalStake = totalDays * TOTAL_STAKE_K;
    const totalPayout = (winsX2 * 2 * WIN_MULTIPLIER * UNIT_STAKE_K) + (winsX1 * WIN_MULTIPLIER * UNIT_STAKE_K);
    const netProfitK = totalPayout - totalStake;
    const overallRoi = totalStake > 0 ? netProfitK / totalStake : 0;

    // Slice window helper
    function windowMetrics(sliceRecords) {
        const count = sliceRecords.length;
        if (!count) return { days: 0, wins: 0, winsX2: 0, winsX1: 0, losses: 0, hitRate: 0, profitK: 0, roi: 0 };
        const wX2 = sliceRecords.filter(r => r.hitType === 'win_x2').length;
        const wX1 = sliceRecords.filter(r => r.hitType === 'win_x1').length;
        const w = wX2 + wX1;
        const st = count * TOTAL_STAKE_K;
        const pay = (wX2 * 2 * WIN_MULTIPLIER * UNIT_STAKE_K) + (wX1 * WIN_MULTIPLIER * UNIT_STAKE_K);
        const prof = pay - st;
        return {
            days: count,
            wins: w,
            winsX2: wX2,
            winsX1: wX1,
            losses: count - w,
            hitRate: Number((w / count).toFixed(4)),
            winX2Rate: Number((wX2 / count).toFixed(4)),
            stakeK: st,
            payoutK: pay,
            profitK: prof,
            roi: Number((prof / st).toFixed(4))
        };
    }

    const last7 = activeSettledRecords.slice(-7);
    const last15 = activeSettledRecords.slice(-15);
    const last30 = activeSettledRecords.slice(-30);
    const last60 = activeSettledRecords.slice(-60);
    const last90 = activeSettledRecords.slice(-90);

    return {
        records: settledLedger,
        summary: {
            totalSettled: totalDays,
            winsX2,
            winsX1,
            totalWins,
            totalLosses,
            overallHitRate: totalDays > 0 ? Number((totalWins / totalDays).toFixed(4)) : 0,
            winX2Rate: totalDays > 0 ? Number((winsX2 / totalDays).toFixed(4)) : 0,
            winX1Rate: totalDays > 0 ? Number((winsX1 / totalDays).toFixed(4)) : 0,
            totalStakeK: totalStake,
            totalPayoutK: totalPayout,
            overallProfitK: netProfitK,
            roi: Number(overallRoi.toFixed(4)),
            breakEvenHitRate: Number((60 / 84).toFixed(4)),
            windows: {
                last7: windowMetrics(last7),
                last15: windowMetrics(last15),
                last30: windowMetrics(last30),
                last60: windowMetrics(last60),
                last90: windowMetrics(last90)
            }
        }
    };
}

/**
 * Builds the complete Dual-Method Merge Advisor payload.
 */
function buildDualMergeAdvisor(historyRecords, rawRows, options = {}) {
    const rawMap = new Map((rawRows || []).map(r => [isoDate(r.date), Number(r.special)]));

    // Filter and sort runs
    const orderedRuns = (historyRecords || [])
        .filter(r => r?.predictionDate && r?.summary?.methods)
        .slice()
        .sort((a, b) => a.predictionDate.localeCompare(b.predictionDate));

    // Build settled ledger
    const settledData = buildSettledDualMergeLedger(orderedRuns, rawRows);

    // Build latest recommendation for tomorrow/today
    const latestRun = orderedRuns.at(-1);
    let latestRecommendation = null;

    if (latestRun) {
        const priorSettledRuns = orderedRuns.filter(r => {
            const d = isoDate(r.predictionDate);
            const act = Number.isInteger(Number(r.summary?.actualSpecial)) ? Number(r.summary.actualSpecial) : rawMap.get(d);
            return Number.isInteger(act);
        });

        const pairSelection = selectBestMethodPair(priorSettledRuns, latestRun.summary?.methods || {}, latestRun.predictionDate);

        if (pairSelection && pairSelection.champion) {
            const champ = pairSelection.champion;
            latestRecommendation = {
                predictionDate: latestRun.predictionDate,
                sourceDataThrough: latestRun.sourceDrawDate || latestRun.predictionDate,
                m1: champ.m1,
                m1Label: champ.m1Label,
                m1Score: champ.m1Score,
                m2: champ.m2,
                m2Label: champ.m2Label,
                m2Score: champ.m2Score,
                nums1: champ.nums1,
                nums2: champ.nums2,
                intersectionX2: champ.intersection,
                uniqueSinglesX1: champ.uniqueSingles,
                fullUnion: champ.union,
                overlapCount: champ.overlapCount,
                totalNumbersCount: champ.union.length,
                jaccard: champ.jaccard,
                pairScore: champ.pairScore,
                confidence: pairSelection.confidence,
                plainReasons: pairSelection.plainReasons,
                economics: {
                    unitStakeK: UNIT_STAKE_K,
                    stakeK: TOTAL_STAKE_K,
                    winMultiplier: WIN_MULTIPLIER,
                    x2PayoutK: 2 * WIN_MULTIPLIER * UNIT_STAKE_K,
                    x2ProfitK: 2 * WIN_MULTIPLIER * UNIT_STAKE_K - TOTAL_STAKE_K,
                    x1PayoutK: 1 * WIN_MULTIPLIER * UNIT_STAKE_K,
                    x1ProfitK: 1 * WIN_MULTIPLIER * UNIT_STAKE_K - TOTAL_STAKE_K,
                    lossProfitK: -TOTAL_STAKE_K
                },
                rankedPairs: pairSelection.rankedPairs,
                scoredMethods: pairSelection.scoredMethods
            };
        }
    }

    return {
        version: 'dual-merge-advisor-v1',
        generatedAt: new Date().toISOString(),
        description: 'Thực chiến GỘP 2/7 phương pháp Mốc lịch sử · Đánh x2 số trùng · Đánh x1 số riêng · Strict PIT 100%',
        latestRecommendation,
        settledLedger: settledData.records,
        summary: settledData.summary
    };
}

module.exports = {
    POOL_7_METHODS,
    METHOD_LABELS,
    TOTAL_STAKE_K,
    UNIT_STAKE_K,
    WIN_MULTIPLIER,
    isoDate,
    normalizeNumbers,
    computeWindowStats,
    scoreIndividualMethod,
    selectBestMethodPair,
    buildSettledDualMergeLedger,
    buildDualMergeAdvisor
};
