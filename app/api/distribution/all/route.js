import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        const controller = require('@/lib/controllers/distributionController');
        
        const req = { query: {} };
        let result; let statusCode = 200;
        const res = { json(d) { result = d; return res; }, status(c) { statusCode = c; return res; } };
        await controller.getAllDistributions(req, res);
        return cachedResponse(result, 'DAILY');
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
