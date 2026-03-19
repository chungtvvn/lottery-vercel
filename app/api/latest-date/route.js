import { NextResponse } from 'next/server';
import { getLatestDate } from '@/lib/data-access';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET() {
    try {
        const latestDate = await getLatestDate();
        return cachedResponse({ latestDate: latestDate || 'Không có dữ liệu' }, 'DAILY');
    } catch (error) {
        console.error('[Latest Date] Error:', error);
        return NextResponse.json({ latestDate: 'Lỗi' }, { status: 500 });
    }
}
