const lotteryService = require('./lotteryService');
const {
    isSoLeTheoCapCategory,
    getSoLeTheoCapLabel,
    formatSoLeTheoCapPairValue
} = require('../utils/soLeTheoCapPairs');

let cachedStats = null;
let cachedQuickStats = null;
let cachedQuickStatsHistory = null;
let latestDate = null;
let augmentedQuickStatsSource = null;
let augmentedQuickStatsCache = null;
let activeStreaksSource = null;
let activeStreaksCache = null;
let hydratedHistorySource = null;
let hydratedHistoryCache = null;
const MAX_POTENTIAL_FORM_FREQ_PER_YEAR = 1;

/**
 * Đọc và hợp nhất dữ liệu từ tất cả các file thống kê.
 */
async function getStatsData() {
    // Ensure raw data is loaded (needed for hydrateStreak)
    let rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) {
        await lotteryService.loadRawData();
    }

    // 1. Kiểm tra cache trước tiên
    if (cachedStats) {
        console.log('[CACHE] Sử dụng dữ liệu statistic từ cache.');
        return cachedStats;
    }

    // 2. Nếu cache trống, đọc file và tạo cache mới
    try {
        console.log('[CACHE] Cache trống, đang đọc dữ liệu thống kê từ lotteryService...');
        
        // OPTIMIZATION: Auto-trigger loadRawData() và loadStats() nếu chưa có
        let rawData = lotteryService.getRawData();
        if (!rawData || rawData.length === 0) {
            console.log('[CACHE] Raw data chưa load, đang gọi lotteryService.loadRawData()...');
            await lotteryService.loadRawData();
        }

        let numberStats = lotteryService.getNumberStats();
        if (!numberStats || Object.keys(numberStats).length === 0) {
            console.log('[CACHE] Stats chưa load, đang gọi lotteryService.loadStats()...');
            await lotteryService.loadStats();
            numberStats = lotteryService.getNumberStats() || {};
        }
        const headTailStats = lotteryService.getHeadTailStats() || {};
        const sumDiffStats = lotteryService.getSumDiffStats() || {};

        // Nạp dữ liệu vào cache
        cachedStats = { ...numberStats, ...headTailStats, ...sumDiffStats };
        console.log('[CACHE] Đã nạp thành công dữ liệu statistic mới vào cache.');
        return cachedStats;

    } catch (error) {
        console.error('Lỗi khi đọc hoặc phân tích file thống kê:', error);
        return {}; // Trả về đối tượng rỗng nếu có lỗi
    }
}

// === HÀM MỚI ĐỂ XÓA CACHE ===
function clearCache() {
    console.log('[CACHE] Xóa cache thống kê...');
    cachedStats = null;
    cachedQuickStats = null;
    cachedQuickStatsHistory = null;
    latestDate = null;
    augmentedQuickStatsSource = null;
    augmentedQuickStatsCache = null;
    activeStreaksSource = null;
    activeStreaksCache = null;
    hydratedHistorySource = null;
    hydratedHistoryCache = null;
};

/**
 * Lấy ngày mới nhất từ dữ liệu gốc
 */
async function getLatestDate() {
    if (latestDate && process.env.NODE_ENV !== 'development') {
        return latestDate;
    }
    try {
        let data = lotteryService.getRawData();
        if (!data || data.length === 0) {
            await lotteryService.loadRawData();
            data = lotteryService.getRawData();
        }
        if (!data || data.length === 0) return null;
        const lastEntry = data[data.length - 1];
        if (lastEntry && lastEntry.date) {
            const d = new Date(lastEntry.date);
            latestDate = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            return latestDate;
        }
        return null;
    } catch (error) {
        console.error('Không thể đọc ngày mới nhất:', error);
        return null;
    }
}

/**
 * Lấy kết quả xổ số gần đây (mặc định 7 ngày)
 */
async function getRecentResults(limit = 7) {
    try {
        let data = lotteryService.getRawData();
        if (!data || data.length === 0) {
            await lotteryService.loadRawData();
            data = lotteryService.getRawData();
        }
        if (!data) return [];
        const recentData = data.slice(-limit);
        return recentData;
    } catch (error) {
        console.error('Lỗi khi lấy kết quả gần đây:', error);
        return [];
    }
}


/**
 * Hàm tiện ích để chuyển đổi chuỗi ngày 'dd/mm/yyyy' thành đối tượng Date
 */
function parseDate(dateString) {
    if (!dateString) return null;
    // Handle YYYY-MM-DD format (from DB/rawData)
    if (dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length >= 3) {
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2].substring(0, 2)));
        }
        return null;
    }
    // Handle DD/MM/YYYY format
    const parts = dateString.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

/**
 * Hydrate (phục hồi) dữ liệu chi tiết của streak (fullSequence, dates, values) 
 * từ rawData, dùng khi load stats từ DB đã được minify.
 */
function hydrateStreak(streak, categoryName = '') {
    if (!streak || !streak.startDate || !streak.endDate) return streak;
    // LUÔN re-hydrate để đảm bảo fullSequence có format date DD/MM/YYYY chuẩn

    const rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) return streak;

    const formatToDDMMYYYY = (dateStr) => {
        if (!dateStr) return '';
        // Cắt string trực tiếp để miễn nhiễm hoàn toàn với lỗi Timezone (lệch giờ làm trượt ngày)
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-');
            const year = parts[0];
            const month = parts[1];
            const day = parts[2].substring(0, 2); // xử lý TH dính kí tự T như 24T00:00:00
            return `${day}/${month}/${year}`;
        }
        return dateStr;
    };

    const startIndex = rawData.findIndex(item => formatToDDMMYYYY(item.date) === streak.startDate);
    const endIndex = rawData.findIndex(item => formatToDDMMYYYY(item.date) === streak.endDate);
    
    if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
        // Ta cần map rawData (mà có key 'special') về cấu trúc { date, value } để frontend xử lý bình thường
        // QUAN TRỌNG: date PHẢI là DD/MM/YYYY vì frontend dùng format này để render bong bóng
        const fSeq = rawData.slice(startIndex, endIndex + 1).map(item => ({
            date: formatToDDMMYYYY(item.date),
            value: item.special !== null ? String(item.special).padStart(2, '0') : null
        })).filter(i => i.value !== null);

        const isSoLe = categoryName && categoryName.toLowerCase().includes('sole') &&
            !categoryName.toLowerCase().includes('tienluisole') &&
            !categoryName.toLowerCase().includes('luitiensole') &&
            !categoryName.toLowerCase().includes('soletheocap');

        // Đối với chuỗi So le, ngày tiếp theo của endDate chính là ngày xen kẽ (gap day)
        // Ta tự động nối vào fullSequence để UI hiển thị viền đứt nét (dù là ở current hay history)
        if (isSoLe && endIndex + 1 < rawData.length) {
            const nextItem = rawData[endIndex + 1];
            if (nextItem && nextItem.special !== null && nextItem.special !== undefined) {
                fSeq.push({
                    date: formatToDDMMYYYY(nextItem.date),
                    value: String(nextItem.special).padStart(2, '0'),
                    isLatest: true
                });
            }
        }


        let actualDates = streak.dates;
        let actualValues = streak.values;

        if (!actualDates || !actualValues) {
            if (isSoLe) {
                actualDates = [];
                actualValues = [];
                for (let i = startIndex; i <= endIndex; i += 2) {
                    const item = rawData[i];
                    if (item && item.special !== null) {
                        actualDates.push(formatToDDMMYYYY(item.date));
                        actualValues.push(String(item.special).padStart(2, '0'));
                    }
                }
            } else {
                actualDates = fSeq.map(i => i.date);
                actualValues = fSeq.map(i => i.value);
            }
        }

        return {
            ...streak,
            fullSequence: fSeq,
            dates: actualDates,
            values: actualValues
        };
    }
    return streak;
}

/**
 * Lấy và lọc các chuỗi thống kê
 */
async function getFilteredStreaks(category, subcategory, filters = {}) {
    const allStats = await getStatsData();
    let statsData;
    let finalStreaks = []; // Khai báo ở đây để đảm bảo luôn tồn tại

    if (subcategory && allStats[category] && allStats[category][subcategory]) {
        statsData = allStats[category][subcategory];
    } else if (allStats[category]) {
        statsData = allStats[category];
    }

    if (!statsData || !statsData.streaks) {
        return { description: 'Không tìm thấy dữ liệu', streaks: [] };
    }

    finalStreaks = statsData.streaks;

    if (filters.startDate) {
        const start = parseDate(filters.startDate);
        if (start) finalStreaks = finalStreaks.filter(s => parseDate(s.startDate) >= start);
    }
    if (filters.endDate) {
        const end = parseDate(filters.endDate);
        if (end) finalStreaks = finalStreaks.filter(s => parseDate(s.endDate) <= end);
    }
    if (filters.minLength && filters.minLength !== 'all') {
        // === SỬA LỖI CHÍNH TẠI ĐÂY ===
        // Thay đổi toán tử so sánh từ >= thành == để lọc chính xác.
        finalStreaks = finalStreaks.filter(s => s.length == filters.minLength);
    }

    // 🔥 HYDRATE STREAKS SO FRONTEND HAS FULLSEQUENCE AND VALUES TO RENDER BUBBLES
    finalStreaks = finalStreaks.map(s => hydrateStreak(s, category));

    try {
        const { predictNextInSequence } = require('../controllers/suggestionsController');
        finalStreaks = finalStreaks.map(streak => {
            const statObj = { current: { values: streak.values.map(String) } };
            const nums = predictNextInSequence(statObj, category, subcategory || '', true); // true = isHistory
            return { ...streak, patternNumbers: nums };
        });
    } catch (e) {
        console.error('Error attaching patternNumbers in getFilteredStreaks:', e);
    }

    return {
        description: statsData.description,
        streaks: finalStreaks
    };
};


/**
 * Lấy dữ liệu cho phần Thống kê kỷ lục
 */
async function getQuickStats() {
    if (cachedQuickStats) return cachedQuickStats;

    const allStats = await getStatsData();
    const quickStats = {};
    latestDate = await getLatestDate();
    const today = latestDate ? parseDate(latestDate) : new Date();
    const latestLotteryDay = await getLatestLotteryResult();

    const analyzeCategory = (key, categoryData) => {
        if (!categoryData || !Array.isArray(categoryData.streaks) || categoryData.streaks.length === 0) {
            return;
        }

        const streaks = [...categoryData.streaks].sort((a, b) => b.length - a.length);
        const longest = streaks.filter(s => s.length === streaks[0].length).map(s => hydrateStreak(s, key));

        let secondLongest = [];
        const longestLength = streaks[0].length;
        for (let i = 0; i < streaks.length; i++) {
            if (streaks[i].length < longestLength) {
                const secondLength = streaks[i].length;
                secondLongest = streaks.filter(s => s.length === secondLength).map(s => hydrateStreak(s, key));
                break;
            }
        }

        // Xác định chuỗi hiện tại (đang diễn ra)
        let current = null;
        if (latestDate) {
            const isSoLe = key.toLowerCase().includes('sole') &&
                !key.toLowerCase().includes('tienluisole') &&
                !key.toLowerCase().includes('luitiensole') &&
                !key.toLowerCase().includes('soletheocap');
            const isTienLuiSoLe = key.toLowerCase().includes('tienluisole') || key.toLowerCase().includes('luitiensole');

            if (isSoLe) {
                // So le: latestDate LUÔN là ngày xen kẽ (gap day)
                // Chỉ hiện chuỗi có ngày active cuối = yesterday (endDate === yesterday)
                // → Dự đoán cho ngày tiếp theo (latestDate + 1 = ngày active tiếp theo)
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = `${String(yesterday.getDate()).padStart(2, '0')}/${String(yesterday.getMonth() + 1).padStart(2, '0')}/${yesterday.getFullYear()}`;

                const rawStreak = categoryData.streaks.find(s => s.endDate === yesterdayStr);
                if (rawStreak) {
                    const streak = hydrateStreak(rawStreak, key);
                    const isSoLeMoi = key.toLowerCase().includes('solemoi') || key.toLowerCase().includes('sole_moi');
                    let isValid = true;

                    // Validate So le mới: ngày xen kẽ (latestDate) KHÔNG được trùng pattern
                    if (isSoLeMoi && latestLotteryDay && latestLotteryDay.special) {
                        try {
                            const { predictNextInSequence } = require('../controllers/suggestionsController');
                            const [categoryName, subcategoryStr] = key.split(':');
                            const matchNumbers = predictNextInSequence({ current: streak }, categoryName, subcategoryStr || '');
                            if (matchNumbers && matchNumbers.length > 0) {
                                const stringNumbers = matchNumbers.map(n => String(n).padStart(2, '0'));
                                const specialNum = String(latestLotteryDay.special).padStart(2, '0');
                                if (stringNumbers.includes(specialNum)) {
                                    // Ngày xen kẽ bị trùng kết quả -> Bị GÃY CHUỖI So le mới
                                    isValid = false;
                                }
                            }
                        } catch (e) {
                            console.error('Lỗi khi validate So le mới:', e);
                        }
                    }

                    if (isValid) {
                        current = {
                            ...streak,
                            fullSequence: streak.fullSequence ? [...streak.fullSequence] : []
                        };
                    }
                }
            } else if (isTienLuiSoLe) {
                // Với Tiến Lùi So Le: Chỉ lấy chuỗi kết thúc hôm nay (như các dạng khác)
                // VÀ phải có độ dài >= 4 (theo yêu cầu người dùng)
                const s = categoryData.streaks.find(s => s.endDate === latestDate && s.length >= 4);
                if (s) current = hydrateStreak(s, key);
            } else {
                // Với dạng khác: Chuỗi đang diễn ra = kết thúc đúng ngày mới nhất
                const s = categoryData.streaks.find(s => s.endDate === latestDate);
                if (s) current = hydrateStreak(s, key);
            }
        }

        // Tính toán khoảng cách trung bình chung (như cũ)
        const streaksByDate = [...categoryData.streaks].sort((a, b) => parseDate(a.startDate) - parseDate(b.startDate));
        let totalInterval = 0;
        let daysSinceLast = 'N/A';

        if (streaksByDate.length > 1) {
            for (let i = 1; i < streaksByDate.length; i++) {
                const prevEndDate = parseDate(streaksByDate[i - 1].endDate);
                const currStartDate = parseDate(streaksByDate[i].startDate);
                const diffTime = Math.abs(currStartDate - prevEndDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                totalInterval += diffDays;
            }
        }

        const averageInterval = streaksByDate.length > 1 ? Math.round(totalInterval / (streaksByDate.length - 1)) : 0;

        if (latestDate && streaksByDate.length > 0) {
            const lastStreakEndDate = parseDate(streaksByDate[streaksByDate.length - 1].endDate);
            if (today && lastStreakEndDate) {
                const diffTime = Math.abs(today - lastStreakEndDate);
                daysSinceLast = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            }
        }

        // === TÍNH TOÁN GAP STATS CHI TIẾT CHO TỪNG ĐỘ DÀI ===
        const gapStats = {};
        const exactGapStats = {}; // NEW: Thống kê cho độ dài chính xác
        const maxLen = longestLength > 0 ? longestLength : 0;
        const calcLimit = maxLen + 1;

        // Detect if this is a "so le" pattern
        const isSoLePattern = (key.toLowerCase().includes('sole') || key.toLowerCase().includes('solemoi')) &&
            !key.toLowerCase().includes('tienluisole') &&
            !key.toLowerCase().includes('luitiensole') &&
            !key.toLowerCase().includes('soletheocap');

        // Helper function to calculate stats for a set of streaks
        // currentStreakInfo: the ongoing current streak (if any) to exclude from calculations
        const calculateGapStatsForStreaks = (streaks, isSoLe, currentStreakInfo = null) => {
            // Filter out the current streak from calculations
            const filteredStreaks = currentStreakInfo
                ? streaks.filter(s => !(s.startDate === currentStreakInfo.startDate && s.endDate === currentStreakInfo.endDate))
                : streaks;

            // Calculate cutoff date (1 day before current streak started) to exclude overlapping streaks
            let cutoffDate = null;
            if (currentStreakInfo && currentStreakInfo.startDate) {
                cutoffDate = new Date(parseDate(currentStreakInfo.startDate));
                cutoffDate.setDate(cutoffDate.getDate() - 1);
            }

            // Only include streaks that ended before the cutoff (if there's a current streak)
            const validStreaks = cutoffDate
                ? filteredStreaks.filter(s => parseDate(s.endDate) <= cutoffDate)
                : filteredStreaks;

            if (validStreaks.length < 1) {
                return { avgGap: 0, lastGap: 0, minGap: null, count: 0, pastCount: 0 };
            }

            if (validStreaks.length < 2) {
                let lastGap = 0;
                const lastEnd = parseDate(validStreaks[0].endDate);

                // Calculate lastGap to current streak's start (if exists) or to tomorrow
                if (currentStreakInfo && currentStreakInfo.startDate) {
                    lastGap = Math.ceil((parseDate(currentStreakInfo.startDate) - lastEnd) / 86400000);
                } else {
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    lastGap = Math.ceil((tomorrow - lastEnd) / 86400000);
                }

                return { avgGap: 0, lastGap, minGap: null, count: validStreaks.length, pastCount: validStreaks.length };
            }

            // Calculate individual gaps between consecutive streaks
            // Gap = startDate of next streak - endDate of previous streak
            const gaps = [];
            for (let i = 0; i < validStreaks.length - 1; i++) {
                const prevEnd = parseDate(validStreaks[i].endDate);
                const nextStart = parseDate(validStreaks[i + 1].startDate);
                const gap = Math.ceil((nextStart - prevEnd) / 86400000);
                gaps.push(gap);
            }

            // Filter gaps based on pattern type
            let filteredGaps;
            if (isSoLe) {
                filteredGaps = gaps.filter(g => g > 2);
            } else {
                filteredGaps = gaps.filter(g => g > 1);
            }

            const avgGap = filteredGaps.length > 0
                ? Math.round(filteredGaps.reduce((sum, g) => sum + g, 0) / filteredGaps.length)
                : 0;

            const minGap = filteredGaps.length > 0 ? Math.min(...filteredGaps) : null;
            const maxGap = filteredGaps.length > 0 ? Math.max(...filteredGaps) : null;

            // Count how many times minGap and maxGap appear
            const minCount = filteredGaps.filter(g => g === minGap).length;
            const maxCount = filteredGaps.filter(g => g === maxGap).length;

            // Calculate lastGap: From the last valid streak to current streak's start (or tomorrow if no current)
            let lastGap = 0;
            const lastValidStreak = validStreaks[validStreaks.length - 1];
            const lastValidEnd = parseDate(lastValidStreak.endDate);

            if (currentStreakInfo && currentStreakInfo.startDate) {
                // Gap from last past streak END to current streak START
                lastGap = Math.ceil((parseDate(currentStreakInfo.startDate) - lastValidEnd) / 86400000);
            } else {
                // No current streak - gap to tomorrow
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                lastGap = Math.ceil((tomorrow - lastValidEnd) / 86400000);
            }

            return { avgGap, lastGap, minGap, maxGap, minCount, maxCount, count: validStreaks.length, pastCount: validStreaks.length };
        };

        // NEW: Calculate extension gap - gap from streak of length N to streak of length N+step
        // This measures how long it typically takes for a streak to "extend" to the next level
        const calculateExtensionGap = (allStreaks, fromLen, step, isSoLe, currentStreakInfo) => {
            const toLen = fromLen + step;

            // Get all streaks with length >= fromLen, sorted by date
            const sortedStreaks = allStreaks
                .filter(s => s.length >= fromLen)
                .sort((a, b) => parseDate(a.endDate) - parseDate(b.endDate));

            if (sortedStreaks.length < 1) {
                return { minGap: null, avgGap: 0, lastGap: 0, count: 0, lastStoppedDate: null };
            }

            // Find gaps from streaks of exactly fromLen to streaks of >= toLen
            const extensionGaps = [];

            for (let i = 0; i < sortedStreaks.length - 1; i++) {
                const currentStreak = sortedStreaks[i];

                // Only consider streaks that are exactly fromLen (not longer)
                // These are the ones that "stopped" at fromLen
                if (currentStreak.length === fromLen) {
                    // Find the next streak that is >= toLen
                    for (let j = i + 1; j < sortedStreaks.length; j++) {
                        const nextStreak = sortedStreaks[j];
                        if (nextStreak.length >= toLen) {
                            const gap = Math.ceil(
                                (parseDate(nextStreak.startDate) - parseDate(currentStreak.endDate)) / 86400000
                            );
                            // Only count meaningful gaps
                            const minValidGap = isSoLe ? 2 : 1;
                            if (gap > minValidGap) {
                                extensionGaps.push(gap);
                            }
                            break; // Found the next extension, move to next fromLen streak
                        }
                    }
                }
            }

            // Calculate lastGap: from the last streak that stopped at exactly fromLen to today
            // IMPORTANT: Must exclude streaks that are part of or overlap with current streak
            let lastGap = 0;
            let lastStoppedDate = null;

            // Find the most recent streak that stopped at exactly fromLen
            // Must end BEFORE the current streak started (if there's an ongoing current streak of >= fromLen)
            let cutoffDate = null;

            // Use the passed currentStreakInfo (if it exists and has length >= fromLen)
            if (currentStreakInfo && currentStreakInfo.length >= fromLen && currentStreakInfo.startDate) {
                // Cutoff date = 1 day before current streak started
                // This ensures we don't count streaks that overlap with current one
                cutoffDate = new Date(parseDate(currentStreakInfo.startDate));
                cutoffDate.setDate(cutoffDate.getDate() - 1);
            }

            const stoppedStreaks = sortedStreaks
                .filter(s => {
                    // Must be exactly fromLen
                    if (s.length !== fromLen) return false;
                    // Must not be the current streak (check by startDate and endDate)
                    if (currentStreakInfo &&
                        s.startDate === currentStreakInfo.startDate &&
                        s.endDate === currentStreakInfo.endDate) {
                        return false;
                    }
                    // If there's a cutoff, must end before it
                    if (cutoffDate && parseDate(s.endDate) > cutoffDate) return false;
                    return true;
                })
                .sort((a, b) => parseDate(b.endDate) - parseDate(a.endDate)); // Most recent first

            if (stoppedStreaks.length > 0) {
                const lastStopped = stoppedStreaks[0];
                lastStoppedDate = lastStopped.endDate;
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                lastGap = Math.ceil((tomorrow - parseDate(lastStopped.endDate)) / 86400000);
            }

            if (extensionGaps.length === 0) {
                return { minGap: null, maxGap: null, avgGap: 0, lastGap, count: 0, minCount: 0, maxCount: 0, lastStoppedDate };
            }

            const minGap = Math.min(...extensionGaps);
            const maxGap = Math.max(...extensionGaps);
            const avgGap = Math.round(extensionGaps.reduce((sum, g) => sum + g, 0) / extensionGaps.length);

            // Count how many times minGap and maxGap appear
            const minCount = extensionGaps.filter(g => g === minGap).length;
            const maxCount = extensionGaps.filter(g => g === maxGap).length;

            return { minGap, maxGap, avgGap, lastGap, count: extensionGaps.length, minCount, maxCount, lastStoppedDate };
        };

        // Extension gap stats: gap from N to N+1 (or N+2 for solo patterns)
        const extensionGapStats = {};
        const step = isSoLePattern ? 2 : 1; // So le patterns extend by 2 days

        for (let len = 1; len <= calcLimit; len++) {
            // 1. Greater or Equal (>= len)
            const geStreaks = categoryData.streaks
                .filter(s => s.length >= len)
                .sort((a, b) => parseDate(a.endDate) - parseDate(b.endDate));
            // Pass current streak info for proper lastGap calculation
            gapStats[len] = calculateGapStatsForStreaks(geStreaks, isSoLePattern, current);

            // 2. Exact Length (== len)
            const exactStreaks = categoryData.streaks
                .filter(s => s.length === len)
                .sort((a, b) => parseDate(a.endDate) - parseDate(b.endDate));
            exactGapStats[len] = calculateGapStatsForStreaks(exactStreaks, isSoLePattern, current);

            // 3. Extension Gap: from len to len+step
            // Pass current streak info for proper cutoff calculation
            extensionGapStats[len] = calculateExtensionGap(categoryData.streaks, len, step, isSoLePattern, current);
        }

        quickStats[key] = {
            description: categoryData.description,
            longest,
            secondLongest,
            current,
            averageInterval,
            daysSinceLast,
            gapStats,
            exactGapStats,
            extensionGapStats // NEW: Gap from streak N to streak N+step
        };

        // === ÁP DỤNG CÁCH TÍNH MỐC KỶ LỤC MỚI ===
        // Công thức: Tần suất chính xác (số lần xảy ra == len) / tổng số năm thực tế <= 1.5 thì len là mốc kỷ lục
        let computedMaxStreak = longestLength;
        let isSuperMaxThreshold = false;

        const lotteryService = require('./lotteryService');
        const totalYears = lotteryService.getTotalYears();

        const isTienLuiSoLePattern = key.toLowerCase().includes('tienluisole') || key.toLowerCase().includes('luitiensole');
        let startLen = 2;
        let increment = 1;

        if (isSoLePattern) {
            // Dạng so le (tính theo số ngày kéo dài thực tế: 1, 3, 5, 7, 9)
            // Chuỗi độ dài 1 không phải là mốc kỷ lục, nên bắt đầu đánh giá từ 3, tăng dần 2
            startLen = 3;
            increment = 2;
        } else if (isTienLuiSoLePattern) {
            // Dạng tiến lùi / lùi tiến so le ít nhất 4 ngày mới hình thành chuỗi
            startLen = 4;
            increment = 1;
        }

        for (let len = startLen; len <= calcLimit; len += increment) {
            const count = exactGapStats[len] ? exactGapStats[len].count : 0;
            const freqYear = count / totalYears; // Sử dụng tổng số năm thực tế

            if (freqYear <= 1.5) {
                computedMaxStreak = len;
                isSuperMaxThreshold = freqYear <= 0.5;
                break; // Đạt mốc kỷ lục đầu tiên
            }
        }

        // Cập nhật vào quickStats
        quickStats[key].computedMaxStreak = computedMaxStreak;
        quickStats[key].isSuperMaxThreshold = isSuperMaxThreshold;

        // === ÁP DỤNG TIỀM NĂNG - PHÁT HIỆN CHUỖI SẮP HÌNH THÀNH ===
        // Phát hiện các pattern mới bắt đầu (chưa đủ ngày để thành chuỗi chính thức)
        // Áp dụng cho TẤT CẢ computedMaxStreak, không chỉ 2/3
        // Chỉ xử lý nested keys (có ':') vì category mapping từ identifyCategories
        if (!quickStats[key].current && key.includes(':')) {
            const [category, subcategory] = key.split(':');
            
            // Xác định loại subcategory
            const isSoLeSubcat = (subcategory === 'veSole' || subcategory === 'veSoleMoi');
            const isSoLeTheoCapSubcat = subcategory === 'soLeTheoCap';
            const isTienLuiSoLeSubcat = subcategory === 'tienLuiSoLe' || subcategory === 'luiTienSoLe';
            
            // Bỏ qua tienLuiSoLe (cần minLength 4, quá phức tạp cho tiềm năng)
            if (hasLatest && !isTienLuiSoLeSubcat) {
                if (isSoLeTheoCapSubcat) {
                    // ABAB theo cặp chỉ hợp lệ khi A/B là 2 dạng khác nhau trên cùng một trục.
                    if (isSoLeTheoCapCategory(category) && hasYesterday && hasDayBeforeYesterday) {
                        const labelToday = getSoLeTheoCapLabel(numTodayStr, category);
                        const labelYesterday = getSoLeTheoCapLabel(numYesterdayStr, category);
                        const labelDayBeforeYesterday = getSoLeTheoCapLabel(numDayBeforeYesterdayStr, category);

                        if (labelToday && labelYesterday && labelDayBeforeYesterday &&
                            labelToday !== labelYesterday &&
                            labelToday === labelDayBeforeYesterday) {
                            const patternLabels = [labelDayBeforeYesterday, labelYesterday, labelToday];
                            quickStats[key].current = {
                                length: 3,
                                startDate: dayBeforeYestDate,
                                endDate: latestDate,
                                values: [numDayBeforeYesterdayStr, numYesterdayStr, numTodayStr],
                                patternLabels,
                                pairCategory: category,
                                value: formatSoLeTheoCapPairValue(category, patternLabels),
                                dates: [dayBeforeYestDate, yestDate, latestDate],
                                fullSequence: [
                                    { date: dayBeforeYestDate, value: numDayBeforeYesterdayStr, isLatest: false },
                                    { date: yestDate, value: numYesterdayStr, isLatest: false },
                                    { date: latestDate, value: numTodayStr, isLatest: true }
                                ],
                                isPotential: true
                            };
                        }
                    }
                } else if (isSoLeSubcat) {
                    // DẠNG SO LE: Hôm qua thoả mãn, hôm nay KHÔNG thoả mãn → gap day
                    if (hasYesterday && matchedYesterday.includes(category) && !matchedToday.includes(category)) {
                        quickStats[key].current = {
                            length: 1,
                            startDate: yestDate,
                            endDate: yestDate,
                            values: [numYesterdayStr],
                            dates: [yestDate],
                            fullSequence: [
                                { date: yestDate, value: numYesterdayStr, isLatest: false },
                                { date: latestDate, value: numTodayStr, isLatest: true }
                            ],
                            isPotential: true
                        };
                    }
                } else {
                    // DẠNG THƯỜNG (veLienTiep, tienLienTiep, luiLienTiep, etc.)
                    // Số hôm nay thoả mãn category → tiềm năng bắt đầu chuỗi
                    if (matchedToday.includes(category)) {
                        quickStats[key].current = {
                            length: 1,
                            startDate: latestDate,
                            endDate: latestDate,
                            values: [numTodayStr],
                            dates: [latestDate],
                            fullSequence: [{ date: latestDate, value: numTodayStr, isLatest: true }],
                            isPotential: true
                        };
                    }
                }
            }
        }

        // [MỚI] Dùng logic predictNextInSequence để lấy pattern numbers chuẩn (chạy sau khi mọi current đã hình thành)
        if (quickStats[key] && quickStats[key].current) {
            try {
                const { predictNextInSequence } = require('../controllers/suggestionsController');
                const [categoryName, subcategoryStr] = key.split(':');
                const statObj = { current: quickStats[key].current };
                const nums = predictNextInSequence(statObj, categoryName, subcategoryStr || '');
                if (nums && nums.length > 0) {
                    quickStats[key].current.patternNumbers = nums;
                }
            } catch (e) {
                console.error('Lỗi khi lấy danh sách số cho pattern', key, e);
            }
        }
    };

    let processedCount = 0;
    
    // PRE-CALCULATE matchedToday and matchedYesterday
    const { identifyCategories } = require('../utils/numberAnalysis');
    let matchedToday = [];
    let matchedYesterday = [];
    let matchedDayBeforeYesterday = [];
    let numTodayStr = '';
    let numYesterdayStr = '';
    let numDayBeforeYesterdayStr = '';
    let yestDate = '';
    let dayBeforeYestDate = '';
    let hasLatest = false;
    let hasYesterday = false;
    let hasDayBeforeYesterday = false;
    
    if (latestDate && latestLotteryDay && latestLotteryDay.special) {
        hasLatest = true;
        numTodayStr = String(latestLotteryDay.special).padStart(2, '0');
        matchedToday = identifyCategories(numTodayStr);
        
        const rawData = require('./lotteryService').getRawData();
        if (rawData && rawData.length >= 2) {
            const yesterdayLotteryDay = rawData[rawData.length - 2];
            if (yesterdayLotteryDay && yesterdayLotteryDay.special) {
                hasYesterday = true;
                numYesterdayStr = String(yesterdayLotteryDay.special).padStart(2, '0');
                matchedYesterday = identifyCategories(numYesterdayStr);
                const formatToDDMMYYYY = (d) => {
                    if (d.includes('/')) return d;
                    const parts = d.split('-');
                    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                    return d;
                };
                yestDate = formatToDDMMYYYY(yesterdayLotteryDay.date);
            }
            
            if (rawData.length >= 3) {
                const dbYesterdayLotteryDay = rawData[rawData.length - 3];
                if (dbYesterdayLotteryDay && dbYesterdayLotteryDay.special) {
                    hasDayBeforeYesterday = true;
                    numDayBeforeYesterdayStr = String(dbYesterdayLotteryDay.special).padStart(2, '0');
                    matchedDayBeforeYesterday = identifyCategories(numDayBeforeYesterdayStr);
                    const formatToDDMMYYYY = (d) => {
                        if (d.includes('/')) return d;
                        const parts = d.split('-');
                        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                        return d;
                    };
                    dayBeforeYestDate = formatToDDMMYYYY(dbYesterdayLotteryDay.date);
                }
            }
        }
    }

    const { predictNextInSequence } = require('../controllers/suggestionsController');

    const startTotal = Date.now();
    for (const key in allStats) {
        processedCount++;
        
        const categoryData = allStats[key];
        
        // Pass the pre-calculated matched variables to analyzeCategory somehow?
        // Wait, analyzeCategory accesses `matchedToday` directly if we define it in the closure!
        // But analyzeCategory is already defined above...
        
        if (categoryData.streaks) { // Cấu trúc đơn
            analyzeCategory(key, categoryData);
        } else { // Cấu trúc lồng
            for (const subKey in categoryData) {
                analyzeCategory(`${key}:${subKey}`, categoryData[subKey]);
            }
        }
    }
    console.log('Finished analyzing all categories. Time taken:', Date.now() - startTotal, 'ms');

    augmentPotentialStreaks(quickStats);

    const lotteryServiceForMeta = require('./lotteryService');
    quickStats._meta = { totalYears: lotteryServiceForMeta.getTotalYears() };
    return quickStats;
};

/**
 * Lấy toàn bộ dữ liệu thống kê, sử dụng cache nếu có.
 */
async function getAllStreaks() {
    if (!cachedStats) {
        await getStatsData();
    }
    return cachedStats;
}

/**
 * Lấy các chuỗi đang diễn ra gần đây.
 */
async function getRecentStreaks(days = 30) {
    const allStreaks = await getAllStreaks();
    const recentStreaks = { streaks: {} };

    for (const key in allStreaks) {
        const streakInfo = allStreaks[key];
        if (streakInfo.current) {
            const currentLength = streakInfo.current.length;
            if (!recentStreaks.streaks[currentLength]) {
                recentStreaks.streaks[currentLength] = [];
            }
            recentStreaks.streaks[currentLength].push({
                statName: key,
                statDescription: streakInfo.description,
                details: [streakInfo.current]
            });
        }
    }
    return recentStreaks;
}

/**
 * Lấy thống kê chi tiết cho một loại chuỗi với độ dài cụ thể.
 * (Hàm đã được cải tiến để ổn định hơn)
 */
async function getStreakStats(statName, exactLength) {
    try {
        const allStreaks = await getAllStreaks();
        const streakData = allStreaks[statName];

        if (!streakData || !streakData.streaks) {
            return { runs: [] };
        }

        const runs = streakData.streaks
            .filter(streak => streak.length === exactLength)
            .map(streak => ({ date: streak.startDate })); // Lấy ngày bắt đầu của chuỗi

        // Sắp xếp các lần chạy theo ngày để tính toán cho chính xác
        return {
            runs: runs.sort((a, b) => new Date(a.date) - new Date(b.date)),
        };
    } catch (error) {
        console.error(`Lỗi khi lấy getStreakStats cho ${statName}:`, error);
        return { runs: [] }; // Trả về mảng rỗng nếu có lỗi
    }
}

/**
 * Lấy kết quả xổ số của ngày gần nhất.
 */
async function getLatestLotteryResult() {
    try {
        const data = lotteryService.getRawData();
        if (!data || data.length === 0) return null;
        const sorted = [...data].sort((a, b) => {
            const dA = parseDate(a.date);
            const dB = parseDate(b.date);
            return (dB ? dB.getTime() : 0) - (dA ? dA.getTime() : 0);
        });
        return sorted[0];
    } catch (error) {
        console.error('Lỗi khi đọc dữ liệu kết quả xổ số:', error);
        return null;
    }
}


/**
 * Lấy lịch sử 7 ngày gần nhất của 'Chuỗi đang diễn ra'
 * Tối ưu hóa: Trả về trực tiếp nếu có cache
 */
async function getQuickStatsHistory() {
    if (cachedQuickStatsHistory) return cachedQuickStatsHistory;

    const lotteryServiceForHistory = require('./lotteryService');
    const { computeQuickStatsForDate } = require('./historicalExclusionService');

    // Đảm bảo load rawData + stats (cần stats cho computeQuickStatsForDate)
    await lotteryServiceForHistory.loadAll();
    const rawData = lotteryServiceForHistory.getRawData();
    if (!rawData || rawData.length === 0) return [];

    let historyCount = 7;
    const historyDates = rawData.slice(-Math.min(historyCount, rawData.length)).map(entry => {
        const d = parseDate(entry.date);
        if (!d) return null;
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    }).filter(d => d !== null);
    // historyDates đang xếp từ quá khứ đến hiện tại (ngày mới nhất cuối cùng)
    // lật lại để ngày mới nhất đứng đầu
    historyDates.reverse();

    const totalYears = lotteryServiceForHistory.getTotalYears();
    const historyResults = [];

    // Tính toán quickStats cho từng ngày trong 7 ngày
    for (const targetDateStr of historyDates) {
        // computeQuickStatsForDate(targetDate) dùng prevDate = targetDate - 1 làm mốc
        // rawData date = ngày có kết quả (VD: 17/03)
        // Shift +1: targetDate = 18/03 → prevDate = 17/03 = ngày hiển thị trên UI
        // Frontend hiển thị rawDate trực tiếp (KHÔNG getPrevDay)
        const dateObj = parseDate(targetDateStr);
        if (dateObj) {
            dateObj.setDate(dateObj.getDate() + 1);
            const shiftedTargetDateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

            const statsAtThatDay = computeQuickStatsForDate(shiftedTargetDateStr, totalYears);

            // Format lại dữ liệu cho nhẹ, chỉ lấy danh sách các chuỗi ĐANG DIỄN RA
            const activeStreaks = [];
            for (const key in statsAtThatDay) {
                if (key === '_meta') continue;
                if (statsAtThatDay[key] && statsAtThatDay[key].current) {
                    const currentObj = statsAtThatDay[key].current;
                    const recordLength = statsAtThatDay[key].computedMaxStreak || (statsAtThatDay[key].longest && statsAtThatDay[key].longest.length > 0 ? statsAtThatDay[key].longest[0].length : 0);

                    // Thêm logic patternNumbers như trang hiện tại
                    try {
                        const { predictNextInSequence } = require('../controllers/suggestionsController');
                        const [categoryName, subcategoryStr] = key.split(':');
                        const nums = predictNextInSequence({ current: currentObj }, categoryName, subcategoryStr || '');
                        if (nums && nums.length > 0) {
                            currentObj.patternNumbers = nums;
                        }
                    } catch (e) { }

                    // === RE-HYDRATE fullSequence từ rawData ===
                    const hydratedObj = hydrateStreak(currentObj, key);

                    activeStreaks.push({
                        ...hydratedObj,
                        key: key,
                        description: statsAtThatDay[key].description,
                        recordLength: recordLength,
                        isSuperRecord: statsAtThatDay[key].isSuperMaxThreshold || false,
                        originalRecord: statsAtThatDay[key].longest && statsAtThatDay[key].longest.length > 0 ? statsAtThatDay[key].longest[0].length : 0,
                        gapStats: statsAtThatDay[key].gapStats,
                        exactGapStats: statsAtThatDay[key].exactGapStats,
                        extensionGapStats: statsAtThatDay[key].extensionGapStats
                    });
                }
            }

            historyResults.push({
                date: targetDateStr,
                streaks: activeStreaks
            });
        }
    }

    cachedQuickStatsHistory = historyResults;
    return historyResults;
}


/**
 * Re-hydrate tất cả current streaks trong quick_stats từ rawData.
 * Dùng khi load quick_stats từ DB cache mà fullSequence bị thiếu hoặc sai format.
 */
function rehydrateCurrentStreaks(quickStats) {
    if (!quickStats || typeof quickStats !== 'object') return quickStats;
    if (augmentedQuickStatsSource === quickStats && augmentedQuickStatsCache) {
        return augmentedQuickStatsCache;
    }

    const result = augmentPotentialStreaks({ ...quickStats });
    for (const key of Object.keys(result)) {
        if (key === '_meta') continue;
        const cat = result[key];
        if (cat && cat.current) {
            result[key] = {
                ...cat,
                current: hydrateStreak(cat.current, key)
            };
        }
    }

    augmentedQuickStatsSource = quickStats;
    augmentedQuickStatsCache = result;
    return result;
}

function formatToDDMMYYYY(dateStr) {
    if (!dateStr) return '';
    if (dateStr.includes('/')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length >= 3) return `${parts[2].substring(0, 2)}/${parts[1]}/${parts[0]}`;
    return dateStr;
}

function getParityType(numberStr) {
    const s = String(numberStr).padStart(2, '0');
    const d0 = parseInt(s[0], 10) % 2;
    const d1 = parseInt(s[1], 10) % 2;
    if (d0 === 0 && d1 === 0) return 'CC';
    if (d0 === 0 && d1 === 1) return 'CL';
    if (d0 === 1 && d1 === 0) return 'LC';
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
    const isAlternatingGapPattern = (lowerSub === 'vesole' || lowerSub === 'vesolemoi' || lowerKey.includes('vesole') || lowerKey.includes('solemoi')) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap');
    return isAlternatingGapPattern ? 2 : 1;
}

function getPotentialFormFrequencyPerYear(stat, key) {
    if (!stat || !stat.current || !stat.current.isPotential) return 0;
    const { subcategory } = parseStatsKey(key);
    const step = getPotentialStep(key, subcategory);
    const formLen = (stat.current.length || 0) + step;
    const countForm = stat.gapStats && stat.gapStats[formLen] ? stat.gapStats[formLen].count : 0;
    const totalYears = lotteryService.getTotalYears();
    return totalYears > 0 ? countForm / totalYears : 0;
}

function shouldIncludePotentialForUi(stat, key) {
    if (!stat || !stat.current || !stat.current.isPotential) return true;
    return getPotentialFormFrequencyPerYear(stat, key) <= MAX_POTENTIAL_FORM_FREQ_PER_YEAR;
}

function pickStatsKeys(source, keys) {
    if (!source || typeof source !== 'object') return source;
    const compact = {};
    for (const key of keys) {
        if (source[key] !== undefined) compact[key] = source[key];
    }
    return compact;
}

function compactStatsForUi(source, key, current) {
    const { subcategory } = parseStatsKey(key);
    const step = getPotentialStep(key, subcategory);
    const currentLen = current && current.length ? current.length : 0;
    const nextLen = currentLen + step;
    const keys = current && current.isPotential
        ? [currentLen, nextLen, nextLen + step]
        : [currentLen, nextLen];

    return {
        gapStats: pickStatsKeys(source.gapStats, keys),
        exactGapStats: pickStatsKeys(source.exactGapStats, [nextLen]),
        extensionGapStats: pickStatsKeys(source.extensionGapStats, [currentLen])
    };
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
    const n = parseInt(numberStr, 10);
    if (Number.isNaN(n)) return null;

    const lowerKey = String(key).toLowerCase();
    if (lowerKey === 'tienluisole' || lowerKey === 'luitiensole' || category === 'cacSo') return n;
    if (category === 'cacDau') return Math.floor(n / 10);
    if (category === 'cacDit') return n % 10;

    const { getTongTT, getTongMoi, getHieu } = require('../utils/numberAnalysis');
    if (category === 'tong_tt_cac_tong') return getTongTT(numberStr);
    if (category === 'tong_moi_cac_tong') return getTongMoi(numberStr);
    if (category === 'hieu_cac_hieu') return getHieu(numberStr);

    return null;
}

function shouldAttachPotential(stat, key, formLen, step) {
    if (!stat || stat.current) return false;
    const recordLen = stat.computedMaxStreak || (stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0);
    if (!recordLen || recordLen < 2) return false;
    return formLen >= recordLen - step;
}

function attachPatternNumbers(current, key) {
    try {
        const { predictNextInSequence, getNumbersFromCategory } = require('../controllers/suggestionsController');
        const { category, subcategory } = parseStatsKey(key);
        const nums = predictNextInSequence({ current }, category, subcategory || '');
        if (nums && nums.length > 0) return nums;
        return getNumbersFromCategory(category);
    } catch (e) {
        return [];
    }
}

function augmentPotentialStreaks(quickStats) {
    if (!quickStats || typeof quickStats !== 'object') return quickStats;

    const rawData = lotteryService.getRawData();
    if (!rawData || rawData.length === 0) return quickStats;

    const latest = rawData[rawData.length - 1];
    const yesterday = rawData[rawData.length - 2];
    const dayBefore = rawData[rawData.length - 3];
    if (!latest || latest.special === null || latest.special === undefined) return quickStats;

    const { identifyCategories } = require('../utils/numberAnalysis');
    const todayNum = String(latest.special).padStart(2, '0');
    const todayDate = formatToDDMMYYYY(latest.date);
    const matchedToday = identifyCategories(todayNum);

    const yesterdayNum = yesterday && yesterday.special !== null && yesterday.special !== undefined
        ? String(yesterday.special).padStart(2, '0')
        : '';
    const yesterdayDate = yesterday ? formatToDDMMYYYY(yesterday.date) : '';
    const matchedYesterday = yesterdayNum ? identifyCategories(yesterdayNum) : [];

    const dayBeforeNum = dayBefore && dayBefore.special !== null && dayBefore.special !== undefined
        ? String(dayBefore.special).padStart(2, '0')
        : '';
    const dayBeforeDate = dayBefore ? formatToDDMMYYYY(dayBefore.date) : '';
    const matchedDayBefore = dayBeforeNum ? identifyCategories(dayBeforeNum) : [];

    const setPotential = (key, current) => {
        const stat = quickStats[key];
        if (!stat || stat.current) return;
        const nums = attachPatternNumbers(current, key);
        quickStats[key] = {
            ...stat,
            current: {
                ...current,
                patternNumbers: nums && nums.length > 0 ? nums : current.patternNumbers,
                isPotential: true
            }
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
            if (prefixMatches && shouldAttachPotential(stat, key, formLen, 1)) {
                const current = {
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
                };
                setPotential(key, current);
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
            if (directionsOk && shouldAttachPotential(stat, key, formLen, 1)) {
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
            if (ababPrefix && shouldAttachPotential(stat, key, formLen, 1)) {
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
            if (yesterdayNum && matchedYesterday.includes(category) && !matchedToday.includes(category) && shouldAttachPotential(stat, key, formLen, step)) {
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
        if (matchesCategory && shouldAttachPotential(stat, key, formLen, 1)) {
            let patternNumbers;
            if (key.startsWith('motSo')) {
                patternNumbers = [parseInt(todayNum, 10)];
            } else if (key.startsWith('motDau')) {
                const head = todayNum[0];
                patternNumbers = Array.from({ length: 100 }, (_, i) => i).filter(n => String(n).padStart(2, '0')[0] === head);
            } else if (key.startsWith('motDit')) {
                const tail = todayNum[1];
                patternNumbers = Array.from({ length: 100 }, (_, i) => i).filter(n => String(n).padStart(2, '0')[1] === tail);
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

function buildActiveStreaksFromQuickStats(quickStats) {
    if (activeStreaksSource === quickStats && activeStreaksCache) {
        return activeStreaksCache;
    }

    const activeStreaks = [];
    const hydrated = rehydrateCurrentStreaks(quickStats);

    for (const key of Object.keys(hydrated || {})) {
        if (key === '_meta') continue;
        const stat = hydrated[key];
        if (!stat || !stat.current) continue;
        const { category, subcategory } = parseStatsKey(key);
        if (String(subcategory || '').toLowerCase() === 'soletheocap' && !isSoLeTheoCapCategory(category)) continue;
        if (!shouldIncludePotentialForUi(stat, key)) continue;
        const compactStats = compactStatsForUi(stat, key, stat.current);
        const displayDescription = String(subcategory || '').toLowerCase() === 'soletheocap' && stat.current.value
            ? `${stat.current.value} so le theo cặp`
            : stat.description;

        activeStreaks.push({
            ...stat.current,
            key,
            description: displayDescription,
            recordLength: stat.computedMaxStreak || (stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0),
            isSuperRecord: stat.isSuperMaxThreshold || false,
            originalRecord: stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0,
            gapStats: compactStats.gapStats,
            exactGapStats: compactStats.exactGapStats,
            extensionGapStats: compactStats.extensionGapStats
        });
    }

    activeStreaksSource = quickStats;
    activeStreaksCache = activeStreaks;
    return activeStreaks;
}

/**
 * Re-hydrate tất cả streaks trong history từ rawData.
 * Trả lại list obj { date, streaks: [ hydrated_streaks... ] }
 */
function rehydrateHistoryStreaks(historyCache) {
    if (!historyCache || !Array.isArray(historyCache)) return historyCache;
    if (hydratedHistorySource === historyCache && hydratedHistoryCache) {
        return hydratedHistoryCache;
    }

    hydratedHistorySource = historyCache;
    hydratedHistoryCache = historyCache.map(dayObj => {
        if (!dayObj.streaks) return dayObj;
        return {
            ...dayObj,
            streaks: dayObj.streaks.map(streak => hydrateStreak(streak, streak.key))
        };
    });
    return hydratedHistoryCache;
}

module.exports = {
    getStatsData,
    getFilteredStreaks,
    getQuickStats,
    clearCache,
    getAllStreaks,
    getRecentStreaks,
    getRecentResults,
    getLatestLotteryResult,
    getStreakStats,
    getLatestDate,
    getQuickStatsHistory,
    rehydrateCurrentStreaks,
    rehydrateHistoryStreaks,
    buildActiveStreaksFromQuickStats,
};
