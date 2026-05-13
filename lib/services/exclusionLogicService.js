/**
 * Unified Exclusion Logic Service
 * Single source of truth for all exclusion calculations
 * 
 * PHƯƠNG PHÁP DUY NHẤT: Drop-off Probability >= 85%
 * 
 * Logic:
 * 1. Chuỗi đang diễn ra: tính P(gãy ngày mai) = 1 - count(≥L+1)/count(≥L)
 * 2. Chuỗi tiềm năng: patterns 1d có isPotential=true, nếu hình thành sẽ đạt/gần kỷ lục
 *    → tính P(gãy tại formLen) = 1 - count(≥formLen+step)/count(≥formLen)
 * 3. Chuỗi đã hình thành: nếu drop-off >= ngưỡng → LOẠI TRỪ tất cả số thuộc pattern đó
 * 4. Chuỗi tiềm năng hiếm (tần suất hình thành <= 1 lần/năm): vẫn LOẠI TRỪ dù drop-off dưới ngưỡng
 * 5. Số còn lại (00-99 trừ các số loại trừ) = SỐ ĐÁNH
 * 
 * Áp dụng cho: Statistics, Simulation, Backtest, Distribution
 */

const MIN_DROPOFF = 0.85;
const MAX_POTENTIAL_FORM_FREQ_PER_YEAR = 1;
const {
    isSoLeTheoCapCategory,
    getSoLeTheoCapConfig
} = require('../utils/soLeTheoCapPairs');

function getPatternStep(key = '') {
    const lowerKey = String(key).toLowerCase();
    const isAlternatingGapPattern = (lowerKey.includes('vesole') || lowerKey.includes('solemoi')) &&
        !lowerKey.includes('tienluisole') &&
        !lowerKey.includes('luitiensole') &&
        !lowerKey.includes('soletheocap');

    return isAlternatingGapPattern ? 2 : 1;
}

/**
 * Tính drop-off rate cho một pattern từ quickStats
 * @param {Object} stat - quickStats entry (có gapStats, current, longest)
 * @param {string} key - Pattern key
 * @returns {Object|null} { dropOffRate, currentLen, targetLen, curCount, nextCount } hoặc null nếu không qualify
 */
function calculateDropOff(stat, key) {
    if (!stat || !stat.current) return null;

    const currentLen = stat.current.length;
    if (!currentLen || currentLen < 2) return null;  // Minimum 2d streak

    const recordLen = stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0;

    // Xác định loại pattern (so le → step=2, thường → step=1)
    const step = getPatternStep(key);
    const isSoLePattern = step === 2;
    const targetLen = currentLen + step;

    // Lấy gapStats (count of streaks >= length)
    const currentGapInfo = stat.gapStats ? stat.gapStats[currentLen] : null;
    const targetGapInfo = stat.gapStats ? stat.gapStats[targetLen] : null;

    const curCount = currentGapInfo ? currentGapInfo.count : 0;
    const nextCount = targetGapInfo ? targetGapInfo.count : 0;

    // Dynamic MIN_SAMPLES: giảm threshold khi gần kỷ lục
    let minSamples = 5;
    if (recordLen > 0 && currentLen >= recordLen) {
        minSamples = 1;
    } else if (recordLen > 0 && currentLen >= recordLen - 1) {
        minSamples = 3;
    }

    if (curCount < minSamples) return null;

    // === XÁC SUẤT CÓ ĐIỀU KIỆN (Conditional Probability) ===
    // P(gãy ngày mai) = 1 - count(≥targetLen) / count(≥currentLen)
    // Trả lời đúng câu hỏi: "Chuỗi đang ở N ngày, xác suất dừng NGÀY MAI?"
    // KHÔNG dùng look-ahead — chỉ tính 1 bước
    let dropOffRate = 0;
    if (curCount > 0) {
        dropOffRate = 1 - (nextCount / curCount);
    } else {
        dropOffRate = 1;
    }

    return {
        dropOffRate,
        currentLen,
        targetLen,
        curCount,
        isPotential: false,
        nextCount,
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

    // Chỉ bỏ qua Lớn/Nhỏ (50/50 split, không có giá trị dự đoán toán học)
    const meaninglessPatterns = [
        'tong_tt_lon', 'tong_tt_nho', 'tong_moi_lon', 'tong_moi_nho',
        'hieu_lon', 'hieu_nho'
    ];

    /**
     * Tính drop-off cho chuỗi tiềm năng (isPotential, currentLen=1)
     * Nếu ngày mai tiếp tục → chuỗi hình thành ở formLen → đạt/gần kỷ lục
     * Tính P(gãy tại formLen) để xem có nên loại trừ không
     */
    function calculatePotentialDropOff(stat, key) {
        if (!stat || !stat.current) return null;
        const cur = stat.current;
        if (!cur.isPotential) return null;
        
        const currentLen = cur.length || 0;
        if (currentLen !== 1) return null;  // Chỉ xử lý patterns đang ở 1d
        
        const recordLen = stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0;
        if (recordLen < 2) return null;
        
        // Xác định step
        const step = getPatternStep(key);
        const isSoLePattern = step === 2;
        
        // formLen = độ dài nếu chuỗi hình thành ngày mai
        const formLen = currentLen + step;  // 2 cho thường, 3 cho so-le
        
        // Chỉ lấy nếu formLen đạt hoặc gần kỷ lục (trong 1 step)
        if (formLen < recordLen - step) return null;
        
        // Với chuỗi tiềm năng, drop-off phải là xác suất có điều kiện SAU KHI chuỗi hình thành:
        // P(gãy sau formLen) = 1 - count(≥formLen+step) / count(≥formLen)
        // Không dùng totalDays làm mẫu số vì sẽ biến tần suất 20-30 lần/năm thành "gãy" 90%+ sai nghĩa.
        const breakTarget = formLen + step;
        const gs = stat.gapStats || {};
        const gForm = gs[formLen];
        const gBreak = gs[breakTarget];
        const countForm = gForm ? gForm.count : 0;
        const countBreak = gBreak ? gBreak.count : 0;
        
        if (countForm <= 0) return null;

        const totalYears = quickStats._meta && quickStats._meta.totalYears ? quickStats._meta.totalYears : 20;
        const formFrequencyPerYear = countForm / totalYears;
        if (formFrequencyPerYear > MAX_POTENTIAL_FORM_FREQ_PER_YEAR) return null;
        
        const dropOffRate = 1 - (countBreak / countForm);
        
        return {
            dropOffRate,
            currentLen,
            formLen,
            targetLen: breakTarget,
            curCount: countForm,
            nextCount: countBreak,
            formFrequencyPerYear,
            recordLen,
            isSoLePattern,
            isPotential: true
        };
    }

    for (const key in quickStats) {
        if (key === '_meta') continue;
        const stat = quickStats[key];

        // Thử chuỗi đang diễn ra (≥2d) hoặc chuỗi tiềm năng (1d → gần kỷ lục)
        let dropOffInfo = calculateDropOff(stat, key);
        if (!dropOffInfo) {
            dropOffInfo = calculatePotentialDropOff(stat, key);
        }
        if (!dropOffInfo) continue;
        const isRarePotential = dropOffInfo.isPotential
            && dropOffInfo.formFrequencyPerYear <= MAX_POTENTIAL_FORM_FREQ_PER_YEAR;
        if (!isRarePotential && dropOffInfo.dropOffRate < minDropOff) continue;

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

        if (String(subcategory || '').toLowerCase() === 'soletheocap' && !isSoLeTheoCapCategory(category)) continue;

        // Chỉ bỏ Lớn/Nhỏ (50/50, vô nghĩa)
        if (meaninglessPatterns.includes(category)) continue;

        // Resolve numbers cho pattern này
        const nums = resolveNumbersForPattern(stat, key, category, subcategory, suggestionsController);
        if (!nums || nums.length === 0) continue;

        // Thêm vào tập loại trừ
        nums.forEach(n => {
            const num = parseInt(n, 10);
            if (!isNaN(num) && num >= 0 && num < 100) {
                excluded.add(num);
            }
        });

        const isPotential = dropOffInfo.isPotential || false;
        const displayLen = isPotential ? dropOffInfo.formLen : dropOffInfo.currentLen;
        const potentialLabel = isPotential ? ' (tiềm năng)' : '';

        let reason;
        if (isPotential) {
            reason = dropOffInfo.nextCount === 0
                ? `Tiềm năng: Nếu hình thành ${dropOffInfo.formLen}d → 100% gãy (${dropOffInfo.curCount} lần đạt, ${dropOffInfo.formFrequencyPerYear.toFixed(1)} lần/năm, chưa bao giờ vượt kỷ lục ${dropOffInfo.recordLen}d)`
                : `Tiềm năng: Nếu hình thành ${dropOffInfo.formLen}d → ${(dropOffInfo.dropOffRate * 100).toFixed(0)}% gãy (${dropOffInfo.curCount} lần đạt, ${dropOffInfo.formFrequencyPerYear.toFixed(1)} lần/năm → chỉ ${dropOffInfo.nextCount} lần tiếp tục)`;
        } else {
            reason = dropOffInfo.nextCount === 0
                ? `Tỷ lệ gãy 100%: Chuỗi ${dropOffInfo.currentLen}d chưa từng kéo dài thêm!`
                : `Tỷ lệ gãy ${(dropOffInfo.dropOffRate * 100).toFixed(1)}%: Lịch sử ${dropOffInfo.curCount} lần đạt ≥${dropOffInfo.currentLen}d → chỉ ${dropOffInfo.nextCount} lần tới ≥${dropOffInfo.targetLen}d`;
        }

        explanations.push({
            key,
            title: getCategoryName(category, subcategory, key) + potentialLabel,
            pattern: getCategoryName(category, subcategory, key),
            streak: displayLen,
            maxStreak: dropOffInfo.recordLen,
            dropOffRate: dropOffInfo.dropOffRate,
            reason,
            numbers: nums,
            numbersCount: nums.length,
            tier: dropOffInfo.dropOffRate >= 0.95 ? 'critical' : (dropOffInfo.dropOffRate >= 0.90 ? 'high' : 'medium'),
            isPotential
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
            method: `DROP_OFF_${Math.round(minDropOff * 100)}`,
            minDropOff,
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
    if (subcategory === 'soLeTheoCap') {
        const pairConfig = getSoLeTheoCapConfig(category);
        if (pairConfig) return `${pairConfig.description} - So Le Theo Cặp`;
    }

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
