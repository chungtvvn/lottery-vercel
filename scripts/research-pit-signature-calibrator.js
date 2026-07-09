#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const STAKE_PER_NUMBER_K = 1000;
const PAYOUT_MULTIPLIER = 84;
const HOLDOUT_REPORTS = [
    'research_true_pit_strategies_2026-07-03T05-44-52-032Z.json',
    'research_true_pit_strategies_2026-07-03T05-55-59-805Z.json',
    'research_true_pit_strategies_2026-07-03T06-06-04-698Z.json'
];

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

function createCell() {
    return { exposures: 0, hits: 0 };
}

function posterior(cell, priorStrength) {
    return (cell.hits + priorStrength * 0.01) /
        (cell.exposures + priorStrength);
}

function logit(probability) {
    const bounded = Math.min(1 - 1e-9, Math.max(1e-9, probability));
    return Math.log(bounded / (1 - bounded));
}

function createState(ids) {
    return {
        masks: new Map(),
        counts: Array.from({ length: ids.length + 1 }, createCell),
        experts: ids.map(() => ({ selected: createCell(), omitted: createCell() }))
    };
}

function describeNumber(row, ids, number) {
    let mask = 0;
    let membershipCount = 0;
    const selected = [];
    ids.forEach((id, index) => {
        const included = (row.strategies[id] || []).includes(number);
        selected.push(included);
        if (included) {
            mask |= (1 << index);
            membershipCount++;
        }
    });
    return { mask, membershipCount, selected };
}

function scoreDescription(state, description, config) {
    const maskCell = state.masks.get(description.mask) || createCell();
    const countCell = state.counts[description.membershipCount];
    const maskLogit = logit(posterior(maskCell, config.maskPrior));
    const countLogit = logit(posterior(countCell, config.countPrior));
    let expertLogit = 0;
    description.selected.forEach((selected, index) => {
        const cell = selected
            ? state.experts[index].selected
            : state.experts[index].omitted;
        expertLogit += logit(posterior(cell, config.expertPrior));
    });
    return (
        config.maskWeight * maskLogit +
        config.countWeight * countLogit +
        config.expertWeight * expertLogit / description.selected.length
    );
}

function rankNumbers(row, ids, state, config) {
    return ALL_NUMBERS.map(number => {
        const description = describeNumber(row, ids, number);
        return {
            number,
            score: scoreDescription(state, description, config),
            description
        };
    }).sort((a, b) => b.score - a.score || a.number - b.number);
}

function updateState(state, ranked, actual) {
    for (const item of ranked) {
        const hit = item.number === actual ? 1 : 0;
        if (!state.masks.has(item.description.mask)) {
            state.masks.set(item.description.mask, createCell());
        }
        const maskCell = state.masks.get(item.description.mask);
        maskCell.exposures++;
        maskCell.hits += hit;

        const countCell = state.counts[item.description.membershipCount];
        countCell.exposures++;
        countCell.hits += hit;

        item.description.selected.forEach((selected, index) => {
            const cell = selected
                ? state.experts[index].selected
                : state.experts[index].omitted;
            cell.exposures++;
            cell.hits += hit;
        });
    }
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        cumulativeProfitK: 0,
        peakProfitK: 0,
        maxDrawdownK: 0,
        currentType: null,
        currentLength: 0,
        longestWin: 0,
        longestLoss: 0,
        rows: []
    };
}

function addResult(summary, row, betNumbers) {
    const win = betNumbers.includes(row.actual);
    const stakeK = betNumbers.length * STAKE_PER_NUMBER_K;
    const payoutK = win ? PAYOUT_MULTIPLIER * STAKE_PER_NUMBER_K : 0;
    const profitK = payoutK - stakeK;
    summary.days++;
    summary.wins += Number(win);
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += profitK;
    summary.cumulativeProfitK += profitK;
    summary.peakProfitK = Math.max(summary.peakProfitK, summary.cumulativeProfitK);
    summary.maxDrawdownK = Math.max(
        summary.maxDrawdownK,
        summary.peakProfitK - summary.cumulativeProfitK
    );
    const type = win ? 'win' : 'loss';
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(
        summary.longestWin,
        type === 'win' ? summary.currentLength : 0
    );
    summary.longestLoss = Math.max(
        summary.longestLoss,
        type === 'loss' ? summary.currentLength : 0
    );
    summary.rows.push({
        date: row.date,
        actual: row.actual,
        betNumbers,
        win,
        stakeK,
        payoutK,
        profitK,
        cumulativeProfitK: summary.cumulativeProfitK
    });
}

function finalize(summary) {
    const {
        currentType,
        currentLength,
        cumulativeProfitK,
        peakProfitK,
        ...result
    } = summary;
    return {
        ...result,
        hitRate: result.days ? result.wins / result.days : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0,
        breakEvenHitRate: result.rows[0]
            ? result.rows[0].betNumbers.length / PAYOUT_MULTIPLIER
            : 0
    };
}

function runRows(rows, config, ids, initialState = null) {
    const state = initialState || createState(ids);
    const summary = createSummary(
        `signature_mask${config.maskPrior}_count${config.countPrior}` +
        `_expert${config.expertPrior}_weights${config.maskWeight}-` +
        `${config.countWeight}-${config.expertWeight}_bet${config.betCount}`
    );
    for (const row of rows) {
        const ranked = rankNumbers(row, ids, state, config);
        const betNumbers = ranked
            .slice(0, config.betCount)
            .map(item => item.number);
        addResult(summary, row, betNumbers);
        updateState(state, ranked, row.actual);
    }
    return { state, summary: finalize(summary) };
}

function enumerateConfigs() {
    const configs = [];
    for (const maskPrior of [50, 100, 250, 500, 1000]) {
        for (const countPrior of [100, 500, 1000]) {
            for (const expertPrior of [100, 500, 1000]) {
                for (const weights of [
                    [1, 0, 0],
                    [1, 0.25, 0],
                    [1, 0.5, 0.25],
                    [1, 1, 0.5],
                    [0, 1, 0.5],
                    [0, 0, 1]
                ]) {
                    configs.push({
                        maskPrior,
                        countPrior,
                        expertPrior,
                        maskWeight: weights[0],
                        countWeight: weights[1],
                        expertWeight: weights[2],
                        betCount: 30
                    });
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
            months.set(month, { month, days: 0, wins: 0, profitK: 0 });
        }
        const item = months.get(month);
        item.days++;
        item.wins += Number(row.win);
        item.profitK += row.profitK;
    }
    return Array.from(months.values()).map(item => ({
        ...item,
        hitRate: item.wins / item.days
    }));
}

function selectConfig(trainingRows, ids) {
    const candidates = enumerateConfigs().map(config => {
        const result = runRows(trainingRows, config, ids);
        const months = summarizeMonths(result.summary.rows);
        return {
            config,
            summary: result.summary,
            profitableMonths: months.filter(month => month.profitK > 0).length,
            worstMonthlyProfitK: Math.min(...months.map(month => month.profitK)),
            months
        };
    });
    candidates.sort((a, b) =>
        b.profitableMonths - a.profitableMonths ||
        b.worstMonthlyProfitK - a.worstMonthlyProfitK ||
        b.summary.profitK - a.summary.profitK ||
        a.summary.maxDrawdownK - b.summary.maxDrawdownK
    );
    return candidates;
}

function main() {
    const args = parseArgs(process.argv);
    if (!args.trainingReport) {
        throw new Error('Thiếu --trainingReport=<full daily point-in-time report>');
    }
    const trainingRows = loadRows([args.trainingReport]);
    const holdoutFiles = args.holdoutReports
        ? args.holdoutReports.split(',').map(file => file.trim())
        : HOLDOUT_REPORTS.map(file => path.join(__dirname, '..', 'reports', file));
    const holdoutRows = loadRows(holdoutFiles);
    const ids = Object.keys(trainingRows[0].strategies);
    const candidates = selectConfig(trainingRows, ids);
    const selected = candidates[0];

    const trained = runRows(trainingRows, selected.config, ids);
    const holdout = runRows(
        holdoutRows,
        selected.config,
        ids,
        trained.state
    ).summary;
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: {
            training: 'Full daily strict point-in-time training; cập nhật posterior sau mỗi kết quả.',
            selection: 'Tối đa số tháng có lãi, rồi tháng tệ nhất, tổng profit và drawdown.',
            holdout: 'Toàn bộ 2026, khóa tham số trước khi kiểm định.',
            warning: 'Thử nghiệm nghiên cứu; không thay đổi phương pháp production.'
        },
        selectedConfig: selected.config,
        training: {
            ...selected.summary,
            rows: undefined,
            months: selected.months
        },
        holdout: {
            ...holdout,
            months: summarizeMonths(holdout.rows)
        },
        topCandidates: candidates.slice(0, 20).map(candidate => ({
            config: candidate.config,
            days: candidate.summary.days,
            wins: candidate.summary.wins,
            hitRate: candidate.summary.hitRate,
            profitK: candidate.summary.profitK,
            roi: candidate.summary.roi,
            longestLoss: candidate.summary.longestLoss,
            maxDrawdownK: candidate.summary.maxDrawdownK,
            profitableMonths: candidate.profitableMonths,
            worstMonthlyProfitK: candidate.worstMonthlyProfitK
        }))
    };
    const reportPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_pit_signature_calibrator_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        selectedConfig: report.selectedConfig,
        training: report.training,
        holdout: { ...report.holdout, rows: undefined }
    }, null, 2));
}

if (require.main === module) main();

module.exports = {
    createState,
    describeNumber,
    rankNumbers,
    runRows,
    selectConfig
};
