import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
};
const FALLBACK_LOTO_STAKE_PER_NUMBER_K = 2200;
const FALLBACK_LOTO_PAYOUT_PER_HIT_K = 8000;
const LOTO_BET_COUNTS = [4, 6, 7, 8, 10, 20, 25, 30];
const LEGACY_RRF_LOTO_STRATEGY = 'rrfParallelBlock85Small65';
const DEFAULT_LOTO_STRATEGY = 'loQuantumBayesFusion';
const LOTO_STRATEGY_META = {
    loQuantumBayesFusion: {
        methodName: '💎 Lô Siêu Hợp Nhất 4 Tầng Bayes & Markov (Mốc Lịch Sử D-1 Strict PIT) [Khuyên Dùng]'
    },
    loDualMerge: {
        methodName: '🎯 Lô Bạc Nhớ Vị Trí 27 Giải (Mốc Lịch Sử D-1 Strict PIT)'
    },
    loTriHarmonic: {
        methodName: '🌟 Lô Siêu Hợp Nhất 3 Động Cơ (Mốc Lịch Sử D-1 Strict PIT)'
    },
    rrfParallelBlock85Small65: {
        methodName: '⚡ Lô Song Song RRF (Mốc Lịch Sử D-1 Strict PIT)'
    }
};
const LOTO_STRATEGY_IDS = Object.keys(LOTO_STRATEGY_META);

function isAuthorized(request) {
    const expected = process.env.PREDICTION_API_TOKEN || process.env.EXTERNAL_API_TOKEN || '';
    if (!expected) return true;

    const url = new URL(request.url);
    const provided = request.headers.get('x-api-key')
        || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
        || url.searchParams.get('token')
        || '';

    return provided === expected;
}

function filterCount(payload, countParam) {
    const raw = String(countParam || '').trim().toLowerCase();
    if (!raw || raw === 'all') return payload;

    const count = Number(raw);
    if (!LOTO_BET_COUNTS.includes(count)) {
        return {
            ...payload,
            error: 'count chỉ hỗ trợ 6, 7, 20, 25, 30 hoặc all.'
        };
    }

    const key = `top${count}`;
    return {
        ...payload,
        nextPrediction: {
            ...payload.nextPrediction,
            predictions: {
                [key]: payload.nextPrediction?.predictions?.[key] || null
            }
        }
    };
}

function normalizeLotteryNumber(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return /^\d+$/.test(text)
        ? text.padStart(2, '0').slice(-2)
        : text;
}

function normalizeNumberList(values = []) {
    return (values || [])
        .map(normalizeLotteryNumber)
        .filter(Boolean);
}

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function readLotoEconomics(payload = {}) {
    const config = payload.livePredictions?.config
        || payload.nextPrediction?.config
        || payload.config
        || {};
    return {
        stakePerNumberK: finiteNumber(config.stakePerNumberK, FALLBACK_LOTO_STAKE_PER_NUMBER_K) || FALLBACK_LOTO_STAKE_PER_NUMBER_K,
        payoutPerHitK: finiteNumber(config.payoutPerHitK, FALLBACK_LOTO_PAYOUT_PER_HIT_K) || FALLBACK_LOTO_PAYOUT_PER_HIT_K,
        defaultBetCount: finiteNumber(config.defaultBetCount, 6) || 6
    };
}

function withLotoConfig(config = {}, economics = {}) {
    const stakePerNumberK = finiteNumber(config.stakePerNumberK, economics.stakePerNumberK || FALLBACK_LOTO_STAKE_PER_NUMBER_K)
        || FALLBACK_LOTO_STAKE_PER_NUMBER_K;
    const payoutPerHitK = finiteNumber(config.payoutPerHitK, economics.payoutPerHitK || FALLBACK_LOTO_PAYOUT_PER_HIT_K)
        || FALLBACK_LOTO_PAYOUT_PER_HIT_K;
    return {
        ...config,
        stakePerNumberK,
        payoutPerHitK,
        defaultBetCount: finiteNumber(config.defaultBetCount, economics.defaultBetCount || 6) || 6
    };
}

function getDoubleNumbers(method = {}) {
    return normalizeNumberList(method.doubleNumbers || method.x2Numbers || []);
}

function getOverlapNumbers(method = {}) {
    return normalizeNumberList(method.overlapNumbers || method.intersection || []);
}

function getUnitCount(method = {}, fallbackCount = 0) {
    const explicit = finiteNumber(method.unitCount ?? method.betUnitCount ?? method.weightedBetCount, 0);
    if (explicit > 0) return explicit;
    const betNumbers = normalizeNumberList(method.betNumbers || method.numbers || []);
    const doubleNumbers = getDoubleNumbers(method);
    if (betNumbers.length) return betNumbers.length + doubleNumbers.filter(number => betNumbers.includes(number)).length;
    return finiteNumber(method.betCount, fallbackCount) || fallbackCount;
}

function normalizeLotoPrediction(prediction = {}, count) {
    const numbers = normalizeNumberList(prediction.numbers || prediction.betNumbers || []);
    const doubleNumbers = getDoubleNumbers(prediction).filter(number => numbers.includes(number));
    const overlapNumbers = getOverlapNumbers(prediction).filter(number => numbers.includes(number));
    const unitCount = finiteNumber(prediction.unitCount ?? prediction.betUnitCount ?? prediction.weightedBetCount, 0)
        || (numbers.length + doubleNumbers.length);
    return {
        ...prediction,
        count: finiteNumber(prediction.count, count) || count,
        numbers,
        intersection: doubleNumbers,
        doubleNumbers,
        overlapNumbers,
        uniqueCount: numbers.length,
        unitCount
    };
}

function normalizePredictionMap(predictions = {}) {
    const normalized = { ...(predictions || {}) };
    LOTO_BET_COUNTS.forEach(count => {
        const key = `top${count}`;
        if (normalized[key]) normalized[key] = normalizeLotoPrediction(normalized[key], count);
    });
    return normalized;
}

function normalizeLotoMethod(method = {}, count, economics = {}) {
    const stakePerNumberK = economics.stakePerNumberK || FALLBACK_LOTO_STAKE_PER_NUMBER_K;
    const payoutPerHitK = economics.payoutPerHitK || FALLBACK_LOTO_PAYOUT_PER_HIT_K;
    const hits = Number(method.hits || 0) || 0;
    const betNumbers = normalizeNumberList(method.betNumbers || []);
    const doubleNumbers = getDoubleNumbers(method).filter(number => !betNumbers.length || betNumbers.includes(number));
    const overlapNumbers = getOverlapNumbers(method).filter(number => !betNumbers.length || betNumbers.includes(number));
    const uniqueCount = betNumbers.length || finiteNumber(method.uniqueCount, 0);
    const unitCount = getUnitCount({ ...method, betNumbers, doubleNumbers }, count);
    const betCount = uniqueCount || finiteNumber(method.betCount, count) || count;
    const stakeK = Number.isFinite(Number(method.stakeK)) ? Number(method.stakeK) : unitCount * stakePerNumberK;
    const payoutK = Number.isFinite(Number(method.payoutK)) ? Number(method.payoutK) : hits * payoutPerHitK;
    const profitK = Number.isFinite(Number(method.profitK)) ? Number(method.profitK) : payoutK - stakeK;
    return {
        ...method,
        betNumbers,
        intersection: doubleNumbers,
        doubleNumbers,
        overlapNumbers,
        uniqueCount,
        unitCount,
        betCount,
        hits,
        stakeK,
        payoutK,
        profitK,
        result: profitK > 0 ? 'win' : (profitK < 0 ? 'loss' : 'flat')
    };
}

function normalizeLiveRows(rows = [], economics = {}) {
    return (rows || []).map(row => {
        const methods = { ...(row.methods || {}) };
        const predictions = normalizePredictionMap(row.predictions || {});
        LOTO_BET_COUNTS.forEach(count => {
            const key = `top${count}`;
            if (methods[key]) methods[key] = normalizeLotoMethod(methods[key], count, economics);
        });
        return { ...row, predictions, methods };
    });
}

function summarizeLiveRows(rows = []) {
    const summary = {};
    LOTO_BET_COUNTS.forEach(count => {
        const key = `top${count}`;
        const item = {
            methodId: key,
            betCount: count,
            days: 0,
            winDays: 0,
            lossDays: 0,
            hitDays: 0,
            totalHits: 0,
            stakeK: 0,
            payoutK: 0,
            profitK: 0,
            bestDayProfitK: null,
            worstDayProfitK: null,
            longestWin: 0,
            longestLoss: 0
        };
        let currentWin = 0;
        let currentLoss = 0;
        rows.forEach(row => {
            if (row.status !== 'settled') return;
            const method = row.methods?.[key];
            if (!method) return;
            item.days += 1;
            item.totalHits += Number(method.hits || 0);
            item.stakeK += Number(method.stakeK || 0);
            item.payoutK += Number(method.payoutK || 0);
            item.profitK += Number(method.profitK || 0);
            item.bestDayProfitK = item.bestDayProfitK === null ? method.profitK : Math.max(item.bestDayProfitK, method.profitK);
            item.worstDayProfitK = item.worstDayProfitK === null ? method.profitK : Math.min(item.worstDayProfitK, method.profitK);
            if (Number(method.hits || 0) > 0) item.hitDays += 1;
            if (Number(method.profitK || 0) > 0) {
                item.winDays += 1;
                currentWin += 1;
                currentLoss = 0;
                item.longestWin = Math.max(item.longestWin, currentWin);
            } else {
                item.lossDays += 1;
                currentLoss += 1;
                currentWin = 0;
                item.longestLoss = Math.max(item.longestLoss, currentLoss);
            }
        });
        item.hitRate = item.days ? item.hitDays / item.days : 0;
        item.winRate = item.days ? item.winDays / item.days : 0;
        item.roi = item.stakeK ? item.profitK / item.stakeK : 0;
        item.avgHitsPerDay = item.days ? item.totalHits / item.days : 0;
        item.wins = item.winDays;
        item.losses = item.lossDays;
        item.bestDayProfitK = item.bestDayProfitK ?? 0;
        item.worstDayProfitK = item.worstDayProfitK ?? 0;
        summary[key] = item;
    });
    return summary;
}

function normalizeLotoPayload(payload = {}, strategy = DEFAULT_LOTO_STRATEGY) {
    // Deep clone payload to avoid side-effects
    const cloned = JSON.parse(JSON.stringify(payload));
    const economics = readLotoEconomics(cloned);
    const strategyMeta = LOTO_STRATEGY_META[strategy] || {};
    
    // If the cache uses the multi-strategy format, let's extract the requested strategy first!
    if (cloned.nextPrediction?.strategies?.[strategy]) {
        cloned.nextPrediction.predictions = normalizePredictionMap(cloned.nextPrediction.strategies[strategy].predictions || {});
        cloned.nextPrediction.methodId = cloned.nextPrediction.strategies[strategy].methodId || cloned.nextPrediction.methodId;
        cloned.nextPrediction.strategy = strategy;
    } else if (cloned.nextPrediction?.predictions) {
        cloned.nextPrediction.predictions = normalizePredictionMap(cloned.nextPrediction.predictions);
    }

    const sourceLiveRows = cloned.livePredictions?.predictions || [];
    // A live row is an immutable snapshot. Never relabel a legacy RRF row as a
    // different strategy merely because that strategy was added later.
    const rawPredictions = sourceLiveRows.map(row => {
        if (row.strategies?.[strategy]) {
            return {
                ...row,
                methodId: row.strategies[strategy].methodId || strategy,
                strategy,
                predictions: row.strategies[strategy].predictions,
                methods: row.strategies[strategy].methods || {}
            };
        }
        // Only legacy RRF snapshots lack an explicit strategies object.  Do
        // not ever reinterpret those rows as Edge75 PIT.
        return strategy === LEGACY_RRF_LOTO_STRATEGY ? row : null;
    }).filter(Boolean);

    const liveRows = normalizeLiveRows(rawPredictions, economics);
    
    // For summary, if multi-strategy summary is available, let's extract it!
    let liveSummary = {};
    if (cloned.livePredictions?.summary) {
        LOTO_BET_COUNTS.forEach(count => {
            const key = `top${count}`;
            const lookupKey = `${strategy}_${key}`;
            if (cloned.livePredictions.summary[lookupKey]) {
                liveSummary[key] = {
                    ...cloned.livePredictions.summary[lookupKey],
                    methodId: key
                };
            }
        });
    }
    
    // Fallback/Legacy summary computation if not found
    if (Object.keys(liveSummary).length === 0) {
        liveSummary = summarizeLiveRows(liveRows);
    }

    const livePredictions = cloned.livePredictions
        ? {
            ...cloned.livePredictions,
            // cached_loto_live_predictions has one legacy/global config (RRF).
            // Rows are already filtered by strategy above, so its label must
            // be derived from the selected strategy as well.
            config: {
                ...withLotoConfig(cloned.livePredictions.config || {}, economics),
                ...strategyMeta,
                strategy,
                methodId: strategy
            },
            predictions: liveRows,
            summary: liveSummary,
            tracking: {
                strategy,
                strategyRows: liveRows.length,
                hiddenLegacyRows: Math.max(0, sourceLiveRows.length - liveRows.length),
                firstPredictionDate: liveRows
                    .map(row => row.predictionIsoDate || row.predictionDate)
                    .filter(Boolean)
                    .sort()[0] || null
            }
        }
        : cloned.livePredictions;
        
    return {
        ...cloned,
        config: {
            ...withLotoConfig(cloned.config || {}, economics),
            ...strategyMeta,
            strategy,
            methodId: cloned.nextPrediction?.strategies?.[strategy]?.methodId
                || cloned.config?.methodId
                || strategy
        },
        nextPrediction: cloned.nextPrediction
            ? {
                ...cloned.nextPrediction,
                config: withLotoConfig(cloned.nextPrediction.config || cloned.config || {}, economics)
            }
            : cloned.nextPrediction,
        livePredictions
    };
}

export async function GET(request) {
    try {
        if (!isAuthorized(request)) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401, headers: NO_STORE_HEADERS }
            );
        }

        const { loadJsonWithSupabaseFallback } = require('@/lib/data-access');
        const url = new URL(request.url);
        const [payload, livePayload] = await Promise.all([
            loadJsonWithSupabaseFallback('cached_loto_prediction.json'),
            loadJsonWithSupabaseFallback('cached_loto_live_predictions.json').catch(() => null)
        ]);

        if (!payload) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Chưa có cache dự đoán Lô. Hãy chạy action cập nhật dữ liệu để sinh cached_loto_prediction.json.'
                },
                { status: 404, headers: NO_STORE_HEADERS }
            );
        }

        const mergedPayload = livePayload
            ? {
                ...payload,
                livePredictions: {
                    generatedAt: livePayload.generatedAt,
                    startedAt: livePayload.startedAt,
                    latestDataDate: livePayload.latestDataDate,
                    config: livePayload.config,
                    summary: livePayload.summary,
                    predictions: (livePayload.predictions || []).slice(-90)
                }
            }
            : payload;

        if (url.searchParams.get('view') === 'telegram') {
            const {
                compactLotoTelegramPayload
            } = require('@/lib/utils/telegramPayloadProjection');
            return NextResponse.json(
                { success: true, ...compactLotoTelegramPayload(mergedPayload) },
                { headers: NO_STORE_HEADERS }
            );
        }

        const { selectBestLotoDefault } = require('@/lib/utils/lotoDefaultSelection');
        const requestedStrategy = url.searchParams.get('strategy');
        const automaticDefault = selectBestLotoDefault(
            mergedPayload.livePredictions?.summary || {},
            {
                strategies: LOTO_STRATEGY_IDS,
                betCounts: LOTO_BET_COUNTS,
                fallbackStrategy: DEFAULT_LOTO_STRATEGY,
                fallbackBetCount: 6
            }
        );
        const strategy = requestedStrategy || automaticDefault.strategy || DEFAULT_LOTO_STRATEGY;
        if (!LOTO_STRATEGY_META[strategy]) {
            return NextResponse.json(
                { success: false, error: `Phương pháp Lô không hợp lệ: ${strategy}.` },
                { status: 400, headers: NO_STORE_HEADERS }
            );
        }

        if (strategy === 'loQuantumBayesFusion' || strategy === 'loDualMerge' || strategy === 'loTriHarmonic') {
            const advisorData = await loadJsonWithSupabaseFallback('cached_daily_method_advisor.json').catch(() => null);
            const loData = advisorData?.[strategy] || {};
            const latestRec = loData.latestRecommendation || {};
            
            const unionNumbers = latestRec.fullUnion || [];
            const x2Numbers = latestRec.intersectionX2 || [];
            const x1Numbers = latestRec.uniqueSinglesX1 || [];
            const rankedNumbers = latestRec.rankedNumbers || [...x2Numbers, ...x1Numbers];
            
            const topPredictions = latestRec.topPredictions || {};
            const predictions = {
                top4: topPredictions.top4 || { numbers: rankedNumbers.slice(0, 4), overlapNumbers: x2Numbers },
                top6: topPredictions.top6 || { numbers: rankedNumbers.slice(0, 6), overlapNumbers: x2Numbers },
                top7: topPredictions.top7 || { numbers: rankedNumbers.slice(0, 7), overlapNumbers: x2Numbers },
                top8: topPredictions.top8 || { numbers: rankedNumbers.slice(0, 8), overlapNumbers: x2Numbers },
                top10: topPredictions.top10 || { numbers: rankedNumbers.slice(0, 10), overlapNumbers: x2Numbers },
                top20: topPredictions.top20 || { numbers: rankedNumbers.slice(0, 20), overlapNumbers: x2Numbers },
                top25: topPredictions.top25 || { numbers: rankedNumbers.slice(0, 25), overlapNumbers: x2Numbers },
                top30: topPredictions.top30 || { numbers: rankedNumbers.slice(0, 30), overlapNumbers: x2Numbers },
                dualMerge: {
                    numbers: unionNumbers,
                    intersectionNumbers: x2Numbers,
                    uniqueSingles: x1Numbers,
                    unitCount: latestRec.unitCount,
                    stakeK: latestRec.stakeK,
                    plainReasons: latestRec.plainReasons
                }
            };
            
            const countsList = [4, 6, 7, 8, 10, 20];
            const liveRecords = (loData.records || loData.settledLedger || []).map(r => {
                const actualMap = {};
                (r.actual27 || []).forEach(num => {
                    const str = String(num).padStart(2, '0');
                    actualMap[str] = (actualMap[str] || 0) + 1;
                });

                const rowPredictions = {};
                const rowMethods = {};

                countsList.forEach(c => {
                    const key = `top${c}`;
                    const m = r.methods?.[key];
                    const betNumbers = m?.betNumbers || (r.rankedNumbers || []).slice(0, c);
                    const hits = m?.hits || 0;
                    const stakeK = c * 2200;
                    const payoutK = hits * 8000;
                    const profitK = payoutK - stakeK;
                    const isWin = profitK > 0;

                    rowPredictions[key] = {
                        count: c,
                        numbers: betNumbers,
                        uniqueCount: betNumbers.length,
                        unitCount: betNumbers.length,
                        betCount: betNumbers.length
                    };

                    rowMethods[key] = {
                        betNumbers,
                        uniqueCount: betNumbers.length,
                        unitCount: betNumbers.length,
                        betCount: betNumbers.length,
                        hits,
                        stakeK,
                        payoutK,
                        profitK,
                        isWin,
                        result: isWin ? 'win' : (profitK < 0 ? 'loss' : 'flat')
                    };
                });

                return {
                    predictionIsoDate: r.date,
                    dataIsoDate: r.date,
                    status: 'settled',
                    isWin: r.isWin,
                    isLiveSnapshot: r.date >= '2026-08-28',
                    sourceType: r.date >= '2026-08-28' ? 'live-snapshot' : 'strict-pit',
                    actual: actualMap,
                    predictions: rowPredictions,
                    methods: rowMethods
                };
            });

            const summaryObj = {};
            countsList.forEach(c => {
                const key = `top${c}`;
                let days = 0, hitDays = 0, winDays = 0, totalHits = 0;
                let stakeK = 0, payoutK = 0, profitK = 0;
                let bestDay = null, worstDay = null;

                liveRecords.forEach(rec => {
                    const m = rec.methods?.[key];
                    if (!m) return;
                    days++;
                    const hits = m.hits || 0;
                    totalHits += hits;
                    if (hits > 0) hitDays++;
                    if (m.isWin) winDays++;
                    stakeK += m.stakeK;
                    payoutK += m.payoutK;
                    profitK += m.profitK;
                    bestDay = bestDay === null ? m.profitK : Math.max(bestDay, m.profitK);
                    worstDay = worstDay === null ? m.profitK : Math.min(worstDay, m.profitK);
                });

                summaryObj[key] = {
                    methodId: key,
                    betCount: c,
                    days,
                    wins: winDays,
                    winDays,
                    losses: days - winDays,
                    lossDays: days - winDays,
                    hitDays,
                    totalHits,
                    stakeK,
                    payoutK,
                    profitK,
                    bestDayProfitK: bestDay || 0,
                    worstDayProfitK: worstDay || 0,
                    hitRate: days > 0 ? Number((hitDays / days).toFixed(4)) : 0,
                    winRate: days > 0 ? Number((winDays / days).toFixed(4)) : 0,
                    roi: stakeK > 0 ? Number((profitK / stakeK).toFixed(4)) : 0,
                    avgHitsPerDay: days > 0 ? Number((totalHits / days).toFixed(2)) : 0
                };
            });

            const stratMeta = LOTO_STRATEGY_META[strategy] || {};

            return NextResponse.json({
                success: true,
                strategy,
                latestDataDate: advisorData?.latestDataDate || mergedPayload.latestDataDate,
                config: {
                    methodId: strategy,
                    methodName: stratMeta.methodName,
                    positionCount: 27,
                    stakePerNumberK: 2200,
                    payoutPerHitK: 8000,
                    defaultBetCount: strategy === 'loTriHarmonic' ? 10 : 6
                },
                nextPrediction: {
                    predictionDate: latestRec.predictionDate,
                    dataIsoDate: advisorData?.latestDataDate,
                    methodName: stratMeta.methodName,
                    m1Label: latestRec.m1Label,
                    m2Label: latestRec.m2Label,
                    plainReasons: latestRec.plainReasons,
                    predictions
                },
                livePredictions: {
                    config: {
                        methodId: strategy,
                        methodName: stratMeta.methodName
                    },
                    summary: summaryObj,
                    predictions: liveRecords
                }
            }, { headers: NO_STORE_HEADERS });
        }

        if (
            strategy !== LEGACY_RRF_LOTO_STRATEGY
            && !mergedPayload.nextPrediction?.strategies?.[strategy]
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error: `R2 chưa có cache cho phương pháp ${LOTO_STRATEGY_META[strategy].methodName}. Hãy chạy action cập nhật dữ liệu.`
                },
                { status: 404, headers: NO_STORE_HEADERS }
            );
        }
        const normalizedPayload = normalizeLotoPayload(mergedPayload, strategy);
        const selectedDefault = selectBestLotoDefault(
            mergedPayload.livePredictions?.summary || {},
            {
                strategies: [strategy],
                betCounts: LOTO_BET_COUNTS,
                fallbackStrategy: strategy,
                fallbackBetCount: normalizedPayload.config?.defaultBetCount || 6
            }
        );
        normalizedPayload.config = {
            ...(normalizedPayload.config || {}),
            defaultBetCount: selectedDefault.betCount
        };
        if (normalizedPayload.nextPrediction?.config) {
            normalizedPayload.nextPrediction.config.defaultBetCount = selectedDefault.betCount;
        }
        if (normalizedPayload.livePredictions?.config) {
            normalizedPayload.livePredictions.config.defaultBetCount = selectedDefault.betCount;
        }
        normalizedPayload.defaultSelection = {
            automatic: !requestedStrategy,
            strategy,
            betCount: selectedDefault.betCount,
            trackedDays: selectedDefault.days,
            profitK: selectedDefault.profitK,
            roi: selectedDefault.roi,
            summaryKey: selectedDefault.key
        };
        const filtered = filterCount(normalizedPayload, url.searchParams.get('count'));
        if (filtered.error) {
            return NextResponse.json(
                { success: false, error: filtered.error },
                { status: 400, headers: NO_STORE_HEADERS }
            );
        }

        return NextResponse.json(
            {
                success: true,
                ...filtered
            },
            { headers: NO_STORE_HEADERS }
        );
    } catch (error) {
        console.error('[LotoPredictionAPI] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500, headers: NO_STORE_HEADERS }
        );
    }
}
