const fs = require('fs');
const path = require('path');

const advPath = path.join(__dirname, '../lib/data/statistics/cached_daily_method_advisor.json');
const adv = JSON.parse(fs.readFileSync(advPath, 'utf8'));

const qmbfLedger = adv.loQuantumBayesFusion?.settledLedger || [];
const lo4Ledger = adv.lo4EngineFusion?.modes?.top6?.settledLedger || [];

const BASE_UNIT_STAKE = 2200; // 100đ = 2.2M (K)
const BASE_UNIT_PAYOUT = 8000; // 100đ ăn 8.0M (K)
const M3_RATIO = 25 / 100;

// Monthly analysis helper
function getMonthlyStats() {
    const months = {};

    qmbfLedger.forEach(row => {
        const d = row.date;
        const mKey = d.substring(0, 7); // YYYY-MM
        if (!months[mKey]) {
            months[mKey] = {
                month: mKey,
                days: 0,
                // Top 7
                top7Wins: 0,
                top7StakeK: 0,
                top7PayoutK: 0,
                top7Hits: 0,
                // Top 10
                top10Wins: 0,
                top10StakeK: 0,
                top10PayoutK: 0,
                top10Hits: 0,
                // Top 20
                top20Wins: 0,
                top20StakeK: 0,
                top20PayoutK: 0,
                top20Hits: 0,
                // 4DC Flat
                lo4FlatWins: 0,
                lo4FlatStakeK: 0,
                lo4FlatPayoutK: 0,
                lo4FlatHits: 0,
                // 4DC Multiplier
                lo4MultWins: 0,
                lo4MultStakeK: 0,
                lo4MultPayoutK: 0,
                lo4MultHits: 0
            };
        }

        const mData = months[mKey];
        mData.days++;

        // Top 7
        const m7 = row.methods?.top7;
        const s7 = 7 * BASE_UNIT_STAKE;
        const p7 = (m7?.hits || 0) * BASE_UNIT_PAYOUT;
        mData.top7StakeK += s7;
        mData.top7PayoutK += p7;
        mData.top7Hits += (m7?.hits || 0);
        if (p7 > s7) mData.top7Wins++;

        // Top 10
        const m10 = row.methods?.top10;
        const s10 = 10 * BASE_UNIT_STAKE;
        const p10 = (m10?.hits || 0) * BASE_UNIT_PAYOUT;
        mData.top10StakeK += s10;
        mData.top10PayoutK += p10;
        mData.top10Hits += (m10?.hits || 0);
        if (p10 > s10) mData.top10Wins++;

        // Top 20
        const m20 = row.methods?.top20;
        const s20 = 20 * BASE_UNIT_STAKE;
        const p20 = (m20?.hits || 0) * BASE_UNIT_PAYOUT;
        mData.top20StakeK += s20;
        mData.top20PayoutK += p20;
        mData.top20Hits += (m20?.hits || 0);
        if (p20 > s20) mData.top20Wins++;
    });

    lo4Ledger.forEach(row => {
        const d = row.date;
        const mKey = d.substring(0, 7);
        if (!months[mKey]) return;
        const mData = months[mKey];

        let fS = 0, fP = 0, fH = 0;
        let mS = 0, mP = 0, mH = 0;

        (row.betNumbers || []).forEach(bn => {
            if (bn.votes >= 2) {
                // Flat
                fS += 1 * BASE_UNIT_STAKE;
                fP += bn.hits * 1 * BASE_UNIT_PAYOUT;
                fH += bn.hits;

                // Multiplier
                mS += bn.multiplier * BASE_UNIT_STAKE;
                mP += bn.hits * bn.multiplier * BASE_UNIT_PAYOUT;
                mH += bn.hits;
            }
        });

        mData.lo4FlatStakeK += fS;
        mData.lo4FlatPayoutK += fP;
        mData.lo4FlatHits += fH;
        if (fP > fS) mData.lo4FlatWins++;

        mData.lo4MultStakeK += mS;
        mData.lo4MultPayoutK += mP;
        mData.lo4MultHits += mH;
        if (mP > mS) mData.lo4MultWins++;
    });

    return months;
}

const monthly = getMonthlyStats();
console.log('=== KẾT QUẢ THỐNG KÊ TỪNG THÁNG TRONG NĂM 2026 ===');

const tableData = Object.values(monthly).map(m => {
    const p7K = m.top7PayoutK - m.top7StakeK;
    const p10K = m.top10PayoutK - m.top10StakeK;
    const p20K = m.top20PayoutK - m.top20StakeK;
    const p4FK = m.lo4FlatPayoutK - m.lo4FlatStakeK;
    const p4MK = m.lo4MultPayoutK - m.lo4MultStakeK;

    return {
        'Tháng': m.month,
        'Số ngày': m.days,
        'Top 7 Lãi (VIP)': (p7K / 1000).toFixed(1) + 'M',
        'Top 7 Win': ((m.top7Wins / m.days) * 100).toFixed(0) + '%',
        'Top 10 Lãi (VIP)': (p10K / 1000).toFixed(1) + 'M',
        'Top 10 Win': ((m.top10Wins / m.days) * 100).toFixed(0) + '%',
        'Top 20 Lãi (VIP)': (p20K / 1000).toFixed(1) + 'M',
        'Top 20 Win': ((m.top20Wins / m.days) * 100).toFixed(0) + '%',
        '4ĐC Đồng Thuận Flat Lãi': (p4FK / 1000).toFixed(1) + 'M',
        '4ĐC Flat Win': ((m.lo4FlatWins / m.days) * 100).toFixed(0) + '%',
        '4ĐC Multiplier Lãi': (p4MK / 1000).toFixed(1) + 'M',
        '4ĐC Multi Win': ((m.lo4MultWins / m.days) * 100).toFixed(0) + '%'
    };
});

console.table(tableData);

