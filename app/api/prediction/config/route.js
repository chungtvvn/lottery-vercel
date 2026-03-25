import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';
import * as controller from '@/lib/controllers/predictionController';

export async function GET(request) {
    try {
        let result; let sc = 200;
        const req = { query: {} };
        const res = { json(d) { result = d; return res; }, status(c) { sc = c; return res; } };
        
        controller.getConfig(req, res);
        return cachedResponse(result, 'LONG');
    } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
