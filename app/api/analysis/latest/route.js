import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const lotteryService = require('../../../../lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        
        const rawData = lotteryService.getRawData();
        if (!rawData || rawData.length === 0) {
            return NextResponse.json({ predictions: null, message: 'No data' });
        }

        // Return latest result info for the simulation page
        const latest = rawData[rawData.length - 1];
        return NextResponse.json({
            predictions: null,
            latestDate: latest.date,
            latestSpecial: latest.special,
            message: 'Dữ liệu có sẵn. Sử dụng tab Giả lập để chạy phân tích.'
        });
    } catch (error) {
        console.error('[Analysis Latest] Error:', error);
        return NextResponse.json({ predictions: null, error: error.message }, { status: 500 });
    }
}
