/**
 * historicalExclusionService.js
 *
 * Tính toán số loại trừ (Exclusion & Exclusion+) cho BẤT KỲ NGÀY LỊCH SỬ NÀO.
 * 
 * Chiến lược: Filter pre-computed streak JSON files theo ngày → compute quickStats
 * at-point-in-time → áp dụng logic của suggestionsController (freq ≤ 1.5).
 *
 * Dùng cho: backtest và future simulation.
 */

const lotteryService = require('./lotteryService');

const { SETS, findNextInSet, findPreviousInSet, INDEX_MAPS, identifyCategories } = require('../utils/numberAnalysis');
const { getNumbersFromCategory } = require('../controllers/suggestionsController');

const MAX_BET_COUNT = 65;

// ==== CACHE ====
let _allStats = null;
const _dateCache = new Map();

function loadAllStats() {
    if (_allStats) return _allStats;
    try {
        const headTail = lotteryService.getHeadTailStats() || {};
        const sumDiff = lotteryService.getSumDiffStats() || {};
        const number = lotteryService.getNumberStats() || {};
        _allStats = { ...headTail, ...sumDiff, ...number };
        return _allStats;
    } catch (e) {
        console.error('[HistoricalExclusion] Lỗi load stats:', e.message);
        return {};
    }
}

// ==== DATE HELPERS ====
function parseDate(str) {
    if (!str) return null;
    // Handle YYYY-MM-DD format (from DB/rawData)
    if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length >= 3) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].substring(0, 2)));
        }
        return null;
    }
    // Handle DD/MM/YYYY format
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

function formatDate(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Build fullSequence from rawData for a streak that doesn't have it.
 * Returns array of {date: 'DD/MM/YYYY', value: '...'}
 */
function buildFullSequenceFromRaw(streak) {
    if (!streak || !streak.startDate || !streak.endDate) return [];
    const rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) return [];
    
    const startD = parseDate(streak.startDate);
    const endD = parseDate(streak.endDate);
    if (!startD || !endD) return [];
    
    const result = [];
    for (const item of rawData) {
        const itemD = parseDate(item.date);
        if (!itemD) continue;
        if (itemD < startD) continue;
        if (itemD > endD) break;
        if (item.special !== null && item.special !== undefined) {
            result.push({
                date: formatDate(itemD),
                value: String(item.special).padStart(2, '0')
            });
        }
    }
    return result;
}

// ==== COMPUTE quickStats FOR A SPECIFIC DATE ====
/**
 * Tính quickStats cho một ngày cụ thể (chỉ dùng dữ liệu lịch sử đến trước ngày đó)
 * @param {string} targetDateStr - 'dd/mm/yyyy'
 * @param {number} totalYears
 * @returns {Object} quickStats object (tương tự statisticsService.getQuickStats())
 */
function computeQuickStatsForDate(targetDateStr, totalYears) {
    const allStats = loadAllStats();
    const targetDate = parseDate(targetDateStr);
    if (!targetDate) return {};

    // Ngày có kết quả cuối cùng (ngày hôm qua so với ngày cần dự đoán)
    const prevDate = new Date(targetDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = formatDate(prevDate);

    const lotteryService = require('./lotteryService');
    const { getNumbersFromCategory } = require('../controllers/suggestionsController');
    const rawData = lotteryService.getRawData() || [];
    const prevDateISOPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
    const targetLotteryDay = rawData.find(r => r.date && String(r.date).startsWith(prevDateISOPrefix));

    const quickStats = {};

    const analyzeCategory = (key, categoryData) => {
        if (!categoryData || !Array.isArray(categoryData.streaks) || categoryData.streaks.length === 0) {
            return;
        }

        // Lấy các chuỗi ĐÃ HOÀN THÀNH trước ngày đang chọn (prevDate)
        // + TRUNCATE các chuỗi đang diễn ra tại ngày đang chọn
        const historicalStreaks = [];
        for (const s of categoryData.streaks) {
            const endDate = parseDate(s.endDate);
            const startDate = parseDate(s.startDate);
            if (!endDate || !startDate) continue;

            if (endDate <= prevDate) {
                // Chuỗi hoàn thành trước hoặc tại ngày đang chọn
                historicalStreaks.push(s);
            } else if (startDate <= prevDate) {
                // Chuỗi spans ngày đang chọn → truncate
                const truncDates = s.dates ? s.dates.filter(d => parseDate(d) <= prevDate) : [];
                if (truncDates.length >= 2) {
                    const truncStartD = parseDate(truncDates[0]);
                    const truncEndD = parseDate(truncDates[truncDates.length - 1]);
                    const daySpan = Math.floor((truncEndD - truncStartD) / (1000 * 60 * 60 * 24)) + 1;
                    historicalStreaks.push({
                        ...s,
                        endDate: truncDates[truncDates.length - 1],
                        dates: truncDates,
                        values: s.values ? s.values.slice(0, truncDates.length) : [],
                        length: daySpan,
                        fullSequence: s.fullSequence ? s.fullSequence.filter(item => parseDate(item.date) <= prevDate) : []
                    });
                }
            }
        }

        if (historicalStreaks.length === 0) return;

        const streaks = [...historicalStreaks].sort((a, b) => b.length - a.length);
        const longestLength = streaks[0].length;
        const longest = streaks.filter(s => s.length === longestLength);

        let secondLongest = [];
        for (let i = 0; i < streaks.length; i++) {
            if (streaks[i].length < longestLength) {
                const secondLength = streaks[i].length;
                secondLongest = streaks.filter(s => s.length === secondLength);
                break;
            }
        }

        // Xác định loại pattern
        const lowerKey = key.toLowerCase();
        const isSoLePattern = (lowerKey.includes('sole') || lowerKey.includes('solemoi')) &&
            !key.includes('tienLuiSoLe') && !key.includes('luiTienSoLe');
        const isTienLuiSoLe = key.includes('tienLuiSoLe') || key.includes('luiTienSoLe');

        // === TÌM CHUỖI ĐANG DIỄN RA TẠI NGÀY ĐANG CHỌN ===
        // Logic chuẩn:
        // - Ngày đang chọn (prevDate = selectedDate) làm mốc
        // - Regular patterns: tìm streak CHỨA selectedDate, truncate đến selectedDate
        // - So le / So le mới: dùng selectedDate - 1 làm mốc (vì pattern cách ngày)
        // - Không quan tâm dữ liệu SAU ngày đang chọn
        let current = null;

        if (isSoLePattern) {
            // So le: Mốc = ngày TRƯỚC ngày đang chọn 1 ngày
            const refDate = new Date(prevDate); // prevDate = selectedDate
            refDate.setDate(refDate.getDate() - 1);
            const refDateStr = formatDate(refDate);

            // Tìm streak có chứa refDate trong dates[]
            let streak = categoryData.streaks.find(s => s.dates && s.dates.includes(refDateStr));

            if (streak) {
                const isSoLeMoi = lowerKey.includes('solemoi') || lowerKey.includes('sole_moi');
                let isValid = true;

                // Validate So le mới: ngày xen kẽ (prevDate) KHÔNG được trùng pattern
                if (isSoLeMoi && targetLotteryDay && targetLotteryDay.special !== undefined) {
                    try {
                        const { predictNextInSequence } = require('../controllers/suggestionsController');
                        const [categoryName, subcategoryStr] = key.split(':');
                        const matchNumbers = predictNextInSequence({ current: streak }, categoryName, subcategoryStr || '');
                        if (matchNumbers && matchNumbers.length > 0) {
                            const stringNumbers = matchNumbers.map(n => String(n).padStart(2, '0'));
                            const specialNum = String(targetLotteryDay.special).padStart(2, '0');
                            if (stringNumbers.includes(specialNum)) {
                                isValid = false; // Bị gãy chuỗi
                            }
                        }
                    } catch (e) {
                        console.error('Lỗi validate So le mới for history:', e.message);
                    }
                }

                if (isValid) {
                    // Truncate: chỉ giữ dates <= refDate
                    const truncDates = streak.dates.filter(d => parseDate(d) <= refDate);
                    const truncValues = streak.values ? streak.values.slice(0, truncDates.length) : [];
                    // Build fullSequence from rawData nếu streak không có sẵn
                    const baseFullSeq = (streak.fullSequence && streak.fullSequence.length > 0)
                        ? streak.fullSequence
                        : buildFullSequenceFromRaw(streak);
                    const truncFullSeq = baseFullSeq.filter(item => parseDate(item.date) <= refDate);

                    if (truncDates.length >= 2) {
                        const startD = parseDate(truncDates[0]);
                        const endD = parseDate(truncDates[truncDates.length - 1]);
                        const daySpan = Math.floor((endD - startD) / (1000 * 60 * 60 * 24)) + 1;

                        current = {
                            startDate: truncDates[0],
                            endDate: truncDates[truncDates.length - 1],
                            dates: truncDates,
                            values: truncValues,
                            length: daySpan,
                            fullSequence: [...truncFullSeq]
                        };

                        // Thêm ngày đang chọn (prevDate) vào fullSequence để hiển thị
                        if (targetLotteryDay && targetLotteryDay.special !== undefined) {
                            current.fullSequence.push({
                                date: prevDateStr,
                                value: String(targetLotteryDay.special).padStart(2, '0'),
                                isLatest: true
                            });
                        }
                    }
                }
            }
        } else {
            // Regular patterns & TienLuiSoLe: Mốc = ngày đang chọn (prevDate)
            // Tìm streak CHỨA prevDate (startDate <= prevDate AND endDate >= prevDate)
            let streak = categoryData.streaks.find(s => {
                const start = parseDate(s.startDate);
                const end = parseDate(s.endDate);
                return start && end && start <= prevDate && end >= prevDate;
            });

            if (streak) {
                // Truncate: chỉ giữ dates <= prevDate
                const truncDates = streak.dates.filter(d => parseDate(d) <= prevDate);
                const truncValues = streak.values ? streak.values.slice(0, truncDates.length) : [];
                // Build fullSequence from rawData nếu streak không có sẵn
                const baseFullSeq = (streak.fullSequence && streak.fullSequence.length > 0)
                    ? streak.fullSequence
                    : buildFullSequenceFromRaw(streak);
                const truncFullSeq = baseFullSeq.filter(item => parseDate(item.date) <= prevDate);

                if (truncDates.length >= 1) {
                    const startD = parseDate(truncDates[0]);
                    const endD = parseDate(truncDates[truncDates.length - 1]);
                    const daySpan = Math.floor((endD - startD) / (1000 * 60 * 60 * 24)) + 1;

                    current = {
                        startDate: truncDates[0],
                        endDate: truncDates[truncDates.length - 1],
                        dates: truncDates,
                        values: truncValues,
                        length: daySpan,
                        fullSequence: truncFullSeq
                    };

                    // TienLuiSoLe phải >= 4 ngày
                    if (isTienLuiSoLe && current.length < 4) {
                        current = null;
                    }
                }
            }
        }

        // Tính exactGapStats (dùng để xác định freq)
        const exactGapStats = {};
        const maxLen = longestLength;
        const calcLimit = maxLen + 1;

        for (let len = 2; len <= calcLimit; len++) {
            const exactStreaks = historicalStreaks.filter(s => s.length === len);
            exactGapStats[len] = { count: exactStreaks.length, pastCount: exactStreaks.length };
        }

        // Tính computedMaxStreak (freq <= 1.5)
        let startLen = 2;
        let increment = 1;
        if (isSoLePattern) { startLen = 3; increment = 2; }
        else if (isTienLuiSoLe) { startLen = 4; increment = 1; }

        let computedMaxStreak = longestLength;
        let isSuperMaxThreshold = false;
        for (let len = startLen; len <= calcLimit; len += increment) {
            const cnt = exactGapStats[len] ? exactGapStats[len].count : 0;
            const freqYear = totalYears > 0 ? cnt / totalYears : 0;
            if (freqYear <= 1.5) {
                computedMaxStreak = len;
                isSuperMaxThreshold = freqYear <= 0.5;
                break;
            }
        }

        let isPotentialRecord = false;
        if (!current && computedMaxStreak === 2 && !isSoLePattern && !isTienLuiSoLe) {
            const isGeneric = (key.includes('veLienTiep') || key.includes('veCungGiaTri') || key.includes('dongTien') || key.includes('dongLui'));
            const isSingleChar = (key.startsWith('cacDau') || key.startsWith('motDau') || key.startsWith('cacDit') || key.startsWith('motDit'));

            if (isGeneric || isSingleChar) {
                const todayStreak = historicalStreaks.find(s => s.endDate === prevDateStr && s.length === 1);
                if (todayStreak) {
                    current = {
                        ...todayStreak,
                        mockPotential: true,
                        length: 1
                    };
                    isPotentialRecord = true;
                }
            }
        }

        quickStats[key] = {
            description: categoryData.description,
            longest,
            secondLongest,
            current,
            computedMaxStreak,
            isSuperMaxThreshold,
            isPotentialRecord,
            exactGapStats,
            gapStats: exactGapStats // Dùng exactGapStats cho cả gapStats (đủ cho freq calc)
        };
    };

    for (const key in allStats) {
        const categoryData = allStats[key];
        if (categoryData && Array.isArray(categoryData.streaks)) {
            analyzeCategory(key, categoryData);
        } else if (categoryData && typeof categoryData === 'object') {
            for (const subKey in categoryData) {
                const sub = categoryData[subKey];
                if (sub && Array.isArray(sub.streaks)) {
                    analyzeCategory(`${key}:${subKey}`, sub);
                }
            }
        }
    }

    quickStats._meta = { totalYears };
    return quickStats;
}

// ==== REUSE logic từ suggestionsController ====
const suggestionsController = require('../controllers/suggestionsController');

function resolveExcludedNumbers(stat, key) {
    let nums = [];
    let category, subcategory;
    let cleanKey = key.replace(/^[TIỀM NĂNG]s*/, '');

    if (cleanKey.includes(':')) {
        [category, subcategory] = cleanKey.split(':');
    } else {
        const patterns = [
            'LuiDeuLienTiep', 'TienDeuLienTiep',
            'LuiLienTiep', 'TienLienTiep',
            'LuiDeu', 'TienDeu',
            'VeLienTiep', 'VeCungGiaTri', 'VeSole', 'VeSoleMoi',
            'DongTien', 'DongLui',
            'Lui', 'Tien'
        ];
        for (const pattern of patterns) {
            if (cleanKey.endsWith(pattern)) {
                subcategory = pattern.charAt(0).toLowerCase() + pattern.slice(1);
                category = cleanKey.slice(0, -pattern.length);
                break;
            }
        }
        if (!subcategory) {
            category = cleanKey;
            subcategory = '';
        }
    }

    // NẾU CÓ TRONG CACHE patternNumbers THÌ DÙNG LUÔN
    if (stat.current && stat.current.patternNumbers && stat.current.patternNumbers.length > 0) {
        nums = [...stat.current.patternNumbers];
    }
    // NẾU KHÔNG CÓ THÌ TÍNH TOÁN LẠI
    else {
        const trendPatterns = [
            'tienDeuLienTiep', 'luiDeuLienTiep', 'tienLienTiep', 'luiLienTiep',
            'tienDeu', 'luiDeu', 'tien', 'lui'
        ];

        if (trendPatterns.includes(subcategory)) {
            let normalizedSubcategory = subcategory;
            if (subcategory === 'lui') normalizedSubcategory = 'luiLienTiep';
            else if (subcategory === 'tien') normalizedSubcategory = 'tienLienTiep';
            else if (subcategory === 'luiDeu') normalizedSubcategory = 'luiDeuLienTiep';
            else if (subcategory === 'tienDeu') normalizedSubcategory = 'tienDeuLienTiep';
            nums = suggestionsController.predictNextInSequence(stat, category, normalizedSubcategory);
        }
        else if (subcategory === 'veLienTiep' || subcategory === 'veCungGiaTri') {
            if (category.startsWith('dau_')) {
                const digit = category.split('_')[1];
                if (digit && digit.match(/^d$/)) {
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[0] === digit);
                } else {
                    nums = suggestionsController.getNumbersFromCategory(category);
                }
            } else if (category.startsWith('dit_')) {
                const digit = category.split('_')[1];
                if (digit && digit.match(/^d$/)) {
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[1] === digit);
                } else {
                    nums = suggestionsController.getNumbersFromCategory(category);
                }
            } else if (category.startsWith('tong_tt_') || category.startsWith('tong_moi_') || category.startsWith('hieu_')) {
                const specificSet = suggestionsController.getNumbersFromCategory(category);
                if (specificSet && specificSet.length > 0) {
                    nums = specificSet;
                } else if (stat.current.values && stat.current.values.length > 0) {
                    nums = stat.current.values.map(v => parseInt(v, 10));
                }
            } else {
                if (stat.current.values && stat.current.values.length > 0) {
                    nums = stat.current.values.map(v => parseInt(v, 10));
                }
            }
        }
        else if (category === 'tienLuiSoLe' || key.includes('tienLuiSoLe') || category === 'luiTienSoLe' || key.includes('luiTienSoLe') || subcategory === 'tienLuiSoLe' || subcategory === 'luiTienSoLe') {
            nums = suggestionsController.predictNextInSequence(stat, category, subcategory || key);
        }
        else if (subcategory === 'veSole' || subcategory === 'veSoleMoi') {
            const valuesToExclude = stat.current.values || [];
            if (category === 'motDit' || category === 'cacDit') {
                const lastVal = valuesToExclude[valuesToExclude.length - 1];
                if (lastVal !== null && lastVal !== undefined) {
                    const dit = String(lastVal).padStart(2, '0')[1];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[1] === dit);
                }
            } else if (category === 'motDau' || category === 'cacDau') {
                const lastVal = valuesToExclude[valuesToExclude.length - 1];
                if (lastVal !== null && lastVal !== undefined) {
                    const dau = String(lastVal).padStart(2, '0')[0];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[0] === dau);
                }
            } else {
                const patternNums = suggestionsController.getNumbersFromCategory(category);
                if (patternNums && patternNums.length > 0 && patternNums.length <= 50) {
                    nums = patternNums;
                } else if (valuesToExclude.length > 0) {
                    nums = valuesToExclude.map(v => parseInt(v, 10));
                }
            }
        }
        else {
            nums = suggestionsController.getNumbersFromCategory(category);
        }

        if (!nums || nums.length === 0) {
            nums = suggestionsController.getNumbersFromCategory(category);
        }
    } // Đóng cache else

    if (nums && nums.length > 0) {
        nums = nums.filter(n => n !== null && n !== undefined && !isNaN(n) && typeof n === 'number');
    }

    return nums || [];
}

// ==== MAIN FUNCTION ====
/**
 * Tính exclusions cho một ngày cụ thể dựa trên quickStats lịch sử tại thời điểm đó.
 * @param {string} targetDateStr - 'dd/mm/yyyy'
 * @param {number} totalYears
 * @returns {Object}
 */
function getExclusionsForDate(targetDateStr, totalYears) {
    const quickStats = computeQuickStatsForDate(targetDateStr, totalYears);

    const excluded4 = new Set(); // Exclusion: 4 subTier (achieved, achievedSuper, threshold, superThreshold)
    const excluded3 = new Set(); // Exclusion+: chỉ achieved + achievedSuper + superThreshold (không threshold thường)

    for (const key in quickStats) {
        if (key === '_meta') continue;
        const stat = quickStats[key];
        if (!stat || !stat.current) continue;

        const currentLen = stat.current.length;
        const [category, subcategory] = key.split(':');
        const isSoLePattern = (key.toLowerCase().includes('sole') || key.toLowerCase().includes('solemoi')) &&
            !key.toLowerCase().includes('tienluisole') && !key.toLowerCase().includes('luitiensole');
        const targetLen = isSoLePattern ? currentLen + 2 : currentLen + 1;

        const recordLen = stat.computedMaxStreak || (stat.longest && stat.longest[0] && stat.longest[0].length) || 0;

        const gapInfoExact = stat.exactGapStats ? stat.exactGapStats[targetLen] : null;
        const targetCount = gapInfoExact ? gapInfoExact.count : 0;
        const targetFreqYear = totalYears > 0 ? targetCount / totalYears : 0;
        const isSuper = targetFreqYear <= 0.5 || stat.isSuperMaxThreshold;

        let shouldExclude = false;
        let subTier = null;

        if (targetFreqYear <= 1.5 || (currentLen >= recordLen && recordLen > 0)) {
            shouldExclude = true;
            if (currentLen >= recordLen && recordLen > 0) {
                subTier = isSuper ? 'achievedSuper' : 'achieved';
            } else if (isSuper) {
                subTier = 'superThreshold';
            } else {
                subTier = 'threshold';
            }
        }

        if (!shouldExclude) continue;

        // Bỏ qua các pattern chứa Tổng lớn/nhỏ, hiệu lớn/nhỏ
        const isExcludedPattern = category === 'tong_tt_lon' || category === 'tong_tt_nho' ||
            category === 'tong_moi_lon' || category === 'tong_moi_nho' ||
            category === 'hieu_lon' || category === 'hieu_nho';

        if (isExcludedPattern) continue;

        // Lấy các số bị ảnh hưởng
        const nums = resolveExcludedNumbers(stat, key);
        if (!nums || nums.length === 0) continue;

        nums.forEach(n => {
            excluded4.add(n); // Exclusion: loại tất cả
            // Exclusion+: chỉ loại khi đạt kỷ lục hoặc siêu kỷ lục
            if (subTier === 'achieved' || subTier === 'achievedSuper' || subTier === 'superThreshold') {
                excluded3.add(n);
            }
        });
    }

    const toBet4 = [];
    const toBet3 = [];
    for (let i = 0; i < 100; i++) {
        if (!excluded4.has(i)) toBet4.push(i);
        if (!excluded3.has(i)) toBet3.push(i);
    }

    // Skip khi > MAX_BET_COUNT (quá nhiều số) HOẶC = 0 (không có gì để đánh)
    const skipped = toBet4.length > MAX_BET_COUNT || toBet4.length === 0;
    const skippedPlus = toBet3.length > MAX_BET_COUNT || toBet3.length === 0;

    return {
        toBet: skipped ? [] : toBet4,
        toBetPlus: skippedPlus ? [] : toBet3,
        excluded: Array.from(excluded4),
        excludedPlus: Array.from(excluded3),
        skipped,
        skippedPlus,
        totalBet4: toBet4.length,  // Số thực trước khi skip
        totalBet3: toBet3.length   // Số thực trước khi skip
    };
}

/**
 * Phiên bản cache - dùng cho backtest nhiều ngày
 */
function getExclusionsForDateCached(targetDateStr, totalYears) {
    if (_dateCache.has(targetDateStr)) {
        return _dateCache.get(targetDateStr);
    }
    const result = getExclusionsForDate(targetDateStr, totalYears);
    _dateCache.set(targetDateStr, result);
    return result;
}

function clearCache() {
    _allStats = null;
    _dateCache.clear();
}

module.exports = {
    loadAllStats,
    getExclusionsForDate,
    getExclusionsForDateCached,
    computeQuickStatsForDate,
    clearCache,
    parseDate,
    formatDate
};
