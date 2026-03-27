import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * Static JSON Workflow: Updates happen via GitHub Actions (daily-update.yml).
 * This route is kept for backward compatibility with the frontend button,
 * but now triggers the local static update script instead of Supabase writes.
 */
export async function POST(request) {
    try {
        const url = new URL(request.url);
        const step = url.searchParams.get('step') || 'data';

        if (step === 'data') {
            // In production (Vercel), file system is read-only. 
            // Updates happen via GitHub Actions.
            return NextResponse.json({
                success: true,
                step: 'data',
                message: 'Dữ liệu được cập nhật tự động qua GitHub Actions hàng ngày lúc 18:45 (VN). Không cần cập nhật thủ công.',
                newCount: 0
            });
        }

        if (step === 'stats_number' || step === 'stats_head_tail' || step === 'stats_sum_diff') {
            return NextResponse.json({
                success: true,
                step,
                message: 'Thống kê được tính toán sẵn trong Static JSON. GitHub Actions tự động cập nhật.',
                skipped: true
            });
        }

        if (step === 'stats_quick') {
            return NextResponse.json({
                success: true,
                step,
                message: 'Quick Stats đã được tính sẵn trong Static JSON. GitHub Actions tự động cập nhật.',
                skipped: true
            });
        }

        return NextResponse.json({ success: false, message: 'Invalid step' }, { status: 400 });
    } catch (error) {
        console.error('[Update] Error:', error);
        return NextResponse.json({ success: false, message: 'Lỗi: ' + error.message }, { status: 500 });
    }
}
