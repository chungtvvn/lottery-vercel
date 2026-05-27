require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const {
    hasSupabaseAdminConfig,
    getSupabaseAdminClient
} = require('../lib/supabase/client');

const BUCKET = process.env.SUPABASE_STATS_BUCKET || 'lottery-stats';
const PREFIX = process.env.SUPABASE_STATS_PREFIX || 'statistics';
const LEGACY_CACHE_KEYS = [
    'quick_stats',
    'cached_predictions',
    'cached_suggestions',
    'cached_simulation_365'
];

function hasFlag(name) {
    return process.argv.includes(name);
}

async function listStorageObjects(supabase, prefix) {
    const paths = [];
    const pageSize = 100;

    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
            .storage
            .from(BUCKET)
            .list(prefix, {
                limit: pageSize,
                offset,
                sortBy: { column: 'name', order: 'asc' }
            });

        if (error) {
            if (/not found/i.test(error.message || '')) return paths;
            throw error;
        }
        if (!data || data.length === 0) break;

        for (const item of data) {
            const objectPath = `${prefix}/${item.name}`;
            if (item.metadata || item.id) {
                paths.push(objectPath);
            } else {
                paths.push(...await listStorageObjects(supabase, objectPath));
            }
        }

        if (data.length < pageSize) break;
    }

    return paths;
}

async function removeStorageObjects(supabase, paths) {
    const chunkSize = 100;
    for (let i = 0; i < paths.length; i += chunkSize) {
        const chunk = paths.slice(i, i + chunkSize);
        const { error } = await supabase.storage.from(BUCKET).remove(chunk);
        if (error) throw error;
        console.log(`[Cleanup] Đã xoá Storage objects ${Math.min(i + chunk.length, paths.length)}/${paths.length}`);
    }
}

async function cleanupLegacyCache(supabase, execute) {
    const { data, error } = await supabase
        .from('cache_store')
        .select('cache_key, namespace, updated_at')
        .in('cache_key', LEGACY_CACHE_KEYS);
    if (error) throw error;

    const rows = data || [];
    console.log(`[Cleanup] Legacy cache_store keys: ${rows.length ? rows.map(row => row.cache_key).join(', ') : 'none'}`);
    if (!execute || rows.length === 0) return;

    const { error: deleteError } = await supabase
        .from('cache_store')
        .delete()
        .in('cache_key', LEGACY_CACHE_KEYS);
    if (deleteError) throw deleteError;
    console.log(`[Cleanup] Đã xoá ${rows.length} legacy cache_store rows.`);
}

async function main() {
    const execute = hasFlag('--execute');
    const deleteBucket = hasFlag('--delete-bucket');
    const cacheOnly = hasFlag('--cache-only');
    const storageOnly = hasFlag('--storage-only');

    if (!hasSupabaseAdminConfig()) {
        throw new Error('Missing Supabase admin env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }

    const supabase = getSupabaseAdminClient();
    console.log(`[Cleanup] Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`);

    if (!storageOnly) {
        await cleanupLegacyCache(supabase, execute);
    }

    if (!cacheOnly) {
        const paths = await listStorageObjects(supabase, PREFIX);
        console.log(`[Cleanup] Legacy Storage objects under ${BUCKET}/${PREFIX}: ${paths.length}`);
        paths.forEach(path => console.log(` - ${path}`));

        if (execute && paths.length > 0) {
            await removeStorageObjects(supabase, paths);
        }

        if (execute && deleteBucket) {
            const { error } = await supabase.storage.deleteBucket(BUCKET);
            if (error) throw error;
            console.log(`[Cleanup] Đã xoá bucket ${BUCKET}.`);
        } else if (deleteBucket) {
            console.log(`[Cleanup] Dry run: would delete bucket ${BUCKET} after removing objects.`);
        }
    }

    if (!execute) {
        console.log('[Cleanup] Chưa xoá gì. Chạy lại với --execute để thực hiện.');
    }
}

main().catch(error => {
    console.error('[Cleanup] Failed:', error.message);
    if (error.cause && error.cause.message) {
        console.error('[Cleanup] Cause:', error.cause.message);
    }
    process.exit(1);
});
