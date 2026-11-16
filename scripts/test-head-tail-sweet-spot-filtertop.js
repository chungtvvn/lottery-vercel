'use strict';

const deFusionService = require('../lib/services/deFusionService');
const { getParityForm, numStr } = deFusionService;

const rep = deFusionService.getDeFusionReport({ forceRefresh: false });
const ledger = (rep.settledLedger || []).slice().sort((a, b) => a.date.localeCompare(b.date));

const MULT = 84;
const X2_K = 2000;
const X1_K = 1000;

function evaluateCustom(name, getDanFn) {
    let days = 0;
    let totalStakeK = 0;
    let totalPayoutK = 0;
    let totalWins = 0;
    let x2Wins = 0;
    let x1Wins = 0;
    let sumX2 = 0;
    let sumX1 = 0;

    for (const r of ledger) {
        const s = r.strategies?.ai5Ensemble;
        if (!s) continue;
        const predForm = r.parityPrediction?.predForm;
        const oppForm = r.parityPrediction?.oppForm;
        if (!predForm) continue;

        const filteredTop = s.filteredTop || [];
        const filteredBot = s.filteredBot || [];
        const allFiltered = [...filteredTop, ...filteredBot];

        const res = getDanFn({ filteredTop, filteredBot, allFiltered, s, r, predForm, oppForm });
        if (!res) continue;
        const { x2, x1 } = res;
        if (x2.length === 0 && x1.length === 0) continue;

        days++;
        sumX2 += x2.length;
        sumX1 += x1.length;
        const stake = x2.length * X2_K + x1.length * X1_K;
        totalStakeK += stake;

        const act = numStr(r.actualSpecial);
        if (x2.includes(act)) {
            totalPayoutK += X2_K * MULT;
            x2Wins++;
            totalWins++;
        } else if (x1.includes(act)) {
            totalPayoutK += X1_K * MULT;
            x1Wins++;
            totalWins++;
        }
    }

    const profitK = totalPayoutK - totalStakeK;
    const roi = totalStakeK > 0 ? ((profitK / totalStakeK) * 100).toFixed(1) : '0';
    const winRate = days > 0 ? ((totalWins / days) * 100).toFixed(1) : '0';
    const avgX2 = (sumX2 / days).toFixed(1);
    const avgX1 = (sumX1 / days).toFixed(1);
    const avgTot = ((sumX2 + sumX1) / days).toFixed(1);

    console.log(
        name.padEnd(52) +
        ' | Quy mô: ' + avgTot.padStart(4) + 's (' + avgX2.padStart(4) + ' X2 + ' + avgX1.padStart(4) + ' X1)' +
        ' | Trúng: ' + String(totalWins).padStart(3) + ' (' + winRate.padStart(5) + '%)' +
        ' [X2: ' + String(x2Wins).padStart(2) + ', X1: ' + String(x1Wins).padStart(2) + ']' +
        ' | Vốn: ' + (totalStakeK / 1000).toFixed(0).padStart(5) + 'M' +
        ' | Lãi: ' + ((profitK >= 0 ? '+' : '') + (profitK / 1000).toFixed(0) + 'M').padStart(8) +
        ' | ROI: ' + (roi + '%').padStart(7)
    );

    return { name, days, avgTot, avgX2, avgX1, totalWins, winRate, x2Wins, x1Wins, stakeM: (totalStakeK/1000).toFixed(0), profitM: (profitK/1000).toFixed(0), roi };
}

console.log('=== KẾT HỢP DỰ ĐOÁN CHẴN LẺ ĐẦU/ĐÍT TRÊN DÀN SWEET-SPOT 17S & 15S (2026) ===\n');

// 1. Dàn 17s Gốc
evaluateCustom('1. Dàn 17s Gốc (12 X2 cố định + 5 X1 cố định)', ({ filteredTop, filteredBot }) => {
    const x2 = filteredTop.slice(0, 12);
    const x1_all = [...filteredTop.slice(12), ...filteredBot];
    const x1 = x1_all.slice(0, 5);
    return { x2, x1 };
});

// 2. Dàn 15s Gốc
evaluateCustom('2. Dàn 15s Gốc (12 X2 cố định + 3 X1 cố định)', ({ filteredTop, filteredBot }) => {
    const x2 = filteredTop.slice(0, 12);
    const x1_all = [...filteredTop.slice(12), ...filteredBot];
    const x1 = x1_all.slice(0, 3);
    return { x2, x1 };
});

// 3. Dàn 17s - Phương án B (Tối ưu Cùng Đầu trong 17 số)
// Lấy 17 số ban đầu, chia lại tầng theo Đầu dự đoán: Cùng Đầu => X2, Cùng Đít => X1
evaluateCustom('3. Dàn 17s - PA B (17s chia lại: Cùng Đầu X2, Cùng Đít X1)', ({ filteredTop, filteredBot, predForm }) => {
    const x2_base = filteredTop.slice(0, 12);
    const x1_all = [...filteredTop.slice(12), ...filteredBot];
    const pool17 = [...x2_base, ...x1_all.slice(0, 5)];
    const predHead = predForm[0];
    const x2 = pool17.filter(n => getParityForm(n)[0] === predHead);
    const x1 = pool17.filter(n => getParityForm(n)[0] !== predHead);
    return { x2, x1 };
});

// 4. Dàn 15s - Phương án B (Tối ưu Cùng Đầu trong 15 số)
evaluateCustom('4. Dàn 15s - PA B (15s chia lại: Cùng Đầu X2, Cùng Đít X1)', ({ filteredTop, filteredBot, predForm }) => {
    const x2_base = filteredTop.slice(0, 12);
    const x1_all = [...filteredTop.slice(12), ...filteredBot];
    const pool15 = [...x2_base, ...x1_all.slice(0, 3)];
    const predHead = predForm[0];
    const x2 = pool15.filter(n => getParityForm(n)[0] === predHead);
    const x1 = pool15.filter(n => getParityForm(n)[0] !== predHead);
    return { x2, x1 };
});

// 5. Dàn 17s - Phương án D (Siêu rút gọn: Cắt hẳn Cùng Đít, Chỉ giữ Cùng Đầu)
// Trong 17 số: chỉ giữ các con Cùng Đầu (Trùng cả 2 cược X2, Cùng Đầu lệch Đít cược X1)
evaluateCustom('5. Dàn 17s - PA D (Cắt Cùng Đít: LL X2, LC X1)', ({ filteredTop, filteredBot, predForm }) => {
    const x2_base = filteredTop.slice(0, 12);
    const x1_all = [...filteredTop.slice(12), ...filteredBot];
    const pool17 = [...x2_base, ...x1_all.slice(0, 5)];
    const x2 = pool17.filter(n => getParityForm(n) === predForm);
    const predHead = predForm[0];
    const x1 = pool17.filter(n => getParityForm(n) !== predForm && getParityForm(n)[0] === predHead);
    return { x2, x1 };
});

// 6. Dàn 17s - PA D2 (Cắt Cùng Đít: Toàn bộ Cùng Đầu cược X2)
evaluateCustom('6. Dàn 17s - PA D2 (Cắt Cùng Đít: Toàn bộ Cùng Đầu cược X2)', ({ filteredTop, filteredBot, predForm }) => {
    const x2_base = filteredTop.slice(0, 12);
    const x1_all = [...filteredTop.slice(12), ...filteredBot];
    const pool17 = [...x2_base, ...x1_all.slice(0, 5)];
    const predHead = predForm[0];
    const x2 = pool17.filter(n => getParityForm(n)[0] === predHead);
    return { x2, x1: [] };
});

// 7. Dàn 15s - PA D (Cắt Cùng Đít từ 15 số: LL X2, LC X1)
evaluateCustom('7. Dàn 15s - PA D (Cắt Cùng Đít: LL X2, LC X1)', ({ filteredTop, filteredBot, predForm }) => {
    const x2_base = filteredTop.slice(0, 12);
    const x1_all = [...filteredTop.slice(12), ...filteredBot];
    const pool15 = [...x2_base, ...x1_all.slice(0, 3)];
    const x2 = pool15.filter(n => getParityForm(n) === predForm);
    const predHead = predForm[0];
    const x1 = pool15.filter(n => getParityForm(n) !== predForm && getParityForm(n)[0] === predHead);
    return { x2, x1 };
});

// 8. Dàn 15s - PA D2 (Cắt Cùng Đít từ 15 số: Toàn bộ Cùng Đầu cược X2)
evaluateCustom('8. Dàn 15s - PA D2 (Cắt Cùng Đít: Toàn bộ Cùng Đầu cược X2)', ({ filteredTop, filteredBot, predForm }) => {
    const x2_base = filteredTop.slice(0, 12);
    const x1_all = [...filteredTop.slice(12), ...filteredBot];
    const pool15 = [...x2_base, ...x1_all.slice(0, 3)];
    const predHead = predForm[0];
    const x2 = pool15.filter(n => getParityForm(n)[0] === predHead);
    return { x2, x1: [] };
});

console.log('\n=== SO SÁNH VỚI TRICORE 24S (2026) ===\n');

evaluateCustom('TriCore Gốc (12 X2 + 12 X1)', (r) => {
    const s = r.s?.strategies?.triCore;
    // We can get s from r.r
    const tri = r.r.strategies?.triCore;
    if (!tri) return null;
    return { x2: tri.origTop || [], x1: tri.origBot || [] };
});

evaluateCustom('TriCore Sau Lọc (Tiers nội bộ)', (r) => {
    const tri = r.r.strategies?.triCore;
    if (!tri) return null;
    return { x2: tri.filteredTop || [], x1: tri.filteredBot || [] };
});

evaluateCustom('TriCore PA B (Cùng Đầu X2, Cùng Đít X1)', (r) => {
    const tri = r.r.strategies?.triCore;
    if (!tri) return null;
    const pool = tri.filteredNumbers || [];
    const predHead = r.predForm[0];
    const x2 = pool.filter(n => getParityForm(n)[0] === predHead);
    const x1 = pool.filter(n => getParityForm(n)[0] !== predHead);
    return { x2, x1 };
});

evaluateCustom('TriCore PA D (Cắt Đít, Chỉ Đầu: LL X2, LC X1)', (r) => {
    const tri = r.r.strategies?.triCore;
    if (!tri) return null;
    const pool = tri.filteredNumbers || [];
    const x2 = pool.filter(n => getParityForm(n) === r.predForm);
    const predHead = r.predForm[0];
    const x1 = pool.filter(n => getParityForm(n) !== r.predForm && getParityForm(n)[0] === predHead);
    return { x2, x1 };
});

evaluateCustom('TriCore PA D2 (Cắt Đít, Toàn bộ Cùng Đầu X2)', (r) => {
    const tri = r.r.strategies?.triCore;
    if (!tri) return null;
    const pool = tri.filteredNumbers || [];
    const predHead = r.predForm[0];
    const x2 = pool.filter(n => getParityForm(n)[0] === predHead);
    return { x2, x1: [] };
});
