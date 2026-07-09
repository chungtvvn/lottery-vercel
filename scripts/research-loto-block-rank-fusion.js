#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { summarize } = require('./analyze-loto-milestone20y-walk-forward');

const PRIZE_KEYS = [
    'special', 'prize1', 'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];

function parseArgs(argv) {
    return new Map(argv.slice(2).map(token => {
        const [key, ...rest] = token.replace(/^--/, '').split('=');
        return [key, rest.join('=') || '1'];
    }));
}

function normalizeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? ((Math.trunc(number) % 100) + 100) % 100 : null;
}

function rankFusion(left, right, leftWeight, k = 5) {
    const score = new Map();
    const add = (values, weight) => values.forEach((raw, index) => {
        const number = normalizeNumber(raw);
        if (number === null) return;
        const row = score.get(number) || { number, score: 0, votes: 0, bestRank: Infinity };
        row.score += weight / (k + index + 1);
        row.votes += 1;
        row.bestRank = Math.min(row.bestRank, index + 1);
        score.set(number, row);
    });
    add(left || [], leftWeight);
    add(right || [], 1 - leftWeight);
    return Array.from(score.values()).sort((a, b) =>
        b.score - a.score ||
        b.votes - a.votes ||
        a.bestRank - b.bestRank ||
        a.number - b.number
    ).map(row => row.number);
}

function countActual(day) {
    const counts = new Map();
    for (const key of PRIZE_KEYS) {
        const number = normalizeNumber(day?.[key]);
        if (number === null) continue;
        counts.set(number, (counts.get(number) || 0) + 1);
    }
    return counts;
}

function settle(date, numbers, actualCounts, stakeK, payoutK) {
    const hits = numbers.reduce((sum, number) => sum + (actualCounts.get(number) || 0), 0);
    const dayStakeK = numbers.length * stakeK;
    const dayPayoutK = hits * payoutK;
    return {
        date,
        numbers,
        hits,
        stakeK: dayStakeK,
        payoutK: dayPayoutK,
        profitK: dayPayoutK - dayStakeK
    };
}

function main() {
    const args = parseArgs(process.argv);
    const reportFile = args.get('report');
    if (!reportFile) throw new Error('Cần --report=<backtest_loto_milestone20y_*.json>.');
    const splitDate = args.get('splitDate') || '2026-05-01';
    const topCounts = String(args.get('topCounts') || '3,4,5,6,7,10,12,14')
        .split(',').map(Number).filter(Number.isFinite);
    const weights = String(args.get('weights') || '0.2,0.35,0.5,0.65,0.8')
        .split(',').map(Number).filter(value => value > 0 && value < 1);
    const stakeK = Number(args.get('stakeK') || 2200);
    const payoutK = Number(args.get('payoutK') || 8000);
    const report = JSON.parse(fs.readFileSync(path.resolve(reportFile), 'utf8'));
    const details = report.dailyDetailsByWindow?.dateRange || [];
    if (!details.length) throw new Error('Report không có dailyDetailsByWindow.dateRange.');
    const raw = JSON.parse(fs.readFileSync(
        path.join(process.cwd(), 'lib', 'data', 'xsmb-2-digits.json'),
        'utf8'
    ));
    const actualByDate = new Map(raw.map(day => [day.date, countActual(day)]));
    const top20Rows = details.filter(row => row.betCount === 20);
    const byMethod = new Map();
    for (const row of top20Rows) {
        if (!byMethod.has(row.methodId)) byMethod.set(row.methodId, new Map());
        byMethod.get(row.methodId).set(row.date, row.numbers.map(Number));
    }
    const smallMethods = Array.from(byMethod.keys()).filter(id => id.startsWith('chainSmallFirst'));
    const blockMethods = Array.from(byMethod.keys()).filter(id => id.startsWith('chainBlockFirst'));
    const allDates = Array.from(new Set(top20Rows.map(row => row.date))).sort();
    const configs = [];

    for (const smallMethod of smallMethods) {
        for (const blockMethod of blockMethods) {
            for (const smallWeight of weights) {
                const rankedByDate = new Map(allDates.map(date => [
                    date,
                    rankFusion(
                        byMethod.get(smallMethod)?.get(date) || [],
                        byMethod.get(blockMethod)?.get(date) || [],
                        smallWeight
                    )
                ]));
                for (const topCount of topCounts) {
                    const rows = allDates.map(date => settle(
                        date,
                        (rankedByDate.get(date) || []).slice(0, topCount),
                        actualByDate.get(date) || new Map(),
                        stakeK,
                        payoutK
                    ));
                    configs.push({
                        id: `rrf:w${smallWeight}:${smallMethod}+${blockMethod}:top${topCount}`,
                        smallMethod,
                        blockMethod,
                        smallWeight,
                        blockWeight: 1 - smallWeight,
                        topCount,
                        training: summarize(rows.filter(row => row.date < splitDate)),
                        holdout: summarize(rows.filter(row => row.date >= splitDate)),
                        full: summarize(rows)
                    });
                }
            }
        }
    }

    const byTop = {};
    for (const topCount of topCounts) {
        const rows = configs.filter(config => config.topCount === topCount);
        const byProfit = rows.slice().sort((a, b) =>
            b.training.profitK - a.training.profitK ||
            b.training.atLeast2Rate - a.training.atLeast2Rate ||
            b.training.hitRate - a.training.hitRate ||
            a.id.localeCompare(b.id)
        )[0];
        const byHit2 = rows.slice().sort((a, b) =>
            b.training.atLeast2Rate - a.training.atLeast2Rate ||
            b.training.profitK - a.training.profitK ||
            b.training.hitRate - a.training.hitRate ||
            a.id.localeCompare(b.id)
        )[0];
        byTop[topCount] = { byProfit, byHit2 };
    }
    const output = {
        generatedAt: new Date().toISOString(),
        sourceReport: path.resolve(reportFile),
        splitDate,
        methodology: {
            ranking: 'Reciprocal-rank fusion giữa thứ hạng Chuỗi nhỏ trước và Nhịp block trước.',
            selection: `Chọn trọng số/cấu hình bằng ngày trước ${splitDate}; khóa rồi chấm phần sau.`,
            pointInTimeWarning: report.methodology?.warning || null,
            economics: `${stakeK}K/số, ${payoutK}K/hit.`
        },
        config: { topCounts, weights, smallMethods, blockMethods },
        selectedByTop: byTop
    };
    const outputDir = path.join(process.cwd(), 'reports');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `research_loto_block_rank_fusion_${stamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Report: ${outputPath}`);
    console.table(topCounts.flatMap(topCount => ['byProfit', 'byHit2'].map(objective => {
        const row = byTop[topCount][objective];
        return {
            top: topCount,
            objective,
            smallWeight: row.smallWeight,
            small: row.smallMethod,
            block: row.blockMethod,
            trainProfitK: row.training.profitK,
            trainHit2: `${(row.training.atLeast2Rate * 100).toFixed(2)}%`,
            testHit: `${(row.holdout.hitRate * 100).toFixed(2)}%`,
            testHit2: `${(row.holdout.atLeast2Rate * 100).toFixed(2)}%`,
            testAvg: row.holdout.avgHitsPerDay.toFixed(2),
            testProfitK: row.holdout.profitK,
            testRoi: `${(row.holdout.roi * 100).toFixed(2)}%`,
            under2: row.holdout.longestUnder2
        };
    })));
}

if (require.main === module) main();

module.exports = {
    rankFusion,
    countActual,
    settle
};
