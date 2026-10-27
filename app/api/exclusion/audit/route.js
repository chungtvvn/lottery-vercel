import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';
import { getR2Json } from '@/lib/r2Store';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // R2-only (was a direct lib/data/statistics disk read). A missing R2
        // key fails loudly with the R2_UNAVAILABLE message naming the key —
        // it is reported as not found, never substituted with a local file.
        const data = await getR2Json('cached_exclusion_tier_audit.json', 'statistics');
        return cachedResponse(data, 'DAILY');
    } catch (error) {
        if (String(error?.message || '').startsWith('R2_UNAVAILABLE')) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
