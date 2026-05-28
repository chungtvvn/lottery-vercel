// lib/services/predictionHistoryService.js
const { getSupabaseAdminClient, hasSupabaseAdminConfig } = require('../supabase/client');
const fs = require('fs');
const path = require('path');

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

            // default to riskHold60 method
            const method = detail.methods?.riskHold60;
            if (!method) continue;

            const isSkipped = !!method.skipped;
            const excluded = method.excluded || [];
            const betNumbers = method.betNumbers || [];
            const actualSpecial = isSkipped || detail.specialNumber === undefined ? null : Number(detail.specialNumber) % 100;

            let betWin = null;
            let holdWin = null;
            if (actualSpecial !== null && !isSkipped) {
                betWin = betNumbers.includes(actualSpecial);
                holdWin = !excluded.includes(actualSpecial);
            }

            const summary = {
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
                resolved: !isSkipped,
                actualSpecial,
                betWin,
                holdWin,
                betProfit: isSkipped ? 0 : (method.betProfit || 0),
                holdProfit: isSkipped ? 0 : (method.holdProfit || 0),
                profit: isSkipped ? 0 : (method.profit || 0)
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
        const excludedNumbers = summary.excludedNumbers || [];
        const numbersToBet = summary.numbersToBet || [];

        const betWin = numbersToBet.includes(special2Digits);
        const holdWin = !excludedNumbers.includes(special2Digits);

        // Constants from simulationService
        const BET_PER_NUMBER = 10;
        const WIN_MULTIPLIER = 70;
        const BET_COST_MULTIPLIER = 0.8;
        const HOLD_WIN_MULTIPLIER = 0.705;
        const HOLD_LOSS_MULTIPLIER = 70;

        const betStake = numbersToBet.length * BET_PER_NUMBER * BET_COST_MULTIPLIER;
        const betPayout = betWin ? BET_PER_NUMBER * WIN_MULTIPLIER : 0;
        const betProfit = betPayout - betStake;

        const holdIncome = excludedNumbers.length * BET_PER_NUMBER * HOLD_WIN_MULTIPLIER;
        const holdLoss = !holdWin ? BET_PER_NUMBER * HOLD_LOSS_MULTIPLIER : 0;
        const holdProfit = holdIncome - holdLoss;

        const profit = betProfit + holdProfit;

        const updatedSummary = {
            ...summary,
            resolved: true,
            actualSpecial: special2Digits,
            betWin,
            holdWin,
            betProfit,
            holdProfit,
            profit
        };

        const { error: updateError } = await supabase
            .from('daily_prediction_runs')
            .update({ summary: updatedSummary })
            .eq('id', run.id);

        if (updateError) {
            console.error('[PredictionHistory] Failed to resolve prediction run:', updateError.message);
        } else {
            console.log(`✅ [PredictionHistory] Resolved prediction for ${normalizedDrawDate}: Đánh=${betWin?'THẮNG':'THUA'}, Ôm=${holdWin?'THẮNG':'THUA'}, Lợi nhuận=${profit}K`);
        }
    } else {
        console.log(`[PredictionHistory] No prediction record found for prediction_date = ${normalizedDrawDate}.`);
    }

    // --- STEP 2: GENERATE PREDICTION FOR TOMORROW ---
    const tomorrowDate = addDays(normalizedDrawDate, 1);
    console.log(`[PredictionHistory] Generating predictions for tomorrow: ${tomorrowDate}...`);

    try {
        const { computeSuggestions } = require('../controllers/suggestionsController');
        const suggestions = await computeSuggestions({ gapStrategy: 'COMBINED', gapBuffer: 0 });

        const tomorrowSummary = {
            excludedNumbers: suggestions.excludedNumbers || [],
            numbersToBet: suggestions.numbersToBet || [],
            explanations: (suggestions.explanations || []).map(exp => ({
                title: exp.title,
                reason: exp.reason || exp.explanation,
                numbers: exp.numbers || [],
                tier: exp.tier || 'red',
                subTier: exp.subTier || 'achieved'
            })),
            betCount: suggestions.numbersToBet ? suggestions.numbersToBet.length : 0,
            excludedCount: suggestions.excludedNumbers ? suggestions.excludedNumbers.length : 0,
            resolved: false,
            actualSpecial: null,
            betWin: null,
            holdWin: null,
            betProfit: null,
            holdProfit: null,
            profit: null
        };

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
            console.log(`✅ [PredictionHistory] Generated and saved tomorrow's prediction for ${tomorrowDate} (Loại ${tomorrowSummary.excludedCount} số, Đánh ${tomorrowSummary.betCount} số)`);
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

    // Local file fallback
    const localFile = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_prediction_history.json');
    if (fs.existsSync(localFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(localFile, 'utf8'));
            return data.slice(0, limit);
        } catch (e) {
            return [];
        }
    }
    return [];
}

module.exports = {
    backfillHistoryIfEmpty,
    syncPredictionHistory,
    getHistory
};
