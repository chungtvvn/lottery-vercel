'use strict';

const fs = require('fs');
const path = require('path');
const { scoringForms } = require('../utils/lotteryScoring');

const NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = 30;
const LOOKBACK_DRAWS = 180;
const MIN_OBSERVATIONS = 20;
const FUSION_METHOD_COUNT = 3;
const CACHE_VERSION = 'daily-advisor-model-selection-v7';
const IMMUTABLE_LEDGER_MODES = new Set(['live-issued', 'reconstructed-after-draw']);
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

function rankMethods(priorRuns, methodIds) {
    return methodIds.map(methodId => {
        const samples = priorRuns.filter(run => run?.summary?.methods?.[methodId] && isSettled(run));
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
            label: METHOD_LABELS[methodId] || methodId,
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

function hedgeMethodRanking(priorRuns, methodIds) {
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
            label: METHOD_LABELS[methodId] || methodId,
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

function selectMethod(priorRuns, methodIds) {
    const ranking = rankMethods(priorRuns, methodIds);
    const hedgeRanking = hedgeMethodRanking(priorRuns, methodIds);
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

    // The daily selector is a tracked recommendation. It must pass an
    // independent holdout before being promoted to an automatic betting rule.
    return { selected, ranking, models, action: confidenceGatePassed ? 'consider' : 'observe', confidenceGatePassed };
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

function buildDecisionReport(runs) {
    const decisions = new Map(SELECTION_MODELS.map(model => [model.id, []]));
    const ordered = (runs || []).filter(run => run?.predictionDate && run?.summary?.methods)
        .slice().sort((left, right) => left.predictionDate.localeCompare(right.predictionDate));
    ordered.forEach((run, index) => {
        if (!isSettled(run)) return;
        const priorRuns = ordered.slice(0, index).filter(isSettled);
        const methodIds = DAILY_METHOD_POOL.filter(methodId => normalizeNumbers(run.summary?.methods?.[methodId]?.numbersToBet).length === BET_COUNT);
        if (priorRuns.length < MIN_OBSERVATIONS || !methodIds.length) return;
        const selection = selectMethod(priorRuns, methodIds);
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
        })
    };
}

function buildAdaptiveFusion(methods, ranking, zScore) {
    const leaders = (ranking || []).slice(0, FUSION_METHOD_COUNT)
        .filter(row => normalizeNumbers(methods?.[row.methodId]?.numbersToBet).length === BET_COUNT);
    const scoreByNumber = Array(100).fill(0);
    const sourcesByNumber = Array.from({ length: 100 }, () => []);
    const topScore = Math.max(...leaders.map(row => row.score), 0.01);
    leaders.forEach((leader, methodRank) => {
        const methodWeight = (leader.score / topScore) * (1 - methodRank * 0.12);
        normalizeNumbers(methods[leader.methodId]?.numbersToBet).forEach(number => {
            // numbersToBet is a set serialized in numeric order, not a ranked
            // list. Weighting by array position would systematically favour
            // small numbers after normalizeNumbers() sorts the set.
            scoreByNumber[number] += methodWeight;
            sourcesByNumber[number].push(leader.methodId);
        });
    });
    NUMBERS.forEach(number => {
        // Group Z-score is supporting evidence, not a replacement for the
        // walk-forward method evidence.
        scoreByNumber[number] += 0.18 * Number(zScore?.percentile?.[number] || 0);
    });
    const ranked = NUMBERS.map(number => ({
        number,
        fusionScore: scoreByNumber[number],
        zScore: Number(zScore?.scores?.[number] || 0),
        percentile: Number(zScore?.percentile?.[number] || 0),
        sources: sourcesByNumber[number]
    })).sort((left, right) => right.fusionScore - left.fusionScore || right.sources.length - left.sources.length || left.number - right.number);
    const numbers = ranked.slice(0, BET_COUNT).map(row => row.number).sort((left, right) => left - right);
    const mainSet = new Set(normalizeNumbers(methods?.[leaders[0]?.methodId]?.numbersToBet));
    return {
        numbers,
        leaders: leaders.map(row => ({ methodId: row.methodId, label: row.label, score: Number(row.score.toFixed(4)) })),
        evidence: ranked.slice(0, BET_COUNT).map(row => ({ ...row, fusionScore: Number(row.fusionScore.toFixed(4)), zScore: Number(row.zScore.toFixed(3)), percentile: Number(row.percentile.toFixed(3)) })),
        addedFromConsensus: ranked.filter(row => numbers.includes(row.number) && !mainSet.has(row.number)).map(row => row.number),
        removedFromMain: [...mainSet].filter(number => !numbers.includes(number)).sort((left, right) => left - right)
    };
}

// Backward-compatible export name for research scripts that used the early
// "support" prototype. Production snapshots use the clearer hybrid name.
const buildZScoreHybrid = buildAdaptiveFusion;
const buildZScoreSupport = buildAdaptiveFusion;

function settleSnapshot(snapshot, actual) {
    if (actual === null || actual === undefined || actual === '' || !Number.isInteger(Number(actual))) {
        return {
            ...snapshot,
            settled: false,
            actual: null,
            main: { ...snapshot.main, hit: null },
            ...(snapshot.hybrid ? { hybrid: { ...snapshot.hybrid, hit: null } } : {}),
            ...(snapshot.experimental ? { experimental: { ...snapshot.experimental, hit: null } } : {})
        };
    }
    const actualNumber = Number(actual);
    return {
        ...snapshot,
        settled: true,
        actual: actualNumber,
        main: { ...snapshot.main, hit: snapshot.main.numbers.includes(actualNumber) },
        ...(snapshot.hybrid ? { hybrid: { ...snapshot.hybrid, hit: snapshot.hybrid.numbers.includes(actualNumber) } } : {}),
        ...(snapshot.experimental ? { experimental: { ...snapshot.experimental, hit: snapshot.experimental.numbers.includes(actualNumber) } } : {})
    };
}

function buildSnapshot(run, priorRuns, rawRows, rawIndex, groupsData) {
    const methods = run.summary?.methods || {};
    const methodIds = DAILY_METHOD_POOL.filter(methodId => normalizeNumbers(methods[methodId]?.numbersToBet).length === BET_COUNT);
    const selection = selectMethod(priorRuns, methodIds);
    const selectedMethodId = selection.selected?.methodId || methodIds[0] || '';
    const zScore = buildZScore(rawRows, rawIndex, run.predictionDate, groupsData);
    const mainNumbers = normalizeNumbers(methods[selectedMethodId]?.numbersToBet);
    const hybrid = buildAdaptiveFusion(methods, selection.ranking, zScore);
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
            rationale: selection.confidenceGatePassed
                ? 'Tín hiệu hiện vượt cận dưới Wilson hòa vốn, nhưng selector vẫn ở chế độ theo dõi cho tới khi qua kiểm chứng holdout độc lập.'
                : 'Chưa đạt cận dưới hòa vốn; chỉ theo dõi, không coi là khuyến nghị lợi nhuận.',
            selected: selection.selected,
            ranking: selection.ranking,
            models: selection.models,
            methodPool: methodIds,
            // Keep the exact candidate dàn next to the issued decision. This
            // lets the research UI compare alternatives without rebuilding a
            // past prediction from newer chain statistics.
            candidateMethods: methodIds.map(methodId => ({
                methodId,
                label: METHOD_LABELS[methodId] || methodId,
                numbers: normalizeNumbers(methods[methodId]?.numbersToBet)
            })),
            selectionRule: 'Balanced: posterior 90/30/7 ngày, Wilson 90 ngày và EWMA; BayesGuard: co rút Bayes + Wilson và phạt chuỗi trượt; Hedge: cập nhật trọng số các dàn sau khi kết quả chốt. Tất cả chỉ dùng snapshot đã kết toán trước ngày dự đoán.'
        },
        main: {
            methodId: selectedMethodId,
            label: METHOD_LABELS[selectedMethodId] || selectedMethodId,
            numbers: mainNumbers,
            numberZ: mainNumbers.map(number => ({ number, zScore: Number((zScore?.scores?.[number] || 0).toFixed(3)), percentile: Number((zScore?.percentile?.[number] || 0).toFixed(3)) }))
        },
        hybrid: {
            id: 'adaptive-method-consensus-zscore-v6',
            label: `Kết hợp thích nghi ${hybrid.leaders.map(row => row.label).join(' + ')} + Z-score`,
            numbers: hybrid.numbers,
            leaders: hybrid.leaders,
            evidence: hybrid.evidence,
            replacedOut: hybrid.removedFromMain.map(number => ({ number })),
            replacedIn: hybrid.addedFromConsensus.map(number => ({ number })),
            note: 'Dàn kết hợp xếp hạng theo membership đồng thuận có trọng số của ba phương pháp tốt nhất; vị trí số trong mảng không được coi là thứ hạng. Z-score nhóm chỉ làm tín hiệu phụ và mọi dữ liệu đều dừng trước ngày dự đoán.'
        },
        zScore: zScore ? { lookback: zScore.lookback, topNumbers: zScore.topNumbers.map(row => ({ number: row.number, zScore: Number(row.score.toFixed(3)) })) } : null
    };
    return settleSnapshot(snapshot, run.summary?.actualSpecial);
}

function summarize(records, key) {
    const settled = records.filter(record => record.settled && record[key]);
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
            const canIssueCandidateMethodsNow = !current?.recommendation?.candidateMethods?.length
                && !record.settled
                && record?.recommendation?.candidateMethods?.length;
            // Candidate dàn are supplementary metadata. They are only added
            // while a prediction is still pending; settled ledgers stay
            // byte-for-byte faithful to what was available before the draw.
            const withCandidateMethods = canIssueCandidateMethodsNow
                ? {
                    ...preserved,
                    version: CACHE_VERSION,
                    recommendation: {
                        ...preserved.recommendation,
                        candidateMethods: record.recommendation.candidateMethods
                    }
                }
                : preserved;
            byDate.set(record.predictionDate, canIssueHybridNow
                ? { ...withCandidateMethods, version: CACHE_VERSION, hybrid: record.hybrid }
                : withCandidateMethods);
        });
    return [...byDate.values()].sort((left, right) => right.predictionDate.localeCompare(left.predictionDate)).slice(0, limit);
}

function generateAdvisorCache({ history = [], raw = [], existing = [], limit = 90 } = {}) {
    const runs = (history || []).filter(run => run?.predictionDate && run?.summary?.methods)
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
    const decisionReport = buildDecisionReport(runs);
    return {
        version: CACHE_VERSION,
        generatedAt: new Date().toISOString(),
        latestDataDate: rawRows.at(-1)?.date || null,
        methodology: {
            description: 'Mỗi ngày đồng thời chấm ba mô hình chọn phương pháp: cân bằng dài-ngắn, bám xu hướng ngắn hạn và ổn định có kiểm chứng. Tất cả đều dùng posterior 7/30/90 ngày, EWMA và cận dưới Wilson; chỉ khác trọng số. Dàn kết hợp xếp hạng đồng thuận có trọng số của ba phương pháp dẫn đầu, dùng Z-score nhóm làm tín hiệu phụ. Nhật ký chỉ giữ snapshot đã phát hành trước kỳ quay.',
            lookbackDraws: LOOKBACK_DRAWS,
            forms: scoringForms.length,
            uniqueGroups: groupsData.groups.length,
            methodPool: DAILY_METHOD_POOL,
            fusionMethodCount: FUSION_METHOD_COUNT,
            breakEvenHitRate: BET_COUNT / 84,
            warning: 'Dữ liệu lịch sử không bảo đảm lợi nhuận tương lai. Dàn thử nghiệm không thay thế dàn chính.'
        },
        summary: { main: summarize(records, 'main'), hybrid: summarize(records, 'hybrid') },
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
    METHOD_LABELS,
    DAILY_METHOD_POOL,
    SELECTION_MODELS,
    buildUniqueGroups,
    buildZScore,
    selectMethod,
    buildDecisionReport,
    buildAdaptiveFusion,
    buildZScoreHybrid,
    buildZScoreSupport,
    summarize,
    generateAdvisorCache,
    generateAndWriteCache,
    reconstructMissingSnapshots
};
