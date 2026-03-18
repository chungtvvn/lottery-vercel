const fs = require('fs').promises;
const path = require('path');
const { SETS, MAPS, INDEX_MAPS, findNextInSet, findPreviousInSet } = require('../utils/numberAnalysis');

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

function isConsecutive(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return false;
    const d1 = parseDate(dateStr1);
    const d2 = parseDate(dateStr2);
    const oneDay = 24 * 60 * 60 * 1000;
    return d2.getTime() - d1.getTime() === oneDay;
}

function createStreakObject(data, dateMap, streak, typeSpecificData = {}) {
    if (!streak || streak.length < 2) return null;
    const firstItem = streak[0];
    const lastItem = streak[streak.length - 1];
    const startIndex = dateMap.get(firstItem.date);
    const endIndex = dateMap.get(lastItem.date);
    if (startIndex === undefined || endIndex === undefined) return null;

    // Get full sequence including intermediate days
    const fullSequence = data.slice(startIndex, endIndex + 1);

    // Calculate day span (number of days from start to end, inclusive)
    const [d1, m1, y1] = firstItem.date.split('/').map(Number);
    const [d2, m2, y2] = lastItem.date.split('/').map(Number);
    const date1 = new Date(y1, m1 - 1, d1);
    const date2 = new Date(y2, m2 - 1, d2);
    const daySpan = Math.floor((date2 - date1) / (1000 * 60 * 60 * 24)) + 1;

    return {
        startDate: firstItem.date,
        endDate: lastItem.date,
        length: daySpan, // Use day span instead of streak.length
        values: streak.map(item => item.value),
        dates: streak.map(item => item.date),
        fullSequence,
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
            if (isConsecutive(data[lastIndex].date, data[j].date)) {
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
        if (isConsecutive(data[i].date, data[i + 1].date) && isConsecutive(data[i + 1].date, data[i + 2].date)) {
            if (startValue === data[i + 2].value) {
                const streakKey = `${startValue}-${data[i].date}`;
                if (processedStreaks.has(streakKey)) continue;
                let streak = [data[i], data[i + 2]];
                let lastIndex = i + 2;
                while (lastIndex < data.length - 2) {
                    const nextPossibleIndex = lastIndex + 2;
                    if (data[nextPossibleIndex] && data[lastIndex + 1] && isConsecutive(data[lastIndex].date, data[lastIndex + 1].date) && isConsecutive(data[lastIndex + 1].date, data[nextPossibleIndex].date)) {
                        if (startValue === data[nextPossibleIndex].value) {
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
        if (isConsecutive(data[i].date, data[i + 1].date) && isConsecutive(data[i + 1].date, data[i + 2].date)) {
            if (startValue === data[i + 2].value && startValue !== data[i + 1].value) {
                const streakKey = `${startValue}-${data[i].date}`;
                if (processedStreaks.has(streakKey)) continue;
                let streak = [data[i], data[i + 2]];
                let lastIndex = i + 2;
                while (lastIndex < data.length - 2) {
                    const nextPossibleIndex = lastIndex + 2;
                    if (data[nextPossibleIndex] && data[lastIndex + 1] && isConsecutive(data[lastIndex].date, data[lastIndex + 1].date) && isConsecutive(data[lastIndex + 1].date, data[nextPossibleIndex].date)) {
                        if (startValue === data[nextPossibleIndex].value && startValue !== data[lastIndex + 1].value) {
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
    return { description: "1 số về so le Mới (ngày xen kẽ không về)", streaks: allStreaks.filter(Boolean) };
}

// Tìm chuỗi cặp số về so le
function findAlternatingPairStreaks(data, dateMap) {
    const allStreaks = [];
    const processedPairs = new Set();
    for (let i = 0; i < data.length - 3; i++) {
        if (!isConsecutive(data[i].date, data[i + 1].date) || !isConsecutive(data[i + 1].date, data[i + 2].date) || !isConsecutive(data[i + 2].date, data[i + 3].date)) {
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
                if (nextVal1 && nextVal2 && isConsecutive(data[lastIndex].date, nextVal1.date) && isConsecutive(nextVal1.date, nextVal2.date)) {
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
            if (!isConsecutive(currentItem.date, nextItem.date) || !typeCondition(nextItem)) {
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
            if (!isConsecutive(currentItem.date, nextItem.date) || !typeCondition(nextItem)) {
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

            if (!isConsecutive(currentItem.date, nextItem.date)) {
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
            if (!isConsecutive(currentItem.date, nextItem.date) || !typeCondition(nextItem)) {
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
            if (currentStreak.length === 0 || isConsecutive(currentStreak[currentStreak.length - 1].date, item.date)) {
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

// [FIXED] Hàm này giờ dùng cho "Về so le" (Thường) -> Strict Alternating (A - !A - A)
// Chỉ chấp nhận chuỗi có số ngày là số lẻ (3, 5, 7...)
function findAlternatingTypeStreaks(data, dateMap, { condition, description }) {
    const allStreaks = [];

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

        let streak = [data[i]];
        let currentIndex = i;
        while (currentIndex < data.length - 2) {
            const nextIndex = currentIndex + 2;
            const dayB = data[currentIndex + 1];
            const dayC = data[nextIndex];
            // Loose: Only check if Day C matches. Day B is ignored
            if (dayB && dayC &&
                isConsecutive(data[currentIndex].date, dayB.date) &&
                isConsecutive(dayB.date, dayC.date) &&
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
                allStreaks.push(createStreakObject(data, dateMap, streak, { value: "Theo dạng" }));
            }
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

// [FIXED] Hàm này giờ dùng cho "Về so le (mới)" -> Loose Alternating (A - ? - A)
// Chỉ chấp nhận chuỗi có số ngày là số lẻ (3, 5, 7...)
function findAlternatingTypeStreaksNew(data, dateMap, numberMap) {
    const allStreaks = [];

    // Helper to calculate day span
    const getDaySpan = (startDate, endDate) => {
        const [d1, m1, y1] = startDate.split('/').map(Number);
        const [d2, m2, y2] = endDate.split('/').map(Number);
        const date1 = new Date(y1, m1 - 1, d1);
        const date2 = new Date(y2, m2 - 1, d2);
        return Math.floor((date2 - date1) / (1000 * 60 * 60 * 24)) + 1;
    };

    for (let i = 0; i < data.length - 2; i++) {
        // Strict: Day A matches, Day B does NOT match
        if (!numberMap.has(data[i].value) || numberMap.has(data[i + 1].value)) continue;

        let streak = [data[i]];
        let currentIndex = i;
        while (currentIndex < data.length - 2) {
            const nextIndex = currentIndex + 2;
            const dayB = data[currentIndex + 1];
            const dayC = data[nextIndex];
            // Strict: Day B does NOT match, Day C matches
            if (dayB && dayC &&
                isConsecutive(data[currentIndex].date, dayB.date) &&
                isConsecutive(dayB.date, dayC.date) &&
                !numberMap.has(dayB.value) &&
                numberMap.has(dayC.value)) {
                streak.push(dayC);
                currentIndex = nextIndex;
            } else {
                break;
            }
        }

        if (streak.length >= 2) {
            const span = getDaySpan(streak[0].date, streak[streak.length - 1].date);
            if (span % 2 === 1) { // Số lẻ
                allStreaks.push(createStreakObject(data, dateMap, streak, { value: "Theo dạng" }));
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
        veSoleMoi: { ...findAlternatingTypeStreaksNew(data, dateMap, numberMap), description: `${descriptionPrefix} về so le (mới)` },
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

// --- HÀM CHẠY CHÍNH ---

async function generateNumberStats(dataDir, statsDir, inMemoryData = null) {
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
            .map(item => (item.special === null || typeof item.special !== 'number' || isNaN(item.special)) ? null : {
                date: formatDate(item.date),
                value: String(item.special).padStart(2, '0')
            })
            .filter(item => item !== null)
            .sort((a, b) => parseDate(a.date) - parseDate(b.date));

        const dateToIndexMap = new Map(lotteryData.map((item, index) => [item.date, index]));

        console.log(`Đã xử lý và chuẩn hóa ${lotteryData.length} kết quả hợp lệ.`);
        console.log('Bắt đầu tính toán thống kê cho các dạng số...');

        const stats = {
            motSoVeLienTiep: findConsecutiveStreaks(lotteryData, dateToIndexMap),
            motSoVeSole: findAlternatingStreaks(lotteryData, dateToIndexMap),
            motSoVeSoleMoi: findAlternatingStreaksNew(lotteryData, dateToIndexMap),
            cacSoTienLienTiep: findProgressiveStreaks(lotteryData, dateToIndexMap, false, SETS.ALL, INDEX_MAPS.ALL, () => true, "Các số tiến liên tiếp"),
            cacSoTienDeuLienTiep: findProgressiveStreaks(lotteryData, dateToIndexMap, true, SETS.ALL, INDEX_MAPS.ALL, () => true, "Các số tiến ĐỀU liên tiếp"),
            cacSoLuiLienTiep: findRegressiveStreaks(lotteryData, dateToIndexMap, false, SETS.ALL, INDEX_MAPS.ALL, () => true, "Các số lùi liên tiếp"),
            cacSoLuiDeuLienTiep: findRegressiveStreaks(lotteryData, dateToIndexMap, true, SETS.ALL, INDEX_MAPS.ALL, () => true, "Các số lùi ĐỀU liên tiếp"),
            capSoVeSoLe: findAlternatingPairStreaks(lotteryData, dateToIndexMap),
            tienLuiSoLe: findAlternatingProgressiveRegressiveStreaks(lotteryData, dateToIndexMap, true, 4),
            luiTienSoLe: findAlternatingProgressiveRegressiveStreaks(lotteryData, dateToIndexMap, false, 4),
            chanChan: analyzeParityStreaks(lotteryData, dateToIndexMap, 'CHAN_CHAN', 'Chẵn-Chẵn'),
            chanLe: analyzeParityStreaks(lotteryData, dateToIndexMap, 'CHAN_LE', 'Chẵn-Lẻ'),
            leChan: analyzeParityStreaks(lotteryData, dateToIndexMap, 'LE_CHAN', 'Lẻ-Chẵn'),
            leLe: analyzeParityStreaks(lotteryData, dateToIndexMap, 'LE_LE', 'Lẻ-Lẻ'),
        };

        const headTailProgressiveSets = [];
        for (let i = 0; i < 10; i++) {
            headTailProgressiveSets.push(`DAU_DIT_TIEN_${i}`);
        }

        headTailProgressiveSets.forEach(setName => {
            const set = SETS[setName];
            const map = INDEX_MAPS[setName];
            const mapTrue = MAPS[setName];
            const key = setName.toLowerCase();
            const desc = `Dạng Đồng Tiến ${setName.split('_')[3]}`;

            if (!set || !map || !mapTrue) return;
            const typeCondition = (item) => mapTrue.has(item.value);

            stats[key] = {
                tienLienTiep: findProgressiveStreaks(lotteryData, dateToIndexMap, false, set, map, typeCondition, `${desc} - Tiến`),
                tienDeuLienTiep: findProgressiveStreaks(lotteryData, dateToIndexMap, true, set, map, typeCondition, `${desc} - Tiến Đều`),
                luiLienTiep: findRegressiveStreaks(lotteryData, dateToIndexMap, false, set, map, typeCondition, `${desc} - Lùi`),
                luiDeuLienTiep: findRegressiveStreaks(lotteryData, dateToIndexMap, true, set, map, typeCondition, `${desc} - Lùi Đều`)
            };
        });

        if (inMemoryData) {
            return stats;
        }

        const outputPath = statsDir ? path.join(statsDir, 'number_stats.json') : OUTPUT_FILE_PATH;
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, JSON.stringify(stats, null, 2));
        console.log(`✅ Đã lưu kết quả thống kê số vào: ${outputPath}`);

    } catch (error) {
        console.error("❌ Lỗi khi tạo file thống kê số:", error);
    }
}

module.exports = generateNumberStats;