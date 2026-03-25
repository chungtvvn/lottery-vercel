import { NextResponse } from 'next/server';
import { getRecentResults } from '@/lib/data-access';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit')) || 7;
        const results = await getRecentResults(limit);
        const formatted = results.map(r => ({
            date: r.date,
            special: r.special,
            prize1: r.prize1
        }));
        return cachedResponse(formatted, 'DAILY');
    } catch (error) {
        return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
    }
}
