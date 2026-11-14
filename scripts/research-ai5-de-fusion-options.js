'use strict';

/**
 * scripts/research-ai5-de-fusion-options.js
 * 
 * Nghiên cứu chi tiết các phương án tối ưu hóa dàn Đề Đồng Thuận 5 AI 50s trong Đề Fusion (2026)
 */

const deFusionService = require('../lib/services/deFusionService');
const { getParityForm, numStr } = deFusionService;

const MULTIPLIER = 84;
const UNIT_X2_K = 2000; // 2M
const UNIT_X1_K = 1000; // 1M
const PAYOUT_X2_K = UNIT_X2_K * MULTIPLIER; // 168M
const PAYOUT_X1_K = UNIT_X1_K * MULTIPLIER; // 84M

async function main() {
    const rep = await deFusionService.getDeFusionReport({ forceRefresh: true });
    const ledger = (rep.settledLedger || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    console.log(`=== BẮT ĐẦU PHÂN TÍCH TRÊN ${ledger.length} KỲ ĐỐI SOÁT NĂM 2026 (${ledger[0].date} -> ${ledger[ledger.length - 1].date}) ===\n`);

    // Dữ liệu chuẩn bị cho từng ngày
    const daysData = [];

    for (const r of ledger) {
        const s = r.strategies?.ai5Ensemble;
        if (!s) continue;
        const actualStr = numStr(r.actualSpecial);
        const actualForm = r.actualForm || getParityForm(actualStr);
        const predForm = r.parityPrediction?.predForm;
        const oppForm = r.parityPrediction?.oppForm;
        const isElimLoss = s.isEliminatedLoss; // Thực tế rơi vào oppForm

        const origTop = s.origTop || [];
        const origBot = s.origBot || [];
        const origNumbers = s.origNumbers || [...origTop, ...origBot];

        const filteredTop = s.filteredTop || [];
        const filteredBot = s.filteredBot || [];
        const filteredNumbers = s.filteredNumbers || [...filteredTop, ...filteredBot];

        // 3 dạng hợp lệ sau khi loại oppForm
        const remainingForms = ['LL', 'CC', 'CL', 'LC'].filter(f => f !== oppForm);

        daysData.push({
            date: r.date,
            month: r.date.slice(0, 7),
            actualStr,
            actualForm,
            predForm,
            oppForm,
            isElimLoss,
            origTop,
            origBot,
            origNumbers,
            filteredTop,
            filteredBot,
            filteredNumbers,
            remainingForms
        });
    }

    // =========================================================================
    // HÀM TÍNH TOÁN KẾT QUẢ CHO 1 CẤU HÌNH (X2, X1)
    // =========================================================================
    function evalConfig(x2Nums, x1Nums, actualStr) {
        const stakeK = x2Nums.length * UNIT_X2_K + x1Nums.length * UNIT_X1_K;
        const isHitX2 = x2Nums.includes(actualStr);
        const isHitX1 = !isHitX2 && x1Nums.includes(actualStr);
        const isHit = isHitX2 || isHitX1;
        const payoutK = isHitX2 ? PAYOUT_X2_K : (isHitX1 ? PAYOUT_X1_K : 0);
        const profitK = payoutK - stakeK;
        return {
            x2Count: x2Nums.length,
            x1Count: x1Nums.length,
            totalCount: x2Nums.length + x1Nums.length,
            stakeK,
            isHit,
            isHitX2,
            isHitX1,
            payoutK,
            profitK
        };
    }

    // =========================================================================
    // ĐỊNH NGHĨA CÁC PHƯƠNG ÁN X2
    // =========================================================================

    // PA1: Lấy 12 con đầu tiên của filteredTop, số còn lại đẩy xuống đầu filteredBot
    function buildPA1(d) {
        const x2 = d.filteredTop.slice(0, 12);
        const demoted = d.filteredTop.slice(12);
        const x1 = [...demoted, ...d.filteredBot];
        return { x2, x1 };
    }

    // PA2-A: Mỗi dạng lấy 4 con từ filteredTop, nếu thiếu lấy tiếp từ filteredBot cùng dạng
    function buildPA2A(d) {
        const x2 = [];
        const selectedSet = new Set();

        d.remainingForms.forEach(f => {
            let count = 0;
            // 1. Quét filteredTop
            for (const n of d.filteredTop) {
                if (getParityForm(n) === f && count < 4 && !selectedSet.has(n)) {
                    x2.push(n);
                    selectedSet.add(n);
                    count++;
                }
            }
            // 2. Nếu chưa đủ 4, quét filteredBot
            if (count < 4) {
                for (const n of d.filteredBot) {
                    if (getParityForm(n) === f && count < 4 && !selectedSet.has(n)) {
                        x2.push(n);
                        selectedSet.add(n);
                        count++;
                    }
                }
            }
        });

        // Những con còn lại trong filteredTop chưa vào X2 đẩy xuống đầu X1
        const demoted = d.filteredTop.filter(n => !selectedSet.has(n));
        const remBot = d.filteredBot.filter(n => !selectedSet.has(n));
        const x1 = [...demoted, ...remBot];

        return { x2, x1 };
    }

    // PA2-B: Mỗi dạng lấy tối đa 4 con từ filteredTop, nếu thiếu lấy tiếp số cao nhất trong filteredTop để đủ 12
    function buildPA2B(d) {
        const x2 = [];
        const selectedSet = new Set();
        d.remainingForms.forEach(f => {
            let count = 0;
            for (const n of d.filteredTop) {
                if (getParityForm(n) === f && count < 4 && !selectedSet.has(n)) {
                    x2.push(n);
                    selectedSet.add(n);
                    count++;
                }
            }
        });
        // Nếu chưa đủ 12 con, lấy các số cao nhất còn lại trong filteredTop
        if (x2.length < 12) {
            for (const n of d.filteredTop) {
                if (!selectedSet.has(n) && x2.length < 12) {
                    x2.push(n);
                    selectedSet.add(n);
                }
            }
        }
        const demoted = d.filteredTop.filter(n => !selectedSet.has(n));
        const x1 = [...demoted, ...d.filteredBot];
        return { x2, x1 };
    }

    // Baseline: Gốc (Không lọc)
    function buildBaseOrig(d) {
        return { x2: d.origTop, x1: d.origBot };
    }

    // Baseline: Sau lọc Anti-Parity hiện tại (filteredTop làm X2, filteredBot làm X1)
    function buildBaseFiltered(d) {
        return { x2: d.filteredTop, x1: d.filteredBot };
    }

    // =========================================================================
    // I. KHẢO SÁT PHƯƠNG ÁN 3: 2 CON CUỐI CÙNG CỦA DÀN X1 TRÚNG BAO NHIÊU LẦN?
    // =========================================================================
    console.log('----------------------------------------------------------------------------------------');
    console.log('📌 PHƯƠNG ÁN 3: THỐNG KÊ 2 CON Ở VỊ TRÍ CUỐI CÙNG CỦA DÀN X1');
    console.log('----------------------------------------------------------------------------------------');
    let pa3HitsOrig = 0;
    let pa3HitsFiltered = 0;
    let pa3HitsPA1 = 0;
    const pa3HitDates = [];

    daysData.forEach(d => {
        // 2 con cuối dàn X1 nguyên bản (origBot)
        const last2Orig = d.origBot.slice(-2);
        if (last2Orig.includes(d.actualStr)) pa3HitsOrig++;

        // 2 con cuối dàn X1 sau lọc (filteredBot)
        const last2Filtered = d.filteredBot.slice(-2);
        const isHitF = last2Filtered.includes(d.actualStr);
        if (isHitF) {
            pa3HitsFiltered++;
            pa3HitDates.push({ date: d.date, actualStr: d.actualStr, last2: last2Filtered });
        }

        // 2 con cuối dàn X1 theo PA1
        const pa1 = buildPA1(d);
        if (pa1.x1.slice(-2).includes(d.actualStr)) pa3HitsPA1++;
    });

    console.log(`- Trên dàn X1 sau lọc Anti-Parity (filteredBot, ~18s): 2 con cuối trúng: ${pa3HitsFiltered} / ${daysData.length} kỳ (${(pa3HitsFiltered/daysData.length*100).toFixed(2)}%)`);
    console.log(`- Trên dàn X1 theo Phương án 1 (newX1, ~25s): 2 con cuối trúng: ${pa3HitsPA1} / ${daysData.length} kỳ (${(pa3HitsPA1/daysData.length*100).toFixed(2)}%)`);
    console.log(`- Trên dàn X1 gốc (origBot, 25s): 2 con cuối trúng: ${pa3HitsOrig} / ${daysData.length} kỳ (${(pa3HitsOrig/daysData.length*100).toFixed(2)}%)`);
    console.log(`- Các ngày 2 con cuối trúng:`, pa3HitDates);

    // =========================================================================
    // II. KHẢO SÁT PHƯƠNG ÁN 4: CỐ ĐỊNH 35 CON (CHỈ LẤY 35 CON ĐẦU TIÊN)
    // =========================================================================
    console.log('\n----------------------------------------------------------------------------------------');
    console.log('📌 PHƯƠNG ÁN 4: CỐ ĐỊNH 35 CON ĐẦU TIÊN - CÁC CON BỊ LOẠI (VỊ TRÍ > 35) TRÚNG BAO NHIÊU LẦN?');
    console.log('----------------------------------------------------------------------------------------');
    let cutHitsCurrent = 0;
    let cutHitsPA1 = 0;
    let cutHitsPA2A = 0;
    let daysOver35Current = 0;
    let daysOver35PA1 = 0;
    const cutHitDatesPA1 = [];

    daysData.forEach(d => {
        // Dàn hiện tại: [...filteredTop, ...filteredBot]
        const allCur = d.filteredNumbers;
        if (allCur.length > 35) {
            daysOver35Current++;
            const tailCur = allCur.slice(35);
            if (tailCur.includes(d.actualStr)) cutHitsCurrent++;
        }

        // PA1: [...pa1.x2, ...pa1.x1]
        const pa1 = buildPA1(d);
        const allPA1 = [...pa1.x2, ...pa1.x1];
        if (allPA1.length > 35) {
            daysOver35PA1++;
            const tailPA1 = allPA1.slice(35);
            if (tailPA1.includes(d.actualStr)) {
                cutHitsPA1++;
                cutHitDatesPA1.push({ date: d.date, actualStr: d.actualStr, tailCount: tailPA1.length, tail: tailPA1 });
            }
        }

        // PA2A
        const pa2a = buildPA2A(d);
        const allPA2A = [...pa2a.x2, ...pa2a.x1];
        if (allPA2A.length > 35) {
            const tailPA2A = allPA2A.slice(35);
            if (tailPA2A.includes(d.actualStr)) cutHitsPA2A++;
        }
    });

    console.log(`- Số ngày dàn sau lọc có quy mô > 35 con: ${daysOver35Current} / ${daysData.length} kỳ (${(daysOver35Current/daysData.length*100).toFixed(1)}%)`);
    console.log(`- Dàn Hiện Tại: Phần đuôi bị cắt (>35 con) trúng: ${cutHitsCurrent} lần`);
    console.log(`- PA1 (12 X2 đầu): Phần đuôi bị cắt (>35 con) trúng: ${cutHitsPA1} lần (${cutHitsPA1 === 0 ? 'TUYỆT VỜI - KHÔNG MẤT TRÚNG' : 'Mất trúng ' + cutHitsPA1 + ' lần'})`);
    console.log(`- PA2A (12 X2 cân đối): Phần đuôi bị cắt (>35 con) trúng: ${cutHitsPA2A} lần`);
    console.log(`- Chi tiết các ngày bị mất trúng nếu cắt cố định 35 con (PA1):`, cutHitDatesPA1);

    // =========================================================================
    // III. KHẢO SÁT PHƯƠNG ÁN 5: THỐNG KÊ ĐƯỢC / THUA THEO TỪNG THÁNG NĂM 2026
    // =========================================================================
    console.log('\n----------------------------------------------------------------------------------------');
    console.log('📌 PHƯƠNG ÁN 5: THỐNG KÊ ĐƯỢC / THUA THEO TỪNG THÁNG NĂM 2026 (PHÂN TÍCH NGUYÊN NHÂN)');
    console.log('----------------------------------------------------------------------------------------');

    const months = [...new Set(daysData.map(d => d.month))].sort();

    function analyzeMonths(buildFn, name) {
        console.log(`\n--- Phân Tích Hàng Tháng: ${name} ---`);
        console.log('Tháng   | Số kỳ | Thắng (Tỷ lệ %) | Trúng X2 | Trúng X1 | Bị OppForm (Loại) | Trượt Dàn | Vốn (M) | Ăn (M)  | Lãi Ròng (M) | ROI (%)');
        console.log('--------|-------|-----------------|----------|----------|-------------------|-----------|---------|---------|--------------|--------');

        months.forEach(m => {
            const mDays = daysData.filter(d => d.month === m);
            let wins = 0, x2W = 0, x1W = 0, elimLoss = 0, missRank = 0;
            let stake = 0, payout = 0;

            mDays.forEach(d => {
                const conf = buildFn(d);
                const ev = evalConfig(conf.x2, conf.x1, d.actualStr);
                stake += ev.stakeK;
                payout += ev.payoutK;
                if (ev.isHit) {
                    wins++;
                    if (ev.isHitX2) x2W++;
                    if (ev.isHitX1) x1W++;
                } else {
                    if (d.isElimLoss) elimLoss++;
                    else missRank++;
                }
            });

            const profit = payout - stake;
            const roi = stake > 0 ? (profit / stake * 100).toFixed(1) : '0';
            const winRate = (wins / mDays.length * 100).toFixed(1);

            console.log(
                m + ' | ' +
                String(mDays.length).padStart(5) + ' | ' +
                (String(wins).padStart(2) + ' (' + winRate.padStart(5) + '%)').padEnd(15) + ' | ' +
                String(x2W).padStart(8) + ' | ' +
                String(x1W).padStart(8) + ' | ' +
                String(elimLoss).padStart(17) + ' | ' +
                String(missRank).padStart(9) + ' | ' +
                (stake / 1000).toFixed(0).padStart(7) + ' | ' +
                (payout / 1000).toFixed(0).padStart(7) + ' | ' +
                ((profit >= 0 ? '+' : '') + (profit / 1000).toFixed(0) + 'M').padStart(12) + ' | ' +
                (roi + '%').padStart(7)
            );
        });
    }

    analyzeMonths(buildBaseFiltered, 'Dàn Sau Lọc Chẵn/Lẻ Hiện Tại (18-19s X2 + 18-19s X1)');
    analyzeMonths(buildPA1, 'Phương Án 1 (12s X2 Đầu + Còn Lại X1)');
    analyzeMonths(buildPA2A, 'Phương Án 2A (12s X2 Mỗi Dạng 4 Con + Còn Lại X1)');

    // =========================================================================
    // IV. PHẦN 2: THỐNG KÊ TOÀN DIỆN MA TRẬN TỔ HỢP SO SÁNH CÁC PHƯƠNG PHÁP
    // =========================================================================
    console.log('\n========================================================================================');
    console.log('📌 PHẦN 2: THỐNG KÊ MA TRẬN TỔ HỢP SO SÁNH CÁC PHƯƠNG ÁN (TOÀN BỘ 2026)');
    console.log('========================================================================================');

    const strategiesToCompare = [
        {
            id: 'ORIG',
            name: '0. Gốc Nguyên Bản (50s: 25 X2 + 25 X1, không lọc)',
            fn: (d) => buildBaseOrig(d)
        },
        {
            id: 'FILTERED_BASE',
            name: '1. Hiện Tại Sau Lọc Anti-Parity (~37s: filteredTop X2 + filteredBot X1)',
            fn: (d) => buildBaseFiltered(d)
        },

        // NHÓM PA1 (12 con đầu làm X2)
        {
            id: 'PA1_FULL',
            name: '2. PA1: 12 X2 Đầu + Giữ Toàn Bộ X1 (~37s: 12 X2 + ~25 X1)',
            fn: (d) => buildPA1(d)
        },
        {
            id: 'PA1_CUT35',
            name: '3. PA1 + Cố Định 35 Con (12 X2 + 23 X1 đầu tiên)',
            fn: (d) => {
                const c = buildPA1(d);
                const all = [...c.x2, ...c.x1].slice(0, 35);
                const x2 = all.slice(0, 12);
                const x1 = all.slice(12);
                return { x2, x1 };
            }
        },
        {
            id: 'PA1_DROP2',
            name: '4. PA1 + Bỏ 2 Con Cuối Dàn X1 (12 X2 + ~23 X1)',
            fn: (d) => {
                const c = buildPA1(d);
                return { x2: c.x2, x1: c.x1.slice(0, -2) };
            }
        },
        {
            id: 'PA1_DROP4',
            name: '5. PA1 + Bỏ 4 Con Cuối Dàn X1 (12 X2 + ~21 X1)',
            fn: (d) => {
                const c = buildPA1(d);
                return { x2: c.x2, x1: c.x1.slice(0, -4) };
            }
        },

        // NHÓM PA2-A (Mỗi dạng 4 con làm X2, bổ sung bot nếu thiếu)
        {
            id: 'PA2A_FULL',
            name: '6. PA2-A: Mỗi Dạng 4 Con X2 + Giữ Toàn Bộ X1 (12 X2 + ~25 X1)',
            fn: (d) => buildPA2A(d)
        },
        {
            id: 'PA2A_CUT35',
            name: '7. PA2-A + Cố Định 35 Con (12 X2 + 23 X1 đầu tiên)',
            fn: (d) => {
                const c = buildPA2A(d);
                const all = [...c.x2, ...c.x1].slice(0, 35);
                const x2 = all.slice(0, 12);
                const x1 = all.slice(12);
                return { x2, x1 };
            }
        },
        {
            id: 'PA2A_DROP2',
            name: '8. PA2-A + Bỏ 2 Con Cuối Dàn X1 (12 X2 + ~23 X1)',
            fn: (d) => {
                const c = buildPA2A(d);
                return { x2: c.x2, x1: c.x1.slice(0, -2) };
            }
        },
        {
            id: 'PA2A_DROP4',
            name: '9. PA2-A + Bỏ 4 Con Cuối Dàn X1 (12 X2 + ~21 X1)',
            fn: (d) => {
                const c = buildPA2A(d);
                return { x2: c.x2, x1: c.x1.slice(0, -4) };
            }
        },

        // NHÓM PA2-B (Mỗi dạng max 4 con chỉ trong filteredTop, bù top nếu thiếu)
        {
            id: 'PA2B_FULL',
            name: '10. PA2-B: Mỗi Dạng Max 4 trong Top + Toàn Bộ X1 (12 X2 + ~25 X1)',
            fn: (d) => buildPA2B(d)
        },
        {
            id: 'PA2B_CUT35',
            name: '11. PA2-B + Cố Định 35 Con (12 X2 + 23 X1)',
            fn: (d) => {
                const c = buildPA2B(d);
                const all = [...c.x2, ...c.x1].slice(0, 35);
                return { x2: all.slice(0, 12), x1: all.slice(12) };
            }
        },
        {
            id: 'PA2B_DROP2',
            name: '12. PA2-B + Bỏ 2 Con Cuối Dàn X1',
            fn: (d) => {
                const c = buildPA2B(d);
                return { x2: c.x2, x1: c.x1.slice(0, -2) };
            }
        },
        {
            id: 'PA2B_DROP4',
            name: '13. PA2-B + Bỏ 4 Con Cuối Dàn X1',
            fn: (d) => {
                const c = buildPA2B(d);
                return { x2: c.x2, x1: c.x1.slice(0, -4) };
            }
        }
    ];

    const resultsSummary = [];

    // Lấy chuẩn so sánh (Gốc)
    let origTotalStakeK = 0;
    daysData.forEach(d => {
        const ev = evalConfig(d.origTop, d.origBot, d.actualStr);
        origTotalStakeK += ev.stakeK;
    });

    strategiesToCompare.forEach(strat => {
        let wins = 0, x2W = 0, x1W = 0;
        let sumX2 = 0, sumX1 = 0;
        let totalStakeK = 0, totalPayoutK = 0;
        let elimLosses = 0; // Trượt do loại trừ oppForm

        daysData.forEach(d => {
            const conf = strat.fn(d);
            const ev = evalConfig(conf.x2, conf.x1, d.actualStr);
            sumX2 += ev.x2Count;
            sumX1 += ev.x1Count;
            totalStakeK += ev.stakeK;
            totalPayoutK += ev.payoutK;
            if (ev.isHit) {
                wins++;
                if (ev.isHitX2) x2W++;
                if (ev.isHitX1) x1W++;
            } else {
                if (d.isElimLoss) elimLosses++;
            }
        });

        const profitK = totalPayoutK - totalStakeK;
        const roi = totalStakeK > 0 ? ((profitK / totalStakeK) * 100).toFixed(2) : '0';
        const winRate = ((wins / daysData.length) * 100).toFixed(2);
        const avgX2 = (sumX2 / daysData.length).toFixed(1);
        const avgX1 = (sumX1 / daysData.length).toFixed(1);
        const avgTotal = ((sumX2 + sumX1) / daysData.length).toFixed(1);
        const savedStakeK = origTotalStakeK - totalStakeK;
        const savedPct = ((savedStakeK / origTotalStakeK) * 100).toFixed(1);

        resultsSummary.push({
            id: strat.id,
            name: strat.name,
            avgTotal,
            avgX2,
            avgX1,
            wins,
            winRate,
            x2W,
            x1W,
            elimLosses,
            stakeM: (totalStakeK / 1000).toFixed(1),
            payoutM: (totalPayoutK / 1000).toFixed(1),
            profitM: (profitK / 1000).toFixed(1),
            profitRaw: profitK,
            roi,
            savedStakeM: (savedStakeK / 1000).toFixed(1),
            savedPct
        });
    });

    console.log('\nBẢNG TỔNG HỢP SO SÁNH MA TRẬN TỔ HỢP CÁC PHƯƠNG PHÁP:');
    console.log('-------------------------------------------------------------------------------------------------------------------------------------------------------------');
    console.log(
        'Phương Pháp'.padEnd(55) + ' | ' +
        'Quy Mô TB'.padEnd(18) + ' | ' +
        'Trúng (Tỷ lệ %)'.padEnd(16) + ' | ' +
        'X2 / X1'.padEnd(10) + ' | ' +
        'Vốn (M)'.padEnd(10) + ' | ' +
        'Lãi Ròng (M)'.padEnd(14) + ' | ' +
        'ROI (%)'.padEnd(9) + ' | ' +
        'Tiết Kiệm Vốn (M)'.padEnd(18) + ' | ' +
        'Trượt Opp'
    );
    console.log('-------------------------------------------------------------------------------------------------------------------------------------------------------------');

    resultsSummary.forEach(r => {
        console.log(
            r.name.padEnd(55) + ' | ' +
            (r.avgTotal + 's (' + r.avgX2 + ' + ' + r.avgX1 + ')').padEnd(18) + ' | ' +
            (r.wins + ' (' + r.winRate + '%)').padEnd(16) + ' | ' +
            (r.x2W + ' / ' + r.x1W).padEnd(10) + ' | ' +
            r.stakeM.padStart(8) + 'M | ' +
            ((r.profitRaw >= 0 ? '+' : '') + r.profitM + 'M').padStart(12) + ' | ' +
            (r.roi + '%').padStart(8) + ' | ' +
            (r.savedStakeM + 'M (' + r.savedPct + '%)').padEnd(18) + ' | ' +
            String(r.elimLosses).padStart(5)
        );
    });

    console.log('-------------------------------------------------------------------------------------------------------------------------------------------------------------');
}

main().catch(err => {
    console.error('Error running research:', err);
});
