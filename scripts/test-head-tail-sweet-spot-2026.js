'use strict';

const deFusionService = require('../lib/services/deFusionService');
const { getParityForm, numStr } = deFusionService;

const rep = deFusionService.getDeFusionReport({ forceRefresh: false });
const ledger = rep.settledLedger || [];

const MULT = 84;
const X2_K = 2000;
const X1_K = 1000;

console.log('Tổng số kỳ 2026:', ledger.length);

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
        const predForm = r.parityPrediction?.predForm;
        const oppForm = r.parityPrediction?.oppForm;
        if (!predForm) continue;

        const res = getDanFn(r, predForm, oppForm);
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
        name.padEnd(45) +
        ' | Quy mô: ' + avgTot.padStart(4) + 's (' + avgX2.padStart(4) + ' X2 + ' + avgX1.padStart(4) + ' X1)' +
        ' | Trúng: ' + String(totalWins).padStart(3) + ' (' + winRate.padStart(5) + '%)' +
        ' [X2: ' + String(x2Wins).padStart(2) + ', X1: ' + String(x1Wins).padStart(2) + ']' +
        ' | Vốn: ' + (totalStakeK / 1000).toFixed(0).padStart(5) + 'M' +
        ' | Lãi: ' + ((profitK >= 0 ? '+' : '') + (profitK / 1000).toFixed(0) + 'M').padStart(8) +
        ' | ROI: ' + (roi + '%').padStart(7)
    );

    return { name, days, avgTot, avgX2, avgX1, totalWins, winRate, x2Wins, x1Wins, stakeM: (totalStakeK/1000).toFixed(0), profitM: (profitK/1000).toFixed(0), roi };
}

console.log('\n=== TEST TRICORE 24S TRONG 2026 ===');

// TriCore Gốc
evaluateCustom('TriCore Gốc (12 X2 + 12 X1)', (r) => {
    const s = r.strategies?.triCore;
    if (!s) return null;
    return { x2: s.origTop || [], x1: s.origBot || [] };
});

// TriCore Sau Lọc Anti-Parity (Tiers nội bộ)
evaluateCustom('TriCore Sau Lọc (Tiers nội bộ)', (r) => {
    const s = r.strategies?.triCore;
    if (!s) return null;
    return { x2: s.filteredTop || [], x1: s.filteredBot || [] };
});

// TriCore Phương án B: Cùng Đầu X2 + Cùng Đít X1
evaluateCustom('TriCore PA B (Cùng Đầu X2, Cùng Đít X1)', (r, predForm) => {
    const s = r.strategies?.triCore;
    if (!s) return null;
    const pool = s.filteredNumbers || [];
    const predHead = predForm[0];
    const x2 = pool.filter(n => getParityForm(n)[0] === predHead);
    const x1 = pool.filter(n => getParityForm(n)[0] !== predHead);
    return { x2, x1 };
});

// TriCore Phương án D: Cắt Cùng Đít, chỉ đánh Cùng Đầu (Trùng cả 2 X2, Cùng Đầu riêng X1)
evaluateCustom('TriCore PA D (Cắt Đít, Chỉ Đầu: LL X2, LC X1)', (r, predForm) => {
    const s = r.strategies?.triCore;
    if (!s) return null;
    const pool = s.filteredNumbers || [];
    const x2 = pool.filter(n => getParityForm(n) === predForm);
    const predHead = predForm[0];
    const x1 = pool.filter(n => getParityForm(n) !== predForm && getParityForm(n)[0] === predHead);
    return { x2, x1 };
});

// TriCore PA D2: Cắt Cùng Đít, Toàn bộ Cùng Đầu đánh X2
evaluateCustom('TriCore PA D2 (Cắt Đít, Toàn bộ Cùng Đầu X2)', (r, predForm) => {
    const s = r.strategies?.triCore;
    if (!s) return null;
    const pool = s.filteredNumbers || [];
    const predHead = predForm[0];
    const x2 = pool.filter(n => getParityForm(n)[0] === predHead);
    return { x2, x1: [] };
});

console.log('\n=== TEST ĐỀ TINH GỌN SWEET-SPOT 17S TRONG 2026 ===');

function getSweetSpot17(r, predForm, oppForm) {
    const orig = r.strategies?.ai5Ensemble?.origNumbers || [];
    if (!orig.length) return null;

    const predHead = predForm[0];
    const predTail = predForm[1];
    const sameHeadForm = predHead + (predTail === 'C' ? 'L' : 'C');
    const sameTailForm = (predHead === 'C' ? 'L' : 'C') + predTail;

    const listLL = orig.filter(n => getParityForm(n) === predForm);
    const listHead = orig.filter(n => getParityForm(n) === sameHeadForm);
    const listTail = orig.filter(n => getParityForm(n) === sameTailForm);

    const x2_12 = [...listLL.slice(0, 4), ...listHead.slice(0, 4), ...listTail.slice(0, 4)];
    const x2Set = new Set(x2_12);

    const nonOpp = orig.filter(n => getParityForm(n) !== oppForm && !x2Set.has(n));
    const x1_5 = nonOpp.slice(0, 5);

    return { x2_12, x1_5, nonOpp, predHead, predTail, sameHeadForm, sameTailForm };
}

// Sweet-Spot 17s Gốc
evaluateCustom('Sweet-Spot 17s Gốc (12 X2 + 5 X1)', (r, predForm, oppForm) => {
    const sp = getSweetSpot17(r, predForm, oppForm);
    if (!sp) return null;
    return { x2: sp.x2_12, x1: sp.x1_5 };
});

// Sweet-Spot 15s Gốc (Cắt 2 con X1 cuối)
evaluateCustom('Sweet-Spot 15s Gốc (12 X2 + 3 X1)', (r, predForm, oppForm) => {
    const sp = getSweetSpot17(r, predForm, oppForm);
    if (!sp) return null;
    return { x2: sp.x2_12, x1: sp.x1_5.slice(0, 3) };
});

// Sweet-Spot 17s PA B: Tối ưu Cùng Đầu trong 17 số
// Các số Cùng Đầu (thuộc predForm hoặc sameHeadForm) cược X2
// Các số Cùng Đít (thuộc sameTailForm) cược X1
evaluateCustom('Sweet-Spot 17s PA B (Cùng Đầu X2, Cùng Đít X1)', (r, predForm, oppForm) => {
    const sp = getSweetSpot17(r, predForm, oppForm);
    if (!sp) return null;
    const pool17 = [...sp.x2_12, ...sp.x1_5];
    const x2 = pool17.filter(n => getParityForm(n)[0] === sp.predHead);
    const x1 = pool17.filter(n => getParityForm(n)[0] !== sp.predHead);
    return { x2, x1 };
});

// Sweet-Spot 15s PA B: Tối ưu Cùng Đầu trong 15 số
evaluateCustom('Sweet-Spot 15s PA B (Cùng Đầu X2, Cùng Đít X1)', (r, predForm, oppForm) => {
    const sp = getSweetSpot17(r, predForm, oppForm);
    if (!sp) return null;
    const pool15 = [...sp.x2_12, ...sp.x1_5.slice(0, 3)];
    const x2 = pool15.filter(n => getParityForm(n)[0] === sp.predHead);
    const x1 = pool15.filter(n => getParityForm(n)[0] !== sp.predHead);
    return { x2, x1 };
});

// Sweet-Spot 17s PA D: Siêu rút gọn - CẮT BỎ TOÀN BỘ CÙNG ĐÍT trong 17 số!
// Chỉ giữ lại các số Cùng Đầu: LL đánh X2, LC đánh X1
evaluateCustom('Sweet-Spot 17s PA D (Cắt Đít: LL X2, LC X1)', (r, predForm, oppForm) => {
    const sp = getSweetSpot17(r, predForm, oppForm);
    if (!sp) return null;
    const pool17 = [...sp.x2_12, ...sp.x1_5];
    const x2 = pool17.filter(n => getParityForm(n) === predForm);
    const x1 = pool17.filter(n => getParityForm(n) === sp.sameHeadForm);
    return { x2, x1 };
});

// Sweet-Spot 17s PA D2: Cắt Đít, Toàn bộ Cùng Đầu cược X2
evaluateCustom('Sweet-Spot 17s PA D2 (Cắt Đít: Tất cả Cùng Đầu X2)', (r, predForm, oppForm) => {
    const sp = getSweetSpot17(r, predForm, oppForm);
    if (!sp) return null;
    const pool17 = [...sp.x2_12, ...sp.x1_5];
    const x2 = pool17.filter(n => getParityForm(n)[0] === sp.predHead);
    return { x2, x1: [] };
});

// Sweet-Spot PA D3: Lấy 6 số LL + 6 số LC = 12 số (Loại bỏ hoàn toàn CL và CC)
evaluateCustom('Sweet-Spot PA D3 (Chỉ Cùng Đầu: 6 LL X2 + 6 LC X1)', (r, predForm, oppForm) => {
    const orig = r.strategies?.ai5Ensemble?.origNumbers || [];
    if (!orig.length) return null;
    const predHead = predForm[0];
    const predTail = predForm[1];
    const sameHeadForm = predHead + (predTail === 'C' ? 'L' : 'C');
    const listLL = orig.filter(n => getParityForm(n) === predForm);
    const listHead = orig.filter(n => getParityForm(n) === sameHeadForm);
    const x2 = listLL.slice(0, 6);
    const x1 = listHead.slice(0, 6);
    return { x2, x1 };
});
