import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        const simulationService = require('@/lib/services/simulationService');
        const options = await request.json();
        const lotteryData = lotteryService.getRawData();
        if (!lotteryData || lotteryData.length === 0) {
            return NextResponse.json({ error: 'Cache dữ liệu xổ số trống.' }, { status: 400 });
        }
        const results = await simulationService.runProgressiveSimulation(options, lotteryData);
        return NextResponse.json(results);
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
