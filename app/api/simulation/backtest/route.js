import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        await lotteryService.loadAll();
        const simulationService = require('@/lib/services/simulationService');
        const url = new URL(request.url);
        const days = parseInt(url.searchParams.get('days')) || 30;
        if (days < 7 || days > 365) {
            return NextResponse.json({ error: 'Số ngày phải từ 7 đến 365' }, { status: 400 });
        }
        const results = await simulationService.runBacktest(days);
        if (results.error) return NextResponse.json({ error: results.error }, { status: 400 });
        return NextResponse.json(results);
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
