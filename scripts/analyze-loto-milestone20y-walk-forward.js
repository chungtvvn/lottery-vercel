#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
    return new Map(argv.slice(2).map(token => {
        const [key, ...rest] = token.replace(/^--/, '').split('=');
        return [key, rest.join('=') || '1'];
    }));
}

function longestRun(rows, predicate) {
    let best = 0;
    let current = 0;
    for (const row of rows) {
        current = predicate(row) ? current + 1 : 0;
        best = Math.max(best, current);
    }
    return best;
}

function summarize(rows) {
    const days = rows.length;
    const totalHits = rows.reduce((sum, row) => sum + Number(row.hits || 0), 0);
    const hitDays = rows.filter(row => Number(row.hits || 0) >= 1).length;
    const atLeast2Days = rows.filter(row => Number(row.hits || 0) >= 2).length;
    const atLeast3Days = rows.filter(row => Number(row.hits || 0) >= 3).length;
    const winDays = rows.filter(row => Number(row.profitK || 0) > 0).length;
    const stakeK = rows.reduce((sum, row) => sum + Number(row.stakeK || 0), 0);
    const payoutK = rows.reduce((sum, row) => sum + Number(row.payoutK || 0), 0);
    const profitK = payoutK - stakeK;
    return {
        days,
        hitDays,
        atLeast2Days,
        atLeast3Days,
        winDays,
        totalHits,
        hitRate: days ? hitDays / days : 0,
        atLeast2Rate: days ? atLeast2Days / days : 0,
        atLeast3Rate: days ? atLeast3Days / days : 0,
        winRate: days ? winDays / days : 0,
        avgHitsPerDay: days ? totalHits / days : 0,
        stakeK,
        payoutK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestNoHit: longestRun(rows, row => Number(row.hits || 0) === 0),
        longestUnder2: longestRun(rows, row => Number(row.hits || 0) < 2),
        longestLoss: longestRun(rows, row => Number(row.profitK || 0) < 0)
    };
}

function groupByMethod(rows) {
    const byMethod = new Map();
    for (const row of rows) {
        if (!byMethod.has(row.methodId)) byMethod.set(row.methodId, []);
        byMethod.get(row.methodId).push(row);
    }
    return byMethod;
}

function main() {
    const args = parseArgs(process.argv);
    const reportFile = args.get('report');
    if (!reportFile) throw new Error('Cần --report=<backtest_loto_milestone20y_*.json>.');
    const splitDate = args.get('splitDate') || '2026-05-01';
    const report = JSON.parse(fs.readFileSync(path.resolve(reportFile), 'utf8'));
    const windowKey = args.get('window') || 'dateRange';
    const rows = report.dailyDetailsByWindow?.[windowKey] || [];
    if (!rows.length) throw new Error(`Report không có dailyDetailsByWindow.${windowKey}.`);
    const ranking = Array.from(groupByMethod(rows).entries()).map(([methodId, methodRows]) => {
        const trainingRows = methodRows.filter(row => row.date < splitDate);
        const holdoutRows = methodRows.filter(row => row.date >= splitDate);
        return {
            methodId,
            training: summarize(trainingRows),
            holdout: summarize(holdoutRows),
            full: summarize(methodRows)
        };
    }).sort((a, b) =>
        b.training.profitK - a.training.profitK ||
        b.training.atLeast2Rate - a.training.atLeast2Rate ||
        b.training.hitRate - a.training.hitRate ||
        a.methodId.localeCompare(b.methodId)
    );
    const selected = ranking[0] || null;
    const output = {
        generatedAt: new Date().toISOString(),
        sourceReport: path.resolve(reportFile),
        splitDate,
        methodology: {
            screening: `Chọn cấu hình bằng các ngày trước ${splitDate}.`,
            holdout: `Chấm nguyên trạng từ ${splitDate}, không chọn lại bằng kết quả holdout.`,
            warning: report.methodology?.warning || null
        },
        selected,
        ranking
    };
    const outputDir = path.join(process.cwd(), 'reports');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `analysis_loto_milestone20y_walk_forward_${stamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Report: ${outputPath}`);
    console.table(ranking.slice(0, 25).map(row => ({
        method: row.methodId,
        trainDays: row.training.days,
        trainHit: `${(row.training.hitRate * 100).toFixed(2)}%`,
        trainHit2: `${(row.training.atLeast2Rate * 100).toFixed(2)}%`,
        trainProfitK: row.training.profitK,
        testDays: row.holdout.days,
        testHit: `${(row.holdout.hitRate * 100).toFixed(2)}%`,
        testHit2: `${(row.holdout.atLeast2Rate * 100).toFixed(2)}%`,
        testAvgHits: row.holdout.avgHitsPerDay.toFixed(2),
        testProfitK: row.holdout.profitK,
        testRoi: `${(row.holdout.roi * 100).toFixed(2)}%`,
        under2: row.holdout.longestUnder2
    })));
}

if (require.main === module) main();

module.exports = {
    longestRun,
    summarize,
    groupByMethod
};
