'use strict';

const fs = require('fs');
const path = require('path');
const cache = JSON.parse(fs.readFileSync(path.join(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json'), 'utf8'));
const numStr = n => String(Number(n)).padStart(2, '0');

const allDates = cache.semanticResonanceSuite?.settledLedger?.map(r => String(r.date).slice(0, 10)) || [];
const liveDates = allDates.filter(d => d >= '2026-09-17');

function evalSingle(name, dates, getNumsFn) {
    let hits = 0, draws = 0, totalNums = 0;
    let profit100K = 0, stake100K = 0;
    let maxLoss = 0, curLoss = 0;

    dates.forEach(d => {
        const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        const actualStr = numStr(resRow?.actualSpecial || resRow?.de?.actual);
        const nums = getNumsFn(d);
        if (!nums || !nums.length) return;
        draws++;
        const count = nums.length;
        totalNums += count;
        const isHit = nums.includes(actualStr);
        if (isHit) {
            hits++;
            curLoss = 0;
        } else {
            curLoss++;
            if (curLoss > maxLoss) maxLoss = curLoss;
        }

        const s = count * 100; // 100K / number
        const p = isHit ? 8400 : 0;
        stake100K += s;
        profit100K += (p - s);
    });

    const avg = totalNums / draws;
    const wr = hits / draws;
    const be = avg / 84;
    const roi = (profit100K / stake100K) * 100;
    const roi99 = ((profit100K + hits * 1500) / stake100K) * 100;

    return {
        name,
        draws,
        hits: `${hits}/${draws}`,
        wr: `${(wr * 100).toFixed(1)}%`,
        avgN: avg.toFixed(1),
        be: `${(be * 100).toFixed(1)}%`,
        edge: `${(wr - be > 0 ? '+' : '')}${((wr - be) * 100).toFixed(1)}%`,
        maxLoss: `${maxLoss} kỳ`,
        profit100K: `${profit100K > 0 ? '+' : ''}${(profit100K / 1000).toFixed(1)}M`,
        roi84: `${roi > 0 ? '+' : ''}${roi.toFixed(1)}%`,
        roi99: `${roi99 > 0 ? '+' : ''}${roi99.toFixed(1)}%`
    };
}

console.log('\n======================================================');
console.log('=== CHI TIẾT TỪNG PHƯƠNG PHÁP ĐƠN LẺ NĂM 2026 (283 KỲ) ===');
console.log('======================================================');

const methods2026 = [
    // Daily Advisor Top 20
    evalSingle('DA: MetaLearner (Top 20)', allDates, d => {
        const r = cache.metaLearner?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        return (r?.numbers || []).slice(0, 20).map(numStr);
    }),
    evalSingle('DA: DualMerge (Top 20)', allDates, d => {
        const r = cache.dualMerge?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        const nums = r?.union || [...(r?.intersection || []), ...(r?.uniqueSingles || [])];
        return nums.slice(0, 20).map(numStr);
    }),
    evalSingle('DA: TripleMerge (Top 20)', allDates, d => {
        const r = cache.tripleMerge?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        const nums = r?.fullUnion || [...(r?.tierX3 || []), ...(r?.tierX2 || []), ...(r?.tierX1 || [])];
        return nums.slice(0, 20).map(numStr);
    }),
    evalSingle('DA: StreakAware (Top 20)', allDates, d => {
        const r = cache.streakAwareDeAdvisor?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        return (r?.numbers || []).slice(0, 20).map(numStr);
    }),
    evalSingle('DA: PentaCore (Top 20)', allDates, d => {
        const r = cache.pentaCoreDe?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        return (r?.numbers || []).slice(0, 20).map(numStr);
    }),
    evalSingle('DA: MarkovGap (Top 20)', allDates, d => {
        const r = cache.deMarkovGapHazard?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        return (r?.numbers || []).slice(0, 20).map(numStr);
    }),
    evalSingle('DA: PositionalGraph (Top 20)', allDates, d => {
        const r = cache.dePositionalGraphFlow?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        return (r?.numbers || []).slice(0, 20).map(numStr);
    }),
    // Shadow Top Halves
    evalSingle('Shadow: Hệ 1 (Đa Động Cơ 40s -> 20s)', allDates, d => {
        const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        return (resRow?.de?.numbers40 || []).slice(0, 20).map(numStr);
    }),
    evalSingle('Shadow: Hệ 2 (Tri-Core 24s -> 12s)', allDates, d => {
        const triRow = cache.triCoreDe?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        return (triRow?.numbers || []).slice(0, 12).map(numStr);
    }),
    evalSingle('Shadow: Hệ 3 (VIP Sweet-Spot 36s -> 18s)', allDates, d => {
        const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        return (resRow?.de?.numbers40 || []).slice(0, 18).map(numStr);
    }),
    evalSingle('Shadow: Hệ 4 (Resonance 36s -> 18s)', allDates, d => {
        const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        return (resRow?.de?.numbers36 || []).slice(0, 18).map(numStr);
    }),
    evalSingle('Shadow: Hệ 4 (Resonance VIP 12)', allDates, d => {
        const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        return (resRow?.de?.vip12 || []).map(numStr);
    })
];

console.table(methods2026);

console.log('\n======================================================');
console.log('=== CHI TIẾT TỪNG PHƯƠNG PHÁP ĐƠN LẺ LIVE (28 KỲ TỪ 17/09) ===');
console.log('======================================================');

const methodsLive = [
    // Daily Advisor Top 20
    evalSingle('DA: MetaLearner (Top 20)', liveDates, d => {
        const r = cache.metaLearner?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        return (r?.numbers || []).slice(0, 20).map(numStr);
    }),
    evalSingle('DA: DualMerge (Top 20)', liveDates, d => {
        const r = cache.dualMerge?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        const nums = r?.union || [...(r?.intersection || []), ...(r?.uniqueSingles || [])];
        return nums.slice(0, 20).map(numStr);
    }),
    evalSingle('DA: TripleMerge (Top 20)', liveDates, d => {
        const r = cache.tripleMerge?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        const nums = r?.fullUnion || [...(r?.tierX3 || []), ...(r?.tierX2 || []), ...(r?.tierX1 || [])];
        return nums.slice(0, 20).map(numStr);
    }),
    evalSingle('DA: StreakAware (Top 20)', liveDates, d => {
        const r = cache.streakAwareDeAdvisor?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        return (r?.numbers || []).slice(0, 20).map(numStr);
    }),
    evalSingle('DA: PentaCore (Top 20)', liveDates, d => {
        const r = cache.pentaCoreDe?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        return (r?.numbers || []).slice(0, 20).map(numStr);
    }),
    evalSingle('DA: MarkovGap (Top 20)', liveDates, d => {
        const r = cache.deMarkovGapHazard?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        return (r?.numbers || []).slice(0, 20).map(numStr);
    }),
    evalSingle('DA: PositionalGraph (Top 20)', liveDates, d => {
        const r = cache.dePositionalGraphFlow?.settledLedger?.find(x => String(x.date).slice(0, 10) === d);
        return (r?.numbers || []).slice(0, 20).map(numStr);
    }),
    // Shadow Top Halves
    evalSingle('Shadow: Hệ 1 (Đa Động Cơ 40s -> 20s)', liveDates, d => {
        const dropoffRow = cache.deDropoffMerge?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        return (dropoffRow?.numbers || []).slice(0, 20).map(numStr);
    }),
    evalSingle('Shadow: Hệ 2 (Tri-Core 24s -> 12s)', liveDates, d => {
        const triRow = cache.triCoreDe?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        return (triRow?.numbers || []).slice(0, 12).map(numStr);
    }),
    evalSingle('Shadow: Hệ 3 (VIP Sweet-Spot 36s -> 18s)', liveDates, d => {
        const dropoffRow = cache.deDropoffMerge?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        return (dropoffRow?.numbers36 || (dropoffRow?.numbers || []).slice(0, 36)).slice(0, 18).map(numStr);
    }),
    evalSingle('Shadow: Hệ 4 (Resonance 36s -> 18s)', liveDates, d => {
        const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        return (resRow?.de?.numbers36 || []).slice(0, 18).map(numStr);
    }),
    evalSingle('Shadow: Hệ 4 (Resonance VIP 12)', liveDates, d => {
        const resRow = cache.semanticResonanceSuite?.settledLedger?.find(r => String(r.date).slice(0, 10) === d);
        return (resRow?.de?.vip12 || []).map(numStr);
    })
];

console.table(methodsLive);
