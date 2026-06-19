import { NextResponse } from 'next/server';
import predictionHistoryService from '@/lib/services/predictionHistoryService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
};

export async function GET(request) {
    try {
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
