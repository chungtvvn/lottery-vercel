import { NextResponse } from 'next/server';
import { getRawData, clearMemoryCache } from '@/lib/data-access';

export async function POST() {
    try {
        // Clear in-memory cache to force fresh data fetch
        clearMemoryCache();
        console.log('[Manual Update] Cache cleared, re-fetching from Supabase...');
        
        const rawData = await getRawData();
        
        if (!rawData || rawData.length === 0) {
            return NextResponse.json({
                success: false,
                message: 'Không có dữ liệu trong database.'
            }, { status: 404 });
        }

        const latest = rawData[rawData.length - 1];
        const dateStr = latest.date.substring(0, 10);
        const [y, m, d] = dateStr.split('-');
        const formattedDate = `${d}/${m}/${y}`;

        console.log(`[Manual Update] Done. Latest: ${formattedDate}, Total: ${rawData.length}`);
        
        return NextResponse.json({
            success: true,
            message: `Cập nhật thành công! Dữ liệu mới nhất: ${formattedDate}. Tổng: ${rawData.length} bản ghi.`,
            latestDate: formattedDate,
            totalRecords: rawData.length
        });
    } catch (error) {
        console.error('[Manual Update] Error:', error);
        return NextResponse.json({
            success: false,
            message: 'Cập nhật thất bại: ' + error.message
        }, { status: 500 });
    }
}
