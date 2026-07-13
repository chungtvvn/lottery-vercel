#!/usr/bin/env node
const assert = require('assert');

const lotteryService = require('../lib/services/lotteryService');
const simulationService = require('../lib/services/simulationService');
const annualMilestoneService = require('../lib/services/annualMilestoneService');

function fixtureRows(count = 36) {
    const start = new Date('2026-01-01T00:00:00');
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return {
            date: date.toISOString().slice(0, 10),
            special: (index * 7 + 3) % 100
        };
    });
}

async function main() {
    const rows = fixtureRows();
    lotteryService.__setInMemoryCachesForBacktest({
        rawData: rows,
        numberStats: {},
        headTailStats: {},
        sumDiffStats: {}
    });

    const strict = await simulationService.runBacktest(2, rows, {
        methodIds: 'chainBlockFirstHold70',
        playMode: 'bet',
        summaryOnly: true,
        strictPointInTime: true
    });
    assert.strictEqual(strict.config.pointInTime.strict, true);
    assert.strictEqual(
        strict.config.pointInTime.dailyState,
        'strict-prefix-regenerated-before-each-prediction'
    );
    assert.strictEqual(strict.config.methodVersion, '2026-07-13-parallel-history-v2');

    const originalBuildAnnualBaseline = annualMilestoneService.buildAnnualBaseline;
    const originalEnsureAnnualBaseline = annualMilestoneService.ensureAnnualBaseline;
    let strictBaselineBuilds = 0;
    let cachedBaselineReads = 0;
    annualMilestoneService.buildAnnualBaseline = (...args) => {
        strictBaselineBuilds++;
        return originalBuildAnnualBaseline(...args);
    };
    annualMilestoneService.ensureAnnualBaseline = (...args) => {
        cachedBaselineReads++;
        return originalEnsureAnnualBaseline(...args);
    };
    try {
        await simulationService.runBacktest(1, rows, {
            methodIds: 'deParallelBlock85Small65Hold70',
            playMode: 'bet',
            summaryOnly: true,
            strictPointInTime: true
        });
    } finally {
        annualMilestoneService.buildAnnualBaseline = originalBuildAnnualBaseline;
        annualMilestoneService.ensureAnnualBaseline = originalEnsureAnnualBaseline;
    }
    assert.strictEqual(strictBaselineBuilds, 0, 'Lịch sử song song must use daily point-in-time candidates, not the annual Mốc baseline.');
    assert.strictEqual(cachedBaselineReads, 0, 'Lịch sử song song must not read the annual Mốc baseline cache.');

    const legacy = await simulationService.runBacktest(2, rows, {
        methodIds: 'chainBlockFirstHold70',
        playMode: 'bet',
        summaryOnly: true,
        strictPointInTime: false
    });
    assert.strictEqual(legacy.config.pointInTime.strict, false);
    assert.match(legacy.config.pointInTime.warning, /không phải point-in-time/i);

    console.log('Strict point-in-time regression tests passed.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
