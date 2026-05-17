/**
 * Unified Exclusion Logic Service
 * Single source of truth for all exclusion calculations
 * 
 * PHƯƠNG PHÁP DUY NHẤT: Exclusion Priority >= 85
 * 
 * Logic:
 * 1. Chuỗi đang diễn ra: tính P(gãy ngày mai) = 1 - count(≥L+1)/count(≥L)
 * 2. Chuỗi tiềm năng: patterns 1d có isPotential=true, nếu hình thành sẽ đạt/gần kỷ lục
 *    → tính P(không hình thành formLen) = 1 - count(≥formLen)/count(≥currentLen)
 * 3. Chuỗi đã hình thành hoặc tiềm năng: nếu exclusionPriority >= ngưỡng → LOẠI TRỪ tất cả số thuộc pattern đó
 * 4. Chuỗi tiềm năng vẫn bị giới hạn tần suất hình thành <= 1 lần/năm để tránh pattern quá phổ biến
 * 5. Số còn lại (00-99 trừ các số loại trừ) = SỐ ĐÁNH
 * 
 * Áp dụng cho: Statistics, Simulation, Backtest, Distribution
 */

const MIN_DROPOFF = 0.85;
const DEFAULT_MIN_PRIORITY = 85;
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

function clamp(value, min = 0, max = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function wilsonLowerBound(successes, total, z = 1.64) {
    if (!total || total <= 0) return 0;
    const phat = successes / total;
    const z2 = z * z;
    const denominator = 1 + z2 / total;
    const centre = phat + z2 / (2 * total);
    const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
    return Math.max(0, (centre - margin) / denominator);
}

function sampleScore(sampleSize) {
    const sample = Math.max(0, Number(sampleSize) || 0);
    return clamp(Math.log10(sample + 1) / Math.log10(100));
}

function isHistoricalRecordDropOff(dropOffInfo = {}) {
    if (dropOffInfo.isPotential) return false;

    const recordLen = Number(dropOffInfo.recordLen || 0);
    const currentLen = Number(dropOffInfo.currentLen || 0);
    const nextCount = Number(dropOffInfo.nextCount || 0);
    const curCount = Number(dropOffInfo.curCount || dropOffInfo.exclusionSampleSize || 0);
    const rate = Number(dropOffInfo.exclusionRate ?? dropOffInfo.dropOffRate ?? 0);

    return recordLen > 0
        && currentLen >= recordLen
        && curCount > 0
        && nextCount === 0
        && rate >= 0.999;
}

function normalizeMinPriority(options = {}) {
    if (Number.isFinite(Number(options.minPriority))) {
        return clamp(Number(options.minPriority), 0, 100);
    }

    if (Number.isFinite(Number(options.minDropOff))) {
        const legacy = Number(options.minDropOff);
        return clamp(legacy <= 1 ? legacy * 100 : legacy, 0, 100);
    }

    return DEFAULT_MIN_PRIORITY;
}

function calculateExclusionPriority(dropOffInfo, reliability = {}) {
    const rate = clamp(dropOffInfo.exclusionRate ?? dropOffInfo.dropOffRate ?? reliability.exclusionRate ?? reliability.dropOffRate ?? 0);
    const lower = clamp(dropOffInfo.exclusionLowerBound ?? reliability.lowerBound ?? 0);
    const sample = sampleScore(dropOffInfo.exclusionSampleSize || dropOffInfo.curCount || reliability.sampleSize || 0);
    const rawTrust = Number(reliability.score);
    const trust = Number.isFinite(rawTrust)
        ? clamp(rawTrust / 100)
        : clamp(lower * 0.72 + sample * 0.28);

    const baseScore = (rate * 0.55 + lower * 0.25 + trust * 0.15 + sample * 0.05) * 100;
    const recordScore = isHistoricalRecordDropOff(dropOffInfo) ? 100 : 0;

    return Math.round(Math.max(baseScore, recordScore) * 10) / 10;
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

    const breakCount = Math.max(0, curCount - nextCount);
    const exclusionLowerBound = wilsonLowerBound(breakCount, curCount);

    return {
        dropOffRate,
        exclusionRate: dropOffRate,
        exclusionLowerBound,
        exclusionSampleSize: curCount,
        breakCount,
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
 * @param {Object} options - { minPriority: 85 } (minDropOff legacy vẫn được hỗ trợ)
 * @returns {Object} { excludedNumbers: Set, toBet: number[], excluded: number[], explanations: [], stats: {} }
 */
function getDropOffExclusions(quickStats, options = {}) {
    const minPriority = normalizeMinPriority(options);
    const suggestionsController = require('../controllers/suggestionsController');

    const excluded = new Set();
    const explanations = [];

    // Chỉ bỏ qua Lớn/Nhỏ (50/50 split, không có giá trị dự đoán toán học)
    const meaninglessPatterns = [
        'tong_tt_lon', 'tong_tt_nho', 'tong_moi_lon', 'tong_moi_nho',
        'hieu_lon', 'hieu_nho'
    ];

    /**
     * Tính xác suất loại cho chuỗi tiềm năng (isPotential, currentLen=1).
     * Nếu ngày mai tiếp tục thì chuỗi mới hình thành ở formLen; do đó rủi ro
     * loại trừ tương đương với chuỗi đã hình thành phải là P(không hình thành).
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
        
        const breakTarget = formLen + step;
        const gs = stat.gapStats || {};
        const gPrefix = gs[currentLen];
        const gForm = gs[formLen];
        const gBreak = gs[breakTarget];
        const countPrefix = gPrefix ? gPrefix.count : 0;
        const countForm = gForm ? gForm.count : 0;
        const countBreak = gBreak ? gBreak.count : 0;
        
        if (countPrefix <= 0) return null;

        const totalYears = quickStats._meta && quickStats._meta.totalYears ? quickStats._meta.totalYears : 20;
        const totalHistoricalDays = Math.max(1, Math.round(totalYears * 365.25));
        const formFrequencyPerYear = countForm / totalYears;
        if (formFrequencyPerYear > MAX_POTENTIAL_FORM_FREQ_PER_YEAR) return null;
        
        const hasConditionalPrefixSample = countPrefix > countForm;
        const formationBaseCount = hasConditionalPrefixSample ? countPrefix : totalHistoricalDays;
        const formationRate = formationBaseCount > 0 ? countForm / formationBaseCount : 0;
        const nonFormationCount = Math.max(0, formationBaseCount - countForm);
        const nonFormationRate = formationBaseCount > 0 ? nonFormationCount / formationBaseCount : 1;
        const nonFormationLowerBound = wilsonLowerBound(nonFormationCount, formationBaseCount);
        const afterFormationDropOffRate = countForm > 0 ? 1 - (countBreak / countForm) : 1;
        
        return {
            dropOffRate: nonFormationRate,
            exclusionRate: nonFormationRate,
            exclusionLowerBound: nonFormationLowerBound,
            exclusionSampleSize: formationBaseCount,
            nonFormationRate,
            nonFormationLowerBound,
            nonFormationCount,
            formationRate,
            formationCount: countForm,
            prefixCount: formationBaseCount,
            rawPrefixCount: countPrefix,
            usesFrequencyFallback: !hasConditionalPrefixSample,
            afterFormationDropOffRate,
            currentLen,
            formLen,
            targetLen: formLen,
            breakTargetLen: breakTarget,
            curCount: countPrefix,
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
        const exclusionRate = dropOffInfo.exclusionRate ?? dropOffInfo.dropOffRate;
        const reliability = (stat.current && stat.current.reliability) || stat.reliability || {};
        const exclusionPriority = calculateExclusionPriority(dropOffInfo, reliability);
        if (exclusionPriority < minPriority) continue;

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
            const potentialSampleLabel = dropOffInfo.usesFrequencyFallback ? 'ngày mẫu' : 'tiền đề';
            const afterFormationText = dropOffInfo.formationCount > 0
                ? `sau HT gãy ${(dropOffInfo.afterFormationDropOffRate * 100).toFixed(0)}% (${dropOffInfo.formationCount} HT → ${dropOffInfo.nextCount} tiếp tục)`
                : 'chưa từng hình thành trong lịch sử';
            reason = `Tiềm năng: Không hình thành ${dropOffInfo.formLen}d ${(dropOffInfo.nonFormationRate * 100).toFixed(1)}% (${dropOffInfo.prefixCount} ${potentialSampleLabel} → ${dropOffInfo.formationCount} lần hình thành, HT ${(dropOffInfo.formationRate * 100).toFixed(1)}%, ${dropOffInfo.formFrequencyPerYear.toFixed(1)} lần/năm; ${afterFormationText}).`;
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
            currentLength: dropOffInfo.currentLen,
            targetLength: dropOffInfo.targetLen || dropOffInfo.formLen,
            maxStreak: dropOffInfo.recordLen,
            dropOffRate: exclusionRate,
            exclusionRate,
            exclusionPriority,
            exclusionLowerBound: dropOffInfo.exclusionLowerBound,
            exclusionSampleSize: dropOffInfo.exclusionSampleSize,
            currentCount: dropOffInfo.curCount || dropOffInfo.formationBaseCount,
            nextCount: dropOffInfo.nextCount,
            afterFormationDropOffRate: dropOffInfo.afterFormationDropOffRate,
            nonFormationRate: dropOffInfo.nonFormationRate,
            nonFormationLowerBound: dropOffInfo.nonFormationLowerBound,
            formationRate: dropOffInfo.formationRate,
            formationCount: dropOffInfo.formationCount,
            prefixCount: dropOffInfo.prefixCount,
            formFrequencyPerYear: dropOffInfo.formFrequencyPerYear,
            isRecordDropOffCritical: isHistoricalRecordDropOff(dropOffInfo),
            reason,
            numbers: nums,
            numbersCount: nums.length,
            tier: exclusionPriority >= 95 ? 'critical' : (exclusionPriority >= 90 ? 'high' : 'medium'),
            isPotential
        });
    }

    // Tính toBet = 00-99 trừ excluded
    const toBet = [];
    for (let i = 0; i < 100; i++) {
        if (!excluded.has(i)) toBet.push(i);
    }

    // Sắp xếp theo cùng một điểm ưu tiên loại trừ.
    explanations.sort((a, b) => {
        const recordCriticalDiff = Number(b.isRecordDropOffCritical) - Number(a.isRecordDropOffCritical);
        if (recordCriticalDiff !== 0) return recordCriticalDiff;
        if ((b.exclusionPriority || 0) !== (a.exclusionPriority || 0)) {
            return (b.exclusionPriority || 0) - (a.exclusionPriority || 0);
        }
        if ((b.exclusionRate || b.dropOffRate || 0) !== (a.exclusionRate || a.dropOffRate || 0)) {
            return (b.exclusionRate || b.dropOffRate || 0) - (a.exclusionRate || a.dropOffRate || 0);
        }
        return (b.streak || 0) - (a.streak || 0);
    });

    const skipped = toBet.length === 0;

    return {
        excludedNumbers: excluded,
        excluded: Array.from(excluded).sort((a, b) => a - b),
        toBet: skipped ? [] : toBet,
        skipped,
        explanations,
        stats: {
            method: `PRIORITY_${Math.round(minPriority)}`,
            minPriority,
            minDropOff: minPriority / 100,
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

    const trendPatterns = [
        'tienDeuLienTiep', 'luiDeuLienTiep', 'tienLienTiep', 'luiLienTiep',
        'tienDeu', 'luiDeu', 'tien', 'lui', 'dongTien', 'dongLui',
        'tienLuiSoLe', 'luiTienSoLe'
    ];
    const isTrendPattern = trendPatterns.includes(subcategory);

    // Nếu có patternNumbers trong cache → dùng luôn, trừ trend vì cache cũ có thể là full set của "về liên tiếp".
    if (!isTrendPattern && stat.current && stat.current.patternNumbers && stat.current.patternNumbers.length > 0 && stat.current.patternNumbers.length < 100) {
        return [...stat.current.patternNumbers].filter(n => n !== null && n !== undefined && !isNaN(n));
    }

    try {
        if (isTrendPattern) {
            let normalizedSub = subcategory;
            if (subcategory === 'lui') normalizedSub = 'luiLienTiep';
            else if (subcategory === 'tien') normalizedSub = 'tienLienTiep';
            else if (subcategory === 'luiDeu') normalizedSub = 'luiDeuLienTiep';
            else if (subcategory === 'tienDeu') normalizedSub = 'tienDeuLienTiep';
            nums = suggestionsController.predictNextInSequence(stat, category, normalizedSub);
        }
        else if (subcategory === 'veLienTiep' || subcategory === 'veCungGiaTri') {
            nums = suggestionsController.predictNextInSequence(stat, category, subcategory);

            if ((!nums || nums.length === 0 || nums.length >= 100) && category.startsWith('dau_')) {
                const digit = category.split('_')[1];
                if (digit && digit.match(/^\d$/)) {
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[0] === digit);
                } else {
                    nums = suggestionsController.getNumbersFromCategory(category);
                }
            } else if ((!nums || nums.length === 0 || nums.length >= 100) && category.startsWith('dit_')) {
                const digit = category.split('_')[1];
                if (digit && digit.match(/^\d$/)) {
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[1] === digit);
                } else {
                    nums = suggestionsController.getNumbersFromCategory(category);
                }
            } else if ((!nums || nums.length === 0 || nums.length >= 100) && category === 'cacDau') {
                const lastVal = stat.current?.values?.[stat.current.values.length - 1] ?? stat.current?.value;
                if (lastVal !== null && lastVal !== undefined) {
                    const dau = String(lastVal).padStart(2, '0')[0];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[0] === dau);
                }
            } else if ((!nums || nums.length === 0 || nums.length >= 100) && category === 'cacDit') {
                const lastVal = stat.current?.values?.[stat.current.values.length - 1] ?? stat.current?.value;
                if (lastVal !== null && lastVal !== undefined) {
                    const dit = String(lastVal).padStart(2, '0')[1];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[1] === dit);
                }
            } else if ((!nums || nums.length === 0 || nums.length >= 100) && (category.startsWith('tong_tt_') || category.startsWith('tong_moi_') || category.startsWith('hieu_'))) {
                const specificSet = suggestionsController.getNumbersFromCategory(category);
                if (specificSet && specificSet.length > 0) {
                    nums = specificSet;
                } else if (stat.current.values && stat.current.values.length > 0) {
                    nums = stat.current.values.map(v => parseInt(v, 10));
                }
            } else if (!nums || nums.length === 0) {
                nums = suggestionsController.getNumbersFromCategory(category);
            }
        }
        else if (subcategory === 'veSole' || subcategory === 'veSoleMoi') {
            nums = suggestionsController.predictNextInSequence(stat, category, subcategory);
            const lastVal = stat.current?.values?.[stat.current.values.length - 1] ?? stat.current?.value;
            if (lastVal !== null && lastVal !== undefined) {
                const numStr = String(lastVal).padStart(2, '0');
                if ((!nums || nums.length === 0 || nums.length >= 100) && (category === 'cacDau' || category === 'motDau')) {
                    const dau = numStr[0];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[0] === dau);
                } else if ((!nums || nums.length === 0 || nums.length >= 100) && (category === 'cacDit' || category === 'motDit')) {
                    const dit = numStr[1];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[1] === dit);
                } else if (!nums || nums.length === 0) {
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

    if (nums && nums.length >= 100) return [];

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
    DEFAULT_MIN_PRIORITY,
    calculateDropOff,
    calculateExclusionPriority,
    getDropOffExclusions,
    resolveNumbersForPattern,
    getCategoryName
};
