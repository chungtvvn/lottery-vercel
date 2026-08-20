#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
    BET_COUNT,
    BREAK_EVEN_HIT_RATE,
    PAYOUT_MULTIPLIER,
    STAKE_PER_NUMBER_K,
    loadRows,
    settle,
    withoutDaily
} = require('./research-fixed30-method-fusion');
const {
    refineBaseline,
    trainMembershipModel
} = require('../lib/research/walkForwardMembershipModel');
const { pairedComparison } = require('./research-walkforward-membership-model');

const VALIDATION_YEARS = [2021, 2022, 2023];
const TEST_YEARS = [2024, 2025];
const HOLDOUT_YEARS = [2026];
const WINDOWS = [3, 5, 'expanding'];
const SWAP_LIMITS = [1, 3, 5];

function baselinePredictor(row) {
    return row.strategies.chainSmallFirst.map(Number);
}

function yearRows(rows, year) {
    return rows.filter(row => Number(row.date.slice(0, 4)) === year);
}

function trainingRows(rows, targetYear, window) {
    const firstYear = window === 'expanding' ? 2016 : Math.max(2016, targetYear - Number(window));
    return rows.filter(row => {
        const year = Number(row.date.slice(0, 4));
        return year >= firstYear && year < targetYear;
    });
}

function trainAnnualModels(rows, years, windows) {
    const models = new Map();
    for (const year of years) {
        for (const window of windows) {
            const fit = trainingRows(rows, year, window);
            console.log(`[rolling] Train target=${year}, window=${window}, days=${fit.length}`);
            models.set(`${year}:${window}`, trainMembershipModel(fit, {
                epochs: 22,
                learningRate: 0.02,
                l2: 1
            }));
        }
    }
    return models;
}

function annualPredictor(models, window, swapLimit) {
    return row => {
        const year = Number(row.date.slice(0, 4));
        const model = models.get(`${year}:${window}`);
        if (!model) throw new Error(`Thiếu rolling model ${year}:${window}`);
        return refineBaseline(row, model, {
            swapLimit,
            minMargin: 0,
            salt: `rolling-${window}-s${swapLimit}`
        }).betNumbers;
    };
}

function evaluateYears(rows, years, predictor) {
    const annual = {};
    let totalWins = 0;
    let totalBaselineWins = 0;
    for (const year of years) {
        const values = yearRows(rows, year);
        const baseline = settle(values, baselinePredictor);
        const candidate = settle(values, predictor);
        annual[year] = {
            baseline: withoutDaily(baseline),
            candidate: withoutDaily(candidate),
            winDelta: candidate.wins - baseline.wins
        };
        totalWins += candidate.wins;
        totalBaselineWins += baseline.wins;
    }
    const periodRows = rows.filter(row => years.includes(Number(row.date.slice(0, 4))));
    const baseline = settle(periodRows, baselinePredictor);
    const candidate = settle(periodRows, predictor, true);
    return {
        baseline: withoutDaily(baseline),
        candidate: withoutDaily(candidate),
        annual,
        minAnnualWinDelta: Math.min(...Object.values(annual).map(value => value.winDelta)),
        totalWinDelta: totalWins - totalBaselineWins,
        paired: pairedComparison(periodRows, baselinePredictor, predictor),
        daily: candidate.daily
    };
}

function pct(value) {
    return `${(100 * Number(value || 0)).toFixed(2)}%`;
}

function main() {
    const root = path.resolve(__dirname, '..');
    const { rows, sources } = loadRows(root);
    const allTargetYears = [...VALIDATION_YEARS, ...TEST_YEARS, ...HOLDOUT_YEARS];
    const models = trainAnnualModels(rows, allTargetYears, WINDOWS);
    const selection = [];
    selection.push({
        config: { id: 'baseline-no-change', window: null, swapLimit: 0 },
        ...evaluateYears(rows, VALIDATION_YEARS, baselinePredictor)
    });
    for (const window of WINDOWS) {
        for (const swapLimit of SWAP_LIMITS) {
            const config = { id: `rolling-${window}-s${swapLimit}`, window, swapLimit };
            selection.push({
                config,
                ...evaluateYears(rows, VALIDATION_YEARS, annualPredictor(models, window, swapLimit))
            });
        }
    }
    selection.sort((left, right) =>
        right.minAnnualWinDelta - left.minAnnualWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || right.candidate.profitK - left.candidate.profitK
        || left.config.swapLimit - right.config.swapLimit
        || left.config.id.localeCompare(right.config.id)
    );
    const selected = selection[0];
    const predictor = selected.config.swapLimit
        ? annualPredictor(models, selected.config.window, selected.config.swapLimit)
        : baselinePredictor;
    const test = evaluateYears(rows, TEST_YEARS, predictor);
    const holdout = evaluateYears(rows, HOLDOUT_YEARS, predictor);
    const promote = selected.config.swapLimit > 0
        && selected.minAnnualWinDelta >= 0
        && selected.totalWinDelta > 0
        && test.minAnnualWinDelta >= 0
        && test.totalWinDelta > 0
        && holdout.minAnnualWinDelta >= 0
        && holdout.totalWinDelta >= 0;
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-prefix-point-in-time-v1',
        decision: promote ? 'promote-candidate' : 'do-not-promote',
        economics: {
            betCount: BET_COUNT,
            stakePerNumberK: STAKE_PER_NUMBER_K,
            payoutMultiplier: PAYOUT_MULTIPLIER,
            breakEvenHitRate: BREAK_EVEN_HIT_RATE
        },
        design: {
            baseline: 'chainSmallFirst:hold70',
            windows: WINDOWS,
            validationYears: VALIDATION_YEARS,
            testYears: TEST_YEARS,
            untouchedHoldoutYears: HOLDOUT_YEARS,
            rule: 'For every target year, fit only complete source years strictly before it. Select window and swaps on 2021-2023.'
        },
        sources,
        selectedConfig: selected.config,
        selection: {
            baseline: selected.baseline,
            candidate: selected.candidate,
            annual: selected.annual,
            minAnnualWinDelta: selected.minAnnualWinDelta,
            totalWinDelta: selected.totalWinDelta,
            paired: selected.paired,
            candidates: selection.map(item => ({
                config: item.config,
                minAnnualWinDelta: item.minAnnualWinDelta,
                totalWinDelta: item.totalWinDelta,
                annual: item.annual,
                paired: item.paired
            }))
        },
        test,
        untouchedHoldout: holdout
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(root, 'reports', `rolling-membership-model-${stamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const annualLines = [
        ...Object.entries(selected.annual).map(([year, value]) => ['Validation', year, value]),
        ...Object.entries(test.annual).map(([year, value]) => ['Test', year, value]),
        ...Object.entries(holdout.annual).map(([year, value]) => ['Holdout', year, value])
    ].map(([period, year, value]) =>
        `| ${period} | ${year} | ${value.candidate.wins}/${value.candidate.days} | ${pct(value.candidate.hitRate)} | ${value.winDelta >= 0 ? '+' : ''}${value.winDelta} | ${value.candidate.profitK.toLocaleString('vi-VN')}K |`
    );
    const md = `# Annual rolling membership model\n\n`
        + `- Decision: **${report.decision}**\n`
        + `- Selected on 2021-2023: **${selected.config.id}**\n`
        + `- Validation delta: ${selected.totalWinDelta >= 0 ? '+' : ''}${selected.totalWinDelta}\n`
        + `- Test delta: ${test.totalWinDelta >= 0 ? '+' : ''}${test.totalWinDelta}\n`
        + `- Untouched 2026 delta: ${holdout.totalWinDelta >= 0 ? '+' : ''}${holdout.totalWinDelta}\n\n`
        + `| Period | Year | Candidate wins | Hit rate | Delta | Profit |\n|---|---:|---:|---:|---:|---:|\n`
        + `${annualLines.join('\n')}\n\n`
        + `Each target-year model uses only complete years before that target year. No target-year result is used in its own fit.\n`;
    fs.writeFileSync(mdPath, md);
    console.log(`Selected: ${selected.config.id}`);
    console.log(`Validation delta=${selected.totalWinDelta}, test delta=${test.totalWinDelta}, holdout delta=${holdout.totalWinDelta}`);
    console.log(`Decision: ${report.decision}`);
    console.log(`Reports: ${jsonPath}\n         ${mdPath}`);
}

if (require.main === module) main();

module.exports = {
    annualPredictor,
    evaluateYears,
    trainingRows,
    yearRows
};
