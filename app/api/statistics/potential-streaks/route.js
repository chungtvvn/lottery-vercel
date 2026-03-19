import { NextResponse } from 'next/server';

// Potential streaks - tính toán nhẹ, trả về từ cache hoặc compute nhanh
export async function GET() {
    try {
        const { cachedResponse } = require('@/lib/cache-headers');
        const { getPublicClient } = require('@/lib/supabase');
        const supabase = getPublicClient();
        const { data } = await supabase
            .from('cache_store')
            .select('data')
            .eq('key', 'potential_streaks')
            .single();

        if (data) {
            return cachedResponse(data.data, 'DAILY');
        }

        return cachedResponse([], 'DAILY');
    } catch (error) {
        console.error('Error in potential-streaks:', error);
        return NextResponse.json([], { status: 200 });
    }
}
