require('dotenv').config({ path: '.env.local' });
const { getPublicClient } = require('./lib/supabase');
async function check() {
    const supabase = getPublicClient();
    const { data } = await supabase.from('cache_store').select('data').eq('key', 'quick_stats_history').single();
    if (!data || !data.data) { console.log('Empty'); return; }
    console.log(Array.isArray(data.data), data.data.length);
    console.log(Object.keys(data.data[0]));
}
check();
