#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        report: args.get('report') || '',
        target: Number(args.get('target') || 70)
    };
}

function topExcluded(scores, target) {
    return ALL_NUMBERS
        .map(number => ({ number, score: Number(scores[number] || 0) }))
        .sort((a, b) => b.score - a.score || a.number - b.number)
        .slice(0, target)
        .map(row => row.number);
}

function calibrateGroups(rows, prior) {
    const groups = new Map();
    for (const row of rows) {
        for (const evidence of row.numberEvidence || []) {
            for (const [group, strength] of Object.entries(evidence.groups || {})) {
                if (!groups.has(group)) groups.set(group, { exposure: 0, actual: 0, strength: 0 });
                const stats = groups.get(group);
                stats.exposure++;
                stats.strength += Number(strength) || 0;
                if (evidence.number === row.actual) stats.actual++;
            }
        }
    }
    const calibrated = new Map();
    for (const [group, stats] of groups) {
        const expected = stats.exposure / 100;
        const safeLift = Math.log((expected + prior) / (stats.actual + prior));
        const reliability = Math.sqrt(stats.exposure / (stats.exposure + 500));
        calibrated.set(group, {
            ...stats,
            expected,
            safeLift,
            reliability,
            score: safeLift * reliability
        });
    }
    return calibrated;
}

function scoreRow(row, calibration, mode) {
    const scores = Array(100).fill(0);
    for (const evidence of row.numberEvidence || []) {
        const values = Object.entries(evidence.groups || {})
            .map(([group, strength]) => {
                const calibrated = calibration.get(group);
                if (!calibrated) return null;
                return {
                    value: calibrated.score * Number(strength || 0),
                    calibration: calibrated.score,
                    strength: Number(strength || 0)
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.value - a.value);
        if (values.length === 0) continue;
        if (mode === 'top1') {
            scores[evidence.number] = values[0].value;
        } else if (mode === 'top3') {
            scores[evidence.number] = values.slice(0, 3)
                .reduce((sum, item) => sum + item.value, 0) / Math.min(3, values.length);
        } else if (mode === 'positiveMean') {
            const positive = values.filter(item => item.value > 0);
            scores[evidence.number] = positive.length
                ? positive.reduce((sum, item) => sum + item.value, 0) / positive.length
                : 0;
        } else if (mode === 'weightedMean') {
            const weight = values.reduce((sum, item) => sum + item.strength, 0);
            scores[evidence.number] = weight
                ? values.reduce((sum, item) => sum + item.calibration * item.strength, 0) / weight
                : 0;
        } else {
            scores[evidence.number] = values.reduce((sum, item) => sum + item.value, 0) /
                Math.sqrt(values.length);
        }
    }
    return scores;
}

function createSummary(id) {
    return {
        id,
        days: 0,
        wins: 0,
        currentType: null,
        currentLength: 0,
        longestWin: 0,
        longestLoss: 0,
        rows: []
    };
}

function addResult(summary, row, excluded) {
    const win = !excluded.includes(row.actual);
    const betNumbers = ALL_NUMBERS.filter(number => !excluded.includes(number));
    summary.days++;
    summary.wins += Number(win);
    const type = win ? 'win' : 'loss';
    if (summary.currentType === type) summary.currentLength++;
    else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    summary.longestWin = Math.max(summary.longestWin, type === 'win' ? summary.currentLength : 0);
    summary.longestLoss = Math.max(summary.longestLoss, type === 'loss' ? summary.currentLength : 0);
    summary.rows.push({ date: row.date, actual: row.actual, win, betNumbers });
}

function wilson(successes, total, z = 1.96) {
    if (!total) return [0, 0];
    const p = successes / total;
    const denominator = 1 + (z * z) / total;
    const center = (p + (z * z) / (2 * total)) / denominator;
    const radius = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total)) / denominator;
    return [center - radius, center + radius];
}

function finalize(summary) {
    const { currentType, currentLength, ...result } = summary;
    const [lower95, upper95] = wilson(result.wins, result.days);
    const profit84K = result.wins * 84000 - result.days * 30000;
    const profit70K = result.wins * 70000 - result.days * 30000;
    return {
        ...result,
        hitRate: result.days ? result.wins / result.days : 0,
        lower95,
        upper95,
        profit84K,
        profit70K,
        roi84: result.days ? profit84K / (result.days * 30000) : 0,
        roi70: result.days ? profit70K / (result.days * 30000) : 0
    };
}

function evaluate(rows, calibration, config, target) {
    const summary = createSummary(`groupCalibration_${config.mode}_prior${config.prior}`);
    for (const row of rows) {
        const excluded = topExcluded(scoreRow(row, calibration, config.mode), target);
        addResult(summary, row, excluded);
    }
    return finalize(summary);
}

function main() {
    const options = parseArgs();
    if (!options.report) throw new Error('Thiếu --report=<đường dẫn báo cáo true PIT có numberEvidence>.');
    const source = JSON.parse(fs.readFileSync(path.resolve(options.report), 'utf8'));
    const rows = (source.rows || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.some(row => Array.isArray(row.numberEvidence))) {
        throw new Error('Báo cáo không có numberEvidence.');
    }
    const training = rows.filter(row => row.date <= '2026-02-28');
    const validation = rows.filter(row => row.date >= '2026-03-01' && row.date <= '2026-03-31');
    const refit = rows.filter(row => row.date <= '2026-03-31');
    const test = rows.filter(row => row.date >= '2026-04-01');
    const configs = [];
    for (const prior of [0.5, 1, 2, 4, 8]) {
        for (const mode of ['top1', 'top3', 'positiveMean', 'weightedMean', 'sumSqrt']) {
            configs.push({ prior, mode });
        }
    }
    const validationRows = configs.map(config => {
        const calibration = calibrateGroups(training, config.prior);
        return {
            config,
            summary: evaluate(validation, calibration, config, options.target)
        };
    }).sort((a, b) => b.summary.wins - a.summary.wins ||
        b.summary.profit84K - a.summary.profit84K);
    const selected = validationRows[0].config;
    const finalCalibration = calibrateGroups(refit, selected.prior);
    const testSummary = evaluate(test, finalCalibration, selected, options.target);

    const baselines = Object.keys(rows[0].strategies || {}).map(id => {
        const summary = createSummary(id);
        for (const row of test) {
            const excluded = ALL_NUMBERS.filter(number => !(row.strategies[id] || []).includes(number));
            addResult(summary, row, excluded);
        }
        return finalize(summary);
    }).sort((a, b) => b.profit84K - a.profit84K);

    const groupRanking = Array.from(finalCalibration.entries())
        .map(([group, row]) => ({ group, ...row }))
        .sort((a, b) => b.score - a.score);
    const report = {
        generatedAt: new Date().toISOString(),
        sourceReport: path.resolve(options.report),
        methodology: {
            training: '01-02/2026',
            validation: '03/2026',
            frozenTest: '04/2026 đến hết báo cáo',
            score: 'log(expected coverage / observed actual coverage), shrink theo exposure'
        },
        selected,
        validation: validationRows.map(row => ({
            config: row.config,
            wins: row.summary.wins,
            days: row.summary.days,
            hitRate: row.summary.hitRate
        })),
        testSummary,
        baselines,
        strongestSafeGroups: groupRanking.slice(0, 20),
        riskiestFalseExclusionGroups: groupRanking.slice(-20).reverse()
    };
    const reportPath = path.join(
        __dirname,
        '..',
        'reports',
        `research_true_pit_group_calibration_${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        reportPath,
        selected,
        testSummary: { ...testSummary, rows: undefined },
        bestBaseline: { ...baselines[0], rows: undefined },
        strongestSafeGroups: report.strongestSafeGroups.slice(0, 8)
    }, null, 2));
}

main();
