const fs = require('fs').promises;
const path = require('path');
const {
    SETS,
    MAPS,
    INDEX_MAPS,
    getTongMoi,
    getTongTT,
    getHieu,
    findNextInSet,
    findPreviousInSet,
    VALID_TONG_TT_3_VALUE_GROUPS,
    VALID_TONG_MOI_3_VALUE_GROUPS,
    VALID_HIEU_3_VALUE_GROUPS
} = require('../utils/numberAnalysis'); // Giả định utils/numberAnalysis.js đã có TONG_MOI_18_0_1
const {
    getSoLeTheoCapConfigs,
    getSoLeTheoCapLabel,
    formatSoLeTheoCapPairValue
} = require('../utils/soLeTheoCapPairs');

const DATA_FILE_PATH = path.join(__dirname, '..', 'data', 'xsmb-2-digits.json');
const OUTPUT_FILE_PATH = path.join(__dirname, '..', 'data', 'statistics', 'sum_difference_stats.json');

// --- CÁC HÀM TIỆN ÍCH ---
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

function createStreakObject(data, dateMap, streak, typeSpecificData = {}) {
    if (!streak || streak.length < 2) return null;
    const firstItem = streak[0];
    const lastItem = streak[streak.length - 1];
    const startIndex = dateMap.get(firstItem.date);
    const endIndex = dateMap.get(lastItem.date);
    if (startIndex === undefined || endIndex === undefined) return null;

    const fullSequence = data.slice(startIndex, endIndex + 1);

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
    let i = 0;
    while (i < data.length - 1) {
        if (!condition(data[i], data[i])) {
            i++;
            continue;
        }
        let currentStreak = [data[i]];
        let j = i;
        while (j < data.length - 1) {
            if (isConsecutive(data[j], data[j + 1]) && condition(data[j], data[j + 1])) {
                currentStreak.push(data[j + 1]);
                j++;
            } else {
                break;
            }
        }
        if (currentStreak.length > 1) {
            allStreaks.push(createStreakObject(data, dateMap, currentStreak));
            i = j + 1; // Nhảy tới sau chuỗi vừa tìm thấy
        } else {
            i++; // Chỉ tăng 1 nếu không tìm thấy chuỗi
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

function findAlternatingStreaks(data, dateMap, { condition, description, valueExtractor }) {
    const allStreaks = [];
    let i = 0;
    while (i < data.length - 2) {
        if (!condition(data[i])) {
            i++;
            continue;
        }

        const startValue = valueExtractor(data[i]);
        const dayB = data[i + 1];
        const dayC = data[i + 2];

        if (dayB && dayC && isConsecutive(data[i], dayB) && isConsecutive(dayB, dayC)) {
            if (condition(dayC) && startValue === valueExtractor(dayC)) {
                let streak = [data[i], dayC];
                let lastIndex = i + 2;
                while (lastIndex < data.length - 2) {
                    const nextDayB = data[lastIndex + 1];
                    const nextDayC = data[lastIndex + 2];
                    if (nextDayB && nextDayC && isConsecutive(data[lastIndex], nextDayB) && isConsecutive(nextDayB, nextDayC) && condition(nextDayC) && startValue === valueExtractor(nextDayC)) {
                        streak.push(nextDayC);
                        lastIndex += 2;
                    } else {
                        break;
                    }
                }
                if (streak.length >= 2) {
                    allStreaks.push(createStreakObject(data, dateMap, streak, { value: `${description.split(' ')[0]} ${startValue}` }));
                    i = lastIndex; // Nhảy tới cuối chuỗi vừa tìm được
                    continue; // Bắt đầu vòng lặp tiếp theo từ vị trí mới
                }
            }
        }
        i++; // Chỉ tăng 1 nếu không tìm thấy chuỗi bắt đầu từ i
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}


// [FIXED] Hàm này giờ dùng cho "Các Tổng - Về so le" và "Các Tổng - Về so le mới"
function findAlternatingValueStreaks(data, dateMap, { valueExtractor, description, isNewType }) {
    const allStreaks = [];
    const processedStreaks = new Set();

    for (let i = 0; i < data.length - 2; i++) {
        const startValue = valueExtractor(data[i]);
        const streakKey = `${startValue}-${data[i].date}`;

        if (processedStreaks.has(streakKey)) continue;

        let streak = [data[i]];
        let lastIndex = i;

        while (lastIndex < data.length - 2) {
            const dayB = data[lastIndex + 1];
            const dayC = data[lastIndex + 2];

            if (dayB && dayC && isConsecutive(data[lastIndex], dayB) && isConsecutive(dayB, dayC)) {
                const valueB = valueExtractor(dayB);
                const valueC = valueExtractor(dayC);

                // "So le mới" (stricter): ngày ở giữa phải KHÁC giá trị -> valueB !== startValue
                // "So le thường" (looser): ngày ở giữa có thể là bất kỳ giá trị nào -> luôn true
                const newTypeCondition = isNewType ? valueB !== startValue : true;

                if (valueC === startValue && newTypeCondition) {
                    streak.push(dayC);
                    lastIndex += 2;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        if (streak.length >= 2) {
            allStreaks.push(createStreakObject(data, dateMap, streak, { value: startValue }));
            streak.forEach(item => processedStreaks.add(`${startValue}-${item.date}`));
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}


// [FIXED] Sửa lại logic để không bỏ sót chuỗi
// [FIXED] Hàm này giờ dùng cho "Về so le" (Thường) -> Loose Alternating (A - ? - A)
// Chỉ chấp nhận chuỗi có số ngày là số lẻ
function findAlternatingTypeStreaks(data, dateMap, { condition, description }) {
    const allStreaks = [];
    const processedStreaks = new Set();
    const getDaySpan = (startDate, endDate) => {
        const [d1, m1, y1] = startDate.split('/').map(Number);
        const [d2, m2, y2] = endDate.split('/').map(Number);
        const date1 = new Date(y1, m1 - 1, d1);
        const date2 = new Date(y2, m2 - 1, d2);
        return Math.floor((date2 - date1) / (1000 * 60 * 60 * 24)) + 1;
    };

    for (let i = 0; i < data.length - 2; i++) {
        const dayA = data[i];
        const dayB = data[i + 1];
        const dayC = data[i + 2];

        // Loose: Day A matches, Day C matches
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

// [FIXED] Hàm này giờ dùng cho "Về so le (mới)" -> Strict Alternating (A - !A - A)
// Chỉ chấp nhận chuỗi có số ngày là số lẻ
function findAlternatingTypeStreaksNew(data, dateMap, numberMap, valueLabel) {
    const allStreaks = [];
    const processedStreaks = new Set();
    const getDaySpan = (startDate, endDate) => {
        const [d1, m1, y1] = startDate.split('/').map(Number);
        const [d2, m2, y2] = endDate.split('/').map(Number);
        const date1 = new Date(y1, m1 - 1, d1);
        const date2 = new Date(y2, m2 - 1, d2);
        return Math.floor((date2 - date1) / (1000 * 60 * 60 * 24)) + 1;
    };

    for (let i = 0; i < data.length - 2; i++) {
        const dayA = data[i];
        const dayB = data[i + 1];
        const dayC = data[i + 2];

        // Strict: Day A matches, Day C matches. Day B DOES NOT match.
        if (isConsecutive(dayA, dayB) && isConsecutive(dayB, dayC) &&
            numberMap.has(dayA.value) &&
            !numberMap.has(dayB.value) &&
            numberMap.has(dayC.value)) {

            const streakKey = `${dayA.date}`;
            if (processedStreaks.has(streakKey)) continue;

            let streak = [dayA, dayC];
            let lastIndex = i + 2;

            while (lastIndex < data.length - 2) {
                const nextDay = data[lastIndex + 1];
                const nextStreakDay = data[lastIndex + 2];
                if (nextDay && nextStreakDay && isConsecutive(data[lastIndex], nextDay) && isConsecutive(nextDay, nextStreakDay) &&
                    !numberMap.has(nextDay.value) &&
                    numberMap.has(nextStreakDay.value)) {
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


// --- [MỚI] HÀM TÌM CHUỖI TIẾN LÙI SO LE CHO MỘT DẠNG CỤ THỂ ---
/**
 * Tìm chuỗi tiến-lùi so le cho Tổng/Hiệu
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
    const description = `${descriptionPrefix} - ${direction} So Le`;

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

function findSequence(data, dateMap, { isProgressive, isUniform, valueExtractor, numberSet, indexMap, typeCondition, description }) {
    const allStreaks = [];
    let i = 0;
    while (i < data.length - 1) {
        if (!typeCondition(data[i])) {
            i++;
            continue;
        }
        let currentStreak = [data[i]];
        let j = i;
        while (j < data.length - 1) {
            const currentItem = data[j];
            const nextItem = data[j + 1];
            if (!isConsecutive(currentItem, nextItem) || !typeCondition(nextItem)) {
                break;
            }
            const val1 = valueExtractor(currentItem);
            const val2 = valueExtractor(nextItem);
            const strVal1 = String(val1);
            const strVal2 = String(val2);
            let valueCondition;
            if (isProgressive) {
                valueCondition = isUniform ? findNextInSet(strVal1, numberSet, indexMap) === strVal2 : val2 > val1;
            } else {
                valueCondition = isUniform ? findPreviousInSet(strVal1, numberSet, indexMap) === strVal2 : val2 < val1;
            }
            if (valueCondition) {
                currentStreak.push(nextItem);
                j++;
            } else {
                break;
            }
        }
        if (currentStreak.length > 1) {
            allStreaks.push(createStreakObject(data, dateMap, currentStreak));
            i = j; // Nhảy tới cuối chuỗi
        } else {
            i++;
        }
    }
    return { description, streaks: allStreaks.filter(Boolean) };
}

// Chuỗi ABAB liên tiếp giữa 2 dạng khác nhau. Ví dụ: Tổng chẵn, lẻ, chẵn.
function findPairTypeABABStreaks(data, dateMap, { pairConfig, minLength = 3 }) {
    const allStreaks = [];
    const description = `${pairConfig.description} - So Le Theo Cặp`;

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

    for (let i = 0; i < data.length - step; i++) {
        const first = data[i];
        if (!typeCondition(first)) continue;

        const startIndex = orderedSequence.indexOf(String(valueExtractor(first)));
        if (startIndex === -1) continue;

        const currentStreak = [first];
        let expectedIndex = (startIndex + 1) % orderedSequence.length;
        let cursor = i;

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
            if (nextValue !== orderedSequence[expectedIndex]) break;

            currentStreak.push(nextItem);
            expectedIndex = (expectedIndex + 1) % orderedSequence.length;
            cursor += step;
        }

        if (currentStreak.length >= 2) {
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


function analyzeNumberSet(data, dateMap, { typeName, descriptionPrefix }) {
    const typeCondition = (item) => MAPS[typeName] && MAPS[typeName].has(item.value);
    return {
        veLienTiep: findStreaks(data, dateMap, { condition: (a, b) => typeCondition(a) && typeCondition(b), description: `${descriptionPrefix} - Về liên tiếp` }),
        veSole: findAlternatingTypeStreaks(data, dateMap, {
            description: `${descriptionPrefix} về so le`,
            condition: typeCondition
        }),
        veSoleMoi: {
            description: `${descriptionPrefix} - Về so le (mới)`,
            ...findAlternatingTypeStreaksNew(data, dateMap, MAPS[typeName] || new Map(), descriptionPrefix)
        },
        tienLienTiep: findSequence(data, dateMap, { isProgressive: true, isUniform: false, valueExtractor: getValue, numberSet: SETS[typeName], indexMap: INDEX_MAPS[typeName], typeCondition, description: `${descriptionPrefix} - Tiến liên tiếp` }),
        tienDeuLienTiep: findSequence(data, dateMap, { isProgressive: true, isUniform: true, valueExtractor: getValue, numberSet: SETS[typeName], indexMap: INDEX_MAPS[typeName], typeCondition, description: `${descriptionPrefix} - Tiến Đều` }),
        luiLienTiep: findSequence(data, dateMap, { isProgressive: false, isUniform: false, valueExtractor: getValue, numberSet: SETS[typeName], indexMap: INDEX_MAPS[typeName], typeCondition, description: `${descriptionPrefix} - Lùi liên tiếp` }),
        luiDeuLienTiep: findSequence(data, dateMap, { isProgressive: false, isUniform: true, valueExtractor: getValue, numberSet: SETS[typeName], indexMap: INDEX_MAPS[typeName], typeCondition, description: `${descriptionPrefix} - Lùi Đều` }),
        // [MỚI] Tiến-Lùi So Le
        tienLuiSoLe: findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
            typeCondition, valueExtractor: getValue, descriptionPrefix, startProgressive: true, minLength: 4
        }),
        luiTienSoLe: findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
            typeCondition, valueExtractor: getValue, descriptionPrefix, startProgressive: false, minLength: 4
        }),
    };
}

function analyzeValueSequence(data, dateMap, { valueExtractor, valueSet, valueMap, descriptionPrefix, typeCondition, includeOrderedSequence = false }) {
    const isGroupAnalysis = !!typeCondition;
    const effectiveTypeCondition = typeCondition || (() => true);
    const results = {};

    const consecutiveCondition = isGroupAnalysis ? (a, b) => effectiveTypeCondition(a) && effectiveTypeCondition(b) : (a, b) => valueExtractor(a) === valueExtractor(b);
    results.veLienTiep = findStreaks(data, dateMap, { condition: consecutiveCondition, description: `${descriptionPrefix} - Về liên tiếp` });

    if (isGroupAnalysis) {
        results.veCungGiaTri = findStreaks(data, dateMap, {
            condition: (a, b) => effectiveTypeCondition(a) && effectiveTypeCondition(b) && valueExtractor(a) === valueExtractor(b),
            description: `${descriptionPrefix} - Về cùng giá trị`
        });
    }
    // [FIXED] Phân luồng logic cho "so le" và "so le mới"
    if (isGroupAnalysis) {
        results.veSole = findAlternatingTypeStreaks(data, dateMap, { condition: effectiveTypeCondition, description: `${descriptionPrefix} - Về so le` });
        const valueBasedNumberMap = new Map(data.filter(effectiveTypeCondition).map(item => [item.value, true]));
        results.veSoleMoi = {
            description: `${descriptionPrefix} - Về so le (mới)`,
            ...findAlternatingTypeStreaksNew(data, dateMap, valueBasedNumberMap, descriptionPrefix)
        };
    } else {
        results.veSole = findAlternatingValueStreaks(data, dateMap, { valueExtractor, description: `${descriptionPrefix} - Về so le`, isNewType: false });
        results.veSoleMoi = findAlternatingValueStreaks(data, dateMap, { valueExtractor, description: `${descriptionPrefix} - Về so le (mới)`, isNewType: true });
    }
    if (includeOrderedSequence) {
        results.veTheoThuTu = findOrderedSequenceStreaks(data, dateMap, {
            typeCondition: effectiveTypeCondition,
            valueExtractor,
            sequence: valueSet,
            description: `${descriptionPrefix} - Về theo thứ tự`
        });
        results.veSoLeTheoThuTu = findOrderedSequenceStreaks(data, dateMap, {
            typeCondition: effectiveTypeCondition,
            valueExtractor,
            sequence: valueSet,
            description: `${descriptionPrefix} - Về so le theo thứ tự`,
            alternating: true
        });
    }

    Object.assign(results, {
        tienLienTiep: findSequence(data, dateMap, { isProgressive: true, isUniform: false, valueExtractor, typeCondition: effectiveTypeCondition, description: `${descriptionPrefix} - Tiến liên tiếp` }),
        tienDeuLienTiep: findSequence(data, dateMap, { isProgressive: true, isUniform: true, valueExtractor, numberSet: valueSet, indexMap: valueMap, typeCondition: effectiveTypeCondition, description: `${descriptionPrefix} - Tiến Đều` }),
        luiLienTiep: findSequence(data, dateMap, { isProgressive: false, isUniform: false, valueExtractor, typeCondition: effectiveTypeCondition, description: `${descriptionPrefix} - Lùi liên tiếp` }),
        luiDeuLienTiep: findSequence(data, dateMap, { isProgressive: false, isUniform: true, valueExtractor, numberSet: valueSet, indexMap: valueMap, typeCondition: effectiveTypeCondition, description: `${descriptionPrefix} - Lùi Đều` }),
        // [MỚI] Tiến-Lùi So Le
        tienLuiSoLe: findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
            typeCondition: effectiveTypeCondition, valueExtractor, descriptionPrefix, startProgressive: true, minLength: 4
        }),
        luiTienSoLe: findAlternatingProgressiveRegressiveStreaksForType(data, dateMap, {
            typeCondition: effectiveTypeCondition, valueExtractor, descriptionPrefix, startProgressive: false, minLength: 4
        }),
    });

    return results;
}

async function generateSumDifferenceStats(dataDir, statsDir, inMemoryData = null, onPatternGenerated = null) {
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
        console.log('Bắt đầu tính toán thống kê cho Tổng và Hiệu...');

        const stats = {};
        async function savePattern(patternKey, category, subcategory, description, streaks) {
            if (onPatternGenerated) {
                await onPatternGenerated(patternKey, 'sum_diff', category, subcategory, description, streaks);
            } else {
                if (subcategory) {
                    if (!stats[category]) stats[category] = {};
                    stats[category][subcategory] = { description, streaks };
                } else {
                    stats[category] = { description, streaks };
                }
            }
        }

        for (const pairConfig of getSoLeTheoCapConfigs('sum_diff')) {
            const res = findPairTypeABABStreaks(lotteryData, dateToIndexMap, { pairConfig, minLength: 3 });
            await savePattern(`${pairConfig.key}:soLeTheoCap`, pairConfig.key, 'soLeTheoCap', res.description, res.streaks);
        }

        const numberSetConfigs = [
            ...Array.from({ length: 10 }, (_, i) => ({ typeName: `TONG_TT_${i + 1}`, descriptionPrefix: `Tổng TT - Cùng tổng ${i + 1}` })),
            ...Array.from({ length: 19 }, (_, i) => ({ typeName: `TONG_MOI_${i}`, descriptionPrefix: `Tổng Mới - Cùng tổng ${i}` })),
            ...Array.from({ length: 10 }, (_, i) => ({ typeName: `HIEU_${i}`, descriptionPrefix: `Hiệu - Cùng hiệu ${i}` })),
        ];
        for (const config of numberSetConfigs) {
            const res = analyzeNumberSet(lotteryData, dateToIndexMap, config);
            const key = config.typeName.toLowerCase();
            for (const [subcat, val] of Object.entries(res)) {
                await savePattern(`${key}:${subcat}`, key, subcat, val.description, val.streaks);
            }
        }

        const flatSequenceConfigs = [
            { key: 'tong_tt_cac_tong', extractor: (item) => getTongTT(item.value), set: SETS.TONG_TT_SEQUENCE, map: INDEX_MAPS.TONG_TT_SEQUENCE, desc: 'Tổng TT - Các tổng', opt: true },
            { key: 'tong_moi_cac_tong', extractor: (item) => getTongMoi(item.value), set: SETS.TONG_MOI_SEQUENCE, map: INDEX_MAPS.TONG_MOI_SEQUENCE, desc: 'Tổng Mới - Các tổng', opt: true },
            { key: 'hieu_cac_hieu', extractor: (item) => getHieu(item.value), set: SETS.HIEU_SEQUENCE, map: INDEX_MAPS.HIEU_SEQUENCE, desc: 'Các Hiệu', opt: true },
            {
                key: 'tong_tt_chan',
                extractor: (item) => getTongTT(item.value),
                set: SETS.TONG_TT_CHAN_SEQUENCE,
                map: INDEX_MAPS.TONG_TT_CHAN_SEQUENCE,
                desc: 'Tổng TT - Tổng Chẵn',
                cond: (item) => getTongTT(item.value) % 2 === 0
            },
            {
                key: 'tong_tt_le',
                extractor: (item) => getTongTT(item.value),
                set: SETS.TONG_TT_LE_SEQUENCE,
                map: INDEX_MAPS.TONG_TT_LE_SEQUENCE,
                desc: 'Tổng TT - Tổng Lẻ',
                cond: (item) => getTongTT(item.value) % 2 !== 0
            },
            {
                key: 'tong_moi_chan',
                extractor: (item) => getTongMoi(item.value),
                set: SETS.TONG_MOI_CHAN_SEQUENCE,
                map: INDEX_MAPS.TONG_MOI_CHAN_SEQUENCE,
                desc: 'Tổng Mới - Tổng Chẵn',
                cond: (item) => getTongMoi(item.value) % 2 === 0
            },
            {
                key: 'tong_moi_le',
                extractor: (item) => getTongMoi(item.value),
                set: SETS.TONG_MOI_LE_SEQUENCE,
                map: INDEX_MAPS.TONG_MOI_LE_SEQUENCE,
                desc: 'Tổng Mới - Tổng Lẻ',
                cond: (item) => getTongMoi(item.value) % 2 !== 0
            },
            {
                key: 'hieu_chan',
                extractor: (item) => getHieu(item.value),
                set: SETS.HIEU_CHAN_SEQUENCE,
                map: INDEX_MAPS.HIEU_CHAN_SEQUENCE,
                desc: 'Hiệu Chẵn',
                cond: (item) => getHieu(item.value) % 2 === 0
            },
            {
                key: 'hieu_le',
                extractor: (item) => getHieu(item.value),
                set: SETS.HIEU_LE_SEQUENCE,
                map: INDEX_MAPS.HIEU_LE_SEQUENCE,
                desc: 'Hiệu Lẻ',
                cond: (item) => getHieu(item.value) % 2 !== 0
            }
        ];

        for (const config of flatSequenceConfigs) {
            const res = analyzeValueSequence(lotteryData, dateToIndexMap, {
                valueExtractor: config.extractor,
                valueSet: config.set,
                valueMap: config.map,
                descriptionPrefix: config.desc,
                typeCondition: config.cond,
                includeOrderedSequence: config.opt
            });
            for (const [subcat, val] of Object.entries(res)) {
                await savePattern(`${config.key}:${subcat}`, config.key, subcat, val.description, val.streaks);
            }
        }

        const dangTongConfigs = [
            { typeName: 'TONG_MOI_CHAN_CHAN', descriptionPrefix: 'Tổng Mới - Dạng Chẵn-Chẵn', getter: getTongMoi, sequenceType: 'CHAN' },
            { typeName: 'TONG_MOI_CHAN_LE', descriptionPrefix: 'Tổng Mới - Dạng Chẵn-Lẻ', getter: getTongMoi, sequenceType: 'LE' },
            { typeName: 'TONG_MOI_LE_CHAN', descriptionPrefix: 'Tổng Mới - Dạng Lẻ-Chẵn', getter: getTongMoi, sequenceType: 'CHAN' },
            { typeName: 'TONG_MOI_LE_LE', descriptionPrefix: 'Tổng Mới - Dạng Lẻ-Lẻ', getter: getTongMoi, sequenceType: 'LE' },
            { typeName: 'TONG_TT_CHAN_CHAN', descriptionPrefix: 'Tổng TT - Dạng Chẵn-Chẵn', getter: getTongTT, sequenceType: 'CHAN' },
            { typeName: 'TONG_TT_CHAN_LE', descriptionPrefix: 'Tổng TT - Dạng Chẵn-Lẻ', getter: getTongTT, sequenceType: 'LE' },
            { typeName: 'TONG_TT_LE_CHAN', descriptionPrefix: 'Tổng TT - Dạng Lẻ-Chẵn', getter: getTongTT, sequenceType: 'CHAN' },
            { typeName: 'TONG_TT_LE_LE', descriptionPrefix: 'Tổng TT - Dạng Lẻ-Lẻ', getter: getTongTT, sequenceType: 'LE' },
        ];

        for (const config of dangTongConfigs) {
            const isTongTT = config.typeName.startsWith('TONG_TT');
            const tongPrefix = isTongTT ? 'TONG_TT' : 'TONG_MOI';
            const valueSequenceKey = config.sequenceType === 'CHAN' ? `${tongPrefix}_CHAN_SEQUENCE` : `${tongPrefix}_LE_SEQUENCE`;
            const sequenceSet = SETS[valueSequenceKey];
            const sequenceMap = MAPS[valueSequenceKey];
            const key = config.typeName.toLowerCase();

            const res = analyzeValueSequence(lotteryData, dateToIndexMap, {
                valueExtractor: (item) => config.getter(item.value),
                valueSet: sequenceSet,
                valueMap: sequenceMap,
                descriptionPrefix: config.descriptionPrefix,
                typeCondition: (item) => MAPS[config.typeName] && MAPS[config.typeName].has(item.value)
            });
            for (const [subcat, val] of Object.entries(res)) {
                await savePattern(`${key}:${subcat}`, key, subcat, val.description, val.streaks);
            }
        }

        const dangNhomConfigs = [
            { typeName: 'TONG_TT_1_3', descriptionPrefix: 'Tổng TT - Dạng tổng (1,2,3)', getter: getTongTT, sequence: ['1', '2', '3'] },
            { typeName: 'TONG_TT_2_4', descriptionPrefix: 'Tổng TT - Dạng tổng (2,3,4)', getter: getTongTT, sequence: ['2', '3', '4'] },
            { typeName: 'TONG_TT_3_5', descriptionPrefix: 'Tổng TT - Dạng tổng (3,4,5)', getter: getTongTT, sequence: ['3', '4', '5'] },
            { typeName: 'TONG_TT_4_6', descriptionPrefix: 'Tổng TT - Dạng tổng (4,5,6)', getter: getTongTT, sequence: ['4', '5', '6'] },
            { typeName: 'TONG_TT_5_7', descriptionPrefix: 'Tổng TT - Dạng tổng (5,6,7)', getter: getTongTT, sequence: ['5', '6', '7'] },
            { typeName: 'TONG_TT_6_8', descriptionPrefix: 'Tổng TT - Dạng tổng (6,7,8)', getter: getTongTT, sequence: ['6', '7', '8'] },
            { typeName: 'TONG_TT_7_9', descriptionPrefix: 'Tổng TT - Dạng tổng (7,8,9)', getter: getTongTT, sequence: ['7', '8', '9'] },
            { typeName: 'TONG_TT_8_10', descriptionPrefix: 'Tổng TT - Dạng tổng (8,9,10)', getter: getTongTT, sequence: ['8', '9', '10'] },
            { typeName: 'TONG_TT_9_1', descriptionPrefix: 'Tổng TT - Dạng tổng (9,10,1)', getter: getTongTT, sequence: ['9', '10', '1'] },
            { typeName: 'TONG_TT_10_2', descriptionPrefix: 'Tổng TT - Dạng tổng (10,1,2)', getter: getTongTT, sequence: ['10', '1', '2'] },
            { typeName: 'TONG_MOI_0_2', descriptionPrefix: 'Tổng Mới - Dạng tổng (0,1,2)', getter: getTongMoi, sequence: ['0', '1', '2'] },
            { typeName: 'TONG_MOI_1_3', descriptionPrefix: 'Tổng Mới - Dạng tổng (1,2,3)', getter: getTongMoi, sequence: ['1', '2', '3'] },
            { typeName: 'TONG_MOI_2_4', descriptionPrefix: 'Tổng Mới - Dạng tổng (2,3,4)', getter: getTongMoi, sequence: ['2', '3', '4'] },
            { typeName: 'TONG_MOI_3_5', descriptionPrefix: 'Tổng Mới - Dạng tổng (3,4,5)', getter: getTongMoi, sequence: ['3', '4', '5'] },
            { typeName: 'TONG_MOI_4_6', descriptionPrefix: 'Tổng Mới - Dạng tổng (4,5,6)', getter: getTongMoi, sequence: ['4', '5', '6'] },
            { typeName: 'TONG_MOI_5_7', descriptionPrefix: 'Tổng Mới - Dạng tổng (5,6,7)', getter: getTongMoi, sequence: ['5', '6', '7'] },
            { typeName: 'TONG_MOI_6_8', descriptionPrefix: 'Tổng Mới - Dạng tổng (6,7,8)', getter: getTongMoi, sequence: ['6', '7', '8'] },
            { typeName: 'TONG_MOI_7_9', descriptionPrefix: 'Tổng Mới - Dạng tổng (7,8,9)', getter: getTongMoi, sequence: ['7', '8', '9'] },
            { typeName: 'TONG_MOI_8_10', descriptionPrefix: 'Tổng Mới - Dạng tổng (8,9,10)', getter: getTongMoi, sequence: ['8', '9', '10'] },
            { typeName: 'TONG_MOI_9_11', descriptionPrefix: 'Tổng Mới - Dạng tổng (9,10,11)', getter: getTongMoi, sequence: ['9', '10', '11'] },
            { typeName: 'TONG_MOI_10_12', descriptionPrefix: 'Tổng Mới - Dạng tổng (10,11,12)', getter: getTongMoi, sequence: ['10', '11', '12'] },
            { typeName: 'TONG_MOI_11_13', descriptionPrefix: 'Tổng Mới - Dạng tổng (11,12,13)', getter: getTongMoi, sequence: ['11', '12', '13'] },
            { typeName: 'TONG_MOI_12_14', descriptionPrefix: 'Tổng Mới - Dạng tổng (12,13,14)', getter: getTongMoi, sequence: ['12', '13', '14'] },
            { typeName: 'TONG_MOI_13_15', descriptionPrefix: 'Tổng Mới - Dạng tổng (13,14,15)', getter: getTongMoi, sequence: ['13', '14', '15'] },
            { typeName: 'TONG_MOI_14_16', descriptionPrefix: 'Tổng Mới - Dạng tổng (14,15,16)', getter: getTongMoi, sequence: ['14', '15', '16'] },
            { typeName: 'TONG_MOI_15_17', descriptionPrefix: 'Tổng Mới - Dạng tổng (15,16,17)', getter: getTongMoi, sequence: ['15', '16', '17'] },
            { typeName: 'TONG_MOI_16_18', descriptionPrefix: 'Tổng Mới - Dạng tổng (16,17,18)', getter: getTongMoi, sequence: ['16', '17', '18'] },
            { typeName: 'TONG_MOI_17_0', descriptionPrefix: 'Tổng Mới - Dạng tổng (17,18,0)', getter: getTongMoi, sequence: ['17', '18', '0'] },
            { typeName: 'TONG_MOI_18_1', descriptionPrefix: 'Tổng Mới - Dạng tổng (18,0,1)', getter: getTongMoi, sequence: ['18', '0', '1'] },
            { typeName: 'HIEU_0_2', descriptionPrefix: 'Hiệu - Dạng hiệu (0,1,2)', getter: getHieu, sequence: ['0', '1', '2'] },
            { typeName: 'HIEU_1_3', descriptionPrefix: 'Hiệu - Dạng hiệu (1,2,3)', getter: getHieu, sequence: ['1', '2', '3'] },
            { typeName: 'HIEU_2_4', descriptionPrefix: 'Hiệu - Dạng hiệu (2,3,4)', getter: getHieu, sequence: ['2', '3', '4'] },
            { typeName: 'HIEU_3_5', descriptionPrefix: 'Hiệu - Dạng hiệu (3,4,5)', getter: getHieu, sequence: ['3', '4', '5'] },
            { typeName: 'HIEU_4_6', descriptionPrefix: 'Hiệu - Dạng hiệu (4,5,6)', getter: getHieu, sequence: ['4', '5', '6'] },
            { typeName: 'HIEU_5_7', descriptionPrefix: 'Hiệu - Dạng hiệu (5,6,7)', getter: getHieu, sequence: ['5', '6', '7'] },
            { typeName: 'HIEU_6_8', descriptionPrefix: 'Hiệu - Dạng hiệu (6,7,8)', getter: getHieu, sequence: ['6', '7', '8'] },
            { typeName: 'HIEU_7_9', descriptionPrefix: 'Hiệu - Dạng hiệu (7,8,9)', getter: getHieu, sequence: ['7', '8', '9'] },
            { typeName: 'HIEU_8_0', descriptionPrefix: 'Hiệu - Dạng hiệu (8,9,0)', getter: getHieu, sequence: ['8', '9', '0'] },
            { typeName: 'HIEU_9_1', descriptionPrefix: 'Hiệu - Dạng hiệu (9,0,1)', getter: getHieu, sequence: ['9', '0', '1'] },
        ];

        const threeValueGroupConfigs = [
            ...VALID_TONG_TT_3_VALUE_GROUPS.map(group => ({
                typeName: `TONG_TT_${group.join('_')}`,
                descriptionPrefix: `Tổng TT - Dạng tổng (${group.join(',')})`,
                getter: getTongTT,
                sequence: group.map(String)
            })),
            ...VALID_TONG_MOI_3_VALUE_GROUPS.map(group => ({
                typeName: `TONG_MOI_${group.join('_')}`,
                descriptionPrefix: `Tổng Mới - Dạng tổng (${group.join(',')})`,
                getter: getTongMoi,
                sequence: group.map(String)
            })),
            ...VALID_HIEU_3_VALUE_GROUPS.map(group => ({
                typeName: `HIEU_${group.join('_')}`,
                descriptionPrefix: `Hiệu - Dạng hiệu (${group.join(',')})`,
                getter: getHieu,
                sequence: group.map(String)
            }))
        ];

        dangNhomConfigs.push(...threeValueGroupConfigs);

        for (const config of dangNhomConfigs) {
            if (!SETS[config.typeName] || !MAPS[config.typeName]) {
                console.warn(`[WARN] Bộ số ${config.typeName} không tồn tại. Bỏ qua thống kê này.`);
                continue;
            }
            const sequenceSet = config.sequence;
            const sequenceMap = new Map(sequenceSet.map((item, index) => [item, index]));
            const key = config.typeName.toLowerCase();

            const res = analyzeValueSequence(lotteryData, dateToIndexMap, {
                valueExtractor: (item) => config.getter(item.value),
                valueSet: sequenceSet,
                valueMap: sequenceMap,
                descriptionPrefix: config.descriptionPrefix,
                typeCondition: (item) => MAPS[config.typeName].has(item.value)
            });
            for (const [subcat, val] of Object.entries(res)) {
                await savePattern(`${key}:${subcat}`, key, subcat, val.description, val.streaks);
            }
        }

        if (inMemoryData) {
            return stats;
        }

        if (!onPatternGenerated) {
            const outputPath = statsDir ? path.join(statsDir, 'sum_difference_stats.json') : OUTPUT_FILE_PATH;
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, JSON.stringify(stats, null, 2));
            console.log(`✅ Đã lưu kết quả thống kê Tổng-Hiệu vào: ${outputPath}`);
        }

    } catch (error) {
        console.error("❌ Lỗi khi tạo file thống kê Tổng-Hiệu:", error);
    }
}

module.exports = generateSumDifferenceStats;
