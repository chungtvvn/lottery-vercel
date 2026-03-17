const fs = require('fs').promises;
const path = require('path');
const { SETS, MAPS, INDEX_MAPS, DIGIT_SETS, DIGIT_MAPS, findNextInSet, findPreviousInSet } = require('../utils/numberAnalysis');

const DATA_FILE_PATH = path.join(__dirname, '..', 'data', 'xsmb-2-digits.json');
const OUTPUT_FILE_PATH = path.join(__dirname, '..', 'data', 'statistics', 'head_tail_stats.json');

// --- CÁC HÀM TIỆN ÍCH ---
const getHead = (item) => item.value[0];
const getTail = (item) => item.value[1];
const getValue = (item) => item.value;

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

// Helper to calculate day span (for odd-day validation in alternating patterns)
function getDaySpan(startDate, endDate) {
    const [d1, m1, y1] = startDate.split('/').map(Number);
    const [d2, m2, y2] = endDate.split('/').map(Number);
    const date1 = new Date(y1, m1 - 1, d1);
    const date2 = new Date(y2, m2 - 1, d2);
    return Math.floor((date2 - date1) / (1000 * 60 * 60 * 24)) + 1;
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

    // Calculate day span
    const [d1, m1, y1] = firstItem.date.split('/').map(Number);
    const [d2, m2, y2] = lastItem.date.split('/').map(Number);
    const date1 = new Date(y1, m1 - 1, d1);
    const date2 = new Date(y2, m2 - 1, d2);
    const daySpan = Math.floor((date2 - date1) / (1000 * 60 * 60 * 24)) + 1;

    return {
        startDate: firstItem.date,
        endDate: lastItem.date,
        length: daySpan,
        values: streak.map(item => item.value),
        dates: streak.map(item => item.date),
        fullSequence,
        ...typeSpecificData
    };
}

// --- CÁC HÀM TÌM CHUỖI ---

function findStreaks(data, dateMap, { condition, description }) {
    const allStreaks = [];
    for (let i = 0; i < data.length - 1; i++) {
        if (!condition(data[i], data[i])) continue;
        let currentStreak = [data[i]];
        for (let j = i; j < data.length - 1; j++) {
            if (isConsecutive(data[j].date, data[j + 1].date) && condition(data[j], data[j + 1])) {
                currentStreak.push(data[j + 1]);
            } else {
                break;
            }
        }
        if (currentStreak.length > 1) {
            allStreaks.push(createStreakObject(data, dateMap, currentStreak));
            i += currentStreak.length - 1;
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

// [FIXED] "1 Đầu/Đít về so le" (Thường) -> Loose Alternating (A - ? - A)
function findAlternatingStreaks(data, dateMap, { description, valueExtractor }) {
    const allStreaks = [];
    const processedStreaks = new Set();
    for (let i = 0; i < data.length - 2; i++) {
        const startValue = valueExtractor(data[i]);
        if (!startValue) continue;

        if (isConsecutive(data[i].date, data[i + 1].date) && isConsecutive(data[i + 1].date, data[i + 2].date)) {
            const nextValue = valueExtractor(data[i + 2]);
            if (startValue === nextValue) {
                const streakKey = `${startValue}-${data[i].date}`;
                if (processedStreaks.has(streakKey)) continue;
                let streak = [data[i], data[i + 2]];
                let lastIndex = i + 2;
                while (lastIndex < data.length - 2) {
                    const nextPossibleIndex = lastIndex + 2;
                    if (data[nextPossibleIndex] && data[lastIndex + 1] &&
                        isConsecutive(data[lastIndex].date, data[lastIndex + 1].date) &&
                        isConsecutive(data[lastIndex + 1].date, data[nextPossibleIndex].date)) {

                        if (startValue === valueExtractor(data[nextPossibleIndex])) {
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
                    const span = getDaySpan(streak[0].date, streak[streak.length - 1].date);
                    if (span % 2 === 1) { // Only odd-day spans
                        const finalStreak = createStreakObject(data, dateMap, streak, { value: `${description.split(' ')[0]} ${startValue}` });
                        if (finalStreak) {
                            allStreaks.push(finalStreak);
                            streak.forEach(item => processedStreaks.add(`${startValue}-${item.date}`));
                        }
                    }
                }
            }
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}
/**
 * Finds streaks of a specific "type" on alternating days.
 * The day in between the streak days can be of any type.
 * @param {Array} data - The lottery data.
 * @param {Map} dateMap - Map of dates to indices.
 * @param {object} options - Options object.
 * @param {function} options.condition - A function that returns true if an item belongs to the target type.
 * @param {string} options.description - The description for the final result object.
 * @returns {object} - An object containing the description and the found streaks.
 */
// [FIXED] "Dạng ... về so le" (Thường) -> Loose Alternating (A - ? - A)
function findAlternatingTypeStreaks(data, dateMap, { condition, description }) {
    const allStreaks = [];
    const processedStreaks = new Set();
    for (let i = 0; i < data.length - 2; i++) {
        const dayA = data[i];
        const dayB = data[i + 1];
        const dayC = data[i + 2];

        // Loose: Day A matches, Day C matches. Day B is ignored.
        if (isConsecutive(dayA.date, dayB.date) && isConsecutive(dayB.date, dayC.date) &&
            condition(dayA) &&
            condition(dayC)) {

            const streakKey = `${dayA.date}`;
            if (processedStreaks.has(streakKey)) continue;

            let streak = [dayA, dayC];
            let lastIndex = i + 2;

            // Continue searching to extend the current streak
            while (lastIndex < data.length - 2) {
                const nextDay = data[lastIndex + 1];
                const nextStreakDay = data[lastIndex + 2];

                if (nextDay && nextStreakDay &&
                    isConsecutive(data[lastIndex].date, nextDay.date) &&
                    isConsecutive(nextDay.date, nextStreakDay.date) &&
                    condition(nextStreakDay)) {
                    streak.push(nextStreakDay);
                    lastIndex += 2;
                } else {
                    break;
                }
            }

            if (streak.length >= 2) {
                const span = getDaySpan(streak[0].date, streak[streak.length - 1].date);
                if (span % 2 === 1) {
                    const finalStreak = createStreakObject(data, dateMap, streak, { value: "Theo dạng" });
                    if (finalStreak) {
                        allStreaks.push(finalStreak);
                        streak.forEach(item => processedStreaks.add(`${item.date}`));
                    }
                }
            }
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

// [FIXED] "Dạng ... về so le (mới)" -> Strict Alternating (A - !A - A)
function findAlternatingTypeStreaksNew(data, dateMap, { condition }) {
    const allStreaks = [];
    const processedStreaks = new Set();
    for (let i = 0; i < data.length - 2; i++) {
        const dayA = data[i];
        const dayB = data[i + 1];
        const dayC = data[i + 2];

        // Strict: Day A matches, Day C matches. Day B DOES NOT match.
        if (isConsecutive(dayA.date, dayB.date) && isConsecutive(dayB.date, dayC.date) &&
            condition(dayA) &&
            !condition(dayB) &&
            condition(dayC)) {

            const streakKey = `${dayA.date}`;
            if (processedStreaks.has(streakKey)) continue;

            let streak = [dayA, dayC];
            let lastIndex = i + 2;

            while (lastIndex < data.length - 2) {
                const nextDay = data[lastIndex + 1];
                const nextStreakDay = data[lastIndex + 2];
                if (nextDay && nextStreakDay && isConsecutive(data[lastIndex].date, nextDay.date) && isConsecutive(nextDay.date, nextStreakDay.date) &&
                    !condition(nextDay) &&
                    condition(nextStreakDay)) {
                    streak.push(nextStreakDay);
                    lastIndex += 2;
                } else {
                    break;
                }
            }
            if (streak.length >= 2) {
                const span = getDaySpan(streak[0].date, streak[streak.length - 1].date);
                if (span % 2 === 1) {
                    const finalStreak = createStreakObject(data, dateMap, streak, { value: "Theo dạng" });
                    if (finalStreak) {
                        allStreaks.push(finalStreak);
                        streak.forEach(item => processedStreaks.add(`${item.date}`));
                    }
                }
            }
        }
    }
    return { streaks: allStreaks.filter(Boolean) };
}

/**
* Tìm chuỗi "so le mới" cho một đầu/đít cụ thể.
* Quy tắc: Ngày xen kẽ (ngày ở giữa) KHÔNG được có cùng đầu/đít.
*/
// [FIXED] "1 Đầu/Đít về so le (mới)" -> Strict Alternating (A - !A - A)
function findAlternatingStreaksNew(data, dateMap, { description, valueExtractor }) {
    const allStreaks = [];
    const processedStreaks = new Set(); // Dùng để tránh lặp lại chuỗi đã xử lý

    for (let i = 0; i < data.length - 2; i++) {
        const dayA = data[i];
        const dayB = data[i + 1];
        const dayC = data[i + 2];

        const startValue = valueExtractor(dayA);
        if (!startValue) continue;

        // Strict: Day A == Day C, and Day B != startValue.
        if (isConsecutive(dayA.date, dayB.date) && isConsecutive(dayB.date, dayC.date) &&
            startValue === valueExtractor(dayC) &&
            startValue !== valueExtractor(dayB)) {

            const streakKey = `${startValue}-${dayA.date}`;
            if (processedStreaks.has(streakKey)) continue;

            let streak = [dayA, dayC];
            let lastIndex = i + 2;

            // Tiếp tục tìm kiếm để kéo dài chuỗi
            while (lastIndex < data.length - 2) {
                const nextDay = data[lastIndex + 1];
                const nextStreakDay = data[lastIndex + 2];

                if (nextDay && nextStreakDay && isConsecutive(data[lastIndex].date, nextDay.date) && isConsecutive(nextDay.date, nextStreakDay.date) &&
                    startValue === valueExtractor(nextStreakDay) &&
                    startValue !== valueExtractor(nextDay)) {
                    streak.push(nextStreakDay);
                    lastIndex += 2;
                } else {
                    break;
                }
            }

            if (streak.length >= 2) {
                const span = getDaySpan(streak[0].date, streak[streak.length - 1].date);
                if (span % 2 === 1) {
                    const finalStreak = createStreakObject(data, dateMap, streak, { value: `${description.split(' ')[0]} ${startValue}` });
                    if (finalStreak) {
                        allStreaks.push(finalStreak);
                        streak.forEach(item => processedStreaks.add(`${startValue}-${item.date}`));
                    }
                }
            }
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

function findSequence(data, dateMap, { isProgressive, isUniform, valueExtractor, numberSet, numberMap, typeCondition, description }) {
    const allStreaks = [];
    for (let i = 0; i < data.length - 1; i++) {
        if (!typeCondition(data[i])) continue;
        let currentStreak = [data[i]];
        for (let j = i; j < data.length - 1; j++) {
            const currentItem = data[j];
            const nextItem = data[j + 1];
            if (!isConsecutive(currentItem.date, nextItem.date) || !typeCondition(nextItem)) {
                break;
            }
            const val1 = valueExtractor(currentItem);
            const val2 = valueExtractor(nextItem);
            let valueCondition;
            if (isProgressive) {
                valueCondition = isUniform ? findNextInSet(val1, numberSet, numberMap) === val2 : parseInt(val2, 10) > parseInt(val1, 10);
            } else {
                valueCondition = isUniform ? findPreviousInSet(val1, numberSet, numberMap) === val2 : parseInt(val2, 10) < parseInt(val1, 10);
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

// --- [MỚI] HÀM TÌM CHUỖI TIẾN LÙI SO LE CHO MỘT DẠNG CỤ THỂ ---
/**
 * Tìm chuỗi tiến-lùi so le cho một dạng cụ thể (đầu, đít, tổng, hiệu)
 * Ví dụ: Đầu chẵn về liên tiếp 4 ngày với giá trị tiến, lùi, tiến, lùi
 * @param {Array} data - Dữ liệu lottery
 * @param {Map} dateMap - Map date -> index
 * @param {Object} options - { typeCondition, valueExtractor, descriptionPrefix, startProgressive, minLength }
 * @returns {Object} { description, streaks }
 */
function findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
    typeCondition,
    valueExtractor,
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
        let expectedProgressive = startProgressive; // true = mong đợi tiến, false = mong đợi lùi

        for (let j = i; j < data.length - 1; j++) {
            const currentItem = data[j];
            const nextItem = data[j + 1];

            // Nếu không liên tiếp HOẶC ngày tiếp theo không thuộc dạng -> dừng
            if (!isConsecutive(currentItem.date, nextItem.date) || !typeCondition(nextItem)) {
                break;
            }

            // Lấy giá trị để so sánh
            const val1 = valueExtractor(currentItem);
            const val2 = valueExtractor(nextItem);

            // Parse to int for comparison
            const intVal1 = parseInt(val1, 10);
            const intVal2 = parseInt(val2, 10);

            if (isNaN(intVal1) || isNaN(intVal2)) break;

            const isProgressive = intVal2 > intVal1;
            const isRegressive = intVal2 < intVal1;

            if ((expectedProgressive && isProgressive) || (!expectedProgressive && isRegressive)) {
                currentStreak.push(nextItem);
                expectedProgressive = !expectedProgressive; // Đổi chiều kỳ vọng
            } else {
                break;
            }
        }

        if (currentStreak.length >= minLength) {
            allStreaks.push(createStreakObject(data, dateMap, currentStreak, {
                direction,
                values: currentStreak.map(item => item.value)
            }));
            i += currentStreak.length - 2; // Skip processed items
        }
    }

    return { description, streaks: allStreaks.filter(Boolean) };
}

function analyzeType(data, dateMap, { typeName, descriptionPrefix, valueExtractor, digitSetKey, isTwoDigitSequence = false }) {
    const typeCondition = (item) => MAPS[typeName].has(item.value);
    const numberSet = isTwoDigitSequence ? SETS[typeName] : DIGIT_SETS[digitSetKey];
    const numberMap = isTwoDigitSequence ? INDEX_MAPS[typeName] : DIGIT_MAPS[digitSetKey];
    return {
        veLienTiep: findStreaks(data, dateMap, {
            condition: (a, b) => typeCondition(a) && typeCondition(b),
            description: `${descriptionPrefix} về liên tiếp`
        }),
        // FIX: Call the new function here
        veSole: findAlternatingTypeStreaks(data, dateMap, {
            description: `${descriptionPrefix} về so le`,
            condition: typeCondition
        }),
        veSoleMoi: { // This is the fix from our previous conversation
            description: `${descriptionPrefix} về so le (mới)`,
            ...findAlternatingTypeStreaksNew(data, dateMap, { condition: (a) => MAPS[typeName].has(a.value) })
        },
        tienLienTiep: findSequence(data, dateMap, { isProgressive: true, isUniform: false, valueExtractor, numberSet, numberMap, typeCondition, description: `${descriptionPrefix} tiến liên tiếp` }),
        tienDeuLienTiep: findSequence(data, dateMap, { isProgressive: true, isUniform: true, valueExtractor, numberSet, numberMap, typeCondition, description: `${descriptionPrefix} tiến ĐỀU liên tiếp` }),
        luiLienTiep: findSequence(data, dateMap, { isProgressive: false, isUniform: false, valueExtractor, numberSet, numberMap, typeCondition, description: `${descriptionPrefix} lùi liên tiếp` }),
        luiDeuLienTiep: findSequence(data, dateMap, { isProgressive: false, isUniform: true, valueExtractor, numberSet, numberMap, typeCondition, description: `${descriptionPrefix} lùi ĐỀU liên tiếp` }),
        // [MỚI] Tiến-Lùi So Le
        tienLuiSoLe: findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
            typeCondition, valueExtractor, descriptionPrefix, startProgressive: true, minLength: 4
        }),
        luiTienSoLe: findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
            typeCondition, valueExtractor, descriptionPrefix, startProgressive: false, minLength: 4
        }),
    };
}

async function generateHeadTailStats() {
    try {
        await fs.mkdir(path.dirname(OUTPUT_FILE_PATH), { recursive: true });
        const rawData = await fs.readFile(DATA_FILE_PATH, 'utf-8');
        const originalData = JSON.parse(rawData);
        const lotteryData = originalData.map(item => (item.special === null || typeof item.special !== 'number' || isNaN(item.special)) ? null : {
            date: formatDate(item.date),
            value: String(item.special).padStart(2, '0')
        }).filter(item => item !== null).sort((a, b) => parseDate(a.date) - parseDate(b.date));
        const dateToIndexMap = new Map(lotteryData.map((item, index) => [item.date, index]));
        console.log('Bắt đầu tính toán thống kê cho Đầu và Đít...');
        const stats = {
            motDauVeLienTiep: findStreaks(lotteryData, dateToIndexMap, { condition: (a, b) => getHead(a) === getHead(b), description: "1 Đầu về liên tiếp" }),
            motDauVeSole: findAlternatingStreaks(lotteryData, dateToIndexMap, { description: "1 Đầu về so le", valueExtractor: getHead, condition: () => true }),
            cacDauTien: findSequence(lotteryData, dateToIndexMap, { isProgressive: true, isUniform: false, valueExtractor: getHead, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đầu tiến liên tiếp" }),
            cacDauTienDeu: findSequence(lotteryData, dateToIndexMap, { isProgressive: true, isUniform: true, valueExtractor: getHead, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đầu tiến ĐỀU liên tiếp" }),
            cacDauLui: findSequence(lotteryData, dateToIndexMap, { isProgressive: false, isUniform: false, valueExtractor: getHead, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đầu lùi liên tiếp" }),
            cacDauLuiDeu: findSequence(lotteryData, dateToIndexMap, { isProgressive: false, isUniform: true, valueExtractor: getHead, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đầu lùi ĐỀU liên tiếp" }),
            motDitVeLienTiep: findStreaks(lotteryData, dateToIndexMap, { condition: (a, b) => getTail(a) === getTail(b), description: "1 Đít về liên tiếp" }),
            motDitVeSole: findAlternatingStreaks(lotteryData, dateToIndexMap, { description: "1 Đít về so le", valueExtractor: getTail, condition: () => true }),
            cacDitTien: findSequence(lotteryData, dateToIndexMap, { isProgressive: true, isUniform: false, valueExtractor: getTail, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đít tiến liên tiếp" }),
            cacDitTienDeu: findSequence(lotteryData, dateToIndexMap, { isProgressive: true, isUniform: true, valueExtractor: getTail, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đít tiến ĐỀU liên tiếp" }),
            cacDitLui: findSequence(lotteryData, dateToIndexMap, { isProgressive: false, isUniform: false, valueExtractor: getTail, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đít lùi liên tiếp" }),
            cacDitLuiDeu: findSequence(lotteryData, dateToIndexMap, { isProgressive: false, isUniform: true, valueExtractor: getTail, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đít lùi ĐỀU liên tiếp" }),
            motDauVeSoleMoi: findAlternatingStreaksNew(lotteryData, dateToIndexMap, { description: "1 Đầu về so le (mới)", valueExtractor: getHead }),
            motDitVeSoleMoi: findAlternatingStreaksNew(lotteryData, dateToIndexMap, { description: "1 Đít về so le (mới)", valueExtractor: getTail }),
            // [MỚI] Tiến lùi So le và Lùi tiến So le
            cacDauTienLuiSoLe: findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getHead, descriptionPrefix: "Các Đầu", startProgressive: true, minLength: 4 }),
            cacDauLuiTienSoLe: findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getHead, descriptionPrefix: "Các Đầu", startProgressive: false, minLength: 4 }),
            cacDitTienLuiSoLe: findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getTail, descriptionPrefix: "Các Đít", startProgressive: true, minLength: 4 }),
            cacDitLuiTienSoLe: findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getTail, descriptionPrefix: "Các Đít", startProgressive: false, minLength: 4 }),
        };
        const analysisConfigs = [
            // [MỚI] Tự động thêm 8 dạng cơ bản
            ...[
                { typeName: 'DAU_CHAN', descriptionPrefix: 'Đầu chẵn', valueExtractor: getHead, digitSetKey: 'CHAN_DIGITS' },
                { typeName: 'DAU_LE', descriptionPrefix: 'Đầu lẻ', valueExtractor: getHead, digitSetKey: 'LE_DIGITS' },
                { typeName: 'DIT_CHAN', descriptionPrefix: 'Đít chẵn', valueExtractor: getTail, digitSetKey: 'CHAN_DIGITS' },
                { typeName: 'DIT_LE', descriptionPrefix: 'Đít lẻ', valueExtractor: getTail, digitSetKey: 'LE_DIGITS' },
                { typeName: 'DAU_TO', descriptionPrefix: 'Đầu to', valueExtractor: getHead, digitSetKey: 'TO_DIGITS' },
                { typeName: 'DAU_NHO', descriptionPrefix: 'Đầu nhỏ', valueExtractor: getHead, digitSetKey: 'NHO_DIGITS' },
                { typeName: 'DIT_TO', descriptionPrefix: 'Đít to', valueExtractor: getTail, digitSetKey: 'TO_DIGITS' },
                { typeName: 'DIT_NHO', descriptionPrefix: 'Đít nhỏ', valueExtractor: getTail, digitSetKey: 'NHO_DIGITS' },
            ],

            // Dạng 2 chữ số (isTwoDigitSequence: true)
            { typeName: 'DAU_TO_DIT_TO', descriptionPrefix: 'Đầu to đít to', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_TO_DIT_NHO', descriptionPrefix: 'Đầu to đít nhỏ', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_NHO_DIT_TO', descriptionPrefix: 'Đầu nhỏ đít to', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_NHO_DIT_NHO', descriptionPrefix: 'Đầu nhỏ đít nhỏ', valueExtractor: getValue, isTwoDigitSequence: true },

            // Dạng 1 chữ số (isTwoDigitSequence: false)
            { typeName: 'DAU_CHAN_LON_HON_4', descriptionPrefix: 'Đầu chẵn > 4', valueExtractor: getHead, digitSetKey: 'CHAN_LON_HON_4_DIGITS' },
            { typeName: 'DAU_CHAN_NHO_HON_4', descriptionPrefix: 'Đầu chẵn < 4', valueExtractor: getHead, digitSetKey: 'CHAN_NHO_HON_4_DIGITS' },
            { typeName: 'DIT_CHAN_LON_HON_4', descriptionPrefix: 'Đít chẵn > 4', valueExtractor: getTail, digitSetKey: 'CHAN_LON_HON_4_DIGITS' },
            { typeName: 'DIT_CHAN_NHO_HON_4', descriptionPrefix: 'Đít chẵn < 4', valueExtractor: getTail, digitSetKey: 'CHAN_NHO_HON_4_DIGITS' },
            { typeName: 'DAU_LE_LON_HON_5', descriptionPrefix: 'Đầu lẻ > 5', valueExtractor: getHead, digitSetKey: 'LE_LON_HON_5_DIGITS' },
            { typeName: 'DAU_LE_NHO_HON_5', descriptionPrefix: 'Đầu lẻ < 5', valueExtractor: getHead, digitSetKey: 'LE_NHO_HON_5_DIGITS' },
            { typeName: 'DIT_LE_LON_HON_5', descriptionPrefix: 'Đít lẻ > 5', valueExtractor: getTail, digitSetKey: 'LE_LON_HON_5_DIGITS' },
            { typeName: 'DIT_LE_NHO_HON_5', descriptionPrefix: 'Đít lẻ < 5', valueExtractor: getTail, digitSetKey: 'LE_NHO_HON_5_DIGITS' },

            // Dạng 2 chữ số (isTwoDigitSequence: true)
            { typeName: 'DAU_CHAN_LON_4_DIT_CHAN_LON_4', descriptionPrefix: 'Đầu chẵn > 4 và đít chẵn > 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_LON_4_DIT_CHAN_NHO_4', descriptionPrefix: 'Đầu chẵn > 4 và đít chẵn < 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_NHO_4_DIT_CHAN_LON_4', descriptionPrefix: 'Đầu chẵn < 4 và đít chẵn > 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_NHO_4_DIT_CHAN_NHO_4', descriptionPrefix: 'Đầu chẵn < 4 và đít chẵn < 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_LON_4_DIT_LE_LON_5', descriptionPrefix: 'Đầu chẵn > 4 và đít lẻ > 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_LON_4_DIT_LE_NHO_5', descriptionPrefix: 'Đầu chẵn > 4 và đít lẻ < 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_NHO_4_DIT_LE_LON_5', descriptionPrefix: 'Đầu chẵn < 4 và đít lẻ > 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_NHO_4_DIT_LE_NHO_5', descriptionPrefix: 'Đầu chẵn < 4 và đít lẻ < 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_LON_5_DIT_CHAN_LON_4', descriptionPrefix: 'Đầu lẻ > 5 và đít chẵn > 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_LON_5_DIT_CHAN_NHO_4', descriptionPrefix: 'Đầu lẻ > 5 và đít chẵn < 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_NHO_5_DIT_CHAN_LON_4', descriptionPrefix: 'Đầu lẻ < 5 và đít chẵn > 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_NHO_5_DIT_CHAN_NHO_4', descriptionPrefix: 'Đầu lẻ < 5 và đít chẵn < 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_LON_5_DIT_LE_LON_5', descriptionPrefix: 'Đầu lẻ > 5 và đít lẻ > 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_LON_5_DIT_LE_NHO_5', descriptionPrefix: 'Đầu lẻ > 5 và đít lẻ < 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_NHO_5_DIT_LE_LON_5', descriptionPrefix: 'Đầu lẻ < 5 và đít lẻ > 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_NHO_5_DIT_LE_NHO_5', descriptionPrefix: 'Đầu lẻ < 5 và đít lẻ < 5', valueExtractor: getValue, isTwoDigitSequence: true },
        ];
        analysisConfigs.forEach(config => {
            const key = config.typeName.toLowerCase();
            stats[key] = analyzeType(lotteryData, dateToIndexMap, config);
        });

        const fixedSetConfigs = [
            'DAU_4_DIT_CHAN_LON_4', 'DAU_4_DIT_CHAN_NHO_4', 'DAU_4_DIT_LE_LON_5', 'DAU_4_DIT_LE_NHO_5',
            'DAU_5_DIT_CHAN_LON_4', 'DAU_5_DIT_CHAN_NHO_4', 'DAU_5_DIT_LE_LON_5', 'DAU_5_DIT_LE_NHO_5',
            'DIT_4_DAU_CHAN_LON_4', 'DIT_4_DAU_CHAN_NHO_4', 'DIT_4_DAU_LE_LON_5', 'DIT_4_DAU_LE_NHO_5',
            'DIT_5_DAU_CHAN_LON_4', 'DIT_5_DAU_CHAN_NHO_4', 'DIT_5_DAU_LE_LON_5', 'DIT_5_DAU_LE_NHO_5'
        ];

        // Thêm 20 config Đầu/Đít 0-9
        for (let i = 0; i < 10; i++) {
            fixedSetConfigs.push(`DAU_${i}`);
            fixedSetConfigs.push(`DIT_${i}`);
        }

        const fixedSetDescriptions = {
            'DAU_4_DIT_CHAN_LON_4': 'Dạng Đầu 4 và Đít chẵn > 4',
            'DAU_4_DIT_CHAN_NHO_4': 'Dạng Đầu 4 và Đít chẵn < 4',
            'DAU_4_DIT_LE_LON_5': 'Dạng Đầu 4 và Đít lẻ > 5',
            'DAU_4_DIT_LE_NHO_5': 'Dạng Đầu 4 và Đít lẻ < 5',
            'DAU_5_DIT_CHAN_LON_4': 'Dạng Đầu 5 và Đít chẵn > 4',
            'DAU_5_DIT_CHAN_NHO_4': 'Dạng Đầu 5 và Đít chẵn < 4',
            'DAU_5_DIT_LE_LON_5': 'Dạng Đầu 5 và Đít lẻ > 5',
            'DAU_5_DIT_LE_NHO_5': 'Dạng Đầu 5 và Đít lẻ < 5',
            'DIT_4_DAU_CHAN_LON_4': 'Dạng Đít 4 và Đầu chẵn > 4',
            'DIT_4_DAU_CHAN_NHO_4': 'Dạng Đít 4 và Đầu chẵn < 4',
            'DIT_4_DAU_LE_LON_5': 'Dạng Đít 4 và Đầu lẻ > 5',
            'DIT_4_DAU_LE_NHO_5': 'Dạng Đít 4 và Đầu lẻ < 5',
            'DIT_5_DAU_CHAN_LON_4': 'Dạng Đít 5 và Đầu chẵn > 4',
            'DIT_5_DAU_CHAN_NHO_4': 'Dạng Đít 5 và Đầu chẵn < 4',
            'DIT_5_DAU_LE_LON_5': 'Dạng Đít 5 và Đầu lẻ > 5',
            'DIT_5_DAU_LE_NHO_5': 'Dạng Đít 5 và Đầu lẻ < 5'
        };

        // Thêm 20 description cho Đầu/Đít 0-9
        for (let i = 0; i < 10; i++) {
            fixedSetDescriptions[`DAU_${i}`] = `Dạng Đầu ${i}`;
            fixedSetDescriptions[`DIT_${i}`] = `Dạng Đít ${i}`;
        }

        // [SỬA ĐỔI] Vòng lặp này giờ sẽ tính thống kê đầy đủ bao gồm tienLuiSoLe
        fixedSetConfigs.forEach(typeName => {
            const key = typeName.toLowerCase();
            const description = fixedSetDescriptions[typeName];
            const numberMap = MAPS[typeName]; // Lấy Map cho bộ số

            if (!description) {
                console.warn(`[fixedSet] Bỏ qua ${typeName}: không tìm thấy description`);
                return;
            }
            if (!numberMap) {
                console.warn(`[fixedSet] Bỏ qua ${typeName}: không tìm thấy MAPS`);
                return;
            }

            // Hàm điều kiện (condition)
            const typeCondition = (item) => numberMap.has(item.value);

            // Xác định valueExtractor dựa trên typeName
            let valueExtractor;
            if (typeName.startsWith('DAU_') && !typeName.includes('DIT')) {
                valueExtractor = getHead;
            } else if (typeName.startsWith('DIT_') && !typeName.includes('DAU')) {
                valueExtractor = getTail;
            } else {
                valueExtractor = getValue; // Dạng 2 chữ số
            }

            stats[key] = {
                veLienTiep: findStreaks(lotteryData, dateToIndexMap, {
                    condition: (a, b) => typeCondition(a) && typeCondition(b),
                    description: `${description} về liên tiếp`
                }),
                veSole: findAlternatingTypeStreaks(lotteryData, dateToIndexMap, {
                    description: `${description} về so le`,
                    condition: typeCondition
                }),
                veSoleMoi: {
                    description: `${description} về so le (mới)`,
                    ...findAlternatingTypeStreaksNew(lotteryData, dateToIndexMap, { condition: typeCondition })
                },
                // [MỚI] Tiến-Lùi So Le cho các dạng fixed set
                tienLuiSoLe: findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, {
                    typeCondition, valueExtractor, descriptionPrefix: description, startProgressive: true, minLength: 4
                }),
                luiTienSoLe: findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, {
                    typeCondition, valueExtractor, descriptionPrefix: description, startProgressive: false, minLength: 4
                })
            };
        });

        await fs.writeFile(OUTPUT_FILE_PATH, JSON.stringify(stats, null, 2));
        console.log(`✅ Đã lưu kết quả thống kê Đầu-Đít vào: ${OUTPUT_FILE_PATH}`);

    } catch (error) {
        console.error("❌ Lỗi khi tạo file thống kê Đầu-Đít:", error);
    }
}

module.exports = generateHeadTailStats;