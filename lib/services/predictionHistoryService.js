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

    const response = await fetch(url, { cache: 'no-store' });
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
    const WIN_MULTIPLIER = 70;
    const BET_COST_MULTIPLIER = Number(methodObj.betCostMultiplier || 0.8);
    const HOLD_WIN_MULTIPLIER = 0.705;
    const HOLD_LOSS_MULTIPLIER = 70;

    const betWin = isResolved && !isSkipped ? betNumbers.includes(actualSpecial) : null;
    const holdWin = isResolved && !isSkipped ? !excluded.includes(actualSpecial) : null;
    const betStake = betNumbers.length * BET_PER_NUMBER * BET_COST_MULTIPLIER;
    const betPayout = betWin ? BET_PER_NUMBER * WIN_MULTIPLIER : 0;
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
        profit
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
    const primary = methods.riskHold70 || methodEntries[0]?.[1];
    if (!primary) return null;

    return {
        id: `local-${predictionDate}`,
        predictionDate,
        sourceDrawDate: convertDateToIso(detail.basisDate),
        strategyVersion: 'BALANCED',
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
    const primary = methods.riskHold70 || methodEntries[0]?.[1];
    if (!predictionDate || !primary) return null;

    return {
        id: `local-${predictionDate}`,
        predictionDate,
        sourceDrawDate: nextPrediction.basisIsoDate || convertDateToIso(nextPrediction.basisDate),
        strategyVersion: 'BALANCED',
        summary: {
            ...primary,
            methods
        },
        generatedAt
    };
}

async function generateLocalPredictionHistoryFromSimulation(limit = 90) {
    if (!fs.existsSync(LOCAL_SIMULATION_FILE)) {
        console.warn(`[PredictionHistory] Local simulation cache not found at ${LOCAL_SIMULATION_FILE}.`);
        return [];
    }

    const simData = JSON.parse(fs.readFileSync(LOCAL_SIMULATION_FILE, 'utf8'));
    const generatedAt = new Date().toISOString();
    const runs = [];
    const nextRun = buildRunFromNextPrediction(simData.nextPrediction, generatedAt);
    if (nextRun) runs.push(nextRun);

    const details = Array.isArray(simData.details) ? simData.details : [];
    for (const detail of details) {
        const run = buildRunFromSimulationDetail(detail, simData.generatedAt || generatedAt);
        if (run) runs.push(run);
    }

    const deduped = [];
    const seenDates = new Set();
    runs
        .sort((a, b) => String(b.predictionDate).localeCompare(String(a.predictionDate)))
        .forEach(run => {
            if (seenDates.has(run.predictionDate)) return;
            seenDates.add(run.predictionDate);
            deduped.push(run);
        });

    const limited = deduped.slice(0, limit);
    await fs.promises.mkdir(path.dirname(LOCAL_HISTORY_FILE), { recursive: true });
    await fs.promises.writeFile(LOCAL_HISTORY_FILE, JSON.stringify(limited, null, 0));
    console.log(`✅ [PredictionHistory] Đã tạo local prediction history: ${limited.length} ngày, mới nhất=${limited[0]?.predictionDate || 'none'}.`);
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
                    profit: isSkipped ? 0 : (methodObj.profit || 0)
                };
            };

            const riskHold70Sum = buildMethodSummaryObj(detail.methods?.riskHold70);
            const riskHold80Sum = buildMethodSummaryObj(detail.methods?.riskHold80);
            const riskHold60Sum = buildMethodSummaryObj(detail.methods?.riskHold60);
            if (!riskHold70Sum) continue;

            const summary = {
                ...riskHold70Sum,
                methods: {
                    riskHold70: riskHold70Sum,
                    riskHold80: riskHold80Sum,
                    riskHold60: riskHold60Sum
                }
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
    const WIN_MULTIPLIER = 70;
    const BET_COST_MULTIPLIER = 0.8;
    const HOLD_WIN_MULTIPLIER = 0.705;
    const HOLD_LOSS_MULTIPLIER = 70;

    // Helper to resolve a single method summary
    const resolveMethod = (methodSum) => {
        if (!methodSum || !methodSum.excludedNumbers) return null;
        const excluded = methodSum.excludedNumbers || [];
        const bet = methodSum.numbersToBet || [];
        
        const betWin = bet.includes(special2Digits);
        const holdWin = !excluded.includes(special2Digits);
        
        const betStake = bet.length * BET_PER_NUMBER * BET_COST_MULTIPLIER;
        const betPayout = betWin ? BET_PER_NUMBER * WIN_MULTIPLIER : 0;
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
            profit
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
        const nextPred = await buildNextPrediction(rawData, { playMode: 'both' });

        if (!nextPred || !nextPred.methods?.riskHold70) {
            throw new Error('Failed to generate riskHold70 prediction');
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
                profit: null
            };
        };

        const tomorrowSummary = buildMethodSummaryObj(nextPred.methods.riskHold70);
        
        tomorrowSummary.methods = {
            riskHold70: buildMethodSummaryObj(nextPred.methods.riskHold70)
        };
        
        if (nextPred.methods.riskHold80) {
            tomorrowSummary.methods.riskHold80 = buildMethodSummaryObj(nextPred.methods.riskHold80);
        }

        if (nextPred.methods.riskHold60) {
            tomorrowSummary.methods.riskHold60 = buildMethodSummaryObj(nextPred.methods.riskHold60);
        }

        const { error: insertError } = await supabase
            .from('daily_prediction_runs')
            .upsert({
                prediction_date: tomorrowDate,
                source_draw_date: normalizedDrawDate,
                strategy_version: 'BALANCED',
                summary: tomorrowSummary
            }, { onConflict: 'prediction_date' });

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
            if (Array.isArray(r2Data)) return r2Data.slice(0, limit);
        } catch (e) {
            console.warn('[PredictionHistory] Direct R2 cache load failed:', e.message);
        }

        const bundledData = loadBundledPredictionHistory();
        if (Array.isArray(bundledData)) return bundledData.slice(0, limit);

        try {
            const { loadJsonWithSupabaseFallback } = require('../data-access');
            const data = await loadJsonWithSupabaseFallback('cached_prediction_history.json');
            if (Array.isArray(data)) return data.slice(0, limit);
        } catch (e) {
            console.warn('[PredictionHistory] R2/local cache load failed:', e.message);
        }
        return null;
    };

    // Prediction history is regenerated with the static/R2 statistics bundle.
    // Always prefer this cache so production cannot keep serving stale Supabase rows.
    const cachedHistory = await loadCachedHistory();
    if (cachedHistory) return cachedHistory;

    if (hasSupabaseAdminConfig()) {
        const supabase = getSupabaseAdminClient();
        const { data, error } = await supabase
            .from('daily_prediction_runs')
            .select('*')
            .order('prediction_date', { ascending: false })
            .limit(limit);

        if (!error && data) {
            return data.map(r => ({
                id: r.id,
                predictionDate: r.prediction_date,
                sourceDrawDate: r.source_draw_date,
                strategyVersion: r.strategy_version,
                summary: r.summary,
                generatedAt: r.generated_at
            }));
        }
        console.warn('[PredictionHistory] DB query failed, fallback to local caching:', error?.message);
    }

    if (!fs.existsSync(LOCAL_HISTORY_FILE) && fs.existsSync(LOCAL_SIMULATION_FILE)) {
        await generateLocalPredictionHistoryFromSimulation(limit);
    }

    try {
        if (fs.existsSync(LOCAL_HISTORY_FILE)) {
            const data = JSON.parse(fs.readFileSync(LOCAL_HISTORY_FILE, 'utf8'));
            return Array.isArray(data) ? data.slice(0, limit) : [];
        }
    } catch (e) {
        return [];
    }

    return [];
}

module.exports = {
    backfillHistoryIfEmpty,
    syncPredictionHistory,
    generateLocalPredictionHistoryFromSimulation,
    getHistory
};
