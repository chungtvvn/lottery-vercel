import { NextResponse } from 'next/server';
import { getLatestDate } from '@/lib/data-access';

export async function GET() {
    try {
        const latestDate = await getLatestDate();
        return NextResponse.json({ latestDate: latestDate || 'Không có dữ liệu' });
    } catch (error) {
        console.error('[Latest Date] Error:', error);
        return NextResponse.json({ latestDate: 'Lỗi' }, { status: 500 });
    }
}
