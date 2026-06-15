const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {
    S3Client,
    PutObjectCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    GetObjectCommand
} = require('@aws-sdk/client-s3');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
const ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT;
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET;

const DATA_FILE = path.join(__dirname, '..', 'lib', 'data', 'xsmb-2-digits.json');
const STATS_DIR = path.join(__dirname, '..', 'lib', 'data', 'statistics');
const STATS_PREFIX = process.env.CLOUDFLARE_R2_STATS_PREFIX || 'statistics';
const DATA_PREFIX = process.env.CLOUDFLARE_R2_DATA_PREFIX || 'data';
const CLEAR_STATS_PREFIX = process.env.CLOUDFLARE_R2_CLEAR_STATS_PREFIX === '1'
    || process.env.CLOUDFLARE_R2_CLEAR_PREFIX === '1';
const ALLOW_STALE_R2_UPLOAD = process.env.ALLOW_STALE_R2_UPLOAD === '1';
const ONLY_STATS_FILES = String(process.env.R2_UPLOAD_ONLY_STATS_FILES || '')
    .split(',')
    .map(file => file.trim())
    .filter(Boolean);

function normalizeDateValue(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function getLatestDateValue(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    let latest = null;
    for (const row of rows) {
        const normalized = normalizeDateValue(row?.date || row?.ngay || row?.drawDate);
        if (normalized && (!latest || normalized > latest)) latest = normalized;
    }
    return latest;
}

async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

async function readRemoteJsonGzip(s3, key) {
    try {
        const result = await s3.send(new GetObjectCommand({
            Bucket: BUCKET,
            Key: key
        }));
        const buffer = await streamToBuffer(result.Body);
        return JSON.parse(zlib.gunzipSync(buffer).toString('utf8'));
    } catch (error) {
        if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
            return null;
        }
        throw error;
    }
}

async function assertLocalRawIsNotOlderThanR2(s3) {
    if (!fs.existsSync(DATA_FILE)) return;

    const localRows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const localLatest = getLatestDateValue(localRows);
    if (!localLatest) {
        throw new Error(`Raw local không có ngày hợp lệ: ${DATA_FILE}`);
    }

    const remoteKey = `${DATA_PREFIX}/xsmb-2-digits.json.gz`;
    const remoteRows = await readRemoteJsonGzip(s3, remoteKey);
    const remoteLatest = getLatestDateValue(remoteRows);

    if (!remoteLatest) {
        console.log(`[R2 Upload] Không có raw R2 hiện tại để so sánh (${remoteKey}).`);
        return;
    }

    console.log(`[R2 Upload] Kiểm tra raw trước upload: local=${localLatest}, R2=${remoteLatest}.`);
    if (localLatest < remoteLatest && !ALLOW_STALE_R2_UPLOAD) {
        throw new Error([
            `Raw local cũ hơn R2 (${localLatest} < ${remoteLatest}).`,
            'Dừng upload để tránh ghi đè dữ liệu mới bằng dữ liệu cũ.',
            'Hãy chạy scripts/update-static-data.js hoặc set ALLOW_STALE_R2_UPLOAD=1 nếu thật sự muốn override.'
        ].join(' '));
    }
}

function getSimulationCacheDays() {
    const values = String(process.env.SIMULATION_CACHE_DAYS || '90')
        .split(',')
        .map(value => Number(value.trim()))
        .filter(value => Number.isFinite(value) && value >= 7 && value <= 365);
    return values.length > 0 ? [...new Set(values)] : [90];
}

function getSimulationCachePlayModes() {
    const values = String(process.env.SIMULATION_CACHE_PLAY_MODES || 'both')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(value => ['both', 'bet', 'hold'].includes(value));
    return values.length > 0 ? [...new Set(values)] : ['both'];
}

function getAllowedSimulationCacheFiles() {
    const allowed = new Set();
    for (const days of getSimulationCacheDays()) {
        for (const playMode of getSimulationCachePlayModes()) {
            allowed.add(playMode === 'both'
                ? `cached_simulation_${days}.json`
                : `cached_simulation_${days}_${playMode}.json`);
        }
    }
    return allowed;
}

function shouldUploadStatsFile(file, allowedSimulationCaches) {
    if (/^cached_simulation_\d+(?:_(?:bet|hold))?\.json$/.test(file)) {
        return allowedSimulationCaches.has(file);
    }
    return true;
}

async function uploadJsonGzip(s3, filePath, key) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const gzipContent = zlib.gzipSync(Buffer.from(fileContent, 'utf8'));

    console.log(`[R2 Upload] Đang tải lên ${path.basename(filePath)} (${(fileContent.length / 1024).toFixed(1)} KB -> ${(gzipContent.length / 1024).toFixed(1)} KB nén) dưới dạng ${key}...`);

    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: gzipContent,
        ContentType: 'application/gzip',
        CacheControl: 'public, max-age=60, s-maxage=300',
    });
    await s3.send(command);
}

async function clearPrefix(s3, prefix) {
    const normalizedPrefix = String(prefix || '').replace(/^\/|\/$/g, '');
    if (!normalizedPrefix) {
        throw new Error('Không được xóa R2 prefix rỗng.');
    }

    console.log(`[R2 Upload] CLEAR prefix bật: xóa object cũ dưới ${normalizedPrefix}/ trước khi upload...`);
    let continuationToken;
    let deletedCount = 0;

    do {
        const listResult = await s3.send(new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: `${normalizedPrefix}/`,
            ContinuationToken: continuationToken
        }));

        const objects = (listResult.Contents || [])
            .map(item => item.Key)
            .filter(Boolean);

        for (let i = 0; i < objects.length; i += 1000) {
            const chunk = objects.slice(i, i + 1000);
            if (chunk.length === 0) continue;
            await s3.send(new DeleteObjectsCommand({
                Bucket: BUCKET,
                Delete: {
                    Objects: chunk.map(Key => ({ Key })),
                    Quiet: true
                }
            }));
            deletedCount += chunk.length;
        }

        continuationToken = listResult.IsTruncated ? listResult.NextContinuationToken : undefined;
    } while (continuationToken);

    console.log(`[R2 Upload] Đã xóa ${deletedCount} object cũ dưới ${normalizedPrefix}/.`);
}

async function uploadToR2() {
    if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !ENDPOINT || !BUCKET) {
        console.warn('[R2 Upload] Bỏ qua R2 upload vì thiếu thông tin cấu hình (CLOUDFLARE_R2_ACCESS_KEY_ID, SECRET_ACCESS_KEY, ENDPOINT, BUCKET).');
        return;
    }

    console.log(`[R2 Upload] Khởi tạo kết nối tới R2 Bucket: ${BUCKET}...`);

    const s3 = new S3Client({
        endpoint: ENDPOINT,
        credentials: {
            accessKeyId: ACCESS_KEY_ID,
            secretAccessKey: SECRET_ACCESS_KEY,
        },
        region: 'auto',
    });

    if (!fs.existsSync(STATS_DIR)) {
        console.error(`[R2 Upload] Thư mục chứa dữ liệu không tồn tại: ${STATS_DIR}`);
        return;
    }

    await assertLocalRawIsNotOlderThanR2(s3);

    if (CLEAR_STATS_PREFIX) {
        await clearPrefix(s3, STATS_PREFIX);
    }

    if (fs.existsSync(DATA_FILE)) {
        await uploadJsonGzip(s3, DATA_FILE, `${DATA_PREFIX}/xsmb-2-digits.json.gz`);
    } else {
        console.warn(`[R2 Upload] Không tìm thấy raw data file: ${DATA_FILE}`);
    }

    const allowedSimulationCaches = getAllowedSimulationCacheFiles();
    const allFiles = fs.readdirSync(STATS_DIR).filter(file => file.endsWith('.json'));
    const files = ONLY_STATS_FILES.length > 0
        ? allFiles.filter(file => ONLY_STATS_FILES.includes(file))
        : allFiles.filter(file => shouldUploadStatsFile(file, allowedSimulationCaches));
    const skippedSimulationCaches = allFiles.length - files.length;
    console.log(`[R2 Upload] Tìm thấy ${files.length} tệp tin JSON thống kê cần tải lên.`);
    if (ONLY_STATS_FILES.length > 0) {
        console.log(`[R2 Upload] Chỉ upload các file được yêu cầu: ${ONLY_STATS_FILES.join(', ')}`);
    }
    if (skippedSimulationCaches > 0) {
        console.log(`[R2 Upload] Bỏ qua ${skippedSimulationCaches} cache simulation cũ/không dùng. Chỉ upload: ${[...allowedSimulationCaches].join(', ')}`);
    }
    for (const file of files) {
        const filePath = path.join(STATS_DIR, file);
        try {
            await uploadJsonGzip(s3, filePath, `${STATS_PREFIX}/${file}.gz`);
        } catch (error) {
            console.error(`[R2 Upload] ❌ Lỗi tải lên ${file}:`, error.message);
            throw error;
        }
    }

    console.log('[R2 Upload] ✅ Tải tất cả tệp tin lên R2 thành công!');
}

if (require.main === module) {
    uploadToR2().catch(err => {
        console.error('[R2 Upload] Lỗi hệ thống:', err);
        process.exit(1);
    });
}

module.exports = uploadToR2;
