import { NextResponse } from 'next/server';
import { getCachedClientPayloadAsync, getCachedClientPayload } from '@/lib/services/ai5StatsService';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const force = searchParams.get('refresh') === 'true' || searchParams.get('refresh') === '1';
        let payload = null;
        try {
            payload = await getCachedClientPayloadAsync({ maxDays: 30, force });
        } catch (asyncErr) {
            console.warn('[API /api/ai-5] Async R2 fallback to sync:', asyncErr.message);
            payload = getCachedClientPayload({ maxDays: 30 });
        }
        return NextResponse.json(payload, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
                'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
                'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (error) {
        console.error('[API /api/ai-5] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Lỗi xử lý dữ liệu AI 5 Stats' },
            { status: 500 }
        );
    }
}
