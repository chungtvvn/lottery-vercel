#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const lotteryService = require('../lib/services/lotteryService');
const historicalExclusionService = require('../lib/services/historicalExclusionService');
const simulationService = require('../lib/services/simulationService');
const generateNumberStats = require('../lib/generators/statisticsGenerator');
const generateHeadTailStats = require('../lib/generators/headTailStatsGenerator');
const generateSumDiffStats = require('../lib/generators/sumDifferenceStatsGenerator');

const DEFAULT_LOTO_STAKE_PER_NUMBER_K = 2300;
const DEFAULT_LOTO_PAYOUT_PER_HIT_K = 8000;

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

function parseArgs() {
    return new Map(process.argv.slice(2).map(arg => {
        const [key, value] = arg.replace(/^--/, '').split('=');
        return [key, value || '1'];
    }));
}

function formatIsoDate(rawDate) {
    const d = new Date(rawDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeDateText(value) {
    if (!value) return null;
    const text = String(value).trim();
    const ddmmyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyy) {
        return `${ddmmyyyy[3]}-${String(ddmmyyyy[2]).padStart(2, '0')}-${String(ddmmyyyy[1]).padStart(2, '0')}`;
    }
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return formatIsoDate(date);
}

function normalizeNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return ((Math.trunc(num) % 100) + 100) % 100;
}

function formatNumber(value) {
    return String(value).padStart(2, '0');
}

function toPositionData(rawData, key) {
    return (rawData || [])
        .map(row => {
            const value = normalizeNumber(row[key]);
            if (value === null) return null;
            return { date: row.date, special: value };
        })
        .filter(Boolean);
}

async function buildStatsForPosition(positionData) {
    const [numberStats, headTailStats, sumDiffStats] = await Promise.all([
        generateNumberStats(null, null, positionData),
        generateHeadTailStats(null, null, positionData),
        generateSumDiffStats(null, null, positionData)
    ]);
    return { numberStats, headTailStats, sumDiffStats };
}

function countActualOccurrences(day) {
    const counts = new Map();
    for (const key of PRIZE_KEYS) {
        const value = normalizeNumber(day[key]);
        if (value === null) continue;
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
}

function emptySummary(label, count) {
    return {
        label,
        count,
        days: 0,
        wins: 0,
        losses: 0,
        hitDays: 0,
        totalHits: 0,
        stakeK: 0,
        payoutK: 0,
        profitK: 0,
        bestProfitK: null,
        worstProfitK: null,
        longestWin: 0,
        longestLoss: 0,
        currentType: null,
        currentLength: 0
    };
}

function updateStreak(summary, profitK) {
    const type = profitK > 0 ? 'win' : (profitK < 0 ? 'loss' : 'flat');
    if (type === 'flat') {
        summary.currentType = null;
        summary.currentLength = 0;
        return;
    }
    if (summary.currentType === type) {
        summary.currentLength += 1;
    } else {
        summary.currentType = type;
        summary.currentLength = 1;
    }
    if (type === 'win') summary.longestWin = Math.max(summary.longestWin, summary.currentLength);
    if (type === 'loss') summary.longestLoss = Math.max(summary.longestLoss, summary.currentLength);
}

function finalizeSummary(summary) {
    const { currentType, currentLength, ...rest } = summary;
    return {
        ...rest,
        hitRate: rest.days > 0 ? rest.hitDays / rest.days : 0,
        roi: rest.stakeK > 0 ? rest.profitK / rest.stakeK : 0,
        avgHitsPerDay: rest.days > 0 ? rest.totalHits / rest.days : 0
    };
}

async function runPositionBacktest(rawData, key, options) {
    const positionData = toPositionData(rawData, key);
    const stats = await buildStatsForPosition(positionData);
    lotteryService.__setInMemoryCachesForBacktest({
        rawData: positionData,
        ...stats
    });
    historicalExclusionService.clearCache();

    const result = await simulationService.runBacktest(options.days, positionData, {
        playMode: 'bet',
        rollingHistory: true,
        methods: options.methodId,
        compactDetails: true,
        selectedStreakDetailLimit: 0,
        betWinMultiplier: 84,
        clearHistoryCacheInterval: 30
    });
    if (result.error) throw new Error(`${key}: ${result.error}`);
    return result.details.slice().reverse().map(day => ({
        date: day.predictionIsoDate,
        numbers: (day.methods?.[options.methodId]?.rawBetNumbers || []).map(Number)
    }));
}

async function runPositionPredictionOnly(rawData, key, options) {
    return {
        rows: [],
        next: await buildPositionNextPrediction(rawData, key, options)
    };
}

async function buildPositionNextPrediction(rawData, key, options) {
    const positionData = toPositionData(rawData, key);
    const stats = await buildStatsForPosition(positionData);
    lotteryService.__setInMemoryCachesForBacktest({
        rawData: positionData,
        ...stats
    });
    historicalExclusionService.clearCache();

    const next = await simulationService.buildNextPrediction(positionData, {
        playMode: 'bet',
        methodIds: options.methodId,
        compactDetails: true,
        selectedStreakDetailLimit: 0,
        forceComputeQuickStats: true,
        betWinMultiplier: 84
    });
    const method = next?.methods?.[options.methodId] || {};
    return {
        positionKey: key,
        dataDate: next?.basisDate || null,
        dataIsoDate: next?.basisIsoDate || null,
        predictionDate: next?.predictionDate || null,
        numbers: (method.rawBetNumbers || method.betNumbers || []).map(Number),
        excludedCount: method.excludedCount || 0,
        betCount: method.rawBetCount ?? method.betCount ?? 0,
        selectedChainCount: method.selectedStreakCount || 0
    };
}

function aggregateRankedBySupport(positionItems) {
    const score = new Map();
    const support = new Map();
    for (const item of positionItems || []) {
        const key = item.positionKey || item.key;
        for (const number of item.numbers || []) {
            score.set(number, (score.get(number) || 0) + 1);
            if (!support.has(number)) support.set(number, []);
            support.get(number).push(key);
        }
    }
    return [...score.entries()]
        .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0] - b[0];
        })
        .map(([number, supportCount]) => ({
            number,
            supportCount,
            positions: support.get(number) || []
        }));
}

function buildPredictionSetsFromRanked(ranked, betCounts) {
    const sets = {};
    for (const betCount of betCounts) {
        const selected = ranked.slice(0, betCount);
        sets[`top${betCount}`] = {
            count: betCount,
            numbers: selected.map(item => formatNumber(item.number)),
            support: selected.map(item => ({
                number: formatNumber(item.number),
                supportCount: item.supportCount,
                positions: item.positions
            }))
        };
    }
    return sets;
}

function readJsonIfExists(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.warn(`[LotoPositionRisk] Không đọc được ${filePath}: ${error.message}`);
        return fallback;
    }
}

function evaluateNumbers(numbers, actualCounts, stakePerNumberK, payoutPerHitK) {
    const betNumbers = (numbers || []).map(value => normalizeNumber(value)).filter(value => value !== null);
    const hits = betNumbers.reduce((sum, number) => sum + (actualCounts.get(number) || 0), 0);
    const stakeK = betNumbers.length * stakePerNumberK;
    const payoutK = hits * payoutPerHitK;
    return {
        betNumbers: betNumbers.map(formatNumber),
        hits,
        stakeK,
        payoutK,
        profitK: payoutK - stakeK,
        result: hits > 0 ? 'win' : 'loss'
    };
}

function buildActualLookup(rawData) {
    const byDate = new Map();
    for (const row of rawData || []) {
        const isoDate = formatIsoDate(row.date);
        byDate.set(isoDate, {
            date: isoDate,
            actual: Object.fromEntries(countActualOccurrences(row)),
            actualText: Object.fromEntries([...countActualOccurrences(row).entries()].map(([number, count]) => [formatNumber(number), count])),
            counts: countActualOccurrences(row)
        });
    }
    return byDate;
}

function settleLivePredictions(livePayload, rawData, options) {
    const actualByDate = buildActualLookup(rawData);
    const predictions = Array.isArray(livePayload.predictions) ? livePayload.predictions : [];
    let settledCount = 0;

    for (const item of predictions) {
        const predictionIsoDate = item.predictionIsoDate || normalizeDateText(item.predictionDate);
        if (!predictionIsoDate) continue;
        item.predictionIsoDate = predictionIsoDate;
        const actual = actualByDate.get(predictionIsoDate);
        if (!actual) {
            item.status = item.status || 'pending';
            continue;
        }

        const wasSettled = item.status === 'settled';
        item.status = 'settled';
        item.settledAt = item.settledAt || new Date().toISOString();
        item.actual = actual.actualText;
        item.methods = item.methods || {};
        for (const betCount of options.betCounts) {
            const key = `top${betCount}`;
            const numbers = item.predictions?.[key]?.numbers || [];
            item.methods[key] = evaluateNumbers(numbers, actual.counts, options.stakePerNumberK, options.payoutPerHitK);
        }
        if (!wasSettled) settledCount += 1;
    }

    return settledCount;
}

function summarizeLivePredictions(livePayload, betCounts) {
    const summary = {};
    const settled = (livePayload.predictions || []).filter(item => item.status === 'settled');
    for (const betCount of betCounts) {
        const key = `top${betCount}`;
        const sum = emptySummary(key, betCount);
        for (const item of settled) {
            const method = item.methods?.[key];
            if (!method) continue;
            const profitK = method.profitK || 0;
            sum.days += 1;
            if ((method.hits || 0) > 0) {
                sum.wins += 1;
                sum.hitDays += 1;
            } else {
                sum.losses += 1;
            }
            sum.totalHits += method.hits || 0;
            sum.stakeK += method.stakeK || 0;
            sum.payoutK += method.payoutK || 0;
            sum.profitK += profitK;
            sum.bestProfitK = sum.bestProfitK === null ? profitK : Math.max(sum.bestProfitK, profitK);
            sum.worstProfitK = sum.worstProfitK === null ? profitK : Math.min(sum.worstProfitK, profitK);
            updateStreak(sum, profitK);
        }
        summary[key] = finalizeSummary(sum);
    }
    return summary;
}

function upsertNextLivePrediction(livePayload, nextPrediction, betCounts) {
    const predictionIsoDate = normalizeDateText(nextPrediction?.predictionDate);
    if (!predictionIsoDate) return false;
    const exists = (livePayload.predictions || []).some(item => item.predictionIsoDate === predictionIsoDate);
    if (exists) return false;

    livePayload.predictions.push({
        type: 'real',
        status: 'pending',
        createdAt: new Date().toISOString(),
        dataDate: nextPrediction.dataDate || null,
        dataIsoDate: nextPrediction.dataIsoDate || null,
        predictionDate: nextPrediction.predictionDate,
        predictionIsoDate,
        methodId: nextPrediction.methodId,
        positionCount: nextPrediction.positionCount,
        predictions: buildPredictionSetsFromRanked(
            (nextPrediction.ranked || []).map(item => ({
                number: normalizeNumber(item.number),
                supportCount: item.supportCount,
                positions: item.positions || []
            })),
            betCounts
        ),
        positionPredictions: nextPrediction.positionPredictions || []
    });
    return true;
}

function updateLivePredictionStore(output, rawData, betCounts, options) {
    const livePath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_loto_live_predictions.json');
    const livePayload = readJsonIfExists(livePath, {
        generatedAt: null,
        startedAt: new Date().toISOString(),
        config: {
            methodId: options.methodId,
            positionCount: PRIZE_KEYS.length,
            positions: PRIZE_KEYS,
            stakePerNumberK: options.stakePerNumberK,
            payoutPerHitK: options.payoutPerHitK,
            betCounts
        },
        predictions: []
    });

    livePayload.config = {
        ...(livePayload.config || {}),
        methodId: options.methodId,
        positionCount: PRIZE_KEYS.length,
        positions: PRIZE_KEYS,
        stakePerNumberK: options.stakePerNumberK,
        payoutPerHitK: options.payoutPerHitK,
        betCounts
    };
    livePayload.predictions = Array.isArray(livePayload.predictions) ? livePayload.predictions : [];

    const settledCount = settleLivePredictions(livePayload, rawData, {
        betCounts,
        stakePerNumberK: options.stakePerNumberK,
        payoutPerHitK: options.payoutPerHitK
    });
    const inserted = upsertNextLivePrediction(livePayload, output.nextPrediction, betCounts);
    livePayload.generatedAt = new Date().toISOString();
    livePayload.latestDataDate = output.latestDataDate;
    livePayload.summary = summarizeLivePredictions(livePayload, betCounts);
    livePayload.notes = [
        'Các bản ghi type=real là dàn dự đoán đã sinh để đánh thực tế.',
        'Khi predictionIsoDate đã tồn tại, script không ghi đè numbers; chỉ cập nhật actual/methods khi có kết quả thật.',
        'Backtest trong cached_loto_prediction.json chỉ dùng để tham khảo, không thay thế nhật ký real.'
    ];

    fs.mkdirSync(path.dirname(livePath), { recursive: true });
    fs.writeFileSync(livePath, JSON.stringify(livePayload, null, 0));
    console.log(`[LotoPositionRisk] Live store: ${livePath} (settled=${settledCount}, inserted=${inserted ? 1 : 0})`);
    return livePayload;
}

function runPositionChild({ key, outPath, maxMonths, methodId, betCounts, stakePerNumberK, payoutPerHitK, skipBacktest }) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [
            __filename,
            `--positionKey=${key}`,
            `--out=${outPath}`,
            `--months=${maxMonths}`,
            `--method=${methodId}`,
            `--betCounts=${betCounts.join(',')}`,
            `--stakeK=${stakePerNumberK}`,
            `--payoutK=${payoutPerHitK}`,
            skipBacktest ? '--skipBacktest=1' : '--skipBacktest=0'
        ], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                NODE_OPTIONS: process.env.LOTO_CHILD_NODE_OPTIONS || '--max-old-space-size=8192'
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        const timeoutMs = Math.max(60_000, Number(process.env.LOTO_POSITION_TIMEOUT_MS || (skipBacktest ? 300_000 : 0)) || 0);
        const timer = timeoutMs > 0 ? setTimeout(() => {
            child.kill('SIGTERM');
            reject(new Error(`Child ${key} quá thời gian cho phép (${timeoutMs}ms)`));
        }, timeoutMs) : null;

        child.stdout.on('data', chunk => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });
        child.on('error', error => {
            if (timer) clearTimeout(timer);
            reject(error);
        });
        child.on('close', code => {
            if (timer) clearTimeout(timer);
            if (code !== 0) {
                process.stdout.write(stdout || '');
                process.stderr.write(stderr || '');
                reject(new Error(`Child ${key} failed with exit code ${code}`));
                return;
            }
            const tail = stdout.trim().split('\n').filter(Boolean).slice(-1)[0];
            if (tail) console.log(tail);
            try {
                const payload = JSON.parse(fs.readFileSync(outPath, 'utf8'));
                resolve(payload);
            } catch (error) {
                reject(new Error(`Không đọc được output child ${key}: ${error.message}`));
            }
        });
    });
}

async function runPositionChildren(keys, options) {
    const concurrency = Math.max(1, Math.min(keys.length, Number(process.env.LOTO_POSITION_CONCURRENCY || (options.skipBacktest ? 4 : 1)) || 1));
    const results = new Map();
    let cursor = 0;

    async function worker(workerIndex) {
        while (cursor < keys.length) {
            const currentIndex = cursor++;
            const key = keys[currentIndex];
            const outPath = path.join(options.tmpDir, `${key}.json`);
            console.log(`[LotoPositionRisk] ${key}: worker ${workerIndex}/${concurrency} sinh ${options.skipBacktest ? 'dự đoán ngày tiếp theo' : options.methodId} (${currentIndex + 1}/${keys.length})...`);
            const payload = await runPositionChild({
                key,
                outPath,
                maxMonths: options.maxMonths,
                methodId: options.methodId,
                betCounts: options.betCounts,
                stakePerNumberK: options.stakePerNumberK,
                payoutPerHitK: options.payoutPerHitK,
                skipBacktest: options.skipBacktest
            });
            results.set(key, payload);
        }
    }

    await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));
    return keys.map(key => [key, results.get(key)]);
}

async function main() {
    const args = parseArgs();
    const childPositionKey = args.get('positionKey');
    const monthsList = String(args.get('months') || '1,3,6')
        .split(',')
        .map(value => Math.max(1, Number(value.trim()) || 0))
        .filter(Boolean);
    const maxMonths = Math.max(...monthsList);
    const days = Math.round(maxMonths * 30.4375);
    const methodId = String(args.get('method') || 'dropoff85');
    const betCounts = String(args.get('betCounts') || '5,6,7')
        .split(',')
        .map(value => Math.max(1, Math.min(30, Number(value.trim()) || 0)))
        .filter(Boolean);
    const stakePerNumberK = Number(args.get('stakeK') || DEFAULT_LOTO_STAKE_PER_NUMBER_K);
    const payoutPerHitK = Number(args.get('payoutK') || DEFAULT_LOTO_PAYOUT_PER_HIT_K);
    const writeCache = args.get('writeCache') === '1' || args.get('cache') === '1';
    const skipBacktest = args.get('skipBacktest') === '1' || args.get('predictionOnly') === '1';

    await lotteryService.loadRawData();
    const rawData = (lotteryService.getRawData() || [])
        .slice()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    const latestRows = rawData.slice(-days);
    if (latestRows.length < days) {
        console.warn(`[LotoPositionRisk] Chỉ có ${latestRows.length}/${days} ngày dữ liệu.`);
    }

    if (childPositionKey) {
        const outPath = args.get('out');
        if (!PRIZE_KEYS.includes(childPositionKey)) {
            throw new Error(`positionKey không hợp lệ: ${childPositionKey}`);
        }
        if (!outPath) {
            throw new Error('Thiếu --out cho child position run.');
        }
        const childResult = skipBacktest
            ? await runPositionPredictionOnly(rawData, childPositionKey, { methodId })
            : {
                rows: await runPositionBacktest(rawData, childPositionKey, { days, methodId }),
                next: await buildPositionNextPrediction(rawData, childPositionKey, { methodId })
            };
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(childResult));
        console.log(`[LotoPositionRiskChild] ${childPositionKey}: ${childResult.rows.length} rows, next=${childResult.next?.predictionDate || 'none'} -> ${outPath}`);
        return;
    }

    const byPosition = new Map();
    const nextByPosition = [];
    const tmpDir = path.join(process.cwd(), 'reports', 'chunks', `loto_position_${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    if (skipBacktest) {
        const childResults = await runPositionChildren(PRIZE_KEYS, {
            tmpDir,
            maxMonths,
            methodId,
            betCounts,
            stakePerNumberK,
            payoutPerHitK,
            skipBacktest
        });
        for (const [key, childPayload] of childResults) {
            byPosition.set(key, []);
            if (childPayload?.next) {
                nextByPosition.push(childPayload.next);
                console.log(`[LotoPositionRisk] ${key}: next=${childPayload.next.predictionDate || 'none'}, bet=${childPayload.next.betCount || 0}, excluded=${childPayload.next.excludedCount || 0}`);
            }
        }
    } else {
        const childResults = await runPositionChildren(PRIZE_KEYS, {
            tmpDir,
            maxMonths,
            methodId,
            betCounts,
            stakePerNumberK,
            payoutPerHitK,
            skipBacktest
        });
        for (const [key, childPayload] of childResults) {
            byPosition.set(key, Array.isArray(childPayload) ? childPayload : (childPayload?.rows || []));
            if (!Array.isArray(childPayload) && childPayload?.next) {
                nextByPosition.push(childPayload.next);
            }
        }
    }

    const dayRows = [];
    if (!skipBacktest) for (let offset = 0; offset < latestRows.length; offset++) {
        const rawDay = latestRows[offset];
        const date = formatIsoDate(rawDay.date);
        const score = new Map();
        const support = new Map();
        for (const key of PRIZE_KEYS) {
            const positionRows = byPosition.get(key) || [];
            const row = positionRows.find(item => item.date === date);
            for (const number of row?.numbers || []) {
                score.set(number, (score.get(number) || 0) + 1);
                if (!support.has(number)) support.set(number, []);
                support.get(number).push(key);
            }
        }
        const ranked = [...score.entries()]
            .sort((a, b) => {
                if (b[1] !== a[1]) return b[1] - a[1];
                return a[0] - b[0];
            })
            .map(([number, supportCount]) => ({
                number,
                supportCount,
                positions: support.get(number) || []
            }));
        const actualCounts = countActualOccurrences(rawDay);
        dayRows.push({ date, ranked, actualCounts });
    }

    const summaries = new Map();
    const daily = [];
    for (const betCount of betCounts) {
        summaries.set(betCount, emptySummary(`top${betCount}`, betCount));
    }

    for (const row of dayRows) {
        const dailyItem = { date: row.date, actual: Object.fromEntries(row.actualCounts), methods: {} };
        for (const betCount of betCounts) {
            const summary = summaries.get(betCount);
            const bets = row.ranked.slice(0, betCount);
            const betNumbers = bets.map(item => item.number);
            const hits = betNumbers.reduce((sum, number) => sum + (row.actualCounts.get(number) || 0), 0);
            const stakeK = betNumbers.length * stakePerNumberK;
            const payoutK = hits * payoutPerHitK;
            const profitK = payoutK - stakeK;

            summary.days += 1;
            if (hits > 0) {
                summary.wins += 1;
                summary.hitDays += 1;
            } else {
                summary.losses += 1;
            }
            summary.totalHits += hits;
            summary.stakeK += stakeK;
            summary.payoutK += payoutK;
            summary.profitK += profitK;
            summary.bestProfitK = summary.bestProfitK === null ? profitK : Math.max(summary.bestProfitK, profitK);
            summary.worstProfitK = summary.worstProfitK === null ? profitK : Math.min(summary.worstProfitK, profitK);
            updateStreak(summary, profitK);

            dailyItem.methods[`top${betCount}`] = {
                betNumbers: betNumbers.map(formatNumber),
                support: bets.map(item => ({ number: formatNumber(item.number), supportCount: item.supportCount })),
                hits,
                stakeK,
                payoutK,
                profitK
            };
        }
        daily.push(dailyItem);
    }

    const summariesByWindow = {};
    for (const months of monthsList) {
        const windowDays = Math.min(Math.round(months * 30.4375), daily.length);
        const windowDaily = daily.slice(-windowDays);
        summariesByWindow[`${months}m`] = {};
        for (const betCount of betCounts) {
            const sum = emptySummary(`top${betCount}`, betCount);
            for (const row of windowDaily) {
                const method = row.methods[`top${betCount}`];
                const profitK = method.profitK;
                sum.days += 1;
                if (method.hits > 0) {
                    sum.wins += 1;
                    sum.hitDays += 1;
                } else {
                    sum.losses += 1;
                }
                sum.totalHits += method.hits;
                sum.stakeK += method.stakeK;
                sum.payoutK += method.payoutK;
                sum.profitK += method.profitK;
                sum.bestProfitK = sum.bestProfitK === null ? profitK : Math.max(sum.bestProfitK, profitK);
                sum.worstProfitK = sum.worstProfitK === null ? profitK : Math.min(sum.worstProfitK, profitK);
                updateStreak(sum, profitK);
            }
            summariesByWindow[`${months}m`][`top${betCount}`] = finalizeSummary(sum);
        }
    }

    const output = {
        generatedAt: new Date().toISOString(),
        latestDataDate: rawData.length > 0 ? formatIsoDate(rawData[rawData.length - 1].date) : null,
        config: {
            methodId,
            positionCount: PRIZE_KEYS.length,
            positions: PRIZE_KEYS,
            months: monthsList,
            days,
            skipBacktest,
            stakePerNumberK,
            payoutPerHitK,
            betCounts
        },
        summaries: Object.fromEntries([...summaries.entries()].map(([count, summary]) => [`top${count}`, finalizeSummary(summary)])),
        summariesByWindow,
        nextPrediction: {
            generatedAt: new Date().toISOString(),
            dataDate: nextByPosition.find(item => item.dataDate)?.dataDate || null,
            dataIsoDate: nextByPosition.find(item => item.dataIsoDate)?.dataIsoDate || null,
            predictionDate: nextByPosition.find(item => item.predictionDate)?.predictionDate || null,
            methodId,
            positionCount: PRIZE_KEYS.length,
            positions: PRIZE_KEYS,
            positionPredictions: nextByPosition.map(item => ({
                ...item,
                numbers: (item.numbers || []).map(formatNumber)
            })),
            ranked: aggregateRankedBySupport(nextByPosition).map(item => ({
                number: formatNumber(item.number),
                supportCount: item.supportCount,
                positions: item.positions
            })),
            predictions: buildPredictionSetsFromRanked(aggregateRankedBySupport(nextByPosition), betCounts)
        },
        daily
    };

    if (skipBacktest) {
        const existingCachePath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_loto_prediction.json');
        const existingCache = readJsonIfExists(existingCachePath, null);
        output.summaries = existingCache?.summaries || {};
        output.summariesByWindow = existingCache?.summariesByWindow || {};
        output.daily = existingCache?.recentDaily || [];
    }

    const outputDir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const jsonPath = path.join(outputDir, `backtest_loto_position_risk_${stamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
    if (writeCache) {
        const cachePath = path.join(process.cwd(), 'lib', 'data', 'statistics', 'cached_loto_prediction.json');
        const livePayload = updateLivePredictionStore(output, rawData, betCounts, {
            methodId,
            stakePerNumberK,
            payoutPerHitK
        });
        const cachePayload = {
            generatedAt: output.generatedAt,
            latestDataDate: output.latestDataDate,
            config: output.config,
            nextPrediction: output.nextPrediction,
            summariesByWindow: output.summariesByWindow,
            livePredictions: {
                generatedAt: livePayload.generatedAt,
                startedAt: livePayload.startedAt,
                latestDataDate: livePayload.latestDataDate,
                config: livePayload.config,
                summary: livePayload.summary,
                predictions: (livePayload.predictions || []).slice(-90)
            },
            recentDaily: output.daily.slice(-90),
            notes: [
                skipBacktest
                    ? 'Cache này được sinh ở chế độ predictionOnly: action hằng ngày chỉ settle kết quả thực tế và sinh dàn Lô mới, không chạy backtest rolling.'
                    : 'Cache này bao gồm backtest tham khảo và dự đoán Lô mới.',
                'Nhật ký real trong livePredictions là nguồn theo dõi thực tế từ ngày chức năng Lô được triển khai.'
            ]
        };
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(cachePayload, null, 0));
        console.log(`[LotoPositionRisk] Cache: ${cachePath}`);
    }

    console.log(`[LotoPositionRisk] JSON: ${jsonPath}`);
    for (const months of monthsList) {
        const windowSummary = output.summariesByWindow?.[`${months}m`] || {};
        if (Object.keys(windowSummary).length === 0) {
            console.log(`\n=== ${months} tháng gần nhất ===`);
            console.log('[LotoPositionRisk] Chế độ prediction-only chưa có backtest summary tham khảo; dùng livePredictions để theo dõi thực tế.');
            continue;
        }
        console.log(`\n=== ${months} tháng gần nhất ===`);
        console.table(Object.values(windowSummary).map(item => ({
            method: item.label,
            days: item.days,
            wins: item.wins,
            losses: item.losses,
            hitRate: `${(item.hitRate * 100).toFixed(2)}%`,
            totalHits: item.totalHits,
            profitK: item.profitK,
            roi: `${(item.roi * 100).toFixed(2)}%`,
            longestWin: item.longestWin,
            longestLoss: item.longestLoss
        })));
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
