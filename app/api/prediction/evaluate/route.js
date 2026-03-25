import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';
import * as controller from '@/lib/controllers/predictionController';

export async function POST(request) {
    try {
        const body = await request.json();
        const lotteryService = require('@/lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadAll();
        
        let result; let sc = 200;
        const req = { body };
        const res = { json(d) { result = d; return res; }, status(c) { sc = c; return res; } };
        
        await controller.evaluatePrediction(req, res);
        return NextResponse.json(result, { status: sc });
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
