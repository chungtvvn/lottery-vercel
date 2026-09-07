#!/usr/bin/env node
'use strict';

/**
 * analyze_number_forms.js
 * Scans 20+ years of XSMB lottery draws (2005-2026) for Number Forms, Chains & Markov Transitions
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../../../');
const rawFile = path.join(root, 'lib', 'data', 'xsmb-2-digits.json');

if (!fs.existsSync(rawFile)) {
    console.error('❌ Data file not found:', rawFile);
    process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
const totalDraws = rawData.length;
const latestDraw = rawData[totalDraws - 1];

console.log('================================================================');
console.log('🔍 XSMB 20-YEAR NUMBER FORM & SEQUENCE SCANNER (2005 - 2026)');
console.log('================================================================');
console.log(`📊 Tổng số kỳ quay phân tích: ${totalDraws} kỳ (Từ ${rawData[0].date} đến ${latestDraw.date})`);
console.log(`🎯 Kỳ quay gần nhất: ${latestDraw.date} - Giải Đặc Biệt: ${String(latestDraw.special).padStart(2, '0')}`);

// 1. Phân Tích Chạm (0-9)
const chamCounts = Array(10).fill(0);
const chamLastSeen = Array(10).fill(0);

rawData.forEach((row, idx) => {
    const s = Number(row.special);
    if (!Number.isInteger(s)) return;
    const d1 = Math.floor(s / 10);
    const d2 = s % 10;
    chamCounts[d1]++;
    chamLastSeen[d1] = idx;
    if (d1 !== d2) {
        chamCounts[d2]++;
        chamLastSeen[d2] = idx;
    }
});

console.log('\n--- 1. BẢNG THỐNG KÊ 10 CHẠM (20 NĂM) ---');
console.log('Chạm | Xuất hiện | Tỷ lệ (%) | Nhịp rơi hiện tại (ngày)');
for (let c = 0; c < 10; c++) {
    const rate = ((chamCounts[c] / totalDraws) * 100).toFixed(1);
    const gap = totalDraws - 1 - chamLastSeen[c];
    console.log(`  ${c}  |   ${String(chamCounts[c]).padStart(5)}   |   ${rate}%   |  ${gap} ngày chưa về`);
}

// 2. Phân Tích Tổng (0-9 modulo 10)
const tongCounts = Array(10).fill(0);
const tongLastSeen = Array(10).fill(0);
const markovTong = Array.from({ length: 10 }, () => Array(10).fill(0));

let prevTong = null;
rawData.forEach((row, idx) => {
    const s = Number(row.special);
    if (!Number.isInteger(s)) return;
    const d1 = Math.floor(s / 10);
    const d2 = s % 10;
    const tong = (d1 + d2) % 10;
    tongCounts[tong]++;
    tongLastSeen[tong] = idx;

    if (prevTong !== null) {
        markovTong[prevTong][tong]++;
    }
    prevTong = tong;
});

console.log('\n--- 2. BẢNG THỐNG KÊ 10 TỔNG (MODULO 10) ---');
console.log('Tổng | Xuất hiện | Tỷ lệ (%) | Nhịp rơi hiện tại (ngày)');
for (let t = 0; t < 10; t++) {
    const rate = ((tongCounts[t] / totalDraws) * 100).toFixed(1);
    const gap = totalDraws - 1 - tongLastSeen[t];
    console.log(`  ${t}  |   ${String(tongCounts[t]).padStart(5)}   |   ${rate}%   |  ${gap} ngày chưa về`);
}

// 3. Ma Trận Chuyển Tiếp Markov của Tổng từ kỳ gần nhất
const lastTong = (Math.floor(latestDraw.special / 10) + (latestDraw.special % 10)) % 10;
console.log(`\n--- 3. XÁC SUẤT MARKOV TỔNG KỲ TIẾP THEO (TỪ TỔNG ${lastTong}) ---`);
const transitionsFromLastTong = markovTong[lastTong];
const sumTransitions = transitionsFromLastTong.reduce((a, b) => a + b, 0);
const sortedTongMarkov = transitionsFromLastTong.map((cnt, t) => ({
    tong: t,
    count: cnt,
    prob: ((cnt / sumTransitions) * 100).toFixed(1)
})).sort((a, b) => b.count - a.count);

console.log('Top 3 Tổng có xác suất chuyển tiếp cao nhất từ Tổng ' + lastTong + ':');
sortedTongMarkov.slice(0, 3).forEach((item, r) => {
    console.log(`  Top ${r + 1}: Tổng ${item.tong} -> Xác suất ${item.prob}% (Đã xảy ra ${item.count} lần trong 20 năm)`);
});

// 4. Phân Tích Parity 4 Trạng Thái (CC, CL, LC, LL)
const parityCounts = { CC: 0, CL: 0, LC: 0, LL: 0 };
const markovParity = {
    CC: { CC: 0, CL: 0, LC: 0, LL: 0 },
    CL: { CC: 0, CL: 0, LC: 0, LL: 0 },
    LC: { CC: 0, CL: 0, LC: 0, LL: 0 },
    LL: { CC: 0, CL: 0, LC: 0, LL: 0 }
};

let prevParity = null;
rawData.forEach(row => {
    const s = Number(row.special);
    if (!Number.isInteger(s)) return;
    const d1 = Math.floor(s / 10);
    const d2 = s % 10;
    const p1 = d1 % 2 === 0 ? 'C' : 'L';
    const p2 = d2 % 2 === 0 ? 'C' : 'L';
    const state = `${p1}${p2}`;
    parityCounts[state]++;

    if (prevParity) {
        markovParity[prevParity][state]++;
    }
    prevParity = state;
});

const lastParity = `${Math.floor(latestDraw.special / 10) % 2 === 0 ? 'C' : 'L'}${latestDraw.special % 2 === 0 ? 'C' : 'L'}`;
console.log(`\n--- 4. MA TRẬN CHUYỂN TIẾP PARITY (CHẴN/LẺ) TỪ TRẠNG THÁI ${lastParity} ---`);
const parityTrans = markovParity[lastParity];
const totalParityTrans = Object.values(parityTrans).reduce((a, b) => a + b, 0);
Object.entries(parityTrans)
    .map(([st, cnt]) => ({ state: st, count: cnt, prob: ((cnt / totalParityTrans) * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count)
    .forEach((item, r) => {
        console.log(`  Top ${r + 1}: Dạng ${item.state} -> Xác suất ${item.prob}% (${item.count} lần)`);
    });

console.log('\n================================================================');
console.log('✓ QUÉT DẠNG SỐ & CHUỖI MARKOV HOÀN TẤT!');
console.log('================================================================');
