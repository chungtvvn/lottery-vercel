require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const {
    hasSupabaseAdminConfig,
    getSupabaseAdminClient
} = require('../lib/supabase/client');

function logError(error) {
    console.error('[Supabase] Check failed:', error.message);
    if (error.cause && error.cause.message) {
        console.error('[Supabase] Cause:', error.cause.message);
    }
    console.error('[Supabase] Verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
}

async function main() {
    if (!hasSupabaseAdminConfig()) {
        throw new Error('Missing Supabase admin env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
    }

    const supabase = getSupabaseAdminClient();
    const { count, error } = await supabase
        .from('lottery_results')
        .select('draw_date', { count: 'exact', head: true });

    if (error) throw error;

    console.log(`[Supabase] OK. lottery_results rows: ${count ?? 0}`);

    const { count: streakStatsCount, error: streakStatsError } = await supabase
        .from('streak_statistics')
        .select('pattern_key', { count: 'exact', head: true });
    if (streakStatsError) {
        console.warn(`[Supabase] streak_statistics not ready: ${streakStatsError.message}`);
    } else {
        console.log(`[Supabase] DB Stats OK. streak_statistics rows: ${streakStatsCount ?? 0}`);
    }

    const { count: historicalStreaksCount, error: historicalStreaksError } = await supabase
        .from('historical_streaks')
        .select('id', { count: 'exact', head: true });
    if (historicalStreaksError) {
        console.warn(`[Supabase] historical_streaks not ready: ${historicalStreaksError.message}`);
    } else {
        console.log(`[Supabase] DB Stats OK. historical_streaks rows: ${historicalStreaksCount ?? 0}`);
    }

    const bucket = process.env.SUPABASE_STATS_BUCKET || 'lottery-stats';
    const prefix = process.env.SUPABASE_STATS_PREFIX || 'statistics';
    const { data: manifestBlob, error: manifestError } = await supabase
        .storage
        .from(bucket)
        .download(`${prefix}/manifest.json`);

    if (manifestError) {
        console.warn(`[Supabase] Storage manifest not found yet (${bucket}/${prefix}/manifest.json): ${manifestError.message}`);
        return;
    }

    const manifest = JSON.parse(Buffer.from(await manifestBlob.arrayBuffer()).toString('utf8'));
    console.log(`[Supabase] Storage OK. stats files: ${manifest.files ? manifest.files.length : 0}, generatedAt: ${manifest.generatedAt || 'unknown'}`);
}

main().catch(error => {
    logError(error);
    process.exit(1);
});
