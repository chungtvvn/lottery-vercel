import { NextResponse } from 'next/server';
import { getQuickStatsHistoryFromCache } from '@/lib/data-access';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const history = await getQuickStatsHistoryFromCache();
        if (!history) {
            return NextResponse.json({ error: 'History chưa được tính toán.' }, { status: 404 });
        }
        return NextResponse.json(history);
    } catch (error) {
        console.error('Error in quick-stats-history:', error);
        return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
    }
}
