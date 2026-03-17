require('dotenv').config({ path: '.env.local' });
const { getPublicClient, getAdminClient } = require('./lib/supabase');
const zlib = require('zlib');

async function testGzip() {
    const admin = getAdminClient();
    const public = getPublicClient();
    
    // Create dummy big json
    const obj = { data: "abc".repeat(1000000) };
    const str = JSON.stringify(obj);
    console.log('Original size:', str.length);
    
    // Compress
    const compressed = zlib.gzipSync(str);
    console.log('Compressed size:', compressed.length);
    
    // Upload
    console.log('Uploading...');
    const { error: upErr } = await admin.storage.from('stats').upload('test_compress.json.gz', compressed, {
        contentType: 'application/gzip',
        upsert: true
    });
    if (upErr) return console.error('Upload Error:', upErr);
    
    // Download
    console.log('Downloading...');
    const { data: fileData, error: downErr } = await public.storage.from('stats').download('test_compress.json.gz');
    if (downErr) return console.error('Download Error:', downErr);
    
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Decompress
    const decompressed = zlib.gunzipSync(buffer).toString('utf-8');
    console.log('Decompressed size:', decompressed.length);
    if (decompressed === str) console.log('Match!');
    else console.log('Mismatch!');
}
testGzip();
