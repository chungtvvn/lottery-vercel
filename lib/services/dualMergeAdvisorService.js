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
 * Computes pairwise complementarity and alternating hit statistics.
 * Measures how often at least 1 method hits, how often they alternate, and how often both fail.
 */
function computePairComplementarity(priorSettledRuns, m1Id, m2Id, windowDays = 30) {
    const slice = windowDays ? priorSettledRuns.slice(-windowDays) : priorSettledRuns;
    let total = 0;
    let bothHit = 0;
    let onlyM1 = 0;
    let onlyM2 = 0;
    let bothMiss = 0;

    slice.forEach(r => {
        const act = Number(r.summary?.actualSpecial);
        if (!Number.isInteger(act)) return;
        const nums1 = r.summary?.methods?.[m1Id]?.numbersToBet || r.summary?.methods?.[m1Id]?.numbers;
        const nums2 = r.summary?.methods?.[m2Id]?.numbersToBet || r.summary?.methods?.[m2Id]?.numbers;
        if (!Array.isArray(nums1) || !Array.isArray(nums2) || nums1.length !== BET_COUNT_PER_METHOD || nums2.length !== BET_COUNT_PER_METHOD) return;

        total++;
        const h1 = nums1.map(Number).includes(act);
        const h2 = nums2.map(Number).includes(act);

        if (h1 && h2) bothHit++;
        else if (h1 && !h2) onlyM1++;
        else if (!h1 && h2) onlyM2++;
        else bothMiss++;
    });

    if (total === 0) return { unionRate: 0, compRate: 0, bothHitRate: 0, missRate: 1, total: 0 };

    return {
        total,
        bothHit,
        onlyM1,
        onlyM2,
        bothMiss,
        unionRate: (bothHit + onlyM1 + onlyM2) / total,
        compRate: (onlyM1 + onlyM2) / total,
        bothHitRate: bothHit / total,
        missRate: bothMiss / total
    };
}

/**
 * Selects the optimal pair of methods (M1, M2) for a given prediction date using Strict PIT.
 * Incorporates alternating wave synergy and union hit coverage.
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

            // Complementarity and Alternating Hit Wave Analysis
            const comp30 = computePairComplementarity(priorSettledRuns, m1.methodId, m2.methodId, 30);
            const comp15 = computePairComplementarity(priorSettledRuns, m1.methodId, m2.methodId, 15);

            // Pair similarity & overlap multiplier
            let overlapMultiplier = 1.0;
            if (overlapCount >= 20) overlapMultiplier = 1.25;
            else if (overlapCount >= 16) overlapMultiplier = 1.18;
            else if (overlapCount >= 12) overlapMultiplier = 1.05;
            else if (overlapCount >= 8) overlapMultiplier = 0.90;
            else overlapMultiplier = 0.70;

            const avgScore = (m1.score + m2.score) / 2;

            // Complementary & Alternating Wave Bonus:
            // 1. Union coverage bonus (higher probability that at least 1 method hits)
            const unionCoverageBonus = comp30.total >= 10 ? comp30.unionRate * 0.35 : 0.10;
            // 2. Alternating hit bonus (when one misses, the other saves the day)
            const alternatingBonus = comp30.total >= 10 ? comp30.compRate * 0.20 : 0.05;
            // 3. Double miss penalty
            const missPenalty = comp30.total >= 10 ? comp30.missRate * 0.20 : 0;

            const compositeScore = (avgScore + unionCoverageBonus + alternatingBonus - missPenalty) * overlapMultiplier;
            const pairScore = Number(Math.max(0, compositeScore).toFixed(6));

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
                avgScore: Number(avgScore.toFixed(6)),
                comp30,
                comp15
            });
        }
    }

    pairs.sort((a, b) => b.pairScore - a.pairScore || b.overlapCount - a.overlapCount || b.avgScore - a.avgScore);
    const champion = pairs[0];

    const unionPercent = (champion.comp30.unionRate * 100).toFixed(1);
    const compPercent = (champion.comp30.compRate * 100).toFixed(1);

    // Build natural Vietnamese explanations
    const plainReasons = [
        `Gộp 2 phương pháp xuất sắc nhất: [${champion.m1Label}] và [${champion.m2Label}].`,
        `Tối ưu đan xen bù trừ: Tỷ lệ ít nhất 1 phương pháp trúng đạt ${unionPercent}% (Bù trừ luân phiên ${compPercent}%).`,
        `Độ tương đồng giao thoa cao: Trùng khớp ${champion.overlapCount}/30 số (Hệ số Jaccard ${(champion.jaccard * 100).toFixed(1)}%).`,
        `Tập trung vốn cược x2 vào ${champion.overlapCount} số trùng (Lãi +108K khi trúng) và cược x1 vào ${champion.uniqueSingles.length} số riêng bọc lót (Lãi +24K khi trúng).`
    ];

    // Confidence rating (1 - 5 stars)
    const confidenceStars = Math.min(5.0, Math.max(3.6, 3.6 + (champion.pairScore * 3.2) + (champion.comp30.unionRate >= 0.5 ? 0.3 : 0)));

    return {
        champion,
        rankedPairs: pairs.slice(0, 10),
        scoredMethods,
        confidence: Number(confidenceStars.toFixed(1)),
        plainReasons
    };
}

let _memoizedBaseline2026 = null;
function getBaseline2026Map() {
    if (_memoizedBaseline2026) return _memoizedBaseline2026;
    const root = process.cwd();
    const baselineFile = path.join(root, 'lib', 'data', 'statistics', 'cached_milestone20y_baseline_2026.json');
    if (fs.existsSync(baselineFile)) {
        try {
            const payload = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
            const map = new Map();
            (payload.entries || []).forEach(row => {
                map.set(row.key, {
                    key: row.key,
                    year: row.year,
                    cutoffIso: row.cutoffIso,
                    startIso: row.startIso,
                    actualYears: row.actualYears,
                    sample: row.sample,
                    recordLen: row.recordLen,
                    exactCounts: new Map(Object.entries(row.exactCounts || {})),
                    cumulative: new Map(Object.entries(row.cumulative || {}))
                });
            });
            _memoizedBaseline2026 = map;
            return map;
        } catch (_) {}
    }
    return null;
}

function getSpecialNumber(row) {
    if (!row) return null;
    const val = row.special ?? row.actual ?? row.db ?? row.giaiDb ?? row.giai_dac_biet;
    const n = Number(val);
    return Number.isInteger(n) ? n : null;
}

/**
 * For dates from 2026 that do not have a published snapshot, synthesizes predictions
 * under Strict Point-In-Time using annualMilestoneService.
 */
function synthesizeMissing2026Runs(mergedRunsMap, rawRows) {
    const root = process.cwd();
    let raw = Array.isArray(rawRows) && rawRows.length > 0 ? rawRows : null;
    if (!raw) {
        try {
            const rawFile = path.join(root, 'lib', 'data', 'xsmb-2-digits.json');
            if (fs.existsSync(rawFile)) {
                raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
            }
        } catch (_) {}
    }
    if (!raw) return;

    const raw2026 = raw.filter(r => String(r.date || '').startsWith('2026-'));
    if (!raw2026.length) return;

    let annual = null;
    try {
        annual = require('./annualMilestoneService');
    } catch (_) {}
    if (!annual) return;

    const baselineMap = getBaseline2026Map();
    if (!baselineMap) return;

    raw2026.forEach((row, idx) => {
        const date = isoDate(row.date);
        if (!date) return;
        const existing = mergedRunsMap.get(date);
        const hasPoolMethods = existing && Object.keys(existing.summary?.methods || {}).length >= 2;
        const actualVal = getSpecialNumber(row);

        if (!hasPoolMethods && Number.isInteger(actualVal)) {
            try {
                const bundle = annual.buildPredictionBundleForDate(date, { targets: [70], baseline: baselineMap });
                const methods = {};
                const mapStrategy = (stratKey, targetId) => {
                    const strat = bundle.strategies?.[stratKey]?.holds?.['70'];
                    if (strat?.betNumbers?.length === BET_COUNT_PER_METHOD) {
                        methods[targetId] = { numbersToBet: strat.betNumbers.map(Number) };
                    }
                };
                mapStrategy('dedupEdge75Pit', 'dedupEdge75Hold70');
                mapStrategy('dedupEdge75Hold', 'dedupEdge75Hold70');
                mapStrategy('dedupEdge50CombinedB40S05', 'dedupEdge50CombinedB40S05Hold70');
                mapStrategy('dedupEdge50Hold', 'dedupEdge50Hold70');
                mapStrategy('dedupDropoffHold', 'dedupDropoffHold70');
                mapStrategy('chainSmallFirst', 'chainSmallFirstHold70');
                mapStrategy('chainBlockFirst', 'edgeHold70');
                mapStrategy('numberBlockSmallBlend05', 'avgEdge50Hold70');

                if (Object.keys(methods).length >= 2) {
                    mergedRunsMap.set(date, {
                        predictionDate: date,
                        sourceDrawDate: raw2026[idx - 1]?.date || date,
                        sourceType: 'strict-pit-backtest',
                        summary: {
                            actualSpecial: actualVal,
                            methods
                        }
                    });
                }
            } catch (_) {}
        } else if (existing && Number.isInteger(actualVal)) {
            existing.summary.actualSpecial = actualVal;
        }
    });
}

/**
 * Normalizes and merges runs from history, advisor snapshots, and synthesizes missing 2026 dates under Strict PIT.
 */
function normalizeDualMergeRuns(historyRecords, existingAdvisorRecords, rawRows, options = {}) {
    const root = process.cwd();
    const statisticsDir = path.join(root, 'lib', 'data', 'statistics');

    let history = Array.isArray(historyRecords) && historyRecords.length > 0 ? historyRecords : null;
    if (!history) {
        try {
            const histFile = path.join(statisticsDir, 'cached_prediction_history.json');
            if (fs.existsSync(histFile)) {
                const loaded = JSON.parse(fs.readFileSync(histFile, 'utf8'));
                history = loaded.records || loaded;
            }
        } catch (_) {}
    }

    let advisorRecords = null;
    if (Array.isArray(existingAdvisorRecords)) {
        advisorRecords = existingAdvisorRecords;
    } else if (!historyRecords || historyRecords.length === 0) {
        try {
            const advFile = path.join(statisticsDir, 'cached_daily_method_advisor.json');
            if (fs.existsSync(advFile)) {
                const loaded = JSON.parse(fs.readFileSync(advFile, 'utf8'));
                advisorRecords = loaded.records || [];
            }
        } catch (_) {}
    }

    const mergedRunsMap = new Map();

    // 1. Ingest history runs
    (history || []).forEach(r => {
        const d = isoDate(r?.predictionDate || r?.date);
        if (!d) return;
        const methods = { ...(r.summary?.methods || r.methods || {}) };
        mergedRunsMap.set(d, {
            predictionDate: d,
            sourceDrawDate: isoDate(r.sourceDrawDate || r.sourceDataThrough || d),
            sourceType: 'live-snapshot',
            summary: {
                actualSpecial: Number.isInteger(Number(r.summary?.actualSpecial))
                    ? Number(r.summary.actualSpecial)
                    : Number.isInteger(Number(r.actual)) ? Number(r.actual) : null,
                methods
            }
        });
    });

    // 2. Ingest / overlay advisor records
    (advisorRecords || []).forEach(r => {
        const d = isoDate(r?.predictionDate);
        if (!d) return;
        if (!mergedRunsMap.has(d)) {
            mergedRunsMap.set(d, {
                predictionDate: d,
                sourceDrawDate: isoDate(r.sourceDrawDate || r.sourceDataThrough || d),
                sourceType: 'live-snapshot',
                summary: {
                    actualSpecial: Number.isInteger(Number(r.actual)) ? Number(r.actual) : null,
                    methods: {}
                }
            });
        }
        const existing = mergedRunsMap.get(d);
        existing.sourceType = 'live-snapshot';
        if (r.settled && Number.isInteger(Number(r.actual))) {
            existing.summary.actualSpecial = Number(r.actual);
        }
        // Map candidateMethods
        (r.recommendation?.candidateMethods || []).forEach(cm => {
            if (cm.methodId && Array.isArray(cm.numbers)) {
                existing.summary.methods[cm.methodId] = { numbersToBet: normalizeNumbers(cm.numbers) };
            }
        });
        if (r.main?.methodId && Array.isArray(r.main?.numbers)) {
            existing.summary.methods[r.main.methodId] = { numbersToBet: normalizeNumbers(r.main.numbers) };
        }
    });

    // 3. Synthesize missing 2026 dates under Strict PIT so we have the full 2026 backtest timeline
    if (options.synthesizeMissing !== false && (options.forceSynthesize || !historyRecords || historyRecords.length === 0 || Array.isArray(rawRows))) {
        synthesizeMissing2026Runs(mergedRunsMap, rawRows);
    }

    return [...mergedRunsMap.values()].sort((a, b) => a.predictionDate.localeCompare(b.predictionDate));
}

/**
 * Builds the comprehensive settled ledger from all historical records (Strict Point-In-Time).
 * Recalculates dynamically for every day to select the best pair of methods based strictly on prior data.
 */
function buildSettledDualMergeLedger(orderedRuns, rawRows) {
    const rawMap = new Map((rawRows || []).map(r => [isoDate(r?.date || r?.ngay), getSpecialNumber(r)]).filter(([d, v]) => d && Number.isInteger(v)));

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
                    sourceType: run.sourceType || 'strict-pit-backtest',
                    isLiveSnapshot: run.sourceType === 'live-snapshot',
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

        // Only settled historical days are included in the settled ledger table
        if (!isSettled) return;

        const champ = pairSelection.champion;
        const numsX2 = champ.intersection;
        const numsX1 = champ.uniqueSingles;
        const allUnion = champ.union;

        let hitType = 'pending';
        let hitNumber = null;
        let payoutK = 0;
        let dayProfitK = 0;

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

        const settledCount = cumulativeWins + cumulativeLosses;
        const cumulativeHitRate = settledCount > 0 ? cumulativeWins / settledCount : 0;
        const cumulativeProfitK = cumulativePayoutK - cumulativeStakeK;

        settledLedger.push({
            date: predictionDate,
            actual: actualSpecial,
            settled: true,
            isLocked: true,
            abstained: false,
            sourceType: run.sourceType || 'strict-pit-backtest',
            isLiveSnapshot: run.sourceType === 'live-snapshot',
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
            unionRate: champ.comp30.unionRate,
            compRate: champ.comp30.compRate,
            hitType,
            hitNumber,
            stakeK: TOTAL_STAKE_K,
            payoutK,
            profitK: dayProfitK,
            cumulativeHitRate: Number(cumulativeHitRate.toFixed(4)),
            cumulativeProfitK,
            settledIndex: settledCount
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
    const rawMap = new Map((rawRows || []).map(r => [isoDate(r?.date || r?.ngay), getSpecialNumber(r)]).filter(([d, v]) => d && Number.isInteger(v)));

    // Normalize runs from history + advisor snapshots + synthesize missing 2026 dates
    const orderedRuns = normalizeDualMergeRuns(historyRecords, options.existingAdvisorRecords, rawRows, options);

    // Build settled ledger (only settled historical rows)
    const settledData = buildSettledDualMergeLedger(orderedRuns, rawRows);

    // Find the latest settled draw date and the single active target prediction date
    const allSettledRuns = orderedRuns.filter(r => {
        const d = isoDate(r.predictionDate);
        const act = Number.isInteger(Number(r.summary?.actualSpecial)) ? Number(r.summary.actualSpecial) : rawMap.get(d);
        return Number.isInteger(act);
    });

    const latestSettledRun = allSettledRuns.at(-1);
    const nextUnsettledRun = orderedRuns.find(r => {
        const d = isoDate(r.predictionDate);
        const act = Number.isInteger(Number(r.summary?.actualSpecial)) ? Number(r.summary.actualSpecial) : rawMap.get(d);
        return !Number.isInteger(act);
    }) || orderedRuns.at(-1);

    let latestRecommendation = null;

    if (nextUnsettledRun && allSettledRuns.length > 0) {
        const pairSelection = selectBestMethodPair(allSettledRuns, nextUnsettledRun.summary?.methods || {}, nextUnsettledRun.predictionDate);

        if (pairSelection && pairSelection.champion) {
            const champ = pairSelection.champion;
            latestRecommendation = {
                predictionDate: nextUnsettledRun.predictionDate,
                sourceDataThrough: latestSettledRun?.predictionDate || nextUnsettledRun.sourceDrawDate || nextUnsettledRun.predictionDate,
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
                unionRate: champ.comp30?.unionRate || 0,
                compRate: champ.comp30?.compRate || 0,
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
    normalizeDualMergeRuns,
    synthesizeMissing2026Runs,
    computeWindowStats,
    computePairComplementarity,
    scoreIndividualMethod,
    selectBestMethodPair,
    buildSettledDualMergeLedger,
    buildDualMergeAdvisor
};
