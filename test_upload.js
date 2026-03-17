require('dotenv').config({ path: '.env.local' });
const { getPublicClient } = require('./lib/supabase');
const { uploadFullStatsToStorage } = require('./lib/data-access');

async function migrate(statType) {
    const supabase = getPublicClient();
    const prefix = `stats:${statType}:`;
    console.log(`Loading ${statType} from DB...`);
    const { data, error } = await supabase.from('cache_store').select('key, data').like('key', `stats:${statType}:%`);
    if (error || !data) return console.error(error);
    
    const result = {};
    data.forEach(r => result[r.key.replace(prefix, '')] = r.data);
    
    console.log(`Uploading ${statType}_full.json...`);
    await uploadFullStatsToStorage(statType, result);
    console.log(`Done ${statType}!`);
}

async function run() {
    await migrate('number');
    await migrate('head_tail');
    await migrate('sum_diff');
}
run().catch(console.error);
