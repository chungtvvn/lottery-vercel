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

// Kinh tế học chuẩn:
// Đề: 20 số, cược 1K/số = 20K/ngày. Trúng ăn 84K. Lãi +64K, Lỗ -20K.
const DE_STAKE_PER_NUMBER_K = 1;
const DE_PAYOUT_PER_HIT_K = 84;

// Lô: 6 số, cược 22K/số = 132K/ngày. Trúng 80K/nháy.
const LO_STAKE_PER_NUMBER_K = 22;
const LO_PAYOUT_PER_HIT_K = 80;

function pad2(num) {
    return String(num ?? '').padStart(2, '0').slice(-2);
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
 * Tính toán phương pháp gộp (Consensus) cho một ngày từ 5 nguồn AI
 * 
 * @param {Object} sources - Chứa { chatgpt, deepseek, gemini, grok, muse }
 * @returns {Object} { deTop20, deVip, deVotes, loTop6, loVotes, summary }
 */
function calculateConsensus(sources = {}) {
    const modelKeys = Object.keys(AI_MODELS);
    const deVotes = {};
    const loVotes = {};

    modelKeys.forEach(mKey => {
        const src = sources[mKey] || {};
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
    const deVipTier5 = deList.filter(x => x.count === 5).map(x => x.number);
    const deVipTier4 = deList.filter(x => x.count === 4).map(x => x.number);
    const deVipTier3 = deList.filter(x => x.count === 3).map(x => x.number);
    const deVipTier2 = deList.filter(x => x.count === 2).map(x => x.number);
    const deVip = [...deVipTier5, ...deVipTier4]; // Các số đạt >= 4 votes

    // Sắp xếp Lô theo số vote giảm dần, nếu bằng vote thì xếp theo số tự nhiên tăng dần
    const loList = Object.values(loVotes).sort((a, b) => b.count - a.count || Number(a.number) - Number(b.number));
    const loTop6 = loList.slice(0, 6).map(x => x.number).sort((a, b) => Number(a) - Number(b));

    return {
        de: deTop20,
        lo: loTop6,
        deTop20,
        deVip,
        deTiers: {
            tier5: deVipTier5, // 5/5 AI đồng thuận (Kim Cương)
            tier4: deVipTier4, // 4/5 AI đồng thuận (Vàng)
            tier3: deVipTier3, // 3/5 AI đồng thuận (Bạc)
            tier2: deVipTier2  // 2/5 AI đồng thuận (Đồng)
        },
        deVotesMap: Object.fromEntries(deList.map(x => [x.number, { count: x.count, models: x.models }])),
        loTop6,
        loVotesMap: Object.fromEntries(loList.map(x => [x.number, { count: x.count, models: x.models }])),
        totalUniqueDe: deList.length,
        totalUniqueLo: loList.length
    };
}

/**
 * Đánh giá kết quả của 1 dàn số (Đề hoặc Lô)
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

function evaluateLo(betNumbers = [], prizes27 = []) {
    const p27 = (prizes27 || []).map(pad2);
    const betSet = new Set((betNumbers || []).map(pad2));
    
    // Đếm số nháy (mỗi lần xuất hiện trong 27 giải tính 1 nháy)
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
    const consensus = calculateConsensus(sources);

    const results = {};
    const modelKeys = Object.keys(AI_MODELS);

    modelKeys.forEach(mKey => {
        const src = sources[mKey] || {};
        const deRes = evaluateDe(src.de || [], special);
        const loRes = evaluateLo(src.lo || [], prizes27);
        const totalStakeK = deRes.stakeK + loRes.stakeK;
        const totalPayoutK = deRes.payoutK + loRes.payoutK;
        const totalProfitK = totalPayoutK - totalStakeK;
        const isWin = totalProfitK > 0;

        results[mKey] = {
            de: deRes,
            lo: loRes,
            totalStakeK,
            totalPayoutK,
            totalProfitK,
            isWin
        };
    });

    // Đối soát Dàn Gộp Consensus (Top 20 Đề + Top 6 Lô)
    const consDeRes = evaluateDe(consensus.deTop20, special);
    const consLoRes = evaluateLo(consensus.loTop6, prizes27);
    const consTotalStakeK = consDeRes.stakeK + consLoRes.stakeK;
    const consTotalPayoutK = consDeRes.payoutK + consLoRes.payoutK;
    const consTotalProfitK = consTotalPayoutK - consTotalStakeK;

    results.consensus = {
        de: consDeRes,
        lo: consLoRes,
        consensusDetails: {
            deTiers: consensus.deTiers,
            deVotesMap: consensus.deVotesMap,
            loVotesMap: consensus.loVotesMap
        },
        totalStakeK: consTotalStakeK,
        totalPayoutK: consTotalPayoutK,
        totalProfitK: consTotalProfitK,
        isWin: consTotalProfitK > 0
    };

    dayEntry.results = results;
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
            if (!res) return;

            const t = runningStats[key];
            t.days += 1;

            // Đề
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

            // Combo
            t.combo.stakeK += res.totalStakeK;
            t.combo.payoutK += res.totalPayoutK;
            t.combo.profitK += res.totalProfitK;
            if (res.isWin) t.combo.wins += 1;
            t.combo.winRate = Number((t.combo.wins / t.days).toFixed(4));
            t.combo.roi = t.combo.stakeK > 0 ? Number((t.combo.profitK / t.combo.stakeK).toFixed(4)) : 0;

            // Snapshot tỷ lệ tại ngày này
            dayRates[key] = {
                days: t.days,
                de: { ...t.de },
                lo: { ...t.lo },
                combo: { ...t.combo }
            };
        });

        day.rates = dayRates;
    });

    dataPayload.summary = runningStats;
    dataPayload.days = sortedDays;
    return dataPayload;
}

function createEmptyTracker(id, name) {
    return {
        id,
        name,
        days: 0,
        de: {
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
        combo: {
            wins: 0,
            winRate: 0,
            stakeK: 0,
            payoutK: 0,
            profitK: 0,
            roi: 0
        }
    };
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

    const days = [...(data.days || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const latestDay = days[0] || null;

    let todayConsensus = null;
    if (latestDay && latestDay.sources) {
        todayConsensus = calculateConsensus(latestDay.sources);
    }

    // Leaderboard
    const summary = data.summary || {};
    const leaderboard = [
        summary.consensus || createEmptyTracker('consensus', CONSENSUS_META.name),
        ...Object.keys(AI_MODELS).map(k => summary[k] || createEmptyTracker(k, AI_MODELS[k].name))
    ].sort((a, b) => (b.combo?.profitK || 0) - (a.combo?.profitK || 0));

    return {
        success: true,
        meta: data.meta || {},
        models: AI_MODELS,
        consensusMeta: CONSENSUS_META,
        latestDate: latestDay?.date || null,
        isLatestSettled: Boolean(latestDay?.special && latestDay?.prizes27?.length === 27),
        latestDay,
        todayConsensus,
        leaderboard,
        summary,
        history: days
    };
}

module.exports = {
    AI_MODELS,
    CONSENSUS_META,
    DATA_FILE_PATH,
    BACKUP_FILE_PATH,
    loadAi5StatsData,
    saveAi5StatsData,
    calculateConsensus,
    evaluateDe,
    evaluateLo,
    settleDay,
    recomputeAllRates,
    computeMusePredictions,
    buildClientPayload
};
