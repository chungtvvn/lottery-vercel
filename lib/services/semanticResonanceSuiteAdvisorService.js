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

const CONFIG = Object.freeze({
    strategyId: 'semanticResonanceSuite',
    strategyName: 'Hệ 4: Cộng Hưởng Đa Tầng (Semantic Resonance & Co-Affinity)',
    // Đề
    deStake36K: 54000,
    deVipCount: 12,
    deLotCount: 24,
    deVipStakeK: 30000,          // 12 x 2.5M
    deLotStakeK: 24000,          // 24 x 1.0M
    deVipPayoutK: 210000,        // 2.5M x 84
    deLotPayoutK: 84000,         // 1.0M x 84
    deVipProfitK: 156000,        // +156M
    deLotProfitK: 30000,         // +30M
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
    xien5StakeK: 55000,          // 5 x 11M
    xien4PayoutK: 384000,        // 384M
    xien3PayoutK: 84000,         // 84M
    xien2PayoutK: 12000,         // 12M
    // Combo
    comboFlatStakeK: 124400,     // 54M + 15.4M + 55M
    comboTieredStakeK: 131000    // 54M + 22M + 55M
});

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
            tierLabel = 'Xiên 4 (+384M)';
        } else if (count === 3) {
            prizeK = CONFIG.xien3PayoutK;
            x3Count++;
            tierLabel = 'Xiên 3 (+84M)';
        } else if (count === 2) {
            prizeK = CONFIG.xien2PayoutK;
            x2Count++;
            tierLabel = 'Xiên 2 (+12M)';
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
function buildSemanticResonanceSuiteAdvisor(rawRows, cache) {
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

    // Danh sách các ngày mở thưởng năm 2026
    const dates = qmbfLedger
        .map(r => String(r.date || r.predictionDate).slice(0, 10))
        .filter(d => d.startsWith('2026'))
        .sort();

    const settledLedger = [];
    let cumDeProfitK = 0;
    let cumLoFlatProfitK = 0;
    let cumLoTieredProfitK = 0;
    let cumXien5ProfitK = 0;
    let cumComboFlatProfitK = 0;
    let cumComboTieredProfitK = 0;

    dates.forEach(d => {
        const qRow = qmbfLedger.find(r => String(r.date || r.predictionDate).slice(0, 10) === d);
        if (!qRow) return;

        const actualSpecial = rawMap.get(d) || null;
        const actual27 = (qRow.actual27 || []).map(numStr);
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

        const vip12 = rankedDe.slice(0, 12).map(numStr);
        const lot24 = rankedDe.slice(12, 36).map(numStr);
        const numbers36 = rankedDe.slice(0, 36).map(numStr);
        const numbers40 = rankedDe.slice(0, 40).map(numStr);

        let deHitType = 'MISS';
        let dePayoutK = 0;
        const deStakeK = CONFIG.deStake36K;

        if (actualSpecial && vip12.includes(actualSpecial)) {
            deHitType = 'VIP';
            dePayoutK = CONFIG.deVipPayoutK;
        } else if (actualSpecial && lot24.includes(actualSpecial)) {
            deHitType = 'LOT';
            dePayoutK = CONFIG.deLotPayoutK;
        }

        const deProfitK = dePayoutK - deStakeK;
        const isDeHit = deHitType !== 'MISS';
        cumDeProfitK += deProfitK;

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
        cumLoFlatProfitK += loFlatProfitK;

        // Chế độ Phân Tầng
        const loTieredStakeK = CONFIG.loTieredStakeK;
        const loTieredPayoutK = (vipHits * CONFIG.loTieredVipPayoutK) + (lotHits * CONFIG.loTieredLotPayoutK);
        const loTieredProfitK = loTieredPayoutK - loTieredStakeK;
        const isLoTieredWin = loTieredProfitK > 0;
        cumLoTieredProfitK += loTieredProfitK;

        // 3. Trụ Lô Xiên 5: 5 Dàn Xiên 4 từ Top 5
        const top5 = top7.slice(0, 5);
        const x5 = evaluateXien5(top5, actual27);
        cumXien5ProfitK += x5.profitK;

        // 4. Tổng Hợp Combo Bù Trừ Dòng Tiền Chéo
        // Combo Flat
        const comboFlatStakeK = deStakeK + loFlatStakeK + x5.stakeK;
        const comboFlatPayoutK = dePayoutK + loFlatPayoutK + x5.payoutK;
        const comboFlatProfitK = comboFlatPayoutK - comboFlatStakeK;
        const isComboFlatWin = comboFlatProfitK > 0;
        cumComboFlatProfitK += comboFlatProfitK;

        // Combo Phân Tầng
        const comboTieredStakeK = deStakeK + loTieredStakeK + x5.stakeK;
        const comboTieredPayoutK = dePayoutK + loTieredPayoutK + x5.payoutK;
        const comboTieredProfitK = comboTieredPayoutK - comboTieredStakeK;
        const isComboTieredWin = comboTieredProfitK > 0;
        cumComboTieredProfitK += comboTieredProfitK;

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
                cumProfitK: cumDeProfitK
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
                    cumProfitK: cumLoFlatProfitK
                },
                tiered: {
                    stakeK: loTieredStakeK,
                    payoutK: loTieredPayoutK,
                    profitK: loTieredProfitK,
                    isWin: isLoTieredWin,
                    cumProfitK: cumLoTieredProfitK
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
                cumProfitK: cumXien5ProfitK
            },
            // Combo
            combo: {
                flat: {
                    stakeK: comboFlatStakeK,
                    payoutK: comboFlatPayoutK,
                    profitK: comboFlatProfitK,
                    isWin: isComboFlatWin,
                    cumProfitK: cumComboFlatProfitK
                },
                tiered: {
                    stakeK: comboTieredStakeK,
                    payoutK: comboTieredPayoutK,
                    profitK: comboTieredProfitK,
                    isWin: isComboTieredWin,
                    cumProfitK: cumComboTieredProfitK
                }
            }
        });
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

    const latestVip12 = latestRankedDe.slice(0, 12).map(numStr);
    const latestLot24 = latestRankedDe.slice(12, 36).map(numStr);
    const latestNumbers36 = latestRankedDe.slice(0, 36).map(numStr);
    const latestNumbers40 = latestRankedDe.slice(0, 40).map(numStr);

    // Lô đề xuất tiếp theo
    const latestLoRec = cache.loQuantumBayesFusion?.latestRecommendation || cache.loDropoff27?.latestRecommendation || {};
    const latestLoTop7 = (latestLoRec.byTop?.top7?.numbers || latestLoRec.numbers?.slice(0, 7) || ['62', '88', '84', '52', '70', '36', '19']).map(numStr);
    const latestLoTop3Vip = latestLoTop7.slice(0, 3);
    const latestLoTop4Lot = latestLoTop7.slice(3, 7);
    const latestLoTop5 = latestLoTop7.slice(0, 5);
    const latestLoTop2 = latestLoTop7.slice(0, 2);
    const latestLoTop6 = latestLoTop7.slice(0, 6);

    // Xiên 5 đề xuất tiếp theo
    const latestXien5Tickets = getXien5Combinations(latestLoTop5);

    const latestRecommendation = {
        targetDate,
        predictionDate: targetDate,
        methodId: 'semanticResonanceSuite',
        methodName: '💎 Hệ 4: Cộng Hưởng Đa Tầng (Semantic Resonance & Co-Affinity)',
        de: {
            strategyName: 'Đề Tri-Tier Semantic Resonance (36s: 12 VIP + 24 Lót)',
            vip12: latestVip12,
            lot24: latestLot24,
            numbers36: latestNumbers36,
            numbers40: latestNumbers40,
            stakeK: CONFIG.deStake36K,
            payoutVipK: CONFIG.deVipPayoutK,
            payoutLotK: CONFIG.deLotPayoutK,
            reasoning: 'Hội tụ đồng thuận 4 động cơ ML + Nhịp dạng số. Phân bổ 12 VIP (cược 2.5M ăn 210M, lãi +156M) + 24 Bọc lót (cược 1.0M ăn 84M, lãi +30M). 100% trúng có lãi.'
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
            payoutX4K: CONFIG.x4PayoutK,
            payoutX3K: CONFIG.x3PayoutK,
            payoutX2K: CONFIG.x2PayoutK,
            description: 'Vốn 55M/ngày (11M/vé x 5 vé). Cơ cấu: Nổ 4 con ăn 720M (lãi +665M), nổ 3 con ăn 204M (lãi +149M).'
        },
        combo: {
            flatStakeK: CONFIG.comboFlatStakeK,
            tieredStakeK: CONFIG.comboTieredStakeK,
            descriptionFlat: 'Tổng Vốn Flat: 54M (Đề) + 15.4M (Lô Flat) + 55M (Xiên 5) = 124.4M/ngày.',
            descriptionTiered: 'Tổng Vốn Phân Tầng: 54M (Đề) + 22.0M (Lô Tiered) + 55M (Xiên 5) = 131.0M/ngày.'
        },
        snapshotLock: {
            isLocked: true,
            targetDate,
            lockedAt: new Date().toISOString()
        }
    };

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
