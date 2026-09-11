#!/usr/bin/env node
'use strict';

/**
 * benchmark_all_methods.js
 * Comprehensive benchmarking across ALL Lô and Đề methods on 2026 data (Strict Point-In-Time).
 * 
 * Evaluates:
 * 1. Đề Tinh Hoa (Meta-Learner / Dynamic Ensemble Pruning - Quán Quân Live)
 * 2. Đề Gộp 1: Tiêu Chuẩn (dualMerge)
 * 3. Đề Gộp 2: Thích Ứng Alpha (adaptiveDualMerge)
 * 4. Đề Gộp 3: Tam Trụ (tripleMerge)
 * 5. Đề Đơn Lẻ Nền Tảng (Pool 7 methods)
 * 6. Lô QMBF v6: Top 2, Top 4, Top 6, Top 7, Top 8, Top 10, Top 20
 */

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const cachePath = path.join(root, 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');

if (!fs.existsSync(cachePath)) {
    console.error('[Error] Không tìm thấy tệp cache:', cachePath);
    console.error('Vui lòng chạy `node scripts/generate-daily-method-advisor-cache.js` trước.');
    process.exit(1);
}

const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));

console.log('='.repeat(90));
console.log('🎯 BÁO CÁO BENCHMARK ĐỐI SOÁT TOÀN DIỆN TẤT CẢ PHƯƠNG PHÁP LÔ & ĐỀ (NĂM 2026)');
console.log('='.repeat(90));
console.log(`Dữ liệu cập nhật đến ngày: ${cache.latestDataDate || 'N/A'}`);
console.log(`Kiểm định: 100% Strict Point-In-Time (Không nhìn trước tương lai)\n`);

// -------------------------------------------------------------
// 1. BENCHMARK CÁC PHƯƠNG PHÁP ĐỀ GỘP THỰC CHIẾN
// -------------------------------------------------------------
console.log('🏛️  [PHẦN 1] BẢNG ĐỐI SOÁT CÁC PHƯƠNG PHÁP ĐỀ GỘP THỰC CHIẾN:');
console.log('-'.repeat(90));
console.log(
    'Phương Pháp'.padEnd(28) +
    'Số Ngày'.padStart(8) +
    'Trúng'.padStart(8) +
    'Tỷ Lệ'.padStart(9) +
    'Tổng Vốn'.padStart(12) +
    'Lợi Nhuận'.padStart(13) +
    'ROI'.padStart(9)
);
console.log('-'.repeat(90));

function formatDeRow(name, ledger, dailyStakeK) {
    if (!Array.isArray(ledger) || ledger.length === 0) {
        console.log(`${name.padEnd(28)}: Chưa có dữ liệu đối soát.`);
        return;
    }
    const days = ledger.length;
    const wins = ledger.filter(r => r.hitType?.startsWith('win') || r.isHit).length;
    const hitRate = (wins / days) * 100;
    const totalStakeK = days * dailyStakeK;
    const totalProfitK = ledger.reduce((acc, r) => acc + (r.profitK || 0), 0);
    const roi = (totalProfitK / totalStakeK) * 100;

    const profitStr = (totalProfitK >= 0 ? '+' : '') + (totalProfitK / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'M';
    const stakeStr = (totalStakeK / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'M';
    const roiStr = (roi >= 0 ? '+' : '') + roi.toFixed(1) + '%';

    console.log(
        name.padEnd(28) +
        String(days).padStart(8) +
        String(wins).padStart(8) +
        (hitRate.toFixed(1) + '%').padStart(9) +
        stakeStr.padStart(12) +
        profitStr.padStart(13) +
        roiStr.padStart(9)
    );
}

formatDeRow('👑 Đề Tinh Hoa (Meta-Learner)', cache.metaLearner?.settledLedger, 30000);
formatDeRow('🏛️ Đề Tam Trụ (Gộp 3)', cache.tripleMerge?.settledLedger, 90000);
formatDeRow('💎 Đề Thích Ứng (Gộp 2)', cache.adaptiveDualMerge?.settledLedger, 60000);
formatDeRow('🎯 Đề Tiêu Chuẩn (Gộp 1)', cache.dualMerge?.settledLedger, 60000);
console.log('-'.repeat(90));

// -------------------------------------------------------------
// 2. BENCHMARK CÁC MỨC CƯỢC LÔ QMBF v5
// -------------------------------------------------------------
console.log('\n💎  [PHẦN 2] BẢNG ĐỐI SOÁT PHÂN TẦNG CƯỢC LÔ (QMBF v5 - 7 ĐỘNG CƠ):');
console.log('-'.repeat(90));
console.log(
    'Cấu Hình Lô'.padEnd(22) +
    'Số Ngày'.padStart(8) +
    'Ngày Nổ'.padStart(9) +
    'Tỷ Lệ Nổ'.padStart(10) +
    'Thắng Lãi'.padStart(11) +
    'Tổng Lãi'.padStart(14) +
    'ROI'.padStart(9)
);
console.log('-'.repeat(90));

const lotoSummaries = cache.loQuantumBayesFusion?.summary || cache.loDualMerge?.summary || {};
const topCounts = [2, 4, 6, 7, 8, 10, 20];
const topLabels = {
    2: '⚡ Song Thủ (Top 2)',
    4: '🎯 Tứ Thủ (Top 4)',
    6: '👑 Lục Thủ (Top 6)',
    7: '⭐ Thất Thủ (Top 7)',
    8: '✨ Bát Thủ (Top 8)',
    10: '💎 Thập Thủ (Top 10)',
    20: '🛡️ Lô Dàn (Top 20)'
};

topCounts.forEach(count => {
    const s = lotoSummaries[`top${count}`];
    if (!s) return;
    const name = topLabels[count] || `Top ${count}`;
    const days = s.days || 0;
    const hitDays = s.hitDays || 0;
    const hitRate = (s.hitRate ? s.hitRate * 100 : (hitDays / days) * 100).toFixed(1) + '%';
    const winDays = s.winDays || s.wins || 0;
    const winRate = (s.winRate ? s.winRate * 100 : (winDays / days) * 100).toFixed(1) + '%';
    const profitM = (s.profitK >= 0 ? '+' : '') + (s.profitK / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'M';
    const roiStr = (s.roi !== undefined ? (s.roi >= 0 ? '+' : '') + (s.roi * 100).toFixed(1) + '%' : 'N/A');

    console.log(
        name.padEnd(22) +
        String(days).padStart(8) +
        String(hitDays).padStart(9) +
        hitRate.padStart(10) +
        winRate.padStart(11) +
        profitM.padStart(14) +
        roiStr.padStart(9)
    );
});
console.log('-'.repeat(90));

// -------------------------------------------------------------
// 3. CHI TIẾT 7 ĐỘNG CƠ CỦA QMBF v6
// -------------------------------------------------------------
console.log('\n⚙️  [PHẦN 3] CẤU TRÚC 7 ĐỘNG CƠ DUNG HỢP TRONG QMBF v6:');
console.log('-'.repeat(90));
const engines = [
    { id: 'E1', name: 'Positional Markov Tensor (3 Tầng Trễ)', weight: '1.90x', role: 'Dự báo chuyển tiếp xác suất vị trí giải GĐB, G1, G7' },
    { id: 'E2', name: 'Head-Tail Bayes Dynamic Momentum', weight: '0.30x', role: 'Mô hình hóa động lượng phân bố đầu và đuôi số độc lập' },
    { id: 'E3', name: 'Co-occurrence PMI Affinity Matrix', weight: '0.25x', role: 'Lực hút cặp số đồng quy (Pointwise Mutual Information)' },
    { id: 'E4', name: 'Short-term Gap Momentum & Recency', weight: '0.30x', role: 'Sóng đàn hồi chu kỳ nhịp rơi với hàm suy giảm e^(-0.10*t)' },
    { id: 'E5', name: 'Shadow & Inverse Pair Synergy', weight: '0.15x', role: 'Tương quan cặp số đảo vị trí và bóng ngũ hành âm dương' },
    { id: 'E6', name: 'Positional Bridge Correlation', weight: '0.20x', role: 'Cầu vị trí giải thưởng giữa GĐB, Giải 1 và Giải 7' },
    { id: 'E7', name: 'Form & Parity Transition Resonance', weight: '0.20x', role: 'Cộng hưởng Chạm, chuyển dịch Tổng và số đảo từ kỳ D-1' }
];

engines.forEach(e => {
    console.log(`  [${e.id}] ${e.name.padEnd(42)} Trọng số: ${e.weight.padStart(6)} | ${e.role}`);
});
console.log('  * Kèm Bộ Lọc Khử Lô Gan Nặng (Soft Gan Damping): Gan >= 15d (x0.75), Gan >= 22d (x0.50) loại trừ bẫy nhiễu.');
console.log('  * Kèm bộ lọc đa dạng hóa đầu & đuôi số: maxPerHead = 2, maxPerTail = 2 (chống dồn số vào cùng một đầu/đuôi).');
console.log('='.repeat(90));
console.log('✅ Hoàn tất báo cáo benchmark.\n');
