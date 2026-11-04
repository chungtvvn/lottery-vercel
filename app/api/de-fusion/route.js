import { NextResponse } from 'next/server';
import { getDeFusionReportAsync, getDeFusionReport } from '@/lib/services/deFusionService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const forceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('refresh') === '1';
        const parityMethod = searchParams.get('parityMethod') || 'optimalHybrid';

        let report = null;
        try {
            report = await getDeFusionReportAsync({ forceRefresh, parityMethod });
        } catch (asyncErr) {
            console.warn('[API /api/de-fusion] Async report warning, falling back to safe sync:', asyncErr.message);
            report = getDeFusionReport({ forceRefresh: true, parityMethod });
        }

        return NextResponse.json(report, {
            headers: {
                'Cache-Control': 'public, max-age=30, stale-while-revalidate=120'
            }
        });
    } catch (error) {
        console.error('[API /api/de-fusion] Critical Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Lỗi xử lý dữ liệu Đề Tinh Hoa & Chẵn Lẻ' },
            { status: 500 }
        );
    }
}
