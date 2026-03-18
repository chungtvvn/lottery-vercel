// services/simulationService.js
const { SETS, getTongTT, getHieu, getTongMoi } = require('../utils/numberAnalysis');
const lotteryService = require('./lotteryService');
const statisticsService = require('./statisticsService');
const suggestionsController = require('../controllers/suggestionsController');
const exclusionService = require('./exclusionService');

// --- CÀI ĐẶT CHIẾN LƯỢC ---
const BASE_BET = 10;    // 10.000 VND
const BET_STEP = 5;     // 5.000 VND
const NUM_COUNT = 25;   // Đánh 25 số
const WIN_RATE = 70;    // Tỷ lệ thắng

// --- HÀM TÍNH TOÁN (GẤP THẾP & LÃI LỖ) ---
function calculateBetAmount(totalLossSoFar) {
    let betAmount = BASE_BET;
    while (true) {
        const totalBetToday = NUM_COUNT * betAmount;
        const totalCostIfWin = totalLossSoFar + totalBetToday;
        const potentialWin = betAmount * WIN_RATE;
        if (potentialWin > totalCostIfWin) {
            return betAmount;
        }
        betAmount += BET_STEP;
    }
}

function calculateWinLoss(numbersToBet, winningNumber, betAmount, totalLossSoFar) {
    const totalBetToday = numbersToBet.length * betAmount;
    if (numbersToBet.includes(winningNumber)) {
        const winAmount = betAmount * WIN_RATE;
        const profit = winAmount - (totalBetToday + totalLossSoFar);
        return {
            isWin: true, profit: profit, winAmount: winAmount,
            totalBet: totalBetToday, totalLossToDate: 0
        };
    } else {
        const profit = -totalBetToday;
        return {
            isWin: false, profit: profit, winAmount: 0,
            totalBet: totalBetToday, totalLossToDate: totalLossSoFar + totalBetToday
        };
    }
}

// --- THUẬT TOÁN PHÂN TÍCH MỚI ---

// Xây dựng cache cho các thuộc tính số khi khởi động
const numberPropertiesCache = new Map();
function buildNumberPropertiesCache() {
    if (numberPropertiesCache.size > 0) return;
    const allSetKeys = Object.keys(SETS).filter(key =>
        !key.endsWith('_SEQUENCE') && !key.endsWith('_DIGITS') && key !== 'ALL' && key !== 'DIGITS'
    );
    for (let i = 0; i < 100; i++) {
        const numStr = i.toString().padStart(2, '0');
        const properties = [];
        for (const key of allSetKeys) {
            // Tối ưu: Chỉ cần kiểm tra xem key có trong SETS và SETS[key] có chứa numStr không
            if (SETS[key] && SETS[key].includes(numStr)) {
                properties.push(key);
            }
        }
        numberPropertiesCache.set(numStr, properties);
    }
    console.log('[SimulationService] Cache thuộc tính số đã được xây dựng.');
}

function getNumberProperties(numberString) {
    if (numberPropertiesCache.size === 0) {
        buildNumberPropertiesCache();
    }
    return numberPropertiesCache.get(numberString) || [];
}

/**
 * [MỚI] Thuật toán phân tích chuyên sâu
 */
function getCombinedSuggestions(historicalSpecials) {
    const numberStats = lotteryService.getNumberStats();
    const htStats = lotteryService.getHeadTailStats();
    const sdStats = lotteryService.getSumDiffStats();

    if (!numberStats || !htStats || !sdStats) {
        throw new Error('Một hoặc nhiều file thống kê chưa được tải (number_stats, head_tail_stats, sum_difference_stats).');
    }

    const numberScores = new Map();

    // 1. Lấy thuộc tính của ngày gần nhất làm "Tác nhân"
    const lastDayNumber = historicalSpecials[historicalSpecials.length - 1];
    const triggerProps = getNumberProperties(lastDayNumber);

    // 2. Chấm điểm cho từng số 00-99
    for (let i = 0; i < 100; i++) {
        const numStr = i.toString().padStart(2, '0');
        let finalScore = 0;
        let reasons = []; // Lưu lý do được cộng điểm

        // 2a. Lấy điểm cơ bản từ number_stats.json (tần suất)
        const baseStats = numberStats[numStr];
        if (baseStats) {
            finalScore += (baseStats.frequency || 0) * 10; // Tăng trọng số cho tần suất
            finalScore += (baseStats.daysSinceLast || 0); // Thưởng cho các số "gan"
        }

        // 2b. Lấy các thuộc tính của số đang xét
        const targetProps = getNumberProperties(numStr);

        // 2c. Tính điểm xu hướng (dựa trên tác nhân)
        for (const trigger of triggerProps) {
            // Tìm nguồn thống kê (head_tail_stats hoặc sum_difference_stats)
            const statSource = htStats[trigger.toLowerCase()] || sdStats[trigger.toLowerCase()];
            if (statSource && statSource.nextDayStats) {
                // Duyệt qua các thuộc tính của số đang xét (target)
                for (const target of targetProps) {
                    let weight = 0;
                    const targetKey = target.toLowerCase();

                    // Tìm trọng số tương ứng
                    if (statSource.nextDayStats.head && statSource.nextDayStats.head[targetKey]) {
                        weight = statSource.nextDayStats.head[targetKey];
                    } else if (statSource.nextDayStats.tail && statSource.nextDayStats.tail[targetKey]) {
                        weight = statSource.nextDayStats.tail[targetKey];
                    } else if (statSource.nextDayStats.sum && statSource.nextDayStats.sum[targetKey]) {
                        weight = statSource.nextDayStats.sum[targetKey];
                    } else if (statSource.nextDayStats.diff && statSource.nextDayStats.diff[targetKey]) {
                        weight = statSource.nextDayStats.diff[targetKey];
                    }

                    if (weight > 0) {
                        finalScore += weight; // Cộng điểm xu hướng
                        reasons.push(`${trigger} -> ${target} (${weight})`);
                    }
                }
            }
        }
        numberScores.set(numStr, { score: finalScore, reasons });
    }

    // 3. Sắp xếp và chọn 25 số
    const sortedNumbers = [...numberScores.entries()]
        .sort((a, b) => b[1].score - a[1].score) // Sắp xếp theo điểm từ cao đến thấp
        .map(entry => entry[0]);

    const topFactors = triggerProps.map(prop => [prop, 1]); // Hiển thị các tác nhân

    return {
        mostLikely: sortedNumbers, // Trả về danh sách đã sắp xếp (chưa cắt)
        analysisDetails: {
            topFactors: topFactors
        }
    };
}

// --- LOGIC LOẠI TRỪ (MỚI) ---
function calculateCurrentStreak(lotteryData, currentIndex, checkFn) {
    let streak = 0;
    // Duyệt ngược từ ngày hôm qua (currentIndex)
    for (let i = currentIndex; i >= 0; i--) {
        const val = lotteryData[i].special;
        if (checkFn(val)) {
            // Nếu ngày này thỏa mãn điều kiện (ví dụ: Đầu 0), streak dừng lại?
            // KHÔNG: "Streak" ở đây là "Gan" (số ngày CHƯA về).
            // Nếu gặp số thỏa mãn, nghĩa là nó ĐÃ về, vậy streak tính từ ngày đó đến nay là 0.
            // Nhưng logic exclusion đang dùng "Streak" là "Chuỗi ngày liên tiếp KHÔNG về" hay "Chuỗi ngày liên tiếp VỀ"?
            // À, logic exclusion trong suggestionsController là cho "veLienTiep" (Về liên tiếp).
            // Tức là: Chuỗi ngày liên tiếp mà Đầu 0 XUẤT HIỆN.

            // Vậy ta đếm số ngày liên tiếp thỏa mãn checkFn.
            streak++;
        } else {
            break; // Gặp ngày không thỏa mãn -> đứt chuỗi
        }
    }
    return streak;
}

function getExclusionsForDate(lotteryData, currentIndex, globalStats) {
    const excludedNumbers = new Set();

    // 1. Check DAU (0-9)
    for (let val = 0; val <= 9; val++) {
        const key = `dau_${val}`;
        if (globalStats[key] && globalStats[key].veLienTiep) {
            const currentLen = calculateCurrentStreak(lotteryData, currentIndex, (special) => Math.floor(special / 10) === val);
            if (currentLen > 0 && shouldExclude(currentLen, globalStats[key].veLienTiep)) {
                // Exclude all numbers with this Head
                for (let n = 0; n < 100; n++) {
                    if (Math.floor(n / 10) === val) excludedNumbers.add(n);
                }
            }
        }
    }

    // 2. Check DIT (0-9)
    for (let val = 0; val <= 9; val++) {
        const key = `dit_${val}`;
        if (globalStats[key] && globalStats[key].veLienTiep) {
            const currentLen = calculateCurrentStreak(lotteryData, currentIndex, (special) => special % 10 === val);
            if (currentLen > 0 && shouldExclude(currentLen, globalStats[key].veLienTiep)) {
                // Exclude all numbers with this Tail
                for (let n = 0; n < 100; n++) {
                    if (n % 10 === val) excludedNumbers.add(n);
                }
            }
        }
    }

    // 3. Check TONG_TT (1-10)
    for (let val = 1; val <= 10; val++) {
        const key = `tong_tt_${val}`;
        if (globalStats[key] && globalStats[key].veLienTiep) {
            const currentLen = calculateCurrentStreak(lotteryData, currentIndex, (special) => getTongTT(special) === val);
            if (currentLen > 0 && shouldExclude(currentLen, globalStats[key].veLienTiep)) {
                const nums = suggestionsController.getNumbersFromCategory(`tong_tt_${val}`);
                nums.forEach(n => excludedNumbers.add(n));
            }
        }
    }

    // 4. Check HIEU (0-9)
    for (let val = 0; val <= 9; val++) {
        const key = `hieu_${val}`;
        if (globalStats[key] && globalStats[key].veLienTiep) {
            const currentLen = calculateCurrentStreak(lotteryData, currentIndex, (special) => getHieu(special) === val);
            if (currentLen > 0 && shouldExclude(currentLen, globalStats[key].veLienTiep)) {
                const nums = suggestionsController.getNumbersFromCategory(`hieu_${val}`);
                nums.forEach(n => excludedNumbers.add(n));
            }
        }
    }

    // 5. Check Dong Tien / Dong Lui (dau_dit_tien_0 ... 9)
    for (let val = 0; val <= 9; val++) {
        const key = `dau_dit_tien_${val}`;
        if (globalStats[key]) {
            const p = { getVal: (n) => n }; // Dummy, logic handled below

            // Dong Tien (tienLienTiep)
            if (globalStats[key].tienLienTiep) {
                // Calculate streak: consecutive days where value is in set AND value > prevValue
                // Wait, calculateTrendStreak uses getValFn.
                // For Dong Tien sets, the values are specific numbers (e.g., 00, 11, 22...).
                // But we need to check if the *trend* is progressive within this set.
                // Actually, `tienLienTiep` in statistics means "Progressive Sequence within the set".
                // So we check if recent days form a progressive sequence in this set.

                // We need to check if the *current* sequence ending at currentIndex is a progressive sequence in this set.
                const setKey = `DAU_DIT_TIEN_${val}`;
                const set = SETS[setKey];
                if (set) {
                    const currentLen = exclusionService.calculateTrendStreak(lotteryData, currentIndex, (n) => n, (curr, prev) => {
                        // Check if both are in set AND curr > prev
                        return set.includes(curr.toString().padStart(2, '0')) &&
                            set.includes(prev.toString().padStart(2, '0')) &&
                            curr > prev;
                    });

                    if (currentLen > 0 && shouldExclude(currentLen, globalStats[key].tienLienTiep)) {
                        // Exclude numbers > lastValue in this set
                        const lastVal = lotteryData[currentIndex].special;
                        set.forEach(s => {
                            const n = parseInt(s, 10);
                            if (n > lastVal) excludedNumbers.add(n);
                        });
                    }
                }
            }

            // Dong Lui (luiLienTiep)
            if (globalStats[key].luiLienTiep) {
                const setKey = `DAU_DIT_TIEN_${val}`;
                const set = SETS[setKey];
                if (set) {
                    const currentLen = exclusionService.calculateTrendStreak(lotteryData, currentIndex, (n) => n, (curr, prev) => {
                        return set.includes(curr.toString().padStart(2, '0')) &&
                            set.includes(prev.toString().padStart(2, '0')) &&
                            curr < prev;
                    });

                    if (currentLen > 0 && shouldExclude(currentLen, globalStats[key].luiLienTiep)) {
                        // Exclude numbers < lastValue in this set
                        const lastVal = lotteryData[currentIndex].special;
                        set.forEach(s => {
                            const n = parseInt(s, 10);
                            if (n < lastVal) excludedNumbers.add(n);
                        });
                    }
                }
            }
        }
    }

    return excludedNumbers;
}

function shouldExclude(currentLen, statsData) {
    const targetLen = currentLen + 1;
    const gapInfo = statsData.gapStats ? statsData.gapStats[targetLen] : null;
    const recordLen = statsData.longest && statsData.longest.length > 0 ? statsData.longest[0].length : 0;

    // Check if reached record
    if (currentLen >= recordLen && recordLen > 0) return true;

    // Check if lastGap < minGap (no buffer, 0%)
    if (gapInfo && gapInfo.minGap !== null && gapInfo.lastGap < gapInfo.minGap) return true;

    return false;
}

/**
 * Parse date from dd/mm/yyyy format to Date object
 */
function parseDateDDMMYYYY(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

/**
 * Filter stats to only include streaks that ended before a given date
 * This simulates having only historical data up to that point
 */
function filterStatsBeforeDate(globalStats, targetDateISO) {
    const targetDate = new Date(targetDateISO);
    const filteredStats = {};

    for (const key in globalStats) {
        const categoryData = globalStats[key];

        if (!categoryData || !categoryData.streaks) {
            filteredStats[key] = categoryData;
            continue;
        }

        // Filter streaks to only those that ended before targetDate
        const filteredStreaks = categoryData.streaks.filter(streak => {
            if (!streak.endDate) return false;
            const endDate = parseDateDDMMYYYY(streak.endDate);
            if (!endDate) return false;
            return endDate < targetDate;
        });

        filteredStats[key] = {
            ...categoryData,
            streaks: filteredStreaks,
            current: (categoryData.current && categoryData.current.endDate)
                ? (parseDateDDMMYYYY(categoryData.current.endDate) < targetDate ? categoryData.current : null)
                : null
        };
    }

    return filteredStats;
}


async function runProgressiveSimulation(options, lotteryData) {
    const { simulationDays: days } = options;
    if (!days) throw new Error('Thiếu Số ngày mô phỏng.');
    if (!lotteryData || lotteryData.length === 0) throw new Error('Không có dữ liệu.');

    // [MỚI] Lấy thống kê toàn cục để dùng cho việc loại trừ
    const globalStats = await statisticsService.getStatsData();

    // === LOGIC MỚI: LOẠI TRỪ & GẤP THẾP THEO LÃI ===
    let currentStake = 10000; // Khởi điểm 10k
    let sessionProfit = 0; // Lãi/Lỗ của chu kỳ hiện tại
    let totalProfit = 0;
    let totalCost = 0;
    let totalRevenue = 0;
    let winCount = 0;
    let totalDaysPlayed = 0;

    const results = [];

    // Chạy mô phỏng từng ngày
    // Bắt đầu từ ngày (total - days) đến ngày cuối cùng
    const startIndex = lotteryData.length - days;

    for (let i = startIndex; i < lotteryData.length; i++) {
        const todayData = lotteryData[i];
        const special = parseInt(todayData.special, 10);

        // QUAN TRỌNG: Dùng historicalExclusionService để tính exclusion chính xác tại thời điểm ngày hôm đó
        // Nó sẽ lọc streaks history và tái tạo lại Live stats của riêng ngày i
        const { getExclusionsForDateCached } = require('./historicalExclusionService');
        const lotteryServiceForYears = require('@/lib/services/lotteryService');
        const totalYears = lotteryServiceForYears.getTotalYears();
        
        const exclusionResult = getExclusionsForDateCached(todayData.date, totalYears);

        // Theo yêu cầu "exclusion và exclusion+ tương tự trong distribution"
        // Ta mặc định dùng Exclusion (toBet4 - logic loại trừ đầy đủ mốc Kỷ Lục giống Distribution).
        // Nếu user muốn Exclusion+ (chỉ đánh khi đạt kỷ lục) thì dùng toBetPlus.
        // Trên Frontend distribution hiện đánh giá cao Exclusion+ hơn. Ta dùng toBetPlus làm progressive betting?
        // Wait, old Node.JS used `excluded4` (Exclusion) as default for progressive.
        
        const excludedNumbers = new Set(exclusionResult.excluded); // Standard Exclusion
        const excludedNumbersPlus = new Set(exclusionResult.excludedPlus); // Exclusion+

        // 2. Xác định các số sẽ đánh (Exclusion cơ bản)
        const allNumbers = Array.from({ length: 100 }, (_, k) => k);
        let numbersBet = allNumbers.filter(n => !excludedNumbers.has(n));
        let numbersBetPlus = allNumbers.filter(n => !excludedNumbersPlus.has(n));

        // 3. Kiểm tra điều kiện chơi
        let isSkipped = exclusionResult.skipped;
        
        // Nếu dùng Exclusion+ (smart) thì lấy từ toBetPlus
        // let's stick to standard Exclusion for progressive backtest, or use options to toggle.
        if (options.useExclusionPlus) {
            numbersBet = numbersBetPlus;
            isSkipped = exclusionResult.skippedPlus;
        }

        // 4. Tính toán tài chính
        let dailyCost = 0;
        let dailyRevenue = 0;
        let isWin = false;

        if (!isSkipped) {
            dailyCost = numbersBet.length * currentStake;

            if (numbersBet.includes(special)) {
                dailyRevenue = 70 * currentStake; // Ăn 1:70
                isWin = true;
                winCount++;
            }

            totalDaysPlayed++;
        }

        const dailyProfit = dailyRevenue - dailyCost;

        // Cập nhật tổng
        totalCost += dailyCost;
        totalRevenue += dailyRevenue;
        totalProfit += dailyProfit;

        // Cập nhật session profit
        sessionProfit += dailyProfit;

        // 5. Điều chỉnh mức cược (Progressive)
        // Nếu đã có lãi trong session -> Reset
        if (sessionProfit > 0) {
            currentStake = 10000;
            sessionProfit = 0; // Reset session mới
        } else {
            // Nếu chưa có lãi (hoặc lỗ) -> Tăng cược
            // Chỉ tăng nếu ngày hôm nay CÓ CHƠI (skipped days don't trigger stake increase usually, 
            // but logic says "đến khi có lãi", so we keep the debt. 
            // If we skipped, we didn't lose more, so stake remains same? 
            // Or should we increase? User said "vẫn đánh... đến khi có lãi". 
            // If skipped, we can't "đánh". So we keep state.
            if (!isSkipped) {
                currentStake += 5000;
            }
        }

        results.push({
            date: todayData.date,
            special: todayData.special,
            numbersBet: isSkipped ? [] : numbersBet,
            excludedCount: options.useExclusionPlus ? excludedNumbersPlus.size : excludedNumbers.size,
            isSkipped,
            isWin,
            stake: isSkipped ? 0 : currentStake, // Hiển thị mức cược (nếu chơi)
            cost: dailyCost,
            revenue: dailyRevenue,
            profit: dailyProfit,
            sessionProfit: sessionProfit, // Để debug
            totalProfit: totalProfit
        });
    }

    return {
        summary: {
            days: days,
            playedDays: totalDaysPlayed,
            winCount: winCount,
            winRate: totalDaysPlayed > 0 ? ((winCount / totalDaysPlayed) * 100).toFixed(2) : 0,
            totalCost,
            totalRevenue,
            totalProfit,
            roi: totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(2) : 0
        },
        details: results.reverse() // Mới nhất lên đầu
    };
}

module.exports = {
    calculateBetAmount,
    calculateWinLoss,
    runProgressiveSimulation,
    getExclusionsForDate: exclusionService.getSmartExclusions
};