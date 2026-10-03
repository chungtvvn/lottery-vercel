/**
 * Auto Best-Selection Engine (Gen 4 - Multi-Factor Quantitative Dispatcher)
 *
 * Implements 100% Strict Point-In-Time (Strict PIT) evaluation across all 12 candidate methods:
 * - 5 Elite Engines: Adaptive Alpha X3/X1, Penta-Core Consensus AI, Markov Weibull Hazard, Cầu Đồ Thị Vị Trí, Dual Merge Tiêu Chuẩn
 * - 7 Pool 7 Baseline Methods: Biên 75 Hold 70, Boost B40S05 Hold 70, Biên 50 Hold 70, Dropoff Hold 70, Avg Edge 50 Hold 70, Chain Small First Hold 70, Edge Hold 70
 *
 * Multi-Factor Evaluation Scoring:
 * 1. Rolling Win Rate (7D & 30D)
 * 2. 7-Day Net PnL (PnL_7D in VND / K)
 * 3. Rolling Sharpe Ratio (30D window)
 * 4. Maximum Drawdown Penalty & Consecutive Loss Streak
 * 5. Expected Value E[Profit] & Dynamic Break-Even Hit Rate
 * 6. Anticipatory Streak Transition State (Markov tags, Rebound bonus, Fatigue penalty, Inertia)
 * 7. Smart Abstain Filter (Capital Preservation Shield)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const dynamicDeSelector = require('./dynamicDeSelectorService');

const {
    ALL_CANDIDATE_IDS,
    ELITE_ENGINE_IDS,
    POOL_7_METHOD_IDS,
    METHOD_METADATA_REGISTRY,
    DEFAULT_CONFIG,
    REBOUND_BONUSES,
    FATIGUE_PENALTIES,
    DEFAULT_ROUTER_CONFIG,
    sanitizeCandidateSets,
    computeDynamicBreakEven,
    computeExpectedProfitK,
    computeWilsonScore95,
    computeWilsonLower90,
    computeEnsembleDivergence,
    computePITTransitionMetricsForLedger,
    extractLedgerRowInfo,
    evaluateSmartAbstainGate,
    loadAllDynamicCandidates
} = dynamicDeSelector;

/**
 * Default multi-factor ranking weights
 */
const DEFAULT_FACTOR_WEIGHTS = Object.freeze({
    WEIGHT_EV: 0.25,
    WEIGHT_SHARPE: 0.25,
    WEIGHT_PNL_7D: 0.20,
    WEIGHT_WR_30D: 0.20,
    WEIGHT_DRAWDOWN_PENALTY: 0.10
});

/**
 * Extracts settled ledger history strictly before targetDate (Strict PIT)
 */
function getHistoricalLedger(ledger, targetDate) {
    if (!Array.isArray(ledger)) return [];
    if (!targetDate) return [...ledger];
    const target = String(targetDate).slice(0, 10);
    return ledger.filter(r => {
        const d = r.date || r.predictionDate || r.period;
        return d && String(d).slice(0, 10) < target;
    });
}

/**
 * Computes Rolling Win Rates for a given candidate ledger.
 * @param {Array<Object>} ledger Settled historical records
 * @param {string} targetDate Target date (Strict PIT <= targetDate - 1)
 * @returns {Object} { winRate7D, winRate30D, totalWins7D, count7D, totalWins30D, count30D }
 */
function calculateRollingWinRates(ledger = [], targetDate = null, defaultRate = 0.40) {
    const history = getHistoricalLedger(ledger, targetDate);
    if (!history.length) {
        return {
            winRate7D: defaultRate,
            winRate30D: defaultRate,
            totalWins7D: 0,
            count7D: 0,
            totalWins30D: 0,
            count30D: 0
        };
    }

    const last7 = history.slice(-7);
    const last30 = history.slice(-30);

    const wins7 = last7.filter(r => {
        const info = extractLedgerRowInfo(r);
        return info ? (info.isHit || info.isVipHit) : Boolean(r.isHit || r.hit || r.isWin);
    }).length;

    const wins30 = last30.filter(r => {
        const info = extractLedgerRowInfo(r);
        return info ? (info.isHit || info.isVipHit) : Boolean(r.isHit || r.hit || r.isWin);
    }).length;

    return {
        winRate7D: last7.length > 0 ? Number((wins7 / last7.length).toFixed(4)) : defaultRate,
        winRate30D: last30.length > 0 ? Number((wins30 / last30.length).toFixed(4)) : defaultRate,
        totalWins7D: wins7,
        count7D: last7.length,
        totalWins30D: wins30,
        count30D: last30.length
    };
}

/**
 * Computes 7-Day Net PnL in thousands VND (K).
 * @param {Array<Object>} ledger Settled historical records
 * @param {string} targetDate Target date
 * @param {number} defaultStakeK Default stake if unspecified
 * @returns {number} 7-day net PnL in K
 */
function calculateRollingPnL(ledger = [], targetDate = null, days = 7, defaultStakeK = 77000) {
    const history = getHistoricalLedger(ledger, targetDate);
    if (!history.length) return 0;
    const window = history.slice(-days);

    let totalProfitK = 0;
    for (const r of window) {
        if (r.profitK !== undefined && r.profitK !== null) {
            totalProfitK += Number(r.profitK);
        } else if (r.pnlK !== undefined && r.pnlK !== null) {
            totalProfitK += Number(r.pnlK);
        } else if (r.payoutK !== undefined && r.stakeK !== undefined) {
            totalProfitK += Number(r.payoutK) - Number(r.stakeK);
        } else {
            const info = extractLedgerRowInfo(r);
            if (info) {
                const stake = r.stakeK || defaultStakeK;
                const payout = info.isVipHit ? 252000 : (info.isHit ? 84000 : 0);
                totalProfitK += (payout - stake);
            } else if (r.isHit || r.hit) {
                totalProfitK += (84000 - defaultStakeK);
            } else {
                totalProfitK -= defaultStakeK;
            }
        }
    }
    return Math.round(totalProfitK);
}

/**
 * Computes Rolling Sharpe Ratio over 30-day window.
 * Daily return r_i = Profit_i / Stake_i
 * Sharpe = (mean(r) / std(r)) * sqrt(365)
 */
function calculateRollingSharpe(ledger = [], targetDate = null, windowSize = 30, defaultStakeK = 77000) {
    const history = getHistoricalLedger(ledger, targetDate);
    if (!history.length) return 0;
    const window = history.slice(-windowSize);
    if (window.length < 2) return 0;

    const returns = [];
    for (const r of window) {
        const stake = Number(r.stakeK) || defaultStakeK || 1;
        let profit = 0;
        if (r.profitK !== undefined && r.profitK !== null) {
            profit = Number(r.profitK);
        } else if (r.pnlK !== undefined && r.pnlK !== null) {
            profit = Number(r.pnlK);
        } else if (r.payoutK !== undefined && r.stakeK !== undefined) {
            profit = Number(r.payoutK) - Number(r.stakeK);
        } else {
            const isHit = Boolean(r.isHit || r.hit || r.isWin);
            profit = isHit ? (84000 - stake) : -stake;
        }
        returns.push(profit / stake);
    }

    const mean = returns.reduce((sum, v) => sum + v, 0) / returns.length;
    const variance = returns.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (returns.length - 1);
    const std = Math.sqrt(variance);

    if (std <= 1e-6) {
        return mean > 0 ? 3.0 : (mean < 0 ? -3.0 : 0);
    }

    const annualizedSharpe = (mean / std) * Math.sqrt(365);
    // Clamp to realistic bounds [-5.0, +10.0]
    return Number(Math.max(-5.0, Math.min(10.0, annualizedSharpe)).toFixed(2));
}

/**
 * Computes Maximum Drawdown and trailing loss streak over window.
 */
function calculateRollingDrawdown(ledger = [], targetDate = null, windowSize = 30, defaultStakeK = 77000) {
    const history = getHistoricalLedger(ledger, targetDate);
    if (!history.length) {
        return { maxDrawdownK: 0, currentDrawdownK: 0, lossStreak: 0 };
    }
    const window = history.slice(-windowSize);

    let cumProfit = 0;
    let peak = 0;
    let maxDD = 0;
    let lossStreak = 0;

    for (const r of window) {
        let profit = 0;
        if (r.profitK !== undefined && r.profitK !== null) {
            profit = Number(r.profitK);
        } else if (r.pnlK !== undefined && r.pnlK !== null) {
            profit = Number(r.pnlK);
        } else if (r.payoutK !== undefined && r.stakeK !== undefined) {
            profit = Number(r.payoutK) - Number(r.stakeK);
        } else {
            const isHit = Boolean(r.isHit || r.hit || r.isWin);
            profit = isHit ? (84000 - defaultStakeK) : -defaultStakeK;
        }

        cumProfit += profit;
        if (cumProfit > peak) peak = cumProfit;
        const dd = peak - cumProfit;
        if (dd > maxDD) maxDD = dd;

        if (profit > 0) {
            lossStreak = 0;
        } else {
            lossStreak++;
        }
    }

    const currentDD = peak - cumProfit;
    return {
        maxDrawdownK: Math.round(maxDD),
        currentDrawdownK: Math.round(currentDD),
        lossStreak
    };
}

/**
 * Min-Max normalizer into [0, 1]
 */
function normalizeMinMax(val, min, max, defaultVal = 0.5) {
    if (max === min) return defaultVal;
    const norm = (val - min) / (max - min);
    return Math.max(0, Math.min(1, norm));
}

/**
 * Evaluates all 12 candidate methods and computes multi-factor scores.
 *
 * @param {string} targetDate Target prediction date
 * @param {Object} context Execution context with advisorCache, rawRows, options
 * @returns {Object} Comprehensive evaluation result with candidate scores and selected method
 */
function evaluateAutoBestSelection(targetDate, context = {}) {
    const dateStr = String(targetDate || '2026-10-04').slice(0, 10);
    const options = context.options || {};
    const config = { ...DEFAULT_CONFIG, ...options.config };
    const currentMethod = options.currentMethod || null;

    // 1. Load candidate universe (12 methods)
    const candidates = loadAllDynamicCandidates(dateStr, context);

    // 2. Load ledgers from advisorCache or files
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

    const candidateLedgersMap = {};

    // Elite engines ledgers
    ELITE_ENGINE_IDS.forEach(engId => {
        let ledger = [];
        if (cache && cache[engId]?.settledLedger) {
            ledger = cache[engId].settledLedger;
        } else if (context.methodsLedgersMap && context.methodsLedgersMap[engId]) {
            ledger = context.methodsLedgersMap[engId];
        }
        candidateLedgersMap[engId] = getHistoricalLedger(ledger, dateStr);
    });

    // Pool 7 baseline ledgers
    try {
        const perfPath = path.resolve(__dirname, '../data/statistics/cached_prediction_history_performance_2026.json');
        if (fs.existsSync(perfPath)) {
            const perf = JSON.parse(fs.readFileSync(perfPath, 'utf8'));
            if (perf?.methods) {
                POOL_7_METHOD_IDS.forEach(pId => {
                    const daily = perf.methods[pId]?.daily;
                    if (Array.isArray(daily)) {
                        candidateLedgersMap[pId] = getHistoricalLedger(daily, dateStr);
                    }
                });
            }
        }
    } catch (_) {}

    // Cross-hedging / Pillar 1 fallback for Markov if needed
    if (cache?.crossHedgingPortfolio?.settledLedger && (!candidateLedgersMap.deMarkovGapHazard || candidateLedgersMap.deMarkovGapHazard.length < 270)) {
        const chLedger = getHistoricalLedger(cache.crossHedgingPortfolio.settledLedger, dateStr);
        if (chLedger.length > (candidateLedgersMap.deMarkovGapHazard?.length || 0)) {
            candidateLedgersMap.deMarkovGapHazard = chLedger.map(r => ({
                date: r.date || r.predictionDate,
                isHit: Boolean(r.isDeHit || r.isVipHit),
                isVipHit: Boolean(r.isVipHit),
                profitK: r.deProfitK,
                stakeK: r.deStakeK || 77000,
                payoutK: (r.deProfitK || 0) + (r.deStakeK || 77000)
            }));
        }
    }

    // 3. Evaluate each candidate across quantitative dimensions
    const evaluatedCandidates = [];

    candidates.forEach(cand => {
        const mId = cand.methodId;
        const ledger = candidateLedgersMap[mId] || [];
        const meta = METHOD_METADATA_REGISTRY[mId] || {
            methodId: mId,
            methodLabel: cand.methodLabel || mId,
            category: cand.category || 'elite'
        };

        const defaultStakeK = cand.stakeK || (cand.category === 'elite' ? 77000 : 30000);

        // A. Rolling Win Rates (7D and 30D)
        const wr = calculateRollingWinRates(ledger, dateStr, cand.category === 'elite' ? 0.45 : 0.35);

        // B. 7-Day Net PnL
        const pnl7DK = calculateRollingPnL(ledger, dateStr, 7, defaultStakeK);

        // C. Rolling Sharpe Ratio (30D)
        const sharpe30D = calculateRollingSharpe(ledger, dateStr, 30, defaultStakeK);

        // D. Drawdown & Streak Loss
        const dd = calculateRollingDrawdown(ledger, dateStr, 30, defaultStakeK);

        // E. Transition Metrics & Anticipatory Tag
        const transition = computePITTransitionMetricsForLedger(ledger, 999999, config);

        // F. Prior Hit Ratio & EV
        const trials = Math.max(1, ledger.length);
        const wins = ledger.filter(r => {
            const info = extractLedgerRowInfo(r);
            return info ? (info.isHit || info.isVipHit) : Boolean(r.isHit || r.hit || r.isWin);
        }).length;

        const vipWins = ledger.filter(r => {
            const info = extractLedgerRowInfo(r);
            return info ? info.isVipHit : Boolean(r.isVipHit || r.hitType === 'win_x3' || r.hitType === 'win_x2');
        }).length;

        const pBase = cand.category === 'elite' ? 0.43 : 0.30;
        const pVIP = cand.category === 'elite'
            ? Math.min(0.25, (vipWins + 1.0) / (trials + 5.0))
            : 0.0;
        const pBackup = cand.category === 'elite'
            ? Math.max(0.05, (wins - vipWins + 3.0) / (trials + 5.0))
            : Math.max(0.10, (wins + 3.0) / (trials + 10.0));

        const expectedProfitK = computeExpectedProfitK(pVIP, pBackup, defaultStakeK, config.PAYOUT_VIP_K, config.PAYOUT_BACKUP_K);
        const breakEvenHitRate = computeDynamicBreakEven(defaultStakeK, cand.vipCount ? (cand.vipCount / Math.max(1, cand.totalCount)) : 0);
        const wilsonLower90 = computeWilsonLower90(wins, trials);
        const wilsonLower95 = computeWilsonScore95(wins, trials);

        // G. Transition bonuses/penalties
        const isIncumbent = (mId === currentMethod);
        const deltaRebound = REBOUND_BONUSES[transition.curTag] || 0;
        const gammaFatigue = (FATIGUE_PENALTIES[transition.curTag] || 0) * (isIncumbent ? 0.67 : 1.0);
        const etaInertia = isIncumbent ? DEFAULT_ROUTER_CONFIG.inertiaBonus : 0;

        evaluatedCandidates.push({
            methodId: mId,
            methodLabel: meta.methodLabel,
            category: meta.category,
            stakeK: defaultStakeK,
            numbers: cand.numbers,
            vipNumbers: cand.vipNumbers,
            backupNumbers: cand.backupNumbers,
            vipCount: cand.vipCount || 0,
            backupCount: cand.backupCount || 0,
            totalCount: cand.totalCount || cand.numbers.length,
            // Metrics:
            winRate7D: wr.winRate7D,
            winRate30D: wr.winRate30D,
            pnl7DK,
            sharpe30D,
            maxDrawdownK: dd.maxDrawdownK,
            currentDrawdownK: dd.currentDrawdownK,
            lossStreak: dd.lossStreak,
            expectedProfitK,
            breakEvenHitRate,
            wilsonLower90,
            wilsonLower95,
            trials,
            wins,
            curTag: transition.curTag,
            transitionProb: transition.condProb,
            deltaRebound,
            gammaFatigue,
            etaInertia,
            isIncumbent
        });
    });

    // 4. Multi-Factor Min-Max Normalization & Composite Scoring
    const minEV = Math.min(...evaluatedCandidates.map(c => c.expectedProfitK));
    const maxEV = Math.max(...evaluatedCandidates.map(c => c.expectedProfitK));

    const minSharpe = Math.min(...evaluatedCandidates.map(c => c.sharpe30D));
    const maxSharpe = Math.max(...evaluatedCandidates.map(c => c.sharpe30D));

    const minPnL = Math.min(...evaluatedCandidates.map(c => c.pnl7DK));
    const maxPnL = Math.max(...evaluatedCandidates.map(c => c.pnl7DK));

    const minWR = Math.min(...evaluatedCandidates.map(c => c.winRate30D));
    const maxWR = Math.max(...evaluatedCandidates.map(c => c.winRate30D));

    const minDD = Math.min(...evaluatedCandidates.map(c => c.maxDrawdownK));
    const maxDD = Math.max(...evaluatedCandidates.map(c => c.maxDrawdownK));

    evaluatedCandidates.forEach(c => {
        const normEV = normalizeMinMax(c.expectedProfitK, minEV, maxEV);
        const normSharpe = normalizeMinMax(c.sharpe30D, minSharpe, maxSharpe);
        const normPnL = normalizeMinMax(c.pnl7DK, minPnL, maxPnL);
        const normWR = normalizeMinMax(c.winRate30D, minWR, maxWR);
        const normDD = normalizeMinMax(c.maxDrawdownK, minDD, maxDD);

        const weights = DEFAULT_FACTOR_WEIGHTS;

        const baseScore =
            weights.WEIGHT_EV * normEV +
            weights.WEIGHT_SHARPE * normSharpe +
            weights.WEIGHT_PNL_7D * normPnL +
            weights.WEIGHT_WR_30D * normWR -
            weights.WEIGHT_DRAWDOWN_PENALTY * normDD;

        const compositeScore = Number((baseScore + c.deltaRebound - c.gammaFatigue + c.etaInertia).toFixed(4));
        c.compositeScore = compositeScore;
        c.normalizedFactors = {
            normEV: Number(normEV.toFixed(3)),
            normSharpe: Number(normSharpe.toFixed(3)),
            normPnL: Number(normPnL.toFixed(3)),
            normWR: Number(normWR.toFixed(3)),
            normDD: Number(normDD.toFixed(3))
        };
    });

    // Sort descending by compositeScore
    evaluatedCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
    evaluatedCandidates.forEach((c, idx) => { c.rank = idx + 1; });

    // 5. Smart Abstain Filter Evaluation
    const divergenceReport = computeEnsembleDivergence(evaluatedCandidates);
    const topCandidate = evaluatedCandidates[0];

    const isAllNegativeEV = evaluatedCandidates.every(c => c.expectedProfitK < 0);
    const isDisasterFloor = topCandidate && topCandidate.trials >= 20 &&
        (topCandidate.category === 'elite'
            ? topCandidate.wilsonLower90 < (0.75 * topCandidate.breakEvenHitRate)
            : topCandidate.wilsonLower90 < topCandidate.breakEvenHitRate);
    const isExtremeDivergence = divergenceReport.D_ensemble > 0.85;

    let isAbstain = isAllNegativeEV || isDisasterFloor || isExtremeDivergence;
    let status = isAbstain ? 'ABSTAIN' : 'ACTIVE';
    let action = isAbstain ? 'ABSTAIN' : 'BET';

    // 6. Multi-Factor Reasoning Justification
    let reasoning = '';
    if (isAbstain) {
        const triggers = [];
        if (isAllNegativeEV) triggers.push('Tất cả phương pháp có kỳ vọng toán học âm (E[Profit] < 0)');
        if (isDisasterFloor) triggers.push(`Cận dưới Wilson (${(topCandidate.wilsonLower90 * 100).toFixed(1)}%) vi phạm sàn bảo vệ vốn (< ${(topCandidate.breakEvenHitRate * 75).toFixed(1)}%)`);
        if (isExtremeDivergence) triggers.push(`Độ phân kỳ hệ thống quá cao (D_ensemble=${divergenceReport.D_ensemble.toFixed(2)} > 0.85)`);
        reasoning = `🛡️ KÍCH HOẠT KHIÊN BẢO TOÀN VỐN (SMART ABSTAIN): ${triggers.join('; ')}. Quyết định tối ưu: Tạm dừng cược hôm nay để bảo toàn vốn.`;
    } else {
        const wr7Pct = (topCandidate.winRate7D * 100).toFixed(1);
        const wr30Pct = (topCandidate.winRate30D * 100).toFixed(1);
        const pnlStr = topCandidate.pnl7DK >= 0 ? `+${(topCandidate.pnl7DK / 1000).toFixed(1)}M` : `${(topCandidate.pnl7DK / 1000).toFixed(1)}M`;
        const evStr = topCandidate.expectedProfitK >= 0 ? `+${(topCandidate.expectedProfitK / 1000).toFixed(1)}M` : `${(topCandidate.expectedProfitK / 1000).toFixed(1)}M`;
        const ddStr = `${(topCandidate.maxDrawdownK / 1000).toFixed(1)}M`;

        reasoning = `Hệ thống Auto Best-Selection chọn [${topCandidate.methodLabel}] (#1 Score: ${topCandidate.compositeScore}): Sharpe 30D đạt ${topCandidate.sharpe30D}, Win rate 7D ${wr7Pct}% (30D ${wr30Pct}%), PnL 7 ngày ${pnlStr}, Max Drawdown khống chế ${ddStr} (${topCandidate.curTag}), kỳ vọng toán học E[Profit] = ${evStr}.`;
    }

    return {
        selectedMethod: topCandidate.methodId,
        selectedMethodLabel: topCandidate.methodLabel,
        status,
        action,
        reasoning,
        targetDate: dateStr,
        stakeK: isAbstain ? 0 : topCandidate.stakeK,
        numbers: topCandidate.numbers,
        vipNumbers: topCandidate.vipNumbers,
        backupNumbers: topCandidate.backupNumbers,
        scores: evaluatedCandidates.map(c => ({
            methodId: c.methodId,
            methodLabel: c.methodLabel,
            category: c.category,
            compositeScore: c.compositeScore,
            winRate7D: c.winRate7D,
            winRate30D: c.winRate30D,
            pnl7DK: c.pnl7DK,
            sharpe30D: c.sharpe30D,
            maxDrawdownK: c.maxDrawdownK,
            expectedProfitK: c.expectedProfitK,
            curTag: c.curTag,
            transitionProb: c.transitionProb,
            rank: c.rank
        })),
        metrics: {
            winRate7D: topCandidate.winRate7D,
            winRate30D: topCandidate.winRate30D,
            pnl7DK: topCandidate.pnl7DK,
            sharpe30D: topCandidate.sharpe30D,
            maxDrawdownK: topCandidate.maxDrawdownK,
            expectedProfitK: topCandidate.expectedProfitK,
            curTag: topCandidate.curTag,
            transitionProb: topCandidate.transitionProb
        },
        ensembleDivergence: divergenceReport.D_ensemble,
        evaluatedAt: new Date().toISOString()
    };
}

module.exports = {
    ALL_CANDIDATE_IDS,
    ELITE_ENGINE_IDS,
    POOL_7_METHOD_IDS,
    METHOD_METADATA_REGISTRY,
    DEFAULT_FACTOR_WEIGHTS,
    calculateRollingWinRates,
    calculateRollingPnL,
    calculateRollingSharpe,
    calculateRollingDrawdown,
    evaluateAutoBestSelection
};
