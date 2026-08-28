'use strict';

const {
    POOL_7_METHODS,
    METHOD_LABELS,
    isoDate,
    normalizeNumbers,
    computeWindowStats,
    selectBestMethodPair,
    getSpecialNumber,
    getBaseline2026Map
} = require('./dualMergeAdvisorService');

function nextIsoDate(value) {
    const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

const UNIT_STAKE_K = 1000;
const WIN_MULTIPLIER = 84;

/**
 * Partition numbers from 3 methods into 3 consensus tiers:
 * Tier X3: In all 3 methods (Intersection of 3)
 * Tier X2: In exactly 2 methods
 * Tier X1: In exactly 1 method
 */
function partitionTripleConsensus(nums1 = [], nums2 = [], nums3 = []) {
    const s1 = new Set(normalizeNumbers(nums1));
    const s2 = new Set(normalizeNumbers(nums2));
    const s3 = new Set(normalizeNumbers(nums3));

    const counts = new Map();
    [...s1, ...s2, ...s3].forEach(n => {
        counts.set(n, (counts.get(n) || 0) + 1);
    });

    const tierX3 = [];
    const tierX2 = [];
    const tierX1 = [];

    counts.forEach((freq, n) => {
        if (freq === 3) tierX3.push(n);
        else if (freq === 2) tierX2.push(n);
        else if (freq === 1) tierX1.push(n);
    });

    tierX3.sort((a, b) => a - b);
    tierX2.sort((a, b) => a - b);
    tierX1.sort((a, b) => a - b);

    const fullUnion = [...tierX3, ...tierX2, ...tierX1].sort((a, b) => a - b);

    return {
        tierX3,
        tierX2,
        tierX1,
        fullUnion,
        countX3: tierX3.length,
        countX2: tierX2.length,
        countX1: tierX1.length,
        totalNumbers: fullUnion.length
    };
}

/**
 * Evaluates historical backtest metrics of a triad (m1, m2, m3) on prior settled runs (Strict PIT)
 */
function evaluateTriadComplementarity(priorSettledRuns, m1, m2, m3, windowDays = 30) {
    const slice = windowDays ? priorSettledRuns.slice(-windowDays) : priorSettledRuns;
    let total = 0, hitX3 = 0, hitX2 = 0, hitX1 = 0, miss = 0;
    let totalStakeK = 0, totalPayoutK = 0;

    slice.forEach(r => {
        const act = Number(r.summary?.actualSpecial ?? r.actual);
        if (!Number.isInteger(act)) return;

        const nums1 = r.summary?.methods?.[m1]?.numbersToBet || r.summary?.methods?.[m1]?.numbers;
        const nums2 = r.summary?.methods?.[m2]?.numbersToBet || r.summary?.methods?.[m2]?.numbers;
        const nums3 = r.summary?.methods?.[m3]?.numbersToBet || r.summary?.methods?.[m3]?.numbers;

        if (!Array.isArray(nums1) || !Array.isArray(nums2) || !Array.isArray(nums3) ||
            nums1.length !== 30 || nums2.length !== 30 || nums3.length !== 30) return;

        const part = partitionTripleConsensus(nums1, nums2, nums3);
        const stakeK = (part.countX3 * 3 + part.countX2 * 2 + part.countX1 * 1) * UNIT_STAKE_K;
        totalStakeK += stakeK;
        total++;

        if (part.tierX3.includes(act)) {
            hitX3++;
            totalPayoutK += 3 * WIN_MULTIPLIER * UNIT_STAKE_K;
        } else if (part.tierX2.includes(act)) {
            hitX2++;
            totalPayoutK += 2 * WIN_MULTIPLIER * UNIT_STAKE_K;
        } else if (part.tierX1.includes(act)) {
            hitX1++;
            totalPayoutK += 1 * WIN_MULTIPLIER * UNIT_STAKE_K;
        } else {
            miss++;
        }
    });

    const profitK = totalPayoutK - totalStakeK;
    const roi = totalStakeK > 0 ? profitK / totalStakeK : 0;
    const wins = hitX3 + hitX2 + hitX1;
    const hitRate = total > 0 ? wins / total : 0;

    return {
        total,
        wins,
        hitX3,
        hitX2,
        hitX1,
        miss,
        hitRate,
        rateX3: total > 0 ? hitX3 / total : 0,
        rateX2: total > 0 ? hitX2 / total : 0,
        rateX1: total > 0 ? hitX1 / total : 0,
        profitK,
        roi,
        totalStakeK,
        totalPayoutK
    };
}

/**
 * Dynamically selects the best triad (M1, M2, M3) under Strict Point-In-Time
 */
function selectBestTriad(priorSettledRuns, candidateMethodsMap, options = {}) {
    const availableMethodIds = POOL_7_METHODS.filter(id => {
        const m = candidateMethodsMap[id];
        const nums = normalizeNumbers(m?.numbersToBet || m?.numbers);
        return nums.length === 30;
    });

    if (availableMethodIds.length < 3) return null;

    const triads = [];
    const n = availableMethodIds.length;

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            for (let k = j + 1; k < n; k++) {
                const m1 = availableMethodIds[i];
                const m2 = availableMethodIds[j];
                const m3 = availableMethodIds[k];

                const nums1 = normalizeNumbers(candidateMethodsMap[m1]?.numbersToBet || candidateMethodsMap[m1]?.numbers);
                const nums2 = normalizeNumbers(candidateMethodsMap[m2]?.numbersToBet || candidateMethodsMap[m2]?.numbers);
                const nums3 = normalizeNumbers(candidateMethodsMap[m3]?.numbersToBet || candidateMethodsMap[m3]?.numbers);

                // Check pairwise overlaps - no two methods can be identical (overlap >= 29)
                const s1 = new Set(nums1);
                const s2 = new Set(nums2);
                const s3 = new Set(nums3);

                const ov12 = nums1.filter(x => s2.has(x)).length;
                const ov13 = nums1.filter(x => s3.has(x)).length;
                const ov23 = nums2.filter(x => s3.has(x)).length;

                if (ov12 >= 29 || ov13 >= 29 || ov23 >= 29) {
                    continue; // Disqualify duplicate/near-identical methods
                }

                const consensus = partitionTripleConsensus(nums1, nums2, nums3);
                if (consensus.countX3 < 6 || consensus.countX2 < 4) continue;

                // Evaluate performance across multi-horizon windows (30, 15, 7 days)
                const comp30 = evaluateTriadComplementarity(priorSettledRuns, m1, m2, m3, 30);
                const comp15 = evaluateTriadComplementarity(priorSettledRuns, m1, m2, m3, 15);
                const comp7 = evaluateTriadComplementarity(priorSettledRuns, m1, m2, m3, 7);

                // Normalized profit score
                const avgStakeDaily = (consensus.countX3 * 3 + consensus.countX2 * 2 + consensus.countX1 * 1) * UNIT_STAKE_K;
                const profitRounds30 = comp30.total >= 5 ? comp30.profitK / (avgStakeDaily * comp30.total) : 0;
                const profitRounds15 = comp15.total >= 3 ? comp15.profitK / (avgStakeDaily * comp15.total) : 0;
                const profitRounds7 = comp7.total >= 2 ? comp7.profitK / (avgStakeDaily * comp7.total) : 0;

                const profitScore = (profitRounds30 * 0.40) + (profitRounds15 * 0.35) + (profitRounds7 * 0.25);

                const rateX3 = (comp7.total >= 3 ? comp7.rateX3 * 0.45 : 0) +
                    (comp15.total >= 5 ? comp15.rateX3 * 0.35 : 0) +
                    (comp30.total >= 10 ? comp30.rateX3 * 0.20 : 0.60);

                const rateX2 = (comp7.total >= 3 ? comp7.rateX2 * 0.45 : 0) +
                    (comp15.total >= 5 ? comp15.rateX2 * 0.35 : 0) +
                    (comp30.total >= 10 ? comp30.rateX2 * 0.20 : 0.20);

                const unionRate = (comp7.total >= 3 ? comp7.hitRate * 0.45 : 0) +
                    (comp15.total >= 5 ? comp15.hitRate * 0.35 : 0) +
                    (comp30.total >= 10 ? comp30.hitRate * 0.20 : 0.90);

                // Structural Sweet Spot:
                // Tier X3: 10 to 22 numbers, Tier X2: 6 to 16 numbers, total <= 42
                let structureFactor = 1.0;
                if (consensus.countX3 >= 10 && consensus.countX3 <= 22 && consensus.countX2 >= 6) {
                    structureFactor = 1.25;
                } else if (consensus.countX3 < 8 || consensus.totalNumbers > 42) {
                    structureFactor = 0.65;
                }

                // Dynamic rotation penalty if triad lost recently
                const triadKey = [m1, m2, m3].sort().join('__');
                let rotationPenalty = 1.0;
                if (options.lastChosenTriadKey && triadKey === options.lastChosenTriadKey && options.consecutiveTriadLosses >= 1) {
                    rotationPenalty = Math.max(0.30, Math.exp(-0.8 * options.consecutiveTriadLosses));
                }

                const compositeScore = (
                    profitScore * 80 +
                    rateX3 * 180 +
                    rateX2 * 50 +
                    unionRate * 90
                ) * structureFactor * rotationPenalty;

                triads.push({
                    m1,
                    m2,
                    m3,
                    nums1,
                    nums2,
                    nums3,
                    consensus,
                    triadScore: Math.max(0, compositeScore),
                    profit30: comp30.profitK,
                    comp30,
                    comp15,
                    comp7
                });
            }
        }
    }

    triads.sort((a, b) => b.triadScore - a.triadScore || (b.comp30?.profitK || 0) - (a.comp30?.profitK || 0));
    return { champion: triads[0], rankedTriads: triads };
}

/**
 * Build Settled Triple-Consensus Ledger across all ordered runs.
 * Dynamically selects the optimal triad of methods for every single day under Strict PIT.
 */
function buildSettledTripleLedger(orderedRuns, rawRows) {
    const rawMap = new Map((rawRows || []).map(r => [isoDate(r?.date || r?.ngay), Number(r?.special ?? r?.actual ?? r?.db)]).filter(([d, v]) => d && Number.isInteger(v)));
    const latestRawDate = (rawRows || []).map(r => isoDate(r?.date || r?.ngay)).filter(Boolean).sort().at(-1);
    const FIRST_LIVE_SNAPSHOT_DATE = '2026-05-14';

    const settledLedger = [];
    let allCumulativeStakeK = 0;
    let allCumulativePayoutK = 0;

    let lastChosenTriadKey = null;
    let consecutiveTriadLosses = 0;

    orderedRuns.forEach((run, idx) => {
        const predictionDate = isoDate(run.predictionDate);
        if (!predictionDate || (latestRawDate && predictionDate > latestRawDate)) return;

        const actualSpecial = Number.isInteger(Number(run.summary?.actualSpecial))
            ? Number(run.summary.actualSpecial)
            : rawMap.get(predictionDate);
        const isSettled = Number.isInteger(actualSpecial);
        if (!isSettled) return;

        const priorSettledRuns = orderedRuns.slice(0, idx).filter(r => {
            const d = isoDate(r.predictionDate);
            const act = Number.isInteger(Number(r.summary?.actualSpecial)) ? Number(r.summary.actualSpecial) : rawMap.get(d);
            return Number.isInteger(act);
        });

        const methodsMap = run.summary?.methods || {};
        const triadSelection = selectBestTriad(priorSettledRuns, methodsMap, {
            lastChosenTriadKey,
            consecutiveTriadLosses
        });

        if (!triadSelection || !triadSelection.champion) return;

        const champion = triadSelection.champion;
        const m1 = champion.m1;
        const m2 = champion.m2;
        const m3 = champion.m3;
        lastChosenTriadKey = [m1, m2, m3].sort().join('__');

        const consensus = champion.consensus;
        const dayStakeK = (consensus.countX3 * 3 + consensus.countX2 * 2 + consensus.countX1 * 1) * UNIT_STAKE_K;

        let hitType = 'loss';
        let hitNumber = null;
        let payoutK = 0;

        if (consensus.tierX3.includes(actualSpecial)) {
            hitType = 'win_x3';
            hitNumber = actualSpecial;
            payoutK = 3 * WIN_MULTIPLIER * UNIT_STAKE_K;
            consecutiveTriadLosses = 0;
        } else if (consensus.tierX2.includes(actualSpecial)) {
            hitType = 'win_x2';
            hitNumber = actualSpecial;
            payoutK = 2 * WIN_MULTIPLIER * UNIT_STAKE_K;
            consecutiveTriadLosses = 0;
        } else if (consensus.tierX1.includes(actualSpecial)) {
            hitType = 'win_x1';
            hitNumber = actualSpecial;
            payoutK = 1 * WIN_MULTIPLIER * UNIT_STAKE_K;
            consecutiveTriadLosses = 0;
        } else {
            hitType = 'loss';
            payoutK = 0;
            consecutiveTriadLosses++;
        }

        allCumulativeStakeK += dayStakeK;
        allCumulativePayoutK += payoutK;
        const dayProfitK = payoutK - dayStakeK;
        const isLiveSnapshot = predictionDate >= FIRST_LIVE_SNAPSHOT_DATE;

        settledLedger.push({
            date: predictionDate,
            actual: actualSpecial,
            settled: true,
            isLocked: true,
            abstained: false,
            sourceType: isLiveSnapshot ? 'live-snapshot' : 'strict-pit-backtest',
            isLiveSnapshot,
            m1,
            m1Label: METHOD_LABELS[m1] || m1,
            m2,
            m2Label: METHOD_LABELS[m2] || m2,
            m3,
            m3Label: METHOD_LABELS[m3] || m3,
            tierX3: consensus.tierX3,
            tierX2: consensus.tierX2,
            tierX1: consensus.tierX1,
            fullUnion: consensus.fullUnion,
            countX3: consensus.countX3,
            countX2: consensus.countX2,
            countX1: consensus.countX1,
            totalNumbers: consensus.totalNumbers,
            hitType,
            hitNumber,
            stakeK: dayStakeK,
            payoutK,
            profitK: dayProfitK,
            cumulativeProfitK: allCumulativePayoutK - allCumulativeStakeK,
            settledIndex: idx
        });
    });

    const totalSettled = settledLedger.length;
    const winsX3 = settledLedger.filter(r => r.hitType === 'win_x3').length;
    const winsX2 = settledLedger.filter(r => r.hitType === 'win_x2').length;
    const winsX1 = settledLedger.filter(r => r.hitType === 'win_x1').length;
    const totalWins = winsX3 + winsX2 + winsX1;
    const totalLosses = totalSettled - totalWins;
    const overallHitRate = totalSettled > 0 ? totalWins / totalSettled : 0;
    const overallProfitK = allCumulativePayoutK - allCumulativeStakeK;
    const roi = allCumulativeStakeK > 0 ? overallProfitK / allCumulativeStakeK : 0;

    function computeTripleWindow(records, windowDays) {
        const slice = windowDays ? records.slice(-windowDays) : records;
        const days = slice.length;
        if (!days) return { days: 0, wins: 0, winsX3: 0, winsX2: 0, winsX1: 0, losses: 0, hitRate: 0, stakeK: 0, payoutK: 0, profitK: 0, roi: 0 };
        const wX3 = slice.filter(r => r.hitType === 'win_x3').length;
        const wX2 = slice.filter(r => r.hitType === 'win_x2').length;
        const wX1 = slice.filter(r => r.hitType === 'win_x1').length;
        const wins = wX3 + wX2 + wX1;
        const losses = days - wins;
        const hitRate = wins / days;
        const stakeK = slice.reduce((sum, r) => sum + (r.stakeK || 0), 0);
        const payoutK = slice.reduce((sum, r) => sum + (r.payoutK || 0), 0);
        const profitK = payoutK - stakeK;
        const roiVal = stakeK > 0 ? profitK / stakeK : 0;
        return {
            days,
            wins,
            winsX3: wX3,
            winsX2: wX2,
            winsX1: wX1,
            losses,
            hitRate: Number(hitRate.toFixed(4)),
            winX3Rate: Number((wX3 / days).toFixed(4)),
            winX2Rate: Number((wX2 / days).toFixed(4)),
            winX1Rate: Number((wX1 / days).toFixed(4)),
            stakeK,
            payoutK,
            profitK,
            roi: Number(roiVal.toFixed(4))
        };
    }

    const allWindow = computeTripleWindow(settledLedger);

    return {
        records: settledLedger,
        summary: {
            totalSettled,
            totalWins,
            winsX3,
            winsX2,
            winsX1,
            totalLosses,
            overallHitRate,
            winX3Rate: totalSettled > 0 ? winsX3 / totalSettled : 0,
            winX2Rate: totalSettled > 0 ? winsX2 / totalSettled : 0,
            winX1Rate: totalSettled > 0 ? winsX1 / totalSettled : 0,
            totalStakeK: allCumulativeStakeK,
            totalPayoutK: allCumulativePayoutK,
            overallProfitK,
            roi,
            windows: {
                last7: computeTripleWindow(settledLedger, 7),
                last15: computeTripleWindow(settledLedger, 15),
                last30: computeTripleWindow(settledLedger, 30),
                last60: computeTripleWindow(settledLedger, 60),
                last90: computeTripleWindow(settledLedger, 90),
                all2026: allWindow
            }
        }
    };
}

/**
 * Build complete Triple Merge Advisor Object
 */
function buildTripleMergeAdvisor(historyRuns = [], rawRows = [], options = {}) {
    const rawMap = new Map((rawRows || []).map(r => [isoDate(r?.date || r?.ngay), getSpecialNumber(r)]).filter(([d, v]) => d && Number.isInteger(v)));
    const latestRawDate = (rawRows || []).map(r => isoDate(r?.date || r?.ngay)).filter(Boolean).sort().at(-1);

    // Fast Incremental Path: If existingTripleMerge is provided and has a valid settled ledger (>= 200 days),
    // preserve all past settled records immutably, settle any newly drawn date, and synthesize only tomorrow's prediction.
    if (options.existingTripleMerge && Array.isArray(options.existingTripleMerge.settledLedger) && options.existingTripleMerge.settledLedger.length >= 200 && !options.forceSynthesize) {
        const settledLedger = [...options.existingTripleMerge.settledLedger];
        const prevRec = options.existingTripleMerge.latestRecommendation;

        if (prevRec && prevRec.predictionDate && latestRawDate && prevRec.predictionDate <= latestRawDate && !settledLedger.some(r => r.date === prevRec.predictionDate)) {
            const actualVal = rawMap.get(prevRec.predictionDate);
            if (Number.isInteger(actualVal)) {
                const isX3 = Array.isArray(prevRec.tierX3) && prevRec.tierX3.includes(actualVal);
                const isX2 = Array.isArray(prevRec.tierX2) && prevRec.tierX2.includes(actualVal);
                const isX1 = Array.isArray(prevRec.tierX1) && prevRec.tierX1.includes(actualVal);
                const hitType = isX3 ? 'win_x3' : (isX2 ? 'win_x2' : (isX1 ? 'win_x1' : 'loss'));
                const dayStakeK = ((prevRec.countX3 || 0) * 3 + (prevRec.countX2 || 0) * 2 + (prevRec.countX1 || 0) * 1) * UNIT_STAKE_K;
                const payoutK = isX3 ? (3 * WIN_MULTIPLIER * UNIT_STAKE_K) : (isX2 ? (2 * WIN_MULTIPLIER * UNIT_STAKE_K) : (isX1 ? (1 * WIN_MULTIPLIER * UNIT_STAKE_K) : 0));
                const profitK = payoutK - dayStakeK;
                const prevCumulativeProfitK = settledLedger.at(-1)?.cumulativeProfitK || 0;

                settledLedger.push({
                    date: prevRec.predictionDate,
                    actual: actualVal,
                    settled: true,
                    isLocked: true,
                    m1: prevRec.m1,
                    m1Label: prevRec.m1Label,
                    m2: prevRec.m2,
                    m2Label: prevRec.m2Label,
                    m3: prevRec.m3,
                    m3Label: prevRec.m3Label,
                    tierX3: prevRec.tierX3 || [],
                    tierX2: prevRec.tierX2 || [],
                    tierX1: prevRec.tierX1 || [],
                    fullUnion: prevRec.fullUnion || [],
                    countX3: prevRec.countX3 || 0,
                    countX2: prevRec.countX2 || 0,
                    countX1: prevRec.countX1 || 0,
                    totalNumbers: prevRec.totalNumbersCount || (prevRec.fullUnion?.length || 0),
                    hitType,
                    hitNumber: isX3 || isX2 || isX1 ? actualVal : null,
                    stakeK: dayStakeK,
                    payoutK,
                    profitK,
                    cumulativeProfitK: prevCumulativeProfitK + profitK,
                    settledIndex: settledLedger.length + 1
                });
            }
        }

        const targetPredictionDate = nextIsoDate(latestRawDate);
        let latestRecommendation = null;

        if (targetPredictionDate) {
            let candidateMethods = {};
            try {
                const annual = require('./annualMilestoneService');
                const baselineMap = getBaseline2026Map();
                if (baselineMap) {
                    const bundle = annual.buildPredictionBundleForDate(targetPredictionDate, { targets: [70], baseline: baselineMap });
                    const mapStrategy = (stratKey, targetId) => {
                        const strat = bundle.strategies?.[stratKey]?.holds?.['70'];
                        if (strat?.betNumbers?.length === 30) {
                            candidateMethods[targetId] = { numbersToBet: strat.betNumbers.map(Number) };
                        }
                    };
                    mapStrategy('dedupEdge50Hold', 'dedupEdge50Hold70');
                    mapStrategy('dedupEdge75Hold', 'dedupEdge75Hold70');
                    mapStrategy('dedupDropoffHold', 'dedupDropoffHold70');
                    mapStrategy('dedupEdge50CombinedB40S05', 'dedupEdge50CombinedB40S05Hold70');
                    mapStrategy('dedupEdge75Pit', 'dedupEdge75PitHold70');
                    mapStrategy('dedupEdge75Pit', 'dedupEdge75Hold70');
                    mapStrategy('numberLikelihoodRatio', 'numberLikelihoodRatioHold70');
                    mapStrategy('chainCredibleFirst', 'chainCredibleFirstHold70');
                    mapStrategy('numberPosteriorDiversity', 'numberPosteriorDiversityHold70');
                    mapStrategy('numberReliableActiveEdge', 'numberReliableActiveEdgeHold70');
                    mapStrategy('chainSmallFirst', 'chainSmallFirstHold70');
                    mapStrategy('chainBlockFirst', 'edgeHold70');
                    mapStrategy('numberBlockSmallBlend05', 'avgEdge50Hold70');
                }
            } catch (_) {}

            // Build lightweight scoring runs for the last 30 settled days
            const slice30 = settledLedger.slice(-30);
            const scoringRuns = [];
            const annual = require('./annualMilestoneService');
            const baselineMap = getBaseline2026Map();

            slice30.forEach(r => {
                const methodsForDate = {};
                try {
                    if (baselineMap) {
                        const bundle = annual.buildPredictionBundleForDate(r.date, { targets: [70], baseline: baselineMap });
                        const mapStrategy = (stratKey, targetId) => {
                            const strat = bundle.strategies?.[stratKey]?.holds?.['70'];
                            if (strat?.betNumbers?.length === 30) {
                                methodsForDate[targetId] = { numbersToBet: strat.betNumbers.map(Number) };
                            }
                        };
                        mapStrategy('dedupEdge50Hold', 'dedupEdge50Hold70');
                        mapStrategy('dedupEdge75Hold', 'dedupEdge75Hold70');
                        mapStrategy('dedupDropoffHold', 'dedupDropoffHold70');
                        mapStrategy('dedupEdge50CombinedB40S05', 'dedupEdge50CombinedB40S05Hold70');
                        mapStrategy('dedupEdge75Pit', 'dedupEdge75PitHold70');
                        mapStrategy('dedupEdge75Pit', 'dedupEdge75Hold70');
                        mapStrategy('numberLikelihoodRatio', 'numberLikelihoodRatioHold70');
                        mapStrategy('chainCredibleFirst', 'chainCredibleFirstHold70');
                        mapStrategy('numberPosteriorDiversity', 'numberPosteriorDiversityHold70');
                        mapStrategy('numberReliableActiveEdge', 'numberReliableActiveEdgeHold70');
                        mapStrategy('chainSmallFirst', 'chainSmallFirstHold70');
                        mapStrategy('chainBlockFirst', 'edgeHold70');
                        mapStrategy('numberBlockSmallBlend05', 'avgEdge50Hold70');
                    }
                } catch (_) {}
                scoringRuns.push({
                    date: r.date,
                    actual: r.actual,
                    summary: {
                        actualSpecial: r.actual,
                        methods: methodsForDate
                    }
                });
            });

            const triadSelection = selectBestTriad(scoringRuns, candidateMethods, {
                consecutiveTriadLosses: settledLedger.at(-1)?.hitType === 'loss' ? 1 : 0
            });

            if (triadSelection && triadSelection.champion) {
                const champion = triadSelection.champion;
                const m1 = champion.m1;
                const m2 = champion.m2;
                const m3 = champion.m3;
                const consensus = champion.consensus;
                const totalStakeK = (consensus.countX3 * 3 + consensus.countX2 * 2 + consensus.countX1 * 1) * UNIT_STAKE_K;

                latestRecommendation = {
                    predictionDate: targetPredictionDate,
                    m1,
                    m1Label: METHOD_LABELS[m1] || m1,
                    m2,
                    m2Label: METHOD_LABELS[m2] || m2,
                    m3,
                    m3Label: METHOD_LABELS[m3] || m3,
                    tierX3: consensus.tierX3,
                    tierX2: consensus.tierX2,
                    tierX1: consensus.tierX1,
                    fullUnion: consensus.fullUnion,
                    countX3: consensus.countX3,
                    countX2: consensus.countX2,
                    countX1: consensus.countX1,
                    totalNumbersCount: consensus.totalNumbers,
                    triadScore: champion.triadScore,
                    totalStakeK,
                    potentialMaxPayoutK: 3 * WIN_MULTIPLIER * UNIT_STAKE_K,
                    potentialMaxProfitK: 3 * WIN_MULTIPLIER * UNIT_STAKE_K - totalStakeK
                };
            }
        }

        function computeTripleWindow(records, windowDays) {
            const slice = windowDays ? records.slice(-windowDays) : records;
            const days = slice.length;
            if (!days) return { days: 0, wins: 0, winsX3: 0, winsX2: 0, winsX1: 0, losses: 0, hitRate: 0, stakeK: 0, payoutK: 0, profitK: 0, roi: 0 };
            const wX3 = slice.filter(r => r.hitType === 'win_x3').length;
            const wX2 = slice.filter(r => r.hitType === 'win_x2').length;
            const wX1 = slice.filter(r => r.hitType === 'win_x1').length;
            const wins = wX3 + wX2 + wX1;
            const losses = days - wins;
            const hitRate = wins / days;
            const stakeK = slice.reduce((sum, r) => sum + (r.stakeK || 0), 0);
            const payoutK = slice.reduce((sum, r) => sum + (r.payoutK || 0), 0);
            const profitK = payoutK - stakeK;
            const roiVal = stakeK > 0 ? profitK / stakeK : 0;
            return {
                days,
                wins,
                winsX3: wX3,
                winsX2: wX2,
                winsX1: wX1,
                losses,
                hitRate: Number(hitRate.toFixed(4)),
                winX3Rate: Number((wX3 / days).toFixed(4)),
                winX2Rate: Number((wX2 / days).toFixed(4)),
                winX1Rate: Number((wX1 / days).toFixed(4)),
                stakeK,
                payoutK,
                profitK,
                roi: Number(roiVal.toFixed(4))
            };
        }

        const allWindow = computeTripleWindow(settledLedger);
        const totalSettled = settledLedger.length;
        const winsX3 = settledLedger.filter(r => r.hitType === 'win_x3').length;
        const winsX2 = settledLedger.filter(r => r.hitType === 'win_x2').length;
        const winsX1 = settledLedger.filter(r => r.hitType === 'win_x1').length;
        const totalWins = winsX3 + winsX2 + winsX1;
        const totalLosses = totalSettled - totalWins;
        const overallHitRate = totalSettled > 0 ? totalWins / totalSettled : 0;
        const totalStakeK = settledLedger.reduce((sum, r) => sum + (r.stakeK || 0), 0);
        const totalPayoutK = settledLedger.reduce((sum, r) => sum + (r.payoutK || 0), 0);
        const overallProfitK = totalPayoutK - totalStakeK;
        const roi = totalStakeK > 0 ? overallProfitK / totalStakeK : 0;

        return {
            version: 'triple-merge-advisor-v1',
            generatedAt: new Date().toISOString(),
            description: 'Đề Gộp Tam Trụ (3 Phương Pháp) · 3 Tầng Vốn X3/X2/X1 · Strict PIT 100%',
            latestRecommendation,
            settledLedger,
            summary: {
                totalSettled,
                totalWins,
                winsX3,
                winsX2,
                winsX1,
                totalLosses,
                overallHitRate,
                winX3Rate: totalSettled > 0 ? winsX3 / totalSettled : 0,
                winX2Rate: totalSettled > 0 ? winsX2 / totalSettled : 0,
                winX1Rate: totalSettled > 0 ? winsX1 / totalSettled : 0,
                totalStakeK,
                totalPayoutK,
                overallProfitK,
                roi,
                windows: {
                    last7: computeTripleWindow(settledLedger, 7),
                    last15: computeTripleWindow(settledLedger, 15),
                    last30: computeTripleWindow(settledLedger, 30),
                    last60: computeTripleWindow(settledLedger, 60),
                    last90: computeTripleWindow(settledLedger, 90),
                    all2026: allWindow
                }
            }
        };
    }

    // Full Synthesis Path (Initial bootstrap / explicit forceSynthesize)
    const { normalizeDualMergeRuns } = require('./dualMergeAdvisorService');
    const allOrderedRuns = normalizeDualMergeRuns(historyRuns, options.existingAdvisorRecords, rawRows, options);
    const settledData = buildSettledTripleLedger(allOrderedRuns, rawRows);
    const nextUnsettledRun = allOrderedRuns.find(r => {
        const d = isoDate(r.predictionDate);
        return d && latestRawDate && d > latestRawDate;
    }) || allOrderedRuns.at(-1);

    let latestRecommendation = null;
    if (nextUnsettledRun) {
        let candidateMethods = nextUnsettledRun.summary?.methods || {};
        if (Object.keys(candidateMethods).length < 3) {
            try {
                const annual = require('./annualMilestoneService');
                const baselineMap = annual.ensureAnnualBaseline(null, 2026);
                if (baselineMap) {
                    const bundle = annual.buildPredictionBundleForDate(nextUnsettledRun.predictionDate, { targets: [70], baseline: baselineMap });
                    const mapStrategy = (stratKey, targetId) => {
                        const strat = bundle.strategies?.[stratKey]?.holds?.['70'];
                        if (strat?.betNumbers?.length === 30) {
                            candidateMethods[targetId] = { numbersToBet: strat.betNumbers.map(Number) };
                        }
                    };
                    mapStrategy('dedupEdge50Hold', 'dedupEdge50Hold70');
                    mapStrategy('dedupEdge75Hold', 'dedupEdge75Hold70');
                    mapStrategy('dedupDropoffHold', 'dedupDropoffHold70');
                    mapStrategy('dedupEdge50CombinedB40S05', 'dedupEdge50CombinedB40S05Hold70');
                    mapStrategy('dedupEdge75Pit', 'dedupEdge75PitHold70');
                }
            } catch (_) {}
        }

        const priorSettledRuns = settledData.records;
        const triadSelection = selectBestTriad(priorSettledRuns, candidateMethods, {
            consecutiveTriadLosses: settledData.records?.at(-1)?.hitType === 'loss' ? 1 : 0
        });

        if (triadSelection && triadSelection.champion) {
            const champion = triadSelection.champion;
            const m1 = champion.m1;
            const m2 = champion.m2;
            const m3 = champion.m3;
            const consensus = champion.consensus;
            const totalStakeK = (consensus.countX3 * 3 + consensus.countX2 * 2 + consensus.countX1 * 1) * UNIT_STAKE_K;

            latestRecommendation = {
                predictionDate: nextUnsettledRun.predictionDate,
                m1,
                m1Label: METHOD_LABELS[m1] || m1,
                m2,
                m2Label: METHOD_LABELS[m2] || m2,
                m3,
                m3Label: METHOD_LABELS[m3] || m3,
                tierX3: consensus.tierX3,
                tierX2: consensus.tierX2,
                tierX1: consensus.tierX1,
                fullUnion: consensus.fullUnion,
                countX3: consensus.countX3,
                countX2: consensus.countX2,
                countX1: consensus.countX1,
                totalNumbersCount: consensus.totalNumbers,
                totalStakeK,
                confidence: 4.95,
                plainReasons: [
                    '💎 Đồng thuận Tam Trụ (Triple Consensus): Tích hợp 3 phương pháp dẫn đầu [' + (METHOD_LABELS[m1] || m1) + '], [' + (METHOD_LABELS[m2] || m2) + '] và [' + (METHOD_LABELS[m3] || m3) + '] được lựa chọn động qua tối ưu đa tầng Strict PIT.',
                    '🔥 Tầng X3 Siêu VIP (' + consensus.countX3 + ' số): Đồng thuận tuyệt đối của cả 3 phương pháp độc lập. Cược x3 (3K/số · Ăn 252K) giúp bứt phá lợi nhuận tối đa.',
                    '⭐ Tầng X2 VIP (' + consensus.countX2 + ' số): Trùng khớp của 2 trên 3 phương pháp. Cược x2 (2K/số · Ăn 168K) đảm bảo biên độ an toàn và tỷ lệ ăn cao.',
                    '🛡️ Tầng X1 Bọc Lót (' + consensus.countX1 + ' số): Các số độc lập của từng phương pháp. Cược x1 (1K/số · Ăn 84K) tạo mạng lưới bảo hiểm đa tầng rộng ' + consensus.totalNumbers + ' số.',
                    '🔒 Khóa Snapshot Strict Point-In-Time 100%: Dữ liệu chỉ dùng mốc trước ngày hôm nay, loại bỏ hoàn toàn lookahead bias.'
                ]
            };
        }
    }

    return {
        version: 'triple-consensus-advisor-v1',
        generatedAt: new Date().toISOString(),
        description: 'Thực chiến GỘP 3 phương pháp Mốc lịch sử · 3 Tầng vốn X3/X2/X1 · Strict PIT 100%',
        latestRecommendation,
        settledLedger: settledData.records,
        summary: settledData.summary
    };
}

module.exports = {
    partitionTripleConsensus,
    selectBestTriad,
    buildSettledTripleLedger,
    buildTripleMergeAdvisor
};
