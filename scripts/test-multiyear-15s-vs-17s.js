'use strict';

const fs = require('fs');
const path = require('path');
const COMPACT_PATH = path.join(__dirname, '../data/xsmb-2-digits-compact.json');

const MULTIPLIER_DE = 84;
const DE_X2_UNIT_M = 2.0;
const DE_X1_UNIT_M = 1.0;
const DE_X2_PAYOUT_M = DE_X2_UNIT_M * MULTIPLIER_DE; // 168M
const DE_X1_PAYOUT_M = DE_X1_UNIT_M * MULTIPLIER_DE; // 84M

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

function computeDeScores(draws, i, deAll, deSeen, W = 100) {
    const nBefore = i;
    const deRec = new Int32Array(100);
    const startRec = Math.max(0, i - W);
    for (let j = startRec; j < i; j++) {
        deRec[draws[j][1][0]]++;
    }

    const de30 = new Int32Array(100);
    const start30 = Math.max(0, i - 30);
    for (let j = start30; j < i; j++) {
        de30[draws[j][1][0]]++;
    }

    const gapDe = new Int32Array(100);
    for (let x = 0; x < 100; x++) {
        gapDe[x] = deSeen[x] >= 0 ? nBefore - 1 - deSeen[x] : nBefore;
    }

    const deScores = {};
    // 1. Muse
    const muse = {};
    for (let x = 0; x < 100; x++) muse[x] = 0.50 * deRec[x] + 0.30 * de30[x] + 0.20 * deAll[x];
    deScores.muse = muse;

    // 2. Perplexity
    const px = {};
    for (let x = 0; x < 100; x++) px[x] = deRec[x] * 10 - gapDe[x] * 0.1;
    deScores.perplexity = px;

    // 3. Gemini
    const z30 = zscore(de30), zRec = zscore(deRec), zAll = zscore(deAll);
    const gem = {};
    for (let x = 0; x < 100; x++) {
        const gapNorm = Math.min(gapDe[x], 100) / 100;
        gem[x] = 0.40 * z30[x] + 0.30 * zRec[x] + 0.20 * gapNorm + 0.10 * zAll[x];
    }
    deScores.gemini = gem;

    // 4. ChatGPT
    const rAll = avgRank(deAll), rRec = avgRank(deRec), r30 = avgRank(de30), rGap = avgRank(gapDe);
    const p = r => (100 - r) / 99;
    const gpt = {};
    for (let x = 0; x < 100; x++) {
        gpt[x] = 0.20 * p(rAll[x]) + 0.30 * p(rRec[x]) + 0.30 * p(r30[x]) + 0.20 * p(rGap[x]);
    }
    deScores.chatgpt = gpt;

    // 5. Claude
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
    return { predForm, oppForm };
}

async function runTest() {
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
        // W = 100
        w100_17: { hits: 0, x2: 0, x1: 0, stake: 0, payout: 0 },
        w100_15: { hits: 0, x2: 0, x1: 0, stake: 0, payout: 0 },
        w100_cut2: { hits: 0 },
        // W = 365
        w365_17: { hits: 0, x2: 0, x1: 0, stake: 0, payout: 0 },
        w365_15: { hits: 0, x2: 0, x1: 0, stake: 0, payout: 0 },
        w365_cut2: { hits: 0 }
    });

    const res = {};
    years.forEach(y => { res[y] = initStats(); });

    for (let i = startIndex; i < draws.length; i++) {
        const curDate = draws[i][0];
        const yr = curDate.slice(0, 4);
        const actualSpecial = numStr(draws[i][1][0]);
        const { oppForm } = predictParity(draws, i);

        // 1. W = 100
        const deRank100 = computeDeScores(draws, i, state.deAll, state.deSeen, 100);
        const deFilt100 = deRank100.filter(n => getParityForm(n) !== oppForm);

        // 2. W = 365
        const deRank365 = computeDeScores(draws, i, state.deAll, state.deSeen, 365);
        const deFilt365 = deRank365.filter(n => getParityForm(n) !== oppForm);

        const targets = [res[yr], res['ALL']];

        targets.forEach(st => {
            st.days++;

            // Evaluate W100
            const x2_12_100 = deFilt100.slice(0, 12);
            const x1_3_100 = deFilt100.slice(12, 15);
            const cut_2_100 = deFilt100.slice(15, 17);
            const x1_5_100 = deFilt100.slice(12, 17);

            const hitX2_100 = x2_12_100.includes(actualSpecial);
            const hitX1_3_100 = !hitX2_100 && x1_3_100.includes(actualSpecial);
            const hitX1_5_100 = !hitX2_100 && x1_5_100.includes(actualSpecial);
            const hitCut_100 = !hitX2_100 && cut_2_100.includes(actualSpecial);

            st.w100_17.stake += (12 * 2) + (5 * 1);
            if (hitX2_100) { st.w100_17.hits++; st.w100_17.x2++; st.w100_17.payout += 168; }
            else if (hitX1_5_100) { st.w100_17.hits++; st.w100_17.x1++; st.w100_17.payout += 84; }

            st.w100_15.stake += (12 * 2) + (3 * 1);
            if (hitX2_100) { st.w100_15.hits++; st.w100_15.x2++; st.w100_15.payout += 168; }
            else if (hitX1_3_100) { st.w100_15.hits++; st.w100_15.x1++; st.w100_15.payout += 84; }

            if (hitCut_100) st.w100_cut2.hits++;

            // Evaluate W365
            const x2_12_365 = deFilt365.slice(0, 12);
            const x1_3_365 = deFilt365.slice(12, 15);
            const cut_2_365 = deFilt365.slice(15, 17);
            const x1_5_365 = deFilt365.slice(12, 17);

            const hitX2_365 = x2_12_365.includes(actualSpecial);
            const hitX1_3_365 = !hitX2_365 && x1_3_365.includes(actualSpecial);
            const hitX1_5_365 = !hitX2_365 && x1_5_365.includes(actualSpecial);
            const hitCut_365 = !hitX2_365 && cut_2_365.includes(actualSpecial);

            st.w365_17.stake += (12 * 2) + (5 * 1);
            if (hitX2_365) { st.w365_17.hits++; st.w365_17.x2++; st.w365_17.payout += 168; }
            else if (hitX1_5_365) { st.w365_17.hits++; st.w365_17.x1++; st.w365_17.payout += 84; }

            st.w365_15.stake += (12 * 2) + (3 * 1);
            if (hitX2_365) { st.w365_15.hits++; st.w365_15.x2++; st.w365_15.payout += 168; }
            else if (hitX1_3_365) { st.w365_15.hits++; st.w365_15.x1++; st.w365_15.payout += 84; }

            if (hitCut_365) st.w365_cut2.hits++;
        });

        state.update(draws, i);
    }

    console.log('=== KẾT QUẢ BACKTEST 5 NĂM (2022 - 2026, 1758 KỲ) ===\n');

    console.log('--- VỚI CỬA SỔ W = 365 NGÀY (TỐI ƯU NHẤT) ---');
    console.log('Năm  | Số kỳ | Dàn 17s Lãi (M) | Dàn 15s Lãi (M) | Tiết kiệm vốn | Thưởng hụt | Lãi Chênh Lệch | 2 số bị cắt nổ (lần / %)');
    console.log('-------------------------------------------------------------------------------------------------------------------------');
    for (const yr of ['2022', '2023', '2024', '2025', '2026', 'ALL']) {
        const d = res[yr];
        const p17 = d.w365_17.payout - d.w365_17.stake;
        const p15 = d.w365_15.payout - d.w365_15.stake;
        const saveStake = d.w365_17.stake - d.w365_15.stake;
        const lostPayout = d.w365_17.payout - d.w365_15.payout;
        const netDiff = p15 - p17;
        const cutH = d.w365_cut2.hits;
        const cutPct = (cutH / d.days * 100).toFixed(2);
        console.log(yr.padEnd(4) + ' |  ' + String(d.days).padStart(4) + ' |   ' + (p17 >= 0 ? '+' : '') + p17.toFixed(1).padStart(7) + 'M |   ' + (p15 >= 0 ? '+' : '') + p15.toFixed(1).padStart(7) + 'M |    +' + saveStake.toFixed(1).padStart(6) + 'M |   -' + lostPayout.toFixed(1).padStart(6) + 'M |     ' + (netDiff >= 0 ? '+' : '') + netDiff.toFixed(1).padStart(6) + 'M |    ' + String(cutH).padStart(2) + ' lần (' + cutPct + '%)');
    }

    console.log('\n--- VỚI CỬA SỔ W = 100 NGÀY ---');
    console.log('Năm  | Số kỳ | Dàn 17s Lãi (M) | Dàn 15s Lãi (M) | Tiết kiệm vốn | Thưởng hụt | Lãi Chênh Lệch | 2 số bị cắt nổ (lần / %)');
    console.log('-------------------------------------------------------------------------------------------------------------------------');
    for (const yr of ['2022', '2023', '2024', '2025', '2026', 'ALL']) {
        const d = res[yr];
        const p17 = d.w100_17.payout - d.w100_17.stake;
        const p15 = d.w100_15.payout - d.w100_15.stake;
        const saveStake = d.w100_17.stake - d.w100_15.stake;
        const lostPayout = d.w100_17.payout - d.w100_15.payout;
        const netDiff = p15 - p17;
        const cutH = d.w100_cut2.hits;
        const cutPct = (cutH / d.days * 100).toFixed(2);
        console.log(yr.padEnd(4) + ' |  ' + String(d.days).padStart(4) + ' |   ' + (p17 >= 0 ? '+' : '') + p17.toFixed(1).padStart(7) + 'M |   ' + (p15 >= 0 ? '+' : '') + p15.toFixed(1).padStart(7) + 'M |    +' + saveStake.toFixed(1).padStart(6) + 'M |   -' + lostPayout.toFixed(1).padStart(6) + 'M |     ' + (netDiff >= 0 ? '+' : '') + netDiff.toFixed(1).padStart(6) + 'M |    ' + String(cutH).padStart(2) + ' lần (' + cutPct + '%)');
    }
}

runTest().catch(console.error);
