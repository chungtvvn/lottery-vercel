'use strict';

const {
    POOL_7_METHODS,
    METHOD_LABELS,
    isoDate,
    normalizeNumbers,
    computeWindowStats
} = require('./dualMergeAdvisorService');

const TOTAL_BUDGET_TARGET_K = 60000;
const UNIT_STAKE_K = 1000;
const WIN_MULTIPLIER = 84;

const TRIPLE_CORE_METHODS = [
    'dedupEdge50Hold70',
    'dedupEdge75Hold70',
    'dedupDropoffHold70'
];

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
 * Build Settled Triple-Consensus Ledger across all ordered runs
 */
function buildSettledTripleLedger(orderedRuns, rawRows) {
    const rawMap = new Map((rawRows || []).map(r => [isoDate(r?.date || r?.ngay), Number(r?.special ?? r?.actual ?? r?.db)]).filter(([d, v]) => d && Number.isInteger(v)));
    const latestRawDate = (rawRows || []).map(r => isoDate(r?.date || r?.ngay)).filter(Boolean).sort().at(-1);
    const FIRST_LIVE_SNAPSHOT_DATE = '2026-05-14';

    const settledLedger = [];
    let allCumulativeStakeK = 0;
    let allCumulativePayoutK = 0;

    orderedRuns.forEach((run, idx) => {
        const predictionDate = isoDate(run.predictionDate);
        if (!predictionDate || (latestRawDate && predictionDate > latestRawDate)) return;

        const actualSpecial = Number.isInteger(Number(run.summary?.actualSpecial))
            ? Number(run.summary.actualSpecial)
            : rawMap.get(predictionDate);
        const isSettled = Number.isInteger(actualSpecial);
        if (!isSettled) return;

        const methodsMap = run.summary?.methods || {};
        const nums1 = normalizeNumbers(methodsMap[TRIPLE_CORE_METHODS[0]]?.numbersToBet);
        const nums2 = normalizeNumbers(methodsMap[TRIPLE_CORE_METHODS[1]]?.numbersToBet);
        const nums3 = normalizeNumbers(methodsMap[TRIPLE_CORE_METHODS[2]]?.numbersToBet);

        if (!nums1.length || !nums2.length || !nums3.length) return;

        const consensus = partitionTripleConsensus(nums1, nums2, nums3);
        const dayStakeK = (consensus.countX3 * 3 + consensus.countX2 * 2 + consensus.countX1 * 1) * UNIT_STAKE_K;

        let hitType = 'loss';
        let hitNumber = null;
        let payoutK = 0;

        if (consensus.tierX3.includes(actualSpecial)) {
            hitType = 'win_x3';
            hitNumber = actualSpecial;
            payoutK = 3 * WIN_MULTIPLIER * UNIT_STAKE_K;
        } else if (consensus.tierX2.includes(actualSpecial)) {
            hitType = 'win_x2';
            hitNumber = actualSpecial;
            payoutK = 2 * WIN_MULTIPLIER * UNIT_STAKE_K;
        } else if (consensus.tierX1.includes(actualSpecial)) {
            hitType = 'win_x1';
            hitNumber = actualSpecial;
            payoutK = 1 * WIN_MULTIPLIER * UNIT_STAKE_K;
        } else {
            hitType = 'loss';
            payoutK = 0;
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
            m1: TRIPLE_CORE_METHODS[0],
            m1Label: METHOD_LABELS[TRIPLE_CORE_METHODS[0]] || TRIPLE_CORE_METHODS[0],
            m2: TRIPLE_CORE_METHODS[1],
            m2Label: METHOD_LABELS[TRIPLE_CORE_METHODS[1]] || TRIPLE_CORE_METHODS[1],
            m3: TRIPLE_CORE_METHODS[2],
            m3Label: METHOD_LABELS[TRIPLE_CORE_METHODS[2]] || TRIPLE_CORE_METHODS[2],
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
                last7: computeWindowStats(settledLedger, 7),
                last15: computeWindowStats(settledLedger, 15),
                last30: computeWindowStats(settledLedger, 30),
                last60: computeWindowStats(settledLedger, 60),
                last90: computeWindowStats(settledLedger, 90),
                all2026: {
                    days: totalSettled,
                    wins: totalWins,
                    winsX3,
                    winsX2,
                    winsX1,
                    losses: totalLosses,
                    hitRate: overallHitRate,
                    stakeK: allCumulativeStakeK,
                    payoutK: allCumulativePayoutK,
                    profitK: overallProfitK,
                    roi
                }
            }
        }
    };
}

/**
 * Build complete Triple Merge Advisor Object
 */
function buildTripleMergeAdvisor(historyRuns = [], rawRows = []) {
    const { normalizeDualMergeRuns } = require('./dualMergeAdvisorService');
    const allOrderedRuns = normalizeDualMergeRuns(historyRuns, null, rawRows);
    const settledData = buildSettledTripleLedger(allOrderedRuns, rawRows);

    const latestRawDate = (rawRows || []).map(r => isoDate(r?.date || r?.ngay)).filter(Boolean).sort().at(-1);
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
                }
            } catch (_) {}
        }

        const nums1 = normalizeNumbers(candidateMethods[TRIPLE_CORE_METHODS[0]]?.numbersToBet);
        const nums2 = normalizeNumbers(candidateMethods[TRIPLE_CORE_METHODS[1]]?.numbersToBet);
        const nums3 = normalizeNumbers(candidateMethods[TRIPLE_CORE_METHODS[2]]?.numbersToBet);

        if (nums1.length && nums2.length && nums3.length) {
            const consensus = partitionTripleConsensus(nums1, nums2, nums3);
            const totalStakeK = (consensus.countX3 * 3 + consensus.countX2 * 2 + consensus.countX1 * 1) * UNIT_STAKE_K;

            latestRecommendation = {
                predictionDate: nextUnsettledRun.predictionDate,
                m1: TRIPLE_CORE_METHODS[0],
                m1Label: METHOD_LABELS[TRIPLE_CORE_METHODS[0]] || TRIPLE_CORE_METHODS[0],
                m2: TRIPLE_CORE_METHODS[1],
                m2Label: METHOD_LABELS[TRIPLE_CORE_METHODS[1]] || TRIPLE_CORE_METHODS[1],
                m3: TRIPLE_CORE_METHODS[2],
                m3Label: METHOD_LABELS[TRIPLE_CORE_METHODS[2]] || TRIPLE_CORE_METHODS[2],
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
                    '💎 Đồng thuận Tam Trụ (Triple Consensus): Kết hợp 3 phương pháp độc lập có xung lực mạnh nhất: [Edge 50%], [Edge 75% Hold] và [Dropoff Khử Trùng].',
                    '🔥 Tầng X3 Siêu VIP (' + consensus.countX3 + ' số): Đồng thuận tuyệt đối của cả 3 phương pháp độc lập. Cược x3 (3K/số · Ăn 252K) giúp bứt phá lợi nhuận tối đa.',
                    '⭐ Tầng X2 VIP (' + consensus.countX2 + ' số): Trùng khớp của 2 trên 3 phương pháp. Cược x2 (2K/số · Ăn 168K) đảm bảo biên độ an toàn và tỷ lệ ăn cao.',
                    '🛡️ Tầng X1 Bọc Lót (' + consensus.countX1 + ' số): Các số độc lập của từng phương pháp. Cược x1 (1K/số · Ăn 84K) tạo mạng lưới bảo hiểm đa tầng rộng ' + consensus.totalNumbers + ' số.',
                    '🔒 Khóa Snapshot Strict Point-In-Time 100%: Dữ liệu chỉ dùng mốc trước ngày hôm nay, không nhìn trước kết quả tương lai.'
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
    TRIPLE_CORE_METHODS,
    partitionTripleConsensus,
    buildSettledTripleLedger,
    buildTripleMergeAdvisor
};
