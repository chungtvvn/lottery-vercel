#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const lotteryService = require('../lib/services/lotteryService');
const simulationService = require('../lib/services/simulationService');

const DEFAULT_TARGETS = [60, 70, 80, 90];
const PRIZE_KEYS = [
    'special',
    'prize1',
    'prize2_1', 'prize2_2',
    'prize3_1', 'prize3_2', 'prize3_3', 'prize3_4', 'prize3_5', 'prize3_6',
    'prize4_1', 'prize4_2', 'prize4_3', 'prize4_4',
    'prize5_1', 'prize5_2', 'prize5_3', 'prize5_4', 'prize5_5', 'prize5_6',
    'prize6_1', 'prize6_2', 'prize6_3',
    'prize7_1', 'prize7_2', 'prize7_3', 'prize7_4'
];
const ALL_NUMBERS = Array.from({ length: 100 }, (_, i) => i);

const DE_UNIT_K = 1000;
const DE_BET_COST_MULTIPLIER = 0.8;
const DE_WIN_MULTIPLIER = 70;
const DE_HOLD_WIN_MULTIPLIER = 0.705;
const DE_HOLD_LOSS_MULTIPLIER = 70;

const LOTO_BET_COST_K = 2300;
const LOTO_BET_PAYOUT_K = 8000;
const LOTO_HOLD_INCOME_K = 2100;
const LOTO_HOLD_LOSS_K = 8000;

function parseArgs() {
    return new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value || '1'];
    }));
}

function parseTargets(value) {
    const targets = String(value || DEFAULT_TARGETS.join(','))
        .split(',')
        .map(item => Number(item.trim()))
        .filter(value => Number.isFinite(value) && value >= 0 && value <= 100)
        .map(value => Math.round(value));
    return [...new Set(targets)].sort((a, b) => a - b);
}

function buildMethodIds(targets) {
    return targets.map(target => `riskHold${target}`);
}

function parseDate(value) {
    if (!value) return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
        const [d, m, y] = value.split('/').map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(value);
}

function formatIsoDate(rawDate) {
    const date = parseDate(rawDate);
    if (!date || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekStart(value) {
    const d = parseDate(value);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatIso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function csvEscape(value) {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
}

function round(value, digits = 4) {
    const number = Number(value) || 0;
    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
}

function normalizeNumber(value) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) return null;
    const normalized = ((parsed % 100) + 100) % 100;
    return normalized;
}

function normalizeNumberList(values) {
    return [...new Set((values || []).map(normalizeNumber).filter(value => value !== null))]
        .sort((a, b) => a - b);
}

function getSortedLotteryData(rawData) {
    return (rawData || [])
        .filter(item => item && item.date)
        .slice()
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));
}

function buildRawDataByIso(sortedData) {
    return new Map(sortedData.map(row => [formatIsoDate(row.date), row]));
}

function getLotoOccurrences(day) {
    const counts = new Map();
    for (const key of PRIZE_KEYS) {
        const number = normalizeNumber(day && day[key]);
        if (number === null) continue;
        counts.set(number, (counts.get(number) || 0) + 1);
    }
    return counts;
}

function sumOccurrences(numbers, occurrenceMap) {
    return normalizeNumberList(numbers).reduce((sum, number) => sum + (occurrenceMap.get(number) || 0), 0);
}

function evaluateLoto(method, actualDay) {
    if (!method || method.skipped) {
        return {
            skipped: true,
            stake: 0,
            payout: 0,
            profit: 0,
            betProfit: 0,
            holdProfit: 0,
            betHitOccurrences: 0,
            holdHitOccurrences: 0,
            hit: false,
            miss: false
        };
    }

    const excluded = normalizeNumberList(method.excluded);
    const excludedSet = new Set(excluded);
    const betNumbers = normalizeNumberList(method.rawBetNumbers && method.rawBetNumbers.length
        ? method.rawBetNumbers
        : ALL_NUMBERS.filter(number => !excludedSet.has(number)));
    const occurrences = getLotoOccurrences(actualDay);
    const betHitOccurrences = sumOccurrences(betNumbers, occurrences);
    const holdHitOccurrences = sumOccurrences(excluded, occurrences);
    const betStake = betNumbers.length * LOTO_BET_COST_K;
    const betPayout = betHitOccurrences * LOTO_BET_PAYOUT_K;
    const betProfit = betPayout - betStake;
    const holdIncome = excluded.length * LOTO_HOLD_INCOME_K;
    const holdLoss = holdHitOccurrences * LOTO_HOLD_LOSS_K;
    const holdProfit = holdIncome - holdLoss;
    const profit = betProfit + holdProfit;

    return {
        skipped: false,
        excludedCount: excluded.length,
        betCount: betNumbers.length,
        stake: betStake,
        payout: betPayout + holdIncome,
        profit,
        betStake,
        betPayout,
        betProfit,
        holdIncome,
        holdLoss,
        holdProfit,
        betHitOccurrences,
        holdHitOccurrences,
        hit: profit > 0,
        miss: profit < 0
    };
}

function compactDeMethod(method) {
    if (!method) return null;
    return {
        skipped: !!method.skipped,
        excludedCount: Number(method.excludedCount || 0),
        betCount: Number(method.rawBetCount ?? method.betCount ?? 0),
        stake: Number(method.stake || 0),
        payout: Number(method.payout || 0),
        profit: Number(method.profit || 0),
        betProfit: Number(method.betProfit || 0),
        holdProfit: Number(method.holdProfit || 0),
        actualExcluded: !!method.actualExcluded,
        hit: !!method.hit,
        miss: !!method.miss
    };
}

function emptyAggregate(scope, game, methodId) {
    return {
        scope,
        game,
        methodId,
        days: 0,
        playedDays: 0,
        skippedDays: 0,
        wins: 0,
        losses: 0,
        breakevenDays: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        betProfitK: 0,
        holdProfitK: 0,
        excludedTotal: 0,
        betTotal: 0,
        bestProfitK: null,
        worstProfitK: null,
        betHitOccurrences: 0,
        holdHitOccurrences: 0
    };
}

function updateAggregate(row, method) {
    row.days += 1;
    if (!method || method.skipped) {
        row.skippedDays += 1;
        return;
    }
    row.playedDays += 1;
    if (method.profit > 0) row.wins += 1;
    else if (method.profit < 0) row.losses += 1;
    else row.breakevenDays += 1;
    row.stakeK += Number(method.stake || 0);
    row.payoutK += Number(method.payout || 0);
    row.profitK += Number(method.profit || 0);
    row.betProfitK += Number(method.betProfit || 0);
    row.holdProfitK += Number(method.holdProfit || 0);
    row.excludedTotal += Number(method.excludedCount || 0);
    row.betTotal += Number(method.betCount || 0);
    row.betHitOccurrences += Number(method.betHitOccurrences || 0);
    row.holdHitOccurrences += Number(method.holdHitOccurrences || 0);
    row.bestProfitK = row.bestProfitK === null ? method.profit : Math.max(row.bestProfitK, method.profit);
    row.worstProfitK = row.worstProfitK === null ? method.profit : Math.min(row.worstProfitK, method.profit);
}

function finalizeAggregate(row) {
    return {
        ...row,
        hitRate: row.playedDays > 0 ? row.wins / row.playedDays : 0,
        lossRate: row.playedDays > 0 ? row.losses / row.playedDays : 0,
        roi: row.stakeK > 0 ? row.profitK / row.stakeK : 0,
        avgExcluded: row.playedDays > 0 ? round(row.excludedTotal / row.playedDays, 1) : 0,
        avgBet: row.playedDays > 0 ? round(row.betTotal / row.playedDays, 1) : 0,
        bestProfitK: row.bestProfitK === null ? 0 : row.bestProfitK,
        worstProfitK: row.worstProfitK === null ? 0 : row.worstProfitK
    };
}

function computeLongestStreaks(dailyRows, game, methodId) {
    let currentType = null;
    let currentLength = 0;
    let currentStart = '';
    let longestWin = 0;
    let longestLoss = 0;
    let longestWinRange = null;
    let longestLossRange = null;

    for (const day of dailyRows) {
        const method = day.methods?.[methodId]?.[game];
        if (!method || method.skipped || method.profit === 0) {
            currentType = null;
            currentLength = 0;
            currentStart = '';
            continue;
        }
        const type = method.profit > 0 ? 'win' : 'loss';
        if (type === currentType) {
            currentLength += 1;
        } else {
            currentType = type;
            currentLength = 1;
            currentStart = day.predictionIsoDate;
        }
        const range = { start: currentStart, end: day.predictionIsoDate };
        if (type === 'win' && currentLength > longestWin) {
            longestWin = currentLength;
            longestWinRange = range;
        }
        if (type === 'loss' && currentLength > longestLoss) {
            longestLoss = currentLength;
            longestLossRange = range;
        }
    }

    return { longestWin, longestLoss, longestWinRange, longestLossRange };
}

function buildSummary(dailyRows, methods) {
    const summary = [];
    for (const game of ['de', 'loto']) {
        for (const methodId of methods) {
            const aggregate = emptyAggregate('overall', game, methodId);
            dailyRows.forEach(day => updateAggregate(aggregate, day.methods?.[methodId]?.[game]));
            summary.push({
                ...finalizeAggregate(aggregate),
                ...computeLongestStreaks(dailyRows, game, methodId)
            });
        }
    }
    return summary.sort((a, b) => b.profitK - a.profitK);
}

function buildPeriodRows(dailyRows, period, methods) {
    const rows = new Map();
    for (const day of dailyRows) {
        const date = parseDate(day.predictionIsoDate);
        let scope = '';
        let scopeEnd = '';
        if (period === 'week') {
            const start = getWeekStart(date);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            scope = formatIso(start);
            scopeEnd = formatIso(end);
        } else {
            scope = String(date.getFullYear());
            scopeEnd = scope;
        }

        for (const game of ['de', 'loto']) {
            for (const methodId of methods) {
                const key = `${period}|${scope}|${game}|${methodId}`;
                if (!rows.has(key)) {
                    rows.set(key, {
                        ...emptyAggregate(scope, game, methodId),
                        scopeEnd
                    });
                }
                updateAggregate(rows.get(key), day.methods?.[methodId]?.[game]);
            }
        }
    }
    return [...rows.values()]
        .map(finalizeAggregate)
        .sort((a, b) =>
            String(a.scope).localeCompare(String(b.scope)) ||
            a.game.localeCompare(b.game) ||
            a.methodId.localeCompare(b.methodId)
        );
}

function writeCsv(filePath, rows) {
    const headers = [
        'scope', 'scopeEnd', 'game', 'methodId', 'days', 'playedDays', 'skippedDays',
        'wins', 'losses', 'breakevenDays', 'hitRate', 'lossRate',
        'stakeK', 'payoutK', 'profitK', 'betProfitK', 'holdProfitK', 'roi',
        'avgExcluded', 'avgBet', 'bestProfitK', 'worstProfitK',
        'betHitOccurrences', 'holdHitOccurrences',
        'longestWin', 'longestLoss', 'longestWinRange', 'longestLossRange'
    ];
    const csv = [
        headers.join(','),
        ...rows.map(row => headers.map(header => {
            let value = row[header];
            if (header === 'longestWinRange' && row.longestWinRange) value = `${row.longestWinRange.start}..${row.longestWinRange.end}`;
            if (header === 'longestLossRange' && row.longestLossRange) value = `${row.longestLossRange.start}..${row.longestLossRange.end}`;
            if (typeof value === 'number') value = round(value);
            return csvEscape(value);
        }).join(','))
    ].join('\n');
    fs.writeFileSync(filePath, csv);
}

async function runChunk(args) {
    const methods = buildMethodIds(parseTargets(args.get('targets')));
    const rollingHistory = args.get('rollingHistory') === '1' || args.get('rolling') === '1';
    await lotteryService.loadRawData();
    const sortedData = getSortedLotteryData(lotteryService.getRawData());
    const rawByIso = buildRawDataByIso(sortedData);
    const startIndex = Number(args.get('startIndex'));
    const endIndexExclusive = Number(args.get('endIndex'));
    const outputDir = path.join(process.cwd(), 'reports', 'chunks');
    fs.mkdirSync(outputDir, { recursive: true });

    const result = await simulationService.runBacktest(7, null, {
        playMode: 'both',
        betCostMultiplier: DE_BET_COST_MULTIPLIER,
        methods: methods.join(','),
        compactDetails: true,
        rollingHistory,
        startIndex,
        endIndexExclusive,
        clearHistoryCacheInterval: 80
    });
    if (result.error) throw new Error(result.error);

    const dailyRows = result.details.slice().reverse().map(day => {
        const actualDay = rawByIso.get(day.predictionIsoDate);
        const methods = {};
        for (const methodId of buildMethodIds(parseTargets(args.get('targets')))) {
            const method = day.methods?.[methodId];
            methods[methodId] = {
                de: compactDeMethod(method),
                loto: evaluateLoto(method, actualDay)
            };
        }
        return {
            predictionDate: day.predictionDate,
            predictionIsoDate: day.predictionIsoDate,
            basisDate: day.basisDate,
            actualDe: day.actualNumber,
            lotoDrawCount: actualDay ? PRIZE_KEYS.length : 0,
            methods
        };
    });

    const jsonPath = path.join(outputDir, `risk_de_loto_chunk_${startIndex}_${endIndexExclusive}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify({ dailyRows }, null, 0));
    console.log(`[RiskDeLotoChunk] JSON: ${jsonPath}`);
}

async function runParent(args) {
    const targets = parseTargets(args.get('targets'));
    const methods = buildMethodIds(targets);
    const rollingHistory = args.get('rollingHistory') === '1' || args.get('rolling') === '1';
    const initialHistoryDays = Math.max(1, Math.round(Number(args.get('initialHistoryDays') || 365)));
    await lotteryService.loadRawData();
    const sortedData = getSortedLotteryData(lotteryService.getRawData());
    const years = Number(args.get('years') || 20);
    const requestedDays = Math.round(years * 365.25);
    const rollingStartIndex = Math.min(sortedData.length - 1, initialHistoryDays);
    const effectiveDays = rollingHistory
        ? Math.max(1, sortedData.length - rollingStartIndex)
        : Math.min(requestedDays, sortedData.length - 1);
    const startIndex = rollingHistory ? rollingStartIndex : sortedData.length - effectiveDays;
    const endIndex = sortedData.length;
    const chunkSize = Math.max(30, Number(args.get('chunkSize') || 500));
    const chunks = [];
    for (let start = startIndex; start < endIndex; start += chunkSize) {
        chunks.push({ start, end: Math.min(endIndex, start + chunkSize) });
    }

    console.log(`[RiskDeLoto] Running ${effectiveDays} days (${formatIsoDate(sortedData[startIndex].date)}..${formatIsoDate(sortedData[endIndex - 1].date)}) in ${chunks.length} chunks, rollingHistory=${rollingHistory ? '1' : '0'}`);
    const dailyRows = [];
    const childReports = [];
    chunks.forEach((chunk, index) => {
        console.log(`[RiskDeLoto] Chunk ${index + 1}/${chunks.length}: index ${chunk.start}..${chunk.end - 1}`);
        const child = spawnSync(process.execPath, [
            __filename,
            '--chunk=1',
            `--startIndex=${chunk.start}`,
            `--endIndex=${chunk.end}`,
            `--targets=${targets.join(',')}`,
            `--rollingHistory=${rollingHistory ? '1' : '0'}`
        ], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=12288',
                BACKTEST_PROGRESS: '0',
                BACKTEST_CLEAR_HISTORY_CACHE_INTERVAL: '80'
            },
            encoding: 'utf8',
            maxBuffer: 1024 * 1024 * 64
        });
        if (child.status !== 0) {
            process.stdout.write(child.stdout || '');
            process.stderr.write(child.stderr || '');
            throw new Error(`Chunk ${index + 1} failed with exit code ${child.status}`);
        }
        const output = `${child.stdout || ''}\n${child.stderr || ''}`;
        const match = output.match(/\[RiskDeLotoChunk\] JSON:\s+(.+\.json)/);
        if (!match) {
            process.stdout.write(output);
            throw new Error(`Chunk ${index + 1} did not print JSON path`);
        }
        const jsonPath = match[1].trim();
        childReports.push(jsonPath);
        const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        dailyRows.push(...(json.dailyRows || []));
    });

    dailyRows.sort((a, b) => a.predictionIsoDate.localeCompare(b.predictionIsoDate));
    const summary = buildSummary(dailyRows, methods);
    const weeklyRows = buildPeriodRows(dailyRows, 'week', methods);
    const yearlyRows = buildPeriodRows(dailyRows, 'year', methods);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const jsonPath = path.join(outputDir, `backtest_risk_de_loto_20y_${stamp}.json`);
    const summaryCsvPath = path.join(outputDir, `backtest_risk_de_loto_20y_summary_${stamp}.csv`);
    const weeklyCsvPath = path.join(outputDir, `backtest_risk_de_loto_20y_weekly_${stamp}.csv`);
    const yearlyCsvPath = path.join(outputDir, `backtest_risk_de_loto_20y_yearly_${stamp}.csv`);

    const payload = {
        generatedAt: new Date().toISOString(),
        config: {
            years,
            requestedDays,
            effectiveDays,
            rollingHistory,
            initialHistoryDays: rollingHistory ? initialHistoryDays : null,
            startDate: formatIsoDate(sortedData[startIndex].date),
            endDate: formatIsoDate(sortedData[endIndex - 1].date),
            targets,
            methods,
            playMode: 'both',
            deFormula: {
                unitK: DE_UNIT_K,
                betCostMultiplier: DE_BET_COST_MULTIPLIER,
                winMultiplier: DE_WIN_MULTIPLIER,
                holdWinMultiplier: DE_HOLD_WIN_MULTIPLIER,
                holdLossMultiplier: DE_HOLD_LOSS_MULTIPLIER
            },
            lotoFormula: {
                drawNumbers: PRIZE_KEYS.length,
                betCostK: LOTO_BET_COST_K,
                betPayoutKPerOccurrence: LOTO_BET_PAYOUT_K,
                holdIncomeKPerNumber: LOTO_HOLD_INCOME_K,
                holdLossKPerOccurrence: LOTO_HOLD_LOSS_K
            },
            moneyUnit: 'K VND',
            simulationMethodVersion: simulationService.SIMULATION_METHOD_VERSION,
            childReports
        },
        summary,
        yearlyRows,
        weeklyRows,
        dailyRows
    };
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    writeCsv(summaryCsvPath, summary);
    writeCsv(weeklyCsvPath, weeklyRows);
    writeCsv(yearlyCsvPath, yearlyRows);

    console.log(`[RiskDeLoto] JSON: ${jsonPath}`);
    console.log(`[RiskDeLoto] Summary CSV: ${summaryCsvPath}`);
    console.log(`[RiskDeLoto] Weekly CSV: ${weeklyCsvPath}`);
    console.log(`[RiskDeLoto] Yearly CSV: ${yearlyCsvPath}`);
    console.table(summary.map(row => ({
        game: row.game,
        method: row.methodId,
        played: row.playedDays,
        wins: row.wins,
        losses: row.losses,
        profitK: row.profitK,
        roiPct: round(row.roi * 100, 2),
        avgBet: row.avgBet,
        avgHold: row.avgExcluded,
        longestWin: row.longestWin,
        longestLoss: row.longestLoss
    })));
}

const args = parseArgs();
const run = args.has('chunk') ? runChunk(args) : runParent(args);
run.catch(error => {
    console.error(error);
    process.exit(1);
});
