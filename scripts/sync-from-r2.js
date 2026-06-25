const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand
} = require('@aws-sdk/client-s3');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT;
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET;
const STATS_PREFIX = String(process.env.CLOUDFLARE_R2_STATS_PREFIX || 'statistics').replace(/^\/|\/$/g, '');
const DATA_PREFIX = String(process.env.CLOUDFLARE_R2_DATA_PREFIX || 'data').replace(/^\/|\/$/g, '');
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'lib', 'data');
const STATS_DIR = path.join(DATA_DIR, 'statistics');
const ONLY = new Set(String(process.env.R2_SYNC_ONLY || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean));

function requireR2Config() {
    const missing = [];
    if (!ACCESS_KEY_ID) missing.push('CLOUDFLARE_R2_ACCESS_KEY_ID');
    if (!SECRET_ACCESS_KEY) missing.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
    if (!ENDPOINT) missing.push('CLOUDFLARE_R2_ENDPOINT');
    if (!BUCKET) missing.push('CLOUDFLARE_R2_BUCKET');
    if (missing.length) {
        throw new Error(`Thiếu cấu hình R2: ${missing.join(', ')}`);
    }
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

async function listObjects(s3, prefix) {
    const keys = [];
    let continuationToken;
    do {
        const result = await s3.send(new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: `${prefix}/`,
            ContinuationToken: continuationToken
        }));
        for (const item of result.Contents || []) {
            if (item.Key && item.Key.endsWith('.json.gz')) keys.push(item.Key);
        }
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys.sort();
}

function shouldDownload(key) {
    if (ONLY.size === 0) return true;
    const base = path.basename(key).replace(/\.gz$/, '');
    return ONLY.has(key) || ONLY.has(base);
}

function localPathForKey(key) {
    if (key.startsWith(`${DATA_PREFIX}/`)) {
        const relative = key.slice(DATA_PREFIX.length + 1).replace(/\.gz$/, '');
        return path.join(DATA_DIR, relative);
    }
    if (key.startsWith(`${STATS_PREFIX}/`)) {
        const relative = key.slice(STATS_PREFIX.length + 1).replace(/\.gz$/, '');
        return path.join(STATS_DIR, relative);
    }
    return null;
}

function writeIfChanged(filePath, content) {
    if (fs.existsSync(filePath)) {
        const current = fs.readFileSync(filePath, 'utf8');
        if (current === content) return false;
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
}

async function downloadObject(s3, key) {
    const result = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const compressed = await streamToBuffer(result.Body);
    return zlib.gunzipSync(compressed).toString('utf8');
}

async function syncFromR2() {
    requireR2Config();
    const s3 = new S3Client({
        endpoint: ENDPOINT,
        credentials: {
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY
        },
        region: 'auto'
    });

    const keys = [
        ...(await listObjects(s3, DATA_PREFIX)),
        ...(await listObjects(s3, STATS_PREFIX))
    ].filter(shouldDownload);

    let downloaded = 0;
    let changed = 0;
    let skipped = 0;
    console.log(`[R2 Sync] Tìm thấy ${keys.length} object JSON gzip cần kiểm tra.`);

    for (const key of keys) {
        const filePath = localPathForKey(key);
        if (!filePath) {
            skipped++;
            continue;
        }
        const content = await downloadObject(s3, key);
        JSON.parse(content);
        downloaded++;
        if (writeIfChanged(filePath, content)) {
            changed++;
            console.log(`[R2 Sync] Updated ${path.relative(ROOT_DIR, filePath)} <- ${key}`);
        }
    }

    console.log(`[R2 Sync] Hoàn tất. downloaded=${downloaded}, changed=${changed}, skipped=${skipped}.`);
}

if (require.main === module) {
    syncFromR2().catch(error => {
        console.error('[R2 Sync] Lỗi:', error.message);
        process.exit(1);
    });
}

module.exports = syncFromR2;
