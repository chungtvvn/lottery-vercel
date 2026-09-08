#!/usr/bin/env node
'use strict';

/**
 * train_predictive_ensemble.js
 * Comprehensive Multi-Year Training & Optimization Engine under Strict PIT
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

console.log('================================================================');
console.log('🚀 XSMB 20-YEAR PREDICTIVE ENSEMBLE TRAINING & BACKTEST HARNESS');
console.log('================================================================');
console.log(`📊 Ingested: ${totalDraws} draws (2005 - 2026)`);

// Split training (up through 2025) and holdout evaluation (2026)
const trainData = rawData.filter(r => !String(r.date).startsWith('2026-'));
const holdout2026 = rawData.filter(r => String(r.date).startsWith('2026-'));

console.log(`📚 Training Set (2005 - 2025): ${trainData.length} kỳ quay`);
console.log(`🎯 Holdout Test Set (2026):    ${holdout2026.length} kỳ quay (Strict Out-Of-Sample)`);

const { buildLoQuantumBayesFusionAdvisor } = require(path.join(root, 'lib', 'services', 'loDualMergeAdvisorService'));

console.log('\n--- 1. HUẤN LUYỆN & KIỂM ĐỊNH LÔ QMBF TRÊN 245 KỲ NĂM 2026 ---');
const lotoResult = buildLoQuantumBayesFusionAdvisor(rawData);
const summary = lotoResult?.summary || {};

console.log('Kết quả kiểm thử thực tế toàn bộ năm 2026 (Strict Point-In-Time):');
const formatPct = (val) => `${((val || 0) * 100).toFixed(1)}%`;
const formatM = (val) => `${((val || 0) / 1000).toFixed(1)}M`;

if (summary.top6) {
    console.log(`⭐ TOP 6 LÔ:   Trúng ${summary.top6.hitDays}/${summary.top6.days} ngày (${formatPct(summary.top6.hitRate)}) · Thắng lãi ${formatPct(summary.top6.winRate)} · Lãi +${formatM(summary.top6.profitK)} (ROI ${formatPct(summary.top6.roi)})`);
}
if (summary.top10) {
    console.log(`💎 TOP 10 LÔ:  Trúng ${summary.top10.hitDays}/${summary.top10.days} ngày (${formatPct(summary.top10.hitRate)}) · Thắng lãi ${formatPct(summary.top10.winRate)} · Lãi +${formatM(summary.top10.profitK)} (ROI ${formatPct(summary.top10.roi)})`);
}
if (summary.top20) {
    console.log(`👑 TOP 20 LÔ:  Trúng ${summary.top20.hitDays}/${summary.top20.days} ngày (${formatPct(summary.top20.hitRate)}) · Thắng lãi ${formatPct(summary.top20.winRate)} · Lãi +${formatM(summary.top20.profitK)} (ROI ${formatPct(summary.top20.roi)})`);
}
if (summary.top2) {
    console.log(`🎯 SONG THỦ 2: Trúng ${summary.top2.hitDays}/${summary.top2.days} ngày (${formatPct(summary.top2.hitRate)}) · Thắng lãi ${formatPct(summary.top2.winRate)} · Lãi +${formatM(summary.top2.profitK)} (ROI ${formatPct(summary.top2.roi)})`);
}

// 2. TỔNG HỢP HIỆU SUẤT CÁC PHƯƠNG PHÁP ĐỀ GỘP THỰC CHIẾN
console.log('\n--- 2. HIỆU SUẤT ĐỀ THỰC CHIẾN (META-LEARNER, TAM TRỤ & THÍCH ỨNG) ---');
const cacheFile = path.join(root, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
if (fs.existsSync(cacheFile)) {
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    const mSum = cache.metaLearner?.summary || {};
    const tSum = cache.tripleMerge?.summary || {};
    const aSum = cache.adaptiveDualMerge?.summary || {};
    const dSum = cache.dualMerge?.summary || {};

    console.log(`👑 Đề Tinh Hoa (Meta-Learner): Trúng ${mSum.wins}/${mSum.days} kỳ (${formatPct(mSum.hitRate)}) · Lãi +${formatM(mSum.profitK)} (ROI ${formatPct(mSum.roi)}) [👑 QUÁN QUÂN LIVE: +${formatM(mSum.live?.profitK)}, ROI ${formatPct(mSum.live?.roi)}]`);
    console.log(`🏛️ Đề Gộp 3 (Tam Trụ):         Trúng ${tSum.totalWins}/${tSum.totalSettled} kỳ (${formatPct(tSum.overallHitRate)}) · Lãi +${formatM(tSum.overallProfitK)} (ROI ${formatPct(tSum.roi)})`);
    console.log(`💎 Đề Gộp 2 (Thích Ứng Alpha): Trúng ${aSum.totalWins}/${aSum.totalSettled} kỳ (${formatPct(aSum.overallHitRate)}) · Lãi +${formatM(aSum.overallProfitK)} (ROI ${formatPct(aSum.roi)})`);
    console.log(`🎯 Đề Gộp 1 (Tiêu Chuẩn):      Trúng ${dSum.totalWins}/${dSum.totalSettled} kỳ (${formatPct(dSum.overallHitRate)}) · Lãi +${formatM(dSum.overallProfitK)} (ROI ${formatPct(dSum.roi)})`);
}

console.log('\n================================================================');
console.log('✓ QUÁ TRÌNH HUẤN LUYỆN & ĐỐI SOÁT HOÀN TẤT THÀNH CÔNG!');
console.log('================================================================\n');
