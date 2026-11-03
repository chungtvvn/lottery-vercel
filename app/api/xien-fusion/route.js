import { NextResponse } from 'next/server';
import { getXienFusionReport } from '@/lib/services/xienFusionService';

export const revalidate = 60;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const forceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('refresh') === '1';

        const report = getXienFusionReport({ forceRefresh });
        return NextResponse.json(report, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
                'CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
                'Vercel-CDN-Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });
    } catch (error) {
        console.error('[API /api/xien-fusion] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Lỗi xử lý dữ liệu Xiên Ghép Tổng Hợp' },
            { status: 500 }
        );
    }
}
