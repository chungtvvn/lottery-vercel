import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
    try {
        const {
            hasSupabaseAdminConfig,
            getSupabaseAdminClient
        } = require('../../../../lib/supabase/client');
        const { shouldUseSupabaseDbStats } = require('../../../../lib/data-access');

        if (!hasSupabaseAdminConfig()) {
            return NextResponse.json({
                ok: false,
                source: 'local-fallback',
                error: 'Missing Supabase admin env'
            }, { status: 503 });
        }

        const supabase = getSupabaseAdminClient();
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
            .select('updated_at')
            .eq('cache_key', 'quick_stats')
            .maybeSingle();
        if (quickStatsCacheError) throw quickStatsCacheError;

        const statsMode = String(process.env.LOTTERY_STATS_SOURCE || '').trim().toLowerCase();
        const shouldCheckLegacyStorage = process.env.CHECK_SUPABASE_STORAGE === '1'
            || ['supabase-storage', 'supabase-storage-only', 'storage', 'storage-only'].includes(statsMode);

        let manifest = null;
        let manifestError = null;
        if (shouldCheckLegacyStorage) {
            const bucket = process.env.SUPABASE_STATS_BUCKET || 'lottery-stats';
            const prefix = process.env.SUPABASE_STATS_PREFIX || 'statistics';
            const { data: manifestBlob, error } = await supabase
                .storage
                .from(bucket)
                .download(`${prefix}/manifest.json`);
            manifestError = error;
            if (!manifestError && manifestBlob) {
                manifest = JSON.parse(Buffer.from(await manifestBlob.arrayBuffer()).toString('utf8'));
            }
        }

        return NextResponse.json({
            ok: true,
            source: 'supabase',
            rawRows: count || 0,
            latestDate: latestRows && latestRows[0] ? latestRows[0].draw_date : null,
            dbStats: {
                streakStatisticsRows: streakStatsCount || 0,
                historicalStreakRows: historicalStreaksCount || 0,
                legacyQuickStatsCacheExists: Boolean(quickStatsCache),
                quickStatsUpdatedAt: quickStatsCache ? quickStatsCache.updated_at : null
            },
            storage: {
                checked: shouldCheckLegacyStorage,
                legacyEnabled: shouldCheckLegacyStorage,
                manifestFound: shouldCheckLegacyStorage ? !manifestError : false,
                files: manifest && Array.isArray(manifest.files) ? manifest.files.length : 0,
                generatedAt: manifest ? manifest.generatedAt : null
            },
            runtime: {
                dataSource: process.env.LOTTERY_DATA_SOURCE || 'auto',
                statsSource: process.env.LOTTERY_STATS_SOURCE || 'auto',
                effectiveStatsSource: shouldUseSupabaseDbStats() ? 'supabase-db' : (process.env.LOTTERY_STATS_SOURCE || 'auto')
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
