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
 * 4. Điểm ưu tiên = 50% xác suất gãy/không HT + 50% nhịp xuất hiện của độ dài dự đoán.
 * 5. Chuỗi tiềm năng chỉ tham gia mặc định khi tần suất hình thành <= 1 lần/năm
 * 6. Số còn lại (00-99 trừ các số loại trừ) = SỐ ĐÁNH
 * 
 * Áp dụng cho: Statistics, Simulation, Backtest, Distribution
 */

const MIN_DROPOFF = 0.85;
const DEFAULT_MIN_PRIORITY = 85;
const DEFAULT_MAX_POTENTIAL_FORMATION_COUNT = 10;
const DEFAULT_MAX_POTENTIAL_FORMATION_PER_YEAR = 1;
const DEFAULT_HIGH_FREQUENCY_LIMIT_PER_YEAR = 20;
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

function formationScarcityScore(frequencyPerYear) {
    const frequency = Number(frequencyPerYear);
    if (!Number.isFinite(frequency) || frequency <= 0) return 1;
    return clamp(1 - (Math.log10(frequency + 1) / Math.log10(25)));
}

function roundOne(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

function getTargetHistoryMetrics(stat = {}, targetLen) {
    const length = Number(targetLen);
    if (!Number.isFinite(length) || length <= 0) return null;
    const byLength = stat.lengthHistoryMetrics || stat.targetHistoryMetrics || {};
    const metrics = byLength[length] || byLength[String(length)];
    if (metrics && typeof metrics === 'object') return metrics;
    const gapInfo = stat.gapStats ? (stat.gapStats[length] || stat.gapStats[String(length)]) : null;
    if (gapInfo && typeof gapInfo === 'object') {
        return {
            targetLength: length,
            occurrences: Number(gapInfo.count || gapInfo.pastCount || 0),
            avgLength: null,
            avgGapDays: Number.isFinite(Number(gapInfo.avgGap)) ? Number(gapInfo.avgGap) : null,
            latestEndDate: gapInfo.lastStoppedDate || '',
            daysSinceLatestEnd: Number.isFinite(Number(gapInfo.lastGap)) ? Number(gapInfo.lastGap) : null
        };
    }
    return null;
}

function calculateTargetTiming(metrics = {}) {
    const occurrences = Number(metrics.occurrences || 0);
    const avgGapDays = Number(metrics.avgGapDays);
    const daysSinceLatestEnd = Number(metrics.daysSinceLatestEnd);

    if (occurrences <= 0) {
        return { targetTimingRatio: 0, targetTimingScore: 1 };
    }

    if (!Number.isFinite(avgGapDays) || avgGapDays <= 0 || !Number.isFinite(daysSinceLatestEnd)) {
        return { targetTimingRatio: null, targetTimingScore: occurrences <= 1 ? 0.85 : 0.5 };
    }

    const ratio = Math.max(0, daysSinceLatestEnd) / avgGapDays;
    return {
        targetTimingRatio: roundOne(ratio),
        targetTimingScore: clamp(1 - Math.min(ratio, 1))
    };
}

function attachTargetTiming(dropOffInfo = {}, stat = {}, targetLen) {
    const metrics = getTargetHistoryMetrics(stat, targetLen) || {};
    const timing = calculateTargetTiming(metrics);
    return {
        ...dropOffInfo,
        targetHistoryLength: Number(targetLen),
        targetOccurrenceCount: Number(metrics.occurrences || 0),
        targetAvgLength: roundOne(metrics.avgLength),
        targetAvgGapDays: roundOne(metrics.avgGapDays),
        targetLatestEndDate: metrics.latestEndDate || '',
        targetDaysSinceLatestEnd: metrics.daysSinceLatestEnd === null || metrics.daysSinceLatestEnd === undefined
            ? null
            : Number(metrics.daysSinceLatestEnd),
        ...timing
    };
}

function isHistoricalRecordDropOff(dropOffInfo = {}) {
    if (dropOffInfo.isPotential) return false;

    const recordLen = Number(dropOffInfo.recordLen || 0);
    const currentLen = Number(dropOffInfo.currentLen || 0);
    const targetLen = Number(dropOffInfo.targetLen || dropOffInfo.formLen || currentLen + 1);
    const nextCount = Number(dropOffInfo.nextCount || 0);
    const curCount = Number(dropOffInfo.curCount || dropOffInfo.exclusionSampleSize || 0);
    const rate = Number(dropOffInfo.exclusionRate ?? dropOffInfo.dropOffRate ?? 0);

    return recordLen > 0
        && currentLen >= recordLen
        && targetLen > recordLen
        && curCount > 0
        && nextCount === 0
        && rate >= 0.999;
}

function getRecordDropOffLabel(dropOffInfo = {}) {
    if (!isHistoricalRecordDropOff(dropOffInfo)) return '';
    const recordLen = Number(dropOffInfo.recordLen || 0);
    const currentLen = Number(dropOffInfo.currentLen || 0);
    const targetLen = Number(dropOffInfo.targetLen || dropOffInfo.formLen || currentLen + 1);
    return `${currentLen}d -> ${targetLen}d vượt kỷ lục ${recordLen}d`;
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

function parseBooleanOption(value, fallback = false) {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function normalizeFilterOptions(options = {}) {
    const maxPotentialFormationCount = Number.isFinite(Number(options.maxPotentialFormationCount))
        ? Math.max(0, Number(options.maxPotentialFormationCount))
        : DEFAULT_MAX_POTENTIAL_FORMATION_COUNT;
    const highFrequencyPerYearLimit = Number.isFinite(Number(options.highFrequencyPerYearLimit))
        ? Math.max(0, Number(options.highFrequencyPerYearLimit))
        : DEFAULT_HIGH_FREQUENCY_LIMIT_PER_YEAR;
    const maxPotentialFormationPerYear = Number.isFinite(Number(options.maxPotentialFormationPerYear))
        ? Math.max(0, Number(options.maxPotentialFormationPerYear))
        : DEFAULT_MAX_POTENTIAL_FORMATION_PER_YEAR;

    return {
        includePotential: parseBooleanOption(options.includePotential, true),
        includeHighFrequency: parseBooleanOption(options.includeHighFrequency, true),
        maxPotentialFormationCount,
        maxPotentialFormationPerYear,
        highFrequencyPerYearLimit
    };
}

function getPotentialFormationCount(item = {}) {
    const value = Number(item.formationCount);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function isPotentialFormationEligible(
    item = {},
    maxPotentialFormationCount = DEFAULT_MAX_POTENTIAL_FORMATION_COUNT,
    maxPotentialFormationPerYear = DEFAULT_MAX_POTENTIAL_FORMATION_PER_YEAR,
    totalYears = 20
) {
    if (!item.isPotential) return true;
    if (maxPotentialFormationPerYear && maxPotentialFormationPerYear > 0) {
        const directFrequency = Number(item.formFrequencyPerYear);
        const frequency = Number.isFinite(directFrequency)
            ? directFrequency
            : (totalYears > 0 ? getPotentialFormationCount(item) / totalYears : Number.POSITIVE_INFINITY);
        return Number.isFinite(frequency) && frequency <= maxPotentialFormationPerYear;
    }
    return getPotentialFormationCount(item) <= maxPotentialFormationCount;
}

function getCandidateFrequencyPerYear(item = {}, totalYears = 20) {
    if (item.isPotential && Number.isFinite(Number(item.formFrequencyPerYear))) {
        return Number(item.formFrequencyPerYear);
    }
    const sample = Number(item.curCount || item.exclusionSampleSize || item.currentCount || 0);
    const years = Number(totalYears);
    return years > 0 ? sample / years : Number.POSITIVE_INFINITY;
}

function isHighFrequencyCandidate(item = {}, totalYears = 20, limit = DEFAULT_HIGH_FREQUENCY_LIMIT_PER_YEAR) {
    if (!limit || limit <= 0) return false;
    const frequency = getCandidateFrequencyPerYear(item, totalYears);
    return Number.isFinite(frequency) && frequency > limit;
}

function getPrioritySortGroup(item = {}) {
    if (item.isRecordDropOffCritical || isHistoricalRecordDropOff(item)) return 0;
    return item.isPotential ? 2 : 1;
}

function compareExclusionCandidates(a = {}, b = {}) {
    const groupDiff = getPrioritySortGroup(a) - getPrioritySortGroup(b);
    if (groupDiff !== 0) return groupDiff;
    if ((b.exclusionPriority || 0) !== (a.exclusionPriority || 0)) {
        return (b.exclusionPriority || 0) - (a.exclusionPriority || 0);
    }
    if ((b.exclusionRate || b.dropOffRate || 0) !== (a.exclusionRate || a.dropOffRate || 0)) {
        return (b.exclusionRate || b.dropOffRate || 0) - (a.exclusionRate || a.dropOffRate || 0);
    }
    return (b.streak || b.currentLen || 0) - (a.streak || a.currentLen || 0);
}

function calculateExclusionPriority(dropOffInfo, reliability = {}) {
    const rate = clamp(dropOffInfo.exclusionRate ?? dropOffInfo.dropOffRate ?? reliability.exclusionRate ?? reliability.dropOffRate ?? 0);
    const timing = Number.isFinite(Number(dropOffInfo.targetTimingScore))
        ? clamp(dropOffInfo.targetTimingScore)
        : 0.5;
    const baseScore = (rate * 0.5 + timing * 0.5) * 100;
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

    return attachTargetTiming({
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
    }, stat, targetLen);
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
    const filterOptions = normalizeFilterOptions(options);
    const suggestionsController = require('../controllers/suggestionsController');

    const excluded = new Set();
    const explanations = [];

    // Chỉ bỏ qua Lớn/Nhỏ (50/50 split, không có giá trị dự đoán toán học)
    const meaninglessPatterns = [
        'tong_tt_lon', 'tong_tt_nho', 'tong_moi_lon', 'tong_moi_nho',
        'hieu_lon', 'hieu_nho'
    ];

    /**
     * Tính xác suất loại cho chuỗi tiềm năng.
     * Nếu ngày mai tiếp tục thì chuỗi mới hình thành ở formLen; do đó rủi ro
     * loại trừ tương đương với chuỗi đã hình thành phải là P(không hình thành).
     * currentLen có thể là 1d hoặc 3d, ví dụ so le theo cặp / tiến-lùi so le
     * cần thêm 1 ngày nữa mới hình thành mốc 4d.
     */
    function calculatePotentialDropOff(stat, key) {
        if (!stat || !stat.current) return null;
        const cur = stat.current;
        if (!cur.isPotential) return null;
        
        const currentLen = cur.length || 0;
        if (currentLen < 1) return null;
        
        const recordLen = stat.computedMaxStreak || (stat.longest && stat.longest.length > 0 ? stat.longest[0].length : 0);
        if (recordLen < 2) return null;
        
        // Xác định step
        const step = getPatternStep(key);
        const isSoLePattern = step === 2;
        
        // formLen = độ dài nếu chuỗi hình thành ngày mai
        const formLen = currentLen + step;  // 2 cho thường, 3 cho so-le
        
        // Tiềm năng 1 ngày chỉ hợp lệ nếu ngày mai hình thành sẽ chạm đúng kỷ lục.
        if (currentLen === 1 && recordLen !== formLen) return null;
        // Các prefix dài hơn vẫn được giữ nếu đã đạt hoặc gần kỷ lục trong 1 step.
        if (currentLen !== 1 && formLen < recordLen - step) return null;
        
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
        
        const hasConditionalPrefixSample = countPrefix > countForm;
        const formationBaseCount = hasConditionalPrefixSample ? countPrefix : totalHistoricalDays;
        const formationRate = formationBaseCount > 0 ? countForm / formationBaseCount : 0;
        const nonFormationCount = Math.max(0, formationBaseCount - countForm);
        const nonFormationRate = formationBaseCount > 0 ? nonFormationCount / formationBaseCount : 1;
        const nonFormationLowerBound = wilsonLowerBound(nonFormationCount, formationBaseCount);
        const afterFormationDropOffRate = countForm > 0 ? 1 - (countBreak / countForm) : 1;
        
        return attachTargetTiming({
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
        }, stat, formLen);
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
        const totalYears = quickStats._meta && quickStats._meta.totalYears ? quickStats._meta.totalYears : 20;
        if (dropOffInfo.isPotential && !filterOptions.includePotential) continue;
        if (!isPotentialFormationEligible(
            dropOffInfo,
            filterOptions.maxPotentialFormationCount,
            filterOptions.maxPotentialFormationPerYear,
            totalYears
        )) continue;
        if (!filterOptions.includeHighFrequency && isHighFrequencyCandidate(dropOffInfo, totalYears, filterOptions.highFrequencyPerYearLimit)) continue;

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
            const recordDropOffLabel = getRecordDropOffLabel(dropOffInfo);
            reason = recordDropOffLabel
                ? `Đạt kỷ lục ${dropOffInfo.recordLen}d: nếu tiếp tục lên ${dropOffInfo.targetLen}d là vượt kỷ lục, lịch sử chưa từng xảy ra.`
                : dropOffInfo.nextCount === 0
                ? `Tỷ lệ gãy 100%: Chuỗi ${dropOffInfo.currentLen}d chưa từng kéo dài thêm!`
                : `Tỷ lệ gãy ${(dropOffInfo.dropOffRate * 100).toFixed(1)}%: Lịch sử ${dropOffInfo.curCount} lần đạt ≥${dropOffInfo.currentLen}d → chỉ ${dropOffInfo.nextCount} lần tới ≥${dropOffInfo.targetLen}d`;
        }
        const recordDropOffLabel = getRecordDropOffLabel(dropOffInfo);

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
            targetHistoryLength: dropOffInfo.targetHistoryLength,
            targetOccurrenceCount: dropOffInfo.targetOccurrenceCount,
            targetAvgLength: dropOffInfo.targetAvgLength,
            targetAvgGapDays: dropOffInfo.targetAvgGapDays,
            targetLatestEndDate: dropOffInfo.targetLatestEndDate,
            targetDaysSinceLatestEnd: dropOffInfo.targetDaysSinceLatestEnd,
            targetTimingRatio: dropOffInfo.targetTimingRatio,
            targetTimingScore: dropOffInfo.targetTimingScore,
            priorityBreakScore: roundOne((dropOffInfo.exclusionRate ?? dropOffInfo.dropOffRate ?? 0) * 100),
            priorityTimingScore: roundOne((dropOffInfo.targetTimingScore ?? 0.5) * 100),
            isRecordDropOffCritical: Boolean(recordDropOffLabel),
            targetExceedsRecord: Boolean(recordDropOffLabel),
            recordDropOffLabel,
            sortGroup: getPrioritySortGroup(dropOffInfo),
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
        return compareExclusionCandidates(a, b);
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

    // Fallback chỉ áp dụng cho pattern không phải trend. Trend rỗng nghĩa là
    // không xác định được bước kế tiếp, tuyệt đối không fallback về cả category.
    if ((!nums || nums.length === 0) && !isTrendPattern) {
        try {
            nums = suggestionsController.getNumbersFromCategory(category);
        } catch (e) {
            nums = [];
        }
    }

    if (isTrendPattern && (!nums || nums.length === 0)) return [];

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
    const formatThreeValueLabel = (prefixLabel, suffix) => `${prefixLabel} (${suffix.split('_').join(',')})`;

    if (category.match(/^dau_3d_(\d_){2}\d$/)) {
        catName = formatThreeValueLabel('Đầu', category.replace('dau_3d_', ''));
    } else if (category.match(/^dit_3d_(\d_){2}\d$/)) {
        catName = formatThreeValueLabel('Đít', category.replace('dit_3d_', ''));
    } else if (category.match(/^tong_tt_\d+_\d+_\d+$/)) {
        catName = formatThreeValueLabel('Tổng TT', category.replace('tong_tt_', ''));
    } else if (category.match(/^tong_moi_\d+_\d+_\d+$/)) {
        catName = formatThreeValueLabel('Tổng Mới', category.replace('tong_moi_', ''));
    } else if (category.match(/^hieu_\d+_\d+_\d+$/)) {
        catName = formatThreeValueLabel('Hiệu', category.replace('hieu_', ''));
    }

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
    if (category.startsWith('dau_') && !category.startsWith('dau_3d_')) catName = `Đầu ${category.split('_')[1]}`;
    if (category.startsWith('dit_') && !category.startsWith('dit_3d_')) catName = `Đít ${category.split('_')[1]}`;

    return `${catName} - ${subcategoryNames[subcategory] || subcategory}`;
}

module.exports = {
    MIN_DROPOFF,
    DEFAULT_MIN_PRIORITY,
    DEFAULT_MAX_POTENTIAL_FORMATION_COUNT,
    DEFAULT_MAX_POTENTIAL_FORMATION_PER_YEAR,
    DEFAULT_HIGH_FREQUENCY_LIMIT_PER_YEAR,
    calculateDropOff,
    calculateExclusionPriority,
    compareExclusionCandidates,
    getPotentialFormationCount,
    isPotentialFormationEligible,
    getCandidateFrequencyPerYear,
    isHighFrequencyCandidate,
    getDropOffExclusions,
    resolveNumbersForPattern,
    getCategoryName
};
