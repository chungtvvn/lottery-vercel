'use strict';

const fs = require('fs');
const deFusionService = require('../lib/services/deFusionService');
const { numStr } = deFusionService;

const adv = JSON.parse(fs.readFileSync('lib/data/statistics/cached_daily_method_advisor.json', 'utf8'));
const ledger = (deFusionService.getDeFusionReport({ forceRefresh: false }).settledLedger || []).slice().sort((a, b) => a.date.localeCompare(b.date));

const loList = adv.loDropoff27?.all2026Ledger || [];
const loMap = {};
loList.forEach(r => {
    loMap[r.date] = r;
});

const monthly = {};

ledger.forEach(r => {
    const s = r.strategies?.ai5Ensemble;
    if (!s) return;
    const actualStr = numStr(r.actualSpecial);
    const filteredTop = s.filteredTop || [];
    const filteredBot = s.filteredBot || [];

    // Combo 1: 12 X2 + 5 X1 (17s)
    const x2_1 = filteredTop.slice(0, 12);
    const x1_1 = [...filteredTop.slice(12), ...filteredBot].slice(0, 5);
    const hitX2_1 = x2_1.includes(actualStr);
    const hitX1_1 = !hitX2_1 && x1_1.includes(actualStr);
    const stakeDe1 = (x2_1.length * 2) + (x1_1.length * 1);
    const payoutDe1 = hitX2_1 ? 168 : (hitX1_1 ? 84 : 0);

    // Combo 2: 17 X2 (17s)
    const x2_2 = filteredTop.slice(0, 17);
    const hitX2_2 = x2_2.includes(actualStr);
    const stakeDe2 = x2_2.length * 2;
    const payoutDe2 = hitX2_2 ? 168 : 0;

    // Lô Top 7
    const loRow = loMap[r.date];
    const stakeLo = (loRow?.stakeK || 0) / 1000;
    const payoutLo = (loRow?.payoutK || 0) / 1000;

    const m = r.date.slice(0, 7);
    if (!monthly[m]) {
        monthly[m] = {
            days: 0,
            de1Stake: 0, de1Payout: 0,
            de2Stake: 0, de2Payout: 0,
            loStake: 0, loPayout: 0
        };
    }
    const row = monthly[m];
    row.days++;
    row.de1Stake += stakeDe1;
    row.de1Payout += payoutDe1;
    row.de2Stake += stakeDe2;
    row.de2Payout += payoutDe2;
    row.loStake += stakeLo;
    row.loPayout += payoutLo;
});

console.log('=== BẢNG ĐỐI SOÁT CHI TIẾT 10 THÁNG CỦA COMBO ĐỀ + LÔ NĂM 2026 ===');
console.log('----------------------------------------------------------------------------------------------------------------------');
console.log('Tháng   | Kỳ | Đề 17s (12+5) | Lô Top 7    | COMBO 1 (Đề 12+5 & Lô) | COMBO 2 (Đề 17 X2 & Lô)');
console.log('----------------------------------------------------------------------------------------------------------------------');

let totDe1P = 0, totDe2P = 0, totLoP = 0, totC1P = 0, totC2P = 0;
let totC1Stake = 0, totC2Stake = 0;

Object.keys(monthly).sort().forEach(m => {
    const row = monthly[m];
    const pDe1 = row.de1Payout - row.de1Stake;
    const pDe2 = row.de2Payout - row.de2Stake;
    const pLo = row.loPayout - row.loStake;
    const pC1 = pDe1 + pLo;
    const pC2 = pDe2 + pLo;
    const sC1 = row.de1Stake + row.loStake;
    const sC2 = row.de2Stake + row.loStake;

    totDe1P += pDe1;
    totDe2P += pDe2;
    totLoP += pLo;
    totC1P += pC1;
    totC2P += pC2;
    totC1Stake += sC1;
    totC2Stake += sC2;

    const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(1) + 'M';
    console.log(`${m} | ${row.days.toString().padStart(2)} | ${fmt(pDe1).padStart(13)} | ${fmt(pLo).padStart(11)} | ${fmt(pC1).padStart(22)} (ROI: ${(pC1/sC1*100).toFixed(1)}%) | ${fmt(pC2).padStart(22)} (ROI: ${(pC2/sC2*100).toFixed(1)}%)`);
});

console.log('----------------------------------------------------------------------------------------------------------------------');
console.log(`TỔNG CẢ NĂM  | Đề 1: +${totDe1P.toFixed(1)}M | Lô: +${totLoP.toFixed(1)}M | COMBO 1: +${totC1P.toFixed(1)}M (ROI: +${(totC1P/totC1Stake*100).toFixed(2)}%) | COMBO 2: +${totC2P.toFixed(1)}M (ROI: +${(totC2P/totC2Stake*100).toFixed(2)}%)`);
console.log('----------------------------------------------------------------------------------------------------------------------');
