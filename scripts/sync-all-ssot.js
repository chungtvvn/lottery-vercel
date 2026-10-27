'use strict';

/**
 * scripts/sync-all-ssot.js
 * ==============================================================================
 * CLEAN UNIFIED SSOT SYNCHRONIZER
 * ==============================================================================
 * Chuyển hoá toàn bộ việc lưu trữ tính toán cũ:
 * 1. daily_locked_bets_registry.json là SINGLE SOURCE OF TRUTH (SSOT) duy nhất.
 * 2. Mọi bảng đối soát (Cross-Hedging, Lô 4 Động Cơ, Đề Tinh Tuyển, Lô Xiên)
 *    đều được đồng bộ 100% từ registry.
 * 3. Bất biến tuyệt đối: Bets không bao giờ bị tính lại sau khi đã chốt.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const STATS_DIR = path.join(ROOT_DIR, 'lib', 'data', 'statistics');
const DATA_DIR = path.join(ROOT_DIR, 'data');

const REG_STATS_FILE = path.join(STATS_DIR, 'daily_locked_bets_registry.json');
const REG_DATA_FILE = path.join(DATA_DIR, 'daily_locked_bets_registry.json');
const ADV_STATS_FILE = path.join(STATS_DIR, 'cached_daily_method_advisor.json');
// CANONICAL CACHE (2026-10-27 consolidation): no data/ duplicate of the advisor cache.
const RAW_FILE = path.join(ROOT_DIR, 'lib', 'data', 'xsmb-2-digits.json');

const numStr = n => String(Number(n)).padStart(2, '0');
const normalizeDate = d => String(d || '').slice(0, 10);

function syncAll() {
    console.log('='.repeat(80));
    console.log('🚀 UNIFIED SSOT SYNCHRONIZATION RUNNING...');
    console.log('='.repeat(80));

    // 1. Tải registry (gộp thông minh cả data/ và lib/data/statistics/)
    let reg1 = null, reg2 = null;
    try { if (fs.existsSync(REG_DATA_FILE)) reg1 = JSON.parse(fs.readFileSync(REG_DATA_FILE, 'utf8')); } catch (_) {}
    try { if (fs.existsSync(REG_STATS_FILE)) reg2 = JSON.parse(fs.readFileSync(REG_STATS_FILE, 'utf8')); } catch (_) {}
    let reg = reg1 || reg2;
    if (reg1?.dates && reg2?.dates) {
        const merged = { ...reg2.dates, ...reg1.dates };
        for (const [d, v] of Object.entries(reg2.dates)) {
            if (merged[d]) {
                merged[d] = {
                    ...v,
                    ...merged[d],
                    isSettled: Boolean(merged[d].isSettled || v.isSettled),
                    bets: { ...(v.bets || {}), ...(merged[d].bets || {}) },
                    settlement: { ...(v.settlement || {}), ...(merged[d].settlement || {}) }
                };
            }
        }
        reg = { ...(reg1 || reg2), dates: merged };
    }
    if (!reg || !reg.dates) {
        throw new Error('daily_locked_bets_registry.json không tồn tại hoặc bị lỗi!');
    }

    // 2. Tải raw data
    const raw = JSON.parse(fs.readFileSync(RAW_FILE, 'utf8'));
    const rawMap = new Map();
    raw.forEach(r => {
        const d = normalizeDate(r.date || r.ngay);
        if (d) rawMap.set(d, r);
    });

    const { settleDateDirectly } = require('../lib/services/dailyLockedBetsRegistryService');

    // 3. Tự động đối soát mọi ngày chưa kết toán nếu đã có kết quả mở thưởng
    let newlySettled = 0;
    const sortedDates = Object.keys(reg.dates).sort();
    sortedDates.forEach(d => {
        const entry = reg.dates[d];
        if (!entry.isSettled && rawMap.has(d)) {
            console.log(`[Settlement] Đối soát ngày ${d}...`);
            const s = settleDateDirectly(d, rawMap.get(d));
            if (s && s.isSettled) {
                newlySettled++;
                console.log(`  ✓ Đã kết toán ${d}: Đề PnL = ${s.settlement?.de?.profitK}K, Cross-Hedging PnL = ${s.settlement?.crossHedgingPortfolio?.totalProfitK}K`);
            }
        }
    });

    // Lưu lại registry đồng nhất
    reg.updatedAt = new Date().toISOString();
    const regStr = JSON.stringify(reg, null, 2);
    fs.writeFileSync(REG_STATS_FILE, regStr, 'utf8');
    fs.writeFileSync(REG_DATA_FILE, regStr, 'utf8');
    console.log(`[Registry] Đã lưu ${sortedDates.length} ngày vào cả data/ và lib/data/statistics/ (mới kết toán: ${newlySettled} ngày).`);

    // 4. Đồng bộ vào cached_daily_method_advisor.json
    let adv = null;
    if (fs.existsSync(ADV_STATS_FILE)) {
        adv = JSON.parse(fs.readFileSync(ADV_STATS_FILE, 'utf8'));
    }
    if (!adv) {
        console.warn('cached_daily_method_advisor.json chưa có, tạo cấu trúc cơ bản...');
        adv = { version: '1.0.0', records: [] };
    }

    adv.dailyLockedBetsRegistry = reg;

    // Xác định pending target date (ngày tiếp theo)
    const latestDate = sortedDates[sortedDates.length - 1];
    const latestEntry = reg.dates[latestDate];
    const pendingDate = latestEntry.isSettled ? null : latestDate;
    if (pendingDate) {
        adv.pendingPredictionDate = pendingDate;
    }

    // Xây dựng danh sách drawPrizesByDate
    const drawPrizesByDate = adv.drawPrizesByDate || {};
    raw.slice(-365).forEach(r => {
        const d = normalizeDate(r.date || r.ngay);
        if (!d) return;
        const prizeKeys = [
            'special', 'prize1',
            'prize2_1', 'prize2_2',
            'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
            'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
            'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
            'prize6_1', 'prize6_2', 'prize6_3',
            'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
        ];
        const prizes = [];
        prizeKeys.forEach(k => {
            if (r[k] != null && r[k] !== '') prizes.push(numStr(r[k]));
        });
        drawPrizesByDate[d] = {
            special: r.special != null ? numStr(r.special) : null,
            prizes
        };
    });
    sortedDates.forEach(d => {
        const e = reg.dates[d];
        if (e.isSettled && e.actualResult) {
            drawPrizesByDate[d] = {
                special: e.actualResult.special != null ? numStr(e.actualResult.special) : null,
                prizes: (e.actualResult.prizes || []).map(numStr)
            };
        }
    });
    adv.drawPrizesByDate = drawPrizesByDate;

    // 5. TÁI TẠO TẤT CẢ CÁC LEDGER TỪ SSOT REGISTRY
    const chLedger = [];
    const lo7Ledger = [];
    const lo6Ledger = [];
    const loTop5Ledger = [];
    const dmLedger = [];
    const adLedger = [];
    const tmLedger = [];
    const metaLedger = [];
    const deDropoffLedger = [];
    const loDropoffLedger = [];
    const triCoreLedger = [];
    const pentaLedger = [];
    const top8ParityLedger = [];

    let cumDe = 0, cumLo = 0, cumXien = 0, cumTot = 0;
    let cumLo7 = 0, cumLo6 = 0;
    let cumPenta = 0, cumTop8Parity = 0;

    sortedDates.forEach(d => {
        const entry = reg.dates[d];
        if (!entry.isSettled || !entry.settlement) return;
        const s = entry.settlement;
        const b = entry.bets || {};

        // Cross-Hedging Portfolio
        if (s.crossHedgingPortfolio || (s.de && s.lo4EngineFusion)) {
            const deProf = s.de?.profitK != null ? s.de.profitK : (s.crossHedgingPortfolio?.deProfitK ?? 0);
            const loProf = s.lo4EngineFusion?.lotoProfitK != null ? s.lo4EngineFusion.lotoProfitK : (s.crossHedgingPortfolio?.loProfitK ?? 0);
            const xienProf = s.lo4EngineFusion?.xienProfitK != null ? s.lo4EngineFusion.xienProfitK : (s.crossHedgingPortfolio?.xienProfitK ?? 0);
            const totProf = deProf + loProf + xienProf;
            const deStk = s.de?.stakeK || 70000;
            const loStk = s.lo4EngineFusion?.lotoStakeK || 66000;
            const xienStk = s.lo4EngineFusion?.xienStakeK || 11000;
            const totStk = deStk + loStk + xienStk;
            const dePay = s.de?.payoutK != null ? s.de.payoutK : (deProf + deStk);
            const loPay = s.lo4EngineFusion?.lotoPayoutK != null ? s.lo4EngineFusion.lotoPayoutK : (loProf + loStk);
            const xienPay = s.lo4EngineFusion?.xienPayoutK != null ? s.lo4EngineFusion.xienPayoutK : (xienProf + xienStk);
            const totPay = dePay + loPay + xienPay;

            cumDe += deProf;
            cumLo += loProf;
            cumXien += xienProf;
            cumTot += totProf;

            chLedger.push({
                ...(s.crossHedgingPortfolio || {}),
                date: d,
                predictionDate: d,
                special: s.de?.actualSpecial || entry.actualResult?.special,
                deHits: s.de?.isHit ? 1 : 0,
                isDeHit: Boolean(s.de?.isHit),
                isVipHit: Boolean(s.de?.isVipHit),
                dePayoutK: dePay,
                deStakeK: deStk,
                deProfitK: deProf,
                dePnlK: deProf,
                loHits: s.lo4EngineFusion?.totalHits || 0,
                loPayoutK: loPay,
                loStakeK: loStk,
                loProfitK: loProf,
                loPnlK: loProf,
                uniqueTop4Hits: s.lo4EngineFusion?.xienHitsCount || 0,
                xienPayoutK: xienPay,
                xienStakeK: xienStk,
                xienProfitK: xienProf,
                xienPnlK: xienProf,
                totalPayoutK: totPay,
                totalStakeK: totStk,
                totalProfitK: totProf,
                isWin: totProf > 0,
                cumDeProfitK: cumDe,
                cumLoProfitK: cumLo,
                cumXienProfitK: cumXien,
                cumulativeProfitK: cumTot
            });
        }

        // Lô 4 Động Cơ Top 7 & Top 6
        if (s.lo4EngineFusion) {
            const loS = s.lo4EngineFusion;
            cumLo7 += (loS.lotoProfitK || 0);
            cumLo6 += (loS.lotoProfitK || 0);

            const loRow = {
                date: d,
                predictionDate: d,
                isLive: true,
                h4: loS.xienHitsCount || 0,
                countTotal: loS.betNumbers?.length || 15,
                countOver2: (loS.tierX5?.length || 0) + (loS.tierX4?.length || 0) + (loS.tierX3?.length || 0),
                tierX5: loS.tierX5 || [],
                tierX4: loS.tierX4 || [],
                tierX3: loS.tierX3 || [],
                tierX1: loS.tierX1 || [],
                allNumbers: loS.betNumbers?.map(b => b.num) || [],
                betNumbers: loS.betNumbers || [],
                dayLotoStakeK: loS.lotoStakeK || 66000,
                dayLotoPayoutK: loS.lotoPayoutK || 0,
                dayLotoProfitK: loS.lotoProfitK || 0,
                dayLotoHits: loS.totalHits || 0,
                isLotoWin: (loS.lotoProfitK || 0) > 0,
                xien4StakeK: loS.xienStakeK || 11000,
                xien4PayoutK: loS.xienPayoutK || 0,
                dayXien4ProfitK: loS.xienProfitK != null ? loS.xienProfitK : -11000,
                isXien4Win: (loS.xienProfitK || 0) > 0,
                crossX2: loS.crossX2 || b.lo4EngineFusion?.crossX2 || null,
                totalDayProfitK: loS.totalProfitK != null ? loS.totalProfitK : 0
            };
            lo7Ledger.push({ ...loRow, topN: 7, cumLotoProfitK: cumLo7 });
            lo6Ledger.push({ ...loRow, topN: 6, cumLotoProfitK: cumLo6 });
        }

        // Lô Xiên 5 / Top 5 Consensus
        if (s.loXien5 || s.lo4EngineFusion?.xienTop4) {
            const top5 = s.loXien5?.top5 || b.loXien5?.top5 || [];
            const top4 = s.lo4EngineFusion?.xienTop4 || b.lo4EngineFusion?.xien4?.top4 || top5.slice(0, 4);
            const h4 = s.lo4EngineFusion?.xienHitsCount != null ? s.lo4EngineFusion.xienHitsCount : (s.loXien5?.h4 || 0);
            const h5 = s.loXien5?.h5 != null ? s.loXien5.h5 : 0;
            const x5StakeK = s.loXien5?.stakeK || 55000;
            const x5PayoutK = s.loXien5?.payoutK || 0;
            const x5ProfitK = s.loXien5?.profitK != null ? s.loXien5.profitK : -55000;
            const q11StakeVIP_K = s.lo4EngineFusion?.xienStakeK || 11000;
            const q11PayoutVIP_K = s.lo4EngineFusion?.xienPayoutK || 0;
            const q11ProfitVIP_K = s.lo4EngineFusion?.xienProfitK != null ? s.lo4EngineFusion.xienProfitK : -11000;

            loTop5Ledger.push({
                date: d,
                predictionDate: d,
                top4,
                top5,
                h4,
                h5,
                isWin: h4 >= 2,
                q11StakeVIP_K,
                q11PayoutVIP_K,
                q11ProfitVIP_K,
                x5Stake55K: x5StakeK,
                x5Payout55K: x5PayoutK,
                x5Profit55K: x5ProfitK,
                x5StakeK,
                x5PayoutK,
                x5ProfitK,
                isX5Win55: x5ProfitK > 0,
                isLive: true
            });
        }

        // Đề Ledgers (Dual Merge, Adaptive, Triple, Meta)
        if (s.de) {
            const deRow = {
                date: d,
                predictionDate: d,
                actual: Number(s.de.actualSpecial),
                actualSpecial: Number(s.de.actualSpecial),
                special: Number(s.de.actualSpecial),
                settled: true,
                isLocked: true,
                isHit: Boolean(s.de.isHit),
                isVipHit: Boolean(s.de.isVipHit),
                hitType: s.de.isVipHit ? 'win_x3' : (s.de.isHit ? 'win_x1' : 'loss'),
                numbers: s.de.numbers || [],
                vipNumbers: s.de.vipNumbers || [],
                singleNumbers: s.de.singleNumbers || [],
                stakeK: s.de.stakeK || 70000,
                payoutK: s.de.payoutK || 0,
                profitK: s.de.profitK != null ? s.de.profitK : -70000,
                isLiveSnapshot: true,
                sourceType: 'live-snapshot',
                m1Label: s.de.methodName || 'Đề Gộp Thực Chiến'
            };
            dmLedger.push(deRow);
            adLedger.push(deRow);
            tmLedger.push(deRow);
            metaLedger.push(deRow);
        }

        // Đề Dropoff
        if (s.deDropoffMerge) {
            deDropoffLedger.push({
                date: d,
                predictionDate: d,
                actual: Number(s.deDropoffMerge.actualSpecial),
                actualSpecial: Number(s.deDropoffMerge.actualSpecial),
                actualStr: String(s.deDropoffMerge.actualSpecial),
                hit: Boolean(s.deDropoffMerge.isHit40),
                isHit: Boolean(s.deDropoffMerge.isHit40),
                isHit40: Boolean(s.deDropoffMerge.isHit40),
                isHit36: Boolean(s.deDropoffMerge.isHit36),
                numbers: s.deDropoffMerge.top40 || [],
                top40: s.deDropoffMerge.top40 || [],
                top36: s.deDropoffMerge.top36 || [],
                stake40K: s.deDropoffMerge.stake40K || 12000,
                payout40K: s.deDropoffMerge.payout40K || 0,
                profit40K: s.deDropoffMerge.profit40K != null ? s.deDropoffMerge.profit40K : -12000
            });
        }

        // Lô Dropoff 27
        if (s.loDropoff27) {
            loDropoffLedger.push({
                date: d,
                predictionDate: d,
                numbers: s.loDropoff27.top7 || [],
                top7: s.loDropoff27.top7 || [],
                top6: s.loDropoff27.top6 || [],
                top2: s.loDropoff27.top2 || [],
                hits: s.loDropoff27.hits7 || 0,
                hits7: s.loDropoff27.hits7 || 0,
                hits6: s.loDropoff27.hits6 || 0,
                hits2: s.loDropoff27.hits2 || 0,
                isHit: (s.loDropoff27.hits7 || 0) > 0,
                isWin: Boolean(s.loDropoff27.isFlatWin),
                stakeK: s.loDropoff27.flatStake7K || 15400,
                payoutK: s.loDropoff27.flatPayout7K || 0,
                profitK: s.loDropoff27.flatProfit7K != null ? s.loDropoff27.flatProfit7K : -15400
            });
        }

        // Tri-Core Đề
        if (s.triCoreDe) {
            triCoreLedger.push({
                date: d,
                predictionDate: d,
                action: s.triCoreDe.action || 'BET',
                numbers: s.triCoreDe.numbers || [],
                actualSpecial: s.triCoreDe.actualSpecial != null ? Number(s.triCoreDe.actualSpecial) : null,
                hit: s.triCoreDe.hit,
                stakeK: s.triCoreDe.stakeK || 7200,
                payoutK: s.triCoreDe.payoutK || 0,
                profitK: s.triCoreDe.profitK != null ? s.triCoreDe.profitK : -7200,
                isWin: Boolean(s.triCoreDe.isWin)
            });
        }

        // PentaConsensus (Shadow Monitor)
        if (s.pentaConsensus) {
            const pS = s.pentaConsensus;
            cumPenta += (pS.totalProfitK || 0);
            pentaLedger.push({
                date: d,
                predictionDate: d,
                ...pS,
                cumProfitK: cumPenta
            });
        }

        // 2 Dàn Xiên 4 Tinh Hoa (top8ParityXien4)
        if (s.top8ParityXien4 || b.top8ParityXien4) {
            const pS = s.top8ParityXien4 || {};
            const pB = b.top8ParityXien4 || {};
            cumTop8Parity += (pS.profitK || 0);
            top8ParityLedger.push({
                date: d,
                predictionDate: d,
                top8: pS.top8 || pB.top8 || [],
                dan1: pS.dan1 || pB.dan1 || [],
                dan2: pS.dan2 || pB.dan2 || [],
                swapped: Boolean(pS.swapped ?? pB.swapped),
                ...pS,
                cumProfitK: cumTop8Parity
            });
        }
    });

    // 6. Gán các ledger đã tái tạo chuẩn xác vào adv
    if (!adv.crossHedgingPortfolio) adv.crossHedgingPortfolio = {};
    adv.crossHedgingPortfolio.settledLedger = chLedger;

    if (!adv.lo4EngineFusion) adv.lo4EngineFusion = { modes: {} };
    if (!adv.lo4EngineFusion.modes) adv.lo4EngineFusion.modes = {};
    adv.lo4EngineFusion.settledLedger = lo7Ledger;
    adv.lo4EngineFusion.modes.top7 = { ...(adv.lo4EngineFusion.modes.top7 || {}), settledLedger: lo7Ledger };
    adv.lo4EngineFusion.modes.top6 = { ...(adv.lo4EngineFusion.modes.top6 || {}), settledLedger: lo6Ledger };

    if (!adv.loTop5ConsensusXien) adv.loTop5ConsensusXien = {};
    adv.loTop5ConsensusXien.settledLedger = loTop5Ledger;

    if (!adv.dualMerge) adv.dualMerge = {};
    adv.dualMerge.settledLedger = dmLedger;

    if (!adv.adaptiveDualMerge) adv.adaptiveDualMerge = {};
    adv.adaptiveDualMerge.settledLedger = adLedger;

    if (!adv.tripleMerge) adv.tripleMerge = {};
    adv.tripleMerge.settledLedger = tmLedger;

    if (!adv.metaLearner) adv.metaLearner = {};
    adv.metaLearner.settledLedger = metaLedger;

    if (!adv.deDropoffMerge) adv.deDropoffMerge = {};
    adv.deDropoffMerge.settledLedger = deDropoffLedger;

    if (!adv.loDropoff27) adv.loDropoff27 = {};
    adv.loDropoff27.settledLedger = loDropoffLedger;

    if (!adv.triCoreDe) adv.triCoreDe = {};
    adv.triCoreDe.settledLedger = triCoreLedger;

    if (!adv.pentaConsensus) adv.pentaConsensus = {};
    if (pentaLedger.length > 0) adv.pentaConsensus.settledLedger = pentaLedger;

    if (!adv.top8ParityXien4) adv.top8ParityXien4 = {};
    if (top8ParityLedger.length > 0) adv.top8ParityXien4.settledLedger = top8ParityLedger;

    // 7. CẬP NHẬT LATEST RECOMMENDATION CHO NGÀY TIẾP THEO (PENDING)
    if (latestEntry && latestEntry.bets) {
        const lb = latestEntry.bets;
        if (lb.crossHedgingPortfolio) {
            adv.crossHedgingPortfolio.latestRecommendation = lb.crossHedgingPortfolio;
            adv.crossHedgingPortfolio.targetDate = latestDate;
        }
        if (lb.lo4EngineFusion) {
            adv.lo4EngineFusion.latestRecommendation = lb.lo4EngineFusion;
            if (adv.lo4EngineFusion.modes.top7) adv.lo4EngineFusion.modes.top7.latestRecommendation = lb.lo4EngineFusion;
            if (adv.lo4EngineFusion.modes.top6) adv.lo4EngineFusion.modes.top6.latestRecommendation = lb.lo4EngineFusion;
        }
        if (lb.loXien5) {
            adv.loTop5ConsensusXien.top5Xien = lb.loXien5.top5;
            adv.loTop5ConsensusXien.top4Xien = lb.lo4EngineFusion?.xien4?.top4 || lb.loXien5.top5?.slice(0, 4);
        }
        if (lb.de) {
            if (!adv.streakAwareDeAdvisor) adv.streakAwareDeAdvisor = {};
            adv.streakAwareDeAdvisor.latestRecommendation = {
                predictionDate: latestDate,
                selectedMethod: 'deMarkovGapHazard',
                selectedMethodLabel: lb.de.methodName,
                methodName: lb.de.methodName,
                numbers: lb.de.numbers,
                tierX3: lb.de.vipNumbers,
                tierX2: [],
                singles: lb.de.singleNumbers,
                stakeK: lb.de.stakeK,
                snapshotLock: { isLocked: true, lockedAt: latestEntry.registeredAt }
            };
        }
        if (lb.deDropoffMerge) adv.deDropoffMerge.latestRecommendation = lb.deDropoffMerge;
        if (lb.loDropoff27) adv.loDropoff27.latestRecommendation = lb.loDropoff27;
        if (lb.triCoreDe) adv.triCoreDe.latestRecommendation = lb.triCoreDe;
        if (lb.pentaConsensus) {
            if (!adv.pentaConsensus) adv.pentaConsensus = {};
            adv.pentaConsensus.latestRecommendation = lb.pentaConsensus;
        }
        if (lb.top8ParityXien4) {
            if (!adv.top8ParityXien4) adv.top8ParityXien4 = {};
            adv.top8ParityXien4.latestRecommendation = {
                targetDate: latestDate,
                predictionDate: latestDate,
                ...lb.top8ParityXien4
            };
        }
    }

    // 8. Lưu lại file cache
    adv.updatedAt = new Date().toISOString();
    const advStr = JSON.stringify(adv, null, 2);
    fs.writeFileSync(ADV_STATS_FILE, advStr, 'utf8');
    console.log(`[Cache] Đã lưu cached_daily_method_advisor.json vào lib/data/statistics/ (canonical, no data/ duplicate).`);

    // In thống kê kiểm tra
    console.log('\n[Summary Check]');
    console.log(`  CrossHedging settled ledger: ${chLedger.length} ngày, Lãi lũy kế: ${(cumTot / 1000).toFixed(1)}M VNĐ`);
    console.log(`  Lô 4 ĐC Top 7 ledger: ${lo7Ledger.length} ngày, Lãi lũy kế: ${(cumLo7 / 1000).toFixed(1)}M VNĐ`);
    console.log(`  Đề ledger: ${dmLedger.length} ngày, Lãi lũy kế: ${(cumDe / 1000).toFixed(1)}M VNĐ`);
    console.log(`  Target Date hôm nay: ${latestDate} (${latestEntry.isSettled ? 'Đã kết toán' : 'Chờ mở thưởng'})`);
    console.log('='.repeat(80));
    console.log('✅ SYNC HOÀN TẤT!');
    console.log('='.repeat(80));
}

if (require.main === module) {
    try {
        syncAll();
    } catch (e) {
        console.error('Lỗi khi sync SSOT:', e);
        process.exit(1);
    }
}

module.exports = { syncAll };
