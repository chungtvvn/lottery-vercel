/**
 * Unified Exclusion Logic Service
 * Single source of truth for all exclusion calculations
 * 
 * PHƯƠNG PHÁP DUY NHẤT: Drop-off Probability >= 85%
 * 
 * Logic:
 * 1. Tìm TẤT CẢ chuỗi đang diễn ra (active streaks) trong quickStats
 * 2. Tính tỷ lệ gãy (drop-off) = 1 - countGE(targetLen) / countGE(currentLen)
 * 3. Nếu drop-off >= 85% → LOẠI TRỪ tất cả số thuộc pattern đó
 * 4. Số còn lại (00-99 trừ các số loại trừ) = SỐ ĐÁNH
 * 
 * Áp dụng cho: Statistics, Simulation, Backtest, Distribution
 */

const MIN_DROPOFF = 0.85;

/**
 * Tính drop-off rate cho một pattern từ quickStats
 * @param {Object} stat - quickStats entry (có gapStats, current, longest)
 * @param {string} key - Pattern key
 * @returns {Object|null} { dropOffRate, currentLen, targetLen, curCount, nextCount } hoặc null nếu không qualify
 */
function calculateDropOff(stat, key) {
    if (!stat || !stat.current) return null;

    const currentLen = stat.current.length;
    if (!currentLen || currentLen < 1) return null;

    // Minimum streak length to qualify for exclusion
    // Streak phải >= 50% kỷ lục (tối thiểu 2 ngày) để loại trừ có ý nghĩa
    const recordLen = stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0;
    const minLen = Math.max(2, Math.ceil(recordLen * 0.5));
    if (currentLen < minLen) return null;

    // Xác định loại pattern
    const lowerKey = key.toLowerCase();
    const isSoLePattern = (lowerKey.includes('sole') || lowerKey.includes('solemoi')) &&
        !key.includes('tienLuiSoLe') && !key.includes('luiTienSoLe');

    const targetLen = isSoLePattern ? currentLen + 2 : currentLen + 1;

    // Lấy gapStats (count of streaks >= length)
    const currentGapInfo = stat.gapStats ? stat.gapStats[currentLen] : null;
    const targetGapInfo = stat.gapStats ? stat.gapStats[targetLen] : null;

    const curCount = currentGapInfo ? currentGapInfo.count : 0;
    const nextCount = targetGapInfo ? targetGapInfo.count : 0;

    // Dynamic MIN_SAMPLES: giảm threshold khi gần kỷ lục
    // recordLen already declared above
    let minSamples = 5;
    if (recordLen > 0 && currentLen >= recordLen) {
        minSamples = 1;
    } else if (recordLen > 0 && currentLen >= recordLen - 1) {
        minSamples = 3;
    }

    if (curCount < minSamples) return null;

    // Look-ahead: nếu gần kỷ lục (1-2 bước), tính drop-off tới kỷ lục
    let checkTargetLen = targetLen;
    if (recordLen > currentLen) {
        const step = isSoLePattern ? 2 : 1;
        const stepsToRecord = (recordLen - currentLen) / step;
        if (stepsToRecord > 0 && stepsToRecord <= 2) {
            checkTargetLen = recordLen;
        }
    }

    const checkTargetGapInfo = stat.gapStats ? stat.gapStats[checkTargetLen] : null;
    const checkTargetCount = checkTargetGapInfo ? checkTargetGapInfo.count : 0;

    let dropOffRate = 0;
    if (curCount > 0) {
        dropOffRate = 1 - (checkTargetCount / curCount);
    } else {
        dropOffRate = 1;
    }

    return {
        dropOffRate,
        currentLen,
        targetLen: checkTargetLen,
        curCount,
        nextCount: checkTargetCount,
        recordLen,
        isSoLePattern
    };
}

/**
 * Core exclusion function - SINGLE SOURCE OF TRUTH
 * Dùng cho TẤT CẢ: Statistics, Simulation, Backtest, Distribution
 * 
 * @param {Object} quickStats - QuickStats data (from statisticsService or historicalExclusionService)
 * @param {Object} options - { minDropOff: 0.85 }
 * @returns {Object} { excludedNumbers: Set, toBet: number[], excluded: number[], explanations: [], stats: {} }
 */
function getDropOffExclusions(quickStats, options = {}) {
    const minDropOff = options.minDropOff || MIN_DROPOFF;
    const suggestionsController = require('../controllers/suggestionsController');

    const excluded = new Set();
    const explanations = [];

    // Bỏ qua các pattern quá rộng (không có giá trị dự đoán)
    const excludedPatterns = [
        'tong_tt_lon', 'tong_tt_nho', 'tong_moi_lon', 'tong_moi_nho',
        'hieu_lon', 'hieu_nho'
    ];

    // Bỏ qua patterns 3D (dau_3d_*, dit_3d_*) vì quá rộng (30 số mỗi pattern)
    const isExcludedCategory = (category) => {
        if (excludedPatterns.includes(category)) return true;
        if (category.includes('_3d_')) return true; // dau_3d_2_4_9, etc.
        // Bỏ qua tong_tt_chan, tong_tt_le, tong_tt_chan_le... (quá rộng, ~50 số)
        if (category.match(/^(tong_tt_|tong_moi_)(chan|le|chan_le|le_chan)$/)) return true;
        // Bỏ qua dau/dit chan/le (50 số)
        if (category.match(/^(dau|dit)_(chan|le)$/)) return true;
        if (category.match(/^(dau_dit_tien_|dau_dit_lui_)/)) return true;
        return false;
    };

    for (const key in quickStats) {
        if (key === '_meta') continue;
        const stat = quickStats[key];

        const dropOffInfo = calculateDropOff(stat, key);
        if (!dropOffInfo) continue;
        if (dropOffInfo.dropOffRate < minDropOff) continue;

        // Parse category/subcategory
        let category, subcategory;
        if (key.includes(':')) {
            [category, subcategory] = key.split(':');
        } else {
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

        // Bỏ qua patterns quá rộng
        if (isExcludedCategory(category)) continue;

        // Resolve numbers cho pattern này
        const nums = resolveNumbersForPattern(stat, key, category, subcategory, suggestionsController);
        if (!nums || nums.length === 0) continue;

        // Bỏ qua patterns resolve ra quá nhiều số (> 20 số = quá rộng)
        if (nums.length > 20) continue;

        // Thêm vào tập loại trừ
        nums.forEach(n => {
            const num = parseInt(n, 10);
            if (!isNaN(num) && num >= 0 && num < 100) {
                excluded.add(num);
            }
        });

        explanations.push({
            key,
            title: getCategoryName(category, subcategory, key),
            pattern: getCategoryName(category, subcategory, key),
            streak: dropOffInfo.currentLen,
            maxStreak: dropOffInfo.recordLen,
            dropOffRate: dropOffInfo.dropOffRate,
            reason: dropOffInfo.nextCount === 0
                ? `Tỷ lệ gãy 100%: Chuỗi ${dropOffInfo.currentLen} ngày chưa từng kéo dài thêm!`
                : `Tỷ lệ gãy ${(dropOffInfo.dropOffRate * 100).toFixed(1)}%: Lịch sử ${dropOffInfo.curCount} lần đạt ≥${dropOffInfo.currentLen}d → chỉ ${dropOffInfo.nextCount} lần tới ≥${dropOffInfo.targetLen}d`,
            numbers: nums.slice(0, 10),
            numbersCount: nums.length,
            tier: dropOffInfo.dropOffRate >= 0.95 ? 'critical' : (dropOffInfo.dropOffRate >= 0.90 ? 'high' : 'medium')
        });
    }

    // Tính toBet = 00-99 trừ excluded
    const toBet = [];
    for (let i = 0; i < 100; i++) {
        if (!excluded.has(i)) toBet.push(i);
    }

    // Sắp xếp explanations theo dropOffRate giảm dần
    explanations.sort((a, b) => b.dropOffRate - a.dropOffRate);

    const skipped = toBet.length === 0;

    return {
        excludedNumbers: excluded,
        excluded: Array.from(excluded).sort((a, b) => a - b),
        toBet: skipped ? [] : toBet,
        skipped,
        explanations,
        stats: {
            method: 'DROP_OFF_85',
            patternsTotal: explanations.length,
            excludedCount: excluded.size,
            betCount: toBet.length
        }
    };
}

/**
 * Resolve numbers cho một pattern cụ thể
 */
function resolveNumbersForPattern(stat, key, category, subcategory, suggestionsController) {
    let nums = [];

    // Nếu có patternNumbers trong cache → dùng luôn
    if (stat.current && stat.current.patternNumbers && stat.current.patternNumbers.length > 0) {
        return [...stat.current.patternNumbers].filter(n => n !== null && n !== undefined && !isNaN(n));
    }

    const trendPatterns = [
        'tienDeuLienTiep', 'luiDeuLienTiep', 'tienLienTiep', 'luiLienTiep',
        'tienDeu', 'luiDeu', 'tien', 'lui', 'dongTien', 'dongLui',
        'tienLuiSoLe', 'luiTienSoLe'
    ];

    try {
        if (trendPatterns.includes(subcategory)) {
            let normalizedSub = subcategory;
            if (subcategory === 'lui') normalizedSub = 'luiLienTiep';
            else if (subcategory === 'tien') normalizedSub = 'tienLienTiep';
            else if (subcategory === 'luiDeu') normalizedSub = 'luiDeuLienTiep';
            else if (subcategory === 'tienDeu') normalizedSub = 'tienDeuLienTiep';
            nums = suggestionsController.predictNextInSequence(stat, category, normalizedSub);
        }
        else if (subcategory === 'veLienTiep' || subcategory === 'veCungGiaTri') {
            if (category.startsWith('dau_')) {
                const digit = category.split('_')[1];
                if (digit && digit.match(/^\d$/)) {
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[0] === digit);
                } else {
                    nums = suggestionsController.getNumbersFromCategory(category);
                }
            } else if (category.startsWith('dit_')) {
                const digit = category.split('_')[1];
                if (digit && digit.match(/^\d$/)) {
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[1] === digit);
                } else {
                    nums = suggestionsController.getNumbersFromCategory(category);
                }
            } else if (category === 'cacDau') {
                const lastVal = stat.current?.values?.[stat.current.values.length - 1] ?? stat.current?.value;
                if (lastVal !== null && lastVal !== undefined) {
                    const dau = String(lastVal).padStart(2, '0')[0];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[0] === dau);
                }
            } else if (category === 'cacDit') {
                const lastVal = stat.current?.values?.[stat.current.values.length - 1] ?? stat.current?.value;
                if (lastVal !== null && lastVal !== undefined) {
                    const dit = String(lastVal).padStart(2, '0')[1];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[1] === dit);
                }
            } else if (category.startsWith('tong_tt_') || category.startsWith('tong_moi_') || category.startsWith('hieu_')) {
                const specificSet = suggestionsController.getNumbersFromCategory(category);
                if (specificSet && specificSet.length > 0) {
                    nums = specificSet;
                } else if (stat.current.values && stat.current.values.length > 0) {
                    nums = stat.current.values.map(v => parseInt(v, 10));
                }
            } else {
                nums = suggestionsController.getNumbersFromCategory(category);
            }
        }
        else if (subcategory === 'veSole' || subcategory === 'veSoleMoi') {
            const lastVal = stat.current?.values?.[stat.current.values.length - 1] ?? stat.current?.value;
            if (lastVal !== null && lastVal !== undefined) {
                const numStr = String(lastVal).padStart(2, '0');
                if (category === 'cacDau' || category === 'motDau') {
                    const dau = numStr[0];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[0] === dau);
                } else if (category === 'cacDit' || category === 'motDit') {
                    const dit = numStr[1];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[1] === dit);
                } else {
                    nums = suggestionsController.getNumbersFromCategory(category);
                }
            }
        }
        else if (subcategory === 'soLeTheoCap' || key.includes('soLeTheoCap') || key.includes('SoLeTheoCap')) {
            nums = suggestionsController.predictNextInSequence(stat, category, subcategory || 'soLeTheoCap');
        }
        else {
            nums = suggestionsController.getNumbersFromCategory(category);
        }
    } catch (error) {
        console.error(`[ExclusionLogic] Error resolving numbers for ${key}:`, error.message);
        nums = [];
    }

    // Fallback
    if (!nums || nums.length === 0) {
        try {
            nums = suggestionsController.getNumbersFromCategory(category);
        } catch (e) {
            nums = [];
        }
    }

    // Filter valid numbers
    if (nums && nums.length > 0) {
        nums = nums.filter(n => n !== null && n !== undefined && !isNaN(n))
            .map(n => parseInt(n, 10))
            .filter(n => n >= 0 && n < 100);
    }

    return nums || [];
}

// Helper functions
function getCategoryName(category, subcategory, key) {
    const categoryNames = {
        'cacSo': 'Các số', 'cacDau': 'Các Đầu', 'cacDit': 'Các Đít',
        'motSo': '1 Số', 'motDau': '1 Đầu', 'motDit': '1 Đít',
        'tong_tt_cac_tong': 'Tổng TT - Các tổng',
        'tong_moi_cac_tong': 'Tổng Mới - Các tổng',
        'hieu_cac_hieu': 'Hiệu - Các hiệu',
        'tienLuiSoLe': 'Tiến Lùi So Le',
        'luiTienSoLe': 'Lùi Tiến So Le'
    };
    const subcategoryNames = {
        'veSole': 'Về so le', 'veSoleMoi': 'Về so le mới',
        'veLienTiep': 'Về liên tiếp', 'veCungGiaTri': 'Về cùng giá trị',
        'luiLienTiep': 'Lùi liên tiếp', 'tienLienTiep': 'Tiến liên tiếp',
        'luiDeuLienTiep': 'Lùi Đều', 'tienDeuLienTiep': 'Tiến Đều',
        'tien': 'Tiến', 'lui': 'Lùi',
        'dongTien': 'Đồng Tiến', 'dongLui': 'Đồng Lùi',
        'tienLuiSoLe': 'Tiến Lùi So Le', 'luiTienSoLe': 'Lùi Tiến So Le',
        'soLeTheoCap': 'So Le Theo Cặp'
    };

    let catName = categoryNames[category] || category;
    if (category.match(/^(tong_tt_|tong_moi_|hieu_)\d+$/)) {
        const match = category.match(/^(tong_tt_|tong_moi_|hieu_)(\d+)$/);
        if (match) {
            const prefix = match[1] === 'tong_tt_' ? 'Tổng TT' : (match[1] === 'tong_moi_' ? 'Tổng Mới' : 'Hiệu');
            catName = `${prefix} ${match[2]}`;
        }
    }
    if (category.match(/^(tong_tt_|tong_moi_|hieu_)\d+_\d+$/)) {
        const match = category.match(/^(tong_tt_|tong_moi_|hieu_)(\d+)_(\d+)$/);
        if (match) {
            const prefix = match[1] === 'tong_tt_' ? 'Tổng TT' : (match[1] === 'tong_moi_' ? 'Tổng Mới' : 'Hiệu');
            catName = `${prefix} (${match[2]},${match[3]})`;
        }
    }
    if (category.startsWith('dau_')) catName = `Đầu ${category.split('_')[1]}`;
    if (category.startsWith('dit_')) catName = `Đít ${category.split('_')[1]}`;

    return `${catName} - ${subcategoryNames[subcategory] || subcategory}`;
}

module.exports = {
    MIN_DROPOFF,
    calculateDropOff,
    getDropOffExclusions,
    resolveNumbersForPattern,
    getCategoryName
};
