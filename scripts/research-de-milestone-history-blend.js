#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ALL_NUMBERS = Array.from({ length: 100 }, (_, index) => index);
const DEFAULT_STAKE_K = 1000;
const DEFAULT_PAYOUT_K = 84000;

function parseArgs(argv) {
    return new Map(argv.slice(2).map(token => {
        const [key, ...rest] = token.replace(/^--/, '').split('=');
        return [key, rest.join('=') || '1'];
    }));
}

function normalizeNumbers(values) {
    return Array.from(new Set((values || [])
        .map(Number)
        .filter(value => Number.isInteger(value) && value >= 0 && value <= 99)))
        .sort((a, b) => a - b);
}

function intersection(left, right) {
    const rightSet = new Set(right);
    return left.filter(number => rightSet.has(number));
}

function union(left, right) {
    return normalizeNumbers([...left, ...right]);
}

function complement(numbers) {
    const selected = new Set(numbers);
    return ALL_NUMBERS.filter(number => !selected.has(number));
}

function longestStreak(rows, expectedWin) {
    let best = 0;
    let current = 0;
    for (const row of rows) {
        current = row.win === expectedWin ? current + 1 : 0;
        best = Math.max(best, current);
    }
    return best;
}

function summarize(rows, stakeK = DEFAULT_STAKE_K, payoutK = DEFAULT_PAYOUT_K) {
    let wins = 0;
    let totalBetNumbers = 0;
    let totalStakeK = 0;
    let totalPayoutK = 0;
    const details = rows.map(row => {
        const betNumbers = normalizeNumbers(row.betNumbers);
        const win = betNumbers.includes(Number(row.actual));
        const dayStakeK = betNumbers.length * stakeK;
        const dayPayoutK = win ? payoutK : 0;
        wins += Number(win);
        totalBetNumbers += betNumbers.length;
        totalStakeK += dayStakeK;
        totalPayoutK += dayPayoutK;
        return {
            ...row,
            betNumbers,
            win,
            stakeK: dayStakeK,
            payoutK: dayPayoutK,
            profitK: dayPayoutK - dayStakeK
        };
    });
    const profitK = totalPayoutK - totalStakeK;
    return {
        days: details.length,
        wins,
        losses: details.length - wins,
        hitRate: details.length ? wins / details.length : 0,
        avgBetCount: details.length ? totalBetNumbers / details.length : 0,
        stakeK: totalStakeK,
        payoutK: totalPayoutK,
        profitK,
        roi: totalStakeK ? profitK / totalStakeK : 0,
        longestWin: longestStreak(details, true),
        longestLoss: longestStreak(details, false),
        rows: details
    };
}

function loadPitRows(filenames) {
    const byDate = new Map();
    for (const filename of String(filenames).split(',').map(value => value.trim()).filter(Boolean)) {
        const report = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
        for (const row of report.rows || []) byDate.set(row.date, row);
    }
    return byDate;
}

function loadImmutableHistory(filename) {
    const history = JSON.parse(fs.readFileSync(path.resolve(filename), 'utf8'));
    return (Array.isArray(history) ? history : [])
        .filter(row => row?.snapshotImmutable !== false)
        .filter(row => row?.summary?.resolved && Number.isInteger(Number(row.summary.actualSpecial)))
        .sort((a, b) => a.predictionDate.localeCompare(b.predictionDate));
}

function resultWithoutRows(result) {
    const { rows, ...summary } = result;
    return summary;
}

function splitSummary(rows, splitDate, stakeK, payoutK) {
    const trainingRows = rows.filter(row => row.date < splitDate);
    const holdoutRows = rows.filter(row => row.date >= splitDate);
    return {
        training: summarize(trainingRows, stakeK, payoutK),
        holdout: summarize(holdoutRows, stakeK, payoutK)
    };
}

function buildPairRows(pitByDate, history, pitStrategy, historyMethod, mode) {
    const rows = [];
    for (const snapshot of history) {
        const pit = pitByDate.get(snapshot.predictionDate);
        const pitNumbers = normalizeNumbers(pit?.strategies?.[pitStrategy]);
        const historyNumbers = normalizeNumbers(snapshot?.summary?.methods?.[historyMethod]?.numbersToBet);
        if (!pitNumbers.length || !historyNumbers.length) continue;
        let betNumbers;
        if (mode === 'intersection') betNumbers = intersection(pitNumbers, historyNumbers);
        else if (mode === 'union') betNumbers = union(pitNumbers, historyNumbers);
        else if (mode === 'excludeUnion') {
            betNumbers = complement(union(complement(pitNumbers), complement(historyNumbers)));
        } else {
            throw new Error(`Blend mode không hợp lệ: ${mode}`);
        }
        rows.push({
            date: snapshot.predictionDate,
            actual: Number(snapshot.summary.actualSpecial),
            betNumbers,
            pitBetNumbers: pitNumbers,
            historyBetNumbers: historyNumbers,
            pitBetCount: pitNumbers.length,
            historyBetCount: historyNumbers.length
        });
    }
    return rows;
}

function main() {
    const args = parseArgs(process.argv);
    const pitReport = args.get('pitReport');
    if (!pitReport) throw new Error('Cần --pitReport=<research_true_pit_strategies_*.json>.');
    const historyFile = args.get('historyFile')
        || path.join('lib', 'data', 'statistics', 'cached_prediction_history.json');
    const stakeK = Number(args.get('stakeK') || DEFAULT_STAKE_K);
    const payoutK = Number(args.get('payoutK') || DEFAULT_PAYOUT_K);
    const splitDate = args.get('splitDate') || '2026-06-01';
    const pitByDate = loadPitRows(pitReport);
    const history = loadImmutableHistory(historyFile);
    const pitStrategies = Array.from(new Set(
        Array.from(pitByDate.values()).flatMap(row => Object.keys(row.strategies || {}))
    )).sort();
    const historyMethods = Array.from(new Set(
        history.flatMap(row => Object.keys(row?.summary?.methods || {}))
    )).sort();
    const results = [];

    for (const pitStrategy of pitStrategies) {
        for (const historyMethod of historyMethods) {
            for (const mode of ['intersection', 'union']) {
                const rows = buildPairRows(pitByDate, history, pitStrategy, historyMethod, mode);
                if (!rows.length) continue;
                const summary = summarize(rows, stakeK, payoutK);
                const pitBaseline = summarize(rows.map(row => ({
                    date: row.date,
                    actual: row.actual,
                    betNumbers: row.pitBetNumbers
                })), stakeK, payoutK);
                const historyBaseline = summarize(rows.map(row => ({
                    date: row.date,
                    actual: row.actual,
                    betNumbers: row.historyBetNumbers
                })), stakeK, payoutK);
                results.push({
                    id: `${pitStrategy}+${historyMethod}:${mode}`,
                    pitStrategy,
                    historyMethod,
                    mode,
                    ...resultWithoutRows(summary),
                    comparison: {
                        pitBaseline: resultWithoutRows(pitBaseline),
                        historyBaseline: resultWithoutRows(historyBaseline),
                        profitVsPitK: summary.profitK - pitBaseline.profitK,
                        profitVsHistoryK: summary.profitK - historyBaseline.profitK,
                        winsVsPit: summary.wins - pitBaseline.wins,
                        winsVsHistory: summary.wins - historyBaseline.wins
                    },
                    rows: summary.rows
                });
            }
        }
    }

    const baselines = [];
    for (const pitStrategy of pitStrategies) {
        const rows = history.flatMap(snapshot => {
            const pit = pitByDate.get(snapshot.predictionDate);
            const betNumbers = normalizeNumbers(pit?.strategies?.[pitStrategy]);
            return betNumbers.length ? [{
                date: snapshot.predictionDate,
                actual: Number(snapshot.summary.actualSpecial),
                betNumbers
            }] : [];
        });
        if (rows.length) {
            baselines.push({
                id: `pit:${pitStrategy}`,
                source: 'milestone-strict-pit',
                ...summarize(rows, stakeK, payoutK)
            });
        }
    }
    for (const historyMethod of historyMethods) {
        const rows = history.flatMap(snapshot => {
            const betNumbers = normalizeNumbers(snapshot?.summary?.methods?.[historyMethod]?.numbersToBet);
            return betNumbers.length ? [{
                date: snapshot.predictionDate,
                actual: Number(snapshot.summary.actualSpecial),
                betNumbers
            }] : [];
        });
        if (rows.length) {
            baselines.push({
                id: `history:${historyMethod}`,
                source: 'immutable-live-snapshot',
                ...summarize(rows, stakeK, payoutK)
            });
        }
    }

    results.sort((a, b) =>
        b.profitK - a.profitK ||
        b.hitRate - a.hitRate ||
        a.avgBetCount - b.avgBetCount ||
        a.id.localeCompare(b.id)
    );
    baselines.sort((a, b) => b.profitK - a.profitK || b.hitRate - a.hitRate);
    const walkForward = results.map(result => {
        const split = splitSummary(result.rows, splitDate, stakeK, payoutK);
        return {
            id: result.id,
            pitStrategy: result.pitStrategy,
            historyMethod: result.historyMethod,
            mode: result.mode,
            training: resultWithoutRows(split.training),
            holdout: resultWithoutRows(split.holdout)
        };
    }).filter(result => result.training.days >= 40 && result.holdout.days >= 20)
        .sort((a, b) =>
            b.training.profitK - a.training.profitK ||
            b.training.roi - a.training.roi ||
            b.training.hitRate - a.training.hitRate ||
            a.id.localeCompare(b.id)
        );
    const output = {
        generatedAt: new Date().toISOString(),
        methodology: {
            milestoneSource: String(pitReport).split(',').map(value => path.resolve(value.trim())),
            historySource: path.resolve(historyFile),
            pointInTime: 'Mốc 20 năm lấy từ báo cáo strict PIT; Lịch sử lấy snapshot bất biến đã phát hành.',
            comparison: 'Chỉ chấm các ngày có đủ cả hai dàn và đã có kết quả thực tế.',
            walkForward: `Xếp cấu hình bằng ngày trước ${splitDate}; giữ nguyên và chấm từ ${splitDate}.`,
            economics: `${stakeK}K/số, trúng nhận ${payoutK}K.`,
            warning: 'Intersection/union có số lượng số đánh thay đổi; phải so cả hit rate, avgBetCount, profit và ROI.'
        },
        coverage: {
            pitDays: pitByDate.size,
            immutableSettledHistoryDays: history.length,
            firstHistoryDate: history[0]?.predictionDate || null,
            lastHistoryDate: history.at(-1)?.predictionDate || null
        },
        pitStrategies,
        historyMethods,
        splitDate,
        baselines: baselines.map(result => ({
            ...resultWithoutRows(result),
            firstDate: result.rows[0]?.date || null,
            lastDate: result.rows.at(-1)?.date || null
        })),
        ranking: results.map(result => ({
            ...resultWithoutRows(result),
            firstDate: result.rows[0]?.date || null,
            lastDate: result.rows.at(-1)?.date || null
        })),
        walkForwardRanking: walkForward,
        topResults: results.slice(0, 20)
    };
    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputPath = path.join(outputDir, `research_de_milestone_history_blend_${stamp}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`Report: ${outputPath}`);
    console.table(output.baselines.slice(0, 15).map(row => ({
        method: row.id,
        days: row.days,
        bets: row.avgBetCount.toFixed(1),
        hit: `${(row.hitRate * 100).toFixed(2)}%`,
        profitK: row.profitK,
        roi: `${(row.roi * 100).toFixed(2)}%`,
        loss: row.longestLoss
    })));
    console.table(output.ranking.slice(0, 20).map(row => ({
        method: row.id,
        days: row.days,
        bets: row.avgBetCount.toFixed(1),
        hit: `${(row.hitRate * 100).toFixed(2)}%`,
        profitK: row.profitK,
        roi: `${(row.roi * 100).toFixed(2)}%`,
        loss: row.longestLoss
    })));
    console.log(`\n=== Walk-forward: chọn trước ${splitDate}, chấm từ ${splitDate} ===`);
    console.table(output.walkForwardRanking.slice(0, 20).map(row => ({
        method: row.id,
        trainDays: row.training.days,
        trainHit: `${(row.training.hitRate * 100).toFixed(2)}%`,
        trainProfitK: row.training.profitK,
        testDays: row.holdout.days,
        testBets: row.holdout.avgBetCount.toFixed(1),
        testHit: `${(row.holdout.hitRate * 100).toFixed(2)}%`,
        testProfitK: row.holdout.profitK,
        testRoi: `${(row.holdout.roi * 100).toFixed(2)}%`,
        testLoss: row.holdout.longestLoss
    })));
}

if (require.main === module) main();

module.exports = {
    normalizeNumbers,
    intersection,
    union,
    complement,
    summarize,
    splitSummary,
    buildPairRows
};
