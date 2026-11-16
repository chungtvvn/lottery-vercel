'use strict';

const fs = require('fs');
const deFusionService = require('../lib/services/deFusionService');
const { getParityForm, numStr } = deFusionService;

const rep = deFusionService.getDeFusionReport({ forceRefresh: false });
const ledger = (rep.settledLedger || []).slice().sort((a, b) => a.date.localeCompare(b.date));

console.log('Total 2026 ledger days:', ledger.length);

let total17Stake = 0, total17Payout = 0, total17Hits = 0, total17X2 = 0, total17X1 = 0;
let total15Stake = 0, total15Payout = 0, total15Hits = 0, total15X2 = 0, total15X1 = 0;
let cutHits = 0;
const cutHitDays = [];

const monthly = {};

ledger.forEach(r => {
    const s = r.strategies?.ai5Ensemble;
    if (!s) return;
    const actualStr = numStr(r.actualSpecial);
    const m = r.date.slice(0, 7);
    if (!monthly[m]) {
        monthly[m] = {
            days: 0,
            s17: { stake: 0, payout: 0, x2: 0, x1: 0 },
            s15: { stake: 0, payout: 0, x2: 0, x1: 0 },
            cutHits: 0,
            cutDates: []
        };
    }
    monthly[m].days++;

    const filteredTop = s.filteredTop || [];
    const filteredBot = s.filteredBot || [];
    const allFiltered = [...filteredTop, ...filteredBot];

    // Dàn 17s: 12 X2 + 5 X1
    const x2_12 = filteredTop.slice(0, 12);
    const x1_all = [...filteredTop.slice(12), ...filteredBot];
    const x1_5 = x1_all.slice(0, 5); // vị trí 13, 14, 15, 16, 17
    const x1_3 = x1_all.slice(0, 3); // vị trí 13, 14, 15
    const cut2 = x1_all.slice(3, 5); // vị trí 16, 17

    const hitX2 = x2_12.includes(actualStr);
    const hitX1_5 = !hitX2 && x1_5.includes(actualStr);
    const hitX1_3 = !hitX2 && x1_3.includes(actualStr);
    const hitCut2 = !hitX2 && cut2.includes(actualStr);

    const stake17 = (x2_12.length * 2) + (x1_5.length * 1);
    const payout17 = hitX2 ? 168 : (hitX1_5 ? 84 : 0);

    const stake15 = (x2_12.length * 2) + (x1_3.length * 1);
    const payout15 = hitX2 ? 168 : (hitX1_3 ? 84 : 0);

    total17Stake += stake17;
    total17Payout += payout17;
    if (hitX2) { total17Hits++; total17X2++; }
    else if (hitX1_5) { total17Hits++; total17X1++; }

    total15Stake += stake15;
    total15Payout += payout15;
    if (hitX2) { total15Hits++; total15X2++; }
    else if (hitX1_3) { total15Hits++; total15X1++; }

    if (hitCut2) {
        cutHits++;
        const rank = allFiltered.indexOf(actualStr) + 1;
        cutHitDays.push({ date: r.date, special: actualStr, rank, cutNums: cut2 });
        monthly[m].cutHits++;
        monthly[m].cutDates.push({ date: r.date, special: actualStr, rank });
    }

    monthly[m].s17.stake += stake17;
    monthly[m].s17.payout += payout17;
    if (hitX2) monthly[m].s17.x2++;
    if (hitX1_5) monthly[m].s17.x1++;

    monthly[m].s15.stake += stake15;
    monthly[m].s15.payout += payout15;
    if (hitX2) monthly[m].s15.x2++;
    if (hitX1_3) monthly[m].s15.x1++;
});

console.log('=== KẾT QUẢ NĂM 2026 (299 KỲ) ===');
console.log('Dàn 17s (12 X2 + 5 X1): Vốn = ' + total17Stake + 'M, Thưởng = ' + total17Payout + 'M, Lãi = ' + (total17Payout - total17Stake) + 'M (ROI ' + ((total17Payout - total17Stake)/total17Stake*100).toFixed(2) + '%), Trúng = ' + total17Hits + ' (X2: ' + total17X2 + ', X1: ' + total17X1 + ')');
console.log('Dàn 15s (12 X2 + 3 X1): Vốn = ' + total15Stake + 'M, Thưởng = ' + total15Payout + 'M, Lãi = ' + (total15Payout - total15Stake) + 'M (ROI ' + ((total15Payout - total15Stake)/total15Stake*100).toFixed(2) + '%), Trúng = ' + total15Hits + ' (X2: ' + total15X2 + ', X1: ' + total15X1 + ')');
console.log('Chênh lệch (15s vs 17s): Tiết kiệm vốn = ' + (total17Stake - total15Stake) + 'M, Thưởng hụt = ' + (total17Payout - total15Payout) + 'M, LÃI RÒNG CHÊNH LỆCH = ' + ((total15Payout - total15Stake) - (total17Payout - total17Stake)) + 'M');
console.log('2 con X1 bị cắt nổ: ' + cutHits + ' lần / 299 kỳ (' + (cutHits/299*100).toFixed(2) + '%).');

console.log('\n=== TỪNG THÁNG NĂM 2026 ===');
console.log('Tháng   | Số kỳ | Dàn 17s Lãi (M) | Dàn 15s Lãi (M) | Chênh lệch (M) | Số ngày cắt bị nổ | Chi tiết ngày nổ');
console.log('--------------------------------------------------------------------------------------------------------');
for (const [m, v] of Object.entries(monthly)) {
    const prof17 = v.s17.payout - v.s17.stake;
    const prof15 = v.s15.payout - v.s15.stake;
    const diff = prof15 - prof17;
    const cutStr = v.cutDates.map(d => d.date + ' (đb ' + d.special + ', rank #' + d.rank + ')').join(', ') || 'Không nổ';
    console.log(m + ' |   ' + v.days + '  |     ' + (prof17 >= 0 ? '+' : '') + prof17.toFixed(1).padStart(6) + 'M |     ' + (prof15 >= 0 ? '+' : '') + prof15.toFixed(1).padStart(6) + 'M |     ' + (diff >= 0 ? '+' : '') + diff.toFixed(1).padStart(6) + 'M |         ' + v.cutHits + '         | ' + cutStr);
}
