import { NextResponse } from 'next/server';
import { getAppConfig } from '@/lib/data-access';

export async function GET() {
    try {
        const config = await getAppConfig();
        return NextResponse.json(config);
    } catch (error) {
        return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
    }
}
