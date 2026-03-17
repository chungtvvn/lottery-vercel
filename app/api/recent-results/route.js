import { NextResponse } from 'next/server';
import { getRecentResults } from '@/lib/data-access';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit')) || 7;
        const results = await getRecentResults(limit);
        // Return dates in ISO format so client can use new Date(item.date) correctly
        const formatted = results.map(r => ({
            date: r.draw_date, // ISO format: "2026-03-12"
            special: r.special,
            prize1: r.prize1
        }));
        return NextResponse.json(formatted);
    } catch (error) {
        return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
    }
}
