require('dotenv').config({ path: '.env.local' });
const { getPublicClient } = require('./lib/supabase');

async function testVercelLoad() {
    console.log('Fetching keys...');
    const t0 = Date.now();
    const { data: keysData, error } = await getPublicClient()
        .from('cache_store')
        .select('key')
        .like('key', 'stats_chunk_sum_diff_%');
    
    console.log(`Fetched keys in ${Date.now() - t0}ms, count:`, keysData?.length, 'err:', error?.message);

    if (keysData && keysData.length > 0) {
        const keys = keysData.map(k => k.key);
        console.log('Fetching IN data...');
        const t1 = Date.now();
        const { data: chunkData, error: errChunk } = await getPublicClient()
            .from('cache_store')
            .select('key, data')
            .in('key', keys);
        console.log(`Fetched chunks in ${Date.now() - t1}ms, count: ${chunkData?.length}, err:`, errChunk?.message);
    }
}
testVercelLoad();
