const fs = require('fs');
const path = require('path');

const advPath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const livePath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_loto_live_predictions.json');

const adv = JSON.parse(fs.readFileSync(advPath, 'utf8'));
const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));

// Build lookup maps for settledLedger of adv methods
const qmbfByDate = new Map();
(adv.loQuantumBayesFusion?.settledLedger || []).forEach(r => qmbfByDate.set(r.date, r));

const dualByDate = new Map();
(adv.loDualMerge?.settledLedger || []).forEach(r => dualByDate.set(r.date, r));

const triByDate = new Map();
(adv.loTriHarmonic?.settledLedger || []).forEach(r => triByDate.set(r.date, r));

// RRF rows from live predictions
const rrfByDate = new Map();
(live.predictions || []).forEach(r => {
    const d = r.predictionIsoDate || r.predictionDate || r.date;
    if (r.strategies?.rrfParallelBlock85Small65 || r.methods?.top6 || r.predictions?.top6) {
        rrfByDate.set(d, r);
    }
});

// Economics for Loto
const BASE_LOTO_STAKE_K = 2200; // 2.200K per 100 units / ~22K per diem
const BASE_LOTO_PAYOUT_K = 8000; // 8.000K per 100 units / ~80K per diem hit

function getCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const head = arr[0];
    const tail = arr.slice(1);
    const withHead = getCombinations(tail, k - 1).map(c => [head, ...c]);
    const withoutHead = getCombinations(tail, k);
    return [...withHead, ...withoutHead];
}

function runSimulation(topMode = 'top7') {
    const dates = [...rrfByDate.keys()]
        .filter(d => qmbfByDate.has(d) && dualByDate.has(d) && triByDate.has(d))
        .sort();

    const results = [];

    for (const date of dates) {
        const qRow = qmbfByDate.get(date);
        const dRow = dualByDate.get(date);
        const tRow = triByDate.get(date);
        const rRow = rrfByDate.get(date);

        const actualMap = {};
        (qRow.actual27 || []).forEach(n => {
            const s = String(n).padStart(2, '0');
            actualMap[s] = (actualMap[s] || 0) + 1;
        });

        // Extract numbers for each method
        let qNums = qRow.methods?.[topMode]?.betNumbers || (qRow.rankedNumbers || []).slice(0, topMode === 'top7' ? 7 : 6);
        let dNums = dRow.methods?.[topMode]?.betNumbers || (dRow.rankedNumbers || []).slice(0, topMode === 'top7' ? 7 : 6);
        let tNums = tRow.methods?.[topMode]?.betNumbers || (tRow.rankedNumbers || []).slice(0, topMode === 'top7' ? 7 : 6);
        
        const rrfPred = rRow.strategies?.rrfParallelBlock85Small65?.predictions || rRow.predictions || {};
        let rNums = rrfPred[topMode]?.numbers || rRow.methods?.[topMode]?.betNumbers || [];

        // Normalize
        qNums = [...new Set(qNums.map(n => String(n).padStart(2, '0')))];
        dNums = [...new Set(dNums.map(n => String(n).padStart(2, '0')))];
        tNums = [...new Set(tNums.map(n => String(n).padStart(2, '0')))];
        rNums = [...new Set(rNums.map(n => String(n).padStart(2, '0')))];

        // Count votes across the 4 methods
        const votes = {};
        const methodVotes = {};
        const allMethodsList = [
            { id: 'QMBF', nums: qNums },
            { id: 'Dual', nums: dNums },
            { id: 'Tri',  nums: tNums },
            { id: 'RRF',  nums: rNums }
        ];

        allMethodsList.forEach(m => {
            m.nums.forEach(num => {
                votes[num] = (votes[num] || 0) + 1;
                if (!methodVotes[num]) methodVotes[num] = [];
                methodVotes[num].push(m.id);
            });
        });

        // Filter numbers with votes >= 2
        // Trùng 2: x3, Trùng 3: x4, Trùng 4: x5
        const betNumbers = [];
        let dayLotoStakeK = 0;
        let dayLotoPayoutK = 0;
        let dayLotoHits = 0;

        const numbersOver2 = Object.keys(votes).filter(n => votes[n] >= 2).sort((a, b) => votes[b] - votes[a] || a.localeCompare(b));

        numbersOver2.forEach(num => {
            const v = votes[num];
            let multiplier = 0;
            if (v === 2) multiplier = 3;
            else if (v === 3) multiplier = 4;
            else if (v >= 4) multiplier = 5;

            const hits = actualMap[num] || 0;
            const stake = multiplier * BASE_LOTO_STAKE_K;
            const payout = hits * multiplier * BASE_LOTO_PAYOUT_K;

            dayLotoStakeK += stake;
            dayLotoPayoutK += payout;
            dayLotoHits += hits;

            betNumbers.push({
                num,
                votes: v,
                multiplier,
                hits,
                methods: methodVotes[num]
            });
        });

        const dayLotoProfitK = dayLotoPayoutK - dayLotoStakeK;
        const isLotoWin = dayLotoProfitK > 0;

        // Xiên 4 logic:
        // "Các số trùng từ 2 phương pháp trở lên, lấy làm dàn số đánh lô xiên (tối đa 5 phương án xiên 4), nếu số trùng lớn hơn 5 thì báo bỏ qua ko đánh"
        const countOver2 = numbersOver2.length;
        let xien4Status = 'SKIPPED';
        let xien4Combinations = [];
        let xien4StakeK = 0;
        let xien4PayoutK = 0;
        let xien4HitsCount = 0;

        if (countOver2 < 4) {
            xien4Status = 'TOO_FEW (<4 số)';
        } else if (countOver2 > 5) {
            xien4Status = `TOO_MANY (${countOver2} số > 5 -> BỎ QUA)`;
        } else {
            // Either exactly 4 (1 comb) or 5 (5 comb)
            xien4Status = `ACTIVE (${countOver2} số -> ${countOver2 === 4 ? 1 : 5} vé)`;
            xien4Combinations = getCombinations(numbersOver2, 4);

            // Let's evaluate each Xiên 4
            // Standard Xiên 4 (quay 11M or plain)
            // Here let's test Plain Xiên 4 (1 vé 100K = ăn 100-170 lần) AND Quây (11M)
            xien4Combinations.forEach(comb => {
                const uniqueHits = comb.filter(n => (actualMap[n] || 0) > 0).length;
                if (uniqueHits >= 4) {
                    xien4HitsCount++;
                }
                // Using standard quay model (11M stake):
                const s = 11000;
                let p = 0;
                if (uniqueHits >= 4) p = 384000;
                else if (uniqueHits === 3) p = 84000;
                else if (uniqueHits === 2) p = 12000;

                xien4StakeK += s;
                xien4PayoutK += p;
            });
        }

        const dayXien4ProfitK = xien4PayoutK - xien4StakeK;
        const isXien4Win = dayXien4ProfitK > 0;

        results.push({
            date,
            isLive: date >= '2026-08-28',
            countOver2,
            numbersOver2,
            betNumbers,
            dayLotoStakeK,
            dayLotoPayoutK,
            dayLotoProfitK,
            dayLotoHits,
            isLotoWin,
            xien4Status,
            xien4Combinations,
            xien4StakeK,
            xien4PayoutK,
            dayXien4ProfitK,
            isXien4Win,
            totalDayProfitK: dayLotoProfitK + dayXien4ProfitK
        });
    }

    return results;
}

const resTop7 = runSimulation('top7');
const resTop6 = runSimulation('top6');

function summarize(list, name) {
    console.log(`\n===============================================================`);
    console.log(`📊 BÁO CÁO CHIẾN LƯỢC: GHÉP 4 PHƯƠNG PHÁP (Top 6/7) -> LÔ X3/X4/X5 & XIÊN 4`);
    console.log(`Dữ liệu: ${name} | Tổng số ngày đối soát: ${list.length} ngày`);
    console.log(`===============================================================`);

    const liveOnly = list.filter(r => r.isLive);
    [
        { label: 'TOÀN BỘ LỊCH SỬ ĐỐI SOÁT (65 ngày)', rows: list },
        { label: 'THỰC CHIẾN LIVE (từ 28/08/2026 đến nay: ' + liveOnly.length + ' ngày)', rows: liveOnly }
    ].forEach(w => {
        const rows = w.rows;
        if (!rows.length) return;

        // Loto summary
        const lotoDays = rows.length;
        const lotoWins = rows.filter(r => r.isLotoWin).length;
        const lotoLosses = rows.filter(r => r.dayLotoProfitK < 0).length;
        const lotoFlats = rows.filter(r => r.dayLotoProfitK === 0).length;
        const totalLotoHits = rows.reduce((s, r) => s + r.dayLotoHits, 0);
        const totalLotoStake = rows.reduce((s, r) => s + r.dayLotoStakeK, 0);
        const totalLotoPayout = rows.reduce((s, r) => s + r.dayLotoPayoutK, 0);
        const totalLotoProfit = totalLotoPayout - totalLotoStake;
        const lotoRoi = totalLotoStake > 0 ? (totalLotoProfit / totalLotoStake * 100).toFixed(2) : '0';

        // Xiên 4 summary
        const xienActiveDays = rows.filter(r => r.xien4Combinations.length > 0);
        const xienWins = xienActiveDays.filter(r => r.isXien4Win).length;
        const totalXienStake = rows.reduce((s, r) => s + r.xien4StakeK, 0);
        const totalXienPayout = rows.reduce((s, r) => s + r.xien4PayoutK, 0);
        const totalXienProfit = totalXienPayout - totalXienStake;

        // Total Combo
        const totalProfit = totalLotoProfit + totalXienProfit;

        console.log(`\n📌 ${w.label}:`);
        console.log(`--- [1] DÀN LÔ TRÙNG TẦNG (Trùng 2 x3, Trùng 3 x4, Trùng 4 x5) ---`);
        console.log(`  * Số ngày: ${lotoDays} ngày`);
        console.log(`  * Thắng: ${lotoWins} ngày | Thua: ${lotoLosses} ngày | Hòa: ${lotoFlats} ngày`);
        console.log(`  * Tỷ lệ thắng (Win Rate): ${(lotoWins / lotoDays * 100).toFixed(1)}%`);
        console.log(`  * Tổng nháy trúng: ${totalLotoHits} nháy (TB ${(totalLotoHits / lotoDays).toFixed(2)} nháy/ngày)`);
        console.log(`  * Tổng vốn cược: ${(totalLotoStake / 1000).toFixed(1)}M`);
        console.log(`  * Tổng tiền trúng: ${(totalLotoPayout / 1000).toFixed(1)}M`);
        console.log(`  * LỢI NHUẬN RÒNG LÔ: ${totalLotoProfit >= 0 ? '+' : ''}${(totalLotoProfit / 1000).toFixed(1)}M`);
        console.log(`  * ROI: ${lotoRoi}%`);

        console.log(`--- [2] LÔ XIÊN 4 (Chỉ đánh khi có 4 hoặc 5 số trùng >= 2) ---`);
        console.log(`  * Số ngày đủ điều kiện đánh xiên (4-5 số): ${xienActiveDays.length}/${lotoDays} ngày (${(xienActiveDays.length/lotoDays*100).toFixed(1)}%)`);
        console.log(`  * Số ngày bỏ qua do > 5 số trùng: ${rows.filter(r => r.countOver2 > 5).length} ngày`);
        console.log(`  * Số ngày bỏ qua do < 4 số trùng: ${rows.filter(r => r.countOver2 < 4).length} ngày`);
        console.log(`  * Thắng Xiên 4 (Quây): ${xienWins}/${xienActiveDays.length} ngày (${xienActiveDays.length ? (xienWins/xienActiveDays.length*100).toFixed(1) : 0}%)`);
        console.log(`  * Tổng vốn cược Xiên: ${(totalXienStake / 1000).toFixed(1)}M`);
        console.log(`  * Tổng trúng Xiên: ${(totalXienPayout / 1000).toFixed(1)}M`);
        console.log(`  * LỢI NHUẬN RÒNG XIÊN 4: ${totalXienProfit >= 0 ? '+' : ''}${(totalXienProfit / 1000).toFixed(1)}M`);

        console.log(`--- [3] TỔNG KẾT COMBO CẢ LÔ VÀ XIÊN ---`);
        console.log(`  * TỔNG LÃI RÒNG: ${totalProfit >= 0 ? '+' : ''}${(totalProfit / 1000).toFixed(1)}M`);
    });
}

summarize(resTop7, 'SỬ DỤNG DÀN TOP 7 CỦA 4 PHƯƠNG PHÁP');
summarize(resTop6, 'SỬ DỤNG DÀN TOP 6 CỦA 4 PHƯƠNG PHÁP');

// Print detailed day by day for Live window (Top 7)
console.log(`\n===============================================================`);
console.log(`📋 BẢNG ĐỐI SOÁT CHI TIẾT TỪNG NGÀY LIVE THỰC CHIẾN (Giai đoạn 28/08 - 26/09)`);
console.log(`===============================================================`);
const liveTop7 = resTop7.filter(r => r.isLive);
liveTop7.forEach(r => {
    console.log(`\n🗓️ Ngày: ${r.date} | Trùng >= 2: ${r.countOver2} số [${r.numbersOver2.join(', ')}]`);
    console.log(`   - Lô đánh: ${r.betNumbers.map(b => `${b.num}(x${b.multiplier}, ${b.votes} vote, trúng ${b.hits} nháy)`).join(' | ')}`);
    console.log(`   - KQ Lô: ${r.dayLotoHits} nháy | Vốn ${(r.dayLotoStakeK/1000).toFixed(1)}M | Ăn ${(r.dayLotoPayoutK/1000).toFixed(1)}M | Lãi: ${r.dayLotoProfitK >= 0 ? '+' : ''}${(r.dayLotoProfitK/1000).toFixed(1)}M [${r.isLotoWin ? '✅ THẮNG' : '❌ THUA'}]`);
    console.log(`   - Xiên 4: ${r.xien4Status} | Vốn ${(r.xien4StakeK/1000).toFixed(1)}M | Ăn ${(r.xien4PayoutK/1000).toFixed(1)}M | Lãi: ${r.dayXien4ProfitK >= 0 ? '+' : ''}${(r.dayXien4ProfitK/1000).toFixed(1)}M`);
    console.log(`   - TỔNG NGÀY: ${r.totalDayProfitK >= 0 ? '+' : ''}${(r.totalDayProfitK/1000).toFixed(1)}M`);
});
