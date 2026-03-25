import { NextResponse } from 'next/server';

export async function POST() {
    try {
        const predictionCacheService = require('@/lib/services/predictionCacheService');
        await predictionCacheService.clearCache();
        
        return NextResponse.json({ success: true, message: 'Cache đã được xóa thành công.' });
    } catch (e) {
        console.error('[Clear Cache API] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
