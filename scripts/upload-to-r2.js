const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

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

    if (fs.existsSync(DATA_FILE)) {
        await uploadJsonGzip(s3, DATA_FILE, `${DATA_PREFIX}/xsmb-2-digits.json.gz`);
    } else {
        console.warn(`[R2 Upload] Không tìm thấy raw data file: ${DATA_FILE}`);
    }

    const files = fs.readdirSync(STATS_DIR).filter(file => file.endsWith('.json'));
    console.log(`[R2 Upload] Tìm thấy ${files.length} tệp tin JSON thống kê cần tải lên.`);
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
