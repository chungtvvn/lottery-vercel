/**
 * r2Store — Cloudflare R2 as the ONLY source of computed data (owner decision 27/10/2026).
 *
 * Plumbing only: this module never reads a local/bundled JSON file. A missing
 * or unreachable R2 object is a loud R2_UNAVAILABLE error, never a silent
 * local substitute. Writes never fake success: missing R2 credentials,
 * endpoint, or bucket throw R2_WRITE_UNAVAILABLE before any S3 call.
 *
 * Key layout (matches scripts/upload-to-r2.js):
 *   <prefix>/<fileName>.gz   — gzip JSON, always written
 *   <prefix>/<fileName>      — plain JSON, ONLY for
 *     daily_locked_bets_registry.json and cached_daily_method_advisor.json
 * Read order: .gz first, plain .json as fallback (both may exist for the
 * two files above; every other file is .gz-only on R2).
 *
 * CommonJS, no new dependency. The S3 SDK (@aws-sdk/client-s3, already in
 * package.json) is required lazily inside putR2Json so read-only callers
 * never pay for it.
 */
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Plain-JSON objects, exactly as in scripts/upload-to-r2.js.
const PLAIN_JSON_FILES = new Set([
    'daily_locked_bets_registry.json',
    'cached_daily_method_advisor.json'
]);

function getR2PublicUrl() {
    return String(
        process.env.NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL
        || process.env.CLOUDFLARE_R2_PUBLIC_URL
        || ''
    ).trim().replace(/\/$/, '');
}

function normalizePrefix(prefix) {
    return String(prefix || '').replace(/^\/|\/$/g, '');
}

/**
 * Base R2 key for a file, without the .gz suffix:
 * r2KeyFor('quick_stats.json', 'statistics') === 'statistics/quick_stats.json'
 * The gzip object is `${r2KeyFor(...)}.gz`.
 */
function r2KeyFor(fileName, prefix) {
    return `${normalizePrefix(prefix)}/${fileName}`;
}

function r2JsonCacheTtlMs() {
    return Number(process.env.R2_JSON_CACHE_TTL_MS || 120 * 1000);
}

// In-memory TTL cache only — never a disk file.
const _jsonCache = new Map();

function readJsonCache(cacheKey) {
    const hit = _jsonCache.get(cacheKey);
    if (!hit) return null;
    if ((Date.now() - hit.readAt) > hit.ttlMs) {
        _jsonCache.delete(cacheKey);
        return null;
    }
    return hit.data;
}

function writeJsonCache(cacheKey, data) {
    _jsonCache.set(cacheKey, { data, readAt: Date.now(), ttlMs: r2JsonCacheTtlMs() });
}

function parseMaybeGzipped(buffer) {
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
        return JSON.parse(zlib.gunzipSync(buffer).toString('utf8'));
    }
    return JSON.parse(buffer.toString('utf8'));
}

/**
 * Fetch a JSON object from R2's public URL: `<prefix>/<fileName>.gz` first,
 * then plain `<prefix>/<fileName>`. Throws Error(`R2_UNAVAILABLE: <key> ...`)
 * when R2 is unconfigured, unreachable, or the key is missing — never
 * returns a local file.
 */
async function getR2Json(fileName, prefix) {
    const key = r2KeyFor(fileName, prefix);
    const cached = readJsonCache(key);
    if (cached) return cached;

    const baseUrl = getR2PublicUrl();
    if (!baseUrl) {
        throw new Error(
            `R2_UNAVAILABLE: ${key} — NEXT_PUBLIC_CLOUDFLARE_R2_PUBLIC_URL ` +
            '(or CLOUDFLARE_R2_PUBLIC_URL) is not configured; no local file is used as a substitute.'
        );
    }

    const attempts = [];
    for (const url of [`${baseUrl}/${key}.gz`, `${baseUrl}/${key}`]) {
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
                attempts.push(`${url} -> HTTP ${response.status}`);
                continue;
            }
            const parsed = parseMaybeGzipped(Buffer.from(await response.arrayBuffer()));
            writeJsonCache(key, parsed);
            return parsed;
        } catch (error) {
            attempts.push(`${url} -> ${error.message}`);
        }
    }
    throw new Error(
        `R2_UNAVAILABLE: ${key} — R2 object missing or unreachable ` +
        `(${attempts.join('; ')}); no local fallback.`
    );
}

function getR2WriteConfig() {
    const missing = [];
    if (!process.env.CLOUDFLARE_R2_ACCESS_KEY_ID) missing.push('CLOUDFLARE_R2_ACCESS_KEY_ID');
    if (!process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY) missing.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
    if (!process.env.CLOUDFLARE_R2_ENDPOINT) missing.push('CLOUDFLARE_R2_ENDPOINT');
    if (!process.env.CLOUDFLARE_R2_BUCKET) missing.push('CLOUDFLARE_R2_BUCKET');
    return {
        missing,
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
        endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
        bucket: process.env.CLOUDFLARE_R2_BUCKET
    };
}

/**
 * Write JSON to R2 via S3 PutObject (same pattern as scripts/upload-to-r2.js):
 * gzip JSON to `<prefix>/<fileName>.json.gz`, plus a plain-JSON PutObject
 * ONLY for daily_locked_bets_registry.json and cached_daily_method_advisor.json.
 * Throws Error('R2_WRITE_UNAVAILABLE: missing CLOUDFLARE_R2_* ...') when any
 * credential/endpoint/bucket env var is missing — never fakes success.
 */
async function putR2Json(fileName, prefix, data) {
    const config = getR2WriteConfig();
    if (config.missing.length > 0) {
        throw new Error(
            `R2_WRITE_UNAVAILABLE: missing CLOUDFLARE_R2_* env vars: ${config.missing.join(', ')}`
        );
    }

    // Lazy require: read-only callers never load the S3 SDK.
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const s3 = new S3Client({
        endpoint: config.endpoint,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey
        },
        region: 'auto'
    });

    const key = r2KeyFor(fileName, prefix);
    const gzKey = `${key}.gz`;
    const jsonText = JSON.stringify(data);
    await s3.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: gzKey,
        Body: zlib.gzipSync(Buffer.from(jsonText, 'utf8')),
        ContentType: 'application/gzip',
        CacheControl: 'public, max-age=60, s-maxage=300'
    }));

    let plainWritten = false;
    if (PLAIN_JSON_FILES.has(fileName)) {
        await s3.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: Buffer.from(jsonText, 'utf8'),
            ContentType: 'application/json',
            CacheControl: 'public, max-age=60, s-maxage=300'
        }));
        plainWritten = true;
    }

    // The freshly written object supersedes any cached read.
    _jsonCache.delete(key);
    return { key, gzKey, plainWritten };
}

/**
 * Stage JSON in an os.tmpdir() file, upload it via putR2Json, then delete
 * the temp file (including on upload failure) so no local readable copy
 * remains after the call.
 */
async function writeViaTemp(fileName, prefix, data) {
    const tmpPath = path.join(os.tmpdir(), `r2store-${process.pid}-${Date.now()}-${fileName}`);
    try {
        await fs.promises.writeFile(tmpPath, JSON.stringify(data), 'utf8');
        return await putR2Json(fileName, prefix, data);
    } finally {
        await fs.promises.unlink(tmpPath).catch(() => {});
    }
}

module.exports = {
    getR2Json,
    putR2Json,
    r2KeyFor,
    writeViaTemp
};
