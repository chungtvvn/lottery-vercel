#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
    allocateFixedUnits,
    blockBootstrap,
    settleWeighted
} = require('../lib/research/strictEnsembleStress');
const { loadStrictRows } = require('./research-future-ensemble-stress');

const POOL = [
    'activeOnlyAvgRisk',
    'chainBlockFirst',
    'numberLikelihoodRatio',
    'chainFreqFirst',
    'dedupEdge50Hold',
    'chainSmallFirst'
];
const BUDGET_UNITS = 30;
const STAKE_PER_UNIT_K = 1000;
const PAYOUT_MULTIPLIER = 84;

function combinations(values, size, start = 0, prefix = [], output = []) {
    if (prefix.length === size) {
        output.push(prefix.slice());
        return output;
    }
    for (let index = start; index <= values.length - (size - prefix.length); index++) {
        prefix.push(values[index]);
        combinations(values, size, index + 1, prefix, output);
        prefix.pop();
    }
    return output;
}

function compact(summary) {
    const { daily, ...result } = summary;
    return result;
}

function allocator(config) {
    return row => allocateFixedUnits(
        row,
        config.methods,
        config.focus,
        config.multiplier,
        BUDGET_UNITS,
        POOL
    );
}

function evaluate(rows, config, includeDaily = false) {
    return settleWeighted(rows, allocator(config), {
        stakePerUnitK: STAKE_PER_UNIT_K,
        payoutMultiplier: PAYOUT_MULTIPLIER
    }, includeDaily);
}

function averageDailyProfit(summary) {
    return summary.profitK / Math.max(1, summary.days);
}

function score(fit, validation) {
    return {
        worstDailyProfitK: Math.min(averageDailyProfit(fit), averageDailyProfit(validation)),
        totalDailyProfitK: averageDailyProfit(fit) + averageDailyProfit(validation),
        worstHitRate: Math.min(fit.hitRate, validation.hitRate)
    };
}

function byYear(rows, config) {
    const groups = new Map();
    for (const row of rows) {
        const year = row.date.slice(0, 4);
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push(row);
    }
    return Object.fromEntries([...groups].map(([year, yearRows]) => [
        year,
        compact(evaluate(yearRows, config))
    ]));
}

function main() {
    const root = path.resolve(__dirname, '..');
    const rows = loadStrictRows(root).rows;
    const periods = {
        fit: rows.filter(row => row.date >= '2021-01-01' && row.date < '2024-01-01'),
        validation: rows.filter(row => row.date >= '2024-01-01' && row.date < '2026-01-01'),
        holdout: rows.filter(row => row.date >= '2026-01-01')
    };
    const configs = [];
    for (let size = 2; size <= 5; size++) {
        for (const methods of combinations(POOL, size)) {
            for (const focus of ['overlap', 'exclusive']) {
                for (const multiplier of [2, 3, 4]) {
                    configs.push({
                        id: `${focus}-x${multiplier}__${methods.join('+')}`,
                        methods,
                        focus,
                        multiplier
                    });
                }
            }
        }
    }
    const candidates = configs.map(config => {
        const fit = evaluate(periods.fit, config);
        const validation = evaluate(periods.validation, config);
        return { config, fit, validation, score: score(fit, validation) };
    }).sort((left, right) =>
        right.score.worstDailyProfitK - left.score.worstDailyProfitK
        || right.score.worstHitRate - left.score.worstHitRate
        || right.score.totalDailyProfitK - left.score.totalDailyProfitK
        || left.config.id.localeCompare(right.config.id)
    );
    const selected = candidates[0];
    const holdout = evaluate(periods.holdout, selected.config, true);
    const bestByFocus = Object.fromEntries(['overlap', 'exclusive'].map(focus => {
        const candidate = candidates.find(row => row.config.focus === focus);
        return [focus, {
            config: candidate.config,
            fit: compact(candidate.fit),
            validation: compact(candidate.validation),
            holdout: compact(evaluate(periods.holdout, candidate.config))
        }];
    }));
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-prefix-point-in-time-v1',
        selectionProtocol: 'Select on worst average daily profit across 2021-2023 and 2024-2025; freeze before 2026.',
        economics: {
            budgetUnits: BUDGET_UNITS,
            stakePerUnitK: STAKE_PER_UNIT_K,
            payoutMultiplier: PAYOUT_MULTIPLIER
        },
        candidateCount: candidates.length,
        selected: {
            config: selected.config,
            fit: compact(selected.fit),
            validation: compact(selected.validation),
            holdout: compact(holdout),
            fitByYear: byYear(periods.fit, selected.config),
            validationByYear: byYear(periods.validation, selected.config),
            holdoutByYear: byYear(periods.holdout, selected.config),
            stress: {
                validationBlock: blockBootstrap(
                    evaluate(periods.validation, selected.config, true).daily,
                    { paths: 5000, horizon: 365, blockSize: 14, seed: 20260720 }
                ),
                holdoutBlock: blockBootstrap(
                    holdout.daily,
                    { paths: 5000, horizon: 365, blockSize: 14, seed: 20260721 }
                )
            }
        },
        bestByFocus,
        top10PreHoldout: candidates.slice(0, 10).map(row => ({
            config: row.config,
            fit: compact(row.fit),
            validation: compact(row.validation)
        })),
        decision: selected.fit.profitK > 0 && selected.validation.profitK > 0 && holdout.profitK > 0
            ? 'eligible-for-live-shadow'
            : 'do-not-promote'
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const output = path.join(root, 'reports', `overlap-capital-stress-${stamp}.json`);
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report }, null, 2));
}

if (require.main === module) main();
