import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    try {
        // FAST PATH: Serve pre-computed suggestions from cached JSON
        const { readCacheStore, shouldUseSupabaseDbStats } = require('@/lib/data-access');
        if (shouldUseSupabaseDbStats()) {
            try {
                const dbData = await readCacheStore('cached_suggestions');
                if (dbData) {
                    return cachedResponse(dbData, 'DAILY');
                }
            } catch (dbErr) {
                console.error('Lỗi khi đọc cached_suggestions từ DB:', dbErr.message);
            }
        }

        const cachedPath = path.join(process.cwd(), 'lib/data/statistics/cached_suggestions.json');
        const fsModule = eval("require('fs')");
        if (fsModule.existsSync(cachedPath)) {
            const data = JSON.parse(fsModule.readFileSync(cachedPath, 'utf8'));
            return cachedResponse(data, 'DAILY');
        }

        // FALLBACK: Compute on-the-fly (may timeout on Vercel free tier)
        const lotteryService = require('@/lib/services/lotteryService');
        if (!lotteryService.getRawData() || !lotteryService.getNumberStats() || Object.keys(lotteryService.getNumberStats()).length === 0) {
            await lotteryService.loadRawData();
            await lotteryService.loadStats();
        }
        const suggestionsController = require('@/lib/controllers/suggestionsController');
        
        const url = new URL(request.url);
        const req = { query: Object.fromEntries(url.searchParams.entries()) };
        let result;
        const res = { json(d) { result = d; return res; }, status(c) { res._status = c; return res; }, _status: 200 };
        await suggestionsController.getSuggestions(req, res);
        return cachedResponse(result, 'DAILY');
    } catch (error) {
        console.error('suggestions error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
