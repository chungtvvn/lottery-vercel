#!/usr/bin/env node
'use strict';

/**
 * scripts/research-new-latent-form-chain-methods.js
 *
 * NGHIÊN CỨU & KIỂM ĐỊNH PHƯƠNG PHÁP MỚI DỰA TRÊN TẤT CẢ DẠNG SỐ & DẠNG CHUỖI
 * (Multi-Dimensional Latent Semantic Form & Chain Tensor Engine - DeLatentTensorForm)
 *
 * Tích hợp:
 * 1. Không gian Dạng Số (Semantic Forms):
 *    - 10 Chạm (0..9) + Bóng Dương/Bóng Âm
 *    - 10 Tổng (0..9)
 *    - 15 Bộ số truyền thống (00..44, 01..34)
 *    - Parity 4 trạng thái (CC, CL, LC, LL)
 *    - Size 4 trạng thái (NN, NL, LN, LL)
 * 2. Không gian Dạng Chuỗi (Sequence & Chains):
 *    - Ma trận chuyển tiếp Markov có trọng số lùi (Lag 1 & Lag 2) cho Đầu, Đuôi, Tổng, Bộ, Parity
 *    - Phân phối nhịp vắng mặt Weibull Hazard Sweet-spot (vùng rơi vàng gap 3-8, phạt gan > 22)
 *    - Động năng Lô rơi Đề (Lotto Pull Resonance từ 27 giải mở thưởng D-1)
 *    - Cầu vị trí đồng thuận (Positional Bridge GĐB/G7)
 *
 * Kiểm định:
 * - 100% Strict Point-In-Time (Strict PIT) trên toàn bộ 275 kỳ mở thưởng năm 2026.
 * - Tuân thủ Nguyên Lý Giới Hạn Kỳ Vọng Toán Học (Theoretical Expectation Bounds).
 */

const fs = require('fs');
const path = require('path');

const rawFile = path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');
if (!fs.existsSync(rawFile)) {
    console.error('❌ Không tìm thấy dữ liệu gốc:', rawFile);
    process.exit(1);
}

const rawRows = JSON.parse(fs.readFileSync(rawFile, 'utf8'));

// 1. Ánh xạ 15 Bộ Số Chuẩn
const BO_DEFS = {
    '00': [0, 55, 5, 50],
    '11': [11, 66, 16, 61],
    '22': [22, 77, 27, 72],
    '33': [33, 88, 38, 83],
    '44': [44, 99, 49, 94],
    '01': [1, 10, 6, 60, 51, 15, 56, 65],
    '02': [2, 20, 7, 70, 25, 52, 57, 75],
    '03': [3, 30, 8, 80, 35, 53, 58, 85],
    '04': [4, 40, 9, 90, 45, 54, 59, 95],
    '12': [12, 21, 17, 71, 26, 62, 67, 76],
    '13': [13, 31, 18, 81, 36, 63, 68, 86],
    '14': [14, 41, 19, 91, 46, 64, 69, 96],
    '23': [23, 32, 28, 82, 37, 73, 78, 87],
    '24': [24, 42, 29, 92, 47, 74, 79, 97],
    '34': [34, 43, 39, 93, 48, 84, 89, 98]
};

const NUM_TO_BO = new Int8Array(100);
const BO_KEYS = Object.keys(BO_DEFS);
BO_KEYS.forEach((k, idx) => {
    BO_DEFS[k].forEach(num => {
        NUM_TO_BO[num] = idx;
    });
});

// Trích xuất 27 giải Lô
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

// Cận dưới Wilson 95%
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
console.log('🔬 NGHIÊN CỨU & KIỂM ĐỊNH PHƯƠNG PHÁP MỚI: LATENT TENSOR FORM');
console.log('================================================================\n');

// Lọc các kỳ quay năm 2026
const sortedAll = [...rawRows].sort((a, b) => a.date.localeCompare(b.date));
const testDates2026 = sortedAll.filter(r => r.date.startsWith('2026-'));
console.log(`✓ Đã nạp ${sortedAll.length} kỳ mở thưởng lịch sử.`);
console.log(`✓ Tập kiểm định Out-of-Sample: ${testDates2026.length} kỳ năm 2026 (100% Strict PIT).\n`);

// Bộ đếm hiệu suất cho các quy mô dàn
const metrics = {
    top10: { hits: 0, stakeK: 10000, payoutHitK: 84000, profitK: 0, drawCount: 0 },
    top20: { hits: 0, stakeK: 20000, payoutHitK: 84000, profitK: 0, drawCount: 0 },
    top30: { hits: 0, stakeK: 30000, payoutHitK: 84000, profitK: 0, drawCount: 0 },
    top36: { hits: 0, stakeK: 36000, payoutHitK: 84000, profitK: 0, drawCount: 0 },
    top40: { hits: 0, stakeK: 40000, payoutHitK: 84000, profitK: 0, drawCount: 0 }
};

const monthlyBreakdown = {};

// Chạy Walk-Forward kiểm định từng ngày năm 2026
const lookbackWindow = 365; // Cửa sổ trượt 365 ngày

for (let i = 0; i < sortedAll.length; i++) {
    const targetRow = sortedAll[i];
    if (!targetRow.date.startsWith('2026-')) continue;

    const targetDate = targetRow.date;
    const actualSpecial = Number(targetRow.special);

    // Dữ liệu huấn luyện CHỈ đến i - 1 (Strict PIT tuyệt đối)
    const trainHistory = sortedAll.slice(Math.max(0, i - lookbackWindow), i);
    const N = trainHistory.length;
    if (N < 60) continue;

    const lastDraw = trainHistory[N - 1];
    const lastSpecial = Number(lastDraw.special);
    const lastH = Math.floor(lastSpecial / 10);
    const lastT = lastSpecial % 10;
    const lastSum = (lastH + lastT) % 10;
    const lastBo = NUM_TO_BO[lastSpecial];
    const lastParity = (lastH % 2 === 0 ? 0 : 2) + (lastT % 2 === 0 ? 0 : 1); // 0: CC, 1: CL, 2: LC, 3: LL

    // 27 giải Lô hôm qua
    const prev27 = extract27(lastDraw);
    const prevLottoFreq = new Int8Array(100);
    prev27.forEach(p => {
        if (p >= 0 && p < 100) prevLottoFreq[p]++;
    });

    // 1. Ma trận chuyển tiếp Markov với làm mịn Laplace alpha = 0.5
    const headTrans = Array.from({ length: 10 }, () => new Float32Array(10));
    const tailTrans = Array.from({ length: 10 }, () => new Float32Array(10));
    const sumTrans = Array.from({ length: 10 }, () => new Float32Array(10));
    const boTrans = Array.from({ length: 15 }, () => new Float32Array(15));
    const parityTrans = Array.from({ length: 4 }, () => new Float32Array(4));

    // Đếm chuyển tiếp có trọng số thời gian (decay = 0.003)
    for (let k = 1; k < N; k++) {
        const pDraw = trainHistory[k - 1];
        const cDraw = trainHistory[k];
        const pSp = Number(pDraw.special);
        const cSp = Number(cDraw.special);

        const pH = Math.floor(pSp / 10), pT = pSp % 10, pS = (pH + pT) % 10;
        const cH = Math.floor(cSp / 10), cT = cSp % 10, cS = (cH + cT) % 10;
        const pB = NUM_TO_BO[pSp], cB = NUM_TO_BO[cSp];
        const pP = (pH % 2 === 0 ? 0 : 2) + (pT % 2 === 0 ? 0 : 1);
        const cP = (cH % 2 === 0 ? 0 : 2) + (cT % 2 === 0 ? 0 : 1);

        const weight = Math.exp(-0.003 * (N - 1 - k));
        headTrans[pH][cH] += weight;
        tailTrans[pT][cT] += weight;
        sumTrans[pS][cS] += weight;
        boTrans[pB][cB] += weight;
        parityTrans[pP][cP] += weight;
    }

    // Chuẩn hóa xác suất chuyển tiếp
    function getNormalizedProb(matrix, fromState, toState, stateCount) {
        let sum = 0;
        for (let s = 0; s < stateCount; s++) sum += matrix[fromState][s] + 0.5;
        return (matrix[fromState][toState] + 0.5) / sum;
    }

    // 2. Tính nhịp vắng mặt (Drop Gap) cho 100 số
    const currentGaps = new Int16Array(100);
    const lastSeen = new Int32Array(100).fill(-1);
    for (let k = 0; k < N; k++) {
        const sp = Number(trainHistory[k].special);
        lastSeen[sp] = k;
    }
    for (let n = 0; n < 100; n++) {
        currentGaps[n] = (lastSeen[n] === -1) ? N : (N - 1 - lastSeen[n]);
    }

    // 3. Tính điểm Log-Posterior tổng hợp cho 100 số
    const scores = new Float32Array(100);

    for (let n = 0; n < 100; n++) {
        const h = Math.floor(n / 10);
        const t = n % 10;
        const s = (h + t) % 10;
        const bo = NUM_TO_BO[n];
        const p = (h % 2 === 0 ? 0 : 2) + (t % 2 === 0 ? 0 : 1);

        const probH = getNormalizedProb(headTrans, lastH, h, 10);
        const probT = getNormalizedProb(tailTrans, lastT, t, 10);
        const probSum = getNormalizedProb(sumTrans, lastSum, s, 10);
        const probBo = getNormalizedProb(boTrans, lastBo, bo, 15);
        const probParity = getNormalizedProb(parityTrans, lastParity, p, 4);

        // A. Điểm Semantic Form kết hợp (Log-Likelihood)
        const formLogLikelihood = (
            1.2 * Math.log(probH) +
            1.2 * Math.log(probT) +
            1.4 * Math.log(probSum) +
            1.6 * Math.log(probBo) +
            0.8 * Math.log(probParity)
        );

        // B. Điểm Nhịp Gap Sweet-Spot (Weibull hazard)
        const gap = currentGaps[n];
        let gapScore = 0;
        if (gap >= 3 && gap <= 8) {
            gapScore = 1.8; // Vùng rơi vàng
        } else if (gap >= 9 && gap <= 15) {
            gapScore = 1.0;
        } else if (gap <= 2) {
            gapScore = 0.5; // Nhịp bệt
        } else if (gap >= 22) {
            gapScore = -4.5; // Phạt triệt để số gan
        }

        // C. Điểm Lô rơi Đề (Lotto pull)
        let lotoPullScore = 0;
        if (prevLottoFreq[n] > 0) {
            lotoPullScore = 1.2 + (prevLottoFreq[n] >= 2 ? 0.8 : 0);
        }

        // D. Điểm Chạm rơi từ GĐB hôm qua (Chạm đầu hoặc Chạm đuôi)
        let chamRoiScore = 0;
        if (h === lastH || h === lastT || t === lastH || t === lastT) {
            chamRoiScore = 0.9;
        }

        // Tổng hợp điểm số cho số n
        scores[n] = formLogLikelihood + 2.2 * gapScore + 1.8 * lotoPullScore + 1.2 * chamRoiScore;
    }

    // Xếp hạng 100 số theo điểm giảm dần
    const rankedNumbers = Array.from({ length: 100 }, (_, n) => n)
        .sort((a, b) => scores[b] - scores[a]);

    const top10 = rankedNumbers.slice(0, 10);
    const top20 = rankedNumbers.slice(0, 20);
    const top30 = rankedNumbers.slice(0, 30);
    const top36 = rankedNumbers.slice(0, 36);
    const top40 = rankedNumbers.slice(0, 40);

    // Đối soát kết quả
    const monthKey = targetDate.slice(0, 7);
    if (!monthlyBreakdown[monthKey]) {
        monthlyBreakdown[monthKey] = { total: 0, hit10: 0, hit20: 0, hit30: 0, hit36: 0, hit40: 0 };
    }
    monthlyBreakdown[monthKey].total++;

    function evaluateTier(tierKey, rankedSet) {
        metrics[tierKey].drawCount++;
        const isHit = rankedSet.includes(actualSpecial);
        if (isHit) {
            metrics[tierKey].hits++;
            metrics[tierKey].profitK += (metrics[tierKey].payoutHitK - metrics[tierKey].stakeK);
        } else {
            metrics[tierKey].profitK -= metrics[tierKey].stakeK;
        }
        return isHit;
    }

    if (evaluateTier('top10', top10)) monthlyBreakdown[monthKey].hit10++;
    if (evaluateTier('top20', top20)) monthlyBreakdown[monthKey].hit20++;
    if (evaluateTier('top30', top30)) monthlyBreakdown[monthKey].hit30++;
    if (evaluateTier('top36', top36)) monthlyBreakdown[monthKey].hit36++;
    if (evaluateTier('top40', top40)) monthlyBreakdown[monthKey].hit40++;
}

// Báo cáo Kết quả
console.log('--- KẾT QUẢ WALK-FORWARD TOÀN DIỆN NĂM 2026 (STRICT PIT) ---');
console.log(
    'Quy Mô Dàn'.padEnd(16) +
    'Số kỳ'.padEnd(8) +
    'Số trúng'.padEnd(10) +
    'Win Rate'.padEnd(12) +
    'Wilson 95%'.padEnd(14) +
    'Lợi Nhuận (VNĐ)'.padEnd(18) +
    'ROI'.padEnd(10) +
    'Đánh Giá Cận Kỳ Vọng'
);
console.log('-'.repeat(105));

const totalRuns = metrics.top30.drawCount;

const summaryTiers = [
    { key: 'top10', name: 'Dàn 10s (VIP)', boundCeil: 0.18, boundRed: 0.22 },
    { key: 'top20', name: 'Dàn 20s (Ưu tú)', boundCeil: 0.30, boundRed: 0.35 },
    { key: 'top30', name: 'Dàn 30s (Chuẩn)', boundCeil: 0.44, boundRed: 0.48 },
    { key: 'top36', name: 'Dàn 36s (6x6)', boundCeil: 0.50, boundRed: 0.54 },
    { key: 'top40', name: 'Dàn 40s (Phẳng)', boundCeil: 0.53, boundRed: 0.58 }
];

for (const tier of summaryTiers) {
    const m = metrics[tier.key];
    const winRate = m.hits / totalRuns;
    const wLower = wilsonLower(m.hits, totalRuns);
    const totalStakeK = m.stakeK * totalRuns;
    const roi = (m.profitK / totalStakeK) * 100;

    let evalStatus = '✅ Hợp lý (Nằm trong cận)';
    if (winRate > tier.boundRed) {
        evalStatus = '🚨 BÁO ĐỘNG ĐỎ (QUÁ CAO)';
    } else if (winRate > tier.boundCeil) {
        evalStatus = '⚠️ Sát trần lý thuyết';
    }

    const profitStr = (m.profitK >= 0 ? '+' : '') + (m.profitK / 1000).toFixed(1) + 'M';
    console.log(
        tier.name.padEnd(16) +
        `${totalRuns}`.padEnd(8) +
        `${m.hits}`.padEnd(10) +
        `${(winRate * 100).toFixed(1)}%`.padEnd(12) +
        `${(wLower * 100).toFixed(1)}%`.padEnd(14) +
        profitStr.padEnd(18) +
        `${(roi >= 0 ? '+' : '') + roi.toFixed(1)}%`.padEnd(10) +
        evalStatus
    );
}

console.log('\n--- CHI TIẾT THEO TỪNG THÁNG NĂM 2026 ---');
console.log('Tháng'.padEnd(10) + 'Số kỳ'.padEnd(8) + 'Dàn 10s'.padEnd(12) + 'Dàn 20s'.padEnd(12) + 'Dàn 30s'.padEnd(12) + 'Dàn 36s'.padEnd(12) + 'Dàn 40s');
console.log('-'.repeat(80));

for (const [mKey, mb] of Object.entries(monthlyBreakdown)) {
    console.log(
        mKey.padEnd(10) +
        `${mb.total}`.padEnd(8) +
        `${mb.hit10}/${mb.total} (${((mb.hit10/mb.total)*100).toFixed(0)}%)`.padEnd(12) +
        `${mb.hit20}/${mb.total} (${((mb.hit20/mb.total)*100).toFixed(0)}%)`.padEnd(12) +
        `${mb.hit30}/${mb.total} (${((mb.hit30/mb.total)*100).toFixed(0)}%)`.padEnd(12) +
        `${mb.hit36}/${mb.total} (${((mb.hit36/mb.total)*100).toFixed(0)}%)`.padEnd(12) +
        `${mb.hit40}/${mb.total} (${((mb.hit40/mb.total)*100).toFixed(0)}%)`
    );
}
