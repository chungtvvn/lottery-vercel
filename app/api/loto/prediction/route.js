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

function filterCount(payload, countParam) {
    const raw = String(countParam || '').trim().toLowerCase();
    if (!raw || raw === 'all') return payload;

    const count = Number(raw);
    if (![5, 6, 7].includes(count)) {
        return {
            ...payload,
            error: 'count chỉ hỗ trợ 5, 6, 7 hoặc all.'
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
        const payload = await loadJsonWithSupabaseFallback('cached_loto_prediction.json');

        if (!payload) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Chưa có cache dự đoán Lô. Hãy chạy action cập nhật dữ liệu để sinh cached_loto_prediction.json.'
                },
                { status: 404, headers: NO_STORE_HEADERS }
            );
        }

        const filtered = filterCount(payload, url.searchParams.get('count'));
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
