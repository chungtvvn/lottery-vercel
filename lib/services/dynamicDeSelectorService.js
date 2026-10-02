'use strict';

/**
 * lib/services/dynamicDeSelectorService.js
 *
 * Core Quantitative & Algorithm Engine for Shadow Monitor (/daily-advisor-shadow)
 * Northern Vietnam Lottery (XSMB) Đề Dynamic Meta-Selector
 *
 * Architecture & Features:
 * 1. Candidate Universe: 12 candidate methods (5 modern elite engines + 7 Pool 7 baselines)
 *    with disjoint VIP and Backup number partitioning.
 * 2. Multi-Tier X3/X1 Financial Model:
 *    - Daily Stake: (3 * N_VIP + 1 * N_Single) * 1000 VND (75M - 87M VND).
 *    - VIP overlap hit awards 252M (3 * 84M). Backup single hit awards 84M (1 * 84M).
 *    - Miss loses -Stake. Abstain costs 0 VND, PnL = 0 VND.
 *    - Financial Equality Conservation: profitK === payoutK - stakeK holds strictly.
 * 3. Objective Function & Quant Selector:
 *    - Expected Value: E[Profit] = P(VIP)*252M + P(Single)*84M - Stake.
 *    - Wilson 95% Confidence Interval Lower Bound (z = 1.95996) and dynamic break-even hit rate theta_BE.
 * 4. Anticipatory Transition Router:
 *    - Markov streak tracking (L4+, L3, L2, L1, W1, W2, W3+, INIT).
 *    - Laplace-smoothed transition probabilities with base hit rate prior (K = 3).
 *    - Graded rebound bonus delta (+0.04 to +0.08), fatigue penalty gamma (-0.12 at W2, -0.18 at W3+),
 *      anti-churn inertia eta (+0.03).
 *    - Proactive Rebound Swap: when incumbent is at W2/W3+ (exhausted) and an elite challenger is at
 *      L1/L2 with high rebound probability (>= 0.40), proactively swap before incumbent breaks.
 *    - Anti-churning significance test: challenger must have Z >= 1.645 or delta Wilson >= 0.025 to overturn incumbent.
 * 5. Smart Abstain Governor:
 *    - 3-trigger evaluation:
 *      (1) max E[Profit] < 0 across all candidates
 *      (2) Wilson 95% lower bound of candidate < dynamic break-even theta_BE
 *      (3) Extreme ensemble Jaccard divergence D_ensemble > 0.85
 *    - Capital preservation telemetry (capitalPreservedK, cumulativeCapitalPreservedK).
 *    - Schmitt-trigger hysteresis recovery to prevent chattering.
 * 6. 100% Strict Point-In-Time (Strict PIT): zero future data leakage.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// 1. CONSTANTS & CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = Object.freeze({
    Z_SCORE: 1.2815515655446004,     // One-sided 90% CI z-score (matching dailyMethodAdvisorService)
    Z_90: 1.2815515655446004,        // One-sided 90% CI z-score
    Z_95: 1.95996398454,             // Two-sided 95% CI z-score
    PAYOUT_VIP_K: 252000,            // 252M VND payout for VIP Tier hit (3 units * 84M)
    PAYOUT_BACKUP_K: 84000,          // 84M VND payout for Backup/Standard Tier hit (1 unit * 84M)
    REALISTIC_PAYOUT_VIP_K: 244500,  // Realistic payout after slip (3 units * 81.5M)
    REALISTIC_PAYOUT_BACKUP_K: 81500,// Realistic payout after slip (1 unit * 81.5M)
    DIVERGENCE_ENTER_THRESHOLD: 0.85,// Enters ABSTAIN if D_ensemble > 0.85 (mean Jaccard < 15%)
    DIVERGENCE_EXIT_THRESHOLD: 0.75, // Exits ABSTAIN if D_ensemble <= 0.75 (mean Jaccard >= 25%)
    EV_EXIT_BUFFER_K: 5000,          // Exits ABSTAIN requires max E[Profit] >= +5,000K VND buffer
    WILSON_EXIT_BUFFER: 0.02,        // Exits ABSTAIN requires Wilson >= exitDisasterFloor (+2.0% buffer)
    WILSON_DISASTER_TOLERANCE: 0.25, // Disaster floor tolerance (75% of theta_BE)
    MIN_OBSERVATIONS: 20,            // Minimum observation trials for Disaster Floor Gate activation
    MIN_SELECTION_OBSERVATIONS: 15,  // Threshold for candidate eligibility in top-rank selection
    WEAK_PRIOR_ALPHA: 4.3,           // Prior hits for 43-number lottery baseline
    WEAK_PRIOR_BETA: 5.7,            // Prior misses (total prior weight K=10)
    VIP_PRIOR_WEIGHT: 5.0,           // Bayesian shrinkage weight for VIP hit ratio
    PRIOR_K: 3,                      // Laplace smoothing pseudo-counts for transition probability
    FALLBACK_BASE_RATE: 0.40,        // Fallback base hit rate
    INERTIA_BONUS: 0.03,             // Anti-churn inertia bonus for incumbent
    PROACTIVE_SWAP_THRESHOLD: 0.40,  // Minimum rebound probability for proactive swap
    DOMINANCE_MARGIN: 0.05           // Score dominance margin required for proactive swap
});

const ELITE_ENGINE_IDS = Object.freeze([
    'adaptiveDualMerge',
    'pentaCoreDe',
    'deMarkovGapHazard',
    'dePositionalGraphFlow',
    'dualMerge'
]);

const POOL_7_METHOD_IDS = Object.freeze([
    'dedupEdge75Hold70',
    'dedupEdge50CombinedB40S05',
    'dedupEdge50Hold70',
    'dedupDropoffHold70',
    'avgEdge50Hold70',
    'chainSmallFirstHold70',
    'edgeHold70'
]);

const ALL_CANDIDATE_IDS = Object.freeze([
    ...ELITE_ENGINE_IDS,
    ...POOL_7_METHOD_IDS
]);

const METHOD_METADATA_REGISTRY = Object.freeze({
    adaptiveDualMerge: {
        methodId: 'adaptiveDualMerge',
        methodLabel: 'Đề Thích Ứng Alpha X3/X1',
        category: 'elite',
        description: 'Đề Thích Ứng Alpha: Giao thoa X3 và Độc lập X1 theo nhịp Tấn công/Phòng thủ'
    },
    pentaCoreDe: {
        methodId: 'pentaCoreDe',
        methodLabel: 'Đề Ngũ Tinh Consensus AI',
        category: 'elite',
        description: 'Đề Ngũ Tinh Consensus AI: Đồng thuận 5 động cơ Đề độc lập, 16 số Siêu VIP X3'
    },
    deMarkovGapHazard: {
        methodId: 'deMarkovGapHazard',
        methodLabel: 'Đề Markov Bậc 2 & Weibull Gap Hazard',
        category: 'elite',
        description: 'Mô hình Markov bậc 2 kết hợp hàm rủi ro Weibull Gap, Top 17 VIP X3'
    },
    dePositionalGraphFlow: {
        methodId: 'dePositionalGraphFlow',
        methodLabel: 'Cầu Đồ Thị Vị Trí 54 Đầu Cầu',
        category: 'elite',
        description: 'Đồ thị liên thông 54 vị trí giải XSMB, Top 17 VIP X3'
    },
    dualMerge: {
        methodId: 'dualMerge',
        methodLabel: 'Đề Gộp Tiêu Chuẩn Sweet-Spot',
        category: 'elite',
        description: 'Đề Gộp Tiêu Chuẩn: Vùng giao thoa ngọt X3 và bọc lót X1'
    },
    dedupEdge75Hold70: {
        methodId: 'dedupEdge75Hold70',
        methodLabel: 'Đề Biên 75 Hold 70',
        category: 'pool7',
        description: 'Biên 75% khử trùng dữ liệu lịch sử Hold 70 ngày'
    },
    dedupEdge50CombinedB40S05: {
        methodId: 'dedupEdge50CombinedB40S05',
        methodLabel: 'Đề Boost B40S05 Hold 70',
        category: 'pool7',
        description: 'Edge 50% kết hợp Boost B40S05'
    },
    dedupEdge50CombinedB40S05Hold70: {
        methodId: 'dedupEdge50CombinedB40S05Hold70',
        methodLabel: 'Đề Boost B40S05 Hold 70',
        category: 'pool7',
        description: 'Edge 50% kết hợp Boost B40S05'
    },
    dedupEdge50Hold70: {
        methodId: 'dedupEdge50Hold70',
        methodLabel: 'Đề Biên 50 Hold 70',
        category: 'pool7',
        description: 'Biên 50% khử trùng lịch sử Hold 70 ngày'
    },
    dedupDropoffHold70: {
        methodId: 'dedupDropoffHold70',
        methodLabel: 'Đề Dropoff Khử Trùng Hold 70',
        category: 'pool7',
        description: 'Dropoff khử trùng tập số Hold 70 ngày'
    },
    avgEdge50Hold70: {
        methodId: 'avgEdge50Hold70',
        methodLabel: 'Đề Dropoff Trung Bình 50% Hold 70',
        category: 'pool7',
        description: 'Dropoff trung bình từng số 50% Hold 70 ngày'
    },
    chainSmallFirstHold70: {
        methodId: 'chainSmallFirstHold70',
        methodLabel: 'Đề Chuỗi Nhỏ Trước Hold 70',
        category: 'pool7',
        description: 'Chuỗi nhỏ ưu tiên trước Hold 70 ngày'
    },
    edgeHold70: {
        methodId: 'edgeHold70',
        methodLabel: 'Đề Nhịp Block Trước Hold 70',
        category: 'pool7',
        description: 'Nhịp Block trước Hold 70 ngày'
    }
});

const REBOUND_BONUSES = Object.freeze({
    'L1': 0.04,
    'L2': 0.06,
    'L3': 0.08,
    'L4+': 0.05
});

const FATIGUE_PENALTIES = Object.freeze({
    'W2': 0.12,
    'W3+': 0.18
});

const DEFAULT_ROUTER_CONFIG = Object.freeze({
    priorK: DEFAULT_CONFIG.PRIOR_K,
    fallbackBaseRate: DEFAULT_CONFIG.FALLBACK_BASE_RATE,
    inertiaBonus: DEFAULT_CONFIG.INERTIA_BONUS,
    proactiveSwapThreshold: DEFAULT_CONFIG.PROACTIVE_SWAP_THRESHOLD,
    dominanceMargin: DEFAULT_CONFIG.DOMINANCE_MARGIN,
    enableProactiveSwap: true
});

// ============================================================================
// 2. NUMBER SET NORMALIZATION & SANITIZATION
// ============================================================================

/**
 * Normalizes an array of numbers into unique sorted integers in [00..99].
 * @param {Array<number|string>} values
 * @returns {number[]} Unique sorted integers
 */
function normalizeNumbers(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 100))]
        .sort((a, b) => a - b);
}

/**
 * Sanitizes candidate number sets enforcing strict disjoint partitioning:
 * - vipNumbers: unique sorted integers in [00..99]
 * - backupNumbers: unique sorted integers in [00..99], strictly excluding any in vipNumbers
 * - numbers: disjoint union of vipNumbers and backupNumbers
 * - stakeK: (3 * N_VIP + 1 * N_Backup) * 1000
 *
 * @param {Array<number>} rawVip
 * @param {Array<number>} rawBackup
 * @returns {Object} { vipNumbers, backupNumbers, numbers, vipCount, backupCount, totalCount, stakeK }
 */
function sanitizeCandidateSets(rawVip = [], rawBackup = []) {
    const cleanVip = normalizeNumbers(rawVip);
    const vipSet = new Set(cleanVip);
    const cleanBackup = normalizeNumbers(rawBackup).filter(n => !vipSet.has(n));
    const fullUnion = [...cleanVip, ...cleanBackup].sort((a, b) => a - b);
    const stakeK = (cleanVip.length * 3 + cleanBackup.length * 1) * 1000;
    return {
        vipNumbers: cleanVip,
        backupNumbers: cleanBackup,
        numbers: fullUnion,
        vipCount: cleanVip.length,
        backupCount: cleanBackup.length,
        totalCount: fullUnion.length,
        stakeK
    };
}

/**
 * Generates deterministic 30 numbers for a given date and offset.
 * Strictly self-contained, reproducible, zero external lookahead.
 */
function getDeterministic30(dateStr, methodOffset = 0) {
    let hash = 0;
    const str = String(dateStr || '2026-01-01') + '_' + String(methodOffset);
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    const all = Array.from({ length: 100 }, (_, i) => i);
    for (let i = all.length - 1; i > 0; i--) {
        const j = Math.abs((hash * (i + 1) + methodOffset * 7)) % (i + 1);
        [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, 30).sort((a, b) => a - b);
}

// ============================================================================
// 3. FINANCIAL & PAYOUT ENGINE (PnL CONSERVATION)
// ============================================================================

/**
 * Multi-Tier X3/X1 Stake Calculator
 * Stake = (3 * |VIP| + 1 * |Backup|) * unitStakeK
 */
function calculateTieredStakeK(vipCount = 0, backupCount = 0, unitStakeK = 1000) {
    return (Number(vipCount || 0) * 3 + Number(backupCount || 0) * 1) * unitStakeK;
}

/**
 * Multi-Tier X3/X1 Settlement Law:
 * - Special in VIP: payout = 252,000K (252M VND)
 * - Special in Backup/Single: payout = 84,000K (84M VND)
 * - Special not in Set: payout = 0K
 * - Abstain: stakeK = 0, payoutK = 0, profitK = 0
 * Financial Equality Conservation Law:
 *   profitK = payoutK - stakeK
 */
function calculatePayoutAndProfitK({
    action = 'BET',
    actualSpecial = null,
    vipNumbers = [],
    backupNumbers = [],
    stakeK = 0,
    isAbstained = false,
    payoutVIPK = DEFAULT_CONFIG.PAYOUT_VIP_K,
    payoutBackupK = DEFAULT_CONFIG.PAYOUT_BACKUP_K
} = {}) {
    if (action === 'ABSTAIN' || isAbstained || actualSpecial === null || actualSpecial === undefined || actualSpecial === '') {
        return {
            stakeK: 0,
            payoutK: 0,
            profitK: 0,
            hit: false,
            isHit: false,
            isVipHit: false,
            hitType: (action === 'ABSTAIN' || isAbstained) ? 'NONE' : 'UNSETTLED'
        };
    }

    const num = Number(actualSpecial);
    const vips = normalizeNumbers(vipNumbers);
    const backups = normalizeNumbers(backupNumbers);

    const isVip = vips.includes(num);
    const isBackup = !isVip && backups.includes(num); // VIP tier takes strict precedence
    const isHit = isVip || isBackup;

    let payoutK = 0;
    let hitType = 'NONE';

    if (isVip) {
        payoutK = payoutVIPK;
        hitType = 'VIP_X3';
    } else if (isBackup) {
        payoutK = payoutBackupK;
        hitType = 'BACKUP_X1';
    }

    const effectiveStakeK = Number(stakeK) || 0;
    const profitK = payoutK - effectiveStakeK;

    return {
        stakeK: effectiveStakeK,
        payoutK,
        profitK,
        hit: isHit,
        isHit,
        isVipHit: isVip,
        hitType
    };
}

/**
 * Universal Multi-Schema Ledger Row Extractor:
 * Supports all 5 Elite Engines (adaptiveDualMerge, pentaCoreDe, deMarkovGapHazard,
 * dePositionalGraphFlow, dualMerge) and Pool 7 baselines across all historical schemas.
 *
 * Guarantees mathematical partition:
 * - A row is either a VIP hit (X3), a Backup hit (X1), or a Miss.
 * - totalWins === vipWins + backupWins strictly holds.
 *
 * @param {Object} row Raw ledger row
 * @returns {Object|null} Normalized ledger metrics
 */
function extractLedgerRowInfo(row) {
    if (!row) return null;

    // 1. Extract actual winning number
    const actual = row.actual !== undefined && row.actual !== null && row.actual !== ''
        ? Number(row.actual)
        : (row.actualSpecial !== undefined && row.actualSpecial !== null && row.actualSpecial !== '' ? Number(row.actualSpecial) : null);

    // 2. Extract VIP number set (Tier X3)
    let vips = [];
    if (Array.isArray(row.vipNumbers)) vips = row.vipNumbers;
    else if (Array.isArray(row.intersectionX2)) vips = row.intersectionX2;
    else if (Array.isArray(row.intersection)) vips = row.intersection;

    // 3. Extract Backup number set (Tier X1)
    let backups = [];
    if (Array.isArray(row.backupNumbers)) backups = row.backupNumbers;
    else if (Array.isArray(row.uniqueSinglesX1)) backups = row.uniqueSinglesX1;
    else if (Array.isArray(row.uniqueSingles)) backups = row.uniqueSingles;

    // 4. Extract Full number union
    let allNumbers = [];
    if (Array.isArray(row.numbers)) allNumbers = row.numbers;
    else if (Array.isArray(row.fullUnion)) allNumbers = row.fullUnion;
    else if (Array.isArray(row.union)) allNumbers = row.union;
    else if (vips.length > 0 || backups.length > 0) {
        allNumbers = Array.from(new Set([...vips, ...backups]));
    }

    // 5. Robust VIP Hit Evaluation (Precedence 1)
    let isVipHit = false;
    if (row.isVipHit !== undefined) {
        isVipHit = Boolean(row.isVipHit);
    } else if (row.isX3 === true) {
        isVipHit = true;
    } else if (row.hitType === 'VIP_X3' || row.hitType === 'win_x3') {
        isVipHit = true;
    } else if (actual !== null && vips.length > 0 && vips.includes(actual)) {
        isVipHit = true;
    } else if ((row.payoutK || 0) >= 252000) {
        isVipHit = true;
    }

    // 6. Robust Backup Hit Evaluation (Precedence 2)
    let isBackupHit = false;
    if (row.hitType === 'BACKUP_X1' || row.hitType === 'win_x1') {
        isBackupHit = !isVipHit;
    } else if (actual !== null && backups.length > 0 && backups.includes(actual) && !isVipHit) {
        isBackupHit = true;
    } else if (actual !== null && allNumbers.includes(actual) && !isVipHit) {
        isBackupHit = true;
    } else if ((row.payoutK || 0) === 84000 && !isVipHit) {
        isBackupHit = true;
    }

    // 7. Robust Overall Win Evaluation (Precedence 3)
    let isHit = false;
    if (isVipHit || isBackupHit) {
        isHit = true;
    } else if (row.isHit !== undefined) {
        isHit = Boolean(row.isHit);
    } else if (row.hit !== undefined && row.hit !== null) {
        isHit = Boolean(row.hit);
    } else if (row.hitDays !== undefined) {
        isHit = row.hitDays > 0;
    } else if (row.hitNumber !== undefined && row.hitNumber !== null) {
        isHit = true;
    } else if (actual !== null && allNumbers.length > 0 && allNumbers.includes(actual)) {
        isHit = true;
    } else if ((row.betProfitK || 0) > 0 || (row.profitK || 0) > 0) {
        isHit = true;
    }

    // If isHit is true but neither isVipHit nor isBackupHit was set (e.g. flat pool7 hit)
    if (isHit && !isVipHit && !isBackupHit) {
        isBackupHit = true;
    }

    // 8. Financial Conservation Settlement
    const stakeK = row.stakeK !== undefined
        ? Number(row.stakeK)
        : (vips.length > 0 ? (vips.length * 3 + (backups.length || 0)) * 1000 : 30000);
    const payoutK = row.payoutK !== undefined
        ? Number(row.payoutK)
        : (isVipHit ? 252000 : (isHit ? 84000 : 0));
    const profitK = row.profitK !== undefined
        ? Number(row.profitK)
        : (payoutK - stakeK);

    return {
        date: row.date || row.period || row.predictionDate,
        actual,
        vips,
        backups,
        allNumbers,
        isHit,
        isVipHit,
        isBackupHit,
        stakeK,
        payoutK,
        profitK
    };
}

/**
 * Dynamic Break-Even Hit Rate Formula:
 * theta_BE = Stake / (Payout_Backup + (Payout_VIP - Payout_Backup) * rho_VIP)
 * where rho_VIP = P(VIP) / P(Union)
 */
function computeDynamicBreakEven(
    stakeK,
    vipRatio = 0,
    payoutVIPK = DEFAULT_CONFIG.PAYOUT_VIP_K,
    payoutBackupK = DEFAULT_CONFIG.PAYOUT_BACKUP_K
) {
    const stake = Number(stakeK) || 0;
    if (stake <= 0) return 0;
    const rho = Math.max(0, Math.min(1, Number(vipRatio) || 0));
    const effectivePayoutPerHit = payoutBackupK + (payoutVIPK - payoutBackupK) * rho;
    if (effectivePayoutPerHit <= 0) return 0.3571;
    return Number((stake / effectivePayoutPerHit).toFixed(6));
}

const computeDynamicBreakEvenHitRate = computeDynamicBreakEven;

/**
 * Expected Profit (EV) Formulation:
 * E[Profit] = p_VIP * 252,000 + p_Backup * 84,000 - Stake
 */
function computeExpectedProfitK(probVip, probBackup, stakeK, payoutVIPK = DEFAULT_CONFIG.PAYOUT_VIP_K, payoutBackupK = DEFAULT_CONFIG.PAYOUT_BACKUP_K) {
    const pVIP = Math.max(0, Math.min(1, Number(probVip) || 0));
    const pBackup = Math.max(0, Math.min(1, Number(probBackup) || 0));
    const stake = Number(stakeK) || 0;
    return Number((pVIP * payoutVIPK + pBackup * payoutBackupK - stake).toFixed(2));
}

// ============================================================================
// 4. STATISTICAL & QUANT ENGINE (WILSON 95% & ENSEMBLE DIVERGENCE)
// ============================================================================

/**
 * Wilson 95% Confidence Interval Lower Bound
 * W95-(w, n) = (p + z^2/(2n) - z * sqrt((p(1-p) + z^2/(4n^2))/n)) / (1 + z^2/n)
 */
function computeWilsonScore95(wins, trials, z = DEFAULT_CONFIG.Z_95) {
    const n = Number(trials) || 0;
    const w = Number(wins) || 0;
    if (n <= 0) return 0;
    const p = Math.max(0, Math.min(1, w / n));
    const z2 = z * z;
    const denom = 1 + z2 / n;
    const center = p + z2 / (2 * n);
    const rad = (p * (1 - p)) / n + z2 / (4 * n * n);
    const margin = z * Math.sqrt(Math.max(0, rad));
    const lower = Math.max(0, (center - margin) / denom);
    return Number(lower.toFixed(6));
}

const calculateWilsonLower95 = computeWilsonScore95;

/**
 * Two-Sample Pooled Z-score Test for Anti-Churning Significance:
 * Z = (p_C - p_I) / sqrt(p_pooled * (1 - p_pooled) * (1/n_C + 1/n_I))
 */
function computeAntiChurningZ(winsC, nC, winsI, nI) {
    if (nC <= 0 || nI <= 0) return 0;
    const pC = winsC / nC;
    const pI = winsI / nI;
    const pooledP = (winsC + winsI) / (nC + nI);
    if (pooledP <= 0 || pooledP >= 1) return 0;
    const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / nC + 1 / nI));
    return se > 0 ? (pC - pI) / se : 0;
}

/**
 * Calculates Pairwise Jaccard Ensemble Divergence:
 * D_ensemble = 1 - average pairwise Jaccard similarity across candidate sets
 * @param {Array<Object>|Array<Array<number>>} candidates Array of candidates or number arrays
 */
function computeEnsembleDivergence(candidates = []) {
    const validSets = [];
    (candidates || []).forEach(c => {
        const nums = Array.isArray(c) ? c : (c?.numbers || []);
        if (Array.isArray(nums) && nums.length > 0) {
            validSets.push(new Set(normalizeNumbers(nums)));
        }
    });

    const K = validSets.length;
    if (K < 2) {
        return {
            D_ensemble: 0.0,
            meanJaccard: 1.0,
            pairsEvaluated: 0,
            pairwiseDetails: [],
            consensusCounts: { highConsensusCount: 0, totalUniqueNumbers: 0 }
        };
    }

    let totalJaccard = 0;
    let pairsCount = 0;
    const pairwiseDetails = [];

    for (let i = 0; i < K; i++) {
        for (let j = i + 1; j < K; j++) {
            const setA = validSets[i];
            const setB = validSets[j];
            let intersectionSize = 0;
            setA.forEach(val => {
                if (setB.has(val)) intersectionSize++;
            });
            const unionSize = setA.size + setB.size - intersectionSize;
            const jaccard = unionSize > 0 ? intersectionSize / unionSize : 0;
            totalJaccard += jaccard;
            pairsCount++;
            pairwiseDetails.push({
                intersectionSize,
                unionSize,
                jaccard: Number(jaccard.toFixed(4))
            });
        }
    }

    const meanJaccard = pairsCount > 0 ? totalJaccard / pairsCount : 1.0;
    const D_ensemble = Number(Math.max(0, Math.min(1, 1 - meanJaccard)).toFixed(4));

    const voteMap = new Uint8Array(100);
    validSets.forEach(s => s.forEach(num => voteMap[num]++));
    let highConsensusCount = 0;
    let totalUniqueNumbers = 0;
    for (let num = 0; num < 100; num++) {
        if (voteMap[num] > 0) totalUniqueNumbers++;
        if (voteMap[num] >= Math.min(3, K)) highConsensusCount++;
    }

    return {
        D_ensemble,
        meanJaccard: Number(meanJaccard.toFixed(4)),
        pairsEvaluated: pairsCount,
        pairwiseDetails,
        consensusCounts: {
            highConsensusCount,
            totalUniqueNumbers
        }
    };
}

// ============================================================================
// 5. ANTICIPATORY TRANSITION ROUTER (STREAKS & PROACTIVE SWAP)
// ============================================================================

/**
 * Maps streak count to discrete streak state tag:
 * S in { L4+, L3, L2, L1, W1, W2, W3+, INIT }
 */
function getStreakStateTag(streak) {
    const s = Number(streak) || 0;
    if (s <= -4) return 'L4+';
    if (s === -3) return 'L3';
    if (s === -2) return 'L2';
    if (s === -1) return 'L1';
    if (s === 1) return 'W1';
    if (s === 2) return 'W2';
    if (s >= 3) return 'W3+';
    return 'INIT';
}

/**
 * Semantic Vietnamese description for streak state.
 */
function getStreakStateSemanticLabel(streak) {
    const s = Number(streak) || 0;
    if (s <= -4) return `Trượt sâu ${Math.abs(s)} kỳ (Vùng nén hồi quy cực đại)`;
    if (s === -3) return 'Trượt 3 kỳ (Điểm rơi nổ bù cực đại)';
    if (s === -2) return 'Trượt 2 kỳ (Điểm rơi kim cương nổ bù)';
    if (s === -1) return 'Vừa trượt 1 kỳ (Điểm rơi phục hồi nhịp)';
    if (s === 1) return 'Vừa thắng 1 kỳ (Quán tính xuất phát)';
    if (s === 2) return 'Thắng thông 2 kỳ (Ngưỡng bão hòa quán tính)';
    if (s >= 3) return `Ăn thông ${s} kỳ (Vùng kiệt sức quá nhiệt)`;
    return 'Khởi tạo nhịp';
}

/**
 * Computes 100% Strict Point-In-Time transition metrics for a method's historical ledger.
 * Only data indices < dayIdx (or prior records) are used.
 *
 * @param {Array<Object>} ledger Array of historical outcome records
 * @param {number} dayIdx Strict upper bound index (records < dayIdx)
 * @param {Object} options Configuration options
 */
function computePITTransitionMetricsForLedger(ledger = [], dayIdx = 0, options = {}) {
    const priorK = options.priorK ?? DEFAULT_ROUTER_CONFIG.priorK;
    const fallbackBaseRate = options.fallbackBaseRate ?? DEFAULT_ROUTER_CONFIG.fallbackBaseRate;

    const stateStats = {
        'L4+': { wins: 0, total: 0 },
        'L3':  { wins: 0, total: 0 },
        'L2':  { wins: 0, total: 0 },
        'L1':  { wins: 0, total: 0 },
        'W1':  { wins: 0, total: 0 },
        'W2':  { wins: 0, total: 0 },
        'W3+': { wins: 0, total: 0 }
    };

    let curStreak = 0;
    let totalWins = 0;
    let totalCount = 0;
    const limit = Math.min(ledger.length, dayIdx);

    for (let i = 0; i < limit; i++) {
        const row = ledger[i];
        if (!row) continue;
        const rowInfo = extractLedgerRowInfo(row);
        const isHit = rowInfo ? rowInfo.isHit : Boolean(
            row.isHit ??
            row.hit ??
            ((row.profitK || 0) > 0) ??
            (Array.isArray(row.numbers) && row.actualSpecial !== undefined && row.numbers.includes(row.actualSpecial))
        );

        if (i > 0 && curStreak !== 0) {
            const tag = getStreakStateTag(curStreak);
            if (stateStats[tag]) {
                stateStats[tag].total++;
                if (isHit) stateStats[tag].wins++;
            }
        }

        totalCount++;
        if (isHit) {
            totalWins++;
            curStreak = curStreak > 0 ? curStreak + 1 : 1;
        } else {
            curStreak = curStreak < 0 ? curStreak - 1 : -1;
        }
    }

    const baseWinRate = totalCount > 0 ? totalWins / totalCount : fallbackBaseRate;
    const curTag = getStreakStateTag(curStreak);
    const stat = stateStats[curTag] || { wins: 0, total: 0 };
    const condProb = stat.total > 0
        ? (stat.wins + priorK * baseWinRate) / (stat.total + priorK)
        : baseWinRate;

    return {
        curStreak,
        curTag,
        stateSemanticLabel: getStreakStateSemanticLabel(curStreak),
        baseWinRate: Number(baseWinRate.toFixed(4)),
        condProb: Number(condProb.toFixed(4)),
        sampleTotal: stat.total,
        sampleWins: stat.wins,
        rawRate: stat.total > 0 ? Number((stat.wins / stat.total).toFixed(4)) : Number(baseWinRate.toFixed(4)),
        stateStats,
        totalWins,
        totalCount
    };
}

/**
 * Builds Anticipatory Candidate Matrix evaluating streak transitions, rebound bonuses,
 * fatigue penalties, and inertia.
 */
function computeAnticipatoryDeCandidateMatrix(methodsLedgersMap = {}, dayIdx = 0, currentChosenMethod = null, config = {}) {
    const reboundBonuses = config.reboundBonuses || REBOUND_BONUSES;
    const fatiguePenalties = config.fatiguePenalties || FATIGUE_PENALTIES;
    const inertiaBonus = config.inertiaBonus !== undefined ? config.inertiaBonus : DEFAULT_ROUTER_CONFIG.inertiaBonus;

    const matrix = [];

    for (const [mId, ledger] of Object.entries(methodsLedgersMap)) {
        if (!ledger || !Array.isArray(ledger)) continue;
        const pitMetrics = computePITTransitionMetricsForLedger(ledger, dayIdx, config);
        const isIncumbent = (mId === currentChosenMethod);

        const delta = reboundBonuses[pitMetrics.curTag] || 0;
        const gamma = (fatiguePenalties[pitMetrics.curTag] || 0) * (isIncumbent ? 0.67 : 1.0);
        const eta = isIncumbent ? inertiaBonus : 0;

        const anticipatoryScore = Number((pitMetrics.condProb + delta - gamma + eta).toFixed(4));

        matrix.push({
            methodId: mId,
            curStreak: pitMetrics.curStreak,
            curTag: pitMetrics.curTag,
            stateSemanticLabel: pitMetrics.stateSemanticLabel,
            baseWinRate: pitMetrics.baseWinRate,
            condProb: pitMetrics.condProb,
            delta,
            gamma,
            eta,
            anticipatoryScore,
            sampleTotal: pitMetrics.sampleTotal,
            sampleWins: pitMetrics.sampleWins,
            rawRate: pitMetrics.rawRate,
            isIncumbent,
            totalWins: pitMetrics.totalWins,
            totalCount: pitMetrics.totalCount
        });
    }

    matrix.sort((a, b) => b.anticipatoryScore - a.anticipatoryScore);
    return matrix;
}

/**
 * Anticipatory Router Dispatcher:
 * Executes Proactive Rebound Swap or Momentum selection.
 */
function selectAnticipatoryRouterMethod({
    currentMethod = null,
    candidateMatrix = [],
    config = {}
}) {
    const proactiveSwapThreshold = config.proactiveSwapThreshold ?? DEFAULT_ROUTER_CONFIG.proactiveSwapThreshold;
    const dominanceMargin = config.dominanceMargin ?? DEFAULT_ROUTER_CONFIG.dominanceMargin;
    const enableProactiveSwap = config.enableProactiveSwap !== false;

    const candMap = new Map(candidateMatrix.map(c => [c.methodId, c]));
    const incumbent = currentMethod ? candMap.get(currentMethod) : null;

    // Rule 1: Proactive Rebound Swap from exhausted incumbent (W2 / W3+)
    if (enableProactiveSwap && incumbent && (incumbent.curTag === 'W2' || incumbent.curTag === 'W3+')) {
        const reboundCandidates = candidateMatrix.filter(c =>
            c.methodId !== currentMethod &&
            (c.curTag === 'L1' || c.curTag === 'L2' || c.curTag === 'L3') &&
            c.condProb >= proactiveSwapThreshold
        );

        if (reboundCandidates.length > 0) {
            reboundCandidates.sort((a, b) => b.anticipatoryScore - a.anticipatoryScore);
            const topChallenger = reboundCandidates[0];

            if (topChallenger.anticipatoryScore - incumbent.anticipatoryScore >= dominanceMargin) {
                const pct = (topChallenger.condProb * 100).toFixed(1);
                return {
                    selectedMethodId: topChallenger.methodId,
                    switchPhase: 'REBOUND',
                    switchReason: `Chủ động đảo pha đón đầu ${topChallenger.methodId} (${topChallenger.curTag}, P=${pct}%) trước khi đương kim ${currentMethod} (${incumbent.curTag}) kiệt sức gãy nhịp`,
                    confidenceBadge: `⚡ ĐÓN ĐẦU ĐẢO PHA NỔ BÙ (${pct}% · ${topChallenger.curTag})`,
                    routerTelemetry: {
                        ruleTriggered: 'PROACTIVE_REBOUND_SWAP',
                        incumbentMethodId: currentMethod,
                        incumbentTag: incumbent.curTag,
                        challengerMethodId: topChallenger.methodId,
                        challengerTag: topChallenger.curTag,
                        challengerProb: topChallenger.condProb,
                        scoreDelta: Number((topChallenger.anticipatoryScore - incumbent.anticipatoryScore).toFixed(4))
                    }
                };
            }
        }
    }

    // Rule 2: Anti-churning Significance Guard if incumbent is present and not fatigued
    if (incumbent && incumbent.curTag !== 'W2' && incumbent.curTag !== 'W3+' && candidateMatrix.length > 0) {
        const challenger = candidateMatrix[0];
        if (challenger && challenger.methodId !== currentMethod) {
            const z = computeAntiChurningZ(challenger.totalWins || 0, challenger.totalCount || 0, incumbent.totalWins || 0, incumbent.totalCount || 0);
            const wIncumbent = computeWilsonScore95(incumbent.totalWins || 0, incumbent.totalCount || 0);
            const wChallenger = computeWilsonScore95(challenger.totalWins || 0, challenger.totalCount || 0);
            const deltaW = wChallenger - wIncumbent;

            if (z < 1.645 && deltaW < 0.025) {
                // Challenger fails significance -> retain incumbent to avoid churning
                const pct = (incumbent.condProb * 100).toFixed(1);
                return {
                    selectedMethodId: incumbent.methodId,
                    switchPhase: incumbent.curStreak < 0 ? 'REBOUND' : 'MOMENTUM',
                    switchReason: `Giữ đương kim ${incumbent.methodId} do đối thủ ${challenger.methodId} chưa đạt ngưỡng ý nghĩa thống kê (Z=${z.toFixed(2)} < 1.645, DeltaW=${deltaW.toFixed(3)} < 0.025)`,
                    confidenceBadge: `🛡️ GIỮ ĐƯƠNG KIM BẢO TOÀN (${pct}% · ${incumbent.curTag})`,
                    routerTelemetry: {
                        ruleTriggered: 'ANTI_CHURN_HOLD',
                        selectedMethodId: incumbent.methodId,
                        selectedTag: incumbent.curTag,
                        prob: incumbent.condProb,
                        score: incumbent.anticipatoryScore
                    }
                };
            }
        }
    }

    // Rule 3: Select candidate with highest Anticipatory Score
    const topCandidate = candidateMatrix[0] || {
        methodId: currentMethod || 'adaptiveDualMerge',
        curTag: 'INIT',
        condProb: 0.40,
        anticipatoryScore: 0.40,
        curStreak: 0
    };

    const isRebound = topCandidate.curStreak < 0;
    const pct = (topCandidate.condProb * 100).toFixed(1);

    return {
        selectedMethodId: topCandidate.methodId,
        switchPhase: isRebound ? 'REBOUND' : 'MOMENTUM',
        switchReason: isRebound
            ? `Đón đầu nhịp nổ bù ${topCandidate.methodId} (${topCandidate.curTag}, P=${pct}%, Score=${topCandidate.anticipatoryScore})`
            : `Bám quán tính đà thắng ${topCandidate.methodId} (${topCandidate.curTag}, P=${pct}%, Score=${topCandidate.anticipatoryScore})`,
        confidenceBadge: isRebound
            ? `🎯 ĐÓN ĐẦU ĐIỂM RƠI NỔ BÙ (${pct}% · ${topCandidate.curTag})`
            : `🚀 BÁM QUÁN TÍNH ĐÀ THẮNG (${pct}% · ${topCandidate.curTag})`,
        routerTelemetry: {
            ruleTriggered: isRebound ? 'REBOUND_MOMENTUM' : 'MOMENTUM_RUN',
            selectedMethodId: topCandidate.methodId,
            selectedTag: topCandidate.curTag,
            prob: topCandidate.condProb,
            score: topCandidate.anticipatoryScore
        }
    };
}

// ============================================================================
// 6. CANDIDATE LOADER PIPELINE
// ============================================================================

/**
 * Loads and normalizes 5 Elite Engines and 7 Pool 7 methods for targetDate.
 * Priority order:
 * 1. Explicit candidates passed in context
 * 2. Cached advisor data in context.advisorCache or cached_daily_method_advisor.json
 * 3. Fallback deterministic generation
 */
function loadAllDynamicCandidates(targetDate, context = {}) {
    const candidates = [];
    const dateStr = String(targetDate || '2026-09-30').slice(0, 10);

    // If explicit candidate objects were provided in context, sanitize and return them
    if (Array.isArray(context.candidates) && context.candidates.length > 0) {
        return context.candidates.map(raw => {
            const meta = METHOD_METADATA_REGISTRY[raw.methodId] || {
                methodId: raw.methodId,
                methodLabel: raw.methodLabel || raw.label || raw.methodId,
                category: raw.category || ((raw.vipNumbers && raw.vipNumbers.length > 0) ? 'elite' : 'pool7')
            };
            const sanitized = sanitizeCandidateSets(raw.vipNumbers || [], raw.backupNumbers || raw.numbers || []);
            return {
                methodId: meta.methodId,
                methodLabel: raw.methodLabel || raw.label || meta.methodLabel,
                category: meta.category,
                numbers: sanitized.numbers,
                vipNumbers: sanitized.vipNumbers,
                backupNumbers: sanitized.backupNumbers,
                stakeK: raw.stakeK !== undefined ? Number(raw.stakeK) : sanitized.stakeK,
                totalCount: sanitized.totalCount,
                vipCount: sanitized.vipCount,
                backupCount: sanitized.backupCount
            };
        });
    }

    // Try loading advisor cache
    let cache = context.advisorCache;
    if (!cache) {
        try {
            const cachePath = path.resolve(__dirname, '../data/statistics/cached_daily_method_advisor.json');
            if (fs.existsSync(cachePath)) {
                cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            }
        } catch (_) {
            cache = null;
        }
    }

    // 1. Load Elite Engines
    ELITE_ENGINE_IDS.forEach(engId => {
        const meta = METHOD_METADATA_REGISTRY[engId];
        let rawVip = [];
        let rawBackup = [];
        let explicitStakeK = undefined;

        if (cache && cache[engId]) {
            const engineData = cache[engId];
            const rec = engineData.latestRecommendation;
            const ledger = engineData.settledLedger || [];
            const targetRow = ledger.find(r => (r.date === dateStr || r.predictionDate === dateStr));

            if (targetRow) {
                if (engId === 'adaptiveDualMerge' || engId === 'dualMerge') {
                    rawVip = targetRow.intersectionX2 || targetRow.intersection || [];
                    rawBackup = targetRow.uniqueSinglesX1 || targetRow.uniqueSingles || [];
                } else {
                    rawVip = targetRow.vipNumbers || [];
                    rawBackup = targetRow.backupNumbers || targetRow.numbers || [];
                }
                if (targetRow.stakeK) explicitStakeK = targetRow.stakeK;
            } else if (rec && (rec.predictionDate === dateStr || !dateStr)) {
                if (engId === 'adaptiveDualMerge' || engId === 'dualMerge') {
                    rawVip = rec.intersectionX2 || [];
                    rawBackup = rec.uniqueSinglesX1 || [];
                } else {
                    rawVip = rec.vipNumbers || [];
                    rawBackup = rec.backupNumbers || rec.numbers || [];
                }
                if (rec.stakeK) explicitStakeK = rec.stakeK;
            }
        }

        // Fallback if empty
        if (rawVip.length === 0 && rawBackup.length === 0) {
            if (engId === 'adaptiveDualMerge') {
                rawVip = getDeterministic30(dateStr, 1).slice(0, 20);
                rawBackup = getDeterministic30(dateStr, 2).slice(0, 20);
            } else if (engId === 'pentaCoreDe') {
                rawVip = getDeterministic30(dateStr, 3).slice(0, 16);
                rawBackup = getDeterministic30(dateStr, 4).slice(0, 27);
            } else if (engId === 'deMarkovGapHazard') {
                rawVip = getDeterministic30(dateStr, 5).slice(0, 17);
                rawBackup = getDeterministic30(dateStr, 6).slice(0, 26);
            } else if (engId === 'dePositionalGraphFlow') {
                rawVip = getDeterministic30(dateStr, 7).slice(0, 17);
                rawBackup = getDeterministic30(dateStr, 8).slice(0, 26);
            } else {
                rawVip = getDeterministic30(dateStr, 9).slice(0, 22);
                rawBackup = getDeterministic30(dateStr, 10).slice(0, 18);
            }
        }

        const sanitized = sanitizeCandidateSets(rawVip, rawBackup);
        candidates.push({
            methodId: meta.methodId,
            methodLabel: meta.methodLabel,
            category: 'elite',
            numbers: sanitized.numbers,
            vipNumbers: sanitized.vipNumbers,
            backupNumbers: sanitized.backupNumbers,
            stakeK: explicitStakeK !== undefined ? explicitStakeK : sanitized.stakeK,
            totalCount: sanitized.totalCount,
            vipCount: sanitized.vipCount,
            backupCount: sanitized.backupCount
        });
    });

    // 2. Load Pool 7 Baselines
    POOL_7_METHOD_IDS.forEach((poolId, idx) => {
        const meta = METHOD_METADATA_REGISTRY[poolId] || {
            methodId: poolId,
            methodLabel: poolId,
            category: 'pool7'
        };

        let numbers = [];
        if (cache && Array.isArray(cache.records)) {
            const rec = cache.records.find(r => r.predictionDate === dateStr || r.sourceDrawDate === dateStr);
            const methods = rec?.candidateMethods || rec?.recommendation?.candidateMethods || [];
            const found = methods.find(m => m.methodId === poolId || m.methodId === poolId + 'Hold70' || m.methodId === poolId.replace('Hold70', ''));
            if (found && Array.isArray(found.numbers) && found.numbers.length > 0) {
                numbers = found.numbers;
            }
        }

        if (numbers.length === 0) {
            numbers = getDeterministic30(dateStr, 20 + idx);
        }

        const sanitized = sanitizeCandidateSets([], numbers);
        candidates.push({
            methodId: meta.methodId,
            methodLabel: meta.methodLabel,
            category: 'pool7',
            numbers: sanitized.numbers,
            vipNumbers: [],
            backupNumbers: sanitized.numbers,
            stakeK: sanitized.stakeK,
            totalCount: sanitized.totalCount,
            vipCount: 0,
            backupCount: sanitized.backupCount
        });
    });

    return candidates;
}

const loadEliteEngineCandidates = (targetDate, context) => loadAllDynamicCandidates(targetDate, context).filter(c => c.category === 'elite');
const loadPool7BaselineCandidates = (targetDate, context) => loadAllDynamicCandidates(targetDate, context).filter(c => c.category === 'pool7');

// ============================================================================
// 7. OBJECTIVE FUNCTION & QUANT SELECTOR (EV & MULTI-HORIZON)
// ============================================================================

/**
 * Evaluates quantitative metrics for a single candidate profile.
 */
function evaluateCandidateQuantMetrics(candidate, priorStats = {}, config = DEFAULT_CONFIG) {
    const sanitized = sanitizeCandidateSets(candidate.vipNumbers || [], candidate.backupNumbers || candidate.numbers || []);
    const numbers = sanitized.numbers;
    const vipNumbers = sanitized.vipNumbers;
    const backupNumbers = sanitized.backupNumbers;
    const vipCount = sanitized.vipCount;
    const backupCount = sanitized.backupCount;

    const stakeK = candidate.stakeK !== undefined ? Number(candidate.stakeK) : sanitized.stakeK;
    const observations = Math.max(0, Number(priorStats.observations || priorStats.totalCount || priorStats.total || 0));
    const wins = Math.max(0, Number(priorStats.wins || priorStats.totalWins || 0));
    const vipWins = Math.max(0, Number(priorStats.vipWins || 0));

    // Size-proportional Bayesian smoothed union probability
    const basePrior = numbers.length > 0 ? (numbers.length / 100) : (config.FALLBACK_BASE_RATE || 0.40);
    const priorAlpha = basePrior * 10;
    const probUnion = priorStats.posteriorProb !== undefined
        ? Number(priorStats.posteriorProb)
        : (wins + priorAlpha) / (observations + 10);

    // Bayesian smoothed VIP ratio among hits
    const rawVipRatio = wins > 0 ? vipWins / wins : 0;
    const priorVipRatio = numbers.length > 0 ? vipCount / numbers.length : 0;
    const smoothedVipRatio = (vipWins + config.VIP_PRIOR_WEIGHT * priorVipRatio) / (wins + config.VIP_PRIOR_WEIGHT);

    const probVIP = vipCount > 0 ? probUnion * smoothedVipRatio : 0;
    const probBackup = probUnion - probVIP;

    // Expected profit in thousands VND (K)
    const expectedProfitK = computeExpectedProfitK(probVIP, probBackup, stakeK, config.PAYOUT_VIP_K, config.PAYOUT_BACKUP_K);

    // Wilson confidence interval bounds (two-sided 95% and one-sided 90% matching dailyMethodAdvisorService)
    const wilsonLower95 = computeWilsonScore95(wins, observations, config.Z_95);
    const wilsonLower90 = computeWilsonScore95(wins, observations, config.Z_SCORE || config.Z_90 || 1.2815515655446004);
    const wilsonLower = wilsonLower90;

    // Dynamic break-even hit rate
    const breakEvenHitRate = computeDynamicBreakEven(stakeK, smoothedVipRatio, config.PAYOUT_VIP_K, config.PAYOUT_BACKUP_K);

    const minSelectionObs = config.MIN_SELECTION_OBSERVATIONS ?? config.MIN_OBSERVATIONS ?? 15;
    const isEligibleForTop = observations >= minSelectionObs;

    return {
        methodId: candidate.methodId,
        methodLabel: candidate.methodLabel || candidate.methodId,
        category: candidate.category || (vipCount > 0 ? 'elite' : 'pool7'),
        numbers,
        vipNumbers,
        backupNumbers,
        stakeK,
        observations,
        wins,
        vipWins,
        backupWins: Math.max(0, wins - vipWins),
        probUnion: Number(probUnion.toFixed(6)),
        probVIP: Number(probVIP.toFixed(6)),
        probBackup: Number(probBackup.toFixed(6)),
        smoothedVipRatio: Number(smoothedVipRatio.toFixed(6)),
        expectedProfitK,
        wilsonLower95,
        wilsonLower90,
        wilsonLower,
        breakEvenHitRate,
        isProfitableEV: expectedProfitK > 0,
        clearsWilsonBreakEven: wilsonLower >= breakEvenHitRate,
        isEligibleForTop
    };
}

// ============================================================================
// 8. SMART ABSTAIN GOVERNOR & HYSTERESIS STATE MACHINE
// ============================================================================

/**
 * Evaluates Smart Abstain Governor with 3 triggers and Schmitt-trigger hysteresis.
 */
function evaluateSmartAbstainGate({
    targetDate,
    candidates = [],
    priorStatsMap = {},
    priorGovernorState = {},
    customConfig = {}
} = {}) {
    const config = { ...DEFAULT_CONFIG, ...customConfig };

    // 1. Evaluate quantitative metrics for all candidates
    const evaluatedCandidates = candidates.map(c => {
        const stats = priorStatsMap[c.methodId] || {};
        return evaluateCandidateQuantMetrics(c, stats, config);
    });

    if (evaluatedCandidates.length === 0) {
        return {
            targetDate: String(targetDate || ''),
            action: 'ABSTAIN',
            selectedMethodId: null,
            selectedMethodLabel: 'Không có ứng viên',
            switchPhase: 'ABSTAIN_PRESERVATION',
            switchReason: 'Không tìm thấy phương pháp ứng viên hợp lệ.',
            confidenceBadge: 'ABSTAIN NO CANDIDATES',
            stakeK: 0,
            numbers: [],
            vipNumbers: [],
            backupNumbers: [],
            evMetrics: {
                expectedProfitK: 0,
                payoutVIPK: config.PAYOUT_VIP_K,
                payoutBackupK: config.PAYOUT_BACKUP_K,
                probVIP: 0,
                probBackup: 0,
                wilsonLower95: 0,
                breakEvenHitRate: 0,
                ensembleDivergence: 0
            },
            abstainGate: {
                isAbstained: true,
                governorState: 'ABSTAIN_GUARD',
                reason: 'Không có phương pháp ứng viên nào khả dụng.',
                triggeredConditions: ['NO_CANDIDATES'],
                capitalPreservedK: 0,
                cumulativeCapitalPreservedK: priorGovernorState.cumulativePreservedK || 0
            }
        };
    }

    // Determine eligible candidates meeting observation sample criteria
    // Prevents zero-observation ghost candidates from hijacking topCandidate and poisoning Wilson gate
    const minSelectionObs = config.MIN_SELECTION_OBSERVATIONS ?? config.MIN_OBSERVATIONS ?? 15;
    let eligibleCandidates = evaluatedCandidates.filter(c => c.observations >= minSelectionObs);
    if (eligibleCandidates.length === 0) {
        eligibleCandidates = evaluatedCandidates.filter(c => c.observations > 0);
    }
    if (eligibleCandidates.length === 0) {
        eligibleCandidates = evaluatedCandidates; // All cold-start fallback
    }

    // Sort eligible candidates descending by Expected Profit
    eligibleCandidates.sort((a, b) => b.expectedProfitK - a.expectedProfitK);
    const topCandidate = eligibleCandidates[0];
    const maxExpectedProfitK = topCandidate.expectedProfitK;

    // Ensure evaluatedCandidates puts topCandidate first, followed by others sorted by EV
    evaluatedCandidates.sort((a, b) => {
        if (a.methodId === topCandidate.methodId) return -1;
        if (b.methodId === topCandidate.methodId) return 1;
        return b.expectedProfitK - a.expectedProfitK;
    });

    // 2. Measure Ensemble Divergence across Elite Engines
    const eliteCandidates = evaluatedCandidates.filter(c => c.category === 'elite' || (c.vipNumbers && c.vipNumbers.length > 0));
    const divergenceReport = computeEnsembleDivergence(eliteCandidates.length >= 2 ? eliteCandidates : evaluatedCandidates);
    const D_ensemble = divergenceReport.D_ensemble;

    // 3. Evaluate 3 Risk Triggers
    const cond1NegativeEV = maxExpectedProfitK < 0;

    // Trigger 2: Disaster Floor Gate
    // Cuts catastrophic drawdowns without killing active winning momentum on tight X3/X1 margins.
    // For elite tiered-stake engines: triggers when trials >= 20 and Wilson score < theta_FLOOR = 0.75 * theta_BE.
    // For non-elite (Pool 7): triggers when Wilson score < theta_BE.
    const isElite = topCandidate.category === 'elite' || (topCandidate.vipNumbers && topCandidate.vipNumbers.length > 0);
    const minGateObservations = config.MIN_OBSERVATIONS ?? 20;
    const disasterTolerance = isElite ? (config.WILSON_DISASTER_TOLERANCE ?? 0.25) : 0.0;
    const disasterFloor = topCandidate.breakEvenHitRate * (1 - disasterTolerance);
    const wilsonScoreForGate = isElite
        ? (topCandidate.wilsonLower90 ?? topCandidate.wilsonLower ?? topCandidate.wilsonLower95)
        : topCandidate.wilsonLower95;

    const cond2WilsonBelowBreakEven = isElite
        ? (topCandidate.observations >= minGateObservations && wilsonScoreForGate < disasterFloor)
        : (topCandidate.wilsonLower95 < disasterFloor);

    const cond3ExtremeDivergence = D_ensemble > config.DIVERGENCE_ENTER_THRESHOLD;

    const triggeredConditions = [];
    if (cond1NegativeEV) triggeredConditions.push('COND_1_NEGATIVE_EV');
    if (cond2WilsonBelowBreakEven) triggeredConditions.push('COND_2_WILSON_BELOW_BREAK_EVEN');
    if (cond3ExtremeDivergence) triggeredConditions.push('COND_3_EXTREME_ENSEMBLE_DIVERGENCE');

    // 4. Governor State Machine & Schmitt-Trigger Hysteresis
    const priorState = priorGovernorState.state || 'ACTIVE_BET';
    const priorConsecutiveAbstains = Number(priorGovernorState.consecutiveAbstains || 0);
    const priorCumulativePreservedK = Number(priorGovernorState.cumulativePreservedK || priorGovernorState.cumulativeCapitalPreservedK || 0);

    let nextState = 'ACTIVE_BET';
    let shouldAbstain = false;
    let abstainReason = null;

    if (priorState === 'ABSTAIN_GUARD') {
        const clearsEVBuffer = maxExpectedProfitK >= config.EV_EXIT_BUFFER_K;
        const exitDisasterFloor = disasterFloor + (config.WILSON_EXIT_BUFFER ?? 0.02);
        const clearsWilsonBuffer = isElite
            ? (topCandidate.observations < minGateObservations || wilsonScoreForGate >= exitDisasterFloor)
            : (topCandidate.wilsonLower95 >= (topCandidate.breakEvenHitRate + (config.WILSON_EXIT_BUFFER ?? 0.02)));

        const clearsDivergenceBuffer = D_ensemble <= config.DIVERGENCE_EXIT_THRESHOLD;
        const isEliteReboundCandidate = isElite
            && topCandidate.probUnion >= 0.45
            && (topCandidate.observations < minGateObservations || wilsonScoreForGate >= disasterFloor);
        const fastTrackDivergenceClear = isEliteReboundCandidate && D_ensemble <= 0.80;

        const fullyCleared = clearsEVBuffer && clearsWilsonBuffer && (clearsDivergenceBuffer || fastTrackDivergenceClear);

        if (fullyCleared) {
            nextState = 'ACTIVE_BET';
            shouldAbstain = false;
        } else {
            nextState = 'ABSTAIN_GUARD';
            shouldAbstain = true;
            const unmetReasons = [];
            if (!clearsEVBuffer) unmetReasons.push(`E[Profit] chưa đạt vùng an toàn +${config.EV_EXIT_BUFFER_K / 1000}M`);
            if (!clearsWilsonBuffer) unmetReasons.push(`Wilson (${(wilsonScoreForGate * 100).toFixed(1)}%) chưa vượt ngưỡng an toàn ${(exitDisasterFloor * 100).toFixed(1)}%`);
            if (!clearsDivergenceBuffer && !fastTrackDivergenceClear) unmetReasons.push(`Độ phân kỳ D_ensemble (${D_ensemble.toFixed(3)}) chưa hồi phục về <= ${config.DIVERGENCE_EXIT_THRESHOLD}`);
            abstainReason = `Hysteresis Buffer: Tiếp tục giữ trạng thái bảo toàn vốn. Lý do: ${unmetReasons.join('; ')}.`;
        }
    } else {
        if (triggeredConditions.length > 0) {
            nextState = 'ABSTAIN_GUARD';
            shouldAbstain = true;
            const reasons = [];
            if (cond1NegativeEV) reasons.push(`Kỳ vọng lợi nhuận toàn bộ ứng viên đều âm (max E[Profit] = ${(maxExpectedProfitK / 1000).toFixed(1)}M < 0đ)`);
            if (cond2WilsonBelowBreakEven) reasons.push(`Cận Wilson (${(wilsonScoreForGate * 100).toFixed(1)}%) dưới ngưỡng sàn thảm họa (${(disasterFloor * 100).toFixed(1)}%)`);
            if (cond3ExtremeDivergence) reasons.push(`Độ phân kỳ động cơ tinh hoa D_ensemble = ${D_ensemble.toFixed(3)} > ${config.DIVERGENCE_ENTER_THRESHOLD}`);
            abstainReason = `Kích hoạt Smart Abstain Governor bảo toàn vốn: ${reasons.join(' | ')}.`;
        } else {
            nextState = 'ACTIVE_BET';
            shouldAbstain = false;
        }
    }

    // 5. Output Telemetry
    const consecutiveAbstains = shouldAbstain ? priorConsecutiveAbstains + 1 : 0;
    const hypotheticalStakeK = topCandidate.stakeK;
    const currentPreservedK = shouldAbstain ? hypotheticalStakeK : 0;
    const cumulativeCapitalPreservedK = priorCumulativePreservedK + currentPreservedK;

    const action = shouldAbstain ? 'ABSTAIN' : 'BET';
    const switchPhase = shouldAbstain ? 'ABSTAIN_PRESERVATION' : 'MOMENTUM';
    const confidenceBadge = shouldAbstain
        ? (cond1NegativeEV ? 'ABSTAIN NEGATIVE EV' : (cond3ExtremeDivergence ? 'ABSTAIN REGIME NOISE' : 'ABSTAIN LOW CONFIDENCE'))
        : (topCandidate.expectedProfitK >= 15000 ? 'HIGH EV POSITIVE' : 'STANDARD POSITIVE');

    return {
        targetDate: String(targetDate || ''),
        action,
        selectedMethodId: topCandidate.methodId,
        selectedMethodLabel: topCandidate.methodLabel,
        switchPhase,
        switchReason: shouldAbstain ? abstainReason : `Lựa chọn phương pháp tối ưu E[Profit] = +${(maxExpectedProfitK / 1000).toFixed(1)}M với Wilson 95% = ${(topCandidate.wilsonLower95 * 100).toFixed(1)}%`,
        confidenceBadge,
        stakeK: shouldAbstain ? 0 : topCandidate.stakeK,
        payoutVIPK: config.PAYOUT_VIP_K,
        payoutBackupK: config.PAYOUT_BACKUP_K,
        numbers: shouldAbstain ? [] : topCandidate.numbers,
        vipNumbers: shouldAbstain ? [] : topCandidate.vipNumbers,
        backupNumbers: shouldAbstain ? [] : topCandidate.backupNumbers,
        evMetrics: {
            expectedProfitK: topCandidate.expectedProfitK,
            payoutVIPK: config.PAYOUT_VIP_K,
            payoutBackupK: config.PAYOUT_BACKUP_K,
            probVIP: topCandidate.probVIP,
            probBackup: topCandidate.probBackup,
            probUnion: topCandidate.probUnion,
            rhoVip: topCandidate.smoothedVipRatio,
            wilsonLower95: topCandidate.wilsonLower95,
            breakEvenHitRate: topCandidate.breakEvenHitRate,
            ensembleDivergence: D_ensemble
        },
        abstainGate: {
            isAbstained: shouldAbstain,
            governorState: nextState,
            consecutiveAbstains,
            reason: abstainReason,
            triggeredConditions,
            capitalPreservedK: currentPreservedK,
            cumulativeCapitalPreservedK,
            divergenceReport: {
                D_ensemble,
                meanJaccard: divergenceReport.meanJaccard,
                pairsEvaluated: divergenceReport.pairsEvaluated,
                highConsensusCount: divergenceReport.consensusCounts.highConsensusCount,
                totalUniqueNumbers: divergenceReport.consensusCounts.totalUniqueNumbers
            }
        },
        evaluatedCandidates
    };
}

const evaluateSmartAbstainGovernor = evaluateSmartAbstainGate;

// ============================================================================
// 9. MASTER SELECTOR & SERVICE EXPORTS
// ============================================================================

/**
 * Master Strategy Selection Entry Point:
 * Synthesizes Candidate Loading, EV Formulation, Anticipatory Router,
 * and Smart Abstain Governor.
 *
 * @param {string|Object} targetDateOrOptions Target date string or options object
 * @param {Object} [maybeContext] Context if first arg is targetDate
 * @returns {Object} DynamicDeSelectionResult
 */
function selectOptimalDeStrategy(targetDateOrOptions, maybeContext) {
    let options = {};
    if (typeof targetDateOrOptions === 'string') {
        options = { targetDate: targetDateOrOptions, ...(maybeContext || {}) };
    } else if (typeof targetDateOrOptions === 'object' && targetDateOrOptions !== null) {
        options = targetDateOrOptions;
    }

    const targetDate = String(options.targetDate || '2026-09-30').slice(0, 10);
    const config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
    const currentChosenMethod = options.currentChosenMethod || options.currentMethod || null;
    const priorGovernorState = options.priorGovernorState || {};

    // 1. Load candidates
    const candidates = options.candidates && Array.isArray(options.candidates) && options.candidates.length > 0
        ? options.candidates.map(c => {
            const meta = METHOD_METADATA_REGISTRY[c.methodId] || {
                methodId: c.methodId,
                methodLabel: c.methodLabel || c.label || c.methodId,
                category: c.category || ((c.vipNumbers && c.vipNumbers.length > 0) ? 'elite' : 'pool7')
            };
            const sanitized = sanitizeCandidateSets(c.vipNumbers || [], c.backupNumbers || c.numbers || []);
            return {
                methodId: meta.methodId,
                methodLabel: c.methodLabel || c.label || meta.methodLabel,
                category: meta.category,
                numbers: sanitized.numbers,
                vipNumbers: sanitized.vipNumbers,
                backupNumbers: sanitized.backupNumbers,
                stakeK: c.stakeK !== undefined ? Number(c.stakeK) : sanitized.stakeK,
                totalCount: sanitized.totalCount,
                vipCount: sanitized.vipCount,
                backupCount: sanitized.backupCount
            };
        })
        : loadAllDynamicCandidates(targetDate, options);

    // 2. Load historical records/ledgers for candidates to compute transition and EV metrics
    const priorStatsMap = options.priorStatsMap || {};
    const methodsLedgersMap = options.methodsLedgersMap || {};

    // Extract ledgers from advisorCache if not already provided
    let cache = options.advisorCache;
    if (!cache) {
        try {
            const cachePath = path.resolve(__dirname, '../data/statistics/cached_daily_method_advisor.json');
            if (fs.existsSync(cachePath)) {
                cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            }
        } catch (_) {
            cache = null;
        }
    }

    if (cache) {
        ELITE_ENGINE_IDS.forEach(engId => {
            if (!methodsLedgersMap[engId] && cache[engId]?.settledLedger) {
                methodsLedgersMap[engId] = cache[engId].settledLedger.filter(r => (r.date < targetDate || r.predictionDate < targetDate));
            }
        });
    }

    // Also load historical performance for Pool 7 methods if available
    try {
        const pool7Path = path.resolve(__dirname, '../data/statistics/cached_prediction_history_performance_2026.json');
        if (fs.existsSync(pool7Path)) {
            const pool7Data = JSON.parse(fs.readFileSync(pool7Path, 'utf8'));
            if (pool7Data?.methods) {
                POOL_7_METHOD_IDS.forEach(pId => {
                    if (!methodsLedgersMap[pId] && pool7Data.methods[pId]?.daily) {
                        methodsLedgersMap[pId] = pool7Data.methods[pId].daily.filter(r => (r.date < targetDate || r.period < targetDate));
                    }
                });
            }
        }
    } catch (_) {}

    // Populate or audit priorStatsMap from ledgers using universal extractor
    for (const [mId, ledger] of Object.entries(methodsLedgersMap)) {
        if (Array.isArray(ledger) && ledger.length > 0) {
            let wins = 0;
            let vipWins = 0;
            let backupWins = 0;
            for (let i = 0; i < ledger.length; i++) {
                const info = extractLedgerRowInfo(ledger[i]);
                if (info) {
                    if (info.isVipHit) {
                        vipWins++;
                        wins++;
                    } else if (info.isHit || info.isBackupHit) {
                        backupWins++;
                        wins++;
                    }
                }
            }
            const totalCount = ledger.length;
            if (!priorStatsMap[mId] || priorStatsMap[mId].vipWins === undefined || (priorStatsMap[mId].vipWins === 0 && vipWins > 0)) {
                priorStatsMap[mId] = {
                    ...(priorStatsMap[mId] || {}),
                    observations: totalCount,
                    wins,
                    vipWins,
                    backupWins,
                    totalCount,
                    totalWins: wins
                };
            }
        }
    }

    // 3. Anticipatory Transition Routing
    let anticipatoryDecision = null;
    if (Object.keys(methodsLedgersMap).length > 0) {
        const candidateMatrix = computeAnticipatoryDeCandidateMatrix(methodsLedgersMap, 999999, currentChosenMethod, config);
        anticipatoryDecision = selectAnticipatoryRouterMethod({
            currentMethod: currentChosenMethod,
            candidateMatrix,
            config
        });
    }

    // 4. Smart Abstain Governor Evaluation
    const governorResult = evaluateSmartAbstainGate({
        targetDate,
        candidates,
        priorStatsMap,
        priorGovernorState,
        customConfig: config
    });

    // If Governor triggered ABSTAIN, return Abstain result immediately
    if (governorResult.action === 'ABSTAIN') {
        return governorResult;
    }

    // 5. If Governor passes BET, merge Anticipatory Router decision if available
    let finalCandidate = candidates.find(c => c.methodId === governorResult.selectedMethodId) || candidates[0];
    let switchPhase = governorResult.switchPhase;
    let switchReason = governorResult.switchReason;
    let confidenceBadge = governorResult.confidenceBadge;

    if (anticipatoryDecision && anticipatoryDecision.selectedMethodId) {
        const matched = candidates.find(c => c.methodId === anticipatoryDecision.selectedMethodId);
        if (matched) {
            const quant = evaluateCandidateQuantMetrics(matched, priorStatsMap[matched.methodId] || {}, config);
            if (quant.expectedProfitK >= 0 || matched.methodId === governorResult.selectedMethodId) {
                finalCandidate = matched;
                switchPhase = anticipatoryDecision.switchPhase;
                switchReason = anticipatoryDecision.switchReason;
                confidenceBadge = anticipatoryDecision.confidenceBadge;
            }
        }
    }

    // Quant evaluation of chosen candidate
    const finalQuant = evaluateCandidateQuantMetrics(finalCandidate, priorStatsMap[finalCandidate.methodId] || {}, config);
    const divergenceReport = computeEnsembleDivergence(candidates);

    return {
        targetDate,
        action: 'BET',
        selectedMethodId: finalCandidate.methodId,
        selectedMethodLabel: finalCandidate.methodLabel,
        switchPhase,
        switchReason,
        confidenceBadge,
        stakeK: finalCandidate.stakeK,
        payoutVIPK: config.PAYOUT_VIP_K,
        payoutBackupK: config.PAYOUT_BACKUP_K,
        numbers: finalCandidate.numbers,
        vipNumbers: finalCandidate.vipNumbers,
        backupNumbers: finalCandidate.backupNumbers,
        evMetrics: {
            expectedProfitK: finalQuant.expectedProfitK,
            payoutVIPK: config.PAYOUT_VIP_K,
            payoutBackupK: config.PAYOUT_BACKUP_K,
            probVIP: finalQuant.probVIP,
            probBackup: finalQuant.probBackup,
            probUnion: finalQuant.probUnion,
            rhoVip: finalQuant.smoothedVipRatio,
            wilsonLower95: finalQuant.wilsonLower95,
            breakEvenHitRate: finalQuant.breakEvenHitRate,
            ensembleDivergence: divergenceReport.D_ensemble
        },
        abstainGate: {
            isAbstained: false,
            governorState: 'ACTIVE_BET',
            consecutiveAbstains: 0,
            reason: null,
            triggeredConditions: [],
            capitalPreservedK: 0,
            cumulativeCapitalPreservedK: priorGovernorState.cumulativePreservedK || priorGovernorState.cumulativeCapitalPreservedK || 0,
            divergenceReport: {
                D_ensemble: divergenceReport.D_ensemble,
                meanJaccard: divergenceReport.meanJaccard,
                pairsEvaluated: divergenceReport.pairsEvaluated,
                highConsensusCount: divergenceReport.consensusCounts.highConsensusCount,
                totalUniqueNumbers: divergenceReport.consensusCounts.totalUniqueNumbers
            }
        },
        evaluatedCandidates: governorResult.evaluatedCandidates,
        routerTelemetry: anticipatoryDecision?.routerTelemetry || null
    };
}

/**
 * Settles dynamic selection result with actual lottery outcome.
 * Guarantees Financial Equality Conservation:
 *   profitK === payoutK - stakeK
 *
 * @param {Object} selectionResult Result from selectOptimalDeStrategy
 * @param {number|string} actualSpecial Winning special 2-digit number (00-99)
 * @returns {Object} Settled result
 */
function settleDynamicDeSelection(selectionResult, actualSpecial) {
    if (!selectionResult) return null;

    // Check if this method has historical ground-truth performance in cache (e.g. Pool 7 baselines)
    let pool7DailyRow = null;
    if (selectionResult.targetDate && selectionResult.selectedMethodId && (selectionResult.category === 'pool7' || POOL_7_METHOD_IDS.includes(selectionResult.selectedMethodId))) {
        try {
            const perfPath = path.resolve(__dirname, '../data/statistics/cached_prediction_history_performance_2026.json');
            if (fs.existsSync(perfPath)) {
                const perf = JSON.parse(fs.readFileSync(perfPath, 'utf8'));
                const daily = perf.methods?.[selectionResult.selectedMethodId]?.daily;
                if (Array.isArray(daily)) {
                    pool7DailyRow = daily.find(r => r.date === selectionResult.targetDate || r.period === selectionResult.targetDate);
                }
            }
        } catch (_) {}
    }

    if (pool7DailyRow && selectionResult.action === 'BET') {
        const hit = pool7DailyRow.hitDays > 0;
        const effectiveStakeK = selectionResult.stakeK || 30000;
        const payoutBackupK = selectionResult.payoutBackupK || selectionResult.evMetrics?.payoutBackupK || DEFAULT_CONFIG.PAYOUT_BACKUP_K;
        const payoutK = hit ? payoutBackupK : 0;
        const profitK = payoutK - effectiveStakeK;

        return {
            ...selectionResult,
            actualSpecial: actualSpecial !== null && actualSpecial !== undefined ? Number(actualSpecial) : null,
            actual: actualSpecial !== null && actualSpecial !== undefined ? Number(actualSpecial) : null,
            settled: actualSpecial !== null && actualSpecial !== undefined,
            hit,
            isHit: hit,
            isVipHit: false,
            hitType: hit ? 'BACKUP_X1' : 'NONE',
            stakeK: effectiveStakeK,
            payoutK,
            profitK
        };
    }

    const settlement = calculatePayoutAndProfitK({
        action: selectionResult.action,
        actualSpecial,
        vipNumbers: selectionResult.vipNumbers,
        backupNumbers: selectionResult.backupNumbers,
        stakeK: selectionResult.stakeK,
        isAbstained: selectionResult.action === 'ABSTAIN' || selectionResult.abstainGate?.isAbstained,
        payoutVIPK: selectionResult.payoutVIPK || selectionResult.evMetrics?.payoutVIPK || DEFAULT_CONFIG.PAYOUT_VIP_K,
        payoutBackupK: selectionResult.payoutBackupK || selectionResult.evMetrics?.payoutBackupK || DEFAULT_CONFIG.PAYOUT_BACKUP_K
    });

    return {
        ...selectionResult,
        actualSpecial: actualSpecial !== null && actualSpecial !== undefined ? Number(actualSpecial) : null,
        actual: actualSpecial !== null && actualSpecial !== undefined ? Number(actualSpecial) : null,
        settled: actualSpecial !== null && actualSpecial !== undefined,
        hit: settlement.hit,
        isHit: settlement.isHit,
        isVipHit: settlement.isVipHit,
        hitType: settlement.hitType,
        stakeK: settlement.stakeK,
        payoutK: settlement.payoutK,
        profitK: settlement.profitK
    };
}

/**
 * Audits settlement telemetry for an ABSTAIN day.
 */
function auditAbstainSettlement(selectionResult, actualSpecial) {
    if (!selectionResult?.abstainGate?.isAbstained) {
        return null;
    }
    const actual = actualSpecial !== null && actualSpecial !== undefined ? Number(actualSpecial) : null;
    return {
        targetDate: selectionResult.targetDate,
        actualSpecial: actual,
        wasAbstained: true,
        stakePreservedK: selectionResult.abstainGate.capitalPreservedK || 0,
        governorDecisionValid: true
    };
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
    // Configuration & Metadata
    DEFAULT_CONFIG,
    DEFAULT_ROUTER_CONFIG,
    ELITE_ENGINE_IDS,
    POOL_7_METHOD_IDS,
    ALL_CANDIDATE_IDS,
    METHOD_METADATA_REGISTRY,
    REBOUND_BONUSES,
    FATIGUE_PENALTIES,

    // Number Normalization
    normalizeNumbers,
    sanitizeCandidateSets,
    getDeterministic30,

    // Candidate Loading
    loadAllDynamicCandidates,
    loadEliteEngineCandidates,
    loadPool7BaselineCandidates,

    // Financial & Payoff Law
    calculateTieredStakeK,
    calculatePayoutAndProfitK,
    extractLedgerRowInfo,
    computeDynamicBreakEven,
    computeDynamicBreakEvenHitRate,
    computeExpectedProfitK,

    // Statistics & Quant
    computeWilsonScore95,
    calculateWilsonLower95,
    computeAntiChurningZ,
    computeEnsembleDivergence,
    evaluateCandidateQuantMetrics,

    // Anticipatory Transition Router
    getStreakStateTag,
    getStreakStateSemanticLabel,
    computePITTransitionMetricsForLedger,
    computeAnticipatoryDeCandidateMatrix,
    selectAnticipatoryRouterMethod,

    // Smart Abstain Governor
    evaluateSmartAbstainGate,
    evaluateSmartAbstainGovernor,
    auditAbstainSettlement,

    // Master Selection & Settlement
    selectOptimalDeStrategy,
    settleDynamicDeSelection
};
