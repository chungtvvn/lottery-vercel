'use strict';

const { METHOD_LABELS, DAILY_METHOD_POOL, SELECTION_MODELS } = require('./dailyMethodAdvisorService');

const NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = 30;

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

function methodNumbers(run, methodId) {
    return normalizeNumbers(run?.summary?.methods?.[methodId]?.numbersToBet);
}

function scoreRows(snapshot) {
    return (snapshot?.rankedNumbers || []).map(row => ({
        number: Number(row.number),
        score: Number(row.score || 0),
        rank: Number(row.rank || 101),
        band: row.band || 'D',
        components: row.components || {}
    })).filter(row => Number.isInteger(row.number));
}

function methodMatrix({ advisorRecord, historyRun, scoreRecord }) {
    const ranking = advisorRecord?.recommendation?.ranking || [];
    const scoreByNumber = new Map(scoreRows(scoreRecord).map(row => [row.number, row]));
    const scoreTop = new Set(scoreRows(scoreRecord).filter(row => row.rank <= BET_COUNT).map(row => row.number));
    return ranking.map((rank, index) => {
        const numbers = methodNumbers(historyRun, rank.methodId);
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
    // Older immutable snapshots predate the three-model schema. Their ranking
    // was already published, so derive only explanatory alternatives from that
    // ranking rather than recalculating any historical dàn.
    return SELECTION_MODELS.map(model => {
        const selected = ranking.slice().map(row => ({ ...row, selectionScore: fallbackSelectionScore(row, model.id) }))
            .sort((left, right) => right.selectionScore - left.selectionScore || left.methodId.localeCompare(right.methodId))[0] || null;
        return { ...model, selected };
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

function buildExperimentalFusion(selected, scoreRecord) {
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
        label: 'Đồng thuận mô hình + Điểm xác suất',
        note: 'Dàn nghiên cứu: 70% số phiếu có trọng số từ ba mô hình chọn phương pháp và 30% điểm xác suất. Chưa phải dàn production, không được dùng để thay thế snapshot đã phát hành.',
        numbers: ranked.slice(0, BET_COUNT).map(row => row.number).sort((left, right) => left - right),
        ranked: ranked.slice(0, BET_COUNT)
    };
}

function explainSelection(selected, fusion, scoreRecord) {
    const current = selected.find(model => model.id === 'balanced') || selected[0];
    const topScoreNumbers = scoreRows(scoreRecord).filter(row => row.rank <= 10).map(row => row.number);
    const shared = fusion.ranked.filter(row => row.methodVotes >= 2).map(row => row.number);
    return {
        current: current ? `Dàn chính theo mô hình ${current.label}: ${current.selectedLabel}.` : 'Chưa đủ dữ liệu để chọn phương pháp.',
        shortTerm: 'Xu hướng ngắn dùng posterior 7/30 ngày và EWMA 7 ngày, nhưng không tự quyết định nếu cận Wilson 90 ngày chưa đủ mạnh.',
        longTerm: 'Xu hướng dài dùng posterior 90 ngày, EWMA 21 ngày và Wilson lower bound để giảm ảnh hưởng của các chuỗi trúng ngắn.',
        scoring: `Điểm xác suất đang dùng snapshot ${scoreRecord?.predictionDate || '-'}; ${topScoreNumbers.length} số thuộc nhóm điểm A, ${shared.length} số nhận đồng thuận từ ít nhất hai mô hình.`,
        caution: 'Các tín hiệu chỉ là xếp hạng tương đối. Không có mô hình nào biến kết quả xổ số thành xác suất chắc chắn hoặc đảm bảo lợi nhuận.'
    };
}

function buildAdvisorAnalysis({ advisorCache, probabilityCache, history }) {
    const advisorRecord = latestByDate(advisorCache?.records);
    const scoreRecord = latestByDate(probabilityCache?.records);
    const targetDate = advisorRecord?.predictionDate || scoreRecord?.predictionDate || null;
    const historyRun = historyArray(history).find(run => isoDate(run?.predictionDate) === targetDate)
        || latestByDate(historyArray(history));
    const methods = methodMatrix({ advisorRecord, historyRun, scoreRecord });
    const selected = selectedModels(advisorRecord, methods, scoreRecord);
    const fusion = buildExperimentalFusion(selected, scoreRecord);
    return {
        version: 'advisor-analysis-v1',
        predictionDate: targetDate,
        source: {
            advisorSnapshotDate: advisorRecord?.predictionDate || null,
            scoreSnapshotDate: scoreRecord?.predictionDate || null,
            historySnapshotDate: historyRun?.predictionDate || null,
            strict: 'Phân tích chỉ đọc snapshot đã phát hành; không tái tính dàn cũ bằng dữ liệu tương lai.'
        },
        methods,
        selectedModels: selected,
        fusion,
        explanation: explainSelection(selected, fusion, scoreRecord),
        warnings: {
            scoreDateMismatch: Boolean(scoreRecord?.predictionDate && targetDate && scoreRecord.predictionDate !== targetDate),
            missingMethodNumbers: methods.filter(method => method.betCount === 0).map(method => method.methodId),
            isExperimental: true
        },
        availableMethodPool: DAILY_METHOD_POOL
    };
}

module.exports = { buildAdvisorAnalysis };
