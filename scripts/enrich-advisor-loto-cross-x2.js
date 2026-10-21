'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { computePentaConsensusForDate, numStr } = require('../lib/services/pentaConsensusService');

async function enrichAdvisorCache() {
    const advisorPath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
    if (!fs.existsSync(advisorPath)) {
        throw new Error('Không tìm thấy cached_daily_method_advisor.json');
    }
    const adv = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));

    console.log('=== ENRICHING CACHED DAILY METHOD ADVISOR VỚI LÔ CROSS X2 ===');

    // 1. Enrich lo4EngineFusion settledLedger
    const lo4 = adv.lo4EngineFusion;
    if (lo4 && lo4.settledLedger) {
        let cumProfitX2 = 0;
        let origWins = 0, x2Wins = 0;

        lo4.settledLedger.forEach(row => {
            const d = row.date;
            const regEntry = adv.dailyLockedBetsRegistry?.dates?.[d];
            const sLo4 = regEntry?.settlement?.lo4EngineFusion || regEntry?.bets?.lo4EngineFusion;

            // Đồng bộ hoá tuyệt đối 100% với SSOT từ dailyLockedBetsRegistry
            if (sLo4 && sLo4.tierX1 && (sLo4.tierX5 || sLo4.tierX4 || sLo4.tierX3)) {
                row.tierX5 = sLo4.tierX5 || [];
                row.tierX4 = sLo4.tierX4 || [];
                row.tierX3 = sLo4.tierX3 || [];
                row.tierX1 = sLo4.tierX1 || [];
                row.dayLotoStakeK = sLo4.lotoStakeK || row.dayLotoStakeK;
                row.dayLotoPayoutK = sLo4.lotoPayoutK != null ? sLo4.lotoPayoutK : row.dayLotoPayoutK;
                row.dayLotoProfitK = sLo4.lotoProfitK != null ? sLo4.lotoProfitK : row.dayLotoProfitK;
                row.dayLotoHits = sLo4.totalHits != null ? sLo4.totalHits : row.dayLotoHits;
                row.isLotoWin = row.dayLotoProfitK > 0;
                row.allNumbers = sLo4.betNumbers?.map(b => numStr(b.num || b)) || row.allNumbers;
                row.betNumbers = sLo4.betNumbers || row.betNumbers;
            }

            const penta = computePentaConsensusForDate(d, adv);
            const pentaHighSet = new Set(penta ? [...(penta.lo.x5Nums || []), ...(penta.lo.x4Nums || []), ...(penta.lo.x3Nums || [])] : []);

            const t5 = (row.tierX5 || []).map(numStr);
            const t4 = (row.tierX4 || []).map(numStr);
            const t3 = (row.tierX3 || []).map(numStr);
            const t1 = (row.tierX1 || []).map(numStr);

            const promotedToX2 = t1.filter(n => pentaHighSet.has(n));
            const remainingX1 = t1.filter(n => !pentaHighSet.has(n));

            const prizeCount = {};
            const prizesObj = adv.drawPrizesByDate?.[d];
            if (prizesObj?.prizes) {
                prizesObj.prizes.forEach(p => {
                    const s = numStr(p);
                    prizeCount[s] = (prizeCount[s] || 0) + 1;
                });
            }

            let x5Hits = 0, x4Hits = 0, x3Hits = 0, x2Hits = 0, x1Hits = 0;
            t5.forEach(n => { x5Hits += (prizeCount[n] || 0); });
            t4.forEach(n => { x4Hits += (prizeCount[n] || 0); });
            t3.forEach(n => { x3Hits += (prizeCount[n] || 0); });
            promotedToX2.forEach(n => { x2Hits += (prizeCount[n] || 0); });
            remainingX1.forEach(n => { x1Hits += (prizeCount[n] || 0); });

            const stakeKX2 = (t5.length * 5 + t4.length * 4 + t3.length * 3 + promotedToX2.length * 2 + remainingX1.length * 1) * 2200;
            const payoutKX2 = (x5Hits * 5 + x4Hits * 4 + x3Hits * 3 + x2Hits * 2 + x1Hits * 1) * 8000;
            const profitKX2 = payoutKX2 - stakeKX2;
            cumProfitX2 += profitKX2;

            if (row.dayLotoProfitK > 0) origWins++;
            if (profitKX2 > 0) x2Wins++;

            row.crossX2 = {
                tierX5: t5,
                tierX4: t4,
                tierX3: t3,
                tierX2: promotedToX2,
                tierX1: remainingX1,
                x2Hits,
                dayLotoStakeKX2: stakeKX2,
                dayLotoPayoutKX2: payoutKX2,
                dayLotoProfitKX2: profitKX2,
                cumLotoProfitKX2: cumProfitX2,
                isLotoWinX2: profitKX2 > 0
            };
            if (regEntry?.settlement?.lo4EngineFusion) {
                regEntry.settlement.lo4EngineFusion.crossX2 = { ...row.crossX2 };
            }
        });

        // Enrich modes.top7 and modes.top6 if exist
        ['top7', 'top6'].forEach(mode => {
            if (lo4.modes?.[mode]?.settledLedger) {
                let mCumX2 = 0;
                lo4.modes[mode].settledLedger.forEach(row => {
                    const match = lo4.settledLedger.find(r => r.date === row.date);
                    if (match && match.crossX2) {
                        mCumX2 += match.crossX2.dayLotoProfitKX2;
                        row.tierX5 = match.tierX5;
                        row.tierX4 = match.tierX4;
                        row.tierX3 = match.tierX3;
                        row.tierX1 = match.tierX1;
                        row.dayLotoStakeK = match.dayLotoStakeK;
                        row.dayLotoPayoutK = match.dayLotoPayoutK;
                        row.dayLotoProfitK = match.dayLotoProfitK;
                        row.dayLotoHits = match.dayLotoHits;
                        row.isLotoWin = match.isLotoWin;
                        row.crossX2 = {
                            ...match.crossX2,
                            cumLotoProfitKX2: mCumX2
                        };
                    }
                });
            }
        });

        console.log(`Lo4 enriched: ${lo4.settledLedger.length} days. Lãi gốc: ${(lo4.settledLedger[lo4.settledLedger.length - 1].cumLotoProfitK / 1000).toFixed(1)}M, Lãi X2: ${(cumProfitX2 / 1000).toFixed(1)}M (+${((cumProfitX2 - lo4.settledLedger[lo4.settledLedger.length - 1].cumLotoProfitK) / 1000).toFixed(1)}M)`);
    }

    // 2. Enrich lo4EngineFusion latestRecommendation
    if (lo4 && lo4.latestRecommendation) {
        const pendingDate = adv.pendingPredictionDate || '2026-10-21';
        const penta = computePentaConsensusForDate(pendingDate, adv);
        const pentaHighSet = new Set(penta ? [...(penta.lo.x5Nums || []), ...(penta.lo.x4Nums || []), ...(penta.lo.x3Nums || [])] : []);

        const t5 = (lo4.latestRecommendation.tierX5 || []).map(numStr);
        const t4 = (lo4.latestRecommendation.tierX4 || []).map(numStr);
        const t3 = (lo4.latestRecommendation.tierX3 || []).map(numStr);
        const t1 = (lo4.latestRecommendation.tierX1 || []).map(numStr);

        const promotedToX2 = t1.filter(n => pentaHighSet.has(n));
        const remainingX1 = t1.filter(n => !pentaHighSet.has(n));
        const stakeKX2 = (t5.length * 5 + t4.length * 4 + t3.length * 3 + promotedToX2.length * 2 + remainingX1.length * 1) * 2200;

        lo4.latestRecommendation.crossX2 = {
            tierX5: t5,
            tierX4: t4,
            tierX3: t3,
            tierX2: promotedToX2,
            tierX1: remainingX1,
            stakeKX2,
            promotedRationale: promotedToX2.length > 0
                ? `Số [${promotedToX2.join(', ')}] xuất hiện ở nhóm đồng thuận cao (>= X3) bên Shadow Monitor -> Nâng lên Tier X2 (cược 4.4M/số, ăn 16M/nháy).`
                : 'Không có số nào cần nâng hạng hôm nay.'
        };
        console.log(`Lo4 latest recommendation enriched for ${pendingDate}: X2 = [${promotedToX2.join(', ')}], X1 còn lại = [${remainingX1.join(', ')}]`);
    }

    // 3. Enrich pentaConsensus in cache
    if (!adv.pentaConsensus) {
        adv.pentaConsensus = {};
    }
    // Build settledLedger for pentaConsensus if not present
    const rawDates = (lo4.settledLedger || []).map(r => r.date);
    let pCumOrig = 0, pCumX2 = 0;
    const pentaSettledLedger = [];
    rawDates.forEach(d => {
        const p = computePentaConsensusForDate(d, adv);
        if (p) {
            pCumOrig += (p.lo.profitK || 0);
            pCumX2 += (p.loCrossX2.profitK || 0);
            pentaSettledLedger.push({
                date: d,
                de: p.de,
                lo: {
                    ...p.lo,
                    cumProfitK: pCumOrig
                },
                loCrossX2: {
                    ...p.loCrossX2,
                    cumProfitK: pCumX2
                },
                xien5: p.xien5,
                combo: p.combo
            });
        }
    });
    adv.pentaConsensus.settledLedger = pentaSettledLedger;
    const latestPenta = computePentaConsensusForDate(adv.pendingPredictionDate || '2026-10-21', adv);
    if (latestPenta) {
        adv.pentaConsensus.latestRecommendation = latestPenta;
    }
    console.log(`Penta Consensus settledLedger generated: ${pentaSettledLedger.length} days.`);

    fs.writeFileSync(advisorPath, JSON.stringify(adv, null, 2), 'utf8');
    console.log(`✅ Đã lưu ${advisorPath}`);

    // Ghi file gzip
    const gzPath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json.gz');
    fs.writeFileSync(gzPath, zlib.gzipSync(Buffer.from(JSON.stringify(adv))));
    console.log(`✅ Đã nén và lưu: ${gzPath}`);
}

enrichAdvisorCache().catch(console.error);
