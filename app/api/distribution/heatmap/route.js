import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        const controller = require('@/lib/controllers/distributionController');
        const req = { query: {} };
        let result; let sc = 200;
        const res = { json(d) { result = d; return res; }, status(c) { sc = c; return res; } };
        await controller.getNumberHeatmap(req, res);
        return NextResponse.json(result, { status: sc });
    } catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}
