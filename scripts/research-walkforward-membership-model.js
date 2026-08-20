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

const BASELINE_ID = 'chainSmallFirst:hold70';
const TRAIN_END = '2020-12-31';
const VALIDATION_END = '2023-12-31';
const TEST_END = '2025-12-31';

function rowsBetween(rows, start, end) {
    return rows.filter(row => row.date >= start && row.date <= end);
}

function baselinePredictor(row) {
    return row.strategies.chainSmallFirst.map(Number);
}

function predictorFor(model, config) {
    return row => refineBaseline(row, model, {
        swapLimit: config.swapLimit,
        minMargin: config.minMargin,
        salt: config.id
    }).betNumbers;
}

function annualWins(rows, predictor) {
    const groups = new Map();
    for (const row of rows) {
        const year = row.date.slice(0, 4);
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push(row);
    }
    return Object.fromEntries([...groups].map(([year, values]) => {
        const summary = settle(values, predictor);
        return [year, withoutDaily(summary)];
    }));
}

function pairedComparison(rows, baseline, candidate) {
    let gained = 0;
    let lost = 0;
    let bothHit = 0;
    let bothMiss = 0;
    for (const row of rows) {
        const actual = Number(row.actual);
        const baseHit = baseline(row).includes(actual);
        const candidateHit = candidate(row).includes(actual);
        if (candidateHit && !baseHit) gained++;
        else if (!candidateHit && baseHit) lost++;
        else if (candidateHit) bothHit++;
        else bothMiss++;
    }
    return { gained, lost, bothHit, bothMiss, net: gained - lost };
}

function pct(value) {
    return `${(100 * Number(value || 0)).toFixed(2)}%`;
}

function compactAnnual(candidateAnnual, baselineAnnual) {
    return Object.fromEntries(Object.entries(candidateAnnual).map(([year, summary]) => [year, {
        ...summary,
        winDelta: summary.wins - baselineAnnual[year].wins,
        profitDeltaK: summary.profitK - baselineAnnual[year].profitK
    }]));
}

function configComparator(left, right) {
    return right.minAnnualWinDelta - left.minAnnualWinDelta
        || right.totalWinDelta - left.totalWinDelta
        || right.summary.profitK - left.summary.profitK
        || left.config.swapLimit - right.config.swapLimit
        || left.config.l2 - right.config.l2
        || left.config.id.localeCompare(right.config.id);
}

function trainModels(rows, l2Values, label) {
    const models = new Map();
    for (const l2 of l2Values) {
        console.log(`[${label}] Train l2=${l2} trên ${rows.length} ngày...`);
        models.set(l2, trainMembershipModel(rows, {
            epochs: 28,
            learningRate: 0.02,
            l2
        }));
    }
    return models;
}

function main() {
    const root = path.resolve(__dirname, '..');
    const { rows, sources } = loadRows(root);
    const trainRows = rowsBetween(rows, '2016-01-01', TRAIN_END);
    const validationRows = rowsBetween(rows, '2021-01-01', VALIDATION_END);
    const fitRows = rowsBetween(rows, '2016-01-01', VALIDATION_END);
    const testRows = rowsBetween(rows, '2024-01-01', TEST_END);
    const preHoldoutRows = rowsBetween(rows, '2016-01-01', TEST_END);
    const holdoutRows = rows.filter(row => row.date >= '2026-01-01');
    if (!trainRows.length || !validationRows.length || !testRows.length || !holdoutRows.length) {
        throw new Error('Thiếu một trong các tập train/validation/test/holdout.');
    }

    const l2Values = [0.05, 0.2, 1];
    const swapLimits = [1, 2, 3, 5];
    const minMargins = [0, 0.00005];
    const trainModelsByL2 = trainModels(trainRows, l2Values, 'selection');
    const validationBaseline = settle(validationRows, baselinePredictor);
    const validationBaselineAnnual = annualWins(validationRows, baselinePredictor);
    const candidates = [{
        config: { id: 'baseline-no-change', l2: 0, swapLimit: 0, minMargin: 0 },
        summary: validationBaseline,
        annual: validationBaselineAnnual,
        annualWinDeltas: Object.fromEntries(Object.keys(validationBaselineAnnual).map(year => [year, 0])),
        minAnnualWinDelta: 0,
        totalWinDelta: 0,
        paired: { gained: 0, lost: 0, bothHit: validationBaseline.wins, bothMiss: validationBaseline.losses, net: 0 }
    }];

    for (const l2 of l2Values) {
        for (const swapLimit of swapLimits) {
            for (const minMargin of minMargins) {
                const config = {
                    id: `membership-l2-${l2}-s${swapLimit}-m${minMargin}`,
                    l2,
                    swapLimit,
                    minMargin
                };
                const predictor = predictorFor(trainModelsByL2.get(l2), config);
                const summary = settle(validationRows, predictor);
                const annual = annualWins(validationRows, predictor);
                const annualWinDeltas = Object.fromEntries(Object.entries(annual).map(([year, value]) => [
                    year,
                    value.wins - validationBaselineAnnual[year].wins
                ]));
                candidates.push({
                    config,
                    summary,
                    annual,
                    annualWinDeltas,
                    minAnnualWinDelta: Math.min(...Object.values(annualWinDeltas)),
                    totalWinDelta: summary.wins - validationBaseline.wins,
                    paired: pairedComparison(validationRows, baselinePredictor, predictor)
                });
            }
        }
    }

    candidates.sort(configComparator);
    const selected = candidates[0];
    console.log(`Selected without 2024+: ${selected.config.id}; validation delta=${selected.totalWinDelta}, minYear=${selected.minAnnualWinDelta}`);

    let testPredictor = baselinePredictor;
    let holdoutPredictor = baselinePredictor;
    let fitModel = null;
    let holdoutModel = null;
    if (selected.config.swapLimit > 0) {
        fitModel = trainMembershipModel(fitRows, {
            epochs: 28,
            learningRate: 0.02,
            l2: selected.config.l2
        });
        testPredictor = predictorFor(fitModel, selected.config);
        holdoutModel = trainMembershipModel(preHoldoutRows, {
            epochs: 28,
            learningRate: 0.02,
            l2: selected.config.l2
        });
        holdoutPredictor = predictorFor(holdoutModel, selected.config);
    }

    const testBaseline = settle(testRows, baselinePredictor);
    const testCandidate = settle(testRows, testPredictor, true);
    const testBaselineAnnual = annualWins(testRows, baselinePredictor);
    const testCandidateAnnual = annualWins(testRows, testPredictor);
    const holdoutBaseline = settle(holdoutRows, baselinePredictor);
    const holdoutCandidate = settle(holdoutRows, holdoutPredictor, true);
    const holdoutBaselineAnnual = annualWins(holdoutRows, baselinePredictor);
    const holdoutCandidateAnnual = annualWins(holdoutRows, holdoutPredictor);
    const testAnnual = compactAnnual(testCandidateAnnual, testBaselineAnnual);
    const holdoutAnnual = compactAnnual(holdoutCandidateAnnual, holdoutBaselineAnnual);
    const testPaired = pairedComparison(testRows, baselinePredictor, testPredictor);
    const holdoutPaired = pairedComparison(holdoutRows, baselinePredictor, holdoutPredictor);
    const stableTest = Object.values(testAnnual).every(value => value.winDelta >= 0);
    const stableHoldout = Object.values(holdoutAnnual).every(value => value.winDelta >= 0);
    const promote = selected.config.swapLimit > 0
        && selected.minAnnualWinDelta >= 0
        && selected.totalWinDelta > 0
        && stableTest
        && testPaired.net > 0
        && stableHoldout
        && holdoutPaired.net >= 0;

    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-prefix-point-in-time-v1',
        decision: promote ? 'promote-candidate' : 'do-not-promote',
        economics: {
            betCount: BET_COUNT,
            holdCount: 100 - BET_COUNT,
            stakePerNumberK: STAKE_PER_NUMBER_K,
            payoutMultiplier: PAYOUT_MULTIPLIER,
            breakEvenHitRate: BREAK_EVEN_HIT_RATE
        },
        split: {
            train: { range: `2016-01-01..${TRAIN_END}`, days: trainRows.length },
            validation: { range: `2021-01-01..${VALIDATION_END}`, days: validationRows.length },
            test: { range: `2024-01-01..${TEST_END}`, days: testRows.length },
            untouchedHoldout: { range: `${holdoutRows[0].date}..${holdoutRows.at(-1).date}`, days: holdoutRows.length }
        },
        design: {
            baseline: BASELINE_ID,
            model: 'Strongly regularized conditional softmax over deduplicated method memberships.',
            boundedRefinement: 'Only swap 1-5 numbers around ChainSmallFirst Hold70.',
            selection: 'Maximize worst validation-year win delta, then total validation delta. Baseline no-change is a candidate.',
            holdoutRule: '2026 is not read until the configuration is fixed and 2024-2025 test is evaluated.'
        },
        sources,
        selectedConfig: selected.config,
        selection: {
            baseline: withoutDaily(validationBaseline),
            candidate: withoutDaily(selected.summary),
            annualWinDeltas: selected.annualWinDeltas,
            minAnnualWinDelta: selected.minAnnualWinDelta,
            totalWinDelta: selected.totalWinDelta,
            paired: selected.paired,
            topCandidates: candidates.slice(0, 10).map(candidate => ({
                config: candidate.config,
                minAnnualWinDelta: candidate.minAnnualWinDelta,
                totalWinDelta: candidate.totalWinDelta,
                annualWinDeltas: candidate.annualWinDeltas,
                paired: candidate.paired
            }))
        },
        test: {
            baseline: withoutDaily(testBaseline),
            candidate: withoutDaily(testCandidate),
            annual: testAnnual,
            paired: testPaired
        },
        untouchedHoldout: {
            baseline: withoutDaily(holdoutBaseline),
            candidate: withoutDaily(holdoutCandidate),
            annual: holdoutAnnual,
            paired: holdoutPaired
        },
        model: fitModel ? {
            selectionTraining: trainModelsByL2.get(selected.config.l2),
            testTraining: fitModel,
            holdoutTraining: holdoutModel
        } : null,
        daily: {
            test: testCandidate.daily,
            untouchedHoldout: holdoutCandidate.daily
        }
    };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(root, 'reports', `walkforward-membership-model-${stamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const annualLines = [
        ...Object.entries(testAnnual).map(([year, value]) => `| Test | ${year} | ${value.wins}/${value.days} | ${pct(value.hitRate)} | ${value.winDelta >= 0 ? '+' : ''}${value.winDelta} | ${value.profitK.toLocaleString('vi-VN')}K |`),
        ...Object.entries(holdoutAnnual).map(([year, value]) => `| Holdout | ${year} | ${value.wins}/${value.days} | ${pct(value.hitRate)} | ${value.winDelta >= 0 ? '+' : ''}${value.winDelta} | ${value.profitK.toLocaleString('vi-VN')}K |`)
    ];
    const md = `# Walk-forward membership model\n\n`
        + `- Decision: **${report.decision}**\n`
        + `- Selected without 2024+: **${selected.config.id}**\n`
        + `- Validation delta: ${selected.totalWinDelta >= 0 ? '+' : ''}${selected.totalWinDelta} hits; worst year ${selected.minAnnualWinDelta >= 0 ? '+' : ''}${selected.minAnnualWinDelta}\n`
        + `- Test 2024-2025: baseline ${testBaseline.wins}/${testBaseline.days}, candidate ${testCandidate.wins}/${testCandidate.days}, paired net ${testPaired.net >= 0 ? '+' : ''}${testPaired.net}\n`
        + `- Untouched 2026: baseline ${holdoutBaseline.wins}/${holdoutBaseline.days}, candidate ${holdoutCandidate.wins}/${holdoutCandidate.days}, paired net ${holdoutPaired.net >= 0 ? '+' : ''}${holdoutPaired.net}\n\n`
        + `## Annual results\n\n| Regime | Year | Wins | Hit rate | Delta vs baseline | Profit |\n|---|---:|---:|---:|---:|---:|\n`
        + `${annualLines.join('\n')}\n\n`
        + `## Interpretation\n\nThe model is eligible for production only when it improves validation, both test years, and the untouched holdout without changing bet economics. A holdout-only gain is not sufficient.\n`;
    fs.writeFileSync(mdPath, md);

    console.log(`Test: baseline=${testBaseline.wins}/${testBaseline.days}, candidate=${testCandidate.wins}/${testCandidate.days}, net=${testPaired.net}`);
    console.log(`Holdout: baseline=${holdoutBaseline.wins}/${holdoutBaseline.days}, candidate=${holdoutCandidate.wins}/${holdoutCandidate.days}, net=${holdoutPaired.net}`);
    console.log(`Decision: ${report.decision}`);
    console.log(`Reports: ${jsonPath}\n         ${mdPath}`);
}

if (require.main === module) main();

module.exports = {
    annualWins,
    pairedComparison,
    predictorFor,
    rowsBetween
};
