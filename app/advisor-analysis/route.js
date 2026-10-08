import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const targetUrl = new URL('/daily-advisor-shadow', request.url);
    return NextResponse.redirect(targetUrl, 308);
}
