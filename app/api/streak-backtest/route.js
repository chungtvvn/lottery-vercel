import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const url = new URL(request.url);
        const days = parseInt(url.searchParams.get('days')) || 30;

        const lotteryService = require('@/lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadAll();
        
        const streakBacktestService = require('@/lib/services/streakBacktestService');
        const results = await streakBacktestService.runBacktest(days);
        
        if (results.error) {
            return NextResponse.json({ error: results.error }, { status: 400 });
        }
        
        return NextResponse.json(results);
    } catch (e) {
        console.error('[Streak Backtest API] Error:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
