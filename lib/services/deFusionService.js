'use strict';

/**
 * lib/services/deFusionService.js
 * 
 * Chuyên trang Đề Tinh Hoa & Bộ Lọc Chẵn Lẻ (Anti-Parity Exclusion Engine):
 * 1. Dàn Đề Daily (chuẩn hóa về X2: 400K/số, X1: 200K/số)
 * 2. Dàn Đề Shadow Đa Động Cơ 40s (20s X2: 400K, 20s X1: 200K · Vốn 12M)
 * 3. Dàn Đề Tam Trụ Tri-Core 24s (12s X2: 400K, 12s X1: 200K · Vốn 7.2M)
 * 4. Dàn Đề Fusion Tinh Hoa Hợp Nhất (Giao thoa & Đồng thuận Daily + Shadow)
 * 
 * Bộ lọc loại trừ đối xứng nghịch Chẵn/Lẻ (Anti-Parity Opposite Exclusion Filter):
 *   - Dự đoán LL (Lẻ - Lẻ)       -> Loại toàn bộ số CC (Chẵn - Chẵn)
 *   - Dự đoán CC (Chẵn - Chẵn)   -> Loại toàn bộ số LL (Lẻ - Lẻ)
 *   - Dự đoán CL (Chẵn - Lẻ)     -> Loại toàn bộ số LC (Lẻ - Chẵn)
 *   - Dự đoán LC (Lẻ - Chẵn)     -> Loại toàn bộ số CL (Chẵn - Lẻ)
 *   - Các số còn lại giữ nguyên mức cược: Số thuộc X2 giữ nguyên 400K, số thuộc X1 giữ nguyên 200K.
 *   - Tiết kiệm 20% - 35% tiền vốn mỗi ngày trong khi bảo lưu tối đa số trúng!
 */

const fs = require('fs');
const path = require('path');
const { getR2Json } = require('../r2Store');

const ADVISOR_CACHE_PATH = path.join(__dirname, '../data/statistics/cached_daily_method_advisor.json');
const REGISTRY_PATH = path.join(__dirname, '../../data/daily_locked_bets_registry.json');

const UNIT_X2_K = 400; // 400K / số
const UNIT_X1_K = 200; // 200K / số
const MULTIPLIER = 84; // 1 ăn 84
const PAYOUT_X2_K = UNIT_X2_K * MULTIPLIER; // 33.6M (33,600K)
const PAYOUT_X1_K = UNIT_X1_K * MULTIPLIER; // 16.8M (16,800K)

const OPPOSITE_FORM_MAP = Object.freeze({
    'LL': 'CC',
    'CC': 'LL',
    'CL': 'LC',
    'LC': 'CL'
});

const FORM_LABELS = Object.freeze({
    'LL': 'Lẻ - Lẻ',
    'CC': 'Chẵn - Chẵn',
    'CL': 'Chẵn - Lẻ',
    'LC': 'Lẻ - Chẵn'
});

function numStr(val) {
    if (val === null || val === undefined) return '';
    return String(Number(val)).padStart(2, '0');
}

function getParityForm(val) {
    const s = numStr(val);
    if (!s || s.length < 2) return 'LL';
    const hEven = parseInt(s[0], 10) % 2 === 0;
    const tEven = parseInt(s[1], 10) % 2 === 0;
    return (hEven ? 'C' : 'L') + (tEven ? 'C' : 'L');
}

function loadAdvisorDataSync() {
    try {
        if (fs.existsSync(ADVISOR_CACHE_PATH)) {
            const raw = fs.readFileSync(ADVISOR_CACHE_PATH, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.warn('[deFusionService] Failed to read cached_daily_method_advisor.json:', e.message);
    }
    return null;
}

function loadRegistryDataSync() {
    try {
        if (fs.existsSync(REGISTRY_PATH)) {
            const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.warn('[deFusionService] Failed to read daily_locked_bets_registry.json:', e.message);
    }
    return null;
}

/**
 * Trích xuất dự đoán Chẵn/Lẻ của một ngày
 */
function extractParityPrediction(date, parityCache, selectedMethod = 'optimalHybrid') {
    if (!parityCache) return null;

    // 1. Kiểm tra ngày tương lai (latestRecommendation)
    const rec = parityCache.latestRecommendation;
    if (rec && String(rec.targetDate).slice(0, 10) === date) {
        const m = rec.methods?.[selectedMethod] || rec.methods?.optimalHybrid || {};
        const predForm = m.predForm || 'LL';
        const oppForm = OPPOSITE_FORM_MAP[predForm] || 'CC';
        return {
            targetDate: date,
            methodId: selectedMethod,
            methodName: m.name || 'Quán Quân Hợp Nhất 👑',
            predHead: m.predHead || 'LE',
            predHeadVi: m.predHeadVi || 'Đầu Lẻ',
            predTail: m.predTail || 'LE',
            predTailVi: m.predTailVi || 'Đít Lẻ',
            predForm,
            predFormVi: FORM_LABELS[predForm] || predForm,
            oppForm,
            oppFormVi: FORM_LABELS[oppForm] || oppForm,
            headConf: m.headConf || 55,
            tailConf: m.tailConf || 55,
            isPending: true
        };
    }

    // 2. Kiểm tra trong settledLedger
    const settledList = parityCache.settledLedger || [];
    const row = settledList.find(r => String(r.date).slice(0, 10) === date);
    if (row) {
        const m = row.methods?.[selectedMethod] || row.methods?.optimalHybrid || {};
        const predForm = m.predForm || 'LL';
        const oppForm = OPPOSITE_MAP(predForm);
        const actForm = row.actualForm || getParityForm(row.actualSpecial);
        const isFormHit = Boolean(m.isFormHit || actForm === predForm);
        const isAntiAvoided = actForm !== oppForm; // Không rơi vào cực nghịch

        return {
            targetDate: date,
            actualSpecial: numStr(row.actualSpecial),
            actualForm: actForm,
            actualFormVi: FORM_LABELS[actForm] || actForm,
            methodId: selectedMethod,
            methodName: m.name || 'Quán Quân Hợp Nhất 👑',
            predHead: m.predHead || 'LE',
            predHeadVi: m.predHeadVi || 'Đầu Lẻ',
            predTail: m.predTail || 'LE',
            predTailVi: m.predTailVi || 'Đít Lẻ',
            predForm,
            predFormVi: FORM_LABELS[predForm] || predForm,
            oppForm,
            oppFormVi: FORM_LABELS[oppForm] || oppForm,
            isFormHit,
            isAntiAvoided,
            isPending: false
        };
    }

    return null;
}

function OPPOSITE_MAP(predForm) {
    return OPPOSITE_FORM_MAP[predForm] || 'CC';
}

/**
 * Lọc dàn số theo quy tắc Anti-Parity (loại trừ các số có dạng đối lập)
 */
function applyAntiParityFilter(topX2 = [], botX1 = [], oppForm = 'CC') {
    const origTop = topX2.map(numStr);
    const origBot = botX1.map(numStr);

    const filteredTop = [];
    const removedTop = [];
    origTop.forEach(n => {
        if (getParityForm(n) === oppForm) removedTop.push(n);
        else filteredTop.push(n);
    });

    const filteredBot = [];
    const removedBot = [];
    origBot.forEach(n => {
        if (getParityForm(n) === oppForm) removedBot.push(n);
        else filteredBot.push(n);
    });

    const origStakeK = origTop.length * UNIT_X2_K + origBot.length * UNIT_X1_K;
    const filteredStakeK = filteredTop.length * UNIT_X2_K + filteredBot.length * UNIT_X1_K;
    const savedStakeK = origStakeK - filteredStakeK;
    const savedPct = origStakeK > 0 ? (savedStakeK / origStakeK) * 100 : 0;

    return {
        origTop,
        origBot,
        origNumbers: [...origTop, ...origBot],
        origCount: origTop.length + origBot.length,
        origStakeK,

        filteredTop,
        filteredBot,
        filteredNumbers: [...filteredTop, ...filteredBot],
        filteredCount: filteredTop.length + filteredBot.length,
        filteredStakeK,

        removedTop,
        removedBot,
        removedNumbers: [...removedTop, ...removedBot],
        removedCount: removedTop.length + removedBot.length,

        savedStakeK,
        savedPct: Number(savedPct.toFixed(1))
    };
}

/**
 * Đánh giá kết quả của dàn cược đối với giải đặc biệt thực tế
 */
function evaluateDeBet(filteredData, actualSpecialStr) {
    const actStr = numStr(actualSpecialStr);
    const hasActual = Boolean(actStr && actStr.length === 2);

    // 1. Đánh giá dàn Gốc
    let baseHitX2 = false;
    let baseHitX1 = false;
    let basePayoutK = 0;
    if (hasActual) {
        if (filteredData.origTop.includes(actStr)) {
            baseHitX2 = true;
            basePayoutK = PAYOUT_X2_K;
        } else if (filteredData.origBot.includes(actStr)) {
            baseHitX1 = true;
            basePayoutK = PAYOUT_X1_K;
        }
    }
    const isBaseHit = baseHitX2 || baseHitX1;
    const baseProfitK = hasActual ? (basePayoutK - filteredData.origStakeK) : 0;

    // 2. Đánh giá dàn Sau Lọc
    let fHitX2 = false;
    let fHitX1 = false;
    let fPayoutK = 0;
    if (hasActual) {
        if (filteredData.filteredTop.includes(actStr)) {
            fHitX2 = true;
            fPayoutK = PAYOUT_X2_K;
        } else if (filteredData.filteredBot.includes(actStr)) {
            fHitX1 = true;
            fPayoutK = PAYOUT_X1_K;
        }
    }
    const isFilteredHit = fHitX2 || fHitX1;
    const filteredProfitK = hasActual ? (fPayoutK - filteredData.filteredStakeK) : 0;

    // Kiểm tra xem số trúng có bị loại nhầm không
    const isEliminatedLoss = hasActual && isBaseHit && !isFilteredHit;

    return {
        actualStr: actStr,
        isBaseHit,
        baseHitX2,
        baseHitX1,
        basePayoutK,
        baseProfitK,

        isFilteredHit,
        fHitX2,
        fHitX1,
        fPayoutK,
        filteredProfitK,

        isEliminatedLoss
    };
}

/**
 * Tạo báo cáo tổng thể Đề Tinh Hoa & Chẵn Lẻ
 */
function buildDeFusionReport(options = {}) {
    const parityMethod = options.parityMethod || 'optimalHybrid';
    const advisorData = options.advisorData || loadAdvisorDataSync();

    if (!advisorData) {
        throw new Error('Không tìm thấy dữ liệu thống kê cố vấn (cached_daily_method_advisor.json)');
    }

    const registryData = options.registryData || advisorData.dailyLockedBetsRegistry || loadRegistryDataSync();

    const parityCache = advisorData.deParityResearch || {};
    const prizesByDate = advisorData.drawPrizesByDate || {};

    // 1. Lấy danh sách toàn bộ ngày năm 2026 đã có kết quả
    const all2026Dates = Object.keys(prizesByDate)
        .filter(d => d.startsWith('2026') && prizesByDate[d] && prizesByDate[d].special !== undefined)
        .sort();

    // Map dữ liệu nguồn của các phương pháp
    const dualLedger = advisorData.dualMerge?.settledLedger || [];
    const dualMap = {};
    dualLedger.forEach(r => { if (r?.date) dualMap[String(r.date).slice(0, 10)] = r; });

    const semLedger = advisorData.semanticResonanceSuite?.settledLedger || [];
    const semMap = {};
    semLedger.forEach(r => { if (r?.date) semMap[String(r.date).slice(0, 10)] = r; });

    const dropoffLedger = advisorData.deDropoffMerge?.settledLedger || [];
    const dropoffMap = {};
    dropoffLedger.forEach(r => { if (r?.date) dropoffMap[String(r.date).slice(0, 10)] = r; });

    const triLedger = advisorData.triCoreDe?.settledLedger || advisorData.triCoreDe?.allDaysLedger || [];
    const triMap = {};
    triLedger.forEach(r => { if (r?.date) triMap[String(r.date).slice(0, 10)] = r; });

    const pentaLedger = advisorData.pentaCoreDe?.settledLedger || [];
    const pentaMap = {};
    pentaLedger.forEach(r => { if (r?.date) pentaMap[String(r.date).slice(0, 10)] = r; });

    const registryDates = registryData?.dates || {};

    // Khởi tạo accumulator cho 4 chiến lược
    const STRATEGIES = ['daily', 'shadow', 'triCore', 'fusion'];
    const ledger = [];
    const stats = {
        daily: { baseWins: 0, baseStake: 0, basePayout: 0, fWins: 0, fStake: 0, fPayout: 0, days: 0, savedStake: 0, elimLosses: 0 },
        shadow: { baseWins: 0, baseStake: 0, basePayout: 0, fWins: 0, fStake: 0, fPayout: 0, days: 0, savedStake: 0, elimLosses: 0 },
        triCore: { baseWins: 0, baseStake: 0, basePayout: 0, fWins: 0, fStake: 0, fPayout: 0, days: 0, savedStake: 0, elimLosses: 0 },
        fusion: { baseWins: 0, baseStake: 0, basePayout: 0, fWins: 0, fStake: 0, fPayout: 0, days: 0, savedStake: 0, elimLosses: 0 }
    };

    // Chạy đối soát từng ngày trong năm 2026
    all2026Dates.forEach(date => {
        const actualSpecial = prizesByDate[date]?.special;
        const actualStr = numStr(actualSpecial);
        const actualForm = getParityForm(actualStr);

        // Lấy dự đoán Chẵn/Lẻ
        const parityPred = extractParityPrediction(date, parityCache, parityMethod);
        if (!parityPred) return;

        const oppForm = parityPred.oppForm;

        // Trích xuất dàn cho từng chiến lược
        // 1. Daily (dualMerge / registry bets.de)
        let dailyTop = [];
        let dailyBot = [];
        const regEntry = registryDates[date];
        if (regEntry?.bets?.de) {
            dailyTop = (regEntry.bets.de.vipNumbers || []).map(numStr);
            dailyBot = (regEntry.bets.de.singleNumbers || []).map(numStr);
        } else if (dualMap[date]) {
            const dRow = dualMap[date];
            dailyTop = (dRow.intersection || []).map(numStr);
            dailyBot = (dRow.uniqueSingles || []).map(numStr);
        }

        // 2. Shadow (deDropoffMerge / semRow.de.numbers40)
        let shadowTop = [];
        let shadowBot = [];
        if (regEntry?.bets?.deDropoffMerge) {
            const b = regEntry.bets.deDropoffMerge;
            shadowTop = (b.top20X2 || (b.numbers || []).slice(0, 20)).map(numStr);
            shadowBot = (b.bottom20X1 || (b.numbers || []).slice(20, 40)).map(numStr);
        } else if (dropoffMap[date]?.numbers?.length) {
            const nums = dropoffMap[date].numbers.map(numStr);
            shadowTop = nums.slice(0, 20);
            shadowBot = nums.slice(20, 40);
        } else if (semMap[date]?.de?.numbers40?.length) {
            const nums = semMap[date].de.numbers40.map(numStr);
            shadowTop = nums.slice(0, 20);
            shadowBot = nums.slice(20, 40);
        }

        // 3. TriCore 24s
        let triTop = [];
        let triBot = [];
        if (regEntry?.bets?.triCoreDe) {
            const nums = (regEntry.bets.triCoreDe.numbers || []).map(numStr);
            triTop = nums.slice(0, 12);
            triBot = nums.slice(12, 24);
        } else if (triMap[date]?.numbers?.length) {
            const nums = triMap[date].numbers.map(numStr);
            triTop = nums.slice(0, 12);
            triBot = nums.slice(12, 24);
        }

        // 4. Fusion Merge (Đồng thuận chấm điểm Daily + Shadow)
        let fusionTop = [];
        let fusionBot = [];
        if (dailyTop.length && shadowTop.length) {
            const dVipSet = new Set(dailyTop);
            const dSingleSet = new Set(dailyBot);
            const sTopSet = new Set(shadowTop);
            const sBotSet = new Set(shadowBot);
            const allCandidates = new Set([...dailyTop, ...dailyBot, ...shadowTop, ...shadowBot]);
            const scores = {};
            allCandidates.forEach(n => {
                let sc = 0;
                if (dVipSet.has(n) && sTopSet.has(n)) sc += 4.5;
                else if (dVipSet.has(n) && sBotSet.has(n)) sc += 3.0;
                else if (sTopSet.has(n) && dSingleSet.has(n)) sc += 3.0;
                else if (dVipSet.has(n)) sc += 2.0;
                else if (sTopSet.has(n)) sc += 2.0;
                else if (dSingleSet.has(n) && sBotSet.has(n)) sc += 1.8;
                else sc += 1.0;
                scores[n] = sc;
            });
            const ranked = Array.from(allCandidates).sort((a, b) => (scores[b] - scores[a]) || (Number(a) - Number(b)));
            fusionTop = ranked.slice(0, 18);
            fusionBot = ranked.slice(18, 36);
        }

        // Áp dụng bộ lọc Anti-Parity & Đánh giá kết quả cho cả 4 chiến lược
        const rowStrategies = {};

        const stratInputs = {
            daily: { top: dailyTop, bot: dailyBot },
            shadow: { top: shadowTop, bot: shadowBot },
            triCore: { top: triTop, bot: triBot },
            fusion: { top: fusionTop, bot: fusionBot }
        };

        STRATEGIES.forEach(sId => {
            const inp = stratInputs[sId];
            if (!inp.top.length && !inp.bot.length) return;

            const filtered = applyAntiParityFilter(inp.top, inp.bot, oppForm);
            const evaluation = evaluateDeBet(filtered, actualStr);

            rowStrategies[sId] = {
                ...filtered,
                ...evaluation
            };

            // Cập nhật accumulator
            const st = stats[sId];
            st.days++;
            st.baseStake += filtered.origStakeK;
            st.basePayout += evaluation.basePayoutK;
            if (evaluation.isBaseHit) st.baseWins++;

            st.fStake += filtered.filteredStakeK;
            st.fPayout += evaluation.fPayoutK;
            if (evaluation.isFilteredHit) st.fWins++;

            st.savedStake += filtered.savedStakeK;
            if (evaluation.isEliminatedLoss) st.elimLosses++;
        });

        ledger.push({
            date,
            actualSpecial: actualStr,
            actualForm,
            actualFormVi: FORM_LABELS[actualForm] || actualForm,
            parityPrediction: parityPred,
            strategies: rowStrategies
        });
    });

    // 2. Tính toán tóm tắt KPI cho từng chiến lược
    const summary = {};
    STRATEGIES.forEach(sId => {
        const st = stats[sId];
        const days = st.days || 1;
        const bProfit = (st.basePayout - st.baseStake) / 1000;
        const bRoi = st.baseStake > 0 ? (bProfit / (st.baseStake / 1000)) * 100 : 0;

        const fProfit = (st.fPayout - st.fStake) / 1000;
        const fRoi = st.fStake > 0 ? (fProfit / (st.fStake / 1000)) * 100 : 0;
        const savedM = st.savedStake / 1000;
        const savedPct = st.baseStake > 0 ? (st.savedStake / st.baseStake) * 100 : 0;

        summary[sId] = {
            strategyId: sId,
            totalDays: st.days,
            base: {
                wins: st.baseWins,
                winRate: Number((st.baseWins / days * 100).toFixed(1)),
                totalStakeM: Number((st.baseStake / 1000).toFixed(1)),
                totalPayoutM: Number((st.basePayout / 1000).toFixed(1)),
                netProfitM: Number(bProfit.toFixed(1)),
                roi: Number(bRoi.toFixed(1))
            },
            filtered: {
                wins: st.fWins,
                winRate: Number((st.fWins / days * 100).toFixed(1)),
                totalStakeM: Number((st.fStake / 1000).toFixed(1)),
                totalPayoutM: Number((st.fPayout / 1000).toFixed(1)),
                netProfitM: Number(fProfit.toFixed(1)),
                roi: Number(fRoi.toFixed(1)),
                savedStakeM: Number(savedM.toFixed(1)),
                savedPct: Number(savedPct.toFixed(1)),
                eliminatedLosses: st.elimLosses
            }
        };
    });

    // 3. Xử lý dự đoán Ngày Hôm Nay (Live Pending Prediction)
    const pendingDate = advisorData.pendingPredictionDate || advisorData.latestRecommendation?.targetDate || '2026-10-31';
    const todayParity = extractParityPrediction(pendingDate, parityCache, parityMethod);

    const todayRec = buildTodayRecommendation(advisorData, registryData, todayParity, pendingDate);

    return {
        success: true,
        generatedAt: new Date().toISOString(),
        pendingPredictionDate: pendingDate,
        latestDataDate: advisorData.latestDataDate || '2026-10-30',
        parityMethod,
        todayParity,
        summary,
        todayRecommendation: todayRec,
        settledLedger: ledger.reverse(), // Sắp xếp ngày mới nhất lên đầu
        totalEvaluatedDays: ledger.length
    };
}

/**
 * Xây dựng gói số đề xuất hôm nay cho cả 4 chiến lược
 */
function buildTodayRecommendation(advisorData, registryData, todayParity, targetDate) {
    if (!todayParity) return null;
    const oppForm = todayParity.oppForm;

    // 1. Daily hôm nay (dualMerge / registry)
    let dailyTop = [];
    let dailyBot = [];
    const regBet = registryData?.dates?.[targetDate]?.bets;
    if (regBet?.de) {
        dailyTop = (regBet.de.vipNumbers || []).map(numStr);
        dailyBot = (regBet.de.singleNumbers || []).map(numStr);
    } else if (advisorData.dualMerge?.latestRecommendation) {
        const rec = advisorData.dualMerge.latestRecommendation;
        dailyTop = (rec.intersectionX2 || []).map(numStr);
        dailyBot = (rec.uniqueSinglesX1 || []).map(numStr);
    }

    // 2. Shadow hôm nay (deDropoffMerge)
    let shadowTop = [];
    let shadowBot = [];
    if (regBet?.deDropoffMerge) {
        const b = regBet.deDropoffMerge;
        shadowTop = (b.top20X2 || (b.numbers || []).slice(0, 20)).map(numStr);
        shadowBot = (b.bottom20X1 || (b.numbers || []).slice(20, 40)).map(numStr);
    } else if (advisorData.deDropoffMerge?.latestRecommendation) {
        const rec = advisorData.deDropoffMerge.latestRecommendation;
        shadowTop = (rec.top20X2 || (rec.numbers || []).slice(0, 20)).map(numStr);
        shadowBot = (rec.bottom20X1 || (rec.numbers || []).slice(20, 40)).map(numStr);
    }

    // 3. TriCore hôm nay
    let triTop = [];
    let triBot = [];
    if (regBet?.triCoreDe) {
        const nums = (regBet.triCoreDe.numbers || []).map(numStr);
        triTop = nums.slice(0, 12);
        triBot = nums.slice(12, 24);
    } else if (advisorData.triCoreDe?.latestRecommendation) {
        const nums = (advisorData.triCoreDe.latestRecommendation.numbers || []).map(numStr);
        triTop = nums.slice(0, 12);
        triBot = nums.slice(12, 24);
    }

    // 4. Fusion hôm nay
    let fusionTop = [];
    let fusionBot = [];
    if (dailyTop.length && shadowTop.length) {
        const dVipSet = new Set(dailyTop);
        const dSingleSet = new Set(dailyBot);
        const sTopSet = new Set(shadowTop);
        const sBotSet = new Set(shadowBot);
        const allCandidates = new Set([...dailyTop, ...dailyBot, ...shadowTop, ...shadowBot]);
        const scores = {};
        allCandidates.forEach(n => {
            let sc = 0;
            if (dVipSet.has(n) && sTopSet.has(n)) sc += 4.5;
            else if (dVipSet.has(n) && sBotSet.has(n)) sc += 3.0;
            else if (sTopSet.has(n) && dSingleSet.has(n)) sc += 3.0;
            else if (dVipSet.has(n)) sc += 2.0;
            else if (sTopSet.has(n)) sc += 2.0;
            else if (dSingleSet.has(n) && sBotSet.has(n)) sc += 1.8;
            else sc += 1.0;
            scores[n] = sc;
        });
        const ranked = Array.from(allCandidates).sort((a, b) => (scores[b] - scores[a]) || (Number(a) - Number(b)));
        fusionTop = ranked.slice(0, 18);
        fusionBot = ranked.slice(18, 36);
    }

    return {
        targetDate,
        daily: applyAntiParityFilter(dailyTop, dailyBot, oppForm),
        shadow: applyAntiParityFilter(shadowTop, shadowBot, oppForm),
        triCore: applyAntiParityFilter(triTop, triBot, oppForm),
        fusion: applyAntiParityFilter(fusionTop, fusionBot, oppForm)
    };
}

let _memoryReportCache = null;
let _lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60s cache

function getDeFusionReport(options = {}) {
    const now = Date.now();
    const parityMethod = options.parityMethod || 'optimalHybrid';
    const cacheKey = parityMethod + (options.forceRefresh ? '_force' : '');

    if (!options.forceRefresh && _memoryReportCache && _memoryReportCache[cacheKey] && (now - _lastCacheTime < CACHE_TTL_MS)) {
        return _memoryReportCache[cacheKey];
    }

    const advisorData = options.advisorData || loadAdvisorDataSync();
    if (!advisorData) {
        throw new Error('Dữ liệu cố vấn chưa sẵn sàng (cached_daily_method_advisor.json).');
    }
    const registryData = options.registryData || advisorData.dailyLockedBetsRegistry || loadRegistryDataSync();

    const report = buildDeFusionReport({ ...options, advisorData, registryData });
    if (!_memoryReportCache) _memoryReportCache = {};
    _memoryReportCache[cacheKey] = report;
    _lastCacheTime = now;
    return report;
}

async function getDeFusionReportAsync(options = {}) {
    const now = Date.now();
    const parityMethod = options.parityMethod || 'optimalHybrid';
    const cacheKey = parityMethod + (options.forceRefresh ? '_force' : '');

    if (!options.forceRefresh && _memoryReportCache && _memoryReportCache[cacheKey] && (now - _lastCacheTime < CACHE_TTL_MS)) {
        return _memoryReportCache[cacheKey];
    }

    // Attempt to load from R2 via official loadJsonWithSupabaseFallback
    let advisorData = options.advisorData || null;
    if (!advisorData) {
        try {
            const { loadJsonWithSupabaseFallback } = require('../data-access');
            advisorData = await loadJsonWithSupabaseFallback('cached_daily_method_advisor.json');
        } catch (e) {
            console.warn('[deFusionService] loadJsonWithSupabaseFallback failed, falling back to disk:', e.message);
            advisorData = loadAdvisorDataSync();
        }
    }

    if (!advisorData) {
        advisorData = loadAdvisorDataSync();
    }

    if (!advisorData) {
        throw new Error('Không thể tải dữ liệu cố vấn từ Cloudflare R2 hoặc bộ nhớ máy chủ.');
    }

    const registryData = options.registryData || advisorData.dailyLockedBetsRegistry || loadRegistryDataSync();

    return getDeFusionReport({ ...options, advisorData, registryData });
}

function clearDeFusionCache() {
    _memoryReportCache = null;
    _lastCacheTime = 0;
}

module.exports = {
    UNIT_X2_K,
    UNIT_X1_K,
    MULTIPLIER,
    PAYOUT_X2_K,
    PAYOUT_X1_K,
    OPPOSITE_FORM_MAP,
    FORM_LABELS,
    numStr,
    getParityForm,
    applyAntiParityFilter,
    evaluateDeBet,
    buildDeFusionReport,
    getDeFusionReport,
    getDeFusionReportAsync,
    clearDeFusionCache
};

