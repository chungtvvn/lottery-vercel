'use strict';

const fs = require('fs');
const path = require('path');
const deFusionService = require('../lib/services/deFusionService');
const { getParityForm, numStr } = deFusionService;

const MULTIPLIER = 84;
const UNIT_X2_K = 2000; // 2M
const UNIT_X1_K = 1000; // 1M
const PAYOUT_X2_K = UNIT_X2_K * MULTIPLIER; // 168M
const PAYOUT_X1_K = UNIT_X1_K * MULTIPLIER; // 84M

async function main() {
    const rep = deFusionService.getDeFusionReport({ forceRefresh: true });
    const ledger = (rep.settledLedger || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    
    // Đọc cache deParityResearch để lấy thông tin chi tiết các mô hình
    const adv = JSON.parse(fs.readFileSync('lib/data/statistics/cached_daily_method_advisor.json', 'utf8'));
    const parityLedger = adv.deParityResearch?.settledLedger || [];
    const parityMap = {};
    parityLedger.forEach(r => {
        parityMap[r.date] = r;
    });

    const days = [];

    for (let i = 0; i < ledger.length; i++) {
        const r = ledger[i];
        const s = r.strategies?.ai5Ensemble;
        if (!s) continue;

        const actualStr = numStr(r.actualSpecial);
        const actualForm = r.actualForm || getParityForm(actualStr);
        const predForm = r.parityPrediction?.predForm;
        const oppForm = r.parityPrediction?.oppForm;
        const isElimLoss = s.isEliminatedLoss;

        const filteredTop = s.filteredTop || [];
        const filteredBot = s.filteredBot || [];

        // PA1: 12 X2 đầu + còn lại X1
        const x2List = filteredTop.slice(0, 12);
        const remainderTop = filteredTop.slice(12);
        const fullX1List = [...remainderTop, ...filteredBot];

        // Biến thể cắt đuôi:
        // Cắt 2 con cuối X1
        const x1Drop2 = fullX1List.slice(0, Math.max(0, fullX1List.length - 2));
        // Cố định 35 con đầu (12 X2 + 23 X1)
        const x1Fix23 = fullX1List.slice(0, 23);

        // Đánh giá kết quả cho cấu hình Quán Quân (PA1 + Drop2)
        const isX2Hit = x2List.includes(actualStr);
        const isX1Drop2Hit = !isX2Hit && x1Drop2.includes(actualStr);
        const isHit = isX2Hit || isX1Drop2Hit;
        const stakeK = (x2List.length * UNIT_X2_K) + (x1Drop2.length * UNIT_X1_K);
        let payoutK = 0;
        if (isX2Hit) payoutK = PAYOUT_X2_K;
        else if (isX1Drop2Hit) payoutK = PAYOUT_X1_K;
        const profitK = payoutK - stakeK;

        // Tín hiệu từ Parity Research
        const pRow = parityMap[r.date];
        let parityAgreement = 0;
        let headConf = 55;
        let tailConf = 55;
        if (pRow && pRow.methods) {
            const mList = Object.values(pRow.methods);
            const formCounts = {};
            mList.forEach(m => {
                if (m.predForm) formCounts[m.predForm] = (formCounts[m.predForm] || 0) + 1;
            });
            parityAgreement = Math.max(...Object.values(formCounts));
            if (pRow.methods.optimalHybrid) {
                headConf = pRow.methods.optimalHybrid.headConf || 55;
                tailConf = pRow.methods.optimalHybrid.tailConf || 55;
            }
        }

        // Tính điểm tổng hợp Tín Hiệu Đề S_De (0 - 100)
        // 1. Độ đồng thuận Chẵn Lẻ (5 mô hình): max 40đ (mỗi mô hình = 8đ)
        const agreeScore = (parityAgreement / 5) * 40;
        // 2. Độ tự tin headConf + tailConf (50-70): max 30đ
        const confAvg = (headConf + tailConf) / 2;
        const confScore = Math.min(30, Math.max(0, (confAvg - 50) * 1.5));
        // 3. Quy mô dàn lọc (nếu sau lọc còn 33-36 số => tập trung, 30đ)
        const totalFiltered = x2List.length + x1Drop2.length;
        const sizeScore = totalFiltered <= 34 ? 30 : (totalFiltered <= 36 ? 20 : 10);

        const signalScore = Math.round(agreeScore + confScore + sizeScore);

        days.push({
            date: r.date,
            month: r.date.slice(0, 7),
            actualStr,
            actualForm,
            predForm,
            oppForm,
            isElimLoss,
            isX2Hit,
            isX1Drop2Hit,
            isHit,
            stakeK,
            payoutK,
            profitK,
            signalScore,
            parityAgreement,
            confAvg,
            totalFiltered
        });
    }

    console.log(`Đã nạp ${days.length} ngày đối soát 2026.\n`);

    // TEST CÁC CHIẾN LƯỢC TÌM LỢI NHUẬN DƯƠNG (POSITIVE ROI)
    console.log('=== TEST 1: LỌC THEO NGƯỠNG TÍN HIỆU ĐỀ (SIGNAL THRESHOLD) ===');
    const thresholds = [0, 50, 55, 60, 65, 70, 75, 80];
    thresholds.forEach(th => {
        let nDays = 0, wins = 0, x2Hits = 0, x1Hits = 0, totalStake = 0, totalPayout = 0;
        days.forEach(d => {
            if (d.signalScore >= th) {
                nDays++;
                totalStake += d.stakeK;
                totalPayout += d.payoutK;
                if (d.isHit) {
                    wins++;
                    if (d.isX2Hit) x2Hits++;
                    else x1Hits++;
                }
            }
        });
        const profit = totalPayout - totalStake;
        const roi = totalStake > 0 ? (profit / totalStake) * 100 : 0;
        console.log(`Score >= ${th.toString().padStart(2)}: ${nDays.toString().padStart(3)} kỳ | Thắng: ${wins.toString().padStart(3)} (${(wins/nDays*100).toFixed(1)}%) | X2: ${x2Hits.toString().padStart(2)} | X1: ${x1Hits.toString().padStart(2)} | Vốn: ${(totalStake/1000).toFixed(1)}M | Lãi: ${(profit >= 0 ? '+' : '') + (profit/1000).toFixed(1)}M | ROI: ${(roi >= 0 ? '+' : '') + roi.toFixed(2)}%`);
    });

    console.log('\n=== TEST 2: ĐỒNG THUẬN CHẴN LẺ CAO (PARITY AGREEMENT) ===');
    [3, 4, 5].forEach(ag => {
        let nDays = 0, wins = 0, x2Hits = 0, x1Hits = 0, totalStake = 0, totalPayout = 0;
        days.forEach(d => {
            if (d.parityAgreement >= ag) {
                nDays++;
                totalStake += d.stakeK;
                totalPayout += d.payoutK;
                if (d.isHit) {
                    wins++;
                    if (d.isX2Hit) x2Hits++;
                    else x1Hits++;
                }
            }
        });
        const profit = totalPayout - totalStake;
        const roi = totalStake > 0 ? (profit / totalStake) * 100 : 0;
        console.log(`Agreement >= ${ag}/5: ${nDays.toString().padStart(3)} kỳ | Thắng: ${wins.toString().padStart(3)} (${(wins/nDays*100).toFixed(1)}%) | X2: ${x2Hits.toString().padStart(2)} | X1: ${x1Hits.toString().padStart(2)} | Vốn: ${(totalStake/1000).toFixed(1)}M | Lãi: ${(profit >= 0 ? '+' : '') + (profit/1000).toFixed(1)}M | ROI: ${(roi >= 0 ? '+' : '') + roi.toFixed(2)}%`);
    });

    console.log('\n=== TEST 3: CƠ CHẾ BÙ LỖ TÍN HIỆU TĂNG CƯỜNG (SIGNAL-GATED REBOUND) ===');
    // Luật: Nếu hôm qua THUA, hôm nay chỉ đánh nếu tín hiệu hôm nay >= hôm qua (hoặc signalScore >= ngưỡng)
    // Nếu hôm qua THẮNG, hôm nay đánh bình thường nếu signalScore >= ngưỡng nền
    [50, 55, 60].forEach(baseScore => {
        let nDays = 0, wins = 0, x2Hits = 0, x1Hits = 0, totalStake = 0, totalPayout = 0;
        let lastResult = 'WIN'; // Khởi tạo
        let lastScore = 60;
        let reboundBets = 0, reboundWins = 0;

        for (let i = 0; i < days.length; i++) {
            const d = days[i];
            let shouldBet = false;
            let multiplier = 1.0;

            if (i === 0) {
                shouldBet = d.signalScore >= baseScore;
            } else {
                const prev = days[i - 1];
                if (!prev.isHit) {
                    // Hôm trước thua: Chỉ đánh nếu tín hiệu hôm nay mạnh hơn hôm trước hoặc tín hiệu xuất sắc
                    if (d.signalScore > prev.signalScore || d.signalScore >= 65) {
                        shouldBet = true;
                        multiplier = 1.5; // Tăng nhẹ cược để bù lỗ
                        reboundBets++;
                    }
                } else {
                    // Hôm trước thắng: Đánh nếu đạt ngưỡng nền
                    if (d.signalScore >= baseScore) {
                        shouldBet = true;
                        multiplier = 1.0;
                    }
                }
            }

            if (shouldBet) {
                nDays++;
                const stake = d.stakeK * multiplier;
                const payout = d.payoutK * multiplier;
                totalStake += stake;
                totalPayout += payout;
                if (d.isHit) {
                    wins++;
                    if (d.isX2Hit) x2Hits++;
                    else x1Hits++;
                    if (i > 0 && !days[i - 1].isHit) reboundWins++;
                }
            }
        }
        const profit = totalPayout - totalStake;
        const roi = totalStake > 0 ? (profit / totalStake) * 100 : 0;
        console.log(`Rebound (Base >= ${baseScore}, x1.5 khi hồi phục): ${nDays} kỳ | Thắng: ${wins} (${(wins/nDays*100).toFixed(1)}%) | X2: ${x2Hits} | Vốn: ${(totalStake/1000).toFixed(1)}M | Lãi: ${(profit >= 0 ? '+' : '') + (profit/1000).toFixed(1)}M | ROI: ${(roi >= 0 ? '+' : '') + roi.toFixed(2)}% | Rebound Wins: ${reboundWins}/${reboundBets}`);
    });

    console.log('\n=== TEST 4: CHIẾN LƯỢC TẬP TRUNG TẦNG X2 (CHỈ ĐÁNH X2 HOẶC TĂNG TỶ TRỌNG X2) ===');
    // Thử nghiệm chỉ đánh 12 con X2 (hoặc 15 con X2)
    {
        let nDays = 0, wins = 0, totalStake = 0, totalPayout = 0;
        days.forEach(d => {
            nDays++;
            const stake = 12 * UNIT_X2_K; // 24M
            const payout = d.isX2Hit ? PAYOUT_X2_K : 0; // 168M
            totalStake += stake;
            totalPayout += payout;
            if (d.isX2Hit) wins++;
        });
        const profit = totalPayout - totalStake;
        const roi = (profit / totalStake) * 100;
        console.log(`Chỉ đánh 12s X2 hàng ngày: ${nDays} kỳ | Trúng: ${wins} (${(wins/nDays*100).toFixed(1)}%) | Vốn: ${(totalStake/1000).toFixed(1)}M | Lãi: ${(profit >= 0 ? '+' : '') + (profit/1000).toFixed(1)}M | ROI: ${(roi >= 0 ? '+' : '') + roi.toFixed(2)}%`);
    }

    // Thử nghiệm 12s X2 nhưng chỉ đánh khi signalScore >= 55 hoặc 60
    [55, 60, 65].forEach(th => {
        let nDays = 0, wins = 0, totalStake = 0, totalPayout = 0;
        days.forEach(d => {
            if (d.signalScore >= th) {
                nDays++;
                const stake = 12 * UNIT_X2_K;
                const payout = d.isX2Hit ? PAYOUT_X2_K : 0;
                totalStake += stake;
                totalPayout += payout;
                if (d.isX2Hit) wins++;
            }
        });
        const profit = totalPayout - totalStake;
        const roi = (profit / totalStake) * 100;
        console.log(`Chỉ đánh 12s X2 khi Score >= ${th}: ${nDays} kỳ | Trúng: ${wins} (${(wins/nDays*100).toFixed(1)}%) | Vốn: ${(totalStake/1000).toFixed(1)}M | Lãi: ${(profit >= 0 ? '+' : '') + (profit/1000).toFixed(1)}M | ROI: ${(roi >= 0 ? '+' : '') + roi.toFixed(2)}%`);
    });

}

main().catch(console.error);
