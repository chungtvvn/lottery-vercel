'use strict';

/**
 * scripts/research-ai5-lo-v2-tuning-2026.js
 *
 * Phân tích chuyên sâu từng trường phái trong 5 AI Lô động (V1) và tối ưu hóa
 * đồng thời: (1) Lợi nhuận Top 6 & Đa tầng (X5..X1) 324 kỳ 2026 + 26 kỳ Live,
 * (2) Độ xoay số tự nhiên mỗi ngày (avgOverlap <= 2.8/6, uniq30d >= 35, maxStick <= 14d),
 * (3) Tương thích hoàn hảo với Tín Hiệu Hồi Phục 360 (scoreLo, highConsensus, tiers).
 * 100% Strict PIT (T <= D-1).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { getRawData } = require('../lib/data-access');
const { convertRawToCompact } = require('../lib/services/ai5EnsembleDeService');
const { calculateConsensus, evaluateLoTiered } = require('../lib/services/ai5StatsService');
const { computeAll5AIPredictionsW } = require('../lib/services/ai5SignalReboundService');

const LO_STAKE_K = 2200;
const LO_PAYOUT_K = 8000;

function pad2(n) { return String(n).padStart(2, '0'); }
function mirrorOf(x) { return (x % 10) * 10 + Math.floor(x / 10); }
function bongDuongOf(x) { return ((Math.floor(x / 10) + 5) % 10) * 10 + (((x % 10) + 5) % 10); }

function zscoreArr(arr) {
    let sum = 0;
    for (let i = 0; i < 100; i++) sum += arr[i];
    const mean = sum / 100;
    let v = 0;
    for (let i = 0; i < 100; i++) v += (arr[i] - mean) ** 2;
    const sd = Math.sqrt(v / 100) || 1;
    const out = new Float64Array(100);
    for (let i = 0; i < 100; i++) out[i] = (arr[i] - mean) / sd;
    return out;
}

function wilsonLow95(wins, n) {
    if (!n) return 0;
    const p = wins / n;
    const z = 1.96, z2 = z * z;
    return Math.max(0, (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n)) * 100;
}

/**
 * Tính vector điểm chuẩn hóa Z-score cho cả 5 trường phái Độc Lập (Strict PIT < idx)
 */
function compute5SchoolZScores(draws, idx) {
    const prev1 = draws[idx - 1][1];
    const prev2 = idx >= 2 ? draws[idx - 2][1] : prev1;
    const prev1Unique = [...new Set(prev1)];
    const prev2Unique = [...new Set(prev2)];
    const prev1Counts = new Int32Array(100);
    const prev1Set = new Uint8Array(100);
    const prev2Set = new Uint8Array(100);
    for (const x of prev1) { prev1Counts[x]++; prev1Set[x] = 1; }
    for (const x of prev2Unique) prev2Set[x] = 1;

    const lastSeen = new Int32Array(100).fill(-1);
    const gapSum = new Float64Array(100);
    const gapCnt = new Int32Array(100);
    const lo7 = new Int32Array(100);
    const lo14 = new Int32Array(100);
    const lo30 = new Int32Array(100);
    const lo60 = new Int32Array(100);
    const lo120 = new Int32Array(100);
    const lo180 = new Int32Array(100);
    const emaFast = new Float64Array(100); // decay 0.85
    const emaMed = new Float64Array(100);  // decay 0.96

    const maxW = 540;
    const startHist = Math.max(0, idx - maxW);
    for (let i = startHist; i < idx; i++) {
        const age = idx - 1 - i;
        const p27 = draws[i][1];
        const wFast = age < 40 ? Math.pow(0.85, age) : 0;
        const wMed = age < 150 ? Math.pow(0.965, age) : 0;
        const seenToday = new Uint8Array(100);
        for (let k = 0; k < 27; k++) {
            const x = p27[k];
            if (age < 7) lo7[x]++;
            if (age < 14) lo14[x]++;
            if (age < 30) lo30[x]++;
            if (age < 60) lo60[x]++;
            if (age < 120) lo120[x]++;
            if (age < 180) lo180[x]++;
            if (wFast > 0) emaFast[x] += wFast;
            if (wMed > 0) emaMed[x] += wMed;
            if (!seenToday[x]) {
                seenToday[x] = 1;
                if (age < 360) {
                    if (lastSeen[x] >= idx - 360) {
                        gapSum[x] += (i - lastSeen[x]);
                        gapCnt[x]++;
                    }
                }
                lastSeen[x] = i;
            }
        }
    }

    const gap = new Int32Array(100);
    const ganFactor = new Float64Array(100);
    for (let x = 0; x < 100; x++) {
        gap[x] = lastSeen[x] >= 0 ? (idx - 1 - lastSeen[x]) : 60;
        if (gap[x] <= 10) ganFactor[x] = 1.0;
        else if (gap[x] <= 15) ganFactor[x] = 0.85;
        else if (gap[x] <= 22) ganFactor[x] = 0.65;
        else ganFactor[x] = 0.45;
    }

    // 1. Markov 1-step Transition Lift (D-1 -> D) over 540 days
    const mStart = Math.max(1, idx - 540);
    const baseHitsM = new Float64Array(100);
    const srcOccur = new Float64Array(100);
    const pairFollow = Array.from({ length: 100 }, () => null);
    for (const x of prev1Unique) pairFollow[x] = new Float64Array(100);
    let totalM = 0;

    for (let i = mStart; i < idx; i++) {
        const yDraws = draws[i][1];
        const xDraws = draws[i - 1][1];
        const age = idx - 1 - i;
        const tw = 1.0 / (1.0 + age / 240);
        totalM += tw;
        const yU = new Uint8Array(100);
        for (let k = 0; k < 27; k++) { baseHitsM[yDraws[k]] += tw; yU[yDraws[k]] = 1; }
        const xSeen = new Uint8Array(100);
        for (let k = 0; k < 27; k++) {
            const x = xDraws[k];
            if (prev1Set[x] && !xSeen[x]) {
                xSeen[x] = 1;
                srcOccur[x] += tw;
                const pf = pairFollow[x];
                for (let y = 0; y < 100; y++) if (yU[y]) pf[y] += tw;
            }
        }
    }
    const markovRaw = new Float64Array(100);
    for (let y = 0; y < 100; y++) {
        const baseP = (baseHitsM[y] + 2.7) / (totalM + 10);
        let liftSum = 0, wSum = 0;
        for (const x of prev1Unique) {
            const occ = srcOccur[x];
            if (occ < 3) continue;
            const condP = (pairFollow[x][y] + 1.2) / (occ + 5.0);
            const w = (x === prev1[0] ? 2.2 : (x === prev1[1] ? 1.6 : (prev1Counts[x] >= 2 ? 1.5 : 1.0)));
            liftSum += w * Math.log((condP + 0.01) / (baseP + 0.01));
            wSum += w;
        }
        markovRaw[y] = (wSum > 0 ? liftSum / wSum : 0) * ganFactor[y];
    }

    // 2. Positional Bridge (GĐB/G1/G2/G7) + Lô Rơi / Lộn / Bóng
    const keySlots = [0, 1, 2, 3, 23, 24, 25, 26];
    const bStart = Math.max(1, idx - 360);
    const bridgeHitCount = new Float64Array(keySlots.length * keySlots.length);
    const bridgeTotal = idx - bStart;
    for (let i = bStart; i < idx; i++) {
        const prev = draws[i - 1][1];
        const curr = draws[i][1];
        const currSet = new Uint8Array(100);
        for (let k = 0; k < 27; k++) currSet[curr[k]] = 1;
        const age = idx - 1 - i;
        const recW = age < 30 ? 2.0 : (age < 90 ? 1.3 : 0.8);
        for (let a = 0; a < keySlots.length; a++) {
            const dA = Math.floor(prev[keySlots[a]] / 10);
            const tA = prev[keySlots[a]] % 10;
            for (let b = 0; b < keySlots.length; b++) {
                const dB = prev[keySlots[b]] % 10;
                if (currSet[dA * 10 + dB] || currSet[dB * 10 + tA]) {
                    bridgeHitCount[a * keySlots.length + b] += recW;
                }
            }
        }
    }
    const bridgeRaw = new Float64Array(100);
    for (let a = 0; a < keySlots.length; a++) {
        const dA = Math.floor(prev1[keySlots[a]] / 10);
        const tA = prev1[keySlots[a]] % 10;
        for (let b = 0; b < keySlots.length; b++) {
            const bScore = bridgeHitCount[a * keySlots.length + b] / Math.max(1, bridgeTotal);
            if (bScore > 0.36) {
                const boost = (bScore - 0.34) * 3.0;
                bridgeRaw[dA * 10 + (prev1[keySlots[b]] % 10)] += boost;
                bridgeRaw[(prev1[keySlots[b]] % 10) * 10 + tA] += boost * 0.65;
            }
        }
    }
    bridgeRaw[prev1[0]] += 0.65;
    bridgeRaw[mirrorOf(prev1[0])] += 0.55;
    bridgeRaw[bongDuongOf(prev1[0])] += 0.35;
    bridgeRaw[prev1[1]] += 0.55;
    bridgeRaw[mirrorOf(prev1[1])] += 0.45;
    for (let x = 0; x < 100; x++) {
        if (prev1Counts[x] >= 2) { bridgeRaw[x] += 0.45; bridgeRaw[mirrorOf(x)] += 0.45; }
        bridgeRaw[x] *= ganFactor[x];
    }

    // 3. Exponential Decay Momentum & Short-Term Acceleration (Gemini)
    const zEmaF = zscoreArr(emaFast), zEmaM = zscoreArr(emaMed);
    const z7 = zscoreArr(lo7), z14 = zscoreArr(lo14), z30 = zscoreArr(lo30);
    const z60 = zscoreArr(lo60), z120 = zscoreArr(lo120), z180 = zscoreArr(lo180);
    const momRaw = new Float64Array(100);
    for (let x = 0; x < 100; x++) {
        const accel = (lo7[x] / 7 - lo30[x] / 30);
        const cool = gap[x] === 0 ? -0.15 : (gap[x] >= 1 && gap[x] <= 4 ? 0.25 : 0);
        momRaw[x] = (0.45 * zEmaF[x] + 0.25 * z7[x] + 0.15 * z14[x] + 0.15 * accel * 5 + cool) * ganFactor[x];
    }

    // 4. Weibull / Empirical Gap Hazard + Recency (Grok)
    const zMarkov = zscoreArr(markovRaw);
    const hazardRaw = new Float64Array(100);
    for (let x = 0; x < 100; x++) {
        const meanGap = gapCnt[x] >= 10 ? (gapSum[x] / gapCnt[x]) : 4.2;
        const g = gap[x];
        let h = 0;
        if (g === 0) h = -0.35;
        else if (g >= 1 && g <= 9) h = Math.exp(-Math.pow(g / Math.max(2.0, meanGap) - 1.15, 2) / 0.45);
        else if (g <= 14) h = 0.20;
        else h = -0.60;
        hazardRaw[x] = (0.55 * h + 0.25 * z30[x] + 0.20 * zMarkov[x]) * ganFactor[x];
    }

    // 5. Adaptive Medium Rhythm (EMA_med + 60/120d + Lag-2 + Head/Tail Wave, NO loAll 21y!) (Muse)
    const head5 = new Float64Array(10), tail5 = new Float64Array(10);
    for (let i = Math.max(0, idx - 5); i < idx; i++) {
        const w = 1.0 - (idx - 1 - i) * 0.15;
        for (const x of draws[i][1]) { head5[Math.floor(x / 10)] += w; tail5[x % 10] += w; }
    }
    const museRaw = new Float64Array(100);
    for (let x = 0; x < 100; x++) {
        const ht = (head5[Math.floor(x / 10)] + tail5[x % 10]) / 27;
        const lag2 = (prev2Set[x] && !prev1Set[x]) ? 0.55 : 0;
        const lag2Mir = prev2Set[mirrorOf(x)] ? 0.25 : 0;
        museRaw[x] = (0.35 * z60[x] + 0.25 * z180[x] + 0.20 * ht + 0.20 * (lag2 + lag2Mir)) * ganFactor[x];
    }

    return {
        zChatgpt: zMarkov,
        zClaude: zscoreArr(bridgeRaw),
        zGemini: zscoreArr(momRaw),
        zGrok: zscoreArr(hazardRaw),
        zMuse: zscoreArr(museRaw),
        zEmaM,
        z30,
        z180,
        ganFactor
    };
}

function top6Of(arr) {
    const nums = Array.from({ length: 100 }, (_, x) => x);
    nums.sort((a, b) => (arr[b] - arr[a]) || (a - b));
    return nums.slice(0, 6).map(pad2);
}

(async () => {
    const raw = await getRawData();
    const draws = convertRawToCompact(raw);
    const startIdx = draws.findIndex(d => d[0] >= '2026-01-01');
    const N = draws.length - startIdx;
    console.log(`=== STANDALONE SCHOOL AUDIT (${N} days in 2026, 100% Strict PIT) ===`);

    // Precompute 5 school scores for every 2026 day once (fast!)
    const dayData = [];
    for (let i = startIdx; i < draws.length; i++) {
        dayData.push({
            date: draws[i][0],
            actual27: draws[i][1].map(pad2),
            scores: compute5SchoolZScores(draws, i)
        });
    }

    function evalSingle(label, scoreGetter) {
        let stakeK = 0, payK = 0, winDays = 0, hitDays = 0, ovSum = 0, prev = null;
        const u30 = new Set();
        for (let k = 0; k < dayData.length; k++) {
            const d = dayData[k];
            const picks = top6Of(scoreGetter(d.scores));
            if (prev) ovSum += picks.filter(n => prev.has(n)).length;
            prev = new Set(picks);
            if (k >= dayData.length - 30) picks.forEach(n => u30.add(n));
            const actMap = {};
            d.actual27.forEach(a => actMap[a] = (actMap[a] || 0) + 1);
            let h = 0; picks.forEach(n => h += (actMap[n] || 0));
            stakeK += 6 * LO_STAKE_K;
            payK += h * LO_PAYOUT_K;
            if (h > 0) hitDays++;
            if (h * LO_PAYOUT_K > 6 * LO_STAKE_K) winDays++;
        }
        const profM = (payK - stakeK) / 1000;
        const roi = (payK - stakeK) / stakeK * 100;
        return { school: label, profitM: profM.toFixed(1) + 'M', roi: roi.toFixed(2) + '%', profRate: (winDays / N * 100).toFixed(1) + '%', hitRate: (hitDays / N * 100).toFixed(1) + '%', avgOv: (ovSum / (N - 1)).toFixed(2) + '/6', uniq30d: u30.size };
    }

    console.table([
        evalSingle('1. ChatGPT (Markov D-1)', s => s.zChatgpt),
        evalSingle('2. Claude (Bridge + Rơi/Lộn)', s => s.zClaude),
        evalSingle('3. Gemini (EMA Momentum)', s => s.zGemini),
        evalSingle('4. Grok (Weibull Hazard)', s => s.zGrok),
        evalSingle('5. Muse (Medium 60/180 + Lag2)', s => s.zMuse),
        evalSingle('Extra: EMA_med (decay 0.965)', s => s.zEmaM),
        evalSingle('Extra: lo180 pure', s => s.z180)
    ]);

    // Now test Ensemble Architectures (varying blend coefficient beta with shared multi-school backbone so votes converge naturally into X3/X4/X5 while keeping fresh daily rotation!)
    function evalEnsemble(label, builderFn, minVoteTier = 1) {
        let s6 = 0, p6 = 0, w6 = 0, h6d = 0, eq6 = 0, pk6 = 0, dd6 = 0;
        let sT = 0, pT = 0, wT = 0, eqT = 0, pkT = 0, ddT = 0;
        let lS6 = 0, lP6 = 0, lST = 0, lPT = 0, lDays = 0;
        let prev6 = null, ovSum = 0;
        const u30 = new Set(), streak = new Int32Array(100);
        let maxStick = 0, maxStickNum = '', x345Days = 0, avgTierStake = 0;
        const recent7 = [];

        for (let k = 0; k < dayData.length; k++) {
            const d = dayData[k];
            const preds = builderFn(d.scores, k);
            const cons = calculateConsensus(preds);
            const top6 = cons.loTop6 || [];
            const allTiers = (cons.loAllTiers || []).filter(n => (cons.loMultiplierMap[n] || 0) >= minVoteTier);
            const multMap = {};
            allTiers.forEach(n => multMap[n] = cons.loMultiplierMap[n]);

            const highCnt = (cons.loTiers?.x5Nums?.length || 0) + (cons.loTiers?.x4Nums?.length || 0) + (cons.loTiers?.x3Nums?.length || 0);
            if (highCnt > 0) x345Days++;

            if (prev6) ovSum += top6.filter(n => prev6.has(n)).length;
            prev6 = new Set(top6);
            if (k >= dayData.length - 30) top6.forEach(n => u30.add(n));
            for (let x = 0; x < 100; x++) {
                if (prev6.has(pad2(x))) {
                    streak[x]++;
                    if (streak[x] > maxStick) { maxStick = streak[x]; maxStickNum = pad2(x); }
                } else streak[x] = 0;
            }
            if (k >= dayData.length - 7) {
                recent7.push({
                    date: d.date,
                    top6: top6.join(','),
                    x5: (cons.loTiers?.x5Nums || []).join(','),
                    x4: (cons.loTiers?.x4Nums || []).join(','),
                    x3: (cons.loTiers?.x3Nums || []).join(','),
                    tierCnt: allTiers.length
                });
            }

            const actMap = {};
            d.actual27.forEach(a => actMap[a] = (actMap[a] || 0) + 1);
            let h6 = 0; top6.forEach(n => h6 += (actMap[n] || 0));
            const dayS6 = 6 * LO_STAKE_K, dayP6 = h6 * LO_PAYOUT_K;
            s6 += dayS6; p6 += dayP6;
            if (h6 > 0) h6d++;
            if (dayP6 > dayS6) w6++;
            eq6 += (dayP6 - dayS6);
            if (eq6 > pk6) pk6 = eq6; else if (pk6 - eq6 > dd6) dd6 = pk6 - eq6;

            const evT = evaluateLoTiered(multMap, d.actual27, allTiers);
            sT += evT.stakeK; pT += evT.payoutK;
            avgTierStake += evT.stakeK;
            if (evT.profitK > 0) wT++;
            eqT += evT.profitK;
            if (eqT > pkT) pkT = eqT; else if (pkT - eqT > ddT) ddT = pkT - eqT;

            if (d.date >= '2026-10-30') {
                lDays++;
                lS6 += dayS6; lP6 += dayP6;
                lST += evT.stakeK; lPT += evT.payoutK;
            }
        }

        return {
            summary: {
                model: label,
                top6P: ((p6 - s6) / 1000).toFixed(1) + 'M',
                top6Roi: ((p6 - s6) / s6 * 100).toFixed(2) + '%',
                profRate: (w6 / N * 100).toFixed(1) + '%',
                w95: wilsonLow95(w6, N).toFixed(1) + '%',
                dd6: (dd6 / 1000).toFixed(0) + 'M',
                tierP: ((pT - sT) / 1000).toFixed(1) + 'M',
                tierRoi: (sT ? (pT - sT) / sT * 100 : 0).toFixed(2) + '%',
                avgTStk: (avgTierStake / N / 1000).toFixed(1) + 'M',
                live26_6: ((lP6 - lS6) / 1000).toFixed(1) + 'M',
                live26_T: ((lPT - lST) / 1000).toFixed(1) + 'M',
                ov6: (ovSum / (N - 1)).toFixed(2) + '/6',
                u30: u30.size,
                maxStk: `${maxStick}d(${maxStickNum})`,
                hasX345: (x345Days / N * 100).toFixed(0) + '%'
            },
            recent7
        };
    }

    const blend = (a, b, wA) => {
        const out = new Float64Array(100);
        for (let x = 0; x < 100; x++) out[x] = wA * a[x] + (1 - wA) * b[x];
        return out;
    };
    const combine = (s, weights) => {
        const out = new Float64Array(100);
        for (let x = 0; x < 100; x++) {
            out[x] = (weights.c || 0) * s.zChatgpt[x] + (weights.cl || 0) * s.zClaude[x]
                + (weights.g || 0) * s.zGemini[x] + (weights.gr || 0) * s.zGrok[x]
                + (weights.m || 0) * s.zMuse[x] + (weights.em || 0) * s.zEmaM[x]
                + (weights.l180 || 0) * s.z180[x];
        }
        return out;
    };

    const models = [
        ['OLD Static W=360 (Baseline)', (_, k) => computeAll5AIPredictionsW(dayData[k].date, draws.slice(0, startIdx + k), 360), 1],
        ['M1: 5-School Pure (No loAll)', s => ({
            chatgpt: { lo: top6Of(s.zChatgpt) },
            claude: { lo: top6Of(s.zClaude) },
            gemini: { lo: top6Of(s.zGemini) },
            grok: { lo: top6Of(s.zGrok) },
            muse: { lo: top6Of(s.zMuse) }
        }), 1],
        ['M1b: 5-School Pure (Tier >=2 vote only)', s => ({
            chatgpt: { lo: top6Of(s.zChatgpt) },
            claude: { lo: top6Of(s.zClaude) },
            gemini: { lo: top6Of(s.zGemini) },
            grok: { lo: top6Of(s.zGrok) },
            muse: { lo: top6Of(s.zMuse) }
        }), 2],
        ['M2: 5-School + 30% Dynamic Core (β=0.30)', s => {
            const core = combine(s, { c: 0.25, cl: 0.15, g: 0.20, gr: 0.20, m: 0.20 });
            return {
                chatgpt: { lo: top6Of(blend(s.zChatgpt, core, 0.70)) },
                claude: { lo: top6Of(blend(s.zClaude, core, 0.70)) },
                gemini: { lo: top6Of(blend(s.zGemini, core, 0.70)) },
                grok: { lo: top6Of(blend(s.zGrok, core, 0.70)) },
                muse: { lo: top6Of(blend(s.zMuse, core, 0.70)) }
            };
        }, 1],
        ['M3: 5-School + 35% EMA_Med Backbone', s => {
            const back = combine(s, { c: 0.22, g: 0.23, gr: 0.20, em: 0.35 });
            return {
                chatgpt: { lo: top6Of(blend(s.zChatgpt, back, 0.65)) },
                claude: { lo: top6Of(blend(s.zClaude, back, 0.65)) },
                gemini: { lo: top6Of(blend(s.zGemini, back, 0.65)) },
                grok: { lo: top6Of(blend(s.zGrok, back, 0.65)) },
                muse: { lo: top6Of(blend(s.zMuse, back, 0.65)) }
            };
        }, 1],
        ['M4: 5-School Tuned (Drop weak Claude noise + EMA_med)', s => {
            const core = combine(s, { c: 0.28, g: 0.22, gr: 0.20, m: 0.15, em: 0.15 });
            return {
                chatgpt: { lo: top6Of(blend(s.zChatgpt, core, 0.65)) },
                claude: { lo: top6Of(combine(s, { cl: 0.55, c: 0.25, em: 0.20 })) },
                gemini: { lo: top6Of(blend(s.zGemini, core, 0.65)) },
                grok: { lo: top6Of(blend(s.zGrok, core, 0.65)) },
                muse: { lo: top6Of(combine(s, { m: 0.55, em: 0.30, c: 0.15 })) }
            };
        }, 1],
        ['M5: 5-School Tuned (Tier >=2 vote only)', s => {
            const core = combine(s, { c: 0.28, g: 0.22, gr: 0.20, m: 0.15, em: 0.15 });
            return {
                chatgpt: { lo: top6Of(blend(s.zChatgpt, core, 0.65)) },
                claude: { lo: top6Of(combine(s, { cl: 0.55, c: 0.25, em: 0.20 })) },
                gemini: { lo: top6Of(blend(s.zGemini, core, 0.65)) },
                grok: { lo: top6Of(blend(s.zGrok, core, 0.65)) },
                muse: { lo: top6Of(combine(s, { m: 0.55, em: 0.30, c: 0.15 })) }
            };
        }, 2],
        ['M6: 5-School Dynamic (EMA_fast + Markov + Hazard + 180d, no loAll)', s => {
            return {
                chatgpt: { lo: top6Of(combine(s, { c: 0.60, g: 0.20, em: 0.20 })) },
                claude: { lo: top6Of(combine(s, { cl: 0.50, c: 0.20, l180: 0.30 })) },
                gemini: { lo: top6Of(combine(s, { g: 0.55, gr: 0.20, em: 0.25 })) },
                grok: { lo: top6Of(combine(s, { gr: 0.55, c: 0.20, l180: 0.25 })) },
                muse: { lo: top6Of(combine(s, { m: 0.50, em: 0.30, l180: 0.20 })) }
            };
        }, 1]
    ];

    console.log('\n=== ENSEMBLE COMPARISON (324 DAYS 2026 + LIVE 26 DAYS) ===');
    const out = models.map(([lbl, fn, mv]) => ({ lbl, ...evalEnsemble(lbl, fn, mv) }));
    console.table(out.map(o => o.summary));

    for (const o of out) {
        if (o.lbl.startsWith('M2:') || o.lbl.startsWith('M3:') || o.lbl.startsWith('M4:') || o.lbl.startsWith('M6:')) {
            console.log(`\n--- 7 ngày gần nhất: ${o.lbl} ---`);
            console.table(o.recent7);
        }
    }
})();
