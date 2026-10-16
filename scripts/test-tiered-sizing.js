'use strict';

const fs = require('fs');
const path = require('path');
const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json'), 'utf8'));
const numStr = n => String(Number(n)).padStart(2, '0');

const allDates = cache.semanticResonanceSuite?.settledLedger?.map(r => String(r.date).slice(0, 10)) || [];
const liveDates = allDates.filter(d => d >= '2026-09-17');

function getDailyAdvisorTop20(date, mode = '4core') {
    const sets = [];
    const metaRow = cache.metaLearner?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    if (metaRow?.numbers) sets.push(metaRow.numbers.slice(0, 20).map(numStr));

    const dualRow = cache.dualMerge?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    if (dualRow) {
        const dNums = dualRow.union?.length ? dualRow.union : [...(dualRow.intersection || []), ...(dualRow.uniqueSingles || [])];
        if (dNums.length) sets.push(dNums.slice(0, 20).map(numStr));
    }

    const tripleRow = cache.tripleMerge?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    if (tripleRow) {
        const tNums = tripleRow.fullUnion?.length ? tripleRow.fullUnion : [...(tripleRow.tierX3 || []), ...(tripleRow.tierX2 || []), ...(tripleRow.tierX1 || [])];
        if (tNums.length) sets.push(tNums.slice(0, 20).map(numStr));
    }

    const streakRow = cache.streakAwareDeAdvisor?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    if (streakRow?.numbers) sets.push(streakRow.numbers.slice(0, 20).map(numStr));

    if (mode === 'all8') {
        const p = cache.pentaCoreDe?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
        if (p?.numbers) sets.push(p.numbers.slice(0, 20).map(numStr));
        const m = cache.deMarkovGapHazard?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
        if (m?.numbers) sets.push(m.numbers.slice(0, 20).map(numStr));
        const pos = cache.dePositionalGraphFlow?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
        if (pos?.numbers) sets.push(pos.numbers.slice(0, 20).map(numStr));
        const a = cache.adaptiveDualMerge?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
        if (a?.fullUnion) sets.push(a.fullUnion.slice(0, 20).map(numStr));
    }

    const merged = new Set();
    sets.forEach(s => s.forEach(n => merged.add(n)));
    return { sets, mergedNumbers: Array.from(merged).sort((a, b) => Number(a) - Number(b)) };
}

function getShadowTopHalf(date) {
    const sets = [];
    const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    const dropoffRow = cache.deDropoffMerge?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);
    const triRow = cache.triCoreDe?.settledLedger?.find(r => String(r.date).slice(0, 10) === date);

    const nums40 = dropoffRow?.numbers?.length ? dropoffRow.numbers : (resRow?.de?.numbers40 || []);
    if (nums40.length) sets.push(nums40.slice(0, 20).map(numStr));
    if (triRow?.numbers?.length) sets.push(triRow.numbers.slice(0, 12).map(numStr));
    if (resRow?.de?.numbers36?.length) sets.push(resRow.de.numbers36.slice(0, 18).map(numStr));

    const merged = new Set();
    sets.forEach(s => s.forEach(n => merged.add(n)));
    return { sets, mergedNumbers: Array.from(merged).sort((a, b) => Number(a) - Number(b)) };
}

function testTieredBetting(dates, name) {
    let draws = 0, hitsVip = 0, hitsLot = 0, misses = 0;
    let totalStake = 0, totalPayout84 = 0, totalPayout99 = 0;
    let totalVipCount = 0, totalLotCount = 0;

    // Chi phí cược:
    // VIP (số nằm trong cả DA và Shadow): cược 300K
    // Lót (số chỉ nằm ở 1 bên): cược 100K
    const STAKE_VIP = 300;
    const STAKE_LOT = 100;

    dates.forEach(d => {
        const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        const actualStr = numStr(resRow?.actualSpecial || resRow?.de?.actual);
        if (!actualStr) return;

        const daNums = new Set(getDailyAdvisorTop20(d, 'all8').mergedNumbers);
        const shNums = new Set(getShadowTopHalf(d).mergedNumbers);

        const vipNums = [...daNums].filter(n => shNums.has(n));
        const lotNums = [...new Set([...daNums, ...shNums])].filter(n => !shNums.has(n) || !daNums.has(n));

        draws++;
        totalVipCount += vipNums.length;
        totalLotCount += lotNums.length;

        const dayStake = (vipNums.length * STAKE_VIP) + (lotNums.length * STAKE_LOT);
        totalStake += dayStake;

        let dayPayout84 = 0;
        let dayPayout99 = 0;

        if (vipNums.includes(actualStr)) {
            hitsVip++;
            dayPayout84 = STAKE_VIP * 84;
            dayPayout99 = STAKE_VIP * 99;
        } else if (lotNums.includes(actualStr)) {
            hitsLot++;
            dayPayout84 = STAKE_LOT * 84;
            dayPayout99 = STAKE_LOT * 99;
        } else {
            misses++;
        }

        totalPayout84 += dayPayout84;
        totalPayout99 += dayPayout99;
    });

    const netProfit84 = totalPayout84 - totalStake;
    const roi84 = (netProfit84 / totalStake) * 100;
    const netProfit99 = totalPayout99 - totalStake;
    const roi99 = (netProfit99 / totalStake) * 100;

    const totalHits = hitsVip + hitsLot;
    const wr = (totalHits / draws) * 100;
    const avgVip = totalVipCount / draws;
    const avgLot = totalLotCount / draws;

    console.log(`\n=== CHIẾN THUẬT PHÂN TẦNG VỐN (TIERED CAPITAL): ${name} ===`);
    console.log(`Số kỳ: ${draws}`);
    console.log(`Trung bình VIP (Trùng cả 2 bên): ${avgVip.toFixed(1)} số (Cược ${STAKE_VIP}K/số)`);
    console.log(`Trung bình Lót (Chỉ 1 bên): ${avgLot.toFixed(1)} số (Cược ${STAKE_LOT}K/số)`);
    console.log(`Tổng dàn: ${(avgVip + avgLot).toFixed(1)} số`);
    console.log(`Vốn trung bình mỗi ngày: ${((avgVip * STAKE_VIP + avgLot * STAKE_LOT) / 1000).toFixed(1)}M/ngày`);
    console.log(`Số ngày trúng: ${totalHits}/${draws} (${wr.toFixed(1)}%) [Nổ VIP: ${hitsVip} kỳ, Nổ Lót: ${hitsLot} kỳ]`);
    console.log(`--- KẾT QUẢ TỶ LỆ 1:84 ---`);
    console.log(`Tổng Vốn: ${(totalStake / 1000).toFixed(1)}M | Tổng Thu: ${(totalPayout84 / 1000).toFixed(1)}M | Lãi Ròng: ${netProfit84 > 0 ? '+' : ''}${(netProfit84 / 1000).toFixed(1)}M VNĐ | ROI: ${roi84 > 0 ? '+' : ''}${roi84.toFixed(1)}%`);
    console.log(`--- KẾT QUẢ TỶ LỆ 1:99 (ONLINE) ---`);
    console.log(`Tổng Vốn: ${(totalStake / 1000).toFixed(1)}M | Tổng Thu: ${(totalPayout99 / 1000).toFixed(1)}M | Lãi Ròng: ${netProfit99 > 0 ? '+' : ''}${(netProfit99 / 1000).toFixed(1)}M VNĐ | ROI: ${roi99 > 0 ? '+' : ''}${roi99.toFixed(1)}%`);
}

testTieredBetting(allDates, 'CẢ NĂM 2026 (283 KỲ)');
testTieredBetting(liveDates, 'LIVE (28 KỲ TỪ 17/09/2026)');
