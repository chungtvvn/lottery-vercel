'use strict';

/**
 * lib/services/ai5SignalReboundService.js
 * 
 * PHƯƠNG PHÁP MỚI: TÍN HIỆU HỒI PHỤC 360 (SIGNAL-GATED REBOUND 360)
 * Chạy song song độc lập với 5 AI hiện tại:
 * 1. Mở rộng cửa sổ tần suất 5 AI lên 360 ngày (W = 360).
 * 2. Tích hợp Dự đoán Chẵn/Lẻ: Lọc Anti-Parity (loại 25 số cực nghịch) + Phân tầng VIP X2 (trùng dạng) / Lót X1.
 * 3. Tự động tính điểm tín hiệu mỗi ngày (S_De, S_Lo, S_Composite).
 * 4. Tự động ra quyết định cược (CÓ ĐÁNH KHÔNG?):
 *    - ĐÁNH 1.0x (BET): Khi tín hiệu đạt chuẩn (>= 60) sau chuỗi thắng.
 *    - BÙ LỖ 2.0x (RECOVERY_BET): Khi vừa thua hôm trước VÀ tín hiệu hôm nay MẠNH HƠN hôm qua (S_D > S_{D-1}).
 *    - BỎ CƯỢC 0.0x (SKIP): Khi tín hiệu suy yếu (< 60) hoặc sau ngày thua mà tín hiệu KÉM HƠN/BẰNG (S_D <= S_{D-1}).
 * 
 * 100% Strict Point-In-Time (Strict PIT).
 */

const fs = require('fs');
const path = require('path');
const { loadCompactDraws, avgRank } = require('./ai5EnsembleDeService');
const { computeDynamic5SchoolsLo, rankLoConsensusWithBorda, SCHOOL_METADATA } = require('./ai5DynamicLoEngine');
const { calculateConsensus, evaluateLoTiered } = require('./ai5StatsService');

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

const DE_X2_STAKE_PER_NUMBER_K = 2000; // 2M/số
const DE_X1_STAKE_PER_NUMBER_K = 1000; // 1M/số
const DE_X2_PAYOUT_K = 168000;         // Ăn 168M
const DE_X1_PAYOUT_K = 84000;          // Ăn 84M

const LO_STAKE_PER_NUMBER_K = 2200;    // 2.2M/số (10 điểm)
const LO_PAYOUT_PER_HIT_K = 8000;      // 8M/nháy

function pad2(n) {
    return String(n).padStart(2, '0');
}

function getParityForm(numStr) {
    const s = pad2(numStr);
    const hEven = parseInt(s[0], 10) % 2 === 0;
    const tEven = parseInt(s[1], 10) % 2 === 0;
    return (hEven ? 'C' : 'L') + (tEven ? 'C' : 'L');
}

function zscoreStats(vals) {
    let sum = 0;
    for (let x = 0; x < 100; x++) sum += (vals[x] ?? 0);
    const m = sum / 100;
    let varSum = 0;
    for (let x = 0; x < 100; x++) varSum += ((vals[x] ?? 0) - m) ** 2;
    const s = Math.sqrt(varSum / 100);
    const z = {};
    for (let x = 0; x < 100; x++) z[x] = s === 0 ? 0 : ((vals[x] ?? 0) - m) / s;
    return z;
}

/**
 * Sinh dự đoán độc lập của 5 AI với cửa sổ tham số W (mặc định 360 ngày)
 */
function computeAll5AIPredictionsW(targetDate, validDraws, W = 360) {
    const nBefore = validDraws.length;
    if (nBefore < 100) return null;
    const effW = Math.min(W, nBefore);

    const deAll = new Int32Array(100);
    const deSeen = new Int32Array(100).fill(-1);
    const loAll = new Int32Array(100);
    const loSeen = new Int32Array(100).fill(-1);

    for (let i = 0; i < nBefore; i++) {
        const nums = validDraws[i][1];
        const db = nums[0];
        deAll[db]++;
        deSeen[db] = i;
        for (let k = 0; k < 27; k++) {
            loAll[nums[k]]++;
            loSeen[nums[k]] = i;
        }
    }

    const deW = new Int32Array(100);
    const de30 = new Int32Array(100);
    const loW = new Int32Array(100);
    const lo30 = new Int32Array(100);

    for (let i = Math.max(0, nBefore - effW); i < nBefore; i++) {
        deW[validDraws[i][1][0]]++;
        for (const x of validDraws[i][1]) loW[x]++;
    }
    for (let i = Math.max(0, nBefore - 30); i < nBefore; i++) {
        de30[validDraws[i][1][0]]++;
        for (const x of validDraws[i][1]) lo30[x]++;
    }

    const gapDe = new Int32Array(100);
    const gapLo = new Int32Array(100);
    for (let x = 0; x < 100; x++) {
        gapDe[x] = deSeen[x] >= 0 ? (nBefore - 1 - deSeen[x]) : nBefore;
        gapLo[x] = loSeen[x] >= 0 ? (nBefore - 1 - loSeen[x]) : nBefore;
    }

    const allNums = Array.from({ length: 100 }, (_, x) => x);

    // 1. Muse
    const museDe = allNums.slice().sort((a, b) => ((deAll[b] + 2 * deW[b]) - (deAll[a] + 2 * deW[a])) || (a - b)).slice(0, 20).map(pad2);
    const museLo = allNums.slice().sort((a, b) => ((loAll[b] + 2 * loW[b]) - (loAll[a] + 2 * loW[a])) || (a - b)).slice(0, 6).map(pad2);

    // 2. Perplexity / Grok
    const perpDe = allNums.slice().sort((a, b) => {
        const sA = 0.5 * deAll[a] / nBefore + 0.5 * deW[a] / effW;
        const sB = 0.5 * deAll[b] / nBefore + 0.5 * deW[b] / effW;
        return (sB - sA) || (deAll[b] - deAll[a]) || (a - b);
    }).slice(0, 20).map(pad2);

    const perpLo = allNums.slice().sort((a, b) => {
        const sA = 0.5 * loAll[a] / (nBefore * 27) + 0.5 * loW[a] / (effW * 27);
        const sB = 0.5 * loAll[b] / (nBefore * 27) + 0.5 * loW[b] / (effW * 27);
        return (sB - sA) || (loW[b] - loW[a]) || (loAll[b] - loAll[a]) || (a - b);
    }).slice(0, 6).map(pad2);

    // 3. Gemini
    const z30 = zscoreStats(lo30), zW = zscoreStats(loW), zall = zscoreStats(loAll);
    const geminiLoScores = {};
    for (let x = 0; x < 100; x++) {
        geminiLoScores[x] = Number((0.40 * z30[x] + 0.30 * zW[x] + 0.20 * (Math.min(gapLo[x], 30) / 30) + 0.10 * zall[x]).toFixed(4));
    }
    const geminiLo = allNums.slice().sort((a, b) => (geminiLoScores[b] - geminiLoScores[a]) || (loW[b] - loW[a]) || (lo30[b] - lo30[a]) || (gapLo[b] - gapLo[a]) || (a - b)).slice(0, 6).map(pad2);

    // Union De for Gemini & ChatGPT
    const topFall = allNums.slice().sort((a, b) => (deAll[b] - deAll[a]) || (a - b)).slice(0, 10);
    const topW = allNums.slice().sort((a, b) => (deW[b] - deW[a]) || (a - b)).slice(0, 10);
    const coreSet = new Set([...topFall, ...topW]);
    let fill = -1, maxGap = -1;
    for (let x = 0; x < 100; x++) {
        if (!coreSet.has(x)) {
            if (gapDe[x] > maxGap) { maxGap = gapDe[x]; fill = x; }
            else if (gapDe[x] === maxGap && fill !== -1 && x < fill) { fill = x; }
        }
    }
    const unionDe = [...coreSet, fill].map(pad2).sort();

    // 4. ChatGPT
    const r_h = avgRank(loAll), r_w = avgRank(loW), r_3 = avgRank(lo30), r_g = avgRank(gapLo);
    const chatgptLoScores = {};
    for (let x = 0; x < 100; x++) {
        chatgptLoScores[x] = 0.20 * ((100 - r_h[x]) / 99) + 0.30 * ((100 - r_w[x]) / 99) + 0.30 * ((100 - r_3[x]) / 99) + 0.20 * ((100 - r_g[x]) / 99);
    }
    const chatgptLo = allNums.slice().sort((a, b) => (chatgptLoScores[b] - chatgptLoScores[a]) || (lo30[b] - lo30[a]) || (loW[b] - loW[a]) || (loAll[b] - loAll[a]) || (gapLo[b] - gapLo[a]) || (a - b)).slice(0, 6).map(pad2);

    // 5. Claude (Đề giữ chuẩn W=360)
    const claudeDe = allNums.slice().sort((a, b) => (deW[b] - deW[a]) || (de30[b] - de30[a]) || (deAll[b] - deAll[a]) || (a - b)).slice(0, 20).map(pad2);

    // LÔ 5 AI ĐA TRƯỜNG PHÁI ĐỘNG (5-School Orthogonal Dynamic Lô v2 — Chống lặp cứng 14, 52, 92):
    // Thay thế hoàn toàn việc cả 5 AI cùng sort theo loAll 21 năm & loW 360 ngày.
    const dynLo = computeDynamic5SchoolsLo(validDraws);
    const museLoFinal = dynLo ? dynLo.muse : museLo;
    const grokLoFinal = dynLo ? dynLo.grok : perpLo;
    const geminiLoFinal = dynLo ? dynLo.gemini : geminiLo;
    const chatgptLoFinal = dynLo ? dynLo.chatgpt : chatgptLo;
    const claudeLoFinal = dynLo ? dynLo.claude : allNums.slice().sort((a, b) => (loW[b] - loW[a]) || (lo30[b] - lo30[a]) || (loAll[b] - loAll[a]) || (a - b)).slice(0, 6).map(pad2);

    return {
        muse: { de: museDe, lo: museLoFinal },
        perplexity: { de: perpDe, lo: grokLoFinal },
        grok: { de: perpDe, lo: grokLoFinal },
        gemini: { de: unionDe, lo: geminiLoFinal },
        chatgpt: { de: unionDe, lo: chatgptLoFinal },
        claude: { de: claudeDe, lo: claudeLoFinal },
        _loDynamic: dynLo
    };
}

let cachedParityMap = null;
let cachedLatestParity = null;

function loadParityLookup() {
    if (cachedParityMap) return { map: cachedParityMap, latest: cachedLatestParity };
    const map = new Map();
    let latest = 'LL';
    try {
        const advPath = path.join(process.cwd(), 'lib/data/statistics/cached_daily_method_advisor.json');
        if (fs.existsSync(advPath)) {
            const adv = JSON.parse(fs.readFileSync(advPath, 'utf8'));
            const dpr = adv.deParityResearch;
            if (dpr) {
                const rec = dpr.latestRecommendation;
                if (rec) {
                    const m = rec.methods?.optimalHybrid || {};
                    latest = m.predForm || 'LL';
                    if (rec.targetDate) {
                        map.set(String(rec.targetDate).slice(0, 10), latest);
                    }
                }
                const ledger = dpr.settledLedger || [];
                for (const row of ledger) {
                    if (row && row.date) {
                        const dStr = String(row.date).slice(0, 10);
                        const m = row.methods?.optimalHybrid || {};
                        const form = m.predForm || row.predForm || 'LL';
                        map.set(dStr, form);
                    }
                }
            }
        }
    } catch (_) {}
    cachedParityMap = map;
    cachedLatestParity = latest;
    return { map, latest };
}

/**
 * Trích xuất dự báo Chẵn Lẻ cho một ngày mục tiêu (O(1) in-memory lookup)
 */
function getParityPredictionForDate(targetDate) {
    const { map, latest } = loadParityLookup();
    if (targetDate && map.has(targetDate)) {
        return map.get(targetDate);
    }
    return latest || 'LL';
}

/**
 * Tính điểm tín hiệu tổng hợp định lượng 0 - 100
 */
function computeSignalScores(cons360, predForm) {
    if (!cons360) return { scoreDe: 50, scoreLo: 50, scoreComposite: 50 };

    const deVotes = Object.values(cons360.deVotesMap || {}).map(v => v.count);
    const maxDeVote = Math.max(...deVotes, 0);
    const countDeOver3 = deVotes.filter(c => c >= 3).length;

    // Điểm Đề (0 - 100)
    const scoreDe = Math.min(100, (maxDeVote >= 4 ? 40 : 20) + (countDeOver3 >= 15 ? 40 : countDeOver3 * 2.5) + (predForm ? 20 : 0));

    // Điểm Lô (0 - 100) hiệu chuẩn riêng cho 5 trường phái độc lập:
    // Phản ánh mức độ hội tụ thực tế giữa 5 trường phái khác nhau (Markov, Cầu/Rơi, EMA, Weibull Hazard, Nhịp Lag-2)
    const loVotes = Object.values(cons360.loVotesMap || {}).map(v => v.count);
    const maxLoVote = Math.max(...loVotes, 0);
    const countLoOver2 = loVotes.filter(c => c >= 2).length;
    const scoreLo = Math.min(100, (maxLoVote >= 3 ? 50 : (maxLoVote === 2 ? 35 : 15)) + Math.min(50, countLoOver2 * 10));

    const scoreComposite = Math.round(scoreDe * 0.5 + scoreLo * 0.5);

    return { scoreDe, scoreLo, scoreComposite };
}

/**
 * Tính toán gợi ý & đối soát Phương Pháp Mới cho 1 ngày
 */
function evaluateDaySignalRebound(targetDate, actualDraw = null, prevDayState = null, allDraws = null) {
    const draws = allDraws || loadCompactDraws();
    const validDraws = targetDate ? draws.filter(d => d[0] < targetDate) : draws;

    const preds360 = computeAll5AIPredictionsW(targetDate, validDraws, 360);
    if (!preds360) return null;

    const cons360 = calculateConsensus(preds360);
    const predForm = getParityPredictionForDate(targetDate);
    const oppForm = OPPOSITE_FORM_MAP[predForm] || 'CC';

    // Dàn Đề sau lọc Anti-Parity (loại 25 số cực nghịch)
    const allDe = cons360.deAllConsensus || [];
    const filteredDe = allDe.filter(n => getParityForm(n) !== oppForm);

    // Phân tầng: Trùng dạng Chẵn Lẻ -> VIP X2 (cược 2M), Số lót -> X1 (cược 1M)
    const deX2Nums = filteredDe.filter(n => getParityForm(n) === predForm);
    const deX1Nums = filteredDe.filter(n => getParityForm(n) !== predForm);

    // 🔥 LÔ GỘP ĐA TẦNG THUẦN 5 AI (PURE MULTI-TIER >= 2 TRƯỜNG PHÁI):
    // - 5 trường phái độc lập (Markov D-1, Cầu/Rơi/Lộn, EMA Ngắn, Weibull Hazard, Nhịp 60/180 & Lag-2)
    // - CHỈ cược các số đạt đồng thuận >= 2 trường phái (X5/X4/X3/X2), cắt sạch 100% nhiễu 1-vote, KHÔNG lót Top 6 X1!
    // - Nếu ngày hiếm có 0 số >= 2 trường phái -> Lô tự động NGHỈ (0đ bảo toàn vốn).
    // - Xếp hạng Song Thủ Top 2 & Lục Thủ Top 6 theo Borda + Ensemble-Z (loại bỏ thiên vị số nhỏ 00..11).
    const dynLo = preds360._loDynamic || null;
    const schoolPicks = {
        chatgpt: preds360.chatgpt?.lo || [],
        claude: preds360.claude?.lo || [],
        gemini: preds360.gemini?.lo || [],
        grok: preds360.grok?.lo || [],
        muse: preds360.muse?.lo || []
    };
    const bordaRank = rankLoConsensusWithBorda(schoolPicks, dynLo?.ensembleZ || null);
    const loTop6 = bordaRank.top6.length > 0 ? bordaRank.top6 : (cons360.loTop6 || []);
    const loTop2 = bordaRank.top2?.length > 0 ? bordaRank.top2 : loTop6.slice(0, 2);
    const loHighConsensus = bordaRank.highConsensus;

    const isPureMultiTier = true;
    const isFallbackTop6 = false;
    const activeLoNums = loHighConsensus;
    const activeLoMultiplierMap = {};
    const activeLoTiers = { x5Nums: [], x4Nums: [], x3Nums: [], x2Nums: [], x1Nums: [] };
    activeLoNums.forEach(num => {
        const v = bordaRank.votesMap[num]?.count || 2;
        activeLoMultiplierMap[num] = v;
        if (v >= 5) activeLoTiers.x5Nums.push(num);
        else if (v === 4) activeLoTiers.x4Nums.push(num);
        else if (v === 3) activeLoTiers.x3Nums.push(num);
        else if (v === 2) activeLoTiers.x2Nums.push(num);
    });

    const loTiers = activeLoTiers;
    const loMultiplierMap = activeLoMultiplierMap;
    const loAllTiers = activeLoNums;

    // Điểm tín hiệu hôm nay
    const { scoreDe, scoreLo, scoreComposite } = computeSignalScores(cons360, predForm);
    const prevScore = prevDayState ? prevDayState.scoreComposite : 0;
    const prevHadLoss = prevDayState ? Boolean(prevDayState.hadLoss) : false;

    // QUYẾT ĐỊNH CƯỢC:
    let decision = 'BET';
    let decisionMultiplier = 1.0;
    let decisionLabel = '⚡ VÀO LỆNH 1.0X';
    let decisionReason = `Tín hiệu đạt ${scoreComposite}/100 (Lô 5 trường phái: ${scoreLo}/100). Duy trì cược cơ bản.`;

    if (!prevHadLoss) {
        // Hôm trước không có lệnh thua (vừa thắng hoặc hôm trước nghỉ cược bảo toàn vốn)
        if (scoreComposite >= 65) {
            decision = 'BET';
            decisionMultiplier = 1.0;
            decisionLabel = '⚡ VÀO LỆNH 1.0X';
            decisionReason = `Tín hiệu đạt chuẩn (${scoreComposite}/100 · Hội tụ ${loHighConsensus.length} số ≥2 trường phái). Vào lệnh cơ bản 1.0x.`;
        } else {
            decision = 'SKIP';
            decisionMultiplier = 0.0;
            decisionLabel = '🛡️ NGHỈ CƯỢC (BẢO TOÀN VỐN)';
            decisionReason = `Tín hiệu phân tán (${scoreComposite}/100 < 65 · Lô ${scoreLo}/100). Nghỉ cược bảo toàn vốn.`;
        }
    } else {
        // Hôm trước ĐÃ CƯỢC VÀ BỊ THUA -> Chỉ mở bù lỗ 1.5x khi tín hiệu Lô & Tổng đạt siêu hội tụ
        if (scoreLo >= 85 && scoreComposite >= 90 && scoreComposite > prevScore) {
            decision = 'RECOVERY_BET';
            decisionMultiplier = 1.5;
            decisionLabel = '🔥 BÙ LỖ 1.5X';
            decisionReason = `Siêu hội tụ 5 trường phái (${scoreComposite}đ > ${prevScore}đ · Lô ${scoreLo}đ) sau ngày thua. Kích hoạt lệnh hồi phục 1.5x!`;
        } else {
            decision = 'SKIP';
            decisionMultiplier = 0.0;
            decisionLabel = '🛡️ NGHỈ CƯỢC (BẢO TOÀN VỐN)';
            decisionReason = scoreComposite < 65
                ? `Tín hiệu suy yếu (${scoreComposite}/100 < 65). Nghỉ cược bảo toàn vốn.`
                : `Sau ngày thua, tín hiệu (${scoreComposite}đ · Lô ${scoreLo}đ) chưa đạt ngưỡng siêu hội tụ. Nghiêm cấm gấp thếp, nghỉ cược!`;
        }
    }

    // Tính toán chi phí cơ sở 1.0x
    const deBaseStakeK = (deX2Nums.length * DE_X2_STAKE_PER_NUMBER_K) + (deX1Nums.length * DE_X1_STAKE_PER_NUMBER_K);
    
    // Vốn cơ sở Lô Đa Tầng (Hệ số vote x 2.2M)
    let loBaseStakeK = 0;
    loAllTiers.forEach(num => {
        const mult = loMultiplierMap[num] || 1;
        loBaseStakeK += mult * LO_STAKE_PER_NUMBER_K;
    });

    const comboBaseStakeK = deBaseStakeK + loBaseStakeK;

    let special = null;
    let p27 = [];
    let isSettled = false;

    if (actualDraw && actualDraw.special && actualDraw.prizes27?.length === 27) {
        special = pad2(actualDraw.special);
        p27 = actualDraw.prizes27.map(pad2);
        isSettled = true;
    }

    let deHitX2 = false, deHitX1 = false, deHit = false;
    let dePayoutK = 0, deProfitK = 0;
    let loHits = 0, loHitNums = [], loPayoutK = 0, loProfitK = 0;
    let loTieredEval = null;
    let loPureFlat = null;
    let loTop2Eval = null;
    let stakeK = 0, payoutK = 0, profitK = 0, isWin = false;
    let savedStakeK = 0;

    if (isSettled) {
        deHitX2 = special ? deX2Nums.includes(special) : false;
        deHitX1 = special ? deX1Nums.includes(special) : false;
        deHit = deHitX2 || deHitX1;
        const deBasePayoutK = deHitX2 ? DE_X2_PAYOUT_K : (deHitX1 ? DE_X1_PAYOUT_K : 0);

        // Đánh giá Lô Gộp Đa Tầng Thuần (>= 2 trường phái, không lót 1-vote)
        loTieredEval = evaluateLoTiered(loMultiplierMap, p27, loAllTiers);
        const loBasePayoutK = loTieredEval ? loTieredEval.payoutK : 0;
        loHits = loTieredEval ? loTieredEval.hits : 0;
        loHitNums = loTieredEval ? loTieredEval.hitNumbers : [];

        // Đánh giá ĐỘC LẬP 1.0x cho Lô Gộp Đa Tầng Thuần (không bị kéo SKIP theo Đề 360)
        const purePlayed = loAllTiers.length > 0;
        const pureProfitK = loBasePayoutK - loBaseStakeK;
        loPureFlat = {
            played: purePlayed,
            count: loAllTiers.length,
            stakeK: loBaseStakeK,
            payoutK: loBasePayoutK,
            profitK: pureProfitK,
            hits: loHits,
            hitNums: loHitNums,
            isHit: loHits > 0,
            isWin: purePlayed && pureProfitK > 0
        };

        // Đánh giá ĐỘC LẬP 1.0x cho Song Thủ Top 2 Borda (4.4M/ngày)
        const p27Counts = {};
        p27.forEach(num => { p27Counts[num] = (p27Counts[num] || 0) + 1; });
        let top2Hits = 0;
        const top2HitNums = [];
        loTop2.forEach(num => {
            const h = p27Counts[num] || 0;
            top2Hits += h;
            if (h > 0) top2HitNums.push(num);
        });
        const top2StakeK = loTop2.length * LO_STAKE_PER_NUMBER_K;
        const top2PayoutK = top2Hits * LO_PAYOUT_PER_HIT_K;
        loTop2Eval = {
            played: loTop2.length > 0,
            count: loTop2.length,
            stakeK: top2StakeK,
            payoutK: top2PayoutK,
            profitK: top2PayoutK - top2StakeK,
            hits: top2Hits,
            hitNums: top2HitNums,
            isHit: top2Hits > 0,
            isWin: (top2PayoutK - top2StakeK) > 0
        };

        if (decision === 'SKIP') {
            stakeK = 0;
            payoutK = 0;
            profitK = 0;
            isWin = false;
            savedStakeK = comboBaseStakeK; // Tiết kiệm được khoản vốn này
        } else {
            stakeK = comboBaseStakeK * decisionMultiplier;
            payoutK = (deBasePayoutK + loBasePayoutK) * decisionMultiplier;
            profitK = payoutK - stakeK;
            isWin = profitK > 0;
            savedStakeK = 0;
        }

        dePayoutK = deBasePayoutK * decisionMultiplier;
        deProfitK = dePayoutK - (deBaseStakeK * decisionMultiplier);
        loPayoutK = loBasePayoutK * decisionMultiplier;
        loProfitK = loPayoutK - (loBaseStakeK * decisionMultiplier);
    }

    const plannedDeStakeK = decision === 'SKIP' ? 0 : (deBaseStakeK * decisionMultiplier);
    const plannedLoStakeK = decision === 'SKIP' ? 0 : (loBaseStakeK * decisionMultiplier);
    const plannedStakeK = decision === 'SKIP' ? 0 : (comboBaseStakeK * decisionMultiplier);

    return {
        targetDate,
        isSettled,
        scoreDe,
        scoreLo,
        scoreComposite,
        prevScoreComposite: prevScore,
        decision,
        decisionMultiplier,
        decisionLabel,
        decisionReason,
        predForm,
        predFormVi: FORM_LABELS[predForm] || predForm,
        oppForm,
        oppFormVi: FORM_LABELS[oppForm] || oppForm,
        de: {
            numbers: filteredDe,
            x2Nums: deX2Nums,
            x1Nums: deX1Nums,
            countX2: deX2Nums.length,
            countX1: deX1Nums.length,
            totalCount: filteredDe.length,
            baseStakeK: deBaseStakeK,
            plannedStakeK: plannedDeStakeK,
            stakeK: isSettled ? (decision === 'SKIP' ? 0 : deBaseStakeK * decisionMultiplier) : plannedDeStakeK,
            payoutK: dePayoutK,
            profitK: deProfitK,
            isHit: deHit,
            isHitX2: deHitX2,
            isHitX1: deHitX1,
            hitNumber: deHit ? special : null,
            hitTier: deHitX2 ? 'X2' : (deHitX1 ? 'X1' : null)
        },
        lo: {
            engineName: '🔥 Lô Gộp Đa Tầng Thuần (5 Trường Phái Động · ≥2 AI)',
            numbers: loAllTiers,
            top6: loTop6,
            top2: loTop2,
            tiers: loTiers,
            multiplierMap: loMultiplierMap,
            highConsensus: loHighConsensus,
            isPureMultiTier,
            isFallbackTop6,
            schoolPicks,
            schoolMeta: SCHOOL_METADATA,
            count: loAllTiers.length,
            baseStakeK: loBaseStakeK,
            plannedStakeK: plannedLoStakeK,
            stakeK: isSettled ? (decision === 'SKIP' ? 0 : loBaseStakeK * decisionMultiplier) : plannedLoStakeK,
            payoutK: loPayoutK,
            profitK: loProfitK,
            hits: loHits,
            hitNums: loHitNums,
            breakdown: loTieredEval ? loTieredEval.breakdown : {},
            isWin: loProfitK > 0,
            pureFlat: loPureFlat,
            top2Eval: loTop2Eval
        },
        combo: {
            baseStakeK: comboBaseStakeK,
            plannedStakeK,
            stakeK: isSettled ? stakeK : plannedStakeK,
            payoutK,
            profitK,
            isWin,
            savedStakeK: isSettled ? savedStakeK : (decision === 'SKIP' ? comboBaseStakeK : 0)
        }
    };
}

/**
 * Gắn kết quả Phương Pháp Mới vào Client Payload để phục vụ hiển thị song song
 */
function attachSignalReboundToPayload(clientPayload, optionalDraws = null) {
    if (!clientPayload || !Array.isArray(clientPayload.history)) return clientPayload;

    const allDraws = optionalDraws || loadCompactDraws();
    const history = clientPayload.history;

    // Sắp xếp theo thứ tự thời gian tăng dần để chạy chuỗi trạng thái quyết định
    const sortedDays = [...history].sort((a, b) => String(a.date).localeCompare(String(b.date)));

    let runningCumProfitK = 0;
    let runningPureLoCumProfitK = 0;
    let prevDayState = null;

    let oldTotalStakeK = 0, oldTotalPayoutK = 0, oldTotalProfitK = 0, oldWinDays = 0;
    let newTotalStakeK = 0, newTotalPayoutK = 0, newTotalProfitK = 0, newWinDays = 0, newPlayedDays = 0, newSkippedDays = 0, newSavedStakeK = 0;

    // Theo dõi độc lập 1.0x cho 🔥 Lô Gộp Đa Tầng Thuần (>= 2 trường phái) & ⚡ Song Thủ Top 2 Borda
    let pureLoStakeK = 0, pureLoPayoutK = 0, pureLoProfitK = 0;
    let pureLoPlayedDays = 0, pureLoSkippedDays = 0, pureLoWinDays = 0, pureLoHitDays = 0, pureLoTotalHits = 0;
    let top2StakeK = 0, top2PayoutK = 0, top2ProfitK = 0, top2WinDays = 0, top2TotalHits = 0, top2Days = 0;

    sortedDays.forEach(day => {
        const actualDraw = (day.special && Array.isArray(day.prizes27)) ? {
            special: day.special,
            prizes27: day.prizes27
        } : null;

        const evalRes = evaluateDaySignalRebound(day.date, actualDraw, prevDayState, allDraws);
        if (evalRes) {
            if (evalRes.isSettled) {
                runningCumProfitK += evalRes.combo.profitK;
                evalRes.combo.cumProfitK = runningCumProfitK;

                // Thống kê độc lập Lô Gộp Đa Tầng Thuần (1.0x mỗi ngày có >=2 trường phái)
                if (evalRes.lo?.pureFlat) {
                    const pf = evalRes.lo.pureFlat;
                    runningPureLoCumProfitK += pf.profitK;
                    evalRes.lo.cumPureProfitK = runningPureLoCumProfitK;
                    pureLoStakeK += pf.stakeK;
                    pureLoPayoutK += pf.payoutK;
                    pureLoProfitK += pf.profitK;
                    pureLoTotalHits += pf.hits;
                    if (pf.played) {
                        pureLoPlayedDays++;
                        if (pf.isHit) pureLoHitDays++;
                        if (pf.isWin) pureLoWinDays++;
                    } else {
                        pureLoSkippedDays++;
                    }
                }
                if (evalRes.lo?.top2Eval && evalRes.lo.top2Eval.played) {
                    const t2 = evalRes.lo.top2Eval;
                    top2Days++;
                    top2StakeK += t2.stakeK;
                    top2PayoutK += t2.payoutK;
                    top2ProfitK += t2.profitK;
                    top2TotalHits += t2.hits;
                    if (t2.isWin) top2WinDays++;
                }

                // Thống kê cũ (Consensus Flat / Tiered cũ)
                const consRes = day.results?.consensus || {};
                const oldStake = (consRes.deTiered?.stakeK || consRes.de?.stakeK || 0) + (consRes.loTiered?.stakeK || consRes.lo?.stakeK || 0);
                const oldPayout = (consRes.deTiered?.payoutK || consRes.de?.payoutK || 0) + (consRes.loTiered?.payoutK || consRes.lo?.payoutK || 0);
                const oldProfit = oldPayout - oldStake;
                oldTotalStakeK += oldStake;
                oldTotalPayoutK += oldPayout;
                oldTotalProfitK += oldProfit;
                if (oldProfit > 0) oldWinDays++;

                // Thống kê mới (Signal Rebound 360)
                newTotalStakeK += evalRes.combo.stakeK;
                newTotalPayoutK += evalRes.combo.payoutK;
                newTotalProfitK += evalRes.combo.profitK;
                if (evalRes.decision !== 'SKIP') {
                    newPlayedDays++;
                    if (evalRes.combo.isWin) newWinDays++;
                } else {
                    newSkippedDays++;
                    newSavedStakeK += evalRes.combo.savedStakeK;
                }

                prevDayState = {
                    date: day.date,
                    hadLoss: (evalRes.decision !== 'SKIP') && (evalRes.combo.profitK <= 0),
                    isWin: evalRes.combo.isWin,
                    scoreComposite: evalRes.scoreComposite
                };
            }

            day.newStrategy = evalRes;
        }
    });

    // Tính toán gợi ý cho ngày mới nhất hôm nay (chưa quay)
    const latestDate = clientPayload.latestDate || clientPayload.latestDay?.date;
    const todayRec = evaluateDaySignalRebound(latestDate, null, prevDayState, allDraws);
    clientPayload.todayNewStrategy = todayRec;
    if (clientPayload.latestDay) {
        clientPayload.latestDay.newStrategy = todayRec;
    }

    // Tổng kết so sánh trực quan Song Song (Old vs New vs Lô Thuần Độc Lập)
    const settledDaysCount = sortedDays.filter(d => d.special && d.prizes27?.length === 27).length;
    const lo5AiPureSummary = {
        name: '🔥 Lô Gộp Đa Tầng Thuần 5AI (≥2 Trường Phái · Độc Lập 1.0x)',
        days: settledDaysCount,
        playedDays: pureLoPlayedDays,
        skippedDays: pureLoSkippedDays,
        stakeM: (pureLoStakeK / 1000).toFixed(1),
        payoutM: (pureLoPayoutK / 1000).toFixed(1),
        profitM: (pureLoProfitK / 1000).toFixed(1),
        profitK: pureLoProfitK,
        roi: pureLoStakeK > 0 ? (pureLoProfitK / pureLoStakeK * 100).toFixed(2) + '%' : '0%',
        winDays: pureLoWinDays,
        hitDays: pureLoHitDays,
        totalHits: pureLoTotalHits,
        winRate: pureLoPlayedDays > 0 ? (pureLoWinDays / pureLoPlayedDays * 100).toFixed(1) + '%' : '0%',
        hitRate: pureLoPlayedDays > 0 ? (pureLoHitDays / pureLoPlayedDays * 100).toFixed(1) + '%' : '0%',
        top2: {
            days: top2Days,
            stakeM: (top2StakeK / 1000).toFixed(1),
            profitM: (top2ProfitK / 1000).toFixed(1),
            roi: top2StakeK > 0 ? (top2ProfitK / top2StakeK * 100).toFixed(2) + '%' : '0%',
            winDays: top2WinDays,
            totalHits: top2TotalHits,
            winRate: top2Days > 0 ? (top2WinDays / top2Days * 100).toFixed(1) + '%' : '0%'
        }
    };

    clientPayload.lo5AiPureSummary = lo5AiPureSummary;
    clientPayload.comparisonSummary = {
        settledDaysCount,
        lo5AiPure: lo5AiPureSummary,
        oldStrategy: {
            name: 'Cách Hiện Tại (Đánh Đều 100% Cả 5 AI)',
            days: settledDaysCount,
            stakeM: (oldTotalStakeK / 1000).toFixed(1),
            profitM: (oldTotalProfitK / 1000).toFixed(1),
            roi: oldTotalStakeK > 0 ? (oldTotalProfitK / oldTotalStakeK * 100).toFixed(2) + '%' : '0%',
            winDays: oldWinDays,
            winRate: settledDaysCount > 0 ? (oldWinDays / settledDaysCount * 100).toFixed(1) + '%' : '0%'
        },
        newStrategy: {
            name: 'Phương Pháp Mới: Tín Hiệu Hồi Phục 360',
            days: settledDaysCount,
            playedDays: newPlayedDays,
            skippedDays: newSkippedDays,
            stakeM: (newTotalStakeK / 1000).toFixed(1),
            profitM: (newTotalProfitK / 1000).toFixed(1),
            roi: newTotalStakeK > 0 ? (newTotalProfitK / newTotalStakeK * 100).toFixed(2) + '%' : '0%',
            winDays: newWinDays,
            winRate: newPlayedDays > 0 ? (newWinDays / newPlayedDays * 100).toFixed(1) + '%' : '0%',
            savedStakeM: (newSavedStakeK / 1000).toFixed(1)
        },
        diff: {
            profitDiffM: ((newTotalProfitK - oldTotalProfitK) / 1000).toFixed(1),
            stakeSavedM: ((oldTotalStakeK - newTotalStakeK) / 1000).toFixed(1),
            isProfitSuperior: newTotalProfitK > oldTotalProfitK
        }
    };

    return clientPayload;
}

module.exports = {
    computeAll5AIPredictionsW,
    getParityPredictionForDate,
    computeSignalScores,
    evaluateDaySignalRebound,
    attachSignalReboundToPayload
};
