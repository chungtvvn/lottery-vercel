import { NextResponse } from 'next/server';
import { getCachedClientPayload } from '@/lib/services/ai5StatsService';

// Cấu hình ISR và Edge Cache trên Vercel:
// Tự động lưu cache tĩnh mỗi lần Vercel build lại, phục vụ từ CDN cache trong 60s (SWR 300s).
export const revalidate = 60;

export async function GET(request) {
    try {
        // Chỉ lấy 30 ngày gần nhất và lưu cache để tránh overload
        const payload = getCachedClientPayload({ maxDays: 30 });
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
