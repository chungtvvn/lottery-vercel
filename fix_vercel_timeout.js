require('dotenv').config({ path: '.env.local' });
const { getPublicClient } = require('./lib/supabase');

async function testVercelLoad() {
    console.log('Fetching stats_full_sum_diff...');
    const t0 = Date.now();
    const { data: sumDiffData, error } = await getPublicClient()
        .from('cache_store')
        .select('data')
        .eq('key', 'stats_full_sum_diff')
        .single();
    
    console.log(`Fetched sum_diff in ${Date.now() - t0}ms, error:`, error?.message);
    if (sumDiffData?.data) {
        console.log(`Size: ${JSON.stringify(sumDiffData.data).length / 1024 / 1024} MB, keys: ${Object.keys(sumDiffData.data).length}`);
    }

    console.log('Fetching stats_full_number...');
    const t1 = Date.now();
    const { data: numData, error: errNum } = await getPublicClient()
        .from('cache_store')
        .select('data')
        .eq('key', 'stats_full_number')
        .single();
    console.log(`Fetched num in ${Date.now() - t1}ms, error:`, errNum?.message);

    console.log('Fetching stats_full_head_tail...');
    const t2 = Date.now();
    const { data: htData, error: errHt } = await getPublicClient()
        .from('cache_store')
        .select('data')
        .eq('key', 'stats_full_head_tail')
        .single();
    console.log(`Fetched ht in ${Date.now() - t2}ms, error:`, errHt?.message);
}

testVercelLoad();
