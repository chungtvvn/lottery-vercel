require('dotenv').config({ path: '.env.local' });
const { getPublicClient } = require('./lib/supabase');
async function check() {
    const supabase = getPublicClient();
    const { data } = await supabase.from('cache_store').select('key');
    console.log(data);
}
check();
