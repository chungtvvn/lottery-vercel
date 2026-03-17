// services/futureSimulationService.js
// Dịch vụ giả lập kết quả tương lai - Realistic Mode

const fs = require('fs');
const path = require('path');
const historicalExclusionSvc = require('./historicalExclusionService');
const lotteryService = require('./lotteryService');

class FutureSimulationService {
    constructor() {
        // Cấu hình tiền cược
        this.BET_AMOUNT_PER_NUMBER = 10; // 10k/số
        this.WIN_MULTIPLIER = 70; // Thắng 70k nếu trúng 1 số với 10k
    }

    // Đọc dữ liệu lịch sử
    getHistoricalData() {
        try {
            const data = lotteryService.getRawData();
            return data || [];
        } catch (error) {
            console.error('Error reading historical data:', error);
            return [];
        }
    }

    // Sinh 1 số ngẫu nhiên duy nhất cho mỗi ngày (như thực tế xổ số)
    generateDailyWinningNumber() {
        return Math.floor(Math.random() * 100);
    }

    // Helper: Lấy giải đặc biệt từ một ngày (ưu tiên special > winningNumber > lo2so[0])
    getSpecialNumber(day) {
        if (day.special !== undefined) return day.special;
        if (day.winningNumber !== undefined) return day.winningNumber;
        if (day.lo2so && day.lo2so.length > 0) return day.lo2so[0];
        return null;
    }

    // Helper: Lấy Tổng Thập Thể (1-10)
    getTongTT(num) {
        const tong = Math.floor(num / 10) + (num % 10);
        return tong === 0 ? 10 : (tong > 10 ? tong - 10 : tong);
    }

    // Helper: Lấy Hiệu (0-9)
    getHieu(num) {
        return Math.abs(Math.floor(num / 10) - (num % 10));
    }

    // Helper: Lấy các số thuộc một dạng
    getNumbersForCategory(category, value) {
        const numbers = [];
        for (let i = 0; i < 100; i++) {
            if (category === 'dau' && Math.floor(i / 10) === value) numbers.push(i);
            else if (category === 'dit' && i % 10 === value) numbers.push(i);
            else if (category === 'tong' && this.getTongTT(i) === value) numbers.push(i);
            else if (category === 'hieu' && this.getHieu(i) === value) numbers.push(i);
        }
        return numbers;
    }

    // Helper: Tính chuỗi liên tiếp dựa trên giải đặc biệt (special)
    calculateStreakFromSpecial(data, checkFn) {
        let streak = 0;
        for (let i = data.length - 1; i >= 0; i--) {
            const special = this.getSpecialNumber(data[i]);
            if (special !== null && checkFn(special)) {
                streak++;
            } else {
                break;
            }
        }
        return streak;
    }

    // Helper: Tính gap cho mỗi số từ giải đặc biệt
    calculateGapFromSpecial(data) {
        const gapMap = new Map();
        for (let i = 0; i < 100; i++) gapMap.set(i, 100);

        for (let dayIndex = data.length - 1; dayIndex >= 0; dayIndex--) {
            const special = this.getSpecialNumber(data[dayIndex]);
            if (special !== null && gapMap.get(special) === 100) {
                gapMap.set(special, data.length - 1 - dayIndex);
            }
        }
        return gapMap;
    }

    // Helper: Tính thống kê gap cho một dạng số (avgGap, minGap)
    calculateCategoryGapStats(data, category, value) {
        const checkFn = (num) => {
            if (category === 'dau') return Math.floor(num / 10) === value;
            if (category === 'dit') return num % 10 === value;
            if (category === 'tong') return this.getTongTT(num) === value;
            if (category === 'hieu') return this.getHieu(num) === value;
            return false;
        };

        // Tìm tất cả các chuỗi trong lịch sử
        const gaps = [];
        let lastAppearance = -1;

        for (let i = 0; i < data.length; i++) {
            const special = this.getSpecialNumber(data[i]);

            if (special !== null && checkFn(special)) {
                if (lastAppearance >= 0) {
                    gaps.push(i - lastAppearance);
                }
                lastAppearance = i;
            }
        }

        if (gaps.length === 0) return { avgGap: 100, minGap: 100, count: 0 };

        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const minGap = Math.min(...gaps);
        const lastGap = lastAppearance >= 0 ? data.length - 1 - lastAppearance : 100;

        return { avgGap, minGap, lastGap, count: gaps.length };
    }

    exclusionMethod(historicalData) {
        const recentData = historicalData.slice(-60); // 60 ngày gần nhất (giảm để nhạy hơn)
        const excluded = new Set();
        const streakInfo = [];

        // Tính gap cho mỗi số từ giải đặc biệt
        const gapMap = this.calculateGapFromSpecial(recentData);

        // ===== BƯỚC 0: LOẠI SỐ VỪA VỀ GẦN ĐÂY (gap 0-2) =====
        // Điều này tạo sự thay đổi rõ ràng mỗi ngày
        for (let num = 0; num < 100; num++) {
            const gap = gapMap.get(num);
            if (gap <= 2) { // Số về trong 3 ngày gần nhất -> loại
                excluded.add(num);
                streakInfo.push({ type: `Gap ${gap} (vừa về)`, num });
            }
        }

        // ===== BƯỚC 1: Kiểm tra chuỗi ĐẦU về liên tiếp =====
        for (let val = 0; val <= 9; val++) {
            const streak = this.calculateStreakFromSpecial(recentData, n => Math.floor(n / 10) === val);
            const gapStats = this.calculateCategoryGapStats(recentData, 'dau', val);

            // Loại trừ nếu: có chuỗi >= 1 VÀ lastGap < avgGap (đang trong chu kỳ)
            if (streak >= 1 && gapStats.lastGap !== undefined && gapStats.lastGap < gapStats.avgGap) {
                const nums = this.getNumbersForCategory('dau', val);
                // Loại số có gap thấp (vừa về gần đây trong dạng này)
                nums.filter(n => gapMap.get(n) < gapStats.avgGap)
                    .forEach(n => {
                        excluded.add(n);
                        streakInfo.push({ type: `Đầu ${val} chuỗi`, streak, num: n });
                    });
            }
        }

        // ===== BƯỚC 2: Kiểm tra chuỗi ĐÍT về liên tiếp =====
        for (let val = 0; val <= 9; val++) {
            const streak = this.calculateStreakFromSpecial(recentData, n => n % 10 === val);
            const gapStats = this.calculateCategoryGapStats(recentData, 'dit', val);

            if (streak >= 1 && gapStats.lastGap !== undefined && gapStats.lastGap < gapStats.avgGap) {
                const nums = this.getNumbersForCategory('dit', val);
                nums.filter(n => gapMap.get(n) < gapStats.avgGap)
                    .forEach(n => {
                        excluded.add(n);
                        streakInfo.push({ type: `Đít ${val} chuỗi`, streak, num: n });
                    });
            }
        }

        // ===== BƯỚC 3: Kiểm tra chuỗi TỔNG về liên tiếp =====
        for (let val = 1; val <= 10; val++) {
            const streak = this.calculateStreakFromSpecial(recentData, n => this.getTongTT(n) === val);
            const gapStats = this.calculateCategoryGapStats(recentData, 'tong', val);

            if (streak >= 1 && gapStats.lastGap !== undefined && gapStats.lastGap < gapStats.avgGap) {
                const nums = this.getNumbersForCategory('tong', val);
                nums.filter(n => gapMap.get(n) < gapStats.avgGap)
                    .forEach(n => {
                        excluded.add(n);
                        streakInfo.push({ type: `Tổng ${val} chuỗi`, streak, num: n });
                    });
            }
        }

        // ===== BƯỚC 4: Kiểm tra chuỗi HIỆU về liên tiếp =====
        for (let val = 0; val <= 9; val++) {
            const streak = this.calculateStreakFromSpecial(recentData, n => this.getHieu(n) === val);
            const gapStats = this.calculateCategoryGapStats(recentData, 'hieu', val);

            if (streak >= 1 && gapStats.lastGap !== undefined && gapStats.lastGap < gapStats.avgGap) {
                const nums = this.getNumbersForCategory('hieu', val);
                nums.filter(n => gapMap.get(n) < gapStats.avgGap)
                    .forEach(n => {
                        excluded.add(n);
                        streakInfo.push({ type: `Hiệu ${val} chuỗi`, streak, num: n });
                    });
            }
        }

        // ===== BƯỚC 5: Loại trừ số về liên tiếp (cùng 1 số) =====
        for (let num = 0; num < 100; num++) {
            const streak = this.calculateStreakFromSpecial(recentData, n => n === num);
            if (streak >= 2) {
                excluded.add(num);
                streakInfo.push({ type: `Số ${String(num).padStart(2, '0')} về liên tiếp`, streak, num });
            }
        }

        // ===== BƯỚC 6: Loại trừ từ gap (bổ sung để đủ mục tiêu) =====
        // Số đã loại từ chuỗi (bước 1-5)
        const excludedFromStreak = excluded.size;

        // Số loại trừ mục tiêu thay đổi: nếu chuỗi loại nhiều → target cao hơn
        // Cơ sở: 60 số, cộng thêm 50% số loại từ chuỗi
        const TARGET_EXCLUDED = Math.min(60 + Math.floor(excludedFromStreak * 0.5), 80);
        const remainingToExclude = TARGET_EXCLUDED - excluded.size;

        if (remainingToExclude > 0) {
            // Sắp xếp các số còn lại theo gap tăng dần (loại số gap thấp trước)
            const remaining = [];
            for (let i = 0; i < 100; i++) {
                if (!excluded.has(i)) {
                    remaining.push({ num: i, gap: gapMap.get(i) });
                }
            }
            remaining.sort((a, b) => a.gap - b.gap);

            // Loại thêm đủ số để đạt mục tiêu
            for (let i = 0; i < Math.min(remainingToExclude, remaining.length); i++) {
                const item = remaining[i];
                excluded.add(item.num);
                streakInfo.push({ type: `Gap thấp`, num: item.num, gap: item.gap });
            }
        }

        // ===== BƯỚC 7: Tính số đánh =====
        const toBet = [];
        for (let i = 0; i < 100; i++) {
            if (!excluded.has(i)) toBet.push(i);
        }

        // Sắp xếp theo gap giảm dần (lâu chưa về ưu tiên)
        toBet.sort((a, b) => gapMap.get(b) - gapMap.get(a));

        // Số đánh = số còn lại sau khi loại trừ
        // Bỏ logic ép đánh 20 số. Nếu bị loại hết 100 số, số đánh sẽ array rỗng.
        let finalToBet = toBet;

        return {
            toBet: finalToBet,
            excluded: Array.from(excluded),
            streakInfo
        };
    }

    /**
     * [MỚI] Phương pháp loại trừ dựa trên KỶ LỤC - Đồng bộ với suggestionsController
     * Logic: Tính chuỗi rolling từ historicalData → loại trừ nếu freq <= 1.5 lần/năm
     * Exclusion: loại 4 subTier (achieved + achievedSuper + threshold + superThreshold)
     * @param {Array} data - Dữ liệu lịch sử đến trước ngày cần dự đoán
     * @returns {{toBet: number[], excluded: number[], excludedPlus: number[]}}
     */
    exclusionByRecordMethod(data) {
        const totalYears = data.length / 365.25;
        const excluded4 = new Set(); // Exclusion: loại cả 4 subTier
        const excluded3 = new Set(); // Exclusion+: loại 3 subTier (bỏ threshold/cam)
        const MAX_BET = 65;

        // Hàm tính chuỗi liên tiếp của một điều kiện (rolling streak kết thúc tại data[data.length-1])
        const calcStreak = (checkFn) => {
            let streak = 0;
            for (let i = data.length - 1; i >= 0; i--) {
                const sp = this.getSpecialNumber(data[i]);
                if (sp !== null && checkFn(sp)) streak++;
                else break;
            }
            return streak;
        };

        // Hàm tính kỷ lục và tần suất từ lịch sử toàn bộ data
        const calcRecordAndFreq = (checkFn, targetLen) => {
            // Tìm tất cả các chuỗi đã xảy ra và độ dài lớn nhất
            let maxStreak = 0;
            let countExact = 0; // Số lần chuỗi đạt chính xác targetLen
            let i = 0;
            while (i < data.length) {
                const sp = this.getSpecialNumber(data[i]);
                if (sp !== null && checkFn(sp)) {
                    let len = 1;
                    while (i + len < data.length) {
                        const spNext = this.getSpecialNumber(data[i + len]);
                        if (spNext !== null && checkFn(spNext)) len++;
                        else break;
                    }
                    if (len > maxStreak) maxStreak = len;
                    if (len === targetLen) countExact++;
                    i += len;
                } else {
                    i++;
                }
            }
            const freqYear = totalYears > 0 ? countExact / totalYears : 0;
            return { maxStreak, freqYear };
        };

        // Hàm loại trừ các số cho một category
        const excludeCategory = (checkFn, getNumbersFn) => {
            const currentStreak = calcStreak(checkFn);
            if (currentStreak === 0) return;

            const targetLen = currentStreak + 1; // Nếu tiếp tục sẽ đạt targetLen
            const { maxStreak, freqYear } = calcRecordAndFreq(checkFn, targetLen);

            const isAchieved = currentStreak >= maxStreak && maxStreak > 0; // Đạt kỷ lục
            const isThreshold = freqYear <= 1.5; // Tới hạn (freq <= 1.5)
            const isSuper = freqYear <= 0.5;    // Siêu kỷ lục

            if (!isAchieved && !isThreshold) return; // Không đủ điều kiện loại trừ

            const nums = getNumbersFn();
            nums.forEach(n => {
                excluded4.add(n); // Exclusion: loại tất cả
                // Exclusion+: chỉ loại achieved + achievedSuper + superThreshold (KHÔNG threshold thường)
                if (isAchieved || isSuper) {
                    excluded3.add(n);
                }
            });
        };

        // 1. Kiểm tra ĐẦU (0-9): chuỗi đầu về liên tiếp
        for (let val = 0; val <= 9; val++) {
            excludeCategory(
                n => Math.floor(n / 10) === val,
                () => this.getNumbersForCategory('dau', val)
            );
        }

        // 2. Kiểm tra ĐÍT (0-9): chuỗi đít về liên tiếp
        for (let val = 0; val <= 9; val++) {
            excludeCategory(
                n => n % 10 === val,
                () => this.getNumbersForCategory('dit', val)
            );
        }

        // 3. Kiểm tra TỔNG TT (1-10): chuỗi tổng về liên tiếp
        for (let val = 1; val <= 10; val++) {
            excludeCategory(
                n => this.getTongTT(n) === val,
                () => this.getNumbersForCategory('tong', val)
            );
        }

        // 4. Kiểm tra HIỆU (0-9): chuỗi hiệu về liên tiếp
        for (let val = 0; val <= 9; val++) {
            excludeCategory(
                n => this.getHieu(n) === val,
                () => this.getNumbersForCategory('hieu', val)
            );
        }

        // 5. Kiểm tra 1 SỐ cụ thể (00-99): số về liên tiếp
        for (let num = 0; num < 100; num++) {
            excludeCategory(
                n => n === num,
                () => [num]
            );
        }

        // 6. Kiểm tra CHẴN/LẺ (veSole)
        excludeCategory(
            n => n % 2 === 0, // Số chẵn về liên tiếp
            () => Array.from({ length: 50 }, (_, i) => i * 2) // 00,02,04...98
        );
        excludeCategory(
            n => n % 2 === 1, // Số lẻ về liên tiếp
            () => Array.from({ length: 50 }, (_, i) => i * 2 + 1) // 01,03,05...99
        );

        // 7. Kiểm tra ĐẦU chẵn/đầu lẻ liên tiếp
        excludeCategory(
            n => Math.floor(n / 10) % 2 === 0, // Đầu chẵn (0,2,4,6,8x)
            () => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89]
        );
        excludeCategory(
            n => Math.floor(n / 10) % 2 === 1, // Đầu lẻ (1,3,5,7,9x)
            () => [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99]
        );

        // 8. Kiểm tra ĐÍT chẵn/đít lẻ liên tiếp
        excludeCategory(
            n => n % 10 % 2 === 0, // Đít chẵn
            () => [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90, 92, 94, 96, 98]
        );
        excludeCategory(
            n => n % 10 % 2 === 1, // Đít lẻ
            () => [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53, 55, 57, 59, 61, 63, 65, 67, 69, 71, 73, 75, 77, 79, 81, 83, 85, 87, 89, 91, 93, 95, 97, 99]
        );

        // Tính số đánh Exclusion (loại 4 subTier)
        let toBet4 = [];
        for (let i = 0; i < 100; i++) {
            if (!excluded4.has(i)) toBet4.push(i);
        }

        // Tính số đánh Exclusion+ (loại 3 subTier)
        let toBet3 = [];
        for (let i = 0; i < 100; i++) {
            if (!excluded3.has(i)) toBet3.push(i);
        }

        // Áp dụng giới hạn 65 số: nếu > 65 thì skip (trả về mảng rỗng)
        const finalToBet4 = toBet4.length <= MAX_BET ? toBet4 : [];
        const finalToBet3 = toBet3.length <= MAX_BET ? toBet3 : [];

        return {
            toBet: finalToBet4,          // Exclusion
            toBetPlus: finalToBet3,      // Exclusion+
            excluded: Array.from(excluded4),
            excludedPlus: Array.from(excluded3),
            skipped: toBet4.length > MAX_BET,
            skippedPlus: toBet3.length > MAX_BET
        };
    }



    // Phương pháp Unified (Gap + Tần suất + Chu kỳ)
    unifiedMethod(historicalData) {
        const recentData = historicalData.slice(-60);
        const gapMap = new Map();
        const freqMap = new Map();
        const cycleMap = new Map(); // Theo dõi chu kỳ xuất hiện

        for (let i = 0; i < 100; i++) {
            gapMap.set(i, 100);
            freqMap.set(i, 0);
            cycleMap.set(i, []);
        }

        // Tính gap, tần suất và chu kỳ từ GIẢI ĐẶC BIỆT
        for (let dayIndex = recentData.length - 1; dayIndex >= 0; dayIndex--) {
            const special = this.getSpecialNumber(recentData[dayIndex]);
            if (special === null) continue;

            const currentGap = gapMap.get(special);
            if (currentGap === 100) {
                gapMap.set(special, recentData.length - 1 - dayIndex);
            } else if (cycleMap.get(special).length < 3) {
                // Lưu chu kỳ (khoảng cách giữa các lần xuất hiện)
                cycleMap.get(special).push(recentData.length - 1 - dayIndex);
            }
            freqMap.set(special, freqMap.get(special) + 1);
        }

        // Tính điểm: ưu tiên số có tần suất cao + gap vừa phải (5-15)
        const scores = new Map();
        for (let i = 0; i < 100; i++) {
            const gap = gapMap.get(i);
            const freq = freqMap.get(i);

            // Điểm dựa vào: tần suất * 3 + gap bonus (gap 8-15 được ưu tiên)
            let gapBonus = 0;
            if (gap >= 8 && gap <= 15) gapBonus = 30;
            else if (gap >= 5 && gap < 8) gapBonus = 20;
            else if (gap > 15 && gap <= 25) gapBonus = 10;

            scores.set(i, freq * 3 + gapBonus + Math.random() * 5);
        }

        const sortedByScore = Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);

        return {
            toBet: sortedByScore.slice(0, 10),
            excluded: sortedByScore.slice(90)
        };
    }

    // Phương pháp Advanced (Pattern + Gap + Cycle)
    advancedMethod(historicalData) {
        const recentData = historicalData.slice(-90);
        const scores = new Map();

        for (let i = 0; i < 100; i++) {
            scores.set(i, 0);
        }

        // Phân tích pattern (số đầu/đít) từ GIẢI ĐẶC BIỆT
        const last10 = recentData.slice(-10);
        const dauPattern = new Set();
        const ditPattern = new Set();

        last10.forEach(day => {
            const special = this.getSpecialNumber(day);
            if (special !== null) {
                dauPattern.add(Math.floor(special / 10));
                ditPattern.add(special % 10);
            }
        });

        // Cho điểm các số có đầu/đít khác với pattern gần đây
        for (let i = 0; i < 100; i++) {
            const dau = Math.floor(i / 10);
            const dit = i % 10;

            if (!dauPattern.has(dau)) scores.set(i, scores.get(i) + 20);
            if (!ditPattern.has(dit)) scores.set(i, scores.get(i) + 20);

            // Random factor để đa dạng hóa
            scores.set(i, scores.get(i) + Math.random() * 30);
        }

        const sortedByScore = Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);

        return {
            toBet: sortedByScore.slice(0, 10),
            excluded: sortedByScore.slice(90)
        };
    }

    // Phương pháp Hybrid AI (Markov-like + Monte Carlo-like)
    hybridAIMethod(historicalData) {
        const recentData = historicalData.slice(-100);
        const scores = new Map();
        const transitionProb = new Map();

        for (let i = 0; i < 100; i++) {
            scores.set(i, 0);
        }

        // Giả lập Markov: số nào hay về sau số nào (từ GIẢI ĐẶC BIỆT)
        for (let i = 1; i < recentData.length; i++) {
            const prevSpecial = this.getSpecialNumber(recentData[i - 1]);
            const currSpecial = this.getSpecialNumber(recentData[i]);

            if (prevSpecial !== null && currSpecial !== null) {
                const key = `${prevSpecial}-${currSpecial}`;
                transitionProb.set(key, (transitionProb.get(key) || 0) + 1);
            }
        }

        // Tính xác suất cho ngày tiếp theo
        const lastDay = recentData[recentData.length - 1];
        const lastSpecial = this.getSpecialNumber(lastDay);

        if (lastSpecial !== null) {
            for (let i = 0; i < 100; i++) {
                const key = `${lastSpecial}-${i}`;
                scores.set(i, scores.get(i) + (transitionProb.get(key) || 0));
            }
        }

        // Monte Carlo factor
        for (let i = 0; i < 100; i++) {
            scores.set(i, scores.get(i) + Math.random() * 20);
        }

        const sortedByScore = Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .map(entry => entry[0]);

        return {
            toBet: sortedByScore.slice(0, 10),
            excluded: sortedByScore.slice(90)
        };
    }

    // Phương pháp Streak Continuation - đánh vào các số có khả năng tiếp tục chuỗi
    // Logic: Dựa trên quickStats từ statisticsService
    // Lưu ý: Phương pháp này cần gọi async, sẽ được gọi từ bên ngoài
    async streakContinuationMethod() {
        try {
            const streakService = require('./streakContinuationService');
            const result = await streakService.getStreakContinuationNumbers({ topCount: 30 });
            return {
                toBet: result.toBet,
                excluded: result.excluded,
                streakInfo: result.streakInfo
            };
        } catch (error) {
            console.error('[FutureSimulation] Lỗi Streak Continuation:', error.message);
            return {
                toBet: [],
                excluded: Array.from({ length: 100 }, (_, i) => i),
                streakInfo: []
            };
        }
    }

    // Phương pháp Combined (Tổng hợp 4 phương pháp: Exclusion + Unified + Advanced + Hybrid AI)
    // Logic mới: UNION của tất cả số từ 4 phương pháp
    combinedMethod(historicalData) {
        // Lấy dự đoán từ 4 phương pháp
        const exclusion = this.exclusionMethod(historicalData);
        const unified = this.unifiedMethod(historicalData);
        const advanced = this.advancedMethod(historicalData);
        const hybridAI = this.hybridAIMethod(historicalData);

        // Tạo set để lưu UNION của cả 4 phương pháp (BAO GỒM exclusion)
        const unionSet = new Set();

        // Thêm tất cả số từ 4 phương pháp vào union
        [exclusion, unified, advanced, hybridAI].forEach(method => {
            method.toBet.forEach(num => {
                unionSet.add(num);
            });
        });

        // toBet = UNION của 4 phương pháp
        const toBet = Array.from(unionSet).sort((a, b) => a - b);

        // Số loại trừ = số không có trong union
        const excludedSet = new Set();
        for (let i = 0; i < 100; i++) {
            if (!unionSet.has(i)) {
                excludedSet.add(i);
            }
        }

        return {
            toBet: toBet,
            excluded: Array.from(excludedSet),
            methodDetails: {
                exclusion: exclusion.toBet.length,
                unified: unified.toBet.length,
                advanced: advanced.toBet.length,
                hybridAI: hybridAI.toBet.length,
                combined: toBet.length
            }
        };
    }

    // Combined từ 4 predictions: Exclusion + Unified + Advanced + Hybrid AI
    // Logic mới: UNION của tất cả số từ 4 phương pháp
    combinedMethodFromPredictions(exclusion, unified, advanced, hybridAI) {
        // Tạo set để lưu UNION của cả 4 phương pháp (BAO GỒM exclusion)
        const unionSet = new Set();

        // Thêm tất cả số từ 4 phương pháp vào union
        [exclusion, unified, advanced, hybridAI].forEach(method => {
            method.toBet.forEach(num => {
                unionSet.add(num);
            });
        });

        // toBet = UNION của 4 phương pháp
        const toBet = Array.from(unionSet).sort((a, b) => a - b);

        // Số loại trừ = số không có trong union
        const excludedSet = new Set();
        for (let i = 0; i < 100; i++) {
            if (!unionSet.has(i)) {
                excludedSet.add(i);
            }
        }

        return {
            toBet: toBet,
            excluded: Array.from(excludedSet),
            methodDetails: {
                exclusion: exclusion.toBet.length,
                unified: unified.toBet.length,
                advanced: advanced.toBet.length,
                hybridAI: hybridAI.toBet.length,
                combined: toBet.length
            }
        };
    }

    // Tính tiền thắng/thua cho 1 ngày
    calculateDayProfit(prediction, winningNumber, betAmount = this.BET_AMOUNT_PER_NUMBER) {
        const numBets = prediction.toBet.length;
        const totalBet = numBets * betAmount;
        const isWin = prediction.toBet.includes(winningNumber);
        const winAmount = isWin ? betAmount * this.WIN_MULTIPLIER : 0;
        const profit = winAmount - totalBet;

        return {
            winningNumber,
            isWin,
            numBets,
            betAmount,
            totalBet,
            winAmount,
            profit,
            toBet: prediction.toBet,
            excluded: prediction.excluded
        };
    }

    // Chạy simulation cho khoảng thời gian với chiến lược gấp thếp
    async runSimulation(duration = 'week', initialBetAmount = 10, betStep = 5) {
        const days = {
            'week': 7,
            'month': 30,
            '3months': 90,
            'year': 365
        };

        const numDays = days[duration] || 7;
        const historicalData = this.getHistoricalData();

        // Clone dữ liệu để không ảnh hưởng dữ liệu gốc
        let simulatedHistory = [...historicalData];

        const results = [];
        const startDate = new Date();
        startDate.setDate(startDate.getDate() + 1);

        // Stats cho từng phương pháp - bao gồm mức cược hiện tại và tổng lỗ tích lũy
        const methodStats = {
            exclusion: {
                wins: 0, losses: 0, totalBet: 0, totalWin: 0, dailyProfits: [],
                currentBetAmount: initialBetAmount, // Mức cược hiện tại
                accumulatedLoss: 0, // Tổng lỗ tích lũy (cần bù)
                betHistory: [] // Lịch sử mức cược
            },
            unified: {
                wins: 0, losses: 0, totalBet: 0, totalWin: 0, dailyProfits: [],
                currentBetAmount: initialBetAmount,
                accumulatedLoss: 0,
                betHistory: []
            },
            advanced: {
                wins: 0, losses: 0, totalBet: 0, totalWin: 0, dailyProfits: [],
                currentBetAmount: initialBetAmount,
                accumulatedLoss: 0,
                betHistory: []
            },
            hybridAI: {
                wins: 0, losses: 0, totalBet: 0, totalWin: 0, dailyProfits: [],
                currentBetAmount: initialBetAmount,
                accumulatedLoss: 0,
                betHistory: []
            },
            combined: {
                wins: 0, losses: 0, totalBet: 0, totalWin: 0, dailyProfits: [],
                currentBetAmount: initialBetAmount,
                accumulatedLoss: 0,
                betHistory: []
            }
        };

        // Weekly/Monthly stats
        const weeklyStats = {};
        const monthlyStats = {};

        for (let i = 0; i < numDays; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(currentDate.getDate() + i);
            const dateStr = currentDate.toISOString().split('T')[0];

            // Week/Month key
            const weekNum = Math.floor(i / 7);
            const monthNum = Math.floor(i / 30);

            // Sinh 1 số duy nhất cho ngày này
            const winningNumber = this.generateDailyWinningNumber();

            // Tạo dự đoán cho ngày này - tính 4 phương pháp trước
            const exclusionPred = this.exclusionMethod(simulatedHistory);
            const unifiedPred = this.unifiedMethod(simulatedHistory);
            const advancedPred = this.advancedMethod(simulatedHistory);
            const hybridAIPred = this.hybridAIMethod(simulatedHistory);

            // Combined: sử dụng kết quả từ 4 phương pháp đã tính (không gọi lại)
            const combinedPred = this.combinedMethodFromPredictions(exclusionPred, unifiedPred, advancedPred, hybridAIPred);

            const predictions = {
                exclusion: exclusionPred,
                unified: unifiedPred,
                advanced: advancedPred,
                hybridAI: hybridAIPred,
                combined: combinedPred
            };

            const dayResults = {
                date: dateStr,
                dayIndex: i + 1,
                weekNum: weekNum + 1,
                monthNum: monthNum + 1,
                winningNumber: String(winningNumber).padStart(2, '0'),
                methods: {}
            };

            for (const [method, prediction] of Object.entries(predictions)) {
                const stats = methodStats[method];

                // Lấy mức cược cho ngày này (đã tính từ ngày trước)
                const todayBetAmount = stats.currentBetAmount;

                // Tính kết quả với mức cược hiện tại
                const result = this.calculateDayProfit(prediction, winningNumber, todayBetAmount);

                // Thêm thông tin mức cược vào kết quả
                result.betAmountUsed = todayBetAmount;
                dayResults.methods[method] = result;

                // Cập nhật stats
                if (result.isWin) {
                    stats.wins++;
                    // THẮNG: Reset về mức cược ban đầu và xóa tổng lỗ
                    stats.accumulatedLoss = 0;
                    stats.currentBetAmount = initialBetAmount;
                } else {
                    stats.losses++;
                    // THUA: Cộng dồn lỗ và tính mức cược mới để bù toàn bộ chuỗi thua
                    stats.accumulatedLoss += result.totalBet;

                    // Công thức tính mức cược để bù lỗ + có lãi:
                    // Lãi mỗi số nếu thắng = (70 - 40) * betAmount = 30 * betAmount
                    // Để bù (tổng lỗ + lãi mong muốn betStep*40), cần:
                    // betAmount = (accumulatedLoss + minProfit) / 30
                    // Làm tròn lên theo bước nhảy
                    const minProfit = betStep * 40; // Lãi tối thiểu mong muốn
                    const neededBetAmount = Math.ceil((stats.accumulatedLoss + minProfit) / 30);
                    // Làm tròn lên theo betStep
                    stats.currentBetAmount = Math.ceil(neededBetAmount / betStep) * betStep;
                    // Đảm bảo ít nhất = initialBetAmount
                    if (stats.currentBetAmount < initialBetAmount) {
                        stats.currentBetAmount = initialBetAmount;
                    }
                }

                // Lưu lịch sử mức cược
                stats.betHistory.push({
                    date: dateStr,
                    betAmount: todayBetAmount,
                    nextBetAmount: stats.currentBetAmount,
                    accumulatedLoss: stats.accumulatedLoss
                });

                stats.totalBet += result.totalBet;
                stats.totalWin += result.winAmount;
                stats.dailyProfits.push({
                    date: dateStr,
                    profit: result.profit,
                    betAmount: todayBetAmount,
                    cumulative: (stats.dailyProfits[stats.dailyProfits.length - 1]?.cumulative || 0) + result.profit
                });

                // Weekly stats
                if (!weeklyStats[weekNum]) weeklyStats[weekNum] = {};
                if (!weeklyStats[weekNum][method]) {
                    weeklyStats[weekNum][method] = { wins: 0, losses: 0, totalBet: 0, totalWin: 0, profit: 0 };
                }
                const ws = weeklyStats[weekNum][method];
                if (result.isWin) ws.wins++; else ws.losses++;
                ws.totalBet += result.totalBet;
                ws.totalWin += result.winAmount;
                ws.profit += result.profit;

                // Monthly stats
                if (!monthlyStats[monthNum]) monthlyStats[monthNum] = {};
                if (!monthlyStats[monthNum][method]) {
                    monthlyStats[monthNum][method] = { wins: 0, losses: 0, totalBet: 0, totalWin: 0, profit: 0 };
                }
                const ms = monthlyStats[monthNum][method];
                if (result.isWin) ms.wins++; else ms.losses++;
                ms.totalBet += result.totalBet;
                ms.totalWin += result.winAmount;
                ms.profit += result.profit;
            }

            results.push(dayResults);

            // Thêm số về vào lịch sử giả lập (với field special để các phương pháp sử dụng)
            simulatedHistory.push({
                date: dateStr,
                special: winningNumber, // Giải đặc biệt (như dữ liệu thực)
                lo2so: [winningNumber],
                winningNumber: winningNumber
            });
        }

        // Tính summary
        const summary = {};
        for (const [method, stats] of Object.entries(methodStats)) {
            const totalProfit = stats.totalWin - stats.totalBet;
            const maxBet = Math.max(...stats.betHistory.map(h => h.betAmount));
            const maxAccumulatedLoss = Math.max(...stats.betHistory.map(h => h.accumulatedLoss), 0);

            summary[method] = {
                totalDays: numDays,
                wins: stats.wins,
                losses: stats.losses,
                winRate: ((stats.wins / numDays) * 100).toFixed(1) + '%',
                totalBet: stats.totalBet,
                totalWin: stats.totalWin,
                totalProfit: totalProfit,
                roi: ((totalProfit / stats.totalBet) * 100).toFixed(2) + '%',
                avgDailyProfit: (totalProfit / numDays).toFixed(0),
                // Thông tin gấp thếp
                initialBetAmount: initialBetAmount,
                betStep: betStep,
                maxBetAmount: maxBet,
                maxAccumulatedLoss: maxAccumulatedLoss,
                finalBetAmount: stats.currentBetAmount,
                dailyProfits: stats.dailyProfits,
                betHistory: stats.betHistory
            };
        }

        // Chart data for frontend
        const chartData = {
            labels: results.map(r => r.date),
            winningNumbers: results.map(r => r.winningNumber),
            methods: {}
        };

        for (const method of Object.keys(methodStats)) {
            chartData.methods[method] = {
                dailyProfit: methodStats[method].dailyProfits.map(d => d.profit),
                cumulativeProfit: methodStats[method].dailyProfits.map(d => d.cumulative),
                betAmounts: methodStats[method].dailyProfits.map(d => d.betAmount),
                isWin: results.map(r => r.methods[method].isWin)
            };
        }

        return {
            duration,
            numDays,
            initialBetAmount,
            betStep,
            startDate: startDate.toISOString().split('T')[0],
            endDate: new Date(startDate.getTime() + (numDays - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            results: results.slice(0, 50), // Limit for response size
            summary,
            weeklyStats,
            monthlyStats,
            chartData,
            generatedAt: new Date().toISOString()
        };
    }

    /**
     * Backtest 3 phương pháp (Unified, Advanced, Hybrid AI) + Combined
     * trên dữ liệu lịch sử thực tế
     * @param {number} days - Số ngày backtest (mặc định 30)
     * @returns {Object} - Kết quả backtest chi tiết
     */
    runHistoricalBacktest(days = 30) {
        const historicalData = this.getHistoricalData();
        if (historicalData.length < days + 100) {
            return { error: 'Không đủ dữ liệu lịch sử' };
        }

        // Lấy dữ liệu từ ngày gần nhất trở về trước
        const endIndex = historicalData.length;
        const startIndex = endIndex - days;

        const results = {
            exclusion: { wins: 0, losses: 0, skips: 0, details: [] },
            exclusionPlus: { wins: 0, losses: 0, skips: 0, details: [] },
            unified: { wins: 0, losses: 0, details: [] },
            advanced: { wins: 0, losses: 0, details: [] },
            hybridAI: { wins: 0, losses: 0, details: [] },
            combined: { wins: 0, losses: 0, details: [] },
            consensus: { wins: 0, losses: 0, details: [] },
            smart5: { wins: 0, losses: 0, details: [] },
            smart10: { wins: 0, losses: 0, details: [] },
            smart15: { wins: 0, losses: 0, details: [] },
            smart20: { wins: 0, losses: 0, details: [] },
            smart: { wins: 0, losses: 0, details: [] },
            smart30: { wins: 0, losses: 0, details: [] }
        };

        for (let i = startIndex; i < endIndex; i++) {
            // Dữ liệu để dự đoán (không bao gồm ngày i)
            const dataForPrediction = historicalData.slice(0, i);

            // Kết quả thực tế của ngày i
            const actualDay = historicalData[i];
            const actualNumber = this.getSpecialNumber(actualDay);

            if (actualNumber === null) continue;

            // Format ngày
            const dateStr = actualDay.date ?
                new Date(actualDay.date).toLocaleDateString('vi-VN') :
                `Ngày ${i + 1}`;

            // ===== PHƯƠNG PHÁP MỚI: Exclusion & Exclusion+ theo Kỷ lục (dùng historicalExclusionService) =====
            // Format ngày i thành 'dd/mm/yyyy' để dùng với historicalExclusionService
            let targetDateDDMMYYYY;
            if (actualDay.date) {
                const d = new Date(actualDay.date);
                targetDateDDMMYYYY = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            } else {
                // Fallback: dùng exclusionByRecordMethod cũ
                const recordExclFb = this.exclusionByRecordMethod(dataForPrediction);
                targetDateDDMMYYYY = null;
            }

            let exclusionRecord, exclusionPlusRecord;
            if (targetDateDDMMYYYY) {
                const totalYears = lotteryService.getTotalYears();
                const excl = historicalExclusionSvc.getExclusionsForDateCached(targetDateDDMMYYYY, totalYears);
                exclusionRecord = { toBet: excl.toBet, excluded: excl.excluded, skipped: excl.skipped, totalBet: excl.totalBet4 };
                exclusionPlusRecord = { toBet: excl.toBetPlus, excluded: excl.excludedPlus, skipped: excl.skippedPlus, totalBet: excl.totalBet3 };
            } else {
                const recordExclFb = this.exclusionByRecordMethod(dataForPrediction);
                exclusionRecord = { toBet: recordExclFb.toBet, excluded: recordExclFb.excluded, skipped: recordExclFb.skipped, totalBet: recordExclFb.toBet.length };
                exclusionPlusRecord = { toBet: recordExclFb.toBetPlus, excluded: recordExclFb.excludedPlus, skipped: recordExclFb.skippedPlus, totalBet: recordExclFb.toBetPlus.length };
            }

            // Chạy 4 phương pháp cũ (giữ lại cho các method khác)
            const exclusion = exclusionRecord; // Dùng record method cho exclusion
            const unified = this.unifiedMethod(dataForPrediction);
            const advanced = this.advancedMethod(dataForPrediction);
            const hybridAI = this.hybridAIMethod(dataForPrediction);

            // Combined = UNION của 4 phương pháp (bao gồm Exclusion record)
            const combinedSet = new Set([
                ...exclusionRecord.toBet,
                ...unified.toBet,
                ...advanced.toBet,
                ...hybridAI.toBet
            ]);
            const combined = {
                toBet: Array.from(combinedSet).sort((a, b) => a - b)
            };

            // Consensus = Số xuất hiện trong ít nhất 2 phương pháp (trừ exclusion)
            const countMap = new Map();
            [unified.toBet, advanced.toBet, hybridAI.toBet].forEach(arr => {
                arr.forEach(num => {
                    countMap.set(num, (countMap.get(num) || 0) + 1);
                });
            });
            // Lọc số có trong ít nhất 2 phương pháp VÀ có trong exclusion record
            const consensusNumbers = [];
            for (const [num, count] of countMap) {
                if (count >= 2 && exclusionRecord.toBet.includes(num)) {
                    consensusNumbers.push(num);
                }
            }
            const consensus = {
                toBet: consensusNumbers.sort((a, b) => a - b)
            };

            // Smart = Top 25 số có điểm cao nhất từ tất cả phương pháp
            const scoreMap = new Map();
            // Điểm từ exclusion record: +3 (mạnh nhất)
            exclusionRecord.toBet.forEach((num, idx) => {
                const score = 3 + (exclusionRecord.toBet.length - idx) / (exclusionRecord.toBet.length || 1);
                scoreMap.set(num, (scoreMap.get(num) || 0) + score);
            });
            // Điểm từ unified/advanced/hybridAI: +1 mỗi cái
            [unified.toBet, advanced.toBet, hybridAI.toBet].forEach(arr => {
                arr.forEach((num, idx) => {
                    const score = 1 + (arr.length - idx) / (arr.length || 1);
                    scoreMap.set(num, (scoreMap.get(num) || 0) + score);
                });
            });
            // Sắp xếp theo điểm giảm dần
            const sortedByScore = Array.from(scoreMap.entries())
                .sort((a, b) => b[1] - a[1]);

            // Tạo các biến thể với số lượng khác nhau
            const smart5 = { toBet: sortedByScore.slice(0, 5).map(e => e[0]).sort((a, b) => a - b) };
            const smart10 = { toBet: sortedByScore.slice(0, 10).map(e => e[0]).sort((a, b) => a - b) };
            const smart15 = { toBet: sortedByScore.slice(0, 15).map(e => e[0]).sort((a, b) => a - b) };
            const smart20 = { toBet: sortedByScore.slice(0, 20).map(e => e[0]).sort((a, b) => a - b) };
            const smart = { toBet: sortedByScore.slice(0, 25).map(e => e[0]).sort((a, b) => a - b) };
            const smart30 = { toBet: sortedByScore.slice(0, 30).map(e => e[0]).sort((a, b) => a - b) };

            // Kiểm tra kết quả
            // Exclusion record: ngày skip không tính thắng/thua
            const exclusionRecordWin = !exclusionRecord.skipped && exclusionRecord.toBet.includes(actualNumber);
            const exclusionPlusRecordWin = !exclusionPlusRecord.skipped && exclusionPlusRecord.toBet.includes(actualNumber);
            const exclusionWin = exclusionRecordWin; // Alias
            const unifiedWin = unified.toBet.includes(actualNumber);
            const advancedWin = advanced.toBet.includes(actualNumber);
            const hybridAIWin = hybridAI.toBet.includes(actualNumber);
            const combinedWin = combined.toBet.includes(actualNumber);
            const consensusWin = consensus.toBet.includes(actualNumber);
            const smart5Win = smart5.toBet.includes(actualNumber);
            const smart10Win = smart10.toBet.includes(actualNumber);
            const smart15Win = smart15.toBet.includes(actualNumber);

            const smart20Win = smart20.toBet.includes(actualNumber);
            const smartWin = smart.toBet.includes(actualNumber);
            const smart30Win = smart30.toBet.includes(actualNumber);

            // Cập nhật thống kê
            // Exclusion record: ngày skip sẽ không tính vào wins/losses
            if (exclusionRecord.skipped) {
                results.exclusion.skips = (results.exclusion.skips || 0) + 1;
            } else if (exclusionRecordWin) {
                results.exclusion.wins++;
            } else {
                results.exclusion.losses++;
            }
            // Exclusion+ record
            if (exclusionPlusRecord.skipped) {
                results.exclusionPlus.skips = (results.exclusionPlus.skips || 0) + 1;
            } else if (exclusionPlusRecordWin) {
                results.exclusionPlus.wins++;
            } else {
                results.exclusionPlus.losses++;
            }
            if (unifiedWin) results.unified.wins++; else results.unified.losses++;
            if (advancedWin) results.advanced.wins++; else results.advanced.losses++;
            if (hybridAIWin) results.hybridAI.wins++; else results.hybridAI.losses++;
            if (combinedWin) results.combined.wins++; else results.combined.losses++;
            if (consensusWin) results.consensus.wins++; else results.consensus.losses++;
            if (smart5Win) results.smart5.wins++; else results.smart5.losses++;
            if (smart10Win) results.smart10.wins++; else results.smart10.losses++;
            if (smart15Win) results.smart15.wins++; else results.smart15.losses++;
            if (smart20Win) results.smart20.wins++; else results.smart20.losses++;
            if (smartWin) results.smart.wins++; else results.smart.losses++;
            if (smart30Win) results.smart30.wins++; else results.smart30.losses++;

            // Lưu chi tiết
            const detail = {
                date: dateStr,
                actualNumber: String(actualNumber).padStart(2, '0'),
                exclusion: {
                    count: exclusionRecord.totalBet || exclusionRecord.toBet.length,
                    win: exclusionRecordWin,
                    skipped: exclusionRecord.skipped,
                    numbers: exclusionRecord.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                },
                exclusionPlus: {
                    count: exclusionPlusRecord.totalBet || exclusionPlusRecord.toBet.length,
                    win: exclusionPlusRecordWin,
                    skipped: exclusionPlusRecord.skipped,
                    numbers: exclusionPlusRecord.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                },
                unified: {
                    count: unified.toBet.length,
                    win: unifiedWin,
                    numbers: unified.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                },
                advanced: {
                    count: advanced.toBet.length,
                    win: advancedWin,
                    numbers: advanced.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                },
                hybridAI: {
                    count: hybridAI.toBet.length,
                    win: hybridAIWin,
                    numbers: hybridAI.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                },
                combined: {
                    count: combined.toBet.length,
                    win: combinedWin,
                    numbers: combined.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                },
                consensus: {
                    count: consensus.toBet.length,
                    win: consensusWin,
                    numbers: consensus.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                },
                smart5: {
                    count: smart5.toBet.length,
                    win: smart5Win,
                    numbers: smart5.toBet.map(n => String(n).padStart(2, '0'))
                },
                smart10: {
                    count: smart10.toBet.length,
                    win: smart10Win,
                    numbers: smart10.toBet.map(n => String(n).padStart(2, '0'))
                },
                smart15: {
                    count: smart15.toBet.length,
                    win: smart15Win,
                    numbers: smart15.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                },
                smart20: {
                    count: smart20.toBet.length,
                    win: smart20Win,
                    numbers: smart20.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                },
                smart: {
                    count: smart.toBet.length,
                    win: smartWin,
                    numbers: smart.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                },
                smart30: {
                    count: smart30.toBet.length,
                    win: smart30Win,
                    numbers: smart30.toBet.slice(0, 10).map(n => String(n).padStart(2, '0'))
                }
            };

            results.exclusion.details.push(detail);
            results.exclusionPlus.details.push(detail);
            results.unified.details.push(detail);
            results.advanced.details.push(detail);
            results.hybridAI.details.push(detail);
            results.combined.details.push(detail);
            results.consensus.details.push(detail);
            results.smart5.details.push(detail);
            results.smart10.details.push(detail);
            results.smart15.details.push(detail);
            results.smart20.details.push(detail);
            results.smart.details.push(detail);
            results.smart30.details.push(detail);
        }

        // Tính tỷ lệ thắng
        const calcStats = (method) => {
            const total = method.wins + method.losses;
            const winRate = total > 0 ? (method.wins / total * 100).toFixed(1) : 0;
            const avgBets = method.details.length > 0
                ? Math.round(method.details.reduce((sum, d) => {
                    const methodKey = Object.keys(d).find(k => d[k] && d[k].count !== undefined && k !== 'date' && k !== 'actualNumber');
                    return sum;
                }, 0) / method.details.length)
                : 0;
            return { ...method, total, winRate };
        };

        // Tính lại average bets cho từng phương pháp
        // Chỉ tính trên ngày KHÔNG SKIP (loại ngày skip có count=0 khỏi averge)
        const calcAvgBets = (details, methodName) => {
            if (details.length === 0) return 0;
            // Exclusion và ExclusionPlus: chỉ tính ngày không skip
            const isExclusionMethod = methodName === 'exclusion' || methodName === 'exclusionPlus';
            let playedDetails;
            if (isExclusionMethod) {
                playedDetails = details.filter(d => d[methodName] && !d[methodName].skipped);
            } else {
                playedDetails = details;
            }
            if (playedDetails.length === 0) return 0;
            const sum = playedDetails.reduce((s, d) => s + (d[methodName]?.count || 0), 0);
            return Math.round(sum / playedDetails.length);
        };

        return {
            days,
            summary: {
                exclusion: {
                    wins: results.exclusion.wins,
                    losses: results.exclusion.losses,
                    skips: results.exclusion.skips || 0,
                    total: results.exclusion.wins + results.exclusion.losses,
                    winRate: (results.exclusion.wins + results.exclusion.losses) > 0
                        ? ((results.exclusion.wins / (results.exclusion.wins + results.exclusion.losses)) * 100).toFixed(1)
                        : '0.0',
                    avgBets: calcAvgBets(results.exclusion.details, 'exclusion')
                },
                exclusionPlus: {
                    wins: results.exclusionPlus.wins,
                    losses: results.exclusionPlus.losses,
                    skips: results.exclusionPlus.skips || 0,
                    total: results.exclusionPlus.wins + results.exclusionPlus.losses,
                    winRate: (results.exclusionPlus.wins + results.exclusionPlus.losses) > 0
                        ? ((results.exclusionPlus.wins / (results.exclusionPlus.wins + results.exclusionPlus.losses)) * 100).toFixed(1)
                        : '0.0',
                    avgBets: calcAvgBets(results.exclusionPlus.details, 'exclusionPlus')
                },
                unified: {
                    wins: results.unified.wins,
                    losses: results.unified.losses,
                    total: results.unified.wins + results.unified.losses,
                    winRate: ((results.unified.wins / (results.unified.wins + results.unified.losses)) * 100).toFixed(1),
                    avgBets: calcAvgBets(results.unified.details, 'unified')
                },
                advanced: {
                    wins: results.advanced.wins,
                    losses: results.advanced.losses,
                    total: results.advanced.wins + results.advanced.losses,
                    winRate: ((results.advanced.wins / (results.advanced.wins + results.advanced.losses)) * 100).toFixed(1),
                    avgBets: calcAvgBets(results.advanced.details, 'advanced')
                },
                hybridAI: {
                    wins: results.hybridAI.wins,
                    losses: results.hybridAI.losses,
                    total: results.hybridAI.wins + results.hybridAI.losses,
                    winRate: ((results.hybridAI.wins / (results.hybridAI.wins + results.hybridAI.losses)) * 100).toFixed(1),
                    avgBets: calcAvgBets(results.hybridAI.details, 'hybridAI')
                },
                combined: {
                    wins: results.combined.wins,
                    losses: results.combined.losses,
                    total: results.combined.wins + results.combined.losses,
                    winRate: ((results.combined.wins / (results.combined.wins + results.combined.losses)) * 100).toFixed(1),
                    avgBets: calcAvgBets(results.combined.details, 'combined')
                },
                consensus: {
                    wins: results.consensus.wins,
                    losses: results.consensus.losses,
                    total: results.consensus.wins + results.consensus.losses,
                    winRate: results.consensus.wins + results.consensus.losses > 0
                        ? ((results.consensus.wins / (results.consensus.wins + results.consensus.losses)) * 100).toFixed(1)
                        : '0.0',
                    avgBets: calcAvgBets(results.consensus.details, 'consensus')
                },
                smart5: {
                    wins: results.smart5.wins,
                    losses: results.smart5.losses,
                    total: results.smart5.wins + results.smart5.losses,
                    winRate: ((results.smart5.wins / (results.smart5.wins + results.smart5.losses)) * 100).toFixed(1),
                    avgBets: calcAvgBets(results.smart5.details, 'smart5')
                },
                smart10: {
                    wins: results.smart10.wins,
                    losses: results.smart10.losses,
                    total: results.smart10.wins + results.smart10.losses,
                    winRate: ((results.smart10.wins / (results.smart10.wins + results.smart10.losses)) * 100).toFixed(1),
                    avgBets: calcAvgBets(results.smart10.details, 'smart10')
                },
                smart15: {
                    wins: results.smart15.wins,
                    losses: results.smart15.losses,
                    total: results.smart15.wins + results.smart15.losses,
                    winRate: ((results.smart15.wins / (results.smart15.wins + results.smart15.losses)) * 100).toFixed(1),
                    avgBets: calcAvgBets(results.smart15.details, 'smart15')
                },
                smart20: {
                    wins: results.smart20.wins,
                    losses: results.smart20.losses,
                    total: results.smart20.wins + results.smart20.losses,
                    winRate: ((results.smart20.wins / (results.smart20.wins + results.smart20.losses)) * 100).toFixed(1),
                    avgBets: calcAvgBets(results.smart20.details, 'smart20')
                },
                smart: {
                    wins: results.smart.wins,
                    losses: results.smart.losses,
                    total: results.smart.wins + results.smart.losses,
                    winRate: ((results.smart.wins / (results.smart.wins + results.smart.losses)) * 100).toFixed(1),
                    avgBets: calcAvgBets(results.smart.details, 'smart')
                },
                smart30: {
                    wins: results.smart30.wins,
                    losses: results.smart30.losses,
                    total: results.smart30.wins + results.smart30.losses,
                    winRate: ((results.smart30.wins / (results.smart30.wins + results.smart30.losses)) * 100).toFixed(1),
                    avgBets: calcAvgBets(results.smart30.details, 'smart30')
                }
            },
            details: results.unified.details, // Tất cả đều chung detail
            generatedAt: new Date().toISOString()
        };
    }
}

module.exports = new FutureSimulationService();
