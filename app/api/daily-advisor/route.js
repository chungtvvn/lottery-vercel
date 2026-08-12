import { NextResponse } from 'next/server';
import { loadJsonWithSupabaseFallback } from '@/lib/data-access';

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
    return provided === expected || request.cookies.get('xsmb_session')?.value === 'authenticated';
}

export async function GET(request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
    }
    try {
        const payload = await loadJsonWithSupabaseFallback('cached_daily_method_advisor.json');
        if (!payload || !Array.isArray(payload.records)) {
            throw new Error('Cache gợi ý chưa được sinh');
        }
        return NextResponse.json({ success: true, ...payload }, { headers: NO_STORE_HEADERS });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: `Không tải được cache Gợi ý từ R2: ${error.message}` },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }
}
