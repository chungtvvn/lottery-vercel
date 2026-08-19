#!/usr/bin/env node
'use strict';

// On-demand strict PIT report.  Keep this separate from the daily GitHub
// Action: it scans the full R2 history and is intended for research/audit.

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
const { CACHE_VERSION, buildProbabilityDistributionResearch } = require('../lib/services/probabilityDistributionResearchService');
const { generateAndWriteCache, LOCAL_CACHE_FILE } = require('../lib/services/probabilityDistributionService');

function argValue(name, fallback = null) {
    const prefix = `--${name}=`;
    const item = process.argv.slice(2).find(value => value.startsWith(prefix));
    return item ? item.slice(prefix.length) : fallback;
}

async function main() {
    const [raw, existing] = await Promise.all([
        getRawData(),
        loadJsonWithSupabaseFallback('cached_probability_distribution.json').catch(() => null)
    ]);
    const research = buildProbabilityDistributionResearch(raw, {
        developmentEnd: argValue('developmentEnd', '2021-12-31'),
        validationStart: argValue('validationStart', '2022-01-01'),
        validationEnd: argValue('validationEnd', '2024-12-31'),
        holdoutStart: argValue('holdoutStart', '2025-01-01'),
        holdoutEnd: argValue('holdoutEnd', null) || undefined,
        recentDays: Number(argValue('recentDays', '180')) || 180
    });
    const payload = await generateAndWriteCache({ raw, existing, research, write: true });
    console.log(JSON.stringify({
        file: path.relative(process.cwd(), LOCAL_CACHE_FILE),
        version: CACHE_VERSION,
        source: research.source,
        recommendation: research.recommendation,
        methods: research.methods.map(method => ({
            id: method.id,
            total: method.total,
            validation: method.splits.validation,
            holdout: method.splits.holdout
        }))
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
