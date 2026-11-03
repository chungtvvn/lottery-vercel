/**
 * Nghiên cứu & Backtest Chuyên Sâu: So Sánh Cửa Sổ Xếp Hạng (Ranking Windows)
 * Khi Ghép Dàn Xiên Fusion (Daily vs Shadow)
 * 
 * 4 Biến thể:
 *   1. S1 (Baseline): Daily Top 1..8 × Shadow Top 1..8
 *   2. S2 (Shadow Top 5..12): Daily Top 1..8 × Shadow Top 5..12
 *   3. S3 (Cả 2 Top 5..12): Daily Top 5..12 × Shadow Top 5..12
 *   4. S4 (Daily Top 5..12): Daily Top 5..12 × Shadow Top 1..8
 * 
 * Chạy trên 2 tập dữ liệu:
 *   - Tập A: 46 kỳ Live (Registry)
 *   - Tập B: Toàn bộ 2026 (298 kỳ)
 */

const fs = require('fs');
const path = require('path');
const { pairTop8WithParity } = require('../lib/services/top8ParityXien4Service');
const { computePentaConsensusForDate } = require('../lib/services/pentaConsensusService');

const PAYOUT_MAP = {
    0: 0,
    1: 0,
    2: 12000,
    3: 84000,
    4: 384000
};
const STAKE_PER_DAN_K = 11000;
const FUSION_DAILY_STAKE_K = 44000;

function loadPrizes27Map() {
    const compactPath = path.join(process.cwd(), 'data', 'xsmb-2-digits-compact.json');
    const prizesMap = {};
    if (fs.existsSync(compactPath)) {
        const raw = JSON.parse(fs.readFileSync(compactPath, 'utf-8'));
        if (Array.isArray(raw.data)) {
            raw.data.forEach(row => {
                if (row[0] && Array.isArray(row[1])) {
                    prizesMap[row[0]] = row[1].map(x => String(x).padStart(2, '0'));
                }
            });
        }
    }
    return prizesMap;
}

function fusePair(d = [], s = []) {
    const dNorm = (d || []).map(x => String(x).padStart(2, '0'));
    const sNorm = (s || []).map(x => String(x).padStart(2, '0'));

    const danA = [];
    const usedD = new Set();
    const usedS = new Set();

    for (let i = 0; i < dNorm.length && danA.length < 2; i++) {
        if (!danA.includes(dNorm[i])) {
            danA.push(dNorm[i]);
            usedD.add(i);
        }
    }

    for (let i = 0; i < sNorm.length && danA.length < 4; i++) {
        if (!danA.includes(sNorm[i])) {
            danA.push(sNorm[i]);
            usedS.add(i);
        }
    }

    if (danA.length < 4) {
        for (let i = 0; i < dNorm.length && danA.length < 4; i++) {
            if (!danA.includes(dNorm[i])) {
                danA.push(dNorm[i]);
                usedD.add(i);
            }
        }
    }

    const danB = [];
    for (let i = 0; i < dNorm.length; i++) {
        if (!usedD.has(i) && !danB.includes(dNorm[i])) {
            danB.push(dNorm[i]);
        }
    }
    for (let i = 0; i < sNorm.length; i++) {
        if (!usedS.has(i) && !danB.includes(sNorm[i])) {
            danB.push(sNorm[i]);
        }
    }

    if (danB.length < 4) {
        const pool = [...dNorm, ...sNorm];
        for (const num of pool) {
            if (!danB.includes(num)) {
                danB.push(num);
                if (danB.length === 4) break;
            }
        }
    }

    return {
        danA: danA.slice(0, 4),
        danB: danB.slice(0, 4)
    };
}

function evalSingleDan(dan = [], actSet = new Set()) {
    const hitsList = (dan || []).filter(n => actSet.has(String(n).padStart(2, '0')));
    const count = hitsList.length;
    const payoutK = PAYOUT_MAP[count] || 0;
    const profitK = payoutK - STAKE_PER_DAN_K;
    return { dan, hits: count, hitNums: hitsList, payoutK, profitK };
}

function runStrategyEvaluation(datasetName, records) {
    const strategies = [
        { id: 'S1_Top1to8_x_Top1to8', name: 'S1: Daily Top 1..8 × Shadow Top 1..8 (Baseline Chuẩn)', getD: r => r.dailyTop8, getS: r => r.shadowTop8 },
        { id: 'S2_Top1to8_x_Top5to12', name: 'S2: Daily Top 1..8 × Shadow Top 5..12 (User Đề Xuất)', getD: r => r.dailyTop8, getS: r => r.shadowTop5to12 },
        { id: 'S3_Top5to12_x_Top5to12', name: 'S3: Daily Top 5..12 × Shadow Top 5..12 (Cả 2 Tầng Sau)', getD: r => r.dailyTop5to12, getS: r => r.shadowTop5to12 },
        { id: 'S4_Top5to12_x_Top1to8', name: 'S4: Daily Top 5..12 × Shadow Top 1..8 (Đối Chứng Nghịch)', getD: r => r.dailyTop5to12, getS: r => r.shadowTop8 }
    ];

    const results = {};

    strategies.forEach(strat => {
        let days = 0;
        let stakeK = 0;
        let payoutK = 0;
        let profitK = 0;
        let winDays = 0;
        let breakEvenDays = 0;
        let h4Total = 0;
        let h3Total = 0;
        let h2Total = 0;

        const danStats = {
            '1A': { stakeK: 0, payoutK: 0, profitK: 0, h4: 0, h3: 0, h2: 0 },
            '1B': { stakeK: 0, payoutK: 0, profitK: 0, h4: 0, h3: 0, h2: 0 },
            '2A': { stakeK: 0, payoutK: 0, profitK: 0, h4: 0, h3: 0, h2: 0 },
            '2B': { stakeK: 0, payoutK: 0, profitK: 0, h4: 0, h3: 0, h2: 0 }
        };

        records.forEach(rec => {
            const dEight = strat.getD(rec);
            const sEight = strat.getS(rec);

            if (!dEight || dEight.length < 8 || !sEight || sEight.length < 8) {
                return;
            }

            const pD = pairTop8WithParity(dEight);
            const pS = pairTop8WithParity(sEight);

            const pair1 = fusePair(pD.dan1, pS.dan1);
            const pair2 = fusePair(pD.dan2, pS.dan2);

            const actSet = new Set(rec.p27);

            const e1A = evalSingleDan(pair1.danA, actSet);
            const e1B = evalSingleDan(pair1.danB, actSet);
            const e2A = evalSingleDan(pair2.danA, actSet);
            const e2B = evalSingleDan(pair2.danB, actSet);

            const dayPayoutK = e1A.payoutK + e1B.payoutK + e2A.payoutK + e2B.payoutK;
            const dayProfitK = dayPayoutK - FUSION_DAILY_STAKE_K;

            days++;
            stakeK += FUSION_DAILY_STAKE_K;
            payoutK += dayPayoutK;
            profitK += dayProfitK;

            if (dayProfitK > 0) winDays++;
            else if (dayProfitK === 0) breakEvenDays++;

            const dayH4 = (e1A.hits === 4 ? 1 : 0) + (e1B.hits === 4 ? 1 : 0) + (e2A.hits === 4 ? 1 : 0) + (e2B.hits === 4 ? 1 : 0);
            const dayH3 = (e1A.hits === 3 ? 1 : 0) + (e1B.hits === 3 ? 1 : 0) + (e2A.hits === 3 ? 1 : 0) + (e2B.hits === 3 ? 1 : 0);
            const dayH2 = (e1A.hits === 2 ? 1 : 0) + (e1B.hits === 2 ? 1 : 0) + (e2A.hits === 2 ? 1 : 0) + (e2B.hits === 2 ? 1 : 0);

            h4Total += dayH4;
            h3Total += dayH3;
            h2Total += dayH2;

            [
                ['1A', e1A],
                ['1B', e1B],
                ['2A', e2A],
                ['2B', e2B]
            ].forEach(([id, evalRes]) => {
                danStats[id].stakeK += STAKE_PER_DAN_K;
                danStats[id].payoutK += evalRes.payoutK;
                danStats[id].profitK += evalRes.profitK;
                if (evalRes.hits === 4) danStats[id].h4++;
                if (evalRes.hits === 3) danStats[id].h3++;
                if (evalRes.hits === 2) danStats[id].h2++;
            });
        });

        const roi = stakeK > 0 ? (profitK / stakeK) * 100 : 0;
        const winRate = days > 0 ? (winDays / days) * 100 : 0;

        results[strat.id] = {
            id: strat.id,
            name: strat.name,
            days,
            stakeM: (stakeK / 1000).toFixed(1),
            payoutM: (payoutK / 1000).toFixed(1),
            profitM: (profitK / 1000).toFixed(1),
            roi: roi.toFixed(2),
            winDays,
            breakEvenDays,
            winRate: winRate.toFixed(1),
            h4: h4Total,
            h3: h3Total,
            h2: h2Total,
            danStats: Object.fromEntries(
                Object.entries(danStats).map(([k, v]) => [
                    k,
                    {
                        profitM: (v.profitK / 1000).toFixed(1),
                        roi: ((v.profitK / v.stakeK) * 100).toFixed(1),
                        h4: v.h4,
                        h3: v.h3,
                        h2: v.h2
                    }
                ])
            )
        };
    });

    return results;
}

function main() {
    console.log('='.repeat(90));
    console.log('NGHIÊN CỨU & ĐỐI SOÁT CỬA SỔ XẾP HẠNG (RANKING WINDOWS) CHO XIÊN FUSION');
    console.log('='.repeat(90));

    const prizesMap = loadPrizes27Map();
    const cachedAdv = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'cached_daily_method_advisor.json'), 'utf8'));
    const reg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'daily_locked_bets_registry.json'), 'utf8'));

    // 1. TẬP A: 46 KỲ LIVE (REGISTRY)
    const liveRecords = [];
    const regDates = Object.keys(reg.dates || {}).sort();

    regDates.forEach(d => {
        const entry = reg.dates[d];
        const p27 = prizesMap[d] || (entry.settlement?.prizes27 ? entry.settlement.prizes27.map(x => String(x).padStart(2, '0')) : null);
        if (!p27 || p27.length !== 27) return;

        // Daily Top 8
        const dailyTop8 = entry.bets?.top8ParityXien4?.top8 || null;
        // Daily Top 20 -> trích xuất Top 5..12
        const dailyTop20 = entry.bets?.lo4EngineFusion?.betNumbers || entry.bets?.lo4EngineFusion?.distinctNumbers || null;
        let dailyTop5to12 = null;
        if (dailyTop20 && dailyTop20.length >= 12) {
            dailyTop5to12 = dailyTop20.slice(4, 12);
        } else if (cachedAdv.metaCrossMethod?.settledLedger) {
            const mRow = cachedAdv.metaCrossMethod.settledLedger.find(r => r.date === d);
            if (mRow?.methods?.top20?.betNumbers?.length >= 12) {
                dailyTop5to12 = mRow.methods.top20.betNumbers.slice(4, 12);
            }
        }

        // Shadow Lô
        const shadowLoNums = entry.bets?.pentaConsensus?.lo?.numbers || null;
        let shadowTop8 = null;
        let shadowTop5to12 = null;
        if (shadowLoNums && shadowLoNums.length >= 8) {
            shadowTop8 = shadowLoNums.slice(0, 8);
        }
        if (shadowLoNums && shadowLoNums.length >= 12) {
            shadowTop5to12 = shadowLoNums.slice(4, 12);
        } else if (cachedAdv) {
            const penta = computePentaConsensusForDate(d, cachedAdv);
            if (penta?.lo?.numbers?.length >= 12) {
                shadowTop5to12 = penta.lo.numbers.slice(4, 12);
                if (!shadowTop8) shadowTop8 = penta.lo.numbers.slice(0, 8);
            }
        }

        if (dailyTop8 && shadowTop8 && shadowTop5to12) {
            liveRecords.push({
                date: d,
                p27,
                dailyTop8,
                dailyTop5to12: dailyTop5to12 || dailyTop8,
                shadowTop8,
                shadowTop5to12
            });
        }
    });

    console.log(`\n[TẬP 1: 46 KỲ LIVE REGISTRY] Số kỳ đầy đủ cả 2 cửa sổ: ${liveRecords.length} kỳ`);
    const liveResults = runStrategyEvaluation('LIVE', liveRecords);
    console.table(
        Object.values(liveResults).map(r => ({
            'Biến Thể': r.name,
            'Số Kỳ': r.days,
            'Vốn (M)': r.stakeM,
            'Thưởng (M)': r.payoutM,
            'Lãi Ròng (M)': r.profitM,
            'ROI (%)': r.roi + '%',
            'Ngày Thắng': `${r.winDays}/${r.days} (${r.winRate}%)`,
            'Nổ X4': r.h4,
            'Nổ X3': r.h3,
            'Nổ X2': r.h2
        }))
    );

    // 2. TẬP B: TOÀN BỘ 2026 (298 KỲ QUAY)
    const all2026Records = [];
    const metaLedger = cachedAdv.metaCrossMethod?.settledLedger || [];

    metaLedger.forEach(mRow => {
        const d = mRow.date;
        const p27 = prizesMap[d] || mRow.actual27;
        if (!p27 || p27.length !== 27) return;

        const dTop20 = mRow.methods?.top20?.betNumbers || [];
        const dailyTop8 = mRow.methods?.top8?.betNumbers || dTop20.slice(0, 8);
        const dailyTop5to12 = dTop20.length >= 12 ? dTop20.slice(4, 12) : dailyTop8;

        // Shadow computation
        const penta = computePentaConsensusForDate(d, cachedAdv);
        const shadowLo = penta?.lo?.numbers || [];
        if (shadowLo.length < 12 || dailyTop8.length < 8) return;

        const shadowTop8 = shadowLo.slice(0, 8);
        const shadowTop5to12 = shadowLo.slice(4, 12);

        all2026Records.push({
            date: d,
            p27,
            dailyTop8,
            dailyTop5to12,
            shadowTop8,
            shadowTop5to12
        });
    });

    console.log(`\n[TẬP 2: TOÀN BỘ NĂM 2026] Số kỳ hợp lệ: ${all2026Records.length} kỳ`);
    const yearResults = runStrategyEvaluation('2026', all2026Records);
    console.table(
        Object.values(yearResults).map(r => ({
            'Biến Thể': r.name,
            'Số Kỳ': r.days,
            'Vốn (M)': r.stakeM,
            'Thưởng (M)': r.payoutM,
            'Lãi Ròng (M)': r.profitM,
            'ROI (%)': r.roi + '%',
            'Ngày Thắng': `${r.winDays}/${r.days} (${r.winRate}%)`,
            'Nổ X4': r.h4,
            'Nổ X3': r.h3,
            'Nổ X2': r.h2
        }))
    );

    // Bóc tách chi tiết 4 dàn của từng chiến lược trong năm 2026
    console.log('\n--- BÓC TÁCH HIỆU SUẤT TỪNG DÀN (1A, 1B, 2A, 2B) TRONG NĂM 2026 ---');
    Object.values(yearResults).forEach(r => {
        console.log(`\n>>> ${r.name}:`);
        console.table(r.danStats);
    });

    // Lưu kết quả JSON để tham chiếu
    fs.writeFileSync(
        path.join(process.cwd(), 'data', 'xien_ranking_windows_backtest.json'),
        JSON.stringify({ live: liveResults, year2026: yearResults }, null, 2)
    );
}

main();
