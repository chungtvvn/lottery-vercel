import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET() {
    try {
        const { scoringForms } = require('@/lib/utils/lotteryScoring');
        const formsForClient = scoringForms.map(({ n, description }) => ({ n, description }));
        return cachedResponse(formsForClient, 'DAILY');
    } catch (error) {
        return NextResponse.json({ message: 'Không thể tải danh sách các dạng số.' }, { status: 500 });
    }
}
