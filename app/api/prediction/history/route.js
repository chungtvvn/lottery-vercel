import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get('limit')) || 90;
        
        const predictionHistoryService = require('@/lib/services/predictionHistoryService');
        const history = await predictionHistoryService.getHistory(limit);
        
        return NextResponse.json({ success: true, history });
    } catch (e) {
        console.error('[PredictionHistoryAPI] Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
