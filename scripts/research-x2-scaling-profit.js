'use strict';

const fs = require('fs');
const deFusionService = require('../lib/services/deFusionService');
const { getParityForm, numStr } = deFusionService;

const MULTIPLIER = 84;

async function run() {
    const rep = deFusionService.getDeFusionReport({ forceRefresh: false });
    const ledger = (rep.settledLedger || []).slice().sort((a, b) => a.date.localeCompare(b.date));

    console.log(`=== KHẢO SÁT QUY MÔ TẦNG X2 TỐI ƯU TRÊN ${ledger.length} KỲ NĂM 2026 ===\n`);

    // Kiểm tra các quy mô X2 từ 6 số đến 20 số (cược 2M/số, ăn 168M)
    for (let k = 6; k <= 20; k++) {
        let wins = 0;
        let totalStake = 0;
        let totalPayout = 0;

        ledger.forEach(r => {
            const s = r.strategies?.ai5Ensemble;
            if (!s) return;
            const actualStr = numStr(r.actualSpecial);
            const filteredTop = s.filteredTop || [];
            const subX2 = filteredTop.slice(0, k);

            const stake = subX2.length * 2; // 2M/số
            const hit = subX2.includes(actualStr);
            const payout = hit ? 168 : 0; // 168M

            totalStake += stake;
            totalPayout += payout;
            if (hit) wins++;
        });

        const profit = totalPayout - totalStake;
        const roi = (profit / totalStake) * 100;
        console.log(`Top ${k.toString().padStart(2)}s X2: Trúng ${wins.toString().padStart(2)}/299 (${(wins/299*100).toFixed(1)}%) | Vốn: ${totalStake}M | Ăn: ${totalPayout}M | Lãi: ${(profit >= 0 ? '+' : '') + profit}M | ROI: ${(roi >= 0 ? '+' : '') + roi.toFixed(2)}%`);
    }

    console.log('\n=== KHẢO SÁT KẾT HỢP X2 VÀ X1 ĐỂ TỐI ĐA HÓA LỢI NHUẬN DƯƠNG ===\n');
    // Thử kết hợp k con X2 (cược 2M) và m con X1 (cược 1M)
    for (let k of [8, 10, 11, 12, 13, 14]) {
        for (let m of [0, 5, 8, 10, 12, 15, 18, 20]) {
            let wins = 0;
            let x2Wins = 0;
            let x1Wins = 0;
            let totalStake = 0;
            let totalPayout = 0;

            ledger.forEach(r => {
                const s = r.strategies?.ai5Ensemble;
                if (!s) return;
                const actualStr = numStr(r.actualSpecial);
                const filteredTop = s.filteredTop || [];
                const filteredBot = s.filteredBot || [];

                const x2 = filteredTop.slice(0, k);
                const rem = [...filteredTop.slice(k), ...filteredBot];
                const x1 = rem.slice(0, m);

                const stake = (x2.length * 2) + (x1.length * 1);
                let hitX2 = x2.includes(actualStr);
                let hitX1 = !hitX2 && x1.includes(actualStr);

                let payout = 0;
                if (hitX2) payout = 168;
                else if (hitX1) payout = 84;

                totalStake += stake;
                totalPayout += payout;
                if (hitX2) { wins++; x2Wins++; }
                else if (hitX1) { wins++; x1Wins++; }
            });

            const profit = totalPayout - totalStake;
            const roi = (profit / totalStake) * 100;
            if (profit > 0 || roi > -2.0) {
                console.log(`[DƯƠNG/HÒA] ${k}s X2 + ${m.toString().padStart(2)}s X1 (Dàn ${(k+m).toString().padStart(2)}s): Trúng ${wins.toString().padStart(2)} (X2: ${x2Wins.toString().padStart(2)}, X1: ${x1Wins.toString().padStart(2)}) | Vốn: ${totalStake}M | Ăn: ${totalPayout}M | LÃI: ${(profit >= 0 ? '+' : '') + profit}M | ROI: ${(roi >= 0 ? '+' : '') + roi.toFixed(2)}%`);
            }
        }
    }
}

run().catch(console.error);
