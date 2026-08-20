#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        train: args.get('train'),
        validation: args.get('validation'),
        test: args.get('test'),
        target: Number(args.get('target') || 70),
        stakeK: Number(args.get('stakeK') || 1000),
        payoutMultiplier: Number(args.get('payoutMultiplier') || 84)
    };
}

function loadRows(file) {
    const payload = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const rows = (payload.rows || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length || !rows.every(row => Array.isArray(row.numberEvidence))) {
        throw new Error(`Report không có numberEvidence đầy đủ: ${file}`);
    }
    return rows;
}

function buildDictionary(rows, minDays = 30) {
    const daysByGroup = new Map();
    for (const row of rows) {
        const seen = new Set();
        for (const evidence of row.numberEvidence) {
            for (const group of Object.keys(evidence.groups || {})) seen.add(group);
        }
        for (const group of seen) daysByGroup.set(group, (daysByGroup.get(group) || 0) + 1);
    }
    const keys = [...daysByGroup.entries()]
        .filter(([, days]) => days >= minDays)
        .map(([group]) => `group:${group}`)
        .sort();
    keys.push(
        'meta:supportGroups',
        'meta:supportFamilies',
        'meta:activeRatio',
        'meta:potentialRatio',
        'meta:tier1Ratio',
        'meta:independentSets',
        'meta:minSetSize',
        'meta:meanSetSize',
        'meta:maxStrength',
        'meta:meanStrength'
    );
    return new Map(keys.map((key, index) => [key, index]));
}

function vectorizeEvidence(evidence, dictionary) {
    const values = new Map();
    for (const [group, strength] of Object.entries(evidence.groups || {})) {
        const index = dictionary.get(`group:${group}`);
        if (index !== undefined) values.set(index, Number(strength || 0));
    }
    const independent = Math.max(1, Number(evidence.independentSets || 0));
    const meta = {
        'meta:supportGroups': Math.min(1, Number(evidence.supportGroups || 0) / 20),
        'meta:supportFamilies': Math.min(1, Number(evidence.supportFamilies || 0) / 10),
        'meta:activeRatio': Number(evidence.activeSets || 0) / independent,
        'meta:potentialRatio': Number(evidence.potentialSets || 0) / independent,
        'meta:tier1Ratio': Number(evidence.tier1Sets || 0) / independent,
        'meta:independentSets': Math.min(1, Math.log1p(independent) / Math.log(200)),
        'meta:minSetSize': Math.min(1, Number(evidence.minSetSize || 100) / 100),
        'meta:meanSetSize': Math.min(1, Number(evidence.meanSetSize || 100) / 100),
        'meta:maxStrength': Number(evidence.maxStrength || 0),
        'meta:meanStrength': Number(evidence.meanStrength || 0)
    };
    for (const [key, value] of Object.entries(meta)) {
        const index = dictionary.get(key);
        if (index !== undefined && Number.isFinite(value)) values.set(index, value);
    }
    return [...values.entries()];
}

function vectorizeRows(rows, dictionary) {
    return rows.map(row => {
        const numbers = row.numberEvidence.map(evidence => ({
            number: Number(evidence.number),
            features: vectorizeEvidence(evidence, dictionary)
        })).sort((a, b) => a.number - b.number);
        if (numbers.length !== 100 || numbers.some((item, index) => item.number !== index)) {
            throw new Error(`numberEvidence khong du 00..99 tai ${row.date}`);
        }
        return {
            date: row.date,
            actual: Number(row.actual),
            strategies: row.strategies,
            numbers
        };
    });
}

function dot(weights, features) {
    let result = 0;
    for (const [index, value] of features) result += weights[index] * value;
    return result;
}

function softmaxScores(weights, row) {
    const raw = row.numbers.map(item => dot(weights, item.features));
    const max = Math.max(...raw);
    const exp = raw.map(value => Math.exp(Math.max(-30, Math.min(30, value - max))));
    const total = exp.reduce((sum, value) => sum + value, 0);
    return exp.map(value => value / Math.max(1e-12, total));
}

function train(rows, dimensions, config) {
    const weights = new Float64Array(dimensions);
    for (let epoch = 0; epoch < config.epochs; epoch++) {
        const learningRate = config.learningRate / Math.sqrt(epoch + 1);
        for (const row of rows) {
            const probabilities = softmaxScores(weights, row);
            const decay = Math.max(0, 1 - learningRate * config.l2);
            for (let index = 0; index < weights.length; index++) weights[index] *= decay;
            for (let position = 0; position < row.numbers.length; position++) {
                const item = row.numbers[position];
                const coefficient = probabilities[position] - Number(item.number === row.actual);
                for (const [index, value] of item.features) {
                    weights[index] -= learningRate * coefficient * value;
                }
            }
        }
    }
    return weights;
}

function summarize(id, rows, weights, options) {
    let wins = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let current = null;
    let currentLength = 0;
    const details = [];
    for (const row of rows) {
        const probabilities = softmaxScores(weights, row);
        const betNumbers = row.numbers
            .map((item, position) => ({ number: item.number, probability: probabilities[position] }))
            .sort((a, b) => b.probability - a.probability || a.number - b.number)
            .slice(0, 100 - options.target)
            .map(item => item.number)
            .sort((a, b) => a - b);
        const win = betNumbers.includes(row.actual);
        wins += Number(win);
        const type = win ? 'win' : 'loss';
        if (type === current) currentLength++;
        else {
            current = type;
            currentLength = 1;
        }
        longestWin = Math.max(longestWin, type === 'win' ? currentLength : 0);
        longestLoss = Math.max(longestLoss, type === 'loss' ? currentLength : 0);
        details.push({ date: row.date, actual: row.actual, win, betNumbers });
    }
    const stakeK = rows.length * (100 - options.target) * options.stakeK;
    const payoutK = wins * options.payoutMultiplier * options.stakeK;
    return {
        id,
        days: rows.length,
        wins,
        losses: rows.length - wins,
        hitRate: wins / rows.length,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: (payoutK - stakeK) / stakeK,
        longestWin,
        longestLoss,
        rows: details
    };
}

function summarizeBaseline(id, rows, options) {
    let wins = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let current = null;
    let currentLength = 0;
    for (const row of rows) {
        const win = (row.strategies?.[id] || []).includes(row.actual);
        wins += Number(win);
        const type = win ? 'win' : 'loss';
        if (current === type) currentLength++;
        else {
            current = type;
            currentLength = 1;
        }
        longestWin = Math.max(longestWin, type === 'win' ? currentLength : 0);
        longestLoss = Math.max(longestLoss, type === 'loss' ? currentLength : 0);
    }
    const stakeK = rows.length * (100 - options.target) * options.stakeK;
    const payoutK = wins * options.payoutMultiplier * options.stakeK;
    return {
        id,
        days: rows.length,
        wins,
        hitRate: wins / rows.length,
        profitK: payoutK - stakeK,
        roi: (payoutK - stakeK) / stakeK,
        longestWin,
        longestLoss
    };
}

function compact(summary) {
    const { rows, ...result } = summary;
    return result;
}

function main() {
    const options = parseArgs();
    if (!options.train || !options.validation || !options.test) {
        throw new Error('Cần --train, --validation và --test.');
    }
    const trainRaw = loadRows(options.train);
    const validationRaw = loadRows(options.validation);
    const testRaw = loadRows(options.test);
    const dictionary = buildDictionary(trainRaw, 30);
    const trainRows = vectorizeRows(trainRaw, dictionary);
    const validationRows = vectorizeRows(validationRaw, dictionary);
    const testRows = vectorizeRows(testRaw, dictionary);
    const configs = [];
    for (const learningRate of [0.01, 0.03, 0.06]) {
        for (const l2 of [0.001, 0.01]) {
            for (const epochs of [3, 8]) configs.push({ learningRate, l2, epochs });
        }
    }
    const validationRanking = configs.map(config => {
        const weights = train(trainRows, dictionary.size, config);
        return { config, summary: summarize('softmax', validationRows, weights, options) };
    }).sort((a, b) => b.summary.profitK - a.summary.profitK || b.summary.hitRate - a.summary.hitRate);
    const selected = validationRanking[0].config;

    // Dictionary and weights are rebuilt with training+validation only. No 2026
    // result or feature frequency is used before the frozen test.
    const refitRaw = [...trainRaw, ...validationRaw].sort((a, b) => a.date.localeCompare(b.date));
    const refitDictionary = buildDictionary(refitRaw, 30);
    const refitRows = vectorizeRows(refitRaw, refitDictionary);
    const frozenTestRows = vectorizeRows(testRaw, refitDictionary);
    const weights = train(refitRows, refitDictionary.size, selected);
    const testSummary = summarize('crossYearSoftmax', frozenTestRows, weights, options);
    const baselines = Object.keys(testRaw[0].strategies || {})
        .map(id => summarizeBaseline(id, testRaw, options))
        .sort((a, b) => b.profitK - a.profitK || b.hitRate - a.hitRate);
    const featureWeights = [...refitDictionary.entries()]
        .map(([feature, index]) => ({ feature, weight: weights[index] }))
        .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    const report = {
        generatedAt: new Date().toISOString(),
        source: {
            train: path.resolve(options.train),
            validation: path.resolve(options.validation),
            test: path.resolve(options.test)
        },
        methodology: {
            trainDates: [trainRaw[0].date, trainRaw.at(-1).date],
            validationDates: [validationRaw[0].date, validationRaw.at(-1).date],
            frozenTestDates: [testRaw[0].date, testRaw.at(-1).date],
            target: options.target,
            betCount: 100 - options.target,
            selection: 'Softmax học 2024, chọn learning-rate/L2/epoch trên 2025, refit 2024+2025, đóng băng trước 2026.'
        },
        selected,
        validationRanking: validationRanking.map(row => ({ config: row.config, summary: compact(row.summary) })),
        testSummary,
        baselines,
        strongestWeights: featureWeights.slice(0, 50)
    };
    const reportPath = path.join(
        process.cwd(),
        'reports',
        `research_cross_year_softmax_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        dictionarySize: refitDictionary.size,
        selected,
        validationWinner: compact(validationRanking[0].summary),
        testSummary: compact(testSummary),
        bestBaseline: baselines[0],
        strongestWeights: featureWeights.slice(0, 10)
    }, null, 2));
}

main();
