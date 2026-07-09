#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { runConfig } = require('./research-fixed-share-profit-optimizer');

const HOLDOUT_REPORTS = [
    'research_true_pit_strategies_2026-07-03T05-44-52-032Z.json',
    'research_true_pit_strategies_2026-07-03T05-55-59-805Z.json',
    'research_true_pit_strategies_2026-07-03T06-06-04-698Z.json'
];

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        trainingReports: (args.get('trainingReports') || args.get('trainingReport') || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
    };
}

function loadRows(files) {
    const byDate = new Map();
    for (const filename of files) {
        const workspaceRelative = path.resolve(filename);
        const reportPath = path.isAbsolute(filename)
            ? filename
            : fs.existsSync(workspaceRelative)
                ? workspaceRelative
                : path.join(__dirname, '..', 'reports', filename);
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        for (const row of report.rows || []) byDate.set(row.date, row);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function enumerateConfigs() {
    const configs = [];
    for (const eta of [0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.2]) {
        for (const share of [0.01, 0.05, 0.1, 0.2]) {
            for (const gateBoost of [0, 0.25, 0.5, 1, 2, 4]) {
                for (const betCount of [5, 10, 15, 20, 25, 30, 35, 40]) {
                    configs.push({ eta, share, gateBoost, betCount });
                }
            }
        }
    }
    return configs;
}

function summarizeMonths(rows) {
    const months = new Map();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        if (!months.has(month)) {
            months.set(month, {
                month,
                days: 0,
                wins: 0,
                profitK: 0,
                stakeK: 0
            });
        }
        const summary = months.get(month);
        summary.days++;
        summary.wins += Number(row.win);
        summary.profitK += row.profitK;
        summary.stakeK += row.stakeK;
    }
    return Array.from(months.values()).map(row => ({
        ...row,
        hitRate: row.days ? row.wins / row.days : 0,
        roi: row.stakeK ? row.profitK / row.stakeK : 0
    }));
}

function evaluateTraining(rows, ids) {
    return enumerateConfigs().map(config => {
        const result = runConfig(rows, config, ids);
        const months = summarizeMonths(result.summary.rows);
        const years = Array.from(new Set(result.summary.rows.map(row => row.date.slice(0, 4))))
            .map(year => {
                const yearRows = result.summary.rows.filter(row => row.date.startsWith(year));
                const wins = yearRows.filter(row => row.win).length;
                const stakeK = yearRows.reduce((sum, row) => sum + row.stakeK, 0);
                const profitK = yearRows.reduce((sum, row) => sum + row.profitK, 0);
                return {
                    year,
                    days: yearRows.length,
                    wins,
                    hitRate: yearRows.length ? wins / yearRows.length : 0,
                    stakeK,
                    profitK,
                    roi: stakeK ? profitK / stakeK : 0
                };
            });
        return {
            config,
            summary: {
                days: result.summary.days,
                wins: result.summary.wins,
                hitRate: result.summary.hitRate,
                profitK: result.summary.profitK,
                roi: result.summary.roi,
                longestLoss: result.summary.longestLoss,
                maxDrawdownK: result.summary.maxDrawdownK
            },
            months,
            years,
            profitableYears: years.filter(row => row.profitK > 0).length,
            minYearProfitK: Math.min(...years.map(row => row.profitK)),
            minYearHitRate: Math.min(...years.map(row => row.hitRate)),
            profitableMonths: months.filter(row => row.profitK > 0).length,
            nonLosingMonths: months.filter(row => row.profitK >= 0).length,
            minMonthlyProfitK: Math.min(...months.map(row => row.profitK)),
            minMonthlyHitRate: Math.min(...months.map(row => row.hitRate)),
            finalWeights: result.finalWeights
        };
    });
}

function choose(training) {
    const stabilitySort = (a, b) =>
        b.profitableYears - a.profitableYears ||
        b.minYearProfitK - a.minYearProfitK ||
        b.profitableMonths - a.profitableMonths ||
        b.nonLosingMonths - a.nonLosingMonths ||
        b.minMonthlyProfitK - a.minMonthlyProfitK ||
        b.summary.profitK - a.summary.profitK ||
        a.summary.maxDrawdownK - b.summary.maxDrawdownK;
    const monthlyProfit = training.slice().sort(stabilitySort)[0];
    const monthlyHit = training.slice().sort((a, b) =>
        b.minMonthlyHitRate - a.minMonthlyHitRate ||
        b.profitableMonths - a.profitableMonths ||
        b.summary.profitK - a.summary.profitK
    )[0];
    const hold70 = training
        .filter(row => row.config.betCount === 30)
        .sort(stabilitySort)[0];
    return { monthlyProfit, monthlyHit, hold70 };
}

function main() {
    const options = parseArgs();
    if (!options.trainingReports.length) {
        throw new Error(
            'Thiếu --trainingReports=<report 2024,report 2025> point-in-time đầy đủ.'
        );
    }
    const trainingRows = loadRows(options.trainingReports);
    const holdoutRows = loadRows(HOLDOUT_REPORTS);
    const ids = Object.keys(trainingRows[0].strategies);
    const training = evaluateTraining(trainingRows, ids);
    const selected = choose(training);
    const evaluations = {};
    for (const [name, candidate] of Object.entries(selected)) {
        const holdout = runConfig(
            holdoutRows,
            candidate.config,
            ids,
            candidate.finalWeights
        ).summary;
        evaluations[name] = {
            config: candidate.config,
            training: {
                ...candidate.summary,
                years: candidate.years,
                profitableYears: candidate.profitableYears,
                minYearProfitK: candidate.minYearProfitK,
                minYearHitRate: candidate.minYearHitRate,
                profitableMonths: candidate.profitableMonths,
                nonLosingMonths: candidate.nonLosingMonths,
                minMonthlyProfitK: candidate.minMonthlyProfitK,
                minMonthlyHitRate: candidate.minMonthlyHitRate,
                months: candidate.months
            },
            holdout: {
                ...holdout,
                monthly: summarizeMonths(holdout.rows)
            }
        };
    }
    const report = {
        generatedAt: new Date().toISOString(),
        sourceTrainingReports: options.trainingReports.map(filename => path.resolve(filename)),
        methodology: {
            selection: 'Chọn theo năm tệ nhất, sau đó từng tháng của full-year training; khóa trước holdout.',
            holdout: 'Toàn bộ 179 ngày point-in-time năm 2026.',
            economics: '1000K/số, ăn 84.'
        },
        evaluations,
        topStableTrainingConfigs: training
            .slice()
            .sort((a, b) =>
                b.profitableMonths - a.profitableMonths ||
                b.minMonthlyProfitK - a.minMonthlyProfitK ||
                b.summary.profitK - a.summary.profitK
            )
            .slice(0, 30)
            .map(({ finalWeights, ...row }) => row)
    };
    const reportPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_fixed_share_monthly_optimizer_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        evaluations: Object.fromEntries(
            Object.entries(evaluations).map(([name, value]) => [name, {
                config: value.config,
                training: { ...value.training, months: value.training.months },
                holdout: { ...value.holdout, rows: undefined, monthly: value.holdout.monthly }
            }])
        )
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    summarizeMonths,
    choose
};
