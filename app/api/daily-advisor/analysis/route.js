import { NextResponse } from 'next/server';
import { loadJsonWithSupabaseFallback } from '@/lib/data-access';
import { buildAdvisorAnalysis } from '@/lib/services/advisorAnalysisService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', Expires: '0' };

function isAuthorized(request) {
    const expected = process.env.PREDICTION_API_TOKEN || process.env.EXTERNAL_API_TOKEN || '';
    if (!expected) return true;
    const url = new URL(request.url);
    const provided = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
    return provided === expected || request.cookies.get('xsmb_session')?.value === 'authenticated';
}

export async function GET(request) {
    if (!isAuthorized(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401, headers: HEADERS });
    try {
        const [advisorCache, history, longHorizonCache] = await Promise.all([
            loadJsonWithSupabaseFallback('cached_daily_method_advisor.json'),
            loadJsonWithSupabaseFallback('cached_prediction_history.json'),
            loadJsonWithSupabaseFallback('cached_advisor_long_horizon_research.json').catch(() => null)
        ]);
        // Probability-score snapshots are supporting evidence only. The
        // strict selection laboratory remains available when that optional
        // cache is delayed or intentionally absent.
        let probabilityCache = null;
        try {
            probabilityCache = await loadJsonWithSupabaseFallback('cached_probability_score.json');
        } catch (_) {
            probabilityCache = null;
        }
        if (!advisorCache?.records?.length) throw new Error('Chưa có cache Gợi ý');
        return NextResponse.json({ success: true, ...buildAdvisorAnalysis({ advisorCache, probabilityCache, longHorizonCache, history }) }, { headers: HEADERS });
    } catch (error) {
        return NextResponse.json({ success: false, error: `Không tải được phân tích Gợi ý: ${error.message}` }, { status: 503, headers: HEADERS });
    }
}
