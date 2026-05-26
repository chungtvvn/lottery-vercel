import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
    try {
        const {
            hasSupabaseAdminConfig,
            getSupabaseAdminClient
        } = require('../../../../lib/supabase/client');

        if (!hasSupabaseAdminConfig()) {
            return NextResponse.json({
                ok: false,
                source: 'local-fallback',
                error: 'Missing Supabase admin env'
            }, { status: 503 });
        }

        const supabase = getSupabaseAdminClient();
        const bucket = process.env.SUPABASE_STATS_BUCKET || 'lottery-stats';
        const prefix = process.env.SUPABASE_STATS_PREFIX || 'statistics';

        const { count, error: countError } = await supabase
            .from('lottery_results')
            .select('draw_date', { count: 'exact', head: true });

        if (countError) throw countError;

        const { data: latestRows, error: latestError } = await supabase
            .from('lottery_results')
            .select('draw_date')
            .order('draw_date', { ascending: false })
            .limit(1);

        if (latestError) throw latestError;

        const { count: streakStatsCount, error: streakStatsError } = await supabase
            .from('streak_statistics')
            .select('pattern_key', { count: 'exact', head: true });
        if (streakStatsError) throw streakStatsError;

        const { count: historicalStreaksCount, error: historicalStreaksError } = await supabase
            .from('historical_streaks')
            .select('id', { count: 'exact', head: true });
        if (historicalStreaksError) throw historicalStreaksError;

        const { data: quickStatsCache, error: quickStatsCacheError } = await supabase
            .from('cache_store')
            .select('updated_at, data')
            .eq('cache_key', 'quick_stats')
            .maybeSingle();
        if (quickStatsCacheError) throw quickStatsCacheError;
        const quickStatsCacheKeys = quickStatsCache && quickStatsCache.data && typeof quickStatsCache.data === 'object'
            ? Object.keys(quickStatsCache.data).length
            : 0;

        const { data: manifestBlob, error: manifestError } = await supabase
            .storage
            .from(bucket)
            .download(`${prefix}/manifest.json`);

        let manifest = null;
        if (!manifestError && manifestBlob) {
            manifest = JSON.parse(Buffer.from(await manifestBlob.arrayBuffer()).toString('utf8'));
        }

        return NextResponse.json({
            ok: true,
            source: 'supabase',
            rawRows: count || 0,
            latestDate: latestRows && latestRows[0] ? latestRows[0].draw_date : null,
            dbStats: {
                streakStatisticsRows: streakStatsCount || 0,
                historicalStreakRows: historicalStreaksCount || 0,
                legacyQuickStatsCacheKeys: quickStatsCacheKeys,
                quickStatsUpdatedAt: quickStatsCache ? quickStatsCache.updated_at : null
            },
            storage: {
                bucket,
                prefix,
                manifestFound: !manifestError,
                files: manifest && Array.isArray(manifest.files) ? manifest.files.length : 0,
                generatedAt: manifest ? manifest.generatedAt : null
            },
            runtime: {
                dataSource: process.env.LOTTERY_DATA_SOURCE || 'auto',
                statsSource: process.env.LOTTERY_STATS_SOURCE || 'auto'
            }
        });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            source: 'supabase',
            error: error.message
        }, { status: 500 });
    }
}
