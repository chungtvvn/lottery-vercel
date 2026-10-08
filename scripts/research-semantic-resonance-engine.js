#!/usr/bin/env node
'use strict';

/**
 * scripts/research-semantic-resonance-engine.js
 *
 * NGHIÊN CỨU & KIỂM ĐỊNH THỰC CHỨNG 100% STRICT PIT:
 * ĐỘNG CƠ ĐỀ CỘNG HƯỞNG ĐA DẠNG SỐ & NHỊP CHUỖI (SEMANTIC RESONANCE ENGINE)
 *
 * Kiến trúc 3 Lớp Lọc (3-Filter Sieve):
 * - Lớp 1: Không gian dạng số tiên nghiệm (Chạm, Tổng, Bộ số 15 nhóm, Parity, Size)
 * - Lớp 2: Không gian chuỗi nhịp thời gian (Weibull Hazard Sweet-spot gap 2-10, Xung lực Lô rơi Đề, Bệt Chạm)
 * - Lớp 3: Dung hợp đồng thuận Bayes đa động cơ (MetaLearner + DualMerge + Markov Hazard + PentaCore)
 *
 * Đánh giá 3 cấu hình:
 * 1. Dàn 36 số (Vốn 36M/ngày · Ăn 84M · Lãi +48M khi trúng)
 * 2. Dàn 40 số (Vốn 40M/ngày · Ăn 84M · Lãi +44M khi trúng)
 * 3. Dàn 24 số Tinh Tuyển Sweet-Spot (Vốn 24M/ngày · Ăn 84M · Lãi +60M khi trúng)
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rawFile = path.join(root, 'lib', 'data', 'xsmb-2-digits.json');
const cacheFile = path.join(root, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');

const rawRows = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
const advisorCache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

// Ánh xạ 15 Bộ số
const BO_MAP = [
    [0, 55, 5, 50],             // Bộ 00
    [11, 66, 16, 61],           // Bộ 11
    [22, 77, 27, 72],           // Bộ 22
    [33, 88, 38, 83],           // Bộ 33
    [44, 99, 49, 94],           // Bộ 44
    [1, 10, 6, 60, 51, 15, 56, 65], // Bộ 01
    [2, 20, 7, 70, 25, 52, 57, 75], // Bộ 02
    [3, 30, 8, 80, 35, 53, 58, 85], // Bộ 03
    [4, 40, 9, 90, 45, 54, 59, 95], // Bộ 04
    [12, 21, 17, 71, 26, 62, 67, 76], // Bộ 12
    [13, 31, 18, 81, 36, 63, 68, 86], // Bộ 13
    [14, 41, 19, 91, 46, 64, 69, 96], // Bộ 14
    [23, 32, 28, 82, 37, 73, 78, 87], // Bộ 23
    [24, 42, 29, 92, 47, 74, 79, 97], // Bộ 24
    [34, 43, 39, 93, 48, 84, 89, 98]  // Bộ 34
];

const NUM_TO_BO = new Int8Array(100);
BO_MAP.forEach((arr, bIdx) => {
    arr.forEach(n => { NUM_TO_BO[n] = bIdx; });
});

function extract27(row) {
    if (!row) return [];
    if (Array.isArray(row.actual27)) return row.actual27.map(Number);
    if (Array.isArray(row.prizes)) return row.prizes.map(Number);
    const prizes = [];
    if (row.special !== undefined && row.special !== null) prizes.push(Number(row.special));
    if (row.prize1 !== undefined && row.prize1 !== null) prizes.push(Number(row.prize1));
    for (let i = 1; i <= 2; i++) if (row[`prize2_${i}`] !== undefined) prizes.push(Number(row[`prize2_${i}`]));
    for (let i = 1; i <= 6; i++) if (row[`prize3_${i}`] !== undefined) prizes.push(Number(row[`prize3_${i}`]));
    for (let i = 1; i <= 4; i++) if (row[`prize4_${i}`] !== undefined) prizes.push(Number(row[`prize4_${i}`]));
    for (let i = 1; i <= 6; i++) if (row[`prize5_${i}`] !== undefined) prizes.push(Number(row[`prize5_${i}`]));
    for (let i = 1; i <= 3; i++) if (row[`prize6_${i}`] !== undefined) prizes.push(Number(row[`prize6_${i}`]));
    for (let i = 1; i <= 4; i++) if (row[`prize7_${i}`] !== undefined) prizes.push(Number(row[`prize7_${i}`]));
    return prizes.filter(v => !isNaN(v));
}

function wilsonLower(k, n, z = 1.96) {
    if (n === 0) return 0;
    const p = k / n;
    const z2 = z * z;
    const den = 1 + z2 / n;
    const ctr = p + z2 / (2 * n);
    const spr = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return Math.max(0, (ctr - spr) / den);
}

console.log('================================================================');
console.log('🚀 NGHIÊN CỨU ĐỘNG CƠ CỘNG HƯỞNG ĐA DẠNG SỐ & NHỊP CHUỖI');
console.log('   (Semantic Multi-Resonance Engine - 100% Strict PIT 2026)');
console.log('================================================================\n');

// Xây dựng bản đồ dự đoán lịch sử của các động cơ hiện hữu từ cache để làm Lớp 3
const ledgerByDate = {};
function ingestLedger(key, ledger) {
    if (!ledger || !Array.isArray(ledger)) return;
    ledger.forEach(row => {
        const d = row.date || row.predictionDate;
        if (!d) return;
        if (!ledgerByDate[d]) ledgerByDate[d] = {};
        let nums = row.numbers || row.numbersToBet || row.standard30 || row.betNumbers || row.fullUnion || row.union || [];
        ledgerByDate[d][key] = nums.map(Number);
    });
}

ingestLedger('metaLearner', advisorCache.metaLearner?.settledLedger);
ingestLedger('dualMerge', advisorCache.dualMerge?.settledLedger);
ingestLedger('adaptiveDualMerge', advisorCache.adaptiveDualMerge?.settledLedger);
ingestLedger('tripleMerge', advisorCache.tripleMerge?.settledLedger);
ingestLedger('deMarkovGapHazard', advisorCache.deMarkovGapHazard?.settledLedger);
ingestLedger('pentaCoreDe', advisorCache.pentaCoreDe?.settledLedger);

const sortedAll = [...rawRows].sort((a, b) => a.date.localeCompare(b.date));
const dates2026 = sortedAll.filter(r => r.date.startsWith('2026-'));

const stats24 = { hits: 0, total: 0, stakeK: 24000, payoutK: 84000, profitK: 0 };
const stats36 = { hits: 0, total: 0, stakeK: 36000, payoutK: 84000, profitK: 0 };
const stats40 = { hits: 0, total: 0, stakeK: 40000, payoutK: 84000, profitK: 0 };

const monthlyReport = {};

for (let i = 0; i < sortedAll.length; i++) {
    const curDraw = sortedAll[i];
    if (!curDraw.date.startsWith('2026-')) continue;

    const targetDate = curDraw.date;
    const actualSpecial = Number(curDraw.special);

    // Cắt cụt lịch sử tại i - 1 (100% Strict PIT)
    const hist = sortedAll.slice(0, i);
    const N = hist.length;
    if (N < 100) continue;

    const prevDraw = hist[N - 1];
    const prevSpecial = Number(prevDraw.special);
    const prevH = Math.floor(prevSpecial / 10);
    const prevT = prevSpecial % 10;
    const prevSum = (prevH + prevT) % 10;
    const prevBo = NUM_TO_BO[prevSpecial];
    const prev27 = extract27(prevDraw);
    const prevLotoSet = new Set(prev27);

    // 1. Phân tích Dạng Số (Chạm, Tổng, Bộ) trên cửa sổ 45 ngày
    const lookbackForm = 45;
    const chamFreq = new Int8Array(10);
    const tongFreq = new Int8Array(10);
    const boFreq = new Int8Array(15);
    const parityFreq = new Int8Array(4);

    for (let k = Math.max(0, N - lookbackForm); k < N; k++) {
        const sp = Number(hist[k].special);
        const h = Math.floor(sp / 10), t = sp % 10, s = (h + t) % 10;
        chamFreq[h]++;
        chamFreq[t]++;
        tongFreq[s]++;
        boFreq[NUM_TO_BO[sp]]++;
        const p = (h % 2 === 0 ? 0 : 2) + (t % 2 === 0 ? 0 : 1);
        parityFreq[p]++;
    }

    // 2. Tính nhịp rơi Gap của 100 số
    const gaps = new Int16Array(100);
    const lastSeen = new Int32Array(100).fill(-1);
    for (let k = 0; k < N; k++) {
        lastSeen[Number(hist[k].special)] = k;
    }
    for (let n = 0; n < 100; n++) {
        gaps[n] = (lastSeen[n] === -1) ? N : (N - 1 - lastSeen[n]);
    }

    // 3. Điểm số kết hợp đa chiều cho từng số
    const resonanceScores = new Float32Array(100);

    for (let n = 0; n < 100; n++) {
        const h = Math.floor(n / 10), t = n % 10, s = (h + t) % 10;
        const b = NUM_TO_BO[n];
        const p = (h % 2 === 0 ? 0 : 2) + (t % 2 === 0 ? 0 : 1);

        // A. Điểm Dạng Số (Semantic Form Resonance)
        let formScore = 0;
        // Chạm rơi từ GĐB hôm qua (Chạm đầu hoặc Chạm đuôi)
        if (h === prevH || h === prevT || t === prevH || t === prevT) formScore += 2.8;
        // Tổng rơi hoặc Tổng bóng từ hôm qua
        if (s === prevSum || s === (prevSum + 5) % 10) formScore += 2.2;
        // Cùng Bộ số với hôm qua (Bệt bộ)
        if (b === prevBo) formScore += 2.5;

        // Tần suất dạng số gần đây
        formScore += (chamFreq[h] + chamFreq[t]) * 0.15;
        formScore += tongFreq[s] * 0.20;
        formScore += boFreq[b] * 0.25;

        // B. Điểm Nhịp Rơi Gap Hazard
        const g = gaps[n];
        let gapScore = 0;
        if (g >= 3 && g <= 8) gapScore = 3.5;       // Điểm ngọt rơi vàng
        else if (g >= 2 && g <= 12) gapScore = 2.2;
        else if (g <= 1) gapScore = 1.0;            // Bệt liên tiếp
        else if (g >= 22) gapScore = -10.0;         // Khử triệt để số gan > 22

        // C. Điểm Lô rơi Đề (Lotto Pull)
        let lottoScore = 0;
        if (prevLotoSet.has(n)) lottoScore += 3.2;

        resonanceScores[n] = formScore * 1.5 + gapScore * 1.8 + lottoScore * 2.0;
    }

    // 4. Lớp 3: Dung hợp Đồng thuận với các động cơ độc lập đã có tại ngày đó
    const cachedEngines = ledgerByDate[targetDate] || {};
    const engineVotes = new Float32Array(100);

    const weights = {
        metaLearner: 3.2,
        dualMerge: 2.5,
        adaptiveDualMerge: 1.8,
        tripleMerge: 1.5,
        deMarkovGapHazard: 2.2,
        pentaCoreDe: 2.0
    };

    let totalWeight = 0;
    for (const [eKey, eNums] of Object.entries(cachedEngines)) {
        const w = weights[eKey] || 1.0;
        if (Array.isArray(eNums) && eNums.length > 0) {
            totalWeight += w;
            eNums.forEach(num => {
                if (num >= 0 && num < 100) engineVotes[num] += w;
            });
        }
    }

    // Chuẩn hóa điểm đồng thuận
    const finalScores = new Float32Array(100);
    for (let n = 0; n < 100; n++) {
        const voteRatio = totalWeight > 0 ? (engineVotes[n] / totalWeight) : 0;
        // Điểm dung hợp: 45% Động cơ Dạng số & Chuỗi Mới + 55% Đồng thuận Đa Động cơ
        finalScores[n] = resonanceScores[n] * 0.45 + (voteRatio * 25.0) * 0.55;
    }

    // Xếp hạng 100 số
    const rankedAll = Array.from({ length: 100 }, (_, n) => n)
        .sort((a, b) => finalScores[b] - finalScores[a]);

    const set24 = rankedAll.slice(0, 24);
    const set36 = rankedAll.slice(0, 36);
    const set40 = rankedAll.slice(0, 40);

    // Đối soát
    const mKey = targetDate.slice(0, 7);
    if (!monthlyReport[mKey]) monthlyReport[mKey] = { total: 0, hit24: 0, hit36: 0, hit40: 0 };
    monthlyReport[mKey].total++;

    function recordTier(statObj, set, targetSpecial) {
        statObj.total++;
        const isHit = set.includes(targetSpecial);
        if (isHit) {
            statObj.hits++;
            statObj.profitK += (statObj.payoutK - statObj.stakeK);
        } else {
            statObj.profitK -= statObj.stakeK;
        }
        return isHit;
    }

    if (recordTier(stats24, set24, actualSpecial)) monthlyReport[mKey].hit24++;
    if (recordTier(stats36, set36, actualSpecial)) monthlyReport[mKey].hit36++;
    if (recordTier(stats40, set40, actualSpecial)) monthlyReport[mKey].hit40++;
}

console.log('--- KẾT QUẢ ĐỐI SOÁT THỰC CHIẾN 2026 (STRICT PIT NĂM 2026) ---');
console.log(
    'Cấu Hình Dàn'.padEnd(20) +
    'Số kỳ'.padEnd(8) +
    'Trúng'.padEnd(8) +
    'Win Rate'.padEnd(12) +
    'Wilson 95%'.padEnd(14) +
    'Điểm Hòa Vốn'.padEnd(15) +
    'Lãi Ròng (VNĐ)'.padEnd(18) +
    'ROI'
);
console.log('-'.repeat(105));

const tiers = [
    { name: 'Dàn 24s Sweet-Spot', stat: stats24, bep: '28.6%' },
    { name: 'Dàn 36s Chuẩn (6x6)', stat: stats36, bep: '42.9%' },
    { name: 'Dàn 40s Phòng Ngự', stat: stats40, bep: '47.6%' }
];

tiers.forEach(t => {
    const s = t.stat;
    const wr = s.hits / s.total;
    const wl = wilsonLower(s.hits, s.total);
    const totalStake = s.stakeK * s.total;
    const roi = (s.profitK / totalStake) * 100;
    const pStr = (s.profitK >= 0 ? '+' : '') + (s.profitK / 1000).toFixed(1) + 'M';

    console.log(
        t.name.padEnd(20) +
        `${s.total}`.padEnd(8) +
        `${s.hits}`.padEnd(8) +
        `${(wr * 100).toFixed(1)}%`.padEnd(12) +
        `${(wl * 100).toFixed(1)}%`.padEnd(14) +
        t.bep.padEnd(15) +
        pStr.padEnd(18) +
        `${(roi >= 0 ? '+' : '') + roi.toFixed(1)}%`
    );
});

console.log('\n--- CHI TIẾT HIỆU NĂNG THEO TỪNG THÁNG NĂM 2026 ---');
console.log('Tháng'.padEnd(10) + 'Số kỳ'.padEnd(8) + 'Dàn 24s Sweet-Spot'.padEnd(24) + 'Dàn 36s Chuẩn'.padEnd(22) + 'Dàn 40s Phòng Ngự');
console.log('-'.repeat(85));

for (const [mKey, rep] of Object.entries(monthlyReport)) {
    console.log(
        mKey.padEnd(10) +
        `${rep.total}`.padEnd(8) +
        `${rep.hit24}/${rep.total} (${((rep.hit24/rep.total)*100).toFixed(1)}%)`.padEnd(24) +
        `${rep.hit36}/${rep.total} (${((rep.hit36/rep.total)*100).toFixed(1)}%)`.padEnd(22) +
        `${rep.hit40}/${rep.total} (${((rep.hit40/rep.total)*100).toFixed(1)}%)`
    );
}
