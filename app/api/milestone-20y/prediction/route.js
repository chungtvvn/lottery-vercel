import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
};

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

function pickPrediction(payload, strategyId, target) {
    if (!strategyId && !target) return payload;

    const nextPrediction = payload.nextPrediction || {};
    const strategies = nextPrediction.strategies || {};
    const selectedStrategyId = strategyId && strategies[strategyId] ? strategyId : strategyId;
    if (strategyId && !strategies[strategyId]) {
        return { error: `strategy không hợp lệ: ${strategyId}` };
    }

    const selected = selectedStrategyId ? strategies[selectedStrategyId] : null;
    if (!selected) return payload;

    const targetKey = target ? String(Number(target)) : null;
    if (targetKey && !selected.holds?.[targetKey]) {
        return { error: `target không hợp lệ cho ${selectedStrategyId}: ${target}` };
    }

    return {
        ...payload,
        nextPrediction: {
            ...nextPrediction,
            strategies: {
                [selectedStrategyId]: targetKey
                    ? { ...selected, holds: { [targetKey]: selected.holds[targetKey] } }
                    : selected
            }
        }
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
        const annualMilestoneService = require('@/lib/services/annualMilestoneService');
        const url = new URL(request.url);
        let payload = await loadJsonWithSupabaseFallback('cached_milestone20y_prediction.json').catch(() => null);
        let livePayload = await loadJsonWithSupabaseFallback('cached_milestone20y_live_predictions.json').catch(() => null);

        if (!payload) {
            const generated = await annualMilestoneService.generateAndSaveCaches({ write: false });
            payload = generated.prediction;
            livePayload = generated.live;
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

        const filtered = pickPrediction(
            mergedPayload,
            url.searchParams.get('strategy'),
            url.searchParams.get('target')
        );
        if (filtered.error) {
            return NextResponse.json(
                { success: false, error: filtered.error },
                { status: 400, headers: NO_STORE_HEADERS }
            );
        }

        return NextResponse.json(
            { success: true, ...filtered },
            { headers: NO_STORE_HEADERS }
        );
    } catch (error) {
        console.error('[Milestone20YPredictionAPI] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500, headers: NO_STORE_HEADERS }
        );
    }
}
