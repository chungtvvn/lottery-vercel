'use strict';

const deFusionService = require('../lib/services/deFusionService');
const { numStr } = deFusionService;

const MULTIPLIER = 84;

async function explore() {
    const rep = deFusionService.getDeFusionReport({ forceRefresh: false });
    const ledger = (rep.settledLedger || []).slice().sort((a, b) => a.date.localeCompare(b.date));

    console.log(`=== KHẢO SÁT CHI TIẾT TÌM LỢI NHUẬN DƯƠNG CAO NHẤT ===\n`);

    const results = [];

    // 1. Khảo sát Top k X2 (cược 2M) + Top m X1 (cược 1M)
    for (let k = 10; k <= 18; k++) {
        for (let m = 0; m <= 10; m++) {
            let wins = 0, x2Hits = 0, x1Hits = 0;
            let totalStake = 0, totalPayout = 0;

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
                if (hitX2) payout = 2 * MULTIPLIER; // 168
                else if (hitX1) payout = 1 * MULTIPLIER; // 84

                totalStake += stake;
                totalPayout += payout;
                if (hitX2) { wins++; x2Hits++; }
                else if (hitX1) { wins++; x1Hits++; }
            });

            const profit = totalPayout - totalStake;
            const roi = (profit / totalStake) * 100;
            results.push({
                type: 'standard',
                k, m,
                totalNums: k + m,
                wins, x2Hits, x1Hits,
                winPct: (wins / 299) * 100,
                stake: totalStake,
                payout: totalPayout,
                profit,
                roi
            });
        }
    }

    // Lọc các kết quả có LỢI NHUẬN DƯƠNG
    const positiveResults = results.filter(r => r.profit > 0).sort((a, b) => b.profit - a.profit);
    console.log(`Tìm thấy ${positiveResults.length} cấu hình có LỢI NHUẬN DƯƠNG (> 0M)!\n`);
    console.log('Top 15 Cấu Hình Có Lợi Nhuận Dương Cao Nhất (X2 = 2M, X1 = 1M):');
    console.log('-------------------------------------------------------------------------------------------------------');
    console.log('Cấu hình               | Dàn (X2+X1) | Trúng (Tỷ lệ %) | X2 / X1 | Vốn (M) | Ăn (M)  | Lãi Ròng (M) | ROI (%)');
    console.log('-------------------------------------------------------------------------------------------------------');
    positiveResults.slice(0, 15).forEach((r, idx) => {
        const name = `${r.k}s X2 + ${r.m.toString().padStart(2)}s X1`.padEnd(22);
        const dan = `${r.totalNums.toString().padStart(2)}s (${r.k}+${r.m})`.padEnd(11);
        const win = `${r.wins.toString().padStart(2)} (${r.winPct.toFixed(1)}%)`.padEnd(15);
        const ratio = `${r.x2Hits.toString().padStart(2)} / ${r.x1Hits.toString().padStart(2)}`.padEnd(7);
        const stake = `${r.stake.toString().padStart(6)}M`.padEnd(9);
        const payout = `${r.payout.toString().padStart(6)}M`.padEnd(9);
        const profit = `+${r.profit}M`.padEnd(14);
        const roi = `+${r.roi.toFixed(2)}%`;
        console.log(`${(idx + 1).toString().padStart(2)}. ${name} | ${dan} | ${win} | ${ratio} | ${stake} | ${payout} | ${profit} | ${roi}`);
    });

    // 2. Thử nghiệm cấu hình Tỷ lệ Tầng Không Đều: X2 = 3M (ăn 252M), X1 = 1M (ăn 84M)
    console.log('\n=== KHẢO SÁT ĐÒN BẨY TẦNG X2 (X2 = 3M / Ăn 252M, X1 = 1M / Ăn 84M) ===');
    const resultsWeighted = [];
    for (let k = 10; k <= 15; k++) {
        for (let m = 0; m <= 15; m++) {
            let wins = 0, x2Hits = 0, x1Hits = 0;
            let totalStake = 0, totalPayout = 0;

            ledger.forEach(r => {
                const s = r.strategies?.ai5Ensemble;
                if (!s) return;
                const actualStr = numStr(r.actualSpecial);
                const filteredTop = s.filteredTop || [];
                const filteredBot = s.filteredBot || [];

                const x2 = filteredTop.slice(0, k);
                const rem = [...filteredTop.slice(k), ...filteredBot];
                const x1 = rem.slice(0, m);

                const stake = (x2.length * 3) + (x1.length * 1);
                let hitX2 = x2.includes(actualStr);
                let hitX1 = !hitX2 && x1.includes(actualStr);

                let payout = 0;
                if (hitX2) payout = 3 * MULTIPLIER; // 252
                else if (hitX1) payout = 1 * MULTIPLIER; // 84

                totalStake += stake;
                totalPayout += payout;
                if (hitX2) { wins++; x2Hits++; }
                else if (hitX1) { wins++; x1Hits++; }
            });

            const profit = totalPayout - totalStake;
            const roi = (profit / totalStake) * 100;
            if (profit > 0) {
                resultsWeighted.push({
                    k, m, totalNums: k + m, wins, x2Hits, x1Hits, winPct: (wins/299)*100,
                    stake: totalStake, payout: totalPayout, profit, roi
                });
            }
        }
    }
    resultsWeighted.sort((a, b) => b.profit - a.profit);
    console.log(`Tìm thấy ${resultsWeighted.length} cấu hình đòn bẩy X2 = 3M có LÃI DƯƠNG! Top 5:`);
    resultsWeighted.slice(0, 5).forEach((r, idx) => {
        console.log(`${idx + 1}. ${r.k}s X2(3M) + ${r.m}s X1(1M) (${r.totalNums}s): Trúng ${r.wins} (${r.winPct.toFixed(1)}%) | X2: ${r.x2Hits}, X1: ${r.x1Hits} | Vốn: ${r.stake}M | Ăn: ${r.payout}M | LÃI: +${r.profit}M | ROI: +${r.roi.toFixed(2)}%`);
    });

}

explore().catch(console.error);
