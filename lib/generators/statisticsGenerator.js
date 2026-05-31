const fs = require('fs').promises;
const path = require('path');
const { SETS, MAPS, INDEX_MAPS, findNextInSet, findPreviousInSet } = require('../utils/numberAnalysis');
const {
    getSoLeTheoCapConfigs,
    getSoLeTheoCapLabel,
    formatSoLeTheoCapPairValue
} = require('../utils/soLeTheoCapPairs');


const DATA_FILE_PATH = path.join(__dirname, '..', 'data', 'xsmb-2-digits.json');
const OUTPUT_FILE_PATH = path.join(__dirname, '..', 'data', 'statistics', 'number_stats.json');

// --- CÁC HÀM TIỆN ÍCH ---

function formatDate(dateString) {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function parseDate(dateString) {
    if (!dateString) return null;
    const [day, month, year] = dateString.split('/');
    return new Date(year, month - 1, day);
}

function isConsecutive(item1, item2) {
    if (!item1 || !item2) return false;
    return (item2.timestamp - item1.timestamp) === 86400000;
}

function createStreakObject(data, dateMap, streak, typeSpecificData = {}) {
    if (!streak || streak.length < 2) return null;
    const firstItem = streak[0];
    const lastItem = streak[streak.length - 1];
    const startIndex = dateMap.get(firstItem.date);
    const endIndex = dateMap.get(lastItem.date);
    if (startIndex === undefined || endIndex === undefined) return null;

    // Calculate day span (number of days from start to end, inclusive)
    const daySpan = Math.floor((lastItem.timestamp - firstItem.timestamp) / 86400000) + 1;

    return {
        startDate: firstItem.date,
        endDate: lastItem.date,
        length: daySpan, // Use day span instead of streak.length
        values: streak.map(item => item.value),
        dates: streak.map(item => item.date),
        ...typeSpecificData
    };
}

// --- CÁC HÀM TÌM CHUỖI CƠ BẢN ---

// Tìm chuỗi 1 số về liên tiếp
function findConsecutiveStreaks(data, dateMap) {
    const allStreaks = [];
    const processedStreaks = new Set();
    const oneDay = 24 * 60 * 60 * 1000; // Định nghĩa oneDay ở đây
    for (let i = 0; i < data.length - 1; i++) {
        const startValue = data[i].value;
        const streakKey = `${startValue}-${data[i].date}`;
        if (processedStreaks.has(streakKey)) continue;
        let streak = [data[i]];
        let lastIndex = i;
        for (let j = i + 1; j < data.length; j++) {
            if (isConsecutive(data[lastIndex], data[j])) {
                if (data[j].value === startValue) {
                    streak.push(data[j]);
                    lastIndex = j;
                }
            } else if (parseDate(data[j].date) - parseDate(data[lastIndex].date) > oneDay) {
                break;
            }
        }
        if (streak.length >= 2) {
            const finalStreak = createStreakObject(data, dateMap, streak, { value: startValue });
            if (finalStreak) {
                allStreaks.push(finalStreak);
                streak.forEach(item => processedStreaks.add(`${startValue}-${item.date}`));
            }
        }
    }
    return { description: "1 số về liên tiếp", streaks: allStreaks.filter(Boolean) };
}

// Tìm chuỗi 1 số về so le
function findAlternatingStreaks(data, dateMap) {
    const allStreaks = [];
    const processedStreaks = new Set();
    for (let i = 0; i < data.length - 2; i++) {
        const startValue = data[i].value;
        if (isConsecutive(data[i], data[i + 1]) && isConsecutive(data[i + 1], data[i + 2])) {
            if (startValue === data[i + 2].value && data[i + 1].value !== startValue) {
                const streakKey = `${startValue}-${data[i].date}`;
                if (processedStreaks.has(streakKey)) continue;
                let streak = [data[i], data[i + 2]];
                let lastIndex = i + 2;
                while (lastIndex < data.length - 2) {
                    const nextPossibleIndex = lastIndex + 2;
                    if (data[nextPossibleIndex] && data[lastIndex + 1] && isConsecutive(data[lastIndex], data[lastIndex + 1]) && isConsecutive(data[lastIndex + 1], data[nextPossibleIndex])) {
                        if (startValue === data[nextPossibleIndex].value && data[lastIndex + 1].value !== startValue) {
                            streak.push(data[nextPossibleIndex]);
                            lastIndex = nextPossibleIndex;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                if (streak.length >= 2) {
                    const finalStreak = createStreakObject(data, dateMap, streak, { value: startValue });
                    if (finalStreak) {
                        allStreaks.push(finalStreak);
                        streak.forEach(item => processedStreaks.add(`${startValue}-${item.date}`));
                    }
                }
            }
        }
    }
    return { description: "1 số về so le", streaks: allStreaks.filter(Boolean) };
}

// Tìm chuỗi 1 số về so le MỚI (ngày xen kẽ không về)
function findAlternatingStreaksNew(data, dateMap) {
    const allStreaks = [];
    const processedStreaks = new Set();
    for (let i = 0; i < data.length - 2; i++) {
        const startValue = data[i].value;
        const gapValue = data[i + 1].value;
        if (gapValue === startValue) continue;
        if (isConsecutive(data[i], data[i + 1]) && isConsecutive(data[i + 1], data[i + 2])) {
            if (startValue === data[i + 2].value && data[i + 1].value === gapValue) {
                const streakKey = `${startValue}-${data[i].date}`;
                if (processedStreaks.has(streakKey)) continue;
                let streak = [data[i], data[i + 2]];
                let lastIndex = i + 2;
                while (lastIndex < data.length - 2) {
                    const nextPossibleIndex = lastIndex + 2;
                    if (data[nextPossibleIndex] && data[lastIndex + 1] && isConsecutive(data[lastIndex], data[lastIndex + 1]) && isConsecutive(data[lastIndex + 1], data[nextPossibleIndex])) {
                        if (startValue === data[nextPossibleIndex].value && data[lastIndex + 1].value === gapValue) {
                            streak.push(data[nextPossibleIndex]);
                            lastIndex = nextPossibleIndex;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                if (streak.length >= 2) {
                    const finalStreak = createStreakObject(data, dateMap, streak, { value: startValue, gapValue: gapValue });
                    if (finalStreak) {
                        allStreaks.push(finalStreak);
                        streak.forEach(item => processedStreaks.add(`${startValue}-${item.date}`));
                    }
                }
            }
        }
    }
    return { description: "1 số về so le Mới (ngày xen kẽ không về)", streaks: allStreaks.filter(Boolean) };
}

// Tìm chuỗi cặp số về so le
function findAlternatingPairStreaks(data, dateMap) {
    const allStreaks = [];
    const processedPairs = new Set();
    for (let i = 0; i < data.length - 3; i++) {
        if (!isConsecutive(data[i], data[i + 1]) || !isConsecutive(data[i + 1], data[i + 2]) || !isConsecutive(data[i + 2], data[i + 3])) {
            continue;
        }
        const val1 = data[i].value;
        const val2 = data[i + 1].value;
        if (val1 === data[i + 2].value && val2 === data[i + 3].value && val1 !== val2) {
            const pair = [val1, val2].sort();
            const streakKey = `${pair[0]}-${pair[1]}-${data[i].date}`;
            if (processedPairs.has(streakKey)) continue;
            let streak = [data[i], data[i + 1], data[i + 2], data[i + 3]];
            let lastIndex = i + 3;
            while (lastIndex < data.length - 2) {
                const nextVal1 = data[lastIndex + 1];
                const nextVal2 = data[lastIndex + 2];
                if (nextVal1 && nextVal2 && isConsecutive(data[lastIndex], nextVal1) && isConsecutive(nextVal1, nextVal2)) {
                    if (val1 === nextVal1.value && val2 === nextVal2.value) {
                        streak.push(nextVal1, nextVal2);
                        lastIndex += 2;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
            if (streak.length >= 4) {
                const finalStreak = createStreakObject(data, dateMap, streak, { pair: pair });
                if (finalStreak) {
                    allStreaks.push(finalStreak);
                    for (let k = 0; k < streak.length; k += 2) {
                        processedPairs.add(`${pair[0]}-${pair[1]}-${streak[k].date}`);
                    }
                }
            }
        }
    }
    return { description: "Cặp số về so le", streaks: allStreaks.filter(Boolean) };
}

// --- CÁC HÀM TÌM CHUỖI TIẾN/LÙI ---

// [SỬA LỖI] Định nghĩa hàm với 7 tham số
function findProgressiveStreaks(data, dateMap, isUniform, numberSet, numberMap, typeCondition, description) {
    const allStreaks = [];
    for (let i = 0; i < data.length - 1; i++) {
        if (!typeCondition(data[i])) continue; // Bắt buộc ngày đầu phải thuộc dạng
        let currentStreak = [data[i]];
        for (let j = i; j < data.length - 1; j++) {
            const currentItem = data[j];
            const nextItem = data[j + 1];

            // Nếu không liên tiếp HOẶC ngày tiếp theo không thuộc dạng -> dừng chuỗi
            if (!isConsecutive(currentItem, nextItem) || !typeCondition(nextItem)) {
                break;
            }

            const val1 = currentItem.value;
            const val2 = nextItem.value;
            let valueCondition;
            if (isUniform) {
                valueCondition = findNextInSet(val1, numberSet, numberMap) === val2;
            } else {
                valueCondition = parseInt(val2, 10) > parseInt(val1, 10);
            }
            if (valueCondition) {
                currentStreak.push(nextItem);
            } else {
                break;
            }
        }
        if (currentStreak.length > 1) {
            allStreaks.push(createStreakObject(data, dateMap, currentStreak));
            i += currentStreak.length - 2;
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

// [SỬA LỖI] Định nghĩa hàm với 7 tham số
function findRegressiveStreaks(data, dateMap, isUniform, numberSet, numberMap, typeCondition, description) {
    const allStreaks = [];
    for (let i = 0; i < data.length - 1; i++) {
        if (!typeCondition(data[i])) continue; // Bắt buộc ngày đầu phải thuộc dạng
        let currentStreak = [data[i]];
        for (let j = i; j < data.length - 1; j++) {
            const currentItem = data[j];
            const nextItem = data[j + 1];

            // Nếu không liên tiếp HOẶC ngày tiếp theo không thuộc dạng -> dừng chuỗi
            if (!isConsecutive(currentItem, nextItem) || !typeCondition(nextItem)) {
                break;
            }

            const val1 = currentItem.value;
            const val2 = nextItem.value;
            let valueCondition;
            if (isUniform) {
                valueCondition = findPreviousInSet(val1, numberSet, numberMap) === val2;
            } else {
                valueCondition = parseInt(val2, 10) < parseInt(val1, 10);
            }
            if (valueCondition) {
                currentStreak.push(nextItem);
            } else {
                break;
            }
        }
        if (currentStreak.length > 1) {
            allStreaks.push(createStreakObject(data, dateMap, currentStreak));
            i += currentStreak.length - 2;
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

// --- [MỚI] HÀM TÌM CHUỖI TIẾN LÙI SO LE (Yêu cầu 2) ---
function findAlternatingProgressiveRegressiveStreaks(data, dateMap, startProgressive, minLength) {
    const allStreaks = [];
    const description = startProgressive ? "Các số Tiến-Lùi So Le" : "Các số Lùi-Tiến So Le";

    for (let i = 0; i < data.length - minLength + 1; i++) {
        let currentStreak = [data[i]];
        let expectedProgressive = startProgressive; // true = mong đợi tiến, false = mong đợi lùi

        for (let j = i; j < data.length - 1; j++) {
            const currentItem = data[j];
            const nextItem = data[j + 1];

            if (!isConsecutive(currentItem, nextItem)) {
                break;
            }

            const val1 = parseInt(currentItem.value, 10);
            const val2 = parseInt(nextItem.value, 10);

            const isProgressive = val2 > val1;
            const isRegressive = val2 < val1;

            if ((expectedProgressive && isProgressive) || (!expectedProgressive && isRegressive)) {
                currentStreak.push(nextItem);
                expectedProgressive = !expectedProgressive;
            } else {
                break;
            }
        }

        if (currentStreak.length >= minLength) {
            allStreaks.push(createStreakObject(data, dateMap, currentStreak));
            i += currentStreak.length - 2;
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

// --- [MỚI] HÀM TÌM CHUỖI TIẾN LÙI SO LE CHO DẠNG CỤ THỂ (Chẵn-Lẻ, Tổng...) ---
function findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
    typeCondition,
    indexMap,
    descriptionPrefix,
    startProgressive = true,
    minLength = 4
}) {
    const allStreaks = [];
    const direction = startProgressive ? "Tiến-Lùi" : "Lùi-Tiến";
    const description = `${descriptionPrefix} ${direction} So Le`;

    for (let i = 0; i < data.length - minLength + 1; i++) {
        // Bắt buộc ngày đầu phải thuộc dạng
        if (!typeCondition(data[i])) continue;

        let currentStreak = [data[i]];
        let expectedProgressive = startProgressive;

        for (let j = i; j < data.length - 1; j++) {
            const currentItem = data[j];
            const nextItem = data[j + 1];

            // Nếu không liên tiếp HOẶC ngày tiếp theo không thuộc dạng -> dừng
            if (!isConsecutive(currentItem, nextItem) || !typeCondition(nextItem)) {
                break;
            }

            // Lấy index trong set để so sánh
            const idx1 = indexMap.get(currentItem.value);
            const idx2 = indexMap.get(nextItem.value);

            if (idx1 === undefined || idx2 === undefined) break;

            const isProgressive = idx2 > idx1;
            const isRegressive = idx2 < idx1;

            if ((expectedProgressive && isProgressive) || (!expectedProgressive && isRegressive)) {
                currentStreak.push(nextItem);
                expectedProgressive = !expectedProgressive;
            } else {
                break;
            }
        }

        if (currentStreak.length >= minLength) {
            allStreaks.push(createStreakObject(data, dateMap, currentStreak, {
                direction,
                values: currentStreak.map(item => item.value)
            }));
            i += currentStreak.length - 2;
        }
    }

    return { description, streaks: allStreaks.filter(Boolean) };
}

// --- HÀM TÌM CHUỖI DẠNG ---

// Về liên tiếp
function findConsecutiveTypeStreaks(data, dateMap, numberMap) {
    const allStreaks = [];
    let currentStreak = [];
    for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (numberMap.has(item.value)) {
            if (currentStreak.length === 0 || isConsecutive(currentStreak[currentStreak.length - 1], item)) {
                currentStreak.push(item);
            } else {
                if (currentStreak.length > 1) {
                    allStreaks.push(createStreakObject(data, dateMap, currentStreak, { value: "Theo dạng" }));
                }
                currentStreak = [item];
            }
        } else {
            if (currentStreak.length > 1) {
                allStreaks.push(createStreakObject(data, dateMap, currentStreak, { value: "Theo dạng" }));
            }
            currentStreak = [];
        }
    }
    if (currentStreak.length > 1) {
        allStreaks.push(createStreakObject(data, dateMap, currentStreak, { value: "Theo dạng" }));
    }
    return { streaks: allStreaks.filter(Boolean) };
}

// [FIXED] Hàm này giờ dùng cho "Về so le" (Thường)
// Chỉ chấp nhận chuỗi có số ngày là số lẻ (3, 5, 7...)
function findAlternatingTypeStreaks(data, dateMap, { condition, description }) {
    const allStreaks = [];
    const processedStreaks = new Set();

    // Helper to calculate day span
    const getDaySpan = (startDate, endDate) => {
        const [d1, m1, y1] = startDate.split('/').map(Number);
        const [d2, m2, y2] = endDate.split('/').map(Number);
        const date1 = new Date(y1, m1 - 1, d1);
        const date2 = new Date(y2, m2 - 1, d2);
        return Math.floor((date2 - date1) / (1000 * 60 * 60 * 24)) + 1;
    };

    for (let i = 0; i < data.length - 2; i++) {
        if (!condition(data[i])) continue;
        if (processedStreaks.has(data[i].date)) continue;

        let streak = [data[i]];
        let currentIndex = i;
        while (currentIndex < data.length - 2) {
            const nextIndex = currentIndex + 2;
            const dayB = data[currentIndex + 1];
            const dayC = data[nextIndex];
            // Loose: Day B can be any type, Day C matches
            if (dayB && dayC &&
                isConsecutive(data[currentIndex], dayB) &&
                isConsecutive(dayB, dayC) &&
                condition(dayC)) {
                streak.push(dayC);
                currentIndex = nextIndex;
            } else {
                break;
            }
        }

        if (streak.length >= 2) {
            const span = getDaySpan(streak[0].date, streak[streak.length - 1].date);
            if (span % 2 === 1) { // Số lẻ
                const finalStreak = createStreakObject(data, dateMap, streak, { value: "Theo dạng" });
                if (finalStreak) {
                    allStreaks.push(finalStreak);
                    streak.forEach(item => processedStreaks.add(item.date));
                }
            }
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

// [FIXED] Hàm này giờ dùng cho "Về so le (mới)"
// Chỉ chấp nhận chuỗi có số ngày là số lẻ (3, 5, 7...)
function findAlternatingTypeStreaksNew(data, dateMap, { condition, valueExtractor, valueLabel }) {
    const allStreaks = [];
    const processedStreaks = new Set();

    // Helper to calculate day span
    const getDaySpan = (startDate, endDate) => {
        const [d1, m1, y1] = startDate.split('/').map(Number);
        const [d2, m2, y2] = endDate.split('/').map(Number);
        const date1 = new Date(y1, m1 - 1, d1);
        const date2 = new Date(y2, m2 - 1, d2);
        return Math.floor((date2 - date1) / (1000 * 60 * 60 * 24)) + 1;
    };

    for (let i = 0; i < data.length - 2; i++) {
        if (!condition(data[i]) || !data[i + 1]) continue;
        if (processedStreaks.has(data[i].date)) continue;
        
        if (condition(data[i + 1])) continue; // Ngày xen kẽ không được thoả mãn condition chính

        let streak = [data[i]];
        let currentIndex = i;
        while (currentIndex < data.length - 2) {
            const nextIndex = currentIndex + 2;
            const dayB = data[currentIndex + 1];
            const dayC = data[nextIndex];
            // Strict: Day B does NOT match condition, Day C matches
            if (dayB && dayC &&
                isConsecutive(data[currentIndex], dayB) &&
                isConsecutive(dayB, dayC) &&
                !condition(dayB) &&
                condition(dayC)) {
                streak.push(dayC);
                currentIndex = nextIndex;
            } else {
                break;
            }
        }

        if (streak.length >= 2) {
            const span = getDaySpan(streak[0].date, streak[streak.length - 1].date);
            if (span % 2 === 1) { // Số lẻ
                const finalStreak = createStreakObject(data, dateMap, streak, { value: valueLabel || "Theo dạng" });
                if (finalStreak) {
                    allStreaks.push(finalStreak);
                    streak.forEach(item => processedStreaks.add(item.date));
                }
            }
        }
    }
    return { streaks: allStreaks.filter(Boolean) };
}

// Hàm phân tích 9 loại cho 1 dạng (Chẵn-Chẵn, Lẻ-Lẻ...)
function analyzeParityStreaks(data, dateMap, setKey, typeName) {
    const numberSet = SETS[setKey];
    const numberMap = MAPS[setKey]; // (value -> true)
    const indexMap = INDEX_MAPS[setKey]; // (value -> index)

    if (!numberSet || !numberMap || !indexMap) {
        console.warn(`[WARN] Bỏ qua dạng ${setKey}: SETS, MAPS hoặc INDEX_MAPS không tồn tại.`);
        return {};
    }

    const typeCondition = (item) => numberMap.has(item.value);
    const descriptionPrefix = `Số dạng ${typeName}`;

    return {
        veLienTiep: { ...findConsecutiveTypeStreaks(data, dateMap, numberMap), description: `${descriptionPrefix} về liên tiếp` },
        veSole: findAlternatingTypeStreaks(data, dateMap, { condition: typeCondition, description: `${descriptionPrefix} về so le` }),
        veSoleMoi: { ...findAlternatingTypeStreaksNew(data, dateMap, { condition: typeCondition, valueExtractor: getParityType, valueLabel: typeName }), description: `${descriptionPrefix} về so le (mới)` },
        tienLienTiep: findProgressiveStreaks(data, dateMap, false, numberSet, indexMap, typeCondition, `${descriptionPrefix} tiến liên tiếp`),
        tienDeuLienTiep: findProgressiveStreaks(data, dateMap, true, numberSet, indexMap, typeCondition, `${descriptionPrefix} tiến ĐỀU liên tiếp`),
        luiLienTiep: findRegressiveStreaks(data, dateMap, false, numberSet, indexMap, typeCondition, `${descriptionPrefix} lùi liên tiếp`),
        luiDeuLienTiep: findRegressiveStreaks(data, dateMap, true, numberSet, indexMap, typeCondition, `${descriptionPrefix} lùi ĐỀU liên tiếp`),
        // [MỚI] Tiến-Lùi So Le
        tienLuiSoLe: findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
            typeCondition, indexMap, descriptionPrefix, startProgressive: true, minLength: 4
        }),
        luiTienSoLe: findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
            typeCondition, indexMap, descriptionPrefix, startProgressive: false, minLength: 4
        }),
    };
}

// --- [MỚI] Pattern Sequence: Tìm chuỗi dạng Chẵn/Lẻ theo thứ tự tuần hoàn ---

// Helper: Phân loại số thành CC/CL/LC/LL
function getParityType(value) {
    const d0 = parseInt(value[0]) % 2; // 0=chẵn, 1=lẻ
    const d1 = parseInt(value[1]) % 2;
    if (d0 === 0 && d1 === 0) return 'CC';
    if (d0 === 0 && d1 === 1) return 'CL';
    if (d0 === 1 && d1 === 0) return 'LC';
    return 'LL';
}

// Helper: Tạo tất cả permutation của mảng
function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const perm of permutations(rest)) {
            result.push([arr[i], ...perm]);
        }
    }
    return result;
}

/**
 * Tìm chuỗi Pattern Sequence tuần hoàn.
 * VD: pattern = ['LC', 'CC', 'LL', 'CL']
 * Tìm chuỗi ngày liên tiếp: ngày 1=LC, ngày 2=CC, ngày 3=LL, ngày 4=CL, ngày 5=LC, ngày 6=CC...
 * Tối thiểu 4 ngày (1 chu kỳ đầy đủ).
 */
function findPatternSequenceStreaks(data, dateMap, pattern, description) {
    const allStreaks = [];
    const patternLen = pattern.length;

    for (let i = 0; i <= data.length - patternLen; i++) {
        // Kiểm tra từ vị trí i
        let streak = [];
        for (let j = i; j < data.length; j++) {
            const expectedType = pattern[(j - i) % patternLen];
            const actualType = getParityType(data[j].value);

            if (actualType !== expectedType) break;
            // Kiểm tra liên tiếp (trừ phần tử đầu tiên)
            if (j > i && !isConsecutive(data[j - 1], data[j])) break;

            streak.push(data[j]);
        }

        if (streak.length >= patternLen) { // Tối thiểu 1 chu kỳ đầy đủ
            const streakObj = createStreakObject(data, dateMap, streak);
            if (streakObj) {
                allStreaks.push(streakObj);
                i = i + streak.length - 1; // Skip forward
            }
        }
    }

    return { description, streaks: allStreaks.filter(Boolean) };
}

// Chuỗi ABAB liên tiếp giữa 2 dạng khác nhau cho nhóm Số đề
function findPairTypeABABStreaks(data, dateMap, { pairConfig, minLength = 3 }) {
    const allStreaks = [];
    const description = `${pairConfig.description} so le theo cặp`;

    for (let i = 0; i < data.length - 1; i++) {
        const labelA = getSoLeTheoCapLabel(data[i].value, pairConfig.key);
        if (!labelA) continue;

        let currentStreak = [data[i]];
        let labelB = null;
        let patternLabels = [labelA];

        for (let j = i; j < data.length - 1; j++) {
            const currentItem = data[j];
            const nextItem = data[j + 1];

            if (!isConsecutive(currentItem, nextItem)) {
                break;
            }

            const nextLabel = getSoLeTheoCapLabel(nextItem.value, pairConfig.key);
            if (!nextLabel) break;

            if (currentStreak.length === 1) {
                if (nextLabel !== labelA) {
                    labelB = nextLabel;
                    currentStreak.push(nextItem);
                    patternLabels.push(nextLabel);
                } else {
                    break;
                }
            } else {
                const expectedLabel = currentStreak.length % 2 === 0 ? labelA : labelB;
                if (nextLabel === expectedLabel) {
                    currentStreak.push(nextItem);
                    patternLabels.push(nextLabel);
                } else {
                    break;
                }
            }
        }

        if (currentStreak.length >= minLength) {
            allStreaks.push(createStreakObject(data, dateMap, currentStreak, {
                values: currentStreak.map(item => item.value),
                patternLabels,
                pairCategory: pairConfig.key,
                value: formatSoLeTheoCapPairValue(pairConfig.key, patternLabels)
            }));
            i += currentStreak.length - 2;
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

// --- HÀM CHẠY CHÍNH ---

async function generateNumberStats(dataDir, statsDir, inMemoryData = null, onPatternGenerated = null) {
    try {
        let originalData;
        if (inMemoryData) {
            originalData = inMemoryData;
        } else {
            const inputPath = dataDir ? path.join(dataDir, 'xsmb-2-digits.json') : DATA_FILE_PATH;
            const rawData = await fs.readFile(inputPath, 'utf-8');
            originalData = JSON.parse(rawData);
        }

        const lotteryData = originalData
            .map(item => {
                if (item.special === null || typeof item.special !== 'number' || isNaN(item.special)) return null;
                const fDate = formatDate(item.date);
                return {
                    date: fDate,
                    timestamp: parseDate(fDate).getTime(),
                    value: String(item.special).padStart(2, '0')
                };
            })
            .filter(item => item !== null)
            .sort((a, b) => a.timestamp - b.timestamp);

        const dateToIndexMap = new Map(lotteryData.map((item, index) => [item.date, index]));

        console.log(`Đã xử lý và chuẩn hóa ${lotteryData.length} kết quả hợp lệ.`);
        console.log('Bắt đầu tính toán thống kê cho các dạng số...');

        const stats = {};
        async function savePattern(patternKey, category, subcategory, description, streaks) {
            if (onPatternGenerated) {
                await onPatternGenerated(patternKey, 'number', category, subcategory, description, streaks);
            } else {
                if (subcategory) {
                    if (!stats[category]) stats[category] = {};
                    stats[category][subcategory] = { description, streaks };
                } else {
                    stats[category] = { description, streaks };
                }
            }
        }

        // 1. Flat number patterns
        let res = findConsecutiveStreaks(lotteryData, dateToIndexMap);
        await savePattern('motSoVeLienTiep', 'motSoVeLienTiep', null, res.description, res.streaks);

        res = findAlternatingStreaks(lotteryData, dateToIndexMap);
        await savePattern('motSoVeSole', 'motSoVeSole', null, res.description, res.streaks);

        res = findAlternatingStreaksNew(lotteryData, dateToIndexMap);
        await savePattern('motSoVeSoleMoi', 'motSoVeSoleMoi', null, res.description, res.streaks);

        res = findProgressiveStreaks(lotteryData, dateToIndexMap, false, SETS.ALL, INDEX_MAPS.ALL, () => true, "Các số tiến liên tiếp");
        await savePattern('cacSoTienLienTiep', 'cacSoTienLienTiep', null, res.description, res.streaks);

        res = findProgressiveStreaks(lotteryData, dateToIndexMap, true, SETS.ALL, INDEX_MAPS.ALL, () => true, "Các số tiến ĐỀU liên tiếp");
        await savePattern('cacSoTienDeuLienTiep', 'cacSoTienDeuLienTiep', null, res.description, res.streaks);

        res = findRegressiveStreaks(lotteryData, dateToIndexMap, false, SETS.ALL, INDEX_MAPS.ALL, () => true, "Các số lùi liên tiếp");
        await savePattern('cacSoLuiLienTiep', 'cacSoLuiLienTiep', null, res.description, res.streaks);

        res = findRegressiveStreaks(lotteryData, dateToIndexMap, true, SETS.ALL, INDEX_MAPS.ALL, () => true, "Các số lùi ĐỀU liên tiếp");
        await savePattern('cacSoLuiDeuLienTiep', 'cacSoLuiDeuLienTiep', null, res.description, res.streaks);

        res = findAlternatingPairStreaks(lotteryData, dateToIndexMap);
        await savePattern('capSoVeSoLe', 'capSoVeSoLe', null, res.description, res.streaks);

        res = findAlternatingProgressiveRegressiveStreaks(lotteryData, dateToIndexMap, true, 4);
        await savePattern('tienLuiSoLe', 'tienLuiSoLe', null, res.description, res.streaks);

        res = findAlternatingProgressiveRegressiveStreaks(lotteryData, dateToIndexMap, false, 4);
        await savePattern('luiTienSoLe', 'luiTienSoLe', null, res.description, res.streaks);

        // 2. Parity nested patterns
        const parityKeys = [
            { key: 'chanChan', setKey: 'CHAN_CHAN', label: 'Chẵn-Chẵn' },
            { key: 'chanLe', setKey: 'CHAN_LE', label: 'Chẵn-Lẻ' },
            { key: 'leChan', setKey: 'LE_CHAN', label: 'Lẻ-Chẵn' },
            { key: 'leLe', setKey: 'LE_LE', label: 'Lẻ-Lẻ' }
        ];
        for (const pk of parityKeys) {
            const pStats = analyzeParityStreaks(lotteryData, dateToIndexMap, pk.setKey, pk.label);
            for (const [subcat, val] of Object.entries(pStats)) {
                await savePattern(`${pk.key}:${subcat}`, pk.key, subcat, val.description, val.streaks);
            }
        }

        // 3. Head tail progressive patterns
        const headTailProgressiveSets = [];
        for (let i = 0; i < 10; i++) {
            headTailProgressiveSets.push(`DAU_DIT_TIEN_${i}`);
        }
        for (const setName of headTailProgressiveSets) {
            const set = SETS[setName];
            const map = INDEX_MAPS[setName];
            const mapTrue = MAPS[setName];
            const key = setName.toLowerCase();
            const desc = `Dạng Đồng Tiến ${setName.split('_')[3]}`;

            if (!set || !map || !mapTrue) continue;
            const typeCondition = (item) => mapTrue.has(item.value);

            const pStats = {
                tienLienTiep: findProgressiveStreaks(lotteryData, dateToIndexMap, false, set, map, typeCondition, `${desc} - Tiến`),
                tienDeuLienTiep: findProgressiveStreaks(lotteryData, dateToIndexMap, true, set, map, typeCondition, `${desc} - Tiến Đều`),
                luiLienTiep: findRegressiveStreaks(lotteryData, dateToIndexMap, false, set, map, typeCondition, `${desc} - Lùi`),
                luiDeuLienTiep: findRegressiveStreaks(lotteryData, dateToIndexMap, true, set, map, typeCondition, `${desc} - Lùi Đều`)
            };
            for (const [subcat, val] of Object.entries(pStats)) {
                await savePattern(`${key}:${subcat}`, key, subcat, val.description, val.streaks);
            }
        }

        // 4. Dong step patterns
        const stepNames = { 22: 'Cách 22', 33: 'Cách 33', 44: 'Cách 44', 55: 'Cách 55' };
        for (const setName of Object.keys(SETS).filter(k => k.startsWith('DONG_STEP_'))) {
            const set = SETS[setName];
            if (!set || set.length < 3) continue;
            const map = INDEX_MAPS[setName];
            const mapTrue = MAPS[setName];
            const key = setName.toLowerCase();
            const parts = setName.split('_');
            const step = parts[2];
            const numbersPreview = set.slice(0, 3).join(',') + (set.length > 3 ? '...' : '');
            const desc = `Đồng ${stepNames[step] || step} (${numbersPreview})`;

            if (!map || !mapTrue) continue;
            const typeCondition = (item) => mapTrue.has(item.value);

            const pStats = {
                tienLienTiep: findProgressiveStreaks(lotteryData, dateToIndexMap, false, set, map, typeCondition, `${desc} - Tiến`),
                tienDeuLienTiep: findProgressiveStreaks(lotteryData, dateToIndexMap, true, set, map, typeCondition, `${desc} - Tiến Đều`),
                luiLienTiep: findRegressiveStreaks(lotteryData, dateToIndexMap, false, set, map, typeCondition, `${desc} - Lùi`),
                luiDeuLienTiep: findRegressiveStreaks(lotteryData, dateToIndexMap, true, set, map, typeCondition, `${desc} - Lùi Đều`)
            };
            for (const [subcat, val] of Object.entries(pStats)) {
                await savePattern(`${key}:${subcat}`, key, subcat, val.description, val.streaks);
            }
        }

        // 5. Parity sum/diff patterns
        const parityLabels = {
            'CHAN_CHAN': 'Chẵn-Chẵn', 'CHAN_LE': 'Chẵn-Lẻ',
            'LE_CHAN': 'Lẻ-Chẵn', 'LE_LE': 'Lẻ-Lẻ'
        };
        const suffixLabels = {
            'TONG_TT_CHAN': 'Tổng TT Chẵn', 'TONG_TT_LE': 'Tổng TT Lẻ',
            'TONG_MOI_CHAN': 'Tổng Mới Chẵn', 'TONG_MOI_LE': 'Tổng Mới Lẻ',
            'HIEU_CHAN': 'Hiệu Chẵn', 'HIEU_LE': 'Hiệu Lẻ'
        };
        for (const setName of Object.keys(SETS).filter(k => k.match(/^(CHAN|LE)_(CHAN|LE)_(TONG|HIEU)/))) {
            const key = setName.toLowerCase();
            const parityPart = setName.match(/^(CHAN_CHAN|CHAN_LE|LE_CHAN|LE_LE)/)[0];
            const suffixPart = setName.replace(parityPart + '_', '');
            const typeName = `${parityLabels[parityPart]} + ${suffixLabels[suffixPart] || suffixPart}`;
            const pStats = analyzeParityStreaks(lotteryData, dateToIndexMap, setName, typeName);
            for (const [subcat, val] of Object.entries(pStats)) {
                await savePattern(`${key}:${subcat}`, key, subcat, val.description, val.streaks);
            }
        }

        // 6. Pattern sequence perms
        const allPerms = permutations(['CC', 'CL', 'LC', 'LL']);
        for (const perm of allPerms) {
            const patternLabel = perm.join('→');
            const patternKey = `pattern_seq_${perm.join('_').toLowerCase()}`;
            res = findPatternSequenceStreaks(lotteryData, dateToIndexMap, perm, `Dạng ${patternLabel} tuần hoàn liên tiếp`);
            await savePattern(patternKey, patternKey, null, res.description, res.streaks);
        }

        // 7. So le theo cap nested patterns cho nhóm Số đề
        for (const pairConfig of getSoLeTheoCapConfigs('number')) {
            const ababRes = findPairTypeABABStreaks(lotteryData, dateToIndexMap, { pairConfig, minLength: 3 });
            await savePattern(`${pairConfig.key}:soLeTheoCap`, pairConfig.key, 'soLeTheoCap', ababRes.description, ababRes.streaks);
        }

        if (inMemoryData) {
            return stats;
        }

        if (!onPatternGenerated) {
            const outputPath = statsDir ? path.join(statsDir, 'number_stats.json') : OUTPUT_FILE_PATH;
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, JSON.stringify(stats, null, 0));
            console.log(`✅ Đã lưu kết quả thống kê số vào: ${outputPath}`);
        }

    } catch (error) {
        console.error("❌ Lỗi khi tạo file thống kê số:", error);
        throw error;
    }
}

module.exports = generateNumberStats;
