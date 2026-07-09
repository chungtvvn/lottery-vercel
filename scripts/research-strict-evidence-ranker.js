#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
    hashCanonical,
    hashSourceFiles
} = require('../lib/utils/backtestFingerprint');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const METHOD_ID = 'strictEvidenceRankerHold70';
const BASELINE_ID = 'chainSmallFirstHold70';
const TARGET_EXCLUDED = 70;
const BET_COUNT = 30;
const BET_PER_NUMBER_K = 1000;
const WIN_MULTIPLIER = 84;

const HYPERPARAMETERS = [
    { learningRate: 0.005, l2: 0.01, epochs: 4 },
    { learningRate: 0.01, l2: 0.03, epochs: 4 },
    { learningRate: 0.015, l2: 0.05, epochs: 6 },
    { learningRate: 0.025, l2: 0.08, epochs: 6 },
    { learningRate: 0.04, l2: 0.12, epochs: 8 }
];

function parseArgs(argv = process.argv.slice(2)) {
    const args = new Map(argv.map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    const splitFiles = key => String(args.get(key) || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    return {
        train2024: splitFiles('train2024'),
        train2025: splitFiles('train2025'),
        test2026: splitFiles('test2026')
    };
}

function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function loadRows(files) {
    const byDate = new Map();
    for (const filename of files) {
        const report = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
        for (const row of report.rows || []) {
            if (!Array.isArray(row.numberEvidence) || row.numberEvidence.length !== 100) {
                throw new Error(`Report ${filename} thiếu strict numberEvidence ngày ${row.date}.`);
            }
            byDate.set(row.date, row);
        }
    }
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function buildDictionary(rows) {
    const families = new Set();
    const patterns = new Set();
    const strategies = new Set();
    for (const row of rows) {
        Object.keys(row.strategies || {}).forEach(id => strategies.add(id));
        for (const evidence of row.numberEvidence || []) {
            for (const group of Object.keys(evidence.groups || {})) {
                const [family, pattern = 'other'] = group.split('|');
                families.add(family || 'other');
                patterns.add(pattern);
            }
        }
    }
    return {
        families: [...families].sort(),
        patterns: [...patterns].sort(),
        strategies: [...strategies].sort()
    };
}

function buildFeatureSchema(dictionary) {
    const aggregate = [
        'supportGroups',
        'supportFamilies',
        'activeGroups',
        'potentialGroups',
        'tier1Groups',
        'independentSets',
        'activeSets',
        'potentialSets',
        'tier1Sets',
        'minSetSize',
        'meanSetSize',
        'evidenceMass',
        'maxStrength',
        'meanStrength',
        'activeRatio',
        'potentialRatio',
        'tier1Ratio',
        'activeSetRatio',
        'potentialSetRatio',
        'tier1SetRatio'
    ];
    const family = dictionary.families.map(value => `family:${value}`);
    const familyMass = dictionary.families.map(value => `familyMass:${value}`);
    const familyCount = dictionary.families.map(value => `familyCount:${value}`);
    const familySpecificity = dictionary.families.map(value => `familySpecificity:${value}`);
    const pattern = dictionary.patterns.map(value => `pattern:${value}`);
    const patternMass = dictionary.patterns.map(value => `patternMass:${value}`);
    const patternCount = dictionary.patterns.map(value => `patternCount:${value}`);
    const patternSpecificity = dictionary.patterns.map(value => `patternSpecificity:${value}`);
    const strategy = dictionary.strategies.map(value => `strategy:${value}`);
    const names = [
        ...aggregate,
        ...family,
        ...familyMass,
        ...familyCount,
        ...familySpecificity,
        ...pattern,
        ...patternMass,
        ...patternCount,
        ...patternSpecificity,
        ...strategy,
        'strategyVoteRate'
    ];
    const indexByName = new Map(names.map((name, index) => [name, index]));
    const indicesFor = prefixes => names
        .map((name, index) => ({ name, index }))
        .filter(row => prefixes.some(prefix => row.name === prefix || row.name.startsWith(`${prefix}:`)))
        .map(row => row.index);

    return {
        names,
        indexByName,
        featureSets: {
            aggregate: indicesFor(aggregate),
            aggregateFamily: indicesFor([...aggregate, 'family']),
            aggregatePattern: indicesFor([...aggregate, 'pattern']),
            strategyAggregate: indicesFor([...aggregate, 'strategy', 'strategyVoteRate']),
            diverseEvidence: indicesFor([
                ...aggregate,
                'family',
                'familyMass',
                'familyCount',
                'familySpecificity',
                'pattern',
                'patternMass',
                'patternCount',
                'patternSpecificity'
            ]),
            fullConservative: names.map((_, index) => index)
        }
    };
}

function normalizeCount(value, cap) {
    return clamp(Number(value || 0) / cap);
}

function buildDay(row, dictionary, schema) {
    const strategySets = new Map(dictionary.strategies.map(id => [
        id,
        new Set((row.strategies?.[id] || []).map(Number))
    ]));
    const features = ALL_NUMBERS.map(number => {
        const evidence = row.numberEvidence.find(item => Number(item.number) === number) || {};
        const groups = evidence.groups || {};
        const groupDetails = evidence.groupDetails || {};
        const familyMax = new Map(dictionary.families.map(value => [value, 0]));
        const familyMass = new Map(dictionary.families.map(value => [value, 0]));
        const familyCount = new Map(dictionary.families.map(value => [value, 0]));
        const familySpecificity = new Map(dictionary.families.map(value => [value, 0]));
        const patternMax = new Map(dictionary.patterns.map(value => [value, 0]));
        const patternMass = new Map(dictionary.patterns.map(value => [value, 0]));
        const patternCount = new Map(dictionary.patterns.map(value => [value, 0]));
        const patternSpecificity = new Map(dictionary.patterns.map(value => [value, 0]));
        for (const [group, rawStrength] of Object.entries(groups)) {
            const [family, pattern = 'other'] = group.split('|');
            const strength = clamp(rawStrength);
            const detail = groupDetails[group] || {};
            const count = Math.max(0, Number(detail.independentSets || 1));
            const mass = Math.max(0, Number(detail.combinedStrength || strength));
            const specificity = 1 - clamp((Number(detail.minSetSize || 100) - 1) / 99);
            familyMax.set(family, Math.max(familyMax.get(family) || 0, strength));
            familyMass.set(family, (familyMass.get(family) || 0) + mass);
            familyCount.set(family, (familyCount.get(family) || 0) + count);
            familySpecificity.set(
                family,
                Math.max(familySpecificity.get(family) || 0, specificity)
            );
            patternMax.set(pattern, Math.max(patternMax.get(pattern) || 0, strength));
            patternMass.set(pattern, (patternMass.get(pattern) || 0) + mass);
            patternCount.set(pattern, (patternCount.get(pattern) || 0) + count);
            patternSpecificity.set(
                pattern,
                Math.max(patternSpecificity.get(pattern) || 0, specificity)
            );
        }
        const supportGroups = Math.max(0, Number(evidence.supportGroups || 0));
        const activeGroups = Math.max(0, Number(evidence.activeGroups || 0));
        const potentialGroups = Math.max(0, Number(evidence.potentialGroups || 0));
        const tier1Groups = Math.max(0, Number(evidence.tier1Groups || 0));
        const independentSets = Math.max(0, Number(evidence.independentSets || supportGroups));
        const activeSets = Math.max(0, Number(evidence.activeSets || activeGroups));
        const potentialSets = Math.max(0, Number(evidence.potentialSets || potentialGroups));
        const tier1Sets = Math.max(0, Number(evidence.tier1Sets || tier1Groups));
        const values = [
            normalizeCount(supportGroups, 24),
            normalizeCount(evidence.supportFamilies, 10),
            normalizeCount(activeGroups, 18),
            normalizeCount(potentialGroups, 18),
            normalizeCount(tier1Groups, 18),
            normalizeCount(independentSets, 80),
            normalizeCount(activeSets, 60),
            normalizeCount(potentialSets, 60),
            normalizeCount(tier1Sets, 60),
            1 - clamp((Number(evidence.minSetSize || 100) - 1) / 99),
            1 - clamp((Number(evidence.meanSetSize || 100) - 1) / 99),
            normalizeCount(evidence.evidenceMass, 20),
            clamp(evidence.maxStrength),
            clamp(evidence.meanStrength),
            supportGroups ? clamp(activeGroups / supportGroups) : 0,
            supportGroups ? clamp(potentialGroups / supportGroups) : 0,
            supportGroups ? clamp(tier1Groups / supportGroups) : 0,
            independentSets ? clamp(activeSets / independentSets) : 0,
            independentSets ? clamp(potentialSets / independentSets) : 0,
            independentSets ? clamp(tier1Sets / independentSets) : 0,
            ...dictionary.families.map(value => familyMax.get(value) || 0),
            ...dictionary.families.map(value => normalizeCount(familyMass.get(value), 8)),
            ...dictionary.families.map(value => normalizeCount(familyCount.get(value), 30)),
            ...dictionary.families.map(value => familySpecificity.get(value) || 0),
            ...dictionary.patterns.map(value => patternMax.get(value) || 0),
            ...dictionary.patterns.map(value => normalizeCount(patternMass.get(value), 8)),
            ...dictionary.patterns.map(value => normalizeCount(patternCount.get(value), 30)),
            ...dictionary.patterns.map(value => patternSpecificity.get(value) || 0),
            ...dictionary.strategies.map(id => Number(strategySets.get(id).has(number)))
        ];
        const strategyVotes = dictionary.strategies.reduce(
            (sum, id) => sum + Number(strategySets.get(id).has(number)),
            0
        );
        values.push(strategyVotes / Math.max(1, dictionary.strategies.length));
        if (values.length !== schema.names.length) {
            throw new Error(`Sai kích thước feature ngày ${row.date}, số ${number}.`);
        }
        return values;
    });
    return {
        date: row.date,
        actual: Number(row.actual),
        features,
        strategies: row.strategies
    };
}

function computeScaler(days, indices) {
    const means = indices.map(() => 0);
    const count = Math.max(1, days.length * 100);
    for (const day of days) {
        for (const row of day.features) {
            indices.forEach((featureIndex, index) => {
                means[index] += row[featureIndex];
            });
        }
    }
    means.forEach((_, index) => {
        means[index] /= count;
    });
    const stds = indices.map(() => 0);
    for (const day of days) {
        for (const row of day.features) {
            indices.forEach((featureIndex, index) => {
                stds[index] += (row[featureIndex] - means[index]) ** 2;
            });
        }
    }
    stds.forEach((_, index) => {
        stds[index] = Math.sqrt(stds[index] / count) || 1;
    });
    return { means, stds };
}

function transform(row, indices, scaler) {
    return indices.map((featureIndex, index) =>
        (row[featureIndex] - scaler.means[index]) / scaler.stds[index]
    );
}

function sigmoid(value) {
    if (value >= 0) {
        const exp = Math.exp(-Math.min(40, value));
        return 1 / (1 + exp);
    }
    const exp = Math.exp(Math.max(-40, value));
    return exp / (1 + exp);
}

function trainPairwise(days, indices, config) {
    const scaler = computeScaler(days, indices);
    const weights = indices.map(() => 0);
    let updateCount = 0;
    for (let epoch = 0; epoch < config.epochs; epoch++) {
        for (const day of days) {
            const positive = transform(day.features[day.actual], indices, scaler);
            const gradient = weights.map(() => 0);
            for (const number of ALL_NUMBERS) {
                if (number === day.actual) continue;
                const negative = transform(day.features[number], indices, scaler);
                const difference = positive.map((value, index) => value - negative[index]);
                const margin = weights.reduce(
                    (sum, weight, index) => sum + weight * difference[index],
                    0
                );
                const error = sigmoid(margin) - 1;
                difference.forEach((value, index) => {
                    gradient[index] += error * value / 99;
                });
            }
            const learningRate = config.learningRate / Math.sqrt(1 + updateCount / 1000);
            weights.forEach((weight, index) => {
                weights[index] -= learningRate * (
                    gradient[index] + config.l2 * weight
                );
            });
            updateCount++;
        }
    }
    return { indices, scaler, weights };
}

function predict(model, features, betCount = BET_COUNT) {
    return features
        .map((row, number) => {
            const values = transform(row, model.indices, model.scaler);
            const score = model.weights.reduce(
                (sum, weight, index) => sum + weight * values[index],
                0
            );
            return { number, score };
        })
        .sort((left, right) => right.score - left.score || left.number - right.number)
        .slice(0, betCount)
        .map(row => row.number);
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        losses: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        currentType: null,
        currentLength: 0,
        rows: []
    };
}

function addResult(summary, day, betNumbers) {
    const hit = betNumbers.includes(day.actual);
    const stakeK = betNumbers.length * BET_PER_NUMBER_K;
    const payoutK = hit ? BET_PER_NUMBER_K * WIN_MULTIPLIER : 0;
    const type = hit ? 'win' : 'loss';
    summary.days++;
    summary.wins += Number(hit);
    summary.losses += Number(!hit);
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += payoutK - stakeK;
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    if (hit) summary.longestWin = Math.max(summary.longestWin, summary.currentLength);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.currentLength);
    summary.rows.push({
        date: day.date,
        actual: day.actual,
        betNumbers,
        hit,
        profitK: payoutK - stakeK
    });
}

function finalizeSummary(summary) {
    const { currentType, currentLength, ...result } = summary;
    return {
        ...result,
        betCount: BET_COUNT,
        target: TARGET_EXCLUDED,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0
    };
}

function evaluateModel(model, days, id = METHOD_ID) {
    const summary = createSummary(id);
    for (const day of days) addResult(summary, day, predict(model, day.features));
    return finalizeSummary(summary);
}

function evaluateStrategy(days, strategyId) {
    const summary = createSummary(
        strategyId === 'chainSmallFirst' ? BASELINE_ID : `${strategyId}Hold70`
    );
    for (const day of days) {
        addResult(summary, day, (day.strategies?.[strategyId] || []).map(Number));
    }
    return finalizeSummary(summary);
}

function selectConfiguration(rows2024, rows2025, featureSets) {
    const splitIndex = Math.floor(rows2024.length * 2 / 3);
    const early2024 = rows2024.slice(0, splitIndex);
    const late2024 = rows2024.slice(splitIndex);
    const candidates = [];
    for (const [featureSet, indices] of Object.entries(featureSets)) {
        for (const config of HYPERPARAMETERS) {
            const folds = [];
            const modelEarly2024 = trainPairwise(early2024, indices, config);
            folds.push({
                period: 'late-2024',
                ...evaluateModel(modelEarly2024, late2024)
            });
            const model2024 = trainPairwise(rows2024, indices, config);
            folds.push({
                period: '2025',
                ...evaluateModel(model2024, rows2025)
            });
            candidates.push({
                featureSet,
                indices,
                config,
                folds,
                minimumHitRate: Math.min(...folds.map(row => row.hitRate)),
                totalWins: folds.reduce((sum, row) => sum + row.wins, 0),
                totalProfitK: folds.reduce((sum, row) => sum + row.profitK, 0),
                maximumLongestLoss: Math.max(...folds.map(row => row.longestLoss))
            });
        }
    }
    return candidates.sort((left, right) =>
        right.minimumHitRate - left.minimumHitRate
        || right.totalWins - left.totalWins
        || left.maximumLongestLoss - right.maximumLongestLoss
        || right.totalProfitK - left.totalProfitK
        || left.featureSet.localeCompare(right.featureSet)
        || left.config.learningRate - right.config.learningRate
    );
}

function compactSummary(summary) {
    const { rows, ...result } = summary;
    return result;
}

function main() {
    const args = parseArgs();
    if (!args.train2024.length || !args.train2025.length || !args.test2026.length) {
        throw new Error(
            'Cần truyền --train2024=file --train2025=file --test2026=file với báo cáo strict evidence đầy đủ.'
        );
    }
    const rawRows = {
        2024: loadRows(args.train2024),
        2025: loadRows(args.train2025),
        2026: loadRows(args.test2026)
    };
    const dictionary = buildDictionary([...rawRows[2024], ...rawRows[2025]]);
    const schema = buildFeatureSchema(dictionary);
    const years = Object.fromEntries(
        Object.entries(rawRows).map(([year, rows]) => [
            year,
            rows.map(row => buildDay(row, dictionary, schema))
        ])
    );
    const selection = selectConfiguration(years[2024], years[2025], schema.featureSets);
    const selected = selection[0];
    const finalTraining = [...years[2024], ...years[2025]];
    const finalModel = trainPairwise(finalTraining, selected.indices, selected.config);
    const candidate = evaluateModel(finalModel, years[2026]);
    const baseline = evaluateStrategy(years[2026], 'chainSmallFirst');
    const comparisonStrategies = Object.fromEntries(
        dictionary.strategies.map(id => [id, compactSummary(evaluateStrategy(years[2026], id))])
    );
    const weights = selected.indices.map((featureIndex, index) => ({
        feature: schema.names[featureIndex],
        weight: finalModel.weights[index]
    })).sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight));
    const inputFiles = [...args.train2024, ...args.train2025, ...args.test2026]
        .map(file => path.resolve(file));
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            strategyId: METHOD_ID,
            pointInTime: 'Mỗi numberEvidence được sinh từ raw prefix kết thúc trước ngày dự đoán.',
            training: 'Đầu 2024; walk-forward chọn cấu hình trên cuối 2024 và 2025.',
            holdout: 'Khóa cấu hình, refit 2024-2025 rồi chấm toàn bộ 2026.',
            correlationControl: 'Evidence đã khử trùng theo họ + pattern + tập số trước khi tạo feature.',
            promotionStatus: 'research-only'
        },
        economics: {
            targetExcluded: TARGET_EXCLUDED,
            betCount: BET_COUNT,
            betPerNumberK: BET_PER_NUMBER_K,
            winMultiplier: WIN_MULTIPLIER,
            breakEvenHitRate: BET_COUNT / WIN_MULTIPLIER
        },
        coverage: Object.fromEntries(
            Object.entries(years).map(([year, rows]) => [
                year,
                {
                    days: rows.length,
                    firstDate: rows[0]?.date,
                    lastDate: rows[rows.length - 1]?.date
                }
            ])
        ),
        dictionary,
        selected: {
            featureSet: selected.featureSet,
            config: selected.config,
            folds: selected.folds.map(row => compactSummary(row)),
            minimumHitRate: selected.minimumHitRate,
            weights
        },
        summariesByWindow: {
            dateRange: {
                [BASELINE_ID]: baseline,
                [METHOD_ID]: candidate
            }
        },
        comparisonStrategies,
        delta: {
            wins: candidate.wins - baseline.wins,
            hitRate: candidate.hitRate - baseline.hitRate,
            profitK: candidate.profitK - baseline.profitK,
            roi: candidate.roi - baseline.roi,
            longestLoss: candidate.longestLoss - baseline.longestLoss
        },
        selectionRanking: selection.slice(0, 20).map(row => ({
            featureSet: row.featureSet,
            config: row.config,
            folds: row.folds.map(fold => compactSummary(fold)),
            minimumHitRate: row.minimumHitRate,
            totalWins: row.totalWins,
            totalProfitK: row.totalProfitK,
            maximumLongestLoss: row.maximumLongestLoss
        })),
        fingerprint: {
            inputSha256: hashCanonical(
                Object.fromEntries(Object.entries(rawRows).map(([year, rows]) => [
                    year,
                    rows.map(row => ({
                        date: row.date,
                        actual: row.actual,
                        strategies: row.strategies,
                        numberEvidence: row.numberEvidence
                    }))
                ]))
            ),
            configSha256: hashCanonical({ dictionary, featureSets: schema.featureSets, hyperparameters: HYPERPARAMETERS }),
            source: hashSourceFiles([__filename, ...inputFiles]),
            resultSha256: hashCanonical({
                baseline: compactSummary(baseline),
                candidate: compactSummary(candidate),
                selected: {
                    featureSet: selected.featureSet,
                    config: selected.config
                }
            })
        }
    };
    const outputPath = path.join(
        process.cwd(),
        'reports',
        `research_strict_evidence_ranker_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        outputPath,
        coverage: report.coverage,
        selected: report.selected,
        baseline: compactSummary(baseline),
        candidate: compactSummary(candidate),
        delta: report.delta
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    buildDictionary,
    buildFeatureSchema,
    buildDay,
    computeScaler,
    evaluateModel,
    predict,
    trainPairwise
};
