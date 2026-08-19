#!/usr/bin/env node
'use strict';

// This is intentionally a separate, on-demand R2 job.  Rebuilding a
// 20-year walk-forward research report is useful for calibration, but it must
// not make the daily prediction action slow or turn a delayed report into a
// failed daily update.

const fs = require('fs');
const path = require('path');

function loadEnvironment(filePath) {
    try {
        if (typeof process.loadEnvFile === 'function') {
            process.loadEnvFile(filePath);
            return;
        }
        require('dotenv').config({ path: filePath, quiet: true });
    } catch {
        // CI supplies secrets directly; local env files are optional.
    }
}

loadEnvironment(path.join(__dirname, '..', '.env.local'));
loadEnvironment(path.join(__dirname, '..', '.env'));

const { getRawData } = require('../lib/data-access');
const {
    CACHE_VERSION,
    buildLongHorizonResearch
} = require('../lib/services/advisorLongHorizonResearchService');

const OUTPUT = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_advisor_long_horizon_research.json');

function argValue(name, fallback = null) {
    const prefix = `--${name}=`;
    const item = process.argv.slice(2).find(value => value.startsWith(prefix));
    return item ? item.slice(prefix.length) : fallback;
}

async function main() {
    const raw = await getRawData();
    const report = buildLongHorizonResearch(raw, {
        developmentEnd: argValue('developmentEnd', '2021-12-31'),
        validationStart: argValue('validationStart', '2022-01-01'),
        validationEnd: argValue('validationEnd', '2024-12-31'),
        holdoutStart: argValue('holdoutStart', '2025-01-01'),
        holdoutEnd: argValue('holdoutEnd', null) || undefined,
        recentDays: Number(argValue('recentDays', '180')) || 180
    });
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(report)}\n`);
    console.log(JSON.stringify({
        file: path.relative(process.cwd(), OUTPUT),
        version: CACHE_VERSION,
        data: report.source,
        recommendation: report.recommendation,
        methods: report.methods.map(method => ({
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
