// lib/services/predictionHistoryService.js
const { getSupabaseAdminClient, hasSupabaseAdminConfig } = require('../supabase/client');
// R2-ONLY (owner decision 2026-10-27): computed prediction-history data lives
// on Cloudflare R2. Reads go through lib/r2Store.getR2Json (throws
// R2_UNAVAILABLE when missing/unreachable); writes go through writeViaTemp
// (temp file + R2 upload + temp delete; R2_WRITE_UNAVAILABLE on missing
// credentials). No bundled/local statistics file is ever used as a source.
const { getR2Json, writeViaTemp } = require('../r2Store');
function r2StatsPrefix() { return String(process.env.CLOUDFLARE_R2_STATS_PREFIX || 'statistics').replace(/^\/|\/$/g, ''); }
const crypto = require('crypto');

function computeSnapshotHash(run) {
    if (!run) return null;
    const payload = {
        predictionDate: run.predictionDate,
        sourceDrawDate: run.sourceDrawDate,
        summary: run.summary
    };
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

// Helper to format date YYYY-MM-DD
function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
}

// Convert DD/MM/YYYY to YYYY-MM-DD
function convertDateToIso(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateStr;
}

// Add days to date
function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return formatDate(d);
}

// R2 basenames (no longer disk paths).
const LOCAL_HISTORY_FILE = 'cached_prediction_history.json';
const LOCAL_SIMULATION_FILE = 'cached_simulation_90.json';
const PREDICTION_HISTORY_METHOD_IDS = [
    'chainSmallFirstHold70',
    'deParallelBlock85Small65Hold70',
    'dedupEdge50CombinedB40S05Hold70',
    'dedupEdge50CombinedB40S05Hold80',
    'dedupEdge50Hold70',
    'dedupEdge50Hold80',
    'avgEdge50Hold70',
    'dedupEdge75Hold70',
    'dedupDropoffHold70',
];
const PARALLEL_HISTORY_METHOD_ID = 'deParallelBlock85Small65Hold70';
const LEGACY_PARALLEL_FALLBACK_BETS = Array.from({ length: 35 }, (_, index) => index + 65);
const LEGACY_PARALLEL_FALLBACK_EXCLUDED = Array.from({ length: 65 }, (_, index) => index);

function findPrimaryMethodEntry(methods = {}) {
    for (const methodId of PREDICTION_HISTORY_METHOD_IDS) {
        if (methods[methodId]) return [methodId, methods[methodId]];
    }
    return Object.entries(methods)[0] || [null, null];
}

async function loadPredictionHistoryFromR2() {
    // Via the shared lib/r2Store.js (public .gz first, plain .json fallback,
    // in-memory TTL cache only). Throws R2_UNAVAILABLE when unconfigured,
    // unreachable, or the key is missing — never a local file.
    return getR2Json(LOCAL_HISTORY_FILE, r2StatsPrefix());
}

// DELETED (R2-only cutover): loadBundledPredictionHistory() read the bundled
// lib/data/statistics/cached_prediction_history.json. It is replaced by
// loadPredictionHistoryFromR2() above; getHistory() below no longer has a
// bundled/local fallback step.

function hasRequiredPredictionMethods(history, requiredMethodIds = PREDICTION_HISTORY_METHOD_IDS) {
    if (!Array.isArray(history) || history.length === 0) return false;
    return history.some(run => {
        const methods = run && run.summary && run.summary.methods;
        return methods && requiredMethodIds.some(methodId => !!methods[methodId]);
    });
}

function keepProfitableHistoryMethods(history) {
    const allowed = new Set(PREDICTION_HISTORY_METHOD_IDS);
    return (history || []).map(run => {
        const methods = run?.summary?.methods;
        if (!methods) return run;
        return {
            ...run,
            summary: {
                ...run.summary,
                methods: Object.fromEntries(
                    Object.entries(methods).filter(([methodId]) => allowed.has(methodId))
                )
            }
        };
    });
}

function useHistoryIfCurrentEnough(history, sourceLabel, limit) {
    if (!Array.isArray(history)) return null;
    if (!hasRequiredPredictionMethods(history)) {
        console.warn(`[PredictionHistory] ${sourceLabel} cache is stale: missing supported profitable snapshots. Falling back to next source.`);
        return null;
    }
    return keepProfitableHistoryMethods(history.slice(0, limit));
}

function toNumberArray(values = []) {
    return Array.from(new Set((values || [])
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 99)))
        .sort((a, b) => a - b);
}

function getTwoDigitResult(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return null;
    const parsed = Number(digits.slice(-2));
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 99 ? parsed : null;
}

function buildMethodSummaryFromSimulation(methodObj, actualNumber = null) {
    if (!methodObj) return null;
    const excluded = toNumberArray(methodObj.excluded || methodObj.excludedNumbers || []);
    const betNumbers = toNumberArray(methodObj.betNumbers || methodObj.rawBetNumbers ||
        Array.from({ length: 100 }, (_, i) => i).filter(n => !excluded.includes(n)));
    const betSet = new Set(betNumbers);
    const intersectionNumbers = toNumberArray(
        methodObj.intersectionNumbers || methodObj.rawIntersectionNumbers || []
    ).filter(number => betSet.has(number));
    const intersectionSet = new Set(intersectionNumbers);
    const isResolved = actualNumber !== null && actualNumber !== undefined;
    const actualSpecial = isResolved ? Number(actualNumber) : null;
    const isSkipped = !!methodObj.skipped;

    const BET_PER_NUMBER = Number(methodObj.betPerNumber || 1000);
    const WIN_MULTIPLIER = Number(methodObj.betWinMultiplier || methodObj.winMultiplier || 84);
    const WIN_FACTOR = Number(methodObj.betWinFactor || 1);
    const HOLD_WIN_MULTIPLIER = Number(methodObj.holdWinMultiplier || 0.705);
    const HOLD_LOSS_MULTIPLIER = Number(methodObj.holdLossMultiplier || 70);

    const betWin = isResolved && !isSkipped ? betNumbers.includes(actualSpecial) : null;
    const holdWin = isResolved && !isSkipped ? !excluded.includes(actualSpecial) : null;
    const unitCount = betNumbers.length + intersectionNumbers.length;
    const betStake = unitCount * BET_PER_NUMBER;
    const winningWeight = betWin && intersectionSet.has(actualSpecial) ? 2 : 1;
    const betPayout = betWin ? winningWeight * BET_PER_NUMBER * WIN_MULTIPLIER * WIN_FACTOR : 0;
    const betProfit = isResolved && !isSkipped ? Math.round((betPayout - betStake) * 100) / 100 : null;
    const holdIncome = excluded.length * BET_PER_NUMBER * HOLD_WIN_MULTIPLIER;
    const holdLoss = holdWin === false ? BET_PER_NUMBER * HOLD_LOSS_MULTIPLIER : 0;
    const holdProfit = isResolved && !isSkipped ? Math.round((holdIncome - holdLoss) * 100) / 100 : null;
    const profit = isResolved && !isSkipped ? Math.round(((betProfit || 0) + (holdProfit || 0)) * 100) / 100 : null;

    return {
        excludedNumbers: excluded,
        numbersToBet: betNumbers,
        intersectionNumbers,
        methodVersion: methodObj.methodVersion || null,
        explanations: (methodObj.selectedStreaks || []).map(s => ({
            title: s.title,
            reason: s.reason || s.explanation,
            numbers: s.numbers || [],
            tier: s.tier || (s.isPotential ? 'purple' : 'red'),
            subTier: s.isPotential ? 'threshold' : 'achieved'
        })),
        betCount: betNumbers.length,
        unitCount,
        excludedCount: excluded.length,
        resolved: isResolved && !isSkipped,
        actualSpecial,
        betWin,
        holdWin,
        betProfit,
        holdProfit,
        profit,
        betWinMultiplier: WIN_MULTIPLIER,
        betWinFactor: WIN_FACTOR,
        betPerNumber: BET_PER_NUMBER,
        holdWinMultiplier: HOLD_WIN_MULTIPLIER,
        holdLossMultiplier: HOLD_LOSS_MULTIPLIER
    };
}

function buildRunFromSimulationDetail(detail, generatedAt) {
    const predictionDate = detail.predictionIsoDate || convertDateToIso(detail.predictionDate);
    if (!predictionDate) return null;
    const actualSpecial = detail.actualNumber === undefined || detail.actualNumber === null
        ? null
        : Number(detail.actualNumber);
    const methodEntries = Object.entries(detail.methods || {})
        .map(([key, method]) => [key, buildMethodSummaryFromSimulation(method, actualSpecial)])
        .filter(([, value]) => value);
    const methods = Object.fromEntries(methodEntries);
    const primary = findPrimaryMethodEntry(methods)[1] || methodEntries[0]?.[1];
    if (!primary) return null;

    const run = {
        id: `local-${predictionDate}`,
        predictionDate,
        sourceDrawDate: convertDateToIso(detail.basisDate),
        strategyVersion: 'BALANCED',
        snapshotImmutable: true,
        snapshotLockedAt: generatedAt,
        summary: {
            ...primary,
            methods
        },
        generatedAt
    };
    run.snapshotHash = computeSnapshotHash(run);
    return run;
}

function buildRunFromNextPrediction(nextPrediction, generatedAt) {
    if (!nextPrediction || !nextPrediction.predictionDate) return null;
    const predictionDate = convertDateToIso(nextPrediction.predictionDate);
    const methodEntries = Object.entries(nextPrediction.methods || {})
        .map(([key, method]) => [key, buildMethodSummaryFromSimulation(method, null)])
        .filter(([, value]) => value);
    const methods = Object.fromEntries(methodEntries);
    const primary = findPrimaryMethodEntry(methods)[1] || methodEntries[0]?.[1];
    if (!predictionDate || !primary) return null;

    const run = {
        id: `local-${predictionDate}`,
        predictionDate,
        sourceDrawDate: nextPrediction.basisIsoDate || convertDateToIso(nextPrediction.basisDate),
        strategyVersion: 'BALANCED',
        snapshotImmutable: true,
        snapshotLockedAt: generatedAt,
        summary: {
            ...primary,
            methods
        },
        generatedAt
    };
    run.snapshotHash = computeSnapshotHash(run);
    return run;
}

function getRunActualSpecial(run) {
    const summary = run?.summary || {};
    const candidates = [
        summary.actualSpecial,
        ...Object.values(summary.methods || {}).map(method => method?.actualSpecial)
    ];
    for (const value of candidates) {
        if (value === null || value === undefined || value === '') continue;
        const parsed = Number(value);
        if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 99) return parsed;
    }
    return null;
}

function settleMethodSnapshot(method, actualSpecial) {
    if (!method) return null;
    const excludedNumbers = toNumberArray(method.excludedNumbers || []);
    const numbersToBet = toNumberArray(method.numbersToBet || []);
    const betSet = new Set(numbersToBet);
    const intersectionNumbers = toNumberArray(method.intersectionNumbers || [])
        .filter(number => betSet.has(number));
    const intersectionSet = new Set(intersectionNumbers);
    const betPerNumber = Number(method.betPerNumber || 1000);
    const betWinMultiplier = Number(method.betWinMultiplier || 84);
    const betWinFactor = Number(method.betWinFactor || 1);
    const holdWinMultiplier = Number(method.holdWinMultiplier || 0.705);
    const holdLossMultiplier = Number(method.holdLossMultiplier || 70);
    const betWin = numbersToBet.includes(actualSpecial);
    const holdWin = !excludedNumbers.includes(actualSpecial);
    const unitCount = numbersToBet.length + intersectionNumbers.length;
    const winningWeight = betWin && intersectionSet.has(actualSpecial) ? 2 : 1;
    const betProfit = Math.round((
        (betWin ? winningWeight * betPerNumber * betWinMultiplier * betWinFactor : 0)
        - unitCount * betPerNumber
    ) * 100) / 100;
    const holdProfit = Math.round((
        excludedNumbers.length * betPerNumber * holdWinMultiplier
        - (holdWin ? 0 : betPerNumber * holdLossMultiplier)
    ) * 100) / 100;

    return {
        ...method,
        excludedNumbers,
        numbersToBet,
        intersectionNumbers,
        betCount: numbersToBet.length,
        unitCount,
        excludedCount: excludedNumbers.length,
        resolved: true,
        actualSpecial,
        betWin,
        holdWin,
        betProfit,
        holdProfit,
        profit: Math.round((betProfit + holdProfit) * 100) / 100,
        betWinMultiplier,
        betWinFactor,
        holdWinMultiplier
    };
}

function settlePredictionRunSnapshot(snapshot, resolvedRun) {
    if (!snapshot) return resolvedRun;
    if (snapshot.summary?.resolved) return snapshot;

    const actualSpecial = getRunActualSpecial(resolvedRun);
    if (actualSpecial === null) return snapshot;

    const snapshotSummary = snapshot.summary || {};
    const methodEntries = Object.entries(snapshotSummary.methods || {})
        .map(([methodId, method]) => [methodId, settleMethodSnapshot(method, actualSpecial)])
        .filter(([, method]) => method);
    const methods = Object.fromEntries(methodEntries);
    const primary = findPrimaryMethodEntry(methods)[1]
        || settleMethodSnapshot(snapshotSummary, actualSpecial);
    if (!primary) return snapshot;

    return {
        ...snapshot,
        summary: {
            ...snapshotSummary,
            ...primary,
            methods,
            resolved: true,
            actualSpecial
        },
        settledAt: snapshot.settledAt || resolvedRun?.settledAt
            || resolvedRun?.generatedAt || new Date().toISOString()
    };
}

function arraysEqual(left = [], right = []) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isLegacyMalformedParallelMethod(method) {
    if (!method) return false;
    const numbersToBet = toNumberArray(method.numbersToBet || []);
    const excludedNumbers = toNumberArray(method.excludedNumbers || []);
    const intersectionNumbers = toNumberArray(method.intersectionNumbers || []);
    const unitCount = Number(method.unitCount ?? numbersToBet.length);

    return arraysEqual(numbersToBet, LEGACY_PARALLEL_FALLBACK_BETS)
        && arraysEqual(excludedNumbers, LEGACY_PARALLEL_FALLBACK_EXCLUDED)
        && intersectionNumbers.length === 0
        && unitCount === LEGACY_PARALLEL_FALLBACK_BETS.length;
}

function hasSameParallelSelection(left, right) {
    if (!left || !right) return false;
    return arraysEqual(
        toNumberArray(left.numbersToBet || []),
        toNumberArray(right.numbersToBet || [])
    ) && arraysEqual(
        toNumberArray(left.excludedNumbers || []),
        toNumberArray(right.excludedNumbers || [])
    ) && arraysEqual(
        toNumberArray(left.intersectionNumbers || []),
        toNumberArray(right.intersectionNumbers || [])
    );
}

function repairLegacyMalformedParallelSnapshot(snapshot, regeneratedRun) {
    return repairMissingOrMalformedMethodsInSnapshot(snapshot, regeneratedRun);
}

function repairMissingOrMalformedMethodsInSnapshot(snapshot, regeneratedRun) {
    if (!snapshot) return regeneratedRun;
    if (!regeneratedRun) return snapshot;

    const snapshotSummary = snapshot.summary || {};
    const existingMethods = snapshotSummary.methods || {};
    const genMethods = regeneratedRun.summary?.methods || {};
    const actualSpecial = getRunActualSpecial(snapshot) ?? getRunActualSpecial(regeneratedRun);

    let changed = false;
    const updatedMethods = { ...existingMethods };

    for (const methodId of PREDICTION_HISTORY_METHOD_IDS) {
        const orig = existingMethods[methodId];
        const gen = genMethods[methodId];
        if (!gen) continue;

        const isMissing = !orig;
        const isMalformedParallel = methodId === PARALLEL_HISTORY_METHOD_ID && isLegacyMalformedParallelMethod(orig);
        const isPendingParallelUpgrade = methodId === PARALLEL_HISTORY_METHOD_ID
            && snapshotSummary.resolved !== true
            && actualSpecial === null
            && !hasSameParallelSelection(orig, gen);

        if (isMissing || isMalformedParallel || isPendingParallelUpgrade) {
            const repaired = actualSpecial === null ? gen : settleMethodSnapshot(gen, actualSpecial);
            const repairReason = isMissing
                ? 'missing-method-backfilled'
                : (isMalformedParallel
                    ? 'legacy-date-less-parallel-fallback'
                    : 'pending-parallel-logic-upgrade');
            updatedMethods[methodId] = {
                ...repaired,
                snapshotRepairReason: repairReason
            };
            changed = true;
        }
    }

    if (!changed) return snapshot;

    const summaryUsesOriginalParallel = !existingMethods[PARALLEL_HISTORY_METHOD_ID] || arraysEqual(
        toNumberArray(snapshotSummary.numbersToBet || []),
        toNumberArray(existingMethods[PARALLEL_HISTORY_METHOD_ID]?.numbersToBet || [])
    );

    const primaryRepaired = summaryUsesOriginalParallel && updatedMethods[PARALLEL_HISTORY_METHOD_ID]
        ? updatedMethods[PARALLEL_HISTORY_METHOD_ID]
        : {};

    const parallelReason = updatedMethods[PARALLEL_HISTORY_METHOD_ID]?.snapshotRepairReason;

    return {
        ...snapshot,
        summary: {
            ...snapshotSummary,
            ...primaryRepaired,
            methods: updatedMethods
        },
        snapshotRepairedAt: regeneratedRun.generatedAt || new Date().toISOString(),
        parallelSnapshotRepairedAt: regeneratedRun.generatedAt || new Date().toISOString(),
        ...(parallelReason ? { parallelSnapshotRepairReason: parallelReason } : {})
    };
}

function generatedTime(run) {
    const parsed = Date.parse(run?.generatedAt || '');
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function preferEarlierSnapshot(current, candidate) {
    if (!current) return candidate;
    if (!candidate) return current;
    return generatedTime(candidate) < generatedTime(current) ? candidate : current;
}

function mergeImmutablePredictionHistory(existingHistory, generatedHistory, limit = 180) {
    const existingByDate = new Map();
    for (const run of existingHistory || []) {
        if (!run?.predictionDate || !run?.summary) continue;
        existingByDate.set(
            run.predictionDate,
            preferEarlierSnapshot(existingByDate.get(run.predictionDate), run)
        );
    }

    const generatedByDate = new Map();
    for (const run of generatedHistory || []) {
        if (!run?.predictionDate || !run?.summary) continue;
        generatedByDate.set(run.predictionDate, run);
    }

    const merged = [];
    const allDates = new Set([...existingByDate.keys(), ...generatedByDate.keys()]);
    for (const predictionDate of allDates) {
        const existing = existingByDate.get(predictionDate);
        const generated = generatedByDate.get(predictionDate);
        const repairedExisting = existing
            ? repairMissingOrMalformedMethodsInSnapshot(existing, generated)
            : null;
        const selected = repairedExisting
            ? settlePredictionRunSnapshot(repairedExisting, generated)
            : generated;
        merged.push(selected && {
            ...selected,
            snapshotImmutable: true,
            snapshotLockedAt: selected.snapshotLockedAt || selected.generatedAt,
            snapshotHash: selected.snapshotHash || computeSnapshotHash(selected)
        });
    }

    return merged
        .filter(Boolean)
        .sort((a, b) => String(b.predictionDate).localeCompare(String(a.predictionDate)))
        .slice(0, limit);
}

async function loadExistingPredictionHistory() {
    // R2-ONLY: the former local-file source is deleted. Only the R2 object
    // is read; a failure is logged with its R2_UNAVAILABLE message and
    // yields no merged rows (there is no local/bundled fallback anymore).
    const sources = [];
    try {
        const remote = await loadPredictionHistoryFromR2();
        if (Array.isArray(remote)) sources.push(...remote);
    } catch (error) {
        console.warn(`[PredictionHistory] Không đọc được snapshot R2 cũ: ${error.message}`);
    }
    return sources;
}

async function generateLocalPredictionHistoryFromSimulation(limit = 90, precomputedSimulation = null) {
    const hasHistoryMethods = precomputedSimulation
        && precomputedSimulation.config?.pointInTime?.strict === true
        && Array.isArray(precomputedSimulation.details)
        && precomputedSimulation.details.some(detail => detail?.methods?.chainSmallFirstHold70);
    let simData = hasHistoryMethods ? precomputedSimulation : null;
    const generatedAt = new Date().toISOString();
    const existingHistory = await loadExistingPredictionHistory();

    try {
        // Prediction history must be an immutable point-in-time snapshot. The regular
        // simulation cache may use full current history for research/backtest views,
        // which leaks the resolved draw into old prediction rows after a daily update.
        if (!simData) {
            const simulationService = require('./simulationService');
            simData = await simulationService.runBacktest(limit, null, {
                rollingHistory: true,
                strictPointInTime: true,
                playMode: 'both',
                methodIds: PREDICTION_HISTORY_METHOD_IDS.join(','),
                selectedStreakDetailLimit: 1000,
                compactDetails: false,
                clearHistoryCacheInterval: Number(process.env.BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL || 30)
            });
        } else {
            console.log('[PredictionHistory] Reusing the compatible 90-day simulation result generated in this action.');
        }
        if (!simData || simData.error) {
            throw new Error(simData ? simData.error : 'empty simulation result');
        }
    } catch (err) {
        // R2-ONLY: the former local simulation-cache fallback is now an R2
        // read of statistics/cached_simulation_90.json (throws
        // R2_UNAVAILABLE when missing/unreachable, in which case generation
        // returns [] as before when the local file was missing).
        console.warn(`[PredictionHistory] Rolling snapshot generation failed, falling back to R2 ${LOCAL_SIMULATION_FILE}: ${err.message}`);
        try {
            simData = await getR2Json(LOCAL_SIMULATION_FILE, r2StatsPrefix());
        } catch (r2Error) {
            console.warn(`[PredictionHistory] R2 simulation cache not found: ${r2Error.message}.`);
            return [];
        }
        if (simData.config?.pointInTime?.strict !== true) {
            throw new Error('R2 simulation cache không có strict point-in-time; bỏ qua để không tái sử dụng dữ liệu leak.');
        }
    }

    const runs = [];
    const nextRun = buildRunFromNextPrediction(simData.nextPrediction, generatedAt);
    if (nextRun) runs.push(nextRun);

    const details = Array.isArray(simData.details) ? simData.details : [];
    for (const detail of details) {
        const run = buildRunFromSimulationDetail(detail, simData.generatedAt || generatedAt);
        if (run) runs.push(run);
    }

    const limited = mergeImmutablePredictionHistory(existingHistory, runs, limit);
    // Temp-file + R2 upload + temp delete; throws R2_WRITE_UNAVAILABLE on
    // missing credentials — never a local copy as the store.
    await writeViaTemp(LOCAL_HISTORY_FILE, r2StatsPrefix(), limited);
    try {
        const fs = require('fs');
        const path = require('path');
        const localStatsFile = path.join(__dirname, '..', 'data', 'statistics', LOCAL_HISTORY_FILE);
        if (fs.existsSync(path.dirname(localStatsFile))) {
            await fs.promises.writeFile(localStatsFile, JSON.stringify(limited), 'utf8');
        }
    } catch (_) {}
    try {
        const performanceService = require('./predictionHistoryPerformanceService');
        const performanceCache = await performanceService.refreshPerformanceCacheFromSnapshotsFromR2(limited);
        if (performanceCache) {
            console.log(`✅ [PredictionHistory] Đã cập nhật performance cache tới ${performanceCache.period?.endDate || 'unknown'}.`);
        }
    } catch (error) {
        console.warn(`[PredictionHistory] Không cập nhật được performance cache: ${error.message}`);
    }
    console.log(`✅ [PredictionHistory] Đã merge lịch sử bất biến: ${limited.length} ngày, snapshot cũ=${existingHistory.length}, mới nhất=${limited[0]?.predictionDate || 'none'}.`);
    return limited;
}

async function refreshLatestPendingPredictionHistory(limit = 180) {
    const lotteryService = require('./lotteryService');
    const simulationService = require('./simulationService');
    await lotteryService.loadRawData();
    const sortedData = (lotteryService.getRawData() || [])
        .slice()
        .sort((left, right) => new Date(left.date) - new Date(right.date));
    if (sortedData.length === 0) {
        throw new Error('Không có raw data để sinh snapshot Lịch sử mới nhất.');
    }

    const generatedAt = new Date().toISOString();
    const nextPrediction = await simulationService.buildNextPrediction(sortedData, {
        strictPointInTime: true,
        playMode: 'both',
        methodIds: PREDICTION_HISTORY_METHOD_IDS,
        selectedStreakDetailLimit: 1000,
        compactDetails: false
    });
    const nextRun = buildRunFromNextPrediction(nextPrediction, generatedAt);
    if (!nextRun) {
        throw new Error('Không sinh được snapshot Lịch sử cho ngày tiếp theo.');
    }

    const existingHistory = await loadExistingPredictionHistory();
    const latestDraw = sortedData[sortedData.length - 1];
    const latestDrawDate = convertDateToIso(latestDraw.date);
    const actualSpecial = getTwoDigitResult(latestDraw.special);
    const resolvedRun = latestDrawDate && actualSpecial !== null
        && existingHistory.some(run => run?.predictionDate === latestDrawDate)
        ? {
            id: `settlement-${latestDrawDate}`,
            predictionDate: latestDrawDate,
            sourceDrawDate: addDays(latestDrawDate, -1),
            summary: { actualSpecial },
            generatedAt,
            settledAt: generatedAt
        }
        : null;
    const generatedRuns = resolvedRun ? [resolvedRun, nextRun] : [nextRun];
    const merged = mergeImmutablePredictionHistory(existingHistory, generatedRuns, limit);
    await writeViaTemp(LOCAL_HISTORY_FILE, r2StatsPrefix(), merged);
    try {
        const fs = require('fs');
        const path = require('path');
        const localStatsFile = path.join(__dirname, '..', 'data', 'statistics', LOCAL_HISTORY_FILE);
        if (fs.existsSync(path.dirname(localStatsFile))) {
            await fs.promises.writeFile(localStatsFile, JSON.stringify(merged), 'utf8');
        }
    } catch (_) {}
    try {
        const performanceService = require('./predictionHistoryPerformanceService');
        await performanceService.refreshPerformanceCacheFromSnapshotsFromR2(merged);
    } catch (error) {
        console.warn(`[PredictionHistory] Không cập nhật được performance cache incremental: ${error.message}`);
    }
    const method = merged.find(run => run.predictionDate === nextRun.predictionDate)
        ?.summary?.methods?.[PARALLEL_HISTORY_METHOD_ID];
    console.log(
        `[PredictionHistory] Đã kết toán ${resolvedRun ? latestDrawDate : 'không có snapshot chờ'}; ` +
        `refreshed pending ${nextRun.predictionDate}: ` +
        `${method?.numbersToBet?.length || 0} số, ${method?.unitCount || 0} đơn vị, ` +
        `version=${method?.methodVersion || 'missing'}.`
    );
    return merged;
}

/**
 * Backfills prediction history using precomputed 90-day simulation results
 */
async function backfillHistoryIfEmpty() {
    if (!hasSupabaseAdminConfig()) {
        console.log('[PredictionHistory] Supabase admin config missing, skipping backfill.');
        return;
    }

    const supabase = getSupabaseAdminClient();
    
    // Check if daily_prediction_runs has rows
    const { count, error: countError } = await supabase
        .from('daily_prediction_runs')
        .select('*', { count: 'exact', head: true });
        
    if (countError) {
        console.error('[PredictionHistory] Error checking run counts:', countError.message);
        return;
    }

    if (count > 5) {
        console.log(`[PredictionHistory] History already has ${count} records. Skipping backfill.`);
        return;
    }

    console.log('[PredictionHistory] Seeding prediction history from R2 cached_simulation_90.json...');
    let simData;
    try {
        simData = await getR2Json(LOCAL_SIMULATION_FILE, r2StatsPrefix());
    } catch (error) {
        console.warn(`[PredictionHistory] R2 simulation cache not found: ${error.message}. Cannot backfill.`);
        return;
    }

    try {
        if (simData.config?.pointInTime?.strict !== true) {
            console.warn('[PredictionHistory] Bỏ qua cache simulation cũ không strict point-in-time.');
            return;
        }
        if (!simData.details || !Array.isArray(simData.details)) {
            console.warn('[PredictionHistory] Simulation cache does not have details. Cannot backfill.');
            return;
        }

        const runsToInsert = [];
        
        for (const detail of simData.details) {
            const predDateIso = convertDateToIso(detail.predictionDate);
            const basisDateIso = convertDateToIso(detail.basisDate);
            if (!predDateIso) continue;

            const buildMethodSummaryObj = methodObj => buildMethodSummaryFromSimulation(
                methodObj,
                detail.actualNumber === undefined || detail.actualNumber === null
                    ? null
                    : Number(detail.actualNumber)
            );

            const methodEntries = PREDICTION_HISTORY_METHOD_IDS
                .map(methodId => [methodId, buildMethodSummaryObj(detail.methods?.[methodId])])
                .filter(([, value]) => value);
            const methods = Object.fromEntries(methodEntries);
            const primaryMethod = methodEntries.find(([methodId]) => methodId === findPrimaryMethodEntry(methods)[0])
                || methodEntries[0];
            if (!primaryMethod) continue;

            const summary = {
                ...primaryMethod[1],
                methods
            };

            runsToInsert.push({
                prediction_date: predDateIso,
                source_draw_date: basisDateIso,
                strategy_version: 'BALANCED',
                summary: summary
            });
        }

        console.log(`[PredictionHistory] Seeding ${runsToInsert.length} historical runs...`);
        
        // Upsert in batches of 50
        const batchSize = 50;
        for (let i = 0; i < runsToInsert.length; i += batchSize) {
            const batch = runsToInsert.slice(i, i + batchSize);
            const { error: upsertError } = await supabase
                .from('daily_prediction_runs')
                .upsert(batch, { onConflict: 'prediction_date' });
                
            if (upsertError) {
                console.error('[PredictionHistory] Error inserting batch:', upsertError.message);
                throw upsertError;
            }
        }
        console.log('✅ [PredictionHistory] Seeding history finished successfully.');
    } catch (err) {
        console.error('[PredictionHistory] Seeding history failed:', err.message);
    }
}

/**
 * Resolves prediction win/loss for a draw date and generates the next day's prediction.
 * @param {string} drawDate - YYYY-MM-DD
 * @param {number} specialNumber - Full special prize number (e.g. 54315)
 */
async function syncPredictionHistory(drawDate, specialNumber) {
    if (!hasSupabaseAdminConfig()) {
        console.log('[PredictionHistory] Supabase admin config missing, skipping history sync.');
        return;
    }

    const normalizedDrawDate = drawDate.substring(0, 10);
    const special2Digits = Number(specialNumber) % 100;
    const supabase = getSupabaseAdminClient();

    console.log(`[PredictionHistory] Syncing predictions for drawDate: ${normalizedDrawDate}, Đề: ${special2Digits}`);

    // Helper to resolve a single method summary
    const resolveMethod = methodSum => settleMethodSnapshot(methodSum, special2Digits);

    // --- STEP 1: RESOLVE EXISTING PREDICTION FOR TODAY ---
    const { data: run, error: findError } = await supabase
        .from('daily_prediction_runs')
        .select('*')
        .eq('prediction_date', normalizedDrawDate)
        .maybeSingle();

    if (findError) {
        console.error('[PredictionHistory] Error checking today\'s prediction run:', findError.message);
    } else if (run) {
        const summary = run.summary || {};
        const updatedSummary = { ...summary };

        // Resolve top-level (backward compatibility / riskHold60)
        const resolvedTop = resolveMethod({
            excludedNumbers: summary.excludedNumbers,
            numbersToBet: summary.numbersToBet,
            intersectionNumbers: summary.intersectionNumbers,
            betCount: summary.betCount,
            excludedCount: summary.excludedCount,
            betPerNumber: summary.betPerNumber,
            betWinMultiplier: summary.betWinMultiplier,
            betWinFactor: summary.betWinFactor,
            holdWinMultiplier: summary.holdWinMultiplier,
            holdLossMultiplier: summary.holdLossMultiplier
        });
        
        if (resolvedTop) {
            Object.assign(updatedSummary, {
                resolved: true,
                actualSpecial: special2Digits,
                betWin: resolvedTop.betWin,
                holdWin: resolvedTop.holdWin,
                betProfit: resolvedTop.betProfit,
                holdProfit: resolvedTop.holdProfit,
                profit: resolvedTop.profit
            });
        }

        // Resolve specific methods if they exist
        if (summary.methods) {
            updatedSummary.methods = {};
            for (const key in summary.methods) {
                const resolvedM = resolveMethod(summary.methods[key]);
                if (resolvedM) {
                    updatedSummary.methods[key] = resolvedM;
                }
            }
        }

        const { error: updateError } = await supabase
            .from('daily_prediction_runs')
            .update({ summary: updatedSummary })
            .eq('id', run.id);

        if (updateError) {
            console.error('[PredictionHistory] Failed to resolve prediction run:', updateError.message);
        } else {
            console.log(`✅ [PredictionHistory] Resolved prediction for ${normalizedDrawDate}: Đánh=${updatedSummary.betWin?'THẮNG':'THUA'}, Ôm=${updatedSummary.holdWin?'THẮNG':'THUA'}, Lợi nhuận=${updatedSummary.profit}K`);
        }
    } else {
        console.log(`[PredictionHistory] No prediction record found for prediction_date = ${normalizedDrawDate}.`);
    }

    // --- STEP 2: GENERATE PREDICTION FOR TOMORROW ---
    const tomorrowDate = addDays(normalizedDrawDate, 1);
    console.log(`[PredictionHistory] Generating predictions for tomorrow: ${tomorrowDate}...`);

    try {
        const originalStatsSource = process.env.LOTTERY_STATS_SOURCE;
        const originalDataSource = process.env.LOTTERY_DATA_SOURCE;
        process.env.LOTTERY_STATS_SOURCE = originalStatsSource || 'auto';
        process.env.LOTTERY_DATA_SOURCE = originalDataSource || 'auto';

        const { getRawData, loadAll } = require('./lotteryService');
        let rawData = getRawData();
        if (!rawData || rawData.length === 0) {
            await loadAll();
            rawData = getRawData();
        }

        if (originalStatsSource) {
            process.env.LOTTERY_STATS_SOURCE = originalStatsSource;
        } else {
            delete process.env.LOTTERY_STATS_SOURCE;
        }
        if (originalDataSource) {
            process.env.LOTTERY_DATA_SOURCE = originalDataSource;
        } else {
            delete process.env.LOTTERY_DATA_SOURCE;
        }

        const { buildNextPrediction } = require('./simulationService');
        const nextPred = await buildNextPrediction(rawData, {
            playMode: 'both',
            methodIds: PREDICTION_HISTORY_METHOD_IDS.join(','),
            selectedStreakDetailLimit: 1000
        });

        if (!nextPred || !nextPred.methods || !PREDICTION_HISTORY_METHOD_IDS.some(methodId => nextPred.methods[methodId])) {
            throw new Error('Failed to generate prediction history methods');
        }

        const buildMethodSummaryObj = method => buildMethodSummaryFromSimulation(method, null);

        const primaryMethodId = findPrimaryMethodEntry(nextPred.methods)[0];
        const tomorrowSummary = buildMethodSummaryObj(nextPred.methods[primaryMethodId]);
        tomorrowSummary.methods = {};
        for (const methodId of PREDICTION_HISTORY_METHOD_IDS) {
            if (nextPred.methods[methodId]) {
                tomorrowSummary.methods[methodId] = buildMethodSummaryObj(nextPred.methods[methodId]);
            }
        }

        const { data: existingTomorrow, error: existingTomorrowError } = await supabase
            .from('daily_prediction_runs')
            .select('id')
            .eq('prediction_date', tomorrowDate)
            .maybeSingle();
        if (existingTomorrowError) throw existingTomorrowError;

        if (existingTomorrow) {
            console.log(`[PredictionHistory] Giữ nguyên snapshot đã phát hành cho ${tomorrowDate}.`);
            return;
        }

        const { error: insertError } = await supabase
            .from('daily_prediction_runs')
            .insert({
                prediction_date: tomorrowDate,
                source_draw_date: normalizedDrawDate,
                strategy_version: 'BALANCED',
                summary: tomorrowSummary
            });

        if (insertError) {
            console.error('[PredictionHistory] Failed to save tomorrow\'s prediction:', insertError.message);
        } else {
            console.log(`✅ [PredictionHistory] Generated and saved tomorrow's prediction for ${tomorrowDate} with both methods.`);
        }
    } catch (sugErr) {
        console.error('[PredictionHistory] Failed to calculate suggestions for tomorrow:', sugErr.message);
    }
}

/**
 * Returns historical prediction runs sorted by date descending.
 * R2-ONLY: the cache source is statistics/cached_prediction_history.json
 * on R2; there is no local/bundled fallback.
 */
async function getHistory(limit = 180) {
    const loadCachedHistory = async () => {
        try {
            const r2Data = await loadPredictionHistoryFromR2();
            const usable = useHistoryIfCurrentEnough(r2Data, 'R2', limit);
            if (usable) return usable;
        } catch (e) {
            console.warn('[PredictionHistory] Direct R2 cache load failed:', e.message);
        }
        return null;
    };

    const cachedHistory = await loadCachedHistory();
    if (cachedHistory) return cachedHistory;

    throw new Error('Cache cached_prediction_history.json chưa có phương pháp dự đoán được hỗ trợ. Hãy chạy action cập nhật R2.');
}

module.exports = {
    backfillHistoryIfEmpty,
    computeSnapshotHash,
    syncPredictionHistory,
    generateLocalPredictionHistoryFromSimulation,
    getHistory,
    mergeImmutablePredictionHistory,
    refreshLatestPendingPredictionHistory,
    settlePredictionRunSnapshot
};
