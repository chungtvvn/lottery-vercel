'use strict';

const fs = require('fs');
const path = require('path');
const { scoringForms } = require('../utils/lotteryScoring');

const NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = 30;
const LOOKBACK_DRAWS = 180;
const MIN_OBSERVATIONS = 20;
const Z_SUPPORT_REPLACEMENTS = 6;
const CACHE_VERSION = 'daily-advisor-zscore-v2';
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

function isoDate(value) {
    return String(value || '').slice(0, 10);
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
    const position = rawIndex.get(date);
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

function rankMethods(priorRuns, methodIds) {
    return methodIds.map(methodId => {
        const samples = priorRuns.filter(run => run?.summary?.methods?.[methodId] && isSettled(run));
        const recent30 = samples.slice(-30);
        const recent90 = samples.slice(-90);
        const hits = rows => rows.reduce((sum, run) => sum + Number(normalizeNumbers(run.summary.methods[methodId].numbersToBet).includes(Number(run.summary.actualSpecial))), 0);
        const count30 = hits(recent30);
        const count90 = hits(recent90);
        const total = recent90.length;
        // Beta(9, 21) pulls short windows toward the 30% baseline; target-day data never enters.
        const posteriorMean = (count90 + 9) / (total + 30);
        const posterior30 = (count30 + 9) / (recent30.length + 30);
        const lower = wilsonLower(count90, total);
        const recentRate = recent30.length ? count30 / recent30.length : 0;
        const weightedRate30 = weightedHitRate(recent30, methodId);
        return {
            methodId,
            label: METHOD_LABELS[methodId] || methodId,
            observations: total,
            wins30: count30,
            observations30: recent30.length,
            rate30: recentRate,
            wins90: count90,
            rate90: total ? count90 / total : 0,
            posteriorMean,
            posterior30,
            wilsonLower90: lower,
            weightedRate30,
            score: 0.4 * posteriorMean + 0.2 * posterior30 + 0.2 * lower + 0.2 * weightedRate30
        };
    }).sort((left, right) => right.score - left.score || right.wilsonLower90 - left.wilsonLower90 || left.methodId.localeCompare(right.methodId));
}

function selectMethod(priorRuns, methodIds) {
    const ranking = rankMethods(priorRuns, methodIds);
    const selected = ranking.find(row => row.observations >= MIN_OBSERVATIONS) || ranking[0] || null;
    const confidenceGatePassed = Boolean(
        selected
        && selected.observations >= 60
        && selected.wilsonLower90 >= BET_COUNT / 84
    );

    // The daily selector is a tracked recommendation. It must pass an
    // independent holdout before being promoted to an automatic betting rule.
    return { selected, ranking, action: 'observe', confidenceGatePassed };
}

function buildZScoreSupport(mainNumbers, zScore, replacementCount = Z_SUPPORT_REPLACEMENTS) {
    const main = normalizeNumbers(mainNumbers);
    const replaceCount = Math.min(replacementCount, main.length);
    const mainRanked = main.map(number => ({
        number,
        zScore: Number(zScore?.scores?.[number] || 0),
        percentile: Number(zScore?.percentile?.[number] || 0)
    })).sort((left, right) => right.percentile - left.percentile || right.zScore - left.zScore || left.number - right.number);
    const retained = mainRanked.slice(0, Math.max(0, main.length - replaceCount)).map(row => row.number);
    const added = NUMBERS.filter(number => !main.includes(number)).map(number => ({
        number,
        zScore: Number(zScore?.scores?.[number] || 0),
        percentile: Number(zScore?.percentile?.[number] || 0)
    })).sort((left, right) => right.percentile - left.percentile || right.zScore - left.zScore || left.number - right.number)
        .slice(0, replaceCount);
    return {
        numbers: normalizeNumbers([...retained, ...added.map(row => row.number)]),
        retained: mainRanked.slice(0, Math.max(0, main.length - replaceCount)),
        replacedOut: mainRanked.slice(Math.max(0, main.length - replaceCount)),
        replacedIn: added
    };
}

function settleSnapshot(snapshot, actual) {
    if (actual === null || actual === undefined || actual === '' || !Number.isInteger(Number(actual))) {
        return {
            ...snapshot,
            settled: false,
            actual: null,
            main: { ...snapshot.main, hit: null },
            experimental: { ...snapshot.experimental, hit: null }
        };
    }
    const actualNumber = Number(actual);
    return {
        ...snapshot,
        settled: true,
        actual: actualNumber,
        main: { ...snapshot.main, hit: snapshot.main.numbers.includes(actualNumber) },
        experimental: { ...snapshot.experimental, hit: snapshot.experimental.numbers.includes(actualNumber) }
    };
}

function buildSnapshot(run, priorRuns, rawRows, rawIndex, groupsData) {
    const methods = run.summary?.methods || {};
    const methodIds = DAILY_METHOD_POOL.filter(methodId => normalizeNumbers(methods[methodId]?.numbersToBet).length === BET_COUNT);
    const selection = selectMethod(priorRuns, methodIds);
    const selectedMethodId = selection.selected?.methodId || methodIds[0] || '';
    const zScore = buildZScore(rawRows, rawIndex, run.predictionDate, groupsData);
    const mainNumbers = normalizeNumbers(methods[selectedMethodId]?.numbersToBet);
    const experimental = buildZScoreSupport(mainNumbers, zScore);
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
            methodPool: methodIds,
            selectionRule: '40% posterior 90 ngày + 20% posterior 30 ngày + 20% Wilson 90% + 20% nhịp EWMA 30 ngày.'
        },
        main: {
            methodId: selectedMethodId,
            label: METHOD_LABELS[selectedMethodId] || selectedMethodId,
            numbers: mainNumbers,
            numberZ: mainNumbers.map(number => ({ number, zScore: Number((zScore?.scores?.[number] || 0).toFixed(3)), percentile: Number((zScore?.percentile?.[number] || 0).toFixed(3)) }))
        },
        experimental: {
            id: 'selected-method-zscore-support-v2',
            label: `Dàn chính + Z-score hỗ trợ (${BET_COUNT - Z_SUPPORT_REPLACEMENTS}+${Z_SUPPORT_REPLACEMENTS})`,
            numbers: experimental.numbers,
            retained: experimental.retained.map(row => ({ ...row, zScore: Number(row.zScore.toFixed(3)), percentile: Number(row.percentile.toFixed(3)) })),
            replacedOut: experimental.replacedOut.map(row => ({ ...row, zScore: Number(row.zScore.toFixed(3)), percentile: Number(row.percentile.toFixed(3)) })),
            replacedIn: experimental.replacedIn.map(row => ({ ...row, zScore: Number(row.zScore.toFixed(3)), percentile: Number(row.percentile.toFixed(3)) })),
            note: 'Dàn thử nghiệm giữ 24 số của phương pháp được chọn và thay 6 số có Z-score thấp nhất bằng 6 số Z-score nhóm cao nhất ngoài dàn. Chỉ dùng dữ liệu trước ngày dự đoán.'
        },
        zScore: zScore ? { lookback: zScore.lookback, topNumbers: zScore.topNumbers.map(row => ({ number: row.number, zScore: Number(row.score.toFixed(3)) })) } : null
    };
    return settleSnapshot(snapshot, run.summary?.actualSpecial);
}

function summarize(records, key) {
    const settled = records.filter(record => record.settled);
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

function mergeImmutable(existing, generated, limit = 90) {
    const byDate = new Map();
    (existing || []).forEach(record => { if (record?.predictionDate) byDate.set(record.predictionDate, record); });
    (generated || []).forEach(record => {
        if (!record?.predictionDate) return;
        const current = byDate.get(record.predictionDate);
        // Preserve issued number lists only when they were created by this
        // exact schema. Older research cache entries are rebuilt once.
        const canPreserve = current?.version === CACHE_VERSION && current?.lifecycle?.immutableNumbers;
        byDate.set(record.predictionDate, canPreserve ? settleSnapshot(current, record.actual) : record);
    });
    return [...byDate.values()].sort((left, right) => right.predictionDate.localeCompare(left.predictionDate)).slice(0, limit);
}

function generateAdvisorCache({ history = [], raw = [], existing = [], limit = 90 } = {}) {
    const runs = (history || []).filter(run => run?.predictionDate && run?.summary?.methods)
        .slice().sort((left, right) => left.predictionDate.localeCompare(right.predictionDate));
    const rawRows = readRawRows(raw);
    const rawIndex = new Map(rawRows.map((row, index) => [row.date, index]));
    const groupsData = buildUniqueGroups();
    const generated = runs.map((run, index) => buildSnapshot(run, runs.slice(0, index).filter(isSettled), rawRows, rawIndex, groupsData));
    const records = mergeImmutable(existing, generated, limit);
    return {
        version: CACHE_VERSION,
        generatedAt: new Date().toISOString(),
        latestDataDate: rawRows.at(-1)?.date || null,
        methodology: {
            description: 'Mỗi ngày chọn một trong năm dàn 30 số đã kiểm chứng từ snapshot kết toán trước ngày dự đoán; Z-score chỉ tạo một dàn hỗ trợ 24+6 để đối soát riêng.',
            lookbackDraws: LOOKBACK_DRAWS,
            forms: scoringForms.length,
            uniqueGroups: groupsData.groups.length,
            methodPool: DAILY_METHOD_POOL,
            zSupportReplacements: Z_SUPPORT_REPLACEMENTS,
            breakEvenHitRate: BET_COUNT / 84,
            warning: 'Dữ liệu lịch sử không bảo đảm lợi nhuận tương lai. Dàn thử nghiệm không thay thế dàn chính.'
        },
        summary: { main: summarize(records, 'main'), experimental: summarize(records, 'experimental') },
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
    buildUniqueGroups,
    buildZScore,
    selectMethod,
    buildZScoreSupport,
    summarize,
    generateAdvisorCache,
    generateAndWriteCache
};
