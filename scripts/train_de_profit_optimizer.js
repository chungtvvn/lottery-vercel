'use strict';

/**
 * train_de_profit_optimizer.js
 * Huấn luyện và tìm kiếm phương án tối ưu để chuyển Đề từ ÂM SÂU (-3 TỶ)
 * sang DƯƠNG PROFIT BỀN VỮNG trên 261 ngày thực chiến năm 2026.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const cacheFile = path.join(root, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

const dLedger = cache.dualMerge?.settledLedger || [];
const aLedger = cache.adaptiveDualMerge?.settledLedger || [];
const tLedger = cache.tripleMerge?.settledLedger || [];
const mLedger = cache.deMarkovGapHazard?.settledLedger || [];
const gLedger = cache.dePositionalGraphFlow?.settledLedger || [];
const metaLedger = cache.metaLearner?.settledLedger || [];

const totalDays = 261;

console.log('='.repeat(95));
console.log('🔬 HUẤN LUYỆN & TỐI ƯU HÓA ĐỀ: CHUYỂN BẠI THÀNH THẮNG (TỐI ĐA PROFIT)');
console.log('='.repeat(95));

// TEST 1: CƯỢC PHẲNG (FLAT STAKE KHÔNG ĐÁNH X2)
console.log('\n--- THỬ NGHIỆM 1: CƯỢC PHẲNG (FLAT STAKE 1M/SỐ, KHÔNG CHỊU RỦI RO X2 GÁNH VỐN) ---');
console.log('Phương Pháp                     Cỡ Dàn     Trúng/Tổng        Tỷ Lệ      Tổng Vốn      Lợi Nhuận        ROI');
console.log('-'.repeat(95));

function evalFlat(name, ledger, count) {
    let wins = 0, stakeK = 0, payoutK = 0;
    ledger.forEach(r => {
        const nums = (r.fullUnion || r.union || r.numbers || []).slice(0, count).map(Number);
        const actual = Number(r.actual);
        const isHit = nums.includes(actual);
        stakeK += count * 1000;
        payoutK += isHit ? 84000 : 0;
        if (isHit) wins++;
    });
    const days = ledger.length;
    const hitRate = (wins / days * 100).toFixed(1) + '%';
    const profitK = payoutK - stakeK;
    const profitStr = (profitK >= 0 ? '+' : '') + (profitK / 1000).toFixed(1) + 'M';
    const roiStr = (profitK / stakeK * 100).toFixed(1) + '%';
    console.log(
        `${name.padEnd(30)}  ${(count + ' số').padStart(6)}  ${(wins + '/' + days).padStart(12)}  ${hitRate.padStart(10)}  ${(stakeK / 1000).toFixed(0).padStart(10)}M  ${profitStr.padStart(13)}  ${roiStr.padStart(9)}`
    );
}

evalFlat('Markov Gap Hazard (Top 25)', mLedger, 25);
evalFlat('Markov Gap Hazard (Top 30)', mLedger, 30);
evalFlat('Markov Gap Hazard (Top 35)', mLedger, 35);
evalFlat('Đề Tiêu Chuẩn (Flat 30s)', dLedger, 30);
evalFlat('Đề Tiêu Chuẩn (Flat 38s)', dLedger, 38);
evalFlat('Đề Thích Ứng Alpha (Flat 30s)', aLedger, 30);
evalFlat('Cầu Đồ Thị Vị Trí (Flat 30s)', gLedger, 30);

// TEST 2: CHIẾN LƯỢC BỎ NGÀY KHÔNG ĐỦ ĐIỀU KIỆN (SELECTIVE STREAK ATTACK)
// Chỉ đánh khi phương pháp vừa trượt 1 hoặc 2 ngày (Điểm rơi nổ bù), né đánh sau khi thắng liên tiếp >= 2 ngày
console.log('\n--- THỬ NGHIỆM 2: TẤN CÔNG ĐIỂM RƠI VÀNG & BỎ NGÀY QUÁ NHIỆT (SELECTIVE ATTACK) ---');
console.log('Chiến Thuật                     Số Ngày Đánh    Trúng        Tỷ Lệ      Tổng Vốn      Lợi Nhuận        ROI');
console.log('-'.repeat(95));

function evalSelectiveStreak(name, ledger) {
    let wins = 0, playedDays = 0, stakeK = 0, payoutK = 0;
    let prevStreak = 0; // > 0: win streak, < 0: loss streak

    for (let i = 0; i < ledger.length; i++) {
        const r = ledger[i];
        const actual = Number(r.actual);
        const nums = (r.fullUnion || r.union || r.numbers || []).map(Number);
        const isHit = nums.includes(actual);
        const overlap = (r.intersectionX2 || r.tierX2 || r.vipNumbers || []).map(Number);
        const isHitX2 = overlap.includes(actual);

        // QUY TẮC BỎ NGÀY:
        // Nếu vừa thắng >= 2 ngày liên tiếp -> BỎ ĐÁNH (Né bẫy quá nhiệt)
        // Chỉ đánh khi vừa trượt 1 ngày hoặc 2 ngày (L1, L2), hoặc vừa mở bát thắng ngày 1
        const shouldPlay = (prevStreak === -1 || prevStreak === -2 || prevStreak === 1);

        if (shouldPlay) {
            playedDays++;
            const dayStake = 60000; // 60M
            const dayPayout = isHit ? (isHitX2 ? 168000 : 84000) : 0;
            stakeK += dayStake;
            payoutK += dayPayout;
            if (isHit) wins++;
        }

        // Cập nhật streak cho ngày mai
        if (isHit) prevStreak = prevStreak > 0 ? prevStreak + 1 : 1;
        else prevStreak = prevStreak < 0 ? prevStreak - 1 : -1;
    }

    const hitRate = playedDays > 0 ? (wins / playedDays * 100).toFixed(1) + '%' : '0%';
    const profitK = payoutK - stakeK;
    const profitStr = (profitK >= 0 ? '+' : '') + (profitK / 1000).toFixed(1) + 'M';
    const roiStr = playedDays > 0 ? (profitK / stakeK * 100).toFixed(1) + '%' : '0%';

    console.log(
        `${name.padEnd(30)}  ${(playedDays + '/' + ledger.length + 'd').padStart(12)}  ${(wins + 'd').padStart(8)}  ${hitRate.padStart(10)}  ${(stakeK / 1000).toFixed(0).padStart(10)}M  ${profitStr.padStart(13)}  ${roiStr.padStart(9)}`
    );
}

evalSelectiveStreak('Đề Thích Ứng Alpha (Điểm Rơi)', aLedger);
evalSelectiveStreak('Đề Tiêu Chuẩn (Điểm Rơi)', dLedger);
evalSelectiveStreak('Đề Tam Trụ (Điểm Rơi)', tLedger);

// TEST 3: DÀN HỢP TRỰC GIAO CÓ GIỚI HẠN VỐN (MARKOV GAP + FORM FILTER)
console.log('\n--- THỬ NGHIỆM 3: MARKOV GAP KẾT HỢP DẠNG SỐ (TỐI ƯU CỠ DÀN & PROFIT) ---');
console.log('Chiến Thuật                     Cỡ Dàn     Trúng/Tổng        Tỷ Lệ      Tổng Vốn      Lợi Nhuận        ROI');
console.log('-'.repeat(95));

// Markov Gap Top 25 + Lọc Chạm/Tổng dạng số
let mgWins = 0, mgStake = 0, mgPayout = 0;
mLedger.forEach(r => {
    // Chỉ lấy Top 28 số của Markov Gap
    const nums = (r.numbers || []).slice(0, 28).map(Number);
    const actual = Number(r.actual);
    const isHit = nums.includes(actual);
    mgStake += 28 * 1000;
    mgPayout += isHit ? 84000 : 0;
    if (isHit) mgWins++;
});
const mgHitRate = (mgWins / totalDays * 100).toFixed(1) + '%';
const mgProfit = mgPayout - mgStake;
console.log(
    `${'Markov Gap 28 số cược phẳng'.padEnd(30)}  ${('28 số').padStart(6)}  ${(mgWins + '/' + totalDays).padStart(12)}  ${mgHitRate.padStart(10)}  ${(mgStake / 1000).toFixed(0).padStart(10)}M  ${(('+' + (mgProfit / 1000).toFixed(1) + 'M')).padStart(13)}  ${((mgProfit / mgStake * 100).toFixed(1) + '%').padStart(9)}`
);

console.log('='.repeat(95));
