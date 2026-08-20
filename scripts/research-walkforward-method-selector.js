#!/usr/bin/env node
/*
 * Offline research only.  It selects exactly one fixed-30 method per day and
 * never replaces a production default.  The candidate score for D is derived
 * exclusively from settlements strictly before D.
 */
const fs = require('fs');
const path = require('path');

const REPORT_FILES = [
    'research_true_pit_strategies_2026-07-11T08-57-02-008Z.json',
    'research_true_pit_strategies_2026-07-11T09-23-16-070Z.json',
    'research_true_pit_strategies_2026-07-11T09-51-52-914Z.json',
    'research_true_pit_strategies_2026-07-11T10-22-49-204Z.json',
    'research_true_pit_strategies_2026-07-11T10-55-16-738Z.json',
    'research_true_pit_strategies_2026-07-11T11-30-29-028Z.json',
    'research_true_pit_strategies_2026-07-11T12-10-56-740Z.json',
    'research_true_pit_strategies_2026-07-11T12-56-56-357Z.json',
    'research_true_pit_strategies_2026-07-11T13-43-58-382Z.json',
    'research_true_pit_strategies_2026-07-11T14-25-48-696Z.json',
    'research_true_pit_strategies_2026-07-11T14-50-37-126Z.json'
];

const FIXED_BET_COUNT = 30;
const PAYOUT_MULTIPLIER = 84;
const STAKE_K = 1000;
const TRAIN_END = '2023-12-31';
const VALIDATION_START = '2024-01-01';
const HOLDOUT_START = '2026-01-01';

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        trainEnd: args.get('trainEnd') || TRAIN_END,
        validationStart: args.get('validationStart') || VALIDATION_START,
        holdoutStart: args.get('holdoutStart') || HOLDOUT_START,
        endDate: args.get('endDate') || '9999-12-31',
        includeHistorySnapshots: String(args.get('includeHistorySnapshots') || '1') !== '0'
    };
}

function readJson(filename) {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function normalizeNumbers(numbers) {
    return [...new Set((numbers || []).map(Number).filter(number =>
        Number.isInteger(number) && number >= 0 && number < 100
    ))].sort((a, b) => a - b);
}

function addPrediction(byDate, date, actual, id, numbers, source) {
    const normalized = normalizeNumbers(numbers);
    if (!date || !Number.isInteger(Number(actual)) || normalized.length !== FIXED_BET_COUNT) return;
    const row = byDate.get(date) || { date, actual: Number(actual), strategies: {} };
    // A conflicting actual means the input is malformed, rather than something
    // that the selector may silently resolve in its own favor.
    if (row.actual !== Number(actual)) {
        throw new Error(`Actual không khớp ở ${date}: ${row.actual} != ${actual}`);
    }
    row.strategies[id] = { numbers: normalized, source };
    byDate.set(date, row);
}

function loadMilestoneRows() {
    const byDate = new Map();
    for (const filename of REPORT_FILES) {
        const reportPath = path.join(__dirname, '..', 'reports', filename);
        if (!fs.existsSync(reportPath)) throw new Error(`Thiếu report strict PIT: ${filename}`);
        const report = readJson(reportPath);
        for (const row of report.rows || []) {
            for (const [id, numbers] of Object.entries(row.strategies || {})) {
                addPrediction(byDate, row.date, row.actual, `m20:${id}`, numbers, 'milestone20y-strict-pit');
            }
        }
    }
    return byDate;
}

function loadHistorySnapshots(byDate) {
    const cachePath = path.join(__dirname, '..', 'lib', 'data', 'statistics', 'cached_prediction_history.json');
    if (!fs.existsSync(cachePath)) return { records: 0, methods: [] };
    const snapshots = readJson(cachePath);
    const methodIds = new Set();
    let records = 0;
    for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
        const summary = snapshot?.summary || {};
        if (!snapshot?.snapshotImmutable || !summary?.resolved || !Number.isInteger(Number(summary.actualSpecial))) continue;
        records++;
        for (const [id, method] of Object.entries(summary.methods || {})) {
            const numbers = method?.numbersToBet;
            if (normalizeNumbers(numbers).length !== FIXED_BET_COUNT) continue;
            addPrediction(
                byDate,
                snapshot.predictionDate,
                Number(summary.actualSpecial) % 100,
                `history:${id}`,
                numbers,
                'history-d1-immutable-snapshot'
            );
            methodIds.add(id);
        }
    }
    return { records, methods: [...methodIds].sort() };
}

function wilsonLower(successes, total, z = 1.645) {
    if (!total) return 0;
    const p = successes / total;
    const z2 = z * z;
    const denominator = 1 + z2 / total;
    const center = (p + z2 / (2 * total)) / denominator;
    const radius = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total) / denominator;
    return Math.max(0, center - radius);
}

function trailingOutcomes(rows, dateIndex, methodId, window) {
    const outcomes = [];
    for (let index = dateIndex - 1; index >= 0 && outcomes.length < window; index--) {
        const row = rows[index];
        const prediction = row.strategies[methodId];
        if (!prediction) continue;
        outcomes.push(prediction.numbers.includes(row.actual));
    }
    return outcomes;
}

function buildPriorStats(rows, windows) {
    const histories = new Map();
    for (const row of rows) {
        row.priorStats = {};
        for (const [id, prediction] of Object.entries(row.strategies)) {
            const history = histories.get(id) || { prefixWins: [0], count: 0 };
            row.priorStats[id] = {};
            for (const window of windows) {
                const start = Math.max(0, history.count - window);
                row.priorStats[id][window] = {
                    total: history.count - start,
                    wins: history.prefixWins[history.count] - history.prefixWins[start]
                };
            }
            const hit = prediction.numbers.includes(row.actual) ? 1 : 0;
            history.prefixWins.push(history.prefixWins[history.count] + hit);
            history.count++;
            histories.set(id, history);
        }
    }
}

function scoreMethod(outcomesOrStats, config) {
    const total = Array.isArray(outcomesOrStats)
        ? outcomesOrStats.length
        : Number(outcomesOrStats?.total || 0);
    if (total < config.minSamples) return null;
    const wins = Array.isArray(outcomesOrStats)
        ? outcomesOrStats.filter(Boolean).length
        : Number(outcomesOrStats?.wins || 0);
    const betaMean = (wins + config.alpha) / (total + config.alpha + config.beta);
    const lower = wilsonLower(wins, total);
    const breakEven = FIXED_BET_COUNT / PAYOUT_MULTIPLIER;
    const expectedProfitK = betaMean * PAYOUT_MULTIPLIER * STAKE_K - FIXED_BET_COUNT * STAKE_K;
    const lowerProfitMargin = lower - breakEven;
    const score = config.rule === 'lowerProfit'
        ? lowerProfitMargin
        : config.rule === 'expectedProfit'
            ? expectedProfitK / STAKE_K
            : betaMean - breakEven;
    return { wins, total, betaMean, lower, expectedProfitK, lowerProfitMargin, score };
}

function createSummary() {
    return {
        days: 0,
        activeDays: 0,
        wins: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        longestWin: 0,
        longestLoss: 0,
        current: null,
        currentLen: 0,
        selections: {},
        rows: []
    };
}

function settle(summary, row, selection) {
    summary.days++;
    if (!selection) {
        summary.rows.push({ date: row.date, actual: row.actual, skipped: true });
        return;
    }
    const hit = selection.numbers.includes(row.actual);
    const stakeK = FIXED_BET_COUNT * STAKE_K;
    const payoutK = hit ? PAYOUT_MULTIPLIER * STAKE_K : 0;
    const profitK = payoutK - stakeK;
    summary.activeDays++;
    summary.wins += Number(hit);
    summary.stakeK += stakeK;
    summary.payoutK += payoutK;
    summary.profitK += profitK;
    summary.selections[selection.id] = (summary.selections[selection.id] || 0) + 1;
    const state = hit ? 'win' : 'loss';
    summary.currentLen = summary.current === state ? summary.currentLen + 1 : 1;
    summary.current = state;
    if (hit) summary.longestWin = Math.max(summary.longestWin, summary.currentLen);
    else summary.longestLoss = Math.max(summary.longestLoss, summary.currentLen);
    summary.rows.push({
        date: row.date,
        actual: row.actual,
        id: selection.id,
        source: selection.source,
        score: selection.score,
        sampleSize: selection.sampleSize,
        betaMean: selection.betaMean,
        lower: selection.lower,
        hit,
        profitK
    });
}

function finalize(summary) {
    const { current, currentLen, ...result } = summary;
    return {
        ...result,
        hitRate: result.activeDays ? result.wins / result.activeDays : 0,
        roi: result.stakeK ? result.profitK / result.stakeK : 0,
        breakEvenHitRate: FIXED_BET_COUNT / PAYOUT_MULTIPLIER
    };
}

function runSelector(rows, config, startDate, endDate) {
    const summary = createSummary();
    rows.forEach((row, index) => {
        if (row.date < startDate || row.date > endDate) return;
        const candidates = Object.entries(row.strategies).map(([id, prediction]) => {
            const score = scoreMethod(row.priorStats?.[id]?.[config.window], config);
            if (!score) return null;
            return {
                id,
                source: prediction.source,
                numbers: prediction.numbers,
                sampleSize: score.total,
                betaMean: score.betaMean,
                lower: score.lower,
                score: score.score,
                lowerProfitMargin: score.lowerProfitMargin
            };
        }).filter(Boolean).filter(candidate =>
            !config.requirePositiveLower || candidate.lowerProfitMargin > 0
        ).sort((a, b) =>
            b.score - a.score ||
            b.lower - a.lower ||
            b.sampleSize - a.sampleSize ||
            a.id.localeCompare(b.id)
        );
        settle(summary, row, candidates[0] || null);
    });
    return finalize(summary);
}

function configs() {
    const rows = [];
    for (const window of [30, 60, 90, 180, 365]) {
        for (const minSamples of [20, 30, 45, 60]) {
            for (const rule of ['lowerProfit', 'expectedProfit']) {
                for (const requirePositiveLower of [false, true]) {
                    rows.push({ window, minSamples, rule, requirePositiveLower, alpha: 6, beta: 14 });
                }
            }
        }
    }
    return rows;
}

function quality(summary) {
    // Fewer skipped days is useful, but never enough to beat a negative result.
    return [
        summary.profitK >= 0 ? 1 : 0,
        summary.profitK,
        summary.hitRate - summary.breakEvenHitRate,
        -summary.longestLoss,
        summary.activeDays
    ];
}

function compareQuality(left, right) {
    const a = quality(left);
    const b = quality(right);
    for (let index = 0; index < a.length; index++) {
        if (a[index] !== b[index]) return b[index] - a[index];
    }
    return 0;
}

function aggregateByYear(rows, config, startDate, endDate) {
    const years = [...new Set(rows.map(row => row.date.slice(0, 4)))].filter(year =>
        `${year}-01-01` >= startDate && `${year}-12-31` <= endDate
    );
    return years.map(year => ({
        year,
        summary: runSelector(rows, config, `${year}-01-01`, `${year}-12-31`)
    }));
}

function main() {
    const options = parseArgs();
    const byDate = loadMilestoneRows();
    const historyInfo = options.includeHistorySnapshots
        ? loadHistorySnapshots(byDate)
        : { records: 0, methods: [] };
    const rows = [...byDate.values()]
        .filter(row => row.date <= options.endDate)
        .sort((a, b) => a.date.localeCompare(b.date));
    const windows = [...new Set(configs().map(config => config.window))];
    buildPriorStats(rows, windows);
    const trainingConfigs = configs().map(config => {
        const yearly = aggregateByYear(rows, config, '2016-01-01', options.trainEnd);
        const overall = runSelector(rows, config, '2016-01-01', options.trainEnd);
        const worstYearProfitK = Math.min(...yearly.map(row => row.summary.profitK));
        const activeCoverage = overall.days ? overall.activeDays / overall.days : 0;
        return { config, yearly, overall, worstYearProfitK, activeCoverage };
    }).sort((a, b) =>
        // A selector that simply skips every day has zero loss, not evidence
        // of quality. Require meaningful coverage before comparing profit.
        (b.activeCoverage >= 0.7) - (a.activeCoverage >= 0.7) ||
        b.worstYearProfitK - a.worstYearProfitK ||
        compareQuality(a.overall, b.overall)
    );
    const selected = trainingConfigs[0];
    const validation = runSelector(rows, selected.config, options.validationStart, '2025-12-31');
    const holdout = runSelector(rows, selected.config, options.holdoutStart, options.endDate);
    const report = {
        generatedAt: new Date().toISOString(),
        methodology: [
            'Walk-forward method selector: mỗi ngày chỉ chọn một dàn 30 số.',
            'Điểm được tính từ các ngày đã kết toán trước ngày dự đoán của chính phương pháp đó.',
            'Mốc 20 năm dùng report strict PIT 2016-2026; Mốc Lịch sử chỉ thêm snapshot immutable khi có.',
            'Cấu hình chọn bằng 2016-2023, khóa trước khi kiểm chứng 2024-2025 và 2026.'
        ].join(' '),
        economics: { betCount: FIXED_BET_COUNT, stakePerNumberK: STAKE_K, payoutMultiplier: PAYOUT_MULTIPLIER },
        data: {
            rows: rows.length,
            range: { start: rows[0]?.date || null, end: rows.at(-1)?.date || null },
            historySnapshots: historyInfo,
            candidateIds: [...new Set(rows.flatMap(row => Object.keys(row.strategies)))].sort()
        },
        selection: {
            trainingRange: `2016-01-01..${options.trainEnd}`,
            validationRange: `${options.validationStart}..2025-12-31`,
            holdoutRange: `${options.holdoutStart}..${options.endDate}`,
            selectedConfig: selected.config,
            selectedTraining: finalize({ ...selected.overall, rows: [] }),
            selectedTrainingByYear: selected.yearly.map(row => ({ year: row.year, ...finalize({ ...row.summary, rows: [] }) })),
            validation: finalize({ ...validation, rows: [] }),
            holdout: finalize({ ...holdout, rows: [] })
        },
        candidates: trainingConfigs.slice(0, 20).map(row => ({
            config: row.config,
            overall: finalize({ ...row.overall, rows: [] }),
            worstYearProfitK: row.worstYearProfitK,
            activeCoverage: row.activeCoverage
        })),
        validationRows: validation.rows,
        holdoutRows: holdout.rows
    };
    const outputPath = path.join(
        __dirname,
        '..',
        'reports',
        `walkforward_method_selector_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        outputPath,
        selectedConfig: report.selection.selectedConfig,
        training: report.selection.selectedTraining,
        validation: report.selection.validation,
        holdout: report.selection.holdout,
        historySnapshots: historyInfo
    }, null, 2));
}

if (require.main === module) main();

module.exports = { loadMilestoneRows, loadHistorySnapshots, runSelector, scoreMethod, trailingOutcomes, buildPriorStats };
