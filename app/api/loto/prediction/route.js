import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
};
const LOTO_STAKE_PER_NUMBER_K = 220;
const LOTO_PAYOUT_PER_HIT_K = 800;
const LOTO_BET_COUNTS = [3, 4, 5, 6, 7, 14];

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
            error: 'count chỉ hỗ trợ 3, 4, 5, 6, 7, 14 hoặc all.'
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

function withLotoConfig(config = {}) {
    return {
        ...config,
        stakePerNumberK: LOTO_STAKE_PER_NUMBER_K,
        payoutPerHitK: LOTO_PAYOUT_PER_HIT_K,
        defaultBetCount: 14
    };
}

function normalizeLotoMethod(method = {}, count) {
    const hits = Number(method.hits || 0) || 0;
    const betCount = Number(method.betCount || count || 0) || count;
    const stakeK = betCount * LOTO_STAKE_PER_NUMBER_K;
    const payoutK = hits * LOTO_PAYOUT_PER_HIT_K;
    const profitK = payoutK - stakeK;
    return {
        ...method,
        betCount,
        hits,
        stakeK,
        payoutK,
        profitK,
        result: profitK > 0 ? 'win' : (profitK < 0 ? 'loss' : 'flat')
    };
}

function normalizeLiveRows(rows = []) {
    return (rows || []).map(row => {
        const methods = { ...(row.methods || {}) };
        LOTO_BET_COUNTS.forEach(count => {
            const key = `top${count}`;
            if (methods[key]) methods[key] = normalizeLotoMethod(methods[key], count);
        });
        return { ...row, methods };
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

function normalizeLotoPayload(payload = {}, strategy = 'parallelCombined') {
    // Deep clone payload to avoid side-effects
    const cloned = JSON.parse(JSON.stringify(payload));
    
    // If the cache uses the multi-strategy format, let's extract the requested strategy first!
    if (cloned.nextPrediction?.strategies?.[strategy]) {
        cloned.nextPrediction.predictions = cloned.nextPrediction.strategies[strategy].predictions;
        cloned.nextPrediction.methodId = cloned.nextPrediction.strategies[strategy].methodId || cloned.nextPrediction.methodId;
        cloned.nextPrediction.strategy = strategy;
    }

    let rawPredictions = cloned.livePredictions?.predictions || [];
    // Extract the strategy-specific fields from each row if available
    rawPredictions = rawPredictions.map(row => {
        if (row.strategies?.[strategy]) {
            return {
                ...row,
                predictions: row.strategies[strategy].predictions,
                methods: row.strategies[strategy].methods || {}
            };
        }
        return row;
    });

    const liveRows = normalizeLiveRows(rawPredictions);
    
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
            config: withLotoConfig(cloned.livePredictions.config || {}),
            predictions: liveRows,
            summary: liveSummary
        }
        : cloned.livePredictions;
        
    return {
        ...cloned,
        config: withLotoConfig(cloned.config || {}),
        nextPrediction: cloned.nextPrediction
            ? {
                ...cloned.nextPrediction,
                config: withLotoConfig(cloned.nextPrediction.config || cloned.config || {})
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
            
        const strategy = url.searchParams.get('strategy') || 'parallelCombined';
        const normalizedPayload = normalizeLotoPayload(mergedPayload, strategy);
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
