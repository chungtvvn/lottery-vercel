import { NextResponse } from 'next/server';
import { getQuickStatsFromCache } from '@/lib/data-access';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const quickStats = await getQuickStatsFromCache();
        if (!quickStats) {
            return NextResponse.json({ error: 'Quick stats chưa được tính toán. Hãy chạy daily-update.' }, { status: 404 });
        }
        return NextResponse.json(quickStats);
    } catch (error) {
        console.error('Error in quick-stats:', error);
        return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
    }
}
