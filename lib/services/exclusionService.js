const statisticsService = require('./statisticsService');
const suggestionsController = require('../controllers/suggestionsController');
const { SETS, findNextInSet, findPreviousInSet, getTongTT, getTongMoi, getHieu, identifyCategories } = require('../utils/numberAnalysis');
const STATS_CONFIG = require('../config/stats-config');
const EXCLUSION_TIERS = require('../config/exclusion-tiers');
const exclusionLogic = require('./exclusionLogicService');

// Helper functions copied from suggestionsController






/**
 * Main function to get exclusions for a specific date
 * Uses getQuickStats() to ensure 100% alignment with suggestionsController
 */
async function getExclusions(lotteryData, currentIndex, globalStats, options = {}) {
    // Khởi tạo các danh sách loại trừ theo cấp độ (không còn light_orange)
    const exclusionsByTier = {
        red: new Set(),
        purple: new Set(),
        orange: new Set(),
        light_red: new Set()
    };

    // Pending orange patterns - will be processed after counting red+purple
    const pendingOrange = [];

    // Use getQuickStats() just like suggestionsController does
    // Note: globalStats passed here might be filtered historical stats, so we use it directly if provided.
    // However, the original code called statisticsService.getQuickStats().
    // If globalStats is provided (from simulation), we should use it.
    // But getQuickStats() format is different from getStatsData() format.
    // Wait, statisticsService.getQuickStats() calls getStatsData() internally and transforms it.
    // If globalStats is passed, it is likely the raw stats (getStatsData format).
    // We need to transform it to quickStats format if we want to use the same logic.
    // BUT, the current implementation of getExclusions calls statisticsService.getQuickStats() ignoring globalStats argument?
    // Let's check line 19 of original file.

    // Original: const quickStats = await statisticsService.getQuickStats();
    // This fetches LATEST stats. This is WRONG for simulation if we want historical test.
    // However, simulationService passes `historicalStats` as 3rd arg.
    // We should use it if available. But `getQuickStats` logic is complex (calculates gaps etc).
    // We cannot easily replicate `getQuickStats` transformation here without duplicating code.
    // Ideally, `statisticsService` should have `calculateQuickStats(statsData)`.

    // For now, to support simulation correctly, we must assume `globalStats` passed in IS `quickStats` format?
    // No, simulationService passes `filterStatsBeforeDate(globalStats)`. This returns stats in `getStatsData` format (with .streaks).
    // It does NOT return `quickStats` format (with .gapStats, .longest, etc pre-calculated).

    // This means `exclusionService` currently (before my edit) was using LIVE stats for simulation?
    // "const quickStats = await statisticsService.getQuickStats();" -> Yes, it was using LIVE stats!
    // This is a bug in simulation logic if we want backtesting.
    // But the user asked to fix the discrepancy between Statistics page (Live) and Simulation page (Live?).
    // If Simulation page is "Mô phỏng", it usually means backtesting.
    // But if the user is just checking "Simulation" tab which might be "Dự đoán" or similar?
    // No, "Simulation" is typically backtesting.

    // However, fixing the backtesting logic is out of scope for "Sync Exclusion Logic".
    // The user wants the counts to match.
    // If I change to use passed `globalStats`, I might break the sync if `globalStats` is not processed correctly.

    // Let's stick to the current behavior (using `getQuickStats()`) but apply the new logic.
    // If `options` are passed, we use them.

    const GAP_STRATEGY = options.gapStrategy || STATS_CONFIG.GAP_STRATEGY || 'COMBINED';
    const GAP_BUFFER_PERCENT = options.gapBuffer !== undefined ? parseFloat(options.gapBuffer) : (STATS_CONFIG.GAP_BUFFER_PERCENT !== undefined ? STATS_CONFIG.GAP_BUFFER_PERCENT : 0);

    const quickStats = await statisticsService.getQuickStats();

    for (const key in quickStats) {
        const stat = quickStats[key];

        // Skip if no current streak
        if (!stat.current) continue;

        const currentLen = stat.current.length;
        let category, subcategory;

        // Parse key - handle both formats:
        // Format 1: "category:subcategory" (e.g., "tong_tt_cac_tong:luiDeuLienTiep")
        // Format 2: "categorySubcategory" (e.g., "cacSoLuiDeuLienTiep", "cacDauLuiDeu")
        if (key.includes(':')) {
            [category, subcategory] = key.split(':');
        } else {
            // Extract subcategory from end of key
            const patterns = [
                'LuiDeuLienTiep', 'TienDeuLienTiep',
                'LuiLienTiep', 'TienLienTiep',
                'LuiDeu', 'TienDeu',
                'VeLienTiep', 'VeCungGiaTri', 'VeSole', 'VeSoleMoi',
                'DongTien', 'DongLui',
                'Lui', 'Tien' // Standalone patterns (must be last due to shorter length)
            ];

            for (const pattern of patterns) {
                if (key.endsWith(pattern)) {
                    subcategory = pattern.charAt(0).toLowerCase() + pattern.slice(1); // Convert to camelCase
                    category = key.slice(0, -pattern.length);
                    break;
                }
            }

            if (!subcategory) {
                // Special patterns without subcategory (e.g., tienLuiSoLe)
                category = key;
                subcategory = '';
            }
        }

        // Remove [TIỀM NĂNG] prefix if present
        if (category && category.startsWith('[TIỀM NĂNG] ')) {
            category = category.replace('[TIỀM NĂNG] ', '');
        }

        const isSoLePattern = (subcategory === 'veSole' || subcategory === 'veSoleMoi') && key !== 'tienLuiSoLe' && key !== 'luiTienSoLe';
        const isTrendPattern = subcategory === 'tienDeuLienTiep' || subcategory === 'luiDeuLienTiep' ||
            subcategory === 'tienLienTiep' || subcategory === 'luiLienTiep' ||
            subcategory === 'dongTien' || subcategory === 'dongLui' ||
            subcategory === 'tien' || subcategory === 'lui' ||
            subcategory === 'tienDeu' || subcategory === 'luiDeu';

        const targetLen = isSoLePattern ? currentLen + 2 : currentLen + 1;

        const gapInfoGE = stat.gapStats ? stat.gapStats[targetLen] : null;
        const gapInfoExact = stat.exactGapStats ? stat.exactGapStats[targetLen] : null;
        const extensionGapInfo = stat.extensionGapStats ? stat.extensionGapStats[currentLen] : null;
        const recordLen = stat.computedMaxStreak || stat.longest?.[0]?.length || 0;

        let shouldExclude = false;
        let tier = null; // 'red', 'light_red', 'orange', 'light_orange'

        const lotteryService = require('./lotteryService');
        const totalYears = lotteryService.getTotalYears();
        const targetCount = gapInfoExact ? gapInfoExact.count : 0;
        const targetFreqYear = targetCount / totalYears;

        // --- YÊU CẦU MỚI: Chỉ loại trừ khi đã đạt kỷ lục hoặc TỚI HẠN Kỷ lục (freq <= 1.5) ---
        const isSuper = targetFreqYear <= 0.5 || stat.isSuperMaxThreshold;

        if (targetFreqYear <= 1.5 || (currentLen >= recordLen && recordLen > 0)) {
            shouldExclude = true;
            // Đồng bộ với suggestionsController: phân biệt red vs purple
            if (currentLen >= recordLen && recordLen > 0) {
                // Đạt kỷ lục: siêu KL → purple, thường → red
                tier = isSuper ? 'purple' : 'red';
            } else if (isSuper) {
                // Tới hạn siêu kỷ lục → purple
                tier = 'purple';
            } else {
                // Tới hạn kỷ lục thường → red
                tier = 'red';
            }
        }

        // BỎ QUA KIỂM TRA GAP THEO YÊU CẦU MỚI "trước mắt sẽ chỉ loại trừ nếu đạt kỷ lục"
        // (Không thêm vào pendingOrange hay tier khác)

        // Only process RED and PURPLE tiers (đồng bộ với suggestionsController)
        if (shouldExclude && (tier === 'red' || tier === 'purple')) {
            // Resolve numbers using the same logic as suggestionsController
            let nums = [];

            if (isTrendPattern) {
                nums = suggestionsController.predictNextInSequence(stat, category, subcategory);
            }
            else if (subcategory === 'veLienTiep' || subcategory === 'veCungGiaTri') {
                // Standard repetition logic
                if (category === 'cacDau') {
                    // Lấy đầu từ giá trị cuối chuỗi
                    const lastVal = stat.current?.values?.[stat.current.values.length - 1] ?? stat.current?.value;
                    if (lastVal !== null && lastVal !== undefined) {
                        const dau = String(lastVal).padStart(2, '0')[0];
                        nums = Array.from({ length: 100 }, (_, i) => i)
                            .filter(n => String(n).padStart(2, '0')[0] === dau);
                    }
                } else if (category === 'cacDit') {
                    // Lấy đít từ giá trị cuối chuỗi
                    const lastVal = stat.current?.values?.[stat.current.values.length - 1] ?? stat.current?.value;
                    if (lastVal !== null && lastVal !== undefined) {
                        const dit = String(lastVal).padStart(2, '0')[1];
                        nums = Array.from({ length: 100 }, (_, i) => i)
                            .filter(n => String(n).padStart(2, '0')[1] === dit);
                    }
                } else if (category.startsWith('dau_')) {
                    const digit = category.split('_')[1];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[0] === digit);
                } else if (category.startsWith('dit_')) {
                    const digit = category.split('_')[1];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[1] === digit);
                } else if (category.startsWith('tong_tt_') || category.startsWith('tong_moi_') || category.startsWith('hieu_')) {
                    nums = suggestionsController.predictNextInSequence(stat, category, subcategory);
                    if (!nums || nums.length === 0) {
                        nums = suggestionsController.getNumbersFromCategory(category);
                    }
                } else {
                    nums = suggestionsController.getNumbersFromCategory(category);
                }
            }
            else if (subcategory === 'veSole' || subcategory === 'veSoleMoi') {
                // SoLe - lấy nhóm số theo đít/đầu của giá trị cuối trong chuỗi
                const lastVal = stat.current?.values?.[stat.current.values.length - 1] ?? stat.current?.value;
                if (lastVal !== null && lastVal !== undefined) {
                    const numStr = String(lastVal).padStart(2, '0');
                    if (category === 'cacDau') {
                        const dau = numStr[0];
                        nums = Array.from({ length: 100 }, (_, i) => i)
                            .filter(n => String(n).padStart(2, '0')[0] === dau);
                    } else if (category === 'cacDit') {
                        const dit = numStr[1];
                        nums = Array.from({ length: 100 }, (_, i) => i)
                            .filter(n => String(n).padStart(2, '0')[1] === dit);
                    } else {
                        nums = suggestionsController.getNumbersFromCategory(category);
                    }
                }
            }
            else if (category === 'tienLuiSoLe' || key === 'tienLuiSoLe' || category === 'luiTienSoLe' || key === 'luiTienSoLe') {
                if (stat.current.values && stat.current.values.length >= 2) {
                    const values = stat.current.values;
                    const lastValue = parseInt(values[values.length - 1], 10);
                    const prevValue = parseInt(values[values.length - 2], 10);
                    const isTien = lastValue > prevValue;
                    if (isTien) {
                        nums = Array.from({ length: 100 }, (_, i) => i).filter(n => n <= lastValue);
                    } else {
                        nums = Array.from({ length: 100 }, (_, i) => i).filter(n => n >= lastValue);
                    }
                }
            }
            // --- NEW: Handle Trend patterns for cac_tong ---
            else if (subcategory === 'luiLienTiep' || subcategory === 'tienLienTiep' ||
                subcategory === 'luiDeuLienTiep' || subcategory === 'tienDeuLienTiep') {
                // Check if it's a range-based sum pattern (e.g., tong_tt_7_9)
                if (/^(tong_tt_|tong_moi_|hieu_)\d+_\d+$/.test(category)) {
                    // Parse range from category name
                    const match = category.match(/^(tong_tt_|tong_moi_|hieu_)(\d+)_(\d+)$/);
                    if (match) {
                        nums = suggestionsController.predictNextInSequence(stat, category, subcategory);
                    }
                } else {
                    nums = suggestionsController.predictNextInSequence(stat, category, subcategory);
                }
            }
            else {
                // Get values from fullSequence
                const valuesToExclude = stat.current && stat.current.fullSequence
                    ? stat.current.fullSequence.filter(f => !f.isLatest).map(f => f.value)
                    : [];

                // FIRST: Try to get from predictNextInSequence for trend patterns
                if (isTrendPattern) {
                    nums = suggestionsController.predictNextInSequence(stat, category, subcategory);
                }
                // SECOND: Try to get from category
                else if (valuesToExclude.length > 0) {
                    const tempNums = suggestionsController.getNumbersFromCategory(category);
                    if (tempNums && tempNums.length > 0) {
                        nums = tempNums;
                    } else {
                        nums = valuesToExclude.map(v => parseInt(v, 10));
                    }
                }
                // THIRD: Fallback
                else {
                    nums = valuesToExclude.map(v => parseInt(v, 10));
                }
            }

            // Fallback if still empty
            if (!nums || nums.length === 0) {
                nums = suggestionsController.getNumbersFromCategory(category);
            }

            // Filter out null, undefined, and NaN values (CRITICAL - matches suggestionsController)
            if (nums && nums.length > 0) {
                // Allow strings, convert to numbers later
                nums = nums.filter(n => n !== null && n !== undefined && !isNaN(n));
            }

            if (nums && nums.length > 0) {
                nums.forEach(n => exclusionsByTier[tier].add(parseInt(n, 10)));
            }
        }
    }

    // --- NEW: Process Potential Streaks (Patterns with record = 2) ---
    // Kiểm tra các pattern có kỷ lục 2 ngày mà số mới nhất có thể trigger
    const recentResults = await statisticsService.getRecentResults(1);
    if (recentResults && recentResults.length > 0) {
        const latestNumber = String(recentResults[0].special).padStart(2, '0');
        const latestCategories = identifyCategories(latestNumber);

        // Các subcategories cần kiểm tra
        const subcategoriesToCheck = [
            'veLienTiep',
            'tienLienTiep',
            'luiLienTiep',
            'tienDeuLienTiep',
            'luiDeuLienTiep'
        ];

        // Duyệt qua tất cả categories của số mới nhất
        for (const category of latestCategories) {
            for (const subcategory of subcategoriesToCheck) {
                const key = `${category}:${subcategory}`;

                // Bỏ qua nếu pattern đã có chuỗi hiện tại (đã được xử lý ở trên)
                if (quickStats[key] && quickStats[key].current) continue;

                // Lấy thông tin pattern từ quickStats
                const stat = quickStats[key];
                if (!stat) continue;

                // For this section, we are specifically looking for patterns that *could* become a streak of length 2.
                // This means the current length is 1 (the latest number just hit it), and the record is 2.
                const currentLen = 1; // The latest number makes it a streak of 1.
                const recordLen = stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0;

                // Only consider if the record is 2.
                if (recordLen !== 2) continue;

                // The target length for gap stats is 2, as we are checking if it will become a streak of 2.
                const targetLen = 2;
                const gapInfoGE = stat.gapStats ? stat.gapStats[targetLen] : null;
                const gapInfoExact = stat.exactGapStats ? stat.exactGapStats[targetLen] : null;

                // Check exclusion conditions (NEW LOGIC)
                let shouldExclude = false;

                // If currentLen (1) is already >= recordLen (2), this condition won't be met.
                // This section is for *potential* streaks, so currentLen is 1.
                // The record check is implicitly handled by `recordLen !== 2` above.
                // The main exclusion logic here is based on gaps.
                let excludeGE = false;
                let excludeExact = false;

                if (gapInfoGE && gapInfoGE.minGap !== null) {
                    const threshold = gapInfoGE.minGap * (1 + GAP_BUFFER_PERCENT);
                    if (gapInfoGE.lastGap < threshold) excludeGE = true;
                }

                if (gapInfoExact && gapInfoExact.minGap !== null) {
                    const threshold = gapInfoExact.minGap * (1 + GAP_BUFFER_PERCENT);
                    if (gapInfoExact.lastGap < threshold) excludeExact = true;
                }

                if (GAP_STRATEGY === 'GE') {
                    if (excludeGE) shouldExclude = true;
                } else if (GAP_STRATEGY === 'EXACT') {
                    if (excludeExact) shouldExclude = true;
                } else { // COMBINED
                    if (excludeGE && excludeExact) shouldExclude = true;
                }

                if (shouldExclude) {
                    const mockStat = {
                        current: { values: [latestNumber], length: 1 }
                    };

                    let nums = [];
                    const isTrendPattern = subcategory === 'tienDeuLienTiep' || subcategory === 'luiDeuLienTiep' ||
                        subcategory === 'tienLienTiep' || subcategory === 'luiLienTiep';

                    if (isTrendPattern) {
                        nums = suggestionsController.predictNextInSequence(mockStat, category, subcategory);
                    } else if (subcategory === 'veLienTiep') {
                        nums = suggestionsController.getNumbersFromCategory(category);
                    }

                    if (nums.length > 0) {
                        nums = nums.filter(n => n !== null && n !== undefined && !isNaN(n));
                        nums.forEach(n => exclusionsByTier.purple.add(parseInt(n, 10)));
                    }
                }
            }
        }
    }

    // === LOGIC LOẠI TRỪ THEO CẤP ĐỘ ƯU TIÊN ===
    // Mục tiêu: Đạt 60-80 số loại trừ → Số đánh 20-40
    const MIN_EXCLUSION_COUNT = EXCLUSION_TIERS.MIN_EXCLUSION_COUNT;

    // Bắt đầu với tập rỗng
    const finalExcludedNumbers = new Set();
    const appliedTiers = [];
    let currentThreshold = 0;

    // BƯỚC 1: Lấy TOÀN BỘ từ red + purple
    const primaryTiers = ['red', 'purple'];
    for (const tierName of primaryTiers) {
        const tierNumbers = exclusionsByTier[tierName];
        if (tierNumbers.size === 0) continue;

        tierNumbers.forEach(num => {
            finalExcludedNumbers.add(num);
        });
        appliedTiers.push(tierName);
    }

    // BƯỚC 2: Thêm ORANGE - (BỎ QUA VÌ YÊU CẦU MỚI "chỉ loại trừ khi đạt kỷ lục")

    // BƯỚC 3 & BƯỚC 4: LIGHT_RED - (BỎ QUA VÌ YÊU CẦU MỚI "chỉ loại trừ khi đạt kỷ lục")

    // ĐÓNG BỎ ĐIỀU CHỈNH ĐỘNG: Không giới hạn số lượng loại trừ tối đa nữa (để đồng bộ với Statistic và Distribution)
    // Nếu loại 100 số thì nghỉ chơi vòng này (không còn ép đánh 20 số nữa)
    /* 
    const MAX_EXCLUSION_COUNT = EXCLUSION_TIERS.MAX_EXCLUSION_COUNT || 80;
    const MIN_BET_COUNT = 20;

    if (finalExcludedNumbers.size > MAX_EXCLUSION_COUNT) {
        // ... (removed)
    }
    */
    const betCount = 100 - finalExcludedNumbers.size;
    if (betCount < 20 || betCount > 40) {
        console.log(`[Exclusion Service] WARNING: Bet count ${betCount} is outside 20-40 range`);
    }

    console.log(`[Exclusion Service] Excluded ${finalExcludedNumbers.size} numbers (Tiers: ${appliedTiers.join(', ')}) -> ${betCount} bets`);
    return finalExcludedNumbers;
}

/**
 * Get exclusions using Confidence Score system
 * Used when STATS_CONFIG.USE_CONFIDENCE_SCORE is true
 */
async function getExclusionsWithConfidence(lotteryData, currentIndex, globalStats, options = {}) {
    const strategyName = options.strategy || STATS_CONFIG.EXCLUSION_STRATEGY || 'BALANCED';
    const quickStats = await statisticsService.getQuickStats();

    // Collect all potential exclusion patterns with confidence scores
    const allPatterns = [];

    for (const key in quickStats) {
        const stat = quickStats[key];
        if (!stat.current) continue;

        const currentLen = stat.current.length;
        let category, subcategory;

        // Parse key
        if (key.includes(':')) {
            [category, subcategory] = key.split(':');
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
                if (key.endsWith(pattern)) {
                    subcategory = pattern.charAt(0).toLowerCase() + pattern.slice(1);
                    category = key.slice(0, -pattern.length);
                    break;
                }
            }
            if (!subcategory) {
                category = key;
                subcategory = '';
            }
        }

        if (!subcategory) continue;

        const isSoLePattern = (subcategory === 'veSole' || subcategory === 'veSoleMoi') &&
            key !== 'tienLuiSoLe' && key !== 'luiTienSoLe';
        const isTrendPattern = ['tienDeuLienTiep', 'luiDeuLienTiep', 'tienLienTiep', 'luiLienTiep',
            'dongTien', 'dongLui', 'tien', 'lui', 'tienDeu', 'luiDeu'].includes(subcategory);

        const targetLen = isSoLePattern ? currentLen + 2 : currentLen + 1;

        const gapInfoGE = stat.gapStats ? stat.gapStats[targetLen] : null;
        const gapInfoExact = stat.exactGapStats ? stat.exactGapStats[targetLen] : null;
        const extensionGapInfo = stat.extensionGapStats ? stat.extensionGapStats[currentLen] : null;
        const recordLen = stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0;

        // Calculate confidence score
        const confidence = exclusionLogic.calculateConfidence({
            currentLen,
            recordLen,
            gapInfoGE,
            gapInfoExact,
            extensionGapInfo
        });

        // Skip patterns with no confidence
        if (confidence.score <= 0) continue;

        // Get numbers for this pattern
        let nums = [];
        if (isTrendPattern) {
            nums = suggestionsController.predictNextInSequence(stat, category, subcategory);
        } else {
            nums = suggestionsController.getNumbersFromCategory(category);
        }

        if (!nums || nums.length === 0) continue;

        // Filter valid numbers
        nums = nums.filter(n => n !== null && n !== undefined && !isNaN(n))
            .map(n => parseInt(n, 10));

        if (nums.length === 0) continue;

        allPatterns.push({
            key,
            numbers: nums,
            confidence
        });
    }

    // Sort by confidence score
    const sortedPatterns = exclusionLogic.sortByConfidence(allPatterns);

    // Apply strategy limit
    const result = exclusionLogic.applyStrategyLimit(sortedPatterns, strategyName);

    // Build final set
    const finalExcludedNumbers = new Set();
    for (const pattern of result.included) {
        pattern.numbers.forEach(n => finalExcludedNumbers.add(n));
    }

    console.log(`[Exclusion Service - Confidence] Excluded ${finalExcludedNumbers.size} numbers (Strategy: ${strategyName}, Patterns: ${result.stats.patternsIncluded})`);
    return finalExcludedNumbers;
}

/**
 * Smart exclusion selector - uses unified logic from exclusionLogicService
 * This is now the SINGLE source of truth for all exclusion calculations
 */
async function getSmartExclusions(lotteryData, currentIndex, globalStats, options = {}) {
    // Use the unified function from exclusionLogicService
    const quickStats = await statisticsService.getQuickStats();
    const result = await exclusionLogic.getUnifiedExclusions(quickStats, options);

    console.log(`[Exclusion Service - Unified] Excluded ${result.excludedNumbers.size} numbers (Strategy: ${result.stats.strategy}, Method: ${result.stats.method})`);

    return result.excludedNumbers;
}

/**
 * Get full exclusion result with explanations (for API use)
 */
async function getFullExclusionResult(options = {}) {
    const quickStats = await statisticsService.getQuickStats();
    return exclusionLogic.getUnifiedExclusions(quickStats, options);
}

module.exports = {
    getExclusions,  // Legacy - kept for backward compatibility
    getExclusionsWithConfidence, // Old confidence-only method
    getSmartExclusions, // Smart selector (now uses unified logic)
    getFullExclusionResult // Full result with explanations
};
