import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const { getPublicClient } = require('@/lib/supabase');
        const supabase = getPublicClient();
        const { data } = await supabase
            .from('cache_store')
            .select('data')
            .eq('key', 'scoring_stats')
            .single();
        return NextResponse.json(data?.data || {});
    } catch (error) {
        return NextResponse.json({ message: 'Lỗi server' }, { status: 500 });
    }
}
