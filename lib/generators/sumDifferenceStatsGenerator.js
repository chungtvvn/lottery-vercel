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
    findPreviousInSet
} = require('../utils/numberAnalysis'); // Giả định utils/numberAnalysis.js đã có TONG_MOI_18_0_1

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
    let i = 0;
    while (i < data.length - 1) {
        if (!condition(data[i], data[i])) {
            i++;
            continue;
        }
        let currentStreak = [data[i]];
        let j = i;
        while (j < data.length - 1) {
            if (isConsecutive(data[j].date, data[j + 1].date) && condition(data[j], data[j + 1])) {
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

        if (dayB && dayC && isConsecutive(data[i].date, dayB.date) && isConsecutive(dayB.date, dayC.date)) {
            if (condition(dayC) && startValue === valueExtractor(dayC)) {
                let streak = [data[i], dayC];
                let lastIndex = i + 2;
                while (lastIndex < data.length - 2) {
                    const nextDayB = data[lastIndex + 1];
                    const nextDayC = data[lastIndex + 2];
                    if (nextDayB && nextDayC && isConsecutive(data[lastIndex].date, nextDayB.date) && isConsecutive(nextDayB.date, nextDayC.date) && condition(nextDayC) && startValue === valueExtractor(nextDayC)) {
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

            if (dayB && dayC && isConsecutive(data[lastIndex].date, dayB.date) && isConsecutive(dayB.date, dayC.date)) {
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

// [FIXED] Hàm này giờ dùng cho "Về so le (mới)" -> Strict Alternating (A - !A - A)
// Chỉ chấp nhận chuỗi có số ngày là số lẻ
function findAlternatingTypeStreaksNew(data, dateMap, numberMap) {
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
        if (isConsecutive(dayA.date, dayB.date) && isConsecutive(dayB.date, dayC.date) &&
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
                if (nextDay && nextStreakDay && isConsecutive(data[lastIndex].date, nextDay.date) && isConsecutive(nextDay.date, nextStreakDay.date) &&
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
            if (!isConsecutive(currentItem.date, nextItem.date) || !typeCondition(nextItem)) {
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
            ...findAlternatingTypeStreaksNew(data, dateMap, MAPS[typeName] || new Map())
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

function analyzeValueSequence(data, dateMap, { valueExtractor, valueSet, valueMap, descriptionPrefix, typeCondition }) {
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
            ...findAlternatingTypeStreaksNew(data, dateMap, valueBasedNumberMap)
        };
    } else {
        results.veSole = findAlternatingValueStreaks(data, dateMap, { valueExtractor, description: `${descriptionPrefix} - Về so le`, isNewType: false });
        results.veSoleMoi = findAlternatingValueStreaks(data, dateMap, { valueExtractor, description: `${descriptionPrefix} - Về so le (mới)`, isNewType: true });
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

async function generateSumDifferenceStats(dataDir, statsDir, inMemoryData = null) {
    try {
        let originalData;
        if (inMemoryData) {
            originalData = inMemoryData;
        } else {
            const inputPath = dataDir ? path.join(dataDir, 'xsmb-2-digits.json') : DATA_FILE_PATH;
            const rawData = await fs.readFile(inputPath, 'utf-8');
            originalData = JSON.parse(rawData);
        }

        const lotteryData = originalData.map(item => (item.special === null || typeof item.special !== 'number' || isNaN(item.special)) ? null : {
            date: formatDate(item.date),
            value: String(item.special).padStart(2, '0')
        }).filter(item => item !== null).sort((a, b) => parseDate(a.date) - parseDate(b.date));
        const dateToIndexMap = new Map(lotteryData.map((item, index) => [item.date, index]));
        console.log('Bắt đầu tính toán thống kê cho Tổng và Hiệu...');

        const stats = {};

        const numberSetConfigs = [
            ...Array.from({ length: 10 }, (_, i) => ({ typeName: `TONG_TT_${i + 1}`, descriptionPrefix: `Tổng TT - Cùng tổng ${i + 1}` })),
            ...Array.from({ length: 19 }, (_, i) => ({ typeName: `TONG_MOI_${i}`, descriptionPrefix: `Tổng Mới - Cùng tổng ${i}` })),
            ...Array.from({ length: 10 }, (_, i) => ({ typeName: `HIEU_${i}`, descriptionPrefix: `Hiệu - Cùng hiệu ${i}` })),
        ];
        numberSetConfigs.forEach(config => {
            stats[config.typeName.toLowerCase()] = analyzeNumberSet(lotteryData, dateToIndexMap, config);
        });

        stats['tong_tt_cac_tong'] = analyzeValueSequence(lotteryData, dateToIndexMap, { valueExtractor: (item) => getTongTT(item.value), valueSet: SETS.TONG_TT_SEQUENCE, valueMap: INDEX_MAPS.TONG_TT_SEQUENCE, descriptionPrefix: 'Tổng TT - Các tổng' });
        stats['tong_moi_cac_tong'] = analyzeValueSequence(lotteryData, dateToIndexMap, { valueExtractor: (item) => getTongMoi(item.value), valueSet: SETS.TONG_MOI_SEQUENCE, valueMap: INDEX_MAPS.TONG_MOI_SEQUENCE, descriptionPrefix: 'Tổng Mới - Các tổng' });
        stats['hieu_cac_hieu'] = analyzeValueSequence(lotteryData, dateToIndexMap, { valueExtractor: (item) => getHieu(item.value), valueSet: SETS.HIEU_SEQUENCE, valueMap: INDEX_MAPS.HIEU_SEQUENCE, descriptionPrefix: 'Các Hiệu' });

        stats['tong_tt_chan'] = analyzeValueSequence(lotteryData, dateToIndexMap, {
            valueExtractor: (item) => getTongTT(item.value),
            valueSet: SETS.TONG_TT_CHAN_SEQUENCE,
            valueMap: INDEX_MAPS.TONG_TT_CHAN_SEQUENCE,
            descriptionPrefix: 'Tổng TT - Tổng Chẵn',
            typeCondition: (item) => getTongTT(item.value) % 2 === 0
        });
        stats['tong_tt_le'] = analyzeValueSequence(lotteryData, dateToIndexMap, {
            valueExtractor: (item) => getTongTT(item.value),
            valueSet: SETS.TONG_TT_LE_SEQUENCE,
            valueMap: INDEX_MAPS.TONG_TT_LE_SEQUENCE,
            descriptionPrefix: 'Tổng TT - Tổng Lẻ',
            typeCondition: (item) => getTongTT(item.value) % 2 !== 0
        });

        stats['tong_moi_chan'] = analyzeValueSequence(lotteryData, dateToIndexMap, {
            valueExtractor: (item) => getTongMoi(item.value),
            valueSet: SETS.TONG_MOI_CHAN_SEQUENCE,
            valueMap: INDEX_MAPS.TONG_MOI_CHAN_SEQUENCE,
            descriptionPrefix: 'Tổng Mới - Tổng Chẵn',
            typeCondition: (item) => getTongMoi(item.value) % 2 === 0
        });
        stats['tong_moi_le'] = analyzeValueSequence(lotteryData, dateToIndexMap, {
            valueExtractor: (item) => getTongMoi(item.value),
            valueSet: SETS.TONG_MOI_LE_SEQUENCE,
            valueMap: INDEX_MAPS.TONG_MOI_LE_SEQUENCE,
            descriptionPrefix: 'Tổng Mới - Tổng Lẻ',
            typeCondition: (item) => getTongMoi(item.value) % 2 !== 0
        });
        stats['hieu_chan'] = analyzeValueSequence(lotteryData, dateToIndexMap, {
            valueExtractor: (item) => getHieu(item.value),
            valueSet: SETS.HIEU_CHAN_SEQUENCE,
            valueMap: INDEX_MAPS.HIEU_CHAN_SEQUENCE,
            descriptionPrefix: 'Hiệu Chẵn',
            typeCondition: (item) => getHieu(item.value) % 2 === 0
        });
        stats['hieu_le'] = analyzeValueSequence(lotteryData, dateToIndexMap, {
            valueExtractor: (item) => getHieu(item.value),
            valueSet: SETS.HIEU_LE_SEQUENCE,
            valueMap: INDEX_MAPS.HIEU_LE_SEQUENCE,
            descriptionPrefix: 'Hiệu Lẻ',
            typeCondition: (item) => getHieu(item.value) % 2 !== 0
        });

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

        dangTongConfigs.forEach(config => {
            const isTongTT = config.typeName.startsWith('TONG_TT');
            const tongPrefix = isTongTT ? 'TONG_TT' : 'TONG_MOI';
            const valueSequenceKey = config.sequenceType === 'CHAN' ? `${tongPrefix}_CHAN_SEQUENCE` : `${tongPrefix}_LE_SEQUENCE`;
            const sequenceSet = SETS[valueSequenceKey];
            const sequenceMap = MAPS[valueSequenceKey];

            stats[config.typeName.toLowerCase()] = analyzeValueSequence(lotteryData, dateToIndexMap, {
                valueExtractor: (item) => config.getter(item.value),
                valueSet: sequenceSet,
                valueMap: sequenceMap,
                descriptionPrefix: config.descriptionPrefix,
                typeCondition: (item) => MAPS[config.typeName] && MAPS[config.typeName].has(item.value)
            });
        });

        const dangNhomConfigs = [
            { typeName: 'TONG_TT_1_3', descriptionPrefix: 'Tổng TT - Dạng tổng (1,2,3)', getter: getTongTT, sequence: ['1', '2', '3'] },
            { typeName: 'TONG_TT_2_4', descriptionPrefix: 'Tổng TT - Dạng tổng (2,3,4)', getter: getTongTT, sequence: ['2', '3', '4'] },
            { typeName: 'TONG_TT_3_5', descriptionPrefix: 'Tổng TT - Dạng tổng (3,4,5)', getter: getTongTT, sequence: ['3', '4', '5'] },
            { typeName: 'TONG_TT_4_6', descriptionPrefix: 'Tổng TT - Dạng tổng (4,5,6)', getter: getTongTT, sequence: ['4', '5', '6'] },
            { typeName: 'TONG_TT_5_7', descriptionPrefix: 'Tổng TT - Dạng tổng (5,6,7)', getter: getTongTT, sequence: ['5', '6', '7'] },
            { typeName: 'TONG_TT_6_8', descriptionPrefix: 'Tổng TT - Dạng tổng (6,7,8)', getter: getTongTT, sequence: ['5', '6', '7'] },
            { typeName: 'TONG_TT_7_9', descriptionPrefix: 'Tổng TT - Dạng tổng (7,8,9)', getter: getTongTT, sequence: ['7', '8', '9'] },
            { typeName: 'TONG_TT_8_10', descriptionPrefix: 'Tổng TT - Dạng tổng (8,9,10)', getter: getTongTT, sequence: ['8', '9', '10'] },
            { typeName: 'TONG_TT_9_1', descriptionPrefix: 'Tổng TT - Dạng tổng (9,10,1)', getter: getTongTT, sequence: ['9', '10', '1'] },
            { typeName: 'TONG_TT_10_2', descriptionPrefix: 'Tổng TT - Dạng tổng (10,1,2)', getter: getTongTT, sequence: ['10', '1', '2'] },
            { typeName: 'TONG_MOI_0_2', descriptionPrefix: 'Tổng Mới - Dạng tổng (0,1,2)', getter: getTongMoi, sequence: ['0', '1', '2'] },
            { typeName: 'TONG_MOI_1_3', descriptionPrefix: 'Tổng Mới - Dạng tổng (1,2,3)', getter: getTongMoi, sequence: ['1', '2', '3'] },
            { typeName: 'TONG_MOI_2_4', descriptionPrefix: 'Tổng Mới - Dạng tổng (2,3,4)', getter: getTongMoi, sequence: ['2', '3', '4'] },
            { typeName: 'TONG_MOI_3_5', descriptionPrefix: 'Tổng Mới - Dạng tổng (3,4,5)', getter: getTongMoi, sequence: ['2', '3', '4'] },
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

        dangNhomConfigs.forEach(config => {
            if (!SETS[config.typeName] || !MAPS[config.typeName]) {
                console.warn(`[WARN] Bộ số ${config.typeName} không tồn tại. Bỏ qua thống kê này.`);
                return;
            }
            const sequenceSet = config.sequence;
            const sequenceMap = new Map(sequenceSet.map((item, index) => [item, index]));

            stats[config.typeName.toLowerCase()] = analyzeValueSequence(lotteryData, dateToIndexMap, {
                valueExtractor: (item) => config.getter(item.value),
                valueSet: sequenceSet,
                valueMap: sequenceMap,
                descriptionPrefix: config.descriptionPrefix,
                typeCondition: (item) => MAPS[config.typeName].has(item.value)
            });
        });

        if (inMemoryData) {
            return stats;
        }

        const outputPath = statsDir ? path.join(statsDir, 'sum_difference_stats.json') : OUTPUT_FILE_PATH;
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, JSON.stringify(stats, null, 2));
        console.log(`✅ Đã lưu kết quả thống kê Tổng-Hiệu vào: ${outputPath}`);

    } catch (error) {
        console.error("❌ Lỗi khi tạo file thống kê Tổng-Hiệu:", error);
    }
}

module.exports = generateSumDifferenceStats;