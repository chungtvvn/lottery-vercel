import { NextResponse } from 'next/server';

export const maxDuration = 300;

export async function POST(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        const cachedData = lotteryService.getRawData();
        if (!cachedData || cachedData.length === 0) await lotteryService.loadAll();
        const simulationService = require('@/lib/services/simulationService');
        const { duration = 'week' } = await request.json();
        const validDurations = ['week', 'month', '3months', 'year'];
        if (!validDurations.includes(duration)) {
            return NextResponse.json({ error: 'Duration không hợp lệ.' }, { status: 400 });
        }
        const daysByDuration = { week: 7, month: 30, '3months': 90, year: 365 };
        const results = await simulationService.runBacktest(daysByDuration[duration]);
        return NextResponse.json(results);
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
