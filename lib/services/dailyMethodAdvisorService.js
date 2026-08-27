'use strict';

const fs = require('fs');
const path = require('path');
const { scoringForms } = require('../utils/lotteryScoring');
const dualMergeAdvisorService = require('./dualMergeAdvisorService');
const loDualMergeAdvisorService = require('./loDualMergeAdvisorService');
const tripleMergeAdvisorService = require('./tripleMergeAdvisorService');

const NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = 30;
const LOOKBACK_DRAWS = 180;
const MIN_OBSERVATIONS = 20;
const MIN_CURRENT_SIGNAL_OBSERVATIONS = 7;
const FUSION_ZSCORE_WEIGHT = 0.06;
const FUSION_ID = 'all-method-fixed30-consensus-v1';
const MAIN_STRATEGY_ID = 'balanced-selector-fixed30-v1';
const ROBUST_STRATEGY_ID = 'robust-horizon-selector-v1';
const INDEPENDENT_FUSION_ID = 'independent-family-consensus-v1';
const WILSON_ABSTAIN_ID = 'wilson-abstain-selector-v1';
const CACHE_VERSION = 'daily-advisor-model-selection-v10';
const IMMUTABLE_LEDGER_MODES = new Set(['live-issued', 'reconstructed-after-draw']);
const STRATEGY_CATALOG = [
    {
        id: MAIN_STRATEGY_ID,
        label: 'Bộ chọn cân bằng (dàn chính)',
        status: 'production-tracked',
        description: 'Chọn nguyên dàn 30 số đã có trong snapshot bằng posterior 7/30/90 kỳ, Wilson và EWMA; không tái tạo dàn cũ.'
    },
    {
        id: FUSION_ID,
        label: 'Đồng thuận toàn bộ dàn 30',
        status: 'research-only',
        description: 'Khử dàn trùng, cân bằng họ phương pháp, giảm ảnh hưởng của các dàn gần giống và dùng Z-score chỉ để phá hòa.'
    },
    {
        id: ROBUST_STRATEGY_ID,
        label: 'Chọn bền vững đa khung thời gian',
        status: 'research-only',
        description: 'Chọn nguyên một dàn có kết quả ổn định nhất đồng thời ở 7, 30 và 90 kỳ; phạt chuỗi trượt và không đuổi theo một nhịp thắng ngắn.'
    },
    {
        id: INDEPENDENT_FUSION_ID,
        label: 'Đồng thuận giữa các họ độc lập',
        status: 'research-only',
        description: 'Mỗi họ tín hiệu chỉ được một phiếu đại diện trước khi xếp hạng 100 số, hạn chế Edge/Dropoff hoặc biến thể cùng họ bỏ phiếu lặp.'
    },
    {
        id: WILSON_ABSTAIN_ID,
        label: 'Wilson thận trọng, cho phép bỏ ngày',
        status: 'research-only',
        description: 'Chỉ phát hành dàn khi cận dưới Wilson và posterior 30 kỳ cùng vượt hòa vốn; thiếu bằng chứng thì bỏ ngày và không phát sinh vốn.'
    }
];
const DAILY_METHOD_POOL = [
    'dedupEdge75Hold70',
    'dedupEdge50CombinedB40S05Hold70',
    'dedupDropoffHold70',
    'avgEdge50Hold70',
    'chainSmallFirstHold70'
];
const METHOD_LABELS = {
    chainSmallFirstHold70: 'Chuỗi nhỏ trước - Hold 70',
    deParallelBlock85Small65Hold70: 'Đề Song Song (Block 85 · Small 65) - Hold 70',
    dedupEdge50CombinedB40S05Hold70: 'Edge khử trùng 75% nền - Hold 70',
    dedupEdge50CombinedB40S05Hold80: 'Edge khử trùng 75% nền - Hold 80',
    dedupEdge50Hold70: 'Edge khử trùng - Hold 70',
    dedupEdge50Hold80: 'Edge khử trùng - Hold 80',
    avgEdge50Hold70: 'Dropoff TB từng số - Hold 70',
    dedupEdge75Hold70: 'Edge75 PIT có kiểm chứng - Hold 70',
    dedupDropoffHold70: 'Dropoff khử trùng tập số - Hold 70'
};
const SELECTION_MODELS = [
    {
        id: 'balanced',
        label: 'Cân bằng dài-ngắn',
        description: 'Cân bằng posterior 7/30/90 ngày, Wilson và EWMA. Đây là mô hình mặc định vì ít phản ứng quá mức với một chuỗi ngắn.'
    },
    {
        id: 'momentum',
        label: 'Bám xu hướng ngắn hạn',
        description: 'Tăng trọng số cho 7/30 ngày và EWMA 7 ngày, nhưng vẫn giữ Wilson 90 ngày để hạn chế chọn nhầm vì một vài kỳ trúng liên tiếp.'
    },
    {
        id: 'stability',
        label: 'Ổn định có kiểm chứng',
        description: 'Ưu tiên posterior 90 ngày, cận Wilson và EWMA 21 ngày. Phản ứng chậm hơn nhưng thiên về độ bền của phương pháp.'
    },
    {
        id: 'bayesGuard',
        label: 'Bayes/Wilson có phạt chuỗi trượt',
        description: 'Kéo xác suất về mức nền, đặt cận Wilson làm trọng số chính và phạt chuỗi trượt đang diễn ra; dùng để kiểm chứng thay vì đuổi theo tỷ lệ thô.'
    },
    {
        id: 'hedge',
        label: 'Hedge online giữa các dàn',
        description: 'Cập nhật trọng số mỗi phương pháp sau khi kết quả đã chốt; ở ngày mới chỉ chọn theo trọng số tích lũy trước ngày đó.'
    }
];

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function nextIsoDate(value) {
    const date = new Date(`${isoDate(value)}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number).filter(number => Number.isInteger(number) && number >= 0 && number < 100))]
        .sort((left, right) => left - right);
}

function methodNumbers(method) {
    return normalizeNumbers(method?.numbersToBet || method?.betNumbers || method?.numbers);
}

function humanizeMethodId(methodId) {
    return String(methodId || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\bhold\s*(\d+)/gi, 'Hold $1')
        .replace(/\btop\s*(\d+)/gi, 'Top $1')
        .replace(/^./, character => character.toUpperCase());
}

function methodLabel(methodId, method = null) {
    return method?.label || method?.name || METHOD_LABELS[methodId] || humanizeMethodId(methodId) || methodId;
}

function discoverCurrentMethods(methods) {
    return Object.entries(methods || {}).map(([methodId, method]) => {
        const numbers = methodNumbers(method);
        return {
            methodId,
            label: methodLabel(methodId, method),
            numbers,
            betCount: numbers.length,
            experimental: !DAILY_METHOD_POOL.includes(methodId),
            eligibleForMain: numbers.length === BET_COUNT
        };
    }).filter(profile => profile.betCount > 0 && profile.betCount < 100)
        .sort((left, right) => Number(right.eligibleForMain) - Number(left.eligibleForMain)
            || left.betCount - right.betCount
            || left.methodId.localeCompare(right.methodId));
}

function isSettled(run) {
    const actual = run?.summary?.actualSpecial;
    return actual !== null
        && actual !== undefined
        && actual !== ''
        && Number.isInteger(Number(actual));
}

function readRawRows(rawRows) {
    return (rawRows || []).map(row => ({ date: isoDate(row.date), actual: Number(row.special) }))
        .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isInteger(row.actual) && row.actual >= 0 && row.actual < 100)
        .sort((left, right) => left.date.localeCompare(right.date));
}

function buildUniqueGroups() {
    const unique = new Map();
    for (const form of scoringForms) {
        const numbers = NUMBERS.filter(number => form.checkFunction(number));
        if (!numbers.length || numbers.length === 100) continue;
        const signature = numbers.join(',');
        if (!unique.has(signature)) unique.set(signature, { numbers, probability: numbers.length / 100 });
    }
    const groups = [...unique.values()];
    const byNumber = Array.from({ length: 100 }, () => []);
    groups.forEach((group, groupId) => group.numbers.forEach(number => byNumber[number].push(groupId)));
    return { groups, byNumber };
}

function buildZScore(rawRows, rawIndex, date, groupsData, lookback = LOOKBACK_DRAWS) {
    // A future prediction date is not in raw yet. In that case its valid
    // information set ends at the latest available draw, not at a zero-score
    // fallback that would make the hybrid arbitrary.
    const position = rawIndex.has(date) ? rawIndex.get(date) : rawRows.length;
    if (!Number.isInteger(position)) return null;
    const start = Math.max(0, position - lookback);
    const span = position - start;
    if (span < Math.min(30, lookback)) return null;
    const counts = Array(groupsData.groups.length).fill(0);
    for (let index = start; index < position; index++) {
        for (const groupId of groupsData.byNumber[rawRows[index].actual]) counts[groupId]++;
    }
    const scores = NUMBERS.map(number => {
        const values = groupsData.byNumber[number].map(groupId => {
            const probability = groupsData.groups[groupId].probability;
            const expected = span * probability;
            const variance = Math.max(1, span * probability * (1 - probability));
            return (expected - counts[groupId]) / Math.sqrt(variance);
        }).sort((left, right) => right - left);
        return values.length ? values.slice(0, 3).reduce((sum, value) => sum + value, 0) / Math.min(3, values.length) : 0;
    });
    const sorted = scores.map((score, number) => ({ number, score })).sort((left, right) => right.score - left.score || left.number - right.number);
    const percentile = Array(100);
    sorted.forEach((item, rank) => { percentile[item.number] = 1 - rank / 99; });
    return { lookback: span, scores, percentile, topNumbers: sorted.slice(0, 10) };
}

function wilsonLower(wins, total, z = 1.2815515655446004) {
    if (!total) return 0;
    const p = wins / total;
    const denominator = 1 + (z * z) / total;
    const centre = p + (z * z) / (2 * total);
    const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);
    return Math.max(0, (centre - margin) / denominator);
}

function weightedHitRate(rows, methodId, halfLife = 14) {
    if (!rows.length) return 0;
    let weightedHits = 0;
    let weightSum = 0;
    rows.forEach((run, index) => {
        const age = rows.length - 1 - index;
        const weight = Math.exp((-Math.LN2 * age) / halfLife);
        const hit = normalizeNumbers(run.summary.methods[methodId].numbersToBet)
            .includes(Number(run.summary.actualSpecial));
        weightSum += weight;
        weightedHits += Number(hit) * weight;
    });
    return weightSum ? weightedHits / weightSum : 0;
}

function hitsForMethod(rows, methodId) {
    return rows.reduce((sum, run) => sum + Number(
        normalizeNumbers(run?.summary?.methods?.[methodId]?.numbersToBet)
            .includes(Number(run?.summary?.actualSpecial))
    ), 0);
}

function trailingLossStreak(rows, methodId) {
    let streak = 0;
    for (let index = (rows || []).length - 1; index >= 0; index -= 1) {
        const run = rows[index];
        const numbers = normalizeNumbers(run?.summary?.methods?.[methodId]?.numbersToBet);
        if (numbers.includes(Number(run?.summary?.actualSpecial))) break;
        streak += 1;
    }
    return streak;
}

function betaPosteriorMean(wins, total, priorWins, priorLosses) {
    return (wins + priorWins) / Math.max(1, total + priorWins + priorLosses);
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function softmax(values) {
    const maximum = Math.max(...values);
    const exponentials = values.map(value => Math.exp(clamp(value - maximum, -30, 30)));
    const total = exponentials.reduce((sum, value) => sum + value, 0) || 1;
    return exponentials.map(value => value / total);
}

function summarizeMethodWindow(priorRuns, methodId, limit) {
    const available = (priorRuns || []).filter(run => isSettled(run) && methodNumbers(run?.summary?.methods?.[methodId]).length);
    const rows = available.slice(-(limit || available.length));
    const counts = rows.map(run => methodNumbers(run.summary.methods[methodId]).length);
    const wins = rows.reduce((sum, run) => sum + Number(
        methodNumbers(run.summary.methods[methodId]).includes(Number(run.summary.actualSpecial))
    ), 0);
    const stakeK = counts.reduce((sum, count) => sum + count * 1000, 0);
    const payoutK = wins * 84 * 1000;
    const averageBetCount = counts.length ? counts.reduce((sum, count) => sum + count, 0) / counts.length : 0;
    const breakEvenHitRate = averageBetCount / 84;
    const baselineHitRate = averageBetCount / 100;
    const posterior = betaPosteriorMean(
        wins,
        rows.length,
        baselineHitRate * 20,
        (1 - baselineHitRate) * 20
    );
    return {
        observations: rows.length,
        wins,
        losses: rows.length - wins,
        hitRate: rows.length ? wins / rows.length : 0,
        posterior,
        wilsonLower: wilsonLower(wins, rows.length),
        averageBetCount,
        breakEvenHitRate,
        stakeK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0
    };
}

function buildCurrentMethodProfiles(priorRuns, methods) {
    return discoverCurrentMethods(methods).map(profile => {
        const recent7 = summarizeMethodWindow(priorRuns, profile.methodId, 7);
        const recent30 = summarizeMethodWindow(priorRuns, profile.methodId, 30);
        const recent90 = summarizeMethodWindow(priorRuns, profile.methodId, 90);
        const strong30 = recent30.observations >= MIN_CURRENT_SIGNAL_OBSERVATIONS
            && recent30.profitK > 0
            && recent30.posterior >= recent30.breakEvenHitRate;
        const strong7 = recent7.observations >= MIN_CURRENT_SIGNAL_OBSERVATIONS
            && recent7.profitK > 0
            && recent7.posterior >= recent7.breakEvenHitRate;
        const currentStrong = strong30 || strong7;
        const signalStrength = Math.max(
            recent30.posterior - recent30.breakEvenHitRate,
            recent7.posterior - recent7.breakEvenHitRate
        );
        return {
            ...profile,
            currentStrong,
            status: currentStrong
                ? (profile.experimental ? 'strong-experimental' : 'strong-tracked')
                : (profile.experimental ? 'experimental' : 'tracked'),
            signalStrength: Number(signalStrength.toFixed(6)),
            performance: { recent7, recent30, recent90 }
        };
    }).sort((left, right) => Number(right.currentStrong) - Number(left.currentStrong)
        || right.signalStrength - left.signalStrength
        || right.performance.recent30.profitK - left.performance.recent30.profitK
        || left.methodId.localeCompare(right.methodId));
}

function rankMethods(priorRuns, methodIds, methods = {}) {
    return methodIds.map(methodId => {
        // Compare the main lane only on historical days where the method also
        // issued exactly BET_COUNT numbers. A temporarily wider dàn must not
        // inflate the hit rate of a method that currently has 30 numbers.
        const samples = priorRuns.filter(run => isSettled(run)
            && methodNumbers(run?.summary?.methods?.[methodId]).length === BET_COUNT);
        const recent7 = samples.slice(-7);
        const recent30 = samples.slice(-30);
        const recent90 = samples.slice(-90);
        const count7 = hitsForMethod(recent7, methodId);
        const count30 = hitsForMethod(recent30, methodId);
        const count90 = hitsForMethod(recent90, methodId);
        const total = recent90.length;
        // Pull every horizon toward the 30% baseline. A short winning streak
        // therefore cannot dominate the daily recommendation by itself.
        const posteriorMean = betaPosteriorMean(count90, total, 18, 42);
        const posterior30 = betaPosteriorMean(count30, recent30.length, 12, 28);
        const posterior7 = betaPosteriorMean(count7, recent7.length, 8, 18);
        const lower = wilsonLower(count90, total);
        const rate7 = recent7.length ? count7 / recent7.length : 0;
        const recentRate = recent30.length ? count30 / recent30.length : 0;
        const weightedRate7 = weightedHitRate(recent30, methodId, 7);
        const weightedRate30 = weightedHitRate(recent90, methodId, 21);
        const recentLossStreak = trailingLossStreak(samples.slice(-30), methodId);
        const trend = clamp(
            0.55 * (posterior7 - posteriorMean) + 0.45 * (posterior30 - posteriorMean),
            -0.10,
            0.10
        );
        const stableScore = 0.24 * posteriorMean
            + 0.20 * posterior30
            + 0.12 * posterior7
            + 0.22 * lower
            + 0.15 * weightedRate30
            + 0.07 * weightedRate7;
        return {
            methodId,
            label: methodLabel(methodId, methods[methodId]),
            betCount: methodNumbers(methods[methodId]).length || BET_COUNT,
            experimental: !DAILY_METHOD_POOL.includes(methodId),
            observations: total,
            wins7: count7,
            observations7: recent7.length,
            rate7,
            wins30: count30,
            observations30: recent30.length,
            rate30: recentRate,
            wins90: count90,
            rate90: total ? count90 / total : 0,
            posteriorMean,
            posterior30,
            posterior7,
            wilsonLower90: lower,
            weightedRate7,
            weightedRate30,
            recentLossStreak,
            trend,
            stableScore,
            score: stableScore + trend
        };
    }).sort((left, right) => right.score - left.score || right.wilsonLower90 - left.wilsonLower90 || left.methodId.localeCompare(right.methodId));
}

function scoreForSelectionModel(row, modelId) {
    if (!row) return -Infinity;
    if (modelId === 'momentum') {
        return 0.24 * row.posterior7
            + 0.24 * row.posterior30
            + 0.18 * row.weightedRate7
            + 0.16 * row.weightedRate30
            + 0.13 * row.wilsonLower90
            + 0.05 * row.posteriorMean
            + 0.55 * row.trend;
    }
    if (modelId === 'stability') {
        return 0.31 * row.posteriorMean
            + 0.29 * row.wilsonLower90
            + 0.21 * row.weightedRate30
            + 0.14 * row.posterior30
            + 0.05 * row.weightedRate7
            + 0.20 * row.trend;
    }
    if (modelId === 'bayesGuard') {
        const lossPenalty = Math.min(0.12, Number(row.recentLossStreak || 0) / 300);
        return 0.34 * row.posteriorMean
            + 0.31 * row.wilsonLower90
            + 0.17 * row.posterior30
            + 0.12 * row.weightedRate30
            + 0.06 * row.weightedRate7
            - lossPenalty;
    }
    return row.score;
}

function rankForSelectionModel(ranking, modelId) {
    return (ranking || []).map(row => ({
        ...row,
        selectionScore: scoreForSelectionModel(row, modelId)
    })).sort((left, right) => right.selectionScore - left.selectionScore
        || right.wilsonLower90 - left.wilsonLower90
        || left.methodId.localeCompare(right.methodId));
}

function hedgeMethodRanking(priorRuns, methodIds, methods = {}) {
    const ids = (methodIds || []).filter(Boolean);
    const logWeights = Object.fromEntries(ids.map(id => [id, 0]));
    const wins = Object.fromEntries(ids.map(id => [id, 0]));
    const observations = Object.fromEntries(ids.map(id => [id, 0]));
    const ordered = (priorRuns || []).filter(isSettled)
        .slice().sort((left, right) => isoDate(left.predictionDate).localeCompare(isoDate(right.predictionDate)));
    ordered.forEach(run => {
        const available = ids.filter(id => normalizeNumbers(run?.summary?.methods?.[id]?.numbersToBet).length === BET_COUNT);
        available.forEach(id => {
            const hit = normalizeNumbers(run.summary.methods[id].numbersToBet).includes(Number(run.summary.actualSpecial));
            observations[id] += 1;
            wins[id] += Number(hit);
            // Exponential weighting is updated only after the row settles.
            // Reward is centred at the 30/100 hit probability of a 30-number dàn.
            const reward = Number(hit) - BET_COUNT / 100;
            logWeights[id] = clamp(logWeights[id] * 0.996 + 0.65 * reward, -6, 6);
        });
    });
    if (!ids.length) return [];
    const weights = softmax(ids.map(id => logWeights[id]));
    return ids.map((methodId, index) => {
        const total = observations[methodId];
        const success = wins[methodId];
        return {
            methodId,
            label: methodLabel(methodId, methods[methodId]),
            betCount: methodNumbers(methods[methodId]).length || BET_COUNT,
            experimental: !DAILY_METHOD_POOL.includes(methodId),
            observations: total,
            wins90: success,
            posteriorMean: betaPosteriorMean(success, total, 18, 42),
            wilsonLower90: wilsonLower(success, total),
            hedgeWeight: weights[index],
            selectionScore: weights[index]
        };
    }).sort((left, right) => right.selectionScore - left.selectionScore
        || right.wilsonLower90 - left.wilsonLower90
        || left.methodId.localeCompare(right.methodId));
}

function calculateConfidence(selected, confidenceGatePassed, models = []) {
    if (!selected) {
        return { score: 2.5, stars: 3, level: 'low', label: 'Cần theo dõi' };
    }
    const wilson = Number(selected.wilsonLower90 || 0);
    const rate30 = Number(selected.rate30 || 0);
    const obs = Number(selected.observations || 0);
    const trend = Number(selected.trend || 0);
    const agreeModels = (models || []).filter(m => m.selected?.methodId === selected.methodId).length;

    let score = 3.0;
    if (confidenceGatePassed) score += 0.8;
    if (wilson >= 0.38) score += 0.5;
    else if (wilson >= 0.357) score += 0.3;
    if (rate30 >= 0.40) score += 0.4;
    else if (rate30 >= 0.357) score += 0.2;
    if (obs >= 60) score += 0.2;
    if (trend > 0.02) score += 0.2;
    if (agreeModels >= 3) score += 0.3;

    score = Math.min(5.0, Math.max(1.0, Number(score.toFixed(1))));
    const stars = Math.round(score);
    let level = 'moderate';
    let label = 'Khá cao';
    if (score >= 4.5) {
        level = 'very-high';
        label = 'Rất cao ⭐⭐⭐⭐⭐';
    } else if (score >= 4.0) {
        level = 'high';
        label = 'Khá cao ⭐⭐⭐⭐';
    } else if (score >= 3.0) {
        level = 'moderate';
        label = 'Trung bình ⭐⭐⭐';
    } else {
        level = 'low';
        label = 'Cần quan sát ⭐⭐';
    }
    return { score, stars, level, label };
}

function buildPlainReasons(selected, confidenceGatePassed, models = []) {
    if (!selected) {
        return [
            'Chưa có phương pháp nào đủ dữ liệu lịch sử để đưa ra đánh giá an toàn.',
            'Hệ thống khuyến nghị ở chế độ theo dõi và quan sát.'
        ];
    }
    const reasons = [];
    const wins30 = Number(selected.wins30 || 0);
    const obs30 = Number(selected.observations30 || 0);
    const rate30Pct = obs30 ? (wins30 / obs30 * 100).toFixed(1) : '0.0';
    const wilsonPct = (Number(selected.wilsonLower90 || 0) * 100).toFixed(1);
    const trend = Number(selected.trend || 0);

    if (obs30 >= 7) {
        reasons.push(`🔥 Phong độ 30 kỳ: Trúng ${wins30}/${obs30} ngày (${rate30Pct}%), xu hướng ${trend >= 0 ? 'tăng +' : ''}${(trend * 100).toFixed(1)}%.`);
    }
    reasons.push(`🛡️ Cận an toàn Wilson 90%: Đạt ${wilsonPct}% (mốc hòa vốn lý thuyết 35,7%).`);

    const agreeModels = (models || []).filter(m => m.selected?.methodId === selected.methodId).length;
    if (agreeModels >= 2) {
        reasons.push(`🤝 Đồng thuận cao: Được ${agreeModels}/5 bộ chọn chiến lược cùng xếp hạng hàng đầu.`);
    } else {
        reasons.push(`⚖️ Được bộ phân tích Cân Bằng dài-ngắn hạn chọn lọc tối ưu.`);
    }

    if (confidenceGatePassed) {
        reasons.push(`✅ Đủ tiêu chuẩn theo dõi cược: Mọi chỉ báo đều vượt ngưỡng hòa vốn trước kỳ quay.`);
    } else {
        reasons.push(`⚠️ Mức cược thăm dò: Tín hiệu đang ở vùng tích lũy, nên đánh đều tay hoặc thăm dò.`);
    }
    return reasons;
}

function selectMethod(priorRuns, methodIds, methods = {}) {
    const ranking = rankMethods(priorRuns, methodIds, methods);
    const hedgeRanking = hedgeMethodRanking(priorRuns, methodIds, methods);
    const models = SELECTION_MODELS.map(model => {
        const modelRanking = model.id === 'hedge'
            ? hedgeRanking
            : rankForSelectionModel(ranking, model.id);
        const selected = modelRanking.find(row => row.observations >= MIN_OBSERVATIONS) || modelRanking[0] || null;
        return {
            ...model,
            selected,
            ranking: modelRanking.map((row, index) => ({
                methodId: row.methodId,
                selectionScore: Number(row.selectionScore.toFixed(6)),
                rank: index + 1
            }))
        };
    });
    const selected = models.find(model => model.id === 'balanced')?.selected || null;
    const confidenceGatePassed = Boolean(
        selected
        && selected.observations >= 45
        && selected.wilsonLower90 >= BET_COUNT / 84
        && selected.posterior30 >= BET_COUNT / 84
    );
    const confidence = calculateConfidence(selected, confidenceGatePassed, models);
    const plainReasons = buildPlainReasons(selected, confidenceGatePassed, models);

    // The daily selector is a tracked recommendation. It must pass an
    // independent holdout before being promoted to an automatic betting rule.
    return {
        selected,
        ranking,
        models,
        action: confidenceGatePassed ? 'consider' : 'observe',
        confidenceGatePassed,
        confidence,
        plainReasons
    };
}

function summarizeDecisionModel(rows) {
    const settled = rows.filter(row => row?.resolved);
    const wins = settled.filter(row => row.hit).length;
    const losses = settled.length - wins;
    let currentLoss = 0;
    let longestLoss = 0;
    settled.forEach(row => {
        currentLoss = row.hit ? 0 : currentLoss + 1;
        longestLoss = Math.max(longestLoss, currentLoss);
    });
    const stakeK = settled.length * BET_COUNT * 1000;
    const profitK = wins * 84 * 1000 - stakeK;
    return {
        days: settled.length,
        wins,
        losses,
        hitRate: settled.length ? wins / settled.length : 0,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestLoss,
        breakEvenHitRate: BET_COUNT / 84
    };
}

function buildDecisionReport(runs, generatedSnapshots = []) {
    const decisions = new Map(SELECTION_MODELS.map(model => [model.id, []]));
    const ordered = (runs || []).filter(run => run?.predictionDate && run?.summary?.methods)
        .slice().sort((left, right) => left.predictionDate.localeCompare(right.predictionDate));
    ordered.forEach((run, index) => {
        if (!isSettled(run)) return;
        const priorRuns = ordered.slice(0, index).filter(isSettled);
        const methodIds = discoverCurrentMethods(run.summary?.methods)
            .filter(profile => profile.eligibleForMain)
            .map(profile => profile.methodId);
        if (priorRuns.length < MIN_OBSERVATIONS || !methodIds.length) return;
        const selection = selectMethod(priorRuns, methodIds, run.summary.methods);
        selection.models.forEach(model => {
            const method = run.summary.methods[model.selected?.methodId];
            const numbers = normalizeNumbers(method?.numbersToBet);
            if (numbers.length !== BET_COUNT) return;
            decisions.get(model.id).push({
                date: run.predictionDate,
                methodId: model.selected.methodId,
                hit: numbers.includes(Number(run.summary.actualSpecial)),
                resolved: true
            });
        });
    });
    // Compare the fusion lane on the same eligible dates as the production
    // selector. Including its first MIN_OBSERVATIONS warm-up dates would make
    // the two summaries incomparable.
    const eligibleDates = new Set((decisions.get('balanced') || []).map(row => row.date));
    const fusionRows = (generatedSnapshots || [])
        .filter(record => eligibleDates.has(record?.predictionDate))
        .filter(record => record?.settled
            && record?.hybrid?.id === FUSION_ID
            && record?.hybrid?.numbers?.length === BET_COUNT)
        .map(record => ({
            date: record.predictionDate,
            methodId: record.hybrid.id || FUSION_ID,
            hit: Boolean(record.hybrid.hit),
            resolved: true
        }));
    const fusionSummary = summarizeDecisionModel(fusionRows);
    const strategyRecords = (generatedSnapshots || [])
        .filter(record => eligibleDates.has(record?.predictionDate) && record?.settled);
    return {
        strictPointInTime: true,
        description: 'Mỗi dòng chỉ xếp hạng phương pháp từ các snapshot đã kết toán trước ngày đó; dàn của ngày cần đối soát được lấy nguyên từ snapshot lịch sử của chính ngày đó.',
        models: SELECTION_MODELS.map(model => {
            const rows = decisions.get(model.id) || [];
            return {
                ...model,
                summary: summarizeDecisionModel(rows),
                recent: rows.slice(-14).reverse()
            };
        }),
        fusion: {
            id: FUSION_ID,
            label: 'Tổng hợp toàn bộ phương pháp dàn 30 số',
            description: 'Mỗi ngày dùng các dàn có sẵn trong snapshot của chính ngày đó; trọng số chỉ học từ các ngày trước và dàn tương quan bị khử trùng/giảm trọng số.',
            status: 'research-only',
            promotionReason: fusionSummary.days && fusionSummary.hitRate >= fusionSummary.breakEvenHitRate
                ? 'Đã vượt hòa vốn trên replay hiện có nhưng vẫn cần một holdout độc lập trước khi thay dàn chính.'
                : 'Chưa vượt hòa vốn trên replay strict PIT, nên không được tự động thay dàn chính.',
            summary: fusionSummary,
            recent: fusionRows.slice(-14).reverse()
        },
        strategies: STRATEGY_CATALOG.map(strategy => ({
            ...strategy,
            summary: summarizeStrategy(strategyRecords, strategy.id),
            recent: strategyRecords.map(record => {
                const snapshot = (record.strategySnapshots || []).find(row => row.strategyId === strategy.id);
                return snapshot ? {
                    date: record.predictionDate,
                    hit: snapshot.hit,
                    abstained: snapshot.abstained,
                    betCount: snapshot.betCount
                } : null;
            }).filter(Boolean).slice(-14).reverse()
        }))
    };
}

function fusionFamily(methodId) {
    const id = String(methodId || '').toLowerCase();
    if (/parallel|block/.test(id)) return 'block-parallel';
    if (/chainsmall|smallchain|small/.test(id)) return 'small-chain';
    if (/dropoff/.test(id)) return 'dropoff';
    if (/edge/.test(id)) return 'edge';
    if (/risk|record|potential|scarcity|wilson/.test(id)) return 'risk-record';
    return id.replace(/hold\d+|top\d+|\d+/g, '').replace(/[^a-z]+/g, '-') || 'other';
}

function setJaccard(leftValues, rightValues) {
    const left = new Set(leftValues || []);
    const right = new Set(rightValues || []);
    if (!left.size && !right.size) return 1;
    let intersection = 0;
    left.forEach(number => { intersection += Number(right.has(number)); });
    return intersection / Math.max(1, left.size + right.size - intersection);
}

function blendedSoftmax(rows, scoreKey, learnedShare = 0.45, temperature = 0.08) {
    if (!rows.length) return [];
    const uniform = 1 / rows.length;
    const learned = softmax(rows.map(row => Number(row?.[scoreKey] || 0) / temperature));
    return rows.map((row, index) => ({
        ...row,
        blendedWeight: (1 - learnedShare) * uniform + learnedShare * learned[index]
    }));
}

function robustHorizonScore(row) {
    if (!row) return -Infinity;
    const horizonFloor = Math.min(
        Number(row.posterior7 || 0),
        Number(row.posterior30 || 0),
        Number(row.posteriorMean || 0)
    );
    const lossPenalty = Math.min(0.10, Number(row.recentLossStreak || 0) / 250);
    const sparsePenalty = Math.max(0, MIN_OBSERVATIONS - Number(row.observations || 0)) / 250;
    return 0.32 * horizonFloor
        + 0.23 * Number(row.wilsonLower90 || 0)
        + 0.17 * Number(row.posterior30 || 0)
        + 0.13 * Number(row.weightedRate30 || 0)
        + 0.08 * Number(row.weightedRate7 || 0)
        + 0.07 * Number(row.stableScore || 0)
        - lossPenalty
        - sparsePenalty;
}

function rankRobustMethods(ranking) {
    return (ranking || []).map(row => ({
        ...row,
        robustScore: robustHorizonScore(row),
        horizonFloor: Math.min(
            Number(row.posterior7 || 0),
            Number(row.posterior30 || 0),
            Number(row.posteriorMean || 0)
        )
    })).sort((left, right) => right.robustScore - left.robustScore
        || right.horizonFloor - left.horizonFloor
        || right.wilsonLower90 - left.wilsonLower90
        || left.methodId.localeCompare(right.methodId));
}

function buildIndependentFamilyConsensus(methods, ranking) {
    const comparable = rankRobustMethods(ranking)
        .filter(row => methodNumbers(methods?.[row.methodId]).length === BET_COUNT);
    const exactSets = new Map();
    comparable.forEach(row => {
        const numbers = methodNumbers(methods[row.methodId]);
        const signature = numbers.join(',');
        const current = exactSets.get(signature);
        if (!current || row.robustScore > current.robustScore) {
            exactSets.set(signature, { ...row, numbers, signature });
        }
    });

    const strongestByFamily = new Map();
    exactSets.forEach(row => {
        const family = fusionFamily(row.methodId);
        const current = strongestByFamily.get(family);
        if (!current || row.robustScore > current.robustScore) {
            strongestByFamily.set(family, { ...row, family });
        }
    });
    const representatives = blendedSoftmax(
        [...strongestByFamily.values()],
        'robustScore',
        0.35,
        0.08
    );
    if (!representatives.length) {
        return {
            abstained: true,
            numbers: [],
            representatives: [],
            evidence: [],
            familyCount: 0,
            uniqueSetCount: exactSets.size
        };
    }

    const scoreByNumber = Array(100).fill(0);
    const sourcesByNumber = Array.from({ length: 100 }, () => []);
    representatives.forEach(row => {
        row.numbers.forEach(number => {
            scoreByNumber[number] += row.blendedWeight;
            sourcesByNumber[number].push({
                methodId: row.methodId,
                family: row.family,
                weight: row.blendedWeight
            });
        });
    });
    const robustWinner = representatives.slice()
        .sort((left, right) => right.robustScore - left.robustScore || left.methodId.localeCompare(right.methodId))[0];
    const robustWinnerSet = new Set(robustWinner?.numbers || []);
    const rankedNumbers = NUMBERS.map(number => ({
        number,
        score: scoreByNumber[number],
        familyCount: sourcesByNumber[number].length,
        inRobustWinner: robustWinnerSet.has(number),
        sources: sourcesByNumber[number]
    })).sort((left, right) => right.familyCount - left.familyCount
        || right.score - left.score
        || Number(right.inRobustWinner) - Number(left.inRobustWinner)
        || left.number - right.number);
    const numbers = rankedNumbers.slice(0, BET_COUNT).map(row => row.number).sort((left, right) => left - right);
    return {
        abstained: false,
        numbers,
        familyCount: representatives.length,
        uniqueSetCount: exactSets.size,
        representatives: representatives.map(row => ({
            methodId: row.methodId,
            label: row.label,
            family: row.family,
            robustScore: Number(row.robustScore.toFixed(6)),
            weight: Number(row.blendedWeight.toFixed(6))
        })),
        evidence: rankedNumbers.slice(0, BET_COUNT).map(row => ({
            number: row.number,
            score: Number(row.score.toFixed(6)),
            familyCount: row.familyCount,
            inRobustWinner: row.inRobustWinner,
            sources: row.sources.map(source => ({
                ...source,
                weight: Number(source.weight.toFixed(6))
            }))
        }))
    };
}

function buildAdaptiveFusion(methods, ranking, zScore) {
    const comparable = (ranking || [])
        .filter(row => methodNumbers(methods?.[row.methodId]).length === BET_COUNT);
    const exactSets = new Map();
    comparable.forEach(row => {
        const numbers = methodNumbers(methods[row.methodId]);
        const signature = numbers.join(',');
        if (!exactSets.has(signature)) exactSets.set(signature, { signature, numbers, members: [] });
        exactSets.get(signature).members.push(row);
    });
    if (!exactSets.size) {
        return {
            abstained: true,
            numbers: [],
            leaders: [],
            evidence: [],
            methodCount: 0,
            uniqueSetCount: 0,
            familyCount: 0,
            duplicatesRemoved: 0,
            addedFromConsensus: [],
            removedFromMain: []
        };
    }

    const uniqueGroups = [...exactSets.values()].map(group => {
        const members = group.members.slice().sort((left, right) => Number(right.score || 0) - Number(left.score || 0)
            || left.methodId.localeCompare(right.methodId));
        const representative = members[0];
        return {
            ...group,
            members,
            representative,
            family: fusionFamily(representative.methodId),
            reliabilityScore: Number(representative.score || 0)
        };
    });

    // Method variants in the same family often encode almost identical chain
    // evidence. Give every family one budget, then distribute that budget over
    // its distinct number sets. This lets every method contribute without an
    // edge/dropoff family winning merely because it has more aliases.
    const familyMap = new Map();
    uniqueGroups.forEach(group => {
        if (!familyMap.has(group.family)) familyMap.set(group.family, []);
        familyMap.get(group.family).push(group);
    });
    const families = blendedSoftmax([...familyMap].map(([family, groups]) => ({
        family,
        groups,
        reliabilityScore: Math.max(...groups.map(group => group.reliabilityScore))
    })), 'reliabilityScore', 0.35);

    const weightedGroups = [];
    families.forEach(family => {
        const groups = blendedSoftmax(family.groups, 'reliabilityScore', 0.45);
        groups.forEach(group => weightedGroups.push({
            ...group,
            familyWeight: family.blendedWeight,
            preOverlapWeight: family.blendedWeight * group.blendedWeight
        }));
    });
    weightedGroups.sort((left, right) => right.preOverlapWeight - left.preOverlapWeight
        || right.reliabilityScore - left.reliabilityScore
        || left.signature.localeCompare(right.signature));

    // Near-identical sets remain valid evidence, but receive a smaller marginal
    // weight after the strongest set. Exact duplicates were already collapsed.
    weightedGroups.forEach((group, index) => {
        const maxOverlap = index
            ? Math.max(...weightedGroups.slice(0, index).map(previous => setJaccard(group.numbers, previous.numbers)))
            : 0;
        const excessOverlap = Math.max(0, maxOverlap - 0.25) / 0.75;
        group.maxOverlap = maxOverlap;
        group.overlapDiscount = clamp(1 - 0.50 * excessOverlap, 0.50, 1);
        group.adjustedWeight = group.preOverlapWeight * group.overlapDiscount;
    });
    const totalWeight = weightedGroups.reduce((sum, group) => sum + group.adjustedWeight, 0) || 1;
    weightedGroups.forEach(group => { group.weight = group.adjustedWeight / totalWeight; });

    const scoreByNumber = Array(100).fill(0);
    const sourcesByNumber = Array.from({ length: 100 }, () => []);
    const sourceGroupsByNumber = Array.from({ length: 100 }, () => []);
    weightedGroups.forEach(group => {
        const methodIds = group.members.map(member => member.methodId);
        group.numbers.forEach(number => {
            // numbersToBet is a set, not an ordered recommendation.
            scoreByNumber[number] += group.weight;
            sourcesByNumber[number].push(...methodIds);
            sourceGroupsByNumber[number].push(group.signature);
        });
    });
    NUMBERS.forEach(number => {
        // Z-score is deliberately capped as a tie-break/support signal. The
        // immutable method consensus remains the dominant evidence.
        scoreByNumber[number] += FUSION_ZSCORE_WEIGHT * Number(zScore?.percentile?.[number] || 0);
    });
    const ranked = NUMBERS.map(number => ({
        number,
        fusionScore: scoreByNumber[number],
        zScore: Number(zScore?.scores?.[number] || 0),
        percentile: Number(zScore?.percentile?.[number] || 0),
        sources: [...new Set(sourcesByNumber[number])],
        sourceGroups: [...new Set(sourceGroupsByNumber[number])]
    })).sort((left, right) => right.fusionScore - left.fusionScore
        || right.sourceGroups.length - left.sourceGroups.length
        || right.sources.length - left.sources.length
        || left.number - right.number);
    const numbers = ranked.slice(0, BET_COUNT).map(row => row.number).sort((left, right) => left - right);
    const core10 = ranked.slice(0, 10).map(row => row.number).sort((left, right) => left - right);
    const core20 = ranked.slice(0, 20).map(row => row.number).sort((left, right) => left - right);
    const expanded36 = ranked.slice(0, 36).map(row => row.number).sort((left, right) => left - right);
    const mainSet = new Set(methodNumbers(methods?.[comparable[0]?.methodId]));
    return {
        abstained: false,
        numbers,
        core10,
        core20,
        expanded36,
        methodCount: comparable.length,
        uniqueSetCount: weightedGroups.length,
        familyCount: families.length,
        duplicatesRemoved: comparable.length - weightedGroups.length,
        zScoreWeight: FUSION_ZSCORE_WEIGHT,
        leaders: weightedGroups.map(group => ({
            methodId: group.representative.methodId,
            methodIds: group.members.map(member => member.methodId),
            label: group.representative.label,
            family: group.family,
            score: Number(group.reliabilityScore.toFixed(4)),
            weight: Number(group.weight.toFixed(6)),
            maxOverlap: Number(group.maxOverlap.toFixed(4)),
            overlapDiscount: Number(group.overlapDiscount.toFixed(4))
        })),
        evidence: ranked.slice(0, BET_COUNT).map(row => ({
            ...row,
            fusionScore: Number(row.fusionScore.toFixed(6)),
            zScore: Number(row.zScore.toFixed(3)),
            percentile: Number(row.percentile.toFixed(3))
        })),
        rankedNumbers: ranked.slice(0, 36).map(row => ({
            number: row.number,
            fusionScore: Number(row.fusionScore.toFixed(4)),
            supportersCount: row.sources.length,
            sources: row.sources
        })),
        addedFromConsensus: ranked.filter(row => numbers.includes(row.number) && !mainSet.has(row.number)).map(row => row.number),
        removedFromMain: [...mainSet].filter(number => !numbers.includes(number)).sort((left, right) => left - right)
    };
}

function buildStrategySnapshots({ methods, selection, mainNumbers, hybrid }) {
    const catalogById = new Map(STRATEGY_CATALOG.map(strategy => [strategy.id, strategy]));
    const robustRanking = rankRobustMethods(selection?.ranking || []);
    const robustSelected = robustRanking.find(row => row.observations >= MIN_OBSERVATIONS)
        || robustRanking[0]
        || null;
    const robustNumbers = methodNumbers(methods?.[robustSelected?.methodId]);
    const independent = buildIndependentFamilyConsensus(methods, selection?.ranking || []);
    const breakEvenHitRate = BET_COUNT / 84;
    const wilsonGatePassed = Boolean(
        robustSelected
        && robustNumbers.length === BET_COUNT
        && robustSelected.observations >= 45
        && robustSelected.wilsonLower90 >= breakEvenHitRate
        && robustSelected.posterior30 >= breakEvenHitRate
    );
    const makeSnapshot = (strategyId, values) => ({
        ...catalogById.get(strategyId),
        strategyId,
        ...values,
        numbers: normalizeNumbers(values.numbers),
        betCount: normalizeNumbers(values.numbers).length,
        hit: null
    });

    return [
        makeSnapshot(MAIN_STRATEGY_ID, {
            numbers: mainNumbers,
            abstained: mainNumbers.length !== BET_COUNT,
            sourceMethodIds: selection?.selected?.methodId ? [selection.selected.methodId] : [],
            evidence: selection?.selected ? {
                methodId: selection.selected.methodId,
                score: Number(selection.selected.score || 0),
                posterior30: Number(selection.selected.posterior30 || 0),
                wilsonLower90: Number(selection.selected.wilsonLower90 || 0)
            } : null
        }),
        makeSnapshot(FUSION_ID, {
            numbers: hybrid?.numbers || [],
            abstained: Boolean(hybrid?.abstained) || hybrid?.numbers?.length !== BET_COUNT,
            sourceMethodIds: [...new Set((hybrid?.leaders || []).flatMap(row => row.methodIds || [row.methodId]).filter(Boolean))],
            evidence: {
                methodCount: Number(hybrid?.methodCount || 0),
                uniqueSetCount: Number(hybrid?.uniqueSetCount || 0),
                familyCount: Number(hybrid?.familyCount || 0),
                duplicatesRemoved: Number(hybrid?.duplicatesRemoved || 0)
            }
        }),
        makeSnapshot(ROBUST_STRATEGY_ID, {
            numbers: robustNumbers.length === BET_COUNT ? robustNumbers : [],
            abstained: robustNumbers.length !== BET_COUNT,
            sourceMethodIds: robustSelected?.methodId ? [robustSelected.methodId] : [],
            evidence: robustSelected ? {
                methodId: robustSelected.methodId,
                robustScore: Number(robustSelected.robustScore.toFixed(6)),
                horizonFloor: Number(robustSelected.horizonFloor.toFixed(6)),
                posterior7: Number(robustSelected.posterior7 || 0),
                posterior30: Number(robustSelected.posterior30 || 0),
                posterior90: Number(robustSelected.posteriorMean || 0),
                wilsonLower90: Number(robustSelected.wilsonLower90 || 0),
                recentLossStreak: Number(robustSelected.recentLossStreak || 0)
            } : null
        }),
        makeSnapshot(INDEPENDENT_FUSION_ID, {
            numbers: independent.numbers,
            abstained: independent.abstained || independent.numbers.length !== BET_COUNT,
            sourceMethodIds: independent.representatives.map(row => row.methodId),
            evidence: {
                familyCount: independent.familyCount,
                uniqueSetCount: independent.uniqueSetCount,
                representatives: independent.representatives,
                topNumbers: independent.evidence
            }
        }),
        makeSnapshot(WILSON_ABSTAIN_ID, {
            numbers: wilsonGatePassed ? robustNumbers : [],
            abstained: !wilsonGatePassed,
            sourceMethodIds: robustSelected?.methodId ? [robustSelected.methodId] : [],
            evidence: {
                gatePassed: wilsonGatePassed,
                requiredObservations: 45,
                observations: Number(robustSelected?.observations || 0),
                breakEvenHitRate,
                posterior30: Number(robustSelected?.posterior30 || 0),
                wilsonLower90: Number(robustSelected?.wilsonLower90 || 0),
                reason: wilsonGatePassed
                    ? 'Cận Wilson và posterior 30 kỳ cùng vượt hòa vốn trước ngày dự đoán.'
                    : 'Chưa đồng thời vượt cận Wilson, posterior 30 kỳ và cỡ mẫu tối thiểu; hệ thống bỏ ngày.'
            }
        })
    ];
}

// Backward-compatible export name for research scripts that used the early
// "support" prototype. Production snapshots use the clearer hybrid name.
const buildZScoreHybrid = buildAdaptiveFusion;
const buildZScoreSupport = buildAdaptiveFusion;

function settleSnapshot(snapshot, actual) {
    const settleStrategies = actualNumber => (snapshot.strategySnapshots || []).map(strategy => ({
        ...strategy,
        hit: Number.isInteger(actualNumber) && !strategy.abstained && Array.isArray(strategy.numbers)
            ? strategy.numbers.includes(actualNumber)
            : null
    }));
    if (actual === null || actual === undefined || actual === '' || !Number.isInteger(Number(actual))) {
        return {
            ...snapshot,
            settled: false,
            actual: null,
            main: { ...snapshot.main, hit: null },
            ...(snapshot.strategySnapshots ? { strategySnapshots: settleStrategies(null) } : {}),
            ...(snapshot.hybrid ? {
                hybrid: {
                    ...snapshot.hybrid,
                    hit: null,
                    core10Hit: null,
                    core20Hit: null,
                    expanded36Hit: null
                }
            } : {}),
            ...(snapshot.experimental ? { experimental: { ...snapshot.experimental, hit: null } } : {})
        };
    }
    const actualNumber = Number(actual);
    const hybrid = snapshot.hybrid;
    return {
        ...snapshot,
        settled: true,
        actual: actualNumber,
        main: { ...snapshot.main, hit: Array.isArray(snapshot.main?.numbers) && snapshot.main.numbers.includes(actualNumber) },
        ...(snapshot.strategySnapshots ? { strategySnapshots: settleStrategies(actualNumber) } : {}),
        ...(hybrid ? {
            hybrid: {
                ...hybrid,
                hit: Array.isArray(hybrid.numbers) && hybrid.numbers.includes(actualNumber),
                core10Hit: Array.isArray(hybrid.core10) ? hybrid.core10.includes(actualNumber) : null,
                core20Hit: Array.isArray(hybrid.core20) ? hybrid.core20.includes(actualNumber) : null,
                expanded36Hit: Array.isArray(hybrid.expanded36) ? hybrid.expanded36.includes(actualNumber) : null
            }
        } : {}),
        ...(snapshot.experimental ? { experimental: { ...snapshot.experimental, hit: Array.isArray(snapshot.experimental?.numbers) && snapshot.experimental.numbers.includes(actualNumber) } } : {})
    };
}

function buildSnapshot(run, priorRuns, rawRows, rawIndex, groupsData) {
    const methods = run.summary?.methods || {};
    const currentProfiles = buildCurrentMethodProfiles(priorRuns, methods);
    const methodIds = currentProfiles.filter(profile => profile.eligibleForMain).map(profile => profile.methodId);
    const selection = selectMethod(priorRuns, methodIds, methods);
    const selectedMethodId = selection.selected?.methodId || methodIds[0] || '';
    const zScore = buildZScore(rawRows, rawIndex, run.predictionDate, groupsData);
    const mainNumbers = normalizeNumbers(methods[selectedMethodId]?.numbersToBet);
    const hybrid = buildAdaptiveFusion(methods, selection.ranking, zScore);
    const strategySnapshots = buildStrategySnapshots({ methods, selection, mainNumbers, hybrid });
    const snapshot = {
        id: `advisor-${run.predictionDate}`,
        predictionDate: run.predictionDate,
        sourceDrawDate: run.sourceDrawDate,
        createdAt: run.generatedAt || new Date().toISOString(),
        version: CACHE_VERSION,
        source: { raw: 'R2/static snapshot', strict: 'selection uses only settled snapshots before predictionDate' },
        lifecycle: {
            // Replays are labeled explicitly; only subsequently issued records are live snapshots.
            mode: isSettled(run) ? 'historical-replay' : 'live-issued',
            immutableNumbers: true
        },
        recommendation: {
            action: selection.action,
            confidence: selection.confidence,
            plainReasons: selection.plainReasons,
            rationale: selection.confidenceGatePassed
                ? 'Tín hiệu hiện vượt cận dưới Wilson hòa vốn, nhưng selector vẫn ở chế độ theo dõi cho tới khi qua kiểm chứng holdout độc lập.'
                : 'Chưa đạt cận dưới hòa vốn; chỉ theo dõi, không coi là khuyến nghị lợi nhuận.',
            selected: selection.selected,
            ranking: selection.ranking,
            models: selection.models,
            methodPool: methodIds,
            discoveredMethodCount: currentProfiles.length,
            comparableMethodCount: methodIds.length,
            currentStrongMethods: currentProfiles.filter(profile => profile.currentStrong).map(profile => ({
                methodId: profile.methodId,
                label: profile.label,
                betCount: profile.betCount,
                experimental: profile.experimental,
                eligibleForMain: profile.eligibleForMain,
                status: profile.status,
                signalStrength: profile.signalStrength,
                performance: profile.performance
            })),
            // Keep the exact candidate dàn next to the issued decision. This
            // lets the research UI compare alternatives without rebuilding a
            // past prediction from newer chain statistics.
            candidateMethods: currentProfiles.map(profile => ({
                methodId: profile.methodId,
                label: profile.label,
                numbers: profile.numbers,
                betCount: profile.betCount,
                experimental: profile.experimental,
                eligibleForMain: profile.eligibleForMain,
                currentStrong: profile.currentStrong,
                status: profile.status,
                signalStrength: profile.signalStrength,
                performance: profile.performance
            })),
            selectionRule: 'Tự phát hiện mọi dàn có trong snapshot. Các dàn đúng 30 số được so sánh trực tiếp bằng posterior 90/30/7 ngày, Wilson và EWMA; dàn khác quy mô vẫn được theo dõi với hòa vốn và profit riêng nhưng không cạnh tranh trực tiếp. Phương pháp thử nghiệm có tín hiệu tốt được hiển thị, không tự động coi là production.'
        },
        main: {
            methodId: selectedMethodId,
            label: methodLabel(selectedMethodId, methods[selectedMethodId]),
            numbers: mainNumbers,
            numberZ: mainNumbers.map(number => ({ number, zScore: Number((zScore?.scores?.[number] || 0).toFixed(3)), percentile: Number((zScore?.percentile?.[number] || 0).toFixed(3)) }))
        },
        hybrid: {
            id: FUSION_ID,
            label: `Tổng hợp toàn bộ ${hybrid.methodCount} phương pháp (${hybrid.uniqueSetCount} dàn độc lập)`,
            numbers: hybrid.numbers,
            core10: hybrid.core10,
            core20: hybrid.core20,
            expanded36: hybrid.expanded36,
            rankedNumbers: hybrid.rankedNumbers,
            leaders: hybrid.leaders,
            evidence: hybrid.evidence,
            methodCount: hybrid.methodCount,
            uniqueSetCount: hybrid.uniqueSetCount,
            familyCount: hybrid.familyCount,
            duplicatesRemoved: hybrid.duplicatesRemoved,
            zScoreWeight: hybrid.zScoreWeight,
            replacedOut: hybrid.removedFromMain.map(number => ({ number })),
            replacedIn: hybrid.addedFromConsensus.map(number => ({ number })),
            note: 'Dàn 30 số tổng hợp dùng toàn bộ phương pháp có cùng quy mô trong snapshot. Dàn trùng chỉ tính một lần; mỗi họ phương pháp có ngân sách trọng số riêng và dàn gần giống bị giảm ảnh hưởng. Z-score nhóm chỉ phá hòa với trọng số nhỏ. Mọi dữ liệu đều dừng trước ngày dự đoán.'
        },
        strategySnapshots,
        zScore: zScore ? { lookback: zScore.lookback, topNumbers: zScore.topNumbers.map(row => ({ number: row.number, zScore: Number(row.score.toFixed(3)) })) } : null
    };
    return settleSnapshot(snapshot, run.summary?.actualSpecial);
}

function summarize(records, key, expectedId = null) {
    const settled = records.filter(record => record.settled
        && record[key]
        && (!expectedId || record[key]?.id === expectedId));
    const wins = settled.filter(record => record[key]?.hit).length;
    const losses = settled.length - wins;
    let currentLoss = 0;
    let longestLoss = 0;
    settled.forEach(record => {
        currentLoss = record[key]?.hit ? 0 : currentLoss + 1;
        longestLoss = Math.max(longestLoss, currentLoss);
    });
    const stakeK = settled.length * BET_COUNT * 1000;
    const profitK = wins * 84 * 1000 - stakeK;
    const breakEvenHitRate = BET_COUNT / 84;
    const hitRate = settled.length ? wins / settled.length : 0;
    return {
        days: settled.length,
        wins,
        losses,
        hitRate,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestLoss,
        breakEvenHitRate,
        breakEvenWins: Math.ceil(settled.length * breakEvenHitRate),
        isAboveBreakEven: settled.length > 0 && hitRate >= breakEvenHitRate,
        marginToBreakEven: hitRate - breakEvenHitRate
    };
}

function summarizeStrategy(records, strategyId) {
    const candidateRows = (records || []).map(record => ({
        record,
        strategy: (record?.strategySnapshots || []).find(row => row.strategyId === strategyId)
    })).filter(row => row.record?.settled && row.strategy);
    const issuedRows = candidateRows.filter(row => !row.strategy.abstained && row.strategy.numbers?.length);
    const wins = issuedRows.filter(row => row.strategy.hit).length;
    const losses = issuedRows.length - wins;
    let currentLoss = 0;
    let longestLoss = 0;
    issuedRows.forEach(row => {
        currentLoss = row.strategy.hit ? 0 : currentLoss + 1;
        longestLoss = Math.max(longestLoss, currentLoss);
    });
    const stakeK = issuedRows.reduce((sum, row) => sum + Number(row.strategy.betCount || row.strategy.numbers.length) * 1000, 0);
    const profitK = wins * 84 * 1000 - stakeK;
    const averageBetCount = issuedRows.length
        ? issuedRows.reduce((sum, row) => sum + Number(row.strategy.betCount || row.strategy.numbers.length), 0) / issuedRows.length
        : 0;
    const breakEvenHitRate = averageBetCount / 84;
    const hitRate = issuedRows.length ? wins / issuedRows.length : 0;
    return {
        candidateDays: candidateRows.length,
        issuedDays: issuedRows.length,
        abstainedDays: candidateRows.length - issuedRows.length,
        coverage: candidateRows.length ? issuedRows.length / candidateRows.length : 0,
        days: issuedRows.length,
        wins,
        losses,
        hitRate,
        averageBetCount,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestLoss,
        breakEvenHitRate,
        breakEvenWins: Math.ceil(issuedRows.length * breakEvenHitRate),
        isAboveBreakEven: issuedRows.length > 0 && hitRate >= breakEvenHitRate,
        marginToBreakEven: hitRate - breakEvenHitRate
    };
}

function buildStrategySummaries(records) {
    const metadata = new Map(STRATEGY_CATALOG.map(strategy => [strategy.id, strategy]));
    (records || []).forEach(record => (record?.strategySnapshots || []).forEach(strategy => {
        if (!metadata.has(strategy.strategyId)) {
            metadata.set(strategy.strategyId, {
                id: strategy.strategyId,
                label: strategy.label || humanizeMethodId(strategy.strategyId),
                status: strategy.status || 'research-only',
                description: strategy.description || ''
            });
        }
    }));
    return [...metadata.values()].map(strategy => ({
        ...strategy,
        summary: summarizeStrategy(records, strategy.id)
    }));
}

function isImmutableLedgerRecord(record) {
    return Boolean(
        record?.predictionDate
        && record?.lifecycle?.immutableNumbers
        && IMMUTABLE_LEDGER_MODES.has(record.lifecycle?.mode)
    );
}

function reconstructMissingSnapshots({ existing = [], generated = [], rawRows = [] } = {}) {
    const liveRecords = (existing || []).filter(isImmutableLedgerRecord);
    if (!liveRecords.length) return [];

    const firstTrackedDate = liveRecords
        .map(record => record.predictionDate)
        .sort()[0];
    const latestDataDate = rawRows.at(-1)?.date;
    if (!firstTrackedDate || !latestDataDate) return [];

    const existingDates = new Set(liveRecords.map(record => record.predictionDate));
    const actualByDate = new Map(rawRows.map(row => [row.date, row.actual]));

    // A missing record is recoverable only when the historical prediction
    // snapshot was persisted before that draw. This never rebuilds a dàn from
    // today's data, and the resulting record is visibly marked as backfilled.
    return (generated || [])
        .filter(record => record?.predictionDate >= firstTrackedDate)
        .filter(record => record?.predictionDate <= latestDataDate)
        .filter(record => !existingDates.has(record.predictionDate))
        .filter(record => Number.isInteger(actualByDate.get(record.predictionDate)))
        .map(record => settleSnapshot({
            ...record,
            version: CACHE_VERSION,
            lifecycle: {
                mode: 'reconstructed-after-draw',
                immutableNumbers: true,
                reconstructedFrom: 'cached_prediction_history',
                note: 'Tái tạo từ snapshot dự đoán đã lưu trước ngày quay; bản ghi bị thiếu trong cache Advisor.'
            }
        }, actualByDate.get(record.predictionDate)));
}

function mergeImmutable(existing, generated, limit = 90, actualByDate = null) {
    const byDate = new Map();
    // Historical replays are useful to rank a method, but are not issued
    // predictions. Keep the public ledger limited to snapshots that were
    // actually published while their draw was still pending.
    (existing || [])
        .filter(isImmutableLedgerRecord)
        .forEach(record => {
            const actual = actualByDate?.get(record.predictionDate);
            byDate.set(record.predictionDate, Number.isInteger(actual)
                ? settleSnapshot(record, actual)
                : record);
        });
    (generated || [])
        .filter(isImmutableLedgerRecord)
        .forEach(record => {
            if (!record?.predictionDate) return;
            const current = byDate.get(record.predictionDate);
            // A published dàn must never be rewritten merely because the
            // cache schema evolves. New lanes start from the next snapshot.
            const canPreserve = current?.lifecycle?.immutableNumbers
                && current?.main?.numbers?.length === BET_COUNT;
            if (!canPreserve) {
                byDate.set(record.predictionDate, record);
                return;
            }
            const preserved = settleSnapshot(current, record.actual);
            // A separate, previously unpublished lane may be added only to a
            // draw that is still pending. It never changes the issued main
            // dàn and is never backfilled into already settled snapshots.
            const canIssueHybridNow = !current.hybrid && !record.settled && record.hybrid;
            const canIssueCandidateMethodsNow = !record.settled
                && record?.recommendation?.candidateMethods?.length;
            const canIssueStrategiesNow = !record.settled
                && record?.strategySnapshots?.length;
            // Candidate dàn are supplementary metadata. They are only added
            // while a prediction is still pending; settled ledgers stay
            // byte-for-byte faithful to what was available before the draw.
            const withCandidateMethods = canIssueCandidateMethodsNow
                ? {
                    ...preserved,
                    version: CACHE_VERSION,
                    recommendation: {
                        ...preserved.recommendation,
                        candidateMethods: preserved?.recommendation?.candidateMethods?.length
                            ? preserved.recommendation.candidateMethods
                            : record.recommendation.candidateMethods,
                        currentStrongMethods: record.recommendation.currentStrongMethods,
                        discoveredMethodCount: record.recommendation.discoveredMethodCount,
                        comparableMethodCount: record.recommendation.comparableMethodCount
                    }
                }
                : preserved;
            const withStrategies = canIssueStrategiesNow
                ? {
                    ...withCandidateMethods,
                    version: CACHE_VERSION,
                    strategySnapshots: [
                        ...(withCandidateMethods.strategySnapshots || []),
                        ...record.strategySnapshots.filter(strategy => !(withCandidateMethods.strategySnapshots || [])
                            .some(currentStrategy => currentStrategy.strategyId === strategy.strategyId))
                    ]
                }
                : withCandidateMethods;
            byDate.set(record.predictionDate, canIssueHybridNow
                ? { ...withStrategies, version: CACHE_VERSION, hybrid: record.hybrid }
                : withStrategies);
        });
    return [...byDate.values()].sort((left, right) => right.predictionDate.localeCompare(left.predictionDate)).slice(0, limit);
}

function generateAdvisorCache({ history = [], raw = [], existing = [], limit = 90 } = {}) {
    const historyList = Array.isArray(history) ? history : Array.isArray(history?.records) ? history.records : [];
    const runs = historyList.filter(run => run?.predictionDate && run?.summary?.methods)
        .slice().sort((left, right) => left.predictionDate.localeCompare(right.predictionDate));
    const rawRows = readRawRows(raw);
    const rawIndex = new Map(rawRows.map((row, index) => [row.date, index]));
    const actualByDate = new Map(rawRows.map(row => [row.date, row.actual]));
    const groupsData = buildUniqueGroups();
    const generated = runs.map((run, index) => buildSnapshot(run, runs.slice(0, index).filter(isSettled), rawRows, rawIndex, groupsData));
    const reconstructed = reconstructMissingSnapshots({ existing, generated, rawRows });
    const nextPredictionDate = rawRows.length ? nextIsoDate(rawRows.at(-1).date) : null;
    // An old pending item cannot be a live prediction anymore. It is a stale
    // cache artifact, not a record users can trust, so exclude it from the
    // immutable live ledger rather than presenting an unresolved replay.
    const records = mergeImmutable(existing, [...generated, ...reconstructed], limit, actualByDate)
        .filter(record => record?.settled || !nextPredictionDate || record.predictionDate >= nextPredictionDate);
    const decisionReport = buildDecisionReport(runs, generated);
    const dualMerge = dualMergeAdvisorService.buildDualMergeAdvisor(history, rawRows);
    const loDualMerge = loDualMergeAdvisorService.buildLoDualMergeAdvisor(dualMerge, raw);
    const tripleMerge = tripleMergeAdvisorService.buildTripleMergeAdvisor(history, rawRows);
    return {
        version: CACHE_VERSION,
        generatedAt: new Date().toISOString(),
        latestDataDate: rawRows.at(-1)?.date || null,
        methodology: {
            description: 'Mỗi ngày tự phát hiện toàn bộ phương pháp có trong snapshot. Các dàn 30 số được chấm bằng posterior 7/30/90 ngày, EWMA và cận dưới Wilson. Ba lane nghiên cứu bổ sung theo dõi độ bền đa khung, đồng thuận giữa họ độc lập và quyền bỏ ngày khi chứng cứ chưa đủ. Mọi lane đều được khóa trước kỳ quay và không thay thế mặc định khi chưa qua holdout.',
            lookbackDraws: LOOKBACK_DRAWS,
            forms: scoringForms.length,
            uniqueGroups: groupsData.groups.length,
            methodPool: generated.at(-1)?.recommendation?.methodPool || [],
            discoveredMethods: generated.at(-1)?.recommendation?.discoveredMethodCount || 0,
            knownTrackedMethods: DAILY_METHOD_POOL,
            poolPolicy: 'dynamic-from-immutable-snapshot',
            fusionId: FUSION_ID,
            fusionPolicy: 'all-comparable-methods-exact-set-dedup-family-budget-overlap-discount',
            fusionZScoreWeight: FUSION_ZSCORE_WEIGHT,
            strategySnapshotPolicy: 'immutable-per-strategy-no-settled-backfill',
            breakEvenHitRate: BET_COUNT / 84,
            warning: 'Dữ liệu lịch sử không bảo đảm lợi nhuận tương lai. Dàn thử nghiệm không thay thế dàn chính.'
        },
        strategyCatalog: STRATEGY_CATALOG,
        strategySummaries: buildStrategySummaries(records),
        summary: {
            main: summarize(records, 'main'),
            // Old immutable hybrid lanes keep their original identity and are
            // never mixed into the performance of the current all-method lane.
            hybrid: summarize(records, 'hybrid', FUSION_ID)
        },
        dualMerge,
        loDualMerge,
        tripleMerge,
        decisionReport,
        records
    };
}

function loadLocalJson(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_) { return null; }
}

async function generateAndWriteCache(options = {}) {
    const root = process.cwd();
    const statisticsDir = path.join(root, 'lib', 'data', 'statistics');
    const history = options.history || loadLocalJson(path.join(statisticsDir, 'cached_prediction_history.json')) || [];
    const raw = options.raw || loadLocalJson(path.join(root, 'lib', 'data', 'xsmb-2-digits.json')) || [];
    let existing = options.existing || loadLocalJson(path.join(statisticsDir, 'cached_daily_method_advisor.json')) || [];
    if (!Array.isArray(existing)) existing = existing.records || [];
    const cache = generateAdvisorCache({ history, raw, existing, limit: options.limit || 90 });
    if (options.write !== false) {
        fs.mkdirSync(statisticsDir, { recursive: true });
        fs.writeFileSync(path.join(statisticsDir, 'cached_daily_method_advisor.json'), JSON.stringify(cache));
    }
    return cache;
}

module.exports = {
    BET_COUNT,
    LOOKBACK_DRAWS,
    CACHE_VERSION,
    MAIN_STRATEGY_ID,
    ROBUST_STRATEGY_ID,
    INDEPENDENT_FUSION_ID,
    WILSON_ABSTAIN_ID,
    STRATEGY_CATALOG,
    METHOD_LABELS,
    DAILY_METHOD_POOL,
    SELECTION_MODELS,
    dualMergeAdvisorService,
    loDualMergeAdvisorService,
    tripleMergeAdvisorService,
    discoverCurrentMethods,
    buildCurrentMethodProfiles,
    buildUniqueGroups,
    buildZScore,
    selectMethod,
    buildDecisionReport,
    rankRobustMethods,
    buildIndependentFamilyConsensus,
    buildAdaptiveFusion,
    buildZScoreHybrid,
    buildZScoreSupport,
    summarize,
    summarizeStrategy,
    buildStrategySummaries,
    generateAdvisorCache,
    generateAndWriteCache,
    reconstructMissingSnapshots
};
