import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        const futureSimulationService = require('@/lib/services/futureSimulationService');
        const { duration = 'week', betAmount = 10, betStep = 5 } = await request.json();
        const validDurations = ['week', 'month', '3months', 'year'];
        if (!validDurations.includes(duration)) {
            return NextResponse.json({ error: 'Duration không hợp lệ.' }, { status: 400 });
        }
        const results = await futureSimulationService.runSimulation(duration, betAmount, betStep);
        return NextResponse.json(results);
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
