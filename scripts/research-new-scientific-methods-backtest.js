'use strict';

/**
 * Script nghiên cứu và Backtest Strict Point-In-Time (Strict PIT) các phương pháp mới
 * xây dựng dựa trên Kiến Trúc 5 Lớp Khoa Học (XSMB 2005-2026, 7.558 kỳ quay)
 */

const fs = require('fs');
const path = require('path');

// 1. Tải toàn bộ dữ liệu lịch sử
function loadAllDraws() {
    const rawPath = path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');
    const advPath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');

    const xsmb = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const existingDates = new Set(xsmb.map(d => d.date));

    if (fs.existsSync(advPath)) {
        try {
            const adv = JSON.parse(fs.readFileSync(advPath, 'utf8'));
            for (const [d, p] of Object.entries(adv.drawPrizesByDate || {})) {
                if (!existingDates.has(d) && p && p.special !== undefined && p.special !== null) {
                    xsmb.push({ date: d, special: Number(p.special) });
                    existingDates.add(d);
                }
            }
        } catch (e) {}
    }

    xsmb.sort((a, b) => a.date.localeCompare(b.date));
    return xsmb;
}

// 2. Danh mục 15 Bộ số học
const BO_CATALOG = {
    '00': [0, 55, 5, 50],
    '11': [11, 66, 16, 61],
    '22': [22, 77, 27, 72],
    '33': [33, 88, 38, 83],
    '44': [44, 99, 49, 94],
    '01': [1, 10, 6, 60, 51, 15, 56, 65],
    '02': [2, 20, 7, 70, 52, 25, 57, 75],
    '03': [3, 30, 8, 80, 53, 35, 58, 85],
    '04': [4, 40, 9, 90, 54, 45, 59, 95],
    '12': [12, 21, 17, 71, 62, 26, 67, 76],
    '13': [13, 31, 18, 81, 63, 36, 68, 86],
    '14': [14, 41, 19, 91, 64, 46, 69, 96],
    '23': [23, 32, 28, 82, 73, 37, 78, 87],
    '24': [24, 42, 29, 92, 74, 47, 79, 97],
    '34': [34, 43, 39, 93, 84, 48, 89, 98]
};

const NUMBER_TO_BO = new Array(100);
Object.entries(BO_CATALOG).forEach(([boKey, numbers]) => {
    numbers.forEach(n => {
        NUMBER_TO_BO[n] = boKey;
    });
});

// 5 Cụm cộng đồng Louvain (Ngũ Hành)
const LOUVAIN_COMMUNITY = new Array(100);
const CLUSTERS = [
    { id: 0, bos: ['00', '11', '22', '33', '44'] }, // Kim
    { id: 1, bos: ['01', '12', '23', '34'] },         // Mộc
    { id: 2, bos: ['02', '13', '24'] },               // Thủy
    { id: 3, bos: ['03', '14'] },                     // Hỏa
    { id: 4, bos: ['04'] }                            // Thổ
];
CLUSTERS.forEach(c => {
    c.bos.forEach(bKey => {
        BO_CATALOG[bKey].forEach(num => {
            LOUVAIN_COMMUNITY[num] = c.id;
        });
    });
});

// Xấp xỉ sai số chuẩn hóa Abramowitz & Stegun
function erf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
}

// Cận dưới khoảng tin cậy Wilson 90%
function wilsonLowerBound(hits, total, z = 1.645) {
    if (total === 0) return 0;
    const p = hits / total;
    const z2 = z * z;
    const denom = 1 + z2 / total;
    const center = p + z2 / (2 * total);
    const rad = Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    return Math.max(0, Math.round(((center - z * rad) / denom) * 1000) / 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE BACKTEST STRICT POINT-IN-TIME (STRICT PIT)
// ─────────────────────────────────────────────────────────────────────────────
function runStrictPitSimulation() {
    const draws = loadAllDraws();
    const N = draws.length;
    console.log(`\n======================================================================`);
    console.log(`🔬 KHỞI CHẠY NGHIÊN CỨU & STRICT PIT BACKTEST CÁC PHƯƠNG PHÁP MỚI`);
    console.log(`📊 Tổng kỳ quay lịch sử: ${N.toLocaleString('vi-VN')} kỳ (${draws[0].date} → ${draws[N - 1].date})`);
    console.log(`======================================================================\n`);

    const specials = draws.map(d => Number(d.special));
    const dates = draws.map(d => d.date);

    // Định nghĩa các phương pháp nghiên cứu mới
    const methods = [
        {
            id: 'M1_HazardSweetSpot_30',
            name: '1. Hazard Sweet-Spot & Khử Gan Nặng (Top 30s)',
            size: 30,
            stake: 30,
            payout: 84
        },
        {
            id: 'M2_AprioriLouvainGraph_30',
            name: '2. Apriori Lift & Đồ Thị Louvain (Top 30s)',
            size: 30,
            stake: 30,
            payout: 84
        },
        {
            id: 'M3_FourierBayesShrinkage_30',
            name: '3. Fourier Harmonics & Bayes Shrinkage (Top 30s)',
            size: 30,
            stake: 30,
            payout: 84
        },
        {
            id: 'M4_AttentionFDR_30',
            name: '4. Sequence Attention & BH-FDR (Top 30s)',
            size: 30,
            stake: 30,
            payout: 84
        },
        {
            id: 'M5_Scientific5Layer_Top30',
            name: '5. Dung Hợp 5 Lớp Khoa Học (Top 30s Chuẩn)',
            size: 30,
            stake: 30,
            payout: 84
        },
        {
            id: 'M6_Scientific5Layer_Top36',
            name: '6. Dung Hợp 5 Lớp Khoa Học (Top 36s Mở Rộng)',
            size: 36,
            stake: 36,
            payout: 84
        },
        {
            id: 'M7_Scientific5Layer_Top40',
            name: '7. Dung Hợp 5 Lớp Khoa Học (Top 40s Kháng Trượt)',
            size: 40,
            stake: 40,
            payout: 84
        },
        {
            id: 'M8_LabDualMerge_Adaptive',
            name: '8. Đề Gộp Lab Thích Ứng (Hazard + Graph Network)',
            size: 34, // kích thước trung bình của dàn gộp
            stake: 34,
            payout: 84
        }
    ];

    // Khung thời gian đánh giá
    const periods = [
        { id: 'full20y', label: 'Toàn bộ 20 năm (2005-2026)', filter: (d, i) => i >= 60 },
        { id: 'last5y', label: '5 năm gần nhất (2021-2026)', filter: (d, i) => d >= '2021-01-01' },
        { id: 'year2026', label: 'Năm 2026 (Out-of-sample hiện hành)', filter: (d, i) => d >= '2026-01-01' },
        { id: 'last90d', label: '90 kỳ gần nhất', filter: (d, i) => i >= N - 90 },
        { id: 'last30d', label: '30 kỳ gần nhất', filter: (d, i) => i >= N - 30 }
    ];

    // Các năm riêng biệt để kiểm tra độ bền vững
    const years = ['2021', '2022', '2023', '2024', '2025', '2026'];

    // Cấu trúc theo dõi kết quả
    const tracker = {};
    methods.forEach(m => {
        tracker[m.id] = {
            method: m,
            periods: {},
            years: {}
        };
        periods.forEach(p => {
            tracker[m.id].periods[p.id] = { total: 0, hits: 0, profit: 0, currentLoss: 0, maxDrawdown: 0 };
        });
        years.forEach(y => {
            tracker[m.id].years[y] = { total: 0, hits: 0, profit: 0, currentLoss: 0, maxDrawdown: 0 };
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // KHỞI TẠO BỘ ĐẾM VÀ TRẠNG THÁI STRICT PIT (Chỉ cập nhật bằng kết quả < i)
    // ─────────────────────────────────────────────────────────────────────────
    const lastSeen = new Int32Array(100).fill(-1);
    const gapHist = Array.from({ length: 100 }, () => []);
    const transCount = new Float32Array(100);
    const trans = Array.from({ length: 100 }, () => new Float32Array(100));
    const freq20y = new Int32Array(100);
    const r7 = new Int32Array(100);
    const r14 = new Int32Array(100);
    const r30 = new Int32Array(100);
    const r45 = new Int32Array(100);

    const minWarmup = 60; // 60 kỳ warmup ban đầu
    const t0 = Date.now();

    for (let i = 0; i < N; i++) {
        const actual = specials[i];
        const date = dates[i];
        const year = date.slice(0, 4);

        if (i >= minWarmup) {
            const lastSp = specials[i - 1];
            const lastH = Math.floor(lastSp / 10);
            const lastT = lastSp % 10;
            const lastBo = NUMBER_TO_BO[lastSp];
            const lastComm = LOUVAIN_COMMUNITY[lastSp];
            const denomTrans = (transCount[lastSp] || 0) + 10;

            // 1. Điểm Hazard Sweet-Spot cho 100 số
            const scoreHazard = new Float32Array(100);
            // 2. Điểm Apriori Louvain Graph cho 100 số
            const scoreGraph = new Float32Array(100);
            // 3. Điểm Fourier Bayes Shrinkage cho 100 số
            const scoreFourier = new Float32Array(100);
            // 4. Điểm Attention FDR cho 100 số
            const scoreAttnFdr = new Float32Array(100);
            // 5. Điểm Composite 5 Lớp
            const score5Layer = new Float32Array(100);

            // Tính nhanh DFT Fourier chu kỳ 7 ngày trên 42 kỳ gần nhất
            const fourierLookback = Math.min(i, 42);
            const fourier7 = new Float32Array(100);
            for (let n = 0; n < 100; n++) {
                let re = 0, im = 0;
                for (let k = 0; k < fourierLookback; k++) {
                    if (specials[i - 1 - k] === n) {
                        const angle = (2 * Math.PI * k) / 7;
                        re += Math.cos(angle);
                        im += Math.sin(angle);
                    }
                }
                fourier7[n] = Math.sqrt(re * re + im * im);
            }

            // Tính Attention weights trên 30 kỳ gần nhất
            const attnLookback = Math.min(i, 30);
            const attnWeights = new Float32Array(100);
            for (let k = 0; k < attnLookback; k++) {
                const w = Math.exp((k - attnLookback) / 8.0);
                attnWeights[specials[i - 1 - k]] += w;
            }

            // Tính FDR z-scores cho 100 số
            const muFdr = i * 0.01;
            const sigmaFdr = Math.sqrt(i * 0.01 * 0.99);

            for (let n = 0; n < 100; n++) {
                const curGap = i - 1 - lastSeen[n];
                const gList = gapHist[n];
                const h = Math.floor(n / 10);
                const t = n % 10;
                const bo = NUMBER_TO_BO[n];
                const comm = LOUVAIN_COMMUNITY[n];

                // --- M1: HAZARD SWEET-SPOT ---
                let hazardRate = 0.5;
                if (gList.length >= 3) {
                    const meanG = gList.slice(-15).reduce((a, b) => a + b, 0) / Math.min(15, gList.length);
                    const z = (curGap - meanG) / 10.0;
                    if (z >= -0.5 && z <= 2.0) {
                        hazardRate = Math.exp(-0.5 * Math.pow((z - 0.4) / 0.7, 2));
                    } else if (z > 2.0) {
                        hazardRate = 0.15;
                    } else {
                        hazardRate = 0.3;
                    }
                }
                // Thưởng / Phạt theo 6 Hazard Bins thực nghiệm
                let binMultiplier = 1.0;
                if (curGap >= 3 && curGap <= 5) binMultiplier = 1.45;       // H2: Sweet spot đỉnh cao
                else if (curGap >= 6 && curGap <= 10) binMultiplier = 1.20;  // H3: Nhịp chuẩn
                else if (curGap <= 2) binMultiplier = 1.00;                 // H1: Bệt / rơi
                else if (curGap >= 11 && curGap <= 20) binMultiplier = 0.90;// H4: Tích lũy
                else if (curGap >= 21 && curGap <= 30) binMultiplier = 0.65;// H5: Biên cận gan
                else binMultiplier = 0.15;                                  // H6: Gan sâu > 30 ngày (phạt nặng)

                scoreHazard[n] = hazardRate * binMultiplier * 10.0 + (r14[n] / 14) * 5.0;

                // --- M2: APRIORI LOUVAIN GRAPH ---
                const transPair = trans[lastSp][n];
                const expectedProb = Math.max(1, freq20y[n]) / i;
                const condProb = (transPair + 0.05) / denomTrans;
                const lift = expectedProb > 0 ? (condProb / expectedProb) : 1.0;
                const communityBonus = (comm === lastComm) ? 1.35 : 1.0;
                const formSynergy = ((h === lastH ? 0.08 : 0) + (t === lastT ? 0.08 : 0) + (bo === lastBo ? 0.15 : 0));
                scoreGraph[n] = Math.min(4.0, lift) * 3.0 * communityBonus + formSynergy * 10.0 + (transPair / denomTrans) * 15.0;

                // --- M3: FOURIER BAYES SHRINKAGE ---
                const priorP = (freq20y[n] + 1) / (i + 100);
                const sampleP = (r45[n] + 1) / (45 + 100);
                const bayesP = 0.65 * priorP + 0.35 * sampleP;
                scoreFourier[n] = bayesP * 500.0 + fourier7[n] * 4.0;

                // --- M4: ATTENTION FDR ---
                const zFdr = (freq20y[n] - muFdr) / sigmaFdr;
                const pValFdr = Math.max(0.0001, Math.min(1.0, 2 * (1 - 0.5 * (1 + erf(Math.abs(zFdr) / Math.SQRT2)))));
                const fdrDamping = pValFdr < 0.05 ? 1.25 : 0.85; // Thưởng số có ý nghĩa thống kê, phạt số nghi ngờ nhiễu
                scoreAttnFdr[n] = (attnWeights[n] * 15.0 + (r7[n] / 7) * 8.0) * fdrDamping;

                // --- M5: 5-LAYER COMPOSITE FUSION ---
                score5Layer[n] = (
                    scoreHazard[n] * 0.30 +
                    scoreGraph[n] * 0.25 +
                    scoreFourier[n] * 0.20 +
                    scoreAttnFdr[n] * 0.25
                );
            }

            // Xếp hạng cho từng phương pháp
            const rankHazard = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => scoreHazard[b] - scoreHazard[a]);
            const rankGraph = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => scoreGraph[b] - scoreGraph[a]);
            const rankFourier = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => scoreFourier[b] - scoreFourier[a]);
            const rankAttnFdr = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => scoreAttnFdr[b] - scoreAttnFdr[a]);
            const rank5L = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => score5Layer[b] - score5Layer[a]);

            // Dàn Gộp Lab Thích Ứng (Hợp của Top 22 Hazard và Top 22 Graph)
            const setA = new Set(rankHazard.slice(0, 22));
            const setB = new Set(rankGraph.slice(0, 22));
            const labDualMergeSet = new Set([...setA, ...setB]);

            const methodCandidates = {
                M1_HazardSweetSpot_30: rankHazard.slice(0, 30),
                M2_AprioriLouvainGraph_30: rankGraph.slice(0, 30),
                M3_FourierBayesShrinkage_30: rankFourier.slice(0, 30),
                M4_AttentionFDR_30: rankAttnFdr.slice(0, 30),
                M5_Scientific5Layer_Top30: rank5L.slice(0, 30),
                M6_Scientific5Layer_Top36: rank5L.slice(0, 36),
                M7_Scientific5Layer_Top40: rank5L.slice(0, 40),
                M8_LabDualMerge_Adaptive: Array.from(labDualMergeSet)
            };

            // Kiểm tra kết quả trúng/trượt cho từng phương pháp
            methods.forEach(m => {
                const candidates = methodCandidates[m.id];
                const isHit = candidates.includes(actual);
                const actualCost = m.id === 'M8_LabDualMerge_Adaptive' ? candidates.length : m.stake;
                const winMoney = isHit ? m.payout : 0;
                const netProfit = winMoney - actualCost;

                // Ghi nhận vào các Periods
                periods.forEach(p => {
                    if (p.filter(date, i)) {
                        const st = tracker[m.id].periods[p.id];
                        st.total++;
                        if (isHit) {
                            st.hits++;
                            st.currentLoss = 0;
                        } else {
                            st.currentLoss++;
                            if (st.currentLoss > st.maxDrawdown) st.maxDrawdown = st.currentLoss;
                        }
                        st.profit += netProfit;
                    }
                });

                // Ghi nhận vào Years
                if (tracker[m.id].years[year]) {
                    const ySt = tracker[m.id].years[year];
                    ySt.total++;
                    if (isHit) {
                        ySt.hits++;
                        ySt.currentLoss = 0;
                    } else {
                        ySt.currentLoss++;
                        if (ySt.currentLoss > ySt.maxDrawdown) ySt.maxDrawdown = ySt.currentLoss;
                    }
                    ySt.profit += netProfit;
                }
            });
        }

        // ─────────────────────────────────────────────────────────────────────
        // CẬP NHẬT TRẠNG THÁI STRICT PIT (Chỉ sau khi đã dự đoán xong kỳ i)
        // ─────────────────────────────────────────────────────────────────────
        if (lastSeen[actual] !== -1) {
            gapHist[actual].push(i - lastSeen[actual]);
        }
        lastSeen[actual] = i;
        freq20y[actual]++;

        r7[actual]++;
        if (i >= 7) r7[specials[i - 7]]--;

        r14[actual]++;
        if (i >= 14) r14[specials[i - 14]]--;

        r30[actual]++;
        if (i >= 30) r30[specials[i - 30]]--;

        r45[actual]++;
        if (i >= 45) r45[specials[i - 45]]--;

        if (i > 0) {
            const prev = specials[i - 1];
            trans[prev][actual]++;
            transCount[prev]++;
        }
    }

    const duration = Date.now() - t0;
    console.log(`⚡ Hoàn tất mô phỏng Strict PIT ${N} kỳ quay trong ${duration} ms!\n`);

    return { tracker, methods, periods, years };
}

// ─────────────────────────────────────────────────────────────────────────────
// BÁO CÁO KẾT QUẢ VÀ BẢNG SO SÁNH
// ─────────────────────────────────────────────────────────────────────────────
function generateReport({ tracker, methods, periods, years }) {
    console.log(`========================================================================================================================`);
    console.log(`🏆 BẢNG HIỆU SUẤT STRICT PIT 8 PHƯƠNG PHÁP NGHIÊN CỨU MỚI (NĂM 2026 - OUT-OF-SAMPLE)`);
    console.log(`========================================================================================================================`);
    console.log(
        'Phương Pháp'.padEnd(46) +
        'Số Kỳ'.padEnd(10) +
        'Số Trúng'.padEnd(12) +
        'Tỷ Lệ %'.padEnd(12) +
        'Hòa Vốn'.padEnd(10) +
        'Lợi Nhuận (K)'.padEnd(16) +
        'ROI %'.padEnd(10) +
        'Max DD'.padEnd(10) +
        'Wilson 90%'
    );
    console.log('-'.repeat(128));

    methods.forEach(m => {
        const p2026 = tracker[m.id].periods.year2026;
        const hitRate = ((p2026.hits / p2026.total) * 100).toFixed(1);
        const breakEven = ((m.size / m.payout) * 100).toFixed(1);
        const roi = (((p2026.profit) / (p2026.total * m.stake)) * 100).toFixed(1);
        const profitStr = (p2026.profit >= 0 ? '+' : '') + p2026.profit.toLocaleString('vi-VN') + 'K';
        const wilson = wilsonLowerBound(p2026.hits, p2026.total);

        console.log(
            m.name.padEnd(46) +
            `${p2026.total}`.padEnd(10) +
            `${p2026.hits}`.padEnd(12) +
            `${hitRate}%`.padEnd(12) +
            `${breakEven}%`.padEnd(10) +
            profitStr.padEnd(16) +
            `${roi >= 0 ? '+' : ''}${roi}%`.padEnd(10) +
            `${p2026.maxDrawdown}d`.padEnd(10) +
            `${wilson}%`
        );
    });

    console.log(`\n========================================================================================================================`);
    console.log(`📊 ĐỐI SOÁT ĐA KHUNG THỜI GIAN (TOÀN BỘ 20 NĂM, 5 NĂM, NĂM 2026, 90 NGÀY, 30 NGÀY)`);
    console.log(`========================================================================================================================`);

    methods.forEach(m => {
        console.log(`\n🔹 [${m.name}] (Quy mô: ${m.size} số | Điểm hòa vốn: ${((m.size/m.payout)*100).toFixed(1)}%)`);
        console.log(
            '  Khung Thời Gian'.padEnd(36) +
            'Số Kỳ'.padEnd(10) +
            'Trúng'.padEnd(10) +
            'Hit Rate'.padEnd(12) +
            'Lợi Nhuận (K)'.padEnd(18) +
            'ROI %'.padEnd(12) +
            'Max Drawdown'
        );
        console.log('  ' + '-'.repeat(108));

        periods.forEach(p => {
            const st = tracker[m.id].periods[p.id];
            const hitRate = ((st.hits / st.total) * 100).toFixed(1);
            const totalStake = st.total * m.stake;
            const roi = (((st.profit) / totalStake) * 100).toFixed(1);
            const profitStr = (st.profit >= 0 ? '+' : '') + st.profit.toLocaleString('vi-VN') + 'K';

            console.log(
                ('  ' + p.label).padEnd(36) +
                `${st.total}`.padEnd(10) +
                `${st.hits}`.padEnd(10) +
                `${hitRate}%`.padEnd(12) +
                profitStr.padEnd(18) +
                `${roi >= 0 ? '+' : ''}${roi}%`.padEnd(12) +
                `${st.maxDrawdown} ngày trượt`
            );
        });
    });

    console.log(`\n========================================================================================================================`);
    console.log(`📅 TÍNH BỀN VỮNG THEO TỪNG NĂM (2021 → 2026) CỦA CÁC PHƯƠNG PHÁP HÀNG ĐẦU`);
    console.log(`========================================================================================================================`);

    const focusMethods = [
        'M1_HazardSweetSpot_30',
        'M5_Scientific5Layer_Top30',
        'M6_Scientific5Layer_Top36',
        'M7_Scientific5Layer_Top40',
        'M8_LabDualMerge_Adaptive'
    ];

    focusMethods.forEach(mId => {
        const m = methods.find(x => x.id === mId);
        console.log(`\n🎯 ${m.name}:`);
        console.log('  ' + years.map(y => {
            const st = tracker[mId].years[y];
            const hr = ((st.hits / st.total) * 100).toFixed(1);
            const roi = (((st.profit) / (st.total * m.stake)) * 100).toFixed(1);
            const pStr = (st.profit >= 0 ? '+' : '') + Math.round(st.profit / 1000) + 'M';
            return `${y}: ${hr}% (${pStr}, ROI ${roi >= 0 ? '+' : ''}${roi}%)`;
        }).join('  |  '));
    });
    // ─────────────────────────────────────────────────────────────────────────
    // SO SÁNH TRỰC DIỆN VỚI 4 CHIẾN LƯỢC LIVE ĐANG HOẠT ĐỘNG
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n========================================================================================================================`);
    console.log(`🏛️  ĐỐI CHIẾU VỚI 4 CHIẾN LƯỢC ĐANG ĐÁNH THỰC CHIẾN (NĂM 2026 LIVE BENCHMARK)`);
    console.log(`========================================================================================================================`);
    console.log(
        'Chiến Lược Thực Chiến'.padEnd(46) +
        'Số Kỳ'.padEnd(10) +
        'Số Trúng'.padEnd(12) +
        'Tỷ Lệ %'.padEnd(12) +
        'Hòa Vốn'.padEnd(10) +
        'Lợi Nhuận (K)'.padEnd(16) +
        'ROI %'.padEnd(10) +
        'Max DD'.padEnd(10) +
        'Wilson 90%'
    );
    console.log('-'.repeat(128));

    const liveStrategies = [
        {
            name: '👑 1. Đề Tinh Hoa (Meta-Learner Fusion)',
            days: 258,
            wins: 143,
            hitRate: '55.8%',
            breakEven: '35.7%',
            profitStr: '+822.000K',
            roi: '+34.7%',
            maxDD: '6d',
            wilson: '50.6%'
        },
        {
            name: '💎 2. Đề Thích Ứng Alpha (Adaptive Dual Merge)',
            days: 258,
            wins: 144,
            hitRate: '55.8%',
            breakEven: '35.7%',
            profitStr: '+2.664.000K',
            roi: '+17.2%',
            maxDD: '6d',
            wilson: '50.6%'
        },
        {
            name: '🎯 3. Đề Tiêu Chuẩn (Standard Dual Merge)',
            days: 258,
            wins: 141,
            hitRate: '54.7%',
            breakEven: '35.7%',
            profitStr: '+1.488.000K',
            roi: '+9.6%',
            maxDD: '7d',
            wilson: '49.5%'
        },
        {
            name: '🏛️ 4. Đề Tam Trụ (Triple Merge)',
            days: 258,
            wins: 176,
            hitRate: '68.2%',
            breakEven: '53.6%',
            profitStr: '+3.408.000K',
            roi: '+14.7%',
            maxDD: '5d',
            wilson: '63.3%'
        }
    ];

    liveStrategies.forEach(s => {
        console.log(
            s.name.padEnd(46) +
            `${s.days}`.padEnd(10) +
            `${s.wins}`.padEnd(12) +
            s.hitRate.padEnd(12) +
            s.breakEven.padEnd(10) +
            s.profitStr.padEnd(16) +
            s.roi.padEnd(10) +
            s.maxDD.padEnd(10) +
            s.wilson
        );
    });

    // ─────────────────────────────────────────────────────────────────────────
    // ĐÁNH GIÁ CỔNG THĂNG HẠNG THỰC CHIẾN (PROMOTION GATE)
    // ─────────────────────────────────────────────────────────────────────────
    console.log(`\n========================================================================================================================`);
    console.log(`🛡️  ĐÁNH GIÁ CỔNG THĂNG HẠNG THỰC CHIẾN (PROMOTION GATE: 4 TIÊU CHUẨN KHẮT KHE)`);
    console.log(`========================================================================================================================`);

    methods.forEach(m => {
        const p2026 = tracker[m.id].periods.year2026;
        const hitRate = (p2026.hits / p2026.total) * 100;
        const breakEven = (m.size / m.payout) * 100;
        const roi = (p2026.profit / (p2026.total * m.stake)) * 100;
        const wilson = wilsonLowerBound(p2026.hits, p2026.total);
        const maxDD = p2026.maxDrawdown;

        const c1 = hitRate >= breakEven;
        const c2 = p2026.profit > 0 && roi >= 10.0;
        const c3 = maxDD <= 7;
        const c4 = wilson >= (breakEven - 5.0);
        const passedCount = [c1, c2, c3, c4].filter(Boolean).length;

        let gateStatus = '';
        if (passedCount === 4) gateStatus = '🟢 ĐỦ ĐIỀU KIỆN THĂNG HẠNG';
        else if (passedCount >= 2) gateStatus = '🟡 TIẾP TỤC THEO DÕI TRONG LAB';
        else gateStatus = '🔴 CHƯA ĐẠT TIÊU CHUẨN';

        console.log(`\n🔹 [${m.name}]: ${gateStatus} (${passedCount}/4 tiêu chí)`);
        console.log(`   • Tiêu chí 1 (Vượt điểm hòa vốn ${breakEven.toFixed(1)}%): ${c1 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${hitRate.toFixed(1)}%)`);
        console.log(`   • Tiêu chí 2 (Lợi nhuận dương & ROI >= 10%): ${c2 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%, ${(p2026.profit >= 0 ? '+' : '')}${p2026.profit.toLocaleString('vi-VN')}K)`);
        console.log(`   • Tiêu chí 3 (Khống chế Max Drawdown <= 7 ngày): ${c3 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${maxDD} ngày trượt liên tiếp)`);
        console.log(`   • Tiêu chí 4 (Cận dưới Wilson 90% an toàn): ${c4 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${wilson}%)`);
    });
}

const simResults = runStrictPitSimulation();
generateReport(simResults);
