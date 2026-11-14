'use strict';

const fs = require('fs');
const deFusionService = require('../lib/services/deFusionService');
const { numStr } = deFusionService;

const adv = JSON.parse(fs.readFileSync('lib/data/statistics/cached_daily_method_advisor.json', 'utf8'));
const ledger = (deFusionService.getDeFusionReport({ forceRefresh: false }).settledLedger || []).slice().sort((a, b) => a.date.localeCompare(b.date));

// Đọc kết quả Lô từ advisor
const loLedger = adv.settledLedger || [];
const loMap = {};
loLedger.forEach(r => {
    loMap[r.date] = r;
});

console.log(`=== KHẢO SÁT KẾT HỢP ĐỀ TINH GỌN (12 X2 + 5 X1) VÀ LÔ TOP 7 (NĂM 2026) ===\n`);

let totalStakeDe = 0, totalPayoutDe = 0, winsDe = 0;
let totalStakeLo = 0, totalPayoutLo = 0, winsLo = 0;
let totalStakeCombo = 0, totalPayoutCombo = 0;

const monthlyCombo = {};

ledger.forEach(r => {
    const s = r.strategies?.ai5Ensemble;
    if (!s) return;
    const actualStr = numStr(r.actualSpecial);
    const filteredTop = s.filteredTop || [];
    const filteredBot = s.filteredBot || [];

    // Đề: 12s X2 + 5s X1
    const x2 = filteredTop.slice(0, 12);
    const x1 = [...filteredTop.slice(12), ...filteredBot].slice(0, 5);
    const hitX2 = x2.includes(actualStr);
    const hitX1 = !hitX2 && x1.includes(actualStr);
    const hitDe = hitX2 || hitX1;
    const stakeDe = (x2.length * 2) + (x1.length * 1); // 29M
    const payoutDe = hitX2 ? 168 : (hitX1 ? 84 : 0);

    totalStakeDe += stakeDe;
    totalPayoutDe += payoutDe;
    if (hitDe) winsDe++;

    // Lô: Lấy từ advisor
    const loRow = loMap[r.date];
    let stakeLo = 0;
    let payoutLo = 0;
    let hitLo = false;
    if (loRow && loRow.lotoTop7) {
        stakeLo = loRow.lotoTop7.stakeK / 1000; // chuyển sang M
        payoutLo = loRow.lotoTop7.payoutK / 1000;
        hitLo = loRow.lotoTop7.isHit;
        totalStakeLo += stakeLo;
        totalPayoutLo += payoutLo;
        if (hitLo) winsLo++;
    }

    const stakeCombo = stakeDe + stakeLo;
    const payoutCombo = payoutDe + payoutLo;
    totalStakeCombo += stakeCombo;
    totalPayoutCombo += payoutCombo;

    const m = r.date.slice(0, 7);
    if (!monthlyCombo[m]) {
        monthlyCombo[m] = { days: 0, stakeDe: 0, payoutDe: 0, stakeLo: 0, payoutLo: 0, stakeCombo: 0, payoutCombo: 0 };
    }
    const mc = monthlyCombo[m];
    mc.days++;
    mc.stakeDe += stakeDe;
    mc.payoutDe += payoutDe;
    mc.stakeLo += stakeLo;
    mc.payoutLo += payoutLo;
    mc.stakeCombo += stakeCombo;
    mc.payoutCombo += payoutCombo;
});

const profDe = totalPayoutDe - totalStakeDe;
const roiDe = (profDe / totalStakeDe) * 100;
const profLo = totalPayoutLo - totalStakeLo;
const roiLo = totalStakeLo > 0 ? (profLo / totalStakeLo) * 100 : 0;
const profCombo = totalPayoutCombo - totalStakeCombo;
const roiCombo = (profCombo / totalStakeCombo) * 100;

console.log(`ĐỀ TINH GỌN (12 X2 + 5 X1): Vốn: ${totalStakeDe}M | Ăn: ${totalPayoutDe}M | LÃI: +${profDe}M | ROI: +${roiDe.toFixed(2)}% | Trúng: ${winsDe}/299 (${(winsDe/299*100).toFixed(1)}%)`);
if (totalStakeLo > 0) {
    console.log(`LÔ TOP 7 (Advisor):        Vốn: ${totalStakeLo.toFixed(1)}M | Ăn: ${totalPayoutLo.toFixed(1)}M | LÃI: +${profLo.toFixed(1)}M | ROI: +${roiLo.toFixed(2)}% | Trúng: ${winsLo}/299 (${(winsLo/299*100).toFixed(1)}%)`);
    console.log(`COMBO TỔNG HỢP (ĐỀ + LÔ): Vốn: ${totalStakeCombo.toFixed(1)}M | Ăn: ${totalPayoutCombo.toFixed(1)}M | LÃI: +${profCombo.toFixed(1)}M | ROI: +${roiCombo.toFixed(2)}%`);
}

console.log('\n--- BẢNG HIỆU QUẢ THEO THÁNG COMBO ĐỀ + LÔ ---');
Object.keys(monthlyCombo).sort().forEach(m => {
    const mc = monthlyCombo[m];
    const pDe = mc.payoutDe - mc.stakeDe;
    const pLo = mc.payoutLo - mc.stakeLo;
    const pC = mc.payoutCombo - mc.stakeCombo;
    console.log(`Tháng ${m} (${mc.days} kỳ): Đề: ${(pDe>=0?'+':'')+pDe}M | Lô: ${(pLo>=0?'+':'')+pLo.toFixed(1)}M | COMBO: ${(pC>=0?'+':'')+pC.toFixed(1)}M (ROI: ${(pC/mc.stakeCombo*100).toFixed(1)}%)`);
});
