import { NextResponse } from 'next/server';
import { cachedResponse } from '@/lib/cache-headers';

// Potential streaks - tính toán nhẹ, trả về từ cache hoặc compute nhanh
export async function GET() {
    try {
        const lotteryService = require('@/lib/services/lotteryService');
        await lotteryService.loadAll();
        
        // Potential streaks was removed from static JSON generation to save space.
        // Return empty array to prevent 500 errors and UI crashes.
        return cachedResponse([], 'DAILY');
    } catch (error) {
        console.error('Error in potential-streaks:', error);
        return NextResponse.json([], { status: 200 });
    }
}
