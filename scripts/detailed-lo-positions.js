'use strict';

const fs = require('fs');
const path = require('path');
const COMPACT_PATH = path.join(__dirname, '../data/xsmb-2-digits-compact.json');

const LO_STAKE_UNIT_M = 2.2;
const LO_PAYOUT_HIT_M = 8.0;

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

function computeLoScores(draws, i, loAll, loSeen, W = 365) {
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
    const muse = {};
    for (let x = 0; x < 100; x++) muse[x] = loAll[x] + 2 * loRec[x];
    loScores.muse = muse;

    const perp = {};
    for (let x = 0; x < 100; x++) perp[x] = 0.5 * loAll[x] / (nBefore * 27) + 0.5 * loRec[x] / (W * 27);
    loScores.perplexity = perp;

    const z30 = zscore(lo30);
    const zRec = zscore(loRec);
    const zAll = zscore(loAll);
    const gem = {};
    for (let x = 0; x < 100; x++) {
        gem[x] = 0.40 * z30[x] + 0.30 * zRec[x] + 0.20 * (Math.min(gapLo[x], 30) / 30) + 0.10 * zAll[x];
    }
    loScores.gemini = gem;

    const rAll = avgRank(loAll), rRec = avgRank(loRec), r30 = avgRank(lo30), rGap = avgRank(gapLo);
    const p = r => (100 - r) / 99;
    const gpt = {};
    for (let x = 0; x < 100; x++) {
        gpt[x] = 0.20 * p(rAll[x]) + 0.30 * p(rRec[x]) + 0.30 * p(r30[x]) + 0.20 * p(rGap[x]);
    }
    loScores.chatgpt = gpt;

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
    return allNums.sort((a, b) => (ens[b] - ens[a]) || (a - b)).map(numStr);
}

async function detailedLoPositions() {
    const raw = JSON.parse(fs.readFileSync(COMPACT_PATH, 'utf8'));
    const draws = raw.data;

    let startIndex = -1;
    for (let i = 0; i < draws.length; i++) {
        if (draws[i][0] >= '2022-01-01') { startIndex = i; break; }
    }

    const loAll = new Int32Array(100);
    const loSeen = new Int32Array(100).fill(-1);
    for (let i = 0; i < startIndex; i++) {
        const row = draws[i][1];
        for (let j = 0; j < row.length; j++) {
            loAll[row[j]]++;
            loSeen[row[j]] = i;
        }
    }

    // Khảo sát các kích cỡ Lô từ Top 1 đến Top 12 với cả W = 100 và W = 365
    const kSizes = [2, 3, 4, 5, 6, 7, 8, 10, 12];
    const stats = {};
    kSizes.forEach(k => {
        stats[`W100_Top${k}`] = { stake: 0, payout: 0, hits: 0, daysWin: 0 };
        stats[`W365_Top${k}`] = { stake: 0, payout: 0, hits: 0, daysWin: 0 };
    });

    const totalDays = draws.length - startIndex;

    for (let i = startIndex; i < draws.length; i++) {
        const curDraw = draws[i][1];
        const loCounts = {};
        for (let j = 0; j < curDraw.length; j++) {
            const s = numStr(curDraw[j]);
            loCounts[s] = (loCounts[s] || 0) + 1;
        }

        const rank100 = computeLoScores(draws, i, loAll, loSeen, 100);
        const rank365 = computeLoScores(draws, i, loAll, loSeen, 365);

        kSizes.forEach(k => {
            // W100
            const pick100 = rank100.slice(0, k);
            const st100 = stats[`W100_Top${k}`];
            st100.stake += k * LO_STAKE_UNIT_M;
            let nhays100 = 0;
            pick100.forEach(num => { if (loCounts[num]) nhays100 += loCounts[num]; });
            st100.hits += nhays100;
            st100.payout += nhays100 * LO_PAYOUT_HIT_M;
            if (nhays100 > 0) st100.daysWin++;

            // W365
            const pick365 = rank365.slice(0, k);
            const st365 = stats[`W365_Top${k}`];
            st365.stake += k * LO_STAKE_UNIT_M;
            let nhays365 = 0;
            pick365.forEach(num => { if (loCounts[num]) nhays365 += loCounts[num]; });
            st365.hits += nhays365;
            st365.payout += nhays365 * LO_PAYOUT_HIT_M;
            if (nhays365 > 0) st365.daysWin++;
        });

        // advance
        const row = curDraw;
        for (let j = 0; j < row.length; j++) {
            loAll[row[j]]++;
            loSeen[row[j]] = i;
        }
    }

    console.log(`=== KẾT QUẢ KHẢO SÁT VỊ TRÍ LÔ 5 AI TRÊN ${totalDays} KỲ (2022 - 2026) ===\n`);
    console.log('---------------------------------------------------------------------------------------------------------');
    console.log('Cấu Hình Lô         | Vốn (Tỷ) | Tiền Ăn (Tỷ) | Tổng Nháy Trúng | Tỷ Lệ Ngày Thắng | LÃI RÒNG (M) | ROI (%)');
    console.log('---------------------------------------------------------------------------------------------------------');

    kSizes.forEach(k => {
        // W100
        const st100 = stats[`W100_Top${k}`];
        const prof100 = st100.payout - st100.stake;
        const roi100 = (prof100 / st100.stake) * 100;
        const winRate100 = ((st100.daysWin / totalDays) * 100).toFixed(1);
        console.log(`Top ${k.toString().padStart(2)} Lô (W = 100) | ${(st100.stake/1000).toFixed(1).padStart(7)}T | ${(st100.payout/1000).toFixed(1).padStart(11)}T | ${st100.hits.toString().padStart(15)} | ${winRate100.padStart(16)}% | ${(prof100>=0?'+':'')+prof100.toFixed(1).padStart(10)}M | ${(roi100>=0?'+':'')+roi100.toFixed(2)}%`);

        // W365
        const st365 = stats[`W365_Top${k}`];
        const prof365 = st365.payout - st365.stake;
        const roi365 = (prof365 / st365.stake) * 100;
        const winRate365 = ((st365.daysWin / totalDays) * 100).toFixed(1);
        console.log(`Top ${k.toString().padStart(2)} Lô (W = 365) | ${(st365.stake/1000).toFixed(1).padStart(7)}T | ${(st365.payout/1000).toFixed(1).padStart(11)}T | ${st365.hits.toString().padStart(15)} | ${winRate365.padStart(16)}% | ${(prof365>=0?'+':'')+prof365.toFixed(1).padStart(10)}M | ${(roi365>=0?'+':'')+roi365.toFixed(2)}% ⭐`);
        console.log('---------------------------------------------------------------------------------------------------------');
    });
}

detailedLoPositions().catch(console.error);
