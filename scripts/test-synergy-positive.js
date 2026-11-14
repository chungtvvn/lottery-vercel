'use strict';

const fs = require('fs');
const deFusionService = require('../lib/services/deFusionService');
const { getParityForm, numStr } = deFusionService;

const MULTIPLIER = 84;
const UNIT_X2_K = 2000; // 2M
const UNIT_X1_K = 1000; // 1M

async function testSynergy() {
    const rep = deFusionService.getDeFusionReport({ forceRefresh: false });
    const ledger = (rep.settledLedger || []).slice().sort((a, b) => a.date.localeCompare(b.date));

    // Nạp deParityResearch để lấy thông tin các mô hình chẵn lẻ
    const adv = JSON.parse(fs.readFileSync('lib/data/statistics/cached_daily_method_advisor.json', 'utf8'));
    const parityLedger = adv.deParityResearch?.settledLedger || [];
    const parityMap = {};
    parityLedger.forEach(r => { parityMap[r.date] = r; });

    const records = [];

    ledger.forEach(r => {
        const s = r.strategies?.ai5Ensemble;
        if (!s) return;
        const actualStr = numStr(r.actualSpecial);
        const filteredTop = s.filteredTop || [];
        const filteredBot = s.filteredBot || [];

        // Cấu hình A: 12s X2 + 5s X1 (Dàn 17s)
        const x2A = filteredTop.slice(0, 12);
        const x1A = [...filteredTop.slice(12), ...filteredBot].slice(0, 5);
        const hitX2A = x2A.includes(actualStr);
        const hitX1A = !hitX2A && x1A.includes(actualStr);
        const hitA = hitX2A || hitX1A;
        const stakeA = (x2A.length * 2) + (x1A.length * 1);
        const payoutA = hitX2A ? 168 : (hitX1A ? 84 : 0);
        const profitA = payoutA - stakeA;

        // Cấu hình B: 17s X2 (Dàn 17s thuần VIP)
        const x2B = filteredTop.slice(0, 17);
        const hitB = x2B.includes(actualStr);
        const stakeB = x2B.length * 2;
        const payoutB = hitB ? 168 : 0;
        const profitB = payoutB - stakeB;

        // Tín hiệu đồng thuận chẵn lẻ
        const pRow = parityMap[r.date];
        let parityAgreement = 0;
        let optHit = false;
        if (pRow && pRow.methods) {
            const mList = Object.values(pRow.methods);
            const formCounts = {};
            mList.forEach(m => {
                if (m.predForm) formCounts[m.predForm] = (formCounts[m.predForm] || 0) + 1;
            });
            parityAgreement = Math.max(...Object.values(formCounts));
            optHit = pRow.methods.optimalHybrid?.isFormHit;
        }

        records.push({
            date: r.date,
            month: r.date.slice(0, 7),
            actualStr,
            hitA, hitX2A, hitX1A, stakeA, payoutA, profitA,
            hitB, stakeB, payoutB, profitB,
            parityAgreement
        });
    });

    console.log(`=== THỬ NGHIỆM KẾT HỢP DÀN 17S (12 X2 + 5 X1) VỚI ĐỒNG THUẬN CHẴN LẺ ===\n`);
    [0, 3, 4, 5].forEach(ag => {
        let nDays = 0, winsA = 0, x2A = 0, x1A = 0, stakeA = 0, payoutA = 0;
        let winsB = 0, stakeB = 0, payoutB = 0;

        records.forEach(d => {
            if (d.parityAgreement >= ag) {
                nDays++;
                stakeA += d.stakeA;
                payoutA += d.payoutA;
                if (d.hitA) {
                    winsA++;
                    if (d.hitX2A) x2A++;
                    else x1A++;
                }

                stakeB += d.stakeB;
                payoutB += d.payoutB;
                if (d.hitB) winsB++;
            }
        });

        const profA = payoutA - stakeA;
        const roiA = (profA / stakeA) * 100;
        const profB = payoutB - stakeB;
        const roiB = (profB / stakeB) * 100;

        console.log(`-- Agreement >= ${ag}/5 (${nDays} kỳ) --`);
        console.log(`   * Dàn 12 X2 + 5 X1: Trúng ${winsA}/${nDays} (${(winsA/nDays*100).toFixed(1)}%) | X2: ${x2A}, X1: ${x1A} | Vốn: ${stakeA}M | LÃI: ${(profA >= 0 ? '+' : '') + profA}M | ROI: ${(roiA >= 0 ? '+' : '') + roiA.toFixed(2)}%`);
        console.log(`   * Dàn 17 X2 thuần:   Trúng ${winsB}/${nDays} (${(winsB/nDays*100).toFixed(1)}%) | Vốn: ${stakeB}M | LÃI: ${(profB >= 0 ? '+' : '') + profB}M | ROI: ${(roiB >= 0 ? '+' : '') + roiB.toFixed(2)}%`);
    });

    // Thử nghiệm theo tháng của Dàn 12 X2 + 5 X1
    console.log('\n=== BẢNG THEO THÁNG CỦA DÀN 12 X2 + 5 X1 (NĂM 2026) ===');
    const months = [...new Set(records.map(r => r.month))].sort();
    months.forEach(m => {
        const mRows = records.filter(r => r.month === m);
        let wins = 0, x2 = 0, x1 = 0, stake = 0, payout = 0;
        mRows.forEach(r => {
            stake += r.stakeA;
            payout += r.payoutA;
            if (r.hitA) {
                wins++;
                if (r.hitX2A) x2++;
                else x1++;
            }
        });
        const prof = payout - stake;
        const roi = (prof / stake) * 100;
        console.log(`Tháng ${m} (${mRows.length} kỳ): Trúng ${wins.toString().padStart(2)} (${(wins/mRows.length*100).toFixed(1)}%) | X2: ${x2.toString().padStart(2)}, X1: ${x1.toString().padStart(2)} | Vốn: ${stake.toString().padStart(4)}M | Ăn: ${payout.toString().padStart(4)}M | Lãi: ${(prof >= 0 ? '+' : '') + prof.toString().padStart(4)}M | ROI: ${(roi >= 0 ? '+' : '') + roi.toFixed(1)}%`);
    });
}

testSynergy().catch(console.error);
