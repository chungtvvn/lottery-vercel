import { NextResponse } from 'next/server';
import predictionHistoryService from '@/lib/services/predictionHistoryService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0'
};

export async function GET(request) {
    try {
        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get('limit')) || 90;
        
        // Enforce a 6-second timeout to prevent Vercel 10s Serverless Gateway Timeout (e.g. during Supabase cold start)
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Kết nối cơ sở dữ liệu bị chậm do chế độ ngủ của máy chủ. Hãy thử tải lại trang.')), 6000)
        );
        
        const history = await Promise.race([
            predictionHistoryService.getHistory(limit),
            timeoutPromise
        ]);
        
        return NextResponse.json({ success: true, history }, { headers: NO_STORE_HEADERS });
    } catch (e) {
        console.error('[PredictionHistoryAPI] Error:', e);
        // Return 200 status with success: false so the client UI can parse and show the friendly message
        return NextResponse.json({ success: false, error: e.message }, { headers: NO_STORE_HEADERS });
    }
}
