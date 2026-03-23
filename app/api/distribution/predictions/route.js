import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        const controller = require('@/lib/controllers/distributionController');
        const url = new URL(request.url);
        const req = { query: Object.fromEntries(url.searchParams.entries()) }; let result; let sc = 200;
        const res = { json(d) { result = d; return res; }, status(c) { sc = c; return res; } };
        await controller.getPredictions(req, res);
        return cachedResponse(result, 'DAILY');
    } catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}
