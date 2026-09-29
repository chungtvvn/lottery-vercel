import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), 'lib/data/statistics/cached_exclusion_tier_audit.json');
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return cachedResponse(data, 'DAILY');
        }
        return NextResponse.json({ error: 'Exclusion audit data not found' }, { status: 404 });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
