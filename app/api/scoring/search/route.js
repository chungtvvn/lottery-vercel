import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        const scoringStatsGenerator = require('@/lib/services/scoringStatsGenerator');
        const body = await request.json();
        if (!body.startDate || !body.endDate) {
            return NextResponse.json({ message: 'Thiếu tham số bắt buộc.' }, { status: 400 });
        }
        const result = await scoringStatsGenerator.performCustomSearch(body);
        return NextResponse.json(result);
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
