#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const BET_COUNTS = [3, 4, 5, 6, 7];
const CONFIGS = [
    { id: 'ewma14', type: 'ewma', alpha: 2 / 15 },
    { id: 'ewma30', type: 'ewma', alpha: 2 / 31 },
    { id: 'ewma60', type: 'ewma', alpha: 2 / 61 },
    { id: 'hedgeSlow', type: 'hedge', eta: 0.04 },
    { id: 'hedgeMedium', type: 'hedge', eta: 0.08 },
    { id: 'hedgeFast', type: 'hedge', eta: 0.14 },
    { id: 'rollingMean30', type: 'rolling', window: 30 },
    { id: 'rollingMean60', type: 'rolling', window: 60 }
];

function parseArgs() {
    const args = new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value === undefined ? '1' : value];
    }));
    return {
        report: args.get('report'),
        trainingEnd: args.get('trainingEnd') || '2026-03-31',
        holdoutStart: args.get('holdoutStart') || '2026-04-01',
        holdoutEnd: args.get('holdoutEnd') || '2026-07-01',
        aggregationMode: args.get('aggregationMode') || 'twoHitGreedy',
        strategy: args.get('strategy') || 'chainSmallFirst',
        hold: Number(args.get('hold') || 65)
    };
}

function createSummary() {
    return {
        days: 0,
        wins: 0,
        hitDays: 0,
        hits: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        currentLoss: 0,
        longestLoss: 0,
        betCountUsage: Object.fromEntries(BET_COUNTS.map(count => [count, 0]))
    };
}

function updateSummary(summary, row, betCount) {
    summary.days += 1;
    summary.wins += row.profitK > 0 ? 1 : 0;
    summary.hitDays += row.hits > 0 ? 1 : 0;
    summary.hits += row.hits;
    summary.stakeK += row.stakeK;
    summary.payoutK += row.payoutK;
    summary.profitK += row.profitK;
    summary.betCountUsage[betCount] += 1;
    if (row.profitK < 0) {
        summary.currentLoss += 1;
        summary.longestLoss = Math.max(summary.longestLoss, summary.currentLoss);
    } else {
        summary.currentLoss = 0;
    }
}

function finalizeSummary(summary) {
    return {
        days: summary.days,
        wins: summary.wins,
        hitDays: summary.hitDays,
        hits: summary.hits,
        hitRate: summary.days ? summary.hitDays / summary.days : 0,
        winRate: summary.days ? summary.wins / summary.days : 0,
        avgHits: summary.days ? summary.hits / summary.days : 0,
        stakeK: summary.stakeK,
        payoutK: summary.payoutK,
        profitK: summary.profitK,
        roi: summary.stakeK ? summary.profitK / summary.stakeK : 0,
        longestLoss: summary.longestLoss,
        betCountUsage: summary.betCountUsage
    };
}

function createState(config) {
    return {
        config,
        scores: new Map(BET_COUNTS.map(count => [count, 0])),
        history: new Map(BET_COUNTS.map(count => [count, []])),
        training: createSummary(),
        holdout: createSummary()
    };
}

function chooseBetCount(state) {
    return BET_COUNTS.slice().sort((a, b) => {
        const diff = state.scores.get(b) - state.scores.get(a);
        if (diff !== 0) return diff;
        if (a === 6) return -1;
        if (b === 6) return 1;
        return a - b;
    })[0];
}

function updateState(state, outcomes) {
    const config = state.config;
    for (const count of BET_COUNTS) {
        const profitK = Number(outcomes.get(count)?.profitK || 0);
        if (config.type === 'ewma') {
            const current = state.scores.get(count);
            state.scores.set(count, current * (1 - config.alpha) + profitK * config.alpha);
        } else if (config.type === 'hedge') {
            const current = state.scores.get(count);
            state.scores.set(count, current + config.eta * (profitK / 10000));
        } else {
            const history = state.history.get(count);
            history.push(profitK);
            if (history.length > config.window) history.shift();
            state.scores.set(
                count,
                history.reduce((sum, value) => sum + value, 0) / Math.max(1, history.length)
            );
        }
    }
}

function buildDailyOutcomes(report, options) {
    const rows = report.dailyDetailsByWindow?.dateRange || [];
    const byDate = new Map();
    for (const row of rows) {
        if (row.strategy !== options.strategy) continue;
        if (Number(row.hold) !== options.hold) continue;
        if (row.aggregationMode !== options.aggregationMode) continue;
        if (!BET_COUNTS.includes(Number(row.betCount))) continue;
        if (!byDate.has(row.date)) byDate.set(row.date, new Map());
        byDate.get(row.date).set(Number(row.betCount), row);
    }
    return [...byDate.entries()]
        .filter(([, outcomes]) => BET_COUNTS.every(count => outcomes.has(count)))
        .sort((a, b) => a[0].localeCompare(b[0]));
}

function selectTrainingWinner(states) {
    return [...states.values()].map(state => {
        const summary = finalizeSummary(state.training);
        const robustScore =
            summary.profitK -
            Math.max(0, summary.longestLoss - 5) * 15000 +
            summary.hitRate * 10000;
        return { id: state.config.id, robustScore, summary };
    }).sort((a, b) => {
        if (b.robustScore !== a.robustScore) return b.robustScore - a.robustScore;
        if (b.summary.profitK !== a.summary.profitK) return b.summary.profitK - a.summary.profitK;
        return b.summary.hitRate - a.summary.hitRate;
    })[0];
}

function main() {
    const options = parseArgs();
    if (!options.report) throw new Error('Thiếu --report=<backtest_loto...json>.');
    const reportPath = path.resolve(options.report);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const daily = buildDailyOutcomes(report, options);
    if (!daily.length) {
        throw new Error(
            `Báo cáo không có đủ Top ${BET_COUNTS.join('/')} cho ${options.strategy} ` +
            `Hold ${options.hold} - ${options.aggregationMode}.`
        );
    }
    const states = new Map(CONFIGS.map(config => [config.id, createState(config)]));
    const baselines = new Map(BET_COUNTS.map(count => [count, {
        training: createSummary(),
        holdout: createSummary()
    }]));
    let selectedId = null;

    for (const [date, outcomes] of daily) {
        const phase = date <= options.trainingEnd
            ? 'training'
            : (date >= options.holdoutStart && date <= options.holdoutEnd ? 'holdout' : 'gap');
        if (phase === 'holdout' && !selectedId) {
            selectedId = selectTrainingWinner(states)?.id || null;
            console.log(`[AdaptiveLoto] Khóa cấu hình trước holdout: ${selectedId}`);
        }
        for (const state of states.values()) {
            const count = chooseBetCount(state);
            if (phase === 'training') updateSummary(state.training, outcomes.get(count), count);
            else if (phase === 'holdout' && state.config.id === selectedId) {
                updateSummary(state.holdout, outcomes.get(count), count);
            }
            updateState(state, outcomes);
        }
        for (const count of BET_COUNTS) {
            if (phase === 'training') updateSummary(baselines.get(count).training, outcomes.get(count), count);
            else if (phase === 'holdout') updateSummary(baselines.get(count).holdout, outcomes.get(count), count);
        }
    }

    const training = [...states.values()].map(state => ({
        id: state.config.id,
        type: state.config.type,
        ...finalizeSummary(state.training)
    })).sort((a, b) => b.profitK - a.profitK);
    const selected = states.get(selectedId);
    const output = {
        generatedAt: new Date().toISOString(),
        sourceReport: reportPath,
        options,
        selectedId,
        training,
        holdout: {
            selected: selected ? finalizeSummary(selected.holdout) : null,
            baselines: Object.fromEntries(
                [...baselines.entries()].map(([count, value]) => [count, finalizeSummary(value.holdout)])
            )
        }
    };
    console.log('\n=== Training ===');
    console.table(training.map(row => ({
        id: row.id,
        type: row.type,
        hitRate: `${(row.hitRate * 100).toFixed(2)}%`,
        winRate: `${(row.winRate * 100).toFixed(2)}%`,
        profitK: row.profitK,
        roi: `${(row.roi * 100).toFixed(2)}%`,
        longestLoss: row.longestLoss,
        usage: JSON.stringify(row.betCountUsage)
    })));
    console.log('\n=== Holdout ===');
    console.table([
        { id: selectedId, ...output.holdout.selected },
        ...Object.entries(output.holdout.baselines).map(([count, summary]) => ({
            id: `fixedTop${count}`,
            ...summary
        }))
    ].map(row => ({
        id: row.id,
        days: row.days,
        hitRate: `${(row.hitRate * 100).toFixed(2)}%`,
        winRate: `${(row.winRate * 100).toFixed(2)}%`,
        avgHits: row.avgHits.toFixed(2),
        profitK: row.profitK,
        roi: `${(row.roi * 100).toFixed(2)}%`,
        longestLoss: row.longestLoss,
        usage: JSON.stringify(row.betCountUsage)
    })));
    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputPath = path.join(outputDir, `research_loto_adaptive_bet_count_${stamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[AdaptiveLoto] JSON: ${outputPath}`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

module.exports = {
    chooseBetCount,
    createState,
    selectTrainingWinner,
    updateState
};
