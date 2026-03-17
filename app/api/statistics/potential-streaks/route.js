import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Potential streaks - tính toán nhẹ, trả về từ cache hoặc compute nhanh
export async function GET() {
    try {
        // Đọc từ cache nếu có
        const { getPublicClient } = require('@/lib/supabase');
        const supabase = getPublicClient();
        const { data } = await supabase
            .from('cache_store')
            .select('data')
            .eq('key', 'potential_streaks')
            .single();

        if (data) {
            return NextResponse.json(data.data);
        }

        return NextResponse.json([]);
    } catch (error) {
        console.error('Error in potential-streaks:', error);
        return NextResponse.json([], { status: 200 });
    }
}
