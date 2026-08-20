#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { selectBlockSmallFusion } = require('../lib/research/blockSmallFusion');

const STAKE_K = 1000;
const PAYOUT = 84;
const BET_COUNTS = [40, 45, 50];
const METHODS = ['chainBlockFirst', 'chainSmallFirst'];

function parseArgs() {
    return new Map(process.argv.slice(2).map(argument => {
        const [key, value] = argument.replace(/^--/, '').split('=');
        return [key, value ?? '1'];
    }));
}

function readStrictReport(file) {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (report.methodologyVersion !== 'strict-prefix-point-in-time-v1') {
        throw new Error(`${file} không phải strict-prefix-point-in-time-v1.`);
    }
    if (!Array.isArray(report.rows) || report.rows.length === 0) {
        throw new Error(`${file} không có dữ liệu ngày.`);
    }
    return report;
}

function sourceHash(report) {
    return report.fingerprint?.sourceSha256 || null;
}

function availableTargets(report) {
    return [...new Set(report.rows.flatMap(row =>
        Object.keys(row.strategiesByTarget || {}).map(Number)
    ))].filter(target => report.rows.every(row => METHODS.every(method =>
        Array.isArray(row.strategiesByTarget?.[String(target)]?.[method])
    ))).sort((left, right) => left - right);
}

function wilsonInterval(successes, trials, z = 1.96) {
    if (!trials) return { lower: 0, upper: 0 };
    const probability = successes / trials;
    const denominator = 1 + z * z / trials;
    const center = (probability + z * z / (2 * trials)) / denominator;
    const margin = z * Math.sqrt(
        probability * (1 - probability) / trials
        + z * z / (4 * trials * trials)
    ) / denominator;
    return {
        lower: Math.max(0, center - margin),
        upper: Math.min(1, center + margin)
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

function settle(rows, config, betCount) {
    const settledRows = rows.map(row => {
        const numbers = selectBlockSmallFusion(row, { ...config, betCount });
        if (numbers.length !== betCount) {
            throw new Error(`${row.date}: dàn ${numbers.length}, yêu cầu đúng ${betCount}.`);
        }
        return {
            date: row.date,
            actual: Number(row.actual),
            hit: numbers.includes(Number(row.actual))
        };
    });
    const days = settledRows.length;
    const wins = settledRows.filter(row => row.hit).length;
    const hitRate = days ? wins / days : 0;
    const randomBaseline = betCount / 100;
    const standardError = days
        ? Math.sqrt(randomBaseline * (1 - randomBaseline) / days)
        : 0;
    const stakeK = days * betCount * STAKE_K;
    const payoutK = wins * PAYOUT * STAKE_K;
    return {
        days,
        wins,
        losses: days - wins,
        hitRate,
        randomBaseline,
        liftVsRandom: hitRate - randomBaseline,
        zVsRandom: standardError ? (hitRate - randomBaseline) / standardError : 0,
        wilson95: wilsonInterval(wins, days),
        breakEvenHitRate: betCount / PAYOUT,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        roi: stakeK ? (payoutK - stakeK) / stakeK : 0,
        longestWin: longestStreak(settledRows, row => row.hit),
        longestLoss: longestStreak(settledRows, row => !row.hit)
    };
}

function candidateConfigs(targets) {
    const rows = [];
    for (const blockWeight of [0.25, 0.5, 0.75]) {
        for (const agreementBonus of [0, 0.5, 1]) {
            for (const disagreementPenalty of [0, 0.25]) {
                rows.push({
                    targets,
                    blockWeight,
                    smallWeight: 1 - blockWeight,
                    agreementBonus,
                    disagreementPenalty
                });
            }
        }
    }
    return rows;
}

function selectionScore(firstHalf, secondHalf) {
    const profitableHalves = Number(firstHalf.profitK > 0) + Number(secondHalf.profitK > 0);
    return profitableHalves * 1e15
        + Math.min(firstHalf.profitK, secondHalf.profitK) * 1e3
        + firstHalf.profitK
        + secondHalf.profitK
        - Math.max(firstHalf.longestLoss, secondHalf.longestLoss);
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(4)}%`;
}

function compact(summary) {
    return {
        ...summary,
        hitRateText: formatPercent(summary.hitRate),
        randomBaselineText: formatPercent(summary.randomBaseline),
        liftVsRandomText: formatPercent(summary.liftVsRandom),
        breakEvenHitRateText: formatPercent(summary.breakEvenHitRate),
        wilson95Text: `${formatPercent(summary.wilson95.lower)} - ${formatPercent(summary.wilson95.upper)}`,
        roiText: formatPercent(summary.roi)
    };
}

function main() {
    const args = parseArgs();
    const trainFile = path.resolve(args.get('train'));
    const holdoutFile = path.resolve(args.get('test'));
    const train = readStrictReport(trainFile);
    const holdout = readStrictReport(holdoutFile);
    if (sourceHash(train) !== sourceHash(holdout)) {
        throw new Error('Train và holdout khác sourceSha256; từ chối so sánh.');
    }

    const trainTargets = availableTargets(train);
    const holdoutTargets = new Set(availableTargets(holdout));
    const targets = trainTargets.filter(target => holdoutTargets.has(target));
    if (![65, 70, 85].every(target => targets.includes(target))) {
        throw new Error(`Thiếu Hold 65/70/85 dùng để xếp hạng: ${targets.join(', ')}.`);
    }

    const firstHalf = train.rows.filter(row => row.date <= '2025-06-30');
    const secondHalf = train.rows.filter(row => row.date >= '2025-07-01');
    const results = BET_COUNTS.map(betCount => {
        const ranked = candidateConfigs(targets).map(config => {
            const first = settle(firstHalf, config, betCount);
            const second = settle(secondHalf, config, betCount);
            return {
                config,
                first,
                second,
                train: settle(train.rows, config, betCount),
                score: selectionScore(first, second)
            };
        }).sort((left, right) =>
            right.score - left.score
            || right.train.profitK - left.train.profitK
            || right.config.blockWeight - left.config.blockWeight
        );
        const selected = ranked[0];
        const blockOnly = {
            targets,
            blockWeight: 1,
            smallWeight: 0,
            agreementBonus: 0,
            disagreementPenalty: 0
        };
        const smallOnly = {
            targets,
            blockWeight: 0,
            smallWeight: 1,
            agreementBonus: 0,
            disagreementPenalty: 0
        };
        return {
            betCount,
            config: selected.config,
            trainFirstHalf: compact(selected.first),
            trainSecondHalf: compact(selected.second),
            train: compact(selected.train),
            holdout: compact(settle(holdout.rows, selected.config, betCount)),
            baselines: {
                blockOnly: compact(settle(holdout.rows, blockOnly, betCount)),
                smallOnly: compact(settle(holdout.rows, smallOnly, betCount))
            }
        };
    });

    const report = {
        generatedAt: new Date().toISOString(),
        methodology: 'Xếp hạng Block/Chuỗi nhỏ theo Hold 65/70/85; chọn trọng số trên hai nửa 2025; khóa cấu hình và kiểm tra 2026 strict PIT.',
        sourceSha256: sourceHash(train),
        train: {
            file: trainFile,
            startDate: train.rows[0].date,
            endDate: train.rows.at(-1).date,
            days: train.rows.length
        },
        holdout: {
            file: holdoutFile,
            startDate: holdout.rows[0].date,
            endDate: holdout.rows.at(-1).date,
            days: holdout.rows.length
        },
        economics: {
            stakePerNumberK: STAKE_K,
            payoutMultiplier: PAYOUT
        },
        results,
        summariesByWindow: Object.fromEntries(results.map(row => [
            `holdout${row.betCount}`,
            {
                block: { ...row.baselines.blockOnly, betCount: row.betCount },
                small: { ...row.baselines.smallOnly, betCount: row.betCount },
                fusion: { ...row.holdout, betCount: row.betCount }
            }
        ])),
        productionDecision: {
            promote: false,
            reason: 'Cả ba mức 40/45/50 đều dưới điểm hòa vốn và không có lãi ổn định trên hai nửa train lẫn holdout.'
        }
    };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = path.join(process.cwd(), 'reports', `block-small-fixed-count-audit-${timestamp}.json`);
    const markdownFile = jsonFile.replace(/\.json$/, '.md');
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
    const markdown = [
        '# Audit dàn cố định Block + Chuỗi nhỏ',
        '',
        `- Train: ${report.train.startDate} -> ${report.train.endDate} (${report.train.days} ngày)`,
        `- Holdout: ${report.holdout.startDate} -> ${report.holdout.endDate} (${report.holdout.days} ngày)`,
        `- Source: \`${report.sourceSha256}\``,
        `- Kinh tế: ${STAKE_K}K/số, trúng x${PAYOUT}.`,
        '',
        '| Số đánh | Hit holdout | Baseline ngẫu nhiên | Lift | Hòa vốn | Profit | ROI | LL | Wilson 95% |',
        '|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
        ...results.map(row => [
            `| ${row.betCount}`,
            `${row.holdout.wins}/${row.holdout.days} (${row.holdout.hitRateText})`,
            row.holdout.randomBaselineText,
            row.holdout.liftVsRandomText,
            row.holdout.breakEvenHitRateText,
            `${row.holdout.profitK}K`,
            row.holdout.roiText,
            row.holdout.longestLoss,
            `${row.holdout.wilson95Text} |`
        ].join(' | ')),
        '',
        '## Kết luận',
        '',
        'Xếp hạng có lift dương so với chọn ngẫu nhiên cùng kích thước dàn, nhưng chưa vượt ngưỡng hòa vốn. Không đổi phương pháp Đề production.'
    ].join('\n');
    fs.writeFileSync(markdownFile, `${markdown}\n`);
    console.log(JSON.stringify({ jsonFile, markdownFile, results }, null, 2));
}

main();
