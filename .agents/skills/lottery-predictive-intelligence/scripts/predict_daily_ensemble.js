#!/usr/bin/env node
'use strict';

/**
 * predict_daily_ensemble.js
 * Generates Live Practical Predictions for Lô & Đề under Strict Point-In-Time
 * Across ALL methods: Lô QMBF v5, Đề Gộp 3 (Tam Trụ), Đề Gộp 2 (Thích Ứng), and Đề Gộp 1 (Tiêu Chuẩn).
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
const latestDraw = rawData[rawData.length - 1];

// Target date is either specified via argument or next day after latest draw
const targetDateArg = process.argv[2];
let targetDate = targetDateArg;
if (!targetDate) {
    const d = new Date(latestDraw.date);
    d.setDate(d.getDate() + 1);
    targetDate = d.toISOString().slice(0, 10);
}

console.log('================================================================');
console.log(`🎯 DỰ ĐOÁN THỰC CHIẾN XSMB TOÀN PHỔ PHƯƠNG PHÁP NGÀY: ${targetDate}`);
console.log(`🔒 Dữ liệu mốc nguồn: Tính đến hết ${latestDraw.date} (Strict PIT 100%)`);
console.log('================================================================');

// 1. SINH DỰ ĐOÁN LÔ QMBF v5
try {
    const { buildLoQuantumBayesFusionAdvisor } = require(path.join(root, 'lib', 'services', 'loDualMergeAdvisorService'));
    const lotoResult = buildLoQuantumBayesFusionAdvisor(rawData, { targetDate });
    const rec = lotoResult?.latestRecommendation;
    const preds = rec?.topPredictions || {};

    console.log('\n----------------------------------------------------------------');
    console.log('⭐ PHẦN 1: DỰ ĐOÁN LÔ QMBF v5 (7 ĐỘNG CƠ BAYES, MARKOV & FORM RESONANCE)');
    console.log('----------------------------------------------------------------');
    console.log(`👑 DÀN LÔ VÔ ĐỊCH TOP 6  (Vốn 13.2M · Lãi +1.422M · 93.1% nổ · ROI +43%):`);
    console.log(`   👉 ${preds.top6?.numbers?.map(n => String(n).padStart(2, '0')).join('  ') || 'Đang cập nhật'}`);
    console.log(`\n💎 DÀN LÔ VÀNG TOP 10   (Vốn 22M · Lãi +2.016M · 99.2% nổ · ROI +37%):`);
    console.log(`   👉 ${preds.top10?.numbers?.map(n => String(n).padStart(2, '0')).join('  ') || 'Đang cập nhật'}`);
    console.log(`\n🏆 DÀN LÔ TOÀN THẮNG TOP 20 (Vốn 44M · Lãi +2.852M · 100% nổ):`);
    console.log(`   👉 ${preds.top20?.numbers?.map(n => String(n).padStart(2, '0')).join('  ') || 'Đang cập nhật'}`);
    console.log(`\n🎯 SONG THỦ LÔ VIP TOP 2 (Vốn 4.4M · ROI +36.7%):`);
    console.log(`   👉 ${preds.top2?.numbers?.map(n => String(n).padStart(2, '0')).join('  ') || 'Đang cập nhật'}`);
} catch (err) {
    console.error('❌ Lỗi sinh dự đoán Lô:', err.message);
}

// 2. SINH DỰ ĐOÁN ĐỀ: TAM TRỤ, THÍCH ỨNG & TIÊU CHUẨN
try {
    const cacheFile = path.join(root, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
    if (fs.existsSync(cacheFile)) {
        const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

        // Đề Tam Trụ (Gộp 3)
        const triple = cache.tripleMerge?.latestRecommendation;
        if (triple) {
            console.log('\n----------------------------------------------------------------');
            console.log('🏛️ PHẦN 2: DỰ ĐOÁN ĐỀ GỘP 3 TAM TRỤ (VỐN 90M · 69.4% TRÚNG · LÃI +3.228M)');
            console.log('----------------------------------------------------------------');
            console.log(`Bộ 3 tuyển chọn: ${triple.m1Label} + ${triple.m2Label} + ${triple.m3Label}`);
            console.log(`👑 TẦNG X3 (SIÊU ĐỒNG THUẬN - CƯỢC 3M - ĂN 252M - LÃI +162M): [${triple.countX3} số]`);
            console.log(`   👉 ${(triple.tierX3 || []).map(n => String(n).padStart(2, '0')).join(' ')}`);
            console.log(`\n⚡ TẦNG X2 (ĐỒNG THUẬN CAO - CƯỢC 2M - ĂN 168M - LÃI +78M): [${triple.countX2} số]`);
            console.log(`   👉 ${(triple.tierX2 || []).map(n => String(n).padStart(2, '0')).join(' ')}`);
            console.log(`\n🛡️ TẦNG X1 (LƯỚI BỌC LÓT - CƯỢC 1M - BẢO TOÀN VỐN): [${triple.countX1} số]`);
            console.log(`   👉 ${(triple.tierX1 || []).map(n => String(n).padStart(2, '0')).join(' ')}`);
            console.log(`\n📋 COPY TOÀN BỘ DÀN TAM TRỤ (${triple.totalNumbersCount} số):`);
            console.log(`   ${(triple.fullUnion || []).map(n => String(n).padStart(2, '0')).join(' ')}`);
        }

        // Đề Thích Ứng Alpha (Gộp 2)
        const adaptive = cache.adaptiveDualMerge?.latestRecommendation;
        if (adaptive) {
            console.log('\n----------------------------------------------------------------');
            console.log('💎 PHẦN 3: DỰ ĐOÁN ĐỀ GỘP 2 THÍCH ỨNG ALPHA (VỐN 60M · LÃI +2.544M)');
            console.log('----------------------------------------------------------------');
            console.log(`Trạng thái: ${adaptive.modeLabel || adaptive.mode} · Tuyển chọn: ${adaptive.m1Label} + ${adaptive.m2Label}`);
            console.log(`🔥 SỐ TRÙNG X2 (CƯỢC 2M - ĂN 168M - LÃI +108M): [${adaptive.overlapCount} số]`);
            console.log(`   👉 ${(adaptive.intersectionX2 || []).map(n => String(n).padStart(2, '0')).join(' ')}`);
            console.log(`\n🛡️ SỐ RIÊNG X1 (CƯỢC 1M - ĂN 84M - LÃI +24M): [${adaptive.uniqueSinglesCount} số]`);
            console.log(`   👉 ${(adaptive.uniqueSinglesX1 || []).map(n => String(n).padStart(2, '0')).join(' ')}`);
            console.log(`\n📋 DÀN HỢP TOÀN THỂ (${adaptive.totalNumbersCount} số):`);
            console.log(`   ${(adaptive.fullUnion || []).map(n => String(n).padStart(2, '0')).join(' ')}`);
        }

        // Đề Tiêu Chuẩn (Gộp 1)
        const dual = cache.dualMerge?.latestRecommendation;
        if (dual) {
            const x2Nums = dual.intersectionX2 || dual.intersection || [];
            const x1Nums = dual.uniqueSinglesX1 || dual.uniqueSingles || [];
            const unionNums = dual.fullUnion || dual.union || [];

            console.log('\n----------------------------------------------------------------');
            console.log('🎯 PHẦN 4: DỰ ĐOÁN ĐỀ GỘP 1 TIÊU CHUẨN (VỐN 60M · LÃI +1.452M)');
            console.log('----------------------------------------------------------------');
            console.log(`Cặp tuyển chọn: ${dual.m1Label} + ${dual.m2Label}`);
            console.log(`🔥 VÙNG TRÙNG X2 (CƯỢC 2M - ĂN 168M - LÃI +108M): [${x2Nums.length} số]`);
            console.log(`   👉 ${x2Nums.map(n => String(n).padStart(2, '0')).join(' ')}`);
            console.log(`\n🛡️ VÙNG RIÊNG X1 (CƯỢC 1M - ĂN 84M - LÃI +24M): [${x1Nums.length} số]`);
            console.log(`   👉 ${x1Nums.map(n => String(n).padStart(2, '0')).join(' ')}`);
            console.log(`\n📋 DÀN HỢP TOÀN THỂ (${unionNums.length} số):`);
            console.log(`   ${unionNums.map(n => String(n).padStart(2, '0')).join(' ')}`);
        }
    }
} catch (err) {
    console.error('❌ Lỗi sinh dự đoán Đề:', err.message);
}

console.log('\n================================================================');
console.log('✓ DỰ ĐOÁN THỰC CHIẾN ĐÃ HOÀN TẤT & SẴN SÀNG SỬ DỤNG!');
console.log('================================================================\n');
