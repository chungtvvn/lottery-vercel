'use strict';

/**
 * scripts/backtest-parity-combined-tiering.js
 * 
 * Backtest thử nghiệm ý tưởng người dùng:
 * "Dựa vào dự đoán Chẵn Lẻ kết hợp với các phương pháp còn lại và chạy backtest toàn 2026 với dàn gộp
 * nếu số nào trùng với dàn dự đoán thì X2 còn lại khoảng >= 15 số X1 thì hiệu quả kết hợp với từng phương pháp sẽ như thế nào"
 */

const deFusionService = require('../lib/services/deFusionService');
const { getParityForm, numStr } = deFusionService;

function getPair25(form) {
    const hEven = form[0] === 'C';
    const tEven = form[1] === 'C';
    const heads = hEven ? [0, 2, 4, 6, 8] : [1, 3, 5, 7, 9];
    const tails = tEven ? [0, 2, 4, 6, 8] : [1, 3, 5, 7, 9];
    const res = [];
    heads.forEach(h => tails.forEach(t => res.push(h + '' + t)));
    return res;
}

async function run() {
    const rep = await deFusionService.getDeFusionReport({ forceRefresh: true });
    const ledger = rep.settledLedger || [];
    console.log('Tổng số kỳ đối soát 2026:', ledger.length);

    const methods = [
        { key: 'ai5Ensemble', name: 'Đồng Thuận 5 AI Đề 50s' },
        { key: 'mirofish', name: 'Trí Tuệ Bầy Đàn MiroFish 38s' },
        { key: 'shadow', name: 'Shadow Đề Đa Động Cơ 40s' },
        { key: 'fusion', name: 'Đề Tinh Hoa Hợp Nhất Fusion 36s' },
        { key: 'triCore', name: 'TriCore Đề 24s' },
        { key: 'daily', name: 'Cố Vấn Đề Hàng Ngày' }
    ];

    const MULT = 84;
    const X2_K = 2000;
    const X1_K = 1000;

    function evaluateStrategy(simName, getTiersFn) {
        console.log('\n========================================================================================');
        console.log('CHẾ ĐỘ: ' + simName);
        console.log('========================================================================================');

        const out = [];

        for (const m of methods) {
            let days = 0;
            let totalStakeK = 0;
            let totalPayoutK = 0;
            let totalWins = 0;
            let x2Wins = 0;
            let x1Wins = 0;
            let sumX2Count = 0;
            let sumX1Count = 0;

            for (const r of ledger) {
                const s = r.strategies && r.strategies[m.key];
                if (!s || (s.origCount === 0 && (!s.origNumbers || s.origNumbers.length === 0))) continue;
                const predForm = r.parityPrediction?.predForm;
                if (!predForm) continue;

                const tiers = getTiersFn(s, predForm, r.parityPrediction?.oppForm);
                if (!tiers || (tiers.x2.length === 0 && tiers.x1.length === 0)) continue;

                days++;
                sumX2Count += tiers.x2.length;
                sumX1Count += tiers.x1.length;

                const stake = tiers.x2.length * X2_K + tiers.x1.length * X1_K;
                totalStakeK += stake;

                const actStr = numStr(r.actualSpecial);
                let winPayout = 0;
                if (tiers.x2.includes(actStr)) {
                    winPayout += X2_K * MULT;
                    x2Wins++;
                    totalWins++;
                } else if (tiers.x1.includes(actStr)) {
                    winPayout += X1_K * MULT;
                    x1Wins++;
                    totalWins++;
                }
                totalPayoutK += winPayout;
            }

            const profitK = totalPayoutK - totalStakeK;
            const roi = totalStakeK > 0 ? ((profitK / totalStakeK) * 100).toFixed(1) : '0';
            const winRate = days > 0 ? ((totalWins / days) * 100).toFixed(1) : '0';
            const avgX2 = (sumX2Count / days).toFixed(1);
            const avgX1 = (sumX1Count / days).toFixed(1);
            const avgTotal = ((sumX2Count + sumX1Count) / days).toFixed(1);

            out.push({
                key: m.key,
                name: m.name,
                days,
                avgTotal,
                avgX2,
                avgX1,
                totalWins,
                winRate,
                x2Wins,
                x1Wins,
                stakeM: (totalStakeK / 1000).toFixed(0),
                payoutM: (totalPayoutK / 1000).toFixed(0),
                profitM: (profitK / 1000).toFixed(0),
                roi
            });

            console.log(
                m.name.padEnd(28) +
                ' | Kỳ: ' + String(days).padStart(3) +
                ' | Quy mô: ' + avgTotal.padStart(4) + 's (' + avgX2.padStart(4) + ' X2 + ' + avgX1.padStart(4) + ' X1)' +
                ' | Trúng: ' + String(totalWins).padStart(3) + ' (' + winRate.padStart(5) + '%)' +
                ' [X2: ' + String(x2Wins).padStart(2) + ', X1: ' + String(x1Wins).padStart(2) + ']' +
                ' | Vốn: ' + (totalStakeK / 1000).toFixed(0).padStart(5) + 'M' +
                ' | Lãi: ' + ((profitK >= 0 ? '+' : '') + (profitK / 1000).toFixed(0) + 'M').padStart(8) +
                ' | ROI: ' + (roi + '%').padStart(7)
            );
        }
        return out;
    }

    // 0. Hệ thống hiện tại (Baseline: Dàn sau lọc Anti-Parity + Tiers nội bộ của phương pháp)
    evaluateStrategy('0. HỆ THỐNG HIỆN TẠI (Tiers nội bộ cố định, Anti-Parity chỉ loại trừ oppForm)', (s) => ({
        x2: s.filteredTop || [],
        x1: s.filteredBot || []
    }));

    // 1. Kịch bản 1: Dàn Sau Lọc + Dynamic Parity Tiers
    // (Số trùng với predForm => X2; Các số còn lại trong Dàn Lọc => X1)
    evaluateStrategy('1. DÀN SAU LỌC + TIERS CHẴN LẺ (Trùng dạng đoán => X2, Còn lại trong Dàn Lọc => X1)', (s, predForm) => {
        const pool = s.filteredNumbers || [];
        const x2 = pool.filter(n => getParityForm(n) === predForm);
        const x1 = pool.filter(n => getParityForm(n) !== predForm);
        return { x2, x1 };
    });

    // 2. Kịch bản 2: Dàn Gốc (Không lọc oppForm) + Dynamic Parity Tiers
    // (Số trùng với predForm => X2; Toàn bộ số còn lại của Dàn Gốc => X1)
    evaluateStrategy('2. DÀN GỐC + TIERS CHẴN LẺ (Trùng dạng đoán => X2, Còn lại trong Dàn Gốc => X1)', (s, predForm) => {
        const pool = s.origNumbers || [];
        const x2 = pool.filter(n => getParityForm(n) === predForm);
        const x1 = pool.filter(n => getParityForm(n) !== predForm);
        return { x2, x1 };
    });

    // 3. Kịch bản 3: DÀN GỘP MỞ RỘNG (Dàn Sau Lọc ∪ 25 số Parity)
    // - Số giao nhau (nằm trong cả 2) => Đánh X2
    // - Số thuộc Dàn Sau Lọc nhưng không thuộc Parity (các số lót >= 15 số) => Đánh X1
    // - Số thuộc 25 số Parity nhưng chưa có trong Dàn Phương Pháp => Đánh X1
    evaluateStrategy('3. DÀN GỘP MỞ RỘNG (Dàn Lọc ∪ Parity 25s: Giao nhau => X2, Tất cả còn lại => X1)', (s, predForm) => {
        const parity25 = getPair25(predForm);
        const paritySet = new Set(parity25);
        const methodSet = new Set(s.filteredNumbers || []);

        const x2 = [];
        const x1 = [];
        methodSet.forEach(n => {
            if (paritySet.has(n)) x2.push(n);
            else x1.push(n);
        });
        parity25.forEach(n => {
            if (!methodSet.has(n)) x1.push(n);
        });
        return { x2, x1 };
    });

    // 4. Kịch bản 4: CHỈ ĐÁNH X2 KHI TRÙNG DẠNG CHẴN LẺ, X1 LẤY ĐÚNG TOP 15 SỐ CÒN LẠI
    // (Kiểm tra đúng giả thuyết "khoảng >= 15 số X1" nếu giới hạn tối đa 15-18 số)
    evaluateStrategy('4. TỐI ƯU CẮT GỌT: Trùng predForm => X2, Phần còn lại lấy đúng 15 số ưu tiên nhất => X1', (s, predForm) => {
        const topPool = s.origTop || [];
        const botPool = s.origBot || [];
        const allPool = [...topPool, ...botPool];

        // x2: tất cả số trùng predForm trong dàn lọc
        const x2 = (s.filteredNumbers || []).filter(n => getParityForm(n) === predForm);
        // x1: lấy các số không trùng predForm (và không thuộc oppForm) theo thứ tự ưu tiên gốc, lấy tối đa 15-16 số
        const x1Candidates = (s.filteredNumbers || []).filter(n => getParityForm(n) !== predForm);
        // Ưu tiên số nằm trong topPool trước
        const x1 = x1Candidates.slice(0, 16);
        return { x2, x1 };
    });
}

run().catch(err => {
    console.error('Lỗi thực thi:', err);
});
