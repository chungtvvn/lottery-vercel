import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET() {
    try {
        const { getCachedPredictionsFromCache } = require('@/lib/data-access');
        const data = await getCachedPredictionsFromCache();
        
        if (!data) {
             return cachedResponse({ success: false, data: null, error: 'Chưa sinh cached_predictions.json. Vui lòng chạy GitHub Action mới.' }, 'DAILY');
        }

        return cachedResponse({
            success: true,
            cached: true,
            data: data
        }, 'DAILY');
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
