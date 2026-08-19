'use strict';

const {
    BET_COUNT: PRODUCTION_BET_COUNT,
    METHOD_LABELS,
    DAILY_METHOD_POOL,
    SELECTION_MODELS,
    selectMethod
} = require('./dailyMethodAdvisorService');

const NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = PRODUCTION_BET_COUNT || 30;
const PAYOUT_MULTIPLIER = 84;
const STAKE_PER_NUMBER_K = 1000;
const BREAK_EVEN_HIT_RATE = BET_COUNT / PAYOUT_MULTIPLIER;
const MIN_PRIOR_DRAWS = 20;

// These policies live only in the research laboratory. They do not replace
// the production dàn until a separate, fixed holdout validates one of them.
const RESEARCH_POLICIES = [
    {
        id: 'balanced',
        label: 'Cân bằng dài-ngắn',
        description: 'Chọn phương pháp bằng posterior 7/30/90 ngày, EWMA và cận Wilson theo trọng số production.',
        family: 'Mô hình nền',
        kind: 'selection-model',
        modelId: 'balanced'
    },
    {
        id: 'momentum',
        label: 'Bám xu hướng ngắn hạn',
        description: 'Nhạy hơn với 7/30 ngày nhưng vẫn neo vào Wilson 90 ngày để giảm phản ứng với một chuỗi thắng ngẫu nhiên.',
        family: 'Mô hình nền',
        kind: 'selection-model',
        modelId: 'momentum'
    },
    {
        id: 'stability',
        label: 'Ổn định có kiểm chứng',
        description: 'Ưu tiên posterior dài hạn, EWMA 21 ngày và cận dưới Wilson; đánh đổi tốc độ phản ứng để hạn chế rủi ro đuổi theo xu hướng.',
        family: 'Mô hình nền',
        kind: 'selection-model',
        modelId: 'stability'
    },
    {
        id: 'shortChampion',
        label: 'Quán quân 14 kỳ có co rút Bayes',
        description: 'Xếp phương pháp theo 14 kỳ gần nhất nhưng kéo về xác suất nền và đối chiếu thêm 42 kỳ, tránh chọn theo tỷ lệ thô.',
        family: 'Thử nghiệm chọn lọc',
        kind: 'short-champion'
    },
    {
        id: 'downsideGuard',
        label: 'Bảo vệ chuỗi trượt',
        description: 'Ưu tiên cận Wilson dài hạn và phạt phương pháp có chuỗi trượt dài trong 30 kỳ gần đây.',
        family: 'Thử nghiệm chọn lọc',
        kind: 'downside-guard'
    }
];

function isoDate(value) {
    return String(value || '').slice(0, 10);
}

function normalizeNumbers(values) {
    return [...new Set((values || []).map(Number).filter(number => Number.isInteger(number) && number >= 0 && number < 100))]
        .sort((left, right) => left - right);
}

function historyArray(history) {
    return Array.isArray(history) ? history : history?.records || [];
}

function latestByDate(rows) {
    return (rows || []).slice().sort((left, right) => isoDate(right?.predictionDate).localeCompare(isoDate(left?.predictionDate)))[0] || null;
}

function actualForRun(run) {
    const value = run?.summary?.actualSpecial;
    if (value === null || value === undefined || value === '') return null;
    const actual = Number(value);
    return Number.isInteger(actual) && actual >= 0 && actual < 100 ? actual : null;
}

function isSettled(run) {
    return actualForRun(run) !== null;
}

function methodNumbers(run, methodId) {
    return normalizeNumbers(run?.summary?.methods?.[methodId]?.numbersToBet);
}

function isImmutableHistoryRun(run) {
    return Boolean(run?.snapshotImmutable || run?.lifecycle?.immutableNumbers);
}

function immutableHistory(history) {
    return historyArray(history)
        .filter(run => run?.predictionDate && run?.summary?.methods && isImmutableHistoryRun(run))
        .slice()
        .sort((left, right) => isoDate(left.predictionDate).localeCompare(isoDate(right.predictionDate)));
}

function methodIdsForRun(run) {
    return DAILY_METHOD_POOL.filter(methodId => methodNumbers(run, methodId).length === BET_COUNT);
}

function scoreRows(snapshot) {
    return (snapshot?.rankedNumbers || []).map(row => ({
        number: Number(row.number),
        score: Number(row.score || 0),
        rank: Number(row.rank || 101),
        band: row.band || 'D',
        components: row.components || {}
    })).filter(row => Number.isInteger(row.number) && row.number >= 0 && row.number < 100);
}

function wilsonLower(wins, total, z = 1.2815515655446004) {
    if (!total) return 0;
    const probability = wins / total;
    const denominator = 1 + (z * z) / total;
    const centre = probability + (z * z) / (2 * total);
    const margin = z * Math.sqrt((probability * (1 - probability) + (z * z) / (4 * total)) / total);
    return Math.max(0, (centre - margin) / denominator);
}

function betaPosteriorMean(wins, total, priorWins, priorLosses) {
    return (wins + priorWins) / Math.max(1, total + priorWins + priorLosses);
}

function hitsForMethod(rows, methodId) {
    return (rows || []).reduce((count, run) => count + Number(methodNumbers(run, methodId).includes(actualForRun(run))), 0);
}

function longestLossStreak(rows, methodId) {
    let current = 0;
    let longest = 0;
    (rows || []).forEach(run => {
        if (methodNumbers(run, methodId).includes(actualForRun(run))) current = 0;
        else current += 1;
        longest = Math.max(longest, current);
    });
    return longest;
}

function shortChampion(priorRuns, methodIds) {
    const rows = (methodIds || []).map(methodId => {
        const samples = (priorRuns || []).filter(run => isSettled(run) && methodNumbers(run, methodId).length === BET_COUNT);
        const recent14 = samples.slice(-14);
        const recent42 = samples.slice(-42);
        const hits14 = hitsForMethod(recent14, methodId);
        const hits42 = hitsForMethod(recent42, methodId);
        const posterior14 = betaPosteriorMean(hits14, recent14.length, 5, 9);
        const posterior42 = betaPosteriorMean(hits42, recent42.length, 12, 22);
        const lower14 = wilsonLower(hits14, recent14.length);
        const lower42 = wilsonLower(hits42, recent42.length);
        return {
            methodId,
            label: METHOD_LABELS[methodId] || methodId,
            observations: samples.length,
            observations14: recent14.length,
            wins14: hits14,
            observations42: recent42.length,
            wins42: hits42,
            posterior14,
            posterior42,
            lower14,
            lower42,
            selectionScore: 0.42 * posterior14 + 0.24 * lower14 + 0.22 * posterior42 + 0.12 * lower42
        };
    }).filter(row => row.observations >= MIN_PRIOR_DRAWS);
    return rows.sort((left, right) => right.selectionScore - left.selectionScore
        || right.lower42 - left.lower42
        || left.methodId.localeCompare(right.methodId))[0] || null;
}

function downsideGuard(priorRuns, methodIds) {
    const rows = (methodIds || []).map(methodId => {
        const samples = (priorRuns || []).filter(run => isSettled(run) && methodNumbers(run, methodId).length === BET_COUNT);
        const recent30 = samples.slice(-30);
        const recent90 = samples.slice(-90);
        const wins30 = hitsForMethod(recent30, methodId);
        const wins90 = hitsForMethod(recent90, methodId);
        const posterior30 = betaPosteriorMean(wins30, recent30.length, 12, 28);
        const posterior90 = betaPosteriorMean(wins90, recent90.length, 18, 42);
        const lower90 = wilsonLower(wins90, recent90.length);
        const lossPenalty = Math.min(1, longestLossStreak(recent30, methodId) / Math.max(6, recent30.length));
        return {
            methodId,
            label: METHOD_LABELS[methodId] || methodId,
            observations: samples.length,
            wins30,
            observations30: recent30.length,
            wins90,
            observations90: recent90.length,
            posterior30,
            posterior90,
            wilsonLower90: lower90,
            recentLossStreak: longestLossStreak(recent30, methodId),
            selectionScore: 0.42 * posterior90 + 0.31 * lower90 + 0.20 * posterior30 + 0.07 * (1 - lossPenalty)
        };
    }).filter(row => row.observations >= MIN_PRIOR_DRAWS);
    return rows.sort((left, right) => right.selectionScore - left.selectionScore
        || right.wilsonLower90 - left.wilsonLower90
        || left.methodId.localeCompare(right.methodId))[0] || null;
}

function fallbackSelectionScore(row, modelId) {
    if (modelId === 'momentum') {
        return 0.24 * Number(row.posterior7 || 0)
            + 0.24 * Number(row.posterior30 || 0)
            + 0.18 * Number(row.weightedRate7 || 0)
            + 0.16 * Number(row.weightedRate30 || 0)
            + 0.13 * Number(row.wilsonLower90 || 0)
            + 0.05 * Number(row.posteriorMean || 0)
            + 0.55 * Number(row.trend || 0);
    }
    if (modelId === 'stability') {
        return 0.31 * Number(row.posteriorMean || 0)
            + 0.29 * Number(row.wilsonLower90 || 0)
            + 0.21 * Number(row.weightedRate30 || 0)
            + 0.14 * Number(row.posterior30 || 0)
            + 0.05 * Number(row.weightedRate7 || 0)
            + 0.20 * Number(row.trend || 0);
    }
    return Number(row.score || 0);
}

function modelsFromLockedRanking(advisorRecord) {
    const ranking = advisorRecord?.recommendation?.ranking || [];
    const cachedModels = advisorRecord?.recommendation?.models;
    if (Array.isArray(cachedModels) && cachedModels.length) return cachedModels;
    // Old issued snapshots did not retain the three model lanes. Recreate
    // only the explanatory ranking from the ranking published with that
    // snapshot; the historical dàn itself is never recalculated here.
    return SELECTION_MODELS.map(model => {
        const selected = ranking.slice().map(row => ({ ...row, selectionScore: fallbackSelectionScore(row, model.id) }))
            .sort((left, right) => right.selectionScore - left.selectionScore || left.methodId.localeCompare(right.methodId))[0] || null;
        return { ...model, selected };
    });
}

function candidateMethodRun(advisorRecord, fallbackRun) {
    const fromSnapshot = advisorRecord?.recommendation?.candidateMethods || [];
    if (fromSnapshot.length) {
        return {
            summary: {
                methods: Object.fromEntries(fromSnapshot.map(method => [method.methodId, { numbersToBet: method.numbers }]))
            }
        };
    }
    return fallbackRun || {
        summary: {
            methods: advisorRecord?.main?.methodId
                ? { [advisorRecord.main.methodId]: { numbersToBet: advisorRecord.main.numbers || [] } }
                : {}
        }
    };
}

function policyDecision(policy, selection, priorRuns, currentRun, methodIds) {
    let selected = null;
    if (policy.kind === 'selection-model') {
        selected = selection?.models?.find(model => model.id === policy.modelId)?.selected || null;
    } else if (policy.kind === 'short-champion') {
        selected = shortChampion(priorRuns, methodIds);
    } else if (policy.kind === 'downside-guard') {
        selected = downsideGuard(priorRuns, methodIds);
    }
    const methodId = selected?.methodId || null;
    return {
        policyId: policy.id,
        methodId,
        label: selected?.label || (methodId ? METHOD_LABELS[methodId] || methodId : 'Chưa đủ dữ liệu'),
        selectionScore: Number(selected?.selectionScore || selected?.score || 0),
        numbers: methodId ? methodNumbers(currentRun, methodId) : [],
        detail: selected || null
    };
}

function summarizeDecisions(rows) {
    const settled = (rows || []).filter(row => row?.resolved);
    const wins = settled.filter(row => row.hit).length;
    const losses = settled.length - wins;
    let currentLoss = 0;
    let longestLoss = 0;
    let currentWin = 0;
    let longestWin = 0;
    settled.forEach(row => {
        if (row.hit) {
            currentWin += 1;
            currentLoss = 0;
        } else {
            currentLoss += 1;
            currentWin = 0;
        }
        longestLoss = Math.max(longestLoss, currentLoss);
        longestWin = Math.max(longestWin, currentWin);
    });
    const stakeK = settled.length * BET_COUNT * STAKE_PER_NUMBER_K;
    const profitK = wins * PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K - stakeK;
    const hitRate = settled.length ? wins / settled.length : 0;
    const lower = wilsonLower(wins, settled.length);
    return {
        days: settled.length,
        wins,
        losses,
        hitRate,
        wilsonLower: lower,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestLoss,
        longestWin,
        breakEvenHitRate: BREAK_EVEN_HIT_RATE,
        isAboveBreakEven: settled.length > 0 && hitRate >= BREAK_EVEN_HIT_RATE,
        evidence: settled.length < 30
            ? 'Mẫu còn ngắn'
            : profitK > 0 && lower >= BREAK_EVEN_HIT_RATE
                ? 'Có tín hiệu vượt hòa vốn'
                : profitK > 0
                    ? 'Lãi mẫu, chưa vượt cận Wilson'
                    : 'Chưa đạt tiêu chí promotion'
    };
}

function isoWeekKey(dateValue) {
    const date = new Date(`${isoDate(dateValue)}T00:00:00.000Z`);
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function aggregatePeriods(rows, granularity) {
    const map = new Map();
    (rows || []).forEach(row => {
        const key = granularity === 'week' ? isoWeekKey(row.date) : isoDate(row.date).slice(0, 7);
        const bucket = map.get(key) || [];
        bucket.push(row);
        map.set(key, bucket);
    });
    return [...map.entries()].map(([period, values]) => ({ period, ...summarizeDecisions(values) }))
        .sort((left, right) => left.period.localeCompare(right.period));
}

function buildResearchReport(history) {
    const ordered = immutableHistory(history);
    const decisions = new Map(RESEARCH_POLICIES.map(policy => [policy.id, []]));
    let eligibleDays = 0;
    ordered.forEach((run, index) => {
        const actual = actualForRun(run);
        if (actual === null) return;
        const priorRuns = ordered.slice(0, index).filter(isSettled);
        const methodIds = methodIdsForRun(run);
        if (priorRuns.length < MIN_PRIOR_DRAWS || !methodIds.length) return;
        eligibleDays += 1;
        const selection = selectMethod(priorRuns, methodIds);
        RESEARCH_POLICIES.forEach(policy => {
            const decision = policyDecision(policy, selection, priorRuns, run, methodIds);
            if (decision.numbers.length !== BET_COUNT) return;
            decisions.get(policy.id).push({
                date: isoDate(run.predictionDate),
                methodId: decision.methodId,
                methodLabel: decision.label,
                selectionScore: decision.selectionScore,
                actual,
                hit: decision.numbers.includes(actual),
                resolved: true
            });
        });
    });
    return {
        strictPointInTime: true,
        source: {
            immutableRuns: ordered.length,
            settledRuns: ordered.filter(isSettled).length,
            eligibleDays,
            startDate: ordered[0]?.predictionDate || null,
            endDate: ordered.at(-1)?.predictionDate || null,
            minimumPriorDraws: MIN_PRIOR_DRAWS,
            fixedBetCount: BET_COUNT,
            breakEvenHitRate: BREAK_EVEN_HIT_RATE,
            note: 'Tại từng ngày D, phương pháp chỉ nhìn các snapshot immutable đã có kết quả trước D. Dàn D lấy nguyên từ snapshot D, không tạo lại bằng dữ liệu sau D.'
        },
        policies: RESEARCH_POLICIES.map(policy => {
            const rows = decisions.get(policy.id) || [];
            return {
                ...policy,
                overall: summarizeDecisions(rows),
                windows: {
                    last14: summarizeDecisions(rows.slice(-14)),
                    last30: summarizeDecisions(rows.slice(-30))
                },
                weekly: aggregatePeriods(rows, 'week'),
                monthly: aggregatePeriods(rows, 'month'),
                decisions: rows
            };
        })
    };
}

function methodMatrix({ advisorRecord, currentRun, scoreRecord }) {
    const ranking = advisorRecord?.recommendation?.ranking || [];
    const scoreByNumber = new Map(scoreRows(scoreRecord).map(row => [row.number, row]));
    const scoreTop = new Set(scoreRows(scoreRecord).filter(row => row.rank <= BET_COUNT).map(row => row.number));
    return ranking.map((rank, index) => {
        const numbers = methodNumbers(currentRun, rank.methodId);
        const overlap = numbers.filter(number => scoreTop.has(number));
        const averageScore = numbers.length
            ? numbers.reduce((sum, number) => sum + Number(scoreByNumber.get(number)?.score || 0), 0) / numbers.length
            : 0;
        return {
            rank: index + 1,
            methodId: rank.methodId,
            label: rank.label || METHOD_LABELS[rank.methodId] || rank.methodId,
            numbers,
            betCount: numbers.length,
            overlap,
            overlapCount: overlap.length,
            overlapRate: numbers.length ? overlap.length / numbers.length : 0,
            averageScore: Number(averageScore.toFixed(2)),
            rate7: Number(rank.rate7 || 0),
            rate30: Number(rank.rate30 || 0),
            rate90: Number(rank.rate90 || 0),
            wilsonLower90: Number(rank.wilsonLower90 || 0),
            trend: Number(rank.trend || 0)
        };
    });
}

function selectedModels(advisorRecord, methods, scoreRecord) {
    const methodById = new Map(methods.map(method => [method.methodId, method]));
    return modelsFromLockedRanking(advisorRecord).map(model => {
        const method = methodById.get(model.selected?.methodId);
        return {
            id: model.id,
            label: model.label,
            description: model.description,
            selectedMethodId: model.selected?.methodId || null,
            selectedLabel: method?.label || model.selected?.label || '-',
            selectionScore: Number(model.selected?.selectionScore || 0),
            numbers: method?.numbers || [],
            scoreOverlap: method?.overlap || [],
            scoreOverlapRate: Number(method?.overlapRate || 0),
            scoreRecordDate: scoreRecord?.predictionDate || null
        };
    });
}

function buildScoreOverlay(selected, scoreRecord) {
    const calibration = scoreRecord?.model?.calibration || scoreRecord?.scoreDefinition?.calibration || null;
    const eligible = Boolean(calibration?.eligible);
    if (!eligible) {
        const days = Number(calibration?.days || 0);
        const hitRate = Number(calibration?.hitRate || 0);
        const wilson = Number(calibration?.wilsonLower || 0);
        const breakEven = Number(calibration?.breakEvenHitRate || BREAK_EVEN_HIT_RATE);
        return {
            isExperimental: true,
            eligible: false,
            calibration,
            label: 'Điểm xác suất đang được kiểm định',
            note: `Điểm xác suất chưa được ghép vào dàn gợi ý. Mẫu calibration ${days} ngày, tỷ lệ ${(hitRate * 100).toFixed(1)}%, cận Wilson ${(wilson * 100).toFixed(1)}%, trong khi ngưỡng hòa vốn ${(breakEven * 100).toFixed(1)}%.`,
            numbers: [],
            ranked: []
        };
    }
    const scoreByNumber = new Map(scoreRows(scoreRecord).map(row => [row.number, row]));
    const votes = Array(100).fill(0);
    selected.forEach((model, index) => {
        const weight = 1 - index * 0.1;
        model.numbers.forEach(number => { votes[number] += weight; });
    });
    const ranked = NUMBERS.map(number => {
        const score = scoreByNumber.get(number);
        return {
            number,
            methodVotes: Number(votes[number].toFixed(2)),
            probabilityScore: Number(score?.score || 0),
            probabilityRank: Number(score?.rank || 101),
            combinedScore: Number((votes[number] * 70 + Number(score?.score || 0) * 0.3).toFixed(2))
        };
    }).sort((left, right) => right.combinedScore - left.combinedScore
        || right.methodVotes - left.methodVotes
        || left.probabilityRank - right.probabilityRank
        || left.number - right.number);
    return {
        isExperimental: true,
        eligible: true,
        calibration,
        label: 'Tín hiệu giao giữa mô hình và Điểm xác suất',
        note: 'Đây là lớp giải thích hiện tại: số có nhiều mô hình đồng thuận được làm nổi bật, sau đó mới đối chiếu Điểm xác suất. Do Điểm xác suất chưa có chuỗi snapshot dài cùng ngày, lớp này không được đưa vào backtest hoặc thay dàn production.',
        numbers: ranked.slice(0, BET_COUNT).map(row => row.number).sort((left, right) => left - right),
        ranked: ranked.slice(0, BET_COUNT)
    };
}

function buildCurrentCandidates({ advisorRecord, orderedHistory, matchingRun }) {
    const targetDate = isoDate(advisorRecord?.predictionDate);
    const hasCandidateSets = Boolean(matchingRun || advisorRecord?.recommendation?.candidateMethods?.length);
    const currentRun = candidateMethodRun(advisorRecord, matchingRun);
    const methodIds = (advisorRecord?.recommendation?.methodPool || methodIdsForRun(currentRun))
        .filter(methodId => methodNumbers(currentRun, methodId).length === BET_COUNT);
    const priorRuns = orderedHistory.filter(run => isoDate(run.predictionDate) < targetDate && isSettled(run));
    const selection = priorRuns.length >= MIN_PRIOR_DRAWS && methodIds.length
        ? selectMethod(priorRuns, methodIds)
        : null;
    return RESEARCH_POLICIES.map(policy => {
        const decision = policyDecision(policy, selection, priorRuns, currentRun, methodIds);
        const mainFallback = decision.methodId === advisorRecord?.main?.methodId
            ? normalizeNumbers(advisorRecord?.main?.numbers)
            : [];
        // Older immutable advisor snapshots kept only the issued main dàn.
        // Do not present that dàn as evidence for every research policy: only
        // show it when this policy selected the same issued method.
        const numbers = hasCandidateSets && decision.numbers.length === BET_COUNT
            ? decision.numbers
            : (policy.id === 'balanced' ? mainFallback : []);
        return {
            id: policy.id,
            label: policy.label,
            description: policy.description,
            family: policy.family,
            methodId: decision.methodId,
            methodLabel: decision.label,
            selectionScore: decision.selectionScore,
            numbers,
            numbersAvailable: numbers.length === BET_COUNT,
            source: matchingRun ? 'snapshot cùng ngày' : advisorRecord?.recommendation?.candidateMethods?.length ? 'candidate dàn đã khóa' : 'chỉ có dàn chính đã khóa',
            isProduction: policy.id === 'balanced'
        };
    });
}

function explainSelection(currentCandidates, scoreRecord, report) {
    const primary = currentCandidates.find(candidate => candidate.isProduction);
    const bestLab = [...(report?.policies || [])].sort((left, right) => right.overall.profitK - left.overall.profitK || right.overall.wilsonLower - left.overall.wilsonLower)[0];
    return {
        primary: primary?.methodLabel
            ? `Dàn production được khóa theo ${primary.methodLabel}; chỉ snapshot này được dùng để ghi nhật ký thực tế.`
            : 'Chưa đủ dữ liệu để chọn dàn production.',
        laboratory: bestLab
            ? `Trong mẫu immutable hiện có, ${bestLab.label} đang được so sánh như một giả thuyết nghiên cứu; kết quả chỉ có ý nghĩa trong phạm vi ${bestLab.overall.days} ngày đủ điều kiện.`
            : 'Chưa đủ snapshot để có kết luận nghiên cứu.',
        strict: 'Mỗi hàng nghiên cứu dùng các kết quả trước ngày dự đoán; không sử dụng kết quả ngày đó hoặc các ngày tương lai để chọn phương pháp.',
        scoring: `Điểm xác suất hiện có snapshot ${scoreRecord?.predictionDate || '-'} và chỉ đóng vai trò phân tích giao tín hiệu, chưa được coi là bằng chứng backtest cùng ngày.`,
        caution: 'Lãi lịch sử không bảo đảm lợi nhuận tương lai. Cổng promotion chỉ được xét khi có mẫu đủ lớn, cận Wilson vượt hòa vốn và kết quả không xấu đi ở một giai đoạn lịch độc lập.'
    };
}

function buildCurrentAdvice({ currentCandidates, methods, selectedModels }) {
    const available = (currentCandidates || []).filter(candidate => candidate.numbersAvailable && candidate.methodId);
    const groups = new Map();
    available.forEach(candidate => {
        const group = groups.get(candidate.methodId) || {
            methodId: candidate.methodId,
            methodLabel: candidate.methodLabel,
            policies: []
        };
        group.policies.push(candidate.id);
        groups.set(candidate.methodId, group);
    });
    const consensus = [...groups.values()]
        .map(group => ({ ...group, count: group.policies.length }))
        .sort((left, right) => right.count - left.count || left.methodLabel.localeCompare(right.methodLabel));
    const primary = available.find(candidate => candidate.isProduction) || null;
    const primaryMetrics = (methods || []).find(method => method.methodId === primary?.methodId) || null;
    const primaryModel = (selectedModels || []).find(model => model.id === 'balanced') || null;
    const agreedCount = consensus.find(group => group.methodId === primary?.methodId)?.count || 0;
    const rate30 = Number(primaryMetrics?.rate30 || 0);
    const lower90 = Number(primaryMetrics?.wilsonLower90 || 0);
    const meetsEvidenceGate = rate30 >= BREAK_EVEN_HIT_RATE && lower90 >= BREAK_EVEN_HIT_RATE;
    const status = !primary
        ? 'Chưa có dàn production khóa'
        : meetsEvidenceGate
            ? 'Có tín hiệu theo dõi, vẫn cần kiểm chứng độc lập'
            : 'Thận trọng: chưa đủ bằng chứng để nâng mức tin cậy';
    const recommendations = !primary
        ? ['Chờ action phát hành snapshot mới trước khi đưa ra dàn hoặc thay đổi vốn.']
        : [
            `Dùng nguyên dàn production ${primary.methodLabel}; không thay dàn sau khi đã phát hành.`,
            agreedCount > 1
                ? `${agreedCount}/${available.length} chính sách đang chọn cùng phương pháp; đây là đồng thuận mô hình, không phải xác suất trúng.`
                : 'Các chính sách đang phân kỳ; không dùng một kết quả ngắn hạn để chuyển phương pháp trong ngày.',
            meetsEvidenceGate
                ? 'Mốc 30 ngày và cận Wilson 90 ngày cùng vượt hòa vốn, nhưng vẫn phải kiểm tra qua một giai đoạn lịch độc lập.'
                : 'Một trong hai điều kiện 30 ngày hoặc cận Wilson 90 ngày chưa vượt hòa vốn; chỉ nên quan sát hoặc dùng mức vốn thận trọng.'
        ];
    return {
        status,
        primaryMethodId: primary?.methodId || null,
        primaryLabel: primary?.methodLabel || null,
        primarySelectionScore: Number(primaryModel?.selectionScore || primary?.selectionScore || 0),
        agreement: {
            availablePolicies: available.length,
            primaryPolicies: agreedCount,
            uniqueMethods: consensus.length,
            groups: consensus
        },
        evidence: {
            rate30,
            rate90: Number(primaryMetrics?.rate90 || 0),
            wilsonLower90: lower90,
            breakEvenHitRate: BREAK_EVEN_HIT_RATE,
            meetsEvidenceGate
        },
        recommendations
    };
}

function buildAdvisorAnalysis({ advisorCache, probabilityCache, history }) {
    const advisorRecord = latestByDate(advisorCache?.records);
    const scoreRecord = latestByDate(probabilityCache?.records);
    const targetDate = advisorRecord?.predictionDate || scoreRecord?.predictionDate || null;
    const orderedHistory = immutableHistory(history);
    const matchingRun = orderedHistory.find(run => isoDate(run.predictionDate) === isoDate(targetDate)) || null;
    const currentRun = candidateMethodRun(advisorRecord, matchingRun);
    const methods = methodMatrix({ advisorRecord, currentRun, scoreRecord });
    const selected = selectedModels(advisorRecord, methods, scoreRecord);
    const scoreOverlay = buildScoreOverlay(selected, scoreRecord);
    const researchReport = buildResearchReport(history);
    const currentCandidates = buildCurrentCandidates({ advisorRecord, orderedHistory, matchingRun });
    const currentAdvice = buildCurrentAdvice({ currentCandidates, methods, selectedModels: selected });
    return {
        version: 'advisor-analysis-v2',
        predictionDate: targetDate,
        source: {
            advisorSnapshotDate: advisorRecord?.predictionDate || null,
            scoreSnapshotDate: scoreRecord?.predictionDate || null,
            historySnapshotDate: matchingRun?.predictionDate || null,
            strict: 'Phân tích kiểm chứng chỉ đọc snapshot immutable đã phát hành; không tái tính dàn cũ bằng dữ liệu tương lai.'
        },
        methods,
        selectedModels: selected,
        currentCandidates,
        currentAdvice,
        scoreOverlay,
        researchReport,
        explanation: explainSelection(currentCandidates, scoreRecord, researchReport),
        warnings: {
            scoreDateMismatch: Boolean(scoreRecord?.predictionDate && targetDate && isoDate(scoreRecord.predictionDate) !== isoDate(targetDate)),
            missingMethodNumbers: methods.filter(method => method.betCount === 0).map(method => method.methodId),
            isExperimental: true,
            noCurrentCandidateSets: currentCandidates.filter(candidate => !candidate.numbersAvailable).map(candidate => candidate.id)
        },
        availableMethodPool: DAILY_METHOD_POOL
    };
}

module.exports = {
    RESEARCH_POLICIES,
    buildAdvisorAnalysis,
    buildResearchReport,
    summarizeDecisions,
    immutableHistory
};
