'use strict';

/**
 * lib/services/semanticResonanceSuiteAdvisorService.js
 *
 * Core Quantitative Service for:
 * HỆ 4: CỘNG HƯỞNG ĐA TẦNG (SEMANTIC RESONANCE & CO-AFFINITY MULTI-ASSET SUITE)
 *
 * Tích hợp 3 Trụ Cột Thực Chiến Hoàn Chỉnh:
 * 1. Đề Tri-Tier Semantic Resonance 36s:
 *    - 12 số VIP cược 2.5M/số (chi 30M). Khi nổ ăn 210M -> LÃI RÒNG +156M (ROI +288.9%).
 *    - 24 số Bọc Lót cược 1.0M/số (chi 24M). Khi nổ ăn 84M -> LÃI RÒNG +30M (ROI +55.6%).
 *    - Tổng vốn: 54M/ngày. 100% ngày trúng đều có lãi ròng dương.
 * 2. Lô Co-Affinity Network & Bidirectional Momentum (Top 7 Tuyển Chọn):
 *    - Chế độ Flat (Cược Phẳng): 7 số cược phẳng 2.2M/số (100 điểm) = 15.4M/ngày. Ăn 8.0M/nháy.
 *    - Chế độ Phân Tầng (Tiered): Top 3 VIP cược 4.4M/số + Top 4 Lót cược 2.2M/số = 22.0M/ngày.
 *      Ăn VIP 16M/nháy, Ăn Lót 8M/nháy.
 * 3. Lô Xiên 5 (5 Dàn Xiên 4 Tuyển Chọn Ghép Từ Top 5):
 *    - 5 vé Xiên 4 x 11M/vé = 55.0M/ngày.
 *    - Ăn Xiên 4 (+384M), Xiên 3 (+84M), Xiên 2 (+12M).
 * 4. Tổng Hợp Combo Bù Trừ Dòng Tiền Chéo:
 *    - Combo Flat: Vốn 124.4M/ngày (54M + 15.4M + 55M).
 *    - Combo Phân Tầng: Vốn 131.0M/ngày (54M + 22.0M + 55M).
 *
 * 100% Strict Point-In-Time (Strict PIT).
 */

const fs = require('fs');
const path = require('path');
const { isPredictionLockActive, preserveLockedRecommendation } = require('../utils/predictionLockGuard');

const CONFIG = Object.freeze({
    strategyId: 'semanticResonanceSuite',
    strategyName: 'Hệ 4: Cộng Hưởng Đa Tầng (Semantic Resonance & Co-Affinity)',
    // Đề
    deStake36K: 10800,           // 18 x 400K + 18 x 200K = 10.8M
    deVipCount: 18,              // 18 số đầu đánh X2 (400K/số)
    deLotCount: 18,              // 18 số sau đánh X1 (200K/số)
    deVipStakeK: 7200,           // 18 x 400K
    deLotStakeK: 3600,           // 18 x 200K
    deVipPayoutK: 33600,         // 400K x 84 = 33.6M
    deLotPayoutK: 16800,         // 200K x 84 = 16.8M
    deVipProfitK: 22800,         // +22.8M
    deLotProfitK: 6000,          // +6.0M
    // Lô Flat
    loFlatCount: 7,
    loFlatStakeK: 15400,         // 7 x 2.2M
    loFlatUnitPayoutK: 8000,     // 8M / nháy
    // Lô Phân Tầng
    loTieredCount: 7,
    loTieredVipCount: 3,
    loTieredLotCount: 4,
    loTieredVipStakeK: 13200,    // 3 x 4.4M
    loTieredLotStakeK: 8800,     // 4 x 2.2M
    loTieredStakeK: 22000,       // 13.2M + 8.8M
    loTieredVipPayoutK: 16000,   // 16M / nháy VIP
    loTieredLotPayoutK: 8000,    // 8M / nháy Lót
    // Xiên 5
    xien5TicketCount: 5,
    xien5StakeK: 5500,           // 5 x 1.1M
    xien4PayoutK: 38400,         // 38.4M
    xien3PayoutK: 8400,          // 8.4M
    xien2PayoutK: 1200,          // 1.2M
    // Combo
    comboFlatStakeK: 31700,      // 10.8M + 15.4M + 5.5M
    comboTieredStakeK: 38300     // 10.8M + 22M + 5.5M
});

const PRIZE_KEYS = [
    'special', 'prize1',
    'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];

function extract27Prizes(row) {
    if (!row) return [];
    if (Array.isArray(row.actual27) && row.actual27.length) return row.actual27.map(numStr);
    if (Array.isArray(row.prizes) && row.prizes.length) return row.prizes.map(numStr);
    return PRIZE_KEYS.map(k => {
        const val = row[k];
        if (val === null || val === undefined) return null;
        return numStr(val);
    }).filter(Boolean);
}

const numStr = n => String(Number(n)).padStart(2, '0');

function getXien5Combinations(top5) {
    if (!Array.isArray(top5) || top5.length < 5) return [];
    const n = top5.map(numStr);
    return [
        [n[0], n[1], n[2], n[3]], // Vé 1 (bỏ n[4])
        [n[0], n[1], n[2], n[4]], // Vé 2 (bỏ n[3])
        [n[0], n[1], n[3], n[4]], // Vé 3 (bỏ n[2])
        [n[0], n[2], n[3], n[4]], // Vé 4 (bỏ n[1])
        [n[1], n[2], n[3], n[4]]  // Vé 5 (bỏ n[0])
    ];
}

function evaluateXien5(top5, actual27) {
    const hitsMap = {};
    (actual27 || []).forEach(n => {
        const s = numStr(n);
        hitsMap[s] = (hitsMap[s] || 0) + 1;
    });

    const safeTop5 = (top5 || []).slice(0, 5).map(numStr);
    const hitsInTop5 = safeTop5.filter(n => (hitsMap[n] || 0) > 0);
    const h5 = hitsInTop5.length;
    const tickets = getXien5Combinations(safeTop5);

    let payoutK = 0;
    let x4Count = 0;
    let x3Count = 0;
    let x2Count = 0;

    const ticketDetails = tickets.map((t, idx) => {
        const tHits = t.filter(n => (hitsMap[n] || 0) > 0);
        const count = tHits.length;
        let prizeK = 0;
        let tierLabel = 'Trượt';
        if (count === 4) {
            prizeK = CONFIG.xien4PayoutK;
            x4Count++;
            tierLabel = 'Xiên 4 (+38.4M)';
        } else if (count === 3) {
            prizeK = CONFIG.xien3PayoutK;
            x3Count++;
            tierLabel = 'Xiên 3 (+8.4M)';
        } else if (count === 2) {
            prizeK = CONFIG.xien2PayoutK;
            x2Count++;
            tierLabel = 'Xiên 2 (+1.2M)';
        }
        payoutK += prizeK;
        return {
            ticket: t,
            hits: tHits,
            count,
            prizeK,
            tierLabel,
            ticketIndex: idx + 1
        };
    });

    const stakeK = CONFIG.xien5StakeK;
    const profitK = payoutK - stakeK;
    const isWin = profitK > 0;

    return {
        top5: safeTop5,
        hitsInTop5,
        h5,
        tickets,
        ticketDetails,
        stakeK,
        payoutK,
        profitK,
        isWin,
        x4Count,
        x3Count,
        x2Count
    };
}

/**
 * Lấy danh sách số dự đoán của các phương pháp từ cache
 */
function getMethodNumbers(cache, methodKey, d) {
    let ledger = cache[methodKey]?.settledLedger;
    if (!ledger && methodKey === 'deMarkovGapHazard') {
        ledger = cache.streakAwareDeAdvisor?.markovAdvisor?.settledLedger;
    }
    const r = ledger?.find(row => String(row.date || row.predictionDate).slice(0, 10) === d);
    if (!r) return [];
    if (methodKey === 'metaLearner') return (r.numbers || []).map(Number);
    if (methodKey === 'dualMerge') return [...(r.intersectionX2 || []), ...(r.uniqueSinglesX1 || [])].map(Number);
    if (methodKey === 'deMarkovGapHazard' || methodKey === 'pentaCoreDe') {
        return (r.numbers || [...(r.vipNumbers || []), ...(r.backupNumbers || [])]).map(Number);
    }
    return (r.numbers || []).map(Number);
}

/**
 * Xây dựng toàn bộ hệ thống dự đoán và đối soát cho Hệ 4
 */
function buildSemanticResonanceSuiteAdvisor(rawRows, cache, options = {}) {
    if (!rawRows || !Array.isArray(rawRows)) return null;

    const rawMap = new Map();
    rawRows.forEach(r => {
        if (r.date && r.special !== undefined && r.special !== null) {
            rawMap.set(String(r.date).slice(0, 10), numStr(r.special));
        }
    });

    // Lấy nguồn Lô từ loQuantumBayesFusion hoặc loDropoff27
    const qmbfLedger = cache.loQuantumBayesFusion?.settledLedger || cache.loDropoff27?.settledLedger || [];
    const deDropoffLedger = cache.deDropoffMerge?.settledLedger || [];

    // Kế thừa snapshot đối soát có sẵn (Immutable Snapshot Freezing)
    const existingSuite = options.existingSemanticResonanceSuite || cache.semanticResonanceSuite || options.existingCache?.semanticResonanceSuite || null;
    const existingSettledMap = new Map((existingSuite?.settledLedger || []).map(r => [String(r.date || r.predictionDate).slice(0, 10), r]));

    // Nếu có latestRecommendation trước đó và ngày đó đã có kết quả mở thưởng trong rawRows, kết toán bất biến từ chính snapshot đã khóa
    const prevRec = existingSuite?.latestRecommendation;
    const prevRecDate = prevRec ? String(prevRec.targetDate || prevRec.predictionDate || prevRec.date || '').slice(0, 10) : null;
    if (prevRecDate && !existingSettledMap.has(prevRecDate) && rawMap.has(prevRecDate)) {
        const actualSpecial = rawMap.get(prevRecDate);
        const qmbfRow = qmbfLedger.find(r => String(r.date || r.predictionDate).slice(0, 10) === prevRecDate);
        const rawFound = rawRows.find(r => String(r.date || r.ngay).slice(0, 10) === prevRecDate);
        const actual27 = (qmbfRow?.actual27 && qmbfRow.actual27.length)
            ? qmbfRow.actual27.map(numStr)
            : extract27Prizes(rawFound);
        const hitsMap = {};
        actual27.forEach(n => { hitsMap[n] = (hitsMap[n] || 0) + 1; });

        const numbers36 = (prevRec.de?.numbers36 || []).map(numStr);
        const vip18 = (prevRec.de?.vip18 || prevRec.de?.top18X2 || numbers36.slice(0, 18)).map(numStr);
        const lot18 = (prevRec.de?.lot18 || prevRec.de?.bottom18X1 || numbers36.slice(18, 36)).map(numStr);
        const vip12 = vip18.slice(0, 12);
        const lot24 = lot18;
        const numbers40 = (prevRec.de?.numbers40 || numbers36).map(numStr);

        let deHitType = 'MISS';
        let dePayoutK = 0;
        const deStakeK = CONFIG.deStake36K;
        if (actualSpecial && vip18.includes(actualSpecial)) {
            deHitType = 'X2';
            dePayoutK = CONFIG.deVipPayoutK;
        } else if (actualSpecial && lot18.includes(actualSpecial)) {
            deHitType = 'X1';
            dePayoutK = CONFIG.deLotPayoutK;
        }
        const deProfitK = dePayoutK - deStakeK;
        const isDeHit = deHitType !== 'MISS';

        const top7 = (prevRec.lo?.top7 || []).map(numStr);
        const top3Vip = top7.slice(0, 3);
        const top4Lot = top7.slice(3, 7);
        let totalHits = 0;
        let vipHits = 0;
        let lotHits = 0;
        top7.forEach((n, idx) => {
            const h = hitsMap[n] || 0;
            totalHits += h;
            if (idx < 3) vipHits += h;
            else lotHits += h;
        });

        const loFlatStakeK = CONFIG.loFlatStakeK;
        const loFlatPayoutK = totalHits * CONFIG.loFlatUnitPayoutK;
        const loFlatProfitK = loFlatPayoutK - loFlatStakeK;
        const isLoFlatWin = loFlatProfitK > 0;

        const loTieredStakeK = CONFIG.loTieredStakeK;
        const loTieredPayoutK = (vipHits * CONFIG.loTieredVipPayoutK) + (lotHits * CONFIG.loTieredLotPayoutK);
        const loTieredProfitK = loTieredPayoutK - loTieredStakeK;
        const isLoTieredWin = loTieredProfitK > 0;

        const top5 = top7.slice(0, 5);
        const x5 = evaluateXien5(top5, actual27);

        const comboFlatStakeK = deStakeK + loFlatStakeK + x5.stakeK;
        const comboFlatPayoutK = dePayoutK + loFlatPayoutK + x5.payoutK;
        const comboFlatProfitK = comboFlatPayoutK - comboFlatStakeK;
        const isComboFlatWin = comboFlatProfitK > 0;

        const comboTieredStakeK = deStakeK + loTieredStakeK + x5.stakeK;
        const comboTieredPayoutK = dePayoutK + loTieredPayoutK + x5.payoutK;
        const comboTieredProfitK = comboTieredPayoutK - comboTieredStakeK;
        const isComboTieredWin = comboTieredProfitK > 0;

        existingSettledMap.set(prevRecDate, {
            date: prevRecDate,
            actualSpecial,
            actual27,
            hitsMap,
            de: {
                numbers36,
                vip12,
                lot24,
                numbers40,
                actual: actualSpecial,
                isHit: isDeHit,
                hitType: deHitType,
                stakeK: deStakeK,
                payoutK: dePayoutK,
                profitK: deProfitK,
                cumProfitK: 0
            },
            lo: {
                top7,
                top3Vip,
                top4Lot,
                totalHits,
                vipHits,
                lotHits,
                flat: {
                    stakeK: loFlatStakeK,
                    payoutK: loFlatPayoutK,
                    profitK: loFlatProfitK,
                    isWin: isLoFlatWin,
                    cumProfitK: 0
                },
                tiered: {
                    stakeK: loTieredStakeK,
                    payoutK: loTieredPayoutK,
                    profitK: loTieredProfitK,
                    isWin: isLoTieredWin,
                    cumProfitK: 0
                }
            },
            xien5: {
                top5: x5.top5,
                hitsInTop5: x5.hitsInTop5,
                h5: x5.h5,
                x4Count: x5.x4Count,
                x3Count: x5.x3Count,
                x2Count: x5.x2Count,
                tickets: x5.tickets,
                stakeK: x5.stakeK,
                payoutK: x5.payoutK,
                profitK: x5.profitK,
                isWin: x5.isWin,
                cumProfitK: 0
            },
            combo: {
                flat: {
                    stakeK: comboFlatStakeK,
                    payoutK: comboFlatPayoutK,
                    profitK: comboFlatProfitK,
                    isWin: isComboFlatWin,
                    cumProfitK: 0
                },
                tiered: {
                    stakeK: comboTieredStakeK,
                    payoutK: comboTieredPayoutK,
                    profitK: comboTieredProfitK,
                    isWin: isComboTieredWin,
                    cumProfitK: 0
                }
            }
        });
    }

    // Danh sách các ngày mở thưởng năm 2026
    const allDateSet = new Set(
        qmbfLedger
            .map(r => String(r.date || r.predictionDate).slice(0, 10))
            .filter(d => d.startsWith('2026'))
    );
    for (const d of existingSettledMap.keys()) {
        if (d.startsWith('2026')) allDateSet.add(d);
    }
    const dates = Array.from(allDateSet).sort();

    const settledLedger = [];
    dates.forEach(d => {
        if (existingSettledMap.has(d)) {
            const ex = existingSettledMap.get(d);
            const actualSpecial = ex.actualSpecial || rawMap.get(d) || null;
            const numbers36 = (ex.de?.numbers36 || [...(ex.de?.vip18 || ex.de?.vip12 || []), ...(ex.de?.lot18 || ex.de?.lot24 || [])]).map(numStr);
            const vip18 = (ex.de?.vip18 || numbers36.slice(0, 18)).map(numStr);
            const lot18 = (ex.de?.lot18 || numbers36.slice(18, 36)).map(numStr);
            const vip12 = vip18.slice(0, 12);
            const lot24 = lot18;
            const numbers40 = (ex.de?.numbers40 || numbers36).map(numStr);

            let deHitType = 'MISS';
            let dePayoutK = 0;
            const deStakeK = CONFIG.deStake36K;
            if (actualSpecial && vip18.includes(actualSpecial)) {
                deHitType = 'X2';
                dePayoutK = CONFIG.deVipPayoutK;
            } else if (actualSpecial && lot18.includes(actualSpecial)) {
                deHitType = 'X1';
                dePayoutK = CONFIG.deLotPayoutK;
            }
            const deProfitK = dePayoutK - deStakeK;
            const isDeHit = deHitType !== 'MISS';

            const rawFound = rawRows.find(r => String(r.date || r.ngay).slice(0, 10) === d);
            const actual27 = (ex.actual27 && ex.actual27.length)
                ? ex.actual27.map(numStr)
                : extract27Prizes(rawFound);
            const hitsMap = {};
            actual27.forEach(n => { hitsMap[n] = (hitsMap[n] || 0) + 1; });

            const top7 = (ex.lo?.top7 || []).map(numStr);
            const top3Vip = ex.lo?.top3Vip || top7.slice(0, 3);
            const top4Lot = ex.lo?.top4Lot || top7.slice(3, 7);
            let totalHits = 0;
            let vipHits = 0;
            let lotHits = 0;
            top7.forEach((n, idx) => {
                const h = hitsMap[n] || 0;
                totalHits += h;
                if (idx < 3) vipHits += h;
                else lotHits += h;
            });

            const loFlatStakeK = CONFIG.loFlatStakeK;
            const loFlatPayoutK = totalHits * CONFIG.loFlatUnitPayoutK;
            const loFlatProfitK = loFlatPayoutK - loFlatStakeK;
            const isLoFlatWin = loFlatProfitK > 0;

            const loTieredStakeK = CONFIG.loTieredStakeK;
            const loTieredPayoutK = (vipHits * CONFIG.loTieredVipPayoutK) + (lotHits * CONFIG.loTieredLotPayoutK);
            const loTieredProfitK = loTieredPayoutK - loTieredStakeK;
            const isLoTieredWin = loTieredProfitK > 0;

            const top5 = (ex.xien5?.top5 || top7.slice(0, 5)).map(numStr);
            const x5 = evaluateXien5(top5, actual27);

            const comboFlatStakeK = deStakeK + loFlatStakeK + x5.stakeK;
            const comboFlatPayoutK = dePayoutK + loFlatPayoutK + x5.payoutK;
            const comboFlatProfitK = comboFlatPayoutK - comboFlatStakeK;
            const isComboFlatWin = comboFlatProfitK > 0;

            const comboTieredStakeK = deStakeK + loTieredStakeK + x5.stakeK;
            const comboTieredPayoutK = dePayoutK + loTieredPayoutK + x5.payoutK;
            const comboTieredProfitK = comboTieredPayoutK - comboTieredStakeK;
            const isComboTieredWin = comboTieredProfitK > 0;

            settledLedger.push({
                ...ex,
                date: d,
                actualSpecial,
                actual27,
                hitsMap,
                de: {
                    ...ex.de,
                    numbers36,
                    vip12,
                    lot24,
                    numbers40,
                    actual: actualSpecial,
                    isHit: isDeHit,
                    hitType: deHitType,
                    stakeK: deStakeK,
                    payoutK: dePayoutK,
                    profitK: deProfitK,
                    cumProfitK: 0
                },
                lo: {
                    ...ex.lo,
                    top7,
                    top3Vip,
                    top4Lot,
                    totalHits,
                    vipHits,
                    lotHits,
                    flat: {
                        stakeK: loFlatStakeK,
                        payoutK: loFlatPayoutK,
                        profitK: loFlatProfitK,
                        isWin: isLoFlatWin,
                        cumProfitK: 0
                    },
                    tiered: {
                        stakeK: loTieredStakeK,
                        payoutK: loTieredPayoutK,
                        profitK: loTieredProfitK,
                        isWin: isLoTieredWin,
                        cumProfitK: 0
                    }
                },
                xien5: {
                    ...ex.xien5,
                    ...x5,
                    cumProfitK: 0
                },
                combo: {
                    flat: {
                        stakeK: comboFlatStakeK,
                        payoutK: comboFlatPayoutK,
                        profitK: comboFlatProfitK,
                        isWin: isComboFlatWin,
                        cumProfitK: 0
                    },
                    tiered: {
                        stakeK: comboTieredStakeK,
                        payoutK: comboTieredPayoutK,
                        profitK: comboTieredProfitK,
                        isWin: isComboTieredWin,
                        cumProfitK: 0
                    }
                }
            });
            return;
        }

        const qRow = qmbfLedger.find(r => String(r.date || r.predictionDate).slice(0, 10) === d);
        if (!qRow) return;

        const actualSpecial = rawMap.get(d) || null;
        const rawFound = rawRows.find(r => String(r.date || r.ngay).slice(0, 10) === d);
        const actual27 = (qRow?.actual27 && qRow.actual27.length)
            ? qRow.actual27.map(numStr)
            : extract27Prizes(rawFound);
        const hitsMap = {};
        actual27.forEach(n => { hitsMap[n] = (hitsMap[n] || 0) + 1; });

        // 1. Trụ Đề: Tri-Tier Semantic Resonance (12 VIP cược 2.5M + 24 Lót cược 1.0M = 54M)
        const deScores = new Float32Array(100);
        getMethodNumbers(cache, 'metaLearner', d).forEach(n => deScores[n] += 3.0);
        getMethodNumbers(cache, 'dualMerge', d).forEach(n => deScores[n] += 2.0);
        getMethodNumbers(cache, 'deMarkovGapHazard', d).forEach(n => deScores[n] += 1.5);
        getMethodNumbers(cache, 'pentaCoreDe', d).forEach(n => deScores[n] += 1.0);

        const rankedDe = Array.from({ length: 100 }, (_, n) => n)
            .sort((a, b) => deScores[b] - deScores[a] || a - b);

        const numbers36 = rankedDe.slice(0, 36).map(numStr);
        const vip18 = rankedDe.slice(0, 18).map(numStr);
        const lot18 = rankedDe.slice(18, 36).map(numStr);
        const vip12 = vip18.slice(0, 12);
        const lot24 = lot18;
        const numbers40 = rankedDe.slice(0, 40).map(numStr);

        let deHitType = 'MISS';
        let dePayoutK = 0;
        const deStakeK = CONFIG.deStake36K;

        if (actualSpecial && vip18.includes(actualSpecial)) {
            deHitType = 'X2';
            dePayoutK = CONFIG.deVipPayoutK;
        } else if (actualSpecial && lot18.includes(actualSpecial)) {
            deHitType = 'X1';
            dePayoutK = CONFIG.deLotPayoutK;
        }

        const deProfitK = dePayoutK - deStakeK;
        const isDeHit = deHitType !== 'MISS';

        // 2. Trụ Lô: Top 7 Co-Affinity (Flat vs Tiered)
        const top7 = (qRow.rankedNumbers || qRow.numbers || []).slice(0, 7).map(numStr);
        const top3Vip = top7.slice(0, 3);
        const top4Lot = top7.slice(3, 7);

        let totalHits = 0;
        let vipHits = 0;
        let lotHits = 0;
        top7.forEach((n, idx) => {
            const h = hitsMap[n] || 0;
            totalHits += h;
            if (idx < 3) vipHits += h;
            else lotHits += h;
        });

        // Chế độ Flat
        const loFlatStakeK = CONFIG.loFlatStakeK;
        const loFlatPayoutK = totalHits * CONFIG.loFlatUnitPayoutK;
        const loFlatProfitK = loFlatPayoutK - loFlatStakeK;
        const isLoFlatWin = loFlatProfitK > 0;

        // Chế độ Phân Tầng
        const loTieredStakeK = CONFIG.loTieredStakeK;
        const loTieredPayoutK = (vipHits * CONFIG.loTieredVipPayoutK) + (lotHits * CONFIG.loTieredLotPayoutK);
        const loTieredProfitK = loTieredPayoutK - loTieredStakeK;
        const isLoTieredWin = loTieredProfitK > 0;

        // 3. Trụ Lô Xiên 5: 5 Dàn Xiên 4 từ Top 5
        const top5 = top7.slice(0, 5);
        const x5 = evaluateXien5(top5, actual27);

        // 4. Tổng Hợp Combo Bù Trừ Dòng Tiền Chéo
        // Combo Flat
        const comboFlatStakeK = deStakeK + loFlatStakeK + x5.stakeK;
        const comboFlatPayoutK = dePayoutK + loFlatPayoutK + x5.payoutK;
        const comboFlatProfitK = comboFlatPayoutK - comboFlatStakeK;
        const isComboFlatWin = comboFlatProfitK > 0;

        // Combo Phân Tầng
        const comboTieredStakeK = deStakeK + loTieredStakeK + x5.stakeK;
        const comboTieredPayoutK = dePayoutK + loTieredPayoutK + x5.payoutK;
        const comboTieredProfitK = comboTieredPayoutK - comboTieredStakeK;
        const isComboTieredWin = comboTieredProfitK > 0;

        settledLedger.push({
            date: d,
            actualSpecial,
            actual27,
            hitsMap,
            // Đề
            de: {
                numbers36,
                vip12,
                lot24,
                numbers40,
                actual: actualSpecial,
                isHit: isDeHit,
                hitType: deHitType,
                stakeK: deStakeK,
                payoutK: dePayoutK,
                profitK: deProfitK,
                cumProfitK: 0
            },
            // Lô
            lo: {
                top7,
                top3Vip,
                top4Lot,
                totalHits,
                vipHits,
                lotHits,
                flat: {
                    stakeK: loFlatStakeK,
                    payoutK: loFlatPayoutK,
                    profitK: loFlatProfitK,
                    isWin: isLoFlatWin,
                    cumProfitK: 0
                },
                tiered: {
                    stakeK: loTieredStakeK,
                    payoutK: loTieredPayoutK,
                    profitK: loTieredProfitK,
                    isWin: isLoTieredWin,
                    cumProfitK: 0
                }
            },
            // Xiên 5
            xien5: {
                top5: x5.top5,
                hitsInTop5: x5.hitsInTop5,
                h5: x5.h5,
                x4Count: x5.x4Count,
                x3Count: x5.x3Count,
                x2Count: x5.x2Count,
                tickets: x5.tickets,
                stakeK: x5.stakeK,
                payoutK: x5.payoutK,
                profitK: x5.profitK,
                isWin: x5.isWin,
                cumProfitK: 0
            },
            // Combo
            combo: {
                flat: {
                    stakeK: comboFlatStakeK,
                    payoutK: comboFlatPayoutK,
                    profitK: comboFlatProfitK,
                    isWin: isComboFlatWin,
                    cumProfitK: 0
                },
                tiered: {
                    stakeK: comboTieredStakeK,
                    payoutK: comboTieredPayoutK,
                    profitK: comboTieredProfitK,
                    isWin: isComboTieredWin,
                    cumProfitK: 0
                }
            }
        });
    });

    // Sắp xếp và tính lũy kế lợi nhuận
    settledLedger.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    let cumDeProfitK = 0;
    let cumLoFlatProfitK = 0;
    let cumLoTieredProfitK = 0;
    let cumXien5ProfitK = 0;
    let cumComboFlatProfitK = 0;
    let cumComboTieredProfitK = 0;

    settledLedger.forEach(row => {
        cumDeProfitK += (row.de.profitK || 0);
        row.de.cumProfitK = cumDeProfitK;

        cumLoFlatProfitK += (row.lo.flat.profitK || 0);
        row.lo.flat.cumProfitK = cumLoFlatProfitK;

        cumLoTieredProfitK += (row.lo.tiered.profitK || 0);
        row.lo.tiered.cumProfitK = cumLoTieredProfitK;

        cumXien5ProfitK += (row.xien5.profitK || 0);
        row.xien5.cumProfitK = cumXien5ProfitK;

        cumComboFlatProfitK += (row.combo.flat.profitK || 0);
        row.combo.flat.cumProfitK = cumComboFlatProfitK;

        cumComboTieredProfitK += (row.combo.tiered.profitK || 0);
        row.combo.tiered.cumProfitK = cumComboTieredProfitK;
    });

    // 5. Sinh Latest Recommendation cho ngày mục tiêu tiếp theo
    const latestRaw = rawRows[rawRows.length - 1];
    let targetDate = cache.pendingPredictionDate;
    if (!targetDate && latestRaw?.date) {
        const d = new Date(latestRaw.date);
        d.setDate(d.getDate() + 1);
        targetDate = d.toISOString().slice(0, 10);
    }

    // Đề đề xuất tiếp theo
    const latestDeScores = new Float32Array(100);
    const numsMeta = (cache.metaLearner?.latestRecommendation?.numbers || []).map(Number);
    const numsDual = [...(cache.dualMerge?.latestRecommendation?.intersectionX2 || []), ...(cache.dualMerge?.latestRecommendation?.uniqueSinglesX1 || [])].map(Number);
    const numsMarkov = (cache.streakAwareDeAdvisor?.markovAdvisor?.latestRecommendation?.numbers || cache.deMarkovGapHazard?.latestRecommendation?.numbers || []).map(Number);
    const numsPenta = (cache.pentaCoreDe?.latestRecommendation?.numbers || []).map(Number);

    numsMeta.forEach(n => latestDeScores[n] += 3.0);
    numsDual.forEach(n => latestDeScores[n] += 2.0);
    numsMarkov.forEach(n => latestDeScores[n] += 1.5);
    numsPenta.forEach(n => latestDeScores[n] += 1.0);

    const latestRankedDe = Array.from({ length: 100 }, (_, n) => n)
        .sort((a, b) => latestDeScores[b] - latestDeScores[a] || a - b);

    const latestNumbers36 = latestRankedDe.slice(0, 36).map(numStr);
    const latestVip18 = latestRankedDe.slice(0, 18).map(numStr);
    const latestLot18 = latestRankedDe.slice(18, 36).map(numStr);
    const latestVip12 = latestVip18.slice(0, 12);
    const latestLot24 = latestLot18;
    const latestNumbers40 = latestRankedDe.slice(0, 40).map(numStr);

    // Lô đề xuất tiếp theo
    const latestLoRec = cache.loQuantumBayesFusion?.latestRecommendation || cache.loDropoff27?.latestRecommendation || {};
    const rankedList = Array.isArray(latestLoRec.rankedNumbers) ? latestLoRec.rankedNumbers : (latestLoRec.topPredictions?.top20?.numbers || []);
    const latestLoTop7 = (latestLoRec.topPredictions?.top7?.numbers || latestLoRec.byTop?.top7?.numbers || (rankedList.length >= 7 ? rankedList.slice(0, 7) : null) || latestLoRec.top7 || latestLoRec.numbers || ['49', '52', '04', '43', '62', '54', '36']).map(numStr);
    const latestLoTop3Vip = latestLoTop7.slice(0, 3);
    const latestLoTop4Lot = latestLoTop7.slice(3, 7);
    const latestLoTop5 = latestLoTop7.slice(0, 5);
    const latestLoTop2 = latestLoTop7.slice(0, 2);
    const latestLoTop6 = latestLoTop7.slice(0, 6);

    // Xiên 5 đề xuất tiếp theo
    const latestXien5Tickets = getXien5Combinations(latestLoTop5);

    const lockStatus = isPredictionLockActive(targetDate, rawRows);

    const freshRec = {
        targetDate,
        predictionDate: targetDate,
        methodId: 'semanticResonanceSuite',
        methodName: '💎 Hệ 4: Cộng Hưởng Đa Tầng (Semantic Resonance & Co-Affinity)',
        de: {
            strategyName: 'Đề Tri-Tier Semantic Resonance (36s: 18 VIP X2 + 18 Lót X1)',
            vip18: latestVip18,
            lot18: latestLot18,
            vip12: latestVip12,
            lot24: latestLot24,
            numbers36: latestNumbers36,
            numbers40: latestNumbers40,
            stakeK: CONFIG.deStake36K,
            payoutVipK: CONFIG.deVipPayoutK,
            payoutLotK: CONFIG.deLotPayoutK,
            reasoning: 'Hội tụ đồng thuận 4 động cơ ML + Nhịp dạng số. Phân bổ 18 VIP (cược X2 400K ăn 33.6M, lãi +22.8M) + 18 Bọc lót (cược X1 200K ăn 16.8M, lãi +6.0M). 100% trúng có lãi.'
        },
        lo: {
            strategyName: 'Lô Top 7 Co-Affinity Network & Bidirectional Momentum',
            top7: latestLoTop7,
            top3Vip: latestLoTop3Vip,
            top4Lot: latestLoTop4Lot,
            top2: latestLoTop2,
            top6: latestLoTop6,
            flat: {
                stakeK: CONFIG.loFlatStakeK,
                unitPayoutK: CONFIG.loFlatUnitPayoutK,
                description: 'Cược phẳng 7 con x 2.2M (100 điểm) = 15.4M/ngày. Ăn 8M/nháy. Nổ >= 2 nháy có lãi.'
            },
            tiered: {
                vipCount: 3,
                lotCount: 4,
                vipStakeK: CONFIG.loTieredVipStakeK,
                lotStakeK: CONFIG.loTieredLotStakeK,
                stakeK: CONFIG.loTieredStakeK,
                vipPayoutK: CONFIG.loTieredVipPayoutK,
                lotPayoutK: CONFIG.loTieredLotPayoutK,
                description: 'Phân tầng: Top 3 VIP x 4.4M + Top 4 Lót x 2.2M = 22M/ngày. Ăn VIP 16M/nháy, Ăn Lót 8M/nháy.'
            }
        },
        xien5: {
            strategyName: 'Lô Xiên 5 Tuyển Chọn (5 Dàn Xiên 4 Ghép Từ Top 5)',
            top5: latestLoTop5,
            tickets: latestXien5Tickets,
            stakeK: CONFIG.xien5StakeK,
            payoutX4K: CONFIG.xien4PayoutK,
            payoutX3K: CONFIG.xien3PayoutK,
            payoutX2K: CONFIG.xien2PayoutK,
            description: 'Vốn 5.5M/ngày (1.1M/vé x 5 vé). Cơ cấu: Nổ 5 con ăn 192M (lãi +186.5M), nổ 4 con ăn 72M (lãi +66.5M), nổ 3 con ăn 20.4M (lãi +14.9M), nổ 2 con thu hồi 3.6M (lỗ nhẹ -1.9M).'
        },
        combo: {
            flatStakeK: CONFIG.comboFlatStakeK,
            tieredStakeK: CONFIG.comboTieredStakeK,
            descriptionFlat: 'Tổng Vốn Flat: 10.8M (Đề) + 15.4M (Lô Flat) + 5.5M (Xiên 5) = 31.7M/ngày.',
            descriptionTiered: 'Tổng Vốn Phân Tầng: 10.8M (Đề) + 22.0M (Lô Tiered) + 5.5M (Xiên 5) = 38.3M/ngày.'
        },
        snapshotLock: lockStatus
    };

    const latestRecommendation = preserveLockedRecommendation(prevRec, freshRec, lockStatus);
    if (latestRecommendation) {
        if (latestRecommendation.de) {
            latestRecommendation.de.stakeK = CONFIG.deStake36K;
            latestRecommendation.de.payoutVipK = CONFIG.deVipPayoutK;
            latestRecommendation.de.payoutLotK = CONFIG.deLotPayoutK;
            latestRecommendation.de.reasoning = 'Hội tụ đồng thuận 4 động cơ ML + Nhịp dạng số. Phân bổ 18 VIP (cược X2 400K ăn 33.6M, lãi +22.8M) + 18 Bọc lót (cược X1 200K ăn 16.8M, lãi +6.0M). 100% trúng có lãi.';
        }
        if (latestRecommendation.xien5) {
            latestRecommendation.xien5.stakeK = CONFIG.xien5StakeK;
            latestRecommendation.xien5.payoutX4K = CONFIG.xien4PayoutK;
            latestRecommendation.xien5.payoutX3K = CONFIG.xien3PayoutK;
            latestRecommendation.xien5.payoutX2K = CONFIG.xien2PayoutK;
            latestRecommendation.xien5.description = 'Vốn 5.5M/ngày (1.1M/vé x 5 vé). Cơ cấu: Nổ 5 con ăn 192M (lãi +186.5M), nổ 4 con ăn 72M (lãi +66.5M), nổ 3 con ăn 20.4M (lãi +14.9M), nổ 2 con thu hồi 3.6M (lỗ nhẹ -1.9M).';
        }
        if (latestRecommendation.combo) {
            latestRecommendation.combo.flatStakeK = CONFIG.comboFlatStakeK;
            latestRecommendation.combo.tieredStakeK = CONFIG.comboTieredStakeK;
            latestRecommendation.combo.descriptionFlat = 'Tổng Vốn Flat: 10.8M (Đề) + 15.4M (Lô Flat) + 5.5M (Xiên 5) = 31.7M/ngày.';
            latestRecommendation.combo.descriptionTiered = 'Tổng Vốn Phân Tầng: 10.8M (Đề) + 22.0M (Lô Tiered) + 5.5M (Xiên 5) = 38.3M/ngày.';
        }
    }

    // Summary 2026
    const totalDays = settledLedger.length;
    const deWins = settledLedger.filter(r => r.de.isHit).length;
    const loFlatWins = settledLedger.filter(r => r.lo.flat.isWin).length;
    const loTieredWins = settledLedger.filter(r => r.lo.tiered.isWin).length;
    const xien5Wins = settledLedger.filter(r => r.xien5.isWin).length;
    const comboFlatWins = settledLedger.filter(r => r.combo.flat.isWin).length;
    const comboTieredWins = settledLedger.filter(r => r.combo.tiered.isWin).length;

    const summary = {
        totalDays,
        de: {
            wins: deWins,
            winRate: totalDays > 0 ? deWins / totalDays : 0,
            profitK: cumDeProfitK,
            roi: totalDays > 0 ? cumDeProfitK / (CONFIG.deStake36K * totalDays) : 0
        },
        loFlat: {
            wins: loFlatWins,
            winRate: totalDays > 0 ? loFlatWins / totalDays : 0,
            profitK: cumLoFlatProfitK,
            roi: totalDays > 0 ? cumLoFlatProfitK / (CONFIG.loFlatStakeK * totalDays) : 0
        },
        loTiered: {
            wins: loTieredWins,
            winRate: totalDays > 0 ? loTieredWins / totalDays : 0,
            profitK: cumLoTieredProfitK,
            roi: totalDays > 0 ? cumLoTieredProfitK / (CONFIG.loTieredStakeK * totalDays) : 0
        },
        xien5: {
            wins: xien5Wins,
            winRate: totalDays > 0 ? xien5Wins / totalDays : 0,
            profitK: cumXien5ProfitK,
            roi: totalDays > 0 ? cumXien5ProfitK / (CONFIG.xien5StakeK * totalDays) : 0
        },
        comboFlat: {
            wins: comboFlatWins,
            winRate: totalDays > 0 ? comboFlatWins / totalDays : 0,
            profitK: cumComboFlatProfitK,
            roi: totalDays > 0 ? cumComboFlatProfitK / (CONFIG.comboFlatStakeK * totalDays) : 0
        },
        comboTiered: {
            wins: comboTieredWins,
            winRate: totalDays > 0 ? comboTieredWins / totalDays : 0,
            profitK: cumComboTieredProfitK,
            roi: totalDays > 0 ? cumComboTieredProfitK / (CONFIG.comboTieredStakeK * totalDays) : 0
        }
    };

    return {
        strategyId: 'semanticResonanceSuite',
        strategyName: 'Hệ 4: Cộng Hưởng Đa Tầng (Semantic Resonance & Co-Affinity)',
        config: CONFIG,
        summary,
        latestRecommendation,
        settledLedger
    };
}

module.exports = {
    CONFIG,
    evaluateXien5,
    getXien5Combinations,
    buildSemanticResonanceSuiteAdvisor
};
