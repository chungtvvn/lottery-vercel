'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { computePentaConsensusForDate } = require('../lib/services/pentaConsensusService');

const ROOT_DIR = path.join(__dirname, '..');
const ADV_STATS_FILE = path.join(ROOT_DIR, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
// CANONICAL CACHE (2026-10-27 consolidation): no data/ duplicate of the advisor cache.
const REG_STATS_FILE = path.join(ROOT_DIR, 'lib', 'data', 'statistics', 'daily_locked_bets_registry.json');
const REG_DATA_FILE = path.join(ROOT_DIR, 'data', 'daily_locked_bets_registry.json');

function numStr(n) {
    return String(n != null ? n : '').padStart(2, '0');
}

async function fixShadowDate20() {
    console.log('=== FIXING SHADOW DATA FOR 2026-10-20 ===');

    const adv = JSON.parse(fs.readFileSync(ADV_STATS_FILE, 'utf8'));
    let reg = fs.existsSync(REG_STATS_FILE) ? JSON.parse(fs.readFileSync(REG_STATS_FILE, 'utf8')) : (adv.dailyLockedBetsRegistry || { dates: {} });

    const targetDate = '2026-10-20';
    const drawPrizesObj = adv.drawPrizesByDate?.[targetDate];
    if (!drawPrizesObj) {
        throw new Error(`Không tìm thấy kết quả mở thưởng cho ngày ${targetDate}`);
    }

    const actualSpecial = numStr(drawPrizesObj.special);
    const actualPrizes = (drawPrizesObj.prizes || []).map(numStr);
    const hitsMap = {};
    actualPrizes.forEach(p => {
        hitsMap[p] = (hitsMap[p] || 0) + 1;
    });

    // 1. Compute exact pentaConsensus for 2026-10-20
    const p = computePentaConsensusForDate(targetDate, adv);
    if (!p) {
        throw new Error(`computePentaConsensusForDate trả về null cho ngày ${targetDate}`);
    }

    console.log(`2026-10-20 Penta: Special=${actualSpecial}, DeProfit=${p.de.profitK}, LoProfit=${p.lo.profitK}, LoX2Profit=${p.loCrossX2.profitK}, ComboProfit=${p.combo.profitK}`);

    // Ensure reg entry for 2026-10-20 exists
    if (!reg.dates[targetDate]) {
        reg.dates[targetDate] = {
            targetDate,
            isSettled: true,
            registeredAt: '2026-10-20T10:00:00.000Z',
            bets: {},
            settlement: {}
        };
    }
    const entry = reg.dates[targetDate];
    if (!entry.bets) entry.bets = {};
    if (!entry.settlement) entry.settlement = {};

    // 2. Set bets.pentaConsensus
    entry.bets.pentaConsensus = {
        targetDate,
        predictionDate: targetDate,
        methodName: '👑 Siêu Gộp 5 Phương Pháp (Penta-Consensus Suite)',
        de: {
            numbers: p.de.numbers,
            x2Nums: p.de.x2Nums,
            x1Nums: p.de.x1Nums,
            stakeK: p.de.stakeK
        },
        lo: {
            numbers: p.lo.numbers,
            x5Nums: p.lo.x5Nums,
            x4Nums: p.lo.x4Nums,
            x3Nums: p.lo.x3Nums,
            x1Nums: p.lo.x1Nums,
            multiplierMap: p.lo.multiplierMap,
            stakeK: p.lo.stakeK
        },
        loCrossX2: {
            numbers: p.loCrossX2.numbers,
            x5Nums: p.loCrossX2.x5Nums,
            x4Nums: p.loCrossX2.x4Nums,
            x3Nums: p.loCrossX2.x3Nums,
            x2Nums: p.loCrossX2.x2Nums,
            x1Nums: p.loCrossX2.x1Nums,
            multiplierMap: p.loCrossX2.multiplierMap,
            stakeK: p.loCrossX2.stakeK
        },
        xien5: {
            top5: p.xien5.top5,
            tickets: p.xien5.tickets,
            stakeK: p.xien5.stakeK
        }
    };

    // 3. Set settlement.pentaConsensus
    entry.settlement.pentaConsensus = {
        date: targetDate,
        actualSpecial,
        de: {
            numbers: p.de.numbers,
            x2Nums: p.de.x2Nums,
            x1Nums: p.de.x1Nums,
            isHit: p.de.isHit,
            isHitX2: p.de.isHitX2,
            isHitX1: p.de.isHitX1,
            stakeK: p.de.stakeK,
            payoutK: p.de.payoutK,
            profitK: p.de.profitK,
            isWin: p.de.profitK > 0
        },
        lo: {
            numbers: p.lo.numbers,
            x5Nums: p.lo.x5Nums,
            x4Nums: p.lo.x4Nums,
            x3Nums: p.lo.x3Nums,
            x1Nums: p.lo.x1Nums,
            hits: p.lo.hits,
            hitNums: p.lo.hitNums,
            multiplierMap: p.lo.multiplierMap,
            stakeK: p.lo.stakeK,
            payoutK: p.lo.payoutK,
            profitK: p.lo.profitK,
            isWin: p.lo.profitK > 0
        },
        loCrossX2: {
            numbers: p.loCrossX2.numbers,
            x5Nums: p.loCrossX2.x5Nums,
            x4Nums: p.loCrossX2.x4Nums,
            x3Nums: p.loCrossX2.x3Nums,
            x2Nums: p.loCrossX2.x2Nums,
            x1Nums: p.loCrossX2.x1Nums,
            hits: p.loCrossX2.hits,
            hitNums: p.loCrossX2.hitNums,
            multiplierMap: p.loCrossX2.multiplierMap,
            stakeK: p.loCrossX2.stakeK,
            payoutK: p.loCrossX2.payoutK,
            profitK: p.loCrossX2.profitK,
            isWin: p.loCrossX2.profitK > 0
        },
        xien5: {
            top5: p.xien5.top5,
            h5: p.xien5.h5,
            stakeK: p.xien5.stakeK,
            payoutK: p.xien5.payoutK,
            profitK: p.xien5.profitK,
            isWin: p.xien5.isWin
        },
        totalStakeK: p.combo.stakeK,
        totalPayoutK: p.combo.payoutK,
        totalProfitK: p.combo.profitK,
        isWin: p.combo.isWin
    };

    // 4. Also set deDropoffMerge and loDropoff27 if missing
    if (!entry.settlement.deDropoffMerge) {
        const top40 = p.de.numbers.slice(0, 40);
        const isHit40 = top40.includes(actualSpecial);
        const top20 = top40.slice(0, 20);
        const isHitX2 = top20.includes(actualSpecial);
        const payout40K = isHitX2 ? 33600 : (isHit40 ? 16800 : 0);
        const profit40K = payout40K - 12000;
        entry.settlement.deDropoffMerge = {
            date: targetDate,
            actualSpecial,
            top40,
            isHit40,
            isHitX2,
            isHitX1: isHit40 && !isHitX2,
            stake40K: 12000,
            payout40K,
            profit40K
        };
    }

    if (!entry.settlement.loDropoff27) {
        const top7 = p.lo.numbers.slice(0, 7);
        let hits7 = 0;
        top7.forEach(n => { hits7 += (hitsMap[n] || 0); });
        const flatPayout7K = hits7 * 8000;
        entry.settlement.loDropoff27 = {
            date: targetDate,
            top7,
            hits7,
            flatStake7K: 15400,
            flatPayout7K,
            flatProfit7K: flatPayout7K - 15400,
            isFlatWin: (flatPayout7K - 15400) > 0
        };
    }

    // 5. Update deDropoffMerge.settledLedger in adv
    if (!adv.deDropoffMerge) adv.deDropoffMerge = {};
    if (!adv.deDropoffMerge.settledLedger) adv.deDropoffMerge.settledLedger = [];
    const deIdx = adv.deDropoffMerge.settledLedger.findIndex(r => r.date === targetDate);
    const deItem = {
        date: targetDate,
        predictionDate: targetDate,
        actual: Number(actualSpecial),
        actualSpecial: Number(actualSpecial),
        actualStr: actualSpecial,
        hit: entry.settlement.deDropoffMerge.isHit40,
        isHit: entry.settlement.deDropoffMerge.isHit40,
        isHit40: entry.settlement.deDropoffMerge.isHit40,
        numbers: entry.settlement.deDropoffMerge.top40,
        top40: entry.settlement.deDropoffMerge.top40,
        stake40K: 12000,
        payout40K: entry.settlement.deDropoffMerge.payout40K,
        profit40K: entry.settlement.deDropoffMerge.profit40K
    };
    if (deIdx >= 0) adv.deDropoffMerge.settledLedger[deIdx] = deItem;
    else adv.deDropoffMerge.settledLedger.push(deItem);
    adv.deDropoffMerge.settledLedger.sort((a, b) => a.date.localeCompare(b.date));

    // 6. Update loDropoff27.settledLedger in adv
    if (!adv.loDropoff27) adv.loDropoff27 = {};
    if (!adv.loDropoff27.settledLedger) adv.loDropoff27.settledLedger = [];
    const loIdx = adv.loDropoff27.settledLedger.findIndex(r => r.date === targetDate);
    const loItem = {
        date: targetDate,
        top7: entry.settlement.loDropoff27.top7,
        hits: entry.settlement.loDropoff27.hits7,
        flatStakeK: 15400,
        flatPayoutK: entry.settlement.loDropoff27.flatPayout7K,
        profitK: entry.settlement.loDropoff27.flatProfit7K,
        isWin: entry.settlement.loDropoff27.isFlatWin
    };
    if (loIdx >= 0) adv.loDropoff27.settledLedger[loIdx] = loItem;
    else adv.loDropoff27.settledLedger.push(loItem);
    adv.loDropoff27.settledLedger.sort((a, b) => a.date.localeCompare(b.date));

    // 7. Update adv.dailyLockedBetsRegistry
    adv.dailyLockedBetsRegistry = reg;

    // 8. Save registry files
    fs.writeFileSync(REG_STATS_FILE, JSON.stringify(reg, null, 2), 'utf8');
    if (fs.existsSync(REG_DATA_FILE)) {
        fs.writeFileSync(REG_DATA_FILE, JSON.stringify(reg, null, 2), 'utf8');
    }
    console.log('✅ Đã cập nhật daily_locked_bets_registry.json');

    // 9. Save cached_daily_method_advisor.json and gz
    fs.writeFileSync(ADV_STATS_FILE, JSON.stringify(adv, null, 2), 'utf8');
    const gzPath = ADV_STATS_FILE + '.gz';
    fs.writeFileSync(gzPath, zlib.gzipSync(Buffer.from(JSON.stringify(adv))));
    console.log(`✅ Đã lưu và nén ${gzPath}`);
}

fixShadowDate20().catch(console.error);
