'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const service = require('../lib/services/dailyMethodAdvisorService');
const { getRawData } = require('../lib/data-access');
const { isPredictionLockActive } = require('../lib/utils/predictionLockGuard');

async function testAllMethodsLockedAfter12h() {
    console.log('=== TEST ALL 8 ĐỀ & LÔ METHODS IMMUTABLE LOCK AFTER 12:00 PM ===\n');

    const raw = await getRawData();
    const localFile = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_daily_method_advisor.json');
    const existingCache = JSON.parse(fs.readFileSync(localFile, 'utf8'));

    const targetDate = existingCache.pendingPredictionDate;
    console.log(`1. Target Date: ${targetDate}`);

    // Giả lập thời gian 14:00 chiều (sau 12:00 trưa)
    const simulatedNow = new Date(`${targetDate}T14:00:00+07:00`);
    const lockStatus = isPredictionLockActive(targetDate, raw, simulatedNow);
    assert.strictEqual(lockStatus.isLocked, true, 'Sau 12:00 trưa phải khóa bất biến');
    console.log('✓ Trạng thái khóa bất biến 12:00 PM kích hoạt:', lockStatus.lockReason);

    // Lưu lại toàn bộ số của 8 phương pháp Đề
    const deMaster = existingCache.streakAwareDeAdvisor.latestRecommendation;
    const deSelectedMethod = deMaster.selectedMethod;
    const deMasterNumbers = [...deMaster.numbers];
    const deMasterTierX2 = [...(deMaster.tierX2 || [])];

    console.log(`\n2. Phương pháp Đề chính: ${deSelectedMethod} (${deMaster.selectedMethodLabel})`);
    console.log(`   Số lượng: ${deMasterNumbers.length} số (VIP X2: ${deMasterTierX2.length})`);
    console.log(`   5 số đầu: ${deMasterNumbers.slice(0, 5).join(', ')}`);

    // Lưu lại toàn bộ các phương pháp Lô
    const loMaster = existingCache.loQuadHybrid.latestRecommendation;
    const loTop7 = [...(loMaster.top7 || [])];
    const loTop2 = [...(loMaster.top2 || [])];
    const loTop4 = [...(loMaster.top4 || [])];
    const loTop10 = [...(loMaster.top10 || [])];
    const loTop20 = [...(loMaster.top20 || [])];
    const loXien = existingCache.loXien4Synergy?.latestRecommendation?.topPairs || [];

    console.log(`\n3. Lô Động Cơ Chính: ${loMaster.selectedEngine} (${loMaster.selectedEngineLabel})`);
    console.log(`   Top 2: ${loTop2.join(', ')}`);
    console.log(`   Top 4: ${loTop4.join(', ')}`);
    console.log(`   Top 7 (Chủ lực): ${loTop7.join(', ')}`);
    console.log(`   Top 10: ${loTop10.join(', ')}`);
    console.log(`   Top 20 (Nền tảng): ${loTop20.slice(0, 5).join(', ')}...`);

    // GIẢ LẬP CHẠY LẠI THUẬT TOÁN VÀO BUỔI CHIỀU (với simulatedNow)
    console.log('\n4. Giả lập kích hoạt cập nhật lại cache lúc 14:00 chiều...');
    const regeneratedCache = service.generateAdvisorCache({
        raw,
        existing: existingCache.records,
        existingCache: existingCache,
        existingDualMerge: existingCache.dualMerge,
        existingTripleMerge: existingCache.tripleMerge,
        existingAdaptiveDualMerge: existingCache.adaptiveDualMerge,
        existingMetaLearner: existingCache.metaLearner,
        existingDynamicMetaAdvisor: existingCache.dynamicMetaAdvisor,
        forceSynthesize: false,
        limit: 90,
        now: simulatedNow
    });

    // KIỂM TRA ĐỀ:
    const regenDeMaster = regeneratedCache.streakAwareDeAdvisor.latestRecommendation;
    assert.strictEqual(regenDeMaster.selectedMethod, deSelectedMethod, 'Phương pháp Đề đề xuất phải không đổi');
    assert.deepStrictEqual(regenDeMaster.numbers, deMasterNumbers, 'Dàn số Đề đề xuất phải bảo toàn 100%');
    assert.deepStrictEqual(regenDeMaster.tierX2, deMasterTierX2, 'Dàn VIP X2 Đề phải bảo toàn 100%');
    assert.strictEqual(regenDeMaster.snapshotLock.isLocked, true, 'Snapshot Đề phải có cờ isLocked = true');
    console.log('✓ Đề chính & VIP X2 được bảo toàn tuyệt đối 100%!');

    // KIỂM TRA TOÀN BỘ 8 PHƯƠNG PHÁP ĐỀ:
    const all8Keys = [
        'pentaCoreDe',
        'adaptiveDualMerge',
        'dualMerge',
        'tripleMerge',
        'deMarkovGapHazard',
        'dePositionalGraphFlow',
        'bayesFormResonance',
        'metaLearner'
    ];

    console.log('\n5. Kiểm tra tính bất biến của cả 8 phương pháp Đề:');
    const getDeNumbers = (rec) => rec?.fullUnion || rec?.union || rec?.numbers || [];
    for (const key of all8Keys) {
        const origRec = existingCache[key]?.latestRecommendation || existingCache.streakAwareDeAdvisor?.latestRecommendation?.availableMethods?.[key];
        const regenRec = regeneratedCache[key]?.latestRecommendation || regeneratedCache.streakAwareDeAdvisor?.latestRecommendation?.availableMethods?.[key];
        const origNums = getDeNumbers(origRec);
        const regenNums = getDeNumbers(regenRec);
        if (origNums.length > 0) {
            assert.deepStrictEqual(
                regenNums,
                origNums,
                `Phương pháp Đề [${key}] dàn số bị sai lệch sau khi khóa!`
            );
            console.log(`   ✓ [${key}]: ${origNums.length} số bảo toàn nguyên vẹn 100%`);
        }
    }

    // KIỂM TRA LÔ:
    console.log('\n6. Kiểm tra tính bất biến của các tầng Lô:');
    const regenLoMaster = regeneratedCache.loQuadHybrid.latestRecommendation;
    assert.deepStrictEqual(regenLoMaster.top1, loMaster.top1, 'Lô Bạch thủ Top 1 phải giữ nguyên');
    assert.deepStrictEqual(regenLoMaster.top2, loTop2, 'Lô Song thủ Top 2 phải giữ nguyên');
    assert.deepStrictEqual(regenLoMaster.top4, loTop4, 'Lô Tứ thủ Top 4 phải giữ nguyên');
    assert.deepStrictEqual(regenLoMaster.top7, loTop7, 'Lô Thất thủ Top 7 phải giữ nguyên');
    assert.deepStrictEqual(regenLoMaster.top10, loTop10, 'Lô Thập thủ Top 10 phải giữ nguyên');
    assert.deepStrictEqual(regenLoMaster.top20, loTop20, 'Lô Dàn 20 số phải giữ nguyên');
    assert.strictEqual(regenLoMaster.snapshotLock.isLocked, true, 'Snapshot Lô phải có cờ isLocked = true');
    console.log('   ✓ Toàn bộ Top 1, Top 2, Top 4, Top 7, Top 10, Top 20 Lô bảo toàn nguyên vẹn 100%');

    // KIỂM TRA LÔ XIÊN:
    if (loXien.length > 0) {
        const regenLoXien = regeneratedCache.loXien4Synergy?.latestRecommendation?.topPairs || [];
        assert.deepStrictEqual(regenLoXien, loXien, 'Lô Xiên 4 Synergy phải giữ nguyên');
        console.log('   ✓ Cặp Lô Xiên Synergy bảo toàn nguyên vẹn 100%');
    }

    console.log('\n✅ TẤT CẢ 8 PHƯƠNG PHÁP ĐỀ VÀ TOÀN BỘ CÁC DÀN LÔ ĐƯỢC BẢO VỆ BẤT BIẾN 100% SAU 12:00 TRƯA!\n');
}

testAllMethodsLockedAfter12h().catch(err => {
    console.error('❌ Lỗi kiểm thử:', err);
    process.exit(1);
});
