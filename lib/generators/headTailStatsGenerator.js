const fs = require('fs').promises;
const path = require('path');
const { SETS, MAPS, INDEX_MAPS, DIGIT_SETS, DIGIT_MAPS, findNextInSet, findPreviousInSet } = require('../utils/numberAnalysis');
const {
    getSoLeTheoCapConfigs,
    getSoLeTheoCapLabel,
    formatSoLeTheoCapPairValue
} = require('../utils/soLeTheoCapPairs');

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

function isConsecutive(item1, item2) {
    if (!item1 || !item2) return false;
    return (item2.timestamp - item1.timestamp) === 86400000;
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

    // Calculate day span
    const daySpan = Math.floor((lastItem.timestamp - firstItem.timestamp) / 86400000) + 1;

    return {
        startDate: firstItem.date,
        endDate: lastItem.date,
        length: daySpan,
        values: streak.map(item => item.value),
        dates: streak.map(item => item.date),
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
            if (isConsecutive(data[j], data[j + 1]) && condition(data[j], data[j + 1])) {
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

        if (isConsecutive(data[i], data[i + 1]) && isConsecutive(data[i + 1], data[i + 2])) {
            const nextValue = valueExtractor(data[i + 2]);
            if (startValue === nextValue && valueExtractor(data[i + 1]) !== startValue) {
                const streakKey = `${startValue}-${data[i].date}`;
                if (processedStreaks.has(streakKey)) continue;
                let streak = [data[i], data[i + 2]];
                let lastIndex = i + 2;
                while (lastIndex < data.length - 2) {
                    const nextPossibleIndex = lastIndex + 2;
                    if (data[nextPossibleIndex] && data[lastIndex + 1] &&
                        isConsecutive(data[lastIndex], data[lastIndex + 1]) &&
                        isConsecutive(data[lastIndex + 1], data[nextPossibleIndex])) {

                        if (startValue === valueExtractor(data[nextPossibleIndex]) && valueExtractor(data[lastIndex + 1]) !== startValue) {
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

        // Loose: Day A matches, Day C matches. Day B can be any type.
        if (isConsecutive(dayA, dayB) && isConsecutive(dayB, dayC) &&
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
                    isConsecutive(data[lastIndex], nextDay) &&
                    isConsecutive(nextDay, nextStreakDay) &&
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
                    // Trích xuất nhãn giá trị từ description thay vì hardcode "Theo dạng"
                    const valueLabel = description
                        .replace(/\s*-\s*Về so le.*$/i, '')
                        .replace(/\s+về so le.*$/i, '')
                        .trim() || "Theo dạng";
                    const finalStreak = createStreakObject(data, dateMap, streak, { value: valueLabel });
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

// [FIXED] "Dạng ... về so le (mới)"
function findAlternatingTypeStreaksNew(data, dateMap, { condition, valueExtractor, valueLabel }) {
    const allStreaks = [];
    const processedStreaks = new Set();
    for (let i = 0; i < data.length - 2; i++) {
        const dayA = data[i];
        const dayB = data[i + 1];
        const dayC = data[i + 2];
        if (!dayB || !dayC) continue;

        // Strict: Day A matches, Day C matches. Day B DOES NOT match.
        if (isConsecutive(dayA, dayB) && isConsecutive(dayB, dayC) &&
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
                if (nextDay && nextStreakDay && isConsecutive(data[lastIndex], nextDay) && isConsecutive(nextDay, nextStreakDay) &&
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
                    const finalStreak = createStreakObject(data, dateMap, streak, { value: valueLabel || "Theo dạng" });
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

        const gapValue = valueExtractor(dayB);
        if (gapValue === startValue) continue;

        // Strict: Day A == Day C, and Day B has gapValue (different from startValue).
        if (isConsecutive(dayA, dayB) && isConsecutive(dayB, dayC) &&
            startValue === valueExtractor(dayC) &&
            gapValue === valueExtractor(dayB)) {

            const streakKey = `${startValue}-${dayA.date}`;
            if (processedStreaks.has(streakKey)) continue;

            let streak = [dayA, dayC];
            let lastIndex = i + 2;

            // Tiếp tục tìm kiếm để kéo dài chuỗi
            while (lastIndex < data.length - 2) {
                const nextDay = data[lastIndex + 1];
                const nextStreakDay = data[lastIndex + 2];

                if (nextDay && nextStreakDay && isConsecutive(data[lastIndex], nextDay) && isConsecutive(nextDay, nextStreakDay) &&
                    startValue === valueExtractor(nextStreakDay) &&
                    gapValue === valueExtractor(nextDay)) {
                    streak.push(nextStreakDay);
                    lastIndex += 2;
                } else {
                    break;
                }
            }

            if (streak.length >= 2) {
                const span = getDaySpan(streak[0].date, streak[streak.length - 1].date);
                if (span % 2 === 1) {
                    const finalStreak = createStreakObject(data, dateMap, streak, { value: `${description.split(' ')[0]} ${startValue}`, gapValue: gapValue });
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
            if (!isConsecutive(currentItem, nextItem) || !typeCondition(nextItem)) {
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
        if (!typeCondition(data[i])) continue;

        let currentStreak = [data[i]];
        let expectedProgressive = startProgressive;

        for (let j = i; j < data.length - 1; j++) {
            const currentItem = data[j];
            const nextItem = data[j + 1];

            if (!isConsecutive(currentItem, nextItem) || !typeCondition(nextItem)) {
                break;
            }

            const val1 = valueExtractor(currentItem);
            const val2 = valueExtractor(nextItem);
            const intVal1 = parseInt(val1, 10);
            const intVal2 = parseInt(val2, 10);

            if (isNaN(intVal1) || isNaN(intVal2)) break;

            const isProgressive = intVal2 > intVal1;
            const isRegressive = intVal2 < intVal1;

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

// Chuỗi ABAB liên tiếp giữa 2 dạng khác nhau. Ví dụ: Đít lẻ, chẵn, lẻ.
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

function findOrderedSequenceStreaks(data, dateMap, {
    typeCondition,
    valueExtractor,
    sequence,
    description,
    alternating = false
}) {
    const orderedSequence = (sequence || []).map(String);
    if (orderedSequence.length < 2) return { description, streaks: [] };

    const allStreaks = [];
    const step = alternating ? 2 : 1;
    const minLength = 2;

    for (let i = 0; i < data.length - step; i++) {
        const first = data[i];
        if (!typeCondition(first)) continue;

        const startIndex = orderedSequence.indexOf(String(valueExtractor(first)));
        if (startIndex === -1) continue;

        const currentStreak = [first];
        let cursor = i;
        let direction = null; // 1 for forward, -1 for reverse
        let expectedIndex = null;

        while (cursor + step < data.length) {
            if (alternating) {
                if (!isConsecutive(data[cursor], data[cursor + 1]) ||
                    !isConsecutive(data[cursor + 1], data[cursor + 2])) {
                    break;
                }
            } else if (!isConsecutive(data[cursor], data[cursor + 1])) {
                break;
            }

            const nextItem = data[cursor + step];
            if (!typeCondition(nextItem)) break;

            const nextValue = String(valueExtractor(nextItem));
            const nextIndex = orderedSequence.indexOf(nextValue);
            if (nextIndex === -1) break;

            if (direction === null) {
                // Determine direction
                const fwdIndex = (startIndex + 1) % orderedSequence.length;
                const revIndex = (startIndex - 1 + orderedSequence.length) % orderedSequence.length;
                if (nextIndex === fwdIndex) {
                    direction = 1;
                    expectedIndex = (fwdIndex + 1) % orderedSequence.length;
                } else if (nextIndex === revIndex) {
                    direction = -1;
                    expectedIndex = (revIndex - 1 + orderedSequence.length) % orderedSequence.length;
                } else {
                    break; // Doesn't match either direction
                }
            } else {
                if (nextIndex !== expectedIndex) break;
                expectedIndex = (expectedIndex + direction + orderedSequence.length) % orderedSequence.length;
            }

            currentStreak.push(nextItem);
            cursor += step;
        }

        if (currentStreak.length >= minLength) {
            const finalStreak = createStreakObject(data, dateMap, currentStreak, {
                orderedValues: currentStreak.map(item => String(valueExtractor(item))),
                orderSequence: orderedSequence
            });
            if (finalStreak) allStreaks.push(finalStreak);
            i = Math.max(i, cursor - 1);
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
            ...findAlternatingTypeStreaksNew(data, dateMap, { condition: (a) => MAPS[typeName].has(a.value), valueExtractor, valueLabel: descriptionPrefix })
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

function analyzeDigitValueGroup(data, dateMap, { typeName, descriptionPrefix, valueExtractor, digitGroup }) {
    const typeCondition = (item) => MAPS[typeName].has(item.value);
    const numberSet = digitGroup.map(String);
    const numberMap = new Map(numberSet.map((digit, index) => [digit, index]));

    return {
        veLienTiep: findStreaks(data, dateMap, {
            condition: (a, b) => typeCondition(a) && typeCondition(b),
            description: `${descriptionPrefix} về liên tiếp`
        }),
        veSole: findAlternatingTypeStreaks(data, dateMap, {
            description: `${descriptionPrefix} về so le`,
            condition: typeCondition
        }),
        veSoleMoi: {
            description: `${descriptionPrefix} về so le (mới)`,
            ...findAlternatingTypeStreaksNew(data, dateMap, { condition: typeCondition, valueExtractor, valueLabel: descriptionPrefix })
        },
        veTheoThuTu: findOrderedSequenceStreaks(data, dateMap, {
            typeCondition,
            valueExtractor,
            sequence: numberSet,
            description: `${descriptionPrefix} về theo thứ tự`
        }),
        veSoLeTheoThuTu: findOrderedSequenceStreaks(data, dateMap, {
            typeCondition,
            valueExtractor,
            sequence: numberSet,
            description: `${descriptionPrefix} về so le theo thứ tự`,
            alternating: true
        }),
        tienLienTiep: findSequence(data, dateMap, { isProgressive: true, isUniform: false, valueExtractor, numberSet, numberMap, typeCondition, description: `${descriptionPrefix} tiến liên tiếp` }),
        tienDeuLienTiep: findSequence(data, dateMap, { isProgressive: true, isUniform: true, valueExtractor, numberSet, numberMap, typeCondition, description: `${descriptionPrefix} tiến ĐỀU liên tiếp` }),
        luiLienTiep: findSequence(data, dateMap, { isProgressive: false, isUniform: false, valueExtractor, numberSet, numberMap, typeCondition, description: `${descriptionPrefix} lùi liên tiếp` }),
        luiDeuLienTiep: findSequence(data, dateMap, { isProgressive: false, isUniform: true, valueExtractor, numberSet, numberMap, typeCondition, description: `${descriptionPrefix} lùi ĐỀU liên tiếp` }),
        tienLuiSoLe: findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
            typeCondition, valueExtractor, descriptionPrefix, startProgressive: true, minLength: 4
        }),
        luiTienSoLe: findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
            typeCondition, valueExtractor, descriptionPrefix, startProgressive: false, minLength: 4
        }),
    };
}

async function generateHeadTailStats(dataDir, statsDir, inMemoryData = null, onPatternGenerated = null) {
    try {
        let originalData;
        if (inMemoryData) {
            originalData = inMemoryData;
        } else {
            const inputPath = dataDir ? path.join(dataDir, 'xsmb-2-digits.json') : DATA_FILE_PATH;
            const rawData = await fs.readFile(inputPath, 'utf-8');
            originalData = JSON.parse(rawData);
        }

        const lotteryData = originalData.map(item => {
            if (item.special === null || typeof item.special !== 'number' || isNaN(item.special)) return null;
            const fDate = formatDate(item.date);
            return {
                date: fDate,
                timestamp: parseDate(fDate).getTime(),
                value: String(item.special).padStart(2, '0')
            };
        }).filter(item => item !== null).sort((a, b) => a.timestamp - b.timestamp);
        const dateToIndexMap = new Map(lotteryData.map((item, index) => [item.date, index]));
        console.log('Bắt đầu tính toán thống kê cho Đầu và Đít...');

        const stats = {};
        async function savePattern(patternKey, category, subcategory, description, streaks) {
            if (onPatternGenerated) {
                await onPatternGenerated(patternKey, 'head_tail', category, subcategory, description, streaks);
            } else {
                if (subcategory) {
                    if (!stats[category]) stats[category] = {};
                    stats[category][subcategory] = { description, streaks };
                } else {
                    stats[category] = { description, streaks };
                }
            }
        }

        // 1. Flat head/tail patterns
        let res = findStreaks(lotteryData, dateToIndexMap, { condition: (a, b) => getHead(a) === getHead(b), description: "1 Đầu về liên tiếp" });
        await savePattern('motDauVeLienTiep', 'motDauVeLienTiep', null, res.description, res.streaks);

        res = findAlternatingStreaks(lotteryData, dateToIndexMap, { description: "1 Đầu về so le", valueExtractor: getHead, condition: () => true });
        await savePattern('motDauVeSole', 'motDauVeSole', null, res.description, res.streaks);

        res = findSequence(lotteryData, dateToIndexMap, { isProgressive: true, isUniform: false, valueExtractor: getHead, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đầu tiến liên tiếp" });
        await savePattern('cacDauTien', 'cacDauTien', null, res.description, res.streaks);

        res = findSequence(lotteryData, dateToIndexMap, { isProgressive: true, isUniform: true, valueExtractor: getHead, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đầu tiến ĐỀU liên tiếp" });
        await savePattern('cacDauTienDeu', 'cacDauTienDeu', null, res.description, res.streaks);

        res = findSequence(lotteryData, dateToIndexMap, { isProgressive: false, isUniform: false, valueExtractor: getHead, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đầu lùi liên tiếp" });
        await savePattern('cacDauLui', 'cacDauLui', null, res.description, res.streaks);

        res = findSequence(lotteryData, dateToIndexMap, { isProgressive: false, isUniform: true, valueExtractor: getHead, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đầu lùi ĐỀU liên tiếp" });
        await savePattern('cacDauLuiDeu', 'cacDauLuiDeu', null, res.description, res.streaks);

        res = findOrderedSequenceStreaks(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getHead, sequence: DIGIT_SETS.DIGITS, description: "Các Đầu về theo thứ tự" });
        await savePattern('cacDauVeTheoThuTu', 'cacDauVeTheoThuTu', null, res.description, res.streaks);

        res = findOrderedSequenceStreaks(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getHead, sequence: DIGIT_SETS.DIGITS, description: "Các Đầu về so le theo thứ tự", alternating: true });
        await savePattern('cacDauVeSoLeTheoThuTu', 'cacDauVeSoLeTheoThuTu', null, res.description, res.streaks);

        res = findStreaks(lotteryData, dateToIndexMap, { condition: (a, b) => getTail(a) === getTail(b), description: "1 Đít về liên tiếp" });
        await savePattern('motDitVeLienTiep', 'motDitVeLienTiep', null, res.description, res.streaks);

        res = findAlternatingStreaks(lotteryData, dateToIndexMap, { description: "1 Đít về so le", valueExtractor: getTail, condition: () => true });
        await savePattern('motDitVeSole', 'motDitVeSole', null, res.description, res.streaks);

        res = findSequence(lotteryData, dateToIndexMap, { isProgressive: true, isUniform: false, valueExtractor: getTail, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đít tiến liên tiếp" });
        await savePattern('cacDitTien', 'cacDitTien', null, res.description, res.streaks);

        res = findSequence(lotteryData, dateToIndexMap, { isProgressive: true, isUniform: true, valueExtractor: getTail, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đít tiến ĐỀU liên tiếp" });
        await savePattern('cacDitTienDeu', 'cacDitTienDeu', null, res.description, res.streaks);

        res = findSequence(lotteryData, dateToIndexMap, { isProgressive: false, isUniform: false, valueExtractor: getTail, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đít lùi liên tiếp" });
        await savePattern('cacDitLui', 'cacDitLui', null, res.description, res.streaks);

        res = findSequence(lotteryData, dateToIndexMap, { isProgressive: false, isUniform: true, valueExtractor: getTail, numberSet: DIGIT_SETS.DIGITS, numberMap: DIGIT_MAPS.DIGITS, typeCondition: () => true, description: "Các Đít lùi ĐỀU liên tiếp" });
        await savePattern('cacDitLuiDeu', 'cacDitLuiDeu', null, res.description, res.streaks);

        res = findOrderedSequenceStreaks(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getTail, sequence: DIGIT_SETS.DIGITS, description: "Các Đít về theo thứ tự" });
        await savePattern('cacDitVeTheoThuTu', 'cacDitVeTheoThuTu', null, res.description, res.streaks);

        res = findOrderedSequenceStreaks(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getTail, sequence: DIGIT_SETS.DIGITS, description: "Các Đít về so le theo thứ tự", alternating: true });
        await savePattern('cacDitVeSoLeTheoThuTu', 'cacDitVeSoLeTheoThuTu', null, res.description, res.streaks);

        res = findAlternatingStreaksNew(lotteryData, dateToIndexMap, { description: "1 Đầu về so le (mới)", valueExtractor: getHead });
        await savePattern('motDauVeSoleMoi', 'motDauVeSoleMoi', null, res.description, res.streaks);

        res = findAlternatingStreaksNew(lotteryData, dateToIndexMap, { description: "1 Đít về so le (mới)", valueExtractor: getTail });
        await savePattern('motDitVeSoleMoi', 'motDitVeSoleMoi', null, res.description, res.streaks);

        res = findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getHead, descriptionPrefix: "Các Đầu", startProgressive: true, minLength: 4 });
        await savePattern('cacDauTienLuiSoLe', 'cacDauTienLuiSoLe', null, res.description, res.streaks);

        res = findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getHead, descriptionPrefix: "Các Đầu", startProgressive: false, minLength: 4 });
        await savePattern('cacDauLuiTienSoLe', 'cacDauLuiTienSoLe', null, res.description, res.streaks);

        res = findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getTail, descriptionPrefix: "Các Đít", startProgressive: true, minLength: 4 });
        await savePattern('cacDitTienLuiSoLe', 'cacDitTienLuiSoLe', null, res.description, res.streaks);

        res = findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, { typeCondition: () => true, valueExtractor: getTail, descriptionPrefix: "Các Đít", startProgressive: false, minLength: 4 });
        await savePattern('cacDitLuiTienSoLe', 'cacDitLuiTienSoLe', null, res.description, res.streaks);

        // 2. So le theo cap nested patterns
        getSoLeTheoCapConfigs('head_tail').forEach(pairConfig => {
            const ababRes = findPairTypeABABStreaks(lotteryData, dateToIndexMap, { pairConfig, minLength: 3 });
            savePattern(`${pairConfig.key}:soLeTheoCap`, pairConfig.key, 'soLeTheoCap', ababRes.description, ababRes.streaks);
        });

        // 3. Digit group configs
        const analysisConfigs = [
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
            { typeName: 'DAU_TO_DIT_TO', descriptionPrefix: 'Đầu to đít to', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_TO_DIT_NHO', descriptionPrefix: 'Đầu to đít nhỏ', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_NHO_DIT_TO', descriptionPrefix: 'Đầu nhỏ đít to', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_NHO_DIT_NHO', descriptionPrefix: 'Đầu nhỏ đít nhỏ', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_LON_HON_4', descriptionPrefix: 'Đầu chẵn lớn hơn 4', valueExtractor: getHead, digitSetKey: 'CHAN_LON_HON_4_DIGITS' },
            { typeName: 'DAU_CHAN_NHO_HON_4', descriptionPrefix: 'Đầu chẵn nhỏ hơn 4', valueExtractor: getHead, digitSetKey: 'CHAN_NHO_HON_4_DIGITS' },
            { typeName: 'DIT_CHAN_LON_HON_4', descriptionPrefix: 'Đít chẵn lớn hơn 4', valueExtractor: getTail, digitSetKey: 'CHAN_LON_HON_4_DIGITS' },
            { typeName: 'DIT_CHAN_NHO_HON_4', descriptionPrefix: 'Đít chẵn nhỏ hơn 4', valueExtractor: getTail, digitSetKey: 'CHAN_NHO_HON_4_DIGITS' },
            { typeName: 'DAU_LE_LON_HON_5', descriptionPrefix: 'Đầu lẻ lớn hơn 5', valueExtractor: getHead, digitSetKey: 'LE_LON_HON_5_DIGITS' },
            { typeName: 'DAU_LE_NHO_HON_5', descriptionPrefix: 'Đầu lẻ nhỏ hơn 5', valueExtractor: getHead, digitSetKey: 'LE_NHO_HON_5_DIGITS' },
            { typeName: 'DIT_LE_LON_HON_5', descriptionPrefix: 'Đít lẻ lớn hơn 5', valueExtractor: getTail, digitSetKey: 'LE_LON_HON_5_DIGITS' },
            { typeName: 'DIT_LE_NHO_HON_5', descriptionPrefix: 'Đít lẻ nhỏ hơn 5', valueExtractor: getTail, digitSetKey: 'LE_NHO_HON_5_DIGITS' },
            { typeName: 'DAU_CHAN_LON_4_DIT_CHAN_LON_4', descriptionPrefix: 'Đầu chẵn lớn hơn 4 và đít chẵn lớn hơn 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_LON_4_DIT_CHAN_NHO_4', descriptionPrefix: 'Đầu chẵn lớn hơn 4 và đít chẵn nhỏ hơn 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_NHO_4_DIT_CHAN_LON_4', descriptionPrefix: 'Đầu chẵn nhỏ hơn 4 và đít chẵn lớn hơn 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_NHO_4_DIT_CHAN_NHO_4', descriptionPrefix: 'Đầu chẵn nhỏ hơn 4 và đít chẵn nhỏ hơn 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_LON_4_DIT_LE_LON_5', descriptionPrefix: 'Đầu chẵn lớn hơn 4 và đít lẻ lớn hơn 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_LON_4_DIT_LE_NHO_5', descriptionPrefix: 'Đầu chẵn lớn hơn 4 và đít lẻ nhỏ hơn 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_NHO_4_DIT_LE_LON_5', descriptionPrefix: 'Đầu chẵn nhỏ hơn 4 và đít lẻ lớn hơn 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_CHAN_NHO_4_DIT_LE_NHO_5', descriptionPrefix: 'Đầu chẵn nhỏ hơn 4 và đít lẻ nhỏ hơn 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_LON_5_DIT_CHAN_LON_4', descriptionPrefix: 'Đầu lẻ lớn hơn 5 và đít chẵn lớn hơn 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_LON_5_DIT_CHAN_NHO_4', descriptionPrefix: 'Đầu lẻ lớn hơn 5 và đít chẵn nhỏ hơn 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_NHO_5_DIT_CHAN_LON_4', descriptionPrefix: 'Đầu lẻ nhỏ hơn 5 và đít chẵn lớn hơn 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_NHO_5_DIT_CHAN_NHO_4', descriptionPrefix: 'Đầu lẻ nhỏ hơn 5 và đít chẵn nhỏ hơn 4', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_LON_5_DIT_LE_LON_5', descriptionPrefix: 'Đầu lẻ lớn hơn 5 và đít lẻ lớn hơn 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_LON_5_DIT_LE_NHO_5', descriptionPrefix: 'Đầu lẻ lớn hơn 5 và đít lẻ nhỏ hơn 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_NHO_5_DIT_LE_LON_5', descriptionPrefix: 'Đầu lẻ nhỏ hơn 5 và đít lẻ lớn hơn 5', valueExtractor: getValue, isTwoDigitSequence: true },
            { typeName: 'DAU_LE_NHO_5_DIT_LE_NHO_5', descriptionPrefix: 'Đầu lẻ nhỏ hơn 5 và đít lẻ nhỏ hơn 5', valueExtractor: getValue, isTwoDigitSequence: true },
        ];
        for (const config of analysisConfigs) {
            const key = config.typeName.toLowerCase();
            const numberMap = MAPS[config.typeName];

            if (!numberMap) continue;

            const pStats = analyzeType(lotteryData, dateToIndexMap, config);
            for (const [subcat, val] of Object.entries(pStats)) {
                await savePattern(`${key}:${subcat}`, key, subcat, val.description, val.streaks);
            }
        }

        // 4. Fixed set configs
        const fixedSetConfigs = [
            'DAU_4_DIT_CHAN_LON_4', 'DAU_4_DIT_CHAN_NHO_4', 'DAU_4_DIT_LE_LON_5', 'DAU_4_DIT_LE_NHO_5',
            'DAU_5_DIT_CHAN_LON_4', 'DAU_5_DIT_CHAN_NHO_4', 'DAU_5_DIT_LE_LON_5', 'DAU_5_DIT_LE_NHO_5',
            'DIT_4_DAU_CHAN_LON_4', 'DIT_4_DAU_CHAN_NHO_4', 'DIT_4_DAU_LE_LON_5', 'DIT_4_DAU_LE_NHO_5',
            'DIT_5_DAU_CHAN_LON_4', 'DIT_5_DAU_CHAN_NHO_4', 'DIT_5_DAU_LE_LON_5', 'DIT_5_DAU_LE_NHO_5'
        ];
        for (let i = 0; i < 10; i++) {
            fixedSetConfigs.push(`DAU_${i}`);
            fixedSetConfigs.push(`DIT_${i}`);
        }

        const fixedSetDescriptions = {
            'DAU_4_DIT_CHAN_LON_4': 'Dạng Đầu 4 và Đít chẵn lớn hơn 4',
            'DAU_4_DIT_CHAN_NHO_4': 'Dạng Đầu 4 và Đít chẵn nhỏ hơn 4',
            'DAU_4_DIT_LE_LON_5': 'Dạng Đầu 4 và Đít lẻ lớn hơn 5',
            'DAU_4_DIT_LE_NHO_5': 'Dạng Đầu 4 và Đít lẻ nhỏ hơn 5',
            'DAU_5_DIT_CHAN_LON_4': 'Dạng Đầu 5 và Đít chẵn lớn hơn 4',
            'DAU_5_DIT_CHAN_NHO_4': 'Dạng Đầu 5 và Đít chẵn nhỏ hơn 4',
            'DAU_5_DIT_LE_LON_5': 'Dạng Đầu 5 và Đít lẻ lớn hơn 5',
            'DAU_5_DIT_LE_NHO_5': 'Dạng Đầu 5 và Đít lẻ nhỏ hơn 5',
            'DIT_4_DAU_CHAN_LON_4': 'Dạng Đít 4 và Đầu chẵn lớn hơn 4',
            'DIT_4_DAU_CHAN_NHO_4': 'Dạng Đít 4 và Đầu chẵn nhỏ hơn 4',
            'DIT_4_DAU_LE_LON_5': 'Dạng Đít 4 và Đầu lẻ lớn hơn 5',
            'DIT_4_DAU_LE_NHO_5': 'Dạng Đít 4 và Đầu lẻ nhỏ hơn 5',
            'DIT_5_DAU_CHAN_LON_4': 'Dạng Đít 5 và Đầu chẵn lớn hơn 4',
            'DIT_5_DAU_CHAN_NHO_4': 'Dạng Đít 5 và Đầu chẵn nhỏ hơn 4',
            'DIT_5_DAU_LE_LON_5': 'Dạng Đít 5 và Đầu lẻ lớn hơn 5',
            'DIT_5_DAU_LE_NHO_5': 'Dạng Đít 5 và Đầu lẻ nhỏ hơn 5'
        };
        for (let i = 0; i < 10; i++) {
            fixedSetDescriptions[`DAU_${i}`] = `Dạng Đầu ${i}`;
            fixedSetDescriptions[`DIT_${i}`] = `Dạng Đít ${i}`;
        }

        for (const typeName of fixedSetConfigs) {
            const key = typeName.toLowerCase();
            const description = fixedSetDescriptions[typeName];
            const numberMap = MAPS[typeName];

            if (!description || !numberMap) continue;
            const typeCondition = (item) => numberMap.has(item.value);

            let valueExtractor;
            if (typeName.startsWith('DAU_') && !typeName.includes('DIT')) {
                valueExtractor = getHead;
            } else if (typeName.startsWith('DIT_') && !typeName.includes('DAU')) {
                valueExtractor = getTail;
            } else {
                valueExtractor = getValue;
            }

            const pStats = {
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
                    ...findAlternatingTypeStreaksNew(lotteryData, dateToIndexMap, { condition: typeCondition, valueExtractor, valueLabel: description })
                },
                tienLuiSoLe: findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, {
                    typeCondition, valueExtractor, descriptionPrefix: description, startProgressive: true, minLength: 4
                }),
                luiTienSoLe: findAlternatingProgressiveRegressiveStreaksForType(lotteryData, dateToIndexMap, {
                    typeCondition, valueExtractor, descriptionPrefix: description, startProgressive: false, minLength: 4
                }),
            };
            for (const [subcat, val] of Object.entries(pStats)) {
                await savePattern(`${key}:${subcat}`, key, subcat, val.description, val.streaks);
            }
        }

        // 5. 3-digit group configs
        const { VALID_3_DIGIT_GROUPS } = require('../utils/numberAnalysis');
        for (const group of VALID_3_DIGIT_GROUPS) {
            const groupKey = group.join('_');
            const groupLabel = group.join(',');

            // Đầu
            const dauSetName = `DAU_3D_${groupKey}`;
            if (MAPS[dauSetName]) {
                const dauKey = dauSetName.toLowerCase();
                const dauDesc = `Đầu (${groupLabel})`;
                const pStats = analyzeDigitValueGroup(lotteryData, dateToIndexMap, {
                    typeName: dauSetName,
                    descriptionPrefix: dauDesc,
                    valueExtractor: getHead,
                    digitGroup: group
                });
                for (const [subcat, val] of Object.entries(pStats)) {
                    await savePattern(`${dauKey}:${subcat}`, dauKey, subcat, val.description, val.streaks);
                }
            }

            // Đít
            const ditSetName = `DIT_3D_${groupKey}`;
            if (MAPS[ditSetName]) {
                const ditKey = ditSetName.toLowerCase();
                const ditDesc = `Đít (${groupLabel})`;
                const pStats = analyzeDigitValueGroup(lotteryData, dateToIndexMap, {
                    typeName: ditSetName,
                    descriptionPrefix: ditDesc,
                    valueExtractor: getTail,
                    digitGroup: group
                });
                for (const [subcat, val] of Object.entries(pStats)) {
                    await savePattern(`${ditKey}:${subcat}`, ditKey, subcat, val.description, val.streaks);
                }
            }
        }

        if (inMemoryData) {
            return stats;
        }

        if (!onPatternGenerated) {
            const outputPath = statsDir ? path.join(statsDir, 'head_tail_stats.json') : OUTPUT_FILE_PATH;
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, JSON.stringify(stats, null, 0));
            console.log(`✅ Đã lưu kết quả thống kê Đầu-Đít vào: ${outputPath}`);
        }

    } catch (error) {
        console.error("❌ Lỗi khi tạo file thống kê Đầu-Đít:", error);
        throw error;
    }
}

module.exports = generateHeadTailStats;
