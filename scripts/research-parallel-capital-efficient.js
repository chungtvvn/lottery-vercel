#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const TARGETS = [60, 65, 70, 75, 80, 85, 90];
const ALL_NUMBERS = Array.from({ length: 100 }, (_, number) => number);
const STAKE_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const ROW_CACHE = new WeakMap();

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value ?? '1'];
    }));
}

function readReport(file) {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
        throw new Error(`${file} không phải strict-prefix-point-in-time-v1.`);
    }
    if (!Array.isArray(report.rows) || report.rows.length === 0) {
        throw new Error(`${file} không có rows.`);
    }
    for (const row of report.rows) {
        for (const target of TARGETS) {
            const methods = row.strategiesByTarget?.[String(target)];
            if (!methods?.chainSmallFirst || !methods?.chainBlockFirst) {
                throw new Error(`${file} thiếu chainSmallFirst/chainBlockFirst Hold ${target} ngày ${row.date}.`);
            }
        }
    }
    return report;
}

function numberSet(row, strategy, target) {
    let cache = ROW_CACHE.get(row);
    if (!cache) {
        cache = new Map();
        ROW_CACHE.set(row, cache);
    }
    const key = `${strategy}:${target}`;
    if (!cache.has(key)) {
        cache.set(key, new Set(row.strategiesByTarget[String(target)][strategy].map(Number)));
    }
    return cache.get(key);
}

function safeDepth(row, strategy, number) {
    let depth = 0;
    for (let index = 0; index < TARGETS.length; index += 1) {
        if (numberSet(row, strategy, TARGETS[index]).has(number)) depth = index + 1;
    }
    return depth;
}

function buildUnion(row, config) {
    const block = numberSet(row, 'chainBlockFirst', config.blockHold);
    const small = numberSet(row, 'chainSmallFirst', config.smallHold);
    const betNumbers = [...new Set([...block, ...small])].sort((a, b) => a - b);
    const intersection = new Set([...block].filter(number => small.has(number)));
    return {
        betNumbers,
        x2Numbers: config.doubleIntersection ? [...intersection] : []
    };
}

function buildFusion(row, config) {
    const block85 = numberSet(row, 'chainBlockFirst', 85);
    const small65 = numberSet(row, 'chainSmallFirst', 65);
    const ranked = ALL_NUMBERS.map(number => {
        const smallDepth = safeDepth(row, 'chainSmallFirst', number);
        const blockDepth = safeDepth(row, 'chainBlockFirst', number);
        const agreement = block85.has(number) && small65.has(number) ? 1 : 0;
        return {
            number,
            smallDepth,
            blockDepth,
            agreement,
            score: config.smallWeight * smallDepth
                + (1 - config.smallWeight) * blockDepth
                + config.agreementBonus * agreement
        };
    }).sort((left, right) => right.score - left.score
        || right.agreement - left.agreement
        || right.smallDepth - left.smallDepth
        || right.blockDepth - left.blockDepth
        || left.number - right.number);
    const selected = ranked.slice(0, config.betCount);
    const x2Numbers = selected
        .filter(item => item.agreement)
        .slice(0, config.x2Cap)
        .map(item => item.number);
    return {
        betNumbers: selected.map(item => item.number).sort((a, b) => a - b),
        x2Numbers
    };
}

function buildPrediction(row, config) {
    return config.type === 'union' ? buildUnion(row, config) : buildFusion(row, config);
}

function settleRow(row, config) {
    const prediction = buildPrediction(row, config);
    const betSet = new Set(prediction.betNumbers);
    const x2Set = new Set(prediction.x2Numbers);
    const actual = Number(row.actual);
    const hit = betSet.has(actual);
    const actualWeight = x2Set.has(actual) ? 2 : 1;
    const units = prediction.betNumbers.length + prediction.x2Numbers.length;
    const stakeK = units * STAKE_K;
    const payoutK = hit ? actualWeight * STAKE_K * PAYOUT_MULTIPLIER : 0;
    return {
        date: row.date,
        actual,
        hit,
        hitX2: hit && actualWeight === 2,
        uniqueCount: prediction.betNumbers.length,
        unitCount: units,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK
    };
}

function longestStreak(rows, predicate) {
    let longest = 0;
    let current = 0;
    for (const row of rows) {
        if (predicate(row)) {
            current += 1;
            longest = Math.max(longest, current);
        } else {
            current = 0;
        }
    }
    return longest;
}

function summarize(rows) {
    const days = rows.length;
    const wins = rows.filter(row => row.hit).length;
    const stakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = rows.reduce((sum, row) => sum + row.payoutK, 0);
    const profitK = payoutK - stakeK;
    return {
        days,
        wins,
        losses: days - wins,
        hitX2: rows.filter(row => row.hitX2).length,
        hitRate: days ? wins / days : 0,
        averageUniqueCount: days ? rows.reduce((sum, row) => sum + row.uniqueCount, 0) / days : 0,
        averageUnitCount: days ? rows.reduce((sum, row) => sum + row.unitCount, 0) / days : 0,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin: longestStreak(rows, row => row.hit),
        longestLoss: longestStreak(rows, row => !row.hit)
    };
}

function evaluate(report, config, filter = () => true) {
    return summarize(report.rows.filter(filter).map(row => settleRow(row, config)));
}

function buildConfigs() {
    const configs = [{
        id: 'production-parallel-b85-s65-x2',
        type: 'union',
        blockHold: 85,
        smallHold: 65,
        doubleIntersection: true
    }];
    for (const blockHold of [80, 85, 90]) {
        for (const smallHold of [65, 70, 75, 80]) {
            for (const doubleIntersection of [false, true]) {
                configs.push({
                    id: `union-b${blockHold}-s${smallHold}-${doubleIntersection ? 'x2' : 'x1'}`,
                    type: 'union',
                    blockHold,
                    smallHold,
                    doubleIntersection
                });
            }
        }
    }
    for (const betCount of [20, 25, 30, 35]) {
        for (const smallWeight of [0.25, 0.5, 0.75]) {
            for (const agreementBonus of [0, 1]) {
                for (const x2Cap of [0, 3, 5]) {
                    configs.push({
                        id: `fusion-n${betCount}-s${Math.round(smallWeight * 100)}-a${agreementBonus}-x${x2Cap}`,
                        type: 'fusion',
                        betCount,
                        smallWeight,
                        agreementBonus,
                        x2Cap
                    });
                }
            }
        }
    }
    return configs;
}

function selectionScore(firstHalf, secondHalf) {
    const bothProfitable = firstHalf.profitK > 0 && secondHalf.profitK > 0;
    const worstHalf = Math.min(firstHalf.profitK, secondHalf.profitK);
    return (bothProfitable ? 1e12 : 0)
        + worstHalf * 1000
        + (firstHalf.profitK + secondHalf.profitK)
        - Math.max(firstHalf.longestLoss, secondHalf.longestLoss) * 100;
}

function pct(value) {
    return `${(value * 100).toFixed(2)}%`;
}

function compact(summary) {
    return {
        ...summary,
        hitRateText: pct(summary.hitRate),
        roiText: pct(summary.roi),
        averageUniqueCount: Number(summary.averageUniqueCount.toFixed(2)),
        averageUnitCount: Number(summary.averageUnitCount.toFixed(2))
    };
}

function main() {
    const args = parseArgs();
    const trainFile = path.resolve(args.get('train'));
    const testFile = path.resolve(args.get('test'));
    const train = readReport(trainFile);
    const test = readReport(testFile);
    const configs = buildConfigs();
    const production = configs.find(config => config.id === 'production-parallel-b85-s65-x2');
    const productionTrain = evaluate(train, production);
    const trainRows = configs.map(config => {
        const firstHalf = evaluate(train, config, row => row.date <= '2025-06-30');
        const secondHalf = evaluate(train, config, row => row.date >= '2025-07-01');
        return {
            config,
            firstHalf,
            secondHalf,
            full: evaluate(train, config),
            selectionScore: selectionScore(firstHalf, secondHalf)
        };
    }).sort((left, right) => right.selectionScore - left.selectionScore
        || right.full.profitK - left.full.profitK);
    const capitalEfficientRows = trainRows.filter(row => row.full.averageUniqueCount >= 25
        && row.full.averageUniqueCount <= 35
        && row.full.longestLoss <= Math.ceil(productionTrain.longestLoss * 1.2));
    const winner = capitalEfficientRows[0] || trainRows[0];
    const testWinner = evaluate(test, winner.config);
    const testProduction = evaluate(test, production);
    const topTrain = trainRows.slice(0, 15).map(row => ({
        config: row.config,
        firstHalf: compact(row.firstHalf),
        secondHalf: compact(row.secondHalf),
        full: compact(row.full),
        frozenTest: compact(evaluate(test, row.config))
    }));
    const bestTrainProfit = trainRows
        .slice()
        .sort((left, right) => right.full.profitK - left.full.profitK)[0];
    const result = {
        generatedAt: new Date().toISOString(),
        methodology: 'Chọn cấu hình trên hai nửa 2025; khóa nguyên cấu hình rồi kiểm định 2026 strict-prefix PIT.',
        economics: { stakePerUnitK: STAKE_K, payoutMultiplier: PAYOUT_MULTIPLIER },
        train: {
            file: trainFile,
            baselineCutoffDate: train.baselineCutoffDate,
            days: train.rows.length
        },
        test: {
            file: testFile,
            baselineCutoffDate: test.baselineCutoffDate,
            days: test.rows.length
        },
        testedConfigCount: configs.length,
        selectionGate: {
            minUniqueCount: 25,
            maxUniqueCount: 35,
            maxLongestLoss: Math.ceil(productionTrain.longestLoss * 1.2),
            eligibleConfigs: capitalEfficientRows.length
        },
        selectedConfig: winner.config,
        selectedTrain: compact(winner.full),
        selectedTest: compact(testWinner),
        productionConfig: production,
        productionTrain: compact(productionTrain),
        productionTest: compact(testProduction),
        bestTrainProfit: {
            config: bestTrainProfit.config,
            train: compact(bestTrainProfit.full),
            frozenTest: compact(evaluate(test, bestTrainProfit.config))
        },
        topTrain
    };
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(process.cwd(), 'reports', `parallel-capital-efficient-${timestamp}.json`);
    const markdownPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    const markdown = [
        '# Nghiên cứu Đề song song giảm vốn',
        '',
        `- Sinh lúc: ${result.generatedAt}`,
        `- Cấu hình thử: ${result.testedConfigCount}`,
        `- Train: ${train.options.startDate} -> ${train.options.endDate}, baseline ${train.baselineCutoffDate}`,
        `- Holdout: ${test.options.startDate} -> ${test.options.endDate}, baseline ${test.baselineCutoffDate}`,
        `- Kinh tế: ${STAKE_K}K/đơn vị, trúng x${PAYOUT_MULTIPLIER}`,
        '',
        '## Cấu hình được chọn chỉ từ 2025',
        '',
        `- ID: ${winner.config.id}`,
        `- 2025: ${winner.full.wins}/${winner.full.days} (${pct(winner.full.hitRate)}), profit ${winner.full.profitK}K, ROI ${pct(winner.full.roi)}, TB ${winner.full.averageUniqueCount.toFixed(2)} số / ${winner.full.averageUnitCount.toFixed(2)} đơn vị, LL ${winner.full.longestLoss}`,
        `- 2026 holdout: ${testWinner.wins}/${testWinner.days} (${pct(testWinner.hitRate)}), profit ${testWinner.profitK}K, ROI ${pct(testWinner.roi)}, TB ${testWinner.averageUniqueCount.toFixed(2)} số / ${testWinner.averageUnitCount.toFixed(2)} đơn vị, LL ${testWinner.longestLoss}`,
        '',
        '## Production song song hiện tại',
        '',
        `- 2025: ${result.productionTrain.wins}/${result.productionTrain.days} (${result.productionTrain.hitRateText}), profit ${result.productionTrain.profitK}K, ROI ${result.productionTrain.roiText}, TB ${result.productionTrain.averageUniqueCount} số / ${result.productionTrain.averageUnitCount} đơn vị, LL ${result.productionTrain.longestLoss}`,
        `- 2026: ${result.productionTest.wins}/${result.productionTest.days} (${result.productionTest.hitRateText}), profit ${result.productionTest.profitK}K, ROI ${result.productionTest.roiText}, TB ${result.productionTest.averageUniqueCount} số / ${result.productionTest.averageUnitCount} đơn vị, LL ${result.productionTest.longestLoss}`,
        '',
        'Không thay mặc định nếu cấu hình mới không cải thiện holdout mà vẫn giữ hoặc giảm chuỗi thua.'
    ].join('\n');
    fs.writeFileSync(markdownPath, `${markdown}\n`);
    console.log(JSON.stringify({ jsonPath, markdownPath, result }, null, 2));
}

main();
