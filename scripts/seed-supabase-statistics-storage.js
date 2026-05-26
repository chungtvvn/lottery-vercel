require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
    hasSupabaseAdminConfig,
    getSupabaseAdminClient
} = require('../lib/supabase/client');

const STATS_DIR = path.join(process.cwd(), 'lib', 'data', 'statistics');
const BUCKET = process.env.SUPABASE_STATS_BUCKET || 'lottery-stats';
const PREFIX = process.env.SUPABASE_STATS_PREFIX || 'statistics';
const FREE_PLAN_SAFE_UPLOAD_BYTES = 48 * 1024 * 1024;

async function ensureBucket(supabase) {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) throw listError;
    if ((buckets || []).some(bucket => bucket.name === BUCKET)) return;

    const { error } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        allowedMimeTypes: ['application/gzip', 'application/json']
    });
    if (error) throw error;
    console.log(`[Supabase] Created private storage bucket: ${BUCKET}`);
}

async function uploadObject(supabase, objectPath, body, contentType) {
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, body, {
            upsert: true,
            contentType,
            cacheControl: '3600'
        });
    if (error) throw error;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    if (!fs.existsSync(STATS_DIR)) {
        throw new Error(`Stats directory not found: ${STATS_DIR}`);
    }

    const files = fs.readdirSync(STATS_DIR)
        .filter(file => file.endsWith('.json'))
        .sort();

    const manifest = {
        bucket: BUCKET,
        prefix: PREFIX,
        generatedAt: new Date().toISOString(),
        files: []
    };

    console.log(`[Supabase] Preparing ${files.length} statistics files from ${STATS_DIR}`);

    if (!dryRun && !hasSupabaseAdminConfig()) {
        throw new Error('Missing Supabase admin env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
    }

    const supabase = dryRun ? null : getSupabaseAdminClient();
    if (supabase) await ensureBucket(supabase);

    for (const fileName of files) {
        const filePath = path.join(STATS_DIR, fileName);
        const source = fs.readFileSync(filePath);
        const compressed = zlib.gzipSync(source, { level: 9 });
        const objectPath = `${PREFIX}/${fileName}.gz`;
        const record = {
            fileName,
            objectPath,
            sourceBytes: source.length,
            gzipBytes: compressed.length,
            sourceMtimeMs: fs.statSync(filePath).mtimeMs
        };

        manifest.files.push(record);
        console.log(`[Supabase] ${fileName}: ${(source.length / 1048576).toFixed(1)}MB -> ${(compressed.length / 1048576).toFixed(1)}MB`);

        if (compressed.length > FREE_PLAN_SAFE_UPLOAD_BYTES) {
            throw new Error(`${fileName}.gz is ${(compressed.length / 1048576).toFixed(1)}MB, too close to Supabase Free default 50MB upload limit.`);
        }

        if (!dryRun) {
            await uploadObject(supabase, objectPath, compressed, 'application/gzip');
        }
    }

    if (!dryRun) {
        await uploadObject(
            supabase,
            `${PREFIX}/manifest.json`,
            Buffer.from(JSON.stringify(manifest, null, 2)),
            'application/json'
        );
    }

    console.log(`[Supabase] Statistics storage ${dryRun ? 'dry run' : 'upload'} completed.`);
}

main().catch(error => {
    console.error('[Supabase] Statistics upload failed:', error.message);
    if (error.cause && error.cause.message) {
        console.error('[Supabase] Cause:', error.cause.message);
    }
    process.exit(1);
});
