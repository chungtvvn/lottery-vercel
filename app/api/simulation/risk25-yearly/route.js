import { NextResponse } from 'next/server';

export const maxDuration = 300;

export async function GET(request) {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        await lotteryService.loadAll();
        const simulationService = require('@/lib/services/simulationService');
        const url = new URL(request.url);
        const years = parseFloat(url.searchParams.get('years')) || 20;
        const days = parseInt(url.searchParams.get('days'), 10) || 0;

        if (years < 1 || years > 25) {
            return NextResponse.json({ error: 'Số năm phải từ 1 đến 25.' }, { status: 400 });
        }
        if (days && (days < 7 || days > 25 * 366)) {
            return NextResponse.json({ error: 'Số ngày phải từ 7 đến 9150.' }, { status: 400 });
        }

        const result = await simulationService.runCombinedRisk25YearlyReport({
            years,
            days: days || undefined
        });
        if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
        return NextResponse.json(result);
    } catch (e) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
