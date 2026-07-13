import { NextResponse } from 'next/server';
import predictionHistoryService from '@/lib/services/predictionHistoryService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
};

function isAuthorized(request) {
    const expected = process.env.PREDICTION_API_TOKEN || process.env.EXTERNAL_API_TOKEN || '';
    const url = new URL(request.url);
    const provided = request.headers.get('x-api-key')
        || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
        || url.searchParams.get('token')
        || '';
    const hasApiAccess = Boolean(expected) && provided === expected;
    const hasSession = request.cookies.get('xsmb_session')?.value === 'authenticated';
    return hasApiAccess || hasSession;
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
        const limit = parseInt(url.searchParams.get('limit')) || 90;
        const history = await predictionHistoryService.getHistory(limit);
        
        return NextResponse.json({ success: true, history }, { headers: NO_STORE_HEADERS });
    } catch (e) {
        console.error('[PredictionHistoryAPI] Error:', e);
        return NextResponse.json(
            { success: false, error: `Không tải được cache Lịch sử từ R2: ${e.message}` },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }
}
