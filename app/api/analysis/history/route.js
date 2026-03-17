import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const lotteryService = require('../../../../lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        
        const rawData = lotteryService.getRawData();
        if (!rawData || rawData.length === 0) {
            return NextResponse.json({ predictions: [] });
        }

        // Return empty predictions history - this was from Express dailyAnalysis which stored to predictions.json
        // In Vercel serverless, we don't have persistent predictions.json
        return NextResponse.json({ predictions: [] });
    } catch (error) {
        console.error('[Analysis History] Error:', error);
        return NextResponse.json({ predictions: [], error: error.message }, { status: 500 });
    }
}
