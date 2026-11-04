'use strict';

/**
 * lib/services/ai5EnsembleDeService.js
 * 
 * Động cơ tính toán Dàn Đề 50s Đồng Thuận 5 AI (Ensemble 5 AI Suite):
 * 1. Muse: score = F_all + 2 * F100
 * 2. Perplexity: score = 0.5 * F_all / N + 0.5 * F100 / 100
 * 3. Gemini: Union Core (top 10 F_all ∪ top 10 F100) + Fill (max gap ngoài core) (Điểm tầng 3/2/1/0)
 * 4. ChatGPT: Luật Union giống Gemini (Điểm tầng 3/2/1/0)
 * 5. Claude: score = F100 (số lần ĐB trong 100 kỳ gần nhất)
 * 
 * Chuẩn hóa Percentile cho từng AI: P = (100 - avg_rank) / 99
 * Điểm Ensemble: trung bình cộng 5 percentile
 * Xếp hạng giảm dần, lấy:
 *   - Top 50 số
 *   - Top 25 số VIP (Cược X2: 2M ăn 168M)
 *   - Top 26-50 số Lót (Cược X1: 1M ăn 84M)
 * 
 * 100% Strict Point-In-Time (Strict PIT): Chỉ dùng các kỳ có date < target.
 */

const fs = require('fs');
const path = require('path');

const COMPACT_PATH = path.join(process.cwd(), 'data/xsmb-2-digits-compact.json');

let _cachedDraws = null;
let _cachedWalkForwardMap = null;
let _lastCacheDrawCount = 0;

function loadCompactDraws() {
    if (_cachedDraws && _cachedDraws.length > 0) {
        return _cachedDraws;
    }
    if (fs.existsSync(COMPACT_PATH)) {
        try {
            const raw = JSON.parse(fs.readFileSync(COMPACT_PATH, 'utf8'));
            if (raw && Array.isArray(raw.data)) {
                _cachedDraws = raw.data.map(row => [row[0], Array.from(row[1])]);
                return _cachedDraws;
            }
        } catch (e) {
            console.error('[ai5EnsembleDeService] Failed to load compact json:', e.message);
        }
    }
    return [];
}

/**
 * Xếp hạng trung bình (average rank) khi hòa điểm
 */
function avgRank(vals) {
    const groups = {};
    for (let x = 0; x < 100; x++) {
        const v = vals[x] ?? 0;
        if (!groups[v]) groups[v] = [];
        groups[v].push(x);
    }
    const ranks = {};
    const sortedVals = Object.keys(groups).map(Number).sort((a, b) => b - a);
    let pos = 1;
    for (const v of sortedVals) {
        const ns = groups[v];
        const r = (pos + pos + ns.length - 1) / 2;
        for (const x of ns) {
            ranks[x] = r;
        }
        pos += ns.length;
    }
    return ranks;
}

/**
 * Chuyển hạng thành Percentile P = (100 - R) / 99
 */
function pctOf(vals) {
    const r = avgRank(vals);
    const pcts = {};
    for (let x = 0; x < 100; x++) {
        pcts[x] = (100 - r[x]) / 99;
    }
    return pcts;
}

/**
 * Trạng thái tích lũy lịch sử Đề
 */
class FastDeState {
    constructor(draws, upToIndex) {
        this.deAll = new Int32Array(100);
        this.deSeen = new Int32Array(100).fill(-1);
        const limit = upToIndex !== undefined ? Math.min(draws.length, upToIndex) : draws.length;
        for (let i = 0; i < limit; i++) {
            const db = draws[i][1][0];
            this.deAll[db]++;
            this.deSeen[db] = i;
        }
    }

    advance(i, db) {
        this.deAll[db]++;
        this.deSeen[db] = i;
    }
}

/**
 * Tính toán điểm 5 AI và Ensemble tại kỳ thứ i (Strict PIT: chỉ dùng dữ liệu < i)
 */
function computeDe5AIScores(draws, i, deAll, deSeen) {
    const nBefore = i;
    const de100 = new Int32Array(100);
    const start100 = Math.max(0, i - 100);
    for (let j = start100; j < i; j++) {
        de100[draws[j][1][0]]++;
    }

    const gapDe = new Int32Array(100);
    for (let x = 0; x < 100; x++) {
        gapDe[x] = deSeen[x] >= 0 ? (i - 1 - deSeen[x]) : i;
    }

    const deScores = {};

    // 1. Muse: F_all + 2 * F100
    const muse = {};
    for (let x = 0; x < 100; x++) {
        muse[x] = deAll[x] + 2 * de100[x];
    }
    deScores.muse = muse;

    // 2. Perplexity: 0.5 * F_all / n_before + 0.5 * F100 / 100
    const perp = {};
    for (let x = 0; x < 100; x++) {
        perp[x] = 0.5 * deAll[x] / nBefore + 0.5 * de100[x] / 100;
    }
    deScores.perplexity = perp;

    // 3. Claude: F100
    const claude = {};
    for (let x = 0; x < 100; x++) {
        claude[x] = de100[x];
    }
    deScores.claude = claude;

    // 4 & 5. Gemini & ChatGPT: Union core + fill
    const allNums = [];
    for (let x = 0; x < 100; x++) allNums.push(x);

    // top 10 F_all (highest first, smaller number on tie)
    const topFall = allNums.slice().sort((a, b) => (deAll[b] - deAll[a]) || (a - b)).slice(0, 10);
    const top100 = allNums.slice().sort((a, b) => (de100[b] - de100[a]) || (a - b)).slice(0, 10);

    const topFallSet = new Set(topFall);
    const top100Set = new Set(top100);
    const coreSet = new Set([...topFall, ...top100]);

    // fill: outside core with max gap_de, tie-break: smaller number first
    let fill = -1;
    let maxGap = -1;
    for (let x = 0; x < 100; x++) {
        if (!coreSet.has(x)) {
            const g = gapDe[x];
            if (g > maxGap) {
                maxGap = g;
                fill = x;
            } else if (g === maxGap && fill !== -1 && x < fill) {
                fill = x;
            }
        }
    }

    const uni = {};
    for (let x = 0; x < 100; x++) {
        if (topFallSet.has(x) && top100Set.has(x)) {
            uni[x] = 3;
        } else if (coreSet.has(x)) {
            uni[x] = 2;
        } else if (x === fill) {
            uni[x] = 1;
        } else {
            uni[x] = 0;
        }
    }
    deScores.gemini = uni;
    deScores.chatgpt = uni;

    // Percentiles
    const pcts = {};
    for (const ai of ['muse', 'perplexity', 'claude', 'gemini', 'chatgpt']) {
        pcts[ai] = pctOf(deScores[ai]);
    }

    // Ensemble: trung bình cộng 5 percentile
    const ens = {};
    for (let x = 0; x < 100; x++) {
        const sumPct = pcts.muse[x] + pcts.perplexity[x] + pcts.claude[x] + pcts.gemini[x] + pcts.chatgpt[x];
        ens[x] = sumPct / 5;
    }

    // Xếp hạng: điểm cao trước, hòa điểm thì số nhỏ trước (với epsilon để tránh sai số dấu phẩy động)
    const ranked = allNums.slice().sort((a, b) => {
        const diff = ens[b] - ens[a];
        if (Math.abs(diff) < 1e-12) return a - b;
        return diff;
    });

    const top50 = ranked.slice(0, 50).map(x => String(x).padStart(2, '0'));
    const top25 = ranked.slice(0, 25).map(x => String(x).padStart(2, '0'));
    const bot25 = ranked.slice(25, 50).map(x => String(x).padStart(2, '0'));

    return {
        ranking: ranked.map(x => [String(x).padStart(2, '0'), Number(ens[x].toFixed(4))]),
        top50,
        top25,
        bot25,
        ensScores: ens
    };
}

/**
 * Tính toán dàn Đề 50s cho một ngày mục tiêu cụ thể (Strict PIT)
 */
function get5AIEnsembleDeForDate(targetDate, optionalDraws = null) {
    const draws = optionalDraws || loadCompactDraws();
    if (!draws || draws.length === 0) return null;

    // Lọc các kỳ có date < targetDate
    const validDraws = draws.filter(d => d[0] < targetDate);
    const i = validDraws.length;
    if (i < 100) return null; // Cần ít nhất 100 kỳ để tính F100

    const st = new FastDeState(validDraws, i);
    const result = computeDe5AIScores(validDraws, i, st.deAll, st.deSeen);

    return {
        targetDate,
        drawsUsed: i,
        dataThrough: validDraws[i - 1][0],
        ...result
    };
}

/**
 * Tính toán walk-forward toàn bộ các ngày trong năm 2026 (hoặc danh sách dates chỉ định)
 * Dùng bộ đệm (cache) trong bộ nhớ để chạy siêu nhanh.
 */
function getAll2026EnsembleDeMap(datesList = null, optionalDraws = null) {
    const draws = optionalDraws || loadCompactDraws();
    if (!draws || draws.length === 0) return {};

    if (_cachedWalkForwardMap && _lastCacheDrawCount === draws.length && !datesList) {
        return _cachedWalkForwardMap;
    }

    // Xác định tập ngày cần tính
    let targetDates = datesList;
    if (!targetDates) {
        targetDates = draws.map(d => d[0]).filter(d => d.startsWith('2026'));
    }

    const targetDateSet = new Set(targetDates);
    const resultMap = {};

    // Tìm vị trí xuất phát (ngày đầu tiên trong targetDates)
    const firstTargetDate = targetDates[0];
    let startIdx = 0;
    while (startIdx < draws.length && draws[startIdx][0] < firstTargetDate) {
        startIdx++;
    }

    const st = new FastDeState(draws, startIdx);

    for (let i = startIdx; i < draws.length; i++) {
        const curDate = draws[i][0];
        if (targetDateSet.has(curDate) && i >= 100) {
            const res = computeDe5AIScores(draws, i, st.deAll, st.deSeen);
            resultMap[curDate] = {
                date: curDate,
                drawsUsed: i,
                top50: res.top50,
                top25: res.top25,
                bot25: res.bot25,
                ranking: res.ranking
            };
        }
        // Tiến 1 kỳ
        st.advance(i, draws[i][1][0]);
    }

    // Nếu targetDate là ngày sau kỳ cuối cùng (ví dụ hôm nay chưa có kết quả)
    const lastDrawDate = draws[draws.length - 1][0];
    const pendingDate = targetDates.find(d => d > lastDrawDate);
    if (pendingDate) {
        const res = computeDe5AIScores(draws, draws.length, st.deAll, st.deSeen);
        resultMap[pendingDate] = {
            date: pendingDate,
            drawsUsed: draws.length,
            top50: res.top50,
            top25: res.top25,
            bot25: res.bot25,
            ranking: res.ranking
        };
    }

    if (!datesList) {
        _cachedWalkForwardMap = resultMap;
        _lastCacheDrawCount = draws.length;
    }

    return resultMap;
}

module.exports = {
    loadCompactDraws,
    avgRank,
    pctOf,
    FastDeState,
    computeDe5AIScores,
    get5AIEnsembleDeForDate,
    getAll2026EnsembleDeMap
};
