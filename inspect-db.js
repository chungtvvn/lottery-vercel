require('dotenv').config({path: '.env.local'});
const { getPublicClient } = require('./lib/supabase');

async function inspect() {
    const supabase = getPublicClient();
    // Just get chunk 0
    const { data, error } = await supabase
        .from('cache_store')
        .select('data')
        .eq('key', 'quick_stats_chunk_0')
        .single();

    if (error || !data) {
        console.error('No chunk 0 found', error);
        return;
    }

    const chunk = data.data;
    const keys = Object.keys(chunk);
    console.log('Chunk 0 keys count:', keys.length);

    for (const key of keys) {
        const cat = chunk[key];
        if (cat && cat.current) {
            console.log('Key:', key);
            console.log('  current keys:', Object.keys(cat.current));
            console.log('  fullSequence?', cat.current.fullSequence ? cat.current.fullSequence.length : 'MISSING');
            console.log('  values?', cat.current.values ? cat.current.values.length : 'MISSING');
            console.log('  dates?', cat.current.dates ? cat.current.dates.length : 'MISSING');
            break;
        }
    }
    process.exit(0);
}
inspect().catch(e => { console.error(e); process.exit(1); });
