/**
 * lib/services/xienFusionService.js
 * 
 * Dịch vụ Đối soát & Dự đoán Dàn Xiên Ghép Tổng Hợp (Fusion Engine):
 * Kết hợp 2 Dàn Xiên 4 Tinh Hoa từ Daily Advisor và 2 Dàn Xiên 4 từ Shadow Monitor (Penta Consensus)
 * theo thuật toán ghép chéo:
 *   - Dàn 1 Daily (D1) ghép Dàn 1 Shadow (S1) -> Dàn Ghép 1A & Dàn Ghép 1B
 *   - Dàn 2 Daily (D2) ghép Dàn 2 Shadow (S2) -> Dàn Ghép 2A & Dàn Ghép 2B
 * 
 * Quy tắc ghép dàn:
 *   - Lấy 2 số đầu của Daily ghép với 2 số đầu của Shadow.
 *   - Nếu trùng lặp thì lấy số kế bên của Shadow (và tiếp tục) để đảm bảo dàn luôn đủ 4 số phân biệt.
 *   - Các số còn lại của Daily và Shadow ghép với nhau thành dàn thứ 2 (đảm bảo đủ 4 số phân biệt).
 * 
 * Thể thức cược Quây 11 vé / dàn (Vốn 11M = 11.000K):
 *   - Trúng 4/4: Ăn 384M (Lãi +373M)
 *   - Trúng 3/4: Ăn 84M (Lãi +73M)
 *   - Trúng 2/4: Ăn 12M (Lãi +1M)
 *   - Trúng < 2: Ăn 0M (Lỗ -11M)
 * 
 * So sánh thực chiến 3 phương án:
 *   1. Daily cũ: 2 dàn (Vốn 22M/ngày)
 *   2. Shadow cũ: 2 dàn (Vốn 22M/ngày)
 *   3. 4 Dàn Ghép Mới (Fusion): 4 dàn (Vốn 44M/ngày)
 *   + Dàn Xiên 2 Tổng Hợp: Trích xuất toàn bộ các cặp Xiên 2 độc nhất.
 */

const fs = require('fs');
const path = require('path');
const { loadRegistrySync } = require('./dailyLockedBetsRegistryService');
const { computePentaConsensusForDate } = require('./pentaConsensusService');
const { pairTop8WithParity } = require('./top8ParityXien4Service');

const PAYOUT_MAP = {
    0: 0,
    1: 0,
    2: 12000,
    3: 84000,
    4: 384000
};

const STAKE_PER_DAN_K = 11000;
const DAILY_STAKE_K = 22000; // 2 dàn = 22M
const SHADOW_STAKE_K = 22000; // 2 dàn = 22M
const FUSION_STAKE_K = 44000; // 4 dàn = 44M

/**
 * Ghép 1 cặp dàn 4 số (Daily d và Shadow s) thành 2 dàn 4 số mới (danA và danB)
 * Đảm bảo mỗi dàn có đúng 4 số phân biệt duy nhất.
 */
function fusePair(d = [], s = []) {
    const dNorm = (d || []).map(x => String(x).padStart(2, '0'));
    const sNorm = (s || []).map(x => String(x).padStart(2, '0'));

    const danA = [];
    const usedD = new Set();
    const usedS = new Set();

    // 1. Lấy 2 số đầu của Daily
    for (let i = 0; i < dNorm.length && danA.length < 2; i++) {
        if (!danA.includes(dNorm[i])) {
            danA.push(dNorm[i]);
            usedD.add(i);
        }
    }

    // 2. Lấy 2 số đầu của Shadow (nếu trùng lặp thì lấy số kế bên)
    for (let i = 0; i < sNorm.length && danA.length < 4; i++) {
        if (!danA.includes(sNorm[i])) {
            danA.push(sNorm[i]);
            usedS.add(i);
        }
    }

    // Fallback: nếu Shadow trùng nhiều, lấy tiếp từ Daily
    if (danA.length < 4) {
        for (let i = 0; i < dNorm.length && danA.length < 4; i++) {
            if (!danA.includes(dNorm[i])) {
                danA.push(dNorm[i]);
                usedD.add(i);
            }
        }
    }

    // 3. Dàn B: Các số còn lại của Daily và Shadow ghép lại với nhau
    const danB = [];
    for (let i = 0; i < dNorm.length; i++) {
        if (!usedD.has(i) && !danB.includes(dNorm[i])) {
            danB.push(dNorm[i]);
        }
    }
    for (let i = 0; i < sNorm.length; i++) {
        if (!usedS.has(i) && !danB.includes(sNorm[i])) {
            danB.push(sNorm[i]);
        }
    }

    // Fallback: nếu danB chưa đủ 4 số (do trùng chéo), lấy bổ sung từ tập hợp pool
    if (danB.length < 4) {
        const pool = [...dNorm, ...sNorm];
        for (const num of pool) {
            if (!danB.includes(num)) {
                danB.push(num);
                if (danB.length === 4) break;
            }
        }
    }

    return {
        danA: danA.slice(0, 4),
        danB: danB.slice(0, 4)
    };
}

/**
 * Ghép toàn bộ 2 dàn Daily và 2 dàn Shadow thành 4 dàn Ghép Mới
 */
function fuseXien4(dailyX4, shadowX4) {
    if (!dailyX4 || !shadowX4 || !dailyX4.dan1 || !shadowX4.dan1) {
        return null;
    }

    const pair1 = fusePair(dailyX4.dan1, shadowX4.dan1);
    const pair2 = fusePair(dailyX4.dan2, shadowX4.dan2);

    const dans = [
        { id: '1A', name: 'Dàn Ghép 1A (Daily D1 đầu + Shadow S1)', numbers: pair1.danA },
        { id: '1B', name: 'Dàn Ghép 1B (D1 + S1 các số còn lại)', numbers: pair1.danB },
        { id: '2A', name: 'Dàn Ghép 2A (Daily D2 đầu + Shadow S2)', numbers: pair2.danA },
        { id: '2B', name: 'Dàn Ghép 2B (D2 + S2 các số còn lại)', numbers: pair2.danB }
    ];

    return {
        pair1,
        pair2,
        dan1A: pair1.danA,
        dan1B: pair1.danB,
        dan2A: pair2.danA,
        dan2B: pair2.danB,
        dans
    };
}

/**
 * Đánh giá kết quả của 1 dàn 4 số dựa trên 27 giải thực tế
 */
function evalSingleDan(dan = [], actSet = new Set()) {
    const hitsList = (dan || []).filter(n => actSet.has(String(n).padStart(2, '0')));
    const count = hitsList.length;
    const payoutK = PAYOUT_MAP[count] || 0;
    const profitK = payoutK - STAKE_PER_DAN_K;
    return {
        dan,
        hits: count,
        hitNums: hitsList,
        payoutK,
        stakeK: STAKE_PER_DAN_K,
        profitK,
        isWin: profitK > 0,
        isBreakEven: profitK === 0
    };
}

/**
 * Trích xuất danh sách tất cả các cặp Xiên 2 từ 1 dàn hoặc nhiều dàn 4 số
 */
function extractXien2Pairs(dans = []) {
    const pairMap = new Map();

    dans.forEach((danObj, danIdx) => {
        const nums = danObj.numbers || danObj;
        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                const a = String(nums[i]).padStart(2, '0');
                const b = String(nums[j]).padStart(2, '0');
                const sorted = [a, b].sort((x, y) => Number(x) - Number(y));
                const key = `${sorted[0]}-${sorted[1]}`;

                if (!pairMap.has(key)) {
                    pairMap.set(key, {
                        pair: sorted,
                        key,
                        sources: []
                    });
                }
                pairMap.get(key).sources.push(danObj.id || `Dàn ${danIdx + 1}`);
            }
        }
    });

    return Array.from(pairMap.values());
}

/**
 * Nạp dữ liệu 27 giải XSMB từ file compact
 */
function loadPrizes27Map() {
    const prizesMap = {};
    const compactPath = path.join(process.cwd(), 'data', 'xsmb-2-digits-compact.json');
    if (fs.existsSync(compactPath)) {
        try {
            const raw = JSON.parse(fs.readFileSync(compactPath, 'utf-8'));
            if (Array.isArray(raw.data)) {
                raw.data.forEach(row => {
                    if (row[0] && Array.isArray(row[1])) {
                        prizesMap[row[0]] = row[1].map(x => String(x).padStart(2, '0'));
                    }
                });
            }
        } catch (e) {
            console.error('[XienFusion] Error parsing compact prizes:', e.message);
        }
    }
    return prizesMap;
}

/**
 * Nạp cached_daily_method_advisor.json
 */
function loadCachedAdvisor() {
    const advPath = path.join(process.cwd(), 'data', 'cached_daily_method_advisor.json');
    if (fs.existsSync(advPath)) {
        try {
            return JSON.parse(fs.readFileSync(advPath, 'utf-8'));
        } catch (e) {
            console.error('[XienFusion] Error parsing cached advisor:', e.message);
        }
    }
    return null;
}

let cachedFusionPayload = null;
let lastFusionCacheTime = 0;
const FUSION_CACHE_TTL_MS = 60 * 1000; // 60s

/**
 * Hàm chính: Tính toán toàn bộ dữ liệu đối soát lịch sử và dự đoán ngày mới nhất
 */
function getXienFusionReport(options = {}) {
    const now = Date.now();
    if (!options.forceRefresh && cachedFusionPayload && (now - lastFusionCacheTime < FUSION_CACHE_TTL_MS)) {
        return cachedFusionPayload;
    }

    const reg = loadRegistrySync();
    const dates = Object.keys(reg.dates || {}).sort();
    const prizesMap = loadPrizes27Map();
    const cachedAdv = loadCachedAdvisor();

    // Khởi tạo các biến thống kê lũy kế Head-to-Head
    const dailySummary = {
        name: 'Daily Advisor (2 Dàn Cũ)',
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        wins: 0,
        days: 0,
        h4: 0,
        h3: 0,
        h2: 0,
        roi: 0,
        winRate: 0
    };

    const shadowSummary = {
        name: 'Shadow Monitor (2 Dàn Cũ)',
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        wins: 0,
        days: 0,
        h4: 0,
        h3: 0,
        h2: 0,
        roi: 0,
        winRate: 0
    };

    const fusionSummary = {
        name: '4 Dàn Ghép Mới (Fusion Engine)',
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        wins: 0,
        days: 0,
        h4: 0,
        h3: 0,
        h2: 0,
        roi: 0,
        winRate: 0
    };

    const history = [];

    // Duyệt qua tất cả các ngày trong Registry
    dates.forEach(date => {
        const entry = reg.dates[date];
        const p27 = prizesMap[date] || (entry.settlement?.prizes27 ? entry.settlement.prizes27.map(x => String(x).padStart(2, '0')) : null);
        const isSettled = Boolean(p27 && p27.length === 27);

        // 1. Trích xuất Daily Xiên 4
        const dailyX4 = entry.bets?.top8ParityXien4;

        // 2. Trích xuất Shadow Xiên 4
        let shadowX4 = entry.bets?.pentaConsensus?.xien4;
        if (!shadowX4 && entry.bets?.pentaConsensus?.lo?.numbers) {
            const top8 = entry.bets.pentaConsensus.lo.numbers.slice(0, 8);
            const paired = pairTop8WithParity(top8);
            shadowX4 = { dan1: paired.dan1, dan2: paired.dan2, top8 };
        }
        if (!shadowX4 && cachedAdv) {
            const penta = computePentaConsensusForDate(date, cachedAdv);
            if (penta?.xien4) shadowX4 = penta.xien4;
        }

        if (!dailyX4 || !shadowX4 || !dailyX4.dan1 || !shadowX4.dan1) {
            return;
        }

        // 3. Thực hiện ghép 4 dàn
        const fused = fuseXien4(dailyX4, shadowX4);
        if (!fused) return;

        // 4. Nếu đã có kết quả 27 giải -> ĐỐI SOÁT
        if (isSettled) {
            const actSet = new Set(p27);

            // Daily Evaluation (2 dàn)
            const d1 = evalSingleDan(dailyX4.dan1, actSet);
            const d2 = evalSingleDan(dailyX4.dan2, actSet);
            const dPayout = d1.payoutK + d2.payoutK;
            const dProfit = dPayout - DAILY_STAKE_K;
            const dIsWin = dProfit > 0;

            dailySummary.days++;
            dailySummary.stakeK += DAILY_STAKE_K;
            dailySummary.payoutK += dPayout;
            dailySummary.profitK += dProfit;
            if (dIsWin) dailySummary.wins++;
            if (d1.hits === 4) dailySummary.h4++;
            if (d2.hits === 4) dailySummary.h4++;
            if (d1.hits === 3) dailySummary.h3++;
            if (d2.hits === 3) dailySummary.h3++;
            if (d1.hits === 2) dailySummary.h2++;
            if (d2.hits === 2) dailySummary.h2++;

            // Shadow Evaluation (2 dàn)
            const s1 = evalSingleDan(shadowX4.dan1, actSet);
            const s2 = evalSingleDan(shadowX4.dan2, actSet);
            const sPayout = s1.payoutK + s2.payoutK;
            const sProfit = sPayout - SHADOW_STAKE_K;
            const sIsWin = sProfit > 0;

            shadowSummary.days++;
            shadowSummary.stakeK += SHADOW_STAKE_K;
            shadowSummary.payoutK += sPayout;
            shadowSummary.profitK += sProfit;
            if (sIsWin) shadowSummary.wins++;
            if (s1.hits === 4) shadowSummary.h4++;
            if (s2.hits === 4) shadowSummary.h4++;
            if (s1.hits === 3) shadowSummary.h3++;
            if (s2.hits === 3) shadowSummary.h3++;
            if (s1.hits === 2) shadowSummary.h2++;
            if (s2.hits === 2) shadowSummary.h2++;

            // Fusion Evaluation (4 dàn)
            const e1A = evalSingleDan(fused.dan1A, actSet);
            const e1B = evalSingleDan(fused.dan1B, actSet);
            const e2A = evalSingleDan(fused.dan2A, actSet);
            const e2B = evalSingleDan(fused.dan2B, actSet);
            const fPayout = e1A.payoutK + e1B.payoutK + e2A.payoutK + e2B.payoutK;
            const fProfit = fPayout - FUSION_STAKE_K;
            const fIsWin = fProfit > 0;

            fusionSummary.days++;
            fusionSummary.stakeK += FUSION_STAKE_K;
            fusionSummary.payoutK += fPayout;
            fusionSummary.profitK += fProfit;
            if (fIsWin) fusionSummary.wins++;
            [e1A, e1B, e2A, e2B].forEach(e => {
                if (e.hits === 4) fusionSummary.h4++;
                if (e.hits === 3) fusionSummary.h3++;
                if (e.hits === 2) fusionSummary.h2++;
            });

            // Trích xuất các cặp Xiên 2 của Fusion
            const xien2Pairs = extractXien2Pairs(fused.dans);
            const settledPairs = xien2Pairs.map(p => {
                const hitA = actSet.has(p.pair[0]);
                const hitB = actSet.has(p.pair[1]);
                return {
                    ...p,
                    hitA,
                    hitB,
                    isHit: hitA && hitB
                };
            });
            const winningPairsCount = settledPairs.filter(p => p.isHit).length;

            history.push({
                date,
                isSettled: true,
                prizes27: p27,
                special: p27[0] || null,
                daily: {
                    dan1: d1,
                    dan2: d2,
                    stakeK: DAILY_STAKE_K,
                    payoutK: dPayout,
                    profitK: dProfit,
                    isWin: dIsWin,
                    cumProfitK: dailySummary.profitK
                },
                shadow: {
                    dan1: s1,
                    dan2: s2,
                    stakeK: SHADOW_STAKE_K,
                    payoutK: sPayout,
                    profitK: sProfit,
                    isWin: sIsWin,
                    cumProfitK: shadowSummary.profitK
                },
                fusion: {
                    dans: [
                        { ...e1A, id: '1A', name: 'Dàn 1A' },
                        { ...e1B, id: '1B', name: 'Dàn 1B' },
                        { ...e2A, id: '2A', name: 'Dàn 2A' },
                        { ...e2B, id: '2B', name: 'Dàn 2B' }
                    ],
                    stakeK: FUSION_STAKE_K,
                    payoutK: fPayout,
                    profitK: fProfit,
                    isWin: fIsWin,
                    cumProfitK: fusionSummary.profitK,
                    xien2Pairs: settledPairs,
                    winningPairsCount,
                    totalPairsCount: settledPairs.length
                }
            });
        }
    });

    // Tính toán ROI và Win Rate cho các bộ tóm tắt
    if (dailySummary.days > 0) {
        dailySummary.roi = Number((dailySummary.profitK / dailySummary.stakeK * 100).toFixed(1));
        dailySummary.winRate = Number((dailySummary.wins / dailySummary.days * 100).toFixed(1));
    }
    if (shadowSummary.days > 0) {
        shadowSummary.roi = Number((shadowSummary.profitK / shadowSummary.stakeK * 100).toFixed(1));
        shadowSummary.winRate = Number((shadowSummary.wins / shadowSummary.days * 100).toFixed(1));
    }
    if (fusionSummary.days > 0) {
        fusionSummary.roi = Number((fusionSummary.profitK / fusionSummary.stakeK * 100).toFixed(1));
        fusionSummary.winRate = Number((fusionSummary.wins / fusionSummary.days * 100).toFixed(1));
    }

    // 5. Xác định Dự Đoán Ngày Mới Nhất (Pending Prediction)
    let todayPending = null;

    // Kiểm tra xem có ngày chưa kết toán trong registry không
    const unsettledDate = dates.find(d => {
        const p27 = prizesMap[d];
        return !p27 || p27.length !== 27;
    });

    let pendingTargetDate = unsettledDate || cachedAdv?.pendingPredictionDate || cachedAdv?.latestRecommendation?.targetDate;
    let pendingDailyX4 = null;
    let pendingShadowX4 = null;

    if (unsettledDate && reg.dates[unsettledDate]?.bets) {
        pendingDailyX4 = reg.dates[unsettledDate].bets.top8ParityXien4;
        pendingShadowX4 = reg.dates[unsettledDate].bets.pentaConsensus?.xien4;
        if (!pendingShadowX4 && cachedAdv) {
            const p = computePentaConsensusForDate(unsettledDate, cachedAdv);
            if (p?.xien4) pendingShadowX4 = p.xien4;
        }
    } else if (cachedAdv) {
        pendingTargetDate = cachedAdv.pendingPredictionDate || cachedAdv.top8ParityXien4?.latestRecommendation?.targetDate;
        if (cachedAdv.top8ParityXien4?.latestRecommendation) {
            pendingDailyX4 = cachedAdv.top8ParityXien4.latestRecommendation;
        }
        const p = computePentaConsensusForDate(pendingTargetDate, cachedAdv);
        if (p?.xien4) pendingShadowX4 = p.xien4;
    }

    if (pendingDailyX4 && pendingShadowX4 && pendingDailyX4.dan1 && pendingShadowX4.dan1) {
        const pendingFused = fuseXien4(pendingDailyX4, pendingShadowX4);
        const pendingPairs = extractXien2Pairs(pendingFused.dans);

        // Chuỗi văn bản copy nhanh 1-click
        const copyTextFusion = [
            `⚡ 4 DÀN XIÊN 4 GHÉP TỔNG HỢP (FUSION) NGÀY ${pendingTargetDate}:`,
            `Dàn 1A: ${pendingFused.dan1A.join(', ')} (Quây 11 vé · 11M)`,
            `Dàn 1B: ${pendingFused.dan1B.join(', ')} (Quây 11 vé · 11M)`,
            `Dàn 2A: ${pendingFused.dan2A.join(', ')} (Quây 11 vé · 11M)`,
            `Dàn 2B: ${pendingFused.dan2B.join(', ')} (Quây 11 vé · 11M)`,
            `Tổng vốn 4 dàn: 44M. Trúng X4: Ăn 384M · X3: Ăn 84M · X2: Ăn 12M`
        ].join('\n');

        const copyTextPairs = [
            `🎲 TỔNG HỢP ${pendingPairs.length} CẶP XIÊN 2 (FUSION) NGÀY ${pendingTargetDate}:`,
            pendingPairs.map(p => p.pair.join('-')).join(' ; ')
        ].join('\n');

        todayPending = {
            targetDate: pendingTargetDate,
            isPending: true,
            daily: {
                dan1: pendingDailyX4.dan1,
                dan2: pendingDailyX4.dan2,
                top8: pendingDailyX4.top8,
                stakeK: DAILY_STAKE_K
            },
            shadow: {
                dan1: pendingShadowX4.dan1,
                dan2: pendingShadowX4.dan2,
                top8: pendingShadowX4.top8,
                stakeK: SHADOW_STAKE_K
            },
            fusion: {
                dans: pendingFused.dans,
                dan1A: pendingFused.dan1A,
                dan1B: pendingFused.dan1B,
                dan2A: pendingFused.dan2A,
                dan2B: pendingFused.dan2B,
                stakeK: FUSION_STAKE_K,
                xien2Pairs: pendingPairs,
                totalPairsCount: pendingPairs.length,
                copyTextFusion,
                copyTextPairs
            }
        };
    }

    // Sắp xếp lịch sử theo thứ tự mới nhất lên trước
    const sortedHistory = [...history].sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const result = {
        success: true,
        summary: {
            daily: dailySummary,
            shadow: shadowSummary,
            fusion: fusionSummary,
            totalDays: dailySummary.days,
            payoutRules: {
                stakePerDanK: STAKE_PER_DAN_K,
                payoutMap: PAYOUT_MAP
            }
        },
        todayPending,
        history: sortedHistory
    };

    cachedFusionPayload = result;
    lastFusionCacheTime = now;
    return result;
}

function clearFusionCache() {
    cachedFusionPayload = null;
    lastFusionCacheTime = 0;
}

module.exports = {
    PAYOUT_MAP,
    STAKE_PER_DAN_K,
    DAILY_STAKE_K,
    SHADOW_STAKE_K,
    FUSION_STAKE_K,
    fusePair,
    fuseXien4,
    evalSingleDan,
    extractXien2Pairs,
    getXienFusionReport,
    clearFusionCache
};
