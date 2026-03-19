import { NextResponse } from 'next/server';
import { getAppConfig } from '@/lib/data-access';
import { cachedResponse } from '@/lib/cache-headers';

export async function GET() {
    try {
        const config = await getAppConfig();
        return cachedResponse(config, 'MEDIUM');
    } catch (error) {
        return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
    }
}
