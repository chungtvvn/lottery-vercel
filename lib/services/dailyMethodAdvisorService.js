'use strict';

const fs = require('fs');
const path = require('path');
const { scoringForms } = require('../utils/lotteryScoring');

const NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const BET_COUNT = 30;
const LOOKBACK_DRAWS = 180;
const MIN_OBSERVATIONS = 20;
const FUSION_METHOD_COUNT = 3;
const CACHE_VERSION = 'daily-advisor-adaptive-v4';
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

function betaPosteriorMean(wins, total, priorWins, priorLosses) {
    return (wins + priorWins) / Math.max(1, total + priorWins + priorLosses);
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
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
            trend,
            stableScore,
            score: stableScore + trend
        };
    }).sort((left, right) => right.score - left.score || right.wilsonLower90 - left.wilsonLower90 || left.methodId.localeCompare(right.methodId));
}

function selectMethod(priorRuns, methodIds) {
    const ranking = rankMethods(priorRuns, methodIds);
    const selected = ranking.find(row => row.observations >= MIN_OBSERVATIONS) || ranking[0] || null;
    const confidenceGatePassed = Boolean(
        selected
        && selected.observations >= 45
        && selected.wilsonLower90 >= BET_COUNT / 84
        && selected.posterior30 >= BET_COUNT / 84
    );

    // The daily selector is a tracked recommendation. It must pass an
    // independent holdout before being promoted to an automatic betting rule.
    return { selected, ranking, action: confidenceGatePassed ? 'consider' : 'observe', confidenceGatePassed };
}

function buildAdaptiveFusion(methods, ranking, zScore) {
    const leaders = (ranking || []).slice(0, FUSION_METHOD_COUNT)
        .filter(row => normalizeNumbers(methods?.[row.methodId]?.numbersToBet).length === BET_COUNT);
    const scoreByNumber = Array(100).fill(0);
    const sourcesByNumber = Array.from({ length: 100 }, () => []);
    const topScore = Math.max(...leaders.map(row => row.score), 0.01);
    leaders.forEach((leader, methodRank) => {
        const methodWeight = (leader.score / topScore) * (1 - methodRank * 0.12);
        normalizeNumbers(methods[leader.methodId]?.numbersToBet).forEach((number, numberRank) => {
            scoreByNumber[number] += methodWeight * (1 - numberRank / BET_COUNT);
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
            methodPool: methodIds,
            selectionRule: '24% posterior 90d + 20% posterior 30d + 12% posterior 7d + 22% Wilson 90d + 15% EWMA 21d + 7% EWMA 7d; thêm xu hướng 7/30 so với 90 ngày, giới hạn ±10 điểm %.'
        },
        main: {
            methodId: selectedMethodId,
            label: METHOD_LABELS[selectedMethodId] || selectedMethodId,
            numbers: mainNumbers,
            numberZ: mainNumbers.map(number => ({ number, zScore: Number((zScore?.scores?.[number] || 0).toFixed(3)), percentile: Number((zScore?.percentile?.[number] || 0).toFixed(3)) }))
        },
        hybrid: {
            id: 'adaptive-method-consensus-zscore-v4',
            label: `Kết hợp thích nghi ${hybrid.leaders.map(row => row.label).join(' + ')} + Z-score`,
            numbers: hybrid.numbers,
            leaders: hybrid.leaders,
            evidence: hybrid.evidence,
            replacedOut: hybrid.removedFromMain.map(number => ({ number })),
            replacedIn: hybrid.addedFromConsensus.map(number => ({ number })),
            note: 'Dàn kết hợp xếp hạng số theo đồng thuận có trọng số của ba phương pháp tốt nhất, sau đó dùng Z-score nhóm làm tín hiệu phụ. Mọi dữ liệu đều dừng trước ngày dự đoán.'
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
            byDate.set(record.predictionDate, canIssueHybridNow
                ? { ...preserved, version: CACHE_VERSION, hybrid: record.hybrid }
                : preserved);
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
    return {
        version: CACHE_VERSION,
        generatedAt: new Date().toISOString(),
        latestDataDate: rawRows.at(-1)?.date || null,
        methodology: {
            description: 'Mỗi ngày chọn một trong năm dàn 30 số bằng bộ học walk-forward: kết hợp hiệu suất 7/30/90 ngày, EWMA, cận dưới Wilson và xu hướng đã bị giới hạn để tránh chạy theo chuỗi ngắn. Dàn kết hợp xếp hạng đồng thuận có trọng số của ba phương pháp dẫn đầu, dùng Z-score nhóm làm tín hiệu phụ. Nhật ký chỉ giữ snapshot đã phát hành trước kỳ quay.',
            lookbackDraws: LOOKBACK_DRAWS,
            forms: scoringForms.length,
            uniqueGroups: groupsData.groups.length,
            methodPool: DAILY_METHOD_POOL,
            fusionMethodCount: FUSION_METHOD_COUNT,
            breakEvenHitRate: BET_COUNT / 84,
            warning: 'Dữ liệu lịch sử không bảo đảm lợi nhuận tương lai. Dàn thử nghiệm không thay thế dàn chính.'
        },
        summary: { main: summarize(records, 'main'), hybrid: summarize(records, 'hybrid') },
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
    buildZScoreHybrid,
    buildZScoreSupport,
    summarize,
    generateAdvisorCache,
    generateAndWriteCache,
    reconstructMissingSnapshots
};
