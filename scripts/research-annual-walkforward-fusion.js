#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
    METHODS,
    BET_COUNT,
    PAYOUT_MULTIPLIER,
    BREAK_EVEN_HIT_RATE,
    loadRows,
    methodMetrics,
    selectDiversePool,
    buildFitModel,
    buildPredictor,
    settle,
    withoutDaily,
    pct
} = require('./research-fixed30-method-fusion');

function buildPool(trainingRows, poolType, size) {
    const metrics = methodMetrics(trainingRows);
    if (poolType === 'all') return METHODS.slice();
    if (poolType === 'top') {
        return METHODS.slice()
            .sort((left, right) => metrics[right].robustScore - metrics[left].robustScore
                || left.localeCompare(right))
            .slice(0, size);
    }
    if (poolType === 'diverse') return selectDiversePool(trainingRows, metrics, size);
    throw new Error(`poolType không hỗ trợ: ${poolType}`);
}

function trainAnnualPredictor(trainingRows, config, year) {
    const pool = buildPool(trainingRows, config.poolType, config.poolSize);
    const metrics = methodMetrics(trainingRows);
    const model = buildFitModel(trainingRows, pool, config.signaturePrior);
    const modelKey = `annual-${year}`;
    const models = new Map([[`${modelKey}:${config.signaturePrior}`, model]]);
    const predictor = buildPredictor({
        ...config,
        id: `${config.id}:${year}`,
        poolId: modelKey
    }, models, metrics);
    return { predictor, pool };
}

function annualWalkForward(allRows, config, options = {}) {
    const firstEvaluationYear = Number(options.firstEvaluationYear || 2018);
    const lastEvaluationYear = Number(options.lastEvaluationYear || 2026);
    const trainingYears = Number(options.trainingYears || config.trainingYears || 0);
    const daily = [];
    const annual = {};
    const modelAudit = [];
    for (let year = firstEvaluationYear; year <= lastEvaluationYear; year += 1) {
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year + 1}-01-01`;
        const earliestTrainingDate = trainingYears > 0 ? `${year - trainingYears}-01-01` : '0000-01-01';
        const trainingRows = allRows.filter(row => row.date >= earliestTrainingDate && row.date < yearStart);
        const evaluationRows = allRows.filter(row => row.date >= yearStart && row.date < yearEnd);
        if (!trainingRows.length || !evaluationRows.length) continue;
        const trained = trainAnnualPredictor(trainingRows, config, year);
        const summary = settle(evaluationRows, trained.predictor, true);
        annual[year] = withoutDaily(summary);
        daily.push(...summary.daily);
        modelAudit.push({
            predictionYear: year,
            trainingStart: trainingRows[0].date,
            trainingEnd: trainingRows.at(-1).date,
            trainingDays: trainingRows.length,
            predictionStart: evaluationRows[0].date,
            predictionEnd: evaluationRows.at(-1).date,
            predictionDays: evaluationRows.length,
            pool: trained.pool
        });
    }
    const wins = daily.filter(row => row.hit).length;
    const days = daily.length;
    const stakeK = days * BET_COUNT * 1000;
    const payoutK = wins * PAYOUT_MULTIPLIER * 1000;
    let longestWin = 0;
    let longestLoss = 0;
    let currentWin = 0;
    let currentLoss = 0;
    for (const row of daily) {
        currentWin = row.hit ? currentWin + 1 : 0;
        currentLoss = row.hit ? 0 : currentLoss + 1;
        longestWin = Math.max(longestWin, currentWin);
        longestLoss = Math.max(longestLoss, currentLoss);
    }
    return {
        days,
        wins,
        losses: days - wins,
        hitRate: days ? wins / days : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin,
        longestLoss,
        annual,
        daily,
        modelAudit
    };
}

function summarizeSlice(rows) {
    const wins = rows.filter(row => row.hit).length;
    const stakeK = rows.length * BET_COUNT * 1000;
    const payoutK = wins * PAYOUT_MULTIPLIER * 1000;
    let longestLoss = 0;
    let currentLoss = 0;
    for (const row of rows) {
        currentLoss = row.hit ? 0 : currentLoss + 1;
        longestLoss = Math.max(longestLoss, currentLoss);
    }
    return {
        days: rows.length,
        wins,
        losses: rows.length - wins,
        hitRate: rows.length ? wins / rows.length : 0,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestLoss
    };
}

function periodSummary(result, start, end) {
    return summarizeSlice(result.daily.filter(row => row.date >= start && row.date < end));
}

function buildConfigs() {
    const configs = [];
    for (const trainingYears of [0, 3, 5]) {
        for (const pool of [
            { poolType: 'top', poolSize: 5 },
            { poolType: 'top', poolSize: 7 },
            { poolType: 'diverse', poolSize: 5 },
            { poolType: 'diverse', poolSize: 7 },
            { poolType: 'all', poolSize: METHODS.length }
        ]) {
            for (const mode of ['equalVote', 'reliabilityVote', 'naiveBayes']) {
                configs.push({
                    id: `annual_${trainingYears || 'all'}y_${pool.poolType}${pool.poolSize}_${mode}`,
                    ...pool,
                    trainingYears,
                    signaturePrior: 300,
                    mode,
                    blend: 0
                });
            }
            for (const signaturePrior of [100, 300, 1000]) {
                configs.push({
                    id: `annual_${trainingYears || 'all'}y_${pool.poolType}${pool.poolSize}_signature_p${signaturePrior}`,
                    ...pool,
                    trainingYears,
                    signaturePrior,
                    mode: 'signature',
                    blend: 0
                });
            }
        }
    }
    return configs;
}

function main() {
    const root = path.resolve(__dirname, '..');
    const { rows, sources } = loadRows(root);
    const configs = buildConfigs();
    const candidates = configs.map((config, index) => {
        if ((index + 1) % 10 === 0) process.stdout.write(`\rEvaluated ${index + 1}/${configs.length}`);
        const result = annualWalkForward(rows, config, { firstEvaluationYear: 2018, lastEvaluationYear: 2026 });
        return {
            config,
            result,
            fit: periodSummary(result, '2018-01-01', '2024-01-01'),
            validation: periodSummary(result, '2024-01-01', '2026-01-01'),
            holdout: periodSummary(result, '2026-01-01', '2027-01-01')
        };
    });
    process.stdout.write('\n');

    // Fit and validation only determine the selected configuration.
    candidates.sort((left, right) => {
        const leftFloor = Math.min(left.fit.hitRate, left.validation.hitRate);
        const rightFloor = Math.min(right.fit.hitRate, right.validation.hitRate);
        return rightFloor - leftFloor
            || (right.fit.hitRate + right.validation.hitRate) - (left.fit.hitRate + left.validation.hitRate)
            || left.config.id.localeCompare(right.config.id);
    });
    const selected = candidates[0];
    const report = {
        generatedAt: new Date().toISOString(),
        methodologyVersion: 'strict-prefix-point-in-time-v1/annual-frozen-fusion-v1',
        economics: { betCount: BET_COUNT, payoutMultiplier: PAYOUT_MULTIPLIER, breakEvenHitRate: BREAK_EVEN_HIT_RATE },
        design: {
            annualFreeze: 'Each prediction-year model uses only strict rows ending on 31 December of the prior year.',
            fit: '2018-2023',
            validation: '2024-2025',
            untouchedHoldout: '2026',
            selectionRule: 'Maximize minimum hit rate across fit and validation. Holdout is not used for selection.',
            caveat: 'Strict source rows start in 2016; this experiment cannot reconstruct a full 20-year training window for early years.'
        },
        sources,
        selected: {
            config: selected.config,
            fit: selected.fit,
            validation: selected.validation,
            holdout: selected.holdout,
            full: withoutDaily(selected.result),
            annual: selected.result.annual,
            modelAudit: selected.result.modelAudit,
            holdoutDaily: selected.result.daily.filter(row => row.date >= '2026-01-01')
        },
        topBeforeHoldout: candidates.slice(0, 20).map(item => ({
            config: item.config,
            fit: item.fit,
            validation: item.validation
        }))
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(root, 'reports', `annual-walkforward-fusion-${stamp}.json`);
    const mdPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    const annualLines = Object.entries(selected.result.annual).map(([year, summary]) =>
        `| ${year} | ${summary.wins}/${summary.days} | ${pct(summary.hitRate)} | ${summary.profitK.toLocaleString('vi-VN')}K | ${pct(summary.roi)} | ${summary.longestLoss} |`);
    fs.writeFileSync(mdPath, `# Annual walk-forward fixed-30 fusion\n\n`
        + `- Selected before opening 2026: **${selected.config.id}**\n`
        + `- Fit 2018-2023: ${selected.fit.wins}/${selected.fit.days} (${pct(selected.fit.hitRate)}), ${selected.fit.profitK.toLocaleString('vi-VN')}K\n`
        + `- Validation 2024-2025: ${selected.validation.wins}/${selected.validation.days} (${pct(selected.validation.hitRate)}), ${selected.validation.profitK.toLocaleString('vi-VN')}K\n`
        + `- Holdout 2026: ${selected.holdout.wins}/${selected.holdout.days} (${pct(selected.holdout.hitRate)}), ${selected.holdout.profitK.toLocaleString('vi-VN')}K\n`
        + `- Break-even: ${pct(BREAK_EVEN_HIT_RATE)}\n\n`
        + `| Year | Wins | Hit rate | Profit | ROI | Longest loss |\n|---|---:|---:|---:|---:|---:|\n${annualLines.join('\n')}\n`);

    console.log(`Selected: ${selected.config.id}`);
    console.log(`Fit: ${selected.fit.wins}/${selected.fit.days} ${pct(selected.fit.hitRate)} profit=${selected.fit.profitK.toLocaleString('vi-VN')}K`);
    console.log(`Validation: ${selected.validation.wins}/${selected.validation.days} ${pct(selected.validation.hitRate)} profit=${selected.validation.profitK.toLocaleString('vi-VN')}K`);
    console.log(`Holdout: ${selected.holdout.wins}/${selected.holdout.days} ${pct(selected.holdout.hitRate)} profit=${selected.holdout.profitK.toLocaleString('vi-VN')}K`);
    console.log(`Reports: ${jsonPath}\n         ${mdPath}`);
}

if (require.main === module) main();

module.exports = { annualWalkForward, buildConfigs, periodSummary };
