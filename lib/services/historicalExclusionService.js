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

const {
    SETS,
    findNextInSet,
    findPreviousInSet,
    INDEX_MAPS,
    identifyCategories,
    getTongTT,
    getTongMoi,
    getHieu
} = require('../utils/numberAnalysis');
const { getNumbersFromCategory } = require('../controllers/suggestionsController');
const {
    getSoLeTheoCapLabel,
    isSoLeTheoCapCategory,
    formatSoLeTheoCapPairValue
} = require('../utils/soLeTheoCapPairs');

// MAX_BET_COUNT removed per user request

// ==== CACHE ====
let _allStats = null;
const _dateCache = new Map();
const _parsedDateCache = new Map();
const _fullSequenceCache = new Map();
const MS_PER_DAY = 1000 * 60 * 60 * 24;

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
    const cacheKey = String(str);
    if (_parsedDateCache.has(cacheKey)) return _parsedDateCache.get(cacheKey);

    let parsed = null;
    // Handle YYYY-MM-DD format (from DB/rawData)
    if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length >= 3) {
            parsed = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].substring(0, 2)));
            _parsedDateCache.set(cacheKey, parsed);
            return parsed;
        }
        return null;
    }
    // Handle DD/MM/YYYY format
    const parts = str.split('/');
    if (parts.length !== 3) return null;
    parsed = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    _parsedDateCache.set(cacheKey, parsed);
    return parsed;
}

function formatDate(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function diffDays(from, to) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (!fromDate || !toDate) return null;
    return Math.round((toDate - fromDate) / MS_PER_DAY);
}

function computeHistoryMetrics(streaks, basisDate) {
    const valid = (streaks || [])
        .filter(item => item && Number.isFinite(Number(item.length)) && Number(item.length) > 0);
    if (valid.length === 0) {
        return {
            occurrences: 0,
            avgLength: null,
            avgGapDays: null,
            latestEndDate: '',
            daysSinceLatestEnd: null
        };
    }

    const lengths = valid.map(item => Number(item.length));
    const avgLength = lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    const sortedByStart = valid
        .filter(item => item.startDate)
        .slice()
        .sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
    const sortedByEnd = valid
        .filter(item => item.endDate)
        .slice()
        .sort((a, b) => parseDate(a.endDate) - parseDate(b.endDate));

    const gaps = [];
    for (let i = 1; i < sortedByStart.length; i++) {
        const gap = diffDays(sortedByStart[i - 1].startDate, sortedByStart[i].startDate);
        if (gap !== null && gap >= 0) gaps.push(gap);
    }

    const latestEndDate = sortedByEnd.length > 0 ? sortedByEnd[sortedByEnd.length - 1].endDate : '';
    const daysSinceLatestEnd = latestEndDate ? diffDays(latestEndDate, formatDate(basisDate)) : null;

    return {
        occurrences: valid.length,
        avgLength: Math.round(avgLength * 10) / 10,
        avgGapDays: gaps.length > 0 ? Math.round((gaps.reduce((sum, value) => sum + value, 0) / gaps.length) * 10) / 10 : null,
        latestEndDate,
        daysSinceLatestEnd
    };
}

/**
 * Build fullSequence from rawData for a streak that doesn't have it.
 * Returns array of {date: 'DD/MM/YYYY', value: '...'}
 */
function buildFullSequenceFromRaw(streak) {
    if (!streak || !streak.startDate || !streak.endDate) return [];
    const cacheKey = `${streak.startDate}|${streak.endDate}`;
    if (_fullSequenceCache.has(cacheKey)) return _fullSequenceCache.get(cacheKey);

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
    _fullSequenceCache.set(cacheKey, result);
    return result;
}

function getParityType(numberStr) {
    const n = String(numberStr).padStart(2, '0');
    const headEven = parseInt(n[0], 10) % 2 === 0;
    const tailEven = parseInt(n[1], 10) % 2 === 0;
    if (headEven && tailEven) return 'CC';
    if (headEven && !tailEven) return 'CL';
    if (!headEven && tailEven) return 'LC';
    return 'LL';
}

function parseStatsKey(key) {
    if (key.includes(':')) {
        const [category, subcategory] = key.split(':');
        return { category, subcategory };
    }

    const patterns = [
        'LuiDeuLienTiep', 'TienDeuLienTiep',
        'LuiLienTiep', 'TienLienTiep',
        'LuiDeu', 'TienDeu',
        'VeLienTiep', 'VeCungGiaTri', 'VeSole', 'VeSoleMoi',
        'DongTien', 'DongLui',
        'TienLuiSoLe', 'LuiTienSoLe', 'SoLeTheoCap',
        'Lui', 'Tien'
    ];

    for (const pattern of patterns) {
        if (key.endsWith(pattern)) {
            return {
                category: key.slice(0, -pattern.length),
                subcategory: pattern.charAt(0).toLowerCase() + pattern.slice(1)
            };
        }
    }

    if (key.startsWith('pattern_seq_')) return { category: key, subcategory: '' };
    return { category: key, subcategory: 'veLienTiep' };
}

function getPotentialStep(key, subcategory = '') {
    const lowerKey = String(key).toLowerCase();
    const lowerSub = String(subcategory).toLowerCase();
    const isAlternatingGapPattern = (
        lowerSub === 'vesole' ||
        lowerSub === 'vesolemoi' ||
        lowerKey.includes('vesole') ||
        lowerKey.includes('solemoi')
    ) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap');

    return isAlternatingGapPattern ? 2 : 1;
}

function isAllowedTienLuiSoLeAxis(key, category) {
    const lowerKey = String(key).toLowerCase();
    if (lowerKey === 'tienluisole' || lowerKey === 'luitiensole') return true;
    if (category === 'cacSo' || category === 'cacDau' || category === 'cacDit') return true;
    return category === 'tong_tt_cac_tong' ||
        category === 'tong_moi_cac_tong' ||
        category === 'hieu_cac_hieu';
}

function extractTienLuiOrderedValue(numberStr, key, category) {
    const normalized = String(numberStr).padStart(2, '0');
    const n = parseInt(normalized, 10);
    if (Number.isNaN(n)) return null;

    const lowerKey = String(key).toLowerCase();
    if (lowerKey === 'tienluisole' || lowerKey === 'luitiensole' || category === 'cacSo') return n;
    if (category === 'cacDau') return Math.floor(n / 10);
    if (category === 'cacDit') return n % 10;
    if (category === 'tong_tt_cac_tong') return getTongTT(normalized);
    if (category === 'tong_moi_cac_tong') return getTongMoi(normalized);
    if (category === 'hieu_cac_hieu') return getHieu(normalized);

    return null;
}

function shouldAttachPotential(stat, formLen, step) {
    if (!stat || stat.current) return false;
    const recordLen = stat.computedMaxStreak || (stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0);
    if (!recordLen || recordLen < 2) return false;
    const prefixLen = formLen - step;
    if (prefixLen === 1) {
        return recordLen === formLen;
    }
    return formLen >= recordLen - step;
}

function attachPatternNumbers(current, key) {
    try {
        const { predictNextInSequence, getNumbersFromCategory } = require('../controllers/suggestionsController');
        const { category, subcategory } = parseStatsKey(key);
        const nums = predictNextInSequence({ current }, category, subcategory || '');
        if (nums && nums.length > 0 && nums.length < 100) return nums;
        const fallback = getNumbersFromCategory(category);
        return fallback && fallback.length < 100 ? fallback : [];
    } catch (e) {
        return [];
    }
}

function toRawNumber(rawItem) {
    if (!rawItem || rawItem.special === null || rawItem.special === undefined) return '';
    return String(rawItem.special).padStart(2, '0');
}

function augmentPotentialStreaksForDate(quickStats, targetDateStr) {
    if (!quickStats || typeof quickStats !== 'object') return quickStats;

    const targetDate = parseDate(targetDateStr);
    if (!targetDate) return quickStats;

    const latestKnownDate = new Date(targetDate);
    latestKnownDate.setDate(latestKnownDate.getDate() - 1);
    const latestKnownTime = latestKnownDate.getTime();

    const rawData = lotteryService.getRawData() || [];
    const known = rawData
        .filter(item => {
            const itemDate = parseDate(item.date);
            return itemDate && itemDate.getTime() <= latestKnownTime;
        })
        .slice(-3);

    const today = known[known.length - 1];
    const yesterday = known[known.length - 2];
    const dayBefore = known[known.length - 3];
    const todayNum = toRawNumber(today);
    if (!todayNum) return quickStats;

    const todayDate = formatDate(parseDate(today.date));
    const matchedToday = identifyCategories(todayNum);

    const yesterdayNum = toRawNumber(yesterday);
    const yesterdayDate = yesterday ? formatDate(parseDate(yesterday.date)) : '';
    const matchedYesterday = yesterdayNum ? identifyCategories(yesterdayNum) : [];

    const dayBeforeNum = toRawNumber(dayBefore);
    const dayBeforeDate = dayBefore ? formatDate(parseDate(dayBefore.date)) : '';

    const setPotential = (key, current) => {
        const stat = quickStats[key];
        if (!stat || stat.current) return;
        const nums = attachPatternNumbers(current, key);
        quickStats[key] = {
            ...stat,
            current: {
                ...current,
                patternNumbers: nums && nums.length > 0
                    ? nums
                    : (current.patternNumbers && current.patternNumbers.length < 100 ? current.patternNumbers : []),
                isPotential: true
            },
            isPotentialRecord: true
        };
    };

    for (const key of Object.keys(quickStats)) {
        if (key === '_meta') continue;
        const stat = quickStats[key];
        if (!stat || stat.current) continue;

        const { category, subcategory } = parseStatsKey(key);
        const lowerKey = key.toLowerCase();
        const lowerSub = String(subcategory || '').toLowerCase();
        const step = getPotentialStep(key, subcategory);

        if (key.startsWith('pattern_seq_')) {
            if (!yesterdayNum || !dayBeforeNum) continue;
            const pattern = key.replace('pattern_seq_', '').split('_').map(p => p.toUpperCase());
            if (pattern.length < 4) continue;
            const prefixMatches =
                getParityType(dayBeforeNum) === pattern[0] &&
                getParityType(yesterdayNum) === pattern[1] &&
                getParityType(todayNum) === pattern[2];
            const formLen = 4;
            if (prefixMatches && shouldAttachPotential(stat, formLen, 1)) {
                setPotential(key, {
                    length: 3,
                    startDate: dayBeforeDate,
                    endDate: todayDate,
                    values: [dayBeforeNum, yesterdayNum, todayNum],
                    dates: [dayBeforeDate, yesterdayDate, todayDate],
                    fullSequence: [
                        { date: dayBeforeDate, value: dayBeforeNum },
                        { date: yesterdayDate, value: yesterdayNum },
                        { date: todayDate, value: todayNum, isLatest: true }
                    ],
                    isPotential: true
                });
            }
            continue;
        }

        const isTienLuiSoLe = lowerSub === 'tienluisole' || lowerSub === 'luitiensole' ||
            lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole');
        const isSoLeTheoCap = lowerSub === 'soletheocap' || lowerKey.includes('soletheocap');
        const isAlternatingGap = step === 2;

        if (isTienLuiSoLe) {
            if (!isAllowedTienLuiSoLeAxis(key, category)) continue;
            if (!yesterdayNum || !dayBeforeNum) continue;
            const v0 = extractTienLuiOrderedValue(dayBeforeNum, key, category);
            const v1 = extractTienLuiOrderedValue(yesterdayNum, key, category);
            const v2 = extractTienLuiOrderedValue(todayNum, key, category);
            if (v0 === null || v1 === null || v2 === null) continue;
            const d1 = Number(v1) - Number(v0);
            const d2 = Number(v2) - Number(v1);
            const wantsTienFirst = lowerSub === 'tienluisole' || lowerKey.includes('tienluisole');
            const directionsOk = wantsTienFirst ? (d1 > 0 && d2 < 0) : (d1 < 0 && d2 > 0);
            const formLen = 4;
            if (directionsOk && shouldAttachPotential(stat, formLen, 1)) {
                setPotential(key, {
                    length: 3,
                    startDate: dayBeforeDate,
                    endDate: todayDate,
                    values: [dayBeforeNum, yesterdayNum, todayNum],
                    dates: [dayBeforeDate, yesterdayDate, todayDate],
                    fullSequence: [
                        { date: dayBeforeDate, value: dayBeforeNum },
                        { date: yesterdayDate, value: yesterdayNum },
                        { date: todayDate, value: todayNum, isLatest: true }
                    ],
                    isPotential: true
                });
            }
            continue;
        }

        if (isSoLeTheoCap) {
            if (!isSoLeTheoCapCategory(category)) continue;
            if (!yesterdayNum || !dayBeforeNum) continue;
            const v0 = getSoLeTheoCapLabel(dayBeforeNum, category);
            const v1 = getSoLeTheoCapLabel(yesterdayNum, category);
            const v2 = getSoLeTheoCapLabel(todayNum, category);
            const ababPrefix = v0 && v1 && v2 && v0 !== v1 && v0 === v2;
            const formLen = 4;
            if (ababPrefix && shouldAttachPotential(stat, formLen, 1)) {
                const patternLabels = [v0, v1, v2];
                setPotential(key, {
                    length: 3,
                    startDate: dayBeforeDate,
                    endDate: todayDate,
                    values: [dayBeforeNum, yesterdayNum, todayNum],
                    patternLabels,
                    pairCategory: category,
                    value: formatSoLeTheoCapPairValue(category, patternLabels),
                    dates: [dayBeforeDate, yesterdayDate, todayDate],
                    fullSequence: [
                        { date: dayBeforeDate, value: dayBeforeNum },
                        { date: yesterdayDate, value: yesterdayNum },
                        { date: todayDate, value: todayNum, isLatest: true }
                    ],
                    isPotential: true
                });
            }
            continue;
        }

        if (isAlternatingGap) {
            const formLen = 3;
            if (yesterdayNum && matchedYesterday.includes(category) && !matchedToday.includes(category) && shouldAttachPotential(stat, formLen, step)) {
                setPotential(key, {
                    length: 1,
                    startDate: yesterdayDate,
                    endDate: yesterdayDate,
                    values: [yesterdayNum],
                    dates: [yesterdayDate],
                    fullSequence: [
                        { date: yesterdayDate, value: yesterdayNum },
                        { date: todayDate, value: todayNum, isLatest: true }
                    ],
                    isPotential: true
                });
            }
            continue;
        }

        const isGenericTopLevel = !key.includes(':') && (
            key.startsWith('motSo') || key.startsWith('motDau') || key.startsWith('motDit') ||
            key.startsWith('cacSo') || key.startsWith('cacDau') || key.startsWith('cacDit')
        );
        const matchesCategory = matchedToday.includes(category) || isGenericTopLevel;
        const formLen = 2;
        if (matchesCategory && shouldAttachPotential(stat, formLen, 1)) {
            let patternNumbers;
            if (key.startsWith('motSo')) {
                patternNumbers = [parseInt(todayNum, 10)];
            } else if (key.startsWith('motDau')) {
                const head = todayNum[0];
                patternNumbers = Array.from({ length: 100 }, (_, i) => i)
                    .filter(n => String(n).padStart(2, '0')[0] === head);
            } else if (key.startsWith('motDit')) {
                const tail = todayNum[1];
                patternNumbers = Array.from({ length: 100 }, (_, i) => i)
                    .filter(n => String(n).padStart(2, '0')[1] === tail);
            }
            setPotential(key, {
                length: 1,
                startDate: todayDate,
                endDate: todayDate,
                value: todayNum,
                values: [todayNum],
                dates: [todayDate],
                fullSequence: [{ date: todayDate, value: todayNum, isLatest: true }],
                patternNumbers,
                isPotential: true
            });
        }
    }

    return quickStats;
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

        const historyMetrics = computeHistoryMetrics(historicalStreaks, prevDate);
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
            !lowerKey.includes('tienluisole') &&
            !lowerKey.includes('luitiensole') &&
            !lowerKey.includes('soletheocap');
        const isTienLuiSoLe = lowerKey.includes('tienluisole') || lowerKey.includes('luitiensole');

        // === TÌM CHUỖI ĐANG DIỄN RA TẠI NGÀY ĐANG CHỌN ===
        // Logic chuẩn:
        // - Ngày đang chọn (prevDate = selectedDate) làm mốc
        // - Regular patterns: tìm streak CHỨA selectedDate, truncate đến selectedDate
        // - So le / So le mới: dùng selectedDate - 1 làm mốc (vì pattern cách ngày)
        // - Không quan tâm dữ liệu SAU ngày đang chọn
        let current = null;

        if (isSoLePattern) {
            // So le: Mốc = ngày TRƯỚC ngày đang chọn 1 ngày
            // prevDate LUÔN được coi là ngày xen kẽ (gap day)
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

        // Tính exactGapStats và gapStats (dùng để xác định freq + drop-off rate)
        const exactGapStats = {};
        const gapStats = {};
        const maxLen = longestLength;
        const calcLimit = maxLen + 1;

        for (let len = 1; len <= calcLimit; len++) {
            // exactGapStats: chính xác == len
            const exactStreaks = historicalStreaks.filter(s => s.length === len);
            exactGapStats[len] = { count: exactStreaks.length, pastCount: exactStreaks.length };

            // gapStats: >= len (dùng cho drop-off rate)
            const geStreaks = historicalStreaks.filter(s => s.length >= len);
            gapStats[len] = { count: geStreaks.length, pastCount: geStreaks.length };
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
                    const potentialCurrent = {
                        ...todayStreak,
                        isPotential: true,
                        length: 1
                    };
                    current = {
                        ...potentialCurrent,
                        patternNumbers: attachPatternNumbers(potentialCurrent, key)
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
            gapStats, // Proper >= counts for drop-off rate calculation
            historyMetrics
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

    augmentPotentialStreaksForDate(quickStats, targetDateStr);
    quickStats._meta = { totalYears };
    return quickStats;
}

// ==== MAIN FUNCTION ====
// Delegate sang exclusionLogicService.getDropOffExclusions() - SINGLE SOURCE OF TRUTH
const exclusionLogic = require('./exclusionLogicService');

/**
 * Tính exclusions cho một ngày cụ thể dựa trên quickStats lịch sử tại thời điểm đó.
 * Sử dụng phương pháp duy nhất: Drop-off >= 85%
 * 
 * @param {string} targetDateStr - 'dd/mm/yyyy'
 * @param {number} totalYears
 * @returns {Object}
 */
function getExclusionsForDate(targetDateStr, totalYears) {
    const quickStats = computeQuickStatsForDate(targetDateStr, totalYears);
    const result = exclusionLogic.getDropOffExclusions(quickStats);

    return {
        toBet: result.skipped ? [] : result.toBet,
        toBetPlus: result.skipped ? [] : result.toBet, // Cung 1 logic, khong phan biet Plus
        excluded: result.excluded,
        excludedPlus: result.excluded,
        skipped: result.skipped,
        skippedPlus: result.skipped,
        totalBet4: result.toBet.length,
        totalBet3: result.toBet.length
    };
}

/**
 * Phien ban cache - dung cho backtest nhieu ngay
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
    _parsedDateCache.clear();
    _fullSequenceCache.clear();
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
