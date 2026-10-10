'use strict';

/**
 * predictionLockGuard.js
 * Quản lý cơ chế Niêm phong Bất biến (Immutable Snapshot Lock) cho toàn bộ dự đoán Lô & Đề:
 * Khóa chặt toàn bộ dàn số và phương pháp sau 12:00 trưa (VN Time) cho đến sau 18:40 (khi kết quả về và kết toán xong).
 */

const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
const LOCK_START_HOUR = 12;
const LOCK_START_MINUTE = 0;
const SETTLEMENT_HOUR = 18;
const SETTLEMENT_MINUTE = 40;

/**
 * Trích xuất thời gian hiện tại theo múi giờ Việt Nam (GMT+7)
 */
function getVietnamTime(now = new Date()) {
    const d = (now instanceof Date) ? now : new Date(now);
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: VN_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const parts = formatter.formatToParts(d);
    const map = {};
    for (const p of parts) map[p.type] = p.value;

    const dateStr = `${map.year}-${map.month}-${map.day}`;
    const hours = parseInt(map.hour, 10);
    const minutes = parseInt(map.minute, 10);
    const seconds = parseInt(map.second, 10);
    const totalMinutes = hours * 60 + minutes;

    return {
        dateStr,
        hours,
        minutes,
        seconds,
        totalMinutes,
        isoString: `${dateStr}T${map.hour}:${map.minute}:${map.second}+07:00`
    };
}

/**
 * Kiểm tra trạng thái khóa bất biến cho ngày dự đoán targetDate
 * @param {string} targetDate - Ngày dự đoán YYYY-MM-DD (ví dụ: '2026-09-17')
 * @param {Array} rawRows - Mảng dữ liệu kết quả mở thưởng đã có
 * @param {Date|string|number} now - Thời gian đối soát (mặc định là hiện tại)
 * @returns {Object} { isLocked, isSettled, lockActive, lockReason, vnTime }
 */
function isPredictionLockActive(targetDate, rawRows = [], now = new Date()) {
    const vn = getVietnamTime(now);
    const target = targetDate ? String(targetDate).slice(0, 10) : vn.dateStr;

    // Kiểm tra xem kỳ quay targetDate đã có kết quả mở thưởng trong database chưa
    const isSettled = Array.isArray(rawRows) && rawRows.some(row => {
        const rowDate = row?.date ? String(row.date).slice(0, 10) : null;
        return rowDate === target && row?.special != null;
    });

    if (isSettled) {
        return {
            isLocked: true,
            isSettled: true,
            lockActive: false,
            lockTargetDate: target,
            lockReason: `Kỳ quay ${target} đã có kết quả mở thưởng chính thức và đã kết toán. Dàn số được niêm phong bất biến vĩnh viễn.`,
            vnTime: vn.isoString
        };
    }

    const lockStartMinutes = LOCK_START_HOUR * 60 + LOCK_START_MINUTE;

    // Trường hợp 1: Target date là ngày hôm nay tại Việt Nam
    if (vn.dateStr === target) {
        if (vn.totalMinutes >= lockStartMinutes) {
            return {
                isLocked: true,
                isSettled: false,
                lockActive: true,
                lockStartTime: `${target}T12:00:00+07:00`,
                lockTargetDate: target,
                lockReason: `Đã khóa bất biến từ 12:00 trưa ngày ${target} đến khi có kết quả và kết toán sau 18:40. Tuyệt đối không thay đổi dàn số đánh.`,
                vnTime: vn.isoString
            };
        } else {
            const minutesLeft = lockStartMinutes - vn.totalMinutes;
            return {
                isLocked: false,
                isSettled: false,
                lockActive: false,
                minutesUntilLock: minutesLeft,
                lockReason: `Chưa đến 12:00 trưa (còn ${minutesLeft} phút). Dự đoán vẫn có thể cập nhật.`,
                vnTime: vn.isoString
            };
        }
    }

    // Trường hợp 2: Target date nhỏ hơn ngày hôm nay nhưng CHƯA có kết quả (chậm trễ kết quả)
    if (target < vn.dateStr) {
        return {
            isLocked: true,
            isSettled: false,
            lockActive: true,
            lockStartTime: `${target}T12:00:00+07:00`,
            lockTargetDate: target,
            lockReason: `Kỳ quay ${target} đã quá 12:00 trưa và đang chờ kết quả mở thưởng để kết toán.`,
            vnTime: vn.isoString
        };
    }

    // Trường hợp 3: Target date là ngày tương lai (sau ngày hôm nay)
    return {
        isLocked: false,
        isSettled: false,
        lockActive: false,
        lockReason: `Kỳ quay ${target} là ngày tương lai.`,
        vnTime: vn.isoString
    };
}

/**
 * Bảo toàn Snapshot nếu khóa đang có hiệu lực hoặc đã kết toán
 * @param {Object} existingRec - Snapshot cũ đang có trong cache
 * @param {Object} freshRec - Snapshot mới vừa tính toán lại
 * @param {Object} lockStatus - Kết quả từ isPredictionLockActive
 * @returns {Object} Recommendation được bảo toàn hoặc mới
 */
function preserveLockedRecommendation(existingRec, freshRec, lockStatus) {
    const targetDate = lockStatus?.lockTargetDate
        || freshRec?.targetDate
        || freshRec?.predictionDate
        || freshRec?.date;
    const existingDate = existingRec?.targetDate
        || existingRec?.predictionDate
        || existingRec?.date
        || existingRec?.snapshotLock?.lockTargetDate;

    const isDifferentDate = Boolean(existingDate && targetDate && String(existingDate).slice(0, 10) !== String(targetDate).slice(0, 10));

    // Nếu snapshot cũ thuộc về kỳ quay khác (ví dụ: kỳ hôm qua đã mở thưởng và nay sinh đề xuất kỳ mới), không bảo toàn dàn số cũ mà nhận freshRec của kỳ mới
    if (isDifferentDate) {
        return {
            ...freshRec,
            snapshotLock: {
                isLocked: Boolean(lockStatus?.isLocked),
                lockActive: Boolean(lockStatus?.lockActive),
                lockedAt: lockStatus?.isLocked ? new Date().toISOString() : null,
                lockStartTime: lockStatus?.lockStartTime,
                lockTargetDate: targetDate,
                lockReason: lockStatus?.lockReason || ''
            }
        };
    }

    const hasExistingData = existingRec && (
        (Array.isArray(existingRec.numbers) && existingRec.numbers.length > 0) ||
        existingRec.selectedMethod ||
        existingRec.selectedEngine ||
        existingRec.availableMethods ||
        existingRec.streakGovernor ||
        (Array.isArray(existingRec.top20) && existingRec.top20.length > 0) ||
        (Array.isArray(existingRec.top10) && existingRec.top10.length > 0) ||
        (Array.isArray(existingRec.top8) && existingRec.top8.length > 0) ||
        (Array.isArray(existingRec.top7) && existingRec.top7.length > 0) ||
        (Array.isArray(existingRec.top6) && existingRec.top6.length > 0) ||
        (Array.isArray(existingRec.top4) && existingRec.top4.length > 0) ||
        (Array.isArray(existingRec.top2) && existingRec.top2.length > 0) ||
        (Array.isArray(existingRec.top1) && existingRec.top1.length > 0) ||
        (Array.isArray(existingRec.rankedNumbers) && existingRec.rankedNumbers.length > 0) ||
        (Array.isArray(existingRec.standard30) && existingRec.standard30.length > 0) ||
        (Array.isArray(existingRec.fullUnion) && existingRec.fullUnion.length > 0) ||
        (Array.isArray(existingRec.betNumbers) && existingRec.betNumbers.length > 0) ||
        existingRec.subTiers ||
        existingRec.optimalCrossTierEnsemble ||
        existingRec.engines ||
        (Array.isArray(existingRec.bestQuad) && existingRec.bestQuad.length > 0) ||
        Boolean(existingRec.de) ||
        Boolean(existingRec.lo) ||
        Boolean(existingRec.xien5) ||
        Boolean(existingRec.portfolio) ||
        Boolean(existingRec.crossAssetPortfolio)
    );

    // NGUYÊN TẮC BẤT BIẾN:
    // Nếu cùng kỳ quay và đã có dữ liệu hợp lệ:
    // Khi đang khóa (isLocked) HOẶC đã kết toán (isSettled) HOẶC đã có dấu khóa (snapshotLock.isLocked / isLocked):
    // BẮT BUỘC giữ nguyên 100% snapshot cũ, TUYỆT ĐỐI KHÔNG ghi đè bằng freshRec!
    const shouldProtect = !isDifferentDate && hasExistingData && (
        Boolean(lockStatus?.isLocked) ||
        Boolean(lockStatus?.isSettled) ||
        Boolean(existingRec?.snapshotLock?.isLocked) ||
        Boolean(existingRec?.isLocked)
    );

    if (shouldProtect) {
        const merged = {
            ...freshRec,
            ...existingRec,
            snapshotLock: {
                isLocked: true,
                lockActive: Boolean(lockStatus?.lockActive || existingRec?.snapshotLock?.lockActive),
                lockedAt: existingRec?.snapshotLock?.lockedAt || existingRec?.generatedAt || new Date().toISOString(),
                lockStartTime: lockStatus?.lockStartTime || existingRec?.snapshotLock?.lockStartTime,
                lockTargetDate: targetDate,
                lockReason: lockStatus?.lockReason || existingRec?.snapshotLock?.lockReason || 'Đã khóa bất biến bảo vệ dàn số chốt.'
            }
        };
        if (freshRec?.economics) {
            merged.economics = freshRec.economics;
        }
        if (freshRec?.stakeK) {
            merged.stakeK = freshRec.stakeK;
        }
        if (freshRec?.winCondition) {
            merged.winCondition = freshRec.winCondition;
        }
        return merged;
    }

    if (!lockStatus || !lockStatus.isLocked) {
        return {
            ...freshRec,
            snapshotLock: {
                isLocked: false,
                lockActive: false,
                lockReason: lockStatus?.lockReason || ''
            }
        };
    }

    // Nếu chưa có snapshot cũ nhưng đang trong khung giờ khóa, đóng dấu khóa cho snapshot hiện tại
    return {
        ...freshRec,
        snapshotLock: {
            isLocked: true,
            lockActive: true,
            lockedAt: new Date().toISOString(),
            lockStartTime: lockStatus.lockStartTime,
            lockTargetDate: lockStatus.lockTargetDate,
            lockReason: lockStatus.lockReason
        }
    };
}

module.exports = {
    VN_TIMEZONE,
    LOCK_START_HOUR,
    LOCK_START_MINUTE,
    SETTLEMENT_HOUR,
    SETTLEMENT_MINUTE,
    getVietnamTime,
    isPredictionLockActive,
    preserveLockedRecommendation
};
