'use strict';

/**
 * Script nghiên cứu và Backtest Strict Point-In-Time (Strict PIT)
 * CÁC PHƯƠNG PHÁP KẾT HỢP ĐỘT PHÁ TỪ CÁC ĐỘNG CƠ ĐƠN LẺ TRONG PHÒNG LAB
 * (Dữ liệu toàn bộ 7.558 kỳ quay 2005 - 2026)
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

function runCombinedSimulation() {
    const draws = loadAllDraws();
    const N = draws.length;
    const start2026 = draws.findIndex(d => d.date >= '2026-01-01');
    const specials = draws.map(d => Number(d.special));
    const dates = draws.map(d => d.date);

    console.log(`\n========================================================================================`);
    console.log(`🔬 KHỞI CHẠY BACKTEST STRICT PIT: CÁC PHƯƠNG PHÁP KẾT HỢP ĐỘT PHÁ TỪ PHÒNG LAB`);
    console.log(`📊 Tổng kỳ quay lịch sử: ${N.toLocaleString('vi-VN')} kỳ (${draws[0].date} → ${draws[N - 1].date})`);
    console.log(`========================================================================================\n`);

    // Danh sách 5 phương pháp kết hợp đột phá
    const comboMethods = [
        {
            id: 'Comb1_LabTripleConsensus',
            name: '🏛️ 1. Tam Trụ Hợp Lực Lab (Hazard + Apriori + Form/Lotto)',
            desc: 'Dung hợp 3 trụ cột độc lập; phân tầng cược X3 (đồng thuận 3), X2 (đồng thuận 2), X1 (bọc lót)',
            baseStake: 60, // Phân bổ vốn chuẩn hóa 60K/ngày
            payout: 84
        },
        {
            id: 'Comb2_LabAdaptiveDualMerge',
            name: '💎 2. Gộp Đôi Thích Ứng Lab (Hazard SweetSpot x Apriori Graph)',
            desc: 'Gộp 2 động cơ trực giao; vùng giao thoa Sweet-Spot cược X2, vùng bọc lót cược X1',
            baseStake: 56,
            payout: 84
        },
        {
            id: 'Comb3_DynamicStakedMultiTier',
            name: '⚡ 3. Phân Tầng Vốn Bất Đối Xứng (Core 15s X2 + Mid 15s X1 + Safe 15s X0.5)',
            desc: 'Tập trung 50% vốn vào 15 số hạt nhân đồng thuận cao; 50% vốn bọc lót 30 số kế tiếp',
            baseStake: 52.5, // 15*2 + 15*1 + 15*0.5 = 52.5K
            payout: 84
        },
        {
            id: 'Comb4_TriStateAdaptiveController',
            name: '🛡️ 4. Điều Khiển Thích Ứng 3 Trạng Thái (Tấn Công 24s / Cân Bằng 36s / Phòng Thủ 48s)',
            desc: 'Tự động đổi chế độ: Vừa thắng -> Dàn 24s; Trượt 1 ngày -> Dàn 36s; Trượt >= 2 ngày -> Dàn 48s cắt dây',
            baseStake: 36, // Trung bình ~36K
            payout: 84
        },
        {
            id: 'Comb5_AugmentedLiveHybrid',
            name: '👑 5. Lai Ghép Khoa Học Thực Chiến (Live Adaptive Dual + Lab Hazard/Apriori Booster)',
            desc: 'Lấy dàn thực chiến mạnh nhất kết hợp lọc bỏ số gan sâu >25 ngày và boost số Sweet-spot',
            baseStake: 60,
            payout: 84
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
    comboMethods.forEach(m => {
        tracker[m.id] = {
            method: m,
            periods: {}
        };
        periods.forEach(p => {
            tracker[m.id].periods[p.id] = {
                total: 0,
                hits: 0,
                totalStake: 0,
                totalPayout: 0,
                profit: 0,
                currentLoss: 0,
                maxDrawdown: 0,
                winsX3: 0,
                winsX2: 0,
                winsX1: 0
            };
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // KHỞI TẠO BỘ ĐẾM STRICT PIT
    // ─────────────────────────────────────────────────────────────────────────
    const lastSeen = new Int32Array(100).fill(-1);
    const gapHist = Array.from({ length: 100 }, () => []);
    const trans = Array.from({ length: 100 }, () => new Float32Array(100));
    const transCount = new Float32Array(100);
    const freq20y = new Int32Array(100);
    const r7 = new Int32Array(100);
    const r14 = new Int32Array(100);
    const r30 = new Int32Array(100);

    // Tải sẵn cache thực chiến cho Comb5
    let liveLedgerMap = new Map();
    try {
        const advPath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
        if (fs.existsSync(advPath)) {
            const adv = JSON.parse(fs.readFileSync(advPath, 'utf8'));
            const adLedger = adv.adaptiveDualMerge?.settledLedger || adv.dualMerge?.settledLedger || [];
            adLedger.forEach(row => {
                if (row.date && row.union) {
                    liveLedgerMap.set(row.date, row);
                }
            });
        }
    } catch (e) {}

    let consecutiveLossComb4 = 0;
    const minWarmup = 60;
    const t0 = Date.now();

    for (let i = 0; i < N; i++) {
        const actual = specials[i];
        const date = dates[i];

        if (i >= minWarmup) {
            const prevSp = specials[i - 1];
            const prevH = Math.floor(prevSp / 10), prevT = prevSp % 10;
            const denomTrans = (transCount[prevSp] || 0) + 10;

            // 27 giải Lô hôm qua
            const prevLotto = new Set();
            for (const [k, v] of Object.entries(draws[i - 1])) {
                if (k.startsWith('prize') && v !== undefined && v !== null) prevLotto.add(Number(v));
            }

            // Động cơ 1: Hazard Sweet-Spot
            const sHazard = new Float32Array(100);
            for (let n = 0; n < 100; n++) {
                const curGap = i - 1 - lastSeen[n];
                let h = 0.5;
                if (curGap >= 3 && curGap <= 8) h = 1.45;
                else if (curGap >= 9 && curGap <= 15) h = 1.15;
                else if (curGap <= 2) h = 0.95;
                else if (curGap > 25) h = 0.15;
                sHazard[n] = h * 10.0 + (r14[n] / 14) * 4.0;
            }
            const rankHazard = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => sHazard[b] - sHazard[a]);

            // Động cơ 2: Apriori Lift & Markov
            const sApriori = new Float32Array(100);
            for (let n = 0; n < 100; n++) {
                const markovP = (trans[prevSp][n] + 0.1) / denomTrans;
                sApriori[n] = markovP * 25.0 + (r7[n] / 7) * 5.0;
            }
            const rankApriori = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => sApriori[b] - sApriori[a]);

            // Động cơ 3: Form Resonance & Lotto Pull
            const sFormLotto = new Float32Array(100);
            for (let n = 0; n < 100; n++) {
                const h = Math.floor(n / 10), t = n % 10;
                const form = (h === prevH || h === prevT ? 0.4 : 0) + (t === prevH || t === prevT ? 0.4 : 0);
                const lotto = prevLotto.has(n) ? 0.7 : 0;
                sFormLotto[n] = form * 12.0 + lotto * 8.0 + (r30[n] / 30) * 4.0;
            }
            const rankFormLotto = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => sFormLotto[b] - sFormLotto[a]);

            // ─────────────────────────────────────────────────────────────────
            // 1. KẾT HỢP 1: TAM TRỤ HỢP LỰC LAB (Comb1_LabTripleConsensus)
            // ─────────────────────────────────────────────────────────────────
            const set1_30 = new Set(rankHazard.slice(0, 30));
            const set2_30 = new Set(rankApriori.slice(0, 30));
            const set3_30 = new Set(rankFormLotto.slice(0, 30));

            let c1Hits = 0;
            if (set1_30.has(actual)) c1Hits++;
            if (set2_30.has(actual)) c1Hits++;
            if (set3_30.has(actual)) c1Hits++;

            // Phân bổ vốn chuẩn hóa: Tổng cược 60K/ngày
            // X3 (cả 3 chọn): cược 2.5K/số; X2 (2 chọn): cược 1.5K/số; X1 (1 chọn): cược 0.5K/số
            // Hoặc tính theo cơ cấu chuẩn của Triple Merge
            const comb1StakeK = 60000;
            let comb1PayoutK = 0;
            if (c1Hits === 3) comb1PayoutK = 168000;      // Nổ đồng thuận 3: +108K
            else if (c1Hits === 2) comb1PayoutK = 105000; // Nổ đồng thuận 2: +45K
            else if (c1Hits === 1) comb1PayoutK = 42000;  // Nổ bọc lót: -18K
            else comb1PayoutK = 0;                       // Trượt cả: -60K

            // ─────────────────────────────────────────────────────────────────
            // 2. KẾT HỢP 2: GỘP ĐÔI THÍCH ỨNG LAB (Comb2_LabAdaptiveDualMerge)
            // ─────────────────────────────────────────────────────────────────
            const setA_28 = new Set(rankHazard.slice(0, 28));
            const setB_28 = new Set(rankApriori.slice(0, 28));
            const isHitA = setA_28.has(actual);
            const isHitB = setB_28.has(actual);

            const comb2StakeK = 56000;
            let comb2PayoutK = 0;
            if (isHitA && isHitB) comb2PayoutK = 168000; // X2: +112K
            else if (isHitA || isHitB) comb2PayoutK = 84000; // X1: +28K
            else comb2PayoutK = 0;

            // ─────────────────────────────────────────────────────────────────
            // 3. KẾT HỢP 3: PHÂN TẦNG VỐN BẤT ĐỐI XỨNG (Comb3_DynamicStakedMultiTier)
            // ─────────────────────────────────────────────────────────────────
            // Tính điểm đồng thuận gộp
            const sComb = new Float32Array(100);
            for (let n = 0; n < 100; n++) {
                sComb[n] = sHazard[n] * 0.35 + sApriori[n] * 0.35 + sFormLotto[n] * 0.30;
            }
            const rankComb = Array.from({ length: 100 }, (_, n) => n).sort((a, b) => sComb[b] - sComb[a]);

            const tierVIP_15 = new Set(rankComb.slice(0, 15));   // Cược 2.0K/số (30K)
            const tierMid_15 = new Set(rankComb.slice(15, 30));  // Cược 1.0K/số (15K)
            const tierSafe_15 = new Set(rankComb.slice(30, 45)); // Cược 0.5K/số (7.5K)
            const comb3StakeK = 52500; // 52.5K
            let comb3PayoutK = 0;

            if (tierVIP_15.has(actual)) comb3PayoutK = 2.0 * 84000;  // 168K (+115.5K)
            else if (tierMid_15.has(actual)) comb3PayoutK = 1.0 * 84000; // 84K (+31.5K)
            else if (tierSafe_15.has(actual)) comb3PayoutK = 0.5 * 84000; // 42K (-10.5K)
            else comb3PayoutK = 0;

            // ─────────────────────────────────────────────────────────────────
            // 4. KẾT HỢP 4: BỘ ĐIỀU KHIỂN THÍCH ỨNG 3 TRẠNG THÁI (Comb4_TriStateAdaptiveController)
            // ─────────────────────────────────────────────────────────────────
            let comb4Size = 36;
            if (consecutiveLossComb4 === 0) comb4Size = 24;      // Siêu tấn công sau thắng
            else if (consecutiveLossComb4 === 1) comb4Size = 36; // Cân bằng sau 1 lần trượt
            else comb4Size = 48;                                // Phòng thủ cắt dây sau >= 2 lần trượt

            const setComb4 = new Set(rankComb.slice(0, comb4Size));
            const hitComb4 = setComb4.has(actual);
            const comb4StakeK = comb4Size * 1000;
            const comb4PayoutK = hitComb4 ? 84000 : 0;

            if (hitComb4) consecutiveLossComb4 = 0;
            else consecutiveLossComb4++;

            // ─────────────────────────────────────────────────────────────────
            // 5. KẾT HỢP 5: LAI GHÉP KHOA HỌC THỰC CHIẾN (Comb5_AugmentedLiveHybrid)
            // ─────────────────────────────────────────────────────────────────
            let comb5Hit = false;
            let comb5PayoutK = 0;
            const comb5StakeK = 60000;

            const liveRow = liveLedgerMap.get(date);
            if (liveRow && Array.isArray(liveRow.union)) {
                // Bộ lọc khoa học: Loại bỏ các số trong liveRow có gap > 28 kỳ (gan sâu)
                // và bù thêm các số Sweet-Spot có điểm Hazard cao nhất
                const refinedSet = new Set();
                liveRow.union.forEach(num => {
                    const g = i - 1 - lastSeen[num];
                    if (g <= 28) refinedSet.add(num);
                });
                // Bù các số Hazard Sweet-Spot hàng đầu nếu dàn bị giảm
                for (let k = 0; k < 100 && refinedSet.size < 34; k++) {
                    const cand = rankHazard[k];
                    const g = i - 1 - lastSeen[cand];
                    if (g >= 3 && g <= 8) refinedSet.add(cand);
                }

                comb5Hit = refinedSet.has(actual);
                const isInter = Array.isArray(liveRow.intersection) && liveRow.intersection.includes(actual);
                if (comb5Hit) {
                    if (isInter) comb5PayoutK = 168000; // X2
                    else comb5PayoutK = 84000;          // X1
                }
            } else {
                // Fallback nếu không có live cache
                comb5Hit = setA_28.has(actual) || setB_28.has(actual);
                if (setA_28.has(actual) && setB_28.has(actual)) comb5PayoutK = 168000;
                else if (comb5Hit) comb5PayoutK = 84000;
            }

            // ─────────────────────────────────────────────────────────────────
            // GHI NHẬN KẾT QUẢ VÀO BỘ THEO DÕI
            // ─────────────────────────────────────────────────────────────────
            const evaluations = [
                { id: 'Comb1_LabTripleConsensus', isHit: c1Hits > 0, stake: comb1StakeK, payout: comb1PayoutK, x3: c1Hits === 3, x2: c1Hits === 2, x1: c1Hits === 1 },
                { id: 'Comb2_LabAdaptiveDualMerge', isHit: isHitA || isHitB, stake: comb2StakeK, payout: comb2PayoutK, x2: isHitA && isHitB, x1: (isHitA || isHitB) && !(isHitA && isHitB) },
                { id: 'Comb3_DynamicStakedMultiTier', isHit: tierVIP_15.has(actual) || tierMid_15.has(actual) || tierSafe_15.has(actual), stake: comb3StakeK, payout: comb3PayoutK, x2: tierVIP_15.has(actual), x1: tierMid_15.has(actual) },
                { id: 'Comb4_TriStateAdaptiveController', isHit: hitComb4, stake: comb4StakeK, payout: comb4PayoutK },
                { id: 'Comb5_AugmentedLiveHybrid', isHit: comb5Hit, stake: comb5StakeK, payout: comb5PayoutK, x2: comb5PayoutK >= 168000, x1: comb5PayoutK === 84000 }
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
                            if (ev.x3) st.winsX3++;
                            if (ev.x2) st.winsX2++;
                            if (ev.x1) st.winsX1++;
                        } else {
                            st.currentLoss++;
                            if (st.currentLoss > st.maxDrawdown) st.maxDrawdown = st.currentLoss;
                        }
                    }
                });
            });
        }

        // Cập nhật trạng thái STRICT PIT
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

        if (i > 0) {
            const prev = specials[i - 1];
            trans[prev][actual]++;
            transCount[prev]++;
        }
    }

    const duration = Date.now() - t0;
    console.log(`⚡ Hoàn tất mô phỏng kết hợp ${N} kỳ quay trong ${duration} ms!\n`);

    return { tracker, comboMethods, periods };
}

function printCombinedReport({ tracker, comboMethods, periods }) {
    console.log(`========================================================================================================================`);
    console.log(`🏆 BẢNG HIỆU SUẤT CÁC PHƯƠNG PHÁP KẾT HỢP ĐỘT PHÁ (NĂM 2026 - OUT-OF-SAMPLE)`);
    console.log(`========================================================================================================================`);
    console.log(
        'Phương Pháp Kết Hợp'.padEnd(46) +
        'Số Kỳ'.padEnd(10) +
        'Số Trúng'.padEnd(12) +
        'Tỷ Lệ %'.padEnd(12) +
        'Tổng Vốn (K)'.padEnd(16) +
        'Lợi Nhuận (K)'.padEnd(16) +
        'ROI %'.padEnd(10) +
        'Max DD'.padEnd(10) +
        'Wilson 90%'
    );
    console.log('-'.repeat(136));

    comboMethods.forEach(m => {
        const p2026 = tracker[m.id].periods.year2026;
        const hitRate = ((p2026.hits / p2026.total) * 100).toFixed(1);
        const roi = (((p2026.profit) / p2026.totalStake) * 100).toFixed(1);
        const profitStr = (p2026.profit >= 0 ? '+' : '') + p2026.profit.toLocaleString('vi-VN') + 'K';
        const stakeStr = p2026.totalStake.toLocaleString('vi-VN') + 'K';
        const wilson = wilsonLowerBound(p2026.hits, p2026.total);

        console.log(
            m.name.padEnd(46) +
            `${p2026.total}`.padEnd(10) +
            `${p2026.hits}`.padEnd(12) +
            `${hitRate}%`.padEnd(12) +
            stakeStr.padEnd(16) +
            profitStr.padEnd(16) +
            `${roi >= 0 ? '+' : ''}${roi}%`.padEnd(10) +
            `${p2026.maxDrawdown}d`.padEnd(10) +
            `${wilson}%`
        );
    });

    console.log(`\n========================================================================================================================`);
    console.log(`🏛️  SO SÁNH TRỰC DIỆN GIỮA PHƯƠNG PHÁP ĐƠN LẺ vs PHƯƠNG PHÁP KẾT HỢP vs DÀN LIVE THỰC CHIẾN`);
    console.log(`========================================================================================================================`);
    console.log(
        'Hệ Thống / Chiến Lược'.padEnd(46) +
        'Cơ Chế Hoạt Động'.padEnd(30) +
        'Tỷ Lệ Trúng %'.padEnd(16) +
        'Lợi Nhuận 2026'.padEnd(18) +
        'ROI %'.padEnd(12) +
        'Max Drawdown'
    );
    console.log('-'.repeat(136));

    const getStat = (id) => {
        const p = tracker[id]?.periods?.year2026;
        if (!p) return { rate: '0%', profit: '0K', roi: '0%', maxDD: '0d' };
        const rate = ((p.hits / p.total) * 100).toFixed(1) + '%';
        const profit = (p.profit >= 0 ? '+' : '') + p.profit.toLocaleString('vi-VN') + 'K';
        const roi = (p.totalStake > 0 ? ((p.profit / p.totalStake) * 100).toFixed(1) : '0') + '%';
        return { rate, profit, roi: (p.profit >= 0 ? '+' : '') + roi, maxDD: p.maxDrawdown + ' ngày' };
    };

    const cComb1 = getStat('Comb1_LabTripleConsensus');
    const cComb3 = getStat('Comb3_DynamicStakedMultiTier');
    const cComb5 = getStat('Comb5_AugmentedLiveHybrid');

    const comparisons = [
        { group: '1. ĐƠN LẺ THUẦN TÚY (Lab)', name: 'M1. Hazard Sweet-Spot 30s', mech: '1 Dàn 30s tự sinh', rate: '26.0%', profit: '-2.112.000K', roi: '-27.3%', maxDD: '14 ngày' },
        { group: '1. ĐƠN LẺ THUẦN TÚY (Lab)', name: 'M2. Apriori Louvain Graph 30s', mech: '1 Dàn 30s tự sinh', rate: '33.3%', profit: '-516.000K', roi: '-6.7%', maxDD: '8 ngày' },
        { group: '2. KẾT HỢP LAB MỚI', name: 'Comb1. Tam Trụ Hợp Lực Lab', mech: 'Hợp 3 Trụ + Phân tầng vốn', rate: cComb1.rate, profit: cComb1.profit, roi: cComb1.roi, maxDD: cComb1.maxDD },
        { group: '2. KẾT HỢP LAB MỚI', name: 'Comb3. Phân Tầng Vốn Bất Đối Xứng', mech: '15s VIP X2 + 30s Bọc lót', rate: cComb3.rate, profit: cComb3.profit, roi: cComb3.roi, maxDD: cComb3.maxDD },
        { group: '2. KẾT HỢP LAB MỚI', name: 'Comb5. Lai Ghép Khoa Học Thực Chiến', mech: 'Live + Lọc Gan & Boost Sweet', rate: cComb5.rate, profit: cComb5.profit, roi: cComb5.roi, maxDD: cComb5.maxDD },
        { group: '3. DÀN THỰC CHIẾN HIỆN HÀNH', name: 'Live 1. Đề Thích Ứng Alpha', mech: 'Dual Merge Tri-State', rate: '55.8%', profit: '+2.664.000K', roi: '+17.2%', maxDD: '6 ngày' },
        { group: '3. DÀN THỰC CHIẾN HIỆN HÀNH', name: 'Live 2. Đề Tam Trụ Thực Chiến', mech: 'Triple Merge 3 mức cược', rate: '68.2%', profit: '+3.408.000K', roi: '+14.7%', maxDD: '5 ngày' }
    ];

    comparisons.forEach(c => {
        console.log(
            c.name.padEnd(46) +
            c.mech.padEnd(30) +
            c.rate.padEnd(16) +
            c.profit.padEnd(18) +
            c.roi.padEnd(12) +
            c.maxDD
        );
    });

    console.log(`\n========================================================================================================================`);
    console.log(`🛡️  ĐÁNH GIÁ CỔNG THĂNG HẠNG (PROMOTION GATE) CHO CÁC PHƯƠNG PHÁP KẾT HỢP`);
    console.log(`========================================================================================================================`);

    comboMethods.forEach(m => {
        const p2026 = tracker[m.id].periods.year2026;
        const hitRate = (p2026.hits / p2026.total) * 100;
        const roi = (p2026.profit / p2026.totalStake) * 100;
        const wilson = wilsonLowerBound(p2026.hits, p2026.total);
        const maxDD = p2026.maxDrawdown;

        const c1 = hitRate >= 40.0;
        const c2 = p2026.profit > 0 && roi >= 10.0;
        const c3 = maxDD <= 6;
        const c4 = wilson >= 35.0;
        const passedCount = [c1, c2, c3, c4].filter(Boolean).length;

        let status = '';
        if (passedCount === 4) status = '🟢 ĐỦ ĐIỀU KIỆN THĂNG HẠNG VÀO THỰC CHIẾN';
        else if (passedCount >= 2) status = '🟡 THEO DÕI TRONG LAB (TIỆM CẬN ĐẠT)';
        else status = '🔴 CHƯA ĐẠT TIÊU CHUẨN';

        console.log(`\n🔹 [${m.name}]: ${status} (${passedCount}/4 tiêu chuẩn)`);
        console.log(`   • Tiêu chí 1 (Hit Rate >= 40.0%): ${c1 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${hitRate.toFixed(1)}%)`);
        console.log(`   • Tiêu chí 2 (Lợi nhuận dương & ROI >= 10%): ${c2 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%, +${(p2026.profit/1000).toFixed(0)}M)`);
        console.log(`   • Tiêu chí 3 (Khống chế Max Drawdown <= 6 ngày): ${c3 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${maxDD} ngày trượt liên tiếp)`);
        console.log(`   • Tiêu chí 4 (Cận dưới Wilson 90% >= 35.0%): ${c4 ? '✓ ĐẠT' : '✗ CHƯA ĐẠT'} (Thực tế: ${wilson}%)`);
    });
}

const simCombined = runCombinedSimulation();
printCombinedReport(simCombined);
