'use strict';

/**
 * lib/services/dailyLockedBetsRegistryService.js
 * ==============================================================================
 * SINGLE SOURCE OF TRUTH (SSOT) REGISTRY CHO DÀN ĐÁNH & ĐỐI SOÁT TRỰC TIẾP
 * ==============================================================================
 * Nguyên tắc thiết kế:
 * 1. Lưu lại dàn đánh ở 1 nơi duy nhất (Registry file trên đĩa & trong cache).
 * 2. Sau khi có kết quả thực tế (sau 18:15): So sánh + tính toán đối chiếu thuần túy
 *    (pure number comparison) theo đúng dàn đánh đã lưu với kết quả thực tế.
 * 3. Tuyệt đối KHÔNG sinh lại dự đoán của ngày đã có kết quả (Zero Re-computation).
 * 4. CHỈ sinh dự đoán cho ngày tiếp theo (T+1), đảm bảo dữ liệu thực tế không bị
 *    chồng chéo và triệt tiêu hoàn toàn sai số.
 */

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH_STATS = path.join(process.cwd(), 'lib', 'data', 'statistics', 'daily_locked_bets_registry.json');
const REGISTRY_PATH_DATA = path.join(process.cwd(), 'data', 'daily_locked_bets_registry.json');

const numStr = n => String(Number(n)).padStart(2, '0');

function normalizeDate(val) {
    return String(val || '').slice(0, 10);
}

function extractPrizes27(rawRow) {
    if (!rawRow) return [];
    if (Array.isArray(rawRow.actual27) && rawRow.actual27.length > 0) {
        return rawRow.actual27.map(numStr);
    }
    if (Array.isArray(rawRow.actualPrizes) && rawRow.actualPrizes.length > 0) {
        return rawRow.actualPrizes.map(numStr);
    }
    const prizeKeys = [
        'special', 'prize1',
        'prize2_1', 'prize2_2',
        'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
        'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
        'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
        'prize6_1', 'prize6_2', 'prize6_3',
        'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
    ];
    const list = [];
    prizeKeys.forEach(k => {
        if (rawRow[k] != null && rawRow[k] !== '') {
            list.push(numStr(rawRow[k]));
        }
    });
    return list;
}

function loadRegistry() {
    let data = null;
    if (fs.existsSync(REGISTRY_PATH_STATS)) {
        try {
            data = JSON.parse(fs.readFileSync(REGISTRY_PATH_STATS, 'utf8'));
        } catch (_) {}
    }
    if (!data && fs.existsSync(REGISTRY_PATH_DATA)) {
        try {
            data = JSON.parse(fs.readFileSync(REGISTRY_PATH_DATA, 'utf8'));
        } catch (_) {}
    }
    if (!data || typeof data !== 'object') {
        data = {
            version: '1.0.0',
            description: 'Single Source of Truth (SSOT) Immutable Daily Bets and Settlement Registry',
            updatedAt: new Date().toISOString(),
            dates: {}
        };
    }
    if (!data.dates) data.dates = {};
    return data;
}

function saveRegistry(registry) {
    if (!registry || typeof registry !== 'object') return false;
    registry.updatedAt = new Date().toISOString();
    const jsonStr = JSON.stringify(registry, null, 2);

    try {
        const dir1 = path.dirname(REGISTRY_PATH_STATS);
        if (!fs.existsSync(dir1)) fs.mkdirSync(dir1, { recursive: true });
        fs.writeFileSync(REGISTRY_PATH_STATS, jsonStr, 'utf8');
    } catch (e) {
        console.error('[Registry] Error writing to stats path:', e.message);
    }

    try {
        const dir2 = path.dirname(REGISTRY_PATH_DATA);
        if (!fs.existsSync(dir2)) fs.mkdirSync(dir2, { recursive: true });
        fs.writeFileSync(REGISTRY_PATH_DATA, jsonStr, 'utf8');
    } catch (e) {
        console.error('[Registry] Error writing to data path:', e.message);
    }

    return true;
}

function getLockedBetForDate(targetDate, methodId = null) {
    const d = normalizeDate(targetDate);
    const reg = loadRegistry();
    const entry = reg.dates[d];
    if (!entry || !entry.bets) return null;
    if (methodId) {
        return entry.bets[methodId] || null;
    }
    return entry.bets;
}

function registerDailyBet(targetDate, methodId, betData) {
    const d = normalizeDate(targetDate);
    if (!d || !methodId || !betData) return false;
    const reg = loadRegistry();
    if (!reg.dates[d]) {
        reg.dates[d] = {
            targetDate: d,
            isSettled: false,
            registeredAt: new Date().toISOString(),
            bets: {},
            settlement: {}
        };
    }
    // Không ghi đè nếu ngày này đã được kết toán (Bảo vệ tính bất biến)
    if (reg.dates[d].isSettled && reg.dates[d].bets[methodId]) {
        return false;
    }
    reg.dates[d].bets[methodId] = JSON.parse(JSON.stringify(betData));
    saveRegistry(reg);
    return true;
}

/**
 * Đối soát trực tiếp và tối giản nhất khi đã có kết quả thực tế
 * Không bao giờ re-simulate, chỉ so sánh thuần túy dàn số cược với kết quả quay.
 */
function settleDateDirectly(targetDate, rawDrawRow) {
    const d = normalizeDate(targetDate);
    if (!d || !rawDrawRow) return null;

    const actualSpecial = rawDrawRow.special != null ? numStr(rawDrawRow.special) : null;
    const actualPrizes = extractPrizes27(rawDrawRow);
    if (!actualSpecial || actualPrizes.length < 27) return null;

    const hitsMap = {};
    actualPrizes.forEach(p => {
        hitsMap[p] = (hitsMap[p] || 0) + 1;
    });

    const reg = loadRegistry();
    if (!reg.dates[d]) {
        reg.dates[d] = {
            targetDate: d,
            isSettled: false,
            registeredAt: new Date().toISOString(),
            bets: {},
            settlement: {}
        };
    }

    const entry = reg.dates[d];
    const bets = entry.bets || {};
    const settlement = entry.settlement || {};

    // 1. Đối soát Lô Ghép 4 Động Cơ (lo4EngineFusion)
    if (bets.lo4EngineFusion) {
        const bet = bets.lo4EngineFusion;
        const x5List = (bet.tierX5 || []).map(numStr);
        const x4List = (bet.tierX4 || []).map(numStr);
        const x3List = (bet.tierX3 || []).map(numStr);
        const x1List = (bet.tierX1 || []).map(numStr);

        let x5Hits = 0, x4Hits = 0, x3Hits = 0, x1Hits = 0;
        x5List.forEach(n => { x5Hits += (hitsMap[n] || 0); });
        x4List.forEach(n => { x4Hits += (hitsMap[n] || 0); });
        x3List.forEach(n => { x3Hits += (hitsMap[n] || 0); });
        x1List.forEach(n => { x1Hits += (hitsMap[n] || 0); });

        const stakeK = (x5List.length * 5 * 2200) + (x4List.length * 4 * 2200) + (x3List.length * 3 * 2200) + (x1List.length * 1 * 2200);
        const payoutK = (x5Hits * 5 * 8000) + (x4Hits * 4 * 8000) + (x3Hits * 3 * 8000) + (x1Hits * 1 * 8000);
        const profitK = payoutK - stakeK;
        const totalHits = x5Hits + x4Hits + x3Hits + x1Hits;

        // Xiên 4 Bộ 4 Quây
        const xienTop4 = (bet.xien4?.top4 || bet.xien4?.numbers || []).slice(0, 4).map(numStr);
        let xienHitsCount = 0;
        xienTop4.forEach(n => { if ((hitsMap[n] || 0) > 0) xienHitsCount++; });
        let xienPayoutK = 0;
        const xienStakeK = 11000;
        if (xienHitsCount === 4) {
            xienPayoutK = 384000;
        } else if (xienHitsCount === 3) {
            xienPayoutK = 84000 + 3 * 12000; // 1 vé Xiên 3 (84M) + 3 vé Xiên 2 (36M) = 120M
        } else if (xienHitsCount === 2) {
            xienPayoutK = 12000; // 1 vé Xiên 2
        }
        const xienProfitK = xienPayoutK - xienStakeK;

        settlement.lo4EngineFusion = {
            date: d,
            tierX5: x5List,
            tierX4: x4List,
            tierX3: x3List,
            tierX1: x1List,
            x5Hits, x4Hits, x3Hits, x1Hits,
            totalHits,
            lotoStakeK: stakeK,
            lotoPayoutK: payoutK,
            lotoProfitK: profitK,
            xienTop4,
            xienHitsCount,
            xienStakeK,
            xienPayoutK,
            xienProfitK,
            totalStakeK: stakeK + xienStakeK,
            totalPayoutK: payoutK + xienPayoutK,
            totalProfitK: profitK + xienProfitK,
            isWin: (profitK + xienProfitK) > 0
        };
    }

    // 2. Đối soát Đề Đa Động Cơ Dropoff (deDropoffMerge)
    if (bets.deDropoffMerge) {
        const bet = bets.deDropoffMerge;
        const top40 = (bet.top40 || bet.numbers || []).map(numStr);
        const top36 = (bet.top36 || top40.slice(0, 36)).map(numStr);
        const isHit40 = top40.includes(actualSpecial);
        const isHit36 = top36.includes(actualSpecial);

        settlement.deDropoffMerge = {
            date: d,
            actualSpecial,
            top40,
            top36,
            isHit40,
            isHit36,
            stake40K: 40000,
            payout40K: isHit40 ? 84000 : 0,
            profit40K: isHit40 ? 44000 : -40000,
            stake36K: 36000,
            payout36K: isHit36 ? 84000 : 0,
            profit36K: isHit36 ? 48000 : -36000
        };
    }

    // 3. Đối soát Lô Dropoff 27 / QMBF v6 (loDropoff27)
    if (bets.loDropoff27) {
        const bet = bets.loDropoff27;
        const top7 = (bet.top7 || bet.numbers || []).slice(0, 7).map(numStr);
        const top6 = (bet.top6 || top7.slice(0, 6)).map(numStr);
        const top2 = (bet.top2 || top7.slice(0, 2)).map(numStr);

        let hits7 = 0, hits6 = 0, hits2 = 0;
        top7.forEach(n => { hits7 += (hitsMap[n] || 0); });
        top6.forEach(n => { hits6 += (hitsMap[n] || 0); });
        top2.forEach(n => { hits2 += (hitsMap[n] || 0); });

        const flatStake7K = 15400;
        const flatPayout7K = hits7 * 8000;
        const flatProfit7K = flatPayout7K - flatStake7K;

        const tierTop3Vip = top7.slice(0, 3);
        const tierTop4Lot = top7.slice(3, 7);
        let vipHits = 0, lotHits = 0;
        tierTop3Vip.forEach(n => { vipHits += (hitsMap[n] || 0); });
        tierTop4Lot.forEach(n => { lotHits += (hitsMap[n] || 0); });
        const tierStakeK = 22000;
        const tierPayoutK = Math.round((vipHits * 4.4 * 8000 / 2.2) + (lotHits * 2.2 * 8000 / 2.2)); // VIP cược 4.4M ăn 16M
        const tierProfitK = tierPayoutK - tierStakeK;

        settlement.loDropoff27 = {
            date: d,
            top7, top6, top2,
            hits7, hits6, hits2,
            flatStake7K,
            flatPayout7K,
            flatProfit7K,
            tierStakeK,
            tierPayoutK,
            tierProfitK,
            isFlatWin: flatProfit7K > 0,
            isTierWin: tierProfitK > 0
        };
    }

    // 4. Đối soát Đề Tri-Core 24s (triCoreDe)
    if (bets.triCoreDe) {
        const bet = bets.triCoreDe;
        const isAbstain = Boolean(bet.action === 'ABSTAIN' || bet.abstained);
        const numbers = (bet.numbers || []).map(numStr);
        const hit = !isAbstain && numbers.includes(actualSpecial);
        const stakeK = isAbstain ? 0 : 24000;
        const payoutK = hit ? 84000 : 0;
        const profitK = payoutK - stakeK;

        settlement.triCoreDe = {
            date: d,
            action: isAbstain ? 'ABSTAIN' : 'BET',
            actualSpecial,
            numbers,
            hit: isAbstain ? null : hit,
            stakeK,
            payoutK,
            profitK,
            isWin: profitK > 0
        };
    }

    // 5. Đối soát Hệ 4 Cộng Hưởng Đa Tầng (semanticResonanceSuite)
    if (bets.semanticResonanceSuite) {
        const bet = bets.semanticResonanceSuite;
        const deVip12 = (bet.de?.vip12 || []).map(numStr);
        const deLot24 = (bet.de?.lot24 || []).map(numStr);
        let deHitType = 'MISS';
        let dePayoutK = 0;
        const deStakeK = 54000;
        if (deVip12.includes(actualSpecial)) {
            deHitType = 'VIP';
            dePayoutK = 210000; // Ăn 210M, lãi +156M
        } else if (deLot24.includes(actualSpecial)) {
            deHitType = 'LOT';
            dePayoutK = 84000;  // Ăn 84M, lãi +30M
        }
        const deProfitK = dePayoutK - deStakeK;

        const loTop7 = (bet.lo?.top7 || []).map(numStr);
        let loHits = 0;
        loTop7.forEach(n => { loHits += (hitsMap[n] || 0); });
        const loFlatStakeK = 15400;
        const loFlatPayoutK = loHits * 8000;
        const loFlatProfitK = loFlatPayoutK - loFlatStakeK;

        const xien5Top5 = (bet.xien5?.top5 || loTop7.slice(0, 5)).map(numStr);
        let xien5Count = 0;
        xien5Top5.forEach(n => { if ((hitsMap[n] || 0) > 0) xien5Count++; });
        let xien5PayoutK = 0;
        const xien5StakeK = 55000;
        if (xien5Count === 5) {
            xien5PayoutK = 5 * 384000;
        } else if (xien5Count === 4) {
            xien5PayoutK = 384000 + 4 * 84000; // 1 vé X4 + 4 vé X3
        } else if (xien5Count === 3) {
            xien5PayoutK = 84000 + 3 * 12000;  // 1 vé X3 + 3 vé X2
        } else if (xien5Count === 2) {
            xien5PayoutK = 12000;
        }
        const xien5ProfitK = xien5PayoutK - xien5StakeK;

        settlement.semanticResonanceSuite = {
            date: d,
            actualSpecial,
            de: {
                vip12: deVip12,
                lot24: deLot24,
                hitType: deHitType,
                stakeK: deStakeK,
                payoutK: dePayoutK,
                profitK: deProfitK,
                isWin: deProfitK > 0
            },
            lo: {
                top7: loTop7,
                hits: loHits,
                flatStakeK: loFlatStakeK,
                flatPayoutK: loFlatPayoutK,
                flatProfitK: loFlatProfitK,
                isWin: loFlatProfitK > 0
            },
            xien5: {
                top5: xien5Top5,
                hitsCount: xien5Count,
                stakeK: xien5StakeK,
                payoutK: xien5PayoutK,
                profitK: xien5ProfitK,
                isWin: xien5ProfitK > 0
            },
            comboFlat: {
                stakeK: deStakeK + loFlatStakeK + xien5StakeK,
                payoutK: dePayoutK + loFlatPayoutK + xien5PayoutK,
                profitK: deProfitK + loFlatProfitK + xien5ProfitK,
                isWin: (deProfitK + loFlatProfitK + xien5ProfitK) > 0
            }
        };
    }

    entry.isSettled = true;
    entry.settledAt = new Date().toISOString();
    entry.actualResult = {
        special: actualSpecial,
        prizes: actualPrizes
    };
    entry.settlement = settlement;

    saveRegistry(reg);
    return entry;
}

module.exports = {
    REGISTRY_PATH_STATS,
    REGISTRY_PATH_DATA,
    loadRegistry,
    saveRegistry,
    getLockedBetForDate,
    registerDailyBet,
    settleDateDirectly
};
