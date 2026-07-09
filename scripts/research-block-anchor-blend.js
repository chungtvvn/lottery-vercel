#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const STAKE_PER_NUMBER_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const SUPPORT_GROUPS = {
    numberOnly: [
        'numberAvgRisk',
        'numberConsensusRisk',
        'numberPosteriorDiversity',
        'numberWeightedRisk'
    ],
    numberAndActive: [
        'numberAvgRisk',
        'numberConsensusRisk',
        'numberPosteriorDiversity',
        'numberWeightedRisk',
        'activeOnlyAvgRisk'
    ],
    independent: [
        'chainSmallFirst',
        'numberAvgRisk',
        'numberPosteriorDiversity',
        'numberWeightedRisk',
        'activeOnlyAvgRisk'
    ],
    allExceptBlock: [
        'chainSmallFirst',
        'chainFreqFirst',
        'chainRiskFirst',
        'numberAvgRisk',
        'numberConsensusRisk',
        'numberPosteriorDiversity',
        'numberWeightedRisk',
        'activeOnlyAvgRisk'
    ]
};

function parseArgs(argv) {
    const args = {};
    for (const token of argv.slice(2)) {
        if (!token.startsWith('--')) continue;
        const [key, ...rest] = token.slice(2).split('=');
        args[key] = rest.join('=');
    }
    return args;
}

function loadRows(files) {
    const byDate = new Map();
    for (const filename of files) {
        const resolved = path.resolve(filename);
        const report = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        for (const row of report.rows || []) byDate.set(row.date, row);
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function supportScore(row, number, ids) {
    return ids.reduce(
        (sum, id) => sum + Number((row.strategies[id] || []).includes(number)),
        0
    );
}

function blendBlock(row, supportIds, swapCount) {
    const block = new Set(row.strategies.chainBlockFirst || []);
    const inside = Array.from(block)
        .map(number => ({ number, support: supportScore(row, number, supportIds) }))
        .sort((a, b) => a.support - b.support || b.number - a.number);
    const outside = ALL_NUMBERS
        .filter(number => !block.has(number))
        .map(number => ({ number, support: supportScore(row, number, supportIds) }))
        .sort((a, b) => b.support - a.support || a.number - b.number);
    const result = new Set(block);
    for (let index = 0; index < swapCount; index++) {
        if (!inside[index] || !outside[index]) break;
        result.delete(inside[index].number);
        result.add(outside[index].number);
    }
    return Array.from(result).sort((a, b) => a - b);
}

function summarize(rows, config) {
    let wins = 0;
    let longestWin = 0;
    let longestLoss = 0;
    let currentType = null;
    let currentLength = 0;
    let cumulativeProfitK = 0;
    let peakProfitK = 0;
    let maxDrawdownK = 0;
    const details = [];
    for (const row of rows) {
        const betNumbers = blendBlock(
            row,
            SUPPORT_GROUPS[config.supportGroup],
            config.swapCount
        );
        const win = betNumbers.includes(row.actual);
        wins += Number(win);
        const profitK = win
            ? PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K -
                betNumbers.length * STAKE_PER_NUMBER_K
            : -betNumbers.length * STAKE_PER_NUMBER_K;
        cumulativeProfitK += profitK;
        peakProfitK = Math.max(peakProfitK, cumulativeProfitK);
        maxDrawdownK = Math.max(maxDrawdownK, peakProfitK - cumulativeProfitK);
        const type = win ? 'win' : 'loss';
        if (currentType === type) currentLength++;
        else {
            currentType = type;
            currentLength = 1;
        }
        longestWin = Math.max(longestWin, type === 'win' ? currentLength : 0);
        longestLoss = Math.max(longestLoss, type === 'loss' ? currentLength : 0);
        details.push({
            date: row.date,
            actual: row.actual,
            win,
            profitK,
            cumulativeProfitK,
            betNumbers
        });
    }
    const stakeK = rows.length * 30 * STAKE_PER_NUMBER_K;
    const profitK = wins * PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K - stakeK;
    return {
        days: rows.length,
        wins,
        hitRate: rows.length ? wins / rows.length : 0,
        stakeK,
        profitK,
        roi: stakeK ? profitK / stakeK : 0,
        longestWin,
        longestLoss,
        maxDrawdownK,
        rows: details
    };
}

function yearlySummary(rows, config) {
    const years = Array.from(new Set(rows.map(row => row.date.slice(0, 4))));
    return years.map(year => ({
        year,
        ...summarize(rows.filter(row => row.date.startsWith(year)), config),
        rows: undefined
    }));
}

function enumerateConfigs() {
    const configs = [];
    for (const supportGroup of Object.keys(SUPPORT_GROUPS)) {
        for (const swapCount of [0, 1, 2, 3, 5, 7, 10, 15]) {
            configs.push({ supportGroup, swapCount });
        }
    }
    return configs;
}

function selectConfig(trainingRows) {
    return enumerateConfigs().map(config => {
        const years = yearlySummary(trainingRows, config);
        const combined = summarize(trainingRows, config);
        return {
            config,
            years,
            minYearProfitK: Math.min(...years.map(year => year.profitK)),
            minYearHitRate: Math.min(...years.map(year => year.hitRate)),
            combined: { ...combined, rows: undefined }
        };
    }).sort((a, b) =>
        b.minYearProfitK - a.minYearProfitK ||
        b.minYearHitRate - a.minYearHitRate ||
        b.combined.profitK - a.combined.profitK ||
        a.combined.maxDrawdownK - b.combined.maxDrawdownK ||
        a.config.swapCount - b.config.swapCount
    );
}

function main() {
    const args = parseArgs(process.argv);
    const trainingReports = (args.trainingReports || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    const holdoutReports = (args.holdoutReports || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
    if (!trainingReports.length || !holdoutReports.length) {
        throw new Error('Cần --trainingReports=<...> và --holdoutReports=<...>.');
    }
    const trainingRows = loadRows(trainingReports);
    const holdoutRows = loadRows(holdoutReports);
    const ranking = selectConfig(trainingRows);
    const selected = ranking[0];
    const holdout = summarize(holdoutRows, selected.config);
    const baseline = summarize(holdoutRows, {
        supportGroup: 'numberOnly',
        swapCount: 0
    });
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            anchor: 'Giữ chainBlockFirst làm lõi 30 số.',
            adjustment: 'Chỉ đổi k số có support thấp nhất với k số ngoài Block có support cao nhất.',
            selection: 'Chọn trên 2024-2025 theo profit năm tệ nhất; khóa trước 2026.',
            economics: 'Hold70, 1000K/số, ăn 84.',
            warning: 'Nghiên cứu local, không thay đổi production.'
        },
        selected,
        holdout,
        baseline,
        delta: {
            wins: holdout.wins - baseline.wins,
            profitK: holdout.profitK - baseline.profitK,
            longestLoss: holdout.longestLoss - baseline.longestLoss,
            maxDrawdownK: holdout.maxDrawdownK - baseline.maxDrawdownK
        },
        topCandidates: ranking.slice(0, 20)
    };
    const reportPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_block_anchor_blend_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        selected,
        holdout: { ...holdout, rows: undefined },
        baseline: { ...baseline, rows: undefined },
        delta: report.delta
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    blendBlock,
    summarize,
    selectConfig
};
