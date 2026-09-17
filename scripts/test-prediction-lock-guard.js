'use strict';

const assert = require('assert');
const {
    getVietnamTime,
    isPredictionLockActive,
    preserveLockedRecommendation
} = require('../lib/utils/predictionLockGuard');

console.log('=== TEST PREDICTION LOCK GUARD ===');

// 1. Kiểm tra getVietnamTime
const vn = getVietnamTime();
assert.ok(vn.dateStr, 'Phải có dateStr');
assert.ok(typeof vn.hours === 'number', 'Hours phải là number');
assert.ok(typeof vn.minutes === 'number', 'Minutes phải là number');
console.log('✓ getVietnamTime hoạt động chuẩn xác:', vn.isoString);

// 2. Kiểm tra các mốc thời gian giả lập
const mockTargetDate = '2026-09-17';
const emptyRaw = [{ date: '2026-09-16', special: 44 }];
const settledRaw = [
    { date: '2026-09-16', special: 44 },
    { date: '2026-09-17', special: 88 }
];

// Ca 1: 09:30 sáng VN (chưa đến 12h) -> Chưa khóa
const morningVN = new Date('2026-09-17T02:30:00Z'); // 09:30 GMT+7
const resMorning = isPredictionLockActive(mockTargetDate, emptyRaw, morningVN);
assert.strictEqual(resMorning.isLocked, false, '09:30 sáng chưa được khóa');
assert.strictEqual(resMorning.isSettled, false);
console.log('✓ 09:30 sáng: Chưa khóa (mở cho cập nhật)');

// Ca 2: 12:00 trưa VN -> BẮT ĐẦU KHÓA
const noonVN = new Date('2026-09-17T05:00:00Z'); // 12:00 GMT+7
const resNoon = isPredictionLockActive(mockTargetDate, emptyRaw, noonVN);
assert.strictEqual(resNoon.isLocked, true, '12:00 trưa phải khóa');
assert.strictEqual(resNoon.lockActive, true);
console.log('✓ 12:00 trưa: Đã khóa bất biến thành công');

// Ca 3: 15:30 chiều VN -> VẪN ĐANG KHÓA
const afternoonVN = new Date('2026-09-17T08:30:00Z'); // 15:30 GMT+7
const resAfternoon = isPredictionLockActive(mockTargetDate, emptyRaw, afternoonVN);
assert.strictEqual(resAfternoon.isLocked, true, '15:30 chiều phải khóa');
console.log('✓ 15:30 chiều: Khóa bất biến được duy trì');

// Ca 4: 18:35 tối VN (chưa quay xong) -> VẪN ĐANG KHÓA
const preDrawVN = new Date('2026-09-17T11:35:00Z'); // 18:35 GMT+7
const resPreDraw = isPredictionLockActive(mockTargetDate, emptyRaw, preDrawVN);
assert.strictEqual(resPreDraw.isLocked, true, '18:35 tối phải khóa');
console.log('✓ 18:35 tối: Khóa bất biến tiếp tục giữ');

// Ca 5: 19:15 tối VN nhưng nguồn kết quả bị delay (chưa có trong database) -> TIẾP TỤC KHÓA BẢO VỆ
const delayedVN = new Date('2026-09-17T12:15:00Z'); // 19:15 GMT+7
const resDelayed = isPredictionLockActive(mockTargetDate, emptyRaw, delayedVN);
assert.strictEqual(resDelayed.isLocked, true, 'Chưa có kết quả thì phải tiếp tục khóa');
console.log('✓ 19:15 tối khi kết quả bị trễ: Tiếp tục khóa an toàn');

// Ca 6: Đã có kết quả chính thức trong database -> MỞ KHÓA & ĐÃ KẾT TOÁN
const resSettled = isPredictionLockActive(mockTargetDate, settledRaw, delayedVN);
assert.strictEqual(resSettled.isLocked, false, 'Đã có kết quả thì mở khóa để sinh ngày mới');
assert.strictEqual(resSettled.isSettled, true);
console.log('✓ Khi đã nạp kết quả mở thưởng: Mở khóa và chuyển trạng thái settled');

// 3. Kiểm tra preserveLockedRecommendation
const existingSnapshot = {
    predictionDate: '2026-09-17',
    selectedMethod: 'adaptiveDualMerge',
    numbers: [1, 2, 3, 4, 5],
    sizingMultiplier: 1.25
};

const modifiedFreshRecommendation = {
    predictionDate: '2026-09-17',
    selectedMethod: 'dualMerge', // Logic mới cố đổi sang dualMerge
    numbers: [91, 92, 93, 94, 95],
    sizingMultiplier: 1.0
};

// Khi khóa đang bật (buổi chiều):
const lockedResult = preserveLockedRecommendation(existingSnapshot, modifiedFreshRecommendation, { isLocked: true, lockReason: 'Đã khóa' });
assert.strictEqual(lockedResult.selectedMethod, 'adaptiveDualMerge', 'Phải giữ nguyên phương pháp cũ');
assert.deepStrictEqual(lockedResult.numbers, [1, 2, 3, 4, 5], 'Phải giữ nguyên dàn số cũ');
assert.strictEqual(lockedResult.sizingMultiplier, 1.25, 'Phải giữ nguyên hệ số cược cũ');
assert.strictEqual(lockedResult.snapshotLock.isLocked, true);
console.log('✓ preserveLockedRecommendation: Bảo vệ tuyệt đối snapshot cũ khi đang khóa');

// Khi khóa không bật (buổi sáng):
const unlockedResult = preserveLockedRecommendation(existingSnapshot, modifiedFreshRecommendation, { isLocked: false });
assert.strictEqual(unlockedResult.selectedMethod, 'dualMerge', 'Buổi sáng cho phép nhận đề xuất mới');
assert.deepStrictEqual(unlockedResult.numbers, [91, 92, 93, 94, 95]);
assert.strictEqual(unlockedResult.snapshotLock.isLocked, false);
console.log('✓ preserveLockedRecommendation: Cho phép cập nhật bình thường khi chưa khóa');

console.log('✅ Toàn bộ bài kiểm thử Prediction Lock Guard đã vượt qua!\n');
