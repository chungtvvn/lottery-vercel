#!/usr/bin/env node
'use strict';

const path = require('path');

function loadEnvironment(filePath) {
    try {
        if (typeof process.loadEnvFile === 'function') {
            process.loadEnvFile(filePath);
            return;
        }
        const dotenv = require('dotenv');
        dotenv.config({ path: filePath, quiet: true });
    } catch {
        // CI supplies secrets directly. Missing local env files are expected.
    }
}

loadEnvironment(path.join(__dirname, '..', '.env.local'));
loadEnvironment(path.join(__dirname, '..', '.env'));

const service = require('../lib/services/probabilityScoreService');

async function main() {
    const { getRawData, loadJsonWithSupabaseFallback } = require('../lib/data-access');
    const useLocalHistory = process.env.PROBABILITY_SCORE_USE_LOCAL_HISTORY === '1';
    let history = null;
    let existing = null;
    try {
        if (!useLocalHistory) history = await loadJsonWithSupabaseFallback('cached_prediction_history.json');
        existing = await loadJsonWithSupabaseFallback('cached_probability_score.json');
    } catch (error) {
        console.log(`[ProbabilityScore] Chưa có cache R2 cũ: ${error.message}`);
    }
    const raw = await getRawData();
    const cache = await service.generateAndWriteCache({ history: history || undefined, raw, existing, limit: 90 });
    const expectedPredictionDate = service.nextIsoDate(cache.latestDataDate);
    const pending = cache.records.find(record => record.predictionDate === expectedPredictionDate);
    if (!pending || pending.settled || pending.pointInTimeLocked !== true || pending.topNumbers?.length !== service.BET_COUNT) {
        throw new Error(`Không sinh được snapshot Probability Score bất biến cho ${expectedPredictionDate}.`);
    }
    console.log(JSON.stringify({
        file: 'lib/data/statistics/cached_probability_score.json',
        latestDataDate: cache.latestDataDate,
        predictionDate: pending.predictionDate,
        topNumbers: pending.topNumbers.map(row => row.number),
        summary: cache.summary
    }, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
