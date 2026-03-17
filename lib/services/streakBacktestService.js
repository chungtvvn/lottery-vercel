// services/streakBacktestService.js
// Backtest phương pháp Streak Continuation - Sử dụng dữ liệu chuỗi đã lưu
// Sử dụng predictNextInSequence từ suggestionsController để lấy đúng các số

const lotteryService = require('./lotteryService');
const historicalExclusionSvc = require('./historicalExclusionService');

/**
 * Đọc tất cả dữ liệu thống kê
 */
async function loadAllStats() {
    try {
        const numberStats = lotteryService.getNumberStats() || {};
        const headTailStats = lotteryService.getHeadTailStats() || {};
        const sumDiffStats = lotteryService.getSumDiffStats() || {};
        return { ...numberStats, ...headTailStats, ...sumDiffStats };
    } catch (error) {
        console.error('[Streak Backtest] Lỗi đọc thống kê:', error.message);
    }
}

function parseDate(dateStr) {
    if (!dateStr) return new Date(0);
    const [d, m, y] = dateStr.split('/').map(Number);
    return new Date(y, m - 1, d);
}

function getDaySpan(startStr, endStr) {
    const d1 = parseDate(startStr);
    const d2 = parseDate(endStr);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Chạy backtest cho N ngày
 */
async function runBacktest(days = 30) {
    try {
        const lotteryService = require('./lotteryService');
        const suggestionsController = require('../controllers/suggestionsController');
        const rawData = lotteryService.getRawData();

        if (!rawData || rawData.length < days + 1) {
            return { error: 'Không đủ dữ liệu để backtest' };
        }

        // Đọc tất cả dữ liệu thống kê
        const allStats = await loadAllStats();

        if (!allStats || Object.keys(allStats).length === 0) {
            return { error: 'Không có dữ liệu thống kê' };
        }

        const results = [];
        let totalWins = 0;
        let totalLosses = 0;

        // Lấy kết quả từ ngày gần nhất trở về trước
        const endIndex = rawData.length - 1;
        const startIndex = endIndex - days;

        for (let i = startIndex; i < endIndex; i++) {
            const dateData = rawData[i];
            const nextDayData = rawData[i + 1];

            if (!dateData || !nextDayData) continue;

            // Format ngày theo dd/mm/yyyy
            const dateObj = new Date(dateData.date);
            const dateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;

            // Ngày tiếp theo cần dự đoán (ngày i+1)
            const nextDayObj = new Date(nextDayData.date);
            const nextDayStr = `${String(nextDayObj.getDate()).padStart(2, '0')}/${String(nextDayObj.getMonth() + 1).padStart(2, '0')}/${nextDayObj.getFullYear()}`;

            const actualNumber = nextDayData.special;
            const actualNumberStr = String(actualNumber).padStart(2, '0');

            // === EXCLUSION & EXCLUSION+ (dùng historicalExclusionService) ===
            const totalYears = lotteryService.getTotalYears();
            const exclResult = historicalExclusionSvc.getExclusionsForDateCached(nextDayStr, totalYears);
            const exclusionNumbers = exclResult.toBet;   // Exclusion: 4 subTier
            const exclusionPlusNumbers = exclResult.toBetPlus; // Exclusion+: 3 subTier
            const exclusionSkipped = exclResult.skipped;
            const exclusionPlusSkipped = exclResult.skippedPlus;

            // Tìm tất cả chuỗi kết thúc vào ngày này (đang diễn ra)
            const activeStreaks = findActiveStreaksAtDate(allStats, dateStr, suggestionsController);

            // Lấy TẤT CẢ số từ mọi chuỗi đang diễn ra
            const allNumbersSet = new Set();
            // Loại số từ chuỗi RỦI RO (đã được đánh dấu isRisky trong findActiveStreaksAtDate)
            const excludedNumbersSet = new Set();

            activeStreaks.forEach(streak => {
                const nums = streak.numbers || [];
                nums.forEach(n => allNumbersSet.add(n));

                // Loại trừ: Sử dụng flag isRisky (đã tính đa tầng: RED, PURPLE, ORANGE, RARE)
                if (streak.isRisky) {
                    nums.forEach(n => excludedNumbersSet.add(n));
                }
            });

            const allNumbers = Array.from(allNumbersSet).sort((a, b) => a - b);
            const excludedNumbers = Array.from(excludedNumbersSet).sort((a, b) => a - b);

            // Final Numbers = All - Excluded (Chỉ loại số từ chuỗi kỷ lục)
            const finalNumbers = allNumbers.filter(n => !excludedNumbersSet.has(n));

            // SKIP LOGIC: Nới lỏng để ngày nào cũng đánh
            // Chỉ bỏ khi quá nhiều số (> 85) hoặc = 0
            const skipped = finalNumbers.length > 85 || finalNumbers.length === 0;

            // Kiểm tra trúng
            const isWin = allNumbers.includes(actualNumber);
            const isExcludedWin = excludedNumbers.includes(actualNumber);
            const isFinalWin = !skipped && finalNumbers.includes(actualNumber);

            // Kiểm tra Exclusion & Exclusion+
            const isExclusionWin = !exclusionSkipped && exclusionNumbers.includes(actualNumber);
            const isExclusionPlusWin = !exclusionPlusSkipped && exclusionPlusNumbers.includes(actualNumber);

            if (isWin) totalWins++;
            else totalLosses++;

            results.push({
                date: dateData.date.substring(0, 10),
                nextDate: nextDayData.date.substring(0, 10),
                dateDisplay: dateStr,
                actualNumber: actualNumber,
                allContinuationCount: allNumbers.length,
                isWin: isWin,
                inAllContinuation: isWin,

                // Excluded data
                excludedCount: excludedNumbers.length,
                isExcludedWin: isExcludedWin,
                excludedNumbers: excludedNumbers,

                // Final data (Played numbers)
                finalCount: finalNumbers.length,
                skipped: skipped,
                isFinalWin: isFinalWin,
                finalNumbers: finalNumbers,

                // Exclusion (historicalExclusionService)
                exclusionCount: exclusionNumbers.length,
                exclusionSkipped: exclusionSkipped,
                isExclusionWin: isExclusionWin,
                exclusionNumbers: exclusionNumbers,

                // Exclusion+ (historicalExclusionService)
                exclusionPlusCount: exclusionPlusNumbers.length,
                exclusionPlusSkipped: exclusionPlusSkipped,
                isExclusionPlusWin: isExclusionPlusWin,
                exclusionPlusNumbers: exclusionPlusNumbers,

                allNumbers: allNumbers,
                streakDetails: activeStreaks,
                streakCount: activeStreaks.length
            });
        }

        // Tính thống kê
        const winRate = results.length > 0 ? totalWins / results.length : 0;

        // Excluded Success Rate
        const excludedFailCount = results.filter(r => r.isExcludedWin).length;
        const excludedSuccessRate = results.length > 0 ? (results.length - excludedFailCount) / results.length : 0;

        // Final Win Rate (Chứ tính trên những ngày KHÔNG SKIP)
        const playedDays = results.filter(r => !r.skipped);
        const finalWins = playedDays.filter(r => r.isFinalWin).length;
        const finalLosses = playedDays.length - finalWins;
        const finalWinRate = playedDays.length > 0 ? finalWins / playedDays.length : 0;

        // Exclusion Stats
        const exclusionPlayed = results.filter(r => !r.exclusionSkipped);
        const exclusionWins = exclusionPlayed.filter(r => r.isExclusionWin).length;
        const exclusionLosses = exclusionPlayed.length - exclusionWins;
        const exclusionWinRate = exclusionPlayed.length > 0 ? exclusionWins / exclusionPlayed.length : 0;
        const exclusionAvgCount = exclusionPlayed.length > 0
            ? (exclusionPlayed.reduce((a, b) => a + b.exclusionCount, 0) / exclusionPlayed.length).toFixed(1)
            : 0;

        // Exclusion+ Stats
        const exclusionPlusPlayed = results.filter(r => !r.exclusionPlusSkipped);
        const exclusionPlusWins = exclusionPlusPlayed.filter(r => r.isExclusionPlusWin).length;
        const exclusionPlusLosses = exclusionPlusPlayed.length - exclusionPlusWins;
        const exclusionPlusWinRate = exclusionPlusPlayed.length > 0 ? exclusionPlusWins / exclusionPlusPlayed.length : 0;
        const exclusionPlusAvgCount = exclusionPlusPlayed.length > 0
            ? (exclusionPlusPlayed.reduce((a, b) => a + b.exclusionPlusCount, 0) / exclusionPlusPlayed.length).toFixed(1)
            : 0;

        return {
            summary: {
                totalDays: results.length,
                wins: totalWins,
                losses: totalLosses,
                winRate: (winRate * 100).toFixed(2) + '%',
                allContinuationWins: totalWins,
                allContinuationRate: (winRate * 100).toFixed(2) + '%',

                // Excluded summary
                excludedSuccessRate: (excludedSuccessRate * 100).toFixed(2) + '%',
                avgExcludedCount: (results.reduce((a, b) => a + b.excludedCount, 0) / results.length).toFixed(1),

                // Final summary
                finalPlayDays: playedDays.length,
                finalSkipDays: results.length - playedDays.length,
                finalWins: finalWins,
                finalLosses: finalLosses,
                finalWinRate: (finalWinRate * 100).toFixed(2) + '%',
                avgFinalCount: (playedDays.reduce((a, b) => a + b.finalCount, 0) / (playedDays.length || 1)).toFixed(1),

                // Exclusion summary
                exclusionPlayDays: exclusionPlayed.length,
                exclusionSkipDays: results.length - exclusionPlayed.length,
                exclusionWins: exclusionWins,
                exclusionLosses: exclusionLosses,
                exclusionWinRate: (exclusionWinRate * 100).toFixed(2) + '%',
                exclusionAvgCount: exclusionAvgCount,

                // Exclusion+ summary
                exclusionPlusPlayDays: exclusionPlusPlayed.length,
                exclusionPlusSkipDays: results.length - exclusionPlusPlayed.length,
                exclusionPlusWins: exclusionPlusWins,
                exclusionPlusLosses: exclusionPlusLosses,
                exclusionPlusWinRate: (exclusionPlusWinRate * 100).toFixed(2) + '%',
                exclusionPlusAvgCount: exclusionPlusAvgCount
            },
            results: results
        };
    } catch (error) {
        console.error('[Streak Backtest] Lỗi:', error.message, error.stack);
        return { error: error.message };
    }
}

/**
 * Tìm tất cả chuỗi đang diễn ra (kết thúc vào ngày đó)
 */
function findActiveStreaksAtDate(allStats, targetDate, suggestionsController) {
    const activeStreaks = [];
    const targetDateObj = parseDate(targetDate);

    // Tính ngày hôm qua (cho So Le patterns)
    const yesterdayObj = new Date(targetDateObj);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterday = `${String(yesterdayObj.getDate()).padStart(2, '0')}/${String(yesterdayObj.getMonth() + 1).padStart(2, '0')}/${yesterdayObj.getFullYear()}`;

    const processCategory = (key, categoryData) => {
        if (!categoryData || !Array.isArray(categoryData.streaks)) return;

        // Xác định loại pattern
        const isSoLePattern = (key.toLowerCase().includes('sole') || key.toLowerCase().includes('solemoi')) &&
            !key.includes('tienLuiSoLe') && !key.includes('luiTienSoLe');

        // Tìm chuỗi đang diễn ra theo đúng logic của getQuickStats:
        // - So Le: endDate = ngày hôm qua
        // - Các dạng khác: endDate = ngày target
        const expectedEndDate = isSoLePattern ? yesterday : targetDate;

        const matchingStreaks = categoryData.streaks.filter(s => s.endDate === expectedEndDate);

        // 2. Tính toán Stats (Max/Avg) CHỈ trên các chuỗi đã kết thúc TRƯỚC targetDate (Quá khứ)
        // Để tránh Look-ahead Bias
        const pastStreaks = categoryData.streaks.filter(s => {
            const end = parseDate(s.endDate);
            return end < targetDateObj;
        });

        let maxStreak = 0;
        let avgStreak = 0;
        let computedMaxStreak = 0;

        if (pastStreaks.length > 0) {
            const lengths = pastStreaks.map(s => s.length);
            maxStreak = Math.max(...lengths);
            avgStreak = lengths.reduce((a, b) => a + b, 0) / lengths.length;

            // Tính mốc kỷ lục mới (tần suất <= 1.5/năm)
            computedMaxStreak = maxStreak;
            const lotteryService = require('./lotteryService');
            const totalYears = lotteryService.getTotalYears();

            const isTienLuiSoLePattern = key.includes('tienLuiSoLe') || key.includes('luiTienSoLe');
            let startLen = 2;
            let increment = 1;

            if (isSoLePattern) {
                startLen = 3;
                increment = 2;
            } else if (isTienLuiSoLePattern) {
                startLen = 4;
                increment = 1;
            }

            for (let len = startLen; len <= maxStreak; len += increment) {
                const count = pastStreaks.filter(s => s.length === len).length;
                const freqYear = count / totalYears; // Sử dụng tổng thời gian thực tế
                if (freqYear <= 1.5) {
                    computedMaxStreak = len;
                    break;
                }
            }
        } else {
            maxStreak = 0;
            avgStreak = 0;
            computedMaxStreak = 0;
        }

        matchingStreaks.forEach(originalStreak => {
            const streak = originalStreak; // Không cần clone vì đã exact match endDate

            // Chuỗi phải từ 2 ngày trở lên mới được tính (1 ngày không phải chuỗi)
            if (streak.length < 2) return;

            // Tạo stat object giống như quickStats current
            const stat = {
                current: streak,
                description: categoryData.description
            };

            // Map key thành category và subcategory đúng cho predictNextInSequence
            const [category, subcategory] = mapKeyToCategorySubcategory(key);

            // Sử dụng predictNextInSequence để lấy đúng các số
            let numbers = [];
            try {
                // Xử lý đặc biệt cho motDau và motDit (veLienTiep)
                if (category === 'motDau' && subcategory === 'veLienTiep') {
                    // 1 Đầu về liên tiếp - lấy tất cả số có cùng đầu
                    const lastValue = streak.values?.[streak.values.length - 1] || streak.value;
                    if (lastValue) {
                        const num = parseInt(lastValue);
                        if (!isNaN(num)) {
                            const dau = Math.floor(num / 10);
                            for (let i = 0; i <= 9; i++) {
                                numbers.push(dau * 10 + i);
                            }
                        }
                    }
                } else if (category === 'motDit' && subcategory === 'veLienTiep') {
                    // 1 Đít về liên tiếp - lấy tất cả số có cùng đít
                    const lastValue = streak.values?.[streak.values.length - 1] || streak.value;
                    if (lastValue) {
                        const num = parseInt(lastValue);
                        if (!isNaN(num)) {
                            const dit = num % 10;
                            for (let i = 0; i <= 9; i++) {
                                numbers.push(i * 10 + dit);
                            }
                        }
                    }
                } else if (category === 'motSo' && subcategory === 'veLienTiep') {
                    // 1 số về liên tiếp - lấy số đó
                    const lastValue = streak.values?.[streak.values.length - 1] || streak.value;
                    if (lastValue) {
                        const num = parseInt(lastValue);
                        if (!isNaN(num) && num >= 0 && num < 100) {
                            numbers.push(num);
                        }
                    }
                } else {
                    // Gọi predictNextInSequence cho các trường hợp khác
                    numbers = suggestionsController.predictNextInSequence(stat, category, subcategory);
                    if (!Array.isArray(numbers)) numbers = [];

                    // MỞ RỘNG SỐ CHO CÁC DẠNG ĐẦU/ĐÍT
                    // Nếu là dự đoán Đầu (VD: cacDau, motDau...), numbers chứa các chữ số đầu (0-9)
                    // Cần chuyển thành bộ số (VD: đầu 1 -> 10-19)
                    if (category.includes('Dau') || category === 'cacDau' || category === 'motDau') {
                        const expandedNumbers = [];
                        numbers.forEach(d => {
                            const dau = parseInt(d);
                            if (!isNaN(dau) && dau >= 0 && dau <= 9) {
                                for (let i = 0; i <= 9; i++) {
                                    expandedNumbers.push(dau * 10 + i);
                                }
                            }
                        });
                        if (expandedNumbers.length > 0) numbers = expandedNumbers;
                    }
                    // Nếu là dự đoán Đít (VD: cacDit, motDit...)
                    else if (category.includes('Dit') || category === 'cacDit' || category === 'motDit') {
                        const expandedNumbers = [];
                        numbers.forEach(d => {
                            const dit = parseInt(d);
                            if (!isNaN(dit) && dit >= 0 && dit <= 9) {
                                for (let i = 0; i <= 9; i++) {
                                    expandedNumbers.push(i * 10 + dit);
                                }
                            }
                        });
                        if (expandedNumbers.length > 0) numbers = expandedNumbers;
                    }
                }
            } catch (e) {
                // Fallback: lấy từ values/fullSequence
                numbers = getNumbersFromStreakFallback(streak);
            }

            // Convert to integer array and deduplicate
            const uniqueNumbers = new Set();
            numbers.forEach(n => {
                const val = typeof n === 'string' ? parseInt(n, 10) : n;
                if (!isNaN(val) && val >= 0 && val < 100) {
                    uniqueNumbers.add(val);
                }
            });

            numbers = Array.from(uniqueNumbers);

            // LOGIC XÁC ĐỊNH RỦI RO - THEO STATISTICS
            // Tính thêm thống kê từ pastStreaks
            const currentLen = streak.length;

            // Xác định targetLen (so le tăng = 2, dạng khác = 1)
            const isSoLePattern = (key.toLowerCase().includes('sole') || key.toLowerCase().includes('solemoi')) &&
                !key.includes('tienLuiSoLe') && !key.includes('luiTienSoLe');
            const targetLen = isSoLePattern ? currentLen + 2 : currentLen + 1;

            // Đếm số lần chuỗi độ dài = targetLen xảy ra trong quá khứ
            const lotteryService = require('./lotteryService');
            const targetCount = pastStreaks.filter(s => s.length === targetLen).length;
            const targetFreqYear = targetCount / lotteryService.getTotalYears();

            let isRisky = false;
            let riskLevel = '';

            let reason = '';

            // 1. ĐỎ - Đạt kỷ lục mới
            if (currentLen >= computedMaxStreak && computedMaxStreak > 0) {
                isRisky = true;
                riskLevel = 'RED_RECORD';
                reason = `Đạt kỷ lục: Chuỗi hiện tại (${currentLen} ngày) đã đạt mốc kỷ lục ${computedMaxStreak} ngày.`;
            }
            // 2. TÍM - Tới hạn siêu kỷ lục (< 0.5)
            else if (targetFreqYear <= 0.5) {
                isRisky = true;
                riskLevel = 'PURPLE_RECORD';
                reason = `Tới hạn Siêu KL: Chuỗi ${targetLen} ngày chỉ xuất hiện ${targetCount} lần / ${lotteryService.getTotalYears().toFixed(1)} năm (Tần suất: ${targetFreqYear.toFixed(2)}/năm <= 0.5).`;
            }
            // 3. ĐỎ - Tới hạn kỷ lục (<= 1.5)
            else if (targetFreqYear <= 1.5) {
                isRisky = true;
                riskLevel = 'RED_RECORD';
                reason = `Tới hạn Kỷ lục: Chuỗi ${targetLen} ngày chỉ xuất hiện ${targetCount} lần / ${lotteryService.getTotalYears().toFixed(1)} năm (Tần suất: ${targetFreqYear.toFixed(2)}/năm <= 1.5).`;
            }


            // isSafe = ngược lại
            const isSafe = !isRisky;

            activeStreaks.push({
                key: key,
                title: categoryData.description || key,
                pattern: categoryData.description || key,
                type: categoryData.description || key,
                value: getStreakValue(streak),
                streak: streak.length,
                maxStreak: computedMaxStreak,
                avgStreak: avgStreak.toFixed(1),
                isSafe: isSafe,
                isRisky: isRisky,
                riskLevel: riskLevel,
                reason: reason,
                startDate: streak.startDate,
                endDate: streak.endDate,
                numbers: numbers,
                description: categoryData.description || ''
            });
        });
    };

    for (const key in allStats) {
        const categoryData = allStats[key];
        if (categoryData.streaks) {
            // Cấu trúc đơn
            processCategory(key, categoryData);
        } else {
            // Cấu trúc lồng
            for (const subKey in categoryData) {
                if (categoryData[subKey] && categoryData[subKey].streaks) {
                    processCategory(`${key}:${subKey}`, categoryData[subKey]);
                }
            }
        }
    }

    return activeStreaks;
}

/**
 * Lấy giá trị đại diện từ streak
 */
function getStreakValue(streak) {
    if (streak.values && streak.values.length > 0) {
        return streak.values[streak.values.length - 1];
    }
    if (streak.value !== undefined) {
        return streak.value;
    }
    if (streak.fullSequence && streak.fullSequence.length > 0) {
        const last = streak.fullSequence[streak.fullSequence.length - 1];
        return typeof last === 'object' ? last.value : last;
    }
    return '';
}

/**
 * Fallback: lấy số từ values/fullSequence khi predictNextInSequence không hoạt động
 */
function getNumbersFromStreakFallback(streak) {
    const numbers = [];

    if (streak.fullSequence && streak.fullSequence.length > 0) {
        streak.fullSequence.forEach(s => {
            const val = typeof s === 'object' ? s.value : s;
            const num = parseInt(val);
            if (!isNaN(num) && num >= 0 && num < 100) {
                numbers.push(num);
            }
        });
    } else if (streak.values && streak.values.length > 0) {
        streak.values.forEach(v => {
            const num = parseInt(v);
            if (!isNaN(num) && num >= 0 && num < 100) {
                numbers.push(num);
            }
        });
    }

    return numbers;
}

/**
 * Map key thành category và subcategory cho predictNextInSequence
 */
function mapKeyToCategorySubcategory(key) {
    // Nếu key có dấu :, tách ra
    if (key.includes(':')) {
        return key.split(':');
    }

    // Các pattern đặc biệt
    const mappings = {
        // Các số
        'cacSoTienLienTiep': ['cacSo', 'tienLienTiep'],
        'cacSoTienDeuLienTiep': ['cacSo', 'tienDeuLienTiep'],
        'cacSoLuiLienTiep': ['cacSo', 'luiLienTiep'],
        'cacSoLuiDeuLienTiep': ['cacSo', 'luiDeuLienTiep'],
        'motSoVeLienTiep': ['motSo', 'veLienTiep'],
        'motSoVeSole': ['motSo', 'veSole'],
        'motSoVeSoleMoi': ['motSo', 'veSoleMoi'],
        'tienLuiSoLe': ['tienLuiSoLe', 'tienLuiSoLe'],
        'luiTienSoLe': ['luiTienSoLe', 'luiTienSoLe'],
        'capSoVeSoLe': ['capSo', 'veSoLe'],

        // Đầu
        'motDauVeLienTiep': ['motDau', 'veLienTiep'],
        'motDauVeSole': ['motDau', 'veSole'],
        'motDauVeSoleMoi': ['motDau', 'veSoleMoi'],
        'cacDauTien': ['cacDau', 'tienLienTiep'],
        'cacDauTienDeu': ['cacDau', 'tienDeuLienTiep'],
        'cacDauLui': ['cacDau', 'luiLienTiep'],
        'cacDauLuiDeu': ['cacDau', 'luiDeuLienTiep'],

        // Đít
        'motDitVeLienTiep': ['motDit', 'veLienTiep'],
        'motDitVeSole': ['motDit', 'veSole'],
        'motDitVeSoleMoi': ['motDit', 'veSoleMoi'],
        'cacDitTien': ['cacDit', 'tienLienTiep'],
        'cacDitTienDeu': ['cacDit', 'tienDeuLienTiep'],
        'cacDitLui': ['cacDit', 'luiLienTiep'],
        'cacDitLuiDeu': ['cacDit', 'luiDeuLienTiep'],

        // Chẵn/Lẻ
        'chanChan': ['chanChan', 'veLienTiep'],
        'chanLe': ['chanLe', 'veLienTiep'],
        'leChan': ['leChan', 'veLienTiep'],
        'leLe': ['leLe', 'veLienTiep']
    };

    if (mappings[key]) {
        return mappings[key];
    }

    // Đồng tiến
    if (key.startsWith('dau_dit_tien_')) {
        return [key, 'dongTien'];
    }
    if (key.startsWith('dau_dit_lui_')) {
        return [key, 'dongLui'];
    }

    // Tổng TT
    if (key.startsWith('tong_tt_')) {
        return [key, 'veLienTiep'];
    }

    // Tổng Mới
    if (key.startsWith('tong_moi_')) {
        return [key, 'veLienTiep'];
    }

    // Hiệu
    if (key.startsWith('hieu_')) {
        return [key, 'veLienTiep'];
    }

    // Đầu/Đít đơn
    if (key.startsWith('dau_')) {
        return [key, 'veLienTiep'];
    }
    if (key.startsWith('dit_')) {
        return [key, 'veLienTiep'];
    }

    // Mặc định
    return [key, key];
}

module.exports = {
    runBacktest,
    loadAllStats,
    findActiveStreaksAtDate
};
