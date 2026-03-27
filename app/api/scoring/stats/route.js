import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET() {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        await lotteryService.loadAll();
        return cachedResponse({}, 'DAILY');
    } catch (error) {
        return NextResponse.json({ message: 'Lỗi server', error: error.message }, { status: 500 });
    }
}
