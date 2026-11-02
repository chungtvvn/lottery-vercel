'use strict';

/**
 * AI 5 Stats Service
 * 
 * Quản lý dữ liệu đối soát và đồng thuận của 5 mô hình AI:
 * - ChatGPT (OpenAI)
 * - DeepSeek (DeepSeek AI)
 * - Gemini (Google)
 * - Grok (xAI)
 * - Muse (Tần suất thống kê 20 năm & chu kỳ 100 kỳ)
 * 
 * Cung cấp:
 * 1. Phương pháp Gộp 5 AI (Consensus):
 *    - Đề Gộp Top 20 (bầu chọn theo tần suất xuất hiện giữa 5 AI)
 *    - Đề Gộp VIP (các số đạt >= 4 hoặc >= 3 votes đồng thuận)
 *    - Lô Gộp Top 6 (Top 6 số được nhiều AI chọn nhất)
 * 2. Đối soát chi tiết từng AI và Dàn Gộp Consensus (Đề + Lô)
 * 3. Bảng xếp hạng và thống kê lũy kế (Leaderboard, Win Rate, PnL, ROI)
 */

const fs = require('fs');
const path = require('path');
const {
    pairTop8WithParity,
    evaluateTop8ParityXien4,
    STAKE_PER_DAN_K: XIEN4_STAKE_PER_DAN_K,
    TOTAL_DAILY_STAKE_K: XIEN4_TOTAL_DAILY_STAKE_K
} = require('./top8ParityXien4Service');

const AI_MODELS = {
    chatgpt: {
        id: 'chatgpt',
        name: 'ChatGPT',
        provider: 'OpenAI',
        icon: 'bi-robot',
        color: 'emerald',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300',
        avatar: '🟢'
    },
    deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        provider: 'DeepSeek AI',
        icon: 'bi-cpu',
        color: 'sky',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-300',
        avatar: '🔵'
    },
    gemini: {
        id: 'gemini',
        name: 'Gemini',
        provider: 'Google',
        icon: 'bi-stars',
        color: 'amber',
        badgeClass: 'bg-amber-50 text-amber-900 border-amber-300',
        avatar: '✨'
    },
    grok: {
        id: 'grok',
        name: 'Grok',
        provider: 'xAI',
        icon: 'bi-lightning-charge-fill',
        color: 'slate',
        badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
        avatar: '⚡'
    },
    muse: {
        id: 'muse',
        name: 'Muse',
        provider: 'Tần suất & Chu kỳ 100 kỳ',
        icon: 'bi-activity',
        color: 'purple',
        badgeClass: 'bg-purple-50 text-purple-800 border-purple-300',
        avatar: '🔮'
    }
};

const CONSENSUS_META = {
    id: 'consensus',
    name: 'Phương Pháp Gộp 5 AI',
    provider: 'Consensus Voting Ensemble',
    icon: 'bi-intersect',
    color: 'violet',
    badgeClass: 'bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-900 border-purple-300 font-black',
    avatar: '👑'
};

const DATA_FILE_PATH = path.join(process.cwd(), 'data', 'ai_5_stats.json');
const BACKUP_FILE_PATH = path.join(process.cwd(), 'lib', 'data', 'statistics', 'ai_5_stats.json');

// Kinh tế học chuẩn đồng nhất với Daily Advisor:
// Đề phẳng: 20 số, cược 1.000K/số = 20M/ngày (20.000K). Trúng ăn 84M (84.000K). Lãi +64M, Lỗ -20M.
// Đề đa tầng: X2 cược 2.000K/số (2M - ăn 168M), X1 cược 1.000K/số (1M - ăn 84M).
const DE_STAKE_PER_NUMBER_K = 1000;
const DE_PAYOUT_PER_HIT_K = 84000;
const DE_X2_STAKE_PER_NUMBER_K = 2000;
const DE_X2_PAYOUT_PER_HIT_K = 168000;

// Lô: 6 số phẳng, cược 2.200K/số = 13.2M/ngày (13.200K). Trúng 8.000K (8M)/nháy.
// Lô đa tầng X5..X1: cược mult * 2.200K/số, trúng mult * 8.000K/nháy.
const LO_STAKE_PER_NUMBER_K = 2200;
const LO_PAYOUT_PER_HIT_K = 8000;

function pad2(num) {
    return String(num ?? '').padStart(2, '0').slice(-2);
}

/**
 * Chuẩn hóa cấu trúc dữ liệu Xiên 4 từ nhiều định dạng:
 * 1. Object: { dan1: [4 số], dan2: [4 số], top8?: [8 số] }
 * 2. Array of 2 arrays: [ [4 số], [4 số] ] (định dạng từ JSON ChatGPT/DeepSeek/Gemini/Muse)
 * 3. Array of 8 numbers: [ 8 số ]
 */
function normalizeXien4(input) {
    if (!input) return null;

    // Trường hợp 1: Object { dan1, dan2 }
    if (typeof input === 'object' && !Array.isArray(input)) {
        if (Array.isArray(input.dan1) && Array.isArray(input.dan2) && input.dan1.length === 4 && input.dan2.length === 4) {
            const dan1 = input.dan1.map(pad2);
            const dan2 = input.dan2.map(pad2);
            return {
                dan1,
                dan2,
                top8: Array.isArray(input.top8) && input.top8.length === 8 ? input.top8.map(pad2) : [...dan1, ...dan2],
                swapped: input.swapped ?? false,
                swapDetails: input.swapDetails ?? null,
                fromConfig: input.fromConfig !== undefined ? Boolean(input.fromConfig) : true,
                source: input.source || 'json'
            };
        }
        return null;
    }

    // Trường hợp 2 & 3: Array
    if (Array.isArray(input)) {
        // Dạng [ [4 số], [4 số] ]
        if (input.length === 2 && Array.isArray(input[0]) && Array.isArray(input[1]) && input[0].length === 4 && input[1].length === 4) {
            const dan1 = input[0].map(pad2);
            const dan2 = input[1].map(pad2);
            return {
                dan1,
                dan2,
                top8: [...dan1, ...dan2],
                fromConfig: true
            };
        }

        // Dạng [ 8 số ] phẳng: tự cân bằng chẵn lẻ
        if (input.length === 8 && input.every(x => typeof x === 'string' || typeof x === 'number')) {
            const top8 = input.map(pad2);
            const paired = pairTop8WithParity(top8);
            return {
                dan1: paired.dan1,
                dan2: paired.dan2,
                top8,
                swapped: paired.swapped,
                swapDetails: paired.swapDetails,
                fromConfig: true
            };
        }
    }

    return null;
}

/**
 * Nạp dữ liệu ai_5_stats.json từ local disk hoặc R2
 */
function loadAi5StatsData() {
    let raw = null;
    if (fs.existsSync(DATA_FILE_PATH)) {
        try {
            raw = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf8'));
        } catch (_) {}
    }
    if (!raw && fs.existsSync(BACKUP_FILE_PATH)) {
        try {
            raw = JSON.parse(fs.readFileSync(BACKUP_FILE_PATH, 'utf8'));
        } catch (_) {}
    }
    if (!raw) {
        raw = {
            meta: {
                purpose: "Dataset cho trang thống kê đối soát 5 AI: ChatGPT, Gemini, Grok, DeepSeek và Muse.",
                baselines: { deHitRate: 0.2, loHitsPerDay: 1.62 }
            },
            days: []
        };
    }
    return raw;
}

/**
 * Lưu dữ liệu ai_5_stats.json
 */
function saveAi5StatsData(payload) {
    if (!payload || !payload.days) return false;
    const jsonStr = JSON.stringify(payload, null, 2);
    
    // Ghi vào data/ai_5_stats.json
    try {
        fs.mkdirSync(path.dirname(DATA_FILE_PATH), { recursive: true });
        fs.writeFileSync(DATA_FILE_PATH, jsonStr, 'utf8');
    } catch (e) {
        console.error('[ai5StatsService] Error saving to data/ai_5_stats.json:', e.message);
    }

    // Ghi vào lib/data/statistics/ai_5_stats.json
    try {
        fs.mkdirSync(path.dirname(BACKUP_FILE_PATH), { recursive: true });
        fs.writeFileSync(BACKUP_FILE_PATH, jsonStr, 'utf8');
    } catch (e) {
        console.error('[ai5StatsService] Error saving to backup path:', e.message);
    }

    return true;
}

/**
 * Chuẩn hóa sources: Nếu Grok chưa có số nhưng có Perplexity (nguồn thay thế khi Grok kẹt Cloudflare),
 * tự động map Perplexity sang Grok để đồng thuận 5 AI luôn hoạt động liền mạch và đầy đủ.
 */
function getEffectiveSources(sources = {}) {
    if (!sources || typeof sources !== 'object') return {};
    const effective = { ...sources };
    if ((!effective.grok?.de?.length) && effective.perplexity?.de?.length) {
        effective.grok = {
            ...effective.perplexity,
            method: effective.perplexity.method || 'Perplexity AI (thay thế vị trí Grok)',
            status: effective.perplexity.status || 'ok',
            isFallback: true
        };
    }
    return effective;
}

/**
 * Tính toán phương pháp gộp (Consensus) cho một ngày từ 5 nguồn AI
 * 
 * @param {Object} sources - Chứa { chatgpt, deepseek, gemini, grok, muse }
 * @returns {Object} { deTop20, deVip, deVotes, loTop6, loVotes, summary }
 */
function calculateConsensus(sources = {}) {
    const effectiveSources = getEffectiveSources(sources);
    const modelKeys = Object.keys(AI_MODELS);
    const deVotes = {};
    const loVotes = {};

    modelKeys.forEach(mKey => {
        const src = effectiveSources[mKey] || {};
        const deNums = (src.de || []).map(pad2);
        const loNums = (src.lo || []).map(pad2);

        deNums.forEach(n => {
            if (!deVotes[n]) deVotes[n] = { number: n, count: 0, models: [] };
            deVotes[n].count += 1;
            deVotes[n].models.push(mKey);
        });

        loNums.forEach(n => {
            if (!loVotes[n]) loVotes[n] = { number: n, count: 0, models: [] };
            loVotes[n].count += 1;
            loVotes[n].models.push(mKey);
        });
    });

    // Sắp xếp Đề theo số vote giảm dần, nếu bằng vote thì xếp theo số tự nhiên tăng dần
    const deList = Object.values(deVotes).sort((a, b) => b.count - a.count || Number(a.number) - Number(b.number));
    const deTop20 = deList.slice(0, 20).map(x => x.number).sort((a, b) => Number(a) - Number(b));
    const deVipTier5 = deList.filter(x => x.count === 5).map(x => x.number).sort((a, b) => Number(a) - Number(b));
    const deVipTier4 = deList.filter(x => x.count === 4).map(x => x.number).sort((a, b) => Number(a) - Number(b));
    const deVipTier3 = deList.filter(x => x.count === 3).map(x => x.number).sort((a, b) => Number(a) - Number(b));
    const deVipTier2 = deList.filter(x => x.count === 2).map(x => x.number).sort((a, b) => Number(a) - Number(b));
    const deVipTier1 = deList.filter(x => x.count === 1).map(x => x.number).sort((a, b) => Number(a) - Number(b));

    // Đề phân tầng chuẩn tương tự Daily:
    // Dàn X2 (Đồng thuận cao / VIP): Ưu tiên vote >= 4. Nếu < 10 số, nạp thêm vote 3.
    let deX2Nums = [...deVipTier5, ...deVipTier4];
    let deX1Nums = [...deVipTier3, ...deVipTier2];
    if (deX2Nums.length < 10 && deVipTier3.length > 0) {
        deX2Nums = [...deVipTier5, ...deVipTier4, ...deVipTier3].sort((a, b) => Number(a) - Number(b));
        deX1Nums = [...deVipTier2].sort((a, b) => Number(a) - Number(b));
    } else {
        deX2Nums = deX2Nums.sort((a, b) => Number(a) - Number(b));
        deX1Nums = deX1Nums.sort((a, b) => Number(a) - Number(b));
    }
    const deVip = deX2Nums;
    const deAllConsensus = [...deX2Nums, ...deX1Nums].sort((a, b) => Number(a) - Number(b));

    // Sắp xếp Lô theo số vote giảm dần, nếu bằng vote thì xếp theo số tự nhiên tăng dần
    const loList = Object.values(loVotes).sort((a, b) => b.count - a.count || Number(a.number) - Number(b.number));
    const loTop6 = loList.slice(0, 6).map(x => x.number).sort((a, b) => Number(a) - Number(b));
    const loTop8 = loList.slice(0, 8).map(x => x.number);

    // 2 Dàn Xiên 4 Tinh Hoa: Lấy từ JSON nếu có sẵn (hỗ trợ cả object và mảng 2 dàn), hoặc phân tách từ Top 8 Lô theo luật cân bằng chẵn lẻ
    let xien4 = normalizeXien4(sources.xien4) || normalizeXien4(sources.consensus?.xien4);
    if (xien4) {
        xien4.fromConfig = true;
        xien4.source = sources.xien4 ? 'json' : 'json_consensus';
    } else if (loTop8.length >= 8) {
        const paired = pairTop8WithParity(loTop8);
        xien4 = {
            dan1: paired.dan1,
            dan2: paired.dan2,
            top8: loTop8,
            swapped: paired.swapped,
            swapDetails: paired.swapDetails,
            fromConfig: false,
            source: 'top8_parity_consensus'
        };
    }

    // Lô phân tầng chuẩn X5 -> X1 tương tự Daily:
    const loTierX5 = loList.filter(x => x.count === 5).map(x => x.number).sort((a, b) => Number(a) - Number(b));
    const loTierX4 = loList.filter(x => x.count === 4).map(x => x.number).sort((a, b) => Number(a) - Number(b));
    const loTierX3 = loList.filter(x => x.count === 3).map(x => x.number).sort((a, b) => Number(a) - Number(b));
    const loTierX2 = loList.filter(x => x.count === 2).map(x => x.number).sort((a, b) => Number(a) - Number(b));
    const loTierX1 = loList.filter(x => x.count === 1).map(x => x.number).sort((a, b) => Number(a) - Number(b));

    const loMultiplierMap = {};
    loList.forEach(item => {
        loMultiplierMap[item.number] = item.count;
    });

    // Nhóm Lô đồng thuận thực chiến (>= 2 votes: X5, X4, X3, X2)
    const loHighConsensus = [...loTierX5, ...loTierX4, ...loTierX3, ...loTierX2].sort((a, b) => Number(a) - Number(b));
    // Toàn bộ Lô đa tầng gồm cả Tầng X1 (1 vote)
    const loAllTiers = [...loTierX5, ...loTierX4, ...loTierX3, ...loTierX2, ...loTierX1].sort((a, b) => Number(a) - Number(b));

    return {
        de: deTop20,
        lo: loTop6,
        deTop20,
        deVip,
        deAllConsensus,
        deTiers: {
            x2Nums: deX2Nums,
            x1Nums: deX1Nums,
            tier5: deVipTier5, // 5/5 AI đồng thuận (Kim Cương)
            tier4: deVipTier4, // 4/5 AI đồng thuận (Vàng)
            tier3: deVipTier3, // 3/5 AI đồng thuận (Bạc)
            tier2: deVipTier2, // 2/5 AI đồng thuận (Đồng)
            tier1: deVipTier1  // 1/5 AI
        },
        deVotesMap: Object.fromEntries(deList.map(x => [x.number, { count: x.count, models: x.models }])),
        loTop6,
        loTop8,
        xien4,
        loTiers: {
            x5Nums: loTierX5,
            x4Nums: loTierX4,
            x3Nums: loTierX3,
            x2Nums: loTierX2,
            x1Nums: loTierX1
        },
        loMultiplierMap,
        loHighConsensus,
        loAllTiers,
        loVotesMap: Object.fromEntries(loList.map(x => [x.number, { count: x.count, models: x.models }])),
        totalUniqueDe: deList.length,
        totalUniqueLo: loList.length
    };
}

/**
 * Trích xuất hoặc tính toán 2 Dàn Xiên 4 Tinh Hoa cho một ngày:
 * - Nếu trong JSON (dayEntry.xien4 hoặc dayEntry.sources?.consensus?.xien4) có sẵn thì lấy theo JSON.
 * - Nếu không có thì lấy 8 số Lô đầu tiên của phương pháp gộp và theo quy tắc đầu chẵn lẻ như bên Daily.
 */
function resolveDayXien4(dayEntry, consensus = null) {
    if (!dayEntry && !consensus) return null;

    // 1. Kiểm tra cấu hình có sẵn trong dayEntry.xien4 (JSON trực tiếp, hỗ trợ object hoặc mảng 2 dàn)
    const directX4 = normalizeXien4(dayEntry?.xien4);
    if (directX4) {
        return {
            ...directX4,
            source: dayEntry?.xien4?.source || directX4.source || 'json'
        };
    }

    // 2. Kiểm tra cấu hình có sẵn trong dayEntry.sources?.consensus?.xien4
    const consX4 = normalizeXien4(dayEntry?.sources?.consensus?.xien4);
    if (consX4) {
        return {
            ...consX4,
            source: 'json_consensus'
        };
    }

    // 3. Nếu consensus truyền vào đã có xien4
    if (consensus?.xien4 && Array.isArray(consensus.xien4.dan1) && Array.isArray(consensus.xien4.dan2)) {
        return consensus.xien4;
    }

    // 4. Tự động tính toán từ Top 8 Lô của Phương pháp gộp 5 AI
    const cons = consensus || (dayEntry?.sources ? calculateConsensus(dayEntry.sources) : null);
    if (!cons || !cons.loVotesMap) return null;

    if (cons.xien4 && Array.isArray(cons.xien4.dan1) && Array.isArray(cons.xien4.dan2)) {
        return cons.xien4;
    }

    const loList = Object.entries(cons.loVotesMap)
        .map(([num, obj]) => ({ num: pad2(num), count: obj.count }))
        .sort((a, b) => b.count - a.count || Number(a.num) - Number(b.num));
    const top8 = loList.slice(0, 8).map(x => x.num);
    if (top8.length < 8) return null;

    const paired = pairTop8WithParity(top8);
    return {
        dan1: paired.dan1,
        dan2: paired.dan2,
        top8,
        swapped: paired.swapped,
        swapDetails: paired.swapDetails,
        fromConfig: false,
        source: 'top8_parity_consensus'
    };
}

/**
 * Đánh giá kết quả của 1 dàn số Đề phẳng (Top 20 số, cược 1.000K/số = 20M, ăn 84M)
 */
function evaluateDe(betNumbers = [], special) {
    const specialStr = pad2(special);
    const betSet = new Set((betNumbers || []).map(pad2));
    const isHit = betSet.has(specialStr);
    const stakeK = betNumbers.length * DE_STAKE_PER_NUMBER_K;
    const payoutK = isHit ? DE_PAYOUT_PER_HIT_K : 0;
    const profitK = payoutK - stakeK;
    return {
        isHit,
        hitNumber: isHit ? specialStr : null,
        numbers: Array.from(betSet).sort((a, b) => Number(a) - Number(b)),
        count: betNumbers.length,
        stakeK,
        payoutK,
        profitK,
        isWin: profitK > 0
    };
}

/**
 * Đánh giá kết quả Đề Đa Tầng (Dàn X2 cược 2M ăn 168M + Dàn X1 cược 1M ăn 84M) tương tự Daily
 */
function evaluateDeTiered(x2Nums = [], x1Nums = [], special) {
    const specialStr = pad2(special);
    const x2Clean = (x2Nums || []).map(pad2);
    const x1Clean = (x1Nums || []).map(pad2);
    const isHitX2 = specialStr ? x2Clean.includes(specialStr) : false;
    const isHitX1 = specialStr ? x1Clean.includes(specialStr) : false;
    const isHit = isHitX2 || isHitX1;
    const hitTier = isHitX2 ? 'X2' : (isHitX1 ? 'X1' : null);

    const stakeK = (x2Clean.length * DE_X2_STAKE_PER_NUMBER_K) + (x1Clean.length * DE_STAKE_PER_NUMBER_K);
    const payoutK = isHitX2 ? DE_X2_PAYOUT_PER_HIT_K : (isHitX1 ? DE_PAYOUT_PER_HIT_K : 0);
    const profitK = payoutK - stakeK;

    return {
        isHit,
        hitNumber: isHit ? specialStr : null,
        hitTier,
        isHitX2,
        isHitX1,
        x2Nums: x2Clean,
        x1Nums: x1Clean,
        countX2: x2Clean.length,
        countX1: x1Clean.length,
        totalCount: x2Clean.length + x1Clean.length,
        stakeK,
        payoutK,
        profitK,
        isWin: profitK > 0
    };
}

/**
 * Đánh giá kết quả Lô phẳng (Top 6 số, cược 2.200K/số = 13.2M, ăn 8M/nháy)
 */
function evaluateLo(betNumbers = [], prizes27 = []) {
    const p27 = (prizes27 || []).map(pad2);
    const betSet = new Set((betNumbers || []).map(pad2));
    
    let hits = 0;
    const hitMap = {};
    p27.forEach(num => {
        if (betSet.has(num)) {
            hits++;
            hitMap[num] = (hitMap[num] || 0) + 1;
        }
    });

    const stakeK = betNumbers.length * LO_STAKE_PER_NUMBER_K;
    const payoutK = hits * LO_PAYOUT_PER_HIT_K;
    const profitK = payoutK - stakeK;
    const isWin = profitK > 0;

    return {
        hits,
        hitMap,
        hitNumbers: Object.keys(hitMap).sort((a, b) => Number(a) - Number(b)),
        numbers: Array.from(betSet).sort((a, b) => Number(a) - Number(b)),
        count: betNumbers.length,
        stakeK,
        payoutK,
        profitK,
        isWin
    };
}

/**
 * Đánh giá kết quả Lô Đa Tầng X5 đến X1 tương tự Daily:
 * Mỗi số cược = multiplier * 2.200K (2.2M x Hệ số), mỗi nháy trúng = multiplier * 8.000K (8M x Hệ số)
 */
function evaluateLoTiered(loMultiplierMap = {}, prizes27 = [], targetNums = null) {
    const p27 = (prizes27 || []).map(pad2);
    const nums = (targetNums || Object.keys(loMultiplierMap)).map(pad2);

    const hitCountMap = {};
    p27.forEach(num => {
        hitCountMap[num] = (hitCountMap[num] || 0) + 1;
    });

    let stakeK = 0;
    let payoutK = 0;
    let totalHits = 0;
    const hitNumbers = [];
    const breakdown = {};

    nums.forEach(num => {
        const mult = loMultiplierMap[num] || 1;
        const numStake = mult * LO_STAKE_PER_NUMBER_K;
        const h = hitCountMap[num] || 0;
        const numPayout = h * (mult * LO_PAYOUT_PER_HIT_K);

        stakeK += numStake;
        payoutK += numPayout;
        totalHits += h;
        if (h > 0) hitNumbers.push(num);

        breakdown[num] = {
            mult,
            hits: h,
            stakeK: numStake,
            payoutK: numPayout,
            profitK: numPayout - numStake
        };
    });

    const profitK = payoutK - stakeK;
    const isWin = profitK > 0;

    return {
        hits: totalHits,
        hitNumbers: hitNumbers.sort((a, b) => Number(a) - Number(b)),
        breakdown,
        numbers: nums.sort((a, b) => Number(a) - Number(b)),
        count: nums.length,
        stakeK,
        payoutK,
        profitK,
        isWin
    };
}

/**
 * Đối soát 1 ngày cụ thể với kết quả XSMB thật
 * 
 * @param {Object} dayEntry - Một phần tử trong data.days
 * @param {Object} actualDraw - { special, prizes27 } hoặc raw row
 * @returns {Object} dayEntry đã được cập nhật kết quả và đối soát
 */
function settleDay(dayEntry, actualDraw) {
    if (!dayEntry || !actualDraw) return dayEntry;

    let special = actualDraw.special;
    if (typeof special === 'number' || typeof special === 'string') {
        special = pad2(special);
    }

    let prizes27 = [];
    if (Array.isArray(actualDraw.prizes27) && actualDraw.prizes27.length === 27) {
        prizes27 = actualDraw.prizes27.map(pad2);
    } else if (Array.isArray(actualDraw.actual27) && actualDraw.actual27.length === 27) {
        prizes27 = actualDraw.actual27.map(pad2);
    } else {
        const { get27Prizes } = require('./loDualMergeAdvisorService');
        prizes27 = get27Prizes(actualDraw);
    }

    if (!special || prizes27.length !== 27) {
        throw new Error(`Dữ liệu kết quả XSMB không đủ: special=${special}, prizes27.length=${prizes27.length}`);
    }

    dayEntry.special = special;
    dayEntry.prizes27 = prizes27;

    const sources = dayEntry.sources || {};
    const effectiveSources = getEffectiveSources(sources);
    const consensus = calculateConsensus(effectiveSources);

    const results = {};
    const modelKeys = Object.keys(AI_MODELS);

    modelKeys.forEach(mKey => {
        const src = effectiveSources[mKey] || {};
        const deRes = evaluateDe(src.de || [], special);
        const loRes = evaluateLo(src.lo || [], prizes27);

        // Kiểm tra nếu model có riêng xien4 trong json (hỗ trợ cả object và mảng 2 dàn)
        let modelXien4 = null;
        const normModelX4 = normalizeXien4(src.xien4);
        if (normModelX4 && normModelX4.dan1?.length === 4 && normModelX4.dan2?.length === 4) {
            modelXien4 = evaluateTop8ParityXien4(normModelX4.dan1, normModelX4.dan2, prizes27);
            modelXien4.dan1 = normModelX4.dan1;
            modelXien4.dan2 = normModelX4.dan2;
            modelXien4.top8 = normModelX4.top8;
            modelXien4.fromConfig = true;
        }

        const x4Stake = modelXien4 ? modelXien4.stakeK : 0;
        const x4Payout = modelXien4 ? modelXien4.payoutK : 0;
        const totalStakeK = deRes.stakeK + loRes.stakeK + x4Stake;
        const totalPayoutK = deRes.payoutK + loRes.payoutK + x4Payout;
        const totalProfitK = totalPayoutK - totalStakeK;
        const isWin = totalProfitK > 0;

        results[mKey] = {
            de: deRes,
            lo: loRes,
            xien4: modelXien4,
            totalStakeK,
            totalPayoutK,
            totalProfitK,
            isWin
        };
    });

    // Đối soát Dàn Gộp Consensus (Phương pháp Gộp Đa Tầng tương tự Daily):
    // 1. Dàn Đề Đa Tầng X2 & X1 (tương tự Daily: Dàn VIP X2 cược 2M ăn 168M, Dàn Lót X1 cược 1M ăn 84M)
    const consDeTiered = evaluateDeTiered(consensus.deTiers.x2Nums, consensus.deTiers.x1Nums, special);

    // 2. Dàn Lô Đa Tầng X5 đến X1 (tương tự Daily: Cược theo hệ số votes X5..X1)
    const consLoTiered = evaluateLoTiered(consensus.loMultiplierMap, prizes27, consensus.loAllTiers || consensus.loHighConsensus);
    
    // 3. 2 Dàn Xiên 4 Tinh Hoa (Top 8 Lô chẵn/lẻ hoặc theo JSON)
    const xien4Resolved = resolveDayXien4(dayEntry, consensus);
    let consXien4 = null;
    if (xien4Resolved && xien4Resolved.dan1?.length === 4 && xien4Resolved.dan2?.length === 4) {
        consXien4 = evaluateTop8ParityXien4(xien4Resolved.dan1, xien4Resolved.dan2, prizes27);
        consXien4.dan1 = xien4Resolved.dan1;
        consXien4.dan2 = xien4Resolved.dan2;
        consXien4.top8 = xien4Resolved.top8 || [...xien4Resolved.dan1, ...xien4Resolved.dan2];
        consXien4.swapped = xien4Resolved.swapped || false;
        consXien4.swapDetails = xien4Resolved.swapDetails || null;
        consXien4.fromConfig = Boolean(xien4Resolved.fromConfig);
        consXien4.source = xien4Resolved.source;
    }

    const consX4Stake = consXien4 ? consXien4.stakeK : 0;
    const consX4Payout = consXien4 ? consXien4.payoutK : 0;
    const consX4Profit = consXien4 ? consXien4.profitK : 0;

    const consTieredTotalStakeK = consDeTiered.stakeK + consLoTiered.stakeK + consX4Stake;
    const consTieredTotalPayoutK = consDeTiered.payoutK + consLoTiered.payoutK + consX4Payout;
    const consTieredTotalProfitK = consTieredTotalPayoutK - consTieredTotalStakeK;

    // Giữ thêm đối soát Dàn Phẳng (Top 20 Đề phẳng & Top 6 Lô phẳng & Xiên 4) để tham chiếu
    const consDeFlat = evaluateDe(consensus.deTop20, special);
    const consLoFlat = evaluateLo(consensus.loTop6, prizes27);
    const consFlatTotalStakeK = consDeFlat.stakeK + consLoFlat.stakeK + consX4Stake;
    const consFlatTotalPayoutK = consDeFlat.payoutK + consLoFlat.payoutK + consX4Payout;
    const consFlatTotalProfitK = consFlatTotalPayoutK - consFlatTotalStakeK;

    // Consensus chính thức sử dụng Phương Pháp Đa Tầng (Tiered) làm phương pháp cốt lõi
    results.consensus = {
        de: consDeTiered,
        lo: consLoTiered,
        xien4: consXien4,
        deTiered: consDeTiered,
        loTiered: consLoTiered,
        flat: {
            de: consDeFlat,
            lo: consLoFlat,
            xien4: consXien4,
            totalStakeK: consFlatTotalStakeK,
            totalPayoutK: consFlatTotalPayoutK,
            totalProfitK: consFlatTotalProfitK,
            isWin: consFlatTotalProfitK > 0
        },
        consensusDetails: {
            deTiers: consensus.deTiers,
            loTiers: consensus.loTiers,
            deVotesMap: consensus.deVotesMap,
            loVotesMap: consensus.loVotesMap,
            loMultiplierMap: consensus.loMultiplierMap,
            loHighConsensus: consensus.loHighConsensus,
            loAllTiers: consensus.loAllTiers,
            xien4: xien4Resolved
        },
        totalStakeK: consTieredTotalStakeK,
        totalPayoutK: consTieredTotalPayoutK,
        totalProfitK: consTieredTotalProfitK,
        isWin: consTieredTotalProfitK > 0,
        tieredStakeK: consTieredTotalStakeK,
        tieredPayoutK: consTieredTotalPayoutK,
        tieredProfitK: consTieredTotalProfitK,
        isTieredWin: consTieredTotalProfitK > 0
    };

    dayEntry.xien4 = xien4Resolved;
    dayEntry.results = results;
    dayEntry.resultsTiered = {
        consensus: {
            de: consDeTiered,
            lo: consLoTiered,
            xien4: consXien4,
            stakeK: consTieredTotalStakeK,
            payoutK: consTieredTotalPayoutK,
            profitK: consTieredTotalProfitK,
            isWin: consTieredTotalProfitK > 0
        }
    };
    return dayEntry;
}

/**
 * Tính toán lại toàn bộ tỷ lệ lũy kế (rates) cho tất cả các ngày đã đối soát
 */
function recomputeAllRates(dataPayload) {
    if (!dataPayload || !Array.isArray(dataPayload.days)) return dataPayload;

    // Sắp xếp ngày tăng dần theo thời gian để tính lũy kế chuẩn
    const sortedDays = [...dataPayload.days].sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const runningStats = {
        consensus: createEmptyTracker('consensus', CONSENSUS_META.name)
    };
    Object.keys(AI_MODELS).forEach(mKey => {
        runningStats[mKey] = createEmptyTracker(mKey, AI_MODELS[mKey].name);
    });

    sortedDays.forEach(day => {
        if (!day.results) {
            day.rates = null;
            return;
        }

        const dayRates = {};

        Object.keys(runningStats).forEach(key => {
            const res = day.results[key];
            if (!res || !res.de || !res.lo) return;

            const t = runningStats[key];
            t.days += 1;

            // Đề
            t.de.days = (t.de.days || 0) + 1;
            t.de.stakeK += res.de.stakeK;
            t.de.payoutK += res.de.payoutK;
            t.de.profitK += res.de.profitK;
            if (res.de.isHit) {
                t.de.wins += 1;
                t.de.currentWinStreak += 1;
                t.de.currentLossStreak = 0;
                if (t.de.currentWinStreak > t.de.longestWin) t.de.longestWin = t.de.currentWinStreak;
            } else {
                t.de.losses += 1;
                t.de.currentLossStreak += 1;
                t.de.currentWinStreak = 0;
                if (t.de.currentLossStreak > t.de.longestLoss) t.de.longestLoss = t.de.currentLossStreak;
            }
            t.de.winRate = Number((t.de.wins / t.days).toFixed(4));
            t.de.roi = t.de.stakeK > 0 ? Number((t.de.profitK / t.de.stakeK).toFixed(4)) : 0;

            // Lô
            t.lo.days = (t.lo.days || 0) + 1;
            t.lo.stakeK += res.lo.stakeK;
            t.lo.payoutK += res.lo.payoutK;
            t.lo.profitK += res.lo.profitK;
            t.lo.totalHits += res.lo.hits;
            if (res.lo.isWin) {
                t.lo.wins += 1;
                t.lo.currentWinStreak += 1;
                t.lo.currentLossStreak = 0;
                if (t.lo.currentWinStreak > t.lo.longestWin) t.lo.longestWin = t.lo.currentWinStreak;
            } else {
                t.lo.losses += 1;
                t.lo.currentLossStreak += 1;
                t.lo.currentWinStreak = 0;
                if (t.lo.currentLossStreak > t.lo.longestLoss) t.lo.longestLoss = t.lo.currentLossStreak;
            }
            t.lo.winRate = Number((t.lo.wins / t.days).toFixed(4));
            t.lo.avgHitsPerDay = Number((t.lo.totalHits / t.days).toFixed(2));
            t.lo.roi = t.lo.stakeK > 0 ? Number((t.lo.profitK / t.lo.stakeK).toFixed(4)) : 0;

            // Xiên 4 (Lũy kế riêng để theo dõi độc lập)
            if (res.xien4 && t.xien4) {
                t.xien4.days += 1;
                t.xien4.stakeK += res.xien4.stakeK;
                t.xien4.payoutK += res.xien4.payoutK;
                t.xien4.profitK += res.xien4.profitK;
                t.xien4.h4Count += (res.xien4.h4Count || 0);
                t.xien4.h3Count += (res.xien4.h3Count || 0);
                t.xien4.h2Count += (res.xien4.h2Count || 0);
                if (res.xien4.isWin) {
                    t.xien4.wins += 1;
                    t.xien4.currentWinStreak += 1;
                    t.xien4.currentLossStreak = 0;
                    if (t.xien4.currentWinStreak > t.xien4.longestWin) t.xien4.longestWin = t.xien4.currentWinStreak;
                } else {
                    t.xien4.losses += 1;
                    t.xien4.currentLossStreak += 1;
                    t.xien4.currentWinStreak = 0;
                    if (t.xien4.currentLossStreak > t.xien4.longestLoss) t.xien4.longestLoss = t.xien4.currentLossStreak;
                }
                t.xien4.winRate = t.xien4.days > 0 ? Number((t.xien4.wins / t.xien4.days).toFixed(4)) : 0;
                t.xien4.roi = t.xien4.stakeK > 0 ? Number((t.xien4.profitK / t.xien4.stakeK).toFixed(4)) : 0;
            }

            // Combo (Tổng hợp Đề + Lô + Xiên 4)
            t.combo.days = (t.combo.days || 0) + 1;
            t.combo.stakeK += res.totalStakeK;
            t.combo.payoutK += res.totalPayoutK;
            t.combo.profitK += res.totalProfitK;
            if (res.isWin) t.combo.wins += 1;
            t.combo.winRate = Number((t.combo.wins / t.days).toFixed(4));
            t.combo.roi = t.combo.stakeK > 0 ? Number((t.combo.profitK / t.combo.stakeK).toFixed(4)) : 0;

            // Tracking cho Consensus Đa Tầng (Tiered)
            if (key === 'consensus' && res.deTiered && res.loTiered && t.deTiered && t.loTiered) {
                // Đề Tiered
                t.deTiered.days = (t.deTiered.days || 0) + 1;
                t.deTiered.stakeK += res.deTiered.stakeK;
                t.deTiered.payoutK += res.deTiered.payoutK;
                t.deTiered.profitK += res.deTiered.profitK;
                if (res.deTiered.isHit) t.deTiered.wins += 1;
                else t.deTiered.losses += 1;
                t.deTiered.winRate = Number((t.deTiered.wins / t.days).toFixed(4));
                t.deTiered.roi = t.deTiered.stakeK > 0 ? Number((t.deTiered.profitK / t.deTiered.stakeK).toFixed(4)) : 0;

                // Lô Tiered
                t.loTiered.days = (t.loTiered.days || 0) + 1;
                t.loTiered.stakeK += res.loTiered.stakeK;
                t.loTiered.payoutK += res.loTiered.payoutK;
                t.loTiered.profitK += res.loTiered.profitK;
                t.loTiered.totalHits += res.loTiered.hits;
                if (res.loTiered.isWin) t.loTiered.wins += 1;
                else t.loTiered.losses += 1;
                t.loTiered.winRate = Number((t.loTiered.wins / t.days).toFixed(4));
                t.loTiered.roi = t.loTiered.stakeK > 0 ? Number((t.loTiered.profitK / t.loTiered.stakeK).toFixed(4)) : 0;
            }

            // Snapshot tỷ lệ tại ngày này
            dayRates[key] = {
                days: t.days,
                de: { ...t.de },
                lo: { ...t.lo },
                xien4: { ...t.xien4 },
                combo: { ...t.combo }
            };
            if (key === 'consensus') {
                dayRates[key].deTiered = { ...t.deTiered };
                dayRates[key].loTiered = { ...t.loTiered };
            }
        });

        day.rates = dayRates;
    });

    dataPayload.summary = runningStats;
    dataPayload.days = sortedDays;
    return dataPayload;
}

function createEmptyTracker(id, name) {
    const base = {
        id,
        name,
        days: 0,
        de: {
            days: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            stakeK: 0,
            payoutK: 0,
            profitK: 0,
            roi: 0,
            longestWin: 0,
            longestLoss: 0,
            currentWinStreak: 0,
            currentLossStreak: 0
        },
        lo: {
            days: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            totalHits: 0,
            avgHitsPerDay: 0,
            stakeK: 0,
            payoutK: 0,
            profitK: 0,
            roi: 0,
            longestWin: 0,
            longestLoss: 0,
            currentWinStreak: 0,
            currentLossStreak: 0
        },
        xien4: {
            days: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            stakeK: 0,
            payoutK: 0,
            profitK: 0,
            roi: 0,
            h4Count: 0,
            h3Count: 0,
            h2Count: 0,
            longestWin: 0,
            longestLoss: 0,
            currentWinStreak: 0,
            currentLossStreak: 0
        },
        combo: {
            days: 0,
            wins: 0,
            winRate: 0,
            stakeK: 0,
            payoutK: 0,
            profitK: 0,
            roi: 0
        }
    };

    if (id === 'consensus') {
        base.deTiered = {
            days: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            stakeK: 0,
            payoutK: 0,
            profitK: 0,
            roi: 0
        };
        base.loTiered = {
            days: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            totalHits: 0,
            stakeK: 0,
            payoutK: 0,
            profitK: 0,
            roi: 0
        };
    }

    return base;
}

/**
 * Tính dự đoán của Muse theo đúng công thức meta.museMethod:
 * điểm Đề(n) = tần suất ĐB toàn lịch sử + 2 × tần suất ĐB 100 kỳ gần nhất;
 * điểm Lô(n) = tần suất tổng 27 giải toàn lịch sử + 2 × tần suất tổng 27 giải 100 kỳ gần nhất;
 * lấy top 20 Đề / top 6 Lô, hòa điểm lấy số nhỏ trước.
 */
function computeMusePredictions(rawRows = []) {
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
        return { de: [], lo: [] };
    }

    const { get27Prizes } = require('./loDualMergeAdvisorService');
    const last100 = rawRows.slice(-100);

    const deScore = new Float64Array(100);
    const loScore = new Float64Array(100);

    rawRows.forEach(r => {
        const sp = Number(String(r.special ?? '').padStart(2, '0').slice(-2));
        if (sp >= 0 && sp < 100) deScore[sp] += 1;
        const p27 = get27Prizes(r);
        p27.forEach(p => {
            const u = Number(p);
            if (u >= 0 && u < 100) loScore[u] += 1;
        });
    });

    last100.forEach(r => {
        const sp = Number(String(r.special ?? '').padStart(2, '0').slice(-2));
        if (sp >= 0 && sp < 100) deScore[sp] += 2;
        const p27 = get27Prizes(r);
        p27.forEach(p => {
            const u = Number(p);
            if (u >= 0 && u < 100) loScore[u] += 2;
        });
    });

    const top20De = Array.from({ length: 100 }, (_, i) => ({ n: pad2(i), s: deScore[i] }))
        .sort((a, b) => b.s - a.s || Number(a.n) - Number(b.n))
        .slice(0, 20)
        .map(x => x.n)
        .sort((a, b) => Number(a) - Number(b));

    const top6Lo = Array.from({ length: 100 }, (_, i) => ({ n: pad2(i), s: loScore[i] }))
        .sort((a, b) => b.s - a.s || Number(a.n) - Number(b.n))
        .slice(0, 6)
        .map(x => x.n)
        .sort((a, b) => Number(a) - Number(b));

    return {
        de: top20De,
        lo: top6Lo
    };
}

/**
 * Tạo dữ liệu hoàn chỉnh để phục vụ Client Frontend / API
 */
function buildClientPayload() {
    const data = loadAi5StatsData();
    recomputeAllRates(data);

    const days = [...(data.days || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(day => {
        const consensus = day.sources ? calculateConsensus(day.sources) : null;
        const xien4 = resolveDayXien4(day, consensus);
        if (consensus && xien4) {
            consensus.xien4 = xien4;
        }

        // Chuẩn hóa xien4 trong sources của từng AI model để frontend luôn nhận dạng nhất quán
        let normalizedSources = null;
        if (day.sources) {
            normalizedSources = {};
            for (const [k, v] of Object.entries(day.sources)) {
                if (v && v.xien4) {
                    const norm = normalizeXien4(v.xien4);
                    normalizedSources[k] = {
                        ...v,
                        xien4: norm || v.xien4
                    };
                } else {
                    normalizedSources[k] = v;
                }
            }
        }

        return {
            ...day,
            sources: normalizedSources || day.sources,
            consensus,
            xien4
        };
    });

    // Xác định ngày thực chiến mục tiêu (actionable day):
    // Ưu tiên ngày chưa kết toán sớm nhất mà đã nạp dữ liệu dự đoán (ví dụ hôm nay 31/10 đang chờ quay 18h30)
    const unsettledDays = days.filter(d => !(d.special && Array.isArray(d.prizes27) && d.prizes27.length === 27 && d.results));
    const sortedUnsettled = [...unsettledDays].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    
    // Tìm ngày chưa kết toán có đủ 5 AI, nếu không thì ngày có ít nhất 1 AI
    const activeDay = sortedUnsettled.find(d => {
        const src = getEffectiveSources(d.sources || {});
        const readyCount = Object.keys(AI_MODELS).filter(k => (src[k]?.de?.length >= 20 && src[k]?.lo?.length >= 6)).length;
        return readyCount >= 5;
    }) || sortedUnsettled.find(d => {
        const src = getEffectiveSources(d.sources || {});
        const readyCount = Object.keys(AI_MODELS).filter(k => (src[k]?.de?.length >= 20 || src[k]?.lo?.length >= 6)).length;
        return readyCount > 0;
    }) || days[0];

    const latestDay = activeDay || days[0] || null;

    let todayConsensus = null;
    if (latestDay && latestDay.sources) {
        todayConsensus = latestDay.consensus || calculateConsensus(latestDay.sources);
        const x4 = resolveDayXien4(latestDay, todayConsensus);
        if (todayConsensus && x4) {
            todayConsensus.xien4 = x4;
        }
    }

    // Leaderboard
    const summary = data.summary || {};
    const leaderboard = [
        summary.consensus || createEmptyTracker('consensus', CONSENSUS_META.name),
        ...Object.keys(AI_MODELS).map(k => summary[k] || createEmptyTracker(k, AI_MODELS[k].name))
    ].sort((a, b) => (b.combo?.profitK || 0) - (a.combo?.profitK || 0));

    // Lịch sử đối soát: Nếu ngày hôm nay chưa có kết quả,
    // tuyệt đối KHÔNG hiển thị nhật ký đối soát của ngày hôm sau (d.date > latestDay.date)
    const isLatestSettled = Boolean(latestDay?.special && Array.isArray(latestDay?.prizes27) && latestDay.prizes27.length === 27 && latestDay.results);
    const visibleHistory = days.filter(d => {
        if (!latestDay) return true;
        const isDaySettled = Boolean(d.special && Array.isArray(d.prizes27) && d.prizes27.length === 27 && d.results);
        if (isDaySettled) return true;
        // Ngày chưa kết toán: Chỉ cho phép hiển thị nếu ngày đó <= ngày mục tiêu hôm nay
        return String(d.date) <= String(latestDay.date);
    });

    return {
        success: true,
        meta: data.meta || {},
        models: AI_MODELS,
        consensusMeta: CONSENSUS_META,
        latestDate: latestDay?.date || null,
        isLatestSettled,
        latestDay,
        todayConsensus,
        leaderboard,
        summary,
        history: visibleHistory
    };
}

module.exports = {
    AI_MODELS,
    CONSENSUS_META,
    DATA_FILE_PATH,
    BACKUP_FILE_PATH,
    XIEN4_STAKE_PER_DAN_K,
    XIEN4_TOTAL_DAILY_STAKE_K,
    normalizeXien4,
    getEffectiveSources,
    resolveDayXien4,
    loadAi5StatsData,
    saveAi5StatsData,
    calculateConsensus,
    evaluateDe,
    evaluateDeTiered,
    evaluateLo,
    evaluateLoTiered,
    evaluateTop8ParityXien4,
    pairTop8WithParity,
    settleDay,
    recomputeAllRates,
    computeMusePredictions,
    buildClientPayload
};
