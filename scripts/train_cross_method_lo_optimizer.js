'use strict';

/**
 * train_cross_method_lo_optimizer.js
 * Tự động huấn luyện, tối ưu hóa và kiểm định lưới (Grid-Search Optimizer)
 * cho việc Ghép Tầng Đa Phương Pháp Lô (Cross-Method Multi-Tier Ensemble)
 * trên 261 ngày thực chiến năm 2026 (100% Strict Point-In-Time).
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const cacheFile = path.join(root, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');

if (!fs.existsSync(cacheFile)) {
    console.error('Không tìm thấy cache:', cacheFile);
    process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

const engines = {
    bridge: { id: 'bridge', name: '🕸️ Cầu Đồ Thị Vị Trí (Bridge Flow)', ledger: cache.loPositionalBridgeFlow?.settledLedger || [] },
    hawkes: { id: 'hawkes', name: '⚡ Cụm Tần Suất Cao (Hawkes Cluster)', ledger: cache.loHawkesClustering?.settledLedger || [] },
    qmbf:   { id: 'qmbf',   name: '🌌 Quantum Bayes Fusion 7D (QMBF)', ledger: cache.loQuantumBayesFusion?.settledLedger || [] },
    quad:   { id: 'quad',   name: '🚀 Super-Hybrid Quad-Fusion v7.2', ledger: cache.loQuadHybrid?.settledLedger || [] },
    penta:  { id: 'penta',  name: '⚡ Ngũ Hợp Lô AI v8.0 (Penta-Matrix)', ledger: cache.loPentaMatrix?.settledLedger || [] }
};

const totalDays = 261;
const tierSizes = [1, 2, 4, 7]; // Bạch thủ, Song thủ VIP, Tứ thủ, Thất thủ

function getNumbersForTier(row, size) {
    if (!row) return [];
    if (size === 1) return (row.top1 || row.rankedNumbers?.slice(0, 1) || []).map(Number);
    if (size === 2) return (row.top2 || row.rankedNumbers?.slice(0, 2) || []).map(Number);
    if (size === 4) return (row.top4 || row.rankedNumbers?.slice(0, 4) || []).map(Number);
    if (size === 7) return (row.top7 || row.rankedNumbers?.slice(0, 7) || []).map(Number);
    return (row.top20 || row.rankedNumbers?.slice(0, size) || []).map(Number);
}

console.log('='.repeat(95));
console.log('🚀 HUẤN LUYỆN & TỐI ƯU HÓA LÔ GHÉP TẦNG ĐA PHƯƠNG PHÁP (CROSS-METHOD MULTI-TIER)');
console.log(`📊 Số kỳ quay huấn luyện: ${totalDays} ngày thực chiến năm 2026`);
console.log('='.repeat(95));

// 1. TÌM KIẾM TỔ HỢP 2 ĐỘNG CƠ (PAIRS)
const pairResults = [];
const engineKeys = Object.keys(engines);

for (let i = 0; i < engineKeys.length; i++) {
    for (let j = i + 1; j < engineKeys.length; j++) {
        const k1 = engineKeys[i];
        const k2 = engineKeys[j];

        for (const t1 of tierSizes) {
            for (const t2 of tierSizes) {
                let totalStakeK = 0, totalPayoutK = 0, winDays = 0, hitDays = 0;
                let maxLossStreak = 0, curLossStreak = 0;
                let sumNumbersCount = 0;

                for (let d = 0; d < totalDays; d++) {
                    const row1 = engines[k1].ledger[d];
                    const row2 = engines[k2].ledger[d];
                    if (!row1 || !row2) continue;

                    const actual27 = (row1.actual27 || row2.actual27 || []).map(Number);
                    if (!actual27.length) continue;

                    const nums1 = getNumbersForTier(row1, t1);
                    const nums2 = getNumbersForTier(row2, t2);

                    const numWeight = {};
                    nums1.forEach(n => numWeight[n] = (numWeight[n] || 0) + 1);
                    nums2.forEach(n => numWeight[n] = (numWeight[n] || 0) + 1);

                    const distinctNums = Object.keys(numWeight).map(Number);
                    sumNumbersCount += distinctNums.length;

                    let dayStake = 0, dayPayout = 0;
                    for (const num of distinctNums) {
                        const weight = numWeight[num] >= 2 ? 2 : 1; // Số trùng cược X2
                        const hits = actual27.filter(x => x === num).length;
                        dayStake += weight * 2200;
                        dayPayout += hits * weight * 8000;
                    }

                    const dayProfit = dayPayout - dayStake;
                    totalStakeK += dayStake;
                    totalPayoutK += dayPayout;

                    if (dayPayout > 0) hitDays++;
                    if (dayProfit > 0) {
                        winDays++;
                        curLossStreak = 0;
                    } else {
                        curLossStreak++;
                        if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
                    }
                }

                const profitK = totalPayoutK - totalStakeK;
                const roi = totalStakeK > 0 ? (profitK / totalStakeK) * 100 : 0;
                const winRate = (winDays / totalDays) * 100;
                const hitRate = (hitDays / totalDays) * 100;
                const avgSize = (sumNumbersCount / totalDays).toFixed(1);

                pairResults.push({
                    name: `${engines[k1].id.toUpperCase()}(T${t1}) + ${engines[k2].id.toUpperCase()}(T${t2})`,
                    fullName: `${engines[k1].name} [T${t1}] + ${engines[k2].name} [T${t2}]`,
                    k1, t1, k2, t2,
                    avgSize,
                    winDays, winRate: winRate.toFixed(1) + '%',
                    hitDays, hitRate: hitRate.toFixed(1) + '%',
                    stakeM: (totalStakeK / 1000).toFixed(0) + 'M',
                    profitK,
                    profitM: (profitK >= 0 ? '+' : '') + (profitK / 1000).toFixed(1) + 'M',
                    roi: (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%',
                    maxLossStreak
                });
            }
        }
    }
}

// 2. TÌM KIẾM TỔ HỢP 3 ĐỘNG CƠ (TRIPLES)
const tripleResults = [];
for (let i = 0; i < engineKeys.length; i++) {
    for (let j = i + 1; j < engineKeys.length; j++) {
        for (let k = j + 1; k < engineKeys.length; k++) {
            const k1 = engineKeys[i], k2 = engineKeys[j], k3 = engineKeys[k];
            // Test selected focused tiers (Top 2, Top 4)
            const focusedTiers = [
                [2, 2, 4],
                [2, 4, 4],
                [2, 4, 7],
                [4, 4, 4]
            ];

            for (const [t1, t2, t3] of focusedTiers) {
                let totalStakeK = 0, totalPayoutK = 0, winDays = 0, hitDays = 0;
                let maxLossStreak = 0, curLossStreak = 0;
                let sumNumbersCount = 0;

                for (let d = 0; d < totalDays; d++) {
                    const row1 = engines[k1].ledger[d];
                    const row2 = engines[k2].ledger[d];
                    const row3 = engines[k3].ledger[d];
                    if (!row1 || !row2 || !row3) continue;

                    const actual27 = (row1.actual27 || row2.actual27 || []).map(Number);
                    if (!actual27.length) continue;

                    const nums1 = getNumbersForTier(row1, t1);
                    const nums2 = getNumbersForTier(row2, t2);
                    const nums3 = getNumbersForTier(row3, t3);

                    const numWeight = {};
                    nums1.forEach(n => numWeight[n] = (numWeight[n] || 0) + 1);
                    nums2.forEach(n => numWeight[n] = (numWeight[n] || 0) + 1);
                    nums3.forEach(n => numWeight[n] = (numWeight[n] || 0) + 1);

                    const distinctNums = Object.keys(numWeight).map(Number);
                    sumNumbersCount += distinctNums.length;

                    let dayStake = 0, dayPayout = 0;
                    for (const num of distinctNums) {
                        const weight = numWeight[num] >= 3 ? 3 : (numWeight[num] === 2 ? 2 : 1);
                        const hits = actual27.filter(x => x === num).length;
                        dayStake += weight * 2200;
                        dayPayout += hits * weight * 8000;
                    }

                    const dayProfit = dayPayout - dayStake;
                    totalStakeK += dayStake;
                    totalPayoutK += dayPayout;

                    if (dayPayout > 0) hitDays++;
                    if (dayProfit > 0) {
                        winDays++;
                        curLossStreak = 0;
                    } else {
                        curLossStreak++;
                        if (curLossStreak > maxLossStreak) maxLossStreak = curLossStreak;
                    }
                }

                const profitK = totalPayoutK - totalStakeK;
                const roi = totalStakeK > 0 ? (profitK / totalStakeK) * 100 : 0;
                const winRate = (winDays / totalDays) * 100;
                const hitRate = (hitDays / totalDays) * 100;
                const avgSize = (sumNumbersCount / totalDays).toFixed(1);

                tripleResults.push({
                    name: `${engines[k1].id.toUpperCase()}(T${t1}) + ${engines[k2].id.toUpperCase()}(T${t2}) + ${engines[k3].id.toUpperCase()}(T${t3})`,
                    fullName: `${engines[k1].name} [T${t1}] + ${engines[k2].name} [T${t2}] + ${engines[k3].name} [T${t3}]`,
                    avgSize,
                    winDays, winRate: winRate.toFixed(1) + '%',
                    hitDays, hitRate: hitRate.toFixed(1) + '%',
                    stakeM: (totalStakeK / 1000).toFixed(0) + 'M',
                    profitK,
                    profitM: (profitK >= 0 ? '+' : '') + (profitK / 1000).toFixed(1) + 'M',
                    roi: (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%',
                    maxLossStreak
                });
            }
        }
    }
}

// SORT & DISPLAY
pairResults.sort((a, b) => b.profitK - a.profitK);

console.log('\n🏆 TOP 5 TỔ HỢP GHÉP ĐÔI (PAIRS) LÃI CAO NHẤT NĂM 2026:');
console.log('-'.repeat(95));
console.log('Hạng  Tổ Hợp Ghép Tầng               Số Trung Bình  Ngày Thắng    Tỷ Lệ Nổ    Lợi Nhuận       ROI   Chuỗi Thua');
console.log('-'.repeat(95));
pairResults.slice(0, 5).forEach((r, idx) => {
    console.log(
        `${String(idx + 1).padEnd(4)}  ${r.name.padEnd(28)}  ${(r.avgSize + ' số').padStart(10)}  ${(r.winRate + ' (' + r.winDays + 'd)').padStart(12)}  ${r.hitRate.padStart(10)}  ${r.profitM.padStart(12)}  ${r.roi.padStart(8)}  ${(r.maxLossStreak + ' ngày').padStart(10)}`
    );
});

tripleResults.sort((a, b) => b.profitK - a.profitK);

console.log('\n👑 TOP 5 TỔ HỢP GHÉP BA (TAM TRỤ TRIPLES) LÃI CAO NHẤT NĂM 2026:');
console.log('-'.repeat(95));
console.log('Hạng  Tổ Hợp Ghép Tầng                      Số TB    Ngày Thắng    Tỷ Lệ Nổ    Lợi Nhuận       ROI   Chuỗi Thua');
console.log('-'.repeat(95));
tripleResults.slice(0, 5).forEach((r, idx) => {
    console.log(
        `${String(idx + 1).padEnd(4)}  ${r.name.padEnd(35)}  ${(r.avgSize + ' số').padStart(6)}  ${(r.winRate + ' (' + r.winDays + 'd)').padStart(12)}  ${r.hitRate.padStart(10)}  ${r.profitM.padStart(12)}  ${r.roi.padStart(8)}  ${(r.maxLossStreak + ' ngày').padStart(10)}`
    );
});

console.log('\n' + '='.repeat(95));
console.log('✅ HOÀN TẤT HUẤN LUYỆN TOÁN HỌC CHO LÔ GHÉP TẦNG ĐA PHƯƠNG PHÁP!');
console.log('='.repeat(95));
