require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const annualMilestoneService = require('../lib/services/annualMilestoneService');

function hasFlag(name) {
    return process.argv.includes(name);
}

async function main() {
    if (!process.env.LOTTERY_DATA_SOURCE) process.env.LOTTERY_DATA_SOURCE = 'local';
    if (!process.env.LOTTERY_STATS_SOURCE) process.env.LOTTERY_STATS_SOURCE = 'local';

    const dryRun = hasFlag('--dryRun') || hasFlag('--dry-run');
    const result = await annualMilestoneService.generateAndSaveCaches({ write: !dryRun });
    const prediction = result.prediction || {};
    const live = result.live || {};
    const next = prediction.nextPrediction || {};

    console.log(JSON.stringify({
        ok: true,
        dryRun,
        generatedAt: prediction.generatedAt,
        latestDataDate: prediction.latestDataDate,
        predictionIsoDate: next.predictionIsoDate,
        candidates: next.summary?.candidatesCount || 0,
        strategies: Object.keys(next.strategies || {}),
        liveRows: Array.isArray(live.predictions) ? live.predictions.length : 0,
        liveSummary: live.summary || {}
    }, null, 2));
}

main().catch(error => {
    console.error('[Milestone20Y] Lỗi sinh cache:', error.stack || error.message);
    process.exit(1);
});
