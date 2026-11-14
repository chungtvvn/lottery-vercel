'use strict';

/**
 * scripts/multi-year-ai5-de-lo-research.js
 * 
 * Nghiên cứu & Backtest Toàn Diện 5 Năm (2022 - 2026, 1758 kỳ mở thưởng)
 * 1. ĐỀ 5 AI:
 *    - Cửa sổ W = 100 vs W = 365
 *    - Chọn số theo vị trí: Top 12 X2, Dàn 17s (12 X2 + 5 X1), Dàn 17s X2 thuần, Dàn 35s, Dàn 50s, 2 con cuối X1, Phần đuôi > 35.
 * 2. LÔ 5 AI:
 *    - Cửa sổ W = 100 vs W = 365
 *    - Chọn số theo vị trí: Top 2, Top 6, Top 7, Top 10, Top 14, Top 20, Đa tầng Lô.
 * 3. COMBO ĐA TẦNG ĐỀ + LÔ:
 *    - Hiệu quả từng năm 2022, 2023, 2024, 2025, 2026 và tổng hợp 5 năm.
 * 
 * 100% Strict Point-In-Time (Strict PIT).
 */

const fs = require('fs');
const path = require('path');

const COMPACT_PATH = path.join(__dirname, '../data/xsmb-2-digits-compact.json');

// Đơn vị kinh tế học chuẩn SSOT
const MULTIPLIER_DE = 84;
const DE_X2_UNIT_M = 2.0;
const DE_X1_UNIT_M = 1.0;
const DE_X2_PAYOUT_M = DE_X2_UNIT_M * MULTIPLIER_DE; // 168M
const DE_X1_PAYOUT_M = DE_X1_UNIT_M * MULTIPLIER_DE; // 84M

const LO_STAKE_UNIT_M = 2.2;  // 100 điểm = 2.2M / số
const LO_PAYOUT_HIT_M = 8.0;  // 1 nháy = 8.0M / nháy

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
        for (const x of ns) ranks[x] = r;
        pos += ns.length;
    }
    return ranks;
}

function pctOf(vals) {
    const r = avgRank(vals);
    const pcts = {};
    for (let x = 0; x < 100; x++) pcts[x] = (100 - r[x]) / 99;
    return pcts;
}

function zscore(vals) {
    let sum = 0;
    for (let x = 0; x < 100; x++) sum += vals[x];
    const m = sum / 100;
    let varSum = 0;
    for (let x = 0; x < 100; x++) varSum += (vals[x] - m) ** 2;
    const s = Math.sqrt(varSum / 100) || 1e-6;
    const z = {};
    for (let x = 0; x < 100; x++) z[x] = (vals[x] - m) / s;
    return z;
}

function numStr(n) {
    return String(n).padStart(2, '0');
}

function getParityForm(s) {
    const d = typeof s === 'string' ? s : numStr(s);
    const h = parseInt(d[0], 10) % 2 === 0 ? 'C' : 'L';
    const t = parseInt(d[1], 10) % 2 === 0 ? 'C' : 'L';
    return h + t;
}

const OPP_MAP = { 'LL': 'CC', 'CC': 'LL', 'CL': 'LC', 'LC': 'CL' };

// Trạng thái lịch sử
class FastMultiState {
    constructor(draws, upToIndex) {
        this.deAll = new Int32Array(100);
        this.loAll = new Int32Array(100);
        this.deSeen = new Int32Array(100).fill(-1);
        this.loSeen = new Int32Array(100).fill(-1);

        const limit = upToIndex !== undefined ? Math.min(draws.length, upToIndex) : draws.length;
        for (let i = 0; i < limit; i++) {
            const row = draws[i][1];
            const db = row[0];
            this.deAll[db]++;
            this.deSeen[db] = i;
            for (let j = 0; j < row.length; j++) {
                const x = row[j];
                this.loAll[x]++;
                this.loSeen[x] = i;
            }
        }
    }

    advance(i, row) {
        const db = row[0];
        this.deAll[db]++;
        this.deSeen[db] = i;
        for (let j = 0; j < row.length; j++) {
            const x = row[j];
            this.loAll[x]++;
            this.loSeen[x] = i;
        }
    }
}

// Tính điểm Đề với cửa sổ W (100 hoặc 365)
function computeDeScores(draws, i, deAll, deSeen, W = 100) {
    const nBefore = i;
    const deRec = new Int32Array(100);
    const startRec = Math.max(0, i - W);
    for (let j = startRec; j < i; j++) {
        deRec[draws[j][1][0]]++;
    }

    const gapDe = new Int32Array(100);
    for (let x = 0; x < 100; x++) {
        gapDe[x] = deSeen[x] >= 0 ? (i - 1 - deSeen[x]) : i;
    }

    const deScores = {};
    // 1. Muse: F_all + 2 * F_rec
    const muse = {};
    for (let x = 0; x < 100; x++) muse[x] = deAll[x] + 2 * deRec[x];
    deScores.muse = muse;

    // 2. Perplexity: 0.5 * F_all / nBefore + 0.5 * F_rec / W
    const perp = {};
    for (let x = 0; x < 100; x++) perp[x] = 0.5 * deAll[x] / nBefore + 0.5 * deRec[x] / W;
    deScores.perplexity = perp;

    // 3. Claude: F_rec
    const claude = {};
    for (let x = 0; x < 100; x++) claude[x] = deRec[x];
    deScores.claude = claude;

    // 4 & 5. Gemini & ChatGPT: Union Core + Fill
    const allNums = Array.from({ length: 100 }, (_, k) => k);
    const topFall = allNums.slice().sort((a, b) => (deAll[b] - deAll[a]) || (a - b)).slice(0, 10);
    const topRec = allNums.slice().sort((a, b) => (deRec[b] - deRec[a]) || (a - b)).slice(0, 10);
    const topFallSet = new Set(topFall);
    const topRecSet = new Set(topRec);
    const coreSet = new Set([...topFall, ...topRec]);

    let maxGap = -1, fill = -1;
    for (let x = 0; x < 100; x++) {
        if (!coreSet.has(x)) {
            const g = gapDe[x];
            if (g > maxGap || (g === maxGap && fill !== -1 && x < fill)) {
                maxGap = g;
                fill = x;
            }
        }
    }

    const uni = {};
    for (let x = 0; x < 100; x++) {
        if (topFallSet.has(x) && topRecSet.has(x)) uni[x] = 3;
        else if (coreSet.has(x)) uni[x] = 2;
        else if (x === fill) uni[x] = 1;
        else uni[x] = 0;
    }
    deScores.gemini = uni;
    deScores.chatgpt = uni;

    const pcts = {};
    for (const ai of ['muse', 'perplexity', 'claude', 'gemini', 'chatgpt']) {
        pcts[ai] = pctOf(deScores[ai]);
    }

    const ens = {};
    for (let x = 0; x < 100; x++) {
        ens[x] = (pcts.muse[x] + pcts.perplexity[x] + pcts.claude[x] + pcts.gemini[x] + pcts.chatgpt[x]) / 5;
    }

    const ranked = allNums.slice().sort((a, b) => {
        const diff = ens[b] - ens[a];
        if (Math.abs(diff) < 1e-12) return a - b;
        return diff;
    });

    return ranked.map(numStr);
}

// Tính điểm Lô với cửa sổ W (100 hoặc 365)
function computeLoScores(draws, i, loAll, loSeen, W = 100) {
    const nBefore = i;
    const loRec = new Int32Array(100);
    const startRec = Math.max(0, i - W);
    for (let j = startRec; j < i; j++) {
        const r = draws[j][1];
        for (let k = 0; k < r.length; k++) loRec[r[k]]++;
    }

    const lo30 = new Int32Array(100);
    const start30 = Math.max(0, i - 30);
    for (let j = start30; j < i; j++) {
        const r = draws[j][1];
        for (let k = 0; k < r.length; k++) lo30[r[k]]++;
    }

    const gapLo = new Int32Array(100);
    for (let x = 0; x < 100; x++) {
        gapLo[x] = loSeen[x] >= 0 ? (i - 1 - loSeen[x]) : i;
    }

    const loScores = {};
    // 1. Muse: F_all + 2 * F_rec
    const muse = {};
    for (let x = 0; x < 100; x++) muse[x] = loAll[x] + 2 * loRec[x];
    loScores.muse = muse;

    // 2. Perplexity: 0.5 * F_all / (nBefore * 27) + 0.5 * F_rec / (W * 27)
    const perp = {};
    for (let x = 0; x < 100; x++) perp[x] = 0.5 * loAll[x] / (nBefore * 27) + 0.5 * loRec[x] / (W * 27);
    loScores.perplexity = perp;

    // 3. Gemini: Z-score blend
    const z30 = zscore(lo30);
    const zRec = zscore(loRec);
    const zAll = zscore(loAll);
    const gem = {};
    for (let x = 0; x < 100; x++) {
        const gapNorm = Math.min(gapLo[x], 30) / 30;
        gem[x] = 0.40 * z30[x] + 0.30 * zRec[x] + 0.20 * gapNorm + 0.10 * zAll[x];
    }
    loScores.gemini = gem;

    // 4. ChatGPT: Percentile blend
    const rAll = avgRank(loAll), rRec = avgRank(loRec), r30 = avgRank(lo30), rGap = avgRank(gapLo);
    const p = r => (100 - r) / 99;
    const gpt = {};
    for (let x = 0; x < 100; x++) {
        gpt[x] = 0.20 * p(rAll[x]) + 0.30 * p(rRec[x]) + 0.30 * p(r30[x]) + 0.20 * p(rGap[x]);
    }
    loScores.chatgpt = gpt;

    // 5. Claude: F_rec
    const claude = {};
    for (let x = 0; x < 100; x++) claude[x] = loRec[x];
    loScores.claude = claude;

    const pcts = {};
    for (const ai of ['muse', 'perplexity', 'claude', 'gemini', 'chatgpt']) {
        pcts[ai] = pctOf(loScores[ai]);
    }

    const ens = {};
    for (let x = 0; x < 100; x++) {
        ens[x] = (pcts.muse[x] + pcts.perplexity[x] + pcts.claude[x] + pcts.gemini[x] + pcts.chatgpt[x]) / 5;
    }

    const allNums = Array.from({ length: 100 }, (_, k) => k);
    const ranked = allNums.slice().sort((a, b) => {
        const diff = ens[b] - ens[a];
        if (Math.abs(diff) < 1e-12) return a - b;
        return diff;
    });

    return ranked.map(numStr);
}

// Dự đoán Chẵn/Lẻ dựa trên Markov & Tần suất trước giờ quay
function predictParity(draws, i) {
    // Dự đoán chẵn lẻ đầu & đít dựa trên tần suất 50 kỳ gần nhất
    let hEven = 0, hOdd = 0, tEven = 0, tOdd = 0;
    const start = Math.max(0, i - 50);
    for (let j = start; j < i; j++) {
        const db = numStr(draws[j][1][0]);
        if (parseInt(db[0], 10) % 2 === 0) hEven++; else hOdd++;
        if (parseInt(db[1], 10) % 2 === 0) tEven++; else tOdd++;
    }
    // Dạng hồi quy hoặc thuận nhịp: dạng có tần suất cao hơn
    const predHead = hEven >= hOdd ? 'C' : 'L';
    const predTail = tEven >= tOdd ? 'C' : 'L';
    const predForm = predHead + predTail;
    const oppForm = OPP_MAP[predForm];
    return { predForm, oppForm };
}

async function runMultiYearResearch() {
    console.log('=== BẮT ĐẦU NGHIÊN CÚU BACKTEST 5 NĂM (2022 - 2026) 100% STRICT PIT ===\n');

    const raw = JSON.parse(fs.readFileSync(COMPACT_PATH, 'utf8'));
    const draws = raw.data;

    // Tìm index bắt đầu năm 2022 (2022-01-01)
    let startIndex = -1;
    for (let i = 0; i < draws.length; i++) {
        if (draws[i][0] >= '2022-01-01') {
            startIndex = i;
            break;
        }
    }

    console.log(`Tổng số kỳ từ 2005: ${draws.length} kỳ.`);
    console.log(`Bắt đầu backtest từ kỳ index ${startIndex}: ngày ${draws[startIndex][0]} -> ngày ${draws[draws.length - 1][0]} (Tổng ${draws.length - startIndex} kỳ).\n`);

    const state = new FastMultiState(draws, startIndex);

    // Lưu trữ kết quả theo từng năm
    const years = ['2022', '2023', '2024', '2025', '2026', 'ALL'];
    const initStats = () => ({
        days: 0,
        // Đề W100
        de100_top12: { hits: 0, stake: 0, payout: 0 },
        de100_sweet17: { hits: 0, x2Hits: 0, x1Hits: 0, stake: 0, payout: 0 },
        de100_pure17: { hits: 0, stake: 0, payout: 0 },
        de100_fix35: { hits: 0, x2Hits: 0, x1Hits: 0, stake: 0, payout: 0 },
        de100_pa1_drop2: { hits: 0, x2Hits: 0, x1Hits: 0, stake: 0, payout: 0 },
        de100_base50: { hits: 0, x2Hits: 0, x1Hits: 0, stake: 0, payout: 0 },
        de100_last2: { hits: 0, total: 0 },
        de100_tail35: { hits: 0, total: 0 },
        de100_oppHits: 0,

        // Đề W365
        de365_top12: { hits: 0, stake: 0, payout: 0 },
        de365_sweet17: { hits: 0, x2Hits: 0, x1Hits: 0, stake: 0, payout: 0 },
        de365_pure17: { hits: 0, stake: 0, payout: 0 },
        de365_fix35: { hits: 0, x2Hits: 0, x1Hits: 0, stake: 0, payout: 0 },
        de365_pa1_drop2: { hits: 0, x2Hits: 0, x1Hits: 0, stake: 0, payout: 0 },
        de365_last2: { hits: 0, total: 0 },

        // Lô W100
        lo100_top2: { hitDays: 0, totalNhays: 0, stake: 0, payout: 0 },
        lo100_top6: { hitDays: 0, totalNhays: 0, stake: 0, payout: 0 },
        lo100_top7: { hitDays: 0, totalNhays: 0, stake: 0, payout: 0 },
        lo100_top10: { hitDays: 0, totalNhays: 0, stake: 0, payout: 0 },
        lo100_top20: { hitDays: 0, totalNhays: 0, stake: 0, payout: 0 },

        // Lô W365
        lo365_top2: { hitDays: 0, totalNhays: 0, stake: 0, payout: 0 },
        lo365_top6: { hitDays: 0, totalNhays: 0, stake: 0, payout: 0 },
        lo365_top7: { hitDays: 0, totalNhays: 0, stake: 0, payout: 0 },
        lo365_top10: { hitDays: 0, totalNhays: 0, stake: 0, payout: 0 },
        lo365_top20: { hitDays: 0, totalNhays: 0, stake: 0, payout: 0 }
    });

    const yearData = {};
    years.forEach(y => { yearData[y] = initStats(); });

    // Vòng lặp walk-forward Strict PIT
    for (let i = startIndex; i < draws.length; i++) {
        const curDate = draws[i][0];
        const yr = curDate.slice(0, 4);
        const curDraw = draws[i][1];
        const actualSpecial = numStr(curDraw[0]);
        const actualForm = getParityForm(actualSpecial);

        // Đếm số nháy của mỗi số trong 27 giải lô
        const loCounts = {};
        for (let j = 0; j < curDraw.length; j++) {
            const s = numStr(curDraw[j]);
            loCounts[s] = (loCounts[s] || 0) + 1;
        }

        // Dự đoán Chẵn/Lẻ cho Đề
        const { predForm, oppForm } = predictParity(draws, i);
        const isOppHit = (actualForm === oppForm);

        // 1. Tính toán Đề & Lô với W = 100
        const deRank100 = computeDeScores(draws, i, state.deAll, state.deSeen, 100);
        const loRank100 = computeLoScores(draws, i, state.loAll, state.loSeen, 100);

        // 2. Tính toán Đề & Lô với W = 365
        const deRank365 = computeDeScores(draws, i, state.deAll, state.deSeen, 365);
        const loRank365 = computeLoScores(draws, i, state.loAll, state.loSeen, 365);

        // Áp dụng bộ lọc Anti-Parity cho Đề
        const deFilt100 = deRank100.filter(n => getParityForm(n) !== oppForm);
        const deFilt365 = deRank365.filter(n => getParityForm(n) !== oppForm);

        // Ghi nhận cho từng nhóm năm và ALL
        const targets = [yearData[yr], yearData['ALL']];

        targets.forEach(st => {
            st.days++;
            if (isOppHit) st.de100_oppHits++;

            // --- ĐỀ W100 ---
            // Base 50s
            const bX2 = deRank100.slice(0, 25);
            const bX1 = deRank100.slice(25, 50);
            st.de100_base50.stake += (25 * DE_X2_UNIT_M) + (25 * DE_X1_UNIT_M);
            if (bX2.includes(actualSpecial)) {
                st.de100_base50.hits++;
                st.de100_base50.x2Hits++;
                st.de100_base50.payout += DE_X2_PAYOUT_M;
            } else if (bX1.includes(actualSpecial)) {
                st.de100_base50.hits++;
                st.de100_base50.x1Hits++;
                st.de100_base50.payout += DE_X1_PAYOUT_M;
            }

            // Top 12 X2
            const top12_100 = deFilt100.slice(0, 12);
            st.de100_top12.stake += top12_100.length * DE_X2_UNIT_M;
            if (top12_100.includes(actualSpecial)) {
                st.de100_top12.hits++;
                st.de100_top12.payout += DE_X2_PAYOUT_M;
            }

            // Sweet-Spot 17s (12 X2 + 5 X1)
            const x2_17 = deFilt100.slice(0, 12);
            const x1_17 = deFilt100.slice(12, 17);
            st.de100_sweet17.stake += (x2_17.length * DE_X2_UNIT_M) + (x1_17.length * DE_X1_UNIT_M);
            if (x2_17.includes(actualSpecial)) {
                st.de100_sweet17.hits++;
                st.de100_sweet17.x2Hits++;
                st.de100_sweet17.payout += DE_X2_PAYOUT_M;
            } else if (x1_17.includes(actualSpecial)) {
                st.de100_sweet17.hits++;
                st.de100_sweet17.x1Hits++;
                st.de100_sweet17.payout += DE_X1_PAYOUT_M;
            }

            // Pure 17 X2 thuần
            const pure17_100 = deFilt100.slice(0, 17);
            st.de100_pure17.stake += pure17_100.length * DE_X2_UNIT_M;
            if (pure17_100.includes(actualSpecial)) {
                st.de100_pure17.hits++;
                st.de100_pure17.payout += DE_X2_PAYOUT_M;
            }

            // Cố định 35s (12 X2 + 23 X1)
            const x2_35 = deFilt100.slice(0, 12);
            const x1_35 = deFilt100.slice(12, 35);
            st.de100_fix35.stake += (x2_35.length * DE_X2_UNIT_M) + (x1_35.length * DE_X1_UNIT_M);
            if (x2_35.includes(actualSpecial)) {
                st.de100_fix35.hits++;
                st.de100_fix35.x2Hits++;
                st.de100_fix35.payout += DE_X2_PAYOUT_M;
            } else if (x1_35.includes(actualSpecial)) {
                st.de100_fix35.hits++;
                st.de100_fix35.x1Hits++;
                st.de100_fix35.payout += DE_X1_PAYOUT_M;
            }

            // PA1 + Bỏ 2 con cuối X1
            const drop2_x1 = deFilt100.slice(12, Math.max(12, deFilt100.length - 2));
            st.de100_pa1_drop2.stake += (x2_35.length * DE_X2_UNIT_M) + (drop2_x1.length * DE_X1_UNIT_M);
            if (x2_35.includes(actualSpecial)) {
                st.de100_pa1_drop2.hits++;
                st.de100_pa1_drop2.x2Hits++;
                st.de100_pa1_drop2.payout += DE_X2_PAYOUT_M;
            } else if (drop2_x1.includes(actualSpecial)) {
                st.de100_pa1_drop2.hits++;
                st.de100_pa1_drop2.x1Hits++;
                st.de100_pa1_drop2.payout += DE_X1_PAYOUT_M;
            }

            // 2 con cuối dàn X1
            const last2_100 = deFilt100.slice(Math.max(0, deFilt100.length - 2));
            st.de100_last2.total += last2_100.length;
            if (last2_100.includes(actualSpecial)) st.de100_last2.hits++;

            // Phần đuôi > 35 con
            if (deFilt100.length > 35) {
                const tail = deFilt100.slice(35);
                st.de100_tail35.total += tail.length;
                if (tail.includes(actualSpecial)) st.de100_tail35.hits++;
            }

            // --- ĐỀ W365 ---
            const top12_365 = deFilt365.slice(0, 12);
            st.de365_top12.stake += top12_365.length * DE_X2_UNIT_M;
            if (top12_365.includes(actualSpecial)) {
                st.de365_top12.hits++;
                st.de365_top12.payout += DE_X2_PAYOUT_M;
            }

            const x2_17_365 = deFilt365.slice(0, 12);
            const x1_17_365 = deFilt365.slice(12, 17);
            st.de365_sweet17.stake += (x2_17_365.length * DE_X2_UNIT_M) + (x1_17_365.length * DE_X1_UNIT_M);
            if (x2_17_365.includes(actualSpecial)) {
                st.de365_sweet17.hits++;
                st.de365_sweet17.x2Hits++;
                st.de365_sweet17.payout += DE_X2_PAYOUT_M;
            } else if (x1_17_365.includes(actualSpecial)) {
                st.de365_sweet17.hits++;
                st.de365_sweet17.x1Hits++;
                st.de365_sweet17.payout += DE_X1_PAYOUT_M;
            }

            const pure17_365 = deFilt365.slice(0, 17);
            st.de365_pure17.stake += pure17_365.length * DE_X2_UNIT_M;
            if (pure17_365.includes(actualSpecial)) {
                st.de365_pure17.hits++;
                st.de365_pure17.payout += DE_X2_PAYOUT_M;
            }

            const drop2_x1_365 = deFilt365.slice(12, Math.max(12, deFilt365.length - 2));
            st.de365_pa1_drop2.stake += (top12_365.length * DE_X2_UNIT_M) + (drop2_x1_365.length * DE_X1_UNIT_M);
            if (top12_365.includes(actualSpecial)) {
                st.de365_pa1_drop2.hits++;
                st.de365_pa1_drop2.x2Hits++;
                st.de365_pa1_drop2.payout += DE_X2_PAYOUT_M;
            } else if (drop2_x1_365.includes(actualSpecial)) {
                st.de365_pa1_drop2.hits++;
                st.de365_pa1_drop2.x1Hits++;
                st.de365_pa1_drop2.payout += DE_X1_PAYOUT_M;
            }

            // --- LÔ W100 ---
            // Helper tính Lô
            const evalLo = (ranks, k, obj) => {
                const pick = ranks.slice(0, k);
                obj.stake += k * LO_STAKE_UNIT_M;
                let nhays = 0;
                for (const num of pick) {
                    if (loCounts[num]) nhays += loCounts[num];
                }
                obj.totalNhays += nhays;
                obj.payout += nhays * LO_PAYOUT_HIT_M;
                if (nhays > 0) obj.hitDays++;
            };

            evalLo(loRank100, 2, st.lo100_top2);
            evalLo(loRank100, 6, st.lo100_top6);
            evalLo(loRank100, 7, st.lo100_top7);
            evalLo(loRank100, 10, st.lo100_top10);
            evalLo(loRank100, 20, st.lo100_top20);

            // --- LÔ W365 ---
            evalLo(loRank365, 2, st.lo365_top2);
            evalLo(loRank365, 6, st.lo365_top6);
            evalLo(loRank365, 7, st.lo365_top7);
            evalLo(loRank365, 10, st.lo365_top10);
            evalLo(loRank365, 20, st.lo365_top20);
        });

        state.advance(i, curDraw);
    }

    console.log('=== HOÀN TẤT BACKTEST 1758 KỲ! XUẤT BẢNG TỔNG HỢP SO SÁNH ===\n');

    // 1. So sánh Đề qua các năm
    console.log('------------------------------------------------------------------------------------------------------------------------');
    console.log('BẢNG 1: HIỆU NĂNG ĐỀ THEO CÁC NĂM (2022 - 2026) - SO SÁNH CÁC CẤU HÌNH VỊ TRÍ & CỬA SỔ W100 VS W365');
    console.log('------------------------------------------------------------------------------------------------------------------------');
    console.log('Năm   | Số Kỳ | Đề 17s W100 (12+5)      | Đề 17s W365 (12+5)      | PA1 Drop2 W100 (35s)    | PA1 Drop2 W365 (35s)    | Dàn Gốc 50s W100');
    console.log('------------------------------------------------------------------------------------------------------------------------');

    const fmtProf = (payout, stake) => {
        const prof = payout - stake;
        const roi = stake > 0 ? (prof / stake) * 100 : 0;
        const s = (prof >= 0 ? '+' : '') + prof.toFixed(1) + 'M (' + (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%)';
        return s.padStart(23);
    };

    years.forEach(y => {
        const d = yearData[y];
        const s17_100 = fmtProf(d.de100_sweet17.payout, d.de100_sweet17.stake);
        const s17_365 = fmtProf(d.de365_sweet17.payout, d.de365_sweet17.stake);
        const s35_100 = fmtProf(d.de100_pa1_drop2.payout, d.de100_pa1_drop2.stake);
        const s35_365 = fmtProf(d.de365_pa1_drop2.payout, d.de365_pa1_drop2.stake);
        const sBase = fmtProf(d.de100_base50.payout, d.de100_base50.stake);
        console.log(`${y.padEnd(5)} | ${d.days.toString().padStart(5)} | ${s17_100} | ${s17_365} | ${s35_100} | ${s35_365} | ${sBase}`);
    });

    // 2. Thống kê 2 con cuối & Phần đuôi > 35 qua các năm
    console.log('\n------------------------------------------------------------------------------------------------------------------------');
    console.log('BẢNG 2: THỐNG KÊ 2 CON CUỐI DÀN X1 & PHẦN ĐUÔI > 35 CON QUA CÁC NĂM (2022 - 2026)');
    console.log('------------------------------------------------------------------------------------------------------------------------');
    years.forEach(y => {
        const d = yearData[y];
        const last2HitRate = ((d.de100_last2.hits / d.days) * 100).toFixed(2);
        const last2SavedM = (d.days * 2) - (d.de100_last2.hits * 84);
        const tail35HitRate = ((d.de100_tail35.hits / d.days) * 100).toFixed(2);
        const tailSavedM = (d.de100_tail35.total * 1) - (d.de100_tail35.hits * 84);
        console.log(`Năm ${y} (${d.days} kỳ):`);
        console.log(`  * 2 Con Cuối X1: Trúng ${d.de100_last2.hits}/${d.days} kỳ (${last2HitRate}%) | Cắt bỏ tiết kiệm ròng: +${last2SavedM.toFixed(1)} Triệu VNĐ`);
        console.log(`  * Đuôi > 35 Con: Trúng ${d.de100_tail35.hits}/${d.days} kỳ (${tail35HitRate}%) (Cắt ${d.de100_tail35.total} con) | Cắt bỏ tiết kiệm ròng: +${tailSavedM.toFixed(1)} Triệu VNĐ`);
    });

    // 3. So sánh Lô qua các năm
    console.log('\n------------------------------------------------------------------------------------------------------------------------');
    console.log('BẢNG 3: HIỆU NĂNG LÔ 5 AI THEO CÁC NĂM (2022 - 2026) - SO SÁNH VỊ TRÍ & CỬA SỔ W100 VS W365');
    console.log('------------------------------------------------------------------------------------------------------------------------');
    console.log('Năm   | Lô Top 6 (W100)           | Lô Top 6 (W365)           | Lô Top 7 (W100)           | Lô Top 7 (W365)           | Lô Top 20 (W100)');
    console.log('------------------------------------------------------------------------------------------------------------------------');
    years.forEach(y => {
        const d = yearData[y];
        const l6_100 = fmtProf(d.lo100_top6.payout, d.lo100_top6.stake);
        const l6_365 = fmtProf(d.lo365_top6.payout, d.lo365_top6.stake);
        const l7_100 = fmtProf(d.lo100_top7.payout, d.lo100_top7.stake);
        const l7_365 = fmtProf(d.lo365_top7.payout, d.lo365_top7.stake);
        const l20_100 = fmtProf(d.lo100_top20.payout, d.lo100_top20.stake);
        console.log(`${y.padEnd(5)} | ${l6_100} | ${l6_365} | ${l7_100} | ${l7_365} | ${l20_100}`);
    });

    // 4. So sánh COMBO Đa Tầng Đề + Lô
    console.log('\n------------------------------------------------------------------------------------------------------------------------');
    console.log('BẢNG 4: COMBO ĐA TẦNG ĐỀ 17S + LÔ TOP 7 (2022 - 2026)');
    console.log('------------------------------------------------------------------------------------------------------------------------');
    years.forEach(y => {
        const d = yearData[y];
        // Combo W100
        const stakeC100 = d.de100_sweet17.stake + d.lo100_top7.stake;
        const payoutC100 = d.de100_sweet17.payout + d.lo100_top7.payout;
        const profC100 = payoutC100 - stakeC100;
        const roiC100 = (profC100 / stakeC100) * 100;

        // Combo W365
        const stakeC365 = d.de365_sweet17.stake + d.lo365_top7.stake;
        const payoutC365 = d.de365_sweet17.payout + d.lo365_top7.payout;
        const profC365 = payoutC365 - stakeC365;
        const roiC365 = (profC365 / stakeC365) * 100;

        console.log(`Năm ${y.padEnd(4)} (${d.days.toString().padStart(4)} kỳ):`);
        console.log(`  * COMBO W100 (Đề 17s + Lô Top 7): Vốn ${(stakeC100/1000).toFixed(1)} Tỷ | Lãi: ${(profC100>=0?'+':'')+profC100.toFixed(1)}M | ROI: ${(roiC100>=0?'+':'')+roiC100.toFixed(2)}%`);
        console.log(`  * COMBO W365 (Đề 17s + Lô Top 7): Vốn ${(stakeC365/1000).toFixed(1)} Tỷ | Lãi: ${(profC365>=0?'+':'')+profC365.toFixed(1)}M | ROI: ${(roiC365>=0?'+':'')+roiC365.toFixed(2)}%`);
    });

    // Xuất JSON kết quả để phục vụ viết báo cáo và trang web
    fs.writeFileSync('reports/multi_year_ai5_research_results.json', JSON.stringify(yearData, null, 2), 'utf8');
    console.log('\nĐã lưu kết quả tại reports/multi_year_ai5_research_results.json');
}

runMultiYearResearch().catch(console.error);
