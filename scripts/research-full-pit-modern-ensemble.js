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

function formatIsoDate(value) {
    const match = String(value || '').match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
}

function sigmoid(value) {
    if (value >= 0) {
        const z = Math.exp(-Math.min(30, value));
        return 1 / (1 + z);
    }
    const z = Math.exp(Math.max(-30, value));
    return z / (1 + z);
}

function dot(left, right) {
    let result = 0;
    for (let index = 0; index < left.length; index++) result += left[index] * right[index];
    return result;
}

function buildRawIndex(rawPath) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(rawPath), 'utf8'))
        .map(row => ({ date: formatIsoDate(row.date), actual: Number(row.special) }))
        .filter(row => row.date && Number.isInteger(row.actual))
        .sort((a, b) => a.date.localeCompare(b.date));
    const indexByDate = new Map(raw.map((row, index) => [row.date, index]));
    const prefix = Array.from({ length: 100 }, () => new Uint32Array(raw.length + 1));
    const previousOccurrence = Array.from({ length: raw.length }, () => new Int32Array(100).fill(-1));
    const lastSeen = new Int32Array(100).fill(-1);
    for (let index = 0; index < raw.length; index++) {
        for (let number = 0; number < 100; number++) {
            prefix[number][index + 1] = prefix[number][index] + Number(raw[index].actual === number);
            previousOccurrence[index][number] = lastSeen[number];
        }
        lastSeen[raw[index].actual] = index;
    }
    return { raw, indexByDate, prefix, previousOccurrence };
}

function windowRate(rawIndex, date, number, window) {
    const index = rawIndex.indexByDate.get(date);
    const start = Math.max(0, index - window);
    const observations = index - start;
    if (observations <= 0) return 0;
    const count = rawIndex.prefix[number][index] - rawIndex.prefix[number][start];
    return count / observations;
}

function getStrategyIds(rows) {
    return Object.keys(rows[0]?.strategies || {}).filter(id => (
        rows.every(row => Array.isArray(row.strategies?.[id]))
    ));
}

function buildFeatures(row, number, strategyIds, rawIndex) {
    const votes = strategyIds.map(id => Number((row.strategies[id] || []).includes(number)));
    const voteRate = votes.reduce((sum, value) => sum + value, 0) / votes.length;
    const rawPosition = rawIndex.indexByDate.get(row.date);
    const previous = rawIndex.previousOccurrence[rawPosition][number];
    const gap = previous >= 0 ? Math.min(1, (rawPosition - previous) / 365) : 1;
    const lifetimeRate = rawPosition > 0
        ? rawIndex.prefix[number][rawPosition] / rawPosition
        : 0.01;
    const byId = Object.fromEntries(strategyIds.map((id, index) => [id, votes[index]]));
    return [
        1,
        ...votes,
        voteRate,
        windowRate(rawIndex, row.date, number, 7) * 7,
        windowRate(rawIndex, row.date, number, 30) * 30,
        windowRate(rawIndex, row.date, number, 90) * 30,
        windowRate(rawIndex, row.date, number, 365) * 30,
        gap,
        lifetimeRate * 100,
        (byId.chainSmallFirst || 0) * (byId.numberAvgRisk || 0),
        (byId.chainSmallFirst || 0) * (byId.numberConsensusRisk || 0),
        (byId.chainBlockFirst || 0) * (byId.numberAvgRisk || 0),
        (byId.numberAvgRisk || 0) * (byId.numberConsensusRisk || 0)
    ];
}

function precompute(rows, strategyIds, rawIndex) {
    return rows.map(row => ({
        row,
        features: ALL_NUMBERS.map(number => buildFeatures(
            row,
            number,
            strategyIds,
            rawIndex
        ))
    }));
}

function trainPairwise(precomputedRows, config) {
    const featureLength = precomputedRows[0].features[0].length;
    const weights = Array(featureLength).fill(0);
    for (let epoch = 0; epoch < config.epochs; epoch++) {
        for (const item of precomputedRows) {
            const positive = item.features[Number(item.row.actual)];
            for (const number of ALL_NUMBERS) {
                if (number === Number(item.row.actual)) continue;
                const negative = item.features[number];
                let margin = 0;
                for (let index = 0; index < featureLength; index++) {
                    margin += weights[index] * (positive[index] - negative[index]);
                }
                const error = 1 - sigmoid(margin);
                for (let index = 0; index < featureLength; index++) {
                    const difference = positive[index] - negative[index];
                    weights[index] += config.learningRate * (
                        error * difference - config.l2 * weights[index]
                    );
                }
            }
        }
    }
    return weights;
}

function scorePrediction(item, weights) {
    const scored = ALL_NUMBERS.map(number => ({
        number,
        score: dot(weights, item.features[number])
    })).sort((a, b) => b.score - a.score || a.number - b.number);
    const scores = scored.map(row => row.score);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const stdDev = Math.sqrt(
        scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length
    ) || 1;
    return {
        betNumbers: scored.slice(0, BET_COUNT).map(row => row.number).sort((a, b) => a - b),
        confidence: (scored[BET_COUNT - 1].score - scored[BET_COUNT].score) / stdDev
    };
}

function evaluate(precomputedRows, weights, confidenceThreshold = -Infinity) {
    const predictions = new Map();
    const selectedRows = [];
    const confidenceRows = [];
    for (const item of precomputedRows) {
        const prediction = scorePrediction(item, weights);
        confidenceRows.push({
            date: item.row.date,
            actual: item.row.actual,
            confidence: prediction.confidence,
            betNumbers: prediction.betNumbers,
            win: prediction.betNumbers.includes(Number(item.row.actual))
        });
        if (prediction.confidence >= confidenceThreshold) {
            selectedRows.push(item.row);
            predictions.set(item.row.date, prediction.betNumbers);
        }
    }
    const summary = selectedRows.length
        ? summarize(selectedRows, row => predictions.get(row.date))
        : {
            days: 0,
            wins: 0,
            losses: 0,
            hitRate: 0,
            stakeK: 0,
            profitK: 0,
            roi: 0,
            profitableMonths: 0,
            months: 0,
            minimumMonthlyHitRate: 0,
            monthlyStdDev: 0,
            longestWin: 0,
            longestLoss: 0,
            monthly: [],
            rows: []
        };
    return { summary, confidenceRows };
}

function compact(summary) {
    const { rows, monthly, ...result } = summary;
    return result;
}

function configs() {
    const rows = [];
    for (const learningRate of [0.0005, 0.001, 0.002, 0.005]) {
        for (const l2 of [0.0005, 0.002, 0.01]) {
            for (const epochs of [2, 5]) rows.push({ learningRate, l2, epochs });
        }
    }
    return rows;
}

function quantile(values, probability) {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.floor((sorted.length - 1) * probability))
    );
    return sorted[index];
}

function selectConfidenceThreshold(precomputedRows, weights) {
    const base = evaluate(precomputedRows, weights);
    const confidenceValues = base.confidenceRows.map(row => row.confidence);
    const candidates = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
        .map(probability => {
            const threshold = quantile(confidenceValues, probability);
            const result = evaluate(precomputedRows, weights, threshold).summary;
            return { probability, threshold, ...compact(result) };
        })
        .sort((a, b) => (
            Number(b.hitRate >= 0.6) - Number(a.hitRate >= 0.6) ||
            (b.hitRate >= 0.6 ? b.days - a.days : b.hitRate - a.hitRate) ||
            b.profitK - a.profitK
        ));
    return { selected: candidates[0], candidates };
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
    const rawIndex = buildRawIndex(options.raw);
    const validationSplit = Math.floor(validationRows.length / 2);
    const validationModelRows = validationRows.slice(0, validationSplit);
    const validationThresholdRows = validationRows.slice(validationSplit);
    const trainComputed = precompute(trainRows, strategyIds, rawIndex);
    const validationModelComputed = precompute(validationModelRows, strategyIds, rawIndex);
    const modelSelection = configs().map(config => {
        const weights = trainPairwise(trainComputed, config);
        const result = evaluate(validationModelComputed, weights).summary;
        return { config, ...compact(result) };
    }).sort((a, b) => b.hitRate - a.hitRate || b.profitK - a.profitK);
    const selectedConfig = modelSelection[0].config;
    const thresholdTrainRows = [...trainRows, ...validationModelRows];
    const thresholdWeights = trainPairwise(
        precompute(thresholdTrainRows, strategyIds, rawIndex),
        selectedConfig
    );
    const thresholdSelection = selectConfidenceThreshold(
        precompute(validationThresholdRows, strategyIds, rawIndex),
        thresholdWeights
    );
    const finalWeights = trainPairwise(
        precompute([...trainRows, ...validationRows], strategyIds, rawIndex),
        selectedConfig
    );
    const testComputed = precompute(testRows, strategyIds, rawIndex);
    const allDaysTest = evaluate(testComputed, finalWeights).summary;
    const selectiveTest = evaluate(
        testComputed,
        finalWeights,
        thresholdSelection.selected.threshold
    ).summary;
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            train: 'Toàn bộ 2024 huấn luyện mô hình xếp hạng pairwise.',
            modelValidation: 'Nửa đầu 2025 chọn siêu tham số.',
            confidenceValidation: 'Nửa cuối 2025 chọn ngưỡng từ chối đánh.',
            holdout: 'Khóa toàn bộ rồi kiểm định đủ ngày 2026.',
            features: '9 phương pháp chuỗi + đồng thuận + tần suất 7/30/90/365 + gap + tần suất dài hạn.'
        },
        coverage,
        strategyIds,
        selectedConfig,
        modelSelection,
        thresholdSelection,
        allDaysTest: compact(allDaysTest),
        selectiveTest: compact(selectiveTest)
    };
    const outputPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_full_pit_modern_ensemble_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
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
            selectedConfig: report.selectedConfig,
            modelValidationTop: report.modelSelection.slice(0, 5),
            selectedConfidence: report.thresholdSelection.selected,
            allDaysTest: report.allDaysTest,
            selectiveTest: report.selectiveTest
        }, null, 2));
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
}

module.exports = {
    buildFeatures,
    buildRawIndex,
    evaluate,
    scorePrediction,
    selectConfidenceThreshold,
    trainPairwise
};
