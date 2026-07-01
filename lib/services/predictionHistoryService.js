// lib/services/predictionHistoryService.js
const { getSupabaseAdminClient, hasSupabaseAdminConfig } = require('../supabase/client');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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

const LOCAL_HISTORY_FILE = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_prediction_history.json');
const LOCAL_SIMULATION_FILE = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_simulation_90.json');
const PREDICTION_HISTORY_METHOD_IDS = [
    'avgEdge50Hold70',
    'dedupEdge75Hold70',
    'dedupDropoffHold70',
];

function findPrimaryMethodEntry(methods = {}) {
    for (const methodId of PREDICTION_HISTORY_METHOD_IDS) {
        if (methods[methodId]) return [methodId, methods[methodId]];
    }
    return Object.entries(methods)[0] || [null, null];
}

function getR2PredictionHistoryUrl() {
    const baseUrl = String(process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL || process.env.CLOUDFLARE_R2_PUBLIC_URL || '')
        .trim()
        .replace(/\/$/, '');
    if (!baseUrl) return null;
    const prefix = String(process.env.CLOUDFLARE_R2_STATS_PREFIX || 'statistics').replace(/^\/|\/$/g, '');
    return `${baseUrl}/${prefix}/cached_prediction_history.json.gz`;
}

async function loadPredictionHistoryFromR2() {
    const url = getR2PredictionHistoryUrl();
    if (!url) return null;

    const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const compressed = Buffer.from(await response.arrayBuffer());
    const jsonText = zlib.gunzipSync(compressed).toString('utf8');
    return JSON.parse(jsonText);
}

function loadBundledPredictionHistory() {
    try {
        return require('../data/statistics/cached_prediction_history.json');
    } catch (e) {
        console.warn('[PredictionHistory] Bundled cache load failed:', e.message);
        return null;
    }
}

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

function buildMethodSummaryFromSimulation(methodObj, actualNumber = null) {
    if (!methodObj) return null;
    const excluded = toNumberArray(methodObj.excluded || methodObj.excludedNumbers || []);
    const betNumbers = toNumberArray(methodObj.betNumbers || methodObj.rawBetNumbers ||
        Array.from({ length: 100 }, (_, i) => i).filter(n => !excluded.includes(n)));
    const isResolved = actualNumber !== null && actualNumber !== undefined;
    const actualSpecial = isResolved ? Number(actualNumber) : null;
    const isSkipped = !!methodObj.skipped;

    const BET_PER_NUMBER = 1000;
    const WIN_MULTIPLIER = Number(methodObj.betWinMultiplier || methodObj.winMultiplier || 84);
    const WIN_FACTOR = Number(methodObj.betWinFactor || 1);
    const HOLD_WIN_MULTIPLIER = 0.705;
    const HOLD_LOSS_MULTIPLIER = 70;

    const betWin = isResolved && !isSkipped ? betNumbers.includes(actualSpecial) : null;
    const holdWin = isResolved && !isSkipped ? !excluded.includes(actualSpecial) : null;
    const betStake = betNumbers.length * BET_PER_NUMBER;
    const betPayout = betWin ? BET_PER_NUMBER * WIN_MULTIPLIER * WIN_FACTOR : 0;
    const betProfit = isResolved && !isSkipped ? Math.round((betPayout - betStake) * 100) / 100 : null;
    const holdIncome = excluded.length * BET_PER_NUMBER * HOLD_WIN_MULTIPLIER;
    const holdLoss = holdWin === false ? BET_PER_NUMBER * HOLD_LOSS_MULTIPLIER : 0;
    const holdProfit = isResolved && !isSkipped ? Math.round((holdIncome - holdLoss) * 100) / 100 : null;
    const profit = isResolved && !isSkipped ? Math.round(((betProfit || 0) + (holdProfit || 0)) * 100) / 100 : null;

    return {
        excludedNumbers: excluded,
        numbersToBet: betNumbers,
        explanations: (methodObj.selectedStreaks || []).map(s => ({
            title: s.title,
            reason: s.reason || s.explanation,
            numbers: s.numbers || [],
            tier: s.tier || (s.isPotential ? 'purple' : 'red'),
            subTier: s.isPotential ? 'threshold' : 'achieved'
        })),
        betCount: betNumbers.length,
        excludedCount: excluded.length,
        resolved: isResolved && !isSkipped,
        actualSpecial,
        betWin,
        holdWin,
        betProfit,
        holdProfit,
        profit,
        betWinMultiplier: WIN_MULTIPLIER,
        betWinFactor: WIN_FACTOR
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

    return {
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

    return {
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
    const betPerNumber = Number(method.betPerNumber || 1000);
    const betWinMultiplier = Number(method.betWinMultiplier || 84);
    const betWinFactor = Number(method.betWinFactor || 1);
    const holdWinMultiplier = Number(method.holdWinMultiplier || 0.705);
    const holdLossMultiplier = Number(method.holdLossMultiplier || 70);
    const betWin = numbersToBet.includes(actualSpecial);
    const holdWin = !excludedNumbers.includes(actualSpecial);
    const betProfit = Math.round((
        (betWin ? betPerNumber * betWinMultiplier * betWinFactor : 0)
        - numbersToBet.length * betPerNumber
    ) * 100) / 100;
    const holdProfit = Math.round((
        excludedNumbers.length * betPerNumber * holdWinMultiplier
        - (holdWin ? 0 : betPerNumber * holdLossMultiplier)
    ) * 100) / 100;

    return {
        ...method,
        excludedNumbers,
        numbersToBet,
        betCount: numbersToBet.length,
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

function generatedTime(run) {
    const parsed = Date.parse(run?.generatedAt || '');
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function preferEarlierSnapshot(current, candidate) {
    if (!current) return candidate;
    if (!candidate) return current;
    return generatedTime(candidate) < generatedTime(current) ? candidate : current;
}

function mergeImmutablePredictionHistory(existingHistory, generatedHistory, limit = 90) {
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
        const selected = existing
            ? settlePredictionRunSnapshot(existing, generated)
            : generated;
        merged.push(selected && {
            ...selected,
            snapshotImmutable: true,
            snapshotLockedAt: selected.snapshotLockedAt || selected.generatedAt
        });
    }

    return merged
        .filter(Boolean)
        .sort((a, b) => String(b.predictionDate).localeCompare(String(a.predictionDate)))
        .slice(0, limit);
}

async function loadExistingPredictionHistory() {
    const sources = [];
    try {
        if (fs.existsSync(LOCAL_HISTORY_FILE)) {
            const local = JSON.parse(await fs.promises.readFile(LOCAL_HISTORY_FILE, 'utf8'));
            if (Array.isArray(local)) sources.push(...local);
        }
    } catch (error) {
        console.warn(`[PredictionHistory] Không đọc được snapshot local cũ: ${error.message}`);
    }

    try {
        const remote = await loadPredictionHistoryFromR2();
        if (Array.isArray(remote)) sources.push(...remote);
    } catch (error) {
        console.warn(`[PredictionHistory] Không đọc được snapshot R2 cũ: ${error.message}`);
    }
    return sources;
}

async function generateLocalPredictionHistoryFromSimulation(limit = 90) {
    let simData = null;
    const generatedAt = new Date().toISOString();
    const existingHistory = await loadExistingPredictionHistory();

    try {
        // Prediction history must be an immutable point-in-time snapshot. The regular
        // simulation cache may use full current history for research/backtest views,
        // which leaks the resolved draw into old prediction rows after a daily update.
        const simulationService = require('./simulationService');
        simData = await simulationService.runBacktest(limit, null, {
            rollingHistory: true,
            playMode: 'both',
            methodIds: PREDICTION_HISTORY_METHOD_IDS.join(','),
            selectedStreakDetailLimit: 1000,
            compactDetails: false,
            clearHistoryCacheInterval: Number(process.env.BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL || 30)
        });
        if (!simData || simData.error) {
            throw new Error(simData ? simData.error : 'empty simulation result');
        }
    } catch (err) {
        console.warn(`[PredictionHistory] Rolling snapshot generation failed, falling back to ${LOCAL_SIMULATION_FILE}: ${err.message}`);
        if (!fs.existsSync(LOCAL_SIMULATION_FILE)) {
            console.warn(`[PredictionHistory] Local simulation cache not found at ${LOCAL_SIMULATION_FILE}.`);
            return [];
        }
        simData = JSON.parse(fs.readFileSync(LOCAL_SIMULATION_FILE, 'utf8'));
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
    await fs.promises.mkdir(path.dirname(LOCAL_HISTORY_FILE), { recursive: true });
    await fs.promises.writeFile(LOCAL_HISTORY_FILE, JSON.stringify(limited, null, 0));
    try {
        const performanceService = require('./predictionHistoryPerformanceService');
        const performanceCache = performanceService.refreshPerformanceCacheFromSnapshots(limited);
        if (performanceCache) {
            console.log(`✅ [PredictionHistory] Đã cập nhật performance cache tới ${performanceCache.period?.endDate || 'unknown'}.`);
        }
    } catch (error) {
        console.warn(`[PredictionHistory] Không cập nhật được performance cache: ${error.message}`);
    }
    console.log(`✅ [PredictionHistory] Đã merge lịch sử bất biến: ${limited.length} ngày, snapshot cũ=${existingHistory.length}, mới nhất=${limited[0]?.predictionDate || 'none'}.`);
    return limited;
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

    console.log('[PredictionHistory] Seeding prediction history from cached_simulation_90.json...');
    const simPath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_simulation_90.json');
    if (!fs.existsSync(simPath)) {
        console.warn(`[PredictionHistory] Simulation cache file not found at ${simPath}. Cannot backfill.`);
        return;
    }

    try {
        const simData = JSON.parse(fs.readFileSync(simPath, 'utf8'));
        if (!simData.details || !Array.isArray(simData.details)) {
            console.warn('[PredictionHistory] Simulation cache does not have details. Cannot backfill.');
            return;
        }

        const runsToInsert = [];
        
        for (const detail of simData.details) {
            const predDateIso = convertDateToIso(detail.predictionDate);
            const basisDateIso = convertDateToIso(detail.basisDate);
            if (!predDateIso) continue;

            const buildMethodSummaryObj = (methodObj) => {
                if (!methodObj) return null;
                const isSkipped = !!methodObj.skipped;
                const excluded = methodObj.excluded || [];
                const betNumbers = methodObj.betNumbers || [];
                const actualSpecial = isSkipped || detail.actualNumber === undefined || detail.actualNumber === null ? null : Number(detail.actualNumber);

                let betWin = null;
                let holdWin = null;
                if (actualSpecial !== null && !isSkipped) {
                    betWin = betNumbers.includes(actualSpecial);
                    holdWin = !excluded.includes(actualSpecial);
                }

                return {
                    excludedNumbers: excluded,
                    numbersToBet: betNumbers,
                    explanations: (methodObj.selectedStreaks || []).map(s => ({
                        title: s.title,
                        reason: s.reason || s.explanation,
                        numbers: s.numbers || [],
                        tier: s.tier || 'red',
                        subTier: s.isPotential ? 'threshold' : 'achieved'
                    })),
                    betCount: betNumbers.length,
                    excludedCount: excluded.length,
                    resolved: !isSkipped,
                    actualSpecial,
                    betWin,
                    holdWin,
                    betProfit: isSkipped ? 0 : (methodObj.betProfit || 0),
                    holdProfit: isSkipped ? 0 : (methodObj.holdProfit || 0),
                    profit: isSkipped ? 0 : (methodObj.profit || 0),
                    betWinMultiplier: Number(methodObj.betWinMultiplier || 84),
                    betWinFactor: Number(methodObj.betWinFactor || 1),
                    holdWinMultiplier: Number(methodObj.holdWinMultiplier || 0.705)
                };
            };

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

    // Constants from simulationService
    const BET_PER_NUMBER = 1000;
    const WIN_MULTIPLIER = 84;
    const WIN_FACTOR = 1;
    const HOLD_WIN_MULTIPLIER = 0.705;
    const HOLD_LOSS_MULTIPLIER = 70;

    // Helper to resolve a single method summary
    const resolveMethod = (methodSum) => {
        if (!methodSum || !methodSum.excludedNumbers) return null;
        const excluded = methodSum.excludedNumbers || [];
        const bet = methodSum.numbersToBet || [];
        
        const betWin = bet.includes(special2Digits);
        const holdWin = !excluded.includes(special2Digits);
        
        const betStake = bet.length * BET_PER_NUMBER;
        const betPayout = betWin ? BET_PER_NUMBER * WIN_MULTIPLIER * WIN_FACTOR : 0;
        const betProfit = betPayout - betStake;

        const holdIncome = excluded.length * BET_PER_NUMBER * HOLD_WIN_MULTIPLIER;
        const holdLoss = !holdWin ? BET_PER_NUMBER * HOLD_LOSS_MULTIPLIER : 0;
        const holdProfit = holdIncome - holdLoss;

        const profit = betProfit + holdProfit;
        
        return {
            ...methodSum,
            resolved: true,
            actualSpecial: special2Digits,
            betWin,
            holdWin,
            betProfit,
            holdProfit,
            profit,
            betWinMultiplier: WIN_MULTIPLIER,
            betWinFactor: WIN_FACTOR
        };
    };

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
            betCount: summary.betCount,
            excludedCount: summary.excludedCount
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

        const buildMethodSummaryObj = (method) => {
            const excluded = method.excluded || [];
            const allNumbers = Array.from({ length: 100 }, (_, i) => i);
            const betNumbers = allNumbers.filter(n => !excluded.includes(n));
            return {
                excludedNumbers: excluded,
                numbersToBet: betNumbers,
                explanations: (method.selectedStreaks || []).map(s => ({
                    title: s.title,
                    reason: s.reason || s.explanation,
                    numbers: s.numbers || [],
                    tier: s.tier || 'red',
                    subTier: s.isPotential ? 'threshold' : 'achieved'
                })),
                betCount: betNumbers.length,
                excludedCount: excluded.length,
                resolved: false,
                actualSpecial: null,
                betWin: null,
                holdWin: null,
                betProfit: null,
                holdProfit: null,
                profit: null,
                betWinMultiplier: Number(method.betWinMultiplier || 84),
                betWinFactor: Number(method.betWinFactor || 1),
                holdWinMultiplier: Number(method.holdWinMultiplier || 0.705)
            };
        };

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
 * Supports local cache fallback if Supabase is offline/inactive.
 */
async function getHistory(limit = 90) {
    const loadCachedHistory = async () => {
        try {
            const r2Data = await loadPredictionHistoryFromR2();
            const usable = useHistoryIfCurrentEnough(r2Data, 'R2', limit);
            if (usable) return usable;
        } catch (e) {
            console.warn('[PredictionHistory] Direct R2 cache load failed:', e.message);
        }

        const bundledData = loadBundledPredictionHistory();
        {
            const usable = useHistoryIfCurrentEnough(bundledData, 'bundled', limit);
            if (usable) return usable;
        }

        return null;
    };

    // Prediction history is regenerated with the static/R2 statistics bundle.
    // Always prefer this cache so production cannot keep serving stale Supabase rows.
    const cachedHistory = await loadCachedHistory();
    if (cachedHistory) return cachedHistory;

    try {
        if (fs.existsSync(LOCAL_HISTORY_FILE)) {
            const data = JSON.parse(fs.readFileSync(LOCAL_HISTORY_FILE, 'utf8'));
            const usable = useHistoryIfCurrentEnough(data, 'local', limit);
            if (usable) return usable;
        }
    } catch (e) {
        console.warn('[PredictionHistory] Local cache load failed:', e.message);
    }

    throw new Error('Cache cached_prediction_history.json chưa có phương pháp dự đoán được hỗ trợ. Hãy chạy action cập nhật R2.');
}

module.exports = {
    backfillHistoryIfEmpty,
    syncPredictionHistory,
    generateLocalPredictionHistoryFromSimulation,
    getHistory,
    mergeImmutablePredictionHistory,
    settlePredictionRunSnapshot
};
