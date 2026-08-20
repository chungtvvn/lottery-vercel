#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BET_COUNT = 30;
const STAKE_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const EPSILON = 1e-9;

function parseArgs(argv) {
    const values = {};
    for (const token of argv.slice(2)) {
        if (!token.startsWith('--')) continue;
        const [key, ...rest] = token.slice(2).split('=');
        values[key] = rest.join('=');
    }
    return values;
}

function loadReport(filename) {
    return JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
}

function sourceFiles(indexFile) {
    const index = loadReport(indexFile);
    return new Map(index.sourceReports.map(item => [
        Number(item.year),
        path.resolve(path.dirname(indexFile), item.file)
    ]));
}

function strategyIdsFromFile(filename) {
    const report = loadReport(filename);
    return Object.keys(report.rows[0].strategies)
        .filter(id => report.rows.every(row => Array.isArray(row.strategies[id])))
        .sort();
}

function membershipMask(row, number, strategyIds) {
    let mask = 0;
    for (let index = 0; index < strategyIds.length; index++) {
        if (row.strategies[strategyIds[index]].includes(number)) {
            mask |= (1 << index);
        }
    }
    return mask;
}

function readRows(files, years, strategyIds) {
    const rows = [];
    for (const year of years) {
        const report = loadReport(files.get(year));
        for (const row of report.rows) {
            const masks = Array.from(
                { length: 100 },
                (_, number) => membershipMask(row, number, strategyIds)
            );
            rows.push({
                date: row.date,
                actual: Number(row.actual),
                masks
            });
        }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function aggregateMasks(rows) {
    const aggregates = new Map();
    for (const row of rows) {
        for (let number = 0; number < 100; number++) {
            const mask = row.masks[number];
            const current = aggregates.get(mask) || { total: 0, hits: 0 };
            current.total++;
            current.hits += Number(number === row.actual);
            aggregates.set(mask, current);
        }
    }
    return aggregates;
}

function fitMaskPosterior(rows, priorStrength) {
    const aggregates = aggregateMasks(rows);
    const globalRate = 0.01;
    return mask => {
        const value = aggregates.get(mask) || { total: 0, hits: 0 };
        return (value.hits + priorStrength * globalRate) /
            (value.total + priorStrength);
    };
}

function sigmoid(value) {
    if (value >= 0) return 1 / (1 + Math.exp(-value));
    const exponential = Math.exp(value);
    return exponential / (1 + exponential);
}

function maskFeatures(mask, featureCount) {
    const values = [1];
    for (let index = 0; index < featureCount; index++) {
        values.push(Number(Boolean(mask & (1 << index))));
    }
    return values;
}

function fitLogistic(rows, strategyCount, l2) {
    const aggregates = aggregateMasks(rows);
    const entries = Array.from(aggregates.entries()).map(([mask, value]) => ({
        features: maskFeatures(mask, strategyCount),
        total: value.total,
        hits: value.hits
    }));
    const weights = Array(strategyCount + 1).fill(0);
    weights[0] = Math.log(0.01 / 0.99);
    const moments = weights.map(() => 0);
    const velocities = weights.map(() => 0);
    const beta1 = 0.9;
    const beta2 = 0.999;
    const learningRate = 0.08;
    const totalObservations = entries.reduce((sum, item) => sum + item.total, 0);

    for (let iteration = 1; iteration <= 1200; iteration++) {
        const gradient = weights.map(() => 0);
        for (const entry of entries) {
            const linear = entry.features.reduce(
                (sum, feature, index) => sum + feature * weights[index],
                0
            );
            const probability = sigmoid(linear);
            const error = probability * entry.total - entry.hits;
            for (let index = 0; index < gradient.length; index++) {
                gradient[index] += error * entry.features[index];
            }
        }
        for (let index = 0; index < weights.length; index++) {
            gradient[index] /= totalObservations;
            if (index > 0) gradient[index] += l2 * weights[index] / totalObservations;
            moments[index] = beta1 * moments[index] + (1 - beta1) * gradient[index];
            velocities[index] = beta2 * velocities[index] +
                (1 - beta2) * gradient[index] * gradient[index];
            const correctedMoment = moments[index] / (1 - Math.pow(beta1, iteration));
            const correctedVelocity = velocities[index] / (1 - Math.pow(beta2, iteration));
            weights[index] -= learningRate * correctedMoment /
                (Math.sqrt(correctedVelocity) + 1e-8);
        }
    }
    return {
        predict(mask) {
            const features = maskFeatures(mask, strategyCount);
            return sigmoid(features.reduce(
                (sum, feature, index) => sum + feature * weights[index],
                0
            ));
        },
        weights
    };
}

function logLoss(rows, predict) {
    let loss = 0;
    let count = 0;
    for (const row of rows) {
        for (let number = 0; number < 100; number++) {
            const probability = Math.min(
                1 - EPSILON,
                Math.max(EPSILON, predict(row.masks[number]))
            );
            const actual = Number(number === row.actual);
            loss -= actual * Math.log(probability) +
                (1 - actual) * Math.log(1 - probability);
            count++;
        }
    }
    return loss / count;
}

function longestStreak(values, target) {
    let current = 0;
    let longest = 0;
    for (const value of values) {
        current = value === target ? current + 1 : 0;
        longest = Math.max(longest, current);
    }
    return longest;
}

function summarize(rows, predict, betCount = BET_COUNT) {
    const details = rows.map(row => {
        const ranking = row.masks.map((mask, number) => ({
            number,
            probability: predict(mask)
        })).sort((a, b) =>
            b.probability - a.probability ||
            a.number - b.number
        );
        const betNumbers = ranking.slice(0, betCount).map(item => item.number);
        return {
            date: row.date,
            actual: row.actual,
            win: betNumbers.includes(row.actual),
            betNumbers
        };
    });
    const wins = details.filter(row => row.win).length;
    const stakeK = details.length * betCount * STAKE_K;
    const profitK = wins * PAYOUT_MULTIPLIER * STAKE_K - stakeK;
    return {
        days: details.length,
        betCount,
        wins,
        hitRate: wins / details.length,
        stakeK,
        profitK,
        roi: profitK / stakeK,
        longestWin: longestStreak(details.map(row => row.win), true),
        longestLoss: longestStreak(details.map(row => row.win), false),
        rows: details
    };
}

function compact(summary) {
    const { rows, ...values } = summary;
    return values;
}

function main() {
    const args = parseArgs(process.argv);
    const indexFile = path.resolve(
        args.index || 'reports/strict_pit_all_methods_2016_2026.json'
    );
    const files = sourceFiles(indexFile);
    const strategyIds = strategyIdsFromFile(files.get(2016));
    const trainingRows = readRows(
        files,
        [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
        strategyIds
    );
    const selectionRows = readRows(files, [2024], strategyIds);
    const validationRows = readRows(files, [2025], strategyIds);
    const testRows = readRows(files, [2026], strategyIds);

    const candidates = [];
    for (const priorStrength of [10, 30, 100, 300, 1000, 3000]) {
        const predict = fitMaskPosterior(trainingRows, priorStrength);
        candidates.push({
            type: 'mask-posterior',
            parameter: priorStrength,
            selectionLogLoss: logLoss(selectionRows, predict),
            predict
        });
    }
    for (const l2 of [0, 1, 10, 100, 1000]) {
        const model = fitLogistic(trainingRows, strategyIds.length, l2);
        candidates.push({
            type: 'logistic-membership',
            parameter: l2,
            selectionLogLoss: logLoss(selectionRows, model.predict),
            predict: model.predict,
            weights: model.weights
        });
    }
    candidates.sort((a, b) => a.selectionLogLoss - b.selectionLogLoss);
    const selected = candidates[0];
    const countSelection = [];
    for (let betCount = 5; betCount <= 65; betCount++) {
        countSelection.push({
            betCount,
            selection: compact(summarize(selectionRows, selected.predict, betCount))
        });
    }
    countSelection.sort((a, b) =>
        b.selection.profitK - a.selection.profitK ||
        b.selection.hitRate - a.selection.hitRate ||
        a.betCount - b.betCount
    );
    const selectedBetCount = countSelection[0].betCount;
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            training: '2016-2023 strict PIT',
            modelSelection: '2024 log-loss only',
            validation: '2025 untouched',
            test: '2026 untouched',
            economics: 'Hold70, 30 bets/day, 1000K/number, payout 84',
            strategyIds
        },
        selected: {
            type: selected.type,
            parameter: selected.parameter,
            selectionLogLoss: selected.selectionLogLoss,
            weights: selected.weights || null,
            betCount: selectedBetCount,
            betCountSelectionRule: 'Max profit on 2024 only; frozen before 2025/2026.'
        },
        candidateSelection: candidates.map(candidate => ({
            type: candidate.type,
            parameter: candidate.parameter,
            selectionLogLoss: candidate.selectionLogLoss
        })),
        countSelection,
        training: compact(summarize(trainingRows, selected.predict, selectedBetCount)),
        selection: compact(summarize(selectionRows, selected.predict, selectedBetCount)),
        validation: summarize(validationRows, selected.predict, selectedBetCount),
        test: summarize(testRows, selected.predict, selectedBetCount)
    };
    const output = path.join(
        __dirname,
        '..',
        'reports',
        `research_pit_membership_calibration_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        output,
        selected: report.selected,
        training: report.training,
        selection: report.selection,
        validation: compact(report.validation),
        test: compact(report.test)
    }, null, 2));
}

main();
