import { NextResponse } from 'next/server';
import { buildBestMethodsReport } from '@/lib/services/bestMethodsService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const force = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';

        const report = await buildBestMethodsReport({ force });

        return NextResponse.json(report, {
            headers: {
                'Cache-Control': 'public, max-age=30, stale-while-revalidate=120'
            }
        });
    } catch (error) {
        console.error('[API /api/best-methods] Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Lỗi tải dữ liệu Trung Tâm Tinh Hoa Đề & Lô' },
            { status: 500 }
        );
    }
}
