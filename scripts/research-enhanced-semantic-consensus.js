#!/usr/bin/env node
'use strict';

/**
 * scripts/research-enhanced-semantic-consensus.js
 *
 * NGHIÊN CỨU TỐI ƯU HÓA ĐỘ CHÍNH XÁC:
 * DUNG HỢP ĐỒNG THUẬN 4 ĐỘNG CƠ + KHÔNG GIAN DẠNG SỐ & CHUỖI NHỊP RƠI
 * (Enhanced Multi-Semantic Consensus Engine - EMSC v1)
 *
 * Đánh giá trên 275 kỳ năm 2026 (100% Strict PIT).
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rawFile = path.join(root, 'lib', 'data', 'xsmb-2-digits.json');
const cachePath = path.join(root, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');

const rawRows = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
const advisorCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

// Ánh xạ 15 Bộ số
const BO_MAP = [
    [0, 55, 5, 50],             // Bộ 00
    [11, 66, 16, 61],           // Bộ 11
    [22, 77, 27, 72],           // Bộ 22
    [33, 88, 38, 83],           // Bộ 33
    [44, 99, 49, 94],           // Bộ 44
    [1, 10, 6, 60, 51, 15, 56, 65], // Bộ 01
    [2, 20, 7, 70, 25, 52, 57, 75], // Bộ 02
    [3, 30, 8, 80, 35, 53, 58, 85], // Bộ 03
    [4, 40, 9, 90, 45, 54, 59, 95], // Bộ 04
    [12, 21, 17, 71, 26, 62, 67, 76], // Bộ 12
    [13, 31, 18, 81, 36, 63, 68, 86], // Bộ 13
    [14, 41, 19, 91, 46, 64, 69, 96], // Bộ 14
    [23, 32, 28, 82, 37, 73, 78, 87], // Bộ 23
    [24, 42, 29, 92, 47, 74, 79, 97], // Bộ 24
    [34, 43, 39, 93, 48, 84, 89, 98]  // Bộ 34
];

const NUM_TO_BO = new Int8Array(100);
BO_MAP.forEach((arr, bIdx) => {
    arr.forEach(n => { NUM_TO_BO[n] = bIdx; });
});

function extract27(row) {
    if (!row) return [];
    if (Array.isArray(row.actual27)) return row.actual27.map(Number);
    if (Array.isArray(row.prizes)) return row.prizes.map(Number);
    const prizes = [];
    if (row.special !== undefined && row.special !== null) prizes.push(Number(row.special));
    if (row.prize1 !== undefined && row.prize1 !== null) prizes.push(Number(row.prize1));
    for (let i = 1; i <= 2; i++) if (row[`prize2_${i}`] !== undefined) prizes.push(Number(row[`prize2_${i}`]));
    for (let i = 1; i <= 6; i++) if (row[`prize3_${i}`] !== undefined) prizes.push(Number(row[`prize3_${i}`]));
    for (let i = 1; i <= 4; i++) if (row[`prize4_${i}`] !== undefined) prizes.push(Number(row[`prize4_${i}`]));
    for (let i = 1; i <= 6; i++) if (row[`prize5_${i}`] !== undefined) prizes.push(Number(row[`prize5_${i}`]));
    for (let i = 1; i <= 3; i++) if (row[`prize6_${i}`] !== undefined) prizes.push(Number(row[`prize6_${i}`]));
    for (let i = 1; i <= 4; i++) if (row[`prize7_${i}`] !== undefined) prizes.push(Number(row[`prize7_${i}`]));
    return prizes.filter(v => !isNaN(v));
}

function getMethodNumbers(methodKey, d) {
    let ledger = advisorCache[methodKey]?.settledLedger;
    if (!ledger && methodKey === 'deMarkovGapHazard') {
        ledger = advisorCache.streakAwareDeAdvisor?.markovAdvisor?.settledLedger;
    }
    const r = ledger?.find(row => String(row.date || row.predictionDate).slice(0, 10) === d);
    if (!r) return [];
    if (methodKey === 'metaLearner') return (r.numbers || []).map(Number);
    if (methodKey === 'dualMerge') return [...(r.intersectionX2 || []), ...(r.uniqueSinglesX1 || [])].map(Number);
    if (methodKey === 'deMarkovGapHazard' || methodKey === 'pentaCoreDe') {
        return (r.numbers || [...(r.vipNumbers || []), ...(r.backupNumbers || [])]).map(Number);
    }
    return (r.numbers || []).map(Number);
}

const dates = (advisorCache.adaptiveDualMerge?.settledLedger || [])
    .map(r => String(r.date || r.predictionDate).slice(0, 10))
    .filter(dt => dt && dt.startsWith('2026'))
    .sort();

console.log('================================================================');
console.log(`Audited dates: ${dates.length} draws in 2026 (Strict PIT)`);
console.log('================================================================\n');

// Grid test các cấu hình trọng số kết hợp
const experimentConfigs = [
    {
        name: 'Baseline Consensus 4 Động Cơ (Hiện Hành)',
        wMeta: 3.0, wDual: 2.0, wMarkov: 1.5, wPenta: 1.0,
        boostCham: 0.0, boostTong: 0.0, boostBo: 0.0, boostLoto: 0.0, ganDamp: 0.0
    },
    {
        name: 'V1: Thêm Lô Rơi Đề (Lotto Pull Resonance)',
        wMeta: 3.0, wDual: 2.0, wMarkov: 1.5, wPenta: 1.0,
        boostCham: 0.0, boostTong: 0.0, boostBo: 0.0, boostLoto: 0.8, ganDamp: 0.0
    },
    {
        name: 'V2: Thêm Khử Gan Nặng (Soft Gan Damping > 22)',
        wMeta: 3.0, wDual: 2.0, wMarkov: 1.5, wPenta: 1.0,
        boostCham: 0.0, boostTong: 0.0, boostBo: 0.0, boostLoto: 0.0, ganDamp: 2.5
    },
    {
        name: 'V3: Thêm Chạm Rơi & Tổng Rơi/Bóng',
        wMeta: 3.0, wDual: 2.0, wMarkov: 1.5, wPenta: 1.0,
        boostCham: 0.6, boostTong: 0.5, boostBo: 0.4, boostLoto: 0.0, ganDamp: 0.0
    },
    {
        name: 'V4: Toàn Diện (4 Động Cơ + Lô Rơi + Khử Gan + Dạng Số)',
        wMeta: 3.0, wDual: 2.0, wMarkov: 1.5, wPenta: 1.0,
        boostCham: 0.5, boostTong: 0.4, boostBo: 0.4, boostLoto: 0.7, ganDamp: 2.5
    },
    {
        name: 'V5: Tinh Chỉnh Sắc Nét (Sharp Resonant Consensus)',
        wMeta: 3.5, wDual: 2.2, wMarkov: 1.8, wPenta: 1.2,
        boostCham: 0.6, boostTong: 0.5, boostBo: 0.5, boostLoto: 0.8, ganDamp: 3.0
    }
];

const sortedAll = [...rawRows].sort((a, b) => a.date.localeCompare(b.date));

for (const exp of experimentConfigs) {
    let hits40 = 0, hits36 = 0, hits30 = 0, hits24 = 0;
    let profit40K = 0, profit36K = 0;
    const totalDays = dates.length;

    for (let i = 0; i < dates.length; i++) {
        const dt = dates[i];
        const rawIdx = sortedAll.findIndex(r => String(r.date || r.ngay).slice(0, 10) === dt);
        if (rawIdx <= 0) continue;

        const actualSpecial = Number(sortedAll[rawIdx].special);
        const prevRow = sortedAll[rawIdx - 1];
        const prevSpecial = Number(prevRow.special);
        const prevH = Math.floor(prevSpecial / 10), prevT = prevSpecial % 10;
        const prevSum = (prevH + prevT) % 10;
        const prevBo = NUM_TO_BO[prevSpecial];
        const prev27 = extract27(prevRow);
        const prevLotoSet = new Set(prev27);

        // Tính Gap của 100 số
        const lastSeen = new Int32Array(100).fill(-1);
        for (let k = 0; k < rawIdx; k++) {
            lastSeen[Number(sortedAll[k].special)] = k;
        }

        const scores = new Float32Array(100);

        // Điểm 4 động cơ
        const numsMeta = getMethodNumbers('metaLearner', dt);
        const numsDual = getMethodNumbers('dualMerge', dt);
        const numsMarkov = getMethodNumbers('deMarkovGapHazard', dt);
        const numsPenta = getMethodNumbers('pentaCoreDe', dt);

        numsMeta.forEach(n => scores[n] += exp.wMeta);
        numsDual.forEach(n => scores[n] += exp.wDual);
        numsMarkov.forEach(n => scores[n] += exp.wMarkov);
        numsPenta.forEach(n => scores[n] += exp.wPenta);

        // Hiệu chỉnh Dạng Số & Chuỗi
        for (let n = 0; n < 100; n++) {
            const h = Math.floor(n / 10), t = n % 10;
            const s = (h + t) % 10;
            const b = NUM_TO_BO[n];

            // 1. Chạm rơi
            if (exp.boostCham > 0 && (h === prevH || h === prevT || t === prevH || t === prevT)) {
                scores[n] += exp.boostCham;
            }
            // 2. Tổng rơi hoặc tổng bóng
            if (exp.boostTong > 0 && (s === prevSum || s === (prevSum + 5) % 10)) {
                scores[n] += exp.boostTong;
            }
            // 3. Bộ số
            if (exp.boostBo > 0 && b === prevBo) {
                scores[n] += exp.boostBo;
            }
            // 4. Lô rơi Đề
            if (exp.boostLoto > 0 && prevLotoSet.has(n)) {
                scores[n] += exp.boostLoto;
            }
            // 5. Khử gan nặng
            if (exp.ganDamp > 0) {
                const gap = lastSeen[n] === -1 ? rawIdx : (rawIdx - 1 - lastSeen[n]);
                if (gap >= 22) {
                    scores[n] -= exp.ganDamp;
                }
            }
        }

        const ranked = Array.from({ length: 100 }, (_, n) => n)
            .sort((a, b) => scores[b] - scores[a] || a - b);

        const top24 = ranked.slice(0, 24);
        const top30 = ranked.slice(0, 30);
        const top36 = ranked.slice(0, 36);
        const top40 = ranked.slice(0, 40);

        if (top24.includes(actualSpecial)) hits24++;
        if (top30.includes(actualSpecial)) hits30++;
        if (top36.includes(actualSpecial)) {
            hits36++;
            profit36K += (84000 - 36000);
        } else {
            profit36K -= 36000;
        }

        if (top40.includes(actualSpecial)) {
            hits40++;
            profit40K += (84000 - 40000);
        } else {
            profit40K -= 40000;
        }
    }

    const wr40 = (hits40 / totalDays) * 100;
    const wr36 = (hits36 / totalDays) * 100;
    const wr30 = (hits30 / totalDays) * 100;
    const wr24 = (hits24 / totalDays) * 100;
    const roi40 = (profit40K / (40000 * totalDays)) * 100;
    const roi36 = (profit36K / (36000 * totalDays)) * 100;

    console.log(`📌 [${exp.name}]`);
    console.log(`   - Dàn 40s: ${hits40}/${totalDays} (${wr40.toFixed(1)}%) | Lãi: +${(profit40K/1000).toFixed(1)}M | ROI: +${roi40.toFixed(1)}%`);
    console.log(`   - Dàn 36s: ${hits36}/${totalDays} (${wr36.toFixed(1)}%) | Lãi: +${(profit36K/1000).toFixed(1)}M | ROI: +${roi36.toFixed(1)}%`);
    console.log(`   - Dàn 30s: ${hits30}/${totalDays} (${wr30.toFixed(1)}%)`);
    console.log(`   - Dàn 24s: ${hits24}/${totalDays} (${wr24.toFixed(1)}%)\n`);
}
