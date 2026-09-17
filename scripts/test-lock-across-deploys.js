'use strict';

const assert = require('assert');
const { isPredictionLockActive, preserveLockedRecommendation } = require('../lib/utils/predictionLockGuard');

console.log('=== TEST LOCK ACROSS DEPLOYS & CODE CHANGES ===');

// 1. Giả lập dữ liệu kết quả đến 2026-09-17 (kỳ quay hôm nay 2026-09-18 chưa có kết quả)
const mockRawRows = [
    { date: '2026-09-16', special: 44 },
    { date: '2026-09-17', special: 60 }
];
const targetDate = '2026-09-18';

// 2. Trước 12h trưa ngày 2026-09-18 (ví dụ 10:30 sáng)
const timeBefore12 = new Date('2026-09-18T10:30:00+07:00');
const lockStatusBefore12 = isPredictionLockActive(targetDate, mockRawRows, timeBefore12);
assert.strictEqual(lockStatusBefore12.isLocked, false, 'Trước 12h trưa phải chưa khóa');

// Giả lập snapshot chuẩn được sinh ra lúc 10:30 sáng
const pre12Snapshot = {
    predictionDate: '2026-09-18',
    selectedMethod: 'deMarkovGapHazard',
    selectedMethodLabel: 'Đề Markov Bậc 2 & Nhịp Rơi Chu Kỳ Khuyết (43s)',
    numbers: ['01', '06', '15', '21', '22', '29', '36', '38', '43', '49', '52', '54', '57', '62', '63', '64', '66'],
    tierX2: ['01', '06', '15', '21', '22', '29', '36'],
    singles: ['38', '43', '49', '52', '54', '57', '62', '63', '64', '66'],
    sizingMultiplier: 1.3,
    generatedAt: '2026-09-18T10:30:00+07:00'
};

// 3. Đúng 12:00 trưa trở đi (ví dụ 14:30 chiều)
const timeAfter12 = new Date('2026-09-18T14:30:00+07:00');
const lockStatusAfter12 = isPredictionLockActive(targetDate, mockRawRows, timeAfter12);
assert.strictEqual(lockStatusAfter12.isLocked, true, 'Sau 12h trưa phải khóa bất biến');
assert.strictEqual(lockStatusAfter12.lockActive, true);
console.log('✓ Trạng thái khóa bất biến sau 12h kích hoạt thành công:', lockStatusAfter12.lockReason);

// 4. GIẢ LẬP DEPLOY MỚI VÀO BUỔI CHIỀU (15:00):
// Một lập trình viên thay đổi thuật toán hoặc commit code mới, khiến bộ sinh dự đoán tạo ra dàn số hoàn toàn khác
const simulatedDeployNewCalculation = {
    predictionDate: '2026-09-18',
    selectedMethod: 'adaptiveDualMerge', // Cố tình đổi phương pháp
    selectedMethodLabel: 'Đề Thích Ứng Alpha (Bị sửa sau deploy)',
    numbers: ['99', '88', '77', '66', '55'], // Dàn số hoàn toàn khác
    tierX2: ['99', '88'],
    singles: ['77', '66', '55'],
    sizingMultiplier: 2.0,
    generatedAt: '2026-09-18T15:00:00+07:00'
};

// Gọi qua preserveLockedRecommendation với trạng thái đang khóa
const preservedSnapshot = preserveLockedRecommendation(pre12Snapshot, simulatedDeployNewCalculation, lockStatusAfter12);

// Kiểm tra: Dàn số và phương pháp cũ trước 12h PHẢI ĐƯỢC GIỮ NGUYÊN 100%, bỏ qua toàn bộ thay đổi của deploy mới
assert.strictEqual(preservedSnapshot.selectedMethod, 'deMarkovGapHazard', 'Phương pháp phải giữ nguyên từ trước 12h');
assert.strictEqual(preservedSnapshot.selectedMethodLabel, 'Đề Markov Bậc 2 & Nhịp Rơi Chu Kỳ Khuyết (43s)');
assert.deepStrictEqual(preservedSnapshot.numbers, pre12Snapshot.numbers, 'Dàn số phải bảo toàn 100% không đổi');
assert.deepStrictEqual(preservedSnapshot.tierX2, pre12Snapshot.tierX2, 'Dàn VIP X2 phải giữ nguyên 100%');
assert.strictEqual(preservedSnapshot.sizingMultiplier, 1.3, 'Hệ số vốn cược phải giữ nguyên');
assert.strictEqual(preservedSnapshot.snapshotLock.isLocked, true, 'Dấu khóa bất biến phải bật');
console.log('✓ Deploy mới sau 12h trưa: Dàn số và phương pháp trước 12h được bảo vệ 100% không đổi!');

// 5. Kiểm tra cho Lô Governor & SubTiers
const pre12LoGovernor = {
    selectedEngine: 'loDual',
    selectedEngineLabel: 'Lô Gộp Tinh Hoa (LoDual)',
    selectedSubTier: 7,
    subTiers: { 7: { numbers: ['63', '84', '29', '62', '01', '66', '43'] } }
};
const simulatedDeployNewLo = {
    selectedEngine: 'penta',
    selectedEngineLabel: 'Ngũ Hợp v8.0 (Bị sửa sau deploy)',
    selectedSubTier: 2,
    subTiers: { 2: { numbers: ['00', '11'] } }
};
const preservedLoGovernor = preserveLockedRecommendation(pre12LoGovernor, simulatedDeployNewLo, lockStatusAfter12);
assert.strictEqual(preservedLoGovernor.selectedEngine, 'loDual', 'Động cơ Lô phải giữ nguyên từ trước 12h');
assert.deepStrictEqual(preservedLoGovernor.subTiers, pre12LoGovernor.subTiers, 'Dàn Thất Thủ Lô phải giữ nguyên 100%');
console.log('✓ Deploy mới sau 12h trưa: Động cơ Lô và Dàn Thất Thủ bảo toàn 100%!');

// 6. Kiểm tra sau 18:40 khi đã có kết quả mở thưởng chính thức
mockRawRows.push({ date: '2026-09-18', special: 63 }); // Đã có kết quả nổ 63 trúng Đề
const timeAfter1840 = new Date('2026-09-18T19:00:00+07:00');
const lockStatusAfter1840 = isPredictionLockActive(targetDate, mockRawRows, timeAfter1840);
assert.strictEqual(lockStatusAfter1840.isLocked, false, 'Sau khi có kết quả phải mở khóa để kết toán');
assert.strictEqual(lockStatusAfter1840.isSettled, true, 'Trạng thái phải là đã kết toán');
console.log('✓ Sau 18h40 có kết quả: Hệ thống mở khóa và chuyển trạng thái kết toán thành công!');

console.log('✅ Toàn bộ bài kiểm thử Khóa Bất Biến Trước 12h Trưa & Kháng Deploy Mới đã vượt qua!');
