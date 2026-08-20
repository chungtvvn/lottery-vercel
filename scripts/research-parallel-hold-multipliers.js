#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const TARGETS = [60, 65, 70, 75, 80, 85, 90];
const MULTIPLIERS = [1, 2, 3, 4];
const STAKE_PER_UNIT_K = 1000;
const PAYOUT_MULTIPLIER = 84;

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value ?? '1'];
    }));
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readStrictReport(file) {
    const report = readJson(file);
    if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
        throw new Error(`${file} khong phai strict-prefix-point-in-time-v1.`);
    }
    if (!Array.isArray(report.rows) || report.rows.length === 0) {
        throw new Error(`${file} khong co rows.`);
    }
    return report;
}

function strategyNumbers(row, strategy, target) {
    const byTarget = row.strategiesByTarget?.[String(target)]?.[strategy];
    const legacyHold70 = target === 70 ? row.strategies?.[strategy] : null;
    const values = byTarget || legacyHold70;
    if (!Array.isArray(values)) {
        throw new Error(`Thieu ${strategy} Hold ${target} ngay ${row.date}.`);
    }
    return new Set(values.map(Number));
}

function settle(row, config) {
    const block = strategyNumbers(row, 'chainBlockFirst', config.blockHold);
    const small = strategyNumbers(row, 'chainSmallFirst', config.smallHold);
    const union = new Set([...block, ...small]);
    const intersection = new Set([...block].filter(number => small.has(number)));
    const actual = Number(row.actual);
    const hit = union.has(actual);
    const hitIntersection = intersection.has(actual);
    const extraIntersectionUnits = (config.intersectionMultiplier - 1) * intersection.size;
    const unitCount = union.size + extraIntersectionUnits;
    const actualWeight = hitIntersection ? config.intersectionMultiplier : 1;
    const stakeK = unitCount * STAKE_PER_UNIT_K;
    const payoutK = hit ? actualWeight * STAKE_PER_UNIT_K * PAYOUT_MULTIPLIER : 0;
    return {
        date: row.date,
        actual,
        hit,
        hitIntersection,
        unionCount: union.size,
        intersectionCount: intersection.size,
        unitCount,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK
    };
}

function longestStreak(rows, predicate) {
    let longest = 0;
    let current = 0;
    for (const row of rows) {
        current = predicate(row) ? current + 1 : 0;
        longest = Math.max(longest, current);
    }
    return longest;
}

function wilsonInterval(successes, total, z = 1.96) {
    if (!total) return { lower: 0, upper: 0 };
    const probability = successes / total;
    const denominator = 1 + (z * z) / total;
    const center = (probability + (z * z) / (2 * total)) / denominator;
    const margin = z * Math.sqrt(
        (probability * (1 - probability) + (z * z) / (4 * total)) / total
    ) / denominator;
    return {
        lower: Math.max(0, center - margin),
        upper: Math.min(1, center + margin)
    };
}

function summarize(settledRows) {
    const days = settledRows.length;
    const wins = settledRows.filter(row => row.hit).length;
    const intersectionHits = settledRows.filter(row => row.hitIntersection).length;
    const stakeK = settledRows.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = settledRows.reduce((sum, row) => sum + row.payoutK, 0);
    const profitK = payoutK - stakeK;
    const intersectionObservations = settledRows.reduce(
        (sum, row) => sum + row.intersectionCount,
        0
    );
    const intersectionWilson = wilsonInterval(intersectionHits, days);
    const average = key => days
        ? settledRows.reduce((sum, row) => sum + row[key], 0) / days
        : 0;
    return {
        days,
        wins,
        losses: days - wins,
        hitRate: days ? wins / days : 0,
        intersectionHits,
        intersectionHitRateAllDays: days ? intersectionHits / days : 0,
        intersectionWilsonLower95: intersectionWilson.lower,
        intersectionWilsonUpper95: intersectionWilson.upper,
        intersectionShareOfHits: wins ? intersectionHits / wins : 0,
        averageUnionCount: average('unionCount'),
        averageIntersectionCount: average('intersectionCount'),
        intersectionShareOfUnion: average('unionCount')
            ? average('intersectionCount') / average('unionCount')
            : 0,
        intersectionBreakEvenRate: average('intersectionCount') / PAYOUT_MULTIPLIER,
        intersectionMarginalProfitPerExtraMultipleK:
            intersectionHits * PAYOUT_MULTIPLIER * STAKE_PER_UNIT_K
            - intersectionObservations * STAKE_PER_UNIT_K,
        averageUnitCount: average('unitCount'),
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin: longestStreak(settledRows, row => row.hit),
        longestLoss: longestStreak(settledRows, row => !row.hit)
    };
}

function groupSummary(rows, keyFn) {
    const groups = new Map();
    for (const row of rows) {
        const key = keyFn(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return Object.fromEntries([...groups.entries()].map(([key, values]) => [key, compact(summarize(values))]));
}

function compact(summary) {
    const rounded = { ...summary };
    for (const key of [
        'hitRate',
        'intersectionHitRateAllDays',
        'intersectionWilsonLower95',
        'intersectionWilsonUpper95',
        'intersectionShareOfHits',
        'intersectionShareOfUnion',
        'intersectionBreakEvenRate',
        'roi'
    ]) rounded[key] = Number(summary[key].toFixed(6));
    for (const key of ['averageUnionCount', 'averageIntersectionCount', 'averageUnitCount']) {
        rounded[key] = Number(summary[key].toFixed(2));
    }
    return rounded;
}

function evaluate(rows, config) {
    const settledRows = rows.map(row => settle(row, config));
    return {
        config,
        summary: compact(summarize(settledRows)),
        byYear: groupSummary(settledRows, row => row.date.slice(0, 4)),
        byMonth: groupSummary(settledRows, row => row.date.slice(0, 7))
    };
}

function configId(config) {
    return `parallel-b${config.blockHold}-s${config.smallHold}-x${config.intersectionMultiplier}`;
}

function makeConfig(blockHold, smallHold, intersectionMultiplier) {
    return {
        id: `parallel-b${blockHold}-s${smallHold}-x${intersectionMultiplier}`,
        blockHold,
        smallHold,
        intersectionMultiplier
    };
}

function robustTrainScore(evaluation) {
    const months = Object.values(evaluation.byMonth);
    const profitableMonths = months.filter(month => month.profitK > 0).length;
    const worstMonth = months.length ? Math.min(...months.map(month => month.profitK)) : -Infinity;
    const summary = evaluation.summary;
    return (profitableMonths === months.length ? 1e15 : 0)
        + profitableMonths * 1e12
        + worstMonth * 1e5
        + summary.profitK * 10
        - summary.longestLoss * 1e3;
}

function loadHistoricalHold70(indexFile) {
    if (!indexFile) return [];
    const index = readJson(indexFile);
    const directory = path.dirname(indexFile);
    const reports = (index.sourceReports || [])
        .filter(item => Number(item.year) <= 2025)
        .map(item => readStrictReport(path.resolve(directory, item.file)));
    const byDate = new Map();
    for (const report of reports) {
        for (const row of report.rows) byDate.set(row.date, row);
    }
    return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function pct(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function money(value) {
    return `${Math.round(value).toLocaleString('vi-VN')}K`;
}

function summaryLine(label, evaluation) {
    const value = evaluation.summary;
    return `| ${label} | ${value.wins}/${value.days} (${pct(value.hitRate)}) | ${value.intersectionHits} (${pct(value.intersectionHitRateAllDays)} ngay; ${pct(value.intersectionShareOfHits)} tren ngay trung) | ${value.averageUnionCount} | ${value.averageIntersectionCount} | ${value.averageUnitCount} | ${money(value.profitK)} | ${pct(value.roi)} | ${value.longestLoss} |`;
}

function main() {
    const args = parseArgs();
    const trainFile = path.resolve(args.get('train'));
    const testFile = path.resolve(args.get('test'));
    const historicalIndex = args.get('historical-index')
        ? path.resolve(args.get('historical-index'))
        : null;
    const train = readStrictReport(trainFile);
    const test = readStrictReport(testFile);
    const historicalHold70Rows = loadHistoricalHold70(historicalIndex);

    const configs = [];
    for (const blockHold of TARGETS) {
        for (const smallHold of TARGETS) {
            for (const multiplier of MULTIPLIERS) configs.push(makeConfig(blockHold, smallHold, multiplier));
        }
    }
    const trainEvaluations = configs.map(config => evaluate(train.rows, config));
    const trainById = new Map(trainEvaluations.map(evaluation => [evaluation.config.id, evaluation]));
    const testById = new Map(configs.map(config => {
        const evaluation = evaluate(test.rows, config);
        return [config.id, evaluation];
    }));

    const requestedPairs = [
        { label: 'Production B85/S65', blockHold: 85, smallHold: 65 },
        { label: 'Thu nghiem B75/S75', blockHold: 75, smallHold: 75 },
        { label: 'Thu nghiem B70/S70', blockHold: 70, smallHold: 70 }
    ].map(pair => ({
        ...pair,
        multipliers: MULTIPLIERS.map(multiplier => {
            const id = configId(makeConfig(pair.blockHold, pair.smallHold, multiplier));
            return {
                multiplier,
                train: trainById.get(id),
                frozenTest: testById.get(id)
            };
        })
    }));

    const eligible = trainEvaluations.filter(evaluation => {
        const count = evaluation.summary.averageUnionCount;
        return count >= 20 && count <= 50;
    }).sort((left, right) => robustTrainScore(right) - robustTrainScore(left));
    const selected = eligible[0];
    const productionId = 'parallel-b85-s65-x2';
    const productionTrain = trainById.get(productionId);
    const productionTest = testById.get(productionId);
    const selectedTest = testById.get(selected.config.id);
    const productionProfitableBothRegimes = productionTrain.summary.profitK > 0
        && productionTest.summary.profitK > 0;
    const selectedProfitableBothRegimes = selected.summary.profitK > 0
        && selectedTest.summary.profitK > 0;
    const promotionApproved = selectedProfitableBothRegimes
        && selectedTest.summary.profitK > productionTest.summary.profitK
        && selectedTest.summary.longestLoss <= productionTest.summary.longestLoss;

    const historicalHold70 = historicalHold70Rows.length
        ? MULTIPLIERS.map(multiplier => evaluate(
            historicalHold70Rows,
            makeConfig(70, 70, multiplier)
        ))
        : [];
    const descriptiveTestTop = [...testById.values()]
        .filter(evaluation => evaluation.summary.averageUnionCount >= 20
            && evaluation.summary.averageUnionCount <= 50)
        .sort((left, right) => right.summary.profitK - left.summary.profitK)
        .slice(0, 10);

    const result = {
        generatedAt: new Date().toISOString(),
        methodology: {
            version: 'strict-prefix-point-in-time-v1',
            selection: 'Chon tren 2025 theo do on dinh thang; khoa cau hinh va kiem dinh tren 2026.',
            warning: 'Top 2026 chi mo ta, khong duoc dung de chon production.',
            economics: {
                stakePerUnitK: STAKE_PER_UNIT_K,
                payoutMultiplier: PAYOUT_MULTIPLIER
            }
        },
        sources: {
            train: { file: trainFile, baselineCutoffDate: train.baselineCutoffDate, days: train.rows.length },
            frozenTest: { file: testFile, baselineCutoffDate: test.baselineCutoffDate, days: test.rows.length },
            historicalHold70: { indexFile: historicalIndex, days: historicalHold70Rows.length }
        },
        requestedPairs,
        selectedFromTrain: selected,
        selectedFrozenTest: selectedTest,
        production: {
            config: productionTrain.config,
            train: productionTrain,
            frozenTest: productionTest
        },
        recommendation: {
            productionProfitableBothRegimes,
            selectedProfitableBothRegimes,
            promotionApproved,
            action: promotionApproved
                ? `Can nhac kiem thu shadow ${selected.config.id}; chua thay production truc tiep.`
                : 'Khong doi production tu nghien cuu nay; khong co cau hinh vuot qua gate train + holdout.',
            intersectionRule: 'Chi tang he so giao khi Wilson lower 95% vuot nguong hoa von; cac cau hinh yeu cau hien khong dat dieu kien nay o ca hai giai doan.'
        },
        historicalHold70,
        topTrain: eligible.slice(0, 15),
        descriptiveTopFrozenTest: descriptiveTestTop
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputBase = path.join(process.cwd(), 'reports', `parallel-hold-multipliers-${timestamp}`);
    fs.writeFileSync(`${outputBase}.json`, JSON.stringify(result, null, 2));

    const lines = [
        '# Bao cao De song song Hold va he so so trung',
        '',
        `- Train: ${train.rows[0].date} -> ${train.rows.at(-1).date} (${train.rows.length} ngay).`,
        `- Holdout khoa truoc: ${test.rows[0].date} -> ${test.rows.at(-1).date} (${test.rows.length} ngay).`,
        `- Kinh te: ${STAKE_PER_UNIT_K}K/don vi, trung an ${PAYOUT_MULTIPLIER}.`,
        '- xN chi tang tien cho cac so nam trong giao cua hai dan; moi so khac van 1 don vi.',
        '',
        '## Cac cau hinh duoc yeu cau',
        '',
        '| Cau hinh | Trung | KQ roi vao giao | TB so duy nhat | TB so giao | TB don vi | Profit | ROI | Thua dai nhat |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|'
    ];
    for (const pair of requestedPairs) {
        for (const item of pair.multipliers) {
            lines.push(summaryLine(`${pair.label} x${item.multiplier} - 2025`, item.train));
            lines.push(summaryLine(`${pair.label} x${item.multiplier} - 2026 holdout`, item.frozenTest));
        }
    }
    lines.push('', '## Cau hinh chon chi tu 2025', '');
    lines.push(summaryLine(`${selected.config.id} - 2025`, selected));
    lines.push(summaryLine(`${selected.config.id} - 2026 holdout`, selectedTest));
    lines.push('', '## Production hien tai', '');
    lines.push(summaryLine(`${productionId} - 2025`, productionTrain));
    lines.push(summaryLine(`${productionId} - 2026 holdout`, productionTest));
    if (historicalHold70.length) {
        lines.push('', '## Doi chieu B70/S70 tren 2016-2025', '');
        for (const evaluation of historicalHold70) {
            lines.push(summaryLine(evaluation.config.id, evaluation));
        }
    }
    lines.push('', '## Ket luan kiem dinh', '');
    lines.push(`- ${result.recommendation.action}`);
    lines.push(`- ${result.recommendation.intersectionRule}`);
    lines.push('- Khong thay production neu holdout khong tang profit hoac lam chuoi thua dai hon.');
    fs.writeFileSync(`${outputBase}.md`, `${lines.join('\n')}\n`);
    console.log(JSON.stringify({
        json: `${outputBase}.json`,
        markdown: `${outputBase}.md`,
        selected: selected.config,
        selectedTrain: selected.summary,
        selectedFrozenTest: selectedTest.summary,
        productionTrain: productionTrain.summary,
        productionFrozenTest: productionTest.summary
    }, null, 2));
}

main();
