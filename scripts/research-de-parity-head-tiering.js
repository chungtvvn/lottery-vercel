'use strict';

const fs = require('fs');
const path = require('path');
const lotteryService = require('../lib/services/lotteryService');

// Wilson score interval 95%
function wilsonScore(hits, total, z = 1.96) {
    if (total === 0) return { center: 0, low: 0, high: 0 };
    const p = hits / total;
    const denominator = 1 + (z * z) / total;
    const center = (p + (z * z) / (2 * total)) / denominator;
    const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denominator;
    return {
        center: Math.round(center * 1000) / 10,
        low: Math.round(Math.max(0, center - margin) * 1000) / 10,
        high: Math.round(Math.min(1, center + margin) * 1000) / 10
    };
}

function numStr(val) {
    return String(Number(val)).padStart(2, '0');
}

function getHead(n) {
    return Math.floor(Number(n) / 10);
}

function isEven(val) {
    return Number(val) % 2 === 0;
}

async function runResearch() {
    console.log('========================================================================');
    console.log(' NGHIÊN CỨU 1: PHÂN TẦNG ĐỀ THEO CHẴN/LẺ ĐẦU HÔM TRƯỚC (X2 / X1)');
    console.log(' 100% Strict Point-In-Time (Strict PIT) - Dữ liệu 2026 (289 kỳ mở thưởng)');
    console.log('========================================================================\n');

    await lotteryService.loadRawData();
    const rawData = lotteryService.getRawData().slice().sort((a, b) => new Date(a.date) - new Date(b.date));

    // 1. Phân tích Thống Kê Nền: Xác suất Lặp Parity Đầu (Yesterday -> Today)
    console.log('--- 1. KIỂM ĐỊNH THỐNG KÊ PARITY ĐẦU (XSMB 20+ NĂM & NĂM 2026) ---');
    let sameHeadParityAll = 0, totalTransitionsAll = 0;
    for (let i = 1; i < rawData.length; i++) {
        const prevSpecial = Number(String(rawData[i - 1].special).slice(-2));
        const currSpecial = Number(String(rawData[i].special).slice(-2));
        const prevHeadParity = isEven(getHead(prevSpecial));
        const currHeadParity = isEven(getHead(currSpecial));
        if (prevHeadParity === currHeadParity) sameHeadParityAll++;
        totalTransitionsAll++;
    }
    const rateAll = (sameHeadParityAll / totalTransitionsAll * 100).toFixed(2);
    const wilsonAll = wilsonScore(sameHeadParityAll, totalTransitionsAll);
    console.log(`Toàn bộ lịch sử 2005-2026 (${totalTransitionsAll} kỳ):`);
    console.log(`  - Số kỳ lặp Parity đầu hôm trước: ${sameHeadParityAll}/${totalTransitionsAll} = ${rateAll}%`);
    console.log(`  - Wilson 95% CI: [${wilsonAll.low}% - ${wilsonAll.high}%] (Kỳ vọng ngẫu nhiên lý thuyết: 50.0%)`);

    // Năm 2026
    const draws2026 = rawData.filter(r => r.date >= '2026-01-01');
    let sameHeadParity2026 = 0, totalTransitions2026 = 0;
    for (let i = 0; i < draws2026.length; i++) {
        const currDate = draws2026[i].date;
        const rawIdx = rawData.findIndex(r => r.date === currDate);
        if (rawIdx <= 0) continue;
        const prevSpecial = Number(String(rawData[rawIdx - 1].special).slice(-2));
        const currSpecial = Number(String(rawData[rawIdx].special).slice(-2));
        const prevHeadParity = isEven(getHead(prevSpecial));
        const currHeadParity = isEven(getHead(currSpecial));
        if (prevHeadParity === currHeadParity) sameHeadParity2026++;
        totalTransitions2026++;
    }
    const rate2026 = (sameHeadParity2026 / totalTransitions2026 * 100).toFixed(2);
    const wilson2026 = wilsonScore(sameHeadParity2026, totalTransitions2026);
    console.log(`\nRiêng năm 2026 (${totalTransitions2026} kỳ từ 01/01/2026 đến 20/10/2026):`);
    console.log(`  - Số kỳ lặp Parity đầu hôm trước: ${sameHeadParity2026}/${totalTransitions2026} = ${rate2026}%`);
    console.log(`  - Wilson 95% CI: [${wilson2026.low}% - ${wilson2026.high}%]`);

    // 2. Tải cache daily advisor để lấy dàn số Đề thực tế 2026
    const advisorPath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
    if (!fs.existsSync(advisorPath)) {
        console.error('Không tìm thấy cached_daily_method_advisor.json');
        return;
    }
    const adv = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));

    // Các phương pháp Đề áp dụng phân tầng trong hệ thống
    const testMethods = [
        { id: 'adaptiveDualMerge', name: 'Đề Thích Ứng Alpha (~30-36 số)', getLedger: () => adv.adaptiveDualMerge?.settledLedger || [] },
        { id: 'pentaCoreDe', name: 'Đề Ngũ Tinh Consensus (~36-40 số)', getLedger: () => adv.pentaCoreDe?.settledLedger || [] },
        { id: 'deMarkovGapHazard', name: 'Đề Markov Hazard (~36-40 số)', getLedger: () => adv.deMarkovGapHazard?.settledLedger || [] },
        { id: 'dualMerge', name: 'Đề Gộp Tiêu Chuẩn (~30 số)', getLedger: () => adv.dualMerge?.settledLedger || [] }
    ];

    console.log('\n--- 2. THỬ NGHIỆM BACKTEST CHI TIẾT TRÊN CÁC ĐỘNG CƠ ĐỀ 2026 ---');
    console.log('Quy tắc cược:');
    console.log('  - Nhóm X2 (trùng Parity đầu hôm trước): cược 200K/số, ăn 16.8M/số trúng');
    console.log('  - Nhóm X1 (khác Parity đầu hôm trước): cược 100K/số, ăn 8.4M/số trúng');
    console.log('  - So sánh với Đánh Phẳng (tất cả cược 100K/số, ăn 8.4M)');
    console.log('  - So sánh với Nhóm Nghịch Đảo (cược X2 vào số KHÁC Parity đầu)');

    const results = [];

    for (const m of testMethods) {
        const ledger = m.getLedger();
        if (!ledger || ledger.length === 0) continue;

        let totalDays = 0;
        let totalHits = 0;

        // Proposed X2/X1:
        let propX2CountTotal = 0, propX1CountTotal = 0;
        let propX2Hits = 0, propX1Hits = 0;
        let propStakeK = 0, propPayoutK = 0;

        // Flat:
        let flatStakeK = 0, flatPayoutK = 0;

        // Inverse (X2 for opposite parity):
        let invStakeK = 0, invPayoutK = 0;
        let invX2Hits = 0, invX1Hits = 0;

        // Original Method (if available in ledger):
        let origStakeK = 0, origPayoutK = 0;
        let hasOrigData = false;

        for (const row of ledger) {
            const date = row.date;
            const rawIdx = rawData.findIndex(r => r.date === date);
            if (rawIdx <= 0) continue;

            const prevSpecial = Number(String(rawData[rawIdx - 1].special).slice(-2));
            const prevHead = getHead(prevSpecial);
            const prevHeadEven = isEven(prevHead);

            const currActualSpecial = Number(String(rawData[rawIdx].special).slice(-2));
            const currSpecialStr = numStr(currActualSpecial);

            // Candidate numbers
            const candidateNums = (row.numbers || row.betNumbers || []).map(numStr);
            if (candidateNums.length === 0) continue;

            totalDays++;
            const isHit = candidateNums.includes(currSpecialStr);
            if (isHit) totalHits++;

            // Split into X2 and X1 according to Proposed rule
            const x2Nums = candidateNums.filter(n => isEven(getHead(n)) === prevHeadEven);
            const x1Nums = candidateNums.filter(n => isEven(getHead(n)) !== prevHeadEven);

            propX2CountTotal += x2Nums.length;
            propX1CountTotal += x1Nums.length;

            const hitInX2 = x2Nums.includes(currSpecialStr);
            const hitInX1 = x1Nums.includes(currSpecialStr);
            if (hitInX2) propX2Hits++;
            if (hitInX1) propX1Hits++;

            // Proposed PnL: X2 = 200K, X1 = 100K
            const dayPropStake = x2Nums.length * 200 + x1Nums.length * 100;
            const dayPropPayout = hitInX2 ? 200 * 84 : (hitInX1 ? 100 * 84 : 0);
            propStakeK += dayPropStake;
            propPayoutK += dayPropPayout;

            // Flat PnL: all @ 100K
            const dayFlatStake = candidateNums.length * 100;
            const dayFlatPayout = isHit ? 100 * 84 : 0;
            flatStakeK += dayFlatStake;
            flatPayoutK += dayFlatPayout;

            // Inverse PnL: opposite parity gets X2
            const invX2Nums = x1Nums; // opposite is now X2
            const invX1Nums = x2Nums; // same is now X1
            const dayInvStake = invX2Nums.length * 200 + invX1Nums.length * 100;
            const dayInvPayout = hitInX1 ? 200 * 84 : (hitInX2 ? 100 * 84 : 0);
            invStakeK += dayInvStake;
            invPayoutK += dayInvPayout;
            if (hitInX1) invX2Hits++;
            if (hitInX2) invX1Hits++;

            // Original Method PnL (from row if present)
            if (row.stakeK !== undefined && row.payoutK !== undefined) {
                hasOrigData = true;
                origStakeK += row.stakeK;
                origPayoutK += row.payoutK;
            }
        }

        const propProfitK = propPayoutK - propStakeK;
        const propRoi = (propProfitK / propStakeK * 100).toFixed(1);

        const flatProfitK = flatPayoutK - flatStakeK;
        const flatRoi = (flatProfitK / flatStakeK * 100).toFixed(1);

        const invProfitK = invPayoutK - invStakeK;
        const invRoi = (invProfitK / invStakeK * 100).toFixed(1);

        const avgX2PerDay = (propX2CountTotal / totalDays).toFixed(1);
        const avgX1PerDay = (propX1CountTotal / totalDays).toFixed(1);
        const hitRateX2 = (propX2Hits / totalDays * 100).toFixed(1);
        const hitRateX1 = (propX1Hits / totalDays * 100).toFixed(1);
        const overallHitRate = (totalHits / totalDays * 100).toFixed(1);

        results.push({
            name: m.name,
            totalDays,
            totalHits,
            overallHitRate,
            avgX2PerDay,
            avgX1PerDay,
            propX2Hits,
            propX1Hits,
            propProfitK,
            propRoi,
            flatProfitK,
            flatRoi,
            invProfitK,
            invRoi,
            origProfitK: hasOrigData ? (origPayoutK - origStakeK) : null,
            origRoi: hasOrigData ? ((origPayoutK - origStakeK) / origStakeK * 100).toFixed(1) : null
        });
    }

    console.table(results.map(r => ({
        'Phương Pháp': r.name,
        'Số kỳ': r.totalDays,
        'Trúng tổng': `${r.totalHits} (${r.overallHitRate}%)`,
        'Quy mô X2/X1': `${r.avgX2PerDay}s / ${r.avgX1PerDay}s`,
        'Trúng X2': `${r.propX2Hits} (${(r.propX2Hits/r.totalHits*100).toFixed(1)}%)`,
        'Trúng X1': `${r.propX1Hits} (${(r.propX1Hits/r.totalHits*100).toFixed(1)}%)`,
        'Lãi Đề Xuất (X2/X1)': `${(r.propProfitK/1000).toFixed(1)}M (ROI ${r.propRoi}%)`,
        'Lãi Đánh Phẳng': `${(r.flatProfitK/1000).toFixed(1)}M (ROI ${r.flatRoi}%)`,
        'Lãi Nghịch Đảo': `${(r.invProfitK/1000).toFixed(1)}M (ROI ${r.invRoi}%)`,
        'Lãi Gốc Hệ Thống': r.origProfitK !== null ? `${(r.origProfitK/1000).toFixed(1)}M (ROI ${r.origRoi}%)` : 'N/A'
    })));

    return results;
}

runResearch().catch(console.error);
