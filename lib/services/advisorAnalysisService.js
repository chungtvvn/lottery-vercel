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
        id: 'bayesGuard',
        label: 'Bayes/Wilson có phạt chuỗi trượt',
        description: 'Kéo xác suất về mức nền, dùng cận Wilson và phạt chuỗi trượt; không chọn chỉ vì một tỷ lệ thắng ngắn hạn.',
        family: 'Mô hình hiệu chỉnh',
        kind: 'selection-model',
        modelId: 'bayesGuard'
    },
    {
        id: 'hedge',
        label: 'Hedge online giữa các dàn',
        description: 'Cập nhật trọng số phương pháp sau khi kết quả đã chốt, sau đó chọn đúng một dàn có trọng số cao nhất cho kỳ tiếp theo.',
        family: 'Mô hình hiệu chỉnh',
        kind: 'selection-model',
        modelId: 'hedge'
    },
    {
        id: 'bayesianEnsemble',
        label: 'Siêu đồng thuận Bayes (BMA)',
        description: 'Dung hợp Bayesian Model Averaging từ toàn bộ phương pháp dựa trên hàm hợp lý (likelihood) và Dirichlet prior 30 kỳ, sinh dàn số có xác suất gộp cao nhất.',
        family: 'Đa mô hình Bayes',
        kind: 'bayesian-ensemble'
    },
    {
        id: 'regimeSwitching',
        label: 'Nhận diện trạng thái Markov',
        description: 'Đo lường entropy và độ biến động 14 kỳ để nhận diện thị trường đang theo xu hướng (Momentum) hay nhiễu loạn để tự động chuyển sang bảo vệ rủi ro (Downside/BayesGuard).',
        family: 'Nhận diện trạng thái',
        kind: 'regime-switching'
    },
    {
        id: 'kellyOptimal',
        label: 'Tối ưu hóa vốn Kelly Fractional',
        description: 'Tính toán tỷ lệ phân bổ vốn Kelly Fractional dựa trên tỷ suất lợi nhuận kỳ vọng và cận an toàn Wilson, chọn phương pháp có Edge tối ưu nhất.',
        family: 'Quản trị vốn Kelly',
        kind: 'kelly-optimal'
    },
    {
        id: 'metaLearnerFusion',
        label: 'Dung hợp đa tiêu chí (Meta-Learner)',
        description: 'Kết hợp 4 chỉ báo: Cận Wilson 90%, Handoff resilience sau trượt, Kháng Drawdown và Score xác suất để sinh dàn 30 số có độ tin cậy cao nhất.',
        family: 'Học đa tiêu chí',
        kind: 'meta-learner-fusion'
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
    },
    {
        id: 'handoffGuard',
        label: 'Luân phiên bổ sung sau trượt',
        description: 'Chỉ khi dàn cân bằng vừa trượt, kiểm tra dàn nào đã có tín hiệu bắt nhịp sau các lần trượt tương tự trong quá khứ. Mọi tỷ lệ đều co rút Bayes và chỉ dùng dữ liệu trước ngày D.',
        family: 'Thử nghiệm bổ sung',
        kind: 'handoff-guard'
    },
    {
        id: 'consensusFusion',
        label: 'Đồng thuận membership cố định 30 số',
        description: 'Cộng membership của các dàn ứng viên theo độ tin cậy đã biết trước ngày D. Mỗi số trong một dàn có trọng số như nhau; thứ tự số tăng dần không bị hiểu nhầm là thứ hạng.',
        family: 'Thử nghiệm bổ sung',
        kind: 'consensus-fusion'
    },
    {
        id: 'wilsonAbstain',
        label: 'Bayes/Wilson có quyền bỏ ngày',
        description: 'Chỉ phát dàn BayesGuard khi posterior 30 ngày, EWMA và cận dưới Wilson đều vượt điểm hòa vốn. Nếu thiếu bằng chứng thì bỏ ngày, không sinh dàn mặc định.',
        family: 'Thử nghiệm bỏ ngày',
        kind: 'selection-model-gated',
        modelId: 'bayesGuard'
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

function advisorRecordAsHistoryRun(record) {
    const candidateMethods = record?.recommendation?.candidateMethods || [];
    const methods = Object.fromEntries(candidateMethods
        .map(method => [method?.methodId, { numbersToBet: normalizeNumbers(method?.numbers) }])
        .filter(([methodId, method]) => methodId && method.numbersToBet.length === BET_COUNT));
    const mainMethodId = record?.main?.methodId;
    const mainNumbers = normalizeNumbers(record?.main?.numbers);
    if (mainMethodId && mainNumbers.length === BET_COUNT && !methods[mainMethodId]) {
        methods[mainMethodId] = { numbersToBet: mainNumbers };
    }
    // A one-method legacy record cannot support fair method selection or
    // fixed-count consensus. Keep it in the live ledger, but do not enlarge
    // the research sample with a relabelled production dàn.
    if (Object.keys(methods).length < 2) return null;
    return {
        predictionDate: isoDate(record?.predictionDate),
        sourceDrawDate: isoDate(record?.sourceDrawDate),
        generatedAt: record?.createdAt || null,
        snapshotImmutable: true,
        lifecycle: record?.lifecycle || { immutableNumbers: true },
        summary: {
            actualSpecial: record?.settled ? record?.actual : null,
            methods
        }
    };
}

function mergeImmutableResearchHistory(history, advisorRecords) {
    const byDate = new Map(immutableHistory(history).map(run => [isoDate(run.predictionDate), run]));
    (advisorRecords || []).map(advisorRecordAsHistoryRun).filter(Boolean).forEach(run => {
        const date = isoDate(run.predictionDate);
        const current = byDate.get(date);
        const currentMethodCount = Object.keys(current?.summary?.methods || {}).length;
        const advisorMethodCount = Object.keys(run?.summary?.methods || {}).length;
        const currentSettled = actualForRun(current) !== null;
        const advisorSettled = actualForRun(run) !== null;
        if (!current
            || advisorMethodCount > currentMethodCount
            || (!currentSettled && advisorSettled && advisorMethodCount >= currentMethodCount)) {
            byDate.set(date, run);
        }
    });
    return [...byDate.values()].sort((left, right) => isoDate(left.predictionDate).localeCompare(isoDate(right.predictionDate)));
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

// This policy is deliberately conservative. It does not assume that two
// methods alternate merely because their hit rows look interleaved in a short
// sample. It becomes active only after the current balanced leader missed the
// latest settled draw, then evaluates each alternative from earlier, matching
// "leader missed yesterday -> candidate outcome today" transitions.
function handoffGuard(priorRuns, methodIds, selection) {
    const ordered = (priorRuns || []).filter(isSettled)
        .slice().sort((left, right) => isoDate(left.predictionDate).localeCompare(isoDate(right.predictionDate)));
    const anchor = selection?.models?.find(model => model.id === 'balanced')?.selected
        || selection?.selected
        || null;
    const anchorId = anchor?.methodId;
    const latest = ordered.at(-1);
    const anchorLastHit = anchorId && latest
        ? methodNumbers(latest, anchorId).includes(actualForRun(latest))
        : null;
    if (!anchorId || !latest || anchorLastHit !== false) {
        return anchor ? {
            ...anchor,
            contextActive: false,
            anchorMethodId: anchorId || null,
            anchorLastHit: anchorLastHit === true,
            note: 'Dàn cân bằng không vừa trượt, nên không kích hoạt luân phiên để tránh đổi dàn theo nhiễu ngắn hạn.'
        } : null;
    }

    const candidates = (methodIds || []).filter(methodId => methodId !== anchorId).map(methodId => {
        const overallRows = ordered.filter(run => methodNumbers(run, methodId).length === BET_COUNT);
        const overallWins = hitsForMethod(overallRows, methodId);
        const conditioned = [];
        for (let index = 1; index < ordered.length; index += 1) {
            const previous = ordered[index - 1];
            const current = ordered[index];
            const anchorNumbers = methodNumbers(previous, anchorId);
            const candidateNumbers = methodNumbers(current, methodId);
            if (anchorNumbers.length !== BET_COUNT || candidateNumbers.length !== BET_COUNT) continue;
            if (anchorNumbers.includes(actualForRun(previous))) continue;
            conditioned.push(candidateNumbers.includes(actualForRun(current)));
        }
        const conditionalWins = conditioned.filter(Boolean).length;
        const conditionalDays = conditioned.length;
        const conditionalPosterior = betaPosteriorMean(conditionalWins, conditionalDays, 9, 21);
        const conditionalLower = wilsonLower(conditionalWins, conditionalDays);
        const overallPosterior = betaPosteriorMean(overallWins, overallRows.length, 18, 42);
        const sampleRamp = Math.min(1, conditionalDays / 36);
        return {
            methodId,
            label: METHOD_LABELS[methodId] || methodId,
            observations: overallRows.length,
            conditionalDays,
            conditionalWins,
            conditionalRate: conditionalDays ? conditionalWins / conditionalDays : 0,
            conditionalPosterior,
            conditionalLower,
            overallPosterior,
            selectionScore: sampleRamp * (0.52 * conditionalPosterior + 0.30 * conditionalLower + 0.18 * overallPosterior)
                + (1 - sampleRamp) * overallPosterior
        };
    }).filter(row => row.observations >= MIN_PRIOR_DRAWS && row.conditionalDays >= 12)
        .sort((left, right) => right.selectionScore - left.selectionScore
            || right.conditionalLower - left.conditionalLower
            || right.overallPosterior - left.overallPosterior
            || left.methodId.localeCompare(right.methodId));

    const selected = candidates[0];
    if (!selected) {
        return {
            ...anchor,
            contextActive: false,
            anchorMethodId: anchorId,
            anchorLastHit: false,
            note: 'Dàn cân bằng vừa trượt nhưng chưa đủ tối thiểu 12 lần chuyển tiếp tương tự để đổi sang dàn bổ sung.'
        };
    }
    return {
        ...selected,
        contextActive: true,
        anchorMethodId: anchorId,
        anchorLastHit: false,
        note: `Kích hoạt sau khi ${METHOD_LABELS[anchorId] || anchorId} vừa trượt; chọn theo ${selected.conditionalWins}/${selected.conditionalDays} chuyển tiếp tương tự đã kết toán.`
    };
}

function bayesianEnsemble(selection, currentRun, methodIds, priorRuns) {
    const ordered = (priorRuns || []).filter(isSettled)
        .slice().sort((left, right) => isoDate(left.predictionDate).localeCompare(isoDate(right.predictionDate)));
    const recent30 = ordered.slice(-30);
    if (!recent30.length) return null;

    const methodStats = (methodIds || []).map(methodId => {
        const numbers = methodNumbers(currentRun, methodId);
        if (numbers.length !== BET_COUNT) return null;
        
        let logLikelihood = 0;
        let hits = 0;
        recent30.forEach(run => {
            const actual = actualForRun(run);
            const mNums = methodNumbers(run, methodId);
            if (mNums.length === BET_COUNT && Number.isInteger(actual)) {
                const hit = mNums.includes(actual);
                if (hit) {
                    hits += 1;
                    logLikelihood += Math.log(0.38);
                } else {
                    logLikelihood += Math.log(0.62);
                }
            }
        });
        const posterior = betaPosteriorMean(hits, recent30.length, 12, 28);
        return {
            methodId,
            label: METHOD_LABELS[methodId] || methodId,
            numbers,
            hits,
            posterior,
            logLikelihood
        };
    }).filter(Boolean);

    if (methodStats.length < 2) return null;

    const maxLL = Math.max(...methodStats.map(m => m.logLikelihood));
    const rawWeights = methodStats.map(m => Math.exp(Math.max(-20, m.logLikelihood - maxLL)) * m.posterior);
    const sumW = rawWeights.reduce((a, b) => a + b, 0) || 1;
    const weights = rawWeights.map(w => w / sumW);

    const numberScores = NUMBERS.map(number => {
        let prob = 0;
        let supporters = 0;
        methodStats.forEach((m, idx) => {
            if (m.numbers.includes(number)) {
                prob += weights[idx];
                supporters += 1;
            }
        });
        return { number, prob, supporters };
    }).sort((a, b) => b.prob - a.prob || b.supporters - a.supporters || a.number - b.number);

    const selectedRows = numberScores.slice(0, BET_COUNT);
    return {
        numbers: selectedRows.map(r => r.number).sort((a, b) => a - b),
        selectionScore: selectedRows.reduce((sum, r) => sum + r.prob, 0) / BET_COUNT,
        sources: methodStats.map((m, idx) => ({
            methodId: m.methodId,
            label: m.label,
            weight: Number(weights[idx].toFixed(6))
        })),
        evidence: selectedRows,
        note: `Dung hợp Bayesian Model Averaging từ ${methodStats.length} phương pháp với trọng số log-likelihood 30 kỳ.`
    };
}

function regimeSwitching(priorRuns, methodIds, selection) {
    const ordered = (priorRuns || []).filter(isSettled)
        .slice().sort((left, right) => isoDate(left.predictionDate).localeCompare(isoDate(right.predictionDate)));
    const recent14 = ordered.slice(-14);
    if (recent14.length < 7) {
        return selection?.models?.find(m => m.id === 'balanced')?.selected || null;
    }

    const balanceModel = selection?.models?.find(m => m.id === 'balanced')?.selected;
    const momentumModel = selection?.models?.find(m => m.id === 'momentum')?.selected;
    const stabilityModel = selection?.models?.find(m => m.id === 'stability')?.selected;
    const bayesGuardModel = selection?.models?.find(m => m.id === 'bayesGuard')?.selected;

    const recent7 = recent14.slice(-7);
    let hitCount7 = 0;
    if (balanceModel?.methodId) {
        hitCount7 = hitsForMethod(recent7, balanceModel.methodId);
    }
    const hitRate7 = recent7.length ? hitCount7 / recent7.length : 0;

    let selectedModel = balanceModel;
    let regimeName = 'Cân bằng ổn định';
    if (hitRate7 >= 0.5) {
        selectedModel = momentumModel || balanceModel;
        regimeName = 'Xu hướng thuận lợi (Momentum Regime)';
    } else if (hitRate7 <= 0.2) {
        selectedModel = bayesGuardModel || stabilityModel || balanceModel;
        regimeName = 'Biến động phòng thủ (Defensive Regime)';
    } else {
        selectedModel = stabilityModel || balanceModel;
        regimeName = 'Ổn định dài hạn (Steady Regime)';
    }

    if (!selectedModel) return null;
    return {
        ...selectedModel,
        regimeName,
        note: `Nhận diện trạng thái: ${regimeName} dựa trên phong độ 7-14 kỳ.`
    };
}

function kellyOptimal(priorRuns, methodIds) {
    const rows = (methodIds || []).map(methodId => {
        const samples = (priorRuns || []).filter(run => isSettled(run) && methodNumbers(run, methodId).length === BET_COUNT);
        const recent30 = samples.slice(-30);
        const wins30 = hitsForMethod(recent30, methodId);
        const posterior30 = betaPosteriorMean(wins30, recent30.length, 12, 28);
        const lower30 = wilsonLower(wins30, recent30.length);
        
        const conservativeP = 0.65 * posterior30 + 0.35 * lower30;
        const b = (PAYOUT_MULTIPLIER / BET_COUNT) - 1;
        const kellyFraction = Math.max(0, (b * conservativeP - (1 - conservativeP)) / b);

        return {
            methodId,
            label: METHOD_LABELS[methodId] || methodId,
            observations: samples.length,
            observations30: recent30.length,
            wins30,
            posterior30,
            lower30,
            conservativeP,
            kellyFraction,
            selectionScore: kellyFraction * 100
        };
    }).filter(row => row.observations >= MIN_PRIOR_DRAWS);

    return rows.sort((a, b) => b.selectionScore - a.selectionScore
        || b.lower30 - a.lower30
        || a.methodId.localeCompare(b.methodId))[0] || null;
}

function metaLearnerFusion(selection, currentRun, methodIds, priorRuns) {
    const ordered = (priorRuns || []).filter(isSettled)
        .slice().sort((left, right) => isoDate(left.predictionDate).localeCompare(isoDate(right.predictionDate)));
    const recent30 = ordered.slice(-30);
    const recent90 = ordered.slice(-90);

    const sources = (methodIds || []).map(methodId => {
        const numbers = methodNumbers(currentRun, methodId);
        if (numbers.length !== BET_COUNT) return null;
        const samples30 = recent30.filter(r => methodNumbers(r, methodId).length === BET_COUNT);
        const samples90 = recent90.filter(r => methodNumbers(r, methodId).length === BET_COUNT);
        const wins30 = hitsForMethod(samples30, methodId);
        const wins90 = hitsForMethod(samples90, methodId);

        const lower90 = wilsonLower(wins90, samples90.length);
        const posterior30 = betaPosteriorMean(wins30, samples30.length, 12, 28);
        const longestLoss = longestLossStreak(samples30, methodId);
        const lossResistance = Math.max(0, 1 - longestLoss / 10);

        const metaWeight = 0.40 * lower90 + 0.35 * posterior30 + 0.25 * lossResistance;
        return {
            methodId,
            label: METHOD_LABELS[methodId] || methodId,
            numbers,
            metaWeight: Math.max(0.01, metaWeight)
        };
    }).filter(Boolean);

    if (sources.length < 2) return null;

    const totalWeight = sources.reduce((sum, s) => sum + s.metaWeight, 0) || 1;
    const ranked = NUMBERS.map(number => {
        const supporters = sources.filter(s => s.numbers.includes(number));
        const score = supporters.reduce((sum, s) => sum + s.metaWeight / totalWeight, 0);
        return {
            number,
            score,
            supportCount: supporters.length
        };
    }).sort((a, b) => b.score - a.score || b.supportCount - a.supportCount || a.number - b.number);

    const selectedRows = ranked.slice(0, BET_COUNT);
    return {
        numbers: selectedRows.map(r => r.number).sort((a, b) => a - b),
        selectionScore: selectedRows.reduce((sum, r) => sum + r.score, 0) / BET_COUNT,
        sources: sources.map(s => ({
            methodId: s.methodId,
            label: s.label,
            weight: Number((s.metaWeight / totalWeight).toFixed(6))
        })),
        evidence: selectedRows,
        note: 'Dung hợp đa tiêu chí Meta-Learner: Cận Wilson 90%, Posterior 30 kỳ và Kháng Drawdown.'
    };
}

function buildConsensusFusion(selection, currentRun, methodIds) {
    const evidenceById = new Map((selection?.ranking || []).map(row => [row.methodId, row]));
    const sources = (methodIds || []).map(methodId => {
        const numbers = methodNumbers(currentRun, methodId);
        const evidence = evidenceById.get(methodId);
        if (numbers.length !== BET_COUNT || !evidence) return null;
        const posterior = Number(evidence.posteriorMean || 0);
        const lower = Number(evidence.wilsonLower90 || 0);
        const recent = Number(evidence.posterior30 || 0);
        return {
            methodId,
            label: METHOD_LABELS[methodId] || methodId,
            numbers,
            weight: Math.max(0.01, 0.46 * posterior + 0.34 * lower + 0.20 * recent)
        };
    }).filter(Boolean);
    if (sources.length < 2) return null;

    const totalWeight = sources.reduce((sum, source) => sum + source.weight, 0) || 1;
    const ranked = NUMBERS.map(number => {
        const supporters = sources.filter(source => source.numbers.includes(number));
        const supportWeight = supporters.reduce((sum, source) => sum + source.weight / totalWeight, 0);
        return {
            number,
            supportCount: supporters.length,
            supportWeight,
            sources: supporters.map(source => source.methodId)
        };
    }).sort((left, right) => right.supportWeight - left.supportWeight
        || right.supportCount - left.supportCount
        || left.number - right.number);
    const selectedRows = ranked.slice(0, BET_COUNT);
    return {
        numbers: selectedRows.map(row => row.number).sort((left, right) => left - right),
        selectionScore: selectedRows.reduce((sum, row) => sum + row.supportWeight, 0) / BET_COUNT,
        sources: sources.map(source => ({
            methodId: source.methodId,
            label: source.label,
            weight: Number((source.weight / totalWeight).toFixed(6))
        })),
        evidence: selectedRows.map(row => ({
            ...row,
            supportWeight: Number(row.supportWeight.toFixed(6))
        })),
        note: 'Chỉ dùng membership của dàn đã khóa và độ tin cậy tính từ các ngày trước; không dùng vị trí số trong mảng làm rank.'
    };
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
    if (modelId === 'bayesGuard') {
        const lossPenalty = Math.min(0.12, Number(row.recentLossStreak || 0) / 300);
        return 0.34 * Number(row.posteriorMean || 0)
            + 0.31 * Number(row.wilsonLower90 || 0)
            + 0.17 * Number(row.posterior30 || 0)
            + 0.12 * Number(row.weightedRate30 || 0)
            + 0.06 * Number(row.weightedRate7 || 0)
            - lossPenalty;
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
    if (policy.kind === 'consensus-fusion') {
        const fusion = buildConsensusFusion(selection, currentRun, methodIds);
        return {
            policyId: policy.id,
            methodId: fusion ? 'consensusFusion' : null,
            label: policy.label,
            selectionScore: Number(fusion?.selectionScore || 0),
            numbers: fusion?.numbers || [],
            detail: fusion,
            abstained: !fusion
        };
    }

    if (policy.kind === 'bayesian-ensemble') {
        const ensemble = bayesianEnsemble(selection, currentRun, methodIds, priorRuns);
        return {
            policyId: policy.id,
            methodId: ensemble ? 'bayesianEnsemble' : null,
            label: policy.label,
            selectionScore: Number(ensemble?.selectionScore || 0),
            numbers: ensemble?.numbers || [],
            detail: ensemble,
            abstained: !ensemble
        };
    }

    if (policy.kind === 'meta-learner-fusion') {
        const meta = metaLearnerFusion(selection, currentRun, methodIds, priorRuns);
        return {
            policyId: policy.id,
            methodId: meta ? 'metaLearnerFusion' : null,
            label: policy.label,
            selectionScore: Number(meta?.selectionScore || 0),
            numbers: meta?.numbers || [],
            detail: meta,
            abstained: !meta
        };
    }

    let selected = null;
    if (policy.kind === 'selection-model' || policy.kind === 'selection-model-gated') {
        selected = selection?.models?.find(model => model.id === policy.modelId)?.selected || null;
    } else if (policy.kind === 'short-champion') {
        selected = shortChampion(priorRuns, methodIds);
    } else if (policy.kind === 'downside-guard') {
        selected = downsideGuard(priorRuns, methodIds);
    } else if (policy.kind === 'handoff-guard') {
        selected = handoffGuard(priorRuns, methodIds, selection);
    } else if (policy.kind === 'regime-switching') {
        selected = regimeSwitching(priorRuns, methodIds, selection);
    } else if (policy.kind === 'kelly-optimal') {
        selected = kellyOptimal(priorRuns, methodIds);
    }
    const methodId = selected?.methodId || null;
    const gatePassed = policy.kind !== 'selection-model-gated' || Boolean(
        selected
        && Number(selected.observations || 0) >= 45
        && Number(selected.posterior30 || 0) >= BREAK_EVEN_HIT_RATE
        && Number(selected.weightedRate30 || 0) >= BREAK_EVEN_HIT_RATE
        && Number(selected.wilsonLower90 || 0) >= BREAK_EVEN_HIT_RATE
    );
    return {
        policyId: policy.id,
        methodId,
        label: selected?.label || (methodId ? METHOD_LABELS[methodId] || methodId : 'Chưa đủ dữ liệu'),
        selectionScore: Number(selected?.selectionScore || selected?.score || 0),
        numbers: gatePassed && methodId ? methodNumbers(currentRun, methodId) : [],
        detail: selected ? {
            ...selected,
            ...(policy.kind === 'selection-model-gated' ? {
                gatePassed,
                gate: {
                    minimumObservations: 45,
                    posterior30: BREAK_EVEN_HIT_RATE,
                    weightedRate30: BREAK_EVEN_HIT_RATE,
                    wilsonLower90: BREAK_EVEN_HIT_RATE
                }
            } : {})
        } : null,
        abstained: !gatePassed || !methodId
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
    const opportunities = new Map(RESEARCH_POLICIES.map(policy => [policy.id, 0]));
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
            opportunities.set(policy.id, (opportunities.get(policy.id) || 0) + 1);
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
            const candidateDays = opportunities.get(policy.id) || 0;
            return {
                ...policy,
                coverage: {
                    candidateDays,
                    issuedDays: rows.length,
                    abstainedDays: Math.max(0, candidateDays - rows.length),
                    coverageRate: candidateDays ? rows.length / candidateDays : 0
                },
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

// Measure whether two already-issued methods add distinct coverage.  This is
// intentionally descriptive: it does not merge dàn or select a future method
// from the outcome of the same day.  Any future policy must be trained and
// validated separately using only rows before its decision date.
function buildMethodComplementarity(history) {
    const runs = immutableHistory(history).filter(isSettled);
    const pairs = [];
    for (let leftIndex = 0; leftIndex < DAILY_METHOD_POOL.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < DAILY_METHOD_POOL.length; rightIndex += 1) {
            const leftId = DAILY_METHOD_POOL[leftIndex];
            const rightId = DAILY_METHOD_POOL[rightIndex];
            const rows = runs.map(run => {
                const actual = actualForRun(run);
                const leftNumbers = methodNumbers(run, leftId);
                const rightNumbers = methodNumbers(run, rightId);
                if (leftNumbers.length !== BET_COUNT || rightNumbers.length !== BET_COUNT || actual === null) return null;
                const leftHit = leftNumbers.includes(actual);
                const rightHit = rightNumbers.includes(actual);
                const overlap = leftNumbers.filter(number => rightNumbers.includes(number)).length;
                return {
                    date: isoDate(run.predictionDate),
                    leftHit,
                    rightHit,
                    unionHit: leftHit || rightHit,
                    overlap
                };
            }).filter(Boolean);
            if (!rows.length) continue;
            const unionWins = rows.filter(row => row.unionHit).length;
            const leftAfterRightMiss = rows.slice(1).filter((row, index) => !rows[index].rightHit);
            const rightAfterLeftMiss = rows.slice(1).filter((row, index) => !rows[index].leftHit);
            pairs.push({
                leftId,
                leftLabel: METHOD_LABELS[leftId] || leftId,
                rightId,
                rightLabel: METHOD_LABELS[rightId] || rightId,
                days: rows.length,
                bothHit: rows.filter(row => row.leftHit && row.rightHit).length,
                onlyLeft: rows.filter(row => row.leftHit && !row.rightHit).length,
                onlyRight: rows.filter(row => !row.leftHit && row.rightHit).length,
                neither: rows.filter(row => !row.leftHit && !row.rightHit).length,
                unionHitRate: unionWins / rows.length,
                unionWilsonLower: wilsonLower(unionWins, rows.length),
                averageSetOverlap: rows.reduce((sum, row) => sum + row.overlap, 0) / rows.length,
                leftAfterRightMiss: {
                    days: leftAfterRightMiss.length,
                    wins: leftAfterRightMiss.filter(row => row.leftHit).length,
                    hitRate: leftAfterRightMiss.length ? leftAfterRightMiss.filter(row => row.leftHit).length / leftAfterRightMiss.length : 0
                },
                rightAfterLeftMiss: {
                    days: rightAfterLeftMiss.length,
                    wins: rightAfterLeftMiss.filter(row => row.rightHit).length,
                    hitRate: rightAfterLeftMiss.length ? rightAfterLeftMiss.filter(row => row.rightHit).length / rightAfterLeftMiss.length : 0
                }
            });
        }
    }
    return pairs.sort((left, right) => right.unionWilsonLower - left.unionWilsonLower
        || right.unionHitRate - left.unionHitRate
        || left.leftId.localeCompare(right.leftId));
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
            abstained: Boolean(decision.abstained),
            decisionDetail: decision.detail || null,
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

// The R2 research artifact deliberately retains every weekly/monthly period
// for auditability.  The browser only needs a recent visual trace and enough
// aggregate periods to compare regimes, so never send the full multi-year
// ledger on every page load.
function compactLongHorizonResearch(report) {
    if (!report?.version || !Array.isArray(report.methods)) return null;
    const compactPeriods = (rows, limit) => Array.isArray(rows) ? rows.slice(-limit) : [];
    return {
        version: report.version,
        generatedAt: report.generatedAt || null,
        status: report.status || 'research-only',
        strictPointInTime: Boolean(report.strictPointInTime),
        source: report.source || {},
        economics: report.economics || {},
        ranges: report.ranges || {},
        recommendation: report.recommendation || {},
        methods: report.methods.map(method => ({
            id: method.id,
            label: method.label,
            description: method.description,
            status: method.status,
            promoted: Boolean(method.promoted),
            total: method.total || {},
            splits: method.splits || {},
            yearly: compactPeriods(method.yearly, 22),
            monthly: compactPeriods(method.monthly, 36),
            weekly: compactPeriods(method.weekly, 52),
            recentRows: compactPeriods(method.recentRows, 180)
        }))
    };
}

function buildAdvisorAnalysis({ advisorCache, probabilityCache, longHorizonCache, history }) {
    const advisorRecord = latestByDate(advisorCache?.records);
    const scoreRecord = latestByDate(probabilityCache?.records);
    const targetDate = advisorRecord?.predictionDate || scoreRecord?.predictionDate || null;
    const orderedHistory = mergeImmutableResearchHistory(history, advisorCache?.records);
    const matchingRun = orderedHistory.find(run => isoDate(run.predictionDate) === isoDate(targetDate)) || null;
    const currentRun = candidateMethodRun(advisorRecord, matchingRun);
    const methods = methodMatrix({ advisorRecord, currentRun, scoreRecord });
    const selected = selectedModels(advisorRecord, methods, scoreRecord);
    const scoreOverlay = buildScoreOverlay(selected, scoreRecord);
    const researchReport = buildResearchReport(orderedHistory);
    const methodComplementarity = buildMethodComplementarity(orderedHistory);
    const currentCandidates = buildCurrentCandidates({ advisorRecord, orderedHistory, matchingRun });
    const currentAdvice = buildCurrentAdvice({ currentCandidates, methods, selectedModels: selected });
    return {
        version: 'advisor-analysis-v6',
        predictionDate: targetDate,
        source: {
            advisorSnapshotDate: advisorRecord?.predictionDate || null,
            scoreSnapshotDate: scoreRecord?.predictionDate || null,
            longHorizonGeneratedAt: longHorizonCache?.generatedAt || null,
            historySnapshotDate: matchingRun?.predictionDate || null,
            strict: 'Phân tích kiểm chứng chỉ đọc snapshot immutable đã phát hành; không tái tính dàn cũ bằng dữ liệu tương lai.'
        },
        methods,
        selectedModels: selected,
        currentCandidates,
        currentAdvice,
        scoreOverlay,
        methodComplementarity,
        longHorizonResearch: compactLongHorizonResearch(longHorizonCache),
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
    buildMethodComplementarity,
    buildResearchReport,
    buildConsensusFusion,
    handoffGuard,
    summarizeDecisions,
    immutableHistory,
    mergeImmutableResearchHistory,
    compactLongHorizonResearch
};
