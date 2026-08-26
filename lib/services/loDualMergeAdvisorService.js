'use strict';

const LOTO_STAKE_PER_UNIT_K = 220;
const LOTO_PAYOUT_PER_HIT_K = 800;

const PRIZE_KEYS = [
    'special', 'prize1',
    'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];

function normalizeNumbers(values) {
    return [...new Set((values || [])
        .map(v => String(v ?? '').trim())
        .filter(Boolean)
        .map(v => /^\d+$/.test(v) ? v.padStart(2, '0').slice(-2) : v))]
        .sort((a, b) => Number(a) - Number(b));
}

function get27Prizes(draw) {
    if (!draw) return [];
    return PRIZE_KEYS
        .map(k => {
            const val = draw[k];
            if (val === null || val === undefined) return null;
            const str = String(val).trim();
            return /^\d+$/.test(str) ? str.padStart(2, '0').slice(-2) : null;
        })
        .filter(Boolean);
}

/**
 * Builds Lô Dual Merge evaluation by applying Đề Gộp Thực Chiến recommendations
 * across all 27 prizes of Northern Lottery (Strict Point-In-Time).
 *
 * @param {Object} deDualMerge - Result from dualMergeAdvisorService.buildDualMergeAdvisor
 * @param {Array} rawRows - Lottery historical draw rows
 */
function buildLoDualMergeAdvisor(deDualMerge, rawRows) {
    const rawMap = new Map((rawRows || []).map(r => [String(r.date).slice(0, 10), get27Prizes(r)]));
    const deLedger = deDualMerge?.settledLedger || deDualMerge?.records || [];

    const settledLedger = [];
    let cumProfitK = 0;
    let cumStakeK = 0;
    let cumPayoutK = 0;
    let cumWins = 0;
    let totalHitsX2 = 0;
    let totalHitsX1 = 0;

    for (let i = 0; i < deLedger.length; i++) {
        const deRecord = deLedger[i];
        const date = deRecord.date || deRecord.predictionDate;
        const actual27 = rawMap.get(date) || [];
        if (!actual27.length) continue;

        const intersection = normalizeNumbers(deRecord.intersection || []);
        const uniqueSingles = normalizeNumbers(deRecord.uniqueSingles || []);
        const fullUnion = normalizeNumbers(deRecord.union || [...intersection, ...uniqueSingles]);

        const unitCount = intersection.length * 2 + uniqueSingles.length * 1;
        const stakeK = unitCount * LOTO_STAKE_PER_UNIT_K;

        const hitsX2 = [];
        const hitsX1 = [];

        actual27.forEach(act => {
            if (intersection.includes(act)) {
                hitsX2.push(act);
            } else if (uniqueSingles.includes(act)) {
                hitsX1.push(act);
            }
        });

        const payoutK = (hitsX2.length * 2 * LOTO_PAYOUT_PER_HIT_K) + (hitsX1.length * 1 * LOTO_PAYOUT_PER_HIT_K);
        const profitK = payoutK - stakeK;
        const isWin = profitK > 0;
        const totalHits = hitsX2.length + hitsX1.length;

        cumProfitK += profitK;
        cumStakeK += stakeK;
        cumPayoutK += payoutK;
        if (isWin) cumWins++;
        totalHitsX2 += hitsX2.length;
        totalHitsX1 += hitsX1.length;

        let hitType = 'loss';
        if (hitsX2.length > 0 && hitsX1.length > 0) {
            hitType = 'both';
        } else if (hitsX2.length > 0) {
            hitType = 'win_x2';
        } else if (hitsX1.length > 0) {
            hitType = 'win_x1';
        }

        settledLedger.push({
            date,
            settled: true,
            isLocked: true,
            m1: deRecord.m1,
            m1Label: deRecord.m1Label,
            m2: deRecord.m2,
            m2Label: deRecord.m2Label,
            intersection,
            uniqueSingles,
            union: fullUnion,
            overlapCount: intersection.length,
            totalNumbers: fullUnion.length,
            unitCount,
            stakeK,
            payoutK,
            profitK,
            isWin,
            hitType,
            hitsX2: hitsX2.length,
            hitsX1: hitsX1.length,
            totalHits,
            hitsX2Numbers: hitsX2,
            hitsX1Numbers: hitsX1,
            actual27,
            cumulativeProfitK: cumProfitK
        });
    }

    function calcWindow(records) {
        const count = records.length;
        if (!count) {
            return { days: 0, wins: 0, losses: 0, hitRate: 0, stakeK: 0, payoutK: 0, profitK: 0, roi: 0, totalHits: 0, hitsX2: 0, hitsX1: 0 };
        }
        const wins = records.filter(r => r.isWin).length;
        const stakeK = records.reduce((s, r) => s + (r.stakeK || 0), 0);
        const payoutK = records.reduce((s, r) => s + (r.payoutK || 0), 0);
        const profitK = payoutK - stakeK;
        const totalHits = records.reduce((s, r) => s + (r.totalHits || 0), 0);
        const hitsX2 = records.reduce((s, r) => s + (r.hitsX2 || 0), 0);
        const hitsX1 = records.reduce((s, r) => s + (r.hitsX1 || 0), 0);
        return {
            days: count,
            wins,
            losses: count - wins,
            hitRate: Number((wins / count).toFixed(4)),
            stakeK,
            payoutK,
            profitK,
            roi: stakeK > 0 ? Number((profitK / stakeK).toFixed(4)) : 0,
            totalHits,
            hitsX2,
            hitsX1
        };
    }

    // Recommendation for pending target date
    const deLatestRec = deDualMerge?.latestRecommendation || {};
    const recIntersection = normalizeNumbers(deLatestRec.intersection || deLatestRec.intersectionX2 || []);
    const recSingles = normalizeNumbers(deLatestRec.uniqueSingles || deLatestRec.uniqueSinglesX1 || []);
    const recUnion = normalizeNumbers(deLatestRec.union || deLatestRec.fullUnion || [...recIntersection, ...recSingles]);
    const recUnitCount = recIntersection.length * 2 + recSingles.length * 1;
    const recStakeK = recUnitCount * LOTO_STAKE_PER_UNIT_K;

    const latestRecommendation = {
        predictionDate: deLatestRec.predictionDate || null,
        sourceDataThrough: deLatestRec.sourceDataThrough || null,
        confidence: deLatestRec.confidence || 4.8,
        m1: deLatestRec.m1,
        m1Label: deLatestRec.m1Label,
        m2: deLatestRec.m2,
        m2Label: deLatestRec.m2Label,
        intersectionX2: recIntersection,
        uniqueSinglesX1: recSingles,
        fullUnion: recUnion,
        overlapCount: recIntersection.length,
        totalNumbersCount: recUnion.length,
        unitCount: recUnitCount,
        stakeK: recStakeK,
        plainReasons: [
            `Áp dụng dàn Đề Gộp Thực Chiến (kết hợp ${deLatestRec.m1Label || 'M1'} và ${deLatestRec.m2Label || 'M2'}) đánh trên toàn bộ 27 giải Lô.`,
            `Trùng khớp ${recIntersection.length} số đánh nhân đôi (x2) với mức cược 440K/số, ăn 1.600K mỗi nháy.`,
            `Bọc lót ${recSingles.length} số riêng lẻ (x1) với mức cược 220K/số, ăn 800K mỗi nháy trên 27 giải.`,
            `Nhật ký đối soát 100% Strict Point-In-Time trên toàn bộ 27 giải năm 2026.`
        ]
    };

    const overall = calcWindow(settledLedger);
    const summary = {
        ...overall,
        totalSettled: settledLedger.length,
        totalWins: overall.wins,
        totalLosses: overall.losses,
        overallHitRate: overall.hitRate,
        totalHits: overall.totalHits,
        totalHitsX2,
        totalHitsX1,
        totalStakeK: overall.stakeK,
        totalPayoutK: overall.payoutK,
        overallProfitK: overall.profitK,
        windows: {
            last7: calcWindow(settledLedger.slice(-7)),
            last15: calcWindow(settledLedger.slice(-15)),
            last30: calcWindow(settledLedger.slice(-30)),
            last60: calcWindow(settledLedger.slice(-60)),
            last90: calcWindow(settledLedger.slice(-90)),
            all: overall
        }
    };

    return {
        version: '2026.1.0-strict-pit-27prizes',
        description: 'Lô Gộp Thực Chiến — Áp dụng dàn số Đề Gộp Thực Chiến (Mốc Lịch Sử D-1) đánh trên 27 giải Lô.',
        stakePerUnitK: LOTO_STAKE_PER_UNIT_K,
        payoutPerHitK: LOTO_PAYOUT_PER_HIT_K,
        latestRecommendation,
        settledLedger,
        records: settledLedger,
        summary
    };
}

module.exports = {
    buildLoDualMergeAdvisor,
    get27Prizes,
    normalizeNumbers,
    LOTO_STAKE_PER_UNIT_K,
    LOTO_PAYOUT_PER_HIT_K
};
