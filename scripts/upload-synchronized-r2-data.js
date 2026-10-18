'use strict';

/**
 * scripts/upload-synchronized-r2-data.js
 * Uploads all synchronized SSOT files to Cloudflare R2:
 * - daily_locked_bets_registry.json and .gz
 * - cached_daily_method_advisor.json and .gz
 * - cached_lo_dropoff_27_shadow.json and .gz
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    }
});
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET || 'lottery';

async function uploadFileToR2(key, contentBuffer, contentType = 'application/json', contentEncoding = null) {
    const params = {
        Bucket: BUCKET,
        Key: key,
        Body: contentBuffer,
        ContentType: contentType
    };
    if (contentEncoding) {
        params.ContentEncoding = contentEncoding;
    }
    await s3.send(new PutObjectCommand(params));
    console.log(`  ✓ Đã upload lên R2: ${key} (${(contentBuffer.length / 1024).toFixed(1)} KB)`);
}

async function uploadAll() {
    console.log('='.repeat(80));
    console.log('🚀 ĐẨY DỮ LIỆU ĐỒNG BỘ SSOT LÊN CLOUDFLARE R2');
    console.log('='.repeat(80));

    const STATS_DIR = path.join(__dirname, '..', 'lib', 'data', 'statistics');

    // 1. daily_locked_bets_registry
    const regFile = path.join(STATS_DIR, 'daily_locked_bets_registry.json');
    if (fs.existsSync(regFile)) {
        const regBuf = fs.readFileSync(regFile);
        const regGz = zlib.gzipSync(regBuf);
        await uploadFileToR2('statistics/daily_locked_bets_registry.json', regBuf);
        await uploadFileToR2('statistics/daily_locked_bets_registry.json.gz', regGz, 'application/json', 'gzip');
    }

    // 2. cached_daily_method_advisor
    const advFile = path.join(STATS_DIR, 'cached_daily_method_advisor.json');
    if (fs.existsSync(advFile)) {
        const advBuf = fs.readFileSync(advFile);
        const advGz = zlib.gzipSync(advBuf);
        await uploadFileToR2('statistics/cached_daily_method_advisor.json', advBuf);
        await uploadFileToR2('statistics/cached_daily_method_advisor.json.gz', advGz, 'application/json', 'gzip');
    }

    // 3. cached_lo_dropoff_27_shadow
    const loShadowFile = path.join(STATS_DIR, 'cached_lo_dropoff_27_shadow.json');
    if (fs.existsSync(loShadowFile)) {
        const loBuf = fs.readFileSync(loShadowFile);
        const loGz = zlib.gzipSync(loBuf);
        await uploadFileToR2('statistics/cached_lo_dropoff_27_shadow.json', loBuf);
        await uploadFileToR2('statistics/cached_lo_dropoff_27_shadow.json.gz', loGz, 'application/json', 'gzip');
    }

    console.log('\n🎉 HOÀN TẤT UPLOAD TẤT CẢ DỮ LIỆU LÊN R2 THÀNH CÔNG!');
}

uploadAll().catch(console.error);
