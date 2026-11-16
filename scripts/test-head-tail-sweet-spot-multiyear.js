'use strict';

const fs = require('fs');
const path = require('path');
const COMPACT_PATH = path.join(__dirname, '../data/xsmb-2-digits-compact.json');

const MULTIPLIER_DE = 84;
const DE_X2_UNIT_M = 2.0;
const DE_X1_UNIT_M = 1.0;
const DE_X2_PAYOUT_M = DE_X2_UNIT_M * MULTIPLIER_DE;
const DE_X1_PAYOUT_M = DE_X1_UNIT_M * MULTIPLIER_DE;

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

function numStr(n) { return String(n).padStart(2, '0'); }

function getParityForm(s) {
    const d = typeof s === 'string' ? s : numStr(s);
    const h = parseInt(d[0], 10) % 2 === 0 ? 'C' : 'L';
    const t = parseInt(d[1], 10) % 2 === 0 ? 'C' : 'L';
    return h + t;
}

const OPP_MAP = { 'LL': 'CC', 'CC': 'LL', 'CL': 'LC', 'LC': 'CL' };

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

    update(draws, i) {
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

function computeDeScores(draws, i, deAll, deSeen, W = 365) {
    const nBefore = i;
    const deRec = new Int32Array(100);
    const startRec = Math.max(0, i - W);
    for (let j = startRec; j < i; j++) deRec[draws[j][1][0]]++;

    const de30 = new Int32Array(100);
    const start30 = Math.max(0, i - 30);
    for (let j = start30; j < i; j++) de30[draws[j][1][0]]++;

    const gapDe = new Int32Array(100);
    for (let x = 0; x < 100; x++) gapDe[x] = deSeen[x] >= 0 ? nBefore - 1 - deSeen[x] : nBefore;

    const deScores = {};
    const muse = {};
    for (let x = 0; x < 100; x++) muse[x] = 0.50 * deRec[x] + 0.30 * de30[x] + 0.20 * deAll[x];
    deScores.muse = muse;

    const px = {};
    for (let x = 0; x < 100; x++) px[x] = deRec[x] * 10 - gapDe[x] * 0.1;
    deScores.perplexity = px;

    const z30 = zscore(de30), zRec = zscore(deRec), zAll = zscore(deAll);
    const gem = {};
    for (let x = 0; x < 100; x++) {
        const gapNorm = Math.min(gapDe[x], 100) / 100;
        gem[x] = 0.40 * z30[x] + 0.30 * zRec[x] + 0.20 * gapNorm + 0.10 * zAll[x];
    }
    deScores.gemini = gem;

    const rAll = avgRank(deAll), rRec = avgRank(deRec), r30 = avgRank(de30), rGap = avgRank(gapDe);
    const p = r => (100 - r) / 99;
    const gpt = {};
    for (let x = 0; x < 100; x++) {
        gpt[x] = 0.20 * p(rAll[x]) + 0.30 * p(rRec[x]) + 0.30 * p(r30[x]) + 0.20 * p(rGap[x]);
    }
    deScores.chatgpt = gpt;

    const claude = {};
    for (let x = 0; x < 100; x++) claude[x] = deRec[x];
    deScores.claude = claude;

    const pcts = {};
    for (const ai of ['muse', 'perplexity', 'claude', 'gemini', 'chatgpt']) {
        pcts[ai] = pctOf(deScores[ai]);
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

function predictParity(draws, i) {
    let hEven = 0, hOdd = 0, tEven = 0, tOdd = 0;
    const start = Math.max(0, i - 50);
    for (let j = start; j < i; j++) {
        const db = numStr(draws[j][1][0]);
        if (parseInt(db[0], 10) % 2 === 0) hEven++; else hOdd++;
        if (parseInt(db[1], 10) % 2 === 0) tEven++; else tOdd++;
    }
    const predHead = hEven >= hOdd ? 'C' : 'L';
    const predTail = tEven >= tOdd ? 'C' : 'L';
    const predForm = predHead + predTail;
    const oppForm = OPP_MAP[predForm];
    return { predForm, oppForm, predHead, predTail };
}

async function run() {
    const raw = JSON.parse(fs.readFileSync(COMPACT_PATH, 'utf8'));
    const draws = raw.data;

    let startIndex = -1;
    for (let i = 0; i < draws.length; i++) {
        if (draws[i][0] >= '2022-01-01') {
            startIndex = i;
            break;
        }
    }

    const state = new FastMultiState(draws, startIndex);
    const years = ['2022', '2023', '2024', '2025', '2026', 'ALL'];

    const initStats = () => ({
        days: 0,
        stake: 0,
        payout: 0,
        wins: 0,
        x2Wins: 0,
        x1Wins: 0
    });

    const strats = {
        s17_base: {},
        s15_base: {},
        s17_pab: {},
        s17_pad: {}
    };

    for (const key of Object.keys(strats)) {
        for (const y of years) strats[key][y] = initStats();
    }

    for (let i = startIndex; i < draws.length; i++) {
        const dateStr = draws[i][0];
        const year = dateStr.slice(0, 4);
        const actualStr = numStr(draws[i][1][0]);

        const ranked100 = computeDeScores(draws, i, state.deAll, state.deSeen, 365);
        const { predForm, oppForm, predHead } = predictParity(draws, i);

        // Lọc bỏ oppForm
        const filtered = ranked100.filter(n => getParityForm(n) !== oppForm);

        // 17s pool: top 12 + next 5
        const x2_12 = filtered.slice(0, 12);
        const x1_5 = filtered.slice(12, 17);
        const pool17 = filtered.slice(0, 17);

        // 15s pool: top 12 + next 3
        const x1_3 = filtered.slice(12, 15);
        const pool15 = filtered.slice(0, 15);

        // Kịch bản 1: s17_base
        const s17_stake = 12 * 2 + 5 * 1;
        const hitX2_17 = x2_12.includes(actualStr);
        const hitX1_17 = !hitX2_17 && x1_5.includes(actualStr);
        const s17_payout = hitX2_17 ? 168 : (hitX1_17 ? 84 : 0);

        // Kịch bản 2: s15_base
        const s15_stake = 12 * 2 + 3 * 1;
        const hitX2_15 = x2_12.includes(actualStr);
        const hitX1_15 = !hitX2_15 && x1_3.includes(actualStr);
        const s15_payout = hitX2_15 ? 168 : (hitX1_15 ? 84 : 0);

        // Kịch bản 3: s17_pab (Cùng Đầu X2, Cùng Đít X1)
        const pab_x2 = pool17.filter(n => getParityForm(n)[0] === predHead);
        const pab_x1 = pool17.filter(n => getParityForm(n)[0] !== predHead);
        const pab_stake = pab_x2.length * 2 + pab_x1.length * 1;
        const hitX2_pab = pab_x2.includes(actualStr);
        const hitX1_pab = !hitX2_pab && pab_x1.includes(actualStr);
        const pab_payout = hitX2_pab ? 168 : (hitX1_pab ? 84 : 0);

        // Kịch bản 4: s17_pad (Cắt Cùng Đít, chỉ đánh Cùng Đầu: LL X2, LC X1)
        const pad_x2 = pool17.filter(n => getParityForm(n) === predForm);
        const pad_x1 = pool17.filter(n => getParityForm(n) !== predForm && getParityForm(n)[0] === predHead);
        const pad_stake = pad_x2.length * 2 + pad_x1.length * 1;
        const hitX2_pad = pad_x2.includes(actualStr);
        const hitX1_pad = !hitX2_pad && pad_x1.includes(actualStr);
        const pad_payout = hitX2_pad ? 168 : (hitX1_pad ? 84 : 0);

        const updateObj = (obj, stake, payout, hx2, hx1) => {
            for (const y of [year, 'ALL']) {
                obj[y].days++;
                obj[y].stake += stake;
                obj[y].payout += payout;
                if (hx2) { obj[y].wins++; obj[y].x2Wins++; }
                else if (hx1) { obj[y].wins++; obj[y].x1Wins++; }
            }
        };

        updateObj(strats.s17_base, s17_stake, s17_payout, hitX2_17, hitX1_17);
        updateObj(strats.s15_base, s15_stake, s15_payout, hitX2_15, hitX1_15);
        updateObj(strats.s17_pab, pab_stake, pab_payout, hitX2_pab, hitX1_pab);
        updateObj(strats.s17_pad, pad_stake, pad_payout, hitX2_pad, hitX1_pad);

        state.update(draws, i);
    }

    console.log('\n=== KẾT QUẢ ĐA NIÊN 5 NĂM (2022 - 2026) TỪNG PHƯƠNG PHÁP ===\n');

    for (const key of ['s17_base', 's15_base', 's17_pab', 's17_pad']) {
        console.log('--- CHIẾN LƯỢC: ' + key + ' ---');
        console.log('Năm  | Kỳ  | Vốn (M) | Thưởng (M) | Lãi Ròng (M) | ROI   | Trúng | Tỷ lệ | X2 | X1');
        console.log('---------------------------------------------------------------------------------');
        for (const y of years) {
            const st = strats[key][y];
            const profit = st.payout - st.stake;
            const roi = st.stake > 0 ? ((profit / st.stake) * 100).toFixed(1) : '0';
            const wr = st.days > 0 ? ((st.wins / st.days) * 100).toFixed(1) : '0';
            console.log(
                y.padEnd(5) + '| ' +
                String(st.days).padStart(3) + ' | ' +
                String(st.stake).padStart(7) + ' | ' +
                String(st.payout).padStart(10) + ' | ' +
                ((profit >= 0 ? '+' : '') + profit + 'M').padStart(12) + ' | ' +
                (roi + '%').padStart(6) + '| ' +
                String(st.wins).padStart(5) + ' | ' +
                (wr + '%').padStart(6) + '| ' +
                String(st.x2Wins).padStart(2) + ' | ' +
                String(st.x1Wins).padStart(2)
            );
        }
        console.log('');
    }
}

run().catch(console.error);
