'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🔬 STRICT POINT-IN-TIME (STRICT PIT) BACKTEST ENGINE:
 * CÁC PHƯƠNG PHÁP PHÒNG LAB TỐI ƯU HÓA LỢI NHUẬN (PROFIT-OPTIMIZED ENSEMBLES)
 * Toàn bộ 7.558 kỳ quay lịch sử (2005 - 2026)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

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

const BO_CATALOG = {
    '00': [0, 55, 5, 50], '11': [11, 66, 16, 61], '22': [22, 77, 27, 72],
    '33': [33, 88, 38, 83], '44': [44, 99, 49, 94], '01': [1, 10, 6, 60, 51, 15, 56, 65],
    '02': [2, 20, 7, 70, 52, 25, 57, 75], '03': [3, 30, 8, 80, 53, 35, 58, 85],
    '04': [4, 40, 9, 90, 54, 45, 59, 95], '12': [12, 21, 17, 71, 62, 26, 67, 76],
    '13': [13, 31, 18, 81, 63, 36, 68, 86], '14': [14, 41, 19, 91, 64, 46, 69, 96],
    '23': [23, 32, 28, 82, 73, 37, 78, 87], '24': [24, 42, 29, 92, 74, 47, 79, 97],
    '34': [34, 43, 39, 93, 84, 48, 89, 98]
};

const NUMBER_TO_BO = new Array(100);
Object.entries(BO_CATALOG).forEach(([boKey, numbers]) => {
    numbers.forEach(n => { NUMBER_TO_BO[n] = boKey; });
});

function wilsonLowerBound(hits, total, z = 1.645) {
    if (total === 0) return 0;
    const p = hits / total;
    const z2 = z * z;
    const denom = 1 + z2 / total;
    const center = p + z2 / (2 * total);
    const rad = Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    return Math.max(0, Math.round(((center - z * rad) / denom) * 1000) / 10);
}

function runLabProfitOptimization() {
    const draws = loadAllDraws();
    const N = draws.length;
    const specials = draws.map(d => Number(d.special));
    const dates = draws.map(d => d.date);

    console.log(`\n========================================================================================================`);
    console.log(`🔬 KHỞI CHẠY KIỂM ĐỊNH NGƯỢC STRICT PIT: CÁC PHƯƠNG PHÁP LAB TỐI ƯU HÓA LỢI NHUẬN (PROFIT-OPTIMIZED)`);
    console.log(`📊 Tổng kỳ quay lịch sử: ${N.toLocaleString('vi-VN')} kỳ (${draws[0].date} → ${draws[N - 1].date})`);
    console.log(`========================================================================================================\n`);

    // Danh sách 4 mô hình phòng Lab tối ưu hóa lợi nhuận
    const profitModels = [
        {
            id: 'Lab_GoldenDualMerge',
            name: '💎 1. Đề Gộp Lab Golden Overlap (Vốn 60K · X2 Giao Thoa + X1 Bọc Lót)',
            desc: 'Động cơ kép chia sẻ lõi Hazard Sweet-Spot + Khử Gan Nặng; tối ưu hóa vùng giao thoa k in [20, 26]',
            baseStake: 60000
        },
        {
            id: 'Lab_MetaLearner_VIP10',
            name: '👑 2. Lab Meta-Learner Tinh Hoa (Vốn 35K · VIP 10 X1.5 + Elite 20 X1)',
            desc: 'Cắt tỉa động (Dynamic Pruning) + Phân tầng vốn bất đối xứng tập trung vào 10 số hạt nhân VIP',
            baseStake: 35000
        },
        {
            id: 'Lab_TriStateAdaptive',
            name: '🛡️ 3. Bộ Điều Khiển Thích Ứng 3 Trạng Thái (Tấn Công 24s / Cân Bằng 36s / Phòng Thủ 50s)',
            desc: 'Chuyển đổi trạng thái theo nhịp thắng thua; tự động kích hoạt dàn 50s cắt dây khi trượt >= 2 ngày',
            baseStake: 36000
        },
        {
            id: 'Lab_AugmentedLiveDual',
            name: '🚀 4. Lai Ghép Thực Chiến Alpha + Lab Hazard/Gan Booster (Vốn 60K)',
            desc: 'Lấy dàn thực chiến mạnh nhất kết hợp bộ lọc khử triệt để số gan sâu >22 ngày và boost nhịp vàng',
            baseStake: 60000
        }
    ];

    // Khung thời gian đánh giá
    const periods = [
        { id: 'year2026', label: 'Năm 2026 (Out-of-sample hiện hành)', filter: (d, i) => d >= '2026-01-01' },
        { id: 'last5y', label: '5 năm gần nhất (2021-2026)', filter: (d, i) => d >= '2021-01-01' },
        { id: 'last90d', label: '90 kỳ gần nhất', filter: (d, i) => i >= N - 90 },
        { id: 'last30d', label: '30 kỳ gần nhất', filter: (d, i) => i >= N - 30 },
        { id: 'full20y', label: 'Toàn bộ 20 năm (2005-2026)', filter: (d, i) => i >= 60 }
    ];

    const tracker = {};
    profitModels.forEach(m => {
        tracker[m.id] = { model: m, periods: {} };
        periods.forEach(p => {
            tracker[m.id].periods[p.id] = {
                total: 0,
                hits: 0,
                winsX2: 0,
                winsX1: 0,
                totalStake: 0,
                totalPayout: 0,
                profit: 0,
                currentLoss: 0,
                maxDrawdown: 0
            };
        });
    });

    // Cập nhật trạng thái STRICT PIT
    const lastSeen = new Int32Array(100).fill(-1);
    const trans = Array.from({ length: 100 }, () => new Float32Array(100));
    const transCount = new Float32Array(100);
    const freq20y = new Int32Array(100);
    const r7 = new Int32Array(100);
    const r14 = new Int32Array(100);
    const r30 = new Int32Array(100);
    const r45 = new Int32Array(100);

    // Tải live cache cho Model 4
    let liveLedgerMap = new Map();
    try {
        const advPath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
        if (fs.existsSync(advPath)) {
            const adv = JSON.parse(fs.readFileSync(advPath, 'utf8'));
            const adLedger = adv.adaptiveDualMerge?.settledLedger || adv.dualMerge?.settledLedger || [];
            adLedger.forEach(row => {
                if (row.date && row.fullUnion) liveLedgerMap.set(row.date, row);
                else if (row.date && row.union) liveLedgerMap.set(row.date, row);
            });
        }
    } catch (e) {}

    let lossStreakTriState = 0;
    const minWarmup = 60;
    const t0 = Date.now();

    for (let i = 0; i < N; i++) {
        const actual = specials[i];
        const date = dates[i];

        if (i >= minWarmup) {
            const lastSp = specials[i - 1];
            const lastH = Math.floor(lastSp / 10), lastT = lastSp % 10;
            const lastBo = NUMBER_TO_BO[lastSp];
            const denomTrans = (transCount[lastSp] || 0) + 10;

            // 27 giải Lô hôm qua
            const prevLotto = new Set();
            for (const [k, v] of Object.entries(draws[i - 1])) {
                if (k.startsWith('prize') && v !== undefined && v !== null) prevLotto.add(Number(v));
            }

            // Tính Attention weights 30 kỳ
            const attnLookback = Math.min(i, 30);
            const attnWeights = new Float32Array(100);
            for (let k = 0; k < attnLookback; k++) {
                attnWeights[specials[i - 1 - k]] += Math.exp((k - attnLookback) / 7.5);
            }

            // Tín hiệu khoa học cơ sở
            const sHazard = new Float32Array(100);
            const sMarkov = new Float32Array(100);
            const sForm = new Float32Array(100);
            const sLotto = new Float32Array(100);
            const sAttn = new Float32Array(100);
            const sFourier = new Float32Array(100);

            for (let n = 0; n < 100; n++) {
                const curGap = i - 1 - lastSeen[n];
                const h = Math.floor(n / 10), t = n % 10;
                const bo = NUMBER_TO_BO[n];

                // 1. Hazard nhịp vàng H2 & H3 kết hợp Khử Gan Tuyệt Đối
                let hScore = 1.0;
                if (curGap >= 3 && curGap <= 5) hScore = 2.4;       // H2: Nhịp nổ vàng
                else if (curGap >= 6 && curGap <= 9) hScore = 1.8;   // H3: Nhịp chuẩn
                else if (curGap <= 2) hScore = 1.1;                 // Rơi bệt
                else if (curGap >= 10 && curGap <= 18) hScore = 0.9;// Đang tích lũy
                else if (curGap > 22) hScore = -5.0;                // Khử gan nặng triệt để
                sHazard[n] = hScore * 12.0 + (r14[n] / 14) * 4.0;

                // 2. Bước nhảy Markov
                const condP = (trans[lastSp][n] + 0.08) / denomTrans;
                sMarkov[n] = condP * 40.0;

                // 3. Cộng hưởng Chạm / Tổng / Bộ
                const isCh = (h === lastH || h === lastT || t === lastH || t === lastT) ? 1.5 : 0;
                const isBo = (bo === lastBo) ? 2.2 : 0;
                sForm[n] = isCh * 4.0 + isBo * 4.5;

                // 4. Lô Kéo Đề (Cross-over Pull)
                sLotto[n] = prevLotto.has(n) ? 8.5 : 0;

                // 5. Attention & Fourier
                sAttn[n] = attnWeights[n] * 12.0 + (r7[n] / 7) * 4.0;
                const priorP = (freq20y[n] + 1) / (i + 100);
                const sampleP = (r45[n] + 1) / (45 + 100);
                sFourier[n] = (0.65 * priorP + 0.35 * sampleP) * 300.0;
            }

            // ─────────────────────────────────────────────────────────────────
            // 1. LAB GOLDEN DUAL MERGE (Vốn 60K · X2 Giao Thoa + X1 Bọc Lót)
            // ─────────────────────────────────────────────────────────────────
            // Động cơ A: Hazard Sweet-Spot + Markov Lift + Recency
            const sEngA = new Float32Array(100);
            // Động cơ B: Hazard Sweet-Spot + Form Resonance + Lotto Pull
            const sEngB = new Float32Array(100);

            for (let n = 0; n < 100; n++) {
                const curGap = i - 1 - lastSeen[n];
                const ganPenalty = curGap > 22 ? -100 : 0;
                sEngA[n] = sHazard[n] * 0.50 + sMarkov[n] * 0.35 + sAttn[n] * 0.15 + ganPenalty;
                sEngB[n] = sHazard[n] * 0.45 + sForm[n] * 0.30 + sLotto[n] * 0.25 + ganPenalty;
            }

            const rankA = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => sEngA[b] - sEngA[a]).slice(0, 30);
            const rankB = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => sEngB[b] - sEngB[a]).slice(0, 30);

            const setA = new Set(rankA);
            const setB = new Set(rankB);
            const interGolden = rankA.filter(n => setB.has(n));
            const kOverlap = interGolden.length;
            const setInter = new Set(interGolden);

            const inA = setA.has(actual);
            const inB = setB.has(actual);
            const isGoldenX2 = inA && inB;
            const isGoldenHit = inA || inB;

            const m1Stake = 60000;
            let m1Payout = 0;
            if (isGoldenX2) m1Payout = 168000;      // +108K
            else if (isGoldenHit) m1Payout = 84000; // +24K

            // ─────────────────────────────────────────────────────────────────
            // 2. LAB META-LEARNER TINH HOA (Vốn 35K · VIP 10 X1.5 + Elite 20 X1)
            // ─────────────────────────────────────────────────────────────────
            const sMeta = new Float32Array(100);
            for (let n = 0; n < 100; n++) {
                const curGap = i - 1 - lastSeen[n];
                const ganPenalty = curGap > 22 ? -100 : 0;
                sMeta[n] = (
                    sHazard[n] * 0.35 +
                    sMarkov[n] * 0.25 +
                    sForm[n] * 0.20 +
                    sLotto[n] * 0.12 +
                    sAttn[n] * 0.08 +
                    ganPenalty
                );
            }
            const rankMeta = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => sMeta[b] - sMeta[a]);
            const vip10 = new Set(rankMeta.slice(0, 10));
            const elite20 = new Set(rankMeta.slice(10, 30));

            const isVipHit = vip10.has(actual);
            const isEliteHit = elite20.has(actual);
            const isMetaHit = isVipHit || isEliteHit;

            const m2Stake = 35000; // 10 * 1.5K + 20 * 1.0K = 35K
            let m2Payout = 0;
            if (isVipHit) m2Payout = 1.5 * 84000;       // 126K (+91K, ROI +260%)
            else if (isEliteHit) m2Payout = 1.0 * 84000;// 84K (+49K, ROI +140%)

            // ─────────────────────────────────────────────────────────────────
            // 3. BỘ ĐIỀU KHIỂN THÍCH ỨNG 3 TRẠNG THÁI (Lab_TriStateAdaptive)
            // ─────────────────────────────────────────────────────────────────
            let triSize = 36;
            let triUnitStake = 1000;
            if (lossStreakTriState === 0) {
                // Vừa thắng: Tấn công dàn hẹp 24 số cược 1.5K = 36K
                triSize = 24;
                triUnitStake = 1500;
            } else if (lossStreakTriState === 1) {
                // Trượt 1 ngày: Cân bằng dàn 36 số cược 1.0K = 36K
                triSize = 36;
                triUnitStake = 1000;
            } else {
                // Trượt >= 2 ngày: Phòng thủ cắt dây dàn 50 số cược 1.0K = 50K
                triSize = 50;
                triUnitStake = 1000;
            }

            const setTri = new Set(rankMeta.slice(0, triSize));
            const isTriHit = setTri.has(actual);
            const m3Stake = triSize * triUnitStake;
            const m3Payout = isTriHit ? (triUnitStake / 1000) * 84000 : 0;

            if (isTriHit) lossStreakTriState = 0;
            else lossStreakTriState++;

            // ─────────────────────────────────────────────────────────────────
            // 4. LAI GHÉP THỰC CHIẾN ALPHA + LAB HAZARD BOOSTER (Lab_AugmentedLiveDual)
            // ─────────────────────────────────────────────────────────────────
            let m4Hit = false;
            let m4Payout = 0;
            const m4Stake = 60000;
            const liveRow = liveLedgerMap.get(date);

            if (liveRow) {
                const liveList = liveRow.fullUnion || liveRow.union || [];
                const liveInter = new Set(liveRow.intersectionX2 || liveRow.intersection || []);
                const filteredLive = new Set();
                liveList.forEach(n => {
                    const g = i - 1 - lastSeen[n];
                    if (g <= 22) filteredLive.add(n); // Lọc bỏ số gan > 22
                });
                // Bù thêm số Sweet-Spot nếu dàn bị hẹp
                for (let k = 0; k < 100 && filteredLive.size < 36; k++) {
                    const cand = rankMeta[k];
                    const g = i - 1 - lastSeen[cand];
                    if (g >= 3 && g <= 8) filteredLive.add(cand);
                }

                m4Hit = filteredLive.has(actual);
                if (m4Hit) {
                    if (liveInter.has(actual)) m4Payout = 168000;
                    else m4Payout = 84000;
                }
            } else {
                m4Hit = isGoldenHit;
                m4Payout = m1Payout;
            }

            // ─────────────────────────────────────────────────────────────────
            // GHI NHẬN KẾT QUẢ VÀO BỘ THEO DÕI
            // ─────────────────────────────────────────────────────────────────
            const evaluations = [
                { id: 'Lab_GoldenDualMerge', isHit: isGoldenHit, stake: m1Stake, payout: m1Payout, isX2: isGoldenX2, isX1: isGoldenHit && !isGoldenX2 },
                { id: 'Lab_MetaLearner_VIP10', isHit: isMetaHit, stake: m2Stake, payout: m2Payout, isX2: isVipHit, isX1: isEliteHit },
                { id: 'Lab_TriStateAdaptive', isHit: isTriHit, stake: m3Stake, payout: m3Payout, isX2: false, isX1: isTriHit },
                { id: 'Lab_AugmentedLiveDual', isHit: m4Hit, stake: m4Stake, payout: m4Payout, isX2: m4Payout >= 168000, isX1: m4Payout === 84000 }
            ];

            evaluations.forEach(ev => {
                periods.forEach(p => {
                    if (p.filter(date, i)) {
                        const st = tracker[ev.id].periods[p.id];
                        st.total++;
                        st.totalStake += ev.stake;
                        st.totalPayout += ev.payout;
                        st.profit += (ev.payout - ev.stake);
                        if (ev.isHit) {
                            st.hits++;
                            st.currentLoss = 0;
                            if (ev.isX2) st.winsX2++;
                            if (ev.isX1) st.winsX1++;
                        } else {
                            st.currentLoss++;
                            if (st.currentLoss > st.maxDrawdown) st.maxDrawdown = st.currentLoss;
                        }
                    }
                });
            });
        }

        // Cập nhật trạng thái Strict PIT
        lastSeen[actual] = i;
        freq20y[actual]++;
        r7[actual]++; if (i >= 7) r7[specials[i - 7]]--;
        r14[actual]++; if (i >= 14) r14[specials[i - 14]]--;
        r30[actual]++; if (i >= 30) r30[specials[i - 30]]--;
        r45[actual]++; if (i >= 45) r45[specials[i - 45]]--;
        if (i > 0) {
            trans[specials[i - 1]][actual]++;
            transCount[specials[i - 1]]++;
        }
    }

    const duration = Date.now() - t0;
    console.log(`⚡ Hoàn tất kiểm định ngược ${N} kỳ quay trong ${duration} ms!\n`);

    return { tracker, profitModels, periods };
}

function printReport({ tracker, profitModels, periods }) {
    console.log(`========================================================================================================================`);
    console.log(`🏆 BẢNG HIỆU SUẤT CÁC PHƯƠNG PHÁP LAB NÂNG CẤP TỐI ƯU LỢI NHUẬN (NĂM 2026 - OUT-OF-SAMPLE)`);
    console.log(`========================================================================================================================`);
    console.log(
        'Phương Pháp Nâng Cấp'.padEnd(52) +
        'Số Kỳ'.padEnd(8) +
        'Số Trúng'.padEnd(10) +
        'Tỷ Lệ %'.padEnd(10) +
        'Tổng Vốn (K)'.padEnd(16) +
        'Lợi Nhuận (K)'.padEnd(18) +
        'ROI %'.padEnd(10) +
        'Max DD'.padEnd(10) +
        'Wilson 90%'
    );
    console.log('-'.repeat(144));

    profitModels.forEach(m => {
        const p2026 = tracker[m.id].periods.year2026;
        const hitRate = ((p2026.hits / p2026.total) * 100).toFixed(1);
        const roi = (((p2026.profit) / p2026.totalStake) * 100).toFixed(1);
        const profitStr = (p2026.profit >= 0 ? '+' : '') + p2026.profit.toLocaleString('vi-VN') + 'K';
        const stakeStr = p2026.totalStake.toLocaleString('vi-VN') + 'K';
        const wilson = wilsonLowerBound(p2026.hits, p2026.total);

        console.log(
            m.name.padEnd(52) +
            `${p2026.total}`.padEnd(8) +
            `${p2026.hits}`.padEnd(10) +
            `${hitRate}%`.padEnd(10) +
            stakeStr.padEnd(16) +
            profitStr.padEnd(18) +
            `${roi >= 0 ? '+' : ''}${roi}%`.padEnd(10) +
            `${p2026.maxDrawdown}d`.padEnd(10) +
            `${wilson}%`
        );
    });

    console.log(`\n========================================================================================================================`);
    console.log(`🛡️  ĐÁNH GIÁ CỔNG THĂNG HẠNG (PROMOTION GATE) CHO CÁC PHƯƠNG PHÁP LAB NÂNG CẤP`);
    console.log(`========================================================================================================================`);

    profitModels.forEach(m => {
        const p2026 = tracker[m.id].periods.year2026;
        const hitRate = (p2026.hits / p2026.total) * 100;
        const roi = (p2026.profit / p2026.totalStake) * 100;
        const wilson = wilsonLowerBound(p2026.hits, p2026.total);
        const maxDD = p2026.maxDrawdown;

        const c1 = hitRate >= 40.0;
        const c2 = p2026.profit > 0;
        const c3 = maxDD <= 6;
        const c4 = wilson >= 35.0;
        const passedCount = [c1, c2, c3, c4].filter(Boolean).length;

        let status = '';
        if (passedCount === 4) status = '🟢 ĐỦ ĐIỀU KIỆN THĂNG HẠNG VÀO THỰC CHIẾN';
        else if (passedCount >= 2) status = '🟡 THEO DÕI TRONG LAB (TIỆM CẬN ĐẠT)';
        else status = '🔴 CHƯA ĐẠT TIÊU CHUẨN';

        console.log(`\n🔹 [${m.name}]: ${status} (${passedCount}/4 tiêu chuẩn)`);
        console.log(`   • Tiêu chí 1 (Hit Rate >= 40.0%): ${c1 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${hitRate.toFixed(1)}%)`);
        console.log(`   • Tiêu chí 2 (Lợi nhuận ròng DƯƠNG): ${c2 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${p2026.profit >= 0 ? '+' : ''}${(p2026.profit / 1000).toFixed(0)}M, ROI: ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%)`);
        console.log(`   • Tiêu chí 3 (Khống chế Max Drawdown <= 6 ngày): ${c3 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${maxDD} ngày trượt liên tiếp)`);
        console.log(`   • Tiêu chí 4 (Cận dưới Wilson 90% >= 35.0%): ${c4 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${wilson}%)`);
    });
}

const simResults = runLabProfitOptimization();
printReport(simResults);
