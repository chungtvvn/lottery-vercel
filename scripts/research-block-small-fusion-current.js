#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { selectBlockSmallFusion } = require('../lib/research/blockSmallFusion');

const BET_COUNT = 30;
const STAKE_K = 1000;
const PAYOUT = 84;
const METHODS = ['chainBlockFirst', 'chainSmallFirst'];

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
    return report;
}

function sourceHash(report) {
    return report.fingerprint?.sourceSha256 || null;
}

function availableTargets(report) {
    return [...new Set(report.rows.flatMap(row => Object.keys(row.strategiesByTarget || {}).map(Number)))]
        .filter(target => report.rows.every(row => METHODS.every(method =>
            Array.isArray(row.strategiesByTarget?.[String(target)]?.[method]))))
        .sort((left, right) => left - right);
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

function settle(reportRows, selector) {
    const rows = reportRows.map(row => {
        const numbers = selector(row);
        if (numbers.length !== BET_COUNT) {
            throw new Error(`${row.date}: dàn có ${numbers.length}, cần đúng ${BET_COUNT}.`);
        }
        const hit = new Set(numbers).has(Number(row.actual));
        return { date: row.date, actual: Number(row.actual), numbers, hit };
    });
    const wins = rows.filter(row => row.hit).length;
    const stakeK = rows.length * BET_COUNT * STAKE_K;
    const payoutK = wins * PAYOUT * STAKE_K;
    return {
        rows,
        summary: {
            days: rows.length,
            wins,
            losses: rows.length - wins,
            hitRate: rows.length ? wins / rows.length : 0,
            breakEvenHitRate: BET_COUNT / PAYOUT,
            stakeK,
            payoutK,
            profitK: payoutK - stakeK,
            roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
            longestWin: longestStreak(rows, row => row.hit),
            longestLoss: longestStreak(rows, row => !row.hit)
        }
    };
}

function settleParallel(reportRows, doubleIntersection) {
    const rows = reportRows.map(row => {
        const block = new Set(row.strategiesByTarget['85'].chainBlockFirst.map(Number));
        const small = new Set(row.strategiesByTarget['65'].chainSmallFirst.map(Number));
        const numbers = [...new Set([...block, ...small])].sort((left, right) => left - right);
        const doubled = doubleIntersection
            ? [...block].filter(number => small.has(number))
            : [];
        const actual = Number(row.actual);
        const hit = new Set(numbers).has(actual);
        const hitX2 = hit && new Set(doubled).has(actual);
        const units = numbers.length + doubled.length;
        return {
            date: row.date,
            actual,
            numbers,
            doubled,
            hit,
            hitX2,
            units,
            stakeK: units * STAKE_K,
            payoutK: hit ? (hitX2 ? 2 : 1) * PAYOUT * STAKE_K : 0
        };
    });
    const wins = rows.filter(row => row.hit).length;
    const stakeK = rows.reduce((sum, row) => sum + row.stakeK, 0);
    const payoutK = rows.reduce((sum, row) => sum + row.payoutK, 0);
    return {
        days: rows.length,
        wins,
        losses: rows.length - wins,
        hitX2: rows.filter(row => row.hitX2).length,
        hitRate: rows.length ? wins / rows.length : 0,
        averageUniqueCount: rows.length
            ? rows.reduce((sum, row) => sum + row.numbers.length, 0) / rows.length
            : 0,
        averageUnitCount: rows.length
            ? rows.reduce((sum, row) => sum + row.units, 0) / rows.length
            : 0,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin: longestStreak(rows, row => row.hit),
        longestLoss: longestStreak(rows, row => !row.hit)
    };
}

function baselineSelector(method) {
    return row => row.strategiesByTarget['70'][method].map(Number);
}

function configs(targets) {
    const values = [];
    for (const blockWeight of [0.25, 0.5, 0.75]) {
        for (const agreementBonus of [0, 0.5, 1]) {
            for (const disagreementPenalty of [0, 0.25]) {
                values.push({
                    id: `fusion-b${Math.round(blockWeight * 100)}-a${agreementBonus}-d${disagreementPenalty}`,
                    targets,
                    betCount: BET_COUNT,
                    blockWeight,
                    smallWeight: 1 - blockWeight,
                    agreementBonus,
                    disagreementPenalty
                });
            }
        }
    }
    return values;
}

function compact(summary) {
    const result = {
        ...summary,
        hitRateText: `${(summary.hitRate * 100).toFixed(4)}%`,
        roiText: `${(summary.roi * 100).toFixed(4)}%`
    };
    if (Number.isFinite(summary.breakEvenHitRate)) {
        result.breakEvenHitRateText = `${(summary.breakEvenHitRate * 100).toFixed(4)}%`;
    }
    return result;
}

function selectionScore(firstHalf, secondHalf) {
    const profitableHalves = Number(firstHalf.profitK > 0) + Number(secondHalf.profitK > 0);
    return profitableHalves * 1e12
        + Math.min(firstHalf.profitK, secondHalf.profitK) * 1000
        + firstHalf.profitK
        + secondHalf.profitK
        - Math.max(firstHalf.longestLoss, secondHalf.longestLoss) * 100;
}

function main() {
    const args = parseArgs();
    const trainFile = path.resolve(args.get('train'));
    const testFile = path.resolve(args.get('test'));
    const train = readReport(trainFile);
    const test = readReport(testFile);
    if (sourceHash(train) !== sourceHash(test)) {
        throw new Error('Train và holdout không cùng sourceSha256; từ chối so sánh khác phiên bản logic.');
    }
    const targets = availableTargets(train).filter(target => availableTargets(test).includes(target));
    if (!targets.includes(70) || targets.length < 2) {
        throw new Error(`Không đủ Hold chung để hợp nhất: ${targets.join(', ')}.`);
    }

    const firstRows = train.rows.filter(row => row.date <= '2025-06-30');
    const secondRows = train.rows.filter(row => row.date >= '2025-07-01');
    const candidates = configs(targets).map(config => {
        const selector = row => selectBlockSmallFusion(row, config);
        const firstHalf = settle(firstRows, selector).summary;
        const secondHalf = settle(secondRows, selector).summary;
        return {
            config,
            firstHalf,
            secondHalf,
            train: settle(train.rows, selector).summary,
            score: selectionScore(firstHalf, secondHalf)
        };
    }).sort((left, right) => right.score - left.score
        || right.train.profitK - left.train.profitK
        || left.config.id.localeCompare(right.config.id));

    const winner = candidates[0];
    const winnerSelector = row => selectBlockSmallFusion(row, winner.config);
    const testWinner = settle(test.rows, winnerSelector);
    const baselines = Object.fromEntries(METHODS.map(method => [
        method,
        {
            train: settle(train.rows, baselineSelector(method)).summary,
            test: settle(test.rows, baselineSelector(method)).summary
        }
    ]));
    const bestBaselineTest = Object.values(baselines)
        .map(value => value.test)
        .sort((left, right) => right.profitK - left.profitK)[0];
    const promotion = {
        bothTrainHalvesProfitable: winner.firstHalf.profitK > 0 && winner.secondHalf.profitK > 0,
        holdoutProfitable: testWinner.summary.profitK > 0,
        improvesHoldoutProfit: testWinner.summary.profitK > bestBaselineTest.profitK,
        improvesHoldoutHitRate: testWinner.summary.hitRate > bestBaselineTest.hitRate,
        lossStreakWithin20Pct: testWinner.summary.longestLoss
            <= Math.ceil(bestBaselineTest.longestLoss * 1.2)
    };
    promotion.passed = Object.values(promotion).every(Boolean);

    const result = {
        generatedAt: new Date().toISOString(),
        methodology: 'Chọn trọng số Block/Small trên hai nửa 2025, khóa cấu hình và kiểm chứng nguyên trạng trên 2026 strict PIT.',
        sourceSha256: sourceHash(train),
        economics: {
            betCount: BET_COUNT,
            stakePerNumberK: STAKE_K,
            payoutMultiplier: PAYOUT,
            breakEvenHitRate: BET_COUNT / PAYOUT
        },
        train: {
            file: trainFile,
            period: [train.options.startDate, train.options.endDate],
            days: train.rows.length
        },
        holdout: {
            file: testFile,
            period: [test.options.startDate, test.options.endDate],
            days: test.rows.length
        },
        targets,
        testedConfigs: candidates.length,
        selected: {
            config: winner.config,
            firstHalf: compact(winner.firstHalf),
            secondHalf: compact(winner.secondHalf),
            train: compact(winner.train),
            holdout: compact(testWinner.summary)
        },
        baselines: Object.fromEntries(Object.entries(baselines).map(([key, value]) => [
            key,
            { train: compact(value.train), holdout: compact(value.test) }
        ])),
        parallelDiagnostics: {
            unionX1: {
                train: compact(settleParallel(train.rows, false)),
                holdout: compact(settleParallel(test.rows, false))
            },
            unionIntersectionX2: {
                train: compact(settleParallel(train.rows, true)),
                holdout: compact(settleParallel(test.rows, true))
            }
        },
        promotion,
        topCandidates: candidates.slice(0, 10).map(candidate => ({
            config: candidate.config,
            firstHalf: compact(candidate.firstHalf),
            secondHalf: compact(candidate.secondHalf),
            train: compact(candidate.train),
            holdout: compact(settle(test.rows, row => selectBlockSmallFusion(row, candidate.config)).summary)
        }))
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(process.cwd(), 'reports', `block-small-fusion-current-${timestamp}.json`);
    const markdownPath = jsonPath.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    const selected = result.selected;
    const block = result.baselines.chainBlockFirst;
    const small = result.baselines.chainSmallFirst;
    const unionX1 = result.parallelDiagnostics.unionX1;
    const unionX2 = result.parallelDiagnostics.unionIntersectionX2;
    const markdown = [
        '# Kết hợp Nhịp Block và Chuỗi nhỏ - strict PIT',
        '',
        `- Cùng phiên bản logic: \`${result.sourceSha256}\``,
        `- Train: ${result.train.period.join(' -> ')} (${result.train.days} ngày)`,
        `- Holdout khóa: ${result.holdout.period.join(' -> ')} (${result.holdout.days} ngày)`,
        `- Kinh tế: đúng ${BET_COUNT} số/ngày, ${STAKE_K}K/số, trúng x${PAYOUT}; hòa vốn ${selected.holdout.breakEvenHitRateText}`,
        `- Đã thử ${result.testedConfigs} cấu hình, chỉ dùng 2025 để chọn.`,
        '',
        '## Cấu hình được chọn',
        '',
        `- ${selected.config.id}: Block ${(selected.config.blockWeight * 100).toFixed(0)}%, Small ${(selected.config.smallWeight * 100).toFixed(0)}%, thưởng đồng thuận ${selected.config.agreementBonus}, phạt bất đồng ${selected.config.disagreementPenalty}.`,
        `- Nửa đầu 2025: ${selected.firstHalf.wins}/${selected.firstHalf.days}, hit ${selected.firstHalf.hitRateText}, profit ${selected.firstHalf.profitK}K, LL ${selected.firstHalf.longestLoss}.`,
        `- Nửa cuối 2025: ${selected.secondHalf.wins}/${selected.secondHalf.days}, hit ${selected.secondHalf.hitRateText}, profit ${selected.secondHalf.profitK}K, LL ${selected.secondHalf.longestLoss}.`,
        `- 2026 holdout: ${selected.holdout.wins}/${selected.holdout.days}, hit ${selected.holdout.hitRateText}, profit ${selected.holdout.profitK}K, ROI ${selected.holdout.roiText}, LL ${selected.holdout.longestLoss}.`,
        '',
        '## So với phương pháp đơn trên cùng holdout',
        '',
        `- Block: ${block.holdout.wins}/${block.holdout.days}, hit ${block.holdout.hitRateText}, profit ${block.holdout.profitK}K, LL ${block.holdout.longestLoss}.`,
        `- Chuỗi nhỏ: ${small.holdout.wins}/${small.holdout.days}, hit ${small.holdout.hitRateText}, profit ${small.holdout.profitK}K, LL ${small.holdout.longestLoss}.`,
        '',
        '## Đánh song song với vốn biến đổi',
        '',
        `- Hợp Block Hold85 + Small Hold65, x1: 2026 ${unionX1.holdout.wins}/${unionX1.holdout.days}, TB ${unionX1.holdout.averageUniqueCount.toFixed(2)} số, profit ${unionX1.holdout.profitK}K, ROI ${unionX1.holdout.roiText}.`,
        `- Cùng dàn nhưng giao x2: 2026 ${unionX2.holdout.wins}/${unionX2.holdout.days}, ${unionX2.holdout.hitX2} lần trúng giao, TB ${unionX2.holdout.averageUnitCount.toFixed(2)} đơn vị, profit ${unionX2.holdout.profitK}K, ROI ${unionX2.holdout.roiText}.`,
        `- Qua cổng production: ${result.promotion.passed ? 'CÓ' : 'KHÔNG'}.`,
        '',
        'Không thay mặc định nếu cấu hình không có lãi ở cả hai nửa train và holdout độc lập.'
    ].join('\n');
    fs.writeFileSync(markdownPath, `${markdown}\n`);
    console.log(JSON.stringify({ jsonPath, markdownPath, selected: result.selected, baselines: result.baselines, promotion }, null, 2));
}

main();
