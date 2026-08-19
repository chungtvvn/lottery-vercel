#!/usr/bin/env node
'use strict';

// Fast daily companion to the probability-score cache.  It issues one locked
// next-day snapshot using R2 raw data and deliberately does not rebuild the
// multi-year research report.

const path = require('path');

function loadEnvironment(filePath) {
    try {
        if (typeof process.loadEnvFile === 'function') {
            process.loadEnvFile(filePath);
            return;
        }
        require('dotenv').config({ path: filePath, quiet: true });
    } catch {
        // CI supplies secrets directly; local files are optional.
    }
}

loadEnvironment(path.join(__dirname, '..', '.env.local'));
loadEnvironment(path.join(__dirname, '..', '.env'));

const { getRawData, loadJsonWithSupabaseFallback } = require('../lib/data-access');
const { CACHE_VERSION, generateAndWriteCache, LOCAL_CACHE_FILE } = require('../lib/services/probabilityDistributionService');

async function main() {
    const [raw, existing] = await Promise.all([
        getRawData(),
        loadJsonWithSupabaseFallback('cached_probability_distribution.json').catch(() => null)
    ]);
    const payload = await generateAndWriteCache({ raw, existing, write: true });
    const next = payload.records.find(record => record.predictionDate > payload.latestDataDate && !record.settled);
    console.log(JSON.stringify({
        file: path.relative(process.cwd(), LOCAL_CACHE_FILE),
        version: CACHE_VERSION,
        latestDataDate: payload.latestDataDate,
        nextPredictionDate: next?.predictionDate || null,
        records: payload.records.length,
        summary: payload.summary,
        researchAttached: Boolean(payload.research)
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
