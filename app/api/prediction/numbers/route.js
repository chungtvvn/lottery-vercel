import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
};

function parseCounts(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'all') return null;
    return raw
        .split(',')
        .map(item => parseInt(item.trim(), 10))
        .filter(Number.isFinite);
}

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

export async function GET(request) {
    try {
        if (!isAuthorized(request)) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401, headers: NO_STORE_HEADERS }
            );
        }

        const url = new URL(request.url);
        const counts = parseCounts(url.searchParams.get('count') || url.searchParams.get('counts'));
        const strategy = url.searchParams.get('strategy') || url.searchParams.get('source') || undefined;
        const selectedStreakDetailLimit = url.searchParams.get('selectedStreakDetailLimit')
            || url.searchParams.get('detailLimit')
            || undefined;

        const simulationService = require('@/lib/services/simulationService');
        const payload = await simulationService.buildNextBetNumberPrediction({
            counts,
            strategy,
            selectedStreakDetailLimit
        });

        if (payload.error) {
            return NextResponse.json(
                { success: false, error: payload.error },
                { status: 400, headers: NO_STORE_HEADERS }
            );
        }

        return NextResponse.json(
            { success: true, ...payload },
            { headers: NO_STORE_HEADERS }
        );
    } catch (error) {
        console.error('[PredictionNumbersAPI] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500, headers: NO_STORE_HEADERS }
        );
    }
}
