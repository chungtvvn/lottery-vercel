'use strict';

const fs = require('fs');
const path = require('path');

const advisorPath = path.join(process.cwd(), 'lib/data/statistics/cached_daily_method_advisor.json');
const adv = JSON.parse(fs.readFileSync(advisorPath, 'utf8'));

const settledLedgers = {
    metaLearner: adv.metaLearner?.settledLedger || [],
    adaptiveDualMerge: adv.adaptiveDualMerge?.settledLedger || [],
    dualMerge: adv.dualMerge?.settledLedger || [],
    tripleMerge: adv.tripleMerge?.settledLedger || [],
    pentaCoreDe: adv.pentaCoreDe?.settledLedger || [],
    deMarkovGapHazard: adv.deMarkovGapHazard?.settledLedger || [],
    dePositionalGraphFlow: adv.dePositionalGraphFlow?.settledLedger || []
};

const allDates = Array.from(new Set(
    settledLedgers.metaLearner.map(r => r.date).filter(Boolean)
)).sort();

console.log('Testing method performance per Phase condition...');

// Test every method under each phase condition
const availableMethods = ['adaptiveDualMerge', 'dualMerge', 'pentaCoreDe', 'deMarkovGapHazard', 'tripleMerge', 'metaLearner'];

// Let's classify every day into its Phase condition based on D-1
const phaseDays = {
    DOUBLE_LOT_KHE: [],     // lotKheStreak >= 2
    POST_LOT_KHE: [],       // lotKheStreak === 1
    AI_OVER_CONSENSUS: [],  // aiWinStreak >= 3 || daysSinceLastLotKhe >= 6
    AI_MOMENTUM: [],        // aiWinStreak in [1, 2]
    EQUILIBRIUM: []         // other
};

let curLotKheStreak = 0;
let curAiWinStreak = 0;
let curDaysSinceLotKhe = 0;

for (let i = 0; i < allDates.length; i++) {
    const date = allDates[i];
    const metaRow = settledLedgers.metaLearner.find(r => r.date === date);
    const adaptiveRow = settledLedgers.adaptiveDualMerge.find(r => r.date === date);
    const actual = Number(metaRow?.actualSpecial ?? adaptiveRow?.actualSpecial);

    // Determine phase from D-1 state
    let phase = 'EQUILIBRIUM';
    if (curLotKheStreak >= 2) phase = 'DOUBLE_LOT_KHE';
    else if (curLotKheStreak === 1) phase = 'POST_LOT_KHE';
    else if (curAiWinStreak >= 3 || curDaysSinceLotKhe >= 6) phase = 'AI_OVER_CONSENSUS';
    else if (curAiWinStreak >= 1) phase = 'AI_MOMENTUM';
    else phase = 'EQUILIBRIUM';

    phaseDays[phase].push({ i, date, actual });

    // Ground truth for next day
    // Count votes on day i
    const pools = [
        metaRow?.numbers || metaRow?.standard30,
        adaptiveRow?.numbers || adaptiveRow?.fullUnion,
        settledLedgers.dualMerge.find(r => r.date === date)?.numbers,
        settledLedgers.tripleMerge.find(r => r.date === date)?.numbers,
        settledLedgers.pentaCoreDe.find(r => r.date === date)?.numbers,
        settledLedgers.deMarkovGapHazard.find(r => r.date === date)?.numbers,
        settledLedgers.dePositionalGraphFlow.find(r => r.date === date)?.numbers
    ].filter(Boolean);

    const voteCounts = Array.from({ length: 100 }, () => 0);
    pools.forEach(pool => {
        (pool || []).forEach(n => {
            const idx = Number(n);
            if (Number.isInteger(idx) && idx >= 0 && idx < 100) voteCounts[idx]++;
        });
    });

    const isLotKhe = (voteCounts[actual] === 0);
    const isAdaptiveHit = Boolean(adaptiveRow?.isHit || (adaptiveRow?.numbers || []).includes(actual));

    if (isLotKhe) {
        curLotKheStreak++;
        curAiWinStreak = 0;
        curDaysSinceLotKhe = 0;
    } else {
        curLotKheStreak = 0;
        curDaysSinceLotKhe++;
        if (isAdaptiveHit) curAiWinStreak++;
        else curAiWinStreak = 0;
    }
}

for (const [pName, days] of Object.entries(phaseDays)) {
    console.log(`\n======================================================`);
    console.log(`PHA: ${pName} (${days.length} ngày)`);
    console.log(`======================================================`);

    for (const m of availableMethods) {
        let wins = 0;
        let x2Wins = 0;
        let totalStakeK = 0;
        let totalPayoutK = 0;

        days.forEach(({ date, actual }) => {
            const r = settledLedgers[m].find(row => row.date === date);
            if (!r) return;

            const x2Nums = r.intersectionX2 || r.tierX2 || r.vipNumbers || [];
            const x1Nums = r.uniqueSinglesX1 || r.singles || r.backupNumbers || [];
            const allNums = r.numbers || r.fullUnion || r.standard30 || [...x2Nums, ...x1Nums];

            const hitX2 = x2Nums.includes(actual);
            const hitX1 = x1Nums.includes(actual) || (allNums.includes(actual) && !hitX2);
            const isHit = hitX2 || hitX1;

            // Mức 3: X2 cược 400K, X1 cược 200K (hoặc phẳng 200K nếu không có X2)
            const hasX2 = x2Nums.length > 0;
            const stake = hasX2 ? (x2Nums.length * 400 + x1Nums.length * 200) : (allNums.length * 200);
            let payout = 0;
            if (hitX2) payout += 400 * 84;
            else if (hitX1) payout += 200 * 84;

            totalStakeK += stake;
            totalPayoutK += payout;
            if (isHit) wins++;
            if (hitX2) x2Wins++;
        });

        const profitK = totalPayoutK - totalStakeK;
        const roi = totalStakeK > 0 ? (profitK / totalStakeK * 100).toFixed(1) : 0;
        console.log(`   ${m.padEnd(23)}: Thắng ${String(wins).padStart(2)}/${days.length} (${(wins / days.length * 100).toFixed(1)}%) · X2: ${String(x2Wins).padStart(2)} · Lãi: ${profitK > 0 ? '+' : ''}${(profitK / 1000).toFixed(1)}M (ROI: ${roi}%)`);
    }
}
