/**
 * Unified Exclusion Logic Service
 * Single source of truth for all exclusion calculations
 * Used by: suggestionsController, exclusionService, simulationService
 */

const STATS_CONFIG = require('../config/stats-config');

// ============= WEIGHTED VOTING =============
/**
 * Calculate votes for each number based on patterns
 * @param {Array} patterns - Array of { numbers: [], confidence: {score, tier}, ... }
 * @returns {Map<number, {votes: number, sources: string[]}>}
 */
function calculateVotes(patterns) {
    const votes = new Map();

    for (const pattern of patterns) {
        if (!pattern.numbers || pattern.numbers.length === 0) continue;

        // Weight based on confidence score (0-1)
        const weight = pattern.confidence?.score || 0.5;

        for (const num of pattern.numbers) {
            const n = parseInt(num, 10);
            if (isNaN(n)) continue;

            if (!votes.has(n)) {
                votes.set(n, { votes: 0, sources: [], weight: 0 });
            }

            const entry = votes.get(n);
            entry.votes += 1;
            entry.weight += weight;
            entry.sources.push(pattern.key || pattern.title || 'unknown');
        }
    }

    return votes;
}

/**
 * Get excluded numbers using Weighted Voting
 * @param {Array} patterns - All patterns with numbers and confidence
 * @param {Object} options - { minVotes: 2, maxNumbers: 50 }
 * @returns {Object} { excludedNumbers: Set, votesMap: Map, stats: {} }
 */
function getExclusionsByVoting(patterns, options = {}) {
    const {
        minVotes = STATS_CONFIG.VOTING_MIN_VOTES || 2,
        minWeight = STATS_CONFIG.VOTING_MIN_WEIGHT || 0.5,
        maxNumbers = STATS_CONFIG.VOTING_MAX_NUMBERS || 50
    } = options;

    const votes = calculateVotes(patterns);

    // Sort by weight (primary) then by votes (secondary)
    const sortedNumbers = Array.from(votes.entries())
        .filter(([num, info]) => info.votes >= minVotes || info.weight >= minWeight)
        .sort((a, b) => {
            if (b[1].weight !== a[1].weight) return b[1].weight - a[1].weight;
            return b[1].votes - a[1].votes;
        });

    // Take top N numbers
    const excluded = new Set();
    const includedNumbers = sortedNumbers.slice(0, maxNumbers);

    for (const [num, info] of includedNumbers) {
        excluded.add(num);
    }

    return {
        excludedNumbers: excluded,
        votesMap: votes,
        included: includedNumbers,
        stats: {
            totalPatterns: patterns.length,
            numbersWithVotes: votes.size,
            excludedCount: excluded.size,
            method: 'VOTING'
        }
    };
}

// ============= HISTORICAL WIN RATE =============
/**
 * Calculate historical win rate for a pattern
 * Based on how often the pattern's prediction was correct
 * @param {Object} stat - Pattern statistics with streaks
 * @returns {number} Win rate (0-1)
 */
function calculateWinRate(stat) {
    if (!stat || !stat.gapStats) return 0;

    // For each target length, check if lastGap < minGap historically led to correct predictions
    // This is approximated by: patterns that broke soon after lastGap < minGap

    // Simplified: Use count and avgGap to estimate reliability
    // Higher count + lower variance = more reliable

    let totalChecks = 0;
    let successfulPredictions = 0;

    for (const len in stat.gapStats) {
        const gapInfo = stat.gapStats[len];
        if (!gapInfo || gapInfo.count < 3) continue;

        // If minGap is close to avgGap, pattern is consistent
        const consistency = gapInfo.minGap / Math.max(gapInfo.avgGap, 1);

        // Count as "successful" if pattern shows consistency
        if (consistency > 0.3 && gapInfo.count >= 5) {
            successfulPredictions += 1;
        }
        totalChecks += 1;
    }

    if (totalChecks === 0) return 0;
    return successfulPredictions / totalChecks;
}

/**
 * Filter patterns by historical win rate
 * @param {Array} patterns - Patterns with stat reference
 * @param {number} minWinRate - Minimum win rate (0-1)
 * @returns {Array} Filtered patterns
 */
function filterByWinRate(patterns, minWinRate = 0.3) {
    return patterns.filter(p => {
        const winRate = p.winRate || calculateWinRate(p.stat);
        return winRate >= minWinRate;
    });
}

// ============= CONFIDENCE SCORE (kept from before) =============
const WEIGHTS = {
    gapRatio: 0.4,
    dataReliability: 0.3,
    streakIntensity: 0.2,
    winRate: 0.1
};

function calculateConfidence(params) {
    const {
        currentLen = 0,
        recordLen = 0,
        gapInfoGE = null,
        gapInfoExact = null,
        extensionGapInfo = null,
        stat = null
    } = params;

    const reasons = [];
    let gapRatioScore = 0;

    // Gap Ratio Score
    if (gapInfoGE && gapInfoGE.minGap !== null && gapInfoGE.lastGap < gapInfoGE.minGap) {
        const geRatio = (gapInfoGE.minGap - gapInfoGE.lastGap) / Math.max(gapInfoGE.avgGap, 1);
        gapRatioScore = Math.max(gapRatioScore, Math.min(geRatio, 1));
        reasons.push(`GE: Gap(${gapInfoGE.lastGap}) < Min(${gapInfoGE.minGap})`);
    }

    if (gapInfoExact && gapInfoExact.minGap !== null && gapInfoExact.lastGap < gapInfoExact.minGap) {
        const exactRatio = (gapInfoExact.minGap - gapInfoExact.lastGap) / Math.max(gapInfoExact.avgGap, 1);
        gapRatioScore = Math.max(gapRatioScore, Math.min(exactRatio, 1));
        reasons.push(`Exact: Gap(${gapInfoExact.lastGap}) < Min(${gapInfoExact.minGap})`);
    }

    if (extensionGapInfo && extensionGapInfo.minGap !== null && extensionGapInfo.count >= 3) {
        if (extensionGapInfo.lastGap < extensionGapInfo.minGap) {
            const extRatio = (extensionGapInfo.minGap - extensionGapInfo.lastGap) / Math.max(extensionGapInfo.avgGap, 1);
            gapRatioScore = Math.max(gapRatioScore, Math.min(extRatio, 1));
            reasons.push(`Ext: Gap(${extensionGapInfo.lastGap}) < Min(${extensionGapInfo.minGap})`);
        }
    }

    // Data Reliability
    const count = Math.max(
        gapInfoGE?.count || 0,
        gapInfoExact?.count || 0,
        extensionGapInfo?.count || 0
    );
    const dataReliabilityScore = Math.min(count / 50, 1);

    // Streak Intensity
    let streakIntensityScore = 0;
    if (recordLen > 0 && currentLen > 0) {
        streakIntensityScore = currentLen / recordLen;
        if (currentLen >= recordLen) {
            streakIntensityScore = 1.0;
            reasons.push(`Đạt kỷ lục mới: ${currentLen} >= ${recordLen}`);
        }
    }

    // Win Rate
    const winRateScore = stat ? calculateWinRate(stat) : 0;

    // Total score
    const totalScore =
        WEIGHTS.gapRatio * gapRatioScore +
        WEIGHTS.dataReliability * dataReliabilityScore +
        WEIGHTS.streakIntensity * streakIntensityScore +
        WEIGHTS.winRate * winRateScore;

    // Boost if both GE and Exact
    const bothGEandExact = gapInfoGE && gapInfoExact &&
        gapInfoGE.minGap !== null && gapInfoExact.minGap !== null &&
        gapInfoGE.lastGap < gapInfoGE.minGap && gapInfoExact.lastGap < gapInfoExact.minGap;

    const finalScore = bothGEandExact ? Math.min(totalScore * 1.2, 1.0) : totalScore;

    // Determine tier
    let tier = 'skip';
    if (finalScore >= 0.7) tier = 'critical';
    else if (finalScore >= 0.5) tier = 'high';
    else if (finalScore >= 0.3) tier = 'moderate';
    else if (finalScore >= 0.15) tier = 'low';

    return {
        score: Math.round(finalScore * 100) / 100,
        tier,
        reasons,
        components: { gapRatio: gapRatioScore, dataReliability: dataReliabilityScore, streakIntensity: streakIntensityScore, winRate: winRateScore }
    };
}

// ============= STRATEGIES =============
const STRATEGIES = {
    CONSERVATIVE: { minVotes: 3, minWeight: 0.8, maxNumbers: 35 },
    BALANCED: { minVotes: 2, minWeight: 0.5, maxNumbers: 50 },
    AGGRESSIVE: { minVotes: 1, minWeight: 0.2, maxNumbers: 80 }
};

function getStrategy(name = null) {
    const strategyName = name || STATS_CONFIG.EXCLUSION_STRATEGY || 'BALANCED';
    return STRATEGIES[strategyName] || STRATEGIES.BALANCED;
}

// ============= UNIFIED EXCLUSION FUNCTION =============
/**
 * Main function to get exclusions - COMBINED 6 METHODS
 * Methods:
 * 1. Confidence Score - tính điểm tin cậy tổng hợp
 * 2. Weighted Voting - mỗi pattern vote cho các số
 * 3. Historical Win Rate - lọc theo tỷ lệ thắng lịch sử
 * 4. Top-K Patterns - lấy K pattern điểm cao nhất
 * 5. Gap Ratio - kiểm tra lastGap vs minGap
 * 6. Streak Intensity - gần kỷ lục → điểm cao hơn
 * 
 * @param {Object} quickStats - Statistics data
 * @param {Object} options - { strategy: 'BALANCED', targetCount: 50-60 }
 * @returns {Object} { excludedNumbers: Set, explanations: [], stats: {} }
 */
async function getUnifiedExclusions(quickStats, options = {}) {
    const {
        strategy = STATS_CONFIG.EXCLUSION_STRATEGY || 'BALANCED',
        targetMin = 50,
        targetMax = 60
    } = options;

    const suggestionsController = require('../controllers/suggestionsController');

    // Step 1: Collect all patterns with all 6 method scores
    const allPatterns = [];

    for (const key in quickStats) {
        const stat = quickStats[key];
        if (!stat.current) continue;

        const currentLen = stat.current.length;
        let category, subcategory;

        if (key.includes(':')) {
            [category, subcategory] = key.split(':');
        } else {
            const patterns = [
                'LuiDeuLienTiep', 'TienDeuLienTiep', 'LuiLienTiep', 'TienLienTiep',
                'LuiDeu', 'TienDeu', 'VeLienTiep', 'VeCungGiaTri', 'VeSole', 'VeSoleMoi',
                'DongTien', 'DongLui', 'Lui', 'Tien'
            ];
            for (const p of patterns) {
                if (key.endsWith(p)) {
                    subcategory = p.charAt(0).toLowerCase() + p.slice(1);
                    category = key.slice(0, -p.length);
                    break;
                }
            }
            if (!subcategory) { category = key; subcategory = ''; }
        }

        if (!subcategory) continue;

        const isSoLePattern = (subcategory === 'veSole' || subcategory === 'veSoleMoi') &&
            key !== 'tienLuiSoLe' && key !== 'luiTienSoLe';
        const isTienLuiSoLePattern = subcategory === 'tienLuiSoLe' || subcategory === 'luiTienSoLe';
        const isTrendPattern = ['tienDeuLienTiep', 'luiDeuLienTiep', 'tienLienTiep', 'luiLienTiep',
            'dongTien', 'dongLui', 'tien', 'lui', 'tienDeu', 'luiDeu', 'tienLuiSoLe', 'luiTienSoLe'].includes(subcategory);

        // Tiến Lùi So Le: minLength = 4, nên chỉ xét khi currentLen >= 4
        if (isTienLuiSoLePattern && currentLen < 4) continue;

        const targetLen = isSoLePattern ? currentLen + 2 : currentLen + 1;

        const gapInfoGE = stat.gapStats?.[targetLen];
        const gapInfoExact = stat.exactGapStats?.[targetLen];
        const extensionGapInfo = stat.extensionGapStats?.[currentLen];

        // SỬ DỤNG MỐC KỶ LỤC MỚI THEO YÊU CẦU NGƯỜI DÙNG
        const recordLen = stat.computedMaxStreak || stat.longest?.[0]?.length || 0;

        const lotteryService = require('./lotteryService');
        const totalYears = lotteryService.getTotalYears();
        const targetCount = gapInfoExact ? gapInfoExact.count : 0;
        const targetFreqYear = targetCount / totalYears;

        // SỬ DỤNG 3 DẠNG LOẠI TRỪ CHÍNH XÁC: "Đạt kỷ lục", "Tới hạn siêu kỷ lục", "Tới hạn kỷ lục"
        let reason = '';
        let tier = 'low';
        let isRisky = false;

        const totalYearsStr = totalYears.toFixed(1);
        const freqStr = targetFreqYear.toFixed(2);

        if (currentLen >= recordLen && recordLen > 0) {
            isRisky = true;
            tier = 'critical'; // Đỏ
            reason = `Đạt kỷ lục: Chuỗi hiện tại (${currentLen} ngày) đã đạt mốc kỷ lục ${recordLen} ngày.`;
        } else if (targetFreqYear <= 0.5) {
            isRisky = true;
            tier = 'purple'; // Tím
            reason = `Tới hạn Siêu KL: Chuỗi ${targetLen} ngày chỉ xuất hiện ${targetCount} lần / ${totalYearsStr} năm (Tần suất: ${freqStr}/năm <= 0.5).`;
        } else if (targetFreqYear <= 1.5) {
            isRisky = true;
            tier = 'critical'; // Đỏ (Red)
            reason = `Tới hạn Kỷ lục: Chuỗi ${targetLen} ngày chỉ xuất hiện ${targetCount} lần / ${totalYearsStr} năm (Tần suất: ${freqStr}/năm <= 1.5).`;
        }

        if (!isRisky) {
            continue;
        }

        // Get numbers - sử dụng logic phù hợp với từng loại pattern
        let nums = [];
        if (isTrendPattern) {
            nums = suggestionsController.predictNextInSequence(stat, category, subcategory);
        } else if (subcategory === 'veSole' || subcategory === 'veSoleMoi' ||
            subcategory === 'veLienTiep' || subcategory === 'veCungGiaTri') {
            // Với các dạng Về so le / Về liên tiếp của cacDit, cacDau:
            // Không gọi getNumbersFromCategory (sẽ trả về 100 số), thay vào đó
            // xác định nhóm từ giá trị cuối trong chuỗi
            const lastVal = stat.current?.values?.[stat.current.values.length - 1] ?? stat.current?.value;
            if (lastVal !== null && lastVal !== undefined) {
                const numStr = String(lastVal).padStart(2, '0');
                if (category === 'cacDau') {
                    // Lấy đầu (chữ số hàng chục) của số cuối → loại cả nhóm có đầu đó
                    const dau = numStr[0];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[0] === dau);
                } else if (category === 'cacDit') {
                    // Lấy đít (chữ số hàng đơn vị) của số cuối → loại cả nhóm có đít đó
                    const dit = numStr[1];
                    nums = Array.from({ length: 100 }, (_, i) => i)
                        .filter(n => String(n).padStart(2, '0')[1] === dit);
                } else {
                    // Các category khác: dùng predictNextInSequence (xử lý veLienTiep đúng cho tong/hieu)
                    nums = suggestionsController.predictNextInSequence(stat, category, subcategory);
                    if (!nums || nums.length === 0) {
                        nums = suggestionsController.getNumbersFromCategory(category);
                    }
                }
            }
        } else {
            nums = suggestionsController.getNumbersFromCategory(category);
        }

        if (!nums || nums.length === 0) continue;
        nums = nums.filter(n => n !== null && n !== undefined && !isNaN(n)).map(n => parseInt(n, 10));
        if (nums.length === 0) continue;

        allPatterns.push({
            key, stat, category, subcategory,
            currentLen, recordLen,
            numbers: nums,
            tier: tier,
            combinedScore: tier === 'critical' ? 1 : 0.9, // Cho lên đầu
            title: getCategoryName(category, subcategory, key),
            explanation: reason,
            targetCount,
            targetFreqYear
        });
    }

    // Lọc các số loại trừ
    const excluded = new Set();
    const explanations = [];
    const usedPatterns = new Set();

    // Sắp xếp patterns: Tím / Đỏ lên trước
    allPatterns.sort((a, b) => b.combinedScore - a.combinedScore);

    for (const pattern of allPatterns) {
        let patternExcludedNums = [];
        for (const num of pattern.numbers) {
            excluded.add(num);
            patternExcludedNums.push(num);
        }

        const isSoLePattern = (pattern.subcategory === 'veSole' || pattern.subcategory === 'veSoleMoi') &&
            pattern.key !== 'tienLuiSoLe' && pattern.key !== 'luiTienSoLe';
        const targetLen = isSoLePattern ? pattern.currentLen + 2 : pattern.currentLen + 1;

        if (patternExcludedNums.length > 0 && !usedPatterns.has(pattern.key)) {
            usedPatterns.add(pattern.key);
            explanations.push({
                type: 'exclude',
                title: pattern.title,
                pattern: pattern.title, // Thêm pattern cho UI hiển thị
                streak: pattern.currentLen, // Cập nhật streak cho UI
                maxStreak: pattern.recordLen, // Cập nhật maxStreak
                currentGap: pattern.stat.gapStats?.[targetLen]?.lastGap || 0,
                minGapGE: pattern.stat.gapStats?.[targetLen]?.minGap || 0,
                minGapExact: pattern.stat.exactGapStats?.[targetLen]?.minGap || 0,
                explanation: pattern.explanation,
                reason: pattern.explanation, // Hỗ trợ tương thích UI cũ
                numbers: patternExcludedNums,
                tier: pattern.tier,
                combinedScore: Math.round(pattern.combinedScore * 100) / 100
            });
        }
    }

    return {
        excludedNumbers: excluded,
        explanations,
        stats: {
            strategy,
            method: '3_RECORD_REASONS',
            patternsTotal: allPatterns.length,
            excludedCount: excluded.size
        }
    };
}

// Helper functions
function getCategoryName(category, subcategory, key) {
    const categoryNames = {
        'cacSo': 'Các số', 'cacDau': 'Các Đầu', 'cacDit': 'Các Đít',
        'tong_tt_cac_tong': 'Tổng TT - Các tổng',
        'tong_moi_cac_tong': 'Tổng Mới - Các tổng',
        'hieu_cac_hieu': 'Hiệu - Các hiệu'
    };
    const subcategoryNames = {
        'veSole': 'Về so le', 'veSoleMoi': 'Về so le mới',
        'veLienTiep': 'Về liên tiếp', 'luiLienTiep': 'Lùi liên tiếp',
        'tienLienTiep': 'Tiến liên tiếp', 'luiDeuLienTiep': 'Lùi Đều',
        'tienDeuLienTiep': 'Tiến Đều', 'tien': 'Tiến', 'lui': 'Lùi'
    };

    let catName = categoryNames[category] || category;
    if (category.match(/^(tong_tt_|tong_moi_|hieu_)\d+_\d+$/)) {
        const match = category.match(/^(tong_tt_|tong_moi_|hieu_)(\d+)_(\d+)$/);
        if (match) {
            const prefix = match[1] === 'tong_tt_' ? 'Tổng TT' : (match[1] === 'tong_moi_' ? 'Tổng Mới' : 'Hiệu');
            catName = `${prefix} - (${match[2]},${match[3]})`;
        }
    }
    return `${catName} - ${subcategoryNames[subcategory] || subcategory}`;
}

function buildExplanation(confidence, gapInfoGE, gapInfoExact, extensionGapInfo) {
    const parts = [];
    if (gapInfoGE?.lastGap < gapInfoGE?.minGap) parts.push(`GE: ${gapInfoGE.lastGap}<${gapInfoGE.minGap}`);
    if (gapInfoExact?.lastGap < gapInfoExact?.minGap) parts.push(`Exact: ${gapInfoExact.lastGap}<${gapInfoExact.minGap}`);
    if (extensionGapInfo?.lastGap < extensionGapInfo?.minGap) parts.push(`Ext: ${extensionGapInfo.lastGap}<${extensionGapInfo.minGap}`);

    const tierIcon = { critical: '🔴', high: '🟠', moderate: '🟡', low: '⚪' }[confidence.tier] || '⚫';
    return `${tierIcon} ${Math.round(confidence.score * 100)}% - ${parts.join(', ') || 'Pattern match'}`;
}

function mapTier(tier) {
    return { critical: 'red', high: 'red', moderate: 'orange', low: 'light_red' }[tier] || null;
}

module.exports = {
    calculateVotes,
    getExclusionsByVoting,
    calculateWinRate,
    filterByWinRate,
    calculateConfidence,
    getStrategy,
    getUnifiedExclusions,
    STRATEGIES,
    WEIGHTS
};
