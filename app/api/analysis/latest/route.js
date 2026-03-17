import { NextResponse } from 'next/server';

export async function GET(request) {
    try {
        const lotteryService = require('../../../../lib/services/lotteryService');
        if (!lotteryService.getRawData()) await lotteryService.loadRawData();
        
        const rawData = lotteryService.getRawData();
        if (!rawData || rawData.length === 0) {
            return NextResponse.json({ predictions: null, message: 'No data' });
        }

        const suggestionsController = require('../../../../lib/controllers/suggestionsController');
        const url = new URL(request.url);
        const req = { query: Object.fromEntries(url.searchParams.entries()) };
        let result;
        const res = { json(d) { result = d; return res; }, status(c) { res._status = c; return res; }, _status: 200 };
        await suggestionsController.getSuggestions(req, res);
        
        return NextResponse.json(result, { status: res._status });
    } catch (error) {
        console.error('[Analysis Latest] Error:', error);
        return NextResponse.json({ predictions: null, error: error.message }, { status: 500 });
    }
}
