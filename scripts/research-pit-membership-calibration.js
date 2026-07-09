#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    loadRows,
    summarize,
    validateFullCoverage
} = require('./research-full-pit-ensemble');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const BET_COUNT = 30;
const GLOBAL_RATE = 0.01;

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        train: String(args.get('train') || '').split(',').filter(Boolean),
        validation: String(args.get('validation') || '').split(',').filter(Boolean),
        test: String(args.get('test') || '').split(',').filter(Boolean),
        raw: args.get('raw') || path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json')
    };
}

function getStrategyIds(rows) {
    return Object.keys(rows[0]?.strategies || {}).filter(id => (
        rows.every(row => Array.isArray(row.strategies?.[id]))
    ));
}

function buildMembership(row, strategyIds, number) {
    let mask = 0;
    let votes = 0;
    strategyIds.forEach((strategyId, index) => {
        if ((row.strategies[strategyId] || []).map(Number).includes(number)) {
            mask |= (1 << index);
            votes++;
        }
    });
    return { mask, votes };
}

function incrementCount(map, key, hit) {
    const row = map.get(key) || { exposures: 0, hits: 0 };
    row.exposures++;
    row.hits += Number(hit);
    map.set(key, row);
}

function createModel(strategyIds) {
    return {
        strategyIds,
        observations: 0,
        hits: 0,
        byVote: new Map(),
        byMask: new Map(),
        byStrategyState: strategyIds.map(() => ({
            safe: { exposures: 0, hits: 0 },
            excluded: { exposures: 0, hits: 0 }
        }))
    };
}

function updateModel(model, row) {
    for (const number of ALL_NUMBERS) {
        const hit = Number(row.actual) === number;
        const membership = buildMembership(row, model.strategyIds, number);
        model.observations++;
        model.hits += Number(hit);
        incrementCount(model.byVote, membership.votes, hit);
        incrementCount(model.byMask, membership.mask, hit);
        model.strategyIds.forEach((_, index) => {
            const state = membership.mask & (1 << index) ? 'safe' : 'excluded';
            model.byStrategyState[index][state].exposures++;
            model.byStrategyState[index][state].hits += Number(hit);
        });
    }
}

function trainModel(rows, strategyIds) {
    const model = createModel(strategyIds);
    rows.forEach(row => updateModel(model, row));
    return model;
}

function posterior(counts, priorMean, priorWeight) {
    const row = counts || { exposures: 0, hits: 0 };
    return (row.hits + priorMean * priorWeight) / (row.exposures + priorWeight);
}

function probabilityFor(model, membership, config) {
    const voteProbability = posterior(
        model.byVote.get(membership.votes),
        GLOBAL_RATE,
        config.votePrior
    );
    if (config.type === 'vote') return voteProbability;
    if (config.type === 'mask') {
        return posterior(
            model.byMask.get(membership.mask),
            voteProbability,
            config.maskPrior
        );
    }
    if (config.type === 'naiveBayes') {
        let logRelativeRisk = 0;
        model.strategyIds.forEach((_, index) => {
            const state = membership.mask & (1 << index) ? 'safe' : 'excluded';
            const stateProbability = posterior(
                model.byStrategyState[index][state],
                GLOBAL_RATE,
                config.strategyPrior
            );
            logRelativeRisk += Math.log(Math.max(0.1, stateProbability / GLOBAL_RATE));
        });
        const capped = Math.max(-4, Math.min(4, logRelativeRisk / model.strategyIds.length));
        return GLOBAL_RATE * Math.exp(capped);
    }
    throw new Error(`Loại mô hình không hỗ trợ: ${config.type}`);
}

function predict(model, row, config) {
    return ALL_NUMBERS.map(number => {
        const membership = buildMembership(row, model.strategyIds, number);
        return {
            number,
            votes: membership.votes,
            probability: probabilityFor(model, membership, config)
        };
    }).sort((a, b) => (
        b.probability - a.probability ||
        b.votes - a.votes ||
        a.number - b.number
    )).slice(0, BET_COUNT).map(row => row.number).sort((a, b) => a - b);
}

function walkForward(initialRows, evaluationRows, strategyIds, config) {
    const model = trainModel(initialRows, strategyIds);
    const predictions = new Map();
    for (const row of evaluationRows) {
        predictions.set(row.date, predict(model, row, config));
        updateModel(model, row);
    }
    return summarize(evaluationRows, row => predictions.get(row.date));
}

function compact(summary) {
    const { rows, monthly, ...result } = summary;
    return result;
}

function validationScore(summary) {
    return summary.hitRate -
        summary.monthlyStdDev * 0.3 -
        (summary.longestLoss / summary.days) * 0.2;
}

function configurations() {
    const configs = [];
    for (const votePrior of [100, 300, 1000, 3000]) {
        configs.push({ id: `vote-v${votePrior}`, type: 'vote', votePrior });
        for (const maskPrior of [20, 50, 100, 300, 1000]) {
            configs.push({
                id: `mask-v${votePrior}-m${maskPrior}`,
                type: 'mask',
                votePrior,
                maskPrior
            });
        }
    }
    for (const strategyPrior of [100, 300, 1000, 3000]) {
        configs.push({
            id: `naiveBayes-s${strategyPrior}`,
            type: 'naiveBayes',
            strategyPrior
        });
    }
    return configs;
}

function run(options) {
    if (!options.train.length || !options.validation.length || !options.test.length) {
        throw new Error('Cần truyền đủ --train, --validation và --test.');
    }
    const trainRows = loadRows(options.train);
    const validationRows = loadRows(options.validation);
    const testRows = loadRows(options.test);
    const coverage = {
        train: validateFullCoverage(trainRows, options.raw, 'Train'),
        validation: validateFullCoverage(validationRows, options.raw, 'Validation'),
        test: validateFullCoverage(testRows, options.raw, 'Test')
    };
    const strategyIds = getStrategyIds([...trainRows, ...validationRows, ...testRows]);
    const validation = configurations().map(config => {
        const summary = walkForward(trainRows, validationRows, strategyIds, config);
        return {
            config,
            selectionScore: validationScore(summary),
            ...compact(summary)
        };
    }).sort((a, b) => (
        b.selectionScore - a.selectionScore ||
        b.hitRate - a.hitRate ||
        b.profitK - a.profitK
    ));
    const selected = validation[0];
    const test = walkForward(
        [...trainRows, ...validationRows],
        testRows,
        strategyIds,
        selected.config
    );
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            train: '2024 học posterior xác suất theo chữ ký đồng thuận.',
            validation: '2025 chọn đúng một cấu hình làm trơn.',
            test: 'Khóa cấu hình, huấn luyện lại bằng 2024-2025 rồi walk-forward toàn bộ 2026.',
            pointInTime: 'Sau mỗi ngày chỉ cập nhật mô hình khi kết quả ngày đó đã có.'
        },
        coverage,
        strategyIds,
        selectedValidation: selected,
        lockedTest: compact(test),
        validationRanking: validation
    };
    const outputPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_pit_membership_calibration_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    return { outputPath, report };
}

if (require.main === module) {
    try {
        const { outputPath, report } = run(parseArgs());
        console.log(JSON.stringify({
            outputPath,
            coverage: report.coverage,
            selectedValidation: report.selectedValidation,
            lockedTest: report.lockedTest,
            validationTop: report.validationRanking.slice(0, 10)
        }, null, 2));
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}

module.exports = {
    buildMembership,
    configurations,
    createModel,
    posterior,
    predict,
    probabilityFor,
    run,
    trainModel,
    updateModel,
    walkForward
};
