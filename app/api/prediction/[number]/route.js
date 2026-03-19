import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        const controller = require('@/lib/controllers/predictionController');
        const url = new URL(request.url);
        const num = url.pathname.split('/').pop();
        const req = { params: { number: num }, query: {} }; let result; let sc = 200;
        const res = { json(d) { result = d; return res; }, status(c) { sc = c; return res; } };
        await controller.getNumberPrediction(req, res);
        return cachedResponse(result, 'DAILY');
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
