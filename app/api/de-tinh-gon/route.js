import { NextResponse } from 'next/server';
import { getDeTinhGonReportAsync, getDeTinhGonReport } from '@/lib/services/deTinhGonService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const forceRefresh = searchParams.get('refresh') === 'true' || searchParams.get('refresh') === '1';
        const parityMethod = searchParams.get('parityMethod') || 'optimalHybrid';
        const betMode = searchParams.get('betMode') || 'tiered';

        let report = null;
        try {
            report = await getDeTinhGonReportAsync({ forceRefresh, parityMethod, betMode });
        } catch (asyncErr) {
            console.warn('[API /api/de-tinh-gon] Async report warning, falling back to safe sync:', asyncErr.message);
            report = getDeTinhGonReport({ forceRefresh: true, parityMethod, betMode });
        }

        return NextResponse.json(report, {
            headers: {
                'Cache-Control': 'public, max-age=30, stale-while-revalidate=120'
            }
        });
    } catch (error) {
        console.error('[API /api/de-tinh-gon] Critical Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Lỗi xử lý dữ liệu Đề Tinh Gọn & TriCore' },
            { status: 500 }
        );
    }
}
