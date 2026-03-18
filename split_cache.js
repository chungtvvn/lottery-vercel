require('dotenv').config({ path: '.env.local' });
const { getAdminClient } = require('./lib/supabase');
const fs = require('fs');

async function testLimits() {
    const admin = getAdminClient();
    for (let i = 1; i <= 10; i++) {
        const size = i * 1024 * 1024; // MB
        const dummy = 'a'.repeat(size);
        console.log(`Uploading ${i}MB...`);
        const { error } = await admin.from('cache_store').upsert({ key: 'test_limit', data: dummy });
        if (error) {
            console.error(`Failed at ${i}MB:`, error.message);
            break;
        } else {
            console.log(`Success ${i}MB`);
        }
    }
}
testLimits();
