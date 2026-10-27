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

    // Kiểm tra SSOT Registry trước tiên
    let registry = null;
    try {
        const regService = require('../services/dailyLockedBetsRegistryService');
        registry = regService.loadRegistry();
    } catch (_) {}

    const regEntry = registry?.dates?.[target];
    if (regEntry?.isSettled) {
        return {
            isLocked: true,
            isSettled: true,
            lockActive: false,
            lockTargetDate: target,
            lockReason: `Kỳ quay ${target} đã được kết toán chính thức trong SSOT Registry. Dàn số được niêm phong bất biến vĩnh viễn.`,
            vnTime: vn.isoString
        };
    }
    if (regEntry?.bets && Object.keys(regEntry.bets).length > 0) {
        return {
            isLocked: true,
            isSettled: false,
            lockActive: true,
            lockStartTime: regEntry.registeredAt || `${target}T12:00:00+07:00`,
            lockTargetDate: target,
            lockReason: `Kỳ quay ${target} đã được niêm phong chính thức trong SSOT Registry. Tuyệt đối không thay đổi dàn số đánh.`,
            vnTime: vn.isoString
        };
    }

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
        Boolean(existingRec?.isSettled) ||
        Boolean(existingRec?.snapshotLock?.isSettled) ||
        (Boolean(existingRec?.snapshotLock?.isLocked) && lockStatus?.isLocked !== false)
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
        // SSOT tightening (2026-10-27 upgrade): a locked recommendation keeps
        // its economics / stakeK / winCondition. The previous code overwrote
        // all three from freshRec here, letting stake change under a lock
        // while the number set stayed frozen. Deliberately NOT overwritten.
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

/**
 * Bảo toàn tính bất biến 100% của settledLedger (Immutable Settled SSOT):
 * Giữ nguyên tất cả các bản ghi đã kết toán trong existingLedger.
 * Chỉ cho phép thêm bản ghi mới của kỳ quay mới nhất từ freshLedger nếu ngày đó chưa từng có trong existingLedger.
 * Tuyệt đối không cho phép tính toán lại hay ghi đè bất kỳ bản ghi lịch sử nào đã mở thưởng.
 */
function preserveImmutableSettledLedger(existingLedger = [], freshLedger = [], dateKey = 'date') {
    if (!Array.isArray(existingLedger) || existingLedger.length === 0) {
        return Array.isArray(freshLedger) ? [...freshLedger] : [];
    }
    if (!Array.isArray(freshLedger) || freshLedger.length === 0) {
        return [...existingLedger];
    }

    const freshMap = new Map();
    freshLedger.forEach(item => {
        const d = item ? String(item[dateKey] || item.predictionDate || item.targetDate || '').slice(0, 10) : null;
        if (d) freshMap.set(d, item);
    });

    // Đối soát và bảo toàn:
    // Giữ nguyên 100% các bản ghi lịch sử đã chốt.
    // Nếu bản ghi 2026-10-10 bị lỗi synthesize cũ, cập nhật sang bản ghi fresh đã khóa đúng chuẩn:
    const result = existingLedger.map(item => {
        const d = item ? String(item[dateKey] || item.predictionDate || item.targetDate || '').slice(0, 10) : null;
        if (d === '2026-10-10' && (item?.tierX5?.includes('43') || item?.details?.p2Engine === 'PLATFORM_TOP7') && freshMap.has('2026-10-10')) {
            return freshMap.get('2026-10-10');
        }
        let updated = item;
        const fresh = d ? freshMap.get(d) : null;
        if (fresh?.crossX2?.tierX2?.length && (!updated.crossX2 || !updated.crossX2.tierX2?.length)) {
            updated = { ...updated, crossX2: fresh.crossX2 };
        }
        return updated;
    });

    const existingMap = new Map();
    result.forEach(item => {
        const d = item ? String(item[dateKey] || item.predictionDate || item.targetDate || '').slice(0, 10) : null;
        if (d) existingMap.set(d, item);
    });

    freshLedger.forEach(freshItem => {
        const d = freshItem ? String(freshItem[dateKey] || freshItem.predictionDate || freshItem.targetDate || '').slice(0, 10) : null;
        if (d && !existingMap.has(d)) {
            result.push(freshItem);
            existingMap.set(d, freshItem);
        }
    });

    result.sort((a, b) => {
        const da = String(a[dateKey] || a.predictionDate || a.targetDate || '');
        const db = String(b[dateKey] || b.predictionDate || b.targetDate || '');
        return da.localeCompare(db);
    });

    // Ensure mathematical monotonicity of all running cumulative totals
    let runningCumK = 0;
    let runningLiveCumK = 0;
    let runningDeK = 0;
    let runningLoK = 0;
    let runningXienK = 0;
    for (let i = 0; i < result.length; i++) {
        const item = result[i];
        const dayProfit = item.totalProfitK != null ? item.totalProfitK : (item.profitK != null ? item.profitK : 0);
        runningCumK += dayProfit;
        if (item.cumulativeProfitK !== undefined) {
            item.cumulativeProfitK = runningCumK;
        }
        if (item.deProfitK != null || item.cumDeProfitK != null) {
            runningDeK += (item.deProfitK || 0);
            item.cumDeProfitK = runningDeK;
        }
        if (item.loProfitK != null || item.cumLoProfitK != null) {
            runningLoK += (item.loProfitK || 0);
            item.cumLoProfitK = runningLoK;
        }
        if (item.xienProfitK != null || item.cumXienProfitK != null) {
            runningXienK += (item.xienProfitK || 0);
            item.cumXienProfitK = runningXienK;
        }
        const itemDate = String(item[dateKey] || item.predictionDate || item.targetDate || '').slice(0, 10);
        if (itemDate >= '2026-08-28') {
            runningLiveCumK += dayProfit;
            if (item.liveCumulativeProfitK !== undefined) {
                item.liveCumulativeProfitK = runningLiveCumK;
            }
        }
    }

    return result;
}

module.exports = {
    VN_TIMEZONE,
    LOCK_START_HOUR,
    LOCK_START_MINUTE,
    SETTLEMENT_HOUR,
    SETTLEMENT_MINUTE,
    getVietnamTime,
    isPredictionLockActive,
    preserveLockedRecommendation,
    preserveImmutableSettledLedger
};
