import { NextResponse } from 'next/server';
import { buildClientPayload } from '@/lib/services/ai5StatsService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
    try {
        const payload = buildClientPayload();
        return NextResponse.json(payload, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'Pragma': 'no-cache',
                'Expires': '0'
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
